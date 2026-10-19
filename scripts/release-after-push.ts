/**
 * The after-push half of the release flow (stages 8-11 in the spec): find the Release run, judge it
 * against the validate job's log, ask once, approve the staged packages, check what was published.
 *
 * This file observes, waits and operates, in that order. Every judgement is a pure function in
 * lib/release-after-push-check.ts. It does not import release.ts: the runner, the output function,
 * the confirmation, the trust check and the file access all arrive as AfterPushDeps.
 */
import {
  classifyPackageState,
  classifyStop,
  extractLogManifest,
  ghReleaseViewArgs,
  ghRunAttemptArgs,
  ghRunDownloadArgs,
  ghRunListArgs,
  ghRunLogArgs,
  ghRunLogFailedArgs,
  ghRunViewArgs,
  ghRunWatchArgs,
  attemptKey,
  isE409,
  judgeArtifactDir,
  judgeJobs,
  judgeLogManifest,
  judgePostCheck,
  judgeStaged,
  npmStageApproveArgs,
  npmStageDownloadArgs,
  npmStageListArgs,
  npmViewDistArgs,
  npmViewVersionsArgs,
  parseViewDist,
  pickRepresentative,
  pickStage,
  planApprove,
  RELEASE_JOB_NAMES,
  selectRun,
  sha512Integrity,
} from './lib/release-after-push-check.ts';
import type {
  ArtifactEntry,
  LogManifest,
  ParseViewDistResult,
  PickStageResult,
  StagedArtifact,
} from './lib/release-after-push-check.ts';
import { distTagFor, parseGhReleaseView, parseNpmViewVersions } from './lib/release-check.ts';
import {
  excerptDetail,
  excerptJobLog,
  excerptLocalStderr,
  prependDetail,
} from './lib/release-stop-report.ts';
import { NO_COMMAND } from './lib/release-types.ts';
import type {
  AfterPushResult,
  Check,
  ClassifiedStop,
  CommandResult,
  DistTag,
  ErrorExcerpt,
  ErrorTool,
  PackageState,
  Published,
  StopObservation,
  TrustResult,
} from './lib/release-types.ts';

// --- 外から受けるもの ---

export interface AfterPushInput {
  tag: string;
  tagCommit: string;
  version: string;
  // manifest の順 (依存の順)
  names: readonly string[];
  checkOnly: boolean;
}

export interface AfterPushDeps {
  run(
    cmd: string,
    args: readonly string[],
    options: { stdio: 'pipe' | 'inherit' | 'inherit-keep-stderr'; cwd?: string; raw?: boolean }
  ): Promise<CommandResult>;
  output: { emit(line: string): void; emitChunk(text: string): void };
  sleep(ms: number): Promise<void>;
  now(): number;
  interrupted(): boolean;
  confirm(question: string): Promise<boolean>;
  verifyTrust(): Promise<TrustResult>;
  // mkdtemp の絶対パス。作ったものを呼び出し側が記録する
  mkTemp(): string;
  removeTemp(path: string): void;
  // lstat で見た直下の一覧
  listDir(path: string): ArtifactEntry[];
  // maxBytes を超えるなら例外
  readFile(path: string, maxBytes: number): Buffer;
  // 保存した先のディレクトリを返す
  saveEvidence(name: string, content: string): string;
}

// --- 待機 (0.2.0 の実測で見直す。ADR-031 の Followup) ---

export const WAIT = {
  // run の出現
  runAppear: { intervalMs: 10_000, budgetMs: 180_000 },
  // log の取得 (総試行回数)
  logFetch: { intervalMs: 30_000, attempts: 3 },
  // missing の待機と、段 11 の読み直し
  settle: { intervalMs: 30_000, budgetMs: 300_000 },
  // E409 の再試行の回数
  conflict: { intervalMs: 30_000, attempts: 20 },
} as const;

type WaitSpec = { intervalMs: number } & ({ budgetMs: number } | { attempts: number });

// --- 判定の根拠の保存 (名前は定数。`/` を含めない) ---

