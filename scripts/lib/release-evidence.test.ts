// 証拠の保存物の書き込み。本物の node:fs を、os.tmpdir() の下の新しい dir の中だけで使う。
// mode の検査は Linux の tmpfs / ext4 を前提にする (WSL の drvfs では chmod が効かない)。

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createEvidenceStore, createSaveRaw, nodeFsApi } from '../release.ts';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// `.tmp` は先に 0755 で作る (リポジトリでは既にある。無ければ recursive の作成の mode が `.tmp` に及ぶ)
function makeRepoRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'kanbun-evidence-test-'));
  roots.push(root);
  mkdirSync(join(root, '.tmp'));
  chmodSync(join(root, '.tmp'), 0o755);
  return root;
}

const modeOf = (path: string): number => statSync(path).mode & 0o777;
const NOW = new Date('2026-10-19T01:02:03.004Z');
const STAMP = '2026-10-19T01-02-03-004Z';

test('createEvidenceStore: 既にある .tmp の権限は変えない', () => {
  const root = makeRepoRoot();
  createEvidenceStore(nodeFsApi, root, '0.2.0', () => NOW)('run.json', '{}');
  assert.equal(modeOf(join(root, '.tmp')), 0o755);
});

test('createEvidenceStore: JSON は無害化して保存し、ファイルは 0600、ディレクトリは 0700', () => {
  const root = makeRepoRoot();
  const dir = createEvidenceStore(
    nodeFsApi,
    root,
    '0.2.0',
    () => NOW
  )('run.json', '{"a":"\\u001b[2Jx"}');
  const file = join(dir, 'run.json');
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { a: 'x' });
  assert.equal(modeOf(file), 0o600);
  assert.equal(modeOf(dir), 0o700);
  assert.equal(modeOf(join(root, '.tmp', 'release', 'v0.2.0')), 0o700);
  assert.equal(modeOf(join(root, '.tmp', 'release')), 0o700);
});

test('createEvidenceStore: umask 0 でもファイル 0600、ディレクトリ 0700', () => {
  const root = makeRepoRoot();
  const previous = process.umask(0);
  try {
    const dir = createEvidenceStore(nodeFsApi, root, '0.2.0', () => NOW)('run.json', '{}');
    assert.equal(modeOf(join(dir, 'run.json')), 0o600);
    assert.equal(modeOf(dir), 0o700);
    assert.equal(modeOf(join(root, '.tmp', 'release')), 0o700);
  } finally {
    process.umask(previous);
  }
});

test('createEvidenceStore: 同じ名前を 2 度保存すると後の内容が残り、mode は 0600', () => {
  const root = makeRepoRoot();
  const store = createEvidenceStore(nodeFsApi, root, '0.2.0', () => NOW);
  const dir = store('run.json', '{"n":1}');
  store('run.json', '{"n":2}');
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8')), { n: 2 });
  assert.equal(modeOf(join(dir, 'run.json')), 0o600);
});

test('createEvidenceStore: 先にある 0755 の .tmp/release は 0700 になる', () => {
  const root = makeRepoRoot();
  mkdirSync(join(root, '.tmp', 'release', 'v0.2.0'), { recursive: true });
  chmodSync(join(root, '.tmp', 'release'), 0o755);
  chmodSync(join(root, '.tmp', 'release', 'v0.2.0'), 0o755);
  createEvidenceStore(nodeFsApi, root, '0.2.0', () => NOW)('run.json', '{}');
  assert.equal(modeOf(join(root, '.tmp', 'release')), 0o700);
  assert.equal(modeOf(join(root, '.tmp', 'release', 'v0.2.0')), 0o700);
});

test('createEvidenceStore: 同じ stamp のディレクトリが既にあれば -1 を付ける', () => {
  const root = makeRepoRoot();
  mkdirSync(join(root, '.tmp', 'release', 'v0.2.0', STAMP), { recursive: true });
  const dir = createEvidenceStore(nodeFsApi, root, '0.2.0', () => NOW)('run.json', '{}');
  assert.equal(dir, join(root, '.tmp', 'release', 'v0.2.0', `${STAMP}-1`));
  assert.equal(modeOf(dir), 0o700);
});

