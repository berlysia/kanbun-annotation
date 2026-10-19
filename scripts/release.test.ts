import { afterEach, test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, sep } from 'node:path';
import { PassThrough } from 'node:stream';
import type { Readable } from 'node:stream';
import {
  buildReleaseDeps,
  createConfirm,
  createEvidenceStore,
  createInterruptState,
  createOutput,
  createRunner,
  createTempFs,
  nodeFsApi,
  pumpSanitizedStderr,
  readPreState,
  reportOutcome,
  runMain,
  runRelease,
  verifyTrustWith,
} from './release.ts';
import type {
  ChildLike,
  CreateInterface,
  GitResult,
  LineReader,
  MainDeps,
  Output,
  ReleaseDeps,
  ReleaseOutcome,
  Runner,
  SpawnFn,
  SpawnOptionsLike,
  SpawnSyncFn,
} from './release.ts';
import type { AfterPushInput } from './release-after-push.ts';
import { checkChangelog } from './lib/release-check.ts';
import type { ChangesetStatus, ReleaseFlags, ReleaseLookup } from './lib/release-check.ts';
import type {
  AfterPushResult,
  Check,
  ClassifiedStop,
  CommandResult,
  Outcome,
  TrustResult,
} from './lib/release-types.ts';
import { makeWorkspace, removeWorkspace } from './lib/test-workspace.ts';

const PREFIX = 'skam-rel-';

// SAFETY: 実 git と実際の changeset を動かすテストは、os.tmpdir() の下の fixture の中だけで動かす。
// GIT_DIR / GIT_WORK_TREE などは子に渡さない (利用者の環境変数が実リポジトリを指さないように)。
function sanitizedProcessEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR'].includes(key)) continue;
    env[key] = value;
  }
  return env;
}

const gitEnv: Record<string, string> = {
  ...sanitizedProcessEnv(),
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};

const roots: string[] = [];
const workspaceRoots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    // mkdtempSync が返したパスだけを、tmpdir 直下の skam-rel-* であることを確かめて消す
    const real = realpathSync(root);
    if (dirname(real) !== realpathSync(tmpdir()) || !basename(real).startsWith(PREFIX)) {
      throw new Error(`refused to remove unexpected path ${real}`);
    }
    rmSync(real, { recursive: true, force: true });
  }
  for (const root of workspaceRoots.splice(0)) removeWorkspace(root);
});

function assertUnderTmp(path: string): void {
  const real = realpathSync(path);
  const tmp = realpathSync(tmpdir());
  assert.ok(real.startsWith(`${tmp}${sep}`), `${real} is not under ${tmp}`);
}

