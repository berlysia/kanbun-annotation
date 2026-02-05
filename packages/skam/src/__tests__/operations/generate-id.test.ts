import { describe, it, expect } from 'vitest';
import { generateMarkId, generateId } from '../../operations/index.js';
import { assertValidDocument, createTestDocument, createMultiBlockDocument } from './helpers.js';

const RANDOM_ID_PATTERN = /^m-[0-9a-f]{8}$/;

// ============================================================================
// 1. generateMarkId
// ============================================================================

describe('generateMarkId', () => {
  it('1.1: m-{8hex} 形式のIDを生成する', () => {
    const doc = createTestDocument([]);
    assertValidDocument(doc);
    expect(generateMarkId(doc)).toMatch(RANDOM_ID_PATTERN);
  });

  it('1.2: 呼び出しごとに異なるIDを生成する', () => {
    const doc = createTestDocument([]);
    const ids = new Set(Array.from({ length: 10 }, () => generateMarkId(doc)));
    expect(ids.size).toBe(10);
  });

  it('1.3: 既存のマークIDと衝突しない', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'okurigana', id: 'm3', anchor: { from: 't2', to: 't2' }, value: 'ク' },
    ]);
    assertValidDocument(doc);
    const id = generateMarkId(doc);
    expect(id).toMatch(RANDOM_ID_PATTERN);
    expect(id).not.toBe('m1');
    expect(id).not.toBe('m3');
  });

  it('1.4: 複数ブロックでも正しく動作する', () => {
    const doc = createMultiBlockDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'okurigana', id: 'm2', anchor: { from: 't4', to: 't4' }, value: 'テ' },
    ]);
    assertValidDocument(doc);
    const id = generateMarkId(doc);
    expect(id).toMatch(RANDOM_ID_PATTERN);
  });
});

// ============================================================================
// 19. generateId
// ============================================================================

describe('generateId', () => {
  it('19.1: デフォルト（m prefix）で m-{8hex} 形式を生成する', () => {
    const doc = createTestDocument([]);
    expect(generateId(doc)).toMatch(RANDOM_ID_PATTERN);
  });

  it('19.2: カスタム prefix で {prefix}-{8hex} 形式を生成する', () => {
    const doc = createTestDocument([]);
    expect(generateId(doc, 'ref')).toMatch(/^ref-[0-9a-f]{8}$/);
  });

  it('19.3: generateMarkId と同じ形式を生成する', () => {
    const doc = createTestDocument([]);
    const id = generateId(doc);
    expect(id).toMatch(RANDOM_ID_PATTERN);
  });

  it('19.4: 既存refと衝突しない', () => {
    const doc = createTestDocument([
      {
        type: 'ref',
        id: 'ref-1',
        position: { blockId: 'b1', after: 't1' },
        format: 'iroha-katakana',
      },
    ]);
    const id = generateId(doc, 'ref');
    expect(id).toMatch(/^ref-[0-9a-f]{8}$/);
    expect(id).not.toBe('ref-1');
  });

  it('19.5: 異なるprefixのIDは異なる形式になる', () => {
    const doc = createTestDocument([]);
    const mId = generateId(doc, 'm');
    const refId = generateId(doc, 'ref');
    expect(mId).toMatch(RANDOM_ID_PATTERN);
    expect(refId).toMatch(/^ref-[0-9a-f]{8}$/);
    expect(mId.startsWith('m-')).toBe(true);
    expect(refId.startsWith('ref-')).toBe(true);
  });
});
