/**
 * Release precondition checks (list / check / pack / verify-manifest).
 *
 * Usage:
 *   node scripts/check-release.ts list [--root <dir>]
 *   node scripts/check-release.ts check [--tag <tag>] [--registry] [--root <dir>]
 *   node scripts/check-release.ts pack --out <dir> --tag <tag> [--root <dir>]
 *   node scripts/check-release.ts verify-manifest --dir <dir> [--tag <tag>] [--root <dir>]
 *
 * Exit 0 on success; on failure each reason goes to stderr, one per line, and the exit code is 1.
 * Judgement lives in lib/release-check.ts; this file only reads files and runs child processes.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  checkChangelog,
  checkPackedPackageJson,
  checkRegistry,
  checkSameVersion,
  checkTag,
  distTagFor,
  orderByDependencies,
  parseNpmView,
  resolvePublicPackages,
  verifyManifest,
} from './lib/release-check.ts';
import type { Check, ReleaseManifest, WorkspacePackage } from './lib/release-check.ts';

const DEFAULT_ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

interface Options {
  root: string;
  tag: string | undefined;
  registry: boolean;
  out: string | undefined;
  dir: string | undefined;
}

type Failure = { ok: false; errors: string[] };
const fail = (...errors: string[]): Failure => ({ ok: false, errors });

function parseArgs(argv: string[]): Check<{ command: string; options: Options }> {
  const [command, ...rest] = argv;
  if (!command) return fail('usage: check-release <list|check|pack|verify-manifest> [options]');
  const options: Options = {
    root: DEFAULT_ROOT,
    tag: undefined,
    registry: false,
    out: undefined,
    dir: undefined,
  };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    // 値は次の引数をそのまま取る ("--" で始まる値も値として扱い、後で tag の検査が拒否する)
    const value = (): string | undefined => rest[++i];
    if (arg === '--registry') options.registry = true;
    else if (arg === '--root' || arg === '--tag' || arg === '--out' || arg === '--dir') {
      const v = value();
      if (v === undefined) return fail(`${arg} needs a value`);
      if (arg === '--root') options.root = resolve(v);
      else if (arg === '--tag') options.tag = v;
      else if (arg === '--out') options.out = resolve(v);
      else options.dir = resolve(v);
    } else return fail(`unknown argument: ${arg}`);
  }
  return { ok: true, value: { command, options } };
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function stringRecord(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof value === 'object' && value !== null) {
    for (const [k, v] of Object.entries(value)) if (typeof v === 'string') out[k] = v;
  }
  return out;
}

function loadWorkspace(root: string): WorkspacePackage[] {
  const packagesDir = join(root, 'packages');
  const pkgs: WorkspacePackage[] = [];
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    const file = join(packagesDir, entry.name, 'package.json');
    if (!entry.isDirectory() || !existsSync(file)) continue;
    const json = readJson(file) as Record<string, unknown>;
    pkgs.push({
      name: String(json['name']),
      dir: join(packagesDir, entry.name),
      version: String(json['version']),
      private: json['private'] === true,
      dependencies: stringRecord(json['dependencies']),
      peerDependencies: stringRecord(json['peerDependencies']),
      optionalDependencies: stringRecord(json['optionalDependencies']),
    });
  }
  return pkgs;
}

function loadPublicPackages(root: string): Check<WorkspacePackage[]> {
  const config = readJson(join(root, '.changeset', 'config.json'));
  return resolvePublicPackages(config, loadWorkspace(root));
}

function collect(errors: string[], check: Check<unknown>): void {
  if (!check.ok) errors.push(...check.errors);
}

// (a)(b)(d) は常に、--tag で (c)。(e) は子プロセスを起こすので呼び出し側が選ぶ
function checkStatic(options: Options): Check<{ pkgs: WorkspacePackage[]; version: string }> {
  const resolved = loadPublicPackages(options.root);
  if (!resolved.ok) return resolved;
  const pkgs = resolved.value;
  const same = checkSameVersion(pkgs);
  if (!same.ok) return same;
  const version = same.value;
  const errors: string[] = [];
  // tag は子プロセスより前に検査する (--registry や pack の前)
  if (options.tag !== undefined) collect(errors, checkTag(options.tag, version));
  for (const p of pkgs) {
    collect(
      errors,
      checkChangelog(p.name, readFileSync(join(p.dir, 'CHANGELOG.md'), 'utf8'), version)
    );
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: { pkgs, version } };
}

function checkRegistries(pkgs: WorkspacePackage[], version: string, root: string): Check<void> {
  const errors: string[] = [];
  for (const p of pkgs) {
    const r = spawnSync('npm', ['view', p.name, 'versions', 'dist-tags', '--json'], {
      cwd: root,
      encoding: 'utf8',
    });
    collect(errors, checkRegistry(p.name, version, parseNpmView(r.status, r.stdout ?? '')));
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: undefined };
}

function integrityOf(file: string): string {
  return `sha512-${createHash('sha512').update(readFileSync(file)).digest('base64')}`;
}

function tarballName(pkg: WorkspacePackage): string {
  return `${pkg.name.replace(/^@/, '').replace('/', '-')}-${pkg.version}.tgz`;
}

function runPack(options: Options): Check<void> {
  if (options.out === undefined) return fail('pack needs --out <dir>');
  if (options.tag === undefined) return fail('pack needs --tag <tag>');
  const checked = checkStatic(options);
  if (!checked.ok) return checked;
  const { pkgs, version } = checked.value;
  const ordered = orderByDependencies(pkgs);
  if (!ordered.ok) return ordered;

  mkdirSync(options.out, { recursive: true });
  const existing = readdirSync(options.out).filter((f) => f.endsWith('.tgz'));
  if (existing.length > 0) return fail(`${options.out} already contains ${existing.join(', ')}`);

  const internalNames = pkgs.map((p) => p.name);
  const entries: ReleaseManifest['packages'] = [];
  for (const p of ordered.value) {
    const packed = spawnSync('pnpm', ['pack', '--pack-destination', options.out], {
      cwd: p.dir,
      encoding: 'utf8',
    });
    if (packed.status !== 0)
      return fail(`pnpm pack ${p.name} failed:\n${packed.stdout}\n${packed.stderr}`);
    const file = tarballName(p);
    const path = join(options.out, file);
    if (!existsSync(path)) return fail(`pnpm pack ${p.name} did not produce ${file}`);
    const tar = spawnSync('tar', ['-xzOf', path, 'package/package.json'], { encoding: 'utf8' });
    if (tar.status !== 0) return fail(`${file}: cannot read package/package.json`);
    let manifestJson: unknown;
    try {
      manifestJson = JSON.parse(tar.stdout);
    } catch {
      return fail(`${file}: package/package.json is not JSON`);
    }
    const verdict = checkPackedPackageJson({ name: p.name, version, internalNames }, manifestJson);
    if (!verdict.ok) return verdict;
    // pack 直後に採る。以後に tarball が書き換わればこの値と合わなくなる
    entries.push({ name: p.name, file, integrity: integrityOf(path) });
  }
  const manifest: ReleaseManifest = {
    schemaVersion: 1,
    tag: options.tag,
    version,
    distTag: distTagFor(version),
    packages: entries,
  };
  writeFileSync(join(options.out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { ok: true, value: undefined };
}

function runVerifyManifest(options: Options): Check<void> {
  if (options.dir === undefined) return fail('verify-manifest needs --dir <dir>');
  const resolved = loadPublicPackages(options.root);
  if (!resolved.ok) return resolved;
  const manifestPath = join(options.dir, 'manifest.json');
  if (!existsSync(manifestPath)) return fail(`${manifestPath} does not exist`);
  let manifest: unknown;
  try {
    manifest = readJson(manifestPath);
  } catch {
    return fail(`${manifestPath} is not JSON`);
  }
  const files = readdirSync(options.dir)
    .filter((f) => f.endsWith('.tgz'))
    .map((file) => ({ file, integrity: integrityOf(join(options.dir!, file)) }));
  const expected: { tag?: string; names: string[] } = { names: resolved.value.map((p) => p.name) };
  if (options.tag !== undefined) expected.tag = options.tag;
  const verdict = verifyManifest(manifest, files, expected);
  return verdict.ok ? { ok: true, value: undefined } : verdict;
}

function run(command: string, options: Options): { lines: string[]; result: Check<unknown> } {
  switch (command) {
    case 'list': {
      const resolved = loadPublicPackages(options.root);
      return {
        lines: resolved.ok ? resolved.value.map((p) => `${p.name}@${p.version}`) : [],
        result: resolved,
      };
    }
    case 'check': {
      const checked = checkStatic(options);
      if (!checked.ok || !options.registry) return { lines: [], result: checked };
      return {
        lines: [],
        result: checkRegistries(checked.value.pkgs, checked.value.version, options.root),
      };
    }
    case 'pack':
      return { lines: [], result: runPack(options) };
    case 'verify-manifest':
      return { lines: [], result: runVerifyManifest(options) };
    default:
      return { lines: [], result: fail(`unknown command: ${command}`) };
  }
}

function main(argv: string[]): number {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    console.error(parsed.errors.join('\n'));
    return 1;
  }
  const { lines, result } = run(parsed.value.command, parsed.value.options);
  if (!result.ok) {
    console.error(result.errors.join('\n'));
    return 1;
  }
  for (const line of lines) console.log(line);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main(process.argv.slice(2));
}
