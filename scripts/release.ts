/**
 * Local release flow: version with changesets, verify, commit, annotated tag, atomic push.
 *
 * Usage:
 *   pnpm run release                     # normal release (needs a pending changeset)
 *   pnpm run release -- --tag-only       # tag the current HEAD (the version is already bumped)
 *   pnpm run release -- --pre <tag>      # prerelease (enters / switches changesets pre mode)
 *   pnpm run release -- --exit-pre       # leave pre mode and release the stable version
 *
 * The stages and what each leaves behind when it stops are defined in the spec (K1).
 * Everything printed goes through one output function that strips control characters.
 * This script never force-pushes and never merges.
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import {
  buildGhArgs,
  buildNpmArgs,
  checkNpmRegistryConfig,
  checkSameVersion,
  checkTag,
  checkToolVersions,
  checkTrustList,
  checkVersionedChanges,
  childEnv,
  combineTrustResults,
  decideEntry,
  decideEntryWithStatus,
  fillEmptyChangelogSection,
  ignoredPackageDirs,
  isInteractiveStreams,
  parseChangesetStatus,
  parseGhReleaseView,
  parseNpmViewVersions,
  parseReleaseFlags,
  orderByDependencies,
  parseToolVersion,
  planIgnoredRestore,
  planVerifySteps,
} from './lib/release-check.ts';
import type {
  ChangesetStatus,
  EntryObservation,
  ReleaseFlags,
  ReleaseLookup,
  VerifyPlan,
  WorkspacePackage,
} from './lib/release-check.ts';
import {
  createStreamSanitizer,
  isSafeTempPath,
  npmViewVersionsArgs,
  sanitizeForTerminal,
} from './lib/release-after-push-check.ts';
import {
  diagnose,
  excerptDetail,
  excerptLocalStderr,
  formatStopReport,
  remediesFor,
  STAGES,
} from './lib/release-stop-report.ts';
import { runAfterPush } from './release-after-push.ts';
import type { AfterPushDeps, AfterPushInput } from './release-after-push.ts';
import { NO_COMMAND } from './lib/release-types.ts';
import type {
  AfterPushResult,
  Check,
  ChildFailure,
  ClassifiedStop,
  CommandResult,
  ErrorExcerpt,
  FrontCheck,
  FrontStage,
  FrontStop,
  GitResult,
  NonEmpty,
  Outcome,
  StopReport,
  TrustFailure,
  TrustResult,
} from './lib/release-types.ts';
export type { GitResult };

// --- 出力 (全文字列を無害化する唯一の出口) ---

export interface Output {
  emit(line: string): void;
  emitChunk(text: string): void;
}

export function createOutput(write: (text: string) => void): Output {
  return {
    emit: (line) => write(`${sanitizeForTerminal(line)}\n`),
    emitChunk: (text) => {
      const clean = sanitizeForTerminal(text);
      if (clean !== '') write(clean);
    },
  };
}

// --- 外部コマンドの実行器 (async の spawn。K16 の環境と引数の固定をここで当てる) ---

const MIB = 1024 * 1024;
const PIPE_CAP_BYTES = 64 * MIB;
const STDERR_KEEP_BYTES = 1 * MIB;

export type RunStdio = 'pipe' | 'inherit' | 'inherit-keep-stderr';

export interface RunOptions {
  stdio: RunStdio;
  cwd?: string;
  // true なら引数を変えない (`--version` や `npm config get` のように、固定の引数が邪魔になるもの)
  raw?: boolean;
}

export type Runner = (
  cmd: string,
  args: readonly string[],
  options: RunOptions
) => Promise<CommandResult>;

export interface ChildLike {
  stdout: Readable | null;
  stderr: Readable | null;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  kill(): unknown;
}

export interface SpawnOptionsLike {
  stdio: readonly ['ignore' | 'inherit', 'inherit' | 'pipe', 'inherit' | 'pipe'];
  env: Record<string, string>;
  cwd?: string;
}

export type SpawnFn = (cmd: string, args: string[], options: SpawnOptionsLike) => ChildLike;

// shell は使わない (spawn の既定)
export const nodeSpawn: SpawnFn = (cmd, args, options) =>
  spawn(cmd, args, {
    stdio: [...options.stdio],
    env: options.env,
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
  });

// 受けたそばから無害化して流しつつ、無害化前の文字列を capBytes まで保持して返す (E409 の判定用)
export async function pumpSanitizedStderr(
  source: Readable,
  output: Output,
  capBytes: number
): Promise<string> {
  const sanitizer = createStreamSanitizer();
  const kept: Buffer[] = [];
  let keptBytes = 0;
  try {
    for await (const chunk of source) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      output.emitChunk(sanitizer.write(buf));
      if (keptBytes < capBytes) {
        const part = buf.subarray(0, capBytes - keptBytes);
        kept.push(part);
        keptBytes += part.length;
      }
    }
  } catch {
    // 読み取りの失敗は、そこまでに受けた分を返す
  }
  output.emitChunk(sanitizer.end());
  return Buffer.concat(kept).toString('utf8');
}

function stdioFor(mode: RunStdio): SpawnOptionsLike['stdio'] {
  switch (mode) {
    case 'pipe':
      return ['ignore', 'pipe', 'pipe'];
    case 'inherit':
      return ['inherit', 'inherit', 'inherit'];
    case 'inherit-keep-stderr':
      return ['inherit', 'inherit', 'pipe'];
  }
}

function argsFor(cmd: string, args: readonly string[], raw: boolean | undefined): string[] {
  if (raw === true) return [...args];
  if (cmd === 'npm') return buildNpmArgs(args);
  if (cmd === 'gh') return buildGhArgs(args);
  return [...args];
}

export function createRunner(
  spawnFn: SpawnFn,
  output: Output,
  options: { env?: Readonly<Record<string, string | undefined>> } = {}
): Runner {
  return (cmd, args, runOptions) =>
    new Promise<CommandResult>((resolvePromise) => {
      let settled = false;
      const finish = (result: CommandResult): void => {
        if (settled) return;
        settled = true;
        resolvePromise(result);
      };
      let child: ChildLike;
      try {
        child = spawnFn(cmd, argsFor(cmd, args, runOptions.raw), {
          stdio: stdioFor(runOptions.stdio),
          env: childEnv(options.env ?? process.env),
          ...(runOptions.cwd === undefined ? {} : { cwd: runOptions.cwd }),
        });
      } catch (error) {
        finish({ status: null, stdout: '', stderr: errorMessage(error) });
        return;
      }
      const out: Buffer[] = [];
      const err: Buffer[] = [];
      let outBytes = 0;
      let errBytes = 0;
      const collect = (stream: Readable | null, into: Buffer[], isOut: boolean): void => {
        stream?.on('data', (chunk: Buffer | string) => {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          if (isOut) outBytes += buf.length;
          else errBytes += buf.length;
          if (outBytes > PIPE_CAP_BYTES || errBytes > PIPE_CAP_BYTES) {
            child.kill();
            finish({
              status: null,
              stdout: '',
              stderr: `command-failed: ${cmd} output exceeded ${PIPE_CAP_BYTES / MIB} MiB`,
              exceeded: true,
            });
            return;
          }
          into.push(buf);
        });
      };
      const keepStderr =
        runOptions.stdio === 'inherit-keep-stderr' && child.stderr
          ? pumpSanitizedStderr(child.stderr, output, STDERR_KEEP_BYTES)
          : undefined;
      if (runOptions.stdio === 'pipe') {
        collect(child.stdout, out, true);
        collect(child.stderr, err, false);
      }
      child.on('error', (error) => {
        finish({ status: null, stdout: '', stderr: errorMessage(error) });
      });
      child.on('close', (code) => {
        void (async () => {
          const kept = keepStderr ? await keepStderr : undefined;
          finish({
            status: typeof code === 'number' ? code : null,
            stdout: Buffer.concat(out).toString('utf8'),
            stderr: kept ?? Buffer.concat(err).toString('utf8'),
          });
        })();
      });
    });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// --- y/N の確認 (呼ぶたびに readline を作って閉じる) ---

export interface LineReader {
  question(query: string): Promise<string>;
  close(): void;
  on(event: string, listener: () => void): unknown;
}

export type CreateInterface = (options: { input: Readable }) => LineReader;

export function createConfirm(
  createInterfaceFn: CreateInterface,
  output: Output,
  input: Readable = process.stdin
): (question: string) => Promise<boolean> {
  return async (question) => {
    output.emit(`${question} [y/N]`);
    // readline の output に端末を渡さない (入力の echo は端末に任せる)
    const rl = createInterfaceFn({ input });
    try {
      const closed = new Promise<boolean>((done) => {
        rl.on('close', () => done(false));
      });
      const answered = rl
        .question('')
        .then((answer) => /^y(es)?$/i.test(answer.trim()))
        .catch(() => false);
      return await Promise.race([answered, closed]);
    } finally {
      rl.close();
    }
  };
}

// --- trust の再確認 (K5) ---

export type SaveRaw = (files: readonly { name: string; content: string }[]) => string;

export async function verifyTrustWith(
  run: Runner,
  saveRaw: SaveRaw,
  output: Output,
  names: readonly string[]
): Promise<TrustResult> {
  const first = names[0];
  if (first === undefined) return { kind: 'command-failed', what: 'no public packages to check' };
  output.emit(
    'npm trust list asks for authentication: choose "skip 2FA for 5 minutes" so the next 6 lookups do not ask again.'
  );
  const interactive = await run('npm', ['trust', 'list', first], { stdio: 'inherit' });
  if (interactive.status !== 0) {
    // 対話の 1 回は stderr を受けていない (画面に出ている)
    return {
      kind: 'command-failed',
      what: `npm trust list ${first} (interactive) exited ${interactive.status ?? 'not started'}`,
    };
  }
  const results: { name: string; result: CommandResult }[] = [];
  for (const name of names) {
    results.push({
      name,
      result: await run('npm', ['trust', 'list', name, '--json'], { stdio: 'pipe' }),
    });
  }
  // 判定の結果にかかわらず、生の出力を保存する (形が実物と違ったときに人が読めるように)
  const dir = saveRaw(
    results.map(({ name, result }) => ({
      name,
      content: `${JSON.stringify({ name, status: result.status, stdout: result.stdout, stderr: result.stderr }, null, 2)}\n`,
    }))
  );
  output.emit(`raw npm trust list output saved to ${dir}`);
  const checked = results.map(({ result }) => checkTrustList(result));
  const combined = combineTrustResults(checked);
  if (combined.kind === 'mismatch') {
    for (const { name, result } of results) output.emit(`--- ${name}\n${result.stdout.trim()}`);
  }
  if (combined.kind === 'eotp' || combined.kind === 'command-failed') {
    // combineTrustResults は同じ種類のうち最初のものを返す。その 1 回の stderr を error に使う
    const hit = results[checked.findIndex((c) => c.kind === combined.kind)];
    return hit === undefined
      ? combined
      : {
          ...combined,
          failure: {
            command: `npm trust list ${hit.name} --json`,
            status: hit.result.status,
            stderr: hit.result.stderr,
          },
        };
  }
  return combined.kind === 'shape-unknown' ? { ...combined, rawPath: dir } : combined;
}

// --- 前半 (段 1〜7) ---

export interface ReleaseDeps {
  git(args: string[]): GitResult;
  verifyTrust(): Promise<TrustResult>;
  changesetStatus(): Promise<FrontCheck<ChangesetStatus>>;
  changesetPre(args: string[]): Promise<FrontCheck<void>>;
  verify(): Promise<FrontCheck<void>>;
  changesetVersion(): Promise<FrontCheck<void>>;
  prettier(files: string[]): Promise<FrontCheck<void>>;
  checkRelease(tag: string): Promise<FrontCheck<void>>;
  consumer(): Promise<FrontCheck<void>>;
  ghRelease(tag: string): ReleaseLookup;
  confirm(question: string): Promise<boolean>;
  log(line: string): void;
}

export type ReleaseOutcome =
  | { status: 'released'; tag: string }
  | { status: 'tag-pushed'; tag: string }
  | { status: 'stopped'; stop: FrontStop };

const BRANCH = 'master';
const REVERT_VERSIONING = 'git checkout -- . && git clean -fd .changeset packages';

export type PreState = { mode: 'none' } | { mode: 'pre'; tag: string };

function readJsonFile(file: string): Check<unknown> {
  if (!existsSync(file)) return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(readFileSync(file, 'utf8')) as unknown };
  } catch (error) {
    return { ok: false, errors: [`${file}: ${errorMessage(error)}`] };
  }
}

export function readPreState(root: string): Check<PreState> {
  const json = readJsonFile(join(root, '.changeset', 'pre.json'));
  if (!json.ok) return json;
  const value = json.value;
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    if (record['mode'] === 'pre' && typeof record['tag'] === 'string') {
      return { ok: true, value: { mode: 'pre', tag: record['tag'] } };
    }
  }
  return { ok: true, value: { mode: 'none' } };
}

function readDependencyRecord(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  );
}

// packages/*/package.json の全部 (private を含む)
function readWorkspacePackages(root: string, git: ReleaseDeps['git']): WorkspacePackage[] {
  const listed = git(['ls-files', '--', ':(glob)packages/*/package.json']);
  const pkgs: WorkspacePackage[] = [];
  for (const rel of listed.stdout.split('\n').filter(Boolean)) {
    const file = join(root, rel);
    if (!existsSync(file)) continue;
    const json = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    pkgs.push({
      name: String(json['name']),
      dir: rel.replace(/\/package\.json$/, ''),
      version: String(json['version']),
      private: json['private'] === true,
      dependencies: readDependencyRecord(json['dependencies']),
      peerDependencies: readDependencyRecord(json['peerDependencies']),
      optionalDependencies: readDependencyRecord(json['optionalDependencies']),
    });
  }
  return pkgs;
}

