import { describe, expect, it } from 'vitest';
import { validateSKAMDocument } from '@kanbun-skam/skam';
import { parse } from '../index.js';
import { document, examples } from './fixtures.js';

describe('notation', () => {
  it.each(examples)('validates example %s', (source) => {
    const doc = document(source);
    expect(validateSKAMDocument(doc).valid).toBe(true);
    expect(doc.format).toBe('skam@0.1');
    expect(doc.readings).toEqual([]);
    expect(doc).not.toHaveProperty('lang');
    expect(doc.marks.map((mark) => mark.id)).toEqual(doc.marks.map((_, i) => `m#${i + 1}`));
  });
  it('builds exactly example 1 attachments', () => {
    const doc = document(examples[0]!);
    expect(doc.tokens.map((token) => token.text).join('')).toBe('學而時習之不亦說乎');
    expect(doc.blocks).toEqual([
      { id: 'b#1', tokenIds: Array.from({ length: 9 }, (_, i) => `b#1#${i + 1}`) },
    ]);
    expect(doc.marks.map(({ id: _id, ...mark }) => mark)).toEqual([
      { type: 'yomigana', anchor: { from: 'b#1#1', to: 'b#1#1' }, value: 'まな' },
      { type: 'okurigana', anchor: { from: 'b#1#1', to: 'b#1#1' }, value: 'びて' },
      { type: 'okurigana', anchor: { from: 'b#1#3', to: 'b#1#3' }, value: 'に' },
      { type: 'okurigana', anchor: { from: 'b#1#4', to: 'b#1#4' }, value: 'ふ' },
      { type: 'kaeri', position: { blockId: 'b#1', after: 'b#1#4' }, value: '㆑' },
      { type: 'okurigana', anchor: { from: 'b#1#5', to: 'b#1#5' }, value: 'を' },
      { type: 'kutoten', position: { blockId: 'b#1', after: 'b#1#5' }, value: '。', kind: 'ku' },
      { type: 'kaeri', position: { blockId: 'b#1', after: 'b#1#6' }, value: '㆓' },
      { type: 'okurigana', anchor: { from: 'b#1#7', to: 'b#1#7' }, value: 'た' },
      { type: 'yomigana', anchor: { from: 'b#1#8', to: 'b#1#8' }, value: 'よろこ' },
      { type: 'okurigana', anchor: { from: 'b#1#8', to: 'b#1#8' }, value: 'ばしから' },
      { type: 'kaeri', position: { blockId: 'b#1', after: 'b#1#8' }, value: '㆒' },
      { type: 'kutoten', position: { blockId: 'b#1', after: 'b#1#9' }, value: '。', kind: 'ku' },
    ]);
  });
  it('builds saidoku forms in example 2', () => {
    const doc = document(examples[1]!);
    expect(doc.marks.filter((mark) => mark.type === 'saidoku')).toEqual([
      {
        id: expect.any(String),
        type: 'saidoku',
        anchor: { from: 'b#1#2', to: 'b#1#2' },
        forms: [{ yomi: 'な', okuri: 'ほ' }, { okuri: 'ごとし' }],
      },
    ]);
    expect(doc.marks).toHaveLength(7);
    expect(doc.tokens.map((token) => token.text).join('')).toBe('過猶不及');
    expect(doc.marks.filter((mark) => mark.type === 'okurigana').map((mark) => mark.value)).toEqual(
      ['ぎたるは', 'ざるが', 'ば']
    );
    expect(doc.marks.filter((mark) => mark.type === 'kaeri').map((mark) => mark.value)).toEqual([
      '㆑',
      '㆑',
    ]);
    expect(doc.marks.filter((mark) => mark.type === 'kutoten')).toHaveLength(1);
  });
  it('builds tateten and range reading in example 3', () => {
    const doc = document(examples[2]!);
    expect(doc.marks).toHaveLength(3);
    expect(doc.marks).toEqual(
      expect.arrayContaining([
        { id: expect.any(String), type: 'tateten', anchor: { from: 'b#1#1', to: 'b#1#2' } },
        {
          id: expect.any(String),
          type: 'yomigana',
          anchor: { from: 'b#1#1', to: 'b#1#2' },
          value: 'ゆゑん',
        },
        {
          id: expect.any(String),
          type: 'kaeri',
          position: { blockId: 'b#1', after: 'b#1#1' },
          value: '㆓',
        },
      ])
    );
  });
  it('builds soegana in example 4', () => {
    const doc = document(examples[3]!);
    expect(doc.marks).toHaveLength(4);
    expect(doc.marks).toContainEqual({
      id: expect.any(String),
      type: 'soegana',
      anchor: { from: 'b#1#2', to: 'b#1#2' },
      value: 'を',
    });
  });
  it('builds blocks and linebreak in example 5', () => {
    const doc = document(examples[4]!);
    expect(doc.blocks).toHaveLength(2);
    expect(doc.marks.filter((mark) => mark.type === 'linebreak')).toEqual([
      { id: expect.any(String), type: 'linebreak', position: { blockId: 'b#1', after: 'b#1#5' } },
    ]);
    expect(
      doc.tokens
        .slice(9)
        .map((token) => token.text)
        .join('')
    ).toBe('有朋自遠方來');
    expect(doc.marks).toHaveLength(21);
    expect(
      doc.marks
        .filter((mark) => mark.type === 'okurigana')
        .slice(-3)
        .map((mark) => mark.value)
    ).toEqual(['り', 'り', 'たる']);
    expect(
      doc.marks
        .filter((mark) => mark.type === 'kaeri')
        .slice(-3)
        .map((mark) => mark.value)
    ).toEqual(['㆑', '㆓', '㆒']);
  });
  it('ignores trailing newline and blank lines', () => {
    expect(document('學（まな）びて\n')).toEqual(document('學（まな）びて'));
    expect(document('\n \t　\n學。\n\n\n不。\n')).toEqual(document('學。\n\n不。'));
  });
  it('normalizes CRLF and CR', () => {
    const doc = document('學。\r\n不。');
    expect(doc.tokens.map((token) => token.text)).toEqual(['學', '不']);
    expect(doc.marks.filter((mark) => mark.type === 'kutoten')).toHaveLength(2);
    expect(doc.marks.filter((mark) => mark.type === 'linebreak')).toHaveLength(1);
    const blocks = document('學。\r\r不。');
    expect(blocks.blocks).toHaveLength(2);
    expect(blocks.marks.filter((mark) => mark.type === 'linebreak')).toHaveLength(0);
  });
  it('normalizes repeated kaeri and attachment order', () => {
    const doc = document('習ふ＜一レ＞');
    expect(doc).toEqual(document('習ふ＜一＞＜レ＞'));
    expect(doc).toEqual(document('習＜一レ＞ふ'));
    expect(doc.marks.filter((mark) => mark.type === 'kaeri').map((mark) => mark.value)).toEqual([
      '㆒',
      '㆑',
    ]);
  });
  it.each([
    ['習「レ」ふ', 'RESERVED_SYMBOL'],
    ['習ふ＜レ＞を', 'DUPLICATE_ATTACHMENT'],
    ['之。を', 'ORPHAN_ATTACHMENT'],
    ['をし', 'ORPHAN_ATTACHMENT'],
    ['學（まな', 'UNCLOSED_SYMBOL'],
    ['學＜ア＞', 'INVALID_KAERI'],
    ['｜所ー以', 'UNCLOSED_SYMBOL'],
    ['所ー', 'ORPHAN_ATTACHMENT'],
    ['＜レ＞', 'ORPHAN_ATTACHMENT'],
    ['學＞', 'UNEXPECTED_CLOSE'],
    ['學＜レ>', 'UNCLOSED_SYMBOL'],
    ['學＼', 'UNCLOSED_SYMBOL'],
    ['學＼\n而', 'UNCLOSED_SYMBOL'],
    ['學（）', 'EMPTY_VALUE'],
    ['學＜＞', 'EMPTY_VALUE'],
    ['學＋', 'EMPTY_VALUE'],
    ['學（まな）（まな）', 'DUPLICATE_ATTACHMENT'],
    ['學＋を＋に', 'DUPLICATE_ATTACHMENT'],
    ['未｛ず｝｛ず｝', 'DUPLICATE_ATTACHMENT'],
    ['所。ー以', 'ORPHAN_ATTACHMENT'],
  ])('rejects %s with %s', (source, code) => {
    const result = parse(source);
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('document');
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(code);
  });
  it('escapes reserved symbols and graphemes', () => {
    expect(document('＼「學＼」').tokens.map((token) => token.text)).toEqual(['「', '學', '」']);
    expect(document('葛󠄀＼が👨‍👩‍👧‍👦').tokens.map((token) => token.text)).toEqual(['葛󠄀', 'が', '👨‍👩‍👧‍👦']);
  });
  it('supports ASCII, replacements, kana forms and whitespace', () => {
    expect(document('學(まな)びて')).toEqual(document('學（まな）びて'));
    expect(document('學 [ レ ]', { symbols: { kaeri: [{ open: '[', close: ']' }] } })).toEqual(
      document('學＜レ＞')
    );
    expect(document('學（ ま な ） び て')).toEqual(document('學（まな）びて'));
    expect(document('未｛（よみ）おくり｝').marks[0]).toMatchObject({
      type: 'saidoku',
      forms: [{}, { yomi: 'よみ', okuri: 'おくり' }],
    });
    expect(document('甲ー乙ー丙').marks.filter((mark) => mark.type === 'tateten')).toHaveLength(1);
  });
  it('handles empty input and limits', () => {
    expect(document('').blocks).toEqual([]);
    expect(parse('漢漢', { maxInputLength: 1 })).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'INPUT_TOO_LONG' }],
    });
    expect(document('漢', { maxInputLength: 1 }).tokens).toHaveLength(1);
  });
  it('keeps escaped whitespace and the first grapheme of custom symbols', () => {
    expect(document('學＼ 而').tokens.map((token) => token.text)).toEqual(['學', ' ', '而']);
    expect(
      document('＼甲乙', { symbols: { soegana: ['甲乙'] } }).tokens.map((token) => token.text)
    ).toEqual(['甲', '乙']);
  });
  it('returns a result for arbitrary strings without throwing', () => {
    const alphabet = [
      '漢',
      '𠮷',
      'か',
      '゙',
      '＜',
      '＞',
      '（',
      '）',
      '｛',
      '｝',
      '｜',
      '＋',
      'ー',
      '＼',
      '「',
      '。',
      '\n',
      '\r',
      ' ',
      '\ud800',
    ];
    let seed = 417;
    for (let run = 0; run < 500; run++) {
      let source = '';
      for (let i = 0; i < 24; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        source += alphabet[seed % alphabet.length]!;
      }
      expect(() => parse(source)).not.toThrow();
      const result = parse(source);
      if (result.ok) expect(validateSKAMDocument(result.document).valid).toBe(true);
      else expect(result).not.toHaveProperty('document');
    }
  });
});