function gitIn(cwd: string, args: string[]): GitResult {
  assertUnderTmp(cwd);
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: gitEnv });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function mustGit(cwd: string, args: string[]): string {
  const r = gitIn(cwd, args);
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

// fixture の origin が、os.tmpdir() の下の bare repo であることをテストの冒頭で確かめる
function assertFixtureOrigin(work: string): void {
  const url = mustGit(work, ['remote', 'get-url', 'origin']);
  assertUnderTmp(url);
  assert.equal(mustGit(url, ['rev-parse', '--is-bare-repository']), 'true');
}

function configureFixtureGit(cwd: string): void {
  mustGit(cwd, ['config', 'user.name', 'Test']);
  mustGit(cwd, ['config', 'user.email', 'test@example.com']);
  mustGit(cwd, ['config', 'commit.gpgsign', 'false']);
  mustGit(cwd, ['config', 'tag.gpgsign', 'false']);
  mustGit(cwd, ['config', 'core.hooksPath', '/dev/null']);
}

interface Repo {
  bare: string;
  work: string;
  other: string;
}

interface RepoOptions {
  changeset?: boolean;
  version?: string;
  // .changeset/config.json の ignore に載る private パッケージ (@fx/priv) を足す
  ignored?: boolean;
  // 指定すると、pre mode (.changeset/pre.json) の状態で始める
  preTag?: string;
}

function writePre(root: string, mode: 'pre' | 'exit', tag: string): void {
  writeFileSync(
    join(root, '.changeset', 'pre.json'),
    `${JSON.stringify({ mode, tag, initialVersions: {}, changesets: [] }, null, 2)}\n`
  );
}

function makeRepo(options: RepoOptions = {}): Repo {
  const base = mkdtempSync(join(tmpdir(), PREFIX));
  roots.push(base);
  const bare = join(base, 'origin.git');
  const work = join(base, 'work');
  const other = join(base, 'other');
  mkdirSync(bare);
  mkdirSync(work);
  mustGit(bare, ['init', '--bare', '-b', 'master']);
  mustGit(work, ['init', '-b', 'master']);
  configureFixtureGit(work);
  mustGit(work, ['remote', 'add', 'origin', bare]);
  assertFixtureOrigin(work);
  for (const name of ['a', 'b']) {
    mkdirSync(join(work, 'packages', name), { recursive: true });
    writeFileSync(
      join(work, 'packages', name, 'package.json'),
      `${JSON.stringify({ name: `@fx/${name}`, version: options.version ?? '0.1.0' }, null, 2)}\n`
    );
  }
  mkdirSync(join(work, '.changeset'));
  writeFileSync(join(work, '.changeset', 'README.md'), 'readme\n');
  if (options.changeset !== false) writeFileSync(join(work, '.changeset', 'x.md'), 'change\n');
  if (options.ignored === true) {
    mkdirSync(join(work, 'packages', 'priv'), { recursive: true });
    writeFileSync(
      join(work, 'packages', 'priv', 'package.json'),
      `${JSON.stringify({ name: '@fx/priv', version: '0.0.0', private: true }, null, 2)}\n`
    );
    writeFileSync(
      join(work, '.changeset', 'config.json'),
      `${JSON.stringify({ fixed: [['@fx/a', '@fx/b']], ignore: ['@fx/priv'] }, null, 2)}\n`
    );
  }
  if (options.preTag !== undefined) writePre(work, 'pre', options.preTag);
  mustGit(work, ['add', '-A']);
  mustGit(work, ['commit', '-m', 'init']);
  mustGit(work, ['push', 'origin', 'master']);
  mustGit(base, ['clone', bare, other]);
  configureFixtureGit(other);
  return { bare, work, other };
}

const normal: ReleaseFlags = { mode: 'normal' };
const tagOnlyFlags: ReleaseFlags = { mode: 'tag-only' };
const ok: Check<void> = { ok: true, value: undefined };

// 偽の changesets: x.md があれば release。pre mode なら 0.2.0-<tag>.0、そうでなければ 0.2.0
function plannedStatus(repo: Repo): ChangesetStatus {
  if (!existsSync(join(repo.work, '.changeset', 'x.md'))) return { kind: 'none' };
  const pre = readPreState(repo.work);
  return {
    kind: 'release',
    version: pre.ok && pre.value.mode === 'pre' ? `0.2.0-${pre.value.tag}.0` : '0.2.0',
  };
}

interface Fake {
  deps: ReleaseDeps;
  gitCalls: string[][];
  logs: string[];
  calls: string[];
}

function fakeDeps(repo: Repo, overrides: Partial<ReleaseDeps> = {}): Fake {
  const gitCalls: string[][] = [];
  const logs: string[] = [];
  const calls: string[] = [];
  const notFound: ReleaseLookup = { kind: 'not-found' };
  const deps: ReleaseDeps = {
    git: (args) => {
      gitCalls.push(args);
      return gitIn(repo.work, args);
    },
    verifyTrust: async () => {
      calls.push('verifyTrust');
      return { kind: 'ok' };
    },
    changesetStatus: () => {
      calls.push('changesetStatus');
      return { ok: true, value: plannedStatus(repo) };
    },
    changesetPre: (args) => {
      calls.push(`pre:${args.join(' ')}`);
      if (args[0] === 'enter') writePre(repo.work, 'pre', args[1] ?? '');
      if (args[0] === 'exit') {
        const state = readPreState(repo.work);
        writePre(repo.work, 'exit', state.ok && state.value.mode === 'pre' ? state.value.tag : '');
      }
      return ok;
    },
    verify: () => {
      calls.push('verify');
      return ok;
    },
    changesetVersion: () => {
      calls.push('changesetVersion');
      const planned = plannedStatus(repo);
      const version = planned.kind === 'release' ? planned.version : '0.2.0';
      const inPre = readPreState(repo.work);
      for (const name of ['a', 'b']) {
        const file = join(repo.work, 'packages', name, 'package.json');
        const json = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
        json['version'] = version;
        writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
      }
      // 実物と同じく、pre mode 中は changeset の md を消さず、pre exit 後の version で pre.json を消す
      if (!(inPre.ok && inPre.value.mode === 'pre')) {
        unlinkSync(join(repo.work, '.changeset', 'x.md'));
      }
      const preFile = join(repo.work, '.changeset', 'pre.json');
      if (existsSync(preFile) && !(inPre.ok && inPre.value.mode === 'pre')) unlinkSync(preFile);
      return ok;
    },
    prettier: () => {
      calls.push('prettier');
      return ok;
    },
    checkRelease: () => {
      calls.push('checkRelease');
      return ok;
    },
    consumer: () => {
      calls.push('consumer');
      return ok;
    },
    ghRelease: () => notFound,
    confirm: async () => true,
    log: (line) => logs.push(line),
    ...overrides,
  };
  return { deps, gitCalls, logs, calls };
}

interface Snapshot {
  head: string;
  localTags: string;
  originMaster: string;
  originTags: string;
}

function snapshot(repo: Repo): Snapshot {
  return {
    head: mustGit(repo.work, ['rev-parse', 'HEAD']),
    localTags: mustGit(repo.work, ['tag', '-l']),
    originMaster: mustGit(repo.bare, ['rev-parse', 'master']),
    originTags: mustGit(repo.bare, ['tag', '-l']),
  };
}

function assertUnchanged(repo: Repo, before: Snapshot): void {
  assert.deepEqual(snapshot(repo), before);
}

const failing: Check<void> = { ok: false, errors: ['boom'] };

// 正常系

test('normal release: commit and annotated tag exist locally and on origin, tree is clean, no force', async () => {
  const repo = makeRepo();
  const fake = fakeDeps(repo);
  const outcome = await runRelease(normal, fake.deps);
  assert.deepEqual(outcome, { status: 'released', tag: 'v0.2.0' });
  for (const dir of [repo.work, repo.bare]) {
    assert.equal(mustGit(dir, ['log', '-1', '--format=%s', 'master']), 'chore: release v0.2.0');
    assert.equal(mustGit(dir, ['cat-file', '-t', 'v0.2.0']), 'tag');
  }
  assert.equal(
    mustGit(repo.work, ['rev-parse', 'v0.2.0^{commit}']),
    mustGit(repo.bare, ['rev-parse', 'master'])
  );
  assert.equal(mustGit(repo.work, ['status', '--porcelain']), '');
  for (const args of fake.gitCalls) {
    for (const arg of args) {
      assert.ok(
        arg !== '--force' && arg !== '-f' && !arg.startsWith('+'),
        `unsafe git argument ${arg}`
      );
    }
  }
  assert.deepEqual(fake.calls, [
    'verifyTrust',
    'changesetStatus',
    'verify',
    'changesetVersion',
    'prettier',
    'checkRelease',
    'consumer',
  ]);
});

// 段 1

test('stage 1: stops without side effects when the branch is not master', async () => {
  const repo = makeRepo();
  mustGit(repo.work, ['checkout', '-b', 'topic']);
  const before = snapshot(repo);
  const fake = fakeDeps(repo);
  const outcome = await runRelease(normal, fake.deps);
  assert.equal(outcome.status, 'stopped');
  assertUnchanged(repo, before);
  assert.equal(fake.calls.includes('changesetVersion'), false);
});

test('stage 1: stops when the working tree is dirty', async () => {
  const repo = makeRepo();
  writeFileSync(join(repo.work, 'packages', 'a', 'dirty.txt'), 'x');
  const before = snapshot(repo);
  const fake = fakeDeps(repo);
  assert.equal((await runRelease(normal, fake.deps)).status, 'stopped');
  assertUnchanged(repo, before);
  assert.equal(fake.calls.includes('changesetVersion'), false);
});

test('stage 1: stops when origin/master is ahead of HEAD', async () => {
  const repo = makeRepo();
  writeFileSync(join(repo.other, 'new.txt'), 'x');
  mustGit(repo.other, ['add', '-A']);
  mustGit(repo.other, ['commit', '-m', 'ahead']);
  mustGit(repo.other, ['push', 'origin', 'master']);
  const before = snapshot(repo);
  const fake = fakeDeps(repo);
  assert.equal((await runRelease(normal, fake.deps)).status, 'stopped');
  assertUnchanged(repo, before);
  assert.equal(fake.calls.includes('changesetVersion'), false);
});

test('stage 1: stops when there is no changeset other than README', async () => {
  const repo = makeRepo({ changeset: false });
  const before = snapshot(repo);
  const fake = fakeDeps(repo);
  assert.equal((await runRelease(normal, fake.deps)).status, 'stopped');
  assertUnchanged(repo, before);
  assert.equal(fake.calls.includes('changesetVersion'), false);
});

// 段 2 以降

const REVERT = 'git checkout -- . && git clean -fd .changeset packages';

const stopCases: [string, (repo: Repo) => Partial<ReleaseDeps>][] = [
  ['changesetVersion fails', () => ({ changesetVersion: () => failing })],
  ['prettier fails', () => ({ prettier: () => failing })],
  ['checkRelease fails', () => ({ checkRelease: () => failing })],
  ['consumer fails', () => ({ consumer: () => failing })],
  ['confirm is declined', () => ({ confirm: async () => false })],
  [
    'the tag exists only locally',
    (repo) => ({
      changesetVersion: () => {
        mustGit(repo.work, ['tag', 'v0.2.0']);
        return fakeDeps(repo).deps.changesetVersion();
      },
    }),
  ],
  [
    'the tag exists only on origin',
    (repo) => ({
      changesetVersion: () => {
        mustGit(repo.other, ['tag', 'v0.2.0']);
        mustGit(repo.other, ['push', 'origin', 'v0.2.0']);
        return fakeDeps(repo).deps.changesetVersion();
      },
    }),
  ],
];
for (const [label, make] of stopCases) {
  test(`stops with no commit or tag and prints the revert command when ${label}`, async () => {
    const repo = makeRepo();
    const overrides = make(repo);
    const before = snapshot(repo);
    const fake = fakeDeps(repo, overrides);
    const outcome = await runRelease(normal, fake.deps);
    assert.equal(outcome.status, 'stopped');
    const after = snapshot(repo);
    assert.equal(after.head, before.head);
    assert.equal(after.originMaster, before.originMaster);
    // 事前に仕込んだ tag 以外は増えない
    assert.equal(after.localTags.includes('chore'), false);
    assert.ok(
      fake.logs.some((l) => l.includes(REVERT)),
      fake.logs.join('\n')
    );
  });
}

test('stops fail-closed when git ls-remote fails', async () => {
  const repo = makeRepo();
  const before = snapshot(repo);
  const fake = fakeDeps(repo, {
    git: (args) =>
      args[0] === 'ls-remote'
        ? { status: 128, stdout: '', stderr: 'fatal: unreachable' }
        : gitIn(repo.work, args),
  });
  assert.equal((await runRelease(normal, fake.deps)).status, 'stopped');
  const after = snapshot(repo);
  assert.equal(after.head, before.head);
  assert.equal(after.localTags, before.localTags);
  assert.equal(after.originTags, before.originTags);
});

test('stops when origin cannot be reached at all (URL points nowhere)', async () => {
  const repo = makeRepo();
  mustGit(repo.work, ['remote', 'set-url', 'origin', join(dirname(repo.bare), 'missing.git')]);
  const before = snapshot(repo);
  const fake = fakeDeps(repo);
  assert.equal((await runRelease(normal, fake.deps)).status, 'stopped');
  const after = snapshot(repo);
  assert.equal(after.head, before.head);
  assert.equal(after.localTags, before.localTags);
});

test('stage 7: a rejected push leaves origin untouched and prints how to drop the local commit and tag', async () => {
  const repo = makeRepo();
  const before = snapshot(repo);
  const fake = fakeDeps(repo, {
    confirm: async () => {
      writeFileSync(join(repo.other, 'race.txt'), 'x');
      mustGit(repo.other, ['add', '-A']);
      mustGit(repo.other, ['commit', '-m', 'race']);
      mustGit(repo.other, ['push', 'origin', 'master']);
      return true;
    },
  });
  const outcome = await runRelease(normal, fake.deps);
  assert.equal(outcome.status, 'stopped');
  assert.equal(
    mustGit(repo.bare, ['rev-parse', 'master']),
    mustGit(repo.other, ['rev-parse', 'HEAD'])
  );
  assert.notEqual(mustGit(repo.bare, ['rev-parse', 'master']), before.head);
  assert.equal(mustGit(repo.bare, ['tag', '-l']), '');
  assert.ok(
    fake.logs.some((l) => l.includes('git tag -d v0.2.0 && git reset --hard origin/master')),
    fake.logs.join('\n')
  );
});

// --tag-only

function tagOnlyRepo(): Repo {
  return makeRepo({ changeset: false, version: '0.2.0' });
}

test('tag-only: pushes only the tag and does not touch origin/master or run changeset version', async () => {
  const repo = tagOnlyRepo();
  const masterBefore = mustGit(repo.bare, ['rev-parse', 'master']);
  const fake = fakeDeps(repo);
  const outcome = await runRelease(tagOnlyFlags, fake.deps);
  assert.deepEqual(outcome, { status: 'tag-pushed', tag: 'v0.2.0' });
  assert.equal(mustGit(repo.bare, ['tag', '-l']), 'v0.2.0');
  assert.equal(mustGit(repo.bare, ['rev-parse', 'master']), masterBefore);
  assert.equal(fake.calls.includes('changesetVersion'), false);
});

const tagOnlyStops: [string, (repo: Repo) => Partial<ReleaseDeps> | undefined][] = [
  [
    'the tag exists locally',
    (repo) => {
      mustGit(repo.work, ['tag', 'v0.2.0']);
      return undefined;
    },
  ],
  [
    'the tag exists on origin',
    (repo) => {
      mustGit(repo.work, ['tag', 'v0.2.0']);
      mustGit(repo.work, ['push', 'origin', 'v0.2.0']);
      mustGit(repo.work, ['tag', '-d', 'v0.2.0']);
      return undefined;
    },
  ],
  ['a GitHub Release exists', () => ({ ghRelease: () => ({ kind: 'found' }) })],
  [
    'the GitHub Release lookup errors',
    () => ({ ghRelease: () => ({ kind: 'error', message: 'HTTP 401' }) }),
  ],
  [
    'versions differ',
    (repo) => {
      const file = join(repo.work, 'packages', 'b', 'package.json');
      writeFileSync(file, `${JSON.stringify({ name: '@fx/b', version: '0.2.1' })}\n`);
      mustGit(repo.work, ['commit', '-am', 'diverge']);
      mustGit(repo.work, ['push', 'origin', 'master']);
      return undefined;
    },
  ],
  ['checkRelease fails', () => ({ checkRelease: () => failing })],
];
for (const [label, setup] of tagOnlyStops) {
  test(`tag-only: changes nothing when ${label}`, async () => {
    const repo = tagOnlyRepo();
    const overrides = setup(repo);
    const before = snapshot(repo);
    const fake = fakeDeps(repo, overrides);
    assert.equal((await runRelease(tagOnlyFlags, fake.deps)).status, 'stopped');
    const after = snapshot(repo);
    assert.equal(after.head, before.head);
    assert.equal(after.originMaster, before.originMaster);
    assert.equal(after.originTags, before.originTags);
    // git fetch は origin にある tag を local に取り込むので、増えるとしても origin にあるものだけ
    assert.ok(after.localTags === before.localTags || after.localTags === before.originTags);
  });
}

test('tag-only: a rejected tag push leaves origin untouched and prints how to drop the local tag', async () => {
  const repo = tagOnlyRepo();
  const fake = fakeDeps(repo, {
    confirm: async () => {
      // 別の commit を指す同名の tag を origin に先に作る
      writeFileSync(join(repo.other, 'other.txt'), 'x');
      mustGit(repo.other, ['add', '-A']);
      mustGit(repo.other, ['commit', '-m', 'elsewhere']);
      mustGit(repo.other, ['tag', 'v0.2.0']);
      mustGit(repo.other, ['push', 'origin', 'v0.2.0']);
      return true;
    },
  });
  const masterBefore = mustGit(repo.bare, ['rev-parse', 'master']);
  const outcome = await runRelease(tagOnlyFlags, fake.deps);
  assert.equal(outcome.status, 'stopped');
  assert.equal(mustGit(repo.bare, ['rev-parse', 'master']), masterBefore);
  assert.notEqual(
    mustGit(repo.bare, ['rev-parse', 'v0.2.0^{commit}']),
    mustGit(repo.work, ['rev-parse', 'HEAD'])
  );
  assert.ok(
    fake.logs.some((l) => l.includes('git tag -d v0.2.0')),
    fake.logs.join('\n')
  );
});

// --- 段 1 の前提 (K5、K6、K8、K4) ---

function lineCollector(): { output: Output; text: () => string; chunks: string[] } {
  const chunks: string[] = [];
  return {
    output: createOutput((s) => chunks.push(s)),
    text: () => chunks.join(''),
    chunks,
  };
}

const trustStops: [string, TrustResult][] = [
  ['eotp', { kind: 'eotp' }],
  ['mismatch', { kind: 'mismatch', what: 'two entries' }],
  ['shape-unknown', { kind: 'shape-unknown', what: 'not json', rawPath: '/x/raw' }],
  ['command-failed', { kind: 'command-failed', what: 'exit 1' }],
];
for (const [label, result] of trustStops) {
  test(`stage 1: stops before versioning when trust is ${label}`, async () => {
    const repo = makeRepo();
    const before = snapshot(repo);
    const fake = fakeDeps(repo, { verifyTrust: async () => result });
    const outcome = await runRelease(normal, fake.deps);
    assert.equal(outcome.status, 'stopped');
    assert.equal(fake.calls.includes('changesetVersion'), false);
    assert.equal(fake.calls.includes('verify'), false);
    assertUnchanged(repo, before);
    assert.equal(mustGit(repo.work, ['status', '--porcelain']), '');
  });
}

test('stage 1: an EOTP stop tells the user to rerun and changes nothing', async () => {
  const repo = makeRepo();
  const fake = fakeDeps(repo, { verifyTrust: async () => ({ kind: 'eotp' }) });
  await runRelease(normal, fake.deps);
  assert.ok(
    fake.logs.some((l) => l.includes('rerun') && l.includes('2FA')),
    fake.logs.join('\n')
  );
});

test('stage 1: pnpm verify runs once, before changeset version', async () => {
  const repo = makeRepo();
  const fake = fakeDeps(repo);
  await runRelease(normal, fake.deps);
  assert.equal(fake.calls.filter((c) => c === 'verify').length, 1);
  assert.ok(fake.calls.indexOf('verify') < fake.calls.indexOf('changesetVersion'));
});

test('stage 1: pnpm verify also runs for --tag-only', async () => {
  const repo = tagOnlyRepo();
  const fake = fakeDeps(repo);
  await runRelease(tagOnlyFlags, fake.deps);
  assert.equal(fake.calls.filter((c) => c === 'verify').length, 1);
});

test('stage 1: stops when pnpm verify leaves a file behind, before any versioning', async () => {
  const repo = makeRepo();
  const fake = fakeDeps(repo, {
    verify: () => {
      writeFileSync(join(repo.work, 'junk.txt'), 'x');
      return ok;
    },
  });
  const outcome = await runRelease(normal, fake.deps);
  assert.equal(outcome.status, 'stopped');
  assert.equal(outcome.status === 'stopped' ? outcome.stage : '', '1 prerequisites');
  assert.equal(fake.calls.includes('changesetVersion'), false);
});

// --- 段 2〜6 (K7、K8、K9、明示の add) ---

function revertIn(repo: Repo): void {
  assertUnderTmp(repo.work);
  const r = spawnSync('sh', ['-c', REVERT], { cwd: repo.work, env: gitEnv, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
}

function stoppedStage(outcome: ReleaseOutcome): string {
  return outcome.status === 'stopped' ? outcome.stage : '';
}

test('stage 2: restores ignored packages one path per line and keeps them out of the commit', async () => {
  const repo = makeRepo({ ignored: true });
  const privBefore = readFileSync(join(repo.work, 'packages', 'priv', 'package.json'), 'utf8');
  const base = fakeDeps(repo).deps.changesetVersion;
  const fake = fakeDeps(repo, {
    changesetVersion: () => {
      writeFileSync(
        join(repo.work, 'packages', 'priv', 'package.json'),
        `${JSON.stringify({ name: '@fx/priv', version: '0.0.1', private: true })}\n`
      );
      writeFileSync(join(repo.work, 'packages', 'priv', 'CHANGELOG.md'), '# priv\n');
      return base();
    },
  });
  const outcome = await runRelease(normal, fake.deps);
  assert.equal(outcome.status, 'released');
  assert.ok(fake.logs.some((l) => l.includes('restored packages/priv/package.json')));
  assert.ok(fake.logs.some((l) => l.includes('removed packages/priv/CHANGELOG.md')));
  const committed = mustGit(repo.work, ['show', '--name-only', '--format=', 'HEAD']);
  assert.equal(committed.includes('packages/priv'), false, committed);
  assert.equal(
    readFileSync(join(repo.work, 'packages', 'priv', 'package.json'), 'utf8'),
    privBefore
  );
  assert.equal(existsSync(join(repo.work, 'packages', 'priv', 'CHANGELOG.md')), false);
  assert.equal(mustGit(repo.work, ['status', '--porcelain']), '');
});

test('stage 2: stops and prints the revert command when changeset version touches an unexpected file', async () => {
  const repo = makeRepo();
  const base = fakeDeps(repo).deps.changesetVersion;
  const fake = fakeDeps(repo, {
    changesetVersion: () => {
      mkdirSync(join(repo.work, 'scripts'), { recursive: true });
      writeFileSync(join(repo.work, 'scripts', 'x.ts'), 'export {};\n');
      return base();
    },
  });
  const outcome = await runRelease(normal, fake.deps);
  assert.equal(stoppedStage(outcome), '2 versioning');
  assert.ok(fake.logs.some((l) => l.includes(REVERT)));
  assert.equal(fake.calls.includes('prettier'), false);
});

test('stage 2: stops at the second allow-list check when prettier changes unexpected files', async () => {
  const repo = makeRepo();
  const fake = fakeDeps(repo, {
    prettier: () => {
      mkdirSync(join(repo.work, 'scripts'), { recursive: true });
      writeFileSync(join(repo.work, 'scripts', 'stray.txt'), 'x');
      writeFileSync(join(repo.work, 'packages', 'a', 'README.md'), 'changed\n');
      return ok;
    },
  });
  const outcome = await runRelease(normal, fake.deps);
  assert.equal(stoppedStage(outcome), '2 versioning');
  assert.ok(fake.logs.some((l) => l.includes(REVERT)));
  assert.equal(fake.calls.includes('checkRelease'), false);
});

test('stage 6: the commit contains exactly the paths the allow list returned', async () => {
  const repo = makeRepo();
  const fake = fakeDeps(repo);
  const outcome = await runRelease(normal, fake.deps);
  assert.equal(outcome.status, 'released');
  const committed = mustGit(repo.work, ['show', '--name-only', '--format=', 'HEAD'])
    .split('\n')
    .sort();
  assert.deepEqual(committed, [
    '.changeset/x.md',
    'packages/a/package.json',
    'packages/b/package.json',
  ]);
  assert.ok(
    fake.gitCalls.some((a) => a[0] === 'add' && a.every((x) => x !== '-A' && x !== '.')),
    'add must name the allowed paths'
  );
});

test('--pre beta: declining at stage 5 leaves a revert command that removes pre.json and cleans the tree', async () => {
  const repo = makeRepo();
  const fake = fakeDeps(repo, { confirm: async () => false });
  const outcome = await runRelease({ mode: 'pre', tag: 'beta' }, fake.deps);
  assert.equal(stoppedStage(outcome), '5 confirmation');
  assert.ok(fake.calls.includes('pre:enter beta'));
  assert.equal(existsSync(join(repo.work, '.changeset', 'pre.json')), true);
  assert.ok(fake.logs.some((l) => l.includes(REVERT)));
  revertIn(repo);
  assert.equal(existsSync(join(repo.work, '.changeset', 'pre.json')), false);
  assert.equal(mustGit(repo.work, ['status', '--porcelain']), '');
});

test('--exit-pre: the revert command also restores a deleted pre.json', async () => {
  const repo = makeRepo({ preTag: 'beta' });
  const fake = fakeDeps(repo, {
    // exit 後の版を 0.3.0 にして、段 5 で止める
    changesetStatus: () => ({ ok: true, value: { kind: 'release', version: '0.3.0' } }),
    confirm: async () => false,
  });
  const outcome = await runRelease({ mode: 'exit-pre' }, fake.deps);
  assert.equal(stoppedStage(outcome), '5 confirmation');
  assert.equal(existsSync(join(repo.work, '.changeset', 'pre.json')), false);
  revertIn(repo);
  assert.equal(existsSync(join(repo.work, '.changeset', 'pre.json')), true);
  assert.equal(mustGit(repo.work, ['status', '--porcelain']), '');
});

test('--pre beta in a beta pre mode does not call changeset pre', async () => {
  const repo = makeRepo({ preTag: 'beta' });
  const fake = fakeDeps(repo, { confirm: async () => false });
  await runRelease({ mode: 'pre', tag: 'beta' }, fake.deps);
  assert.deepEqual(
    fake.calls.filter((c) => c.startsWith('pre:')),
    []
  );
});

test('--pre beta in an rc pre mode exits and then enters beta, in that order', async () => {
  const repo = makeRepo({ preTag: 'rc' });
  const fake = fakeDeps(repo, { confirm: async () => false });
  await runRelease({ mode: 'pre', tag: 'beta' }, fake.deps);
  assert.deepEqual(
    fake.calls.filter((c) => c.startsWith('pre:')),
    ['pre:exit', 'pre:enter beta']
  );
});

test('--exit-pre stops at stage 1 when there is no pre mode', async () => {
  const repo = makeRepo();
  const before = snapshot(repo);
  const fake = fakeDeps(repo);
  const outcome = await runRelease({ mode: 'exit-pre' }, fake.deps);
  assert.equal(stoppedStage(outcome), '1 prerequisites');
  assert.equal(fake.calls.includes('changesetVersion'), false);
  assertUnchanged(repo, before);
});

test('--pre beta stops at stage 3 when the re-decided version already has a tag on origin', async () => {
  const repo = makeRepo();
  mustGit(repo.other, ['tag', 'v0.2.0-beta.0']);
  mustGit(repo.other, ['push', 'origin', 'v0.2.0-beta.0']);
  const fake = fakeDeps(repo);
  const outcome = await runRelease({ mode: 'pre', tag: 'beta' }, fake.deps);
  assert.equal(stoppedStage(outcome), '3 publish preconditions');
  assert.equal(fake.calls.includes('consumer'), false);
});

// --- main の骨格と、テストできる adapter (T1) ---

test('createOutput strips ESC and bidi controls from lines and chunks', () => {
  const c = lineCollector();
  c.output.emit('a\u001b[2Jb‮');
  c.output.emitChunk('x\u001b[31my‮z');
  const all = c.text();
  assert.equal(all.includes('\u001b'), false);
  assert.equal(all.includes('‮'), false);
  assert.ok(all.includes('a[2Jb') && all.includes('x[31myz'));
});

// 子の stdio を PassThrough で模す偽の spawn
class FakeChild extends EventEmitter {
  stdout: PassThrough | null;
  stderr: PassThrough | null;
  killed = false;
  constructor(stdio: SpawnOptionsLike['stdio']) {
    super();
    this.stdout = stdio[1] === 'pipe' ? new PassThrough() : null;
    this.stderr = stdio[2] === 'pipe' ? new PassThrough() : null;
  }
  kill(): boolean {
    this.killed = true;
    return true;
  }
  async finish(stdout: string | Buffer, stderr: string, code: number | null): Promise<void> {
    const ended: Promise<unknown>[] = [];
    if (this.stdout) {
      ended.push(once(this.stdout, 'end'));
      this.stdout.end(stdout);
    }
    if (this.stderr) {
      ended.push(once(this.stderr, 'end'));
      this.stderr.end(stderr);
    }
    await Promise.all(ended);
    this.emit('close', code, null);
  }
}

interface SpawnCall {
  cmd: string;
  args: string[];
  options: SpawnOptionsLike;
  child: FakeChild;
}

function fakeSpawn(
  respond: (call: SpawnCall) => Promise<void> | void = (call) => call.child.finish('', '', 0)
): { spawn: SpawnFn; calls: SpawnCall[] } {
  const calls: SpawnCall[] = [];
  const spawn: SpawnFn = (cmd, args, options) => {
    const child = new FakeChild(options.stdio);
    const call = { cmd, args, options, child };
    calls.push(call);
    setImmediate(() => void respond(call));
    return child as unknown as ChildLike;
  };
  return { spawn, calls };
}

const REGISTRY_ARGS = [
  '--registry',
  'https://registry.npmjs.org/',
  '--@kanbun-skam:registry=https://registry.npmjs.org/',
];

const dirtyEnv = {
  PATH: '/usr/bin',
  NPM_CONFIG_REGISTRY: 'https://example.com/',
  npm_config_foo: 'bar',
  GH_HOST: 'ghe.example.com',
  GH_REPO: 'x/y',
};

test('createRunner: npm gets the fixed registry arguments, no shell, and a cleaned env', async () => {
  const { spawn, calls } = fakeSpawn();
  const run = createRunner(spawn, lineCollector().output, { env: dirtyEnv });
  await run('npm', ['view', 'x'], { stdio: 'pipe' });
  const call = calls[0];
  assert.deepEqual(call?.args, ['view', 'x', ...REGISTRY_ARGS]);
  assert.ok(!('shell' in (call?.options ?? {})));
  assert.equal(call?.options.env['NPM_CONFIG_REGISTRY'], undefined);
  assert.equal(call?.options.env['npm_config_foo'], undefined);
  assert.equal(call?.options.env['GH_HOST'], undefined);
  assert.equal(call?.options.env['GH_REPO'], undefined);
  assert.equal(call?.options.env['PATH'], '/usr/bin');
});

test('createRunner: gh api is pinned by host and gh other commands by repo', async () => {
  const { spawn, calls } = fakeSpawn();
  const run = createRunner(spawn, lineCollector().output, { env: dirtyEnv });
  await run('gh', ['api', 'repos/berlysia/kanbun-annotation/actions/runs/1'], { stdio: 'pipe' });
  await run('gh', ['release', 'view', 'v1.0.0'], { stdio: 'pipe' });
  assert.deepEqual(calls[0]?.args.slice(-2), ['--hostname', 'github.com']);
  assert.equal(calls[0]?.args.includes('--repo'), false);
  assert.deepEqual(calls[1]?.args.slice(-2), ['--repo', 'github.com/berlysia/kanbun-annotation']);
});

test('createRunner: raw leaves the arguments alone', async () => {
  const { spawn, calls } = fakeSpawn();
  const run = createRunner(spawn, lineCollector().output, { env: dirtyEnv });
  await run('npm', ['config', 'get', 'registry'], { stdio: 'pipe', raw: true });
  await run('gh', ['--version'], { stdio: 'pipe', raw: true });
  assert.deepEqual(calls[0]?.args, ['config', 'get', 'registry']);
  assert.deepEqual(calls[1]?.args, ['--version']);
});

test('createRunner: pipe collects stdout and stderr and passes stdin as ignore', async () => {
  const { spawn, calls } = fakeSpawn((c) => c.child.finish('out', 'err', 3));
  const run = createRunner(spawn, lineCollector().output, { env: dirtyEnv });
  const result = await run('git', ['x'], { stdio: 'pipe' });
  assert.deepEqual(result, { status: 3, stdout: 'out', stderr: 'err' });
  assert.equal(calls[0]?.options.stdio[0], 'ignore');
});

test('createRunner: pipe output over 64 MiB is a command-failed result and the child is killed', async () => {
  const { spawn, calls } = fakeSpawn((c) => {
    c.child.stdout?.write(Buffer.alloc(64 * 1024 * 1024 + 1));
    setImmediate(() => c.child.emit('close', 0, null));
  });
  const run = createRunner(spawn, lineCollector().output, { env: dirtyEnv });
  const result = await run('npm', ['view', 'x'], { stdio: 'pipe' });
  assert.equal(result.status, null);
  assert.ok(result.stderr.includes('command-failed'), result.stderr);
  assert.equal(calls[0]?.child.killed, true);
});

test('createRunner: inherit-keep-stderr inherits stdin and stdout, sanitizes stderr and keeps it', async () => {
  const { spawn, calls } = fakeSpawn((c) => c.child.finish('', 'E409 \u001b[2Jconflict', 1));
  const out = lineCollector();
  const run = createRunner(spawn, out.output, { env: dirtyEnv });
  const result = await run('npm', ['stage', 'approve', 'id'], { stdio: 'inherit-keep-stderr' });
  assert.deepEqual(calls[0]?.options.stdio, ['inherit', 'inherit', 'pipe']);
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes('E409'));
  assert.equal(out.text().includes('\u001b'), false);
  assert.ok(out.text().includes('E409'));
});

test('createRunner: a spawn that throws becomes a failed result', async () => {
  const run = createRunner(
    () => {
      throw new Error('ENOENT');
    },
    lineCollector().output,
    { env: dirtyEnv }
  );
  const result = await run('npm', ['x'], { stdio: 'pipe' });
  assert.equal(result.status, null);
  assert.ok(result.stderr.includes('ENOENT'));
});

async function pump(
  chunks: (string | Buffer)[],
  cap: number
): Promise<{ kept: string; shown: string }> {
  const source = new PassThrough();
  const shown: string[] = [];
  const output: Output = { emit: (l) => shown.push(l), emitChunk: (t) => shown.push(t) };
  const done = pumpSanitizedStderr(source as Readable, output, cap);
  for (const chunk of chunks) source.write(chunk);
  source.end();
  return { kept: await done, shown: shown.join('') };
}

test('pumpSanitizedStderr: ESC never reaches the output but the raw text keeps E409', async () => {
  const { kept, shown } = await pump(['npm error \u001b[2J E409 conflict'], 1024);
  assert.equal(shown.includes('\u001b'), false);
  assert.ok(kept.includes('E409'));
});

test('pumpSanitizedStderr: the kept text stops at the cap', async () => {
  const mib = 1024 * 1024;
  const { kept } = await pump(['a'.repeat(mib), 'b'.repeat(mib)], mib);
  assert.equal(Buffer.byteLength(kept), mib);
  assert.equal(kept.includes('b'), false);
});

test('pumpSanitizedStderr: a 3-byte character split across two chunks comes out as one character', async () => {
  const bytes = Buffer.from('あ');
  const { shown } = await pump([bytes.subarray(0, 1), bytes.subarray(1)], 1024);
  assert.equal(shown, 'あ');
});

// confirm

type ReaderScript = (rl: FakeLineReader, answer: (text: string) => void) => void;

class FakeLineReader extends EventEmitter implements LineReader {
  closed = 0;
  private readonly script: ReaderScript;
  constructor(script: ReaderScript) {
    super();
    this.script = script;
  }
  question(): Promise<string> {
    return new Promise((resolve) => this.script(this, resolve));
  }
  close(): void {
    this.closed += 1;
  }
}

function fakeInterface(script: ReaderScript): { create: CreateInterface; made: FakeLineReader[] } {
  const made: FakeLineReader[] = [];
  const create: CreateInterface = () => {
    const rl = new FakeLineReader(script);
    made.push(rl);
    return rl;
  };
  return { create, made };
}

for (const [input, expected] of [
  ['y', true],
  ['Y', true],
  ['yes', true],
  ['YES', true],
  ['n', false],
  ['', false],
  ['yep', false],
] as const) {
  test(`createConfirm: ${JSON.stringify(input)} is ${expected}`, async () => {
    const { create, made } = fakeInterface((_rl, answer) => answer(input));
    const confirm = createConfirm(create, lineCollector().output, new PassThrough());
    assert.equal(await confirm('Go?'), expected);
    assert.equal(made[0]?.closed, 1);
  });
}

test('createConfirm: EOF (close) is false and the interface is closed', async () => {
  const { create, made } = fakeInterface((rl) => setImmediate(() => rl.emit('close')));
  const confirm = createConfirm(create, lineCollector().output, new PassThrough());
  assert.equal(await confirm('Go?'), false);
  assert.equal(made[0]?.closed, 1);
});

test('createConfirm: ESC in the question is stripped from the output', async () => {
  const { create } = fakeInterface((_rl, answer) => answer('y'));
  const out = lineCollector();
  await createConfirm(create, out.output, new PassThrough())('Release \u001b[2Jv1?');
  assert.equal(out.text().includes('\u001b'), false);
  assert.ok(out.text().includes('Release'));
});

// verifyTrustWith

const GOOD_TRUST = JSON.stringify([
  {
    id: 'i',
    type: 'github',
    file: 'release.yml',
    repository: 'berlysia/kanbun-annotation',
    environment: 'npm',
    permissions: ['createStagedPackage'],
  },
]);

function trustHarness(pipeResult: (name: string) => CommandResult): {
  run: Runner;
  calls: { cmd: string; args: readonly string[]; stdio: string }[];
  saved: { name: string; content: string }[][];
  saveRaw: (files: readonly { name: string; content: string }[]) => string;
} {
  const calls: { cmd: string; args: readonly string[]; stdio: string }[] = [];
  const saved: { name: string; content: string }[][] = [];
  const run: Runner = async (cmd, args, options) => {
    calls.push({ cmd, args, stdio: options.stdio });
    if (options.stdio === 'inherit') return { status: 0, stdout: '', stderr: '' };
    return pipeResult(args[2] ?? '');
  };
  return {
    run,
    calls,
    saved,
    saveRaw: (files) => {
      saved.push([...files]);
      return '/x/.tmp/release/trust-stamp';
    },
  };
}

const SIX = ['@fx/n0', '@fx/n1', '@fx/n2', '@fx/n3', '@fx/n4', '@fx/n5'];

test('verifyTrustWith: six ok lookups are ok and the raw output is saved once', async () => {
  const h = trustHarness(() => ({ status: 0, stdout: GOOD_TRUST, stderr: '' }));
  const out = lineCollector();
  const result = await verifyTrustWith(h.run, h.saveRaw, out.output, SIX);
  assert.deepEqual(result, { kind: 'ok' });
  assert.equal(h.saved.length, 1);
  assert.equal(h.saved[0]?.length, 6);
  assert.deepEqual(h.calls[0], {
    cmd: 'npm',
    args: ['trust', 'list', '@fx/n0'],
    stdio: 'inherit',
  });
  assert.equal(h.calls.filter((c) => c.stdio === 'pipe').length, 6);
  assert.ok(out.text().includes('2FA'));
  assert.ok(out.text().includes('trust-stamp'));
});

test('verifyTrustWith: one EOTP is eotp and the raw output is still saved', async () => {
  const h = trustHarness((name) =>
    name === '@fx/n3'
      ? { status: 1, stdout: '', stderr: 'npm error code EOTP' }
      : { status: 0, stdout: GOOD_TRUST, stderr: '' }
  );
  const result = await verifyTrustWith(h.run, h.saveRaw, lineCollector().output, SIX);
  assert.equal(result.kind, 'eotp');
  assert.equal(h.saved.length, 1);
});

test('verifyTrustWith: a shape the checker does not know carries the saved path', async () => {
  const h = trustHarness(() => ({ status: 0, stdout: 'not json', stderr: '' }));
  const result = await verifyTrustWith(h.run, h.saveRaw, lineCollector().output, SIX);
  assert.deepEqual(result, {
    kind: 'shape-unknown',
    what: 'npm trust list output is not JSON',
    rawPath: '/x/.tmp/release/trust-stamp',
  });
});

// main

interface MainOptions {
  stdin?: boolean;
  stdout?: boolean;
  npm?: string;
  registry?: string;
  scoped?: string;
  // a は版を公開済み、b は未公開なら 'partial'
  published?: 'none' | 'partial' | 'all';
  status?: ChangesetStatus;
  front?: ReleaseOutcome;
  // true なら前半は偽の changesets + 実 git の runRelease (版上げ、commit、tag、push が実際に起きる)
  realFront?: boolean;
  afterPush?: AfterPushResult;
  throwOnGit?: string;
}

interface MainFake {
  deps: MainDeps;
  lines: () => string;
  runCalls: string[][];
  gitCalls: string[][];
  frontFlags: ReleaseFlags[];
  confirmCalls: string[];
  afterPushInputs: AfterPushInput[];
  interruptInstalls: () => number;
  releaseCalls: string[];
}

function fakeMain(repo: Repo, options: MainOptions = {}): MainFake {
  const out = lineCollector();
  const runCalls: string[][] = [];
  const gitCalls: string[][] = [];
  const frontFlags: ReleaseFlags[] = [];
  const confirmCalls: string[] = [];
  const afterPushInputs: AfterPushInput[] = [];
  let interruptInstalls = 0;
  const base = fakeDeps(repo);
  const status = options.status;
  const git: ReleaseDeps['git'] = (args) => {
    gitCalls.push(args);
    if (options.throwOnGit !== undefined) throw new Error(options.throwOnGit);
    return gitIn(repo.work, args);
  };
  const release: ReleaseDeps = {
    ...base.deps,
    git,
    ...(status === undefined ? {} : { changesetStatus: () => ({ ok: true, value: status }) }),
    confirm: async (q) => {
      confirmCalls.push(q);
      return true;
    },
    log: (l) => out.output.emit(l),
  };
  const published = options.published ?? 'none';
  const run: Runner = async (cmd, args) => {
    runCalls.push([cmd, ...args]);
    const joined = [cmd, ...args].join(' ');
    const reply = (stdout: string): CommandResult => ({ status: 0, stdout, stderr: '' });
    if (joined === 'npm --version') return reply(options.npm ?? '12.2.0\n');
    if (joined === 'gh --version') return reply('gh version 2.45.0 (2024-01-01)\n');
    if (joined === 'npm config get registry') {
      return reply(options.registry ?? 'https://registry.npmjs.org/\n');
    }
    if (joined === 'npm config get @kanbun-skam:registry') {
      return reply(options.scoped ?? 'undefined\n');
    }
    if (cmd === 'npm' && args[0] === 'view') {
      const version = pkgVersion(repo, 'a');
      const has = published === 'all' || (published === 'partial' && args[1] === '@fx/a');
      return reply(JSON.stringify(has ? ['0.0.9', version] : ['0.0.9']));
    }
    throw new Error(`unexpected command: ${joined}`);
  };
  const deps: MainDeps = {
    streams: { stdinIsTTY: options.stdin ?? true, stdoutIsTTY: options.stdout ?? true },
    output: out.output,
    git,
    run,
    release,
    runFront: async (flags, releaseDeps) => {
      frontFlags.push(flags);
      if (options.realFront === true) return runRelease(flags, releaseDeps);
      return options.front ?? { status: 'released', tag: 'v0.2.0' };
    },
    afterPush: async (input) => {
      afterPushInputs.push(input);
      return options.afterPush ?? { kind: 'completed' };
    },
    installInterruptHandler: () => {
      interruptInstalls += 1;
    },
  };
  return {
    deps,
    lines: out.text,
    runCalls,
    gitCalls,
    frontFlags,
    confirmCalls,
    afterPushInputs,
    interruptInstalls: () => interruptInstalls,
    releaseCalls: base.calls,
  };
}

function pkgVersion(repo: Repo, dir: string): string {
  const json = JSON.parse(
    readFileSync(join(repo.work, 'packages', dir, 'package.json'), 'utf8')
  ) as { version: string };
  return json.version;
}

function tagOriginAtHead(repo: Repo, tag: string): void {
  mustGit(repo.work, ['tag', '-a', tag, '-m', tag]);
  mustGit(repo.work, ['push', 'origin', tag]);
  mustGit(repo.work, ['tag', '-d', tag]);
}

const ALL_FLAG_SETS: string[][] = [[], ['--tag-only'], ['--pre', 'beta'], ['--exit-pre']];

for (const tty of [
  { stdin: true, stdout: false },
  { stdin: false, stdout: true },
  { stdin: false, stdout: false },
]) {
  for (const argv of ALL_FLAG_SETS) {
    test(`main: stops at the entry and calls nothing when stdin=${tty.stdin} stdout=${tty.stdout} (${argv.join(' ') || 'no flags'})`, async () => {
      const repo = makeRepo();
      const fake = fakeMain(repo, tty);
      const code = await runMain(argv, fake.deps);
      assert.equal(code, 1);
      assert.equal(fake.gitCalls.length, 0);
      assert.equal(fake.runCalls.length, 0);
      assert.equal(fake.confirmCalls.length, 0);
      assert.equal(fake.frontFlags.length, 0);
      assert.ok(fake.lines().includes('terminal'), fake.lines());
    });
  }
}

test('main: npm 13.0.0 stops before any observation', async () => {
  const repo = makeRepo();
  const fake = fakeMain(repo, { npm: '13.0.0\n' });
  assert.equal(await runMain([], fake.deps), 1);
  assert.equal(fake.gitCalls.length, 0);
  assert.equal(
    fake.runCalls.some((c) => c[1] === 'view'),
    false
  );
});

test('main: npm 13.0.0 also stops an after-push entry (tag on origin at HEAD, partly published)', async () => {
  const repo = makeRepo({ changeset: false });
  tagOriginAtHead(repo, 'v0.1.0');
  const fake = fakeMain(repo, { npm: '13.0.0\n', published: 'partial' });
  assert.equal(await runMain([], fake.deps), 1);
  assert.equal(fake.gitCalls.length, 0);
  assert.ok(fake.lines().includes('13'), fake.lines());
});

test('main: a foreign scoped registry stops the run, and npm config get carries no --registry', async () => {
  const repo = makeRepo();
  const fake = fakeMain(repo, { scoped: 'https://registry.example.com/\n' });
  assert.equal(await runMain([], fake.deps), 1);
  const configCalls = fake.runCalls.filter((c) => c[0] === 'npm' && c[1] === 'config');
  assert.equal(configCalls.length, 2);
  for (const call of configCalls) {
    assert.equal(
      call.some((a) => a.startsWith('--registry') || a.startsWith('--@kanbun-skam')),
      false
    );
  }
  assert.equal(fake.frontFlags.length, 0);
  assert.ok(fake.lines().includes('registry.example.com'), fake.lines());
});

test('main: an after-push entry with a dirty working tree stops; with a clean tree it calls runAfterPush', async () => {
  const repo = makeRepo({ changeset: false });
  tagOriginAtHead(repo, 'v0.1.0');
  writeFileSync(join(repo.work, 'dirty.txt'), 'x');
  const dirty = fakeMain(repo, { published: 'partial' });
  assert.equal(await runMain([], dirty.deps), 1);
  assert.ok(dirty.lines().includes('not clean'), dirty.lines());
  assert.equal(dirty.afterPushInputs.length, 0);
  assert.equal(dirty.interruptInstalls(), 0);
  unlinkSync(join(repo.work, 'dirty.txt'));
  const clean = fakeMain(repo, { published: 'partial' });
  assert.equal(await runMain([], clean.deps), 0);
  assert.equal(clean.afterPushInputs.length, 1);
  assert.equal(clean.frontFlags.length, 0);
});

test('main: an after-push entry calls runAfterPush once with the origin tag, and neither verify nor changeset version', async () => {
  const repo = makeRepo({ changeset: false });
  tagOriginAtHead(repo, 'v0.1.0');
  const head = mustGit(repo.work, ['rev-parse', 'HEAD']);
  const fake = fakeMain(repo, { published: 'partial' });
  await runMain([], fake.deps);
  assert.deepEqual(fake.afterPushInputs, [
    {
      tag: 'v0.1.0',
      tagCommit: head,
      version: '0.1.0',
      names: ['@fx/a', '@fx/b'],
      checkOnly: false,
    },
  ]);
  assert.equal(fake.releaseCalls.includes('verify'), false);
  assert.equal(fake.releaseCalls.includes('changesetVersion'), false);
  assert.equal(fake.frontFlags.length, 0);
  assert.equal(fake.interruptInstalls(), 1);
});

test('main: the check-only entry (row 8: released, all published, no pending changeset) passes checkOnly', async () => {
  const repo = makeRepo({ changeset: false });
  tagOriginAtHead(repo, 'v0.1.0');
  const fake = fakeMain(repo, { published: 'all' });
  assert.equal(await runMain([], fake.deps), 0);
  assert.equal(fake.afterPushInputs.length, 1);
  assert.equal(fake.afterPushInputs[0]?.checkOnly, true);
});

test('main: package names are passed in dependency order, not alphabetical', async () => {
  const repo = makeRepo({ changeset: false });
  // @fx/a depends on @fx/b, so b comes first
  const file = join(repo.work, 'packages', 'a', 'package.json');
  const json = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  json['dependencies'] = { '@fx/b': '0.1.0' };
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
  mustGit(repo.work, ['commit', '-am', 'a depends on b']);
  mustGit(repo.work, ['push', 'origin', 'master']);
  tagOriginAtHead(repo, 'v0.1.0');
  const fake = fakeMain(repo, { published: 'partial' });
  await runMain([], fake.deps);
  assert.deepEqual(fake.afterPushInputs[0]?.names, ['@fx/b', '@fx/a']);
});

test('main: the current master state (0.1.1, no tag, only 0.1.0 on npm, status has a release) enters the front half', async () => {
  const repo = makeRepo({ version: '0.1.1' });
  const fake = fakeMain(repo, { status: { kind: 'release', version: '0.2.0' } });
  await runMain([], fake.deps);
  assert.deepEqual(fake.frontFlags, [{ mode: 'normal' }]);
});

test('main: --tag-only on a released tag with everything published stops at row 5 and changes nothing', async () => {
  const repo = makeRepo({ changeset: false, version: '0.2.0' });
  tagOriginAtHead(repo, 'v0.2.0');
  const before = snapshot(repo);
  const fake = fakeMain(repo, { published: 'all' });
  assert.equal(await runMain(['--tag-only'], fake.deps), 1);
  assert.ok(fake.lines().includes('already released'), fake.lines());
  assert.equal(fake.frontFlags.length, 0);
  assertUnchanged(repo, before);
});

test('main: a front half that released calls runAfterPush once, with the tag, commit and version of what it pushed', async () => {
  const repo = makeRepo({ version: '0.1.1' });
  const fake = fakeMain(repo, { status: { kind: 'release', version: '0.2.0' }, realFront: true });
  assert.equal(await runMain([], fake.deps), 0, fake.lines());
  const head = mustGit(repo.work, ['rev-parse', 'HEAD']);
  assert.deepEqual(fake.afterPushInputs, [
    {
      tag: 'v0.2.0',
      tagCommit: head,
      version: '0.2.0',
      names: ['@fx/a', '@fx/b'],
      checkOnly: false,
    },
  ]);
  assert.equal(fake.interruptInstalls(), 1);
});

test('main: a --tag-only front half that pushed the tag calls runAfterPush with the same input shape', async () => {
  const repo = makeRepo({ changeset: false, version: '0.2.0' });
  const fake = fakeMain(repo, { realFront: true });
  assert.equal(await runMain(['--tag-only'], fake.deps), 0, fake.lines());
  const head = mustGit(repo.work, ['rev-parse', 'HEAD']);
  assert.deepEqual(fake.afterPushInputs, [
    {
      tag: 'v0.2.0',
      tagCommit: head,
      version: '0.2.0',
      names: ['@fx/a', '@fx/b'],
      checkOnly: false,
    },
  ]);
});

test('main: a front half that stopped does not call runAfterPush or install the SIGINT handler', async () => {
  const repo = makeRepo({ version: '0.1.1' });
  const fake = fakeMain(repo, {
    status: { kind: 'release', version: '0.2.0' },
    front: { status: 'stopped', stage: '5 confirmation', reason: 'declined' },
  });
  assert.equal(await runMain([], fake.deps), 1);
  assert.equal(fake.afterPushInputs.length, 0);
  assert.equal(fake.interruptInstalls(), 0);
});

test('main: the exit code and the printed route follow the runAfterPush result', async () => {
  const stop: ClassifiedStop = {
    route: 'F3',
    reason: 'partly published',
    next: 'deprecate and patch',
    section: '### F3:',
    mayBeF3: false,
  };
  const cases: [AfterPushResult, number][] = [
    [{ kind: 'stopped', stop }, 1],
    [{ kind: 'declined' }, 0],
    [{ kind: 'post-check-failed', stops: [stop] }, 1],
    [{ kind: 'completed' }, 0],
  ];
  for (const [afterPush, code] of cases) {
    const repo = makeRepo({ changeset: false });
    tagOriginAtHead(repo, 'v0.1.0');
    const fake = fakeMain(repo, { published: 'partial', afterPush });
    assert.equal(await runMain([], fake.deps), code, afterPush.kind);
    if (afterPush.kind === 'stopped' || afterPush.kind === 'post-check-failed') {
      assert.ok(fake.lines().includes('[F3]'), fake.lines());
      assert.ok(fake.lines().includes('### F3:'), fake.lines());
    }
  }
});

test('createInterruptState: the handler is registered once; the first SIGINT only raises the flag, the second exits 1', () => {
  const handlers: (() => void)[] = [];
  const exits: number[] = [];
  const state = createInterruptState(
    (h) => handlers.push(h),
    (code) => exits.push(code)
  );
  assert.equal(state.interrupted(), false);
  state.install();
  state.install();
  assert.equal(handlers.length, 1);
  assert.equal(state.interrupted(), false);
  handlers[0]?.();
  assert.equal(state.interrupted(), true);
  assert.deepEqual(exits, []);
  handlers[0]?.();
  assert.deepEqual(exits, [1]);
});

test('main: a front half that stopped is reported as exit 1', async () => {
  const repo = makeRepo({ version: '0.1.1' });
  const fake = fakeMain(repo, {
    status: { kind: 'release', version: '0.2.0' },
    front: { status: 'stopped', stage: '5 confirmation', reason: 'declined' },
  });
  assert.equal(await runMain([], fake.deps), 1);
});

test('main: a dependency that throws is printed without control characters and exits 1', async () => {
  const repo = makeRepo();
  const fake = fakeMain(repo, { throwOnGit: 'boom\u001b[2J!' });
  assert.equal(await runMain([], fake.deps), 1);
  assert.equal(fake.lines().includes('\u001b'), false);
  assert.ok(fake.lines().includes('boom'), fake.lines());
});

test('reportOutcome: every outcome maps to its exit code', () => {
  const stop = { route: 'rerun', reason: 'r', next: 'n', section: 's', mayBeF3: false } as const;
  const cases: [Outcome, number][] = [
    [{ kind: 'entry-stopped', reason: 'x' }, 1],
    [{ kind: 'front-stopped', stage: 's', reason: 'x' }, 1],
    [{ kind: 'after-push-stopped', stop }, 1],
    [{ kind: 'declined' }, 0],
    [{ kind: 'post-check-failed', stops: [stop] }, 1],
    [{ kind: 'completed' }, 0],
  ];
  for (const [outcome, code] of cases) {
    assert.equal(reportOutcome(outcome, lineCollector().output), code, outcome.kind);
  }
});

test('reportOutcome: after-push-stopped and post-check-failed print the route, the next step and the releasing.md section', () => {
  const stops: ClassifiedStop[] = [
    {
      route: 'F2',
      reason: 'staged mismatch',
      next: 'reject it',
      section: '### F2:',
      mayBeF3: false,
    },
    {
      route: 'manual',
      reason: 'odd shape',
      next: 'by hand',
      section: '## 手作業の手順',
      mayBeF3: true,
    },
  ];
  const first = stops[0] as ClassifiedStop;
  const single = lineCollector();
  reportOutcome({ kind: 'after-push-stopped', stop: first }, single.output);
  for (const needle of ['[F2]', 'staged mismatch', 'reject it', '### F2:']) {
    assert.ok(single.text().includes(needle), needle);
  }
  const many = lineCollector();
  reportOutcome(
    { kind: 'post-check-failed', stops: [first, stops[1] as ClassifiedStop] },
    many.output
  );
  for (const needle of ['[F2]', '[manual]', '### F2:', '## 手作業の手順', 'F3 situation']) {
    assert.ok(many.text().includes(needle), needle);
  }
});

test('ghRelease: the sync gh call is pinned to the repo and drops GH_HOST', () => {
  const calls: { cmd: string; args: string[]; env: Record<string, string> }[] = [];
  const sync: SpawnSyncFn = (cmd, args, options) => {
    calls.push({ cmd, args, env: options.env });
    return { status: 1, stdout: '', stderr: 'release not found' };
  };
  const deps = buildReleaseDeps({
    cwd: tmpdir(),
    output: lineCollector().output,
    env: dirtyEnv,
    spawnSync: sync,
    stdio: 'pipe',
  });
  assert.deepEqual(deps.ghRelease('v0.2.0'), { kind: 'not-found' });
  assert.equal(calls[0]?.cmd, 'gh');
  assert.deepEqual(calls[0]?.args.slice(-2), ['--repo', 'github.com/berlysia/kanbun-annotation']);
  assert.equal(calls[0]?.env['GH_HOST'], undefined);
  assert.equal(calls[0]?.env['npm_config_foo'], undefined);
});

// --- 実際の changesets での検証 (K18) ---
// SAFETY: 実 git と実際の changeset は os.tmpdir() の下の fixture の中だけで動かす。cwd は常に明示し、
// process.chdir は使わない。npm / gh / verify / consumer / trust は偽で、spawnSync は git と changeset 以外を拒否する。

const CHANGESET_BIN = join(import.meta.dirname, '..', 'node_modules', '.bin', 'changeset');

const guardedSpawnSync: SpawnSyncFn = (cmd, args, options) => {
  assert.ok(cmd === 'git' || cmd === CHANGESET_BIN, `refusing to run ${cmd} in a test`);
  assertUnderTmp(options.cwd);
  assert.equal(options.env['GIT_DIR'], undefined);
  assert.equal(options.env['GIT_WORK_TREE'], undefined);
  return spawnSync(cmd, args, options);
};

function makeChangesetRepo(version = '0.1.0'): Repo {
  const work = makeWorkspace({ version, changesets: true, install: false });
  workspaceRoots.push(work);
  const base = mkdtempSync(join(tmpdir(), PREFIX));
  roots.push(base);
  const bare = join(base, 'origin.git');
  mkdirSync(bare);
  mustGit(bare, ['init', '--bare', '-b', 'master']);
  mustGit(work, ['init', '-b', 'master']);
  configureFixtureGit(work);
  mustGit(work, ['remote', 'add', 'origin', bare]);
  assertFixtureOrigin(work);
  mustGit(work, ['add', '-A']);
  mustGit(work, ['commit', '-m', 'init']);
  mustGit(work, ['push', 'origin', 'master']);
  return { bare, work, other: '' };
}

// afterEach はサブテストの後にも走るので、サブテストで順に進める fixture は afterEach の対象から外し、
// 親のテストの finally で消す (消す前に、tmpdir 直下の skam-* であることを確かめる)
function detachFixture(repo: Repo): () => void {
  const base = dirname(repo.bare);
  workspaceRoots.splice(workspaceRoots.indexOf(repo.work), 1);
  roots.splice(roots.indexOf(base), 1);
  return () => {
    removeWorkspace(repo.work);
    const real = realpathSync(base);
    if (dirname(real) !== realpathSync(tmpdir()) || !basename(real).startsWith(PREFIX)) {
      throw new Error(`refused to remove unexpected path ${real}`);
    }
    rmSync(real, { recursive: true, force: true });
  };
}

function writeChangeset(repo: Repo, file: string, bumps: Record<string, 'patch' | 'minor'>): void {
  const front = Object.entries(bumps)
    .map(([name, type]) => `'${name}': ${type}`)
    .join('\n');
  writeFileSync(join(repo.work, '.changeset', file), `---\n${front}\n---\n\nChange for ${file}\n`);
}

function commitPush(repo: Repo, message: string): void {
  mustGit(repo.work, ['add', '-A']);
  mustGit(repo.work, ['commit', '-m', message]);
  mustGit(repo.work, ['push', 'origin', 'master']);
}

interface RealFake {
  deps: ReleaseDeps;
  logs: string[];
  calls: string[];
}

function realDeps(repo: Repo): RealFake {
  assertFixtureOrigin(repo.work);
  const logs: string[] = [];
  const calls: string[] = [];
  const deps = buildReleaseDeps(
    {
      cwd: repo.work,
      output: createOutput(() => {}),
      env: gitEnv,
      spawnSync: guardedSpawnSync,
      stdio: 'pipe',
      changesetCmd: [CHANGESET_BIN],
      run: async () => {
        throw new Error('run is not available in tests');
      },
    },
    {
      verifyTrust: async () => ({ kind: 'ok' }),
      verify: () => ok,
      prettier: () => ok,
      // 段 3 の checkChangelog を、fixture の実際の CHANGELOG に当てる
      checkRelease: (tag) => {
        const errors: string[] = [];
        for (const dir of ['a', 'b']) {
          const text = readFileSync(join(repo.work, 'packages', dir, 'CHANGELOG.md'), 'utf8');
          const checked = checkChangelog(`@fx/${dir}`, text, tag.slice(1));
          if (!checked.ok) errors.push(...checked.errors);
        }
        return errors.length > 0 ? { ok: false, errors } : ok;
      },
      consumer: () => ok,
      ghRelease: () => ({ kind: 'not-found' }),
      confirm: async () => true,
      log: (line) => logs.push(line),
    }
  );
  return { deps, logs, calls };
}

function changelogHead(repo: Repo, dir: string): string {
  const text = readFileSync(join(repo.work, 'packages', dir, 'CHANGELOG.md'), 'utf8');
  return text.split('\n').find((l) => l.startsWith('## ')) ?? '';
}

function committedPaths(repo: Repo): string[] {
  return mustGit(repo.work, ['show', '--name-only', '--format=', 'HEAD']).split('\n').sort();
}

function assertTagged(repo: Repo, tag: string): void {
  assert.equal(mustGit(repo.bare, ['cat-file', '-t', tag]), 'tag');
  assert.equal(
    mustGit(repo.bare, ['rev-parse', `${tag}^{commit}`]),
    mustGit(repo.bare, ['rev-parse', 'master'])
  );
  assert.equal(
    mustGit(repo.work, ['rev-parse', 'HEAD']),
    mustGit(repo.bare, ['rev-parse', 'master'])
  );
  assert.equal(mustGit(repo.work, ['status', '--porcelain']), '');
}

const PRIVATE_FILES = ['packages/priv-dep/package.json', 'packages/priv-solo/package.json'];

function privateSnapshot(repo: Repo): string[] {
  return PRIVATE_FILES.map((f) => readFileSync(join(repo.work, f), 'utf8'));
}

function entryDeps(fake: RealFake, output: Output, published: string[]): MainDeps {
  const run: Runner = async (cmd, args) => {
    const joined = [cmd, ...args].join(' ');
    const reply = (stdout: string): CommandResult => ({ status: 0, stdout, stderr: '' });
    if (joined === 'npm --version') return reply('12.2.0\n');
    if (joined === 'gh --version') return reply('gh version 2.45.0 (2024-01-01)\n');
    if (joined === 'npm config get registry') return reply('https://registry.npmjs.org/\n');
    if (joined === 'npm config get @kanbun-skam:registry') return reply('undefined\n');
    if (cmd === 'npm' && args[0] === 'view') return reply(JSON.stringify(published));
    throw new Error(`unexpected command in a test: ${joined}`);
  };
  return {
    streams: { stdinIsTTY: true, stdoutIsTTY: true },
    output,
    git: fake.deps.git,
    run,
    release: fake.deps,
    runFront: runRelease,
    afterPush: async () => {
      throw new Error('runAfterPush is not expected in this test');
    },
    installInterruptHandler: () => {},
  };
}

test('real changesets (a-1): a normal release makes the version, CHANGELOG, commit and tag', async () => {
  const repo = makeChangesetRepo();
  writeChangeset(repo, 'minor-both.md', { '@fx/a': 'minor', '@fx/b': 'minor' });
  commitPush(repo, 'add changeset');
  const privateBefore = privateSnapshot(repo);
  const fake = realDeps(repo);
  const outcome = await runRelease(normal, fake.deps);
  assert.deepEqual(outcome, { status: 'released', tag: 'v0.2.0' }, fake.logs.join('\n'));
  assert.equal(pkgVersion(repo, 'a'), '0.2.0');
  assert.equal(pkgVersion(repo, 'b'), '0.2.0');
  assert.equal(existsSync(join(repo.work, '.changeset', 'minor-both.md')), false);
  assert.equal(changelogHead(repo, 'a'), '## 0.2.0');
  assert.deepEqual(privateSnapshot(repo), privateBefore);
  assert.equal(existsSync(join(repo.work, 'packages', 'priv-solo', 'CHANGELOG.md')), false);
  assertTagged(repo, 'v0.2.0');
  assert.equal(mustGit(repo.work, ['log', '-1', '--format=%s']), 'chore: release v0.2.0');
  assert.deepEqual(committedPaths(repo), [
    '.changeset/minor-both.md',
    'packages/a/CHANGELOG.md',
    'packages/a/package.json',
    'packages/b/CHANGELOG.md',
    'packages/b/package.json',
  ]);
});

test('real changesets (a-2 -> a-3 -> a-4 -> a-5, in this order on one fixture): prerelease, the entry stop, beta.1, rc.2', async (t: TestContext) => {
  const repo = makeChangesetRepo();
  const dispose = detachFixture(repo);
  try {
    await sequence(t, repo);
  } finally {
    dispose();
  }
});

async function sequence(t: TestContext, repo: Repo): Promise<void> {
  writeChangeset(repo, 'minor-both.md', { '@fx/a': 'minor', '@fx/b': 'minor' });
  commitPush(repo, 'add changeset');
  const privateBefore = privateSnapshot(repo);

  await t.test(
    'a-2: --pre beta makes 0.2.0-beta.0, keeps the md and commits pre.json',
    async () => {
      const fake = realDeps(repo);
      const outcome = await runRelease({ mode: 'pre', tag: 'beta' }, fake.deps);
      assert.deepEqual(outcome, { status: 'released', tag: 'v0.2.0-beta.0' }, fake.logs.join('\n'));
      assert.equal(pkgVersion(repo, 'a'), '0.2.0-beta.0');
      assert.equal(existsSync(join(repo.work, '.changeset', 'minor-both.md')), true);
      assert.ok(committedPaths(repo).includes('.changeset/pre.json'));
      assertTagged(repo, 'v0.2.0-beta.0');
      assert.deepEqual(privateSnapshot(repo), privateBefore);
    }
  );

  await t.test('a-3: an empty commit and everything published stops at row 13', async () => {
    mustGit(repo.work, ['commit', '--allow-empty', '-m', 'empty']);
    mustGit(repo.work, ['push', 'origin', 'master']);
    const fake = realDeps(repo);
    const out = lineCollector();
    const code = await runMain([], entryDeps(fake, out.output, ['0.1.0', '0.2.0-beta.0']));
    assert.equal(code, 1);
    assert.ok(out.text().includes('pre mode'), out.text());
    assert.ok(out.text().includes('--exit-pre'), out.text());
  });

  await t.test(
    'a-4: one patch changeset makes beta.1 and fills the empty CHANGELOG section',
    async () => {
      writeChangeset(repo, 'patch-b.md', { '@fx/b': 'patch' });
      commitPush(repo, 'add changeset');
      const fake = realDeps(repo);
      const outcome = await runRelease(normal, fake.deps);
      assert.deepEqual(outcome, { status: 'released', tag: 'v0.2.0-beta.1' }, fake.logs.join('\n'));
      assert.equal(pkgVersion(repo, 'a'), '0.2.0-beta.1');
      assert.equal(changelogHead(repo, 'a'), '## 0.2.0-beta.1');
      assert.ok(
        readFileSync(join(repo.work, 'packages', 'a', 'CHANGELOG.md'), 'utf8').includes(
          'Version bump only'
        )
      );
      assert.ok(fake.logs.some((l) => l.includes('filled the empty CHANGELOG section of @fx/a')));
      assertTagged(repo, 'v0.2.0-beta.1');
    }
  );

  await t.test('a-5: --pre rc makes 0.2.0-rc.2', async () => {
    writeChangeset(repo, 'patch-b2.md', { '@fx/b': 'patch' });
    commitPush(repo, 'add changeset');
    const fake = realDeps(repo);
    const outcome = await runRelease({ mode: 'pre', tag: 'rc' }, fake.deps);
    assert.deepEqual(outcome, { status: 'released', tag: 'v0.2.0-rc.2' }, fake.logs.join('\n'));
    assert.equal(pkgVersion(repo, 'b'), '0.2.0-rc.2');
    assertTagged(repo, 'v0.2.0-rc.2');
    assert.deepEqual(privateSnapshot(repo), privateBefore);
  });
}

test('real changesets (a-6): --pre beta then --exit-pre releases 0.3.0, removes md and pre.json and restores the ignored package', async () => {
  const repo = makeChangesetRepo('0.2.0');
  writeChangeset(repo, 'minor-both.md', { '@fx/a': 'minor', '@fx/b': 'minor' });
  commitPush(repo, 'add changeset');
  const privateBefore = privateSnapshot(repo);
  const first = realDeps(repo);
  assert.equal((await runRelease({ mode: 'pre', tag: 'beta' }, first.deps)).status, 'released');
  assert.equal(pkgVersion(repo, 'a'), '0.3.0-beta.0');
  const fake = realDeps(repo);
  const outcome = await runRelease({ mode: 'exit-pre' }, fake.deps);
  assert.deepEqual(outcome, { status: 'released', tag: 'v0.3.0' }, fake.logs.join('\n'));
  assert.equal(pkgVersion(repo, 'a'), '0.3.0');
  assert.equal(existsSync(join(repo.work, '.changeset', 'minor-both.md')), false);
  assert.equal(existsSync(join(repo.work, '.changeset', 'pre.json')), false);
  assert.deepEqual(privateSnapshot(repo), privateBefore);
  assert.equal(existsSync(join(repo.work, 'packages', 'priv-solo', 'CHANGELOG.md')), false);
  assert.ok(fake.logs.some((l) => l.includes('restored packages/priv-solo/package.json')));
  assertTagged(repo, 'v0.3.0');
});

test('real changesets (a-7): a stable patch that names one package fills the other CHANGELOG section', async () => {
  const repo = makeChangesetRepo();
  writeChangeset(repo, 'minor-both.md', { '@fx/a': 'minor', '@fx/b': 'minor' });
  commitPush(repo, 'add changeset');
  assert.equal((await runRelease(normal, realDeps(repo).deps)).status, 'released');
  writeChangeset(repo, 'patch-b.md', { '@fx/b': 'patch' });
  commitPush(repo, 'add changeset');
  const fake = realDeps(repo);
  const outcome = await runRelease(normal, fake.deps);
  assert.deepEqual(outcome, { status: 'released', tag: 'v0.2.1' }, fake.logs.join('\n'));
  assert.equal(changelogHead(repo, 'a'), '## 0.2.1');
  assert.ok(
    readFileSync(join(repo.work, 'packages', 'a', 'CHANGELOG.md'), 'utf8').includes(
      'Version bump only'
    )
  );
  assertTagged(repo, 'v0.2.1');
});

test('real changesets (a-8): --tag-only pushes only the tag and leaves master alone', async () => {
  const repo = makeChangesetRepo('0.2.0');
  const masterBefore = mustGit(repo.bare, ['rev-parse', 'master']);
  const fake = realDeps(repo);
  const main = entryDeps(fake, lineCollector().output, ['0.1.0']);
  let front: ReleaseOutcome | undefined;
  const code = await runMain(['--tag-only'], {
    ...main,
    runFront: async (flags, deps) => {
      front = await runRelease(flags, deps);
      return front;
    },
  });
  assert.deepEqual(front, { status: 'tag-pushed', tag: 'v0.2.0' }, fake.logs.join('\n'));
  assert.equal(code, 1);
  assert.equal(mustGit(repo.bare, ['tag', '-l']), 'v0.2.0');
  assert.equal(mustGit(repo.bare, ['rev-parse', 'master']), masterBefore);
  assert.equal(mustGit(repo.bare, ['rev-parse', 'v0.2.0^{commit}']), masterBefore);
});

// changesets 自体の不具合の再現。release.ts を通さない。
// このテストが落ちたら、changesets が直った合図なので、release.ts の ignore 済みパッケージの復元 (K7) を消す。
test('changesets bug (K7): pre exit then version bumps an ignored package without internal dependencies; if this fails, drop the restore in release.ts', () => {
  const repo = makeChangesetRepo();
  writeChangeset(repo, 'minor-both.md', { '@fx/a': 'minor', '@fx/b': 'minor' });
  commitPush(repo, 'add changeset');
  const changeset = (args: string[]): void => {
    const r = guardedSpawnSync(CHANGESET_BIN, args, {
      cwd: repo.work,
      env: gitEnv,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    assert.equal(r.status, 0, `changeset ${args.join(' ')}: ${r.stderr ?? ''}`);
  };
  changeset(['pre', 'enter', 'beta']);
  changeset(['version']);
  changeset(['pre', 'exit']);
  changeset(['version']);
  const solo = JSON.parse(
    readFileSync(join(repo.work, 'packages', 'priv-solo', 'package.json'), 'utf8')
  ) as { version: string };
  assert.notEqual(solo.version, '0.0.0');
});

// --- 後半の実 deps (本物の node:fs を、os.tmpdir() の下の新しい dir の中だけで) ---

function makeTmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), PREFIX));
  roots.push(root);
  return root;
}