function readPublicPackages(root: string, git: ReleaseDeps['git']): WorkspacePackage[] {
  return readWorkspacePackages(root, git).filter((p) => !p.private);
}

function readVersion(root: string, git: ReleaseDeps['git']): Check<string> {
  const pkgs = readPublicPackages(root, git);
  if (pkgs.length === 0) return { ok: false, errors: ['no public packages found'] };
  return checkSameVersion(pkgs);
}

const literal = (path: string): string => `:(literal)${path}`;
const PORCELAIN = ['status', '--porcelain=v1', '-z', '--untracked-files=all'];

interface FrontState {
  flags: ReleaseFlags;
  deps: ReleaseDeps;
  root: string;
  tag: string;
  // 許可リストの 2 回目の検査が返したパス。段 6 はこれだけを add する
  allowed: string[];
  // 停止は log に出さず値で返す。表示は reportOutcome だけが行う (外部の文字列は error にだけ入る)
  stop(
    stage: FrontStage,
    reason: string,
    error: ErrorExcerpt,
    recovery?: string,
    rerun?: string
  ): ReleaseOutcome;
}

type StageResult = ReleaseOutcome | undefined;

const errorText = (r: { errors: string[] }): string => r.errors.join('; ');

const STAGE_1 = STAGES[1].name;
const STAGE_2 = STAGES[2].name;
const STAGE_3 = STAGES[3].name;
const STAGE_4 = STAGES[4].name;
const STAGE_5 = STAGES[5].name;
const STAGE_6 = STAGES[6].name;
const STAGE_7 = STAGES[7].name;

