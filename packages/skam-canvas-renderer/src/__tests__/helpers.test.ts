import { describe, it } from 'vitest';
import { expect } from 'vitest';
import type { Token, Mark, RefMark } from '@kanbun/skam';
import {
  convertKaeriToUnicode,
  resolveEmphasisCharacter,
  formatRefIndex,
  resolveRefValues,
} from '@kanbun/skam/rendering';
import { splitKaeriForTateten } from '../helpers.js';

describe('convertKaeriToUnicode', () => {
  it('converts single kaeri characters', () => {
    expect(convertKaeriToUnicode('レ')).toBe('\u3191');
    expect(convertKaeriToUnicode('一')).toBe('\u3192');
    expect(convertKaeriToUnicode('二')).toBe('\u3193');
    expect(convertKaeriToUnicode('三')).toBe('\u3194');
    expect(convertKaeriToUnicode('上')).toBe('\u3196');
    expect(convertKaeriToUnicode('中')).toBe('\u3197');
    expect(convertKaeriToUnicode('下')).toBe('\u3198');
    expect(convertKaeriToUnicode('甲')).toBe('\u3199');
    expect(convertKaeriToUnicode('乙')).toBe('\u319A');
  });

  it('converts compound kaeri (e.g. 一レ)', () => {
    expect(convertKaeriToUnicode('一レ')).toBe('\u3192\u3191');
    expect(convertKaeriToUnicode('上レ')).toBe('\u3196\u3191');
  });

  it('passes through unknown characters', () => {
    expect(convertKaeriToUnicode('X')).toBe('X');
  });

  it('handles empty string', () => {
    expect(convertKaeriToUnicode('')).toBe('');
  });
});

describe('resolveEmphasisCharacter', () => {
  it('returns filled dot for undefined style', () => {
    expect(resolveEmphasisCharacter(undefined)).toBe('\u2022');
  });

  it('returns filled dot for "dot"', () => {
    expect(resolveEmphasisCharacter('dot')).toBe('\u2022');
  });

  it('returns open dot for "open dot"', () => {
    expect(resolveEmphasisCharacter('open dot')).toBe('\u25E6');
  });

  it('returns filled sesame for "sesame"', () => {
    expect(resolveEmphasisCharacter('sesame')).toBe('\uFE45');
  });

  it('returns open sesame for "open sesame"', () => {
    expect(resolveEmphasisCharacter('open sesame')).toBe('\uFE46');
  });

  it('returns filled circle for "circle"', () => {
    expect(resolveEmphasisCharacter('circle')).toBe('\u25CF');
  });

  it('returns open circle for "open circle"', () => {
    expect(resolveEmphasisCharacter('open circle')).toBe('\u25CB');
  });

  it('returns filled triangle for "triangle"', () => {
    expect(resolveEmphasisCharacter('triangle')).toBe('\u25B2');
  });

  it('returns open triangle for "open triangle"', () => {
    expect(resolveEmphasisCharacter('open triangle')).toBe('\u25B3');
  });

  it('returns filled double-circle for "double-circle"', () => {
    expect(resolveEmphasisCharacter('double-circle')).toBe('\u25C9');
  });

  it('returns open double-circle for "open double-circle"', () => {
    expect(resolveEmphasisCharacter('open double-circle')).toBe('\u25CE');
  });

  it('returns filled dot for "filled dot"', () => {
    expect(resolveEmphasisCharacter('filled dot')).toBe('\u2022');
  });

  it('returns filled sesame for "filled sesame"', () => {
    expect(resolveEmphasisCharacter('filled sesame')).toBe('\uFE45');
  });
});

describe('splitKaeriForTateten', () => {
  it('splits レ into re component', () => {
    const result = splitKaeriForTateten('レ');
    expect(result.re).toBe('\u3191');
    expect(result.nonRe).toBe('');
  });

  it('splits 一レ into re and nonRe', () => {
    const result = splitKaeriForTateten('一レ');
    expect(result.re).toBe('\u3191');
    expect(result.nonRe).toBe('\u3192');
  });

  it('splits 上 into nonRe only', () => {
    const result = splitKaeriForTateten('上');
    expect(result.re).toBe('');
    expect(result.nonRe).toBe('\u3196');
  });

  it('splits 上レ into both components', () => {
    const result = splitKaeriForTateten('上レ');
    expect(result.re).toBe('\u3191');
    expect(result.nonRe).toBe('\u3196');
  });

  it('handles 二 (nonRe only)', () => {
    const result = splitKaeriForTateten('二');
    expect(result.re).toBe('');
    expect(result.nonRe).toBe('\u3193');
  });
});

