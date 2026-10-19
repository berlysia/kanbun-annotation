// リリース前提の検査の純粋関数。ファイル・ネットワーク・子プロセスには触れない
// (読み込みと実行は check-release.ts と release.ts が行い、結果をここへ渡す)。

import { StringDecoder } from 'node:string_decoder';
import type {
  Check,
  CommandResult,
  DistTag,
  EntryStopRow,
  NonEmpty,
  RegistryResponse,
  ReleaseLookup,
  ReleaseManifest,
  TrustResult,
  WorkspacePackage,
} from './release-types.ts';

// 型の定義は release-types.ts にある。既存の import 元を変えないために同じ名前で再公開する
export type {
  Check,
  DistTag,
  GitResult,
  RegistryResponse,
  ReleaseLookup,
  ReleaseManifest,
  TrustResult,
  WorkspacePackage,
} from './release-types.ts';

const INTERNAL_SCOPE = '@kanbun-skam/';
const DEPENDENCY_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'] as const;
const LIFECYCLE_SCRIPTS = ['preinstall', 'install', 'postinstall', 'prepare'];
// 先頭ゼロの数字は semver で許されない
const TAG_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/;
const FILE_PATTERN = /^[A-Za-z0-9._-]+\.tgz$/;
const INTEGRITY_PATTERN = /^sha512-[A-Za-z0-9+/]+={0,2}$/;

// --- 表示の無害化 ---

const FORMAT_CHAR = /^\p{Cf}$/u;

// C0 (\t と \n を除く。\r は除く)、DEL、C1、Cf、U+2028 / U+2029 (Cf に入らない行と段落の区切り)
function isStrippedCodePoint(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp === 0x09 || cp === 0x0a) return false;
  if (cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f)) return true;
  if (cp === 0x2028 || cp === 0x2029) return true;
  return FORMAT_CHAR.test(ch);
}

// 停止の表示 (release-stop-report.ts) の切り出しは、これより前にエスケープ列 (CSI / OSC) を丸ごと除く。
// この関数が除くのは ESC の 1 文字だけで、`[36;1m` のような後続の文字は残る
export function sanitizeForTerminal(text: string): string {
  let out = '';
  for (const ch of text) {
    if (!isStrippedCodePoint(ch)) out += ch;
  }
  return out;
}

// 文字単位の除去なので、チャンクの境界は多バイト文字の持ち越しだけを扱えばよい
export function createStreamSanitizer(): { write(chunk: Buffer): string; end(): string } {
  const decoder = new StringDecoder('utf8');
  return {
    write: (chunk) => sanitizeForTerminal(decoder.write(chunk)),
    end: () => sanitizeForTerminal(decoder.end()),
  };
}

const ok = <T>(value: T): Check<T> => ({ ok: true, value });
const fail = (...errors: string[]): { ok: false; errors: string[] } => ({ ok: false, errors });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
}

export function resolvePublicPackages(
  changesetConfig: unknown,
  workspace: readonly WorkspacePackage[]
): Check<WorkspacePackage[]> {
  const fixed = isRecord(changesetConfig) ? changesetConfig['fixed'] : undefined;
  if (!Array.isArray(fixed) || fixed.length !== 1) {
    return fail('.changeset/config.json: "fixed" must contain exactly one group');
  }
  const group: unknown = fixed[0];
  if (!Array.isArray(group) || group.length === 0 || !group.every((n) => typeof n === 'string')) {
    return fail('.changeset/config.json: the fixed group must be a non-empty list of names');
  }
  const names = group as string[];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) errors.push(`fixed group lists ${name} more than once`);
    seen.add(name);
  }
  const byName = new Map(workspace.map((p) => [p.name, p]));
  const resolved: WorkspacePackage[] = [];
  for (const name of seen) {
    const found = byName.get(name);
    if (!found) errors.push(`fixed group lists ${name}, which is not a workspace package`);
    else if (found.private) errors.push(`fixed group lists ${name}, which is private`);
    else resolved.push(found);
  }
  for (const p of workspace) {
    if (!p.private && !seen.has(p.name)) {
      errors.push(`${p.name} is public but missing from the fixed group`);
    }
  }
  return errors.length > 0 ? fail(...errors) : ok(resolved);
}

export function checkSameVersion(pkgs: readonly WorkspacePackage[]): Check<string> {
  const first = pkgs[0];
  if (!first) return fail('no packages to compare');
  const errors = pkgs
    .filter((p) => p.version !== first.version)
    .map((p) => `${p.name}: version ${p.version} differs from ${first.name} (${first.version})`);
  return errors.length > 0 ? fail(...errors) : ok(first.version);
}