// --- 停止の error の欄 (外部の文字列は excerpt* を通って lines にだけ入る) ---

// 判定だけの停止: コマンドが無いので、判定の外部の値 (無ければ理由) を行にする
const detailError = (lines: readonly string[]): ErrorExcerpt =>
  excerptDetail(NO_COMMAND, null, lines);

// git の失敗。コマンドの引数は定数だが、パスを渡す引数は名前を出さない (パスは外部の値)
function gitError(command: string, result: GitResult): ErrorExcerpt {
  return excerptLocalStderr(command, result.status, result.stderr, { tool: 'git' });
}

// 子のコマンドの失敗。inherit で stderr を受けていない子は、その旨の 1 行にする
function childError(failure: ChildFailure): ErrorExcerpt {
  return failure.captured
    ? excerptLocalStderr(failure.command, failure.status, failure.stderr, { tool: 'other' })
    : excerptDetail(failure.command, failure.status, [
        '(stderr was not captured; the output is shown above)',
      ]);
}

type FailedCheck = Extract<FrontCheck<unknown>, { ok: false }>;

const checkError = (check: FailedCheck): ErrorExcerpt =>
  check.failure === undefined ? detailError(check.errors) : childError(check.failure);

function stopOnCheck(
  s: FrontState,
  stage: FrontStage,
  reason: string,
  check: FailedCheck,
  recovery?: string
): ReleaseOutcome {
  return s.stop(stage, reason, checkError(check), recovery, check.failure?.rerun);
}

function stopOnErrors(
  s: FrontState,
  stage: FrontStage,
  reason: string,
  errors: readonly string[],
  recovery?: string
): ReleaseOutcome {
  return s.stop(stage, reason, detailError(errors), recovery);
}

function stopOnGit(
  s: FrontState,
  stage: FrontStage,
  reason: string,
  command: string,
  result: GitResult,
  recovery?: string
): ReleaseOutcome {
  return s.stop(stage, reason, gitError(command, result), recovery);
}

function stopDirty(
  s: FrontState,
  stage: FrontStage,
  reason: string,
  porcelain: GitResult
): ReleaseOutcome {
  const command = 'git status --porcelain';
  if (porcelain.status !== 0) return stopOnGit(s, stage, 'git status failed', command, porcelain);
  return s.stop(stage, reason, excerptDetail(command, 0, porcelain.stdout.split('\n')));
}

const SAME_VERSION_FAILED = 'the public packages do not have one version';

function trustStop(s: FrontState, result: Exclude<TrustResult, { kind: 'ok' }>): ReleaseOutcome {
  const npmError = (failure: TrustFailure): ErrorExcerpt =>
    excerptLocalStderr(failure.command, failure.status, failure.stderr, { tool: 'npm' });
  switch (result.kind) {
    case 'eotp': {
      const reason = 'the 2FA grace period expired or was not chosen';
      return s.stop(
        STAGE_1,
        reason,
        result.failure === undefined ? detailError([reason]) : npmError(result.failure)
      );
    }
    case 'command-failed':
      return s.stop(
        STAGE_1,
        'trust check failed',
        result.failure === undefined ? detailError([result.what]) : npmError(result.failure)
      );
    case 'shape-unknown': {
      const first = readPublicPackages(s.root, s.deps.git)[0]?.name ?? '<package>';
      return s.stop(STAGE_1, 'trust list output has an unexpected shape', {
        ...excerptDetail(`npm trust list ${first} --json`, null, [result.what]),
        ...(result.rawPath === undefined ? {} : { rawPath: result.rawPath }),
      });
    }
    case 'mismatch':
      return s.stop(
        STAGE_1,
        'trust does not match the expected single entry (read the 6 outputs above, then follow steps 3 / 3a of the one-time migration in docs/releasing.md)',
        detailError([result.what])
      );
  }
}

type TagState = { ok: true } | { ok: false; reason: string; error: ErrorExcerpt };

function tagState(git: ReleaseDeps['git'], name: string): TagState {
  const local = git(['rev-parse', '-q', '--verify', `refs/tags/${name}`]);
  if (local.status === 0) {
    return { ok: false, reason: 'the tag already exists locally', error: detailError([name]) };
  }
  const lsRemote = ['ls-remote', '--tags', 'origin', `refs/tags/${name}`];
  const remote = git(lsRemote);
  // 判定できないときは進まない (fail-closed)。原因 (認証、ネットワークなど) は error の欄に出る
  if (remote.status !== 0) {
    return {
      ok: false,
      reason: 'git ls-remote failed; cannot tell whether the tag exists on origin',
      error: gitError(`git ${lsRemote.join(' ')}`, remote),
    };
  }
  if (remote.stdout.trim() !== '') {
    return { ok: false, reason: 'the tag already exists on origin', error: detailError([name]) };
  }
  return { ok: true };
}

function stopOnTagState(
  s: FrontState,
  stage: FrontStage,
  state: Extract<TagState, { ok: false }>,
  recovery?: string
): ReleaseOutcome {
  return s.stop(stage, state.reason, state.error, recovery);
}

function checkGitState(s: FrontState): StageResult {
  const { git } = s.deps;
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch.stdout.trim() !== BRANCH) {
    return stopOnErrors(s, STAGE_1, `current branch is not ${BRANCH}`, [
      `current branch is "${branch.stdout.trim()}", expected ${BRANCH}`,
    ]);
  }
  const dirty = git(['status', '--porcelain']);
  if (dirty.status !== 0 || dirty.stdout.trim() !== '') {
    return stopDirty(s, STAGE_1, 'working tree is not clean', dirty);
  }
  const fetched = git(['fetch', 'origin']);
  if (fetched.status !== 0) {
    return stopOnGit(s, STAGE_1, 'git fetch origin failed', 'git fetch origin', fetched);
  }
  const head = git(['rev-parse', 'HEAD']).stdout.trim();
  const originHead = git(['rev-parse', `origin/${BRANCH}`]).stdout.trim();
  if (head === '' || head !== originHead) {
    const reason = `HEAD is not equal to origin/${BRANCH}`;
    return stopOnErrors(s, STAGE_1, reason, [reason]);
  }
  return undefined;
}

function checkTagOnlyState(s: FrontState): StageResult {
  const version = readVersion(s.root, s.deps.git);
  if (!version.ok) return stopOnErrors(s, STAGE_1, SAME_VERSION_FAILED, version.errors);
  s.tag = `v${version.value}`;
  const tagCheck = checkTag(s.tag, version.value);
  if (!tagCheck.ok) return stopOnErrors(s, STAGE_1, 'the tag is not v<version>', tagCheck.errors);
  const state = tagState(s.deps.git, s.tag);
  if (!state.ok) return stopOnTagState(s, STAGE_1, state);
  const lookup = s.deps.ghRelease(s.tag);
  if (lookup.kind === 'found') {
    return stopOnErrors(s, STAGE_1, 'a GitHub Release for the tag already exists', [s.tag]);
  }
  if (lookup.kind === 'error') {
    const command = `gh release view ${s.tag}`;
    return s.stop(
      STAGE_1,
      'gh release view failed',
      lookup.status === undefined
        ? excerptLocalStderr(command, null, lookup.message, { tool: 'gh' })
        : excerptLocalStderr(command, lookup.status, lookup.stderr ?? '', { tool: 'gh' })
    );
  }
  return undefined;
}

