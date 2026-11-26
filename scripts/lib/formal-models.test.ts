import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkCovers,
  judgeOutcome,
  parseManifest,
  resolveInRepo,
  runTlaCheck,
} from './formal-models.ts';

// x counts up from 0 to MaxX and wraps to 0 (no deadlock: a stop at MaxX would be one)
const COUNTER = `---- MODULE Counter ----
EXTENDS Naturals
CONSTANT MaxX
VARIABLE x
Init == x = 0
Next == x' = IF x < MaxX THEN x + 1 ELSE 0
Spec == Init /\\ [][Next]_x
Bounded == x <= MaxX
Small == x < MaxX
====`;
const config = (invariant: string) =>
  `SPECIFICATION Spec\nCONSTANT MaxX = 3\nINVARIANT ${invariant}\n`;
const run = (invariant: string, source = COUNTER) =>
  runTlaCheck({ source, config: config(invariant), modules: {} });
const check = (over: Record<string, unknown> = {}) => ({
  id: 'counter',
  kind: 'tla',
  model: 'Counter.tla',
  cfg: 'Counter.cfg',
  property: 'Bounded',
  expect: 'hold',
  role: 'contract',
  ...over,
});

test('a holding invariant expected to hold passes', async () => {
  const outcome = await run('Bounded');
  assert.equal(outcome.verdict, 'hold');
  assert.equal(judgeOutcome(check() as never, outcome).ok, true);
});

test('a broken invariant expected to be violated passes when the property matches', async () => {
  const outcome = await run('Small');
  assert.equal(outcome.verdict, 'violate');
  const result = judgeOutcome(
    check({ property: 'Small', expect: 'violate', role: 'broken-variant' }) as never,
    outcome
  );
  assert.equal(result.ok, true);
});

test('a broken invariant expected to hold fails and names the check and the verdict', async () => {
  const result = judgeOutcome(check({ property: 'Small' }) as never, await run('Small'));
  assert.equal(result.ok, false);
  assert.match(result.message, /counter/);
  assert.match(result.message, /violate/);
});

test('a violation of another property than the declared one fails', async () => {
  const result = judgeOutcome(
    check({ property: 'Bounded', expect: 'violate', role: 'broken-variant' }) as never,
    await run('Small')
  );
  assert.equal(result.ok, false);
  assert.match(result.message, /Small/);
});

test('a spec that does not parse is an error, not hold or violate', async () => {
  const outcome = await run('Bounded', '---- MODULE Counter ----\nVARIABLE x\nInit == x = \n====');
  assert.equal(outcome.verdict, 'error');
  assert.equal(judgeOutcome(check() as never, outcome).ok, false);
});

test('covers with a stale sha256 fail and say how to resync', () => {
  const dir = mkdtempSync(join(tmpdir(), 'formal-models-'));
  try {
    writeFileSync(join(dir, 'a.ts'), 'now\n');
    const result = checkCovers(
      { covers: [{ path: 'a.ts', sha256: '0'.repeat(64) }], commit: 'a'.repeat(40) },
      dir
    );
    assert.equal(result.ok, false);
    assert.match(result.message, /a\.ts/);
    assert.match(result.message, /git diff a{40} -- a\.ts/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('covers that match pass', () => {
  const dir = mkdtempSync(join(tmpdir(), 'formal-models-'));
  try {
    writeFileSync(join(dir, 'a.ts'), 'now\n');
    const sha = createHash('sha256').update('now\n').digest('hex');
    assert.equal(checkCovers({ covers: [{ path: 'a.ts', sha256: sha }] }, dir).ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a check of another kind than tla fails the manifest', () => {
  assert.throws(
    () =>
      parseManifest(
        JSON.stringify({ schemaVersion: 1, checks: [check({ kind: 'z3' })] }),
        'x/formal.json'
      ),
    /tla/
  );
});

test('a manifest without checks fails', () => {
  assert.throws(
    () => parseManifest(JSON.stringify({ schemaVersion: 1, checks: [] }), 'x/formal.json'),
    /no checks/
  );
});

test('a deadlocking spec is an error, not hold', async () => {
  const source = `---- MODULE Stuck ----
VARIABLE x
Init == x = 0
Next == FALSE
Spec == Init /\\ [][Next]_x
Safe == TRUE
====`;
  const outcome = await runTlaCheck({
    source,
    config: 'SPECIFICATION Spec\nINVARIANT Safe\n',
    modules: {},
  });
  assert.equal(outcome.verdict, 'error');
  assert.equal(judgeOutcome(check({ property: 'Safe' }) as never, outcome).ok, false);
});

test('a spec whose state space never ends times out instead of hanging', async () => {
  const source = `---- MODULE Forever ----
EXTENDS Naturals
VARIABLE x
Init == x = 0
Next == x' = x + 1
Spec == Init /\\ [][Next]_x
Safe == x >= 0
====`;
  const started = Date.now();
  const outcome = await runTlaCheck({
    source,
    config: 'SPECIFICATION Spec\nINVARIANT Safe\n',
    modules: {},
    timeoutSec: 1,
  });
  assert.equal(outcome.verdict, 'error');
  assert.match(outcome.message ?? '', /time/i);
  assert.ok(Date.now() - started < 5000);
});

test('a model that is a symlink out of the repository is refused before it is read', () => {
  const repo = mkdtempSync(join(tmpdir(), 'formal-repo-'));
  const outside = mkdtempSync(join(tmpdir(), 'formal-outside-'));
  try {
    mkdirSync(join(repo, 'docs', 'formal', 'x'), { recursive: true });
    writeFileSync(join(outside, 'secret.tla'), '---- MODULE secret ----\n====\n');
    symlinkSync(join(outside, 'secret.tla'), join(repo, 'docs', 'formal', 'x', 'external.tla'));
    assert.throws(
      () => resolveInRepo(join(repo, 'docs', 'formal', 'x'), 'external.tla', repo),
      /outside the repository/
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('covers paths resolve from the repository root, not from the manifest directory', () => {
  const repo = mkdtempSync(join(tmpdir(), 'formal-repo-'));
  try {
    mkdirSync(join(repo, 'packages', 'p'), { recursive: true });
    writeFileSync(join(repo, 'packages', 'p', 'main.ts'), 'code\n');
    const sha = createHash('sha256').update('code\n').digest('hex');
    assert.equal(
      checkCovers({ covers: [{ path: 'packages/p/main.ts', sha256: sha }] }, repo).ok,
      true
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
