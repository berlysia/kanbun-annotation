import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolvePublicPackages,
  checkSameVersion,
  checkTag,
  checkChangelog,
  parseNpmView,
  checkRegistry,
  parseGhReleaseView,
  compareSemver,
  distTagFor,
  orderByDependencies,
  checkPackedPackageJson,
  verifyManifest,
  parseNpmViewVersions,
  parseReleaseFlags,
  decideEntry,
  decideEntryWithStatus,
  parseChangesetStatus,
  ignoredPackageDirs,
  planIgnoredRestore,
  checkVersionedChanges,
  fillEmptyChangelogSection,
  parseToolVersion,
  checkToolVersions,
  buildNpmArgs,
  buildGhArgs,
  childEnv,
  checkNpmRegistryConfig,
  isInteractiveStreams,
  checkTrustList,
  combineTrustResults,
} from './release-check.ts';
import type {
  WorkspacePackage,
  EntryObservation,
  ChangesetStatus,
  Check,
  TrustResult,
} from './release-check.ts';

const NAMES = [
  '@kanbun-skam/skam',
  '@kanbun-skam/skam-xml-parser',
  '@kanbun-skam/skam-xml-stringify',
  '@kanbun-skam/skam-html-renderer',
  '@kanbun-skam/skam-canvas-renderer',
  '@kanbun-skam/skam-web-component',
];

function pkg(name: string, overrides: Partial<WorkspacePackage> = {}): WorkspacePackage {
  return {
    name,
    dir: `packages/${name.replace('@kanbun-skam/', '')}`,
    version: '0.2.0',
    private: false,
    dependencies: {},
    peerDependencies: {},
    optionalDependencies: {},
    ...overrides,
  };
}

function currentWorkspace(): WorkspacePackage[] {
  const s = '@kanbun-skam/skam';
  return [
    pkg('@kanbun-skam/skam'),
    pkg('@kanbun-skam/skam-xml-parser', {
      dependencies: { [s]: 'workspace:*', '@xmldom/xmldom': '0.8.15' },
    }),
    pkg('@kanbun-skam/skam-xml-stringify', { dependencies: { [s]: 'workspace:*' } }),
    pkg('@kanbun-skam/skam-html-renderer', { dependencies: { [s]: 'workspace:*' } }),
    pkg('@kanbun-skam/skam-canvas-renderer', { dependencies: { [s]: 'workspace:*' } }),
    pkg('@kanbun-skam/skam-web-component', {
      dependencies: {
        '@kanbun-skam/skam-xml-parser': 'workspace:*',
        '@kanbun-skam/skam-html-renderer': 'workspace:*',
      },
    }),
  ];
}

function privatePackages(): WorkspacePackage[] {
  return ['playground', 'integration-tests', 'baseline-check', 'skam-screenshot'].map((n) =>
    pkg(`@kanbun-skam/${n}`, { private: true })
  );
}

function errorsOf<T>(r: { ok: true; value: T } | { ok: false; errors: string[] }): string {
  assert.equal(r.ok, false);
  return r.ok ? '' : r.errors.join('\n');
}

// resolvePublicPackages

test('resolvePublicPackages: accepts fixed that matches every non-private package', () => {
  const workspace = [...currentWorkspace(), ...privatePackages()];
  const r = resolvePublicPackages({ fixed: [NAMES] }, workspace);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.value.map((p) => p.name).sort(), [...NAMES].sort());
});

for (const [label, config] of [
  ['two groups', { fixed: [NAMES.slice(0, 3), NAMES.slice(3)] }],
  ['no fixed', {}],
  ['empty group', { fixed: [[]] }],
  ['fixed is not an array', { fixed: 'x' }],
  ['config is null', null],
] as const) {
  test(`resolvePublicPackages: rejects ${label}`, () => {
    const r = resolvePublicPackages(config, [...currentWorkspace(), ...privatePackages()]);
    assert.equal(r.ok, false);
  });
}

test('resolvePublicPackages: rejects a duplicated name', () => {
  const r = resolvePublicPackages({ fixed: [[...NAMES, NAMES[0]]] }, currentWorkspace());
  assert.equal(r.ok, false);
});

test('resolvePublicPackages: rejects a private package in fixed and names it', () => {
  const workspace = [...currentWorkspace(), ...privatePackages()];
  const r = resolvePublicPackages({ fixed: [[...NAMES, '@kanbun-skam/playground']] }, workspace);
  assert.match(errorsOf(r), /@kanbun-skam\/playground/);
});

test('resolvePublicPackages: rejects a non-private package missing from fixed and names it', () => {
  const workspace = [...currentWorkspace(), pkg('@kanbun-skam/seventh')];
  const r = resolvePublicPackages({ fixed: [NAMES] }, workspace);
  assert.match(errorsOf(r), /@kanbun-skam\/seventh/);
});

test('resolvePublicPackages: rejects a name that is not in the workspace and names it', () => {
  const r = resolvePublicPackages(
    { fixed: [[...NAMES, '@kanbun-skam/ghost']] },
    currentWorkspace()
  );
  assert.match(errorsOf(r), /@kanbun-skam\/ghost/);
});

// checkSameVersion

test('checkSameVersion: returns the common version', () => {
  const r = checkSameVersion(currentWorkspace());
  assert.deepEqual(r, { ok: true, value: '0.2.0' });
});

test('checkSameVersion: names the package whose version differs', () => {
  const pkgs = currentWorkspace();
  pkgs[2] = pkg('@kanbun-skam/skam-xml-stringify', { version: '0.2.1' });
  assert.match(errorsOf(checkSameVersion(pkgs)), /skam-xml-stringify/);
});

// checkTag

for (const [tag, version] of [
  ['v0.2.0', '0.2.0'],
  ['v0.3.0-rc.1', '0.3.0-rc.1'],
] as const) {
  test(`checkTag: accepts ${tag} for ${version}`, () => {
    assert.equal(checkTag(tag, version).ok, true);
  });
}

for (const [tag, version] of [
  ['v0.2.1', '0.2.0'],
  ['0.2.0', '0.2.0'],
  ['v0.2.0$(id)', '0.2.0'],
  ['v01.2.0', '01.2.0'],
  ['', '0.2.0'],
  ['v0.2.0-rc.1', '0.2.0'],
  ['v0.2.0', '0.2.0-rc.1'],
  ['--upload-pack=x', '0.2.0'],
] as const) {
  test(`checkTag: rejects ${JSON.stringify(tag)} for ${version}`, () => {
    assert.equal(checkTag(tag, version).ok, false);
  });
}

// checkChangelog

test('checkChangelog: accepts a matching first heading with a body', () => {
  const text = '# @kanbun-skam/skam\n\n## 0.2.0\n\n- change\n\n## 0.1.0\n';
  assert.equal(checkChangelog('@kanbun-skam/skam', text, '0.2.0').ok, true);
});

