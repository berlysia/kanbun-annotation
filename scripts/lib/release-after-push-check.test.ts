import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';
import {
  GH_245_LIST_ALLOWED,
  GH_245_VIEW_ALLOWED,
  GH_RUN_LIST_FIELDS,
  GH_RUN_VIEW_FIELDS,
  RELEASE_JOB_NAMES,
  RELEASING_SECTIONS,
  attemptKey,
  classifyPackageState,
  classifyStop,
  compareArtifactWithLog,
  createStreamSanitizer,
  extractLogManifest,
  ghReleaseViewArgs,
  ghRunAttemptArgs,
  ghRunDownloadArgs,
  ghRunListArgs,
  ghRunLogArgs,
  ghRunLogFailedArgs,
  ghRunViewArgs,
  ghRunWatchArgs,
  inspectTarball,
  isE409,
  isSafeTempPath,
  isSubsetOfAllowlist,
  judgeArtifactDir,
  judgeJobs,
  judgeLogManifest,
  judgePostCheck,
  judgeStaged,
  npmStageApproveArgs,
  npmStageDownloadArgs,
  npmStageListArgs,
  npmViewDistArgs,
  npmViewVersionsArgs,
  parseViewDist,
  pickRepresentative,
  pickStage,
  planApprove,
  sanitizeForTerminal,
  selectRun,
  sha512Integrity,
} from './release-after-push-check.ts';
import type { LogManifest } from './release-after-push-check.ts';
import type {
  Check,
  ClassifiedStop,
  PackageState,
  Published,
  RegistryResponse,
  ReleaseManifest,
  StopObservation,
  StopRoute,
} from './release-types.ts';

// --- 実物の fixture (2026-10-15 に読み取りだけで採ったもの。scratchpad は参照しない) ---

// 実物 (2026-10-15 に読み取りだけで採った CI の run 38719023343。steps は省いた)
const REAL_RUN_VIEW_JSON = {
  conclusion: 'success',
  jobs: [
    {
      completedAt: '2026-10-15T10:17:02Z',
      conclusion: 'success',
      databaseId: 116368686557,
      name: 'Visual Regression Test',
      startedAt: '2026-10-15T10:15:59Z',
      status: 'completed',
      steps: [],
      url: 'https://github.com/berlysia/kanbun-annotation/actions/runs/38719023343/job/116368686557',
    },
    {
      completedAt: '2026-10-15T10:16:21Z',
      conclusion: 'success',
      databaseId: 116368686820,
      name: 'Lint',
      startedAt: '2026-10-15T10:15:59Z',
      status: 'completed',
      steps: [],
      url: 'https://github.com/berlysia/kanbun-annotation/actions/runs/38719023343/job/116368686820',
    },
    {
      completedAt: '2026-10-15T10:16:39Z',
      conclusion: 'success',
      databaseId: 116368686869,
      name: 'Test',
      startedAt: '2026-10-15T10:15:59Z',
      status: 'completed',
      steps: [],
      url: 'https://github.com/berlysia/kanbun-annotation/actions/runs/38719023343/job/116368686869',
    },
    {
      completedAt: '2026-10-15T10:16:19Z',
      conclusion: 'success',
      databaseId: 116368686901,
      name: 'Knip',
      startedAt: '2026-10-15T10:15:59Z',
      status: 'completed',
      steps: [],
      url: 'https://github.com/berlysia/kanbun-annotation/actions/runs/38719023343/job/116368686901',
    },
    {
      completedAt: '2026-10-15T10:16:31Z',
      conclusion: 'success',
      databaseId: 116368686924,
      name: 'Consumer (packed tarballs)',
      startedAt: '2026-10-15T10:15:59Z',
      status: 'completed',
      steps: [],
      url: 'https://github.com/berlysia/kanbun-annotation/actions/runs/38719023343/job/116368686924',
    },
    {
      completedAt: '2026-10-15T10:16:21Z',
      conclusion: 'success',
      databaseId: 116368687012,
      name: 'Build',
      startedAt: '2026-10-15T10:15:59Z',
      status: 'completed',
      steps: [],
      url: 'https://github.com/berlysia/kanbun-annotation/actions/runs/38719023343/job/116368687012',
    },
    {
      completedAt: '2026-10-15T10:16:32Z',
      conclusion: 'success',
      databaseId: 116368687036,
      name: 'Type Check',
      startedAt: '2026-10-15T10:15:59Z',
      status: 'completed',
      steps: [],
      url: 'https://github.com/berlysia/kanbun-annotation/actions/runs/38719023343/job/116368687036',
    },
    {
      completedAt: '2026-10-15T10:16:22Z',
      conclusion: 'success',
      databaseId: 116368687046,
      name: 'Format Check',
      startedAt: '2026-10-15T10:15:59Z',
      status: 'completed',
      steps: [],
      url: 'https://github.com/berlysia/kanbun-annotation/actions/runs/38719023343/job/116368687046',
    },
  ],
  status: 'completed',
};

// 実物 (gh api repos/berlysia/kanbun-annotation/actions/runs/38719023343 のうち使うキーだけ)
const REAL_API_RUN_JSON = {
  id: 38719023343,
  name: 'CI',
  head_branch: 'master',
  head_sha: '895ba1956d27848ff3f871d28534c9c4b3bc0c5e',
  run_number: 106,
  event: 'push',
  status: 'completed',
  conclusion: 'success',
  run_attempt: 1,
  path: '.github/workflows/ci.yml',
};

// 実物 (ci.yml の job の log の先頭 20 行。BOM と タブは escape で書く)
const REAL_LOG_HEAD = [
  "Visual Regression Test\tSet up job\t\ufeff2026-10-15T10:15:59.9299767Z Current runner version: '2.337.0'",
  'Visual Regression Test\tSet up job\t2026-10-15T10:15:59.9328247Z ##[group]Runner Image Provisioner',
  'Visual Regression Test\tSet up job\t2026-10-15T10:15:59.9329127Z Hosted Compute Agent',
  'Visual Regression Test\tSet up job\t2026-10-15T10:15:59.9329792Z Version: 20261012.601',
  'Visual Regression Test\tSet up job\t2026-10-15T10:15:59.9330734Z Commit: f3dc54e1fb89da6852db922499a0233137369e1d',
  'Visual Regression Test\tSet up job\t2026-10-15T10:15:59.9331501Z Build Date: 2026-10-12T17:48:21Z',
  'Visual Regression Test\tSet up job\t2026-10-15T10:15:59.9332292Z Worker ID: {849995a0-3bff-4be3-aaa0-9bece43b97a2}',
  'Visual Regression Test\tSet up job\t2026-10-15T10:15:59.9333062Z Region: eastus2',
  'Visual Regression Test\tSet up job\t2026-10-15T10:15:59.9333675Z Cloud: Azure',
  'Visual Regression Test\tSet up job\t2026-10-15T10:15:59.9334235Z ##[endgroup]',
  'Visual Regression Test\tSet up job\t2026-10-15T10:15:59.9335718Z ##[group]Operating System',
  'Visual Regression Test\tSet up job\t2026-10-15T10:15:59.9336461Z Ubuntu',
  'Visual Regression Test\tSet up job\t2026-10-15T10:15:59.9337004Z 24.04.5',
  'Visual Regression Test\tSet up job\t2026-10-15T10:15:59.9337502Z LTS',
  'Visual Regression Test\tSet up job\t2026-10-15T10:15:59.9338101Z ##[endgroup]',
  'Visual Regression Test\tSet up job\t2026-10-15T10:15:59.9338649Z ##[group]Runner Image',
  'Visual Regression Test\tSet up job\t2026-10-15T10:15:59.9339332Z Image: ubuntu-24.04',
  'Visual Regression Test\tSet up job\t2026-10-15T10:15:59.9339898Z Version: 20261012.334.1',
  'Visual Regression Test\tSet up job\t2026-10-15T10:15:59.9341208Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20261012.334/images/ubuntu/Ubuntu2404-Readme.md',
  'Visual Regression Test\tSet up job\t2026-10-15T10:15:59.9343074Z Image Release: https://github.com/actions/runner-images/releases/tag/ubuntu24%2F20261012.334',
];

// 実物 (npm view @kanbun-skam/skam@0.1.0 dist-tags dist.integrity dist.attestations --json、逐語)
const REAL_NPM_VIEW_DIST =
  '[\n  {\n    "dist-tags": {\n      "latest": "0.1.0"\n    },\n    "dist.integrity": "sha512-1I8KR06MrkeZDfNJOqHU8qAVwzB1gA8ct0UUHSQAK/owuPpMMIeh6h2L2L2fpQjThXscjwYrWwCOYAHU+HMBOQ=="\n  }\n]\n';

// 実物 (2026-10-20 に採った。npm view @kanbun-skam/skam@0.2.0 dist-tags dist.integrity dist.attestations --json、逐語)
const REAL_NPM_VIEW_DIST_WITH_ATTESTATIONS =
  '[\n  {\n    "dist-tags": {\n      "latest": "0.2.0"\n    },\n    "dist.integrity": "sha512-jg67ylF8HOoCeMhFv65DSub3clKuzEKCUBXziutxGrTMmpQjL921MjnybhrlshrOjr6XVAnYexEkvuz9Nhyd1A==",\n    "dist.attestations": {\n      "url": "https://registry.npmjs.org/-/npm/v1/attestations/@kanbun-skam%2fskam@0.2.0",\n      "provenance": {\n        "predicateType": "https://slsa.dev/provenance/v1"\n      }\n    }\n  }\n]\n';

// 実物 (pnpm pack した skam-xml-parser-0.1.1.tgz を gunzip した先頭 512 バイト)
const REAL_TAR_HEADER_HEX =
  '7061636b6167652f646973742f6368756e6b2d36434f494657584a2e6a73000000000000000000000000000000000000' +
  '000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000' +
  '000000003030303634342000303030303030200030303030303020003030303030303730303634203033353630313136' +
  '363034203031343433352000300000000000000000000000000000000000000000000000000000000000000000000000' +
  '000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000' +
  '000000000000000000000000000000000075737461720030300000000000000000000000000000000000000000000000' +
  '000000000000000000000000000000000000000000000000000000000000000000000000000000000030303030303020' +
  '003030303030302000000000000000000000000000000000000000000000000000000000000000000000000000000000' +
  '000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000' +
  '000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000000';

// --- 共通の道具 ---

const SHA = '895ba1956d27848ff3f871d28534c9c4b3bc0c5e';
const UUID = '0b6f6a52-8c5f-4b6e-9d37-3f1c2a1e9a10';
const UUID2 = '1c7a7b63-9d60-4c7f-8e48-4a2d3b2fa021';
const VERSION = '0.2.0';
const TAG = 'v0.2.0';
const NAMES = [
  '@kanbun-skam/skam',
  '@kanbun-skam/skam-xml-parser',
  '@kanbun-skam/skam-xml-stringify',
  '@kanbun-skam/skam-html-renderer',
  '@kanbun-skam/skam-canvas-renderer',
  '@kanbun-skam/skam-web-component',
];
const MIB = 1024 * 1024;

function must<T>(check: Check<T>): T {
  if (!check.ok) throw new Error(`expected ok, got: ${check.errors.join('; ')}`);
  return check.value;
}

function integrityOf(n: number): string {
  return `sha512-${Buffer.alloc(64, n).toString('base64')}`;
}

function fileOf(name: string): string {
  return `${name.replace('@', '').replace('/', '-')}-${VERSION}.tgz`;
}

// ======================================================================
// T1: 表示の無害化
// ======================================================================

test('sanitizeForTerminal: ESC、OSC、CR を除く (ESC の後ろの文字は残る)', () => {
  assert.equal(sanitizeForTerminal('a\x1b[2Jb'), 'a[2Jb');
  assert.equal(sanitizeForTerminal('\x1b]0;title\x07'), ']0;title');
  assert.equal(sanitizeForTerminal('x\ry'), 'xy');
});

test('sanitizeForTerminal: DEL、NUL、BEL、C1 を除く', () => {
  for (const c of ['\x7f', '\x00', '\x07', '\x9b', '\u0085']) {
    assert.equal(sanitizeForTerminal(c), '');
  }
});

test('sanitizeForTerminal: bidi、isolate、ゼロ幅、BOM、行区切り、タグ文字を除く', () => {
  assert.equal(sanitizeForTerminal('x\u202ey'), 'xy');
  assert.equal(sanitizeForTerminal('x\u2066y'), 'xy');
  assert.equal(sanitizeForTerminal('x\u200by'), 'xy');
  assert.equal(sanitizeForTerminal('x\ufeffy'), 'xy');
  assert.equal(sanitizeForTerminal('x\u2028y'), 'xy');
  assert.equal(sanitizeForTerminal('x\u2029y'), 'xy');
  assert.equal(sanitizeForTerminal('x\u{E0041}y'), 'xy');
});

test('sanitizeForTerminal: 改行とタブと日本語はそのまま', () => {
  assert.equal(sanitizeForTerminal('line1\nline2\t'), 'line1\nline2\t');
  assert.equal(sanitizeForTerminal('漢文の訓点'), '漢文の訓点');
});

test('createStreamSanitizer: 多バイト文字を 2 チャンクに分けても 2 回目で出る', () => {
  const s = createStreamSanitizer();
  const bytes = Buffer.from('あ');
  assert.equal(s.write(bytes.subarray(0, 1)), '');
  assert.equal(s.write(bytes.subarray(1)), 'あ');
  assert.equal(s.end(), '');
});