export function checkTag(tag: string, version: string): Check<void> {
  if (!TAG_PATTERN.test(tag)) return fail(`tag ${JSON.stringify(tag)} is not v<semver>`);
  if (tag !== `v${version}`) return fail(`tag ${tag} does not match version ${version}`);
  return ok(undefined);
}

export function checkChangelog(name: string, text: string, version: string): Check<void> {
  const lines = text.split(/\r?\n/);
  const headingIndex = lines.findIndex((l) => l.startsWith('## '));
  if (headingIndex < 0) return fail(`${name}: CHANGELOG has no "## " heading`);
  const heading = (lines[headingIndex] ?? '').trimEnd();
  if (heading !== `## ${version}`) {
    return fail(`${name}: first CHANGELOG heading is "${heading}", expected "## ${version}"`);
  }
  for (const line of lines.slice(headingIndex + 1)) {
    if (line.startsWith('## ')) break;
    if (line.trim() !== '') return ok(undefined);
  }
  return fail(`${name}: CHANGELOG section "## ${version}" has no content`);
}

export function parseNpmView(status: number | null, stdout: string): RegistryResponse {
  if (status === null) return { kind: 'error', message: 'npm view could not be started' };
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    return { kind: 'error', message: `npm view exited ${status} with non-JSON output` };
  }
  if (status !== 0) {
    const error = isRecord(json) ? json['error'] : undefined;
    const code = isRecord(error) ? error['code'] : undefined;
    if (code === 'E404') return { kind: 'not-found' };
    return { kind: 'error', message: `npm view failed with ${String(code ?? 'unknown error')}` };
  }
  // npm 12 は複数フィールドの view を要素 1 つの配列で返す (`[{ versions, dist-tags }]`)
  if (Array.isArray(json)) {
    json = json.length === 1 ? json[0] : undefined;
  }
  if (!isRecord(json)) return { kind: 'error', message: 'npm view returned unexpected JSON' };
  const rawVersions = json['versions'];
  const versions =
    typeof rawVersions === 'string'
      ? [rawVersions]
      : Array.isArray(rawVersions) && rawVersions.every((v) => typeof v === 'string')
        ? (rawVersions as string[])
        : undefined;
  if (!versions) return { kind: 'error', message: 'npm view returned no versions list' };
  const tags = json['dist-tags'];
  const latest = isRecord(tags) && typeof tags['latest'] === 'string' ? tags['latest'] : undefined;
  return { kind: 'found', versions, latest };
}

export function checkRegistry(
  name: string,
  version: string,
  response: RegistryResponse
): Check<void> {
  if (response.kind === 'error')
    return fail(`${name}: registry lookup failed: ${response.message}`);
  if (response.kind === 'not-found') return ok(undefined);
  if (response.versions.includes(version)) return fail(`${name}@${version} is already published`);
  // prerelease は latest と比べない (next に出すため)
  if (
    !version.includes('-') &&
    response.latest !== undefined &&
    compareSemver(version, response.latest) <= 0
  ) {
    return fail(`${name}@${version} is not newer than the current latest ${response.latest}`);
  }
  return ok(undefined);
}

export function parseGhReleaseView(status: number | null, stderr: string): ReleaseLookup {
  if (status === 0) return { kind: 'found' };
  if (status !== null && stderr.includes('release not found')) return { kind: 'not-found' };
  return {
    kind: 'error',
    message: `gh release view failed (${status ?? 'not started'}): ${stderr.trim()}`,
    status,
    stderr,
  };
}

