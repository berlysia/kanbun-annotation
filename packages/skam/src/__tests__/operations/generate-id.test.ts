import { describe, it, expect } from 'vitest';
import { generateMarkId, generateId } from '../../operations/index.js';
import { assertValidDocument, createTestDocument, createMultiBlockDocument } from './helpers.js';

// ============================================================================
// 1. generateMarkId
// ============================================================================

describe('generateMarkId', () => {
  it('1.1: 空のマーク配列に対して m1 を生成する', () => {
    const doc = createTestDocument([]);
    assertValidDocument(doc);
    expect(generateMarkId(doc)).toBe('m1');
  });

  it('1.2: 既存のmarkIdから最大値+1を生成する', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'okurigana', id: 'm3', anchor: { from: 't2', to: 't2' }, value: 'ク' },
    ]);
    assertValidDocument(doc);
    expect(generateMarkId(doc)).toBe('m4');
  });

  it('1.3: id がないマークは無視する', () => {
    const doc = createTestDocument([
      { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'okurigana', id: 'm2', anchor: { from: 't2', to: 't2' }, value: 'ク' },
    ]);
    assertValidDocument(doc);
    expect(generateMarkId(doc)).toBe('m3');
  });

  it('1.4: m{number} 形式でないidは無視する', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'custom-id', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'okurigana', id: 'm2', anchor: { from: 't2', to: 't2' }, value: 'ク' },
    ]);
    assertValidDocument(doc);
    expect(generateMarkId(doc)).toBe('m3');
  });

  it('1.5: 複数ブロックでも正しく動作する', () => {
    const doc = createMultiBlockDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'okurigana', id: 'm2', anchor: { from: 't4', to: 't4' }, value: 'テ' },
    ]);
    assertValidDocument(doc);
    expect(generateMarkId(doc)).toBe('m3');
  });
});

// ============================================================================
// 19. generateId
// ============================================================================

describe('generateId', () => {
  it('19.1: デフォルト（m prefix）で m1 を生成する', () => {
    const doc = createTestDocument([]);

    expect(generateId(doc)).toBe('m1');
  });

  it('19.2: generateMarkIdと同一結果になる', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'okurigana', id: 'm3', anchor: { from: 't2', to: 't2' }, value: 'ク' },
    ]);

    expect(generateId(doc, 'm', '')).toBe(generateMarkId(doc));
    expect(generateId(doc, 'm', '')).toBe('m4');
  });

  it('19.3: ref prefix + delimiter で ref-1 を生成する', () => {
    const doc = createTestDocument([]);

    expect(generateId(doc, 'ref', '-')).toBe('ref-1');
  });

  it('19.4: 既存refから最大値+1を生成する', () => {
    const doc = createTestDocument([
      {
        type: 'ref',
        id: 'ref-1',
        position: { blockId: 'b1', after: 't1' },
        format: 'iroha-katakana',
      },
      {
        type: 'ref',
        id: 'ref-3',
        position: { blockId: 'b1', after: 't3' },
        format: 'iroha-katakana',
      },
    ]);

    expect(generateId(doc, 'ref', '-')).toBe('ref-4');
  });

  it('19.5: 異なるprefix混在でも正しいprefixだけカウントする', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      {
        type: 'ref',
        id: 'ref-1',
        position: { blockId: 'b1', after: 't2' },
        format: 'iroha-katakana',
      },
    ]);

    expect(generateId(doc, 'ref', '-')).toBe('ref-2');
  });

  it('19.6: prefix不一致のIDは無視する', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'okurigana', id: 'm2', anchor: { from: 't2', to: 't2' }, value: 'ク' },
    ]);

    expect(generateId(doc, 'ref', '-')).toBe('ref-1');
  });
});