test('createStreamSanitizer: 多バイトの途中で end() すると U+FFFD', () => {
  const s = createStreamSanitizer();
  assert.equal(s.write(Buffer.from('あ').subarray(0, 2)), '');
  assert.equal(s.end(), '\ufffd');
});

test('createStreamSanitizer: ESC と [ を別のチャンクに分けても ESC は消え [ は残る', () => {
  const s = createStreamSanitizer();
  assert.equal(s.write(Buffer.from('a\x1b')), 'a');
  assert.equal(s.write(Buffer.from('[2Jb')), '[2Jb');
});

test('createStreamSanitizer: 不正な UTF-8 は U+FFFD になる', () => {
  const s = createStreamSanitizer();
  assert.equal(s.write(Buffer.from([0xff, 0x41])), '\ufffdA');
});

// ======================================================================
// T2: 後半の引数の組み立て
// ======================================================================

test('npmStageApproveArgs / npmStageDownloadArgs: UUID 以外は fail', () => {
  assert.equal(npmStageApproveArgs('--otp=1').ok, false);
  assert.equal(npmStageDownloadArgs('../x').ok, false);
  assert.equal(npmStageApproveArgs('').ok, false);
  assert.deepEqual(must(npmStageApproveArgs(UUID)), ['stage', 'approve', UUID]);
  assert.deepEqual(must(npmStageDownloadArgs(UUID)), ['stage', 'download', UUID]);
  assert.deepEqual(must(npmStageApproveArgs(UUID.toUpperCase())), [
    'stage',
    'approve',
    UUID.toUpperCase(),
  ]);
});

test('ghRunLogFailedArgs: --log-failed と --job を含み、不正な id は ok: false', () => {
  assert.deepEqual(must(ghRunLogFailedArgs(1, 2)), [
    'run',
    'view',
    '1',
    '--log-failed',
    '--job',
    '2',
  ]);
  assert.equal(ghRunLogFailedArgs(1, 0).ok, false);
  assert.equal(ghRunLogFailedArgs(0, 2).ok, false);
  assert.equal(ghRunLogFailedArgs(1.5, 2).ok, false);
});

test('ghRunLogArgs: run id と job id は正の safe integer', () => {
  assert.deepEqual(must(ghRunLogArgs(12, 34)), ['run', 'view', '12', '--log', '--job', '34']);
  assert.equal(ghRunLogArgs(-1, 34).ok, false);
  assert.equal(ghRunLogArgs(12, 0).ok, false);
  assert.equal(ghRunLogArgs(1.5, 34).ok, false);
  assert.equal(ghRunLogArgs(Number.MAX_SAFE_INTEGER + 1, 34).ok, false);
});

test('gh の引数: run view / attempt / watch / download / release view', () => {
  assert.deepEqual(must(ghRunViewArgs(12)), [
    'run',
    'view',
    '12',
    '--json',
    GH_RUN_VIEW_FIELDS.join(','),
  ]);
  assert.deepEqual(must(ghRunAttemptArgs(12)), [
    'api',
    'repos/berlysia/kanbun-annotation/actions/runs/12',
  ]);
  assert.deepEqual(must(ghRunWatchArgs(12)), ['run', 'watch', '12', '--exit-status']);
  assert.deepEqual(must(ghRunDownloadArgs(12, '/tmp/kanbun-release-x')), [
    'run',
    'download',
    '12',
    '-n',
    'npm-tarball',
    '-D',
    '/tmp/kanbun-release-x',
  ]);
  assert.deepEqual(must(ghReleaseViewArgs(TAG)), ['release', 'view', TAG]);
  assert.equal(ghRunViewArgs(0).ok, false);
  assert.equal(ghRunAttemptArgs(-3).ok, false);
  assert.equal(ghRunWatchArgs(Number.NaN).ok, false);
  assert.equal(ghRunDownloadArgs(0, '/x').ok, false);
});

test('ghReleaseViewArgs: tag の形', () => {
  assert.equal(ghReleaseViewArgs('v0.2.0-beta.1').ok, true);
  for (const bad of ['0.2.0', 'v0.2', '--repo=x', 'v0.2.0 ', 'v0.2.0\n', '']) {
    assert.equal(ghReleaseViewArgs(bad).ok, false, bad);
  }
});

test('ghRunListArgs: commit と workflow と event と --json のフィールド', () => {
  assert.deepEqual(ghRunListArgs(SHA), [
    'run',
    'list',
    '--workflow',
    'release.yml',
    '--commit',
    SHA,
    '--event',
    'push',
    '--limit',
    '20',
    '--json',
    GH_RUN_LIST_FIELDS.join(','),
  ]);
});

test('npm の引数: view versions / view dist / stage list', () => {
  assert.deepEqual(npmViewVersionsArgs(NAMES[0] ?? ''), [
    'view',
    '@kanbun-skam/skam',
    'versions',
    '--json',
  ]);
  assert.deepEqual(npmViewDistArgs(NAMES[0] ?? '', VERSION), [
    'view',
    '@kanbun-skam/skam@0.2.0',
    'dist-tags',
    'dist.integrity',
    'dist.attestations',
    '--json',
  ]);
  assert.deepEqual(npmStageListArgs(NAMES[0] ?? ''), [
    'stage',
    'list',
    '@kanbun-skam/skam',
    '--json',
  ]);
});

test('isSubsetOfAllowlist: 使う --json のフィールドは gh 2.45.0 の許可リストに入る (list も view も)', () => {
  assert.equal(isSubsetOfAllowlist(GH_RUN_LIST_FIELDS, GH_245_LIST_ALLOWED), true);
  assert.equal(isSubsetOfAllowlist(GH_RUN_VIEW_FIELDS, GH_245_VIEW_ALLOWED), true);
  assert.equal(isSubsetOfAllowlist([...GH_RUN_LIST_FIELDS, 'attempt'], GH_245_LIST_ALLOWED), false);
  assert.equal(isSubsetOfAllowlist([...GH_RUN_VIEW_FIELDS, 'attempt'], GH_245_VIEW_ALLOWED), false);
});

test('許可リストは research §5b の一覧 (view は list に jobs を足したもの、attempt はない)', () => {
  assert.equal(GH_245_LIST_ALLOWED.includes('workflowName'), true);
  assert.equal(GH_245_LIST_ALLOWED.includes('jobs'), false);
  assert.equal(GH_245_VIEW_ALLOWED.includes('jobs'), true);
  assert.equal(GH_245_VIEW_ALLOWED.includes('attempt'), false);
  assert.equal(GH_245_LIST_ALLOWED.length, 15);
  assert.equal(GH_245_VIEW_ALLOWED.length, 16);
});

// ======================================================================
// T3: run の選択、job の結論、attempt (K10)
// ======================================================================

// 合成 (実物の構造から): headSha / headBranch / databaseId / workflowName は gh run list --json のキー名
function runEntry(
  databaseId: unknown,
  overrides: { headSha?: string; workflowName?: unknown; headBranch?: unknown } = {}
): Record<string, unknown> {
  return {
    conclusion: 'success',
    databaseId,
    headBranch: 'headBranch' in overrides ? overrides.headBranch : TAG,
    headSha: overrides.headSha ?? SHA,
    status: 'completed',
    workflowName: 'workflowName' in overrides ? overrides.workflowName : 'Release',
  };
}

test('selectRun (合成 (実物の構造から)): 同じ commit の Release の 10 と 12 と CI の 99 は 12', () => {
  const r = selectRun([runEntry(10), runEntry(99, { workflowName: 'CI' }), runEntry(12)], SHA);
  assert.deepEqual(r, { kind: 'found', id: 12, headBranch: TAG });
});

test('selectRun (合成 (実物の構造から)): 空配列と Release 以外だけと別 commit は none', () => {
  assert.deepEqual(selectRun([], SHA), { kind: 'none' });
  assert.deepEqual(selectRun([runEntry(99, { workflowName: 'CI' })], SHA), { kind: 'none' });
  assert.deepEqual(selectRun([runEntry(5, { headSha: 'a'.repeat(40) })], SHA), { kind: 'none' });
});

test('selectRun (合成 (実物の構造から)): 配列でない / 空でも対象でもない run の形の違いは無視', () => {
  assert.equal(selectRun({}, SHA).kind, 'shape-unknown');
  assert.equal(selectRun(null, SHA).kind, 'shape-unknown');
  const r = selectRun([runEntry('x', { workflowName: 'CI' }), runEntry(7), 'junk'], SHA);
  assert.deepEqual(r, { kind: 'found', id: 7, headBranch: TAG });
});

test('selectRun (合成 (実物の構造から)): 対象の run の databaseId が文字列 / 0 / 小数なら shape-unknown', () => {
  assert.equal(selectRun([runEntry('12')], SHA).kind, 'shape-unknown');
  assert.equal(selectRun([runEntry(0)], SHA).kind, 'shape-unknown');
  assert.equal(selectRun([runEntry(1.5)], SHA).kind, 'shape-unknown');
  assert.equal(selectRun([runEntry(Number.MAX_SAFE_INTEGER + 1)], SHA).kind, 'shape-unknown');
});

test('selectRun (合成 (実物の構造から)): headBranch が null / 空 / tag 名でも found (判定に使わない)', () => {
  for (const headBranch of [null, '', 'v0.2.0']) {
    assert.deepEqual(selectRun([runEntry(3, { headBranch })], SHA), {
      kind: 'found',
      id: 3,
      headBranch,
    });
  }
});

function releaseJob(
  name: string,
  status: string,
  conclusion: string | null,
  databaseId: number
): Record<string, unknown> {
  // 実物 (REAL_RUN_VIEW_JSON.jobs の要素) と同じキー
  return { ...REAL_RUN_VIEW_JSON.jobs[0], name, status, conclusion, databaseId };
}

function releaseView(
  conclusions: readonly [string, string, string],
  runStatus = 'completed'
): Record<string, unknown> {
  return {
    status: runStatus,
    conclusion: runStatus === 'completed' ? 'failure' : null,
    jobs: [
      releaseJob(RELEASE_JOB_NAMES.validate, 'completed', conclusions[0], 111),
      releaseJob(RELEASE_JOB_NAMES.npmStage, 'completed', conclusions[1], 222),
      releaseJob(RELEASE_JOB_NAMES.githubRelease, 'completed', conclusions[2], 333),
    ],
  };
}

test('RELEASE_JOB_NAMES は release.yml の表示名', () => {
  assert.deepEqual(RELEASE_JOB_NAMES, {
    validate: 'Validate and pack',
    npmStage: 'Stage on npm',
    githubRelease: 'GitHub Release',
  });
});

test('judgeJobs (合成 (実物の構造から)): 成功の組み合わせは ok で validate の job id を返す', () => {
  assert.deepEqual(judgeJobs(releaseView(['success', 'success', 'success'])), {
    kind: 'ok',
    validateJobId: 111,
    githubRelease: 'success',
  });
  assert.deepEqual(judgeJobs(releaseView(['success', 'success', 'failure'])), {
    kind: 'ok',
    validateJobId: 111,
    githubRelease: 'failure',
  });
});

test('judgeJobs (合成 (実物の構造から)): npm-stage の失敗は github-release と独立 (release.yml:251-253)', () => {
  for (const third of ['success', 'skipped', 'failure']) {
    assert.deepEqual(judgeJobs(releaseView(['success', 'failure', third])), {
      kind: 'job-failed',
      job: 'npm-stage',
      jobId: 222,
    });
  }
});

test('judgeJobs: npm-stage の databaseId が不正でも job-failed のまま、jobId は undefined', () => {
  for (const bad of [0, -1, 1.5, '12; rm', 2 ** 53, undefined]) {
    const view = releaseView(['success', 'failure', 'skipped']);
    const jobs = view['jobs'] as Record<string, unknown>[];
    jobs[1] = { ...jobs[1], databaseId: bad };
    if (bad === undefined) delete jobs[1]?.['databaseId'];
    assert.deepEqual(judgeJobs(view), { kind: 'job-failed', job: 'npm-stage', jobId: undefined });
  }
});

test('judgeJobs: validate の databaseId が欠落していれば shape-unknown (検査は残る)', () => {
  const view = releaseView(['failure', 'skipped', 'skipped']);
  const jobs = view['jobs'] as Record<string, unknown>[];
  delete jobs[0]?.['databaseId'];
  assert.equal(judgeJobs(view).kind, 'shape-unknown');
});

test('judgeJobs: validate=failure / npm-stage=failure は shape-unknown', () => {
  assert.equal(judgeJobs(releaseView(['failure', 'failure', 'skipped'])).kind, 'shape-unknown');
});

test('judgeJobs (合成 (実物の構造から)): validate の失敗は後続が skipped', () => {
  assert.deepEqual(judgeJobs(releaseView(['failure', 'skipped', 'skipped'])), {
    kind: 'job-failed',
    job: 'validate',
    jobId: 111,
  });
});

test('judgeJobs (合成 (実物の構造から)): 表にない組み合わせは shape-unknown', () => {
  const cases: [string, string, string][] = [
    ['success', 'success', 'skipped'],
    ['success', 'cancelled', 'skipped'],
    ['failure', 'success', 'skipped'],
    ['cancelled', 'skipped', 'skipped'],
    ['success', 'timed_out', 'skipped'],
    ['success', 'success', 'cancelled'],
  ];
  for (const c of cases) assert.equal(judgeJobs(releaseView(c)).kind, 'shape-unknown', c.join());
});

