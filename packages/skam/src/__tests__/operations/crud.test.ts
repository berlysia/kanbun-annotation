import { describe, it, expect } from 'vitest';
import type { KaeriMark, EmphasisMark, HighlightMark, OkuriganaMark } from '../../index.js';
import {
  addMark,
  addMarkWithResult,
  updateMark,
  replaceMark,
  removeMark,
  removeHighlightWithRef,
  type MarkInput,
} from '../../operations/index.js';
import { assertValidDocument, createTestDocument, createMultiBlockDocument } from './helpers.js';

// ============================================================================
// 2. addMark
// ============================================================================

describe('addMark', () => {
  it('2.1: マークを追加し、新しいドキュメントを返す', () => {
    const doc = createTestDocument([]);
    assertValidDocument(doc);
    const newMark: MarkInput = {
      type: 'okurigana',
      anchor: { from: 't1', to: 't1' },
      value: 'ク',
    };

    const result = addMark(doc, newMark);
    assertValidDocument(result);

    expect(result.marks).toHaveLength(1);
    expect(result.marks[0]?.id).toMatch(/^m-[0-9a-f]{8}$/);
    expect(result.marks[0]).toMatchObject({
      type: 'okurigana',
      anchor: { from: 't1', to: 't1' },
      value: 'ク',
    });
  });

  it('2.2: 元のドキュメントは変更されない（イミュータブル）', () => {
    const doc = createTestDocument([]);
    const newMark: MarkInput = {
      type: 'okurigana',
      anchor: { from: 't1', to: 't1' },
      value: 'ク',
    };

    addMark(doc, newMark);

    expect(doc.marks).toHaveLength(0);
  });

  it('2.3: 既存のマークを保持しつつ新しいマークを追加する', () => {
    const existingMark: KaeriMark = {
      type: 'kaeri',
      id: 'm1',
      position: { blockId: 'b1', after: 't1' },
      value: 'レ',
    };
    const doc = createTestDocument([existingMark]);
    assertValidDocument(doc);
    const newMark: MarkInput = {
      type: 'okurigana',
      anchor: { from: 't2', to: 't2' },
      value: 'ク',
    };

    const result = addMark(doc, newMark);
    assertValidDocument(result);

    expect(result.marks).toHaveLength(2);
    expect(result.marks[0]).toEqual(existingMark);
    expect(result.marks[1]?.id).toMatch(/^m-[0-9a-f]{8}$/);
  });

  it('2.4: 渡されたmarkにidがあっても新しいidで上書きされる', () => {
    const doc = createTestDocument([]);
    const newMark: MarkInput = {
      type: 'okurigana',
      id: 'old-id',
      anchor: { from: 't1', to: 't1' },
      value: 'ク',
    };

    const result = addMark(doc, newMark);

    expect(result.marks[0]?.id).toMatch(/^m-[0-9a-f]{8}$/);
    expect(result.marks[0]?.id).not.toBe('old-id');
  });

  it('2.5: value無しマーク（okimoji）を追加できる', () => {
    const doc = createTestDocument([]);
    const result = addMark(doc, {
      type: 'okimoji',
      anchor: { from: 't1', to: 't1' },
    });
    assertValidDocument(result);

    expect(result.marks).toHaveLength(1);
    expect(result.marks[0]?.type).toBe('okimoji');
  });

  it('2.6: forms有りマーク（saidoku）を追加できる', () => {
    const doc = createTestDocument([]);
    const result = addMark(doc, {
      type: 'saidoku',
      anchor: { from: 't1', to: 't1' },
      forms: [{ yomi: 'まさに' }, { yomi: 'べし' }],
    });
    assertValidDocument(result);

    expect(result.marks).toHaveLength(1);
    expect(result.marks[0]?.type).toBe('saidoku');
  });

  it('2.7: position-based マーク（kutoten）を追加できる', () => {
    const doc = createTestDocument([]);
    const result = addMark(doc, {
      type: 'kutoten',
      position: { blockId: 'b1', after: 't2' },
      value: '。',
    });
    assertValidDocument(result);

    expect(result.marks).toHaveLength(1);
    expect(result.marks[0]?.type).toBe('kutoten');
  });

  it('2.8: ref マークを追加できる', () => {
    const doc = createTestDocument([]);
    const result = addMark(doc, {
      type: 'ref',
      position: { blockId: 'b1', after: 't3' },
      format: 'iroha-katakana',
    });
    assertValidDocument(result);

    expect(result.marks).toHaveLength(1);
    expect(result.marks[0]?.type).toBe('ref');
  });

  it('2.9: 複数ブロック: b1に追加できる', () => {
    const doc = createMultiBlockDocument([]);
    assertValidDocument(doc);
    const result = addMark(doc, {
      type: 'okurigana',
      anchor: { from: 't1', to: 't1' },
      value: 'ク',
    });
    assertValidDocument(result);

    expect(result.marks).toHaveLength(1);
    const mark = result.marks[0];
    expect(mark != null && 'anchor' in mark && mark.anchor.from).toBe('t1');
  });

  it('2.10: 複数ブロック: b2に追加できる', () => {
    const doc = createMultiBlockDocument([]);
    const result = addMark(doc, {
      type: 'okurigana',
      anchor: { from: 't4', to: 't4' },
      value: 'テ',
    });
    assertValidDocument(result);

    expect(result.marks).toHaveLength(1);
    const mark = result.marks[0];
    expect(mark != null && 'anchor' in mark && mark.anchor.from).toBe('t4');
  });
});

