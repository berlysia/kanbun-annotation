import { describe, it, expect } from 'vitest';
import type {
  KaeriMark,
  OkuriganaMark,
  YomiganaMark,
  SoeganaMark,
  KutotenMark,
  RefMark,
  EmphasisMark,
  HighlightMark,
  TatetenMark,
  OkimojiMark,
  Mark,
} from '../../index.js';
import {
  isAnchorBasedMark,
  isMarkType,
  filterMarksByType,
  hasMarkValue,
  getAnchorRangeLabel,
  isExactAnchorMatch,
} from '../../operations/index.js';

// ============================================================================
// isAnchorBasedMark
// ============================================================================

describe('isAnchorBasedMark', () => {
  it('anchor ベースのマークに true を返す', () => {
    const marks: Mark[] = [
      { type: 'okurigana', id: 'm2', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'emphasis', id: 'm3', anchor: { from: 't1', to: 't2' } },
      { type: 'highlight', id: 'm4', anchor: { from: 't1', to: 't2' }, style: 'solid' },
      { type: 'tateten', id: 'm5', anchor: { from: 't1', to: 't2' } },
      { type: 'okimoji', id: 'm6', anchor: { from: 't1', to: 't1' } },
    ];

    for (const mark of marks) {
      expect(isAnchorBasedMark(mark)).toBe(true);
    }
  });

  it('position ベースのマーク（kaeri, kutoten, ref）に false を返す', () => {
    const kaeri: KaeriMark = {
      type: 'kaeri',
      id: 'm0',
      position: { blockId: 'b1', after: 't1' },
      value: 'レ',
    };
    const kutoten: KutotenMark = {
      type: 'kutoten',
      id: 'm1',
      position: { blockId: 'b1', after: 't1' },
      value: '。',
    };
    const ref: RefMark = {
      type: 'ref',
      id: 'm2',
      position: { blockId: 'b1', after: 't1' },
      format: 'iroha-katakana',
    };

    expect(isAnchorBasedMark(kaeri)).toBe(false);
    expect(isAnchorBasedMark(kutoten)).toBe(false);
    expect(isAnchorBasedMark(ref)).toBe(false);
  });
});

// ============================================================================
// hasMarkValue
// ============================================================================

describe('hasMarkValue', () => {
  it('value を持つマーク型に true を返す', () => {
    const kaeri: KaeriMark = {
      type: 'kaeri',
      id: 'm1',
      position: { blockId: 'b1', after: 't1' },
      value: 'レ',
    };
    const okurigana: OkuriganaMark = {
      type: 'okurigana',
      id: 'm2',
      anchor: { from: 't1', to: 't1' },
      value: 'ク',
    };
    const yomigana: YomiganaMark = {
      type: 'yomigana',
      id: 'm3',
      anchor: { from: 't1', to: 't1' },
      value: 'し',
    };
    const soegana: SoeganaMark = {
      type: 'soegana',
      id: 'm4',
      anchor: { from: 't1', to: 't1' },
      value: 'を',
    };
    const kutoten: KutotenMark = {
      type: 'kutoten',
      id: 'm5',
      position: { blockId: 'b1', after: 't1' },
      value: '。',
    };

    expect(hasMarkValue(kaeri)).toBe(true);
    expect(hasMarkValue(okurigana)).toBe(true);
    expect(hasMarkValue(yomigana)).toBe(true);
    expect(hasMarkValue(soegana)).toBe(true);
    expect(hasMarkValue(kutoten)).toBe(true);
  });

  it('value を持たないマーク型に false を返す', () => {
    const emphasis: EmphasisMark = {
      type: 'emphasis',
      id: 'm1',
      anchor: { from: 't1', to: 't2' },
    };
    const highlight: HighlightMark = {
      type: 'highlight',
      id: 'm2',
      anchor: { from: 't1', to: 't2' },
      style: 'solid',
    };
    const tateten: TatetenMark = {
      type: 'tateten',
      id: 'm3',
      anchor: { from: 't1', to: 't2' },
    };
    const okimoji: OkimojiMark = {
      type: 'okimoji',
      id: 'm4',
      anchor: { from: 't1', to: 't1' },
    };
    const ref: RefMark = {
      type: 'ref',
      id: 'm5',
      position: { blockId: 'b1', after: 't1' },
      format: 'iroha-katakana',
    };

    expect(hasMarkValue(emphasis)).toBe(false);
    expect(hasMarkValue(highlight)).toBe(false);
    expect(hasMarkValue(tateten)).toBe(false);
    expect(hasMarkValue(okimoji)).toBe(false);
    expect(hasMarkValue(ref)).toBe(false);
  });
});

// ============================================================================
// getAnchorRangeLabel
// ============================================================================