test('judgeJobs (合成 (実物の構造から)): job が 2 つ / 未知の名前 / job が in_progress / conclusion が null は shape-unknown', () => {
  const twoJobs = releaseView(['success', 'success', 'success']);
  (twoJobs['jobs'] as unknown[]).pop();
  assert.equal(judgeJobs(twoJobs).kind, 'shape-unknown');

  const unknownName = releaseView(['success', 'success', 'success']);
  (unknownName['jobs'] as Record<string, unknown>[])[2] = releaseJob(
    'Something else',
    'completed',
    'success',
    333
  );
  assert.equal(judgeJobs(unknownName).kind, 'shape-unknown');

  const running = releaseView(['success', 'success', 'success']);
  (running['jobs'] as Record<string, unknown>[])[1] = releaseJob(
    RELEASE_JOB_NAMES.npmStage,
    'in_progress',
    null,
    222
  );
  assert.equal(judgeJobs(running).kind, 'shape-unknown');

  const nullConclusion = releaseView(['success', 'success', 'success']);
  (nullConclusion['jobs'] as Record<string, unknown>[])[2] = releaseJob(
    RELEASE_JOB_NAMES.githubRelease,
    'completed',
    null,
    333
  );
  assert.equal(judgeJobs(nullConclusion).kind, 'shape-unknown');

  assert.equal(judgeJobs(null).kind, 'shape-unknown');
  assert.equal(judgeJobs({ status: 'completed', jobs: 'x' }).kind, 'shape-unknown');
});

test('judgeJobs (合成 (実物の構造から)): run が in_progress / queued なら in-progress', () => {
  assert.deepEqual(judgeJobs(releaseView(['success', 'success', 'success'], 'in_progress')), {
    kind: 'in-progress',
  });
  assert.deepEqual(judgeJobs({ status: 'queued', conclusion: null, jobs: [] }), {
    kind: 'in-progress',
  });
});

test('judgeJobs (合成 (実物の構造から)): run が completed で job の databaseId が不正なら shape-unknown', () => {
  const v = releaseView(['success', 'success', 'success']);
  (v['jobs'] as Record<string, unknown>[])[0] = releaseJob(
    RELEASE_JOB_NAMES.validate,
    'completed',
    'success',
    -1
  );
  assert.equal(judgeJobs(v).kind, 'shape-unknown');
});

test('judgeJobs (実物): CI の run の job 名は Release の表にないので shape-unknown', () => {
  assert.equal(judgeJobs(REAL_RUN_VIEW_JSON).kind, 'shape-unknown');
});

test('attemptKey (実物): run_attempt: 1 と job の集合から文字列を作り、job の順に依らない', () => {
  const a = must(attemptKey(REAL_API_RUN_JSON, REAL_RUN_VIEW_JSON));
  assert.equal(typeof a, 'string');
  assert.match(a, /^1:/);
  const reversed = { ...REAL_RUN_VIEW_JSON, jobs: [...REAL_RUN_VIEW_JSON.jobs].reverse() };
  assert.equal(must(attemptKey(REAL_API_RUN_JSON, reversed)), a);
});

test('attemptKey (実物): attempt や job の集合が変わると別の文字列', () => {
  const base = must(attemptKey(REAL_API_RUN_JSON, REAL_RUN_VIEW_JSON));
  assert.notEqual(
    must(attemptKey({ ...REAL_API_RUN_JSON, run_attempt: 2 }, REAL_RUN_VIEW_JSON)),
    base
  );
  const fewer = { ...REAL_RUN_VIEW_JSON, jobs: REAL_RUN_VIEW_JSON.jobs.slice(1) };
  assert.notEqual(must(attemptKey(REAL_API_RUN_JSON, fewer)), base);
});

test('attemptKey (実物): run_attempt が 0 / 文字列 / 欠落、job の形が違えば fail', () => {
  assert.equal(attemptKey({ ...REAL_API_RUN_JSON, run_attempt: 0 }, REAL_RUN_VIEW_JSON).ok, false);
  assert.equal(
    attemptKey({ ...REAL_API_RUN_JSON, run_attempt: '1' }, REAL_RUN_VIEW_JSON).ok,
    false
  );
  assert.equal(attemptKey({ id: 1 }, REAL_RUN_VIEW_JSON).ok, false);
  assert.equal(attemptKey(null, REAL_RUN_VIEW_JSON).ok, false);
  assert.equal(attemptKey(REAL_API_RUN_JSON, { jobs: [{ databaseId: 'x' }] }).ok, false);
  assert.equal(attemptKey(REAL_API_RUN_JSON, { jobs: 'x' }).ok, false);
});

// ======================================================================
// T4: log の manifest (K11 の 1、2)
// ======================================================================

const VALIDATE_JOB = 'Validate and pack';
const SUMMARY_STEP = 'Print the release manifest';
const TS = '2026-10-15T10:15:59.9299767Z';

interface LogLineOptions {
  bom?: boolean;
  time?: string;
  ansi?: boolean;
  cr?: boolean;
}

function logLine(job: string, step: string, content: string, o: LogLineOptions = {}): string {
  const time = o.time ?? TS;
  const body = content === '' ? time : `${time} ${content}`;
  const colored = o.ansi === true ? `\x1b[36;1m${body}\x1b[0m` : body;
  return `${job}\t${step}\t${o.bom === true ? '\ufeff' : ''}${colored}${o.cr === true ? '\r' : ''}`;
}

function manifestRows(count = 6): string[] {
  return NAMES.slice(0, count)
    .concat(count > 6 ? ['@kanbun-skam/extra'] : [])
    .map((n, i) => `| ${i + 1} | ${n} | ${fileOf(n)} | ${integrityOf(i + 1)} |`);
}

function manifestContents(rows: readonly string[] = manifestRows()): string[] {
  return [
    '## Release manifest',
    `- tag: ${TAG}`,
    `- version: ${VERSION}`,
    '- distTag: latest',
    '',
    '| # | name | file | integrity |',
    '| --- | --- | --- | --- |',
    ...rows,
  ];
}

// 合成 (実物の構造から): 他の step の行、スクリプトの本文 (文字列リテラルとして '## Release manifest', を含む)、
// 対象の step の行、その後の別の step の行
function buildLog(contents: readonly string[], o: LogLineOptions = {}): string {
  const lines = [
    logLine(VALIDATE_JOB, 'Set up job', 'Current runner version', { bom: true }),
    logLine(VALIDATE_JOB, 'Verify the manifest', '## Release manifest'),
    logLine(VALIDATE_JOB, SUMMARY_STEP, '##[group]Run node --input-type=module <<EOF', {
      bom: true,
    }),
    logLine(VALIDATE_JOB, SUMMARY_STEP, "            '## Release manifest',"),
    logLine(VALIDATE_JOB, SUMMARY_STEP, '            `- tag: ${manifest.tag}`,'),
    logLine(VALIDATE_JOB, SUMMARY_STEP, "            '',"),
    logLine(VALIDATE_JOB, SUMMARY_STEP, "            '| # | name | file | integrity |',"),
    logLine(VALIDATE_JOB, SUMMARY_STEP, '##[endgroup]'),
    ...contents.map((c) => logLine(VALIDATE_JOB, SUMMARY_STEP, c, o)),
    logLine(VALIDATE_JOB, 'Post Checkout', 'Post job cleanup.'),
  ];
  return `${lines.join('\n')}\n`;
}

test('実物: 合成の log の行の形は実物 (BOM、タブ、時刻、本文) と同じ', () => {
  const first = REAL_LOG_HEAD[0] ?? '';
  assert.equal(
    logLine('Visual Regression Test', 'Set up job', "Current runner version: '2.337.0'", {
      bom: true,
      time: '2026-10-15T10:15:59.9299767Z',
    }),
    first
  );
  const second = REAL_LOG_HEAD[1] ?? '';
  assert.equal(
    logLine('Visual Regression Test', 'Set up job', '##[group]Runner Image Provisioner', {
      time: '2026-10-15T10:15:59.9328247Z',
    }),
    second
  );
  assert.equal(REAL_LOG_HEAD.length, 20);
});

test('extractLogManifest (合成 (実物の構造から)): 正常は 6 行で、他の step とスクリプトの本文は拾わない', () => {
  const r = extractLogManifest(buildLog(manifestContents()), 6);
  assert.equal(r.kind, 'ok');
  if (r.kind !== 'ok') return;
  assert.equal(r.manifest.tag, TAG);
  assert.equal(r.manifest.version, VERSION);
  assert.equal(r.manifest.distTag, 'latest');
  assert.equal(r.manifest.packages.length, 6);
  assert.deepEqual(r.manifest.packages[1], {
    name: NAMES[1],
    file: fileOf(NAMES[1] ?? ''),
    integrity: integrityOf(2),
  });
});

test('extractLogManifest (合成 (実物の構造から)): 空行が 0 行 / 2 行は shape-unknown', () => {
  const noBlank = manifestContents().filter((c, i) => !(i === 4 && c === ''));
  assert.equal(extractLogManifest(buildLog(noBlank), 6).kind, 'shape-unknown');
  const twoBlank = manifestContents();
  twoBlank.splice(4, 0, '');
  assert.equal(extractLogManifest(buildLog(twoBlank), 6).kind, 'shape-unknown');
});

test('extractLogManifest (合成 (実物の構造から)): 空行の時刻の後ろに空白がなくても読める', () => {
  const log = buildLog(manifestContents());
  assert.equal(extractLogManifest(log, 6).kind, 'ok');
  // 空行は logLine が `<時刻>` だけで出す。空白付きの変種も許容する
  const withSpace = log.replace(new RegExp(`${TS}\\n`, 'g'), `${TS} \n`);
  assert.equal(extractLogManifest(withSpace, 6).kind, 'ok');
});

test('extractLogManifest (合成 (実物の構造から)): 行頭の BOM、時刻、ANSI、行末の CR は除いて読める', () => {
  assert.equal(extractLogManifest(buildLog(manifestContents(), { bom: true }), 6).kind, 'ok');
  assert.equal(extractLogManifest(buildLog(manifestContents(), { ansi: true }), 6).kind, 'ok');
  assert.equal(extractLogManifest(buildLog(manifestContents(), { cr: true }), 6).kind, 'ok');
  assert.equal(
    extractLogManifest(buildLog(manifestContents(), { bom: true, ansi: true, cr: true }), 6).kind,
    'ok'
  );
});

test('extractLogManifest (合成 (実物の構造から)): 見出しが 0 回 / 2 回は shape-unknown', () => {
  assert.equal(extractLogManifest(buildLog(manifestContents().slice(1)), 6).kind, 'shape-unknown');
  const twice = [...manifestContents(), ...manifestContents()];
  assert.equal(extractLogManifest(buildLog(twice), 6).kind, 'shape-unknown');
});

test('extractLogManifest (合成 (実物の構造から)): 別の job 名や step 名の中の偽の表は拾わない', () => {
  const real = manifestContents();
  const fake = manifestContents(manifestRows().map((r) => r.replace('latest', 'x')));
  const lines = [
    ...fake.map((c) => logLine('Other job', SUMMARY_STEP, c)),
    ...fake.map((c) => logLine(VALIDATE_JOB, 'Other step', c)),
    ...real.map((c) => logLine(VALIDATE_JOB, SUMMARY_STEP, c)),
  ];
  assert.equal(extractLogManifest(`${lines.join('\n')}\n`, 6).kind, 'ok');
  const onlyFake = fake.map((c) => logLine('Other job', SUMMARY_STEP, c));
  assert.equal(extractLogManifest(`${onlyFake.join('\n')}\n`, 6).kind, 'shape-unknown');
});

test('extractLogManifest (合成 (実物の構造から)): 欠けた行 / 表の行数 / 連番 / 割り込みは shape-unknown', () => {
  const cases: [string, string[]][] = [
    ['tag の行がない', manifestContents().filter((c) => !c.startsWith('- tag:'))],
    ['version の行がない', manifestContents().filter((c) => !c.startsWith('- version:'))],
    ['distTag の行がない', manifestContents().filter((c) => !c.startsWith('- distTag:'))],
    ['表が 5 行', manifestContents(manifestRows().slice(0, 5))],
    [
      '表が 7 行',
      manifestContents([
        ...manifestRows(),
        '| 7 | @x/y | x-y-0.2.0.tgz | ' + integrityOf(7) + ' |',
      ]),
    ],
    [
      '# が 1,2,4',
      manifestContents(manifestRows().map((r, i) => (i === 2 ? r.replace('| 3 |', '| 4 |') : r))),
    ],
    [
      '表の行の間に別の行',
      (() => {
        const c = manifestContents();
        c.splice(10, 0, 'noise');
        return c;
      })(),
    ],
    ['見出しの区切りがない', manifestContents().filter((c) => c !== '| --- | --- | --- | --- |')],
  ];
  for (const [label, contents] of cases) {
    assert.equal(extractLogManifest(buildLog(contents), 6).kind, 'shape-unknown', label);
  }
});

