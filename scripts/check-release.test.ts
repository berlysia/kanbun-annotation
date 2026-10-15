import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { verifyManifest } from './lib/release-check.ts';
import { makeWorkspace, removeWorkspace } from './lib/test-workspace.ts';

const REPO_ROOT = dirname(import.meta.dirname);
const CLI = join(REPO_ROOT, 'scripts', 'check-release.ts');

const workspaces: string[] = [];
const scratch: string[] = [];

afterEach(() => {
  for (const w of workspaces.splice(0)) removeWorkspace(w);
  for (const dir of scratch.splice(0)) removeScratch(dir);
});

function fixture(options: Parameters<typeof makeWorkspace>[0]): string {
  const root = makeWorkspace(options);
  workspaces.push(root);
  return root;
}

function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'skam-cr-'));
  scratch.push(dir);
  return dir;
}

// mkdtempSync が返したパスだけを、tmpdir 直下の skam-cr-* であることを確かめて消す
function removeScratch(dir: string): void {
  const real = realpathSync(dir);
  if (dirname(real) !== realpathSync(tmpdir()) || !basename(real).startsWith('skam-cr-')) {
    throw new Error(`refused to remove unexpected path ${real}`);
  }
  rmSync(real, { recursive: true, force: true });
}

function cli(args: string[], env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function fakeBin(scripts: Record<string, string>): string {
  const dir = scratchDir();
  for (const [name, body] of Object.entries(scripts)) {
    const file = join(dir, name);
    writeFileSync(file, `#!/bin/sh\n${body}\n`);
    chmodSync(file, 0o755);
  }
  return dir;
}

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
}

function tarList(file: string): string[] {
  const r = spawnSync('tar', ['-tzf', file], { encoding: 'utf8' });
  return r.stdout.split('\n').filter(Boolean);
}

function tarRead(file: string, member: string): string {
  return spawnSync('tar', ['-xzOf', file, member], { encoding: 'utf8' }).stdout;
}

test('list: prints name@version for the real repository, read from package.json', () => {
  const r = cli(['list']);
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.split('\n').filter(Boolean);
  assert.equal(lines.length, 6);
  const config = readJson(join(REPO_ROOT, '.changeset', 'config.json'));
  const fixed = (config['fixed'] as string[][])[0]!;
  const expected = fixed.map((name) => {
    const dir = readdirSync(join(REPO_ROOT, 'packages')).find(
      (d) => (readJson(join(REPO_ROOT, 'packages', d, 'package.json'))['name'] as string) === name
    )!;
    return `${name}@${String(readJson(join(REPO_ROOT, 'packages', dir, 'package.json'))['version'])}`;
  });
  assert.deepEqual([...lines].sort(), [...expected].sort());
});

test('check: passes for a consistent fixture with a tag', () => {
  const root = fixture({ version: '0.2.0' });
  const r = cli(['check', '--root', root, '--tag', 'v0.2.0']);
  assert.equal(r.status, 0, r.stderr);
});

test('check: fails and names the package whose CHANGELOG is stale', () => {
  const root = fixture({ version: '0.2.0', changelogHeads: { b: '## 0.1.0' } });
  const r = cli(['check', '--root', root]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /@fx\/b/);
});