// changeset status の結果が止める理由と error。止めないなら undefined
function describeStatusStop(
  status: FrontCheck<ChangesetStatus>
): { reason: string; error: ErrorExcerpt } | undefined {
  if (!status.ok) return { reason: 'changeset status failed', error: checkError(status) };
  if (status.value.kind === 'none') {
    const reason = 'no pending changeset';
    return { reason, error: detailError([reason]) };
  }
  if (status.value.kind === 'inconsistent') {
    return {
      reason: 'changeset status is inconsistent',
      error: detailError([status.value.reason]),
    };
  }
  return undefined;
}

async function checkPlannedVersion(s: FrontState): Promise<StageResult> {
  const { flags, deps } = s;
  const pre = readPreState(s.root);
  if (!pre.ok) return stopOnErrors(s, STAGE_1, '.changeset/pre.json could not be read', pre.errors);
  if (flags.mode === 'exit-pre' && pre.value.mode !== 'pre') {
    const reason = '--exit-pre needs pre mode, but .changeset/pre.json is not in pre mode';
    return stopOnErrors(s, STAGE_1, reason, [reason]);
  }
  if (flags.mode !== 'normal') return undefined;
  const status = await deps.changesetStatus();
  const stopped = describeStatusStop(status);
  if (stopped !== undefined) return s.stop(STAGE_1, stopped.reason, stopped.error);
  return undefined;
}

async function checkPrerequisites(s: FrontState): Promise<StageResult> {
  const git = checkGitState(s);
  if (git) return git;
  if (s.flags.mode === 'tag-only') {
    const tagOnly = checkTagOnlyState(s);
    if (tagOnly) return tagOnly;
  }
  const trust = await s.deps.verifyTrust();
  if (trust.kind !== 'ok') return trustStop(s, trust);
  const planned = await checkPlannedVersion(s);
  if (planned) return planned;
  const verified = await s.deps.verify();
  if (!verified.ok) return stopOnCheck(s, STAGE_1, 'pnpm verify failed', verified);
  // verify が作業ツリーを汚すと、段 2 の許可リストの停止に化けるので、ここで止める
  const dirty = s.deps.git(['status', '--porcelain']);
  if (dirty.status !== 0 || dirty.stdout.trim() !== '') {
    return stopDirty(s, STAGE_1, 'pnpm verify left the working tree dirty', dirty);
  }
  return undefined;
}

function planPreCommands(before: PreState, tag: string): string[][] {
  if (before.mode === 'none') return [['enter', tag]];
  return before.tag === tag ? [] : [['exit'], ['enter', tag]];
}

async function changePreMode(s: FrontState): Promise<StageResult> {
  const { flags, deps } = s;
  if (flags.mode !== 'pre' && flags.mode !== 'exit-pre') return undefined;
  const before = readPreState(s.root);
  if (!before.ok) {
    return stopOnErrors(
      s,
      STAGE_2,
      '.changeset/pre.json could not be read',
      before.errors,
      REVERT_VERSIONING
    );
  }
  const commands =
    flags.mode === 'exit-pre' ? [['exit']] : planPreCommands(before.value, flags.tag);
  for (const args of commands) {
    const changed = await deps.changesetPre(args);
    if (!changed.ok) {
      return stopOnCheck(s, STAGE_2, 'changeset pre failed', changed, REVERT_VERSIONING);
    }
  }
  // mode を変えると出す版が変わるので、status で決め直す
  const status = await deps.changesetStatus();
  const stopped = describeStatusStop(status);
  if (stopped !== undefined) {
    return s.stop(STAGE_2, stopped.reason, stopped.error, REVERT_VERSIONING);
  }
  return undefined;
}

function restoreIgnoredPackages(s: FrontState): StageResult {
  const { git, log } = s.deps;
  const config = readJsonFile(join(s.root, '.changeset', 'config.json'));
  if (!config.ok) {
    return stopOnErrors(
      s,
      STAGE_2,
      '.changeset/config.json could not be read',
      config.errors,
      REVERT_VERSIONING
    );
  }
  const dirs = ignoredPackageDirs(config.value, readWorkspacePackages(s.root, git));
  if (!dirs.ok) {
    return stopOnErrors(
      s,
      STAGE_2,
      'the changeset ignore list could not be resolved',
      dirs.errors,
      REVERT_VERSIONING
    );
  }
  if (dirs.value.length === 0) return undefined;
  const porcelain = git(PORCELAIN);
  if (porcelain.status !== 0) {
    return stopOnGit(
      s,
      STAGE_2,
      'git status failed',
      `git ${PORCELAIN.join(' ')}`,
      porcelain,
      REVERT_VERSIONING
    );
  }
  const plan = planIgnoredRestore(porcelain.stdout, dirs.value);
  if (plan.checkout.length > 0) {
    const restored = git(['checkout', '--', ...plan.checkout.map(literal)]);
    if (restored.status !== 0) {
      // パスは外部の値なので、コマンドの欄には出さない
      return stopOnGit(
        s,
        STAGE_2,
        'git checkout failed',
        'git checkout --',
        restored,
        REVERT_VERSIONING
      );
    }
  }
  for (const path of plan.remove) {
    const absolute = resolve(s.root, path);
    // git clean は使わず、未追跡の新規ファイルを 1 つずつ消す
    if (!absolute.startsWith(`${resolve(s.root)}${sep}`)) {
      return stopOnErrors(
        s,
        STAGE_2,
        'refusing to remove a path outside the repository',
        [path],
        REVERT_VERSIONING
      );
    }
    rmSync(absolute, { force: true });
  }
  for (const path of plan.checkout) log(`restored ${path} (ignored by changesets)`);
  for (const path of plan.remove) log(`removed ${path} (ignored by changesets)`);
  return undefined;
}

function fillChangelogs(s: FrontState, version: string): void {
  for (const pkg of readPublicPackages(s.root, s.deps.git)) {
    const file = join(s.root, pkg.dir, 'CHANGELOG.md');
    if (!existsSync(file)) continue;
    const filled = fillEmptyChangelogSection(readFileSync(file, 'utf8'), version);
    if (!filled.filled) continue;
    writeFileSync(file, filled.text);
    s.deps.log(`filled the empty CHANGELOG section of ${pkg.name}`);
  }
}

type AllowedChanges =
  | { ok: true; value: string[] }
  | { ok: false; reason: string; error: ErrorExcerpt };

function checkAllowedChanges(s: FrontState): AllowedChanges {
  const porcelain = s.deps.git(PORCELAIN);
  if (porcelain.status !== 0) {
    return {
      ok: false,
      reason: 'git status failed',
      error: gitError(`git ${PORCELAIN.join(' ')}`, porcelain),
    };
  }
  const dirs = readPublicPackages(s.root, s.deps.git).map((p) => p.dir);
  const checked = checkVersionedChanges(porcelain.stdout, dirs);
  if (checked.ok) return checked;
  return {
    ok: false,
    reason: 'unexpected changes after versioning',
    error: detailError(checked.errors),
  };
}

