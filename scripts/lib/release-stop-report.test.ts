import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  excerptDetail,
  excerptJobLog,
  excerptLocalStderr,
  prependDetail,
  redactSecrets,
} from './release-stop-report.ts';
import { NO_COMMAND } from './release-types.ts';
import type { ErrorExcerpt } from './release-types.ts';

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');
}
const LOG_E401 = fixture('job-log-39196389682.txt');
const LOG_OIDC = fixture('job-log-39198354458.txt');

// job の log の 1 行 (実物の接頭辞つき)
function logLine(content: string): string {
  return `Stage on npm\tStage publish\t\ufeff2026-10-19T03:49:35.7225Z ${content}`;
}
const stderrOf = (text: string): ErrorExcerpt =>
  excerptLocalStderr('npm x', 1, text, { tool: 'npm' });

// --- redactSecrets (spec K3 の手順 5) ---

test('redactSecrets: URL の userinfo と ghs_ token を伏せ、host と path は残す', () => {
  const out = redactSecrets(
    "fatal: unable to access 'https://x-access-token:ghs_AAAA1234@github.com/org/repo/'"
  );
  assert.ok(!out.includes('ghs_'));
  assert.ok(!out.includes('x-access-token'));
  assert.ok(out.includes('github.com/org/repo'));
});

test('redactSecrets: _authToken の値を伏せる', () => {
  assert.equal(
    redactSecrets('//registry.npmjs.org/:_authToken=npm_abcdefghijklmnopqrstuvwxyz0123456789'),
    '//registry.npmjs.org/:_authToken=***'
  );
});

test('redactSecrets: Authorization: Bearer の値を伏せる', () => {
  assert.equal(redactSecrets('Authorization: Bearer abc.def'), 'Authorization: Bearer ***');
});

test('redactSecrets: 名前に TOKEN / SECRET / PASSWORD を含む KEY=value と KEY: value', () => {
  assert.equal(redactSecrets('NODE_AUTH_TOKEN=xyz'), 'NODE_AUTH_TOKEN=***');
  assert.equal(redactSecrets('NPM_TOKEN: xyz'), 'NPM_TOKEN: ***');
  assert.equal(redactSecrets('db_password=xyz'), 'db_password=***');
  assert.equal(redactSecrets('client_secret = xyz'), 'client_secret = ***');
});

test('redactSecrets: 各種 prefix の token', () => {
  for (const prefix of ['ghp_', 'gho_', 'ghs_', 'ghu_', 'ghr_', 'npm_']) {
    const out = redactSecrets(`value ${prefix}${'A1'.repeat(18)} end`);
    assert.equal(out, 'value *** end', prefix);
  }
  assert.equal(redactSecrets(`x github_pat_11AAAA_${'b'.repeat(30)} y`), 'x *** y');
});

test('redactSecrets: JWT の形は eyJ 以降を伏せる', () => {
  assert.equal(redactSecrets('token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig'), 'token ***');
});

test('redactSecrets: 4096 で切れた JWT (2 つ目の . が無い) も伏せる', () => {
  assert.equal(redactSecrets('eyJhbGciOiJIUzI1NiJ9.eyJzdW'), '***');
});

test('redactSecrets: npm の認証 URL のクエリは伏せ、path と status は残す', () => {
  const out = redactSecrets(
    'npm error 404 Not Found - GET https://registry.npmjs.org/-/v1/done?sessionId=abc123'
  );
  assert.ok(!out.includes('abc123'));
  assert.ok(out.includes('/-/v1/done'));
  assert.ok(out.includes('404'));
});

test('redactSecrets: /login/cli/ の後の id を伏せる', () => {
  assert.equal(
    redactSecrets('https://www.npmjs.com/login/cli/0f6c1234-aaaa'),
    'https://www.npmjs.com/login/cli/***'
  );
});

test('redactSecrets: 誤検出しない (npm error code E401)', () => {
  assert.equal(redactSecrets('npm error code E401'), 'npm error code E401');
});

test('redactSecrets: 伏せた結果にもう一度かけても変わらない', () => {
  const once = redactSecrets('https://u:p@h/x NPM_TOKEN: abc ghp_AAAA Authorization: Bearer q');
  assert.equal(redactSecrets(once), once);
});

