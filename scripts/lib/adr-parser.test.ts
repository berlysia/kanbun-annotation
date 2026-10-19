import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import {
  parseFrontmatter,
  parseAdrFile,
  getPhase,
  getActionableAdrs,
  formatPlan,
  getCompleteWithPlanWarnings,
} from './adr-parser.ts';
import type { AdrFrontmatter, AdrInfo } from './types.ts';

interface AdrOverrides {
  number?: number;
  frontmatter?: Partial<AdrFrontmatter>;
  planExists?: boolean;
  planValidated?: boolean;
}

function makeAdr(overrides: AdrOverrides = {}): AdrInfo {
  const number = overrides.number ?? 1;
  return {
    number,
    slug: `adr-${number}`,
    title: `ADR ${number}`,
    filePath: `docs/decisions/adr-${String(number).padStart(3, '0')}-x.md`,
    bodyRefs: [],
    frontmatter: { status: 'Proposed', ...overrides.frontmatter },
    planExists: overrides.planExists ?? false,
    planValidated: overrides.planValidated ?? false,
  };
}

const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) removeScratch(dir);
});

function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'skam-adr-'));
  scratch.push(dir);
  return dir;
}

// mkdtempSync が返したパスだけを、tmpdir 直下の skam-adr-* であることを確かめて消す
function removeScratch(dir: string): void {
  const real = realpathSync(dir);
  if (dirname(real) !== realpathSync(tmpdir()) || !basename(real).startsWith('skam-adr-')) {
    throw new Error(`refused to remove unexpected path ${real}`);
  }
  rmSync(real, { recursive: true, force: true });
}

test('parseFrontmatter: reads status and plan', () => {
  assert.deepEqual(parseFrontmatter('---\nstatus: Complete\nplan: plan-x.md\n---\n# T'), {
    status: 'Complete',
    plan: 'plan-x.md',
  });
});

test('parseFrontmatter: an invalid status falls back to Proposed', () => {
  assert.equal(parseFrontmatter('---\nstatus: Done\n---\n# T')?.status, 'Proposed');
});

test('parseFrontmatter: reads deps, and omits the key when empty', () => {
  assert.deepEqual(parseFrontmatter('---\nstatus: Accepted\ndeps: [1, 2]\n---\n# T')?.deps, [1, 2]);
  const empty = parseFrontmatter('---\nstatus: Accepted\ndeps: []\n---\n# T');
  assert.ok(empty);
  assert.equal('deps' in empty, false);
});

test('parseFrontmatter: trims spaces around deps and reads leading zeros as decimal', () => {
  const deps = (inner: string) =>
    parseFrontmatter(`---\nstatus: Accepted\ndeps: [${inner}]\n---\n# T`)?.deps;
  assert.deepEqual(deps(' 1 , 2 '), [1, 2]);
  assert.deepEqual(deps('016'), [16]);
});

test('parseFrontmatter: whitespace-only deps is the same as no deps', () => {
  const fm = parseFrontmatter('---\nstatus: Accepted\ndeps: [ ]\n---\n# T');
  assert.ok(fm);
  assert.equal('deps' in fm, false);
});

test('parseFrontmatter: throws on a non-numeric deps value, quoting it', () => {
  const parse = (inner: string) => () =>
    parseFrontmatter(`---\nstatus: Accepted\ndeps: [${inner}]\n---\n# T`);
  assert.throws(parse('a'), (e: unknown) => e instanceof Error && e.message.includes('"a"'));
  assert.throws(
    parse('ADR-016'),
    (e: unknown) => e instanceof Error && e.message.includes('"ADR-016"')
  );
  assert.throws(parse('1,'), (e: unknown) => e instanceof Error && e.message.includes('""'));
  assert.throws(parse('1,,2'), Error);
  assert.throws(parse('1.5'), (e: unknown) => e instanceof Error && e.message.includes('"1.5"'));
});

test('parseFrontmatter: keeps only valid substatus entries', () => {
  const fm = parseFrontmatter(
    '---\nstatus: InProgress\nsubstatus:\n  html: Complete\n  canvas: Bogus\n---\n# T'
  );
  assert.deepEqual(fm?.substatus, { html: 'Complete' });
});

test('parseFrontmatter: returns null without frontmatter', () => {
  assert.equal(parseFrontmatter('# Title only\n'), null);
});

test('getPhase: Complete is done regardless of plan', () => {
  assert.equal(getPhase(makeAdr({ frontmatter: { status: 'Complete' } })), 'done');
  assert.equal(
    getPhase(makeAdr({ frontmatter: { status: 'Complete', plan: 'p.md' }, planExists: false })),
    'done'
  );
});

test('getPhase: InProgress is implementation, Proposed is investigation', () => {
  assert.equal(getPhase(makeAdr({ frontmatter: { status: 'InProgress' } })), 'implementation');
  assert.equal(getPhase(makeAdr({ frontmatter: { status: 'Proposed' } })), 'investigation');
});

test('getPhase: Accepted depends on the plan file and its validation marker', () => {
  assert.equal(getPhase(makeAdr({ frontmatter: { status: 'Accepted' } })), 'planning');
  assert.equal(
    getPhase(makeAdr({ frontmatter: { status: 'Accepted', plan: 'p.md' }, planExists: false })),
    'planning'
  );
  assert.equal(
    getPhase(
      makeAdr({
        frontmatter: { status: 'Accepted', plan: 'p.md' },
        planExists: true,
        planValidated: false,
      })
    ),
    'validation'
  );
  assert.equal(
    getPhase(
      makeAdr({
        frontmatter: { status: 'Accepted', plan: 'p.md' },
        planExists: true,
        planValidated: true,
      })
    ),
    'implementation'
  );
});