test('checkChangelog: accepts CRLF and trailing whitespace on the heading', () => {
  const text = '# x\r\n\r\n## 0.2.0  \r\n\r\n- change\r\n\r\n## 0.1.0\r\n';
  assert.equal(checkChangelog('x', text, '0.2.0').ok, true);
});

for (const [label, text] of [
  ['first heading is another version', '# x\n\n## 0.1.1\n\n- a\n\n## 0.2.0\n\n- b\n'],
  ['heading has no body', '# x\n\n## 0.2.0\n\n## 0.1.0\n\n- a\n'],
  ['heading is bracketed', '# x\n\n## [0.2.0]\n\n- a\n'],
  ['heading is a prefix match', '# x\n\n## 0.2.01\n\n- a\n'],
  ['only a level 3 heading', '# x\n\n### 0.2.0\n\n- a\n'],
] as const) {
  test(`checkChangelog: rejects when ${label}`, () => {
    const r = checkChangelog('@kanbun-skam/skam', text, '0.2.0');
    assert.match(errorsOf(r), /@kanbun-skam\/skam/);
  });
}

test('checkChangelog: accepts a prerelease heading', () => {
  assert.equal(checkChangelog('x', '## 0.3.0-rc.1\n\n- x', '0.3.0-rc.1').ok, true);
});

// parseNpmView

test('parseNpmView: found with versions and latest', () => {
  const stdout = '{"versions":["0.1.0","0.2.0"],"dist-tags":{"latest":"0.2.0"}}';
  assert.deepEqual(parseNpmView(0, stdout), {
    kind: 'found',
    versions: ['0.1.0', '0.2.0'],
    latest: '0.2.0',
  });
});

// 実物 (npm 12.2.0、2026-10-19): `npm view @kanbun-skam/skam versions dist-tags --json` は
// 要素 1 つの配列で返る
test('parseNpmView: npm 12 wraps the fields in a one-element array (実物)', () => {
  const stdout =
    '[\n  {\n    "versions": [\n      "0.1.0"\n    ],\n    "dist-tags": {\n      "latest": "0.1.0"\n    }\n  }\n]\n';
  assert.deepEqual(parseNpmView(0, stdout), {
    kind: 'found',
    versions: ['0.1.0'],
    latest: '0.1.0',
  });
});

for (const stdout of ['[]', '[{"versions":["0.1.0"]},{"versions":["0.2.0"]}]', '["0.1.0"]']) {
  test(`parseNpmView: an array that is not exactly one object is an error: ${stdout}`, () => {
    assert.equal(parseNpmView(0, stdout).kind, 'error');
  });
}

test('parseNpmView: a single version arrives as a string', () => {
  const stdout = '{"versions":"0.1.0","dist-tags":{"latest":"0.1.0"}}';
  assert.deepEqual(parseNpmView(0, stdout), {
    kind: 'found',
    versions: ['0.1.0'],
    latest: '0.1.0',
  });
});

for (const stdout of ['{"versions":["0.1.0"]}', '{"versions":["0.1.0"],"dist-tags":{}}']) {
  test(`parseNpmView: latest is undefined for ${stdout}`, () => {
    assert.deepEqual(parseNpmView(0, stdout), {
      kind: 'found',
      versions: ['0.1.0'],
      latest: undefined,
    });
  });
}

test('parseNpmView: broken JSON with status 0 is an error', () => {
  assert.equal(parseNpmView(0, '{oops').kind, 'error');
});

test('parseNpmView: E404 is not-found', () => {
  const stdout = '{"error":{"code":"E404","summary":"Not Found"}}';
  assert.deepEqual(parseNpmView(1, stdout), { kind: 'not-found' });
});

for (const code of ['E403', 'ETIMEDOUT', 'ECONNRESET', 'E500']) {
  test(`parseNpmView: ${code} is an error carrying the code`, () => {
    const r = parseNpmView(1, `{"error":{"code":"${code}","summary":"boom"}}`);
    assert.equal(r.kind, 'error');
    if (r.kind === 'error') assert.match(r.message, new RegExp(code));
  });
}

test('parseNpmView: non-JSON output with a failing status is an error', () => {
  assert.equal(parseNpmView(1, 'npm error code E404').kind, 'error');
});

test('parseNpmView: a null status (spawn failure) is an error', () => {
  assert.equal(parseNpmView(null, '').kind, 'error');
});

// checkRegistry

const found = (versions: string[], latest: string | undefined) =>
  ({ kind: 'found', versions, latest }) as const;

test('checkRegistry: accepts an unpublished stable version above latest', () => {
  assert.equal(checkRegistry('p', '0.2.0', found(['0.1.0'], '0.1.0')).ok, true);
});

test('checkRegistry: rejects an already published version', () => {
  assert.match(errorsOf(checkRegistry('p', '0.2.0', found(['0.1.0', '0.2.0'], '0.2.0'))), /p/);
});

test('checkRegistry: rejects a stable version below latest', () => {
  assert.equal(checkRegistry('p', '0.1.9', found(['0.2.0'], '0.2.0')).ok, false);
});

test('checkRegistry: does not compare a prerelease with latest', () => {
  assert.equal(checkRegistry('p', '0.3.0-rc.1', found(['0.2.0'], '0.2.0')).ok, true);
  assert.equal(checkRegistry('p', '0.1.0-rc.1', found(['0.2.0'], '0.2.0')).ok, true);
});

test('checkRegistry: skips the latest comparison when latest is absent', () => {
  assert.equal(checkRegistry('p', '0.2.0', found(['0.1.0'], undefined)).ok, true);
});

test('checkRegistry: accepts not-found', () => {
  assert.equal(checkRegistry('p', '0.2.0', { kind: 'not-found' }).ok, true);
});

test('checkRegistry: rejects an error and carries its message', () => {
  const r = checkRegistry('p', '0.2.0', { kind: 'error', message: 'ETIMEDOUT' });
  assert.match(errorsOf(r), /ETIMEDOUT/);
});

// parseGhReleaseView

test('parseGhReleaseView: maps exit status and stderr to a three-way lookup', () => {
  assert.deepEqual(parseGhReleaseView(0, ''), { kind: 'found' });
  assert.deepEqual(parseGhReleaseView(1, 'release not found'), { kind: 'not-found' });
  assert.equal(parseGhReleaseView(1, 'HTTP 401').kind, 'error');
  assert.equal(parseGhReleaseView(null, '').kind, 'error');
});

// compareSemver

for (const [a, b, expected] of [
  ['0.2.0', '0.1.9', 1],
  ['0.2.0', '0.2.0', 0],
  ['0.2.0-rc.1', '0.2.0', -1],
  ['0.2.0-rc.2', '0.2.0-rc.10', -1],
  ['0.10.0', '0.9.0', 1],
  ['0.2.0-rc.1', '0.2.0-rc.alpha', -1],
  ['0.2.0-rc.1', '0.2.0-rc.1.1', -1],
] as const) {
  test(`compareSemver(${a}, ${b}) is ${expected}`, () => {
    assert.equal(compareSemver(a, b), expected);
    assert.equal(compareSemver(b, a), expected === 0 ? 0 : -expected);
  });
}