test('redactSecrets: 長い入力でも線形の時間で終わる', { timeout: 5000 }, () => {
  const inputs = [
    'a'.repeat(1_000_000),
    '/'.repeat(500_000),
    'token'.repeat(100_000),
    '//' + 'a'.repeat(500_000),
    'eyJ' + '.'.repeat(500_000),
    ' '.repeat(500_000) + '=',
    'token' + ' '.repeat(500_000),
    '/-/v1/'.repeat(100_000),
  ];
  const start = Date.now();
  for (const input of inputs) redactSecrets(input);
  assert.ok(Date.now() - start < 3000);
});

// --- 切り出し (spec K3) ---

const GHP = `ghp_${'A'.repeat(36)}`;

test('excerptJobLog: 実物 (E401) の matched に E401 と ##[error] があり、接頭辞・BOM・ANSI が無い', () => {
  const e = excerptJobLog('gh run view', LOG_E401);
  assert.ok(e.matched.includes('npm error code E401'));
  assert.ok(e.matched.includes('##[error]Process completed with exit code 1.'));
  for (const line of [...e.matched, ...e.lines]) {
    assert.ok(!line.includes('\ufeff'), line);
    assert.ok(!line.includes('[36;1m'), line);
    assert.ok(!line.includes('Stage on npm\tStage publish\t'), line);
  }
});

test('fixture の全行は redactSecrets の不動点 (秘密を含まない)', () => {
  for (const log of [LOG_E401, LOG_OIDC]) {
    for (const line of log.split('\n')) assert.equal(redactSecrets(line), line);
  }
});

test('excerptJobLog: env: の段で終わる log (matched 空) では lines に env: の段の行が無い', () => {
  const log = [
    logLine('some step output'),
    logLine('env:'),
    logLine('  TAG_NAME: v0.2.0'),
    logLine(''),
    logLine('  ACTIONS_ID_TOKEN_REQUEST_TOKEN: ***'),
  ].join('\n');
  const e = excerptJobLog('gh run view', log);
  assert.deepEqual(e.matched, []);
  assert.deepEqual(e.lines, ['some step output']);
});

test('excerptJobLog: env: の段の直後の npm error 行は matched に残る', () => {
  const log = [logLine('env:'), logLine('  TAG_NAME: v0.2.0'), logLine('npm error code E401')].join(
    '\n'
  );
  const e = excerptJobLog('gh run view', log);
  assert.deepEqual(e.matched, ['npm error code E401']);
});

test('excerptJobLog: env: の段の行は matched にも lines にも入らない', () => {
  const log = [
    logLine('env:'),
    logLine('  ACTIONS_ID_TOKEN_REQUEST_TOKEN: ***'),
    logLine('x'),
  ].join('\n');
  const e = excerptJobLog('gh run view', log);
  assert.ok(![...e.matched, ...e.lines].some((l) => l.includes('ACTIONS_ID_TOKEN')));
});

test('excerptJobLog: matched が 20 行、E401 が先頭 → lines は最後の 12 行で E401 を含まない', () => {
  const log = [
    logLine('npm error code E401'),
    ...Array.from({ length: 19 }, (_, i) => logLine(`npm error line ${i}`)),
  ].join('\n');
  const e = excerptJobLog('gh run view', log);
  assert.equal(e.lines.length, 12);
  assert.ok(!e.lines.includes('npm error code E401'));
  assert.equal(e.matched.length, 20);
  assert.equal(e.matched[0], 'npm error code E401');
});

test('excerptJobLog: 行頭の形に当たる行が無い 20 行 → matched 空、lines は最後の 12 行', () => {
  const log = Array.from({ length: 20 }, (_, i) => logLine(`plain ${i}`)).join('\n');
  const e = excerptJobLog('gh run view', log);
  assert.deepEqual(e.matched, []);
  assert.deepEqual(
    e.lines,
    Array.from({ length: 12 }, (_, i) => `plain ${i + 8}`)
  );
});

test('excerptJobLog: 実物 (oidc) の matched に package not found の行があり、npm verbose stack は無い', () => {
  const e = excerptJobLog('gh run view', LOG_OIDC);
  assert.ok(
    e.matched.includes(
      'npm verbose oidc Failed token exchange request with body message: OIDC token exchange error - package not found'
    )
  );
  assert.ok(![...e.matched, ...e.lines].some((l) => l.startsWith('npm verbose stack')));
});

