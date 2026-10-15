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
  parseReleaseArgs,
} from './release-check.ts';
import type { WorkspacePackage } from './release-check.ts';

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

// parseReleaseArgs

test('parseReleaseArgs: reads --tag-only, skips a leading --, rejects the unknown', () => {
  assert.deepEqual(parseReleaseArgs([]), { ok: true, value: { tagOnly: false } });
  assert.deepEqual(parseReleaseArgs(['--tag-only']), { ok: true, value: { tagOnly: true } });
  assert.deepEqual(parseReleaseArgs(['--', '--tag-only']), { ok: true, value: { tagOnly: true } });
  assert.equal(parseReleaseArgs(['--force']).ok, false);
});
