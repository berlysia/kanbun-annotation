// release-sanitize.ts の保存物の無害化。不可視の文字はソースに直接書かず、エスケープで書く。

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sanitizeArtifact, sanitizeText } from './release-sanitize.ts';

const ESC = '\u001b';
const hasControl = (text: string): boolean => /[\u001b\u0080-\u009f]/.test(text);

// --- sanitizeText ---

test('sanitizeText: CSI の色指定を除く', () => {
  assert.equal(sanitizeText('a\x1b[31mred\x1b[0m\n'), 'ared\n');
});

test('sanitizeText: OSC は BEL でも ST でも終わりまで除く', () => {
  assert.equal(sanitizeText('x\x1b]0;title\x07y'), 'xy');
  assert.equal(sanitizeText('x\x1b]0;title\x1b\\y'), 'xy');
});

test('sanitizeText: 8 ビットの CSI を除く', () => {
  assert.equal(sanitizeText('a\u009b31mb'), 'ab');
});

test('sanitizeText: DCS と途中で切れた CSI は行末まで除く', () => {
  assert.equal(sanitizeText('a\x1bPq#0\x1b\\b'), 'a');
  assert.equal(sanitizeText('ok\x1b['), 'ok');
});

test('sanitizeText: bidi 制御・ゼロ幅・行の区切りを除く', () => {
  assert.equal(sanitizeText('a‮b​c d'), 'abcd');
});

test('sanitizeText: 既知の形の token を伏せる', () => {
  assert.equal(sanitizeText('token ghp_abcDEF123 end'), 'token *** end');
});

test('sanitizeText: 行ごとに処理し、改行は保つ', () => {
  assert.equal(sanitizeText('a\nghp_abc\nb'), 'a\n***\nb');
});

// --- sanitizeArtifact ---

test('sanitizeArtifact: JSON の葉の ESC を除く', () => {
  const out = sanitizeArtifact('{"msg":"a\\u001b[2Jb"}');
  assert.deepEqual(JSON.parse(out), { msg: 'ab' });
  assert.ok(out.endsWith('\n'));
});

test('sanitizeArtifact: 葉に引用符があっても JSON のまま保つ', () => {
  const out = sanitizeArtifact('{"line":"_authToken=abc\\"x"}');
  assert.deepEqual(JSON.parse(out), { line: '_authToken=***' });
});

test('sanitizeArtifact: キーの秘密も伏せる', () => {
  const out = sanitizeArtifact('{"Authorization: Bearer abc":1}');
  assert.deepEqual(JSON.parse(out), { 'Authorization: Bearer ***': 1 });
});

test('sanitizeArtifact: __proto__ のキーは own property として残る', () => {
  const parsed = JSON.parse(sanitizeArtifact('{"__proto__":{"a":1}}')) as object;
  assert.ok(Object.hasOwn(parsed, '__proto__'));
  assert.equal((Object.getOwnPropertyDescriptor(parsed, '__proto__')?.value as { a: number }).a, 1);
});

test('sanitizeArtifact: 数値・真偽値・null・配列の型を変えない', () => {
  const input = '[1,"x",null,true,{"k":[2]}]';
  assert.deepEqual(JSON.parse(sanitizeArtifact(input)), JSON.parse(input));
});

test('sanitizeArtifact: 無害化でキーが重なれば後の値が残る', () => {
  const parsed = JSON.parse(sanitizeArtifact('{"a":"\\u001bA","a\\u001b":"B"}')) as Record<
    string,
    string
  >;
  assert.deepEqual(Object.keys(parsed), ['a']);
  assert.equal(parsed['a'], 'B');
});

test('sanitizeArtifact: 壊れた JSON は全体をテキストとして無害化する', () => {
  assert.equal(sanitizeArtifact('{"broken":'), '{"broken":');
  assert.equal(sanitizeArtifact(`{"broken":${ESC}[31m ghp_abc`), '{"broken": ***');
});

test('sanitizeArtifact: JSON の文字列のスカラー', () => {
  assert.equal(sanitizeArtifact('"ghp_abc123"'), '"***"\n');
});

test('sanitizeArtifact: 深い入れ子でも例外を投げず、ESC を含まない', () => {
  const out = sanitizeArtifact('['.repeat(100000) + ']'.repeat(100000));
  assert.equal(typeof out, 'string');
  assert.equal(hasControl(out), false);
});

test('sanitizeArtifact: 約 500 KB の 1 行でも線形の時間で終わる', { timeout: 10000 }, () => {
  const started = Date.now();
  const out = sanitizeArtifact('AUTH_TOKEN=x '.repeat(40000));
  assert.ok(Date.now() - started < 2000);
  assert.equal(out.includes('AUTH_TOKEN=x'), false);
});

test('sanitizeArtifact: ラベルと値が別の項目の秘密は伏せない (spec R4 の限界)', () => {
  const parsed = JSON.parse(sanitizeArtifact('{"name":"AUTH_TOKEN","value":"secret"}')) as {
    value: string;
  };
  assert.equal(parsed.value, 'secret');
});

test('sanitizeArtifact: 出力に ESC と C1 を含まない', () => {
  const out = sanitizeArtifact(`{"a":"x\\u001b[2Jy\\u009bz","b\\u0085":1}`);
  assert.equal(hasControl(out), false);
});