test('extractLogManifest (合成 (実物の構造から)): file / integrity / distTag の値の形が違えば shape-unknown', () => {
  const replaceRow = (from: string, to: string): string[] =>
    manifestContents(manifestRows().map((r, i) => (i === 0 ? r.replace(from, to) : r)));
  const first = manifestRows()[0] ?? '';
  const file = fileOf(NAMES[0] ?? '');
  const cases: [string, string[]][] = [
    ['file に区切り', replaceRow(file, 'a/b.tgz')],
    ['file が .tgz でない', replaceRow(file, 'a.zip')],
    ['sha1', replaceRow(integrityOf(1), 'sha1-abc=')],
    ['短い base64', replaceRow(integrityOf(1), 'sha512-AAAA')],
    [
      'distTag が beta',
      manifestContents().map((c) => (c === '- distTag: latest' ? '- distTag: beta' : c)),
    ],
    ['表の行が 4 列でない', manifestContents([first.slice(0, -2), ...manifestRows().slice(1)])],
  ];
  for (const [label, contents] of cases) {
    assert.equal(extractLogManifest(buildLog(contents), 6).kind, 'shape-unknown', label);
  }
  assert.equal(
    extractLogManifest(
      buildLog(manifestContents().map((c) => (c === '- distTag: latest' ? '- distTag: next' : c))),
      6
    ).kind,
    'ok'
  );
});

test('extractLogManifest: 公開パッケージの数は引数で受ける', () => {
  const log = buildLog(manifestContents(manifestRows(2)));
  assert.equal(extractLogManifest(log, 2).kind, 'ok');
  assert.equal(extractLogManifest(log, 6).kind, 'shape-unknown');
});

test('extractLogManifest: 空の log は shape-unknown', () => {
  assert.equal(extractLogManifest('', 6).kind, 'shape-unknown');
});

function logManifestOk(): LogManifest {
  const r = extractLogManifest(buildLog(manifestContents()), 6);
  if (r.kind !== 'ok') throw new Error('fixture');
  return r.manifest;
}

const EXPECTED_LOG = { tag: TAG, version: VERSION, distTag: 'latest' as const, names: NAMES };

test('judgeLogManifest: 一致すれば ok', () => {
  assert.deepEqual(judgeLogManifest(logManifestOk(), EXPECTED_LOG), { kind: 'ok' });
});

test('judgeLogManifest: 名前の順、tag、version、distTag の違いは mismatch', () => {
  const m = logManifestOk();
  const swapped = { ...m, packages: [...m.packages].reverse() };
  assert.equal(judgeLogManifest(swapped, EXPECTED_LOG).kind, 'mismatch');
  assert.equal(judgeLogManifest(m, { ...EXPECTED_LOG, tag: 'v0.2.1' }).kind, 'mismatch');
  assert.equal(judgeLogManifest(m, { ...EXPECTED_LOG, version: '0.2.1' }).kind, 'mismatch');
  assert.equal(judgeLogManifest(m, { ...EXPECTED_LOG, distTag: 'next' }).kind, 'mismatch');
  assert.equal(judgeLogManifest(m, { ...EXPECTED_LOG, names: NAMES.slice(0, 5) }).kind, 'mismatch');
});

// ======================================================================
// T5: stage の一覧 (K11 の 4)
// ======================================================================

// 合成 (npm 12.2.0 のソースから)
function stageItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: UUID,
    packageName: NAMES[0],
    version: VERSION,
    tag: 'latest',
    actor: 'someone',
    createdAt: '2026-10-15T00:00:00.000Z',
    ...overrides,
  };
}

const pick = (items: unknown, distTag: 'latest' | 'next' = 'latest') =>
  pickStage(JSON.stringify(items), NAMES[0] ?? '', VERSION, distTag);

test('pickStage (合成 (npm 12.2.0 のソースから)): 1 件で tag が一致すれば one (未知のキーは許容)', () => {
  assert.deepEqual(pick([stageItem()]), {
    kind: 'one',
    id: UUID,
    actor: 'someone',
    createdAt: '2026-10-15T00:00:00.000Z',
  });
});

test('pickStage: actor、actorType、createdAt が文字列なら結果に持たせる', () => {
  const item = stageItem({
    actor: 'GitHub Actions',
    actorType: 'trusted automation',
    createdAt: '2026-10-19T00:00:00.000Z',
  });
  assert.deepEqual(pick([item]), {
    kind: 'one',
    id: UUID,
    actor: 'GitHub Actions',
    actorType: 'trusted automation',
    createdAt: '2026-10-19T00:00:00.000Z',
  });
});

test('pickStage: 来歴の値が文字列でなければキーごと持たせない', () => {
  const item = stageItem({ actor: 42, actorType: null, createdAt: { a: 1 } });
  const result = pick([item]);
  assert.deepEqual(result, { kind: 'one', id: UUID });
  assert.equal('actor' in result, false);
  assert.equal('actorType' in result, false);
  assert.equal('createdAt' in result, false);
});

test('classifyPackageState: stage の来歴を staged の状態に運ぶ', () => {
  const state = must(
    classify(VIEW_NOT, undefined, {
      kind: 'one',
      id: UUID,
      actor: 'GitHub Actions',
      createdAt: '2026-10-19T00:00:00.000Z',
    })
  );
  assert.deepEqual(state, {
    name: NAMES[0],
    kind: 'staged',
    stageId: UUID,
    actor: 'GitHub Actions',
    createdAt: '2026-10-19T00:00:00.000Z',
  });
});

test('planApprove: targets に来歴を運ぶ', () => {
  const plan = planApprove(
    [{ name: NAMES[0] ?? '', kind: 'staged', stageId: UUID, actor: 'a', actorType: 't' }],
    false
  );
  assert.deepEqual(plan, {
    kind: 'approve',
    targets: [{ name: NAMES[0], stageId: UUID, actor: 'a', actorType: 't' }],
  });
});

test('pickStage (合成 (npm 12.2.0 のソースから)): 別の版や別のパッケージが混在しても対象だけで判定', () => {
  const items = [
    stageItem({ id: UUID2, version: '0.1.1' }),
    stageItem(),
    stageItem({ id: UUID2, packageName: NAMES[1] }),
  ];
  assert.deepEqual(pick(items), {
    kind: 'one',
    id: UUID,
    actor: 'someone',
    createdAt: '2026-10-15T00:00:00.000Z',
  });
});

test('pickStage (合成 (npm 12.2.0 のソースから)): tag が無い / null / 数値は shape-unknown', () => {
  const noTag = stageItem();
  delete noTag['tag'];
  assert.equal(pick([noTag]).kind, 'shape-unknown');
  assert.equal(pick([stageItem({ tag: null })]).kind, 'shape-unknown');
  assert.equal(pick([stageItem({ tag: 1 })]).kind, 'shape-unknown');
});

test('pickStage (合成 (npm 12.2.0 のソースから)): tag が distTag と違えば mismatch', () => {
  assert.equal(pick([stageItem({ tag: 'next' })], 'latest').kind, 'mismatch');
  assert.equal(pick([stageItem({ tag: 'latest' })], 'next').kind, 'mismatch');
  assert.equal(pick([stageItem({ tag: 'next' })], 'next').kind, 'one');
});

test('pickStage (合成 (npm 12.2.0 のソースから)): UUID でない id は mismatch、2 件は many、0 件は none', () => {
  assert.equal(pick([stageItem({ id: '--otp=1' })]).kind, 'mismatch');
  assert.equal(pick([stageItem(), stageItem({ id: UUID2 })]).kind, 'many');
  assert.equal(pick([]).kind, 'none');
  assert.equal(pick([stageItem({ version: '0.1.1' })]).kind, 'none');
});

test('pickStage (合成 (npm 12.2.0 のソースから)): 空 / 空白 / オブジェクト / JSON でない / 要素の形が違えば shape-unknown', () => {
  for (const raw of ['', '  ', '{}', 'not json', 'null', '"x"']) {
    assert.equal(pickStage(raw, NAMES[0] ?? '', VERSION, 'latest').kind, 'shape-unknown', raw);
  }
  assert.equal(pick([stageItem({ id: 1 })]).kind, 'shape-unknown');
  assert.equal(pick([stageItem({ packageName: null })]).kind, 'shape-unknown');
  assert.equal(pick([stageItem({ version: 2 })]).kind, 'shape-unknown');
  assert.equal(pick(['x']).kind, 'shape-unknown');
});

// ======================================================================
// T6: tarball と artifact の検査 (K11 の 3、5、6)
// ======================================================================

interface TarEntry {
  name: string;
  prefix?: string;
  typeflag?: string;
  data?: Buffer;
  declaredSize?: number;
  sizeField?: string;
  magic?: string;
  version?: string;
  checksum?: 'normal' | 'nul-space' | 'off-by-one';
}

function pad(buf: Buffer, size: number): Buffer {
  return Buffer.concat([buf, Buffer.alloc(size - buf.length)]);
}

// 実物 (pnpm pack) のヘッダと同じ書式: mode "000644 \0"、size は 11 桁の 8 進 + 空白、
// checksum は 6 桁の 8 進 + 空白 + NUL、magic "ustar\0" + version "00"
function tarHeader(e: TarEntry): Buffer {
  const h = Buffer.alloc(512);
  const put = (s: string, at: number): void => {
    h.write(s, at, 'latin1');
  };
  h.write(e.name, 0, 'utf8');
  put('000644 \0', 100);
  put('000000 \0', 108);
  put('000000 \0', 116);
  const size = e.declaredSize ?? e.data?.length ?? 0;
  put(e.sizeField ?? `${size.toString(8).padStart(11, '0')} `, 124);
  put('03560116604 ', 136);
  put(e.typeflag ?? '0', 156);
  put(e.magic ?? 'ustar\0', 257);
  put(e.version ?? '00', 263);
  put('000000 \0', 329);
  put('000000 \0', 337);
  if (e.prefix !== undefined) h.write(e.prefix, 345, 'utf8');
  h.fill(0x20, 148, 156);
  let sum = 0;
  for (const b of h) sum += b;
  if (e.checksum === 'off-by-one') sum += 1;
  const digits = sum.toString(8).padStart(6, '0');
  put(e.checksum === 'nul-space' ? `${digits}\0 ` : `${digits} \0`, 148);
  return h;
}

interface TarOptions {
  terminatorBlocks?: number;
  trailing?: Buffer;
  zeroPadTo?: number;
}

function buildTar(entries: readonly TarEntry[], o: TarOptions = {}): Buffer {
  const parts: Buffer[] = [];
  for (const e of entries) {
    parts.push(tarHeader(e));
    if (e.data !== undefined && e.data.length > 0) {
      parts.push(pad(e.data, Math.ceil(e.data.length / 512) * 512));
    }
  }
  parts.push(Buffer.alloc(512 * (o.terminatorBlocks ?? 2)));
  let tar: Buffer = Buffer.concat(parts);
  if (o.zeroPadTo !== undefined) tar = pad(tar, Math.ceil(tar.length / o.zeroPadTo) * o.zeroPadTo);
  return o.trailing === undefined ? tar : Buffer.concat([tar, o.trailing]);
}

const PKG = '@kanbun-skam/skam-xml-parser';
const EXPECT_TAR = { name: PKG, version: VERSION, internalNames: NAMES };

function packageJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    name: PKG,
    version: VERSION,
    dependencies: { '@kanbun-skam/skam': VERSION, '@xmldom/xmldom': '0.8.15' },
    ...overrides,
  });
}

function fileEntry(name: string, content: string, extra: Partial<TarEntry> = {}): TarEntry {
  return { name, data: Buffer.from(content), ...extra };
}

function goodEntries(pj = packageJson()): TarEntry[] {
  return [
    fileEntry('package/package.json', pj),
    fileEntry('package/README.md', '# readme\n'),
    fileEntry('package/LICENSE', 'MIT\n'),
    fileEntry('package/CHANGELOG.md', '## 0.2.0\n'),
    fileEntry('package/dist/index.js', 'export {};\n'),
  ];
}

function gz(tar: Buffer): Buffer {
  return zlib.gzipSync(tar);
}

// RFC 1952 のヘッダ (FEXTRA / FNAME / FCOMMENT / FHCRC) を組み立てて member を作る
function gzipMember(
  tar: Buffer,
  flags: { fextra?: Buffer; fname?: string; fcomment?: string; fhcrc?: boolean } = {}
): Buffer {
  let flg = 0;
  const parts: Buffer[] = [];
  if (flags.fextra !== undefined) {
    flg |= 4;
    const xlen = Buffer.alloc(2);
    xlen.writeUInt16LE(flags.fextra.length);
    parts.push(xlen, flags.fextra);
  }
  if (flags.fname !== undefined) {
    flg |= 8;
    parts.push(Buffer.from(`${flags.fname}\0`));
  }
  if (flags.fcomment !== undefined) {
    flg |= 16;
    parts.push(Buffer.from(`${flags.fcomment}\0`));
  }
  const fixed = Buffer.from([
    0x1f,
    0x8b,
    8,
    flg | (flags.fhcrc === true ? 2 : 0),
    0,
    0,
    0,
    0,
    0,
    3,
  ]);
  const headerSoFar = Buffer.concat([fixed, ...parts]);
  const hcrc = Buffer.alloc(2);
  if (flags.fhcrc === true) hcrc.writeUInt16LE(zlib.crc32(headerSoFar) & 0xffff);
  const trailer = Buffer.alloc(8);
  trailer.writeUInt32LE(zlib.crc32(tar), 0);
  trailer.writeUInt32LE(tar.length % 2 ** 32, 4);
  return Buffer.concat([
    headerSoFar,
    flags.fhcrc === true ? hcrc : Buffer.alloc(0),
    zlib.deflateRawSync(tar),
    trailer,
  ]);
}

