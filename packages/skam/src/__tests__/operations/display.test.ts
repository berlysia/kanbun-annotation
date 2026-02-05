import { describe, it, expect } from 'vitest';
import type { Mark } from '../../index.js';
import { getAnchorText, getMarkSortIndex, sortMarksByPosition } from '../../operations/index.js';
import { createTestDocument, createMultiBlockDocument } from './helpers.js';

// ============================================================================
// 16. getAnchorText
// ============================================================================

describe('getAnchorText', () => {
  it('16.1: 単一トークンのテキスト', () => {
    const doc = createTestDocument([]);
    const mark: Mark = {
      type: 'okurigana',
      id: 'm1',
      anchor: { from: 't2', to: 't2' },
      value: 'ク',
    };
    expect(getAnchorText(doc, mark)).toBe('曰');
  });

  it('16.2: 範囲のテキストを連結', () => {
    const doc = createTestDocument([]);
    const mark: Mark = {
      type: 'yomigana',
      id: 'm1',
      anchor: { from: 't1', to: 't3' },
      value: 'しいわく',
    };
    expect(getAnchorText(doc, mark)).toBe('子曰學');
  });

  it('16.3: position-based（after指定）', () => {
    const doc = createTestDocument([]);
    const mark: Mark = {
      type: 'kutoten',
      id: 'm1',
      position: { blockId: 'b1', after: 't2' },
      value: '。',
    };
    expect(getAnchorText(doc, mark)).toBe('曰');
  });

  it('16.4: position-based（after未定義）で空文字列', () => {
    const doc = createTestDocument([]);
    const mark: Mark = {
      type: 'kutoten',
      id: 'm1',
      position: { blockId: 'b1' },
      value: '。',
    };
    expect(getAnchorText(doc, mark)).toBe('');
  });

  it('16.5: 無効なanchorで空文字列', () => {
    const doc = createTestDocument([]);
    const mark: Mark = {
      type: 'okurigana',
      id: 'm1',
      anchor: { from: 'invalid', to: 'invalid' },
      value: 'ク',
    };
    expect(getAnchorText(doc, mark)).toBe('');
  });

  it('16.6: 複数ブロックのテキストを連結', () => {
    const doc = createMultiBlockDocument([]);
    const mark: Mark = {
      type: 'yomigana',
      id: 'm1',
      anchor: { from: 't4', to: 't6' },
      value: 'ときなら',
    };
    expect(getAnchorText(doc, mark)).toBe('而時習');
  });
});

// ============================================================================
// 17. getMarkSortIndex
// ============================================================================

describe('getMarkSortIndex', () => {
  it('17.1: anchor先頭', () => {
    const doc = createTestDocument([]);
    const mark: Mark = {
      type: 'okurigana',
      id: 'm1',
      anchor: { from: 't1', to: 't1' },
      value: 'ク',
    };
    expect(getMarkSortIndex(doc, mark)).toBe(0);
  });

  it('17.2: position-based (kaeri after t2)', () => {
    const doc = createTestDocument([]);
    const mark: Mark = {
      type: 'kaeri',
      id: 'm1',
      position: { blockId: 'b1', after: 't2' },
      value: 'レ',
    };
    expect(getMarkSortIndex(doc, mark)).toBe(1);
  });

  it('17.3: anchor範囲（fromの位置）', () => {
    const doc = createTestDocument([]);
    const mark: Mark = {
      type: 'yomigana',
      id: 'm1',
      anchor: { from: 't2', to: 't3' },
      value: 'いわく',
    };
    expect(getMarkSortIndex(doc, mark)).toBe(1);
  });

  it('17.4: position-based', () => {
    const doc = createTestDocument([]);
    const mark: Mark = {
      type: 'kutoten',
      id: 'm1',
      position: { blockId: 'b1', after: 't2' },
      value: '。',
    };
    expect(getMarkSortIndex(doc, mark)).toBe(1);
  });

  it('17.5: position-based（after未定義）で -1', () => {
    const doc = createTestDocument([]);
    const mark: Mark = {
      type: 'kutoten',
      id: 'm1',
      position: { blockId: 'b1' },
      value: '。',
    };
    expect(getMarkSortIndex(doc, mark)).toBe(-1);
  });

  it('17.6: 無効anchorで -1', () => {
    const doc = createTestDocument([]);
    const mark: Mark = {
      type: 'okurigana',
      id: 'm1',
      anchor: { from: 'invalid', to: 'invalid' },
      value: 'ク',
    };
    expect(getMarkSortIndex(doc, mark)).toBe(-1);
  });
});

// ============================================================================
// 18. sortMarksByPosition
// ============================================================================

describe('sortMarksByPosition', () => {
  it('18.1: ドキュメント内の出現順にソート', () => {
    const doc = createTestDocument([
      { type: 'kaeri', id: 'm1', position: { blockId: 'b1', after: 't3' }, value: 'レ' },
      { type: 'okurigana', id: 'm2', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'yomigana', id: 'm3', anchor: { from: 't2', to: 't2' }, value: 'いわく' },
    ]);

    const sorted = sortMarksByPosition(doc);
    expect(sorted.map((m) => m.id)).toEqual(['m2', 'm3', 'm1']);
  });

  it('18.2: position-based混在', () => {
    const doc = createTestDocument([
      { type: 'kutoten', id: 'm1', position: { blockId: 'b1', after: 't3' }, value: '。' },
      { type: 'kaeri', id: 'm2', position: { blockId: 'b1', after: 't1' }, value: 'レ' },
      { type: 'kutoten', id: 'm3', position: { blockId: 'b1', after: 't1' }, value: '、' },
    ]);

    const sorted = sortMarksByPosition(doc);
    expect(sorted[0]?.id).toBe('m2');
    expect(sorted[1]?.id).toBe('m3');
    expect(sorted[2]?.id).toBe('m1');
  });

  it('18.3: イミュータブル', () => {
    const doc = createTestDocument([
      { type: 'kaeri', id: 'm1', position: { blockId: 'b1', after: 't3' }, value: 'レ' },
      { type: 'okurigana', id: 'm2', anchor: { from: 't1', to: 't1' }, value: 'ク' },
    ]);

    sortMarksByPosition(doc);
    expect(doc.marks[0]?.id).toBe('m1');
    expect(doc.marks[1]?.id).toBe('m2');
  });

  it('18.4: 空のマーク配列', () => {
    const doc = createTestDocument([]);
    expect(sortMarksByPosition(doc)).toHaveLength(0);
  });
});
