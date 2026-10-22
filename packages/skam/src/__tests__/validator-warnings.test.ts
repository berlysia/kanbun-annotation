import { describe, it, expect } from 'vitest';
import { validateSKAMDocument } from '../validator.js';
import {
  KAERI_MULTI_CHARACTER,
  ID_FORM,
  XML_UNWRITABLE_CHAR,
  SAIDOKU_READING_OVERLAP,
  SAIDOKU_MULTI_TOKEN,
} from '../errors.js';
import type { SKAMDocument, Mark } from '../index.js';

function docWithMarks(marks: Mark[]): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '学' },
      { id: 't2', text: '而' },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
    marks,
    readings: [],
  };
}

const position = { blockId: 'b1', after: 't2' };

describe('validateSKAMDocument warnings (kaeri)', () => {
  it('複数の字の kaeri は valid: true のまま警告を 1 件返す', () => {
    const result = validateSKAMDocument(
      docWithMarks([{ type: 'kaeri', id: 'm1', position, value: '㆒㆑' }])
    );
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.warnings).toHaveLength(1);
    const warning = result.warnings![0]!;
    expect(warning.kind).toBe('KAERI_MULTI_CHARACTER');
    expect(warning.kind).toBe(KAERI_MULTI_CHARACTER);
    expect(warning.path).toBe('marks[0].value');
    expect(warning.message).toContain('0.4.0');
    expect(warning.message).toContain('splitMultiCharacterKaeri');
    // 入力由来の値を message に埋め込まない
    expect(warning.message).not.toContain('㆒');
  });

  it('警告の path は marks[] の添字を使う', () => {
    const result = validateSKAMDocument(
      docWithMarks([
        { type: 'kutoten', id: 'm0', position, value: 'comma' } as Mark,
        { type: 'kaeri', id: 'm1', position, value: '㆒㆑' },
      ])
    );
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.warnings?.[0]?.path).toBe('marks[1].value');
  });

  it('同じ位置の 1 字ずつの kaeri は警告なし (warnings のキーが無い)', () => {
    const result = validateSKAMDocument(
      docWithMarks([
        { type: 'kaeri', id: 'm1', position, value: '㆒' },
        { type: 'kaeri', id: 'm2', position, value: '㆑' },
      ])
    );
    expect(result.valid).toBe(true);
    expect(result).not.toHaveProperty('warnings');
  });

  it('1 字の kaeri は warnings のキーが無い', () => {
    const result = validateSKAMDocument(
      docWithMarks([{ type: 'kaeri', id: 'm1', position, value: '㆒' }])
    );
    expect(result.valid).toBe(true);
    expect(result).not.toHaveProperty('warnings');
  });

  it('Kanbun の字でない kaeri は今と同じ INVALID_VALUE', () => {
    const result = validateSKAMDocument(
      docWithMarks([{ type: 'kaeri', id: 'm1', position, value: '一' }])
    );
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors[0]?.kind).toBe('INVALID_VALUE');
    expect(result).not.toHaveProperty('warnings');
  });
});

/** 自動の id の 1 ブロック 3 字の文書 */
function autoDoc(marks: Mark[]): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 'b#1#1', text: '學' },
      { id: 'b#1#2', text: '而' },
      { id: 'b#1#3', text: '時' },
    ],
    blocks: [{ id: 'b#1', tokenIds: ['b#1#1', 'b#1#2', 'b#1#3'] }],
    marks,
    readings: [],
  };
}

function warningsOf(doc: unknown, kind: string): { path: string; message: string }[] {
  const result = validateSKAMDocument(doc);
  expect(result.valid).toBe(true);
  if (!result.valid) return [];
  return (result.warnings ?? []).filter((w) => w.kind === kind);
}

