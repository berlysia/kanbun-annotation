/**
 * JSON Schema と validator の一致
 *
 * validator が正で、schema は構造の規則を写す。
 * - validator が通す文書を schema が誤りにしない (偽の誤りを出さない)
 * - 列挙した構造の誤りは schema も誤りにする
 * - schema で表せない誤りは、validator だけが誤りにすることを固定する
 *
 * 一致は、ここに挙げた文書の範囲でしか確かめていない。
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import { describe, it, expect } from 'vitest';
import { validateSKAMDocument } from '@kanbun-skam/skam';
import { extensionRegistry } from '@kanbun-skam/skam/extensions';
import { parse } from '@kanbun-skam/skam-xml-parser';
import { FIXTURES } from '../fixtures/test-documents.js';

// src/__tests__ → integration-tests → packages
const packagesDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const skamDir = resolve(packagesDir, 'skam');
const validFixtureDir = resolve(packagesDir, 'skam-xml-parser/src/__tests__/fixtures/valid');

const readJson = (file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;

const SKAM_ID = 'urn:kanbun-skam:schema:skam-0.1';
const EDU_ID = 'urn:kanbun-skam:schema:ext-edu-1';

function createSchemaValidator(): ValidateFunction {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  ajv.addSchema(readJson(resolve(skamDir, 'schema/ext-edu.schema.json')));
  return ajv.compile(readJson(resolve(skamDir, 'schema/skam.schema.json')));
}

type Doc = Record<string, unknown>;

/** 最小の正しい文書。mark は個々のテストが足す */
function doc(overrides: Doc = {}): Doc {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '學' },
      { id: 't2', text: '而' },
      { id: 't3', text: '時' },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
    marks: [],
    readings: [],
    ...overrides,
  };
}

const anchor = { from: 't1', to: 't2' };
const position = { blockId: 'b1', after: 't1' };
const declared = { extensions: ['edu'], extensionsRequired: ['edu'] };

/** mark を 1 つ持つ文書 */
function withMark(mark: Doc, overrides: Doc = {}): Doc {
  return doc({ marks: [mark], ...overrides });
}