async function versionStage(s: FrontState): Promise<StageResult> {
  const { deps } = s;
  const stopAllowed = (failed: Extract<AllowedChanges, { ok: false }>): ReleaseOutcome =>
    s.stop(STAGE_2, failed.reason, failed.error, REVERT_VERSIONING);
  const moded = await changePreMode(s);
  if (moded) return moded;
  const versioned = await deps.changesetVersion();
  if (!versioned.ok) {
    return stopOnCheck(s, STAGE_2, 'changeset version failed', versioned, REVERT_VERSIONING);
  }
  const version = readVersion(s.root, deps.git);
  if (!version.ok) {
    return stopOnErrors(s, STAGE_2, SAME_VERSION_FAILED, version.errors, REVERT_VERSIONING);
  }
  const restored = restoreIgnoredPackages(s);
  if (restored) return restored;
  fillChangelogs(s, version.value);
  const before = checkAllowedChanges(s);
  if (!before.ok) return stopAllowed(before);
  const formatted = await deps.prettier(before.value.filter((p) => existsSync(join(s.root, p))));
  if (!formatted.ok) {
    return stopOnCheck(s, STAGE_2, 'prettier failed', formatted, REVERT_VERSIONING);
  }
  // prettier や他のプロセスが、検査の後に別の変更を足していないかをもう一度確かめる
  const after = checkAllowedChanges(s);
  if (!after.ok) return stopAllowed(after);
  s.allowed = after.value;
  s.tag = `v${version.value}`;
  return undefined;
}

function record(s: FrontState, recovery: string | undefined): StageResult {
  const { git } = s.deps;
  if (s.flags.mode !== 'tag-only') {
    if (s.allowed.length === 0) {
      return stopOnErrors(s, STAGE_6, 'nothing to commit', ['nothing to commit'], recovery);
    }
    const added = git(['add', '--', ...s.allowed.map(literal)]);
    if (added.status !== 0) {
      return stopOnGit(s, STAGE_6, 'git add failed', 'git add --', added, recovery);
    }
    const message = `chore: release ${s.tag}`;
    const commit = git(['commit', '-m', message]);
    if (commit.status !== 0) {
      return stopOnGit(
        s,
        STAGE_6,
        'git commit failed',
        `git commit -m ${message}`,
        commit,
        recovery
      );
    }
  }
  const tagged = git(['tag', '-a', s.tag, '-m', s.tag]);
  if (tagged.status !== 0) {
    return stopOnGit(
      s,
      STAGE_6,
      'git tag failed',
      `git tag -a ${s.tag} -m ${s.tag}`,
      tagged,
      s.flags.mode === 'tag-only' ? undefined : `git reset --hard origin/${BRANCH}`
    );
  }
  return undefined;
}

export async function runRelease(flags: ReleaseFlags, deps: ReleaseDeps): Promise<ReleaseOutcome> {
  const { git, log } = deps;
  const tagOnly = flags.mode === 'tag-only';
  const stop: FrontState['stop'] = (stage, reason, error, recovery, rerun) => ({
    status: 'stopped',
    stop: {
      stage,
      reason,
      error,
      ...(recovery === undefined ? {} : { recovery }),
      ...(rerun === undefined ? {} : { rerun }),
    },
  });
  const topLevel = git(['rev-parse', '--show-toplevel']);
  if (topLevel.status !== 0) {
    return stop(
      STAGE_1,
      'not inside a git repository',
      gitError('git rev-parse --show-toplevel', topLevel)
    );
  }
  const s: FrontState = { flags, deps, root: topLevel.stdout.trim(), tag: '', allowed: [], stop };

  // 段 1: 前提。何も変えない
  const prerequisites = await checkPrerequisites(s);
  if (prerequisites) return prerequisites;

  // 段 2: 版上げ (--tag-only は飛ばす)
  if (!tagOnly) {
    const versioned = await versionStage(s);
    if (versioned) return versioned;
  }
  const recovery = tagOnly ? undefined : REVERT_VERSIONING;

  // 段 3: 公開前提
  const checked = await deps.checkRelease(s.tag);
  if (!checked.ok) return stopOnCheck(s, STAGE_3, 'check-release failed', checked, recovery);
  if (!tagOnly) {
    const state = tagState(git, s.tag);
    if (!state.ok) return stopOnTagState(s, STAGE_3, state, recovery);
  }

  // 段 4: 利用者テスト (新しい版の tarball で)
  const consumed = await deps.consumer();
  if (!consumed.ok) return stopOnCheck(s, STAGE_4, 'consumer test failed', consumed, recovery);

  // 段 5: 確認
  const files = git(['status', '--short']).stdout.trim();
  const question = tagOnly
    ? `Tag HEAD as ${s.tag} and push the tag?`
    : `Release ${s.tag}?\n${files}\nCommit, tag and push to origin/${BRANCH}?`;
  if (!(await deps.confirm(question))) {
    return stopOnErrors(s, STAGE_5, 'declined', ['declined'], recovery);
  }

  // 段 6: 記録
  const recorded = record(s, recovery);
  if (recorded) return recorded;

  // 段 7: 送信。--atomic で、拒否されたら origin は変わらない。force は使わない
  const pushArgs = tagOnly
    ? ['push', 'origin', `refs/tags/${s.tag}`]
    : ['push', '--atomic', 'origin', BRANCH, `refs/tags/${s.tag}`];
  const pushed = git(pushArgs);
  if (pushed.status !== 0) {
    const undo = tagOnly
      ? `git tag -d ${s.tag}`
      : `git tag -d ${s.tag} && git reset --hard origin/${BRANCH}`;
    return stopOnGit(
      s,
      STAGE_7,
      'git push was rejected or failed',
      `git ${pushArgs.join(' ')}`,
      pushed,
      undo
    );
  }
  log(`pushed ${s.tag}`);
  return tagOnly ? { status: 'tag-pushed', tag: s.tag } : { status: 'released', tag: s.tag };
}

// --- Outcome の表示と exit code ---

function assertNever(value: never): never {
  throw new Error(`unhandled outcome: ${JSON.stringify(value)}`);
}

function describeStop(stop: ClassifiedStop): string[] {
  return [
    `[${stop.route}] ${stop.reason}`,
    `next: ${stop.next}`,
    `see docs/releasing.md: ${stop.section}`,
    ...(stop.mayBeF3 ? ['note: this may be an F3 situation (some packages are published)'] : []),
  ];
}

function leadRemedies(lead: readonly string[], rest: NonEmpty<string>): NonEmpty<string> {
  const [first, ...others] = lead;
  return first === undefined ? rest : [first, ...others, ...rest];
}

// 前半の停止の表示。復元のコマンドと、失敗した段だけを流し直すコマンドが try: の先頭に並ぶ
function frontReport(stop: FrontStop): StopReport {
  const causes = diagnose({ side: 'front', where: stop.stage }, stop.error);
  const lead = [
    ...(stop.recovery === undefined ? [] : [`to undo: ${stop.recovery}`]),
    ...(stop.rerun === undefined
      ? []
      : [`run ${stop.rerun} to see only the output of the failed step`]),
  ];
  return {
    headline: `release stopped at ${stop.stage}: ${stop.reason}`,
    error: stop.error,
    causes,
    remedies: leadRemedies(lead, remediesFor(causes)),
    notes: [],
  };
}

export function reportOutcome(outcome: Outcome, output: Output): number {
  switch (outcome.kind) {
    case 'entry-stopped':
      output.emit(`release stopped: ${outcome.reason}`);
      return 1;
    case 'front-stopped':
      for (const line of formatStopReport(frontReport(outcome.stop))) output.emit(line);
      return 1;
    case 'after-push-stopped':
      for (const line of describeStop(outcome.stop)) output.emit(line);
      output.emit(
        'Rerun the same command to continue from where it stopped, unless the next step says otherwise.'
      );
      return 1;
    case 'declined':
      output.emit('declined; rerun the same command to come back to the same place');
      return 0;
    case 'post-check-failed':
      for (const stop of outcome.stops) for (const line of describeStop(stop)) output.emit(line);
      return 1;
    case 'completed':
      output.emit('release completed');
      return 0;
    default:
      return assertNever(outcome);
  }
}

// --- main (入口の観測と判定、前半の呼び出し) ---