describe('validateSKAMDocument warnings (ID_FORM)', () => {
  it('位置の値に合う自動の id は警告なし', () => {
    const result = validateSKAMDocument(autoDoc([]));
    expect(result.valid).toBe(true);
    expect(result).not.toHaveProperty('warnings');
  });

  it('字の id が NCName でない (1a) と ID_FORM、valid: true のまま', () => {
    const d = autoDoc([]);
    d.tokens[0]!.id = '1a';
    d.blocks[0]!.tokenIds[0] = '1a';
    const found = warningsOf(d, ID_FORM);
    expect(found.map((w) => w.path)).toEqual(['tokens[0].id']);
    expect(found[0]!.message).not.toContain('1a');
  });

  it('1 番目の字の id が b#1#2 だと ID_FORM', () => {
    const d = autoDoc([]);
    d.tokens[0]!.id = 'b#1#2';
    d.tokens[1]!.id = 'b#1#1';
    d.blocks[0]!.tokenIds = ['b#1#2', 'b#1#1', 'b#1#3'];
    expect(warningsOf(d, ID_FORM).map((w) => w.path)).toEqual(['tokens[0].id', 'tokens[1].id']);
  });

  it('2 番目のブロックの id が b#1 だと ID_FORM', () => {
    const d: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 'b#1#1', text: '學' },
        { id: 'b#1#2', text: '而' },
      ],
      blocks: [
        { id: 'b#2', tokenIds: ['b#1#1'] },
        { id: 'b#1', tokenIds: ['b#1#2'] },
      ],
      marks: [],
      readings: [],
    };
    // b#2 は 1 番目のブロック、b#1 は 2 番目のブロックなので、両方当たる。字の id も当たる
    expect(warningsOf(d, ID_FORM).map((w) => w.path)).toContain('blocks[1].id');
  });

  it('注記の id は m#3 なら警告なし、m#0 と m#01 は ID_FORM', () => {
    const mk = (id: string): Mark => ({
      type: 'tateten',
      id,
      anchor: { from: 'b#1#1', to: 'b#1#2' },
    });
    expect(warningsOf(autoDoc([mk('m#3')]), ID_FORM)).toEqual([]);
    expect(warningsOf(autoDoc([mk('m#0')]), ID_FORM).map((w) => w.path)).toEqual(['marks[0].id']);
    expect(warningsOf(autoDoc([mk('m#01')]), ID_FORM).map((w) => w.path)).toEqual(['marks[0].id']);
  });

  const highlight = (ref: string): Mark => ({
    type: 'highlight',
    id: 'h1',
    anchor: { from: 'b#1#1', to: 'b#1#2' },
    ref,
  });
  const refAfter = (id: string, after: string): Mark => ({
    type: 'ref',
    id,
    position: { blockId: 'b#1', after },
    label: 'a',
  });

  it('手書きの id の ref を指す highlight.ref は警告なし (範囲の外でもよい)', () => {
    expect(warningsOf(autoDoc([highlight('ref-1'), refAfter('ref-1', 'b#1#3')]), ID_FORM)).toEqual(
      []
    );
  });

  it('自動の id の ref を指す highlight.ref は ID_FORM', () => {
    const found = warningsOf(autoDoc([highlight('m#2'), refAfter('m#2', 'b#1#1')]), ID_FORM);
    expect(found.map((w) => w.path)).toEqual(['marks[0].ref']);
  });

  it('空文字の highlight.ref は ID_FORM', () => {
    const found = warningsOf(autoDoc([highlight('')]), ID_FORM);
    expect(found.map((w) => w.path)).toEqual(['marks[0].ref']);
  });

  it('同じ anchor の yomigana y1 と okurigana o1 は okurigana の id が ID_FORM', () => {
    const kana = (type: 'yomigana' | 'okurigana', id: string): Mark => ({
      type,
      id,
      anchor: { from: 'b#1#1', to: 'b#1#1' },
      value: 'あ',
    });
    const found = warningsOf(autoDoc([kana('yomigana', 'y1'), kana('okurigana', 'o1')]), ID_FORM);
    expect(found.map((w) => w.path)).toEqual(['marks[1].id']);
  });

  it('同じ anchor の okurigana o1 と soegana s1 (yomigana なし) は soegana の id が ID_FORM', () => {
    const kana = (type: 'soegana' | 'okurigana', id: string): Mark => ({
      type,
      id,
      anchor: { from: 'b#1#1', to: 'b#1#1' },
      value: 'あ',
    });
    const found = warningsOf(autoDoc([kana('okurigana', 'o1'), kana('soegana', 's1')]), ID_FORM);
    expect(found.map((w) => w.path)).toEqual(['marks[1].id']);
  });
});