const inspect = (bytes: Buffer) => inspectTarball(bytes, EXPECT_TAR);
const inspectEntries = (entries: readonly TarEntry[], o: TarOptions = {}) =>
  inspect(gz(buildTar(entries, o)));

test('実物: 組み立てた tar のヘッダは pnpm pack の先頭のヘッダ 512 バイトと byte 単位で一致する', () => {
  const real = Buffer.from(REAL_TAR_HEADER_HEX, 'hex');
  assert.equal(real.length, 512);
  const built = tarHeader({ name: 'package/dist/chunk-6COIFWXJ.js', declaredSize: 28724 });
  assert.equal(built.toString('hex'), real.toString('hex'));
});

test('sha512Integrity: sha512- + base64', () => {
  const expected = `sha512-${createHash('sha512').update('abc').digest('base64')}`;
  assert.equal(sha512Integrity(Buffer.from('abc')), expected);
  assert.match(sha512Integrity(Buffer.from('')), /^sha512-[A-Za-z0-9+/]{86}==$/);
});

test('inspectTarball: 正常 (package.json、README.md、LICENSE、CHANGELOG.md、dist/index.js) は ok', () => {
  assert.deepEqual(inspectEntries(goodEntries()), { kind: 'ok' });
});

test('inspectTarball: 終端の後ろが 0 で埋められていても ok (10240 バイトの境界)', () => {
  assert.deepEqual(inspectEntries(goodEntries(), { zeroPadTo: 10240 }), { kind: 'ok' });
});

test('inspectTarball: gzip のヘッダの FNAME / FEXTRA / FCOMMENT / FHCRC の分岐は ok', () => {
  const tar = buildTar(goodEntries());
  assert.deepEqual(inspect(gzipMember(tar)), { kind: 'ok' });
  assert.deepEqual(inspect(gzipMember(tar, { fname: 'x.tar' })), { kind: 'ok' });
  assert.deepEqual(inspect(gzipMember(tar, { fextra: Buffer.from('AB\x01\0x') })), { kind: 'ok' });
  assert.deepEqual(inspect(gzipMember(tar, { fcomment: 'comment' })), { kind: 'ok' });
  assert.deepEqual(inspect(gzipMember(tar, { fhcrc: true })), { kind: 'ok' });
  assert.deepEqual(
    inspect(gzipMember(tar, { fextra: Buffer.from('xx'), fname: 'a', fcomment: 'b', fhcrc: true })),
    { kind: 'ok' }
  );
});

test('inspectTarball: gzip のヘッダが壊れていれば mismatch', () => {
  const good = gz(buildTar(goodEntries()));
  const badId = Buffer.from(good);
  badId[0] = 0;
  const badCm = Buffer.from(good);
  badCm[2] = 7;
  const reserved = Buffer.from(good);
  reserved[3] = (reserved[3] ?? 0) | 0x20;
  for (const b of [
    badId,
    badCm,
    reserved,
    good.subarray(0, 12),
    Buffer.alloc(0),
    Buffer.from('x'),
  ]) {
    assert.equal(inspect(b).kind, 'mismatch');
  }
  // FNAME の NUL が無い
  const noNul = Buffer.concat([
    Buffer.from([0x1f, 0x8b, 8, 8, 0, 0, 0, 0, 0, 3]),
    Buffer.from('abcdefghijklmnopqrstuvwxyz'),
  ]);
  assert.equal(inspect(noNul).kind, 'mismatch');
});

test('inspectTarball: 10 MiB + 1 バイトは mismatch (展開しない)', () => {
  assert.equal(inspect(Buffer.alloc(10 * MIB + 1, 1)).kind, 'mismatch');
});

test('inspectTarball: 2 つの member の連結、末尾の余り (1 バイト、0) は mismatch', () => {
  const a = gz(buildTar(goodEntries()));
  const b = gz(buildTar(goodEntries()));
  assert.equal(inspect(Buffer.concat([a, b])).kind, 'mismatch');
  assert.equal(inspect(Buffer.concat([a, Buffer.from([7])])).kind, 'mismatch');
  assert.equal(inspect(Buffer.concat([a, Buffer.from([0])])).kind, 'mismatch');
});

test('inspectTarball: CRC32 の 1 バイト違い、ISIZE の違いは mismatch', () => {
  const good = gz(buildTar(goodEntries()));
  const badCrc = Buffer.from(good);
  badCrc[badCrc.length - 8] = (badCrc[badCrc.length - 8] ?? 0) ^ 1;
  const badSize = Buffer.from(good);
  badSize[badSize.length - 4] = (badSize[badSize.length - 4] ?? 0) ^ 1;
  assert.equal(inspect(badCrc).kind, 'mismatch');
  assert.equal(inspect(badSize).kind, 'mismatch');
});

test('inspectTarball: 展開後 60 MiB は mismatch (読みながら打ち切る)', () => {
  assert.equal(inspect(gz(Buffer.alloc(60 * MIB))).kind, 'mismatch');
});

test('inspectTarball: エントリ 10,000 は ok、10,001 は mismatch', () => {
  const many = (count: number): TarEntry[] => [
    fileEntry('package/package.json', packageJson()),
    ...Array.from({ length: count - 1 }, (_, i) => ({ name: `package/dist/f${i}.js` })),
  ];
  assert.deepEqual(inspectEntries(many(10000)), { kind: 'ok' });
  assert.equal(inspectEntries(many(10001)).kind, 'mismatch');
});

test('inspectTarball: checksum が 1 違えば mismatch、NUL + 空白の書式は ok', () => {
  const bad = goodEntries();
  bad[1] = { ...(bad[1] as TarEntry), checksum: 'off-by-one' };
  assert.equal(inspectEntries(bad).kind, 'mismatch');
  const alt = goodEntries().map((e) => ({ ...e, checksum: 'nul-space' as const }));
  assert.deepEqual(inspectEntries(alt), { kind: 'ok' });
});

test('inspectTarball: 宣言の size が残りのバイト数を超えれば mismatch', () => {
  const entries = goodEntries();
  entries[4] = { ...(entries[4] as TarEntry), declaredSize: 5 * MIB };
  assert.equal(inspectEntries(entries).kind, 'mismatch');
});

test('inspectTarball: magic が GNU の ustar␣␣NUL、version が 01 は shape-unknown', () => {
  const gnu = goodEntries().map((e, i) =>
    i === 1 ? { ...e, magic: 'ustar ', version: ' \0' } : e
  );
  assert.equal(inspectEntries(gnu).kind, 'shape-unknown');
  const v01 = goodEntries().map((e, i) => (i === 1 ? { ...e, version: '01' } : e));
  assert.equal(inspectEntries(v01).kind, 'shape-unknown');
});

test('inspectTarball: size が base-256 や 8 進でない文字列は shape-unknown', () => {
  const base256 = goodEntries().map((e, i) =>
    i === 1 ? { ...e, sizeField: '\x80\0\0\0\0\0\0\0\0\0\0\x09' } : e
  );
  assert.equal(inspectEntries(base256).kind, 'shape-unknown');
  const abc = goodEntries().map((e, i) =>
    i === 1 ? { ...e, sizeField: 'abc\0\0\0\0\0\0\0\0\0' } : e
  );
  assert.equal(inspectEntries(abc).kind, 'shape-unknown');
});

test('inspectTarball: typeflag x / g / L / K は shape-unknown', () => {
  for (const typeflag of ['x', 'g', 'L', 'K']) {
    const entries = [{ name: 'package/pax', typeflag }, ...goodEntries()];
    assert.equal(inspectEntries(entries).kind, 'shape-unknown', typeflag);
  }
});

test('inspectTarball: typeflag 1 / 2 / 3 (hardlink、symlink、char device) は mismatch', () => {
  for (const typeflag of ['1', '2', '3']) {
    const entries = [...goodEntries(), { name: 'package/dist/link', typeflag }];
    assert.equal(inspectEntries(entries).kind, 'mismatch', typeflag);
  }
});

test('inspectTarball: ディレクトリ (typeflag 5) の size が 0 なら ok、1 なら mismatch', () => {
  const dir = { name: 'package/dist/', typeflag: '5' };
  assert.deepEqual(inspectEntries([dir, ...goodEntries()]), { kind: 'ok' });
  const bad = { ...dir, data: Buffer.from('x') };
  assert.equal(inspectEntries([bad, ...goodEntries()]).kind, 'mismatch');
});

test('inspectTarball: 終端の 0 のブロックが 0 個、1 個、終端の後に非 0 のバイトは mismatch', () => {
  assert.equal(inspectEntries(goodEntries(), { terminatorBlocks: 0 }).kind, 'mismatch');
  assert.equal(inspectEntries(goodEntries(), { terminatorBlocks: 1 }).kind, 'mismatch');
  assert.equal(inspectEntries(goodEntries(), { trailing: Buffer.from([1]) }).kind, 'mismatch');
  assert.equal(
    inspectEntries(goodEntries(), { zeroPadTo: 10240, trailing: Buffer.from([1]) }).kind,
    'mismatch'
  );
});

test('inspectTarball: 危険なパスは mismatch', () => {
  const bad: TarEntry[] = [
    { name: 'package/dist/../../x' },
    { name: '/etc/x' },
    { name: 'package\\x' },
    { name: 'package//x' },
    { name: 'evil/x' },
    { name: 'packagex/y' },
    { name: 'package/a\0b' },
    { name: 'x', prefix: 'package/dist/..' },
    { name: 'package/./x' },
  ];
  for (const e of bad) {
    assert.equal(inspectEntries([...goodEntries(), e]).kind, 'mismatch', JSON.stringify(e.name));
  }
});

test('inspectTarball: ustar の prefix に package/dist を入れた正常なものは ok', () => {
  const entries = [...goodEntries(), { name: 'extra.js', prefix: 'package/dist' }];
  assert.deepEqual(inspectEntries(entries), { kind: 'ok' });
});

test('inspectTarball: 大文字小文字だけ違う重複、ファイルとディレクトリの同居は mismatch', () => {
  const a = [...goodEntries(), { name: 'package/Package.json' }];
  assert.equal(inspectEntries(a).kind, 'mismatch');
  const b = [
    ...goodEntries(),
    { name: 'package/dist/a' },
    { name: 'package/dist/a/', typeflag: '5' },
  ];
  assert.equal(inspectEntries(b).kind, 'mismatch');
  const c = [...goodEntries(), { name: 'package/dist/b' }, { name: 'package/dist/b' }];
  assert.equal(inspectEntries(c).kind, 'mismatch');
});

test('inspectTarball: 許可の外のファイルは mismatch', () => {
  assert.equal(inspectEntries([...goodEntries(), { name: 'package/src/x.ts' }]).kind, 'mismatch');
  assert.equal(inspectEntries([...goodEntries(), { name: 'package/.npmrc' }]).kind, 'mismatch');
  assert.equal(inspectEntries([...goodEntries(), { name: 'package/dist' }]).kind, 'mismatch');
});

test('inspectTarball: package/package.json が無い / ディレクトリ / symlink / JSON でない は mismatch', () => {
  const rest = goodEntries().slice(1);
  assert.equal(inspectEntries(rest).kind, 'mismatch');
  assert.equal(
    inspectEntries([{ name: 'package/package.json/', typeflag: '5' }, ...rest]).kind,
    'mismatch'
  );
  assert.equal(
    inspectEntries([{ name: 'package/package.json', typeflag: '2' }, ...rest]).kind,
    'mismatch'
  );
  assert.equal(inspectEntries(goodEntries('not json')).kind, 'mismatch');
  assert.equal(inspectEntries(goodEntries('[]')).kind, 'mismatch');
});

test('inspectTarball: package.json の内容 (postinstall、name、version、内部依存) は checkPackedPackageJson で検査される', () => {
  const cases: Record<string, unknown>[] = [
    { scripts: { postinstall: 'curl x | sh' } },
    { name: '@kanbun-skam/other' },
    { version: '0.2.1' },
    { dependencies: { '@kanbun-skam/skam': '^0.2.0' } },
    { dependencies: { '@kanbun-skam/skam': 'workspace:*' } },
  ];
  for (const c of cases) {
    assert.equal(inspectEntries(goodEntries(packageJson(c))).kind, 'mismatch', JSON.stringify(c));
  }
});

test('inspectTarball: 改ざんした tarball (symlink、..、重複、postinstall、gzip の連結、CRC) はすべて拒否される', () => {
  const tampered: Buffer[] = [
    gz(buildTar([...goodEntries(), { name: 'package/dist/l', typeflag: '2' }])),
    gz(buildTar([...goodEntries(), { name: 'package/dist/../../x' }])),
    gz(buildTar([...goodEntries(), { name: 'package/README.md' }])),
    gz(buildTar(goodEntries(packageJson({ scripts: { install: 'x' } })))),
    Buffer.concat([gz(buildTar(goodEntries())), gz(buildTar(goodEntries()))]),
  ];
  for (const b of tampered) assert.notEqual(inspect(b).kind, 'ok');
});

function entry(name: string, kind: 'file' | 'dir' | 'symlink' | 'other', size: number) {
  return { name, kind, size };
}