test('createEvidenceStore: 不正な名前ではディレクトリも作らない', () => {
  const root = makeRepoRoot();
  assert.throws(() => createEvidenceStore(nodeFsApi, root, '0.2.0', () => NOW)('..', '{}'));
  assert.equal(existsSync(join(root, '.tmp', 'release')), false);
});

test('createEvidenceStore: token を含む stdout は伏せて保存する', () => {
  const root = makeRepoRoot();
  const dir = createEvidenceStore(
    nodeFsApi,
    root,
    '0.2.0',
    () => NOW
  )('run.json', '{"stdout":"ghp_abc123"}');
  const text = readFileSync(join(dir, 'run.json'), 'utf8');
  assert.equal(text.includes('ghp_'), false);
  assert.deepEqual(JSON.parse(text), { stdout: '***' });
});

test('createEvidenceStore: gh の 1 行の JSON は値を保ったまま保存する', () => {
  const root = makeRepoRoot();
  const input = '{"jobs":[{"name":"x"}]}';
  const dir = createEvidenceStore(nodeFsApi, root, '0.2.0', () => NOW)('jobs.json', input);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'jobs.json'), 'utf8')), JSON.parse(input));
});

test('createEvidenceStore: ESC と C1 を含む JSON は、保存したファイルに ESC も C1 も残さない', () => {
  const root = makeRepoRoot();
  const dir = createEvidenceStore(
    nodeFsApi,
    root,
    '0.2.0',
    () => NOW
  )('run.json', '{"a":"x\\u001b[2Jy\\u009bz","b\\u0085":1}');
  assert.equal(/[\u001b\u0080-\u009f]/.test(readFileSync(join(dir, 'run.json'), 'utf8')), false);
});

// --- createSaveRaw (trust の生の出力) ---

test('createSaveRaw: trust-<stamp> の下に 0600 で書き、token を伏せる', () => {
  const root = makeRepoRoot();
  const dir = createSaveRaw(
    nodeFsApi,
    root,
    () => NOW
  )([{ name: '@kanbun-skam/skam', content: '{"stdout":"npm_abc123"}' }]);
  assert.equal(dir, join(root, '.tmp', 'release', `trust-${STAMP}`));
  const file = join(dir, '_kanbun-skam_skam.json');
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { stdout: '***' });
  assert.equal(modeOf(file), 0o600);
  assert.equal(modeOf(dir), 0o700);
  assert.equal(modeOf(join(root, '.tmp', 'release')), 0o700);
});

test('createSaveRaw: 同じ stamp のディレクトリが既にあれば -1 に書く', () => {
  const root = makeRepoRoot();
  mkdirSync(join(root, '.tmp', 'release', `trust-${STAMP}`), { recursive: true });
  const dir = createSaveRaw(nodeFsApi, root, () => NOW)([{ name: 'a', content: '{}' }]);
  assert.equal(dir, join(root, '.tmp', 'release', `trust-${STAMP}-1`));
});

test('createSaveRaw: path の区切りは _ に置き換わり、trust-<stamp> の外へ書かない', () => {
  const root = makeRepoRoot();
  const dir = createSaveRaw(nodeFsApi, root, () => NOW)([{ name: '../x', content: '{}' }]);
  assert.ok(existsSync(join(dir, '.._x.json')));
  assert.equal(existsSync(join(root, '.tmp', 'x.json')), false);
});

test('createSaveRaw: NUL は _ に置き換わる', () => {
  const root = makeRepoRoot();
  const dir = createSaveRaw(nodeFsApi, root, () => NOW)([{ name: 'a\u0000b', content: '{}' }]);
  assert.ok(existsSync(join(dir, 'a_b.json')));
});
