import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { runRelease } from './release.ts';
import type { GitResult, ReleaseDeps } from './release.ts';
import type { Check, ReleaseLookup } from './lib/release-check.ts';

const PREFIX = 'skam-rel-';
const gitEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    // mkdtempSync が返したパスだけを、tmpdir 直下の skam-rel-* であることを確かめて消す
    const real = realpathSync(root);
    if (dirname(real) !== realpathSync(tmpdir()) || !basename(real).startsWith(PREFIX)) {
      throw new Error(`refused to remove unexpected path ${real}`);
    }
    rmSync(real, { recursive: true, force: true });
  }
});

function gitIn(cwd: string, args: string[]): GitResult {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: gitEnv });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function mustGit(cwd: string, args: string[]): string {
  const r = gitIn(cwd, args);
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

interface Repo {
  bare: string;
  work: string;
  other: string;
}

function makeRepo(options: { changeset?: boolean; version?: string } = {}): Repo {
  const base = mkdtempSync(join(tmpdir(), PREFIX));
  roots.push(base);
  const bare = join(base, 'origin.git');
  const work = join(base, 'work');
  const other = join(base, 'other');
  mkdirSync(bare);
  mkdirSync(work);
  mustGit(bare, ['init', '--bare', '-b', 'master']);
  mustGit(work, ['init', '-b', 'master']);
  mustGit(work, ['remote', 'add', 'origin', bare]);
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
  mustGit(work, ['add', '-A']);
  mustGit(work, ['commit', '-m', 'init']);
  mustGit(work, ['push', 'origin', 'master']);
  mustGit(base, ['clone', bare, other]);
  return { bare, work, other };
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
  const ok: Check<void> = { ok: true, value: undefined };
  const notFound: ReleaseLookup = { kind: 'not-found' };
  const deps: ReleaseDeps = {
    git: (args) => {
      gitCalls.push(args);
      return gitIn(repo.work, args);
    },
    changesetVersion: () => {
      calls.push('changesetVersion');
      for (const name of ['a', 'b']) {
        const file = join(repo.work, 'packages', name, 'package.json');
        const json = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
        json['version'] = '0.2.0';
        writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
      }
      unlinkSync(join(repo.work, '.changeset', 'x.md'));
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
  const outcome = await runRelease({ tagOnly: false }, fake.deps);
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
  assert.deepEqual(fake.calls, ['changesetVersion', 'prettier', 'checkRelease', 'consumer']);
});

// 段 1

test('stage 1: stops without side effects when the branch is not master', async () => {
  const repo = makeRepo();
  mustGit(repo.work, ['checkout', '-b', 'topic']);
  const before = snapshot(repo);
  const fake = fakeDeps(repo);
  const outcome = await runRelease({ tagOnly: false }, fake.deps);
  assert.equal(outcome.status, 'stopped');
  assertUnchanged(repo, before);
  assert.equal(fake.calls.includes('changesetVersion'), false);
});

test('stage 1: stops when the working tree is dirty', async () => {
  const repo = makeRepo();
  writeFileSync(join(repo.work, 'packages', 'a', 'dirty.txt'), 'x');
  const before = snapshot(repo);
  const fake = fakeDeps(repo);
  assert.equal((await runRelease({ tagOnly: false }, fake.deps)).status, 'stopped');
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
  assert.equal((await runRelease({ tagOnly: false }, fake.deps)).status, 'stopped');
  assertUnchanged(repo, before);
  assert.equal(fake.calls.includes('changesetVersion'), false);
});

test('stage 1: stops when there is no changeset other than README', async () => {
  const repo = makeRepo({ changeset: false });
  const before = snapshot(repo);
  const fake = fakeDeps(repo);
  assert.equal((await runRelease({ tagOnly: false }, fake.deps)).status, 'stopped');
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
    const outcome = await runRelease({ tagOnly: false }, fake.deps);
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
  assert.equal((await runRelease({ tagOnly: false }, fake.deps)).status, 'stopped');
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
  assert.equal((await runRelease({ tagOnly: false }, fake.deps)).status, 'stopped');
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
  const outcome = await runRelease({ tagOnly: false }, fake.deps);
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
  const outcome = await runRelease({ tagOnly: true }, fake.deps);
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
    assert.equal((await runRelease({ tagOnly: true }, fake.deps)).status, 'stopped');
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
  const outcome = await runRelease({ tagOnly: true }, fake.deps);
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
