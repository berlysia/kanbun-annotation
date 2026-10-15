import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

interface TarballSet {
  version: string;
  files: string[];
  packages: { name: string; file: string; integrity: string }[];
}
interface Tarballs {
  readPublicNames(repoRoot: string): string[];
  loadTarballSet(dir: string): TarballSet;
  checkLicense(tarballPath: string, rootLicensePath: string): void;
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
// consumer/ は型を持たない .mjs なので、動的 import で型を付けて読む
const modulePath = join(here, '../../consumer/tarballs.mjs');
const tarballs = (await import(pathToFileURL(modulePath).href)) as Tarballs;

const PREFIX = 'skam-tb-';
const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) {
    // mkdtempSync が返したパスだけを、tmpdir 直下の skam-tb-* であることを確かめて消す
    const real = realpathSync(dir);
    if (dirname(real) !== realpathSync(tmpdir()) || !basename(real).startsWith(PREFIX)) {
      throw new Error(`refused to remove unexpected path ${real}`);
    }
    rmSync(real, { recursive: true, force: true });
  }
});

function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), PREFIX));
  scratch.push(dir);
  return dir;
}

const INTEGRITY = `sha512-${'A'.repeat(86)}==`;

function manifestFor(files: string[], overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    tag: 'v0.2.0',
    version: '0.2.0',
    distTag: 'latest',
    packages: files.map((file, i) => ({ name: `@fx/p${i}`, file, integrity: INTEGRITY })),
    ...overrides,
  };
}

function tarballDir(tgzs: string[], manifest: unknown | undefined = manifestFor(tgzs)): string {
  const dir = scratchDir();
  for (const f of tgzs) writeFileSync(join(dir, f), '');
  // null は manifest.json を置かない
  if (manifest !== null) writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
  return dir;
}

function tgzWithLicense(license: Buffer | undefined): string {
  const dir = scratchDir();
  const pkg = join(dir, 'package');
  mkdirSync(pkg);
  writeFileSync(join(pkg, 'package.json'), '{}');
  if (license !== undefined) writeFileSync(join(pkg, 'LICENSE'), license);
  const out = join(dir, 'x.tgz');
  const r = spawnSync('tar', ['-czf', out, '-C', dir, 'package']);
  expect(r.status).toBe(0);
  return out;
}

describe('readPublicNames', () => {
  it('returns fixed[0] of the changeset config in order', () => {
    const config = JSON.parse(
      readFileSync(join(repoRoot, '.changeset', 'config.json'), 'utf8')
    ) as { fixed: string[][] };
    const names = tarballs.readPublicNames(repoRoot);
    expect(names).toHaveLength(6);
    expect(names).toEqual(config.fixed[0]);
  });
});

describe('loadTarballSet', () => {
  it('returns the version and the tarballs listed by the manifest', () => {
    const dir = tarballDir(['a-0.2.0.tgz', 'b-0.2.0.tgz']);
    const set = tarballs.loadTarballSet(dir);
    expect(set.version).toBe('0.2.0');
    expect([...set.files].sort()).toEqual(['a-0.2.0.tgz', 'b-0.2.0.tgz']);
  });

  it('throws when a tgz is not in the manifest', () => {
    const dir = tarballDir(['a-0.2.0.tgz', 'b-0.2.0.tgz'], manifestFor(['a-0.2.0.tgz']));
    expect(() => tarballs.loadTarballSet(dir)).toThrow(/b-0\.2\.0\.tgz/);
  });

  it('throws when a manifest tgz is missing', () => {
    const dir = tarballDir(['a-0.2.0.tgz'], manifestFor(['a-0.2.0.tgz', 'b-0.2.0.tgz']));
    expect(() => tarballs.loadTarballSet(dir)).toThrow(/b-0\.2\.0\.tgz/);
  });

  it('throws when manifest.json is missing', () => {
    const dir = tarballDir(['a-0.2.0.tgz'], null);
    expect(() => tarballs.loadTarballSet(dir)).toThrow(/manifest/);
  });

  it('throws on schemaVersion 2', () => {
    const dir = tarballDir(['a-0.2.0.tgz'], manifestFor(['a-0.2.0.tgz'], { schemaVersion: 2 }));
    expect(() => tarballs.loadTarballSet(dir)).toThrow(/schemaVersion/);
  });
});

describe('checkLicense', () => {
  const rootLicense = join(repoRoot, 'LICENSE');

  it('accepts a tarball whose package/LICENSE matches the root LICENSE byte for byte', () => {
    const tgz = tgzWithLicense(readFileSync(rootLicense));
    expect(() => tarballs.checkLicense(tgz, rootLicense)).not.toThrow();
  });

  it('throws when the LICENSE differs by one byte', () => {
    const tgz = tgzWithLicense(Buffer.concat([readFileSync(rootLicense), Buffer.from('x')]));
    expect(() => tarballs.checkLicense(tgz, rootLicense)).toThrow(/LICENSE/);
  });

  it('throws when the tarball has no LICENSE', () => {
    const tgz = tgzWithLicense(undefined);
    expect(() => tarballs.checkLicense(tgz, rootLicense)).toThrow(/LICENSE/);
  });
});