// distTagFor

test('distTagFor: stable is latest and prerelease is next', () => {
  assert.equal(distTagFor('0.2.0'), 'latest');
  assert.equal(distTagFor('0.2.0-rc.1'), 'next');
});

// orderByDependencies

test('orderByDependencies: orders the current six packages layer by layer', () => {
  const shuffled = [...currentWorkspace()].reverse();
  const r = orderByDependencies(shuffled);
  assert.equal(r.ok, true);
  if (r.ok)
    assert.deepEqual(
      r.value.map((p) => p.name),
      [
        '@kanbun-skam/skam',
        '@kanbun-skam/skam-canvas-renderer',
        '@kanbun-skam/skam-html-renderer',
        '@kanbun-skam/skam-xml-parser',
        '@kanbun-skam/skam-xml-stringify',
        '@kanbun-skam/skam-web-component',
      ]
    );
});

test('orderByDependencies: rejects a cycle, a self dependency and an unknown internal dependency', () => {
  const a = '@kanbun-skam/a';
  const b = '@kanbun-skam/b';
  const cycle = [
    pkg(a, { dependencies: { [b]: 'workspace:*' } }),
    pkg(b, { dependencies: { [a]: 'workspace:*' } }),
  ];
  assert.equal(orderByDependencies(cycle).ok, false);
  assert.equal(orderByDependencies([pkg(a, { dependencies: { [a]: 'workspace:*' } })]).ok, false);
  const unknown = [pkg(a, { peerDependencies: { '@kanbun-skam/unknown': 'workspace:*' } })];
  assert.match(errorsOf(orderByDependencies(unknown)), /@kanbun-skam\/unknown/);
});

test('orderByDependencies: follows optionalDependencies too', () => {
  const a = '@kanbun-skam/a';
  const b = '@kanbun-skam/b';
  const r = orderByDependencies([pkg(a, { optionalDependencies: { [b]: 'workspace:*' } }), pkg(b)]);
  assert.equal(r.ok, true);
  if (r.ok)
    assert.deepEqual(
      r.value.map((p) => p.name),
      [b, a]
    );
});

// checkPackedPackageJson

const SKAM = '@kanbun-skam/skam';
const expected = { name: '@kanbun-skam/skam-xml-parser', version: '0.2.0', internalNames: [SKAM] };
const goodPacked = () => ({
  name: expected.name,
  version: '0.2.0',
  dependencies: { [SKAM]: '0.2.0', '@xmldom/xmldom': '0.8.15' },
});

test('checkPackedPackageJson: accepts a rewritten package.json', () => {
  assert.equal(checkPackedPackageJson(expected, goodPacked()).ok, true);
});

test('checkPackedPackageJson: rejects a different name or version', () => {
  assert.equal(checkPackedPackageJson(expected, { ...goodPacked(), name: 'other' }).ok, false);
  assert.equal(checkPackedPackageJson(expected, { ...goodPacked(), version: '0.2.1' }).ok, false);
});

for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
  test(`checkPackedPackageJson: rejects workspace: left in ${field}`, () => {
    const packed = { ...goodPacked(), [field]: { '@xmldom/xmldom': 'workspace:*' } };
    assert.match(errorsOf(checkPackedPackageJson(expected, packed)), /workspace:/);
  });
}

for (const range of [
  '0.1.1',
  '^0.2.0',
  '=0.2.0',
  'npm:@kanbun-skam/skam@0.2.0',
  'file:../skam',
  'link:../skam',
  'catalog:',
]) {
  test(`checkPackedPackageJson: rejects an internal range ${range}`, () => {
    const packed = { ...goodPacked(), dependencies: { [SKAM]: range } };
    assert.equal(checkPackedPackageJson(expected, packed).ok, false);
  });
}

for (const script of ['preinstall', 'install', 'postinstall', 'prepare']) {
  test(`checkPackedPackageJson: rejects a ${script} script`, () => {
    const packed = { ...goodPacked(), scripts: { [script]: 'node x.js' } };
    assert.match(errorsOf(checkPackedPackageJson(expected, packed)), new RegExp(script));
  });
}

test('checkPackedPackageJson: does not throw on malformed input', () => {
  assert.equal(checkPackedPackageJson(expected, { ...goodPacked(), dependencies: 'x' }).ok, false);
  assert.equal(checkPackedPackageJson(expected, null).ok, false);
  assert.equal(checkPackedPackageJson(expected, { ...goodPacked(), scripts: 'x' }).ok, false);
});

// verifyManifest

const INT_A = `sha512-${'A'.repeat(86)}==`;
const INT_B = `sha512-${'B'.repeat(86)}==`;
const goodManifest = () => ({
  schemaVersion: 1,
  tag: 'v0.2.0',
  version: '0.2.0',
  distTag: 'latest',
  packages: [
    { name: '@fx/a', file: 'fx-a-0.2.0.tgz', integrity: INT_A },
    { name: '@fx/b', file: 'fx-b-0.2.0.tgz', integrity: INT_B },
  ],
});
const goodFiles = () => [
  { file: 'fx-a-0.2.0.tgz', integrity: INT_A },
  { file: 'fx-b-0.2.0.tgz', integrity: INT_B },
];
const names = ['@fx/a', '@fx/b'];

test('verifyManifest: accepts a consistent manifest', () => {
  const r = verifyManifest(goodManifest(), goodFiles(), { tag: 'v0.2.0', names });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.packages.length, 2);
});

test('verifyManifest: rejects a tgz that is not in the manifest and names it', () => {
  const files = [...goodFiles(), { file: 'extra-0.2.0.tgz', integrity: INT_A }];
  assert.match(errorsOf(verifyManifest(goodManifest(), files, { names })), /extra-0\.2\.0\.tgz/);
});

test('verifyManifest: rejects a manifest tgz that is missing from files and names it', () => {
  const files = goodFiles().slice(0, 1);
  assert.match(errorsOf(verifyManifest(goodManifest(), files, { names })), /fx-b-0\.2\.0\.tgz/);
});

test('verifyManifest: rejects an integrity mismatch and names the file', () => {
  const files = [goodFiles()[0]!, { file: 'fx-b-0.2.0.tgz', integrity: INT_A }];
  assert.match(errorsOf(verifyManifest(goodManifest(), files, { names })), /fx-b-0\.2\.0\.tgz/);
});