describe('validateSKAMDocument warnings (XML_UNWRITABLE_CHAR)', () => {
  it('字の text の U+0001 は XML_UNWRITABLE_CHAR', () => {
    const d = autoDoc([]);
    d.tokens[0]!.text = 'a\u0001';
    const found = warningsOf(d, XML_UNWRITABLE_CHAR);
    expect(found.map((w) => w.path)).toEqual(['tokens[0].text']);
    expect(found[0]!.message).not.toContain('\u0001');
  });

  it('reading の text、yomigana の value、placementHint の U+FFFE / U+FFFF / 対の無いサロゲート', () => {
    const d = autoDoc([
      {
        type: 'yomigana',
        id: 'y1',
        anchor: { from: 'b#1#1', to: 'b#1#1' },
        value: 'a' + String.fromCharCode(0xffff),
        placementHint: 'x\uD800',
      },
    ]);
    d.readings = [{ kind: 'kakikudashi', text: 'a' + String.fromCharCode(0xfffe) }];
    const paths = warningsOf(d, XML_UNWRITABLE_CHAR).map((w) => w.path);
    expect(paths).toEqual(
      expect.arrayContaining(['readings[0].text', 'marks[0].value', 'marks[0].placementHint'])
    );
    expect(paths).toHaveLength(3);
  });

  it('1 つの欄につき 1 件', () => {
    const d = autoDoc([]);
    d.tokens[0]!.text = '\u0001\u0002';
    expect(warningsOf(d, XML_UNWRITABLE_CHAR)).toHaveLength(1);
  });

  it('対の無い下位サロゲートも当たる', () => {
    const d = autoDoc([]);
    d.tokens[0]!.text = '\uDC00';
    expect(warningsOf(d, XML_UNWRITABLE_CHAR)).toHaveLength(1);
  });

  it('対のサロゲート、タブ、改行は当たらない', () => {
    for (const text of ['𠀀', '\t', '\n']) {
      const d = autoDoc([]);
      d.tokens[0]!.text = text;
      expect(warningsOf(d, XML_UNWRITABLE_CHAR)).toEqual([]);
    }
  });

  it('saidoku の語形の文字列にも当たる', () => {
    const d = autoDoc([
      {
        type: 'saidoku',
        id: 's1',
        anchor: { from: 'b#1#1', to: 'b#1#1' },
        forms: [{ yomi: 'ま\u0001' }],
      },
    ]);
    expect(warningsOf(d, XML_UNWRITABLE_CHAR).map((w) => w.path)).toEqual([
      'marks[0].forms[0].yomi',
    ]);
  });

  it('custom の中は対象にしない', () => {
    const d = autoDoc([
      {
        type: 'tateten',
        id: 'x1',
        anchor: { from: 'b#1#1', to: 'b#1#2' },
        custom: { note: '\u0001' },
      },
    ]);
    const result = validateSKAMDocument(d);
    expect(result.valid).toBe(true);
    expect(result).not.toHaveProperty('warnings');
  });
});