describe('getAnchorRangeLabel', () => {
  it('position ベースの kaeri で空文字列を返す', () => {
    const mark: KaeriMark = {
      type: 'kaeri',
      id: 'm1',
      position: { blockId: 'b1', after: 't1' },
      value: '一',
    };

    expect(getAnchorRangeLabel(mark)).toBe('');
  });

  it('from と to が同じ場合も正しく返す', () => {
    const mark: OkuriganaMark = {
      type: 'okurigana',
      id: 'm1',
      anchor: { from: 't2', to: 't2' },
      value: 'ク',
    };

    expect(getAnchorRangeLabel(mark)).toBe('t2〜t2');
  });

  it('position ベースのマークで空文字列を返す', () => {
    const kutoten: KutotenMark = {
      type: 'kutoten',
      id: 'm1',
      position: { blockId: 'b1', after: 't1' },
      value: '。',
    };
    const ref: RefMark = {
      type: 'ref',
      id: 'm2',
      position: { blockId: 'b1', after: 't1' },
      format: 'iroha-katakana',
    };

    expect(getAnchorRangeLabel(kutoten)).toBe('');
    expect(getAnchorRangeLabel(ref)).toBe('');
  });
});

// ============================================================================
// isExactAnchorMatch
// ============================================================================

describe('isExactAnchorMatch', () => {
  it('from/to が完全一致する場合に true を返す', () => {
    const mark: EmphasisMark = {
      type: 'emphasis',
      id: 'm1',
      anchor: { from: 't1', to: 't3' },
    };

    expect(isExactAnchorMatch(mark, 't1', 't3')).toBe(true);
  });

  it('from が一致しない場合に false を返す', () => {
    const mark: EmphasisMark = {
      type: 'emphasis',
      id: 'm1',
      anchor: { from: 't1', to: 't3' },
    };

    expect(isExactAnchorMatch(mark, 't2', 't3')).toBe(false);
  });

  it('to が一致しない場合に false を返す', () => {
    const mark: EmphasisMark = {
      type: 'emphasis',
      id: 'm1',
      anchor: { from: 't1', to: 't3' },
    };

    expect(isExactAnchorMatch(mark, 't1', 't2')).toBe(false);
  });

  it('position ベースのマークで常に false を返す', () => {
    const kutoten: KutotenMark = {
      type: 'kutoten',
      id: 'm1',
      position: { blockId: 'b1', after: 't1' },
      value: '。',
    };

    expect(isExactAnchorMatch(kutoten, 't1', 't1')).toBe(false);
  });
});

// ============================================================================
// isMarkType
// ============================================================================

describe('isMarkType', () => {
  it('5.1: type が一致する position ベースマーク (kaeri) で true を返し、型がナローされる', () => {
    const mark: Mark = {
      type: 'kaeri',
      id: 'm1',
      position: { blockId: 'b1', after: 't1' },
      value: 'レ',
    };

    expect(isMarkType(mark, 'kaeri')).toBe(true);
    if (isMarkType(mark, 'kaeri')) {
      // KaeriMark にナローされるので value にアクセス可能
      expect(mark.value).toBe('レ');
    }
  });

  it('5.2: type が一致しないマークで false を返す', () => {
    const mark: Mark = {
      type: 'kaeri',
      id: 'm1',
      position: { blockId: 'b1', after: 't1' },
      value: 'レ',
    };

    expect(isMarkType(mark, 'okurigana')).toBe(false);
  });

  it('5.3: position ベースマーク（kutoten）で正しくナローされる', () => {
    const mark: Mark = {
      type: 'kutoten',
      id: 'm1',
      position: { blockId: 'b1', after: 't1' },
      value: '。',
    };

    expect(isMarkType(mark, 'kutoten')).toBe(true);
    if (isMarkType(mark, 'kutoten')) {
      // KutotenMark にナローされるので position にアクセス可能
      expect(mark.position.blockId).toBe('b1');
    }
  });
});

// ============================================================================
// filterMarksByType
// ============================================================================

describe('filterMarksByType', () => {
  it('6.1: 指定 type のマークのみをフィルタリングする', () => {
    const marks: Mark[] = [
      { type: 'kaeri', id: 'm1', position: { blockId: 'b1', after: 't1' }, value: 'レ' },
      { type: 'okurigana', id: 'm2', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'kaeri', id: 'm3', position: { blockId: 'b1', after: 't2' }, value: '一' },
    ];

    const result = filterMarksByType(marks, 'kaeri');
    expect(result).toHaveLength(2);
    expect(result[0]?.value).toBe('レ');
    expect(result[1]?.value).toBe('一');
  });

  it('6.2: マッチなしで空配列を返す', () => {
    const marks: Mark[] = [
      { type: 'kaeri', id: 'm1', position: { blockId: 'b1', after: 't1' }, value: 'レ' },
    ];

    const result = filterMarksByType(marks, 'okurigana');
    expect(result).toHaveLength(0);
  });

  it('6.3: position ベースマーク（kutoten）をフィルタリングする', () => {
    const marks: Mark[] = [
      { type: 'kaeri', id: 'm1', position: { blockId: 'b1', after: 't1' }, value: 'レ' },
      { type: 'kutoten', id: 'm2', position: { blockId: 'b1', after: 't1' }, value: '。' },
      { type: 'kutoten', id: 'm3', position: { blockId: 'b1', after: 't2' }, value: '、' },
    ];

    const result = filterMarksByType(marks, 'kutoten');
    expect(result).toHaveLength(2);
    expect(result[0]?.position.blockId).toBe('b1');
  });
});