const mutations: [string, (m: ReturnType<typeof goodManifest>) => unknown][] = [
  ['schemaVersion 2', (m) => ({ ...m, schemaVersion: 2 })],
  ['tag that differs from expected', (m) => ({ ...m, tag: 'v0.2.1', version: '0.2.1' })],
  ['version that differs from tag', (m) => ({ ...m, version: '0.2.1' })],
  ['distTag next for a stable version', (m) => ({ ...m, distTag: 'next' })],
  ['unknown distTag', (m) => ({ ...m, distTag: 'beta' })],
  ['empty packages', (m) => ({ ...m, packages: [] })],
  [
    'duplicate name',
    (m) => ({ ...m, packages: [m.packages[0], { ...m.packages[0]!, file: 'z.tgz' }] }),
  ],
  ['names that differ from expected', (m) => ({ ...m, packages: [m.packages[0]] })],
  [
    'file with a parent segment',
    (m) => ({ ...m, packages: [{ ...m.packages[0]!, file: '../x.tgz' }, m.packages[1]] }),
  ],
  [
    'absolute file',
    (m) => ({ ...m, packages: [{ ...m.packages[0]!, file: '/abs.tgz' }, m.packages[1]] }),
  ],
  [
    'file with a space',
    (m) => ({ ...m, packages: [{ ...m.packages[0]!, file: 'a b.tgz' }, m.packages[1]] }),
  ],
  [
    'file with a semicolon',
    (m) => ({ ...m, packages: [{ ...m.packages[0]!, file: 'a;b.tgz' }, m.packages[1]] }),
  ],
  [
    'duplicate file',
    (m) => ({ ...m, packages: [m.packages[0], { ...m.packages[1]!, file: m.packages[0]!.file }] }),
  ],
  [
    'sha256 integrity',
    (m) => ({ ...m, packages: [{ ...m.packages[0]!, integrity: 'sha256-abc' }, m.packages[1]] }),
  ],
];
for (const [label, mutate] of mutations) {
  test(`verifyManifest: rejects ${label}`, () => {
    const r = verifyManifest(mutate(goodManifest()), goodFiles(), { tag: 'v0.2.0', names });
    assert.equal(r.ok, false);
  });
}

for (const [label, value] of [
  ['null', null],
  ['an array', []],
  ['a string', 'x'],
] as const) {
  test(`verifyManifest: rejects ${label} without throwing`, () => {
    assert.equal(verifyManifest(value, goodFiles(), { names }).ok, false);
  });
}

// parseNpmViewVersions

test('parseNpmViewVersions: reads the versions array (実物の形: 1 版でも配列)', () => {
  assert.deepEqual(parseNpmViewVersions({ status: 0, stdout: '[\n  "0.1.0"\n]\n', stderr: '' }), {
    kind: 'found',
    versions: ['0.1.0'],
    latest: undefined,
  });
});

test('parseNpmViewVersions: E404 is not-found, other shapes are errors', () => {
  const e404 = '{"error":{"code":"E404","summary":"Not Found"}}';
  assert.deepEqual(parseNpmViewVersions({ status: 1, stdout: e404, stderr: '' }), {
    kind: 'not-found',
  });
  assert.equal(parseNpmViewVersions({ status: 0, stdout: '"0.1.0"', stderr: '' }).kind, 'error');
  assert.equal(parseNpmViewVersions({ status: 0, stdout: 'not json', stderr: '' }).kind, 'error');
  assert.equal(parseNpmViewVersions({ status: 1, stdout: '["0.1.0"]', stderr: '' }).kind, 'error');
});

// parseReleaseFlags

test('parseReleaseFlags: reads each single mode and skips a leading --', () => {
  const ok = (value: unknown) => ({ ok: true, value });
  assert.deepEqual(parseReleaseFlags([]), ok({ mode: 'normal' }));
  assert.deepEqual(parseReleaseFlags(['--', '--tag-only']), ok({ mode: 'tag-only' }));
  assert.deepEqual(parseReleaseFlags(['--pre', 'beta']), ok({ mode: 'pre', tag: 'beta' }));
  assert.deepEqual(parseReleaseFlags(['--pre=rc']), ok({ mode: 'pre', tag: 'rc' }));
  assert.deepEqual(parseReleaseFlags(['--exit-pre']), ok({ mode: 'exit-pre' }));
});

for (const [label, argv] of [
  ['--pre without a value', ['--pre']],
  ['an uppercase --pre value', ['--pre', 'Beta']],
  ['a --pre value with a digit', ['--pre', 'rc1']],
  ['--pre followed by a flag', ['--pre', '--tag-only']],
  ['--tag-only with --exit-pre', ['--tag-only', '--exit-pre']],
  ['--pre with --tag-only', ['--pre', 'beta', '--tag-only']],
  ['an unknown flag', ['--yes']],
  ['a bare word', ['beta']],
] as const) {
  test(`parseReleaseFlags: rejects ${label}`, () => {
    assert.equal(parseReleaseFlags(argv).ok, false);
  });
}

// decideEntry / decideEntryWithStatus

const SHA_HEAD = 'a'.repeat(40);
const SHA_OTHER = 'b'.repeat(40);

function observed(overrides: Partial<EntryObservation> = {}): EntryObservation {
  return {
    flags: { mode: 'normal' },
    head: SHA_HEAD,
    versions: { ok: true, value: '0.2.0' },
    originTag: { kind: 'absent' },
    localTagCommit: undefined,
    published: { kind: 'counts', published: 0, total: 6 },
    preMode: false,
    ...overrides,
  };
}

const counts = (published: number, total = 6) => ({ kind: 'counts' as const, published, total });
const present = (commit: string) => ({ kind: 'present' as const, commit });
const releaseStatus: Check<ChangesetStatus> = {
  ok: true,
  value: { kind: 'release', version: '0.2.0' },
};
const noneStatus: Check<ChangesetStatus> = { ok: true, value: { kind: 'none' } };

function stopRow(d: ReturnType<typeof decideEntry>): number {
  assert.equal(d.kind, 'stop');
  return d.kind === 'stop' ? d.row : -1;
}

function stopReason(d: ReturnType<typeof decideEntry>): string {
  assert.equal(d.kind, 'stop');
  return d.kind === 'stop' ? d.reason : '';
}

for (const [label, o] of [
  ['ls-remote failed', observed({ originTag: { kind: 'error' } })],
  ['npm view failed', observed({ published: { kind: 'error' } })],
  [
    'versions differ',
    observed({ versions: { ok: false, errors: ['skam-xml-parser: version 0.2.1 differs'] } }),
  ],
  ['version is not a semver', observed({ versions: { ok: true, value: '0.2.0/../x' } })],
] as const) {
  test(`decideEntry: row 0 stops when ${label}`, () => {
    assert.equal(stopRow(decideEntry(o)), 0);
  });
}

test('decideEntry: row 1 resumes the second half when the tag is at HEAD and unfinished', () => {
  const d = decideEntry(observed({ originTag: present(SHA_HEAD), published: counts(3) }));
  assert.deepEqual(d, { kind: 'after-push' });
});