const ARTIFACT_FILES = NAMES.map(fileOf);

function goodArtifactEntries() {
  return [
    entry('manifest.json', 'file', 1200),
    ...ARTIFACT_FILES.map((f) => entry(f, 'file', 50_000)),
  ];
}

test('judgeArtifactDir: 正常は ok', () => {
  assert.deepEqual(judgeArtifactDir(goodArtifactEntries(), ARTIFACT_FILES), { kind: 'ok' });
});

test('judgeArtifactDir: symlink、サブディレクトリ、余分なファイル、tgz の欠け、サイズ超過は mismatch', () => {
  const base = goodArtifactEntries();
  const first = ARTIFACT_FILES[0] ?? '';
  const cases: [string, ReturnType<typeof goodArtifactEntries>][] = [
    ['symlink', [...base.slice(1), entry('manifest.json', 'symlink', 10)]],
    ['subdirectory', [...base, entry('sub', 'dir', 0)]],
    ['extra file', [...base, entry('extra.txt', 'file', 1)]],
    ['missing tgz', base.slice(0, -1)],
    [
      'tgz over 10 MiB',
      base.map((e) => (e.name === first ? entry(first, 'file', 10 * MIB + 1) : e)),
    ],
    [
      'manifest over 1 MiB',
      base.map((e) => (e.name === 'manifest.json' ? entry(e.name, 'file', MIB + 1) : e)),
    ],
    ['other kind', base.map((e) => (e.name === first ? entry(first, 'other', 1) : e))],
    ['duplicate', [...base, entry('manifest.json', 'file', 1)]],
  ];
  for (const [label, entries] of cases) {
    assert.equal(judgeArtifactDir(entries, ARTIFACT_FILES).kind, 'mismatch', label);
  }
  assert.deepEqual(
    judgeArtifactDir(
      base.map((e) => (e.name === first ? entry(first, 'file', 10 * MIB) : e)),
      ARTIFACT_FILES
    ),
    { kind: 'ok' }
  );
});

function releaseManifestFixture(): ReleaseManifest {
  return {
    schemaVersion: 1,
    tag: TAG,
    version: VERSION,
    distTag: 'latest',
    packages: NAMES.map((name, i) => ({ name, file: fileOf(name), integrity: integrityOf(i + 1) })),
  };
}

test('compareArtifactWithLog: 一致は ok、1 つの integrity / file / 数の違いは mismatch', () => {
  const log = logManifestOk();
  assert.deepEqual(compareArtifactWithLog(releaseManifestFixture(), log), { kind: 'ok' });

  const m = releaseManifestFixture();
  m.packages[2] = {
    ...(m.packages[2] as ReleaseManifest['packages'][number]),
    integrity: integrityOf(99),
  };
  const r = compareArtifactWithLog(m, log);
  assert.equal(r.kind, 'mismatch');

  const f = releaseManifestFixture();
  f.packages[0] = { ...(f.packages[0] as ReleaseManifest['packages'][number]), file: 'other.tgz' };
  assert.equal(compareArtifactWithLog(f, log).kind, 'mismatch');

  const fewer = releaseManifestFixture();
  fewer.packages.pop();
  assert.equal(compareArtifactWithLog(fewer, log).kind, 'mismatch');
});

// ======================================================================
// T7: パッケージの状態、approve の計画、stage の判定の合成 (K11、K12)
// ======================================================================

const VIEW_HAS: RegistryResponse = { kind: 'found', versions: ['0.1.1', VERSION], latest: VERSION };
const VIEW_NOT: RegistryResponse = { kind: 'found', versions: ['0.1.1'], latest: '0.1.1' };
const LOG_INTEGRITY = integrityOf(1);

function classify(
  view: RegistryResponse,
  publishedIntegrity: string | undefined,
  stage: Parameters<typeof classifyPackageState>[0]['stage']
) {
  return classifyPackageState({
    name: NAMES[0] ?? '',
    version: VERSION,
    view,
    publishedIntegrity,
    stage,
    logIntegrity: LOG_INTEGRITY,
  });
}

test('classifyPackageState: 5 状態を 1 例ずつ', () => {
  assert.deepEqual(must(classify(VIEW_HAS, LOG_INTEGRITY, { kind: 'none' })), {
    name: NAMES[0],
    kind: 'published',
  });
  assert.deepEqual(must(classify(VIEW_HAS, integrityOf(9), { kind: 'none' })), {
    name: NAMES[0],
    kind: 'published-wrong',
  });
  assert.deepEqual(must(classify(VIEW_NOT, undefined, { kind: 'one', id: UUID })), {
    name: NAMES[0],
    kind: 'staged',
    stageId: UUID,
  });
  assert.deepEqual(must(classify(VIEW_NOT, undefined, { kind: 'many' })), {
    name: NAMES[0],
    kind: 'staged-ambiguous',
  });
  assert.deepEqual(must(classify(VIEW_NOT, undefined, { kind: 'none' })), {
    name: NAMES[0],
    kind: 'missing',
  });
});

test('classifyPackageState: view に有るなら stage の結果を見ない (shape-unknown でも published)', () => {
  const stage = { kind: 'shape-unknown', what: 'x' } as const;
  assert.deepEqual(must(classify(VIEW_HAS, LOG_INTEGRITY, stage)), {
    name: NAMES[0],
    kind: 'published',
  });
});

test('classifyPackageState: 失敗は fail (呼び出し側が shape-unknown で止める)', () => {
  assert.equal(classify(VIEW_HAS, undefined, { kind: 'none' }).ok, false);
  assert.equal(classify(VIEW_NOT, undefined, { kind: 'shape-unknown', what: 'x' }).ok, false);
  assert.equal(classify(VIEW_NOT, undefined, { kind: 'mismatch', what: 'x' }).ok, false);
  assert.equal(classify({ kind: 'error', message: 'x' }, undefined, { kind: 'none' }).ok, false);
});

test('classifyPackageState: 一度も公開されていない (not-found) パッケージは stage で判定する', () => {
  assert.deepEqual(must(classify({ kind: 'not-found' }, undefined, { kind: 'one', id: UUID })), {
    name: NAMES[0],
    kind: 'staged',
    stageId: UUID,
  });
});

type Letter = 'p' | 'w' | 's' | 'a' | 'm';
const LETTERS: readonly Letter[] = ['p', 'w', 's', 'a', 'm'];

function stateOf(letter: Letter, name: string): PackageState {
  switch (letter) {
    case 'p':
      return { name, kind: 'published' };
    case 'w':
      return { name, kind: 'published-wrong' };
    case 's':
      return { name, kind: 'staged', stageId: `${UUID}:${name}` };
    case 'a':
      return { name, kind: 'staged-ambiguous' };
    case 'm':
      return { name, kind: 'missing' };
  }
}

function summarize(plan: ReturnType<typeof planApprove>): string {
  switch (plan.kind) {
    case 'approve':
      return `approve:${plan.targets.map((t) => t.name).join(',')}`;
    case 'done':
      return 'done';
    case 'wait':
      return `wait:${plan.names.join(',')}`;
    case 'stop':
      return `stop:${plan.observation.kind}`;
  }
}

// spec K12 の表を上から評価する参照実装 (文字列と正規表現で、本体とは別の書き方をする)
function referencePlan(word: string, names: readonly string[], exhausted: boolean): string {
  if (word.includes('w')) return 'stop:published-wrong';
  if (word.includes('a')) return 'stop:staged-mismatch';
  if (!/^p*[sm]*$/.test(word)) return 'stop:published-out-of-order';
  if (word.includes('m')) {
    if (!exhausted) {
      return `wait:${names.filter((_, i) => word[i] === 'm').join(',')}`;
    }
    return word === 'mmmmmm' ? 'stop:stage-none' : 'stop:staged-mismatch';
  }
  if (/^p+$/.test(word)) return 'done';
  return `approve:${names.filter((_, i) => word[i] === 's').join(',')}`;
}

function allWords(length: number): string[] {
  let words = [''];
  for (let i = 0; i < length; i++) {
    words = words.flatMap((w) => LETTERS.map((l) => w + l));
  }
  return words;
}

// npm の公開は approve した順に起き、approve は manifest の順に行う。ただし packument の読み出しの
// キャッシュは独立なので、先頭の view だけが遅れて非連続に見えることはありうる。そのため K15 の
// published-out-of-order の next は「数分後に再実行し、変わらなければ F3」とする。
// この前提があるので、非連続の判定は missing の待機より先に行う。
test('planApprove: 5 状態 x 6 パッケージの 15,625 通りが spec の表の参照実装と一致する', () => {
  const words = allWords(6);
  assert.equal(words.length, 15625);
  for (const word of words) {
    const states = [...word].map((l, i) => stateOf(l as Letter, NAMES[i] ?? ''));
    for (const exhausted of [false, true]) {
      assert.equal(
        summarize(planApprove(states, exhausted)),
        referencePlan(word, NAMES, exhausted),
        `${word} exhausted=${String(exhausted)}`
      );
    }
  }
});

test('planApprove: 性質 (published-wrong / ambiguous / 非連続 / stage-none / approve の targets)', () => {
  const plan = (word: string, exhausted = false) =>
    planApprove(
      [...word].map((l, i) => stateOf(l as Letter, NAMES[i] ?? '')),
      exhausted
    );
  assert.equal(plan('pwssss').kind, 'stop');
  assert.deepEqual(summarize(plan('pwssss')), 'stop:published-wrong');
  assert.equal(summarize(plan('ssasss')), 'stop:staged-mismatch');
  assert.equal(summarize(plan('spssss')), 'stop:published-out-of-order');
  assert.equal(summarize(plan('mmmmmm', true)), 'stop:stage-none');
  assert.equal(summarize(plan('mmmmmm', false)), `wait:${NAMES.join(',')}`);
  assert.equal(summarize(plan('ppppmm', true)), 'stop:staged-mismatch');

  for (const word of allWords(6)) {
    const p = plan(word);
    if (p.kind !== 'approve') continue;
    const k = word.indexOf('s');
    assert.match(word, /^p*s+$/);
    assert.deepEqual(
      p.targets.map((t) => t.name),
      NAMES.slice(k)
    );
    for (const t of p.targets) assert.equal(t.stageId, `${UUID}:${t.name}`);
  }
});

test('planApprove: stop の observation の published は published と published-wrong の名前 (manifest の順)', () => {
  const states = [...'pwsssm'].map((l, i) => stateOf(l as Letter, NAMES[i] ?? ''));
  const plan = planApprove(states, false);
  assert.equal(plan.kind, 'stop');
  if (plan.kind !== 'stop') return;
  assert.deepEqual(plan.observation.published, [NAMES[0], NAMES[1]]);
  const out = planApprove(
    [...'spssss'].map((l, i) => stateOf(l as Letter, NAMES[i] ?? '')),
    false
  );
  if (out.kind !== 'stop' || out.observation.kind !== 'published-out-of-order') {
    throw new Error('expected published-out-of-order');
  }
  assert.deepEqual(out.observation.published, [NAMES[1]]);
  assert.deepEqual(out.observation.names, [NAMES[0]]);
});

// --- judgeStaged ---

function goodTgz(name: string): Buffer {
  return gz(
    buildTar(
      goodEntries(
        JSON.stringify({
          name,
          version: VERSION,
          dependencies: { '@kanbun-skam/skam': VERSION },
        })
      )
    )
  );
}

interface StagedFixture {
  log: LogManifest;
  expected: typeof EXPECTED_LOG;
  tarballs: Map<string, Buffer>;
  targets: { name: string; stageId: string; tarball: Buffer }[];
  artifact: NonNullable<Parameters<typeof judgeStaged>[0]['artifact']>;
}

function stagedFixture(targetNames: readonly string[] = NAMES.slice(1, 3)): StagedFixture {
  const tarballs = new Map(NAMES.map((n) => [n, goodTgz(n)]));
  const packages = NAMES.map((name, i) => ({
    name,
    file: fileOf(name),
    integrity: targetNames.includes(name)
      ? sha512Integrity(tarballs.get(name) as Buffer)
      : integrityOf(i + 1),
  }));
  const log: LogManifest = { tag: TAG, version: VERSION, distTag: 'latest', packages };
  return {
    log,
    expected: EXPECTED_LOG,
    tarballs,
    targets: targetNames.map((name) => ({
      name,
      stageId: `${UUID}:${name}`,
      tarball: tarballs.get(name) as Buffer,
    })),
    artifact: {
      entries: [
        entry('manifest.json', 'file', 900),
        ...packages.map((p) => entry(p.file, 'file', 1000)),
      ],
      manifest: { schemaVersion: 1, tag: TAG, version: VERSION, distTag: 'latest', packages },
      files: packages.map((p) => ({ file: p.file, integrity: p.integrity })),
    },
  };
}

test('judgeStaged: すべて一致すれば ok と validatedIds (name -> stage id)', () => {
  const f = stagedFixture();
  const r = judgeStaged({
    logManifest: f.log,
    expected: f.expected,
    artifact: f.artifact,
    targets: f.targets,
  });
  assert.equal(r.kind, 'ok');
  if (r.kind !== 'ok') return;
  assert.equal(r.validatedIds.size, 2);
  assert.equal(r.validatedIds.get(NAMES[1] ?? ''), `${UUID}:${NAMES[1]}`);
});

