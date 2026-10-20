import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDockerArgs, checkPreconditions, getPlaywrightImage } from './vrt-docker.ts';
import type { HostFacts } from './vrt-docker.ts';

const okFacts: HostFacts = {
  repoRoot: '/home/u/repo',
  uid: 1000,
  dockerAvailable: true,
  testResults: undefined,
  rendererDistExists: true,
};

test('image name comes from an exact playwright version', () => {
  assert.deepEqual(getPlaywrightImage('1.58.0'), {
    ok: true,
    image: 'mcr.microsoft.com/playwright:v1.58.0-noble',
  });
});

test('image name rejects anything but an exact version', () => {
  for (const bad of ['^1.58.0', '1.58.0; --privileged', '1.58', '', '1.58.0\n']) {
    const result = getPlaywrightImage(bad);
    assert.equal(result.ok, false, bad);
    if (!result.ok) assert.match(result.reason, /exact version/);
  }
});

test('docker args have the contracted shape', () => {
  const args = buildDockerArgs({
    repoRoot: '/home/u/repo',
    image: 'mcr.microsoft.com/playwright:v1.58.0-noble',
    uid: 1000,
    gid: 1000,
    playwrightArgs: ['-g', 'tateten'],
  });
  assert.deepEqual(args, [
    'run',
    '--rm',
    '--init',
    '--ipc=host',
    '-u',
    '1000:1000',
    '-e',
    'HOME=/tmp',
    '-e',
    'UPDATE_SNAPSHOTS',
    '--mount',
    'type=bind,src=/home/u/repo,dst=/work',
    '-w',
    '/work/packages/integration-tests',
    'mcr.microsoft.com/playwright:v1.58.0-noble',
    './node_modules/.bin/playwright',
    'test',
    '-g',
    'tateten',
  ]);
  const envs = args.filter((_, i) => args[i - 1] === '-e');
  assert.deepEqual(envs, ['HOME=/tmp', 'UPDATE_SNAPSHOTS']);
  for (const forbidden of ['--privileged', '--network', '--env-file', '--cap-add']) {
    assert.ok(!args.some((a) => a.startsWith(forbidden)), forbidden);
  }
});

test('user arguments stay after playwright test', () => {
  const args = buildDockerArgs({
    repoRoot: '/r',
    image: 'img',
    uid: 1,
    gid: 2,
    playwrightArgs: ['--privileged', '--network=host'],
  });
  assert.deepEqual(args.slice(-2), ['--privileged', '--network=host']);
  assert.equal(args.indexOf('--privileged'), args.length - 2);
});

test('preconditions pass on a clean host', () => {
  assert.deepEqual(checkPreconditions(okFacts), []);
  assert.deepEqual(
    checkPreconditions({ ...okFacts, testResults: { isSymlink: false, ownerUid: 1000 } }),
    []
  );
});

test('root-owned test-results stops with the sudo rm command', () => {
  const problems = checkPreconditions({
    ...okFacts,
    testResults: { isSymlink: false, ownerUid: 0 },
  });
  assert.equal(problems.length, 1);
  assert.ok(
    problems[0]?.includes('sudo rm -rf /home/u/repo/packages/integration-tests/test-results')
  );
});

test('symlinked test-results stops', () => {
  const problems = checkPreconditions({
    ...okFacts,
    testResults: { isSymlink: true, ownerUid: 1000 },
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0] ?? '', /symlink/);
  assert.doesNotMatch(problems[0] ?? '', /sudo/);
});

test('missing renderer dist stops with pnpm build', () => {
  const problems = checkPreconditions({ ...okFacts, rendererDistExists: false });
  assert.equal(problems.length, 1);
  assert.match(problems[0] ?? '', /pnpm build/);
});

test('missing docker stops', () => {
  const problems = checkPreconditions({ ...okFacts, dockerAvailable: false });
  assert.equal(problems.length, 1);
  assert.match(problems[0] ?? '', /docker was not found/);
});

test('a comma in the repository path stops', () => {
  const problems = checkPreconditions({ ...okFacts, repoRoot: '/home/u/a,b' });
  assert.equal(problems.length, 1);
  assert.match(problems[0] ?? '', /--mount/);
});