test('decideEntry: row 2 with --pre at HEAD does not mention git switch', () => {
  const d = decideEntry(
    observed({
      flags: { mode: 'pre', tag: 'beta' },
      originTag: present(SHA_HEAD),
      published: counts(3),
    })
  );
  assert.equal(stopRow(d), 2);
  assert.doesNotMatch(stopReason(d), /git switch/);
});

test('decideEntry: row 2 away from HEAD tells how to switch to the tag', () => {
  const d = decideEntry(observed({ originTag: present(SHA_OTHER), published: counts(0) }));
  assert.equal(stopRow(d), 2);
  assert.match(stopReason(d), /git switch --detach v0\.2\.0/);
});

test('decideEntry: row 2 with --tag-only and an unpublished origin tag', () => {
  const d = decideEntry(
    observed({
      flags: { mode: 'tag-only' },
      originTag: present(SHA_HEAD),
      published: counts(0),
    })
  );
  assert.equal(stopRow(d), 2);
});

test('decideEntry: row 3 when only a local tag at HEAD exists', () => {
  const d = decideEntry(observed({ localTagCommit: SHA_HEAD }));
  assert.equal(stopRow(d), 3);
  assert.match(stopReason(d), /git tag -d v0\.2\.0/);
});

test('decideEntry: row 4 when a local tag points elsewhere', () => {
  const d = decideEntry(observed({ localTagCommit: SHA_OTHER }));
  assert.equal(stopRow(d), 4);
  assert.match(stopReason(d), new RegExp(SHA_OTHER));
});

test('decideEntry: row 5 stops --tag-only for a completed release', () => {
  const d = decideEntry(
    observed({
      flags: { mode: 'tag-only' },
      originTag: present(SHA_HEAD),
      published: counts(6),
    })
  );
  assert.equal(stopRow(d), 5);
});

test('decideEntry: row 6 stops --tag-only when some packages are published', () => {
  const d = decideEntry(observed({ flags: { mode: 'tag-only' }, published: counts(2) }));
  assert.equal(stopRow(d), 6);
});

test('decideEntry: row 6a enters the first half for --tag-only with nothing published', () => {
  const d = decideEntry(observed({ flags: { mode: 'tag-only' }, published: counts(0) }));
  assert.deepEqual(d, { kind: 'front', mode: { mode: 'tag-only' } });
});

test('decideEntry: row 7 enters the first half for --exit-pre and --pre', () => {
  assert.deepEqual(decideEntry(observed({ flags: { mode: 'exit-pre' } })), {
    kind: 'front',
    mode: { mode: 'exit-pre' },
  });
  const d = decideEntry(
    observed({
      flags: { mode: 'pre', tag: 'beta' },
      originTag: present(SHA_HEAD),
      published: counts(6),
    })
  );
  assert.deepEqual(d, { kind: 'front', mode: { mode: 'pre', tag: 'beta' } });
});

test('decideEntry: a completed release without flags needs the changeset status', () => {
  for (const commit of [SHA_HEAD, SHA_OTHER]) {
    const d = decideEntry(observed({ originTag: present(commit), published: counts(6) }));
    assert.deepEqual(d, { kind: 'need-status' });
  }
});

test('decideEntryWithStatus: row 8 only checks the second half when nothing is pending', () => {
  const o = observed({ originTag: present(SHA_HEAD), published: counts(6) });
  assert.deepEqual(decideEntryWithStatus(o, noneStatus), { kind: 'after-push-check-only' });
  assert.deepEqual(decideEntryWithStatus(o, releaseStatus), {
    kind: 'front',
    mode: { mode: 'normal' },
  });
});

test('decideEntryWithStatus: rows 9 to 14 for a completed release away from HEAD', () => {
  const o = observed({ originTag: present(SHA_OTHER), published: counts(6) });
  assert.equal(stopRow(decideEntryWithStatus(o, { ok: false, errors: ['bad shape'] })), 9);
  const inconsistent: Check<ChangesetStatus> = {
    ok: true,
    value: { kind: 'inconsistent', reason: 'only 3 packages have a release' },
  };
  assert.equal(stopRow(decideEntryWithStatus(o, inconsistent)), 10);
  assert.deepEqual(decideEntryWithStatus(o, releaseStatus), {
    kind: 'front',
    mode: { mode: 'normal' },
  });
  assert.equal(stopRow(decideEntryWithStatus({ ...o, preMode: true }, noneStatus)), 13);
  assert.equal(stopRow(decideEntryWithStatus(o, noneStatus)), 14);
});

test('decideEntryWithStatus: the current master state enters the first half (row 11)', () => {
  // 0.1.1、npm には 0.1.0 だけ、tag なし
  const o = observed({ versions: { ok: true, value: '0.1.1' }, published: counts(0) });
  assert.deepEqual(decideEntry(o), { kind: 'need-status' });
  assert.deepEqual(decideEntryWithStatus(o, releaseStatus), {
    kind: 'front',
    mode: { mode: 'normal' },
  });
});

test('decideEntryWithStatus: row 12 when the version is bumped but there is no tag anywhere', () => {
  for (const preMode of [false, true]) {
    const d = decideEntryWithStatus(observed({ preMode, published: counts(0) }), noneStatus);
    assert.equal(stopRow(d), 12);
    assert.match(stopReason(d), /--tag-only/);
  }
});

test('decideEntryWithStatus: row 14 for a partly published version with no tag names the count', () => {
  const d = decideEntryWithStatus(observed({ published: counts(3) }), noneStatus);
  assert.equal(stopRow(d), 14);
  assert.match(stopReason(d), /3\/6/);
});

test('decideEntry: the same table works for a different package total', () => {
  const o = observed({ originTag: present(SHA_HEAD), published: counts(2, 2) });
  assert.deepEqual(decideEntry(o), { kind: 'need-status' });
  assert.deepEqual(decideEntryWithStatus(o, noneStatus), { kind: 'after-push-check-only' });
  assert.deepEqual(decideEntry({ ...o, published: counts(1, 2) }), { kind: 'after-push' });
});

test('decideEntryWithStatus: passes a decision made before the status is needed through', () => {
  const o = observed({ flags: { mode: 'exit-pre' } });
  assert.deepEqual(decideEntryWithStatus(o, { ok: false, errors: ['x'] }), {
    kind: 'front',
    mode: { mode: 'exit-pre' },
  });
});

// parseChangesetStatus

function statusJson(
  versions: Record<string, string>,
  extra: { name: string; type: string; newVersion: string }[] = []
): unknown {
  return {
    changesets: [{ id: 'consumer-feedback', summary: 'x', releases: [] }],
    releases: [
      ...Object.entries(versions).map(([name, newVersion]) => ({
        name,
        type: 'minor',
        oldVersion: '0.1.1',
        changesets: ['consumer-feedback'],
        newVersion,
      })),
      ...extra.map((e) => ({ ...e, oldVersion: '0.0.0', changesets: [] })),
    ],
  };
}