const shortName = (name: string): string =>
  name.replace(/^@kanbun-skam\//, '').replace(/[^0-9A-Za-z._-]/g, '_');

export const EVIDENCE_FILES = {
  run: 'run.json',
  jobs: 'jobs.json',
  runAttempt: 'run-attempt.json',
  logManifest: 'log-manifest.txt',
  stageList: (name: string): string => `stage-list-${shortName(name)}.json`,
  view: (name: string): string => `view-${shortName(name)}.json`,
};

// --- 待機の道具 ---

export type Budget = { ms: number } | { attempts: number };

export type PollResult<T> =
  | { kind: 'done'; value: T }
  | { kind: 'exhausted' }
  | { kind: 'interrupted' };

// 待機はすべてこれを通す。時間は now() と sleep() だけで測り、毎回 interrupted() を先に見る
export async function pollUntil<T>(
  clock: Pick<AfterPushDeps, 'sleep' | 'now' | 'interrupted'>,
  input: {
    intervalMs: number;
    budget: Budget;
    // true なら最初の probe の前にも待つ (直前に観測済みで、すぐの再観測に意味がないとき)
    delayFirst?: boolean;
    probe(): Promise<{ done: true; value: T } | { done: false }>;
  }
): Promise<PollResult<T>> {
  const start = clock.now();
  for (let n = 0; ; n += 1) {
    if (clock.interrupted()) return { kind: 'interrupted' };
    if (n > 0 || input.delayFirst === true) {
      const spent =
        'attempts' in input.budget
          ? n >= input.budget.attempts
          : clock.now() - start + input.intervalMs > input.budget.ms;
      if (spent) return { kind: 'exhausted' };
      await clock.sleep(input.intervalMs);
      if (clock.interrupted()) return { kind: 'interrupted' };
    }
    const result = await input.probe();
    if (result.done) return { kind: 'done', value: result.value };
    if (clock.interrupted()) return { kind: 'interrupted' };
  }
}

// --- 止まり方 ---

type WithoutPublished<T> = T extends unknown ? Omit<T, 'published'> : never;
type Observed = WithoutPublished<StopObservation>;

type HaltReason =
  | { kind: 'stop'; observation: Observed; published?: Published }
  | { kind: 'declined' };

class Halt extends Error {
  readonly reason: HaltReason;

  constructor(reason: HaltReason) {
    super('after-push halted');
    this.reason = reason;
  }
}

function halt(observation: Observed, published?: Published): never {
  throw new Halt({
    kind: 'stop',
    observation,
    ...(published === undefined ? {} : { published }),
  });
}

interface Ctx {
  input: AfterPushInput;
  deps: AfterPushDeps;
  distTag: DistTag;
  // 観測した公開済みのパッケージ。まだ読んでいなければ undefined
  published: Published | undefined;
  temps: string[];
  evidenceDir: string | undefined;
  // run を特定した後の URL (停止の表示の notes に出す)
  runUrl: string | undefined;
}

interface RunInfo {
  id: number;
  validateJobId: number;
  key: string;
}

const MIB = 1024 * 1024;
const MAX_TGZ_BYTES = 10 * MIB;
const MAX_MANIFEST_BYTES = MIB;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;
const COMMIT_PATTERN = /^[0-9a-f]{40,64}$/;
const SUMMARY_PREFIX = `${RELEASE_JOB_NAMES.validate}\tPrint the release manifest\t`;
const RUN_URL = 'https://github.com/berlysia/kanbun-annotation/actions/runs';

// --- 小さな道具 ---

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// コマンドの名前と exit code だけ。stderr の行は error にだけ入る (外部の文字列を理由に入れない)
function describeFailure(label: string, result: CommandResult): string {
  return `${label} exited ${result.status === null ? '(signal or not started)' : String(result.status)}`;
}

const commandLine = (cmd: string, args: readonly string[]): string => [cmd, ...args].join(' ');

function failureError(
  cmd: string,
  args: readonly string[],
  result: CommandResult,
  tool: ErrorTool
): ErrorExcerpt {
  return excerptLocalStderr(commandLine(cmd, args), result.status, result.stderr, { tool });
}

const toolOf = (cmd: string): ErrorTool => (cmd === 'npm' || cmd === 'gh' ? cmd : 'other');

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function withRaw(ctx: Ctx): { rawPath?: string } {
  return ctx.evidenceDir === undefined ? {} : { rawPath: ctx.evidenceDir };
}

function saveEvidence(ctx: Ctx, name: string, content: string): void {
  ctx.evidenceDir = ctx.deps.saveEvidence(name, content);
}

// 失敗した外部コマンドの後は、Ctrl-C を先に見る (command-failed に化けないように)
async function runCommand(
  ctx: Ctx,
  cmd: string,
  args: readonly string[],
  options: { stdio: 'pipe' | 'inherit' | 'inherit-keep-stderr'; cwd?: string }
): Promise<CommandResult> {
  const result = await ctx.deps.run(cmd, args, options);
  if (result.status !== 0 && ctx.deps.interrupted()) halt({ kind: 'interrupted' });
  return result;
}

async function runCommandOk(
  ctx: Ctx,
  cmd: string,
  args: readonly string[],
  label: string,
  options: { stdio: 'pipe' | 'inherit' | 'inherit-keep-stderr'; cwd?: string } = { stdio: 'pipe' }
): Promise<CommandResult> {
  const result = await runCommand(ctx, cmd, args, options);
  if (result.status !== 0) {
    halt({
      kind: 'command-failed',
      what: describeFailure(label, result),
      error: failureError(cmd, args, result, toolOf(cmd)),
    });
  }
  return result;
}

function argsOrHalt(built: Check<string[]>): string[] {
  if (!built.ok) halt({ kind: 'command-failed', what: built.errors.join('; ') });
  return built.value;
}

function makeTemp(ctx: Ctx): string {
  const path = ctx.deps.mkTemp();
  ctx.temps.push(path);
  return path;
}

function cleanupTemps(ctx: Ctx): void {
  for (const path of ctx.temps) {
    try {
      ctx.deps.removeTemp(path);
    } catch (error) {
      // 後始末の失敗は表示するが、元の結果を置き換えない
      ctx.deps.output.emit(`could not remove ${path}: ${messageOf(error)}`);
    }
  }
}

// 待って、予算を使い切ったら undefined。Ctrl-C は halt
async function pollOrHalt<T>(
  ctx: Ctx,
  wait: WaitSpec,
  probe: () => Promise<{ done: true; value: T } | { done: false }>,
  delayFirst = false
): Promise<T | undefined> {
  const result = await pollUntil(ctx.deps, {
    intervalMs: wait.intervalMs,
    budget: 'attempts' in wait ? { attempts: wait.attempts } : { ms: wait.budgetMs },
    delayFirst,
    probe,
  });
  if (result.kind === 'interrupted') halt({ kind: 'interrupted' });
  return result.kind === 'done' ? result.value : undefined;
}

function markPublished(ctx: Ctx, name: string): void {
  if (ctx.published === 'unknown') return;
  const known = ctx.published ?? [];
  if (!known.includes(name)) ctx.published = [...known, name];
}

// --- 段 8: run の特定と待機 (K10) ---

async function findRun(ctx: Ctx): Promise<number> {
  const args = ghRunListArgs(ctx.input.tagCommit);
  const found = await pollOrHalt(ctx, WAIT.runAppear, async () => {
    const result = await runCommandOk(ctx, 'gh', args, 'gh run list');
    saveEvidence(ctx, EVIDENCE_FILES.run, result.stdout);
    const selected = selectRun(parseJson(result.stdout), ctx.input.tagCommit);
    if (selected.kind === 'shape-unknown') {
      halt({ kind: 'shape-unknown', what: selected.what, ...withRaw(ctx) });
    }
    return selected.kind === 'found' ? { done: true, value: selected.id } : { done: false };
  });
  if (found === undefined) halt({ kind: 'run-not-found' });
  ctx.runUrl = `${RUN_URL}/${found}`;
  return found;
}

async function fetchRunView(ctx: Ctx, runId: number): Promise<unknown> {
  const result = await runCommandOk(ctx, 'gh', argsOrHalt(ghRunViewArgs(runId)), 'gh run view');
  saveEvidence(ctx, EVIDENCE_FILES.jobs, result.stdout);
  return parseJson(result.stdout);
}

// 失敗した job の log。取れなければ「読めなかった」印つきの error にする (route は変えない)。
// 待機は pollOrHalt を通すので、取得中の Ctrl-C は interrupted の停止になる
async function readFailedJobLog(
  ctx: Ctx,
  runId: number,
  jobId: number | undefined
): Promise<ErrorExcerpt> {
  const unreadable = (exit: number | null, stderr: string): ErrorExcerpt => {
    const last = excerptLocalStderr('gh', exit, stderr, { tool: 'gh' }).lines.slice(-1);
    return {
      command: `gh run view ${runId} --log-failed`,
      exit,
      source: 'job-log',
      tool: 'gh',
      lines: ['could not read the job log', ...last],
      matched: [],
      logUnreadable: true,
    };
  };
  if (jobId === undefined) return unreadable(null, '');
  const args = argsOrHalt(ghRunLogFailedArgs(runId, jobId));
  const results: CommandResult[] = [];
  const text = await pollOrHalt(ctx, WAIT.logFetch, async () => {
    const result = await runCommand(ctx, 'gh', args, { stdio: 'pipe' });
    results.push(result);
    // 上限を超えた結果は、待っても変わらないので再試行しない
    if (result.exceeded === true) return { done: true, value: undefined };
    if (result.status === 0 && result.stdout.trim() !== '') {
      return { done: true, value: result.stdout };
    }
    return { done: false };
  });
  if (text !== undefined) return excerptJobLog(commandLine('gh', args), text);
  // status 0 で空だった失敗は、(exit 0) の失敗として出さない
  const last = results[results.length - 1];
  const exit =
    last === undefined || last.exceeded === true || last.status === 0 ? null : last.status;
  return unreadable(exit, last?.exceeded === true ? '' : (last?.stderr ?? ''));
}

async function judgeRun(ctx: Ctx, runId: number): Promise<number> {
  let judged = judgeJobs(await fetchRunView(ctx, runId));
  if (judged.kind === 'in-progress') {
    ctx.deps.output.emit(`the Release run is still in progress; waiting (gh run watch ${runId})`);
    await runCommand(ctx, 'gh', argsOrHalt(ghRunWatchArgs(runId)), { stdio: 'inherit' });
    judged = judgeJobs(await fetchRunView(ctx, runId));
  }
  switch (judged.kind) {
    case 'ok':
      return judged.validateJobId;
    case 'in-progress':
      return halt({
        kind: 'command-failed',
        what: 'the Release run did not finish after gh run watch',
      });
    case 'job-failed':
      return halt({
        kind: 'job-failed',
        job: judged.job,
        error: await readFailedJobLog(ctx, runId, judged.jobId),
      });
    case 'shape-unknown':
      return halt({ kind: 'unexpected-run-shape', what: judged.what, ...withRaw(ctx) });
  }
}

// re-run の検出用。run_attempt と job の databaseId の集合
async function readAttemptKey(ctx: Ctx, runId: number, save: boolean): Promise<string> {
  const api = await runCommandOk(ctx, 'gh', argsOrHalt(ghRunAttemptArgs(runId)), 'gh api (run)');
  const view = await runCommandOk(ctx, 'gh', argsOrHalt(ghRunViewArgs(runId)), 'gh run view');
  if (save) saveEvidence(ctx, EVIDENCE_FILES.runAttempt, api.stdout);
  const key = attemptKey(parseJson(api.stdout), parseJson(view.stdout));
  if (!key.ok) halt({ kind: 'shape-unknown', what: key.errors.join('; '), ...withRaw(ctx) });
  return key.value;
}

async function ensureSameAttempt(ctx: Ctx, run: RunInfo): Promise<void> {
  if ((await readAttemptKey(ctx, run.id, false)) !== run.key) halt({ kind: 'attempt-changed' });
}

async function stage8(ctx: Ctx): Promise<RunInfo> {
  const id = await findRun(ctx);
  const validateJobId = await judgeRun(ctx, id);
  const key = await readAttemptKey(ctx, id, true);
  return { id, validateJobId, key };
}

// --- 段 9: log の manifest を錨にする (K11 の 1、2) ---

function expectedOf(ctx: Ctx): {
  tag: string;
  version: string;
  distTag: DistTag;
  names: readonly string[];
} {
  return {
    tag: ctx.input.tag,
    version: ctx.input.version,
    distTag: ctx.distTag,
    names: ctx.input.names,
  };
}

async function readLogManifest(ctx: Ctx, run: RunInfo): Promise<LogManifest> {
  let lastWhat = 'the log could not be read';
  const args = argsOrHalt(ghRunLogArgs(run.id, run.validateJobId));
  const manifest = await pollOrHalt(ctx, WAIT.logFetch, async () => {
    const result = await ctx.deps.run('gh', args, { stdio: 'pipe' });
    if (result.status !== 0) {
      if (ctx.deps.interrupted()) halt({ kind: 'interrupted' });
      lastWhat = describeFailure('gh run view --log', result);
      return { done: false };
    }
    const summary = result.stdout
      .split('\n')
      .filter((line) => line.startsWith(SUMMARY_PREFIX))
      .join('\n');
    saveEvidence(
      ctx,
      EVIDENCE_FILES.logManifest,
      `${summary === '' ? '(no matching lines)' : summary}\n`
    );
    const extracted = extractLogManifest(result.stdout, ctx.input.names.length);
    if (extracted.kind === 'ok') return { done: true, value: extracted.manifest };
    lastWhat = extracted.what;
    return { done: false };
  });
  if (manifest === undefined) {
    return halt({
      kind: 'shape-unknown',
      what: `the release manifest in the validate job's log could not be read: ${lastWhat}`,
      ...withRaw(ctx),
    });
  }
  const judged = judgeLogManifest(manifest, expectedOf(ctx));
  if (judged.kind !== 'ok') halt({ kind: 'staged-mismatch', what: judged.what });
  return manifest;
}

// --- パッケージの状態 (K12) ---

const integrityFor = (log: LogManifest, name: string): string =>
  log.packages.find((p) => p.name === name)?.integrity ?? '';

async function readPublishedIntegrity(ctx: Ctx, name: string): Promise<string | undefined> {
  const result = await runCommand(ctx, 'npm', npmViewDistArgs(name, ctx.input.version), {
    stdio: 'pipe',
  });
  saveEvidence(ctx, EVIDENCE_FILES.view(name), result.stdout);
  if (result.status !== 0) return undefined;
  const dist = parseViewDist(result.stdout);
  return dist.kind === 'ok' ? dist.dist.integrity : undefined;
}

async function readStage(ctx: Ctx, name: string): Promise<PickStageResult> {
  const result = await runCommandOk(ctx, 'npm', npmStageListArgs(name), `npm stage list ${name}`);
  saveEvidence(ctx, EVIDENCE_FILES.stageList(name), result.stdout);
  const picked = pickStage(result.stdout, name, ctx.input.version, ctx.distTag);
  // tag の違いや UUID でない id は、形の不一致ではなく改ざんの疑いとして止める
  if (picked.kind === 'mismatch') halt({ kind: 'staged-mismatch', name, what: picked.what });
  return picked;
}

async function readState(ctx: Ctx, name: string, log: LogManifest): Promise<PackageState> {
  const viewResult = await runCommand(ctx, 'npm', npmViewVersionsArgs(name), { stdio: 'pipe' });
  const view = parseNpmViewVersions(viewResult);
  if (view.kind === 'error') {
    // view.message は npm の出力から作った文なので、stderr と一緒に error の行へ入れる
    halt({
      kind: 'command-failed',
      what: `npm view ${name} failed`,
      error: excerptLocalStderr(
        commandLine('npm', npmViewVersionsArgs(name)),
        viewResult.status,
        `${view.message}\n${viewResult.stderr}`,
        { tool: 'npm' }
      ),
    });
  }
  const isPublished = view.kind === 'found' && view.versions.includes(ctx.input.version);
  const publishedIntegrity = isPublished ? await readPublishedIntegrity(ctx, name) : undefined;
  const stage: PickStageResult = isPublished ? { kind: 'none' } : await readStage(ctx, name);
  const state = classifyPackageState({
    name,
    version: ctx.input.version,
    view,
    publishedIntegrity,
    stage,
    logIntegrity: integrityFor(log, name),
  });
  if (!state.ok) halt({ kind: 'shape-unknown', what: state.errors.join('; '), ...withRaw(ctx) });
  return state.value;
}

async function readStates(ctx: Ctx, log: LogManifest): Promise<PackageState[]> {
  const states: PackageState[] = [];
  for (const name of ctx.input.names) states.push(await readState(ctx, name, log));
  ctx.published = states
    .filter((s) => s.kind === 'published' || s.kind === 'published-wrong')
    .map((s) => s.name);
  return states;
}

type ApproveTargets = { name: string; stageId: string }[];
interface StagePlan {
  states: PackageState[];
  targets: ApproveTargets;
}

// 計画を立てる。wait なら読み直し、解けなければ待機を使い切った計画にする。stop と done の扱いは呼び出し側
async function planStage(ctx: Ctx, log: LogManifest): Promise<StagePlan> {
  let states = await readStates(ctx, log);
  let plan = planApprove(states, false);
  if (plan.kind === 'wait') {
    const settled = await pollOrHalt(
      ctx,
      WAIT.settle,
      async () => {
        states = await readStates(ctx, log);
        const next = planApprove(states, false);
        return next.kind === 'wait' ? { done: false } : { done: true, value: next };
      },
      true
    );
    plan = settled ?? planApprove(states, true);
  }
  if (plan.kind === 'stop') {
    const { published, ...rest } = plan.observation;
    return halt(rest as Observed, published);
  }
  return { states, targets: plan.kind === 'approve' ? plan.targets : [] };
}

// --- artifact (取れれば追加の照合、K11 の 3) ---

function readArtifactFiles(
  ctx: Ctx,
  dir: string,
  entries: readonly ArtifactEntry[]
): StagedArtifact {
  const manifestBytes = ctx.deps.readFile(`${dir}/manifest.json`, MAX_MANIFEST_BYTES);
  const manifest = parseJson(manifestBytes.toString('utf8'));
  if (manifest === undefined) throw new Error('manifest.json is not JSON');
  const files = entries
    .filter((e) => e.name !== 'manifest.json')
    .map((e) => ({
      file: e.name,
      integrity: sha512Integrity(ctx.deps.readFile(`${dir}/${e.name}`, MAX_TGZ_BYTES)),
    }));
  return { entries, manifest, files };
}

async function readArtifact(
  ctx: Ctx,
  run: RunInfo,
  log: LogManifest
): Promise<StagedArtifact | undefined> {
  const dir = makeTemp(ctx);
  const result = await runCommand(ctx, 'gh', argsOrHalt(ghRunDownloadArgs(run.id, dir)), {
    stdio: 'pipe',
  });
  if (result.status !== 0) return undefined;
  const entries = ctx.deps.listDir(dir);
  const shape = judgeArtifactDir(
    entries,
    log.packages.map((p) => p.file)
  );
  if (shape.kind !== 'ok') return halt({ kind: 'staged-mismatch', what: shape.what });
  try {
    return readArtifactFiles(ctx, dir, entries);
  } catch (error) {
    return halt({ kind: 'staged-mismatch', what: `artifact: ${messageOf(error)}` });
  }
}

// --- stage の tarball (K11 の 5、6) ---

async function downloadStaged(
  ctx: Ctx,
  target: { name: string; stageId: string }
): Promise<Buffer> {
  const { name } = target;
  const cwd = makeTemp(ctx);
  const args = argsOrHalt(npmStageDownloadArgs(target.stageId));
  await runCommandOk(ctx, 'npm', args, `npm stage download ${name}`, { stdio: 'pipe', cwd });
  const entries = ctx.deps.listDir(cwd);
  const [only] = entries;
  if (entries.length !== 1 || only === undefined) {
    return halt({
      kind: 'staged-mismatch',
      name,
      what: `${name}: npm stage download left ${entries.length} entries, expected exactly one .tgz`,
    });
  }
  if (only.kind !== 'file' || !only.name.endsWith('.tgz') || only.size > MAX_TGZ_BYTES) {
    return halt({
      kind: 'staged-mismatch',
      name,
      what: `${name}: the downloaded entry ${only.name} is not a regular .tgz file within 10 MiB`,
    });
  }
  try {
    return ctx.deps.readFile(`${cwd}/${only.name}`, MAX_TGZ_BYTES);
  } catch (error) {
    return halt({ kind: 'staged-mismatch', name, what: `${name}: ${messageOf(error)}` });
  }
}

interface Validated {
  validatedIds: ReadonlyMap<string, string>;
  artifact: StagedArtifact | undefined;
}

async function judgeTargets(
  ctx: Ctx,
  run: RunInfo,
  log: LogManifest,
  targets: ApproveTargets
): Promise<Validated> {
  const artifact = await readArtifact(ctx, run, log);
  const staged: { name: string; stageId: string; tarball: Buffer }[] = [];
  for (const target of targets)
    staged.push({ ...target, tarball: await downloadStaged(ctx, target) });
  const judged = judgeStaged({
    logManifest: log,
    expected: expectedOf(ctx),
    ...(artifact === undefined ? {} : { artifact }),
    targets: staged,
  });
  switch (judged.kind) {
    case 'ok':
      return { validatedIds: judged.validatedIds, artifact };
    case 'shape-unknown':
      return halt({ kind: 'shape-unknown', what: judged.what, ...withRaw(ctx) });
    case 'mismatch':
      return halt({
        kind: 'staged-mismatch',
        ...(judged.name === undefined ? {} : { name: judged.name }),
        what: judged.what,
      });
  }
}

// --- 段 10: trust の再確認、表示、y/N、approve (K13) ---

function haltOnTrust(ctx: Ctx, trust: TrustResult): void {
  const npmError = (failure: { command: string; status: number | null; stderr: string }) =>
    excerptLocalStderr(failure.command, failure.status, failure.stderr, { tool: 'npm' });
  switch (trust.kind) {
    case 'ok':
      return;
    case 'eotp':
      return halt({
        kind: 'trust-eotp',
        ...(trust.failure === undefined ? {} : { error: npmError(trust.failure) }),
      });
    case 'mismatch':
      return halt({ kind: 'trust-mismatch', what: trust.what });
    case 'shape-unknown':
      // what は settleHalt が error.lines の先頭に足す。ここでは npm trust list のコマンドだけを持たせる
      return halt({
        kind: 'shape-unknown',
        what: trust.what,
        error: excerptDetail(
          `npm trust list ${ctx.input.names[0] ?? '<package>'} --json`,
          null,
          []
        ),
        ...(trust.rawPath === undefined ? {} : { rawPath: trust.rawPath }),
      });
    case 'command-failed':
      // failure があるとき trust.what は stderr を含むので、コマンドと exit code だけにして、
      // stderr は error の行に入れる (二重に出さない)
      return halt({
        kind: 'command-failed',
        what:
          trust.failure === undefined
            ? trust.what
            : describeFailure(trust.failure.command, {
                status: trust.failure.status,
                stdout: '',
                stderr: '',
              }),
        ...(trust.failure === undefined ? {} : { error: npmError(trust.failure) }),
      });
  }
}

const shortIntegrity = (integrity: string): string =>
  `${integrity.slice(0, 16)}...${integrity.slice(-8)}`;

function showSummary(
  ctx: Ctx,
  run: RunInfo,
  log: LogManifest,
  plan: StagePlan,
  validated: Validated
): void {
  const { emit } = ctx.deps.output;
  const { input } = ctx;
  emit(`Release ${input.tag} (version ${input.version}, dist-tag ${ctx.distTag})`);
  emit(`run: ${RUN_URL}/${run.id}`);
  emit(
    validated.artifact === undefined
      ? 'artifact: 取得できず (省略)'
      : 'artifact: matches the log manifest'
  );
  emit(`evidence: ${ctx.evidenceDir ?? 'not saved'}`);
  const stageIds = new Map(plan.targets.map((t) => [t.name, t.stageId]));
  input.names.forEach((name, i) => {
    const integrity = shortIntegrity(integrityFor(log, name));
    const stageId = stageIds.get(name);
    emit(
      stageId === undefined
        ? `${i + 1}. ${name}  already published (integrity ${integrity})`
        : `${i + 1}. ${name}  stage ${stageId}  integrity ${integrity}  staged tarball matches the log`
    );
  });
}

// 検証していない id では approve しない。状態が staged でなければ、その状態に応じて止まる
async function recheckBeforeApprove(
  ctx: Ctx,
  name: string,
  validatedId: string,
  log: LogManifest
): Promise<'approve' | 'skip'> {
  const state = await readState(ctx, name, log);
  switch (state.kind) {
    case 'published':
      markPublished(ctx, name);
      return 'skip';
    case 'staged':
      if (state.stageId !== validatedId) {
        return halt({
          kind: 'staged-mismatch',
          name,
          what: `${name}: the staged id changed after confirmation`,
        });
      }
      return 'approve';
    case 'published-wrong':
      return halt({ kind: 'published-wrong', name });
    case 'staged-ambiguous':
      return halt({ kind: 'staged-mismatch', name, what: `${name} has more than one staged item` });
    case 'missing':
      return halt({
        kind: 'staged-mismatch',
        name,
        what: `no staged item for ${name} before approve`,
      });
  }
}

type FailureVerdict = 'published' | 'retry';

// approve が 0 以外で終わった後。Ctrl-C は runCommand が先に見ている。状態を読み直して分類する
async function afterApproveFailure(
  ctx: Ctx,
  name: string,
  log: LogManifest,
  result: CommandResult,
  approveArgs: readonly string[]
): Promise<FailureVerdict> {
  let state = await readState(ctx, name, log);
  if (state.kind === 'missing') {
    await pollOrHalt(
      ctx,
      WAIT.settle,
      async () => {
        state = await readState(ctx, name, log);
        return state.kind === 'missing' ? { done: false } : { done: true, value: true };
      },
      true
    );
  }
  switch (state.kind) {
    case 'published':
      markPublished(ctx, name);
      return 'published';
    case 'published-wrong':
      return halt({ kind: 'published-wrong', name });
    case 'staged-ambiguous':
      return halt({ kind: 'staged-mismatch', name, what: `${name} has more than one staged item` });
    case 'missing':
      return halt({
        kind: 'staged-mismatch',
        name,
        what: `${name} is neither published nor staged after a failed approve`,
      });
    case 'staged':
      if (isE409(result.stderr)) return 'retry';
      return halt({
        kind: 'approve-failed',
        name,
        what: describeFailure('npm stage approve', result),
        error: failureError('npm', approveArgs, result, 'npm'),
      });
  }
}

async function approveOne(
  ctx: Ctx,
  target: { name: string; stageId: string },
  validatedIds: ReadonlyMap<string, string>,
  log: LogManifest
): Promise<void> {
  const { name } = target;
  const validatedId = validatedIds.get(name);
  if (validatedId === undefined) {
    halt({ kind: 'staged-mismatch', name, what: `${name} has no validated stage id` });
  }
  if ((await recheckBeforeApprove(ctx, name, validatedId, log)) === 'skip') {
    ctx.deps.output.emit(`${name}: already published; skipped`);
    return;
  }
  const args = argsOrHalt(npmStageApproveArgs(validatedId));
  const results: CommandResult[] = [];
  const attempt = async (): Promise<CommandResult> => {
    const result = await runCommand(ctx, 'npm', args, { stdio: 'inherit-keep-stderr' });
    results.push(result);
    return result;
  };
  const first = await attempt();
  if (
    first.status === 0 ||
    (await afterApproveFailure(ctx, name, log, first, args)) === 'published'
  ) {
    markPublished(ctx, name);
    ctx.deps.output.emit(`${name}: approved`);
    return;
  }
  const retried = await pollOrHalt(
    ctx,
    WAIT.conflict,
    async () => {
      const result = await attempt();
      const done =
        result.status === 0 ||
        (await afterApproveFailure(ctx, name, log, result, args)) === 'published';
      return done ? { done: true, value: true } : { done: false };
    },
    true
  );
  if (retried === undefined) {
    const lastResult = results[results.length - 1];
    halt({
      kind: 'approve-failed',
      name,
      what: `E409 (conflict) persisted after ${WAIT.conflict.attempts} retries`,
      // 最後の試行の stderr
      ...(lastResult === undefined ? {} : { error: failureError('npm', args, lastResult, 'npm') }),
    });
  }
  markPublished(ctx, name);
  ctx.deps.output.emit(`${name}: approved`);
}

async function stage10(
  ctx: Ctx,
  run: RunInfo,
  log: LogManifest,
  plan: StagePlan,
  validated: Validated
): Promise<'approved' | 'declined'> {
  haltOnTrust(ctx, await ctx.deps.verifyTrust());
  showSummary(ctx, run, log, plan, validated);
  const question = `Approve ${plan.targets.length} staged package(s) with npm stage approve (each asks for 2FA)?`;
  if (!(await ctx.deps.confirm(question))) return 'declined';
  for (const target of plan.targets) await approveOne(ctx, target, validated.validatedIds, log);
  return 'approved';
}

// --- 段 11: approve の後の判定 (K14) ---

interface PostSnapshot {
  items: { name: string; dist: ParseViewDistResult }[];
  releaseExists: boolean;
  published: readonly string[];
  // npm view が失敗したパッケージの error (形の不一致の停止に付ける)
  viewErrors: ReadonlyMap<string, ErrorExcerpt>;
}

async function readPostCheck(ctx: Ctx): Promise<PostSnapshot> {
  const items: PostSnapshot['items'] = [];
  const viewErrors = new Map<string, ErrorExcerpt>();
  for (const name of ctx.input.names) {
    const viewArgs = npmViewDistArgs(name, ctx.input.version);
    const result = await runCommand(ctx, 'npm', viewArgs, { stdio: 'pipe' });
    if (result.status !== 0) viewErrors.set(name, failureError('npm', viewArgs, result, 'npm'));
    saveEvidence(ctx, EVIDENCE_FILES.view(name), result.stdout);
    items.push({
      name,
      // 段 11 の形の不一致は post-check の shape に統一する (コマンドの失敗も同じ扱い)
      dist:
        result.status === 0
          ? parseViewDist(result.stdout)
          : { kind: 'shape-unknown', what: describeFailure('npm view', result) },
    });
  }
  const release = await runCommand(ctx, 'gh', argsOrHalt(ghReleaseViewArgs(ctx.input.tag)), {
    stdio: 'pipe',
  });
  return {
    items,
    releaseExists: parseGhReleaseView(release.status, release.stderr).kind === 'found',
    published: items.filter((i) => i.dist.kind === 'ok').map((i) => i.name),
    viewErrors,
  };
}

function resultLines(
  ctx: Ctx,
  snapshot: PostSnapshot,
  found: readonly StopObservation[]
): string[] {
  const failed = new Set(
    found.flatMap((o) => (o.kind === 'post-check' ? [`${o.check}:${o.name ?? ''}`] : []))
  );
  const mark = (check: string, name: string): string =>
    failed.has(`${check}:${name}`) ? 'NG' : 'ok';
  const lines = snapshot.items.map(({ name, dist }) =>
    dist.kind === 'ok'
      ? `${name}: integrity ${mark('integrity', name)}, dist-tag ${ctx.distTag} ${mark('dist-tag', name)}, attestations ${dist.dist.hasAttestations ? 'yes' : 'no'}`
      : `${name}: unreadable (${dist.what})`
  );
  lines.push(`GitHub Release: ${failed.has('release:') ? 'missing' : 'ok'}`);
  return lines;
}

// 段 11 の形の不一致は、npm view が失敗したパッケージなら、その stderr を error に持つ
function withViewError(obs: StopObservation, snapshot: PostSnapshot | undefined): StopObservation {
  if (obs.kind !== 'post-check' || obs.name === undefined || obs.error !== undefined) return obs;
  const error = snapshot?.viewErrors.get(obs.name);
  return error === undefined ? obs : { ...obs, error };
}

async function stage11(ctx: Ctx, log: LogManifest): Promise<AfterPushResult> {
  const integrities = new Map(log.packages.map((p) => [p.name, p.integrity]));
  let snapshot: PostSnapshot | undefined;
  let found: StopObservation[] = [];
  await pollOrHalt(ctx, WAIT.settle, async () => {
    snapshot = await readPostCheck(ctx);
    found = judgePostCheck(
      snapshot.items,
      { version: ctx.input.version, distTag: ctx.distTag, integrities },
      snapshot.releaseExists,
      snapshot.published
    );
    return found.length === 0 ? { done: true, value: true } : { done: false };
  });
  const { emit } = ctx.deps.output;
  const [first, ...rest] = found.map((obs) =>
    finishStop(ctx, classifyStop(obs), withViewError(obs, snapshot))
  );
  if (first !== undefined) {
    const stops: readonly [ClassifiedStop, ...ClassifiedStop[]] = [first, ...rest];
    const top = pickRepresentative(stops);
    emit(`post-approve check failed; most serious: [${top.route}] ${top.reason}`);
  }
  if (snapshot !== undefined) {
    emit('post-approve results (for the Results section of ADR-029):');
    for (const line of resultLines(ctx, snapshot, found)) emit(line);
  }
  if (first === undefined) return { kind: 'completed' };
  return { kind: 'post-check-failed', stops: [first, ...rest] };
}

// --- 全体 ---

async function stage9And10(
  ctx: Ctx,
  run: RunInfo,
  log: LogManifest
): Promise<'continue' | 'declined'> {
  const plan = await planStage(ctx, log);
  if (plan.targets.length === 0) {
    await ensureSameAttempt(ctx, run);
    return 'continue';
  }
  const validated = await judgeTargets(ctx, run, log, plan.targets);
  await ensureSameAttempt(ctx, run);
  return (await stage10(ctx, run, log, plan, validated)) === 'declined' ? 'declined' : 'continue';
}

async function runStages(ctx: Ctx): Promise<AfterPushResult> {
  const run = await stage8(ctx);
  const log = await readLogManifest(ctx, run);
  if (ctx.input.checkOnly) {
    await ensureSameAttempt(ctx, run);
  } else if ((await stage9And10(ctx, run, log)) === 'declined') {
    return { kind: 'declined' };
  }
  return stage11(ctx, log);
}

// 止まるとき、公開済みの集合をまだ読んでいなければ 1 回読む (読めなければ unknown)
async function readPublishedOnce(ctx: Ctx): Promise<Published> {
  try {
    const found: string[] = [];
    for (const name of ctx.input.names) {
      const view = parseNpmViewVersions(
        await ctx.deps.run('npm', npmViewVersionsArgs(name), { stdio: 'pipe' })
      );
      if (view.kind === 'error') return 'unknown';
      if (view.kind === 'found' && view.versions.includes(ctx.input.version)) found.push(name);
    }
    return found;
  } catch {
    return 'unknown';
  }
}

// 観測の what を error.lines の先頭に足し (matched には入れない)、観測の error が無ければ what か理由の
// 1 行で作る。rawPath を持つ観測は error.rawPath に写す。classifyStop は error に触れず、写すのはここだけ
function composeError(stop: ClassifiedStop, observation: StopObservation): ErrorExcerpt {
  const base =
    stop.what === undefined
      ? (observation.error ?? excerptDetail(NO_COMMAND, null, [stop.reason]))
      : prependDetail(observation.error, stop.what);
  const rawPath = 'rawPath' in observation ? observation.rawPath : undefined;
  return rawPath !== undefined && base.rawPath === undefined ? { ...base, rawPath } : base;
}

function finishStop(
  ctx: Ctx | undefined,
  stop: ClassifiedStop,
  observation: StopObservation
): ClassifiedStop {
  return {
    ...stop,
    error: composeError(stop, observation),
    ...(ctx?.runUrl === undefined ? {} : { runUrl: ctx.runUrl }),
  };
}

async function settleHalt(ctx: Ctx, caught: Halt): Promise<AfterPushResult> {
  const { reason } = caught;
  if (reason.kind === 'declined') return { kind: 'declined' };
  const published = reason.published ?? ctx.published ?? (await readPublishedOnce(ctx));
  const observation = { ...reason.observation, published } as StopObservation;
  return { kind: 'stopped', stop: finishStop(ctx, classifyStop(observation), observation) };
}

function checkInput(input: AfterPushInput): string | undefined {
  if (!VERSION_PATTERN.test(input.version))
    return `version ${JSON.stringify(input.version)} is not x.y.z`;
  if (input.tag !== `v${input.version}`) return `tag ${input.tag} is not v${input.version}`;
  if (!COMMIT_PATTERN.test(input.tagCommit)) return 'the tag commit is not a hex commit id';
  if (input.names.length === 0) return 'no public packages to release';
  return undefined;
}

export async function runAfterPush(
  input: AfterPushInput,
  deps: AfterPushDeps
): Promise<AfterPushResult> {
  const invalid = checkInput(input);
  if (invalid !== undefined) {
    const observation: StopObservation = {
      kind: 'command-failed',
      what: invalid,
      published: 'unknown',
    };
    return {
      kind: 'stopped',
      stop: finishStop(undefined, classifyStop(observation), observation),
    };
  }
  const ctx: Ctx = {
    input,
    deps,
    distTag: distTagFor(input.version),
    published: undefined,
    temps: [],
    evidenceDir: undefined,
    runUrl: undefined,
  };
  try {
    return await runStages(ctx);
  } catch (error) {
    if (error instanceof Halt) return await settleHalt(ctx, error);
    throw error;
  } finally {
    cleanupTemps(ctx);
  }
}