function tempFsIn(tmpRoot: string): { fs: ReturnType<typeof createTempFs>; text: () => string } {
  const out = lineCollector();
  return { fs: createTempFs(nodeFsApi, tmpRoot, out.output), text: out.text };
}

test('createTempFs: a directory made by mkTemp is removed by removeTemp', () => {
  const root = makeTmpRoot();
  const { fs } = tempFsIn(root);
  const dir = fs.mkTemp();
  assert.ok(dir.startsWith(`${realpathSync(root)}${sep}kanbun-release-`), dir);
  assert.equal(existsSync(dir), true);
  writeFileSync(join(dir, 'a.txt'), 'x');
  fs.removeTemp(dir);
  assert.equal(existsSync(dir), false);
});

test('createTempFs: removeTemp refuses a directory outside tmpRoot and one that mkTemp did not make', () => {
  const root = makeTmpRoot();
  const elsewhere = makeTmpRoot();
  const outside = join(elsewhere, 'kanbun-release-outside');
  mkdirSync(outside);
  const inside = join(realpathSync(root), 'kanbun-release-handmade');
  mkdirSync(inside);
  const { fs, text } = tempFsIn(root);
  fs.removeTemp(outside);
  fs.removeTemp(inside);
  fs.removeTemp(realpathSync(root));
  assert.equal(existsSync(outside), true);
  assert.equal(existsSync(inside), true);
  assert.equal(existsSync(root), true);
  assert.ok(text().includes('refusing'), text());
});