const allAt = (v: string) => Object.fromEntries(NAMES.map((n) => [n, v]));
const PRIVATE_NONE = ['playground', 'integration-tests', 'skam-screenshot'].map((n) => ({
  name: `@kanbun-skam/${n}`,
  type: 'none',
  newVersion: '0.0.0',
}));

test('parseChangesetStatus: before the version bump the release is 0.2.0', () => {
  const r = parseChangesetStatus(statusJson(allAt('0.2.0'), PRIVATE_NONE), NAMES);
  assert.deepEqual(r, { ok: true, value: { kind: 'release', version: '0.2.0' } });
});

test('parseChangesetStatus: right after pre enter beta the release is 0.2.0-beta.0', () => {
  const r = parseChangesetStatus(statusJson(allAt('0.2.0-beta.0'), PRIVATE_NONE), NAMES);
  assert.deepEqual(r, { ok: true, value: { kind: 'release', version: '0.2.0-beta.0' } });
});

test('parseChangesetStatus: after the beta.0 commit there is nothing to release', () => {
  const r = parseChangesetStatus({ changesets: [], releases: [] }, NAMES);
  assert.deepEqual(r, { ok: true, value: { kind: 'none' } });
});

test('parseChangesetStatus: right after pre exit ignores the private baseline-check patch', () => {
  const r = parseChangesetStatus(
    statusJson(allAt('0.2.0'), [
      ...PRIVATE_NONE,
      { name: '@kanbun-skam/baseline-check', type: 'patch', newVersion: '0.0.1' },
    ]),
    NAMES
  );
  assert.deepEqual(r, { ok: true, value: { kind: 'release', version: '0.2.0' } });
});

test('parseChangesetStatus: all public packages with type none is none', () => {
  const releases = NAMES.map((name) => ({ name, type: 'none', newVersion: '0.2.0' }));
  const r = parseChangesetStatus({ releases }, NAMES);
  assert.deepEqual(r, { ok: true, value: { kind: 'none' } });
});

test('parseChangesetStatus: three releases with scattered versions is inconsistent', () => {
  const versions = {
    [NAMES[0] as string]: '0.2.0',
    [NAMES[1] as string]: '0.2.1',
    [NAMES[2] as string]: '0.3.0',
  };
  const r = parseChangesetStatus(statusJson(versions), NAMES);
  assert.equal(r.ok && r.value.kind, 'inconsistent');
});

test('parseChangesetStatus: a release for only some public packages is inconsistent', () => {
  const versions = Object.fromEntries(NAMES.slice(0, 3).map((n) => [n, '0.2.0']));
  const r = parseChangesetStatus(statusJson(versions), NAMES);
  assert.equal(r.ok && r.value.kind, 'inconsistent');
});

for (const [label, json] of [
  ['releases is not an array', { releases: {} }],
  ['newVersion is a number', { releases: [{ name: NAMES[0], type: 'minor', newVersion: 2 }] }],
  ['json is null', null],
  ['an entry has no name', { releases: [{ type: 'minor', newVersion: '0.2.0' }] }],
] as const) {
  test(`parseChangesetStatus: fails when ${label}`, () => {
    assert.equal(parseChangesetStatus(json, NAMES).ok, false);
  });
}

// ignoredPackageDirs / planIgnoredRestore / checkVersionedChanges

const z = (...entries: string[]): string => entries.map((e) => `${e}\0`).join('');

const PUBLIC_DIRS = NAMES.map((n) => `packages/${n.replace('@kanbun-skam/', '')}`);
const IGNORED_DIRS = ['packages/baseline-check'];

// research §3a: pre exit の後の version で出る変更
const AFTER_PRE_EXIT = z(
  ' D .changeset/consumer-feedback-parser.md',
  ' D .changeset/pre.json',
  ' M packages/baseline-check/package.json',
  '?? packages/baseline-check/CHANGELOG.md',
  ' M packages/skam/CHANGELOG.md',
  ' M packages/skam/package.json',
  ' M packages/skam-xml-parser/CHANGELOG.md',
  ' M packages/skam-xml-parser/package.json'
);

test('ignoredPackageDirs: maps ignore names to workspace directories', () => {
  const workspace = [...currentWorkspace(), ...privatePackages()];
  const r = ignoredPackageDirs({ ignore: ['@kanbun-skam/baseline-check'] }, workspace);
  assert.deepEqual(r, { ok: true, value: ['packages/baseline-check'] });
});

test('ignoredPackageDirs: an absent ignore means no directories', () => {
  assert.deepEqual(ignoredPackageDirs({}, currentWorkspace()), { ok: true, value: [] });
});

for (const [label, config, dir] of [
  ['a name that is not in the workspace', { ignore: ['@kanbun-skam/ghost'] }, undefined],
  ['a directory with ..', { ignore: ['@kanbun-skam/skam'] }, '../x'],
  ['an absolute directory', { ignore: ['@kanbun-skam/skam'] }, '/etc'],
  ['ignore that is not a list of names', { ignore: [1] }, undefined],
] as const) {
  test(`ignoredPackageDirs: fails on ${label}`, () => {
    const workspace = currentWorkspace().map((p) =>
      dir !== undefined && p.name === '@kanbun-skam/skam' ? { ...p, dir } : p
    );
    assert.equal(ignoredPackageDirs(config, workspace).ok, false);
  });
}

test('planIgnoredRestore: splits the baseline-check changes into checkout and remove', () => {
  assert.deepEqual(planIgnoredRestore(AFTER_PRE_EXIT, IGNORED_DIRS), {
    checkout: ['packages/baseline-check/package.json'],
    remove: ['packages/baseline-check/CHANGELOG.md'],
  });
});

test('planIgnoredRestore: keeps spaces and non-ASCII paths as they are', () => {
  const porcelain = z(
    ' M packages/baseline-check/a b.md',
    '?? packages/baseline-check/日本.md',
    ' M packages/skam/package.json'
  );
  assert.deepEqual(planIgnoredRestore(porcelain, IGNORED_DIRS), {
    checkout: ['packages/baseline-check/a b.md'],
    remove: ['packages/baseline-check/日本.md'],
  });
});

test('planIgnoredRestore: does not match a directory that only shares the prefix', () => {
  const porcelain = z(' M packages/baseline-check-extra/package.json');
  assert.deepEqual(planIgnoredRestore(porcelain, IGNORED_DIRS), { checkout: [], remove: [] });
});

test('checkVersionedChanges: after the restore it returns the paths to add', () => {
  const restored = z(
    ' D .changeset/consumer-feedback-parser.md',
    ' D .changeset/pre.json',
    ' M packages/skam/CHANGELOG.md',
    ' M packages/skam/package.json',
    '?? packages/skam-xml-parser/CHANGELOG.md'
  );
  assert.deepEqual(checkVersionedChanges(restored, PUBLIC_DIRS), {
    ok: true,
    value: [
      '.changeset/consumer-feedback-parser.md',
      '.changeset/pre.json',
      'packages/skam/CHANGELOG.md',
      'packages/skam/package.json',
      'packages/skam-xml-parser/CHANGELOG.md',
    ],
  });
});