test('excerptJobLog: ::add-mask:: の行は選ばない', () => {
  const e = excerptJobLog('gh run view', [logLine('::add-mask::abc'), logLine('x')].join('\n'));
  assert.ok(![...e.matched, ...e.lines].some((l) => l.startsWith('::add-mask::')));
});

test('excerptJobLog: source は job-log、tool は gh', () => {
  const e = excerptJobLog('gh run view', LOG_E401);
  assert.equal(e.source, 'job-log');
  assert.equal(e.tool, 'gh');
  assert.equal(e.command, 'gh run view');
});

test('excerptLocalStderr: 400 コードポイントの行の 290〜330 番目の ghp_ は断片も残らない', () => {
  const line = 'x'.repeat(289) + GHP + 'y'.repeat(75);
  const e = stderrOf(line);
  assert.ok(!e.lines.join('\n').includes('ghp_'));
  assert.ok(e.lines.every((l) => [...l].length <= 300));
});

test('excerptLocalStderr: ゼロ幅の文字や BOM で割れた token も残らない (無害化がマスクより前)', () => {
  for (const sep of ['\u200b', '\ufeff']) {
    const e = stderrOf(`npm error token ghp_${sep}${'A'.repeat(36)}`);
    assert.ok(!e.lines.join('\n').includes('ghp_'), JSON.stringify(sep));
    assert.ok(!e.matched.join('\n').includes('ghp_'), JSON.stringify(sep));
  }
});

test('excerptLocalStderr: stderr が空なら lines は空', () => {
  assert.deepEqual(stderrOf('').lines, []);
  assert.deepEqual(excerptLocalStderr('git push', 1, '', { tool: 'git' }).lines, []);
});

test('excerptLocalStderr: 5000 コードポイントの行の 4090 番目から始まる JWT は eyJ も残らない', () => {
  const line = 'a'.repeat(4089) + 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig' + 'b'.repeat(900);
  const e = stderrOf(line);
  assert.ok(!e.lines.join('\n').includes('eyJ'));
});

test('excerptLocalStderr: エスケープ列で割れた token も残らない (エスケープ列の除去がマスクより前)', () => {
  const e = stderrOf(`npm error token ghp_\x1b[0m${'A'.repeat(36)}`);
  const out = e.lines.join('\n') + e.matched.join('\n');
  assert.ok(!out.includes('ghp_'));
  assert.ok(!out.includes('AAAA'));
});

test('excerptLocalStderr: エスケープ列と制御文字の除去', () => {
  const one = (s: string) => stderrOf(s).lines;
  assert.deepEqual(one('\x1b[36;1mnpm error code E401\x1b[0m'), ['npm error code E401']);
  assert.deepEqual(one('\x1b]8;;https://evil\x07click\x1b]8;;\x07'), ['click']);
  assert.deepEqual(one('foo\x1b'), ['foo']);
  assert.deepEqual(one('\u009b31mred'), ['red']);
});

test('excerptLocalStderr: 改行を含む入力は行に分かれ、どの要素も改行を含まない', () => {
  const e = stderrOf('npm error x\ntry:\n  - rm -rf ~');
  assert.equal(e.lines.length, 3);
  for (const l of e.lines) assert.ok(!/[\n\r\u2028\u2029]/.test(l));
});

test('excerptLocalStderr: 13 行なら最後の 12 行', () => {
  const text = Array.from({ length: 13 }, (_, i) => `line ${i}`).join('\n');
  assert.deepEqual(
    stderrOf(text).lines,
    Array.from({ length: 12 }, (_, i) => `line ${i + 1}`)
  );
});

test('excerptLocalStderr: 301 コードポイントの行は 300 で切れ、サロゲートペアは割れない', () => {
  assert.equal([...(stderrOf('a'.repeat(301)).lines[0] ?? '')].length, 300);
  const pair = '\u{1F600}';
  const cut = stderrOf('a'.repeat(299) + pair + 'b').lines[0] ?? '';
  assert.equal(cut, 'a'.repeat(299) + pair);
  assert.ok(!/[\ud800-\udbff]$/.test(cut));
});

