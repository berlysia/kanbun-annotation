import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactSecrets } from './release-stop-report.ts';

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