// ============================================================================
// 2b. addMarkWithResult
// ============================================================================

describe('addMarkWithResult', () => {
  it('2b.1: doc と markId を返す', () => {
    const doc = createTestDocument([]);
    assertValidDocument(doc);
    const newMark: MarkInput = {
      type: 'okurigana',
      anchor: { from: 't1', to: 't1' },
      value: 'ク',
    };

    const result = addMarkWithResult(doc, newMark);
    assertValidDocument(result.doc);

    expect(result.markId).toMatch(/^m-[0-9a-f]{8}$/);
    expect(result.doc.marks).toHaveLength(1);
    expect(result.doc.marks[0]?.id).toBe(result.markId);
  });

  it('2b.2: addMark と同じ構造のドキュメントを返す', () => {
    const doc = createTestDocument([]);
    const newMark: MarkInput = {
      type: 'kaeri',
      position: { blockId: 'b1', after: 't1' },
      value: 'レ',
    };

    const withResult = addMarkWithResult(doc, newMark);
    const withoutResult = addMark(doc, newMark);

    // ランダムIDのため完全一致は不可。構造が同じことを検証
    expect(withResult.doc.tokens).toEqual(withoutResult.tokens);
    expect(withResult.doc.blocks).toEqual(withoutResult.blocks);
    expect(withResult.doc.marks).toHaveLength(withoutResult.marks.length);
    expect(withResult.doc.marks[0]?.type).toBe(withoutResult.marks[0]?.type);
  });

  it('2b.3: 元のドキュメントは変更されない（イミュータブル）', () => {
    const doc = createTestDocument([]);
    addMarkWithResult(doc, {
      type: 'okurigana',
      anchor: { from: 't1', to: 't1' },
      value: 'ク',
    });

    expect(doc.marks).toHaveLength(0);
  });

  it('2b.4: 既存マークがある場合はユニークな markId を返す', () => {
    const existing: KaeriMark = {
      type: 'kaeri',
      id: 'm1',
      position: { blockId: 'b1', after: 't1' },
      value: 'レ',
    };
    const doc = createTestDocument([existing]);
    assertValidDocument(doc);

    const result = addMarkWithResult(doc, {
      type: 'okurigana',
      anchor: { from: 't2', to: 't2' },
      value: 'ク',
    });

    expect(result.markId).toMatch(/^m-[0-9a-f]{8}$/);
    expect(result.doc.marks).toHaveLength(2);
  });
});

// ============================================================================
// 3. updateMark
// ============================================================================

describe('updateMark', () => {
  it('3.1: anchor を更新し、新しいドキュメントを返す', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
    ]);
    assertValidDocument(doc);

    const result = updateMark(doc, 'm1', { anchor: { from: 't2', to: 't2' } });
    assertValidDocument(result);

    expect(result.marks[0]).toEqual({
      type: 'okurigana',
      id: 'm1',
      anchor: { from: 't2', to: 't2' },
      value: 'ク',
    });
  });

  it('3.2: 元のドキュメントは変更されない（イミュータブル）', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
    ]);

    updateMark(doc, 'm1', { anchor: { from: 't2', to: 't2' } });

    const mark = doc.marks[0];
    expect(mark != null && 'anchor' in mark && mark.anchor).toEqual({ from: 't1', to: 't1' });
  });

  it('3.3: 存在しないmarkIdの場合は元のドキュメントを返す', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
    ]);

    const result = updateMark(doc, 'm999', { anchor: { from: 't2', to: 't2' } });

    expect(result).toBe(doc);
  });

  it('3.4: placementHint を更新できる', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
    ]);

    const result = updateMark(doc, 'm1', { placementHint: 'left' });
    assertValidDocument(result);

    expect(result.marks[0]?.placementHint).toBe('left');
    const mark = result.marks[0];
    expect(mark != null && 'anchor' in mark && mark.anchor).toEqual({ from: 't1', to: 't1' });
  });

  it('3.5: ext を更新できる', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
    ]);

    const result = updateMark(doc, 'm1', { ext: { source: 'manual' } });
    assertValidDocument(result);

    expect(result.marks[0]?.ext).toEqual({ source: 'manual' });
    expect(result.marks[0]?.type).toBe('okurigana');
  });

  it('3.6: 複数ブロック: b1のマークを更新できる', () => {
    const doc = createMultiBlockDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
    ]);
    assertValidDocument(doc);

    const result = updateMark(doc, 'm1', { anchor: { from: 't2', to: 't2' } });
    assertValidDocument(result);

    const mark = result.marks[0];
    expect(mark != null && 'anchor' in mark && mark.anchor).toEqual({ from: 't2', to: 't2' });
  });

  it('3.7: 複数ブロック: b2のマークを更新できる', () => {
    const doc = createMultiBlockDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't4', to: 't4' }, value: 'テ' },
    ]);
    assertValidDocument(doc);

    const result = updateMark(doc, 'm1', { anchor: { from: 't5', to: 't5' } });
    assertValidDocument(result);

    const mark = result.marks[0];
    expect(mark != null && 'anchor' in mark && mark.anchor).toEqual({ from: 't5', to: 't5' });
  });
});