/** 14 種の mark をすべて含む文書。位置が衝突しないよう分ける */
function allMarksDoc(): Doc {
  return doc({
    tokens: [
      { id: 't1', text: '學' },
      { id: 't2', text: '而' },
      { id: 't3', text: '時' },
      { id: 't4', text: '再' },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4'] }],
    marks: [
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆑' },
      { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ニ' },
      { type: 'yomigana', anchor: { from: 't2', to: 't2' }, value: 'じ' },
      { type: 'okimoji', anchor: { from: 't3', to: 't3' } },
      { type: 'joji', anchor: { from: 't1', to: 't1' } },
      { type: 'soegana', anchor: { from: 't2', to: 't2' }, value: 'を' },
      { type: 'kutoten', position: { blockId: 'b1', after: 't3' }, value: '。', kind: 'ku' },
      { type: 'emphasis', anchor: { from: 't1', to: 't3' }, style: 'open circle' },
      { type: 'saidoku', anchor: { from: 't4', to: 't4' }, forms: [{ n: 1, yomi: 'ひ' }, {}] },
      {
        type: 'okototen',
        anchor: { from: 't1', to: 't1' },
        position: { system: 'glyph-grid', grid: '3x3', x: 0, y: 1 },
        shape: 'dot',
      },
      { type: 'tateten', anchor: { from: 't3', to: 't3' } },
      { type: 'highlight', anchor: { from: 't1', to: 't2' }, style: 'wavy', ref: 'r1' },
      { type: 'ref', position: { blockId: 'b1', after: 't2' }, label: 'a', id: 'r1' },
      { type: 'linebreak', position: { blockId: 'b1', after: 't2' } },
    ],
  });
}

/** JSON.parse で作る (`__proto__` を own のキーにするため) */
function parseJson(text: string): Doc {
  return JSON.parse(text) as Doc;
}

function nested(depth: number): Doc {
  let value: Doc = {};
  for (let i = 1; i < depth; i++) value = { a: value };
  return value;
}

const keys = (count: number): Doc =>
  Object.fromEntries(Array.from({ length: count }, (_, i) => [`k${i}`, i]));

const validatorOk = (input: unknown): boolean => validateSKAMDocument(input).valid;

describe('JSON Schema: 検証器への登録', () => {
  it('2 つの schema が Ajv2020 (strict) で compile でき、$id が決めた値', () => {
    expect(readJson(resolve(skamDir, 'schema/skam.schema.json'))['$id']).toBe(SKAM_ID);
    expect(readJson(resolve(skamDir, 'schema/ext-edu.schema.json'))['$id']).toBe(EDU_ID);
    expect(() => createSchemaValidator()).not.toThrow();
  });
});

describe('JSON Schema: validator が通す文書を通す', () => {
  const validate = createSchemaValidator();

  const accepted: [string, Doc][] = [
    ['最小の文書', doc()],
    ['14 種の mark すべて', allMarksDoc()],
    [
      'derivations (readingOrder と他の kind)',
      doc({
        derivations: [
          { kind: 'readingOrder', method: 'auto', result: ['t1', 't2'] },
          { kind: 'other', method: 'manual' },
        ],
      }),
    ],
    ['lang zh-Hant', doc({ lang: 'zh-Hant' })],
    [
      'edu の印を持つ宣言のある文書',
      withMark(
        { type: 'okimoji', anchor: { from: 't1', to: 't1' }, ext: { edu: { quiz: 'q1' } } },
        declared
      ),
    ],
    [
      '宣言があり、edu の無い注記の ext と custom',
      withMark(
        {
          type: 'okimoji',
          anchor: { from: 't1', to: 't1' },
          ext: { other: 1 },
          custom: { a: [1] },
        },
        { extensions: ['edu', 'other'], extensionsRequired: [], ext: { other: 1 } }
      ),
    ],
    [
      'mark の未知のフィールド',
      withMark({ type: 'okimoji', anchor: { from: 't1', to: 't1' }, futureField: { x: 1 } }),
    ],
    ['未知の最上位キー', doc({ futureTopLevel: [1, 2] })],
    [
      'placementHint',
      withMark({ type: 'okimoji', anchor: { from: 't1', to: 't1' }, placementHint: 'left' }),
    ],
    [
      'token の未知のフィールド',
      doc({
        tokens: [{ id: 't1', text: '學', futureField: 1 }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      }),
    ],
    [
      '宣言の無い文書の mark.ext.edu が文字列 (警告で通る)',
      withMark({ type: 'okimoji', anchor: { from: 't1', to: 't1' }, ext: { edu: 'x' } }),
    ],
    [
      '宣言の無い文書の mark.ext.edu が {}',
      withMark({ type: 'okimoji', anchor: { from: 't1', to: 't1' }, ext: { edu: {} } }),
    ],
    [
      '宣言の無い文書の emphasis の ext.edu',
      withMark({ type: 'emphasis', anchor: { from: 't1', to: 't1' }, ext: { edu: { quiz: 'q' } } }),
    ],
    [
      'emphasis.style がサロゲート対の 1 字',
      withMark({ type: 'emphasis', anchor: { from: 't1', to: 't1' }, style: '\u{20BB7}' }),
    ],
    [
      'emphasis.style のキーワード',
      withMark({ type: 'emphasis', anchor: { from: 't1', to: 't1' }, style: 'filled sesame' }),
    ],
    ['emphasis の style 無し', withMark({ type: 'emphasis', anchor: { from: 't1', to: 't1' } })],
    ['custom のキー 1000 個', doc({ custom: keys(1000) })],
    ['custom の配列の長さ 10000', doc({ custom: { a: Array.from({ length: 10000 }, () => 0) } })],
    ['reading', doc({ readings: [{ kind: 'kundoku', text: '學んで' }] })],
    ['ref に content だけ', withMark({ type: 'ref', position, content: 'note' })],
    ['ref に format', withMark({ type: 'ref', position, format: 'numeric-paren' })],
    [
      'ブロック先頭の ref (position の after 無し)',
      withMark({ type: 'ref', position: { blockId: 'b1' }, label: 'a' }),
    ],
  ];

  for (const [name, input] of accepted) {
    it(`${name}: validator も schema も通す`, () => {
      expect(validateSKAMDocument(input).valid, 'validator').toBe(true);
      expect(validate(input), JSON.stringify(validate.errors)).toBe(true);
    });
  }

  it('宣言の無い文書の mark.ext.edu の例は、validator が警告を出して通す', () => {
    const result = validateSKAMDocument(
      withMark({ type: 'okimoji', anchor: { from: 't1', to: 't1' }, ext: { edu: 'x' } })
    );
    expect(result.valid).toBe(true);
    expect('warnings' in result && result.warnings?.length).toBeGreaterThan(0);
  });

  it('parser の fixture (valid/) の全ファイル', () => {
    const files = readdirSync(validFixtureDir).filter((f) => f.endsWith('.xml'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const parsed = parse(readFileSync(resolve(validFixtureDir, file), 'utf8'));
      expect(validatorOk(parsed), `validator ${file}`).toBe(true);
      expect(validate(parsed), `${file}: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
  });

  it('integration-tests の FIXTURES の全件', () => {
    const entries = Object.entries(FIXTURES);
    expect(entries.length).toBeGreaterThan(0);
    for (const [name, fixture] of entries) {
      expect(validatorOk(fixture), `validator ${name}`).toBe(true);
      expect(validate(fixture), `${name}: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
  });
});

describe('JSON Schema: 構造の誤りは validator も schema も誤りにする', () => {
  const validate = createSchemaValidator();
  const okimoji = { type: 'okimoji', anchor: { from: 't1', to: 't1' } };
  const { format: _format, ...withoutFormat } = doc();
  const { tokens: _tokens, ...withoutTokens } = doc();
  const { blocks: _blocks, ...withoutBlocks } = doc();
  const { marks: _marks, ...withoutMarks } = doc();
  const { readings: _readings, ...withoutReadings } = doc();

  const rejected: [string, unknown][] = [
    ['format が違う', doc({ format: 'skam@0.2' })],
    ['format が無い', withoutFormat],
    ['tokens が無い', withoutTokens],
    ['blocks が無い', withoutBlocks],
    ['marks が無い', withoutMarks],
    ['readings が無い', withoutReadings],
    ['tokens が配列でない', doc({ tokens: {} })],
    [
      'token の text が空',
      doc({ tokens: [{ id: 't1', text: '' }], blocks: [{ id: 'b1', tokenIds: ['t1'] }] }),
    ],
    ['lang が属性を壊す形', doc({ lang: 'ja"><b' })],
    ['lang が数値', doc({ lang: 1 })],
    ['未知の mark type', withMark({ type: 'futureMark', anchor })],
    ['kaeri に anchor', withMark({ type: 'kaeri', position, anchor, value: '㆑' })],
    ['kaeri に position が無い', withMark({ type: 'kaeri', value: '㆑' })],
    [
      'okurigana に anchor が無い (position だけ)',
      withMark({ type: 'okurigana', position, value: 'ニ' }),
    ],
    ['kaeri.value が a', withMark({ type: 'kaeri', position, value: 'a' })],
    ['kutoten.kind が x', withMark({ type: 'kutoten', position, value: '。', kind: 'x' })],
    ['emphasis.style が <', withMark({ type: 'emphasis', anchor, style: '<' })],
    ['emphasis.style が 2 字', withMark({ type: 'emphasis', anchor, style: 'ab' })],
    ['saidoku.forms が空', withMark({ type: 'saidoku', anchor, forms: [] })],
    ['saidoku.forms の n が文字列', withMark({ type: 'saidoku', anchor, forms: [{ n: '1' }] })],
    [
      'okototen.position.grid が 3',
      withMark({
        type: 'okototen',
        anchor,
        position: { system: 'glyph-grid', grid: '3', x: 0, y: 0 },
        shape: 'dot',
      }),
    ],
    [
      'okototen.position.grid が全角',
      withMark({
        type: 'okototen',
        anchor,
        position: { system: 'glyph-grid', grid: '３x3', x: 0, y: 0 },
        shape: 'dot',
      }),
    ],
    ['highlight.style が x', withMark({ type: 'highlight', anchor, style: 'x' })],
    [
      'ref に label と format の両方',
      withMark({ type: 'ref', position, label: 'a', format: 'alpha-upper' }),
    ],
    ['ref に label も format も content も無い', withMark({ type: 'ref', position })],
    ['reading の kind が x', doc({ readings: [{ kind: 'x', text: 'a' }] })],
    [
      'readingOrder の derivation に result が無い',
      doc({ derivations: [{ kind: 'readingOrder', method: 'auto' }] }),
    ],
    ['extensions の名前が XML', doc({ extensions: ['XML'] })],
    ['extensions の名前が xml で始まる', doc({ extensions: ['xmlfoo'] })],
    ['extensionsRequired があり extensions が無い', doc({ extensionsRequired: ['edu'] })],
    ['tokens があり blocks が空', doc({ blocks: [] })],
    [
      '宣言のある文書で ext.edu に quiz が無い',
      withMark({ ...okimoji, ext: { edu: {} } }, declared),
    ],
    [
      '宣言のある文書で quiz が 65 字',
      withMark({ ...okimoji, ext: { edu: { quiz: 'a'.repeat(65) } } }, declared),
    ],
    [
      '宣言のある文書で quiz に制御文字 U+0007',
      withMark({ ...okimoji, ext: { edu: { quiz: 'a\u0007b' } } }, declared),
    ],
    [
      '宣言のある文書で ext.edu に quiz 以外のキー',
      withMark({ ...okimoji, ext: { edu: { quiz: 'q', other: 1 } } }, declared),
    ],
    ['宣言のある文書で ext.edu が文字列', withMark({ ...okimoji, ext: { edu: 'x' } }, declared)],
    [
      '宣言のある文書で emphasis の ext.edu',
      withMark({ type: 'emphasis', anchor, ext: { edu: { quiz: 'q' } } }, declared),
    ],
    [
      '宣言のある文書で token の ext.edu',
      doc({
        ...declared,
        tokens: [{ id: 't1', text: '學', ext: { edu: { quiz: 'q' } } }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      }),
    ],
    ['宣言のある文書で文書の ext.edu', doc({ ...declared, ext: { edu: { quiz: 'q' } } })],
    ['custom に __proto__', doc({ custom: parseJson('{"__proto__": {"x": 1}}') })],
    ['custom の入れ子の中に constructor', doc({ custom: { a: { constructor: 1 } } })],
    ['custom の配列の中に prototype', doc({ custom: { a: [{ prototype: 1 }] } })],
    ['custom のキー 1001 個', doc({ custom: keys(1001) })],
    ['custom の配列の長さ 10001', doc({ custom: { a: Array.from({ length: 10001 }, () => 0) } })],
    ['宣言の無い文書の ext に __proto__', doc({ ext: parseJson('{"__proto__": 1}') })],
    ['ext が配列', doc({ ext: [] })],
    ['mark の ext が文字列', withMark({ ...okimoji, ext: 'x' })],
    ['custom が文字列', doc({ custom: 'x' })],
  ];

  for (const [name, input] of rejected) {
    it(`${name}: validator も schema も誤りにする`, () => {
      expect(validatorOk(input), 'validator').toBe(false);
      expect(validate(input), 'schema').toBe(false);
    });
  }
});

describe('JSON Schema: schema で表せない誤りは validator だけが誤りにする', () => {
  const validate = createSchemaValidator();
  const okimoji = { type: 'okimoji', anchor: { from: 't1', to: 't1' } };

  const onlyValidator: [string, Doc][] = [
    [
      'id の重複',
      doc({
        tokens: [
          { id: 't1', text: '學' },
          { id: 't1', text: '而' },
        ],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      }),
    ],
    [
      '存在しない token への anchor',
      withMark({ type: 'okimoji', anchor: { from: 'zz', to: 'zz' } }),
    ],
    ['ブロック先頭の linebreak', withMark({ type: 'linebreak', position: { blockId: 'b1' } })],
    ['ブロック先頭の kaeri', withMark({ type: 'kaeri', position: { blockId: 'b1' }, value: '㆑' })],
    [
      '宣言の無い名前の ext のキー',
      withMark(
        { ...okimoji, ext: { other: 1 } },
        { extensions: ['edu'], extensionsRequired: ['edu'] }
      ),
    ],
    ['入れ子 33 段', doc({ custom: nested(33) })],
    [
      'extensionsRequired が extensions の部分集合でない',
      doc({ extensions: [], extensionsRequired: ['edu'] }),
    ],
    [
      '必須の拡張の挙げ忘れ',
      withMark({ ...okimoji, ext: { edu: { quiz: 'q' } } }, { extensions: ['edu'] }),
    ],
    [
      'okototen の x が grid の外',
      withMark({
        type: 'okototen',
        anchor,
        position: { system: 'glyph-grid', grid: '3x3', x: 3, y: 0 },
        shape: 'dot',
      }),
    ],
  ];

  for (const [name, input] of onlyValidator) {
    it(`${name}: validator は誤り、schema は通す`, () => {
      expect(validatorOk(input), 'validator').toBe(false);
      expect(validate(input), JSON.stringify(validate.errors)).toBe(true);
    });
  }
});

describe('JSON Schema: 拡張の登録簿との一致', () => {
  const skam = readJson(resolve(skamDir, 'schema/skam.schema.json'));
  const pkg = readJson(resolve(skamDir, 'package.json')) as {
    exports: Record<string, unknown>;
    files: string[];
  };

  it('登録簿に名前がある', () => {
    expect(extensionRegistry.length).toBeGreaterThan(0);
  });

  for (const { name } of extensionRegistry) {
    it(`${name}: schema のファイル、$id、$ref、exports が揃う`, () => {
      const file = `schema/ext-${name}.schema.json`;
      const schema = readJson(resolve(skamDir, file));
      const id = `urn:kanbun-skam:schema:ext-${name}-1`;
      expect(schema['$id']).toBe(id);
      expect(JSON.stringify(skam)).toContain(`"$ref":"${id}"`);
      expect(pkg.exports[`./${file}`]).toBe(`./${file}`);
    });
  }

  it('skam.schema.json も exports に載り、files に schema がある', () => {
    expect(pkg.exports['./schema/skam.schema.json']).toBe('./schema/skam.schema.json');
    expect(pkg.files).toContain('schema');
  });
});