test('createTempFs: listDir reports file, dir and symlink by lstat, and readFile rejects a file over the limit', () => {
  const root = makeTmpRoot();
  const { fs } = tempFsIn(root);
  const dir = fs.mkTemp();
  writeFileSync(join(dir, 'f.txt'), '12345');
  mkdirSync(join(dir, 'sub'));
  symlinkSync(join(dir, 'f.txt'), join(dir, 'link'));
  const kinds = Object.fromEntries(fs.listDir(dir).map((e) => [e.name, e.kind]));
  assert.deepEqual(kinds, { 'f.txt': 'file', sub: 'dir', link: 'symlink' });
  assert.equal(fs.listDir(dir).find((e) => e.name === 'f.txt')?.size, 5);
  assert.equal(fs.readFile(join(dir, 'f.txt'), 5).toString(), '12345');
  assert.throws(() => fs.readFile(join(dir, 'f.txt'), 4));
  assert.throws(() => fs.readFile(join(dir, 'link'), 100));
});

test('createTempFs: when tmpRoot is a symlink (its realpath is elsewhere), mkTemp then removeTemp still works', () => {
  const real = makeTmpRoot();
  const holder = makeTmpRoot();
  const link = join(holder, 'link');
  symlinkSync(real, link);
  const { fs } = tempFsIn(link);
  const dir = fs.mkTemp();
  assert.ok(dir.startsWith(realpathSync(real)), dir);
  fs.removeTemp(dir);
  assert.equal(existsSync(dir), false);
});