test('excerptLocalStderr: 行頭の形に当たる行が無い入力でも、最後の 12 行は lines にある', () => {
  const e = stderrOf('$ tsc -b\n[ELIFECYCLE] Command failed with exit code 1.');
  assert.deepEqual(e.lines, ['$ tsc -b', '[ELIFECYCLE] Command failed with exit code 1.']);
  assert.deepEqual(e.matched, []);
});

test('excerptLocalStderr: source / tool / matched', () => {
  const e = excerptLocalStderr('git push', 1, 'fatal: x', { tool: 'git' });
  assert.equal(e.source, 'local-stderr');
  assert.equal(e.tool, 'git');
  assert.deepEqual(e.matched, ['fatal: x']);
  assert.equal(e.exit, 1);
});

test('excerptLocalStderr: matched は 4 つの行頭の形だけ', () => {
  const e = stderrOf(
    ['npm error a', 'npm ERR! b', 'fatal: c', 'error: d', 'warning: e', '##[error]f'].join('\n')
  );
  assert.deepEqual(e.matched, ['npm error a', 'npm ERR! b', 'fatal: c', 'error: d']);
});

test('excerptDetail: source none / tool other、matched は常に空、lines は 12 行まで', () => {
  const e = excerptDetail(NO_COMMAND, null, ['npm error code E401', 'fatal: y']);
  assert.equal(e.source, 'none');
  assert.equal(e.tool, 'other');
  assert.deepEqual(e.matched, []);
  assert.deepEqual(e.lines, ['npm error code E401', 'fatal: y']);
});

test('excerptDetail: 13 行と ghp_ を含む行 → 最後の 12 行で ghp_ が無い', () => {
  const lines = [`secret ${GHP}`, ...Array.from({ length: 12 }, (_, i) => `l${i}`)];
  const e = excerptDetail(NO_COMMAND, null, lines);
  assert.equal(e.lines.length, 12);
  const wide = excerptDetail(NO_COMMAND, null, [`a ${GHP}`]);
  assert.ok(!wide.lines.join('').includes('ghp_'));
});

test('prependDetail: what を lines の先頭に足し、matched と他の欄は元のまま', () => {
  const base: ErrorExcerpt = {
    command: 'npm stage approve',
    exit: 1,
    source: 'local-stderr',
    tool: 'npm',
    lines: ['a', 'b'],
    matched: ['npm error a'],
    rawPath: '/tmp/x',
  };
  const e = prependDetail(base, 'x');
  assert.deepEqual(e.lines, ['x', 'a', 'b']);
  assert.deepEqual(e.matched, ['npm error a']);
  assert.equal(e.command, 'npm stage approve');
  assert.equal(e.exit, 1);
  assert.equal(e.source, 'local-stderr');
  assert.equal(e.tool, 'npm');
  assert.equal(e.rawPath, '/tmp/x');
});

test('prependDetail: error が 12 行なら 12 行のままで、元の最後の 1 行が落ちる', () => {
  const lines = Array.from({ length: 12 }, (_, i) => `l${i}`);
  const base: ErrorExcerpt = { ...stderrOf('x'), lines, matched: [] };
  const e = prependDetail(base, 'x');
  assert.equal(e.lines.length, 12);
  assert.equal(e.lines[0], 'x');
  assert.equal(e.lines[11], 'l10');
});

test('prependDetail: error が無ければ source none、command は NO_COMMAND', () => {
  const e = prependDetail(undefined, 'why');
  assert.equal(e.source, 'none');
  assert.equal(e.command, NO_COMMAND);
  assert.deepEqual(e.lines, ['why']);
});

test(
  '改行の無い 64 MiB の 1 行は 1 秒以内に 1 要素 (300 コードポイント以内) になる',
  { timeout: 5000 },
  () => {
    const big = 'a'.repeat(64 * 1024 * 1024);
    const start = Date.now();
    const e = stderrOf(big);
    assert.ok(Date.now() - start < 1000, `took ${Date.now() - start}ms`);
    assert.equal(e.lines.length, 1);
    assert.ok([...(e.lines[0] ?? '')].length <= 300);
  }
);
