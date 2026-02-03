import { describe, it, expect } from 'vitest';
import type { SKAMDocument, Mark, KaeriMark } from '../index.js';
import {
  generateMarkId,
  addMark,
  updateMark,
  removeMark,
  getMarksForToken,
  getMarksForRange,
  type MarkInput,
} from '../operations/index.js';

/** テスト用の最小限のSKAMDocumentを作成 */
function createTestDocument(marks: Mark[] = []): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '子' },
      { id: 't2', text: '曰' },
      { id: 't3', text: '學' },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
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

    const mark = doc.marks[0];
    expect(mark != null && 'anchor' in mark && mark.anchor).toEqual({ from: 't1', to: 't1' });
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
    const mark = result.marks[0];
    expect(mark != null && 'anchor' in mark && mark.anchor).toEqual({ from: 't1', to: 't1' });
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

  it('同じトークンにyomiganaとrefの両方があるとき両方を取得する', () => {
    const doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't3', to: 't3' }, value: 'まな' },
      {
        type: 'ref',
        id: 'ref-1',
        position: { blockId: 'b1', after: 't3' },
        format: 'iroha-katakana',
      },
    ]);

    const result = getMarksForToken(doc, 't3');

    expect(result).toHaveLength(2);
    expect(result.map((m) => m.type)).toContain('yomigana');
    expect(result.map((m) => m.type)).toContain('ref');
  });
});

describe('Playground scenario: yomiganaを追加してもrefは残る', () => {
  it('refがついているトークンにyomiganaを追加してもrefは削除されない', () => {
    // Initial state: token has ref mark
    const initialDoc = createTestDocument([
      {
        type: 'ref',
        id: 'ref-1',
        position: { blockId: 'b1', after: 't3' },
        format: 'iroha-katakana',
      },
    ]);

    // Simulate handleKanaApply: check for existing yomigana, remove if found, add new
    const existingYomigana = getMarksForToken(initialDoc, 't3').find((m) => m.type === 'yomigana');

    let newDoc = initialDoc;
    if (existingYomigana?.id) {
      newDoc = removeMark(newDoc, existingYomigana.id);
    }

    // Add new yomigana
    newDoc = addMark(newDoc, {
      type: 'yomigana',
      anchor: { from: 't3', to: 't3' },
      value: 'まな',
    });

    // Verify both marks exist
    expect(newDoc.marks).toHaveLength(2);
    const refMarks = newDoc.marks.filter((m) => m.type === 'ref');
    const yomiganaMarks = newDoc.marks.filter((m) => m.type === 'yomigana');
    expect(refMarks).toHaveLength(1);
    expect(yomiganaMarks).toHaveLength(1);
    expect(refMarks[0]?.id).toBe('ref-1');
  });

  it('yomiganaがついているトークンでyomiganaを変更してもrefは削除されない', () => {
    // Initial state: token has both yomigana and ref
    const initialDoc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't3', to: 't3' }, value: 'がく' },
      {
        type: 'ref',
        id: 'ref-1',
        position: { blockId: 'b1', after: 't3' },
        format: 'iroha-katakana',
      },
    ]);

    // Simulate handleKanaApply: find and remove existing yomigana, add new
    const existingYomigana = getMarksForToken(initialDoc, 't3').find((m) => m.type === 'yomigana');

    let newDoc = initialDoc;
    if (existingYomigana?.id) {
      newDoc = removeMark(newDoc, existingYomigana.id);
    }

    // Add new yomigana with different value
    newDoc = addMark(newDoc, {
      type: 'yomigana',
      anchor: { from: 't3', to: 't3' },
      value: 'まな',
    });

    // Verify ref is still present and yomigana is updated
    expect(newDoc.marks).toHaveLength(2);
    const refMarks = newDoc.marks.filter((m) => m.type === 'ref');
    const yomiganaMarks = newDoc.marks.filter((m) => m.type === 'yomigana');
    expect(refMarks).toHaveLength(1);
    expect(yomiganaMarks).toHaveLength(1);
    expect(refMarks[0]?.id).toBe('ref-1');
    expect((yomiganaMarks[0] as { value?: string }).value).toBe('まな');
  });
});