export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const [coreA = '', preA] = splitPrerelease(a);
  const [coreB = '', preB] = splitPrerelease(b);
  const partsA = coreA.split('.').map(Number);
  const partsB = coreB.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  if (preA === undefined && preB === undefined) return 0;
  if (preA === undefined) return 1;
  if (preB === undefined) return -1;
  const idsA = preA.split('.');
  const idsB = preB.split('.');
  for (let i = 0; i < Math.max(idsA.length, idsB.length); i++) {
    const x = idsA[i];
    const y = idsB[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const numX = /^\d+$/.test(x);
    const numY = /^\d+$/.test(y);
    if (numX && numY) {
      if (Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1;
    } else if (numX !== numY) {
      return numX ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

function splitPrerelease(version: string): [string, string | undefined] {
  const i = version.indexOf('-');
  return i < 0 ? [version, undefined] : [version.slice(0, i), version.slice(i + 1)];
}

export function distTagFor(version: string): DistTag {
  return version.includes('-') ? 'next' : 'latest';
}

export function orderByDependencies(pkgs: readonly WorkspacePackage[]): Check<WorkspacePackage[]> {
  const names = new Set(pkgs.map((p) => p.name));
  const errors: string[] = [];
  const internalDeps = new Map<string, Set<string>>();
  for (const p of pkgs) {
    const deps = new Set<string>();
    for (const field of DEPENDENCY_FIELDS) {
      for (const dep of Object.keys(p[field])) {
        if (dep === p.name) errors.push(`${p.name} depends on itself`);
        else if (names.has(dep)) deps.add(dep);
        else if (dep.startsWith(INTERNAL_SCOPE)) {
          errors.push(`${p.name} depends on ${dep}, which is not in the release set`);
        }
      }
    }
    internalDeps.set(p.name, deps);
  }
  if (errors.length > 0) return fail(...errors);
  // 層ごとに取る: 1 つずつ取ると層の境界 (approve の区切り) が崩れる
  const done = new Set<string>();
  const ordered: WorkspacePackage[] = [];
  let remaining = [...pkgs];
  while (remaining.length > 0) {
    const layer = remaining
      .filter((p) => [...(internalDeps.get(p.name) ?? [])].every((d) => done.has(d)))
      .sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
    if (layer.length === 0) {
      return fail(`dependency cycle among: ${remaining.map((p) => p.name).join(', ')}`);
    }
    for (const p of layer) {
      done.add(p.name);
      ordered.push(p);
    }
    remaining = remaining.filter((p) => !done.has(p.name));
  }
  return ok(ordered);
}

export function checkPackedPackageJson(
  expected: { name: string; version: string; internalNames: readonly string[] },
  packed: unknown
): Check<void> {
  if (!isRecord(packed)) return fail(`${expected.name}: packed package.json is not an object`);
  const errors: string[] = [];
  const label = expected.name;
  if (packed['name'] !== expected.name)
    errors.push(`${label}: packed name is ${String(packed['name'])}`);
  if (packed['version'] !== expected.version) {
    errors.push(
      `${label}: packed version is ${String(packed['version'])}, expected ${expected.version}`
    );
  }
  const internal = new Set(expected.internalNames);
  for (const field of DEPENDENCY_FIELDS) {
    const deps = packed[field];
    if (deps === undefined) continue;
    if (!isRecord(deps)) {
      errors.push(`${label}: ${field} is not an object`);
      continue;
    }
    for (const [dep, range] of Object.entries(deps)) {
      if (typeof range !== 'string') errors.push(`${label}: ${field}.${dep} is not a string`);
      else if (range.startsWith('workspace:'))
        errors.push(`${label}: ${field}.${dep} still uses workspace: (${range})`);
      else if (
        (internal.has(dep) || dep.startsWith(INTERNAL_SCOPE)) &&
        range !== expected.version
      ) {
        errors.push(
          `${label}: ${field}.${dep} is "${range}", expected exactly ${expected.version}`
        );
      }
    }
  }
  const scripts = packed['scripts'];
  if (scripts !== undefined) {
    if (!isRecord(scripts)) errors.push(`${label}: scripts is not an object`);
    else {
      for (const name of LIFECYCLE_SCRIPTS) {
        if (name in scripts) errors.push(`${label}: has a ${name} script`);
      }
    }
  }
  return errors.length > 0 ? fail(...errors) : ok(undefined);
}

export function verifyManifest(
  manifest: unknown,
  files: readonly { file: string; integrity: string }[],
  expected: { tag?: string; names: readonly string[] }
): Check<ReleaseManifest> {
  if (!isRecord(manifest)) return fail('manifest is not an object');
  if (manifest['schemaVersion'] !== 1) {
    return fail(`manifest schemaVersion is ${String(manifest['schemaVersion'])}, expected 1`);
  }
  const { tag, version, distTag, packages } = manifest;
  if (typeof tag !== 'string' || typeof version !== 'string') {
    return fail('manifest tag and version must be strings');
  }
  const errors: string[] = [];
  const tagCheck = checkTag(tag, version);
  if (!tagCheck.ok) errors.push(...tagCheck.errors);
  if (expected.tag !== undefined && tag !== expected.tag) {
    errors.push(`manifest tag ${tag} differs from expected ${expected.tag}`);
  }
  if (distTag !== distTagFor(version)) {
    errors.push(`manifest distTag is ${String(distTag)}, expected ${distTagFor(version)}`);
  }
  if (!Array.isArray(packages) || packages.length === 0) {
    errors.push('manifest packages must be a non-empty array');
    return fail(...errors);
  }
  const entries: ReleaseManifest['packages'] = [];
  const seenNames = new Set<string>();
  const seenFiles = new Set<string>();
  for (const raw of packages as unknown[]) {
    if (!isRecord(raw)) {
      errors.push('manifest package entry is not an object');
      continue;
    }
    const { name, file, integrity } = raw;
    if (typeof name !== 'string' || typeof file !== 'string' || typeof integrity !== 'string') {
      errors.push('manifest package entry needs string name, file and integrity');
      continue;
    }
    if (seenNames.has(name)) errors.push(`manifest lists ${name} more than once`);
    seenNames.add(name);
    if (!FILE_PATTERN.test(file))
      errors.push(`manifest file ${JSON.stringify(file)} is not a plain .tgz name`);
    if (seenFiles.has(file)) errors.push(`manifest lists ${file} more than once`);
    seenFiles.add(file);
    if (!INTEGRITY_PATTERN.test(integrity))
      errors.push(`manifest integrity for ${file} is not sha512`);
    entries.push({ name, file, integrity });
  }
  if (!sameSet([...seenNames], expected.names)) {
    errors.push(
      `manifest packages [${[...seenNames].join(', ')}] differ from expected [${expected.names.join(', ')}]`
    );
  }
  const actual = new Map(files.map((f) => [f.file, f.integrity]));
  for (const f of actual.keys()) {
    if (!seenFiles.has(f)) errors.push(`${f} is in the directory but not in the manifest`);
  }
  for (const e of entries) {
    const got = actual.get(e.file);
    if (got === undefined) errors.push(`${e.file} is in the manifest but not in the directory`);
    else if (got !== e.integrity) errors.push(`${e.file}: integrity differs from the manifest`);
  }
  if (errors.length > 0) return fail(...errors);
  return ok({ schemaVersion: 1, tag, version, distTag: distTag as DistTag, packages: entries });
}

// `npm view <name> versions --json` は版の配列を返す (1 版でも配列、research §5b)。
// parseNpmView は dist-tags を含む object を前提にしているので、配列だけをここで読み、
// それ以外 (E404 の JSON、非 JSON) は parseNpmView に任せる
export function parseNpmViewVersions(result: CommandResult): RegistryResponse {
  try {
    const json: unknown = JSON.parse(result.stdout);
    if (result.status === 0 && isStringArray(json)) {
      return { kind: 'found', versions: json, latest: undefined };
    }
  } catch {
    // 非 JSON は parseNpmView が error にする
  }
  return parseNpmView(result.status, result.stdout);
}

// --- フラグ (K2) ---

export type ReleaseFlags =
  | { mode: 'normal' }
  | { mode: 'tag-only' }
  | { mode: 'pre'; tag: string }
  | { mode: 'exit-pre' };

export function parseReleaseFlags(argv: readonly string[]): Check<ReleaseFlags> {
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  const found: ReleaseFlags[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (arg === '--tag-only') found.push({ mode: 'tag-only' });
    else if (arg === '--exit-pre') found.push({ mode: 'exit-pre' });
    else if (arg === '--pre' || arg.startsWith('--pre=')) {
      // 値は次の引数でも `=` の右でもよい。`--pre --tag-only` の後者は値ではないので弾く
      const value = arg === '--pre' ? args[++i] : arg.slice('--pre='.length);
      if (value === undefined || !/^[a-z]+$/.test(value)) {
        return fail(`--pre needs a tag of lowercase letters, got ${JSON.stringify(value)}`);
      }
      found.push({ mode: 'pre', tag: value });
    } else return fail(`unknown argument: ${arg}`);
  }
  if (found.length > 1) return fail('--tag-only, --pre and --exit-pre cannot be combined');
  return ok(found[0] ?? { mode: 'normal' });
}

// --- 入口の判定 (K3) ---

export type ChangesetStatus =
  | { kind: 'release'; version: string }
  | { kind: 'none' }
  | { kind: 'inconsistent'; reason: string };

export interface EntryObservation {
  flags: ReleaseFlags;
  head: string;
  // 公開パッケージの版が等しいか (checkSameVersion の結果)
  versions: Check<string>;
  originTag: { kind: 'present'; commit: string } | { kind: 'absent' } | { kind: 'error' };
  localTagCommit: string | undefined;
  // total は公開パッケージの数 (6 に固定しない)
  published: { kind: 'counts'; published: number; total: number } | { kind: 'error' };
  preMode: boolean;
}

export type EntryDecision =
  | { kind: 'front'; mode: ReleaseFlags }
  | { kind: 'after-push' }
  | { kind: 'after-push-check-only' }
  | { kind: 'stop'; row: number; reason: string }
  | { kind: 'need-status' };

const HEAD_VERSION_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;

const stopAt = (row: EntryStopRow, reason: string): Extract<EntryDecision, { kind: 'stop' }> => ({
  kind: 'stop',
  row,
  reason,
});

// changeset status が要る行 (8 以降) の手前までを決める。要るときは need-status を返し、
// 呼び出し側が status を読んで decideEntryWithStatus を呼ぶ (status の失敗が後半の再開を止めないため)。
export function decideEntry(observed: EntryObservation): EntryDecision {
  const { flags, head, versions, originTag, localTagCommit, published } = observed;
  // 行 0: 観測の失敗
  if (originTag.kind === 'error') {
    return stopAt(0, 'git ls-remote failed; cannot tell whether the tag exists on origin');
  }
  if (published.kind === 'error') {
    return stopAt(0, 'npm view failed; cannot tell which packages are published');
  }
  if (!versions.ok) return stopAt(0, versions.errors.join('; '));
  const version = versions.value;
  if (!HEAD_VERSION_PATTERN.test(version)) {
    return stopAt(0, `package version ${JSON.stringify(version)} is not a plain semver`);
  }
  const tag = `v${version}`;
  const count = `${published.published}/${published.total}`;
  const complete = published.total > 0 && published.published === published.total;

  if (originTag.kind === 'present') {
    if (!complete) {
      if (originTag.commit === head && flags.mode === 'normal') return { kind: 'after-push' }; // 行 1
      // 行 2: 未完了のリリースの上に新しいリリースを積まない
      const switchHint = originTag.commit === head ? '' : `run git switch --detach ${tag}, then `;
      return stopAt(
        2,
        `release ${tag} is unfinished (published ${count}); ${switchHint}rerun without flags to finish it`
      );
    }
  } else if (localTagCommit !== undefined) {
    if (localTagCommit === head) {
      // 行 3: 段 7 の push が失敗した状態
      return stopAt(
        3,
        `local tag ${tag} exists at HEAD but not on origin (the push failed); undo with: git tag -d ${tag} && git reset --hard origin/master. To tag again with --tag-only, run git tag -d ${tag} first`
      );
    }
    // 行 4
    return stopAt(
      4,
      `a stale local tag ${tag} exists (${localTagCommit}); run git tag -d ${tag}, then rerun`
    );
  }

  if (flags.mode === 'tag-only') {
    if (originTag.kind === 'present') {
      // 行 5: ここに来るのは完了済み (未完了は行 2 で止まっている)
      return stopAt(
        5,
        `${tag} is already released; to tag it again, delete the tag first by the F1 steps in releasing.md`
      );
    }
    if (published.published > 0) {
      // 行 6
      return stopAt(
        6,
        `${tag} is partly published (${count}); retagging (F1) needs 0 published, follow the F3 steps`
      );
    }
    return { kind: 'front', mode: flags }; // 行 6a
  }
  if (flags.mode === 'pre' || flags.mode === 'exit-pre') return { kind: 'front', mode: flags }; // 行 7

  return { kind: 'need-status' };
}

export function decideEntryWithStatus(
  observed: EntryObservation,
  status: Check<ChangesetStatus>
): Exclude<EntryDecision, { kind: 'need-status' }> {
  const early = decideEntry(observed);
  if (early.kind !== 'need-status') return early;
  // need-status は観測が全部正常なときだけ返る
  const { head, originTag, published, preMode } = observed;
  const version = observed.versions.ok ? observed.versions.value : '';
  const tag = `v${version}`;
  const count = published.kind === 'counts' ? `${published.published}/${published.total}` : '?';
  const publishedNone = published.kind === 'counts' && published.published === 0;

  if (!status.ok) return stopAt(9, `changeset status failed: ${status.errors.join('; ')}`);
  if (status.value.kind === 'inconsistent') {
    return stopAt(10, `changeset status is inconsistent: ${status.value.reason}`);
  }
  if (status.value.kind === 'release') return { kind: 'front', mode: { mode: 'normal' } }; // 行 11
  // release がない。完了済みで tag が HEAD なら後半の確認だけ (行 8)
  if (originTag.kind === 'present' && originTag.commit === head) {
    return { kind: 'after-push-check-only' };
  }
  if (originTag.kind === 'absent' && publishedNone) {
    return stopAt(
      12,
      `the version is bumped to ${version} but there is no tag; to tag it, run with --tag-only`
    );
  }
  if (preMode) {
    return stopAt(
      13,
      'in pre mode with only consumed changesets; add a new changeset, or run with --exit-pre to release the stable version'
    );
  }
  return stopAt(14, `nothing to release (no pending changeset; ${tag} published ${count})`);
}

// --- changeset status の解析 (K6) ---

export function parseChangesetStatus(
  json: unknown,
  publicNames: readonly string[]
): Check<ChangesetStatus> {
  if (!isRecord(json) || !Array.isArray(json['releases'])) {
    return fail('changeset status: "releases" is not an array');
  }
  if (publicNames.length === 0) return fail('changeset status: no public packages to look for');
  const entries = new Map<string, { type: string; newVersion: string }>();
  for (const raw of json['releases'] as unknown[]) {
    if (!isRecord(raw)) return fail('changeset status: a release entry is not an object');
    const { name, type, newVersion } = raw;
    if (typeof name !== 'string' || typeof type !== 'string' || typeof newVersion !== 'string') {
      return fail('changeset status: a release entry needs string name, type and newVersion');
    }
    entries.set(name, { type, newVersion });
  }
  // 非公開の release は見ない (ignore 済みの baseline-check の不具合は K7 が戻す)
  const active = publicNames.flatMap((name) => {
    const e = entries.get(name);
    return e !== undefined && e.type !== 'none' ? [{ name, newVersion: e.newVersion }] : [];
  });
  if (active.length === 0) return ok({ kind: 'none' });
  if (active.length < publicNames.length) {
    const missing = publicNames.filter((n) => !active.some((a) => a.name === n));
    return ok({
      kind: 'inconsistent',
      reason: `only ${active.length}/${publicNames.length} public packages have a release (no release for ${missing.join(', ')})`,
    });
  }
  const first = active[0];
  const differing = active.filter((a) => a.newVersion !== first?.newVersion);
  if (first === undefined || differing.length > 0) {
    return ok({
      kind: 'inconsistent',
      reason: `new versions differ: ${active.map((a) => `${a.name}@${a.newVersion}`).join(', ')}`,
    });
  }
  return ok({ kind: 'release', version: first.newVersion });
}

// --- ignore 済みパッケージの復元と、変更の許可リスト (K7) ---

interface PorcelainEntry {
  x: string;
  y: string;
  path: string;
  // rename / copy の元のパス
  from: string | undefined;
}

// `git status --porcelain=v1 -z --untracked-files=all` の出力。パスは引用符も変換もない
function parsePorcelainZ(porcelainZ: string): PorcelainEntry[] {
  const parts = porcelainZ.split('\0');
  if (parts[parts.length - 1] === '') parts.pop();
  const entries: PorcelainEntry[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] ?? '';
    const x = part[0] ?? '';
    const y = part[1] ?? '';
    const isMove = x === 'R' || x === 'C' || y === 'R' || y === 'C';
    entries.push({ x, y, path: part.slice(3), from: isMove ? parts[++i] : undefined });
  }
  return entries;
}

export function ignoredPackageDirs(
  changesetConfig: unknown,
  workspace: readonly WorkspacePackage[]
): Check<string[]> {
  const ignore = isRecord(changesetConfig) ? changesetConfig['ignore'] : undefined;
  if (ignore === undefined) return ok([]);
  if (!Array.isArray(ignore) || !ignore.every((n) => typeof n === 'string')) {
    return fail('.changeset/config.json: "ignore" must be a list of names');
  }
  const byName = new Map(workspace.map((p) => [p.name, p]));
  const errors: string[] = [];
  const dirs: string[] = [];
  for (const name of ignore as string[]) {
    const found = byName.get(name);
    if (!found) {
      errors.push(`ignore lists ${name}, which is not a workspace package`);
      continue;
    }
    const unsafe =
      found.dir === '' || found.dir.startsWith('/') || found.dir.split('/').includes('..');
    if (unsafe) errors.push(`${name}: directory ${JSON.stringify(found.dir)} is outside the repo`);
    else dirs.push(found.dir);
  }
  return errors.length > 0 ? fail(...errors) : ok(dirs);
}

export function planIgnoredRestore(
  porcelainZ: string,
  ignoredDirs: readonly string[]
): { checkout: string[]; remove: string[] } {
  const checkout: string[] = [];
  const remove: string[] = [];
  for (const e of parsePorcelainZ(porcelainZ)) {
    if (!ignoredDirs.some((dir) => e.path.startsWith(`${dir}/`))) continue;
    if (e.x === '?' && e.y === '?') remove.push(e.path);
    else if ('MD'.includes(e.x) || 'MD'.includes(e.y)) checkout.push(e.path);
  }
  return { checkout, remove };
}

export function checkVersionedChanges(
  porcelainZ: string,
  publicDirs: readonly string[]
): Check<string[]> {
  const errors: string[] = [];
  const paths: string[] = [];
  const dirOf = (path: string, file: string): boolean =>
    publicDirs.some((dir) => path === `${dir}/${file}`);
  for (const e of parsePorcelainZ(porcelainZ)) {
    const status = `${e.x}${e.y}`;
    const untracked = status === '??';
    const modified =
      !untracked && !status.includes('D') && !status.includes('A') && !/[RC]/.test(status);
    let allowed = false;
    if (e.from === undefined) {
      if (dirOf(e.path, 'package.json')) allowed = modified;
      else if (dirOf(e.path, 'CHANGELOG.md')) allowed = modified || untracked;
      else if (e.path === '.changeset/pre.json') allowed = true;
      else if (/^\.changeset\/[^/]+\.md$/.test(e.path) && e.path !== '.changeset/README.md') {
        allowed = status.includes('D') && !untracked;
      }
    }
    if (allowed) paths.push(e.path);
    else errors.push(`unexpected change after versioning: ${status} ${e.path}`);
  }
  return errors.length > 0 ? fail(...errors) : ok(paths);
}

// --- 本文のない CHANGELOG の節の補完 (K9) ---

const BUMP_ONLY_LINE =
  '- Version bump only. Released together with the other @kanbun-skam packages at the same version.';

export function fillEmptyChangelogSection(
  text: string,
  version: string
): { text: string; filled: boolean } {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const heading = lines.findIndex((l) => l.startsWith('## '));
  if (heading < 0 || (lines[heading] ?? '').trimEnd() !== `## ${version}`) {
    return { text, filled: false };
  }
  const next = lines.findIndex((l, i) => i > heading && l.startsWith('## '));
  const end = next < 0 ? lines.length : next;
  if (lines.slice(heading + 1, end).some((l) => l.trim() !== '')) return { text, filled: false };
  lines.splice(heading + 1, end - heading - 1, '', BUMP_ONLY_LINE, '');
  return { text: lines.join(eol), filled: true };
}

// --- 外部コマンドの版、引数、環境 (K16) ---

export type ToolVersion = readonly [number, number, number];

export function parseToolVersion(stdout: string, tool: 'npm' | 'gh'): Check<ToolVersion> {
  const firstLine = stdout.split(/\r?\n/)[0] ?? '';
  const match =
    tool === 'npm'
      ? /^(\d+)\.(\d+)\.(\d+)$/.exec(firstLine)
      : /^gh version (\d+)\.(\d+)\.(\d+)(?: \(.*\))?$/.exec(firstLine);
  if (!match) return fail(`${tool} --version: unexpected output ${JSON.stringify(firstLine)}`);
  return ok([Number(match[1]), Number(match[2]), Number(match[3])] as const);
}

function atLeast(v: ToolVersion, min: ToolVersion): boolean {
  for (let i = 0; i < 3; i++) {
    const d = (v[i] ?? 0) - (min[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return true;
}

export function checkToolVersions(npm: ToolVersion, gh: ToolVersion): Check<void> {
  const errors: string[] = [];
  if (npm[0] >= 13) {
    errors.push(
      `npm ${npm.join('.')} is 13 or newer; the output shape of npm stage must be checked again for npm 13, then raise the upper bound`
    );
  } else if (!atLeast(npm, [12, 2, 0])) {
    errors.push(`npm ${npm.join('.')} is older than 12.2.0 (npm stage is required)`);
  }
  if (!atLeast(gh, [2, 45, 0])) errors.push(`gh ${gh.join('.')} is older than 2.45.0`);
  return errors.length > 0 ? fail(...errors) : ok(undefined);
}

const NPM_REGISTRY = 'https://registry.npmjs.org/';
const GH_REPO_SLUG = 'github.com/berlysia/kanbun-annotation';

export function buildNpmArgs(args: readonly string[]): string[] {
  // scope の registry 設定は --registry より優先されるので、両方を固定する
  return [...args, '--registry', NPM_REGISTRY, `--@kanbun-skam:registry=${NPM_REGISTRY}`];
}

export function buildGhArgs(args: readonly string[]): string[] {
  // gh api は --repo を受け付けない (path の repos/<owner>/<repo>/... で固定する)
  return args[0] === 'api'
    ? [...args, '--hostname', 'github.com']
    : [...args, '--repo', GH_REPO_SLUG];
}

export function childEnv(
  env: Readonly<Record<string, string | undefined>>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (key === 'GH_HOST' || key === 'GH_REPO' || key === 'GH_ENTERPRISE_TOKEN') continue;
    // npm はこの前置詞を大文字小文字を区別せずに読む
    if (key.toLowerCase().startsWith('npm_config_')) continue;
    result[key] = value;
  }
  return result;
}

// registry / scoped は `npm config get` の出力 (buildNpmArgs を通さずに取ったもの)。
// 未設定の scoped は `undefined` (値の欠落、または npm が出す文字列)。
export function checkNpmRegistryConfig(registry: string, scoped: string | undefined): Check<void> {
  const errors: string[] = [];
  if (registry.trim() !== NPM_REGISTRY) {
    errors.push(`npm registry is ${JSON.stringify(registry.trim())}, expected ${NPM_REGISTRY}`);
  }
  const scopedValue = scoped?.trim();
  if (scopedValue !== undefined && scopedValue !== 'undefined' && scopedValue !== NPM_REGISTRY) {
    errors.push(
      `npm @kanbun-skam:registry is ${JSON.stringify(scopedValue)}, expected ${NPM_REGISTRY}`
    );
  }
  return errors.length > 0 ? fail(...errors) : ok(undefined);
}

export function isInteractiveStreams(streams: {
  stdinIsTTY: boolean | undefined;
  stdoutIsTTY: boolean | undefined;
}): boolean {
  return streams.stdinIsTTY === true && streams.stdoutIsTTY === true;
}

// --- trust の判定 (K5) ---

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

export function checkTrustList(result: CommandResult): TrustResult {
  // EOTP がどちらに出るかは未観察なので、stdout の JSON と stderr の両方を見る
  let json: unknown;
  let parsed = false;
  try {
    json = JSON.parse(result.stdout);
    parsed = true;
  } catch {
    // 下で扱う
  }
  const errorCode =
    parsed && isRecord(json) && isRecord(json['error']) ? json['error']['code'] : undefined;
  if (errorCode === 'EOTP' || result.stderr.includes('EOTP')) return { kind: 'eotp' };
  if (result.status !== 0) {
    return {
      kind: 'command-failed',
      what: `npm trust list exited ${result.status ?? 'not started'}: ${result.stderr.trim()}`,
    };
  }
  if (!parsed) return { kind: 'shape-unknown', what: 'npm trust list output is not JSON' };
  const entries: unknown[] = Array.isArray(json) ? json : [json];
  if (!entries.every(isTrustEntryShape)) {
    return {
      kind: 'shape-unknown',
      what: 'a trust entry lacks string id/type/file/repository/environment or a permissions list',
    };
  }
  const only = entries.length === 1 ? entries[0] : undefined;
  if (!isExpectedTrust(only)) {
    return {
      kind: 'mismatch',
      what: `expected exactly one github release.yml trust for berlysia/kanbun-annotation (environment npm, createStagedPackage only), got ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`,
    };
  }
  return { kind: 'ok' };
}

function isTrustEntryShape(entry: unknown): boolean {
  return (
    isRecord(entry) &&
    ['id', 'type', 'file', 'repository', 'environment'].every(
      (k) => typeof entry[k] === 'string'
    ) &&
    isStringArray(entry['permissions'])
  );
}

function isExpectedTrust(entry: unknown): boolean {
  if (!isRecord(entry)) return false;
  const permissions = entry['permissions'];
  return (
    entry['type'] === 'github' &&
    entry['file'] === 'release.yml' &&
    entry['repository'] === 'berlysia/kanbun-annotation' &&
    entry['environment'] === 'npm' &&
    isStringArray(permissions) &&
    permissions.length === 1 &&
    permissions[0] === 'createStagedPackage'
  );
}

export function combineTrustResults(results: readonly TrustResult[]): TrustResult {
  for (const kind of ['eotp', 'command-failed', 'shape-unknown', 'mismatch'] as const) {
    const found = results.find((r) => r.kind === kind);
    if (found) return found;
  }
  return { kind: 'ok' };
}

// --- pnpm verify を段ごとに流すための分解 (K5) ---

export type VerifyPlan = { kind: 'steps'; names: NonEmpty<string> } | { kind: 'whole' };

// `pnpm <名前>` だけ (フラグも引数も無い)。名前は空白を含まない 1 語
const PNPM_SCRIPT_STEP = /^pnpm ([^\s]+)$/;

// scripts.verify の本文が `pnpm <script 名> && pnpm <script 名> ...` の連鎖で、全部の名前が
// scripts に実在するときだけ段に分ける。それ以外 (`||`、`;`、フラグ、引数、実在しない名前) は
// 丸ごと流す側に倒す。同じ名前が何度も出たら、`pnpm verify` と同じ回数だけ段に入れる
export function planVerifySteps(
  verifyBody: string | undefined,
  scriptNames: readonly string[]
): VerifyPlan {
  if (verifyBody === undefined || verifyBody.trim() === '') return { kind: 'whole' };
  const names: string[] = [];
  for (const part of verifyBody.split(' && ')) {
    const name = PNPM_SCRIPT_STEP.exec(part.trim())?.[1];
    if (name === undefined || !scriptNames.includes(name)) return { kind: 'whole' };
    names.push(name);
  }
  const [first, ...rest] = names;
  return first === undefined ? { kind: 'whole' } : { kind: 'steps', names: [first, ...rest] };
}