export interface MainDeps {
  streams: { stdinIsTTY: boolean | undefined; stdoutIsTTY: boolean | undefined };
  output: Output;
  git: ReleaseDeps['git'];
  run: Runner;
  release: ReleaseDeps;
  runFront: (flags: ReleaseFlags, deps: ReleaseDeps) => Promise<ReleaseOutcome>;
  // 後半 (段 8〜11)。実体は runAfterPush に実 deps を渡したもの
  afterPush: (input: AfterPushInput) => Promise<AfterPushResult>;
  // 後半に入る直前に 1 回だけ呼ぶ (前半の spawnSync 中の Ctrl-C は子と一緒に止まる)
  installInterruptHandler: () => void;
}

async function checkTooling(run: Runner): Promise<string | undefined> {
  // 前半と後半の両方に効くよう、入口の観測の前に 1 回。引数は固定せず (raw)、設定の実効値を読む
  const [npmVersion, ghVersion, registry, scoped] = await Promise.all([
    run('npm', ['--version'], { stdio: 'pipe', raw: true }),
    run('gh', ['--version'], { stdio: 'pipe', raw: true }),
    run('npm', ['config', 'get', 'registry'], { stdio: 'pipe', raw: true }),
    run('npm', ['config', 'get', '@kanbun-skam:registry'], { stdio: 'pipe', raw: true }),
  ]);
  for (const [label, result] of [
    ['npm --version', npmVersion],
    ['gh --version', ghVersion],
    ['npm config get registry', registry],
    ['npm config get @kanbun-skam:registry', scoped],
  ] as const) {
    if (result.status !== 0) return `${label} failed: ${result.stderr.trim()}`;
  }
  const npm = parseToolVersion(npmVersion.stdout, 'npm');
  const gh = parseToolVersion(ghVersion.stdout, 'gh');
  if (!npm.ok) return errorText(npm);
  if (!gh.ok) return errorText(gh);
  const versions = checkToolVersions(npm.value, gh.value);
  if (!versions.ok) return errorText(versions);
  const config = checkNpmRegistryConfig(registry.stdout, scoped.stdout);
  return config.ok ? undefined : errorText(config);
}

const VERSION_FOR_REFS = /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;

function parseOriginTag(ls: GitResult, tag: string): EntryObservation['originTag'] {
  if (ls.status !== 0) return { kind: 'error' };
  let commit: string | undefined;
  for (const line of ls.stdout.split('\n').filter(Boolean)) {
    const [sha, ref] = line.split('\t');
    if (sha === undefined || ref === undefined) continue;
    // annotated tag は ^{} の行が commit、lightweight は tag 本体の行が commit
    if (ref === `refs/tags/${tag}^{}`) return { kind: 'present', commit: sha };
    if (ref === `refs/tags/${tag}`) commit = sha;
  }
  return commit === undefined ? { kind: 'absent' } : { kind: 'present', commit };
}

async function observeEntry(
  deps: MainDeps,
  flags: ReleaseFlags,
  root: string
): Promise<EntryObservation | { error: string }> {
  const { git, run } = deps;
  const head = git(['rev-parse', 'HEAD']).stdout.trim();
  const versions = readVersion(root, git);
  const pre = readPreState(root);
  if (!pre.ok) return { error: errorText(pre) };
  const base = {
    flags,
    head,
    versions,
    preMode: pre.value.mode === 'pre',
  };
  if (!versions.ok || !VERSION_FOR_REFS.test(versions.value)) {
    // 版が決まらなければ decideEntry が行 0 で止める。tag と公開の観測は意味がない
    return {
      ...base,
      originTag: { kind: 'absent' },
      localTagCommit: undefined,
      published: { kind: 'counts', published: 0, total: 0 },
    };
  }
  const version = versions.value;
  const tag = `v${version}`;
  const originTag = parseOriginTag(
    git(['ls-remote', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`]),
    tag
  );
  const local = git(['rev-parse', '-q', '--verify', `refs/tags/${tag}^{commit}`]);
  const names = readPublicPackages(root, git).map((p) => p.name);
  const views = await Promise.all(
    names.map(async (name) =>
      parseNpmViewVersions(await run('npm', npmViewVersionsArgs(name), { stdio: 'pipe' }))
    )
  );
  const failed = views.some((v) => v.kind === 'error');
  const published = views.filter((v) => v.kind === 'found' && v.versions.includes(version)).length;
  return {
    ...base,
    originTag,
    localTagCommit: local.status === 0 ? local.stdout.trim() : undefined,
    published: failed ? { kind: 'error' } : { kind: 'counts', published, total: names.length },
  };
}

// 後半の入力。tag の commit は origin から読む (前半から続けて入るときも、再開で入るときも同じ)
function prepareAfterPush(deps: MainDeps, root: string, checkOnly: boolean): Check<AfterPushInput> {
  const { git } = deps;
  const version = readVersion(root, git);
  if (!version.ok) return version;
  const tag = `v${version.value}`;
  const originTag = parseOriginTag(
    git(['ls-remote', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`]),
    tag
  );
  if (originTag.kind !== 'present') {
    return { ok: false, errors: [`tag ${tag} was not found on origin`] };
  }
  const ordered = orderByDependencies(readPublicPackages(root, git));
  if (!ordered.ok) return ordered;
  return {
    ok: true,
    value: {
      tag,
      tagCommit: originTag.commit,
      version: version.value,
      names: ordered.value.map((p) => p.name),
      checkOnly,
    },
  };
}

async function enterAfterPush(deps: MainDeps, root: string, checkOnly: boolean): Promise<Outcome> {
  const input = prepareAfterPush(deps, root, checkOnly);
  if (!input.ok) return { kind: 'entry-stopped', reason: errorText(input) };
  deps.installInterruptHandler();
  const result = await deps.afterPush(input.value);
  return result.kind === 'stopped' ? { kind: 'after-push-stopped', stop: result.stop } : result;
}

async function runEntry(argv: readonly string[], deps: MainDeps): Promise<Outcome> {
  const flags = parseReleaseFlags(argv);
  if (!flags.ok) return { kind: 'entry-stopped', reason: errorText(flags) };
  if (!isInteractiveStreams(deps.streams)) {
    return {
      kind: 'entry-stopped',
      reason: 'stdin and stdout must both be a terminal (the approve steps ask for 2FA)',
    };
  }
  const tooling = await checkTooling(deps.run);
  if (tooling !== undefined) return { kind: 'entry-stopped', reason: tooling };

  const topLevel = deps.git(['rev-parse', '--show-toplevel']);
  if (topLevel.status !== 0)
    return { kind: 'entry-stopped', reason: 'not inside a git repository' };
  const root = topLevel.stdout.trim();
  const observed = await observeEntry(deps, flags.value, root);
  if ('error' in observed) return { kind: 'entry-stopped', reason: observed.error };

  let decision = decideEntry(observed);
  if (decision.kind === 'need-status') {
    decision = decideEntryWithStatus(observed, await deps.release.changesetStatus());
  }
  switch (decision.kind) {
    case 'stop':
      return { kind: 'entry-stopped', reason: decision.reason };
    case 'front': {
      const front = await deps.runFront(decision.mode, deps.release);
      if (front.status === 'stopped') return { kind: 'front-stopped', stop: front.stop };
      return enterAfterPush(deps, root, false);
    }
    case 'after-push':
    case 'after-push-check-only': {
      const dirty = deps.git(['status', '--porcelain']);
      if (dirty.status !== 0 || dirty.stdout.trim() !== '') {
        return { kind: 'entry-stopped', reason: 'working tree is not clean' };
      }
      return enterAfterPush(deps, root, decision.kind === 'after-push-check-only');
    }
  }
}