test('judgeStaged: artifact が無ければ残りで判定して ok', () => {
  const f = stagedFixture();
  const r = judgeStaged({ logManifest: f.log, expected: f.expected, targets: f.targets });
  assert.equal(r.kind, 'ok');
});

test('judgeStaged: stage の tarball の sha512 が log と違えば mismatch (name つき)', () => {
  const f = stagedFixture();
  const other = gz(buildTar([...goodEntries(), fileEntry('package/dist/extra.js', 'x')]));
  const targets = f.targets.map((t) => (t.name === NAMES[2] ? { ...t, tarball: other } : t));
  const r = judgeStaged({ logManifest: f.log, expected: f.expected, targets });
  assert.equal(r.kind, 'mismatch');
  if (r.kind === 'mismatch') assert.equal(r.name, NAMES[2]);
});

test('judgeStaged: artifact の integrity が log と違えば mismatch', () => {
  const f = stagedFixture();
  const packages = f.artifact.manifest as ReleaseManifest;
  const changed = packages.packages.map((p, i) =>
    i === 1 ? { ...p, integrity: integrityOf(77) } : p
  );
  const artifact = {
    ...f.artifact,
    manifest: { ...packages, packages: changed },
    files: changed.map((p) => ({ file: p.file, integrity: p.integrity })),
  };
  const r = judgeStaged({ logManifest: f.log, expected: f.expected, artifact, targets: f.targets });
  assert.equal(r.kind, 'mismatch');
});

test('judgeStaged: artifact のディレクトリに余分なファイルがあれば mismatch', () => {
  const f = stagedFixture();
  const artifact = { ...f.artifact, entries: [...f.artifact.entries, entry('x', 'file', 1)] };
  const r = judgeStaged({ logManifest: f.log, expected: f.expected, artifact, targets: f.targets });
  assert.equal(r.kind, 'mismatch');
});

test('judgeStaged: log の manifest が手元の正本と違えば mismatch (tarball を見る前に止まる)', () => {
  const f = stagedFixture();
  const r = judgeStaged({
    logManifest: f.log,
    expected: { ...f.expected, tag: 'v0.2.1' },
    targets: f.targets,
  });
  assert.equal(r.kind, 'mismatch');
});

test('judgeStaged: tarball が shape-unknown (GNU magic) なら shape-unknown', () => {
  const f = stagedFixture();
  const gnu = gz(
    buildTar(goodEntries().map((e, i) => (i === 1 ? { ...e, magic: 'ustar ', version: ' \0' } : e)))
  );
  const log: LogManifest = {
    ...f.log,
    packages: f.log.packages.map((p) =>
      p.name === NAMES[1] ? { ...p, integrity: sha512Integrity(gnu) } : p
    ),
  };
  const targets = f.targets.map((t) => (t.name === NAMES[1] ? { ...t, tarball: gnu } : t));
  const r = judgeStaged({ logManifest: log, expected: f.expected, targets });
  assert.equal(r.kind, 'shape-unknown');
});

test('judgeStaged: tarball の中身が不正 (postinstall) なら mismatch (name つき)', () => {
  const f = stagedFixture();
  const evil = gz(buildTar(goodEntries(packageJson({ scripts: { postinstall: 'x' } }))));
  const log: LogManifest = {
    ...f.log,
    packages: f.log.packages.map((p) =>
      p.name === NAMES[1] ? { ...p, integrity: sha512Integrity(evil) } : p
    ),
  };
  const targets = f.targets.map((t) => (t.name === NAMES[1] ? { ...t, tarball: evil } : t));
  const r = judgeStaged({ logManifest: log, expected: f.expected, targets });
  assert.equal(r.kind, 'mismatch');
  if (r.kind === 'mismatch') assert.equal(r.name, NAMES[1]);
});

test('judgeStaged: log に無いパッケージの target は mismatch', () => {
  const f = stagedFixture();
  const r = judgeStaged({
    logManifest: f.log,
    expected: f.expected,
    targets: [{ name: '@kanbun-skam/unknown', stageId: UUID, tarball: Buffer.from('x') }],
  });
  assert.equal(r.kind, 'mismatch');
});

// ======================================================================
// T8: E409、approve の後の判定、止まるときの分類、一時ディレクトリ (K13、K14、K15)
// ======================================================================

test('isE409', () => {
  assert.equal(isE409(''), false);
  assert.equal(isE409('npm error code E409'), true);
  assert.equal(isE409('E4090'), false);
  assert.equal(isE409('xE409'), false);
});

test('parseViewDist (実物): 逐語の出力は ok で attestations なし', () => {
  const r = parseViewDist(REAL_NPM_VIEW_DIST);
  assert.equal(r.kind, 'ok');
  if (r.kind !== 'ok') return;
  assert.equal(r.dist.hasAttestations, false);
  assert.equal(r.dist.attestations, undefined);
  assert.equal(Object.hasOwn(r.dist.distTags, 'latest'), true);
  assert.equal(r.dist.distTags['latest'], '0.1.0');
  assert.match(r.dist.integrity, /^sha512-/);
});

test('parseViewDist (実物 0.2.0): attestations は実物の値をそのまま持つ', () => {
  const r = parseViewDist(REAL_NPM_VIEW_DIST_WITH_ATTESTATIONS);
  assert.equal(r.kind, 'ok');
  if (r.kind !== 'ok') return;
  assert.equal(r.dist.hasAttestations, true);
  assert.deepEqual(r.dist.attestations, {
    url: 'https://registry.npmjs.org/-/npm/v1/attestations/@kanbun-skam%2fskam@0.2.0',
    provenance: { predicateType: 'https://slsa.dev/provenance/v1' },
  });
});

test('parseViewDist (合成 (実物の構造から)): "dist.attestations" のキーがあれば true', () => {
  const real = JSON.parse(REAL_NPM_VIEW_DIST) as Record<string, unknown>[];
  const withAtt = JSON.stringify([{ ...real[0], 'dist.attestations': { url: 'x' } }]);
  const r = parseViewDist(withAtt);
  assert.equal(r.kind === 'ok' && r.dist.hasAttestations, true);
});

test('parseViewDist: オブジェクト、長さ 2、integrity の欠落や数値、dist-tags の値が数値は shape-unknown', () => {
  const real = (JSON.parse(REAL_NPM_VIEW_DIST) as Record<string, unknown>[])[0] ?? {};
  const bad: unknown[] = [
    real,
    [real, real],
    [],
    [{ 'dist-tags': { latest: '0.1.0' } }],
    [{ ...real, 'dist.integrity': 5 }],
    [{ ...real, 'dist-tags': { latest: 1 } }],
    [{ ...real, 'dist-tags': 'latest' }],
    [{ 'dist.integrity': real['dist.integrity'] }],
    ['x'],
  ];
  for (const b of bad) assert.equal(parseViewDist(JSON.stringify(b)).kind, 'shape-unknown');
  assert.equal(parseViewDist('').kind, 'shape-unknown');
  assert.equal(parseViewDist('not json').kind, 'shape-unknown');
});

test('parseViewDist: dist-tags の辞書は own property だけを見る (継承されたキーは無い)', () => {
  const raw = '[{"dist-tags":{"__proto__":"x","latest":"0.2.0"},"dist.integrity":"sha512-a"}]';
  const r = parseViewDist(raw);
  assert.equal(r.kind, 'ok');
  if (r.kind !== 'ok') return;
  assert.equal(Object.hasOwn(r.dist.distTags, 'toString'), false);
  assert.equal(r.dist.distTags['latest'], '0.2.0');
});

function viewItem(name: string, version: string, integrity: string) {
  const raw = JSON.stringify([{ 'dist-tags': { latest: version }, 'dist.integrity': integrity }]);
  return { name, dist: parseViewDist(raw) };
}

function integrityMap(): Map<string, string> {
  return new Map(NAMES.map((n, i) => [n, integrityOf(i + 1)]));
}

const PUBLISHED_ALL: Published = NAMES;

test('judgePostCheck: すべて一致すれば空', () => {
  const items = NAMES.map((n, i) => viewItem(n, VERSION, integrityOf(i + 1)));
  const out = judgePostCheck(
    items,
    { version: VERSION, distTag: 'latest', integrities: integrityMap() },
    true,
    PUBLISHED_ALL
  );
  assert.deepEqual(out, []);
});

test('judgePostCheck: integrity 違い + dist-tag 違い + Release なしは 3 つで、published がそのまま入る', () => {
  const items = NAMES.map((n, i) =>
    i === 0
      ? viewItem(n, VERSION, integrityOf(99))
      : i === 1
        ? viewItem(n, '0.1.1', integrityOf(2))
        : viewItem(n, VERSION, integrityOf(i + 1))
  );
  const out = judgePostCheck(
    items,
    { version: VERSION, distTag: 'latest', integrities: integrityMap() },
    false,
    PUBLISHED_ALL
  );
  assert.equal(out.length, 3);
  const checks = out.map((o) => (o.kind === 'post-check' ? o.check : o.kind));
  assert.deepEqual(checks.sort(), ['dist-tag', 'integrity', 'release']);
  for (const o of out) assert.equal(o.published, PUBLISHED_ALL);
});

test('judgePostCheck: shape-unknown の view と、view が足りない名前は shape', () => {
  const items = [
    ...NAMES.slice(0, 4).map((n, i) => viewItem(n, VERSION, integrityOf(i + 1))),
    { name: NAMES[4] ?? '', dist: parseViewDist('not json') },
  ];
  const out = judgePostCheck(
    items,
    { version: VERSION, distTag: 'latest', integrities: integrityMap() },
    true,
    ['@kanbun-skam/skam']
  );
  const shape = out.filter((o) => o.kind === 'post-check' && o.check === 'shape');
  assert.equal(shape.length, 2);
  assert.deepEqual(out[0]?.published, ['@kanbun-skam/skam']);
});

// --- dist.attestations の形 (K8。registry が申告する形の確認で、出所の検証ではない) ---

const SLSA_V1 = 'https://slsa.dev/provenance/v1';

// 実物 (0.2.0) の attestations を入れた view。integrity と dist-tag は期待どおりにする
function attItem(name: string, i: number, attestations: unknown) {
  const raw = JSON.stringify([
    {
      'dist-tags': { latest: VERSION },
      'dist.integrity': integrityOf(i + 1),
      ...(attestations === undefined ? {} : { 'dist.attestations': attestations }),
    },
  ]);
  return { name, dist: parseViewDist(raw) };
}

const REAL_ATTESTATIONS: unknown = (
  JSON.parse(REAL_NPM_VIEW_DIST_WITH_ATTESTATIONS) as Record<string, unknown>[]
)[0]!['dist.attestations'];

// 1 つ目のパッケージだけ attestations を差し替え、残りは実物にする
function judgeWithAttestations(overrideFirst: unknown) {
  const items = NAMES.map((n, i) => attItem(n, i, i === 0 ? overrideFirst : REAL_ATTESTATIONS));
  return judgePostCheck(
    items,
    { version: VERSION, distTag: 'latest', integrities: integrityMap() },
    true,
    PUBLISHED_ALL
  );
}

test('judgePostCheck: 6 パッケージとも 0.2.0 の実物の attestations なら失敗なし', () => {
  assert.deepEqual(judgeWithAttestations(REAL_ATTESTATIONS), []);
});

test('judgePostCheck: attestations が undefined (キーなし) なら何も足さない', () => {
  assert.deepEqual(judgeWithAttestations(undefined), []);
});

test('judgePostCheck: predicateType が v0.2 なら、そのパッケージの shape が 1 つ', () => {
  const out = judgeWithAttestations({
    ...(REAL_ATTESTATIONS as object),
    provenance: { predicateType: 'https://slsa.dev/provenance/v0.2' },
  });
  assert.equal(out.length, 1);
  const f = out[0];
  assert.ok(f !== undefined && f.kind === 'post-check');
  assert.equal(f.check, 'shape');
  assert.equal(f.name, NAMES[0]);
  assert.ok(f.what.includes('v0.2'));
  assert.ok(f.what.includes(SLSA_V1));
});

test('judgePostCheck: predicateType が数値なら shape', () => {
  const out = judgeWithAttestations({ provenance: { predicateType: 1 } });
  assert.equal(out.length, 1);
  assert.ok(out[0]?.kind === 'post-check' && out[0].check === 'shape');
});

test('judgePostCheck: provenance が無い / null / 配列は shape で、what に provenance', () => {
  for (const att of [{ url: 'x' }, { provenance: null }, { provenance: [] }]) {
    const out = judgeWithAttestations(att);
    assert.equal(out.length, 1, JSON.stringify(att));
    const f = out[0];
    assert.ok(f !== undefined && f.kind === 'post-check' && f.check === 'shape');
    assert.ok(f.what.includes('provenance'), f.what);
  }
});

test('judgePostCheck: attestations が文字列 / null / 配列 / {} は shape', () => {
  for (const att of ['x', null, [], {}]) {
    const out = judgeWithAttestations(att);
    assert.equal(out.length, 1, JSON.stringify(att));
    assert.ok(out[0]?.kind === 'post-check' && out[0].check === 'shape');
  }
});

test('judgePostCheck: predicateType に改行があっても what は 1 行で、200 文字に収まる', () => {
  const out = judgeWithAttestations({
    provenance: { predicateType: `a\nb${'x'.repeat(500)}` },
  });
  assert.equal(out.length, 1);
  const f = out[0];
  assert.ok(f !== undefined && f.kind === 'post-check');
  assert.ok(!f.what.includes('\n'));
  assert.ok(f.what.includes(SLSA_V1));
  assert.ok(f.what.length < 400, String(f.what.length));
});