// ============================================================================
// 4. replaceMark
// ============================================================================

describe('replaceMark', () => {
  it('4.1: 基本置き換え（同type, value変更）', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
    ]);
    assertValidDocument(doc);

    const result = replaceMark(doc, 'm1', {
      type: 'okurigana',
      anchor: { from: 't1', to: 't1' },
      value: 'シ',
    });
    assertValidDocument(result);

    expect(result.marks[0]?.id).toBe('m1');
    expect((result.marks[0] as OkuriganaMark).value).toBe('シ');
  });

  it('4.2: 元のドキュメントは変更されない（イミュータブル）', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
    ]);

    replaceMark(doc, 'm1', {
      type: 'okurigana',
      anchor: { from: 't1', to: 't1' },
      value: 'シ',
    });

    expect((doc.marks[0] as OkuriganaMark).value).toBe('ク');
  });

  it('4.3: 存在しないmarkIdの場合は元のドキュメントを返す', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
    ]);

    const result = replaceMark(doc, 'm999', {
      type: 'okurigana',
      anchor: { from: 't1', to: 't1' },
      value: 'シ',
    });

    expect(result).toBe(doc);
  });

  it('4.4: emphasis スタイル変更', () => {
    const doc = createTestDocument([
      {
        type: 'emphasis',
        id: 'm1',
        anchor: { from: 't1', to: 't2' },
        style: 'filled dot',
      },
    ]);
    assertValidDocument(doc);

    const result = replaceMark(doc, 'm1', {
      type: 'emphasis',
      anchor: { from: 't1', to: 't2' },
      style: 'open circle',
    });
    assertValidDocument(result);

    expect(result.marks[0]?.id).toBe('m1');
    expect((result.marks[0] as EmphasisMark).style).toBe('open circle');
  });

  it('4.5: highlight スタイル変更', () => {
    const doc = createTestDocument([
      {
        type: 'highlight',
        id: 'm1',
        anchor: { from: 't1', to: 't2' },
        style: 'solid',
      },
    ]);
    assertValidDocument(doc);

    const result = replaceMark(doc, 'm1', {
      type: 'highlight',
      anchor: { from: 't1', to: 't2' },
      style: 'wavy',
    });
    assertValidDocument(result);

    expect(result.marks[0]?.id).toBe('m1');
    expect((result.marks[0] as HighlightMark).style).toBe('wavy');
  });

  it('4.6: 配列内の位置を維持する', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'kaeri', id: 'm2', position: { blockId: 'b1', after: 't2' }, value: 'レ' },
      { type: 'okurigana', id: 'm3', anchor: { from: 't3', to: 't3' }, value: 'ブ' },
    ]);
    assertValidDocument(doc);

    const result = replaceMark(doc, 'm2', {
      type: 'kaeri',
      position: { blockId: 'b1', after: 't2' },
      value: '一',
    });
    assertValidDocument(result);

    expect(result.marks[0]?.id).toBe('m1');
    expect(result.marks[1]?.id).toBe('m2');
    expect((result.marks[1] as KaeriMark).value).toBe('一');
    expect(result.marks[2]?.id).toBe('m3');
    expect((result.marks[0] as OkuriganaMark).value).toBe('ク');
    expect((result.marks[2] as OkuriganaMark).value).toBe('ブ');
  });
});

// ============================================================================
// 5. removeMark
// ============================================================================