// 最上位で例外を捕まえて、メッセージを出して exit 1 にする
export async function runMain(argv: readonly string[], deps: MainDeps): Promise<number> {
  try {
    return reportOutcome(await runEntry(argv, deps), deps.output);
  } catch (error) {
    deps.output.emit(`release failed: ${errorMessage(error)}`);
    return 1;
  }
}

// --- 後半の実 adapter (fs は注入。テストは本物の node:fs を os.tmpdir() の下の新しい dir だけで使う) ---

export interface FsApi {
  mkdtempSync(prefix: string): string;
  realpathSync(path: string): string;
  rmSync(path: string, options: { recursive: boolean }): void;
  lstatSync(path: string): {
    size: number;
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
  };
  readdirSync(path: string): string[];
  readFileSync(path: string): Buffer;
  mkdirSync(path: string, options?: { recursive: boolean }): void;
  writeFileSync(path: string, data: string): void;
}

export const nodeFsApi: FsApi = {
  mkdtempSync: (prefix) => mkdtempSync(prefix),
  realpathSync: (path) => realpathSync(path),
  rmSync: (path, options) => rmSync(path, options),
  lstatSync: (path) => lstatSync(path),
  readdirSync: (path) => readdirSync(path),
  readFileSync: (path) => readFileSync(path),
  mkdirSync: (path, options) => {
    mkdirSync(path, options);
  },
  writeFileSync: (path, data) => writeFileSync(path, data),
};

const TEMP_DIR_PREFIX = 'kanbun-release-';

export type TempFs = Pick<AfterPushDeps, 'mkTemp' | 'removeTemp' | 'listDir' | 'readFile'>;

// 一時ディレクトリは tmpRoot の realpath の直下に作る。消すのは、この関数が作ったものだけ
export function createTempFs(fsApi: FsApi, tmpRoot: string, output: Output): TempFs {
  const realTmpRoot = fsApi.realpathSync(tmpRoot);
  const created = new Set<string>();
  return {
    mkTemp: () => {
      const dir = fsApi.mkdtempSync(join(realTmpRoot, TEMP_DIR_PREFIX));
      created.add(dir);
      return dir;
    },
    removeTemp: (path) => {
      if (!isSafeTempPath(path, created, realTmpRoot)) {
        output.emit(`refusing to remove ${path}: not a temporary directory made by this run`);
        return;
      }
      fsApi.rmSync(path, { recursive: true });
    },
    listDir: (path) =>
      fsApi.readdirSync(path).map((name) => {
        const stat = fsApi.lstatSync(join(path, name));
        const kind = stat.isSymbolicLink()
          ? 'symlink'
          : stat.isDirectory()
            ? 'dir'
            : stat.isFile()
              ? 'file'
              : 'other';
        return { name, kind, size: stat.size };
      }),
    readFile: (path, maxBytes) => {
      const stat = fsApi.lstatSync(path);
      if (!stat.isFile()) throw new Error(`${path} is not a regular file`);
      if (stat.size > maxBytes) throw new Error(`${path} is larger than ${maxBytes} bytes`);
      const bytes = fsApi.readFileSync(path);
      // lstat の後に伸びていても、上限を超えたものは返さない
      if (bytes.length > maxBytes) throw new Error(`${path} is larger than ${maxBytes} bytes`);
      return bytes;
    },
  };
}

const EVIDENCE_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

function makeEvidenceDir(fsApi: FsApi, parent: string, stamp: string): string {
  fsApi.mkdirSync(parent, { recursive: true });
  // 同じ時刻の 2 つの実行が同じ dir を使わない (前の証拠を上書きしない)
  for (let n = 0; n < 100; n += 1) {
    const dir = join(parent, n === 0 ? stamp : `${stamp}-${n}`);
    try {
      fsApi.mkdirSync(dir);
      return dir;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  throw new Error(`could not create a new evidence directory under ${parent}`);
}

// 1 回の実行は 1 つの dir (.tmp/release/v<V>/<ISO 時刻>/) に書く。名前は path の区切りを含められない
export function createEvidenceStore(
  fsApi: FsApi,
  repoRoot: string,
  version: string,
  now: () => Date
): (name: string, content: string) => string {
  let dir: string | undefined;
  return (name, content) => {
    if (!VERSION_FOR_REFS.test(version))
      throw new Error(`invalid version ${JSON.stringify(version)}`);
    if (!EVIDENCE_NAME_PATTERN.test(name) || /^\.+$/.test(name)) {
      throw new Error(`invalid evidence file name ${JSON.stringify(name)}`);
    }
    dir ??= makeEvidenceDir(
      fsApi,
      join(repoRoot, '.tmp', 'release', `v${version}`),
      now().toISOString().replace(/[:.]/g, '-')
    );
    fsApi.writeFileSync(join(dir, name), content);
    return dir;
  };
}

// 1 回目の SIGINT はフラグを立てるだけ (待機と再試行の境界で見る)。2 回目は即座に終わる
export function createInterruptState(
  register: (handler: () => void) => void,
  exit: (code: number) => void,
  notify: (message: string) => void = () => {}
): { install(): void; interrupted(): boolean } {
  let raised = false;
  let installed = false;
  return {
    install: () => {
      if (installed) return;
      installed = true;
      register(() => {
        if (raised) {
          exit(1);
          return;
        }
        raised = true;
        notify(
          'interrupt received; stopping at the next safe point (press Ctrl-C again to quit now)'
        );
      });
    },
    interrupted: () => raised,
  };
}

// 待機は 250ms ごとに interrupted() を見る (Ctrl-C が 30 秒の待機の後まで効かないことのないように)
async function interruptibleSleep(ms: number, interrupted: () => boolean): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end && !interrupted()) {
    await new Promise<void>((done) =>
      setTimeout(done, Math.min(250, Math.max(0, end - Date.now())))
    );
  }
}

export interface AfterPushBuildOptions {
  cwd: string;
  version: string;
  output: Output;
  run: Runner;
  confirm: (question: string) => Promise<boolean>;
  verifyTrust: () => Promise<TrustResult>;
  interrupted: () => boolean;
  fsApi?: FsApi;
  tmpRoot?: string;
  now?: () => Date;
}

export function buildAfterPushDeps(options: AfterPushBuildOptions): AfterPushDeps {
  const fsApi = options.fsApi ?? nodeFsApi;
  const temp = createTempFs(fsApi, options.tmpRoot ?? tmpdir(), options.output);
  return {
    run: options.run,
    output: options.output,
    sleep: (ms) => interruptibleSleep(ms, options.interrupted),
    now: () => Date.now(),
    interrupted: options.interrupted,
    confirm: options.confirm,
    verifyTrust: options.verifyTrust,
    ...temp,
    saveEvidence: createEvidenceStore(
      fsApi,
      options.cwd,
      options.version,
      options.now ?? (() => new Date())
    ),
  };
}

// --- 実 adapter ---

export type SpawnSyncFn = (
  cmd: string,
  args: string[],
  options: {
    cwd: string;
    env: Record<string, string>;
    encoding: 'utf8';
    stdio: 'inherit' | 'pipe';
  }
) => { status: number | null; stdout?: string | null; stderr?: string | null };

const nodeSpawnSync: SpawnSyncFn = (cmd, args, options) => spawnSync(cmd, args, options);

// 前半の子ごとの stdio。崩れた子を inherit に戻すのは、その子の行 1 か所の変更で済む。
// verify のキーは 1 つで、段ごとに流すときも全段に同じ stdio を使う
type FrontChild =
  | 'changesetStatus'
  | 'changesetPre'
  | 'verify'
  | 'changesetVersion'
  | 'prettier'
  | 'checkRelease'
  | 'consumer';