test('judgePostCheck: distTag が next なら next の tag を見る', () => {
  const raw = JSON.stringify([
    { 'dist-tags': { latest: '0.1.1', next: '0.2.0-beta.1' }, 'dist.integrity': integrityOf(1) },
  ]);
  const out = judgePostCheck(
    [{ name: NAMES[0] ?? '', dist: parseViewDist(raw) }],
    {
      version: '0.2.0-beta.1',
      distTag: 'next',
      integrities: new Map([[NAMES[0] ?? '', integrityOf(1)]]),
    },
    true,
    PUBLISHED_ALL
  );
  assert.deepEqual(out, []);
});

// --- classifyStop: spec K15 の表と同じ並び ---

const TWO_PUBLISHED: Published = ['@kanbun-skam/skam', '@kanbun-skam/skam-xml-parser'];

type Cell = readonly [route: StopRoute, mayBeF3: boolean];
type Variant = [label: string, build: (published: Published) => StopObservation, Cell, Cell, Cell];

const MANUAL: Cell = ['manual', false];
const MANUAL_F3: Cell = ['manual', true];
const RERUN: Cell = ['rerun', false];
const RERUN_F3: Cell = ['rerun', true];

const STOP_TABLE: Variant[] = [
  [
    'run-not-found',
    (published) => ({ kind: 'run-not-found', published }),
    ['F4', false],
    MANUAL_F3,
    MANUAL_F3,
  ],
  [
    'job-failed validate',
    (published) => ({ kind: 'job-failed', job: 'validate', published }),
    ['F1', false],
    MANUAL_F3,
    MANUAL_F3,
  ],
  [
    'job-failed npm-stage',
    (published) => ({ kind: 'job-failed', job: 'npm-stage', published }),
    ['F2', false],
    ['F3', false],
    MANUAL_F3,
  ],
  [
    'unexpected-run-shape',
    (published) => ({ kind: 'unexpected-run-shape', what: 'x', published }),
    MANUAL,
    MANUAL_F3,
    MANUAL_F3,
  ],
  [
    'shape-unknown',
    (published) => ({ kind: 'shape-unknown', what: 'x', published }),
    MANUAL,
    MANUAL_F3,
    MANUAL_F3,
  ],
  [
    'staged-mismatch',
    (published) => ({ kind: 'staged-mismatch', what: 'x', published }),
    ['F2', false],
    ['F3', false],
    MANUAL_F3,
  ],
  [
    'stage-none',
    (published) => ({ kind: 'stage-none', published }),
    ['F2', false],
    MANUAL_F3,
    MANUAL_F3,
  ],
  [
    'published-out-of-order',
    (published) => ({ kind: 'published-out-of-order', names: [], published }),
    MANUAL_F3,
    ['F3', false],
    MANUAL_F3,
  ],
  [
    'published-wrong',
    (published) => ({ kind: 'published-wrong', name: 'x', published }),
    MANUAL_F3,
    ['F3', false],
    MANUAL_F3,
  ],
  [
    'approve-failed',
    (published) => ({ kind: 'approve-failed', name: 'x', what: 'x', published }),
    RERUN,
    RERUN,
    RERUN_F3,
  ],
  ['interrupted', (published) => ({ kind: 'interrupted', published }), RERUN, RERUN, RERUN_F3],
  [
    'attempt-changed',
    (published) => ({ kind: 'attempt-changed', published }),
    RERUN,
    RERUN,
    RERUN_F3,
  ],
  [
    'command-failed',
    (published) => ({ kind: 'command-failed', what: 'x', published }),
    RERUN,
    RERUN,
    RERUN_F3,
  ],
  ['trust-eotp', (published) => ({ kind: 'trust-eotp', published }), RERUN, RERUN, RERUN_F3],
  [
    'trust-mismatch',
    (published) => ({ kind: 'trust-mismatch', what: 'x', published }),
    MANUAL,
    MANUAL,
    MANUAL_F3,
  ],
  [
    'post-check integrity',
    (published) => ({ kind: 'post-check', check: 'integrity', what: 'x', published }),
    MANUAL_F3,
    ['F3', false],
    MANUAL_F3,
  ],
  [
    'post-check dist-tag',
    (published) => ({ kind: 'post-check', check: 'dist-tag', what: 'x', published }),
    MANUAL_F3,
    MANUAL,
    MANUAL_F3,
  ],
  [
    'post-check release',
    (published) => ({ kind: 'post-check', check: 'release', what: 'x', published }),
    MANUAL_F3,
    RERUN,
    MANUAL_F3,
  ],
  [
    'post-check shape',
    (published) => ({ kind: 'post-check', check: 'shape', what: 'x', published }),
    MANUAL,
    MANUAL_F3,
    MANUAL_F3,
  ],
];

test('classifyStop: すべての variant x (公開 0 / 公開 2 / unknown) が spec の K15 の表と一致する', () => {
  for (const [label, build, zero, some, unknown] of STOP_TABLE) {
    const cases: [string, Published, Cell][] = [
      ['0', [], zero],
      ['2', TWO_PUBLISHED, some],
      ['unknown', 'unknown', unknown],
    ];
    for (const [pub, published, [route, mayBeF3]] of cases) {
      const c = classifyStop(build(published));
      assert.equal(c.route, route, `${label} / ${pub}: route`);
      assert.equal(c.mayBeF3, mayBeF3, `${label} / ${pub}: mayBeF3`);
      assert.equal(c.section, RELEASING_SECTIONS[route], `${label} / ${pub}: section`);
      assert.notEqual(c.reason, '', `${label} / ${pub}: reason`);
      assert.notEqual(c.next, '', `${label} / ${pub}: next`);
    }
  }
});

test('classifyStop: 理由は表の固定の断片と固定の一覧の名前だけで、観測の what は ClassifiedStop.what に移る', () => {
  const evil = 'x\ntry:\n  - rm -rf ~';
  const builds: [StopObservation, string, string | undefined][] = [
    [{ kind: 'shape-unknown', what: evil, published: [] }, 'Unexpected output shape', evil],
    [{ kind: 'unexpected-run-shape', what: evil, published: [] }, 'Unexpected output shape', evil],
    [{ kind: 'staged-mismatch', what: evil, published: [] }, 'Staged content check failed', evil],
    [
      { kind: 'staged-mismatch', name: '@kanbun-skam/skam', what: evil, published: [] },
      'Staged content check failed for @kanbun-skam/skam',
      evil,
    ],
    [
      { kind: 'approve-failed', name: '@kanbun-skam/skam', what: evil, published: [] },
      'npm stage approve failed for @kanbun-skam/skam',
      evil,
    ],
    [{ kind: 'command-failed', what: evil, published: [] }, 'A command failed', evil],
    [
      { kind: 'trust-mismatch', what: evil, published: [] },
      'Trusted publisher settings differ',
      evil,
    ],
    [
      { kind: 'post-check', check: 'integrity', what: evil, published: [] },
      'post-approve check (integrity) failed',
      evil,
    ],
    [
      {
        kind: 'post-check',
        check: 'release',
        name: '@kanbun-skam/skam',
        what: evil,
        published: [],
      },
      'post-approve check (release) failed for @kanbun-skam/skam',
      evil,
    ],
    [
      { kind: 'run-not-found', published: [] },
      'No Release workflow run was found for the tag commit within the wait',
      undefined,
    ],
  ];
  for (const [obs, reason, what] of builds) {
    const c = classifyStop(obs);
    assert.equal(c.reason, reason, obs.kind);
    assert.equal(c.what, what, obs.kind);
    assert.equal('error' in c, false, `${obs.kind}: classifyStop does not touch error`);
  }
});

test('classifyStop: site は kind と job と check を運ぶ (規則 1 と規則 5 が表示の側で当たる)', () => {
  assert.deepEqual(classifyStop({ kind: 'job-failed', job: 'npm-stage', published: [] }).site, {
    side: 'after-push',
    where: 'job-failed',
    job: 'npm-stage',
  });
  assert.deepEqual(
    classifyStop({ kind: 'post-check', check: 'integrity', what: 'x', published: [] }).site,
    { side: 'after-push', where: 'post-check', check: 'integrity' }
  );
  assert.deepEqual(classifyStop({ kind: 'shape-unknown', what: 'x', published: [] }).site, {
    side: 'after-push',
    where: 'shape-unknown',
  });
});

test('classifyStop: variant の表は StopObservation のすべての kind を覆う', () => {
  const covered = new Set(STOP_TABLE.map(([, build]) => build([]).kind));
  assert.deepEqual([...covered].sort(), [
    'approve-failed',
    'attempt-changed',
    'command-failed',
    'interrupted',
    'job-failed',
    'post-check',
    'published-out-of-order',
    'published-wrong',
    'run-not-found',
    'shape-unknown',
    'stage-none',
    'staged-mismatch',
    'trust-eotp',
    'trust-mismatch',
    'unexpected-run-shape',
  ]);
});

test('classifyStop: published-out-of-order の next は「数分後に再実行し、変わらなければ F3」', () => {
  const c = classifyStop({
    kind: 'published-out-of-order',
    names: ['a'],
    published: TWO_PUBLISHED,
  });
  assert.match(c.next, /rerun/i);
  assert.match(c.next, /F3/);
});

test('RELEASING_SECTIONS: route ごとの見出しの接頭辞', () => {
  assert.deepEqual(RELEASING_SECTIONS, {
    F1: '### F1:',
    F2: '### F2:',
    F3: '### F3:',
    F4: '### F4:',
    rerun: '## 止まったとき',
    manual: '## 手作業の手順',
  });
});

function stop(route: StopRoute): ClassifiedStop {
  return {
    route,
    reason: route,
    next: route,
    section: RELEASING_SECTIONS[route],
    mayBeF3: false,
    site: { side: 'after-push', where: 'interrupted' },
  };
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest])
  );
}

test('pickRepresentative: F3 > manual > rerun > F1 / F2 / F4', () => {
  assert.equal(pickRepresentative([stop('rerun'), stop('F3'), stop('manual')]).route, 'F3');
  assert.equal(pickRepresentative([stop('rerun'), stop('manual')]).route, 'manual');
  assert.equal(pickRepresentative([stop('F1'), stop('rerun')]).route, 'rerun');
  assert.equal(pickRepresentative([stop('F4')]).route, 'F4');
});

test('pickRepresentative: 4 値の全順列で同じ代表', () => {
  for (const perm of permutations([stop('F3'), stop('manual'), stop('rerun'), stop('F1')])) {
    const [first, ...rest] = perm;
    assert.equal(pickRepresentative([first as ClassifiedStop, ...rest]).route, 'F3');
  }
  for (const perm of permutations([stop('manual'), stop('rerun'), stop('F1'), stop('F2')])) {
    const [first, ...rest] = perm;
    assert.equal(pickRepresentative([first as ClassifiedStop, ...rest]).route, 'manual');
  }
});

test('isSafeTempPath: mkdtemp の返したパスだけが真', () => {
  const root = '/tmp';
  const good = '/tmp/kanbun-release-Ab12Cd';
  const created = new Set([good]);
  assert.equal(isSafeTempPath(good, created, root), true);

  const falsy = (candidate: string): void => {
    assert.equal(isSafeTempPath(candidate, new Set([candidate, good]), root), false, candidate);
  };
  falsy('/');
  falsy('/home/user');
  falsy('/tmp');
  falsy('/var/kanbun-release-Ab12Cd');
  falsy('/tmp/a/kanbun-release-Ab12Cd');
  falsy('/tmp/kanbun-release-Ab12Cd/sub');
  falsy('/tmp/kanbun-release-Ab12Cd/..');
  falsy('/tmp/../kanbun-release-x');
  falsy('kanbun-release-Ab12Cd');
  falsy('/tmp/kanbun-release-Ab12Cd/');
  falsy('/tmp/other-Ab12Cd');
  assert.equal(isSafeTempPath('/tmp/kanbun-release-Zz9', created, root), false);
  assert.equal(isSafeTempPath(good, new Set(), root), false);
});

test('isSafeTempPath: tmpRoot が / や HOME でも、その直下の kanbun-release- だけが真', () => {
  const c = '/home/u/kanbun-release-x';
  assert.equal(isSafeTempPath(c, new Set([c]), '/home/u'), true);
  assert.equal(isSafeTempPath('/home/u', new Set(['/home/u']), '/home/u'), false);
  assert.equal(isSafeTempPath('/', new Set(['/']), '/'), false);
});

test('classifyStop: site を観測から埋める (job-failed は job、post-check は check、他は where だけ)', () => {
  assert.deepEqual(classifyStop({ kind: 'job-failed', job: 'npm-stage', published: [] }).site, {
    side: 'after-push',
    where: 'job-failed',
    job: 'npm-stage',
  });
  assert.deepEqual(
    classifyStop({ kind: 'post-check', check: 'integrity', what: 'x', published: [] }).site,
    { side: 'after-push', where: 'post-check', check: 'integrity' }
  );
  assert.deepEqual(classifyStop({ kind: 'shape-unknown', what: 'x', published: [] }).site, {
    side: 'after-push',
    where: 'shape-unknown',
  });
});