describe('formatRefIndex', () => {
  it('formats alpha-upper', () => {
    expect(formatRefIndex(0, 'alpha-upper')).toBe('(A)');
    expect(formatRefIndex(1, 'alpha-upper')).toBe('(B)');
    expect(formatRefIndex(25, 'alpha-upper')).toBe('(Z)');
  });

  it('formats alpha-lower', () => {
    expect(formatRefIndex(0, 'alpha-lower')).toBe('(a)');
    expect(formatRefIndex(1, 'alpha-lower')).toBe('(b)');
  });

  it('formats numeric-paren', () => {
    expect(formatRefIndex(0, 'numeric-paren')).toBe('(1)');
    expect(formatRefIndex(4, 'numeric-paren')).toBe('(5)');
  });

  it('formats numeric-bracket', () => {
    expect(formatRefIndex(0, 'numeric-bracket')).toBe('[1]');
    expect(formatRefIndex(2, 'numeric-bracket')).toBe('[3]');
  });

  it('formats numeric-circled', () => {
    expect(formatRefIndex(0, 'numeric-circled')).toBe('①');
    expect(formatRefIndex(9, 'numeric-circled')).toBe('⑩');
    expect(formatRefIndex(49, 'numeric-circled')).toBe('㊿');
  });

  it('falls back for out-of-range numeric-circled', () => {
    expect(formatRefIndex(50, 'numeric-circled')).toBe('(51)');
  });

  it('formats iroha-katakana', () => {
    expect(formatRefIndex(0, 'iroha-katakana')).toBe('（イ）');
    expect(formatRefIndex(1, 'iroha-katakana')).toBe('（ロ）');
    expect(formatRefIndex(2, 'iroha-katakana')).toBe('（ハ）');
  });

  it('formats iroha-hiragana', () => {
    expect(formatRefIndex(0, 'iroha-hiragana')).toBe('（い）');
    expect(formatRefIndex(1, 'iroha-hiragana')).toBe('（ろ）');
  });

  it('formats gojuon-katakana', () => {
    expect(formatRefIndex(0, 'gojuon-katakana')).toBe('（ア）');
    expect(formatRefIndex(1, 'gojuon-katakana')).toBe('（イ）');
  });

  it('formats gojuon-hiragana', () => {
    expect(formatRefIndex(0, 'gojuon-hiragana')).toBe('（あ）');
    expect(formatRefIndex(1, 'gojuon-hiragana')).toBe('（い）');
  });

  it('formats kanji-numeric', () => {
    expect(formatRefIndex(0, 'kanji-numeric')).toBe('（一）');
    expect(formatRefIndex(9, 'kanji-numeric')).toBe('（十）');
  });

  it('falls back for out-of-range kanji-numeric', () => {
    expect(formatRefIndex(10, 'kanji-numeric')).toBe('（11）');
  });

  it('falls back for out-of-range iroha-katakana', () => {
    expect(formatRefIndex(100, 'iroha-katakana')).toBe('（101）');
  });
});

describe('resolveRefValues', () => {
  const tokens: Token[] = [
    { id: 't1', text: '子' },
    { id: 't2', text: '曰' },
    { id: 't3', text: '學' },
  ];

  it('resolves label-based refs', () => {
    const ref1: RefMark = {
      type: 'ref',
      label: '※',
      position: { blockId: 'b1', after: 't1' },
    };
    const result = resolveRefValues(tokens, [ref1]);
    expect(result.get(ref1)).toBe('※');
  });

  it('resolves format-based refs with auto-numbering', () => {
    const ref1: RefMark = {
      type: 'ref',
      format: 'numeric-paren',
      position: { blockId: 'b1', after: 't1' },
    };
    const ref2: RefMark = {
      type: 'ref',
      format: 'numeric-paren',
      position: { blockId: 'b1', after: 't2' },
    };
    const result = resolveRefValues(tokens, [ref1, ref2]);
    expect(result.get(ref1)).toBe('(1)');
    expect(result.get(ref2)).toBe('(2)');
  });

  it('groups same ext.value refs with same index', () => {
    const ref1: RefMark = {
      type: 'ref',
      format: 'alpha-upper',
      position: { blockId: 'b1', after: 't1' },
      ext: { value: 'group1' },
    };
    const ref2: RefMark = {
      type: 'ref',
      format: 'alpha-upper',
      position: { blockId: 'b1', after: 't2' },
      ext: { value: 'group1' },
    };
    const ref3: RefMark = {
      type: 'ref',
      format: 'alpha-upper',
      position: { blockId: 'b1', after: 't3' },
      ext: { value: 'group2' },
    };
    const result = resolveRefValues(tokens, [ref1, ref2, ref3]);
    expect(result.get(ref1)).toBe('(A)');
    expect(result.get(ref2)).toBe('(A)');
    expect(result.get(ref3)).toBe('(B)');
  });

  it('resolves content-only refs as numeric-bracket', () => {
    const ref1: RefMark = {
      type: 'ref',
      content: 'some note',
      position: { blockId: 'b1', after: 't1' },
    };
    const result = resolveRefValues(tokens, [ref1]);
    expect(result.get(ref1)).toBe('[1]');
  });

  it('sorts by token position (document order)', () => {
    // ref2 is at t1 (earlier), ref1 is at t3 (later) — but passed in reverse order
    const ref1: RefMark = {
      type: 'ref',
      format: 'numeric-paren',
      position: { blockId: 'b1', after: 't3' },
    };
    const ref2: RefMark = {
      type: 'ref',
      format: 'numeric-paren',
      position: { blockId: 'b1', after: 't1' },
    };
    const result = resolveRefValues(tokens, [ref1, ref2]);
    expect(result.get(ref2)).toBe('(1)');
    expect(result.get(ref1)).toBe('(2)');
  });

  it('same label refs get same display value', () => {
    const ref1: RefMark = {
      type: 'ref',
      label: '注',
      position: { blockId: 'b1', after: 't1' },
    };
    const ref2: RefMark = {
      type: 'ref',
      label: '注',
      position: { blockId: 'b1', after: 't2' },
    };
    const result = resolveRefValues(tokens, [ref1, ref2]);
    expect(result.get(ref1)).toBe('注');
    expect(result.get(ref2)).toBe('注');
  });

  it('ignores non-ref marks', () => {
    const marks: Mark[] = [
      {
        type: 'okurigana',
        value: 'く',
        anchor: { from: 't1', to: 't1' },
      },
    ];
    const result = resolveRefValues(tokens, marks);
    expect(result.size).toBe(0);
  });

  it('handles refs without after (block start position)', () => {
    const ref1: RefMark = {
      type: 'ref',
      format: 'numeric-paren',
      position: { blockId: 'b1' },
    };
    const result = resolveRefValues(tokens, [ref1]);
    expect(result.get(ref1)).toBe('(1)');
  });
});
