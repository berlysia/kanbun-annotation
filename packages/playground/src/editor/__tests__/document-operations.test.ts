import { describe, it, expect } from 'vitest';
import type { SKAMDocument, Mark, KaeriMark } from '@kanbun/skam';
import {
  generateMarkId,
  addMark,
  updateMark,
  removeMark,
  getMarksForToken,
  type MarkInput,
} from '../document-operations';

/** テスト用の最小限のSKAMDocumentを作成 */
function createTestDocument(marks: Mark[] = []): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '子' },
      { id: 't2', text: '曰' },
      { id: 't3', text: '學' },
    ],
    marks,
    readings: [],
  };
}

describe('generateMarkId', () => {
  it('空のマーク配列に対して m1 を生成する', () => {
    const doc = createTestDocument([]);
    expect(generateMarkId(doc)).toBe('m1');
  });

  it('既存のmarkIdから最大値+1を生成する', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'okurigana', id: 'm3', anchor: { from: 't2', to: 't2' }, value: 'ク' },
    ]);
    expect(generateMarkId(doc)).toBe('m4');
  });

  it('id がないマークは無視する', () => {
    const doc = createTestDocument([
      { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'okurigana', id: 'm2', anchor: { from: 't2', to: 't2' }, value: 'ク' },
    ]);
    expect(generateMarkId(doc)).toBe('m3');
  });

  it('m{number} 形式でないidは無視する', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'custom-id', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'okurigana', id: 'm2', anchor: { from: 't2', to: 't2' }, value: 'ク' },
    ]);
    expect(generateMarkId(doc)).toBe('m3');
  });
});

describe('addMark', () => {
  it('マークを追加し、新しいドキュメントを返す', () => {
    const doc = createTestDocument([]);
    const newMark: MarkInput = {
      type: 'okurigana',
      anchor: { from: 't1', to: 't1' },
      value: 'ク',
    };

    const result = addMark(doc, newMark);

    expect(result.marks).toHaveLength(1);
    expect(result.marks[0]).toEqual({
      type: 'okurigana',
      id: 'm1',
      anchor: { from: 't1', to: 't1' },
      value: 'ク',
    });
  });

  it('元のドキュメントは変更されない（イミュータブル）', () => {
    const doc = createTestDocument([]);
    const newMark: MarkInput = {
      type: 'okurigana',
      anchor: { from: 't1', to: 't1' },
      value: 'ク',
    };

    addMark(doc, newMark);

    expect(doc.marks).toHaveLength(0);
  });

  it('既存のマークを保持しつつ新しいマークを追加する', () => {
    const existingMark: KaeriMark = {
      type: 'kaeri',
      id: 'm1',
      anchor: { from: 't1', to: 't1' },
      value: 'レ',
    };
    const doc = createTestDocument([existingMark]);
    const newMark: MarkInput = {
      type: 'okurigana',
      anchor: { from: 't2', to: 't2' },
      value: 'ク',
    };

    const result = addMark(doc, newMark);

    expect(result.marks).toHaveLength(2);
    expect(result.marks[0]).toEqual(existingMark);
    expect(result.marks[1]?.id).toBe('m2');
  });

  it('渡されたmarkにidがあっても新しいidで上書きされる', () => {
    const doc = createTestDocument([]);
    const newMark: MarkInput = {
      type: 'okurigana',
      id: 'old-id',
      anchor: { from: 't1', to: 't1' },
      value: 'ク',
    };

    const result = addMark(doc, newMark);

    expect(result.marks[0]?.id).toBe('m1');
    expect(result.marks[0]?.id).not.toBe('old-id');
  });
});

describe('updateMark', () => {
  it('anchor を更新し、新しいドキュメントを返す', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
    ]);

    const result = updateMark(doc, 'm1', { anchor: { from: 't2', to: 't2' } });

    expect(result.marks[0]).toEqual({
      type: 'okurigana',
      id: 'm1',
      anchor: { from: 't2', to: 't2' },
      value: 'ク',
    });
  });

  it('元のドキュメントは変更されない（イミュータブル）', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
    ]);

    updateMark(doc, 'm1', { anchor: { from: 't2', to: 't2' } });

    expect(doc.marks[0]?.anchor).toEqual({ from: 't1', to: 't1' });
  });

  it('存在しないmarkIdの場合は元のドキュメントを返す', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
    ]);

    const result = updateMark(doc, 'm999', { anchor: { from: 't2', to: 't2' } });

    expect(result).toBe(doc);
  });

  it('placementHint を更新できる', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
    ]);

    const result = updateMark(doc, 'm1', { placementHint: 'left' });

    expect(result.marks[0]?.placementHint).toBe('left');
    // 他のプロパティは保持される
    expect(result.marks[0]?.anchor).toEqual({ from: 't1', to: 't1' });
  });
});

describe('removeMark', () => {
  it('マークを削除し、新しいドキュメントを返す', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'kaeri', id: 'm2', anchor: { from: 't2', to: 't2' }, value: 'レ' },
    ]);

    const result = removeMark(doc, 'm1');

    expect(result.marks).toHaveLength(1);
    expect(result.marks[0]?.id).toBe('m2');
  });

  it('元のドキュメントは変更されない（イミュータブル）', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
    ]);

    removeMark(doc, 'm1');

    expect(doc.marks).toHaveLength(1);
  });

  it('存在しないmarkIdの場合は元のドキュメントを返す', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
    ]);

    const result = removeMark(doc, 'm999');

    expect(result).toBe(doc);
  });
});

describe('getMarksForToken', () => {
  it('特定のtokenに関連するマークを取得する', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'kaeri', id: 'm2', anchor: { from: 't2', to: 't2' }, value: 'レ' },
      { type: 'yomigana', id: 'm3', anchor: { from: 't3', to: 't3' }, value: 'まなぶ' },
    ]);

    const result = getMarksForToken(doc, 't2');

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('m2');
  });

  it('範囲を跨ぐマークも取得する', () => {
    const doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't3' }, value: 'しいわく' },
      { type: 'kaeri', id: 'm2', anchor: { from: 't2', to: 't2' }, value: 'レ' },
    ]);

    const result = getMarksForToken(doc, 't2');

    expect(result).toHaveLength(2);
    expect(result.map((m) => m.id)).toContain('m1');
    expect(result.map((m) => m.id)).toContain('m2');
  });

  it('存在しないtokenIdの場合は空配列を返す', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
    ]);

    const result = getMarksForToken(doc, 't999');

    expect(result).toHaveLength(0);
  });

  it('マークがない場合は空配列を返す', () => {
    const doc = createTestDocument([]);

    const result = getMarksForToken(doc, 't1');

    expect(result).toHaveLength(0);
  });

  it('anchorのfrom/toが無効なtokenIdを参照するマークは除外する', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      {
        type: 'okurigana',
        id: 'm2',
        anchor: { from: 'invalid', to: 'invalid' },
        value: 'ク',
      },
    ]);

    const result = getMarksForToken(doc, 't1');

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('m1');
  });
});