describe('removeMark', () => {
  it('5.1: マークを削除し、新しいドキュメントを返す', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'kaeri', id: 'm2', position: { blockId: 'b1', after: 't2' }, value: 'レ' },
    ]);
    assertValidDocument(doc);

    const result = removeMark(doc, 'm1');
    assertValidDocument(result);

    expect(result.marks).toHaveLength(1);
    expect(result.marks[0]?.id).toBe('m2');
  });

  it('5.2: 元のドキュメントは変更されない（イミュータブル）', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
    ]);

    removeMark(doc, 'm1');

    expect(doc.marks).toHaveLength(1);
  });

  it('5.3: 存在しないmarkIdの場合は元のドキュメントを返す', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
    ]);

    const result = removeMark(doc, 'm999');

    expect(result).toBe(doc);
  });

  it('5.4: position-based マーク（kutoten）を削除できる', () => {
    const doc = createTestDocument([
      { type: 'kutoten', id: 'm1', position: { blockId: 'b1', after: 't2' }, value: '。' },
    ]);
    assertValidDocument(doc);

    const result = removeMark(doc, 'm1');
    assertValidDocument(result);

    expect(result.marks).toHaveLength(0);
  });

  it('5.5: 複数ブロック: b2のマークを削除しb1のマークは残る', () => {
    const doc = createMultiBlockDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'okurigana', id: 'm2', anchor: { from: 't4', to: 't4' }, value: 'テ' },
    ]);
    assertValidDocument(doc);

    const result = removeMark(doc, 'm2');
    assertValidDocument(result);

    expect(result.marks).toHaveLength(1);
    expect(result.marks[0]?.id).toBe('m1');
  });
});

// ============================================================================
// 6. removeHighlightWithRef
// ============================================================================

describe('removeHighlightWithRef', () => {
  it('6.1: highlight と参照先 ref を両方削除する', () => {
    const doc = createTestDocument([
      {
        type: 'highlight',
        id: 'm1',
        anchor: { from: 't1', to: 't2' },
        style: 'solid',
        ref: 'ref-1',
      } as HighlightMark,
      {
        type: 'ref',
        id: 'ref-1',
        position: { blockId: 'b1', after: 't2' },
        format: 'iroha-katakana',
      },
    ]);
    assertValidDocument(doc);

    const result = removeHighlightWithRef(doc, 'm1');
    assertValidDocument(result);

    expect(result.marks).toHaveLength(0);
  });

  it('6.2: ref がない highlight のみ削除する', () => {
    const doc = createTestDocument([
      {
        type: 'highlight',
        id: 'm1',
        anchor: { from: 't1', to: 't2' },
        style: 'solid',
      } as HighlightMark,
    ]);
    assertValidDocument(doc);

    const result = removeHighlightWithRef(doc, 'm1');
    assertValidDocument(result);

    expect(result.marks).toHaveLength(0);
  });

  it('6.3: 他のマークは残る', () => {
    const doc = createTestDocument([
      {
        type: 'highlight',
        id: 'm1',
        anchor: { from: 't1', to: 't2' },
        style: 'solid',
        ref: 'ref-1',
      } as HighlightMark,
      {
        type: 'ref',
        id: 'ref-1',
        position: { blockId: 'b1', after: 't2' },
        format: 'iroha-katakana',
      },
      {
        type: 'okurigana',
        id: 'm2',
        anchor: { from: 't3', to: 't3' },
        value: 'ブ',
      },
    ]);
    assertValidDocument(doc);

    const result = removeHighlightWithRef(doc, 'm1');
    assertValidDocument(result);

    expect(result.marks).toHaveLength(1);
    expect(result.marks[0]?.id).toBe('m2');
  });

  it('6.4: 存在しない markId の場合は元のドキュメントを返す', () => {
    const doc = createTestDocument([
      {
        type: 'highlight',
        id: 'm1',
        anchor: { from: 't1', to: 't2' },
        style: 'solid',
      } as HighlightMark,
    ]);

    const result = removeHighlightWithRef(doc, 'm999');

    expect(result).toBe(doc);
  });

  it('6.5: ref が指す先が既に存在しない場合は highlight のみ削除する', () => {
    const doc = createTestDocument([
      {
        type: 'highlight',
        id: 'm1',
        anchor: { from: 't1', to: 't2' },
        style: 'solid',
        ref: 'ref-missing',
      } as HighlightMark,
    ]);
    assertValidDocument(doc);

    const result = removeHighlightWithRef(doc, 'm1');
    assertValidDocument(result);

    expect(result.marks).toHaveLength(0);
  });

  it('6.6: 元のドキュメントは変更されない（イミュータブル）', () => {
    const doc = createTestDocument([
      {
        type: 'highlight',
        id: 'm1',
        anchor: { from: 't1', to: 't2' },
        style: 'solid',
        ref: 'ref-1',
      } as HighlightMark,
      {
        type: 'ref',
        id: 'ref-1',
        position: { blockId: 'b1', after: 't2' },
        format: 'iroha-katakana',
      },
    ]);

    removeHighlightWithRef(doc, 'm1');

    expect(doc.marks).toHaveLength(2);
  });
});
