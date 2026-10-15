// リリース前提の検査の純粋関数。ファイル・ネットワーク・子プロセスには触れない
// (読み込みと実行は check-release.ts と release.ts が行い、結果をここへ渡す)。

export type Check<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export interface WorkspacePackage {
  name: string;
  dir: string;
  version: string;
  private: boolean;
  dependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  optionalDependencies: Record<string, string>;
}

export type RegistryResponse =
  | { kind: 'found'; versions: string[]; latest: string | undefined }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string };

export type ReleaseLookup =
  | { kind: 'found' }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string };

export type DistTag = 'latest' | 'next';

export interface ReleaseManifest {
  schemaVersion: 1;
  tag: string;
  version: string;
  distTag: DistTag;
  packages: { name: string; file: string; integrity: string }[];
}

const INTERNAL_SCOPE = '@kanbun-skam/';
const DEPENDENCY_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'] as const;
const LIFECYCLE_SCRIPTS = ['preinstall', 'install', 'postinstall', 'prepare'];
// 先頭ゼロの数字は semver で許されない
const TAG_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/;
const FILE_PATTERN = /^[A-Za-z0-9._-]+\.tgz$/;
const INTEGRITY_PATTERN = /^sha512-[A-Za-z0-9+/]+={0,2}$/;

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

export function parseReleaseArgs(argv: readonly string[]): Check<{ tagOnly: boolean }> {
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  let tagOnly = false;
  for (const arg of args) {
    if (arg === '--tag-only') tagOnly = true;
    else return fail(`unknown argument: ${arg}`);
  }
  return ok({ tagOnly });
}