const FRONT_CHILD_STDIO: Readonly<Record<FrontChild, RunStdio>> = {
  changesetStatus: 'inherit',
  changesetPre: 'inherit',
  verify: 'inherit',
  changesetVersion: 'inherit',
  prettier: 'inherit',
  checkRelease: 'inherit',
  consumer: 'inherit',
};

// リポジトリの package.json の scripts.verify を、流す時点で読む。読めない、JSON でない、
// scripts が object でないときは、丸ごと流す側に倒す
function readVerifyPlan(root: string): VerifyPlan {
  try {
    const json: unknown = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const scripts =
      typeof json === 'object' && json !== null
        ? (json as Record<string, unknown>)['scripts']
        : undefined;
    if (typeof scripts !== 'object' || scripts === null || Array.isArray(scripts)) {
      return { kind: 'whole' };
    }
    const body = (scripts as Record<string, unknown>)['verify'];
    return planVerifySteps(typeof body === 'string' ? body : undefined, Object.keys(scripts));
  } catch {
    return { kind: 'whole' };
  }
}

export interface BuildOptions {
  cwd: string;
  output: Output;
  env?: Readonly<Record<string, string | undefined>>;
  spawnSync?: SpawnSyncFn;
  // 'pipe' なら、前半の子の stdio の表 (FRONT_CHILD_STDIO) を上書きして全部を集める。テストが使う
  stdio?: 'inherit' | 'pipe';
  // changeset を呼ぶコマンド。テストは fixture の repo の node_modules/.bin/changeset を絶対パスで指す
  changesetCmd?: readonly string[];
  run?: Runner;
  confirm?: (question: string) => Promise<boolean>;
}

export function buildReleaseDeps(
  options: BuildOptions,
  overrides: Partial<ReleaseDeps> = {}
): ReleaseDeps {
  const { cwd, output } = options;
  const sync = options.spawnSync ?? nodeSpawnSync;
  const env = (): Record<string, string> => childEnv(options.env ?? process.env);
  const changeset = options.changesetCmd ?? ['pnpm', 'changeset'];
  const run = options.run ?? createRunner(nodeSpawn, output, { env: options.env ?? process.env });

  // 前半の子は run (createRunner) で実行する。cwd はリポジトリの root、環境変数は run が childEnv を通す。
  // 失敗には子の結果 (コマンド、exit code、受けた stderr) を載せる。停止の表示はそれを使う
  const runChild = async (
    child: FrontChild,
    cmd: string,
    args: string[],
    rerun?: string
  ): Promise<FrontCheck<void>> => {
    const stdio = options.stdio === 'pipe' ? 'pipe' : FRONT_CHILD_STDIO[child];
    const result = await run(cmd, args, { stdio, cwd });
    if (result.status === 0) return { ok: true, value: undefined };
    const command = [cmd, ...args].join(' ');
    const captured = stdio !== 'inherit';
    return {
      ok: false,
      errors: [`${command} exited with ${result.status ?? 'a signal'}`],
      failure: {
        command,
        status: result.status,
        stderr: captured ? result.stderr : '',
        captured,
        ...(rerun === undefined ? {} : { rerun }),
      },
    };
  };
  const git: ReleaseDeps['git'] = (args) => {
    const r = sync('git', args, { cwd, env: env(), encoding: 'utf8', stdio: 'pipe' });
    return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  };
  const ghRelease: ReleaseDeps['ghRelease'] = (tag) => {
    const r = sync('gh', buildGhArgs(['release', 'view', tag]), {
      cwd,
      env: env(),
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return parseGhReleaseView(r.status, r.stderr ?? '');
  };

  const checkReleaseScript = new URL('./check-release.ts', import.meta.url).pathname;
  const [changesetBin = 'pnpm', ...changesetRest] = changeset;
  const publicNames = (): string[] => readPublicPackages(cwd, git).map((p) => p.name);
  const saveRaw: SaveRaw = (files) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = join(cwd, '.tmp', 'release', `trust-${stamp}`);
    mkdirSync(dir, { recursive: true });
    for (const file of files) {
      writeFileSync(join(dir, `${file.name.replace(/[^0-9A-Za-z._-]/g, '_')}.json`), file.content);
    }
    return dir;
  };

  const deps: ReleaseDeps = {
    git,
    verifyTrust: () => verifyTrustWith(run, saveRaw, output, publicNames()),
    changesetStatus: async () => {
      mkdirSync(join(cwd, '.tmp', 'release'), { recursive: true });
      // --output は repo root からの相対で解釈される
      const rel = `.tmp/release/status-${process.pid}.json`;
      const file = join(cwd, rel);
      try {
        const ran = await runChild('changesetStatus', changesetBin, [
          ...changesetRest,
          'status',
          `--output=${rel}`,
        ]);
        if (!ran.ok) return ran;
        const json: unknown = JSON.parse(readFileSync(file, 'utf8'));
        return parseChangesetStatus(json, publicNames());
      } catch (error) {
        return { ok: false, errors: [`changeset status output: ${errorMessage(error)}`] };
      } finally {
        rmSync(file, { force: true });
      }
    },
    changesetPre: (args) =>
      runChild('changesetPre', changesetBin, [...changesetRest, 'pre', ...args]),
    verify: async () => {
      const plan = readVerifyPlan(cwd);
      if (plan.kind === 'whole') return runChild('verify', 'pnpm', ['verify']);
      // 段ごとに流す。失敗した段で止まり、その段だけを流し直すコマンドを rerun に載せる
      for (const name of plan.names) {
        const step = await runChild('verify', 'pnpm', [name], `pnpm ${name}`);
        if (!step.ok) return step;
      }
      return { ok: true, value: undefined };
    },
    changesetVersion: () =>
      runChild('changesetVersion', changesetBin, [...changesetRest, 'version']),
    prettier: async (files) =>
      files.length === 0
        ? { ok: true, value: undefined }
        : runChild('prettier', 'pnpm', ['exec', 'prettier', '--write', ...files]),
    checkRelease: (tag) =>
      runChild('checkRelease', process.execPath, [
        checkReleaseScript,
        'check',
        '--tag',
        tag,
        '--registry',
      ]),
    consumer: () => runChild('consumer', 'pnpm', ['test:consumer']),
    ghRelease,
    confirm:
      options.confirm ??
      (() => {
        throw new Error('confirm is not available');
      }),
    log: (line) => output.emit(line),
  };
  return { ...deps, ...overrides };
}

async function main(argv: string[]): Promise<number> {
  const output = createOutput((text) => process.stdout.write(text));
  const run = createRunner(nodeSpawn, output);
  const confirm = createConfirm(createInterface, output);
  const cwd = process.cwd();
  const release = buildReleaseDeps({ cwd, output, run, confirm });
  const interrupt = createInterruptState(
    (handler) => process.on('SIGINT', handler),
    (code) => process.exit(code),
    (message) => output.emit(message)
  );
  process.on('unhandledRejection', (reason) => {
    output.emit(`release failed: ${errorMessage(reason)}`);
    process.exitCode = 1;
  });
  return runMain(argv, {
    streams: { stdinIsTTY: process.stdin.isTTY, stdoutIsTTY: process.stdout.isTTY },
    output,
    git: release.git,
    run,
    release,
    runFront: runRelease,
    afterPush: (input) =>
      runAfterPush(
        input,
        buildAfterPushDeps({
          cwd,
          version: input.version,
          output,
          run,
          confirm,
          verifyTrust: release.verifyTrust,
          interrupted: interrupt.interrupted,
        })
      ),
    installInterruptHandler: interrupt.install,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main(process.argv.slice(2));
}
