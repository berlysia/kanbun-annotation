import { describe, it, expect } from 'vitest';
import type { SKAMDocument } from '../../index.js';
import { buildTokenIndexMap, getTokenIndex, getTokenByIndex } from '../../operations/index.js';
import { assertValidDocument, createTestDocument, createMultiBlockDocument } from './helpers.js';

// ============================================================================
// 12. buildTokenIndexMap
// ============================================================================

describe('buildTokenIndexMap', () => {
  it('12.1: 単一ブロックのインデックスマップ', () => {
    const doc = createTestDocument([]);
    const map = buildTokenIndexMap(doc);

    expect(map.get('t1')).toBe(0);
    expect(map.get('t2')).toBe(1);
    expect(map.get('t3')).toBe(2);
  });

  it('12.2: 複数ブロックのインデックスマップ', () => {
    const doc = createMultiBlockDocument([]);
    const map = buildTokenIndexMap(doc);

    expect(map.get('t1')).toBe(0);
    expect(map.get('t2')).toBe(1);
    expect(map.get('t3')).toBe(2);
    expect(map.get('t4')).toBe(3);
    expect(map.get('t5')).toBe(4);
    expect(map.get('t6')).toBe(5);
  });

  it('12.3: 空ドキュメントで空のMap', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [],
      blocks: [],
      marks: [],
      readings: [],
    };
    assertValidDocument(doc);
    expect(buildTokenIndexMap(doc).size).toBe(0);
  });

  it('12.4: blocks.tokenIds の連結順を使用する（tokens配列順ではない）', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't3', text: '學' },
        { id: 't1', text: '子' },
        { id: 't2', text: '曰' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
      marks: [],
      readings: [],
    };
    assertValidDocument(doc);

    const map = buildTokenIndexMap(doc);
    expect(map.get('t1')).toBe(0);
    expect(map.get('t2')).toBe(1);
    expect(map.get('t3')).toBe(2);
  });
});

// ============================================================================
// 13. getTokenIndex
// ============================================================================

describe('getTokenIndex', () => {
  it('13.1: 先頭トークン', () => {
    const doc = createTestDocument([]);
    expect(getTokenIndex(doc, 't1')).toBe(0);
  });

  it('13.2: 末尾トークン', () => {
    const doc = createTestDocument([]);
    expect(getTokenIndex(doc, 't3')).toBe(2);
  });

  it('13.3: 存在しないtokenId', () => {
    const doc = createTestDocument([]);
    expect(getTokenIndex(doc, 't999')).toBeUndefined();
  });

  it('13.4: 複数ブロック: b2先頭', () => {
    const doc = createMultiBlockDocument([]);
    expect(getTokenIndex(doc, 't4')).toBe(3);
  });

  it('13.5: 複数ブロック: b2末尾', () => {
    const doc = createMultiBlockDocument([]);
    expect(getTokenIndex(doc, 't6')).toBe(5);
  });
});

// ============================================================================
// 14. getTokenByIndex
// ============================================================================

describe('getTokenByIndex', () => {
  it('14.1: 先頭のトークン', () => {
    const doc = createTestDocument([]);
    const token = getTokenByIndex(doc, 0);
    expect(token?.id).toBe('t1');
    expect(token?.text).toBe('子');
  });

  it('14.2: 末尾のトークン', () => {
    const doc = createTestDocument([]);
    const token = getTokenByIndex(doc, 2);
    expect(token?.id).toBe('t3');
    expect(token?.text).toBe('學');
  });

  it('14.3: 範囲外（正）', () => {
    const doc = createTestDocument([]);
    expect(getTokenByIndex(doc, 99)).toBeUndefined();
  });

  it('14.4: 範囲外（負）', () => {
    const doc = createTestDocument([]);
    expect(getTokenByIndex(doc, -1)).toBeUndefined();
  });

  it('14.5: 複数ブロック: b2先頭', () => {
    const doc = createMultiBlockDocument([]);
    const token = getTokenByIndex(doc, 3);
    expect(token?.id).toBe('t4');
    expect(token?.text).toBe('而');
  });

  it('14.6: 複数ブロック: b2末尾', () => {
    const doc = createMultiBlockDocument([]);
    const token = getTokenByIndex(doc, 5);
    expect(token?.id).toBe('t6');
    expect(token?.text).toBe('習');
  });
});