test('createEvidenceStore: two runs write to different directories and the earlier evidence stays', () => {
  const root = makeTmpRoot();
  const now = new Date('2026-10-15T01:02:03.004Z');
  const first = createEvidenceStore(nodeFsApi, root, '0.2.0', () => now);
  const second = createEvidenceStore(nodeFsApi, root, '0.2.0', () => now);
  const dir1 = first('run.json', 'one');
  const dir1Again = first('jobs.json', 'two');
  const dir2 = second('run.json', 'three');
  assert.equal(dir1, dir1Again);
  assert.notEqual(dir1, dir2);
  assert.ok(dir1.startsWith(join(root, '.tmp', 'release', 'v0.2.0')), dir1);
  assert.equal(dir1.includes(':'), false);
  assert.equal(readFileSync(join(dir1, 'run.json'), 'utf8'), 'one');
  assert.equal(readFileSync(join(dir1, 'jobs.json'), 'utf8'), 'two');
  assert.equal(readFileSync(join(dir2, 'run.json'), 'utf8'), 'three');
});

test('createEvidenceStore: a name with a path separator or a version that is not a plain semver is refused', () => {
  const root = makeTmpRoot();
  const store = createEvidenceStore(nodeFsApi, root, '0.2.0', () => new Date(0));
  assert.throws(() => store('../x.json', 'x'));
  assert.throws(() => store('a/b.json', 'x'));
  assert.throws(() =>
    createEvidenceStore(nodeFsApi, root, '../0.2.0', () => new Date(0))('x', 'y')
  );
  assert.equal(existsSync(join(root, '.tmp', 'release', 'x')), false);
});