test('checkVersionedChanges: pre.json may be added, modified or deleted', () => {
  for (const line of [
    '?? .changeset/pre.json',
    'A  .changeset/pre.json',
    ' M .changeset/pre.json',
  ]) {
    assert.deepEqual(checkVersionedChanges(z(line), PUBLIC_DIRS), {
      ok: true,
      value: ['.changeset/pre.json'],
    });
  }
});

test('checkVersionedChanges: leftover baseline-check changes are rejected', () => {
  assert.equal(checkVersionedChanges(AFTER_PRE_EXIT, PUBLIC_DIRS).ok, false);
});

for (const [label, porcelain] of [
  ['a modified script', z(' M scripts/release.ts')],
  ['a rename inside .changeset', z('R  .changeset/b.md', '.changeset/a.md')],
  ['a modified config.json', z(' M .changeset/config.json')],
  ['a modified README.md', z(' M .changeset/README.md')],
  ['an edited changeset md', z(' M .changeset/a.md')],
  ['a deleted changeset README', z(' D .changeset/README.md')],
  ['a package file other than package.json', z(' M packages/skam/src/index.ts')],
  ['a deleted package.json', z(' D packages/skam/package.json')],
  ['a nested md under .changeset', z(' D .changeset/sub/a.md')],
] as const) {
  test(`checkVersionedChanges: rejects ${label}`, () => {
    assert.equal(checkVersionedChanges(porcelain, PUBLIC_DIRS).ok, false);
  });
}

// fillEmptyChangelogSection

const BUMP_LINE =
  '- Version bump only. Released together with the other @kanbun-skam packages at the same version.';

test('fillEmptyChangelogSection: fills an empty ## 0.2.1 section and passes checkChangelog', () => {
  const text = '# @kanbun-skam/skam\n\n## 0.2.1\n\n## 0.2.0\n\n### Minor Changes\n\n- a: x\n';
  const r = fillEmptyChangelogSection(text, '0.2.1');
  assert.equal(r.filled, true);
  assert.equal(
    r.text,
    `# @kanbun-skam/skam\n\n## 0.2.1\n\n${BUMP_LINE}\n\n## 0.2.0\n\n### Minor Changes\n\n- a: x\n`
  );
  assert.equal(checkChangelog('@kanbun-skam/skam', r.text, '0.2.1').ok, true);
});

test('fillEmptyChangelogSection: fills a prerelease section that is the only section', () => {
  const r = fillEmptyChangelogSection('# x\n\n## 0.2.0-beta.1\n', '0.2.0-beta.1');
  assert.equal(r.filled, true);
  assert.equal(r.text, `# x\n\n## 0.2.0-beta.1\n\n${BUMP_LINE}\n`);
  assert.equal(checkChangelog('x', r.text, '0.2.0-beta.1').ok, true);
});

test('fillEmptyChangelogSection: leaves a section with a body alone', () => {
  const text = '# x\n\n## 0.2.0\n\n### Minor Changes\n\n- a: x\n';
  assert.deepEqual(fillEmptyChangelogSection(text, '0.2.0'), { text, filled: false });
});

test('fillEmptyChangelogSection: leaves the text alone when the first heading is another version', () => {
  const text = '# x\n\n## 0.2.0\n\n## 0.1.0\n\n- a\n';
  assert.deepEqual(fillEmptyChangelogSection(text, '0.2.1'), { text, filled: false });
});

test('fillEmptyChangelogSection: keeps CRLF line endings', () => {
  const r = fillEmptyChangelogSection(
    '# x\r\n\r\n## 0.2.1\r\n\r\n## 0.2.0\r\n\r\n- a\r\n',
    '0.2.1'
  );
  assert.equal(r.filled, true);
  assert.equal(r.text, `# x\r\n\r\n## 0.2.1\r\n\r\n${BUMP_LINE}\r\n\r\n## 0.2.0\r\n\r\n- a\r\n`);
  assert.doesNotMatch(r.text, /[^\r]\n/);
});

// parseToolVersion / checkToolVersions

test('parseToolVersion: reads npm and gh versions', () => {
  assert.deepEqual(parseToolVersion('12.2.0\n', 'npm'), { ok: true, value: [12, 2, 0] });
  assert.deepEqual(
    parseToolVersion(
      'gh version 2.45.0 (2024-03-04)\nhttps://github.com/cli/cli/releases/tag/v2.45.0\n',
      'gh'
    ),
    { ok: true, value: [2, 45, 0] }
  );
});

for (const [label, out, tool] of [
  ['an npm prerelease', '12.2.0-pre\n', 'npm'],
  ['an npm beta', '12.2.0-beta', 'npm'],
  ['an empty npm output', '', 'npm'],
  ['a gh prerelease', 'gh version 2.45.0-rc1 (2024-03-04)\n', 'gh'],
  ['a gh output in the npm shape', '2.45.0\n', 'gh'],
] as const) {
  test(`parseToolVersion: rejects ${label}`, () => {
    assert.equal(parseToolVersion(out, tool).ok, false);
  });
}

test('checkToolVersions: accepts the supported ranges', () => {
  assert.equal(checkToolVersions([12, 2, 0], [2, 45, 0]).ok, true);
  assert.equal(checkToolVersions([12, 9, 9], [3, 0, 0]).ok, true);
});

test('checkToolVersions: rejects old npm and old gh', () => {
  assert.equal(checkToolVersions([12, 1, 0], [2, 45, 0]).ok, false);
  assert.equal(checkToolVersions([12, 1, 9], [2, 45, 0]).ok, false);
  assert.equal(checkToolVersions([12, 2, 0], [2, 44, 9]).ok, false);
});

test('checkToolVersions: npm 13 is rejected with the reason for the upper bound', () => {
  const r = checkToolVersions([13, 0, 0], [2, 45, 0]);
  assert.match(errorsOf(r), /stage/);
  assert.match(errorsOf(r), /13/);
});

// buildNpmArgs / buildGhArgs / childEnv

test('buildNpmArgs: pins both registries at the end', () => {
  assert.deepEqual(buildNpmArgs(['view', 'x', 'versions', '--json']), [
    'view',
    'x',
    'versions',
    '--json',
    '--registry',
    'https://registry.npmjs.org/',
    '--@kanbun-skam:registry=https://registry.npmjs.org/',
  ]);
});

test('buildGhArgs: gh api takes --hostname and no --repo', () => {
  const args = buildGhArgs(['api', 'repos/berlysia/kanbun-annotation/actions/runs']);
  assert.deepEqual(args, [
    'api',
    'repos/berlysia/kanbun-annotation/actions/runs',
    '--hostname',
    'github.com',
  ]);
  assert.equal(args.includes('--repo'), false);
});