test('getActionableAdrs: excludes Complete ADRs', () => {
  const done = makeAdr({ number: 1, frontmatter: { status: 'Complete' } });
  assert.deepEqual(getActionableAdrs([done]), []);
});

test('getActionableAdrs: requires every dep to be an existing Complete ADR', () => {
  const dep = (status: AdrFrontmatter['status']) => makeAdr({ number: 1, frontmatter: { status } });
  const target = (deps?: number[]) =>
    makeAdr({
      number: 2,
      frontmatter: { status: 'Accepted', ...(deps ? { deps } : {}) },
    });

  const completeDep = target([1]);
  assert.deepEqual(getActionableAdrs([dep('Complete'), completeDep]), [completeDep]);

  assert.deepEqual(
    getActionableAdrs([dep('Accepted'), target([1])]).map((a) => a.number),
    [1]
  );

  const noDeps = target();
  assert.deepEqual(getActionableAdrs([noDeps]), [noDeps]);

  assert.deepEqual(getActionableAdrs([target([99])]), []);
});

test('formatPlan: no plan is "-"', () => {
  assert.equal(formatPlan(makeAdr()), '-');
});

test('formatPlan: plan without a file is "missing"', () => {
  assert.equal(
    formatPlan(makeAdr({ frontmatter: { plan: 'p.md' }, planExists: false })),
    'missing'
  );
});

test('formatPlan: validated plan is "validated", otherwise "exists"', () => {
  assert.equal(
    formatPlan(makeAdr({ frontmatter: { plan: 'p.md' }, planExists: true, planValidated: true })),
    'validated'
  );
  assert.equal(
    formatPlan(makeAdr({ frontmatter: { plan: 'p.md' }, planExists: true, planValidated: false })),
    'exists'
  );
});

function writeAdr(root: string, content: string): string {
  const decisions = join(root, 'docs', 'decisions');
  mkdirSync(decisions, { recursive: true });
  const file = join(decisions, 'adr-001-sample.md');
  writeFileSync(file, content, 'utf-8');
  return file;
}

test('parseAdrFile: finds a validated plan', () => {
  const root = scratchDir();
  const file = writeAdr(
    root,
    '---\nstatus: Accepted\nplan: plan-sample.md\n---\n# ADR-001: Sample\n'
  );
  mkdirSync(join(root, 'docs', 'plans'), { recursive: true });
  writeFileSync(join(root, 'docs', 'plans', 'plan-sample.md'), '# Plan\n<!-- validated -->\n');

  const info = parseAdrFile(file, root);
  assert.equal(info.number, 1);
  assert.equal(info.slug, 'sample');
  assert.equal(info.title, 'Sample');
  assert.equal(info.planExists, true);
  assert.equal(info.planValidated, true);
});

test('parseAdrFile: a missing plan file is not exists and not validated', () => {
  const root = scratchDir();
  const file = writeAdr(
    root,
    '---\nstatus: Accepted\nplan: plan-sample.md\n---\n# ADR-001: Sample\n'
  );

  const info = parseAdrFile(file, root);
  assert.equal(info.planExists, false);
  assert.equal(info.planValidated, false);
});

test('parseAdrFile: throws without frontmatter', () => {
  const root = scratchDir();
  const file = writeAdr(root, '# ADR-001: Sample\n');

  assert.throws(
    () => parseAdrFile(file, root),
    (e: unknown) => e instanceof Error && e.message.startsWith('No frontmatter found in')
  );
});

test('parseAdrFile: a non-numeric deps value throws with the relative path and a cause', () => {
  const root = scratchDir();
  const file = writeAdr(root, '---\nstatus: Accepted\ndeps: [a]\n---\n# ADR-001: Sample\n');

  assert.throws(
    () => parseAdrFile(file, root),
    (e: unknown) =>
      e instanceof Error &&
      e.message.includes('docs/decisions/adr-001-sample.md') &&
      e.message.includes('"a"') &&
      e.cause instanceof Error
  );
});

test('getCompleteWithPlanWarnings: warns on Complete with plan, whether or not the file exists', () => {
  for (const planExists of [false, true]) {
    const lines = getCompleteWithPlanWarnings([
      makeAdr({ frontmatter: { status: 'Complete', plan: 'plan-x.md' }, planExists }),
    ]);
    assert.equal(lines.length, 1);
    assert.ok(lines[0]!.includes('ADR-001'));
    assert.ok(lines[0]!.includes('plan-x.md'));
  }
});

test('getCompleteWithPlanWarnings: no warning without plan or when not Complete', () => {
  assert.deepEqual(
    getCompleteWithPlanWarnings([makeAdr({ frontmatter: { status: 'Complete' } })]),
    []
  );
  assert.deepEqual(
    getCompleteWithPlanWarnings([
      makeAdr({ frontmatter: { status: 'Accepted', plan: 'plan-x.md' } }),
    ]),
    []
  );
});

test('getCompleteWithPlanWarnings: zero-pads the ADR number to 3 digits', () => {
  const lines = getCompleteWithPlanWarnings([
    makeAdr({ number: 12, frontmatter: { status: 'Complete', plan: 'plan-x.md' } }),
  ]);
  assert.ok(lines[0]!.includes('ADR-012'));
});