describe('getMarksForRange', () => {
  it('範囲と完全一致するマークを取得する', () => {
    const doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't3' }, value: 'しいわく' },
    ]);

    const result = getMarksForRange(doc, 't1', 't3');
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('m1');
  });

  it('範囲内に収まるマークを取得する', () => {
    const doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't2', to: 't2' }, value: 'いわく' },
    ]);

    const result = getMarksForRange(doc, 't1', 't3');
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('m1');
  });

  it('範囲と部分的に重なるマーク（左側）を取得する', () => {
    const doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't2' }, value: 'しいわく' },
    ]);

    const result = getMarksForRange(doc, 't2', 't3');
    expect(result).toHaveLength(1);
  });

  it('範囲と部分的に重なるマーク（右側）を取得する', () => {
    const doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't2', to: 't3' }, value: 'いわく' },
    ]);

    const result = getMarksForRange(doc, 't1', 't2');
    expect(result).toHaveLength(1);
  });

  it('範囲より広いマークを取得する（superset）', () => {
    const doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't3' }, value: 'しいわく' },
    ]);

    const result = getMarksForRange(doc, 't2', 't2');
    expect(result).toHaveLength(1);
  });

  it('範囲外のマークは取得しない', () => {
    const doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'し' },
    ]);

    const result = getMarksForRange(doc, 't2', 't3');
    expect(result).toHaveLength(0);
  });

  it('隣接するが重ならないマークは取得しない', () => {
    const doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'し' },
      { type: 'yomigana', id: 'm2', anchor: { from: 't3', to: 't3' }, value: 'まなぶ' },
    ]);

    const result = getMarksForRange(doc, 't2', 't2');
    expect(result).toHaveLength(0);
  });

  it('複数の重なるマークを全て取得する', () => {
    const doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'し' },
      { type: 'yomigana', id: 'm2', anchor: { from: 't2', to: 't3' }, value: 'いわく' },
      { type: 'kaeri', id: 'm3', anchor: { from: 't2', to: 't2' }, value: 'レ' },
    ]);

    const result = getMarksForRange(doc, 't1', 't3');
    expect(result).toHaveLength(3);
  });

  it('position ベースのマーク（kutoten）が範囲内なら取得する', () => {
    const doc = createTestDocument([
      { type: 'kutoten', id: 'm1', position: { blockId: 'b1', after: 't2' }, value: '。' },
    ]);

    const result = getMarksForRange(doc, 't1', 't3');
    expect(result).toHaveLength(1);
  });

  it('position ベースのマークが範囲外なら取得しない', () => {
    const doc = createTestDocument([
      { type: 'kutoten', id: 'm1', position: { blockId: 'b1', after: 't3' }, value: '。' },
    ]);

    const result = getMarksForRange(doc, 't1', 't2');
    expect(result).toHaveLength(0);
  });

  it('存在しないtokenIdの場合は空配列を返す', () => {
    const doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'し' },
    ]);

    const result = getMarksForRange(doc, 't999', 't1');
    expect(result).toHaveLength(0);
  });

  it('無効なanchorを持つマークは除外する', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'okurigana', id: 'm2', anchor: { from: 'invalid', to: 'invalid' }, value: 'ク' },
    ]);

    const result = getMarksForRange(doc, 't1', 't3');
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('m1');
  });

  it('単一トークン範囲で getMarksForToken と同じ結果を返す', () => {
    const doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't3' }, value: 'しいわく' },
      { type: 'kaeri', id: 'm2', anchor: { from: 't2', to: 't2' }, value: 'レ' },
      { type: 'kutoten', id: 'm3', position: { blockId: 'b1', after: 't2' }, value: '。' },
    ]);

    const rangeResult = getMarksForRange(doc, 't2', 't2');
    const tokenResult = getMarksForToken(doc, 't2');
    expect(rangeResult.map((m) => m.id).sort()).toEqual(tokenResult.map((m) => m.id).sort());
  });
});