test('buildGhArgs: other commands take --repo with the host', () => {
  assert.deepEqual(buildGhArgs(['run', 'list']), [
    'run',
    'list',
    '--repo',
    'github.com/berlysia/kanbun-annotation',
  ]);
});

test('childEnv: drops gh overrides and npm_config_ in any letter case', () => {
  assert.deepEqual(
    childEnv({
      PATH: 'p',
      NPM_CONFIG_REGISTRY: 'x',
      Npm_Config_Foo: 'y',
      npm_config_cache: 'z',
      GH_HOST: 'h',
      GH_REPO: 'r',
      GH_ENTERPRISE_TOKEN: 't',
    }),
    { PATH: 'p' }
  );
});

test('childEnv: keeps other variables and drops undefined values', () => {
  assert.deepEqual(childEnv({ HOME: '/h', GH_CONFIG_DIR: '/c', EMPTY: undefined }), {
    HOME: '/h',
    GH_CONFIG_DIR: '/c',
  });
});

// checkNpmRegistryConfig

test('checkNpmRegistryConfig: accepts the default registry with an unset or equal scope', () => {
  const url = 'https://registry.npmjs.org/';
  assert.equal(checkNpmRegistryConfig(url, undefined).ok, true);
  assert.equal(checkNpmRegistryConfig(url, url).ok, true);
  assert.equal(checkNpmRegistryConfig(`${url}\n`, 'undefined\n').ok, true);
});

test('checkNpmRegistryConfig: rejects other registries', () => {
  assert.equal(checkNpmRegistryConfig('http://registry.npmjs.org/', undefined).ok, false);
  assert.equal(
    checkNpmRegistryConfig('https://registry.npmjs.org/', 'https://example.com/').ok,
    false
  );
});

// isInteractiveStreams

test('isInteractiveStreams: only true when both are TTYs', () => {
  assert.equal(isInteractiveStreams({ stdinIsTTY: true, stdoutIsTTY: true }), true);
  assert.equal(isInteractiveStreams({ stdinIsTTY: true, stdoutIsTTY: false }), false);
  assert.equal(isInteractiveStreams({ stdinIsTTY: false, stdoutIsTTY: true }), false);
  assert.equal(isInteractiveStreams({ stdinIsTTY: false, stdoutIsTTY: false }), false);
  assert.equal(isInteractiveStreams({ stdinIsTTY: undefined, stdoutIsTTY: true }), false);
  assert.equal(isInteractiveStreams({ stdinIsTTY: true, stdoutIsTTY: undefined }), false);
});

// checkTrustList / combineTrustResults

const TRUST_ENTRY = {
  id: 'abc123',
  type: 'github',
  file: 'release.yml',
  repository: 'berlysia/kanbun-annotation',
  environment: 'npm',
  permissions: ['createStagedPackage'],
};

const cmd = (stdout: string, status: number | null = 0, stderr = '') => ({
  status,
  stdout,
  stderr,
});

test('checkTrustList: the expected single entry is ok as an object and as an array', () => {
  assert.deepEqual(checkTrustList(cmd(JSON.stringify(TRUST_ENTRY))), { kind: 'ok' });
  assert.deepEqual(checkTrustList(cmd(JSON.stringify([TRUST_ENTRY]))), { kind: 'ok' });
});

test('checkTrustList: unknown extra fields are tolerated', () => {
  assert.deepEqual(checkTrustList(cmd(JSON.stringify({ ...TRUST_ENTRY, extra: 1 }))), {
    kind: 'ok',
  });
});

test('checkTrustList: two entries (the old publish.yml trust) are a mismatch', () => {
  const old = { ...TRUST_ENTRY, id: 'old', file: 'publish.yml', permissions: ['createPackage'] };
  assert.equal(checkTrustList(cmd(JSON.stringify([TRUST_ENTRY, old]))).kind, 'mismatch');
});

test('checkTrustList: createPackage in permissions is a mismatch', () => {
  const r = checkTrustList(cmd(JSON.stringify({ ...TRUST_ENTRY, permissions: ['createPackage'] })));
  assert.equal(r.kind, 'mismatch');
});

test('checkTrustList: an empty list is a mismatch, not a shape error', () => {
  assert.equal(checkTrustList(cmd('[]')).kind, 'mismatch');
});

for (const [label, value] of [
  ['repository is missing', { ...TRUST_ENTRY, repository: undefined }],
  ['permissions is a string', { ...TRUST_ENTRY, permissions: 'createStagedPackage' }],
  ['id is missing', { ...TRUST_ENTRY, id: undefined }],
  ['permissions has a non-string', { ...TRUST_ENTRY, permissions: [1] }],
] as const) {
  test(`checkTrustList: ${label} is shape-unknown`, () => {
    assert.equal(checkTrustList(cmd(JSON.stringify(value))).kind, 'shape-unknown');
  });
}

test('checkTrustList: EOTP in the stdout JSON or in stderr is eotp', () => {
  assert.equal(checkTrustList(cmd('{"error":{"code":"EOTP"}}', 1)).kind, 'eotp');
  assert.equal(checkTrustList(cmd('', 1, 'npm error code EOTP\n')).kind, 'eotp');
});

test('checkTrustList: EOTP wins even when the exit status is 0', () => {
  assert.equal(checkTrustList(cmd('', 0, 'npm error code EOTP')).kind, 'eotp');
});

test('checkTrustList: a non-zero exit without EOTP is command-failed', () => {
  assert.equal(checkTrustList(cmd('', 1, 'npm error 500')).kind, 'command-failed');
  assert.equal(checkTrustList(cmd('', null)).kind, 'command-failed');
});

test('checkTrustList: empty or non-JSON output is shape-unknown', () => {
  assert.equal(checkTrustList(cmd('')).kind, 'shape-unknown');
  assert.equal(checkTrustList(cmd('not json')).kind, 'shape-unknown');
  assert.equal(checkTrustList(cmd('"text"')).kind, 'shape-unknown');
});

test('combineTrustResults: eotp > command-failed > shape-unknown > mismatch > ok', () => {
  const ok: TrustResult = { kind: 'ok' };
  const mismatch: TrustResult = { kind: 'mismatch', what: 'm' };
  const shape: TrustResult = { kind: 'shape-unknown', what: 's' };
  const failed: TrustResult = { kind: 'command-failed', what: 'c' };
  const eotp: TrustResult = { kind: 'eotp' };
  assert.equal(combineTrustResults([ok, mismatch, eotp]).kind, 'eotp');
  assert.equal(combineTrustResults([ok, shape, mismatch]).kind, 'shape-unknown');
  assert.equal(combineTrustResults([mismatch, failed, shape]).kind, 'command-failed');
  assert.equal(combineTrustResults([ok, mismatch]).kind, 'mismatch');
  assert.deepEqual(combineTrustResults(Array.from({ length: 6 }, () => ok)), { kind: 'ok' });
});
