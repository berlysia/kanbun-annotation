import { describe, it, expect } from 'vitest';
import { generateMarkId, generateId, addMark } from '../../operations/index.js';
import { assertValidDocument, createTestDocument, createMultiBlockDocument } from './helpers.js';

const RANDOM_ID_PATTERN = /^m-[0-9a-f]{8}$/;
const AUTO_MARK_ID_PATTERN = /^m#[1-9][0-9]*$/;

// ============================================================================
// 1. generateMarkId
// ============================================================================

describe('generateMarkId', () => {
  it('1.1: m#{n} 形式のIDを生成する', () => {
    const doc = createTestDocument([]);
    assertValidDocument(doc);
    expect(generateMarkId(doc)).toBe('m#1');
  });

  it('1.2: 同じ文書では同じIDを返し、注記を足すと次の番号になる', () => {
    const doc = createTestDocument([]);
    expect(generateMarkId(doc)).toBe(generateMarkId(doc));
    const next = addMark(doc, { type: 'okimoji', anchor: { from: 't1', to: 't1' } });
    expect(generateMarkId(next)).toBe('m#2');
  });

  it('1.3: 既存の注記の id と重ならない最小の m#{n} を返す', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm#1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'okurigana', id: 'm#3', anchor: { from: 't2', to: 't2' }, value: 'ク' },
    ]);
    expect(generateMarkId(doc)).toBe('m#2');
  });

  it('1.3b: ブロックと字の id とも重ならない', () => {
    const doc = createTestDocument([]);
    doc.blocks[0]!.id = 'm#1';
    doc.tokens[0]!.id = 'm#2';
    doc.blocks[0]!.tokenIds[0] = 'm#2';
    expect(generateMarkId(doc)).toBe('m#3');
  });

  it('1.4: 複数ブロックでも正しく動作する', () => {
    const doc = createMultiBlockDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'okurigana', id: 'm2', anchor: { from: 't4', to: 't4' }, value: 'テ' },
    ]);
    assertValidDocument(doc);
    expect(generateMarkId(doc)).toMatch(AUTO_MARK_ID_PATTERN);
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

  it('19.3: generateMarkId と違い、乱数の形式のままである', () => {
    const doc = createTestDocument([]);
    const id = generateId(doc);
    expect(id).toMatch(RANDOM_ID_PATTERN);
    expect(id).not.toBe(generateMarkId(doc));
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