test('pack, verify-manifest and the manifest contract', () => {
  const root = fixture({ version: '0.2.0' });
  const out = scratchDir();
  const pack = cli(['pack', '--root', root, '--out', out, '--tag', 'v0.2.0']);
  assert.equal(pack.status, 0, pack.stderr);

  const files = readdirSync(out).sort();
  assert.deepEqual(files, ['fx-a-0.2.0.tgz', 'fx-b-0.2.0.tgz', 'manifest.json']);
  const manifest = readJson(join(out, 'manifest.json')) as {
    schemaVersion: number;
    distTag: string;
    packages: { name: string; file: string; integrity: string }[];
  };
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.distTag, 'latest');
  assert.deepEqual(
    manifest.packages.map((p) => p.name),
    ['@fx/a', '@fx/b']
  );

  const packedB = JSON.parse(tarRead(join(out, 'fx-b-0.2.0.tgz'), 'package/package.json')) as {
    dependencies: Record<string, string>;
  };
  assert.equal(packedB.dependencies['@fx/a'], '0.2.0');
  for (const f of ['fx-a-0.2.0.tgz', 'fx-b-0.2.0.tgz']) {
    assert.ok(tarList(join(out, f)).includes('package/LICENSE'), `${f} has no LICENSE`);
  }

  const verify = cli(['verify-manifest', '--root', root, '--dir', out, '--tag', 'v0.2.0']);
  assert.equal(verify.status, 0, verify.stderr);

  // 生産者 (pack) と読み手 (verifyManifest) の契約
  const contract = verifyManifest(manifest, manifest.packages, {
    tag: 'v0.2.0',
    names: ['@fx/a', '@fx/b'],
  });
  assert.equal(contract.ok, true);

  // 1 バイト書き換えると verify-manifest が失敗する
  const target = join(out, 'fx-a-0.2.0.tgz');
  const bytes = readFileSync(target);
  bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 0xff;
  writeFileSync(target, bytes);
  const tampered = cli(['verify-manifest', '--root', root, '--dir', out, '--tag', 'v0.2.0']);
  assert.equal(tampered.status, 1);
  assert.match(tampered.stderr, /fx-a-0\.2\.0\.tgz/);
});

test('pack: fails when the output directory already holds a tgz', () => {
  const root = fixture({ version: '0.2.0' });
  const out = scratchDir();
  writeFileSync(join(out, 'old.tgz'), '');
  const r = cli(['pack', '--root', root, '--out', out, '--tag', 'v0.2.0']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /old\.tgz/);
});

test('pack: fails on a stale CHANGELOG before creating any tgz', () => {
  const root = fixture({ version: '0.2.0', changelogHeads: { b: '## 0.1.0' } });
  const out = scratchDir();
  const r = cli(['pack', '--root', root, '--out', out, '--tag', 'v0.2.0']);
  assert.equal(r.status, 1);
  assert.deepEqual(readdirSync(out), []);
});

test('pack: a prerelease version gets the next dist-tag', () => {
  const root = fixture({ version: '0.3.0-rc.1' });
  const out = scratchDir();
  const r = cli(['pack', '--root', root, '--out', out, '--tag', 'v0.3.0-rc.1']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readJson(join(out, 'manifest.json'))['distTag'], 'next');
});

for (const tag of ['--upload-pack=x', 'v0.2.0;id']) {
  test(`check: rejects tag ${JSON.stringify(tag)} before any child process runs`, () => {
    const root = fixture({ version: '0.2.0' });
    const mark = join(scratchDir(), 'called');
    const bin = fakeBin({
      git: `touch "${mark}"`,
      npm: `touch "${mark}"`,
      pnpm: `touch "${mark}"`,
    });
    const r = cli(['check', '--root', root, '--tag', tag, '--registry'], {
      PATH: `${bin}:${process.env['PATH'] ?? ''}`,
    });
    assert.equal(r.status, 1);
    assert.equal(existsSync(mark), false);
  });
}

const NPM_MODES: [string, string, number][] = [
  [
    'E404',
    `echo '{"error":{"code":"E404","summary":"Not Found"}}'; echo 'npm error code E404' >&2; exit 1`,
    0,
  ],
  ['E500', `echo '{"error":{"code":"E500","summary":"boom"}}'; exit 1`, 1],
  ['broken output', `echo 'garbage'; exit 0`, 1],
];
for (const [label, body, status] of NPM_MODES) {
  test(`check --registry: npm ${label} exits ${status}`, () => {
    const root = fixture({ version: '0.2.0' });
    const bin = fakeBin({ npm: body });
    const r = cli(['check', '--root', root, '--tag', 'v0.2.0', '--registry'], {
      PATH: `${bin}:${process.env['PATH'] ?? ''}`,
    });
    assert.equal(r.status, status, r.stderr);
  });
}