describe('validateSKAMDocument warnings (saidoku)', () => {
  const t1 = 'b#1#1';
  const t2 = 'b#1#2';
  const t3 = 'b#1#3';
  const yomigana = (id: string, from: string, to: string): Mark => ({
    type: 'yomigana',
    id,
    anchor: { from, to },
    value: 'あ',
  });
  const okurigana = (id: string, from: string, to: string): Mark => ({
    type: 'okurigana',
    id,
    anchor: { from, to },
    value: 'て',
  });
  const soegana = (id: string, from: string, to: string): Mark => ({
    type: 'soegana',
    id,
    anchor: { from, to },
    value: 'て',
  });
  const okimoji = (id: string, from: string, to: string): Mark => ({
    type: 'okimoji',
    id,
    anchor: { from, to },
  });
  const saidoku = (id: string, from: string, to: string): Mark => ({
    type: 'saidoku',
    id,
    anchor: { from, to },
    forms: [{ yomi: 'ま' }],
  });
  const kinds = (doc: unknown): { kind: string; path: string }[] => {
    const result = validateSKAMDocument(doc);
    expect(result.valid).toBe(true);
    if (!result.valid) return [];
    return (result.warnings ?? []).map((w) => ({ kind: w.kind, path: w.path }));
  };

  it('yomigana t1-t2 と saidoku t2 は SAIDOKU_READING_OVERLAP (marks[0])、valid: true', () => {
    expect(kinds(autoDoc([yomigana('y1', t1, t2), saidoku('s1', t2, t2)]))).toEqual([
      { kind: SAIDOKU_READING_OVERLAP, path: 'marks[0]' },
    ]);
  });

  it('okurigana t1-t2 と saidoku t2 は SAIDOKU_READING_OVERLAP', () => {
    expect(kinds(autoDoc([saidoku('s1', t2, t2), okurigana('o1', t1, t2)]))).toEqual([
      { kind: SAIDOKU_READING_OVERLAP, path: 'marks[1]' },
    ]);
  });

  it('yomigana t3 と saidoku t2-t3 は OVERLAP と MULTI_TOKEN', () => {
    const found = kinds(autoDoc([yomigana('y1', t3, t3), saidoku('s1', t2, t3)]));
    expect(found).toHaveLength(2);
    expect(found).toContainEqual({ kind: SAIDOKU_READING_OVERLAP, path: 'marks[0]' });
    expect(found).toContainEqual({ kind: SAIDOKU_MULTI_TOKEN, path: 'marks[1]' });
  });

  it('yomigana t1-t2 と saidoku t2-t3 は両方の警告', () => {
    const found = kinds(autoDoc([yomigana('y1', t1, t2), saidoku('s1', t2, t3)]));
    expect(found.map((w) => w.kind).sort()).toEqual(
      [SAIDOKU_MULTI_TOKEN, SAIDOKU_READING_OVERLAP].sort()
    );
  });

  it('警告の message に入力の値を入れない', () => {
    const result = validateSKAMDocument(autoDoc([yomigana('y1', t1, t2), saidoku('s1', t2, t2)]));
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.warnings?.[0]?.message).toContain('0.4.0');
    expect(result.warnings?.[0]?.message).not.toContain('b#1');
  });

  it('yomigana t2 と saidoku t2 (anchor が同じ) は今の MARK_CONFLICT の誤りだけ', () => {
    const result = validateSKAMDocument(autoDoc([yomigana('y1', t2, t2), saidoku('s1', t2, t2)]));
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors.map((e) => e.kind)).toEqual(['MARK_CONFLICT']);
    expect(result).not.toHaveProperty('warnings');
  });

  it('soegana t1-t2 と saidoku t2 は警告なし', () => {
    const result = validateSKAMDocument(autoDoc([soegana('e1', t1, t2), saidoku('s1', t2, t2)]));
    expect(result.valid).toBe(true);
    expect(result).not.toHaveProperty('warnings');
  });

  it('okimoji t1-t2 と yomigana t1-t3 は警告なし', () => {
    const result = validateSKAMDocument(autoDoc([okimoji('k1', t1, t2), yomigana('y1', t1, t3)]));
    expect(result.valid).toBe(true);
    expect(result).not.toHaveProperty('warnings');
  });

  it('yomigana と離れた saidoku は警告なし', () => {
    const result = validateSKAMDocument(autoDoc([yomigana('y1', t1, t2), saidoku('s1', t3, t3)]));
    expect(result.valid).toBe(true);
    expect(result).not.toHaveProperty('warnings');
  });
});
