import { describe, it, expect } from 'vitest';
import type { SKAMDocument, Mark } from '@kanbun/skam';
import { addMark, removeMark, getMarksForToken, getMarksForRange } from '@kanbun/skam';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * 5トークンのテスト用ドキュメントを作成
 *
 * tokens: t1=子, t2=曰, t3=學, t4=而, t5=時
 */
function createDoc(marks: Mark[] = []): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '子' },
      { id: 't2', text: '曰' },
      { id: 't3', text: '學' },
      { id: 't4', text: '而' },
      { id: 't5', text: '時' },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4', 't5'] }],
    marks,
    readings: [],
  };
}

type KanaType = 'yomigana' | 'okurigana' | 'soegana';

/**
 * main.ts の updateSelectionPanel における仮名検出ロジックをシミュレート
 *
 * 修正後: getMarksForRange(doc, fromId, toId) で選択範囲全体のマークを取得し、
 * yomigana/okurigana/soegana の値を抽出する。
 */
function detectKanaValues(
  doc: SKAMDocument,
  fromId: string,
  toId: string
): Record<KanaType, string> {
  const result: Record<KanaType, string> = {
    yomigana: '',
    okurigana: '',
    soegana: '',
  };

  const marks = getMarksForRange(doc, fromId, toId);
  for (const mark of marks) {
    if ('value' in mark && typeof mark.value === 'string') {
      if (mark.type === 'yomigana' || mark.type === 'okurigana' || mark.type === 'soegana') {
        if (!result[mark.type]) {
          result[mark.type] = mark.value;
        }
      }
    }
  }

  return result;
}

/**
 * main.ts の handleKanaApply ロジックをシミュレート
 *
 * 修正後: getMarksForRange(doc, fromId, toId) で選択範囲全体から同タイプのマークを検索し、
 * - 完全一致: 削除して新マークで置換
 * - 部分重なり: 操作を拒否（null を返す）
 * - 重なりなし: 新マークを追加
 */
function applyKana(
  doc: SKAMDocument,
  fromId: string,
  toId: string,
  type: KanaType,
  value: string
): SKAMDocument | null {
  // 選択範囲の正規化
  const tokens = doc.tokens;
  const fromIndex = tokens.findIndex((t) => t.id === fromId);
  const toIndex = tokens.findIndex((t) => t.id === toId);
  if (fromIndex === -1 || toIndex === -1) return doc;
  const startIndex = Math.min(fromIndex, toIndex);
  const endIndex = Math.max(fromIndex, toIndex);
  const normalizedFromId = tokens[startIndex]!.id;
  const normalizedToId = tokens[endIndex]!.id;

  let newDoc = doc;

  // 選択範囲全体から既存の同タイプマークを検索
  const existingMarks = getMarksForRange(doc, normalizedFromId, normalizedToId).filter(
    (m) => m.type === type
  );

  if (existingMarks.length > 0) {
    // 部分重なりチェック: 完全一致でないマークがあれば拒否
    const hasPartialOverlap = existingMarks.some(
      (m) =>
        !('anchor' in m) || m.anchor.from !== normalizedFromId || m.anchor.to !== normalizedToId
    );

    if (hasPartialOverlap) {
      return null; // 拒否
    }

    // 完全一致: 全て削除して置換
    for (const mark of existingMarks) {
      if (mark.id) {
        newDoc = removeMark(newDoc, mark.id);
      }
    }
  }

  // 新しいマークを追加
  newDoc = addMark(newDoc, {
    type,
    value,
    anchor: { from: normalizedFromId, to: normalizedToId },
  });

  return newDoc;
}

/**
 * 指定タイプのマークをドキュメントから全て取得
 */
function getMarksByType(doc: SKAMDocument, type: string): Mark[] {
  return doc.marks.filter((m) => m.type === type);
}

// ============================================================================
// A. 仮名マーク検出テスト（選択範囲に対する既存仮名の取得）
// ============================================================================

describe('仮名マーク検出: 選択範囲と既存仮名マークの関係', () => {
  describe('単一トークン選択', () => {
    it('同一トークン上の仮名を検出する', () => {
      const doc = createDoc([
        { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'し' },
      ]);

      const result = detectKanaValues(doc, 't1', 't1');
      expect(result.yomigana).toBe('し');
    });

    it('選択トークンを含む広い範囲の仮名を検出する', () => {
      // yomigana が t1-t3 に付いていて、t1 を選択
      const doc = createDoc([
        { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't3' }, value: 'しいわく' },
      ]);

      const result = detectKanaValues(doc, 't1', 't1');
      expect(result.yomigana).toBe('しいわく');
    });

    it('選択トークンに関係ない仮名は検出しない', () => {
      const doc = createDoc([
        { type: 'yomigana', id: 'm1', anchor: { from: 't2', to: 't3' }, value: 'いわく' },
      ]);

      const result = detectKanaValues(doc, 't1', 't1');
      expect(result.yomigana).toBe('');
    });

    it('複数タイプの仮名をそれぞれ検出する', () => {
      const doc = createDoc([
        { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'し' },
        { type: 'okurigana', id: 'm2', anchor: { from: 't1', to: 't1' }, value: 'のたまわく' },
      ]);

      const result = detectKanaValues(doc, 't1', 't1');
      expect(result.yomigana).toBe('し');
      expect(result.okurigana).toBe('のたまわく');
      expect(result.soegana).toBe('');
    });
  });

  describe('複数トークン選択', () => {
    it('最初のトークン上の仮名を検出する', () => {
      const doc = createDoc([
        { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'し' },
      ]);

      const result = detectKanaValues(doc, 't1', 't3');
      expect(result.yomigana).toBe('し');
    });

    it('選択範囲と完全一致する仮名を検出する', () => {
      const doc = createDoc([
        { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't3' }, value: 'しいわく' },
      ]);

      const result = detectKanaValues(doc, 't1', 't3');
      expect(result.yomigana).toBe('しいわく');
    });

    it('最後のトークンにのみ付いた仮名も検出する', () => {
      // t3 にだけ yomigana があり、t1-t3 を選択
      const doc = createDoc([
        { type: 'yomigana', id: 'm1', anchor: { from: 't3', to: 't3' }, value: 'まなぶ' },
      ]);

      const result = detectKanaValues(doc, 't1', 't3');
      expect(result.yomigana).toBe('まなぶ');
    });

    it('中間トークンにのみ付いた仮名も検出する', () => {
      // t2 にだけ yomigana があり、t1-t3 を選択
      const doc = createDoc([
        { type: 'yomigana', id: 'm1', anchor: { from: 't2', to: 't2' }, value: 'いわく' },
      ]);

      const result = detectKanaValues(doc, 't1', 't3');
      expect(result.yomigana).toBe('いわく');
    });

    it('選択範囲の後半だけをカバーする仮名も検出する', () => {
      // t2-t3 に yomigana があり、t1-t3 を選択
      const doc = createDoc([
        { type: 'yomigana', id: 'm1', anchor: { from: 't2', to: 't3' }, value: 'いわく' },
      ]);

      const result = detectKanaValues(doc, 't1', 't3');
      expect(result.yomigana).toBe('いわく');
    });

    it('選択範囲より広い仮名は検出する（最初のトークンを含むため）', () => {
      // t1-t5 に yomigana があり、t2-t3 を選択
      const doc = createDoc([
        {
          type: 'yomigana',
          id: 'm1',
          anchor: { from: 't1', to: 't5' },
          value: 'しいわくまなびて',
        },
      ]);

      // t2 を選択の先頭にしている場合、t1-t5 の yomigana は t2 を含むので検出される
      const result = detectKanaValues(doc, 't2', 't3');
      expect(result.yomigana).toBe('しいわくまなびて');
    });
  });
});

// ============================================================================
// B. 仮名の適用テスト（選択範囲に対する仮名の追加・更新）
// ============================================================================

describe('仮名の適用: 選択範囲に対する仮名マークの追加・更新', () => {
  describe('単一トークンへの適用', () => {
    it('既存マークなし → 新規追加', () => {
      const doc = createDoc([]);

      const result = applyKana(doc, 't1', 't1', 'yomigana', 'し');
      expect(result).not.toBeNull();

      const marks = getMarksByType(result!, 'yomigana');
      expect(marks).toHaveLength(1);
      expect(marks[0]).toMatchObject({
        type: 'yomigana',
        anchor: { from: 't1', to: 't1' },
        value: 'し',
      });
    });

    it('同タイプの既存マーク → 置換', () => {
      const doc = createDoc([
        { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'こ' },
      ]);

      const result = applyKana(doc, 't1', 't1', 'yomigana', 'し');
      expect(result).not.toBeNull();

      const marks = getMarksByType(result!, 'yomigana');
      expect(marks).toHaveLength(1);
      expect((marks[0] as { value: string }).value).toBe('し');
    });

    it('異なるタイプの既存マークは影響を受けない', () => {
      const doc = createDoc([
        { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'のたまわく' },
      ]);

      const result = applyKana(doc, 't1', 't1', 'yomigana', 'し');
      expect(result).not.toBeNull();

      expect(getMarksByType(result!, 'okurigana')).toHaveLength(1);
      expect(getMarksByType(result!, 'yomigana')).toHaveLength(1);
    });

    it('返り点など他種のマークは影響を受けない', () => {
      const doc = createDoc([
        { type: 'kaeri', id: 'm1', position: { blockId: 'b1', after: 't1' }, value: 'レ' },
      ]);

      const result = applyKana(doc, 't1', 't1', 'yomigana', 'し');
      expect(result).not.toBeNull();

      expect(getMarksByType(result!, 'kaeri')).toHaveLength(1);
      expect(getMarksByType(result!, 'yomigana')).toHaveLength(1);
    });
  });

  describe('複数トークンへの適用', () => {
    it('既存マークなし → 範囲指定で新規追加', () => {
      const doc = createDoc([]);

      const result = applyKana(doc, 't1', 't3', 'yomigana', 'しいわく');
      expect(result).not.toBeNull();

      const marks = getMarksByType(result!, 'yomigana');
      expect(marks).toHaveLength(1);
      expect(marks[0]).toMatchObject({
        type: 'yomigana',
        anchor: { from: 't1', to: 't3' },
        value: 'しいわく',
      });
    });

    it('最初のトークンに既存マーク → 部分重なりのため拒否', () => {
      // t1 にだけ yomigana があり、t1-t3 を選択して適用
      const doc = createDoc([
        { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'し' },
      ]);

      const result = applyKana(doc, 't1', 't3', 'yomigana', 'しいわく');

      expect(result).toBeNull();
    });

    it('最後のトークンにのみ既存マーク → 部分重なりのため拒否', () => {
      // t3 にだけ yomigana があり、t1-t3 を選択して適用
      const doc = createDoc([
        { type: 'yomigana', id: 'm1', anchor: { from: 't3', to: 't3' }, value: 'まなぶ' },
      ]);

      const result = applyKana(doc, 't1', 't3', 'yomigana', 'しいわく');

      expect(result).toBeNull();
    });

    it('中間トークンにのみ既存マーク → 部分重なりのため拒否', () => {
      // t2 にだけ yomigana があり、t1-t3 を選択して適用
      const doc = createDoc([
        { type: 'yomigana', id: 'm1', anchor: { from: 't2', to: 't2' }, value: 'いわく' },
      ]);

      const result = applyKana(doc, 't1', 't3', 'yomigana', 'しいわく');

      expect(result).toBeNull();
    });

    it('選択範囲の後半にまたがる既存マーク → 部分重なりのため拒否', () => {
      // t2-t3 に yomigana があり、t1-t3 を選択して適用
      const doc = createDoc([
        { type: 'yomigana', id: 'm1', anchor: { from: 't2', to: 't3' }, value: 'いわく' },
      ]);

      const result = applyKana(doc, 't1', 't3', 'yomigana', 'しいわく');

      expect(result).toBeNull();
    });

    it('選択範囲と完全一致する既存マーク → 正しく置換', () => {
      const doc = createDoc([
        { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't3' }, value: 'しいわく' },
      ]);

      const result = applyKana(doc, 't1', 't3', 'yomigana', 'しのたまわく');
      expect(result).not.toBeNull();

      const marks = getMarksByType(result!, 'yomigana');
      expect(marks).toHaveLength(1);
      expect((marks[0] as { value: string }).value).toBe('しのたまわく');
    });

    it('選択範囲より広い既存マーク → 部分重なりのため拒否', () => {
      // t1-t5 に yomigana があり、t1-t3 を選択して適用
      const doc = createDoc([
        {
          type: 'yomigana',
          id: 'm1',
          anchor: { from: 't1', to: 't5' },
          value: 'しいわくまなびて',
        },
      ]);

      const result = applyKana(doc, 't1', 't3', 'yomigana', 'しいわく');

      expect(result).toBeNull();
    });

    it('選択範囲の前半だけをカバーする既存マーク → 部分重なりのため拒否', () => {
      // t1-t2 に yomigana があり、t1-t3 を選択して適用
      const doc = createDoc([
        { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't2' }, value: 'しいわく' },
      ]);

      const result = applyKana(doc, 't1', 't3', 'yomigana', 'しいわくまなぶ');

      expect(result).toBeNull();
    });
  });

  describe('選択範囲の縮小', () => {
    it('広い範囲のマークを狭い範囲に縮小しようとすると部分重なりのため拒否', () => {
      // t1-t3 に yomigana があり、t1-t1 を選択して適用
      const doc = createDoc([
        { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't3' }, value: 'しいわく' },
      ]);

      const result = applyKana(doc, 't1', 't1', 'yomigana', 'し');

      expect(result).toBeNull();
    });

    it('選択範囲外の既存マークは残る（重なりなし → 新規追加）', () => {
      // t3-t5 に yomigana があり、t1-t2 を選択して適用
      const doc = createDoc([
        { type: 'yomigana', id: 'm1', anchor: { from: 't3', to: 't5' }, value: 'がくじとき' },
      ]);

      const result = applyKana(doc, 't1', 't2', 'yomigana', 'しいわく');

      expect(result).not.toBeNull();
      const marks = getMarksByType(result!, 'yomigana');
      // t3-t5 のマークは選択範囲 t1-t2 と重ならないので残る
      expect(marks).toHaveLength(2);
    });
  });
});

// ============================================================================
// C. 複数仮名タイプの共存テスト
// ============================================================================

describe('複数仮名タイプの共存', () => {
  it('同一トークンに yomigana と okurigana の両方を適用できる', () => {
    let doc = createDoc([]);

    doc = applyKana(doc, 't3', 't3', 'yomigana', 'まな')!;
    doc = applyKana(doc, 't3', 't3', 'okurigana', 'ぶ')!;

    expect(getMarksByType(doc, 'yomigana')).toHaveLength(1);
    expect(getMarksByType(doc, 'okurigana')).toHaveLength(1);
  });

  it('yomigana を更新しても okurigana は影響を受けない', () => {
    let doc = createDoc([
      { type: 'yomigana', id: 'm1', anchor: { from: 't3', to: 't3' }, value: 'がく' },
      { type: 'okurigana', id: 'm2', anchor: { from: 't3', to: 't3' }, value: 'ぶ' },
    ]);

    doc = applyKana(doc, 't3', 't3', 'yomigana', 'まな')!;

    const yomigana = getMarksByType(doc, 'yomigana');
    const okurigana = getMarksByType(doc, 'okurigana');
    expect(yomigana).toHaveLength(1);
    expect((yomigana[0] as { value: string }).value).toBe('まな');
    expect(okurigana).toHaveLength(1);
    expect((okurigana[0] as { value: string }).value).toBe('ぶ');
  });

  it('3タイプ全てが同時に存在できる', () => {
    let doc = createDoc([]);

    doc = applyKana(doc, 't3', 't3', 'yomigana', 'まな')!;
    doc = applyKana(doc, 't3', 't3', 'okurigana', 'ぶ')!;
    doc = applyKana(doc, 't3', 't3', 'soegana', 'を')!;

    expect(getMarksByType(doc, 'yomigana')).toHaveLength(1);
    expect(getMarksByType(doc, 'okurigana')).toHaveLength(1);
    expect(getMarksByType(doc, 'soegana')).toHaveLength(1);
  });

  it('異なるトークンの同タイプ仮名は独立して存在する', () => {
    let doc = createDoc([]);

    doc = applyKana(doc, 't1', 't1', 'yomigana', 'し')!;
    doc = applyKana(doc, 't3', 't3', 'yomigana', 'まな')!;

    const marks = getMarksByType(doc, 'yomigana');
    expect(marks).toHaveLength(2);
  });

  it('異なる範囲に同タイプが存在する場合、部分重なりのため拒否', () => {
    // t1 に yomigana "し"、t3 に yomigana "まなぶ" がある状態で t1-t3 に適用
    const doc = createDoc([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'し' },
      { type: 'yomigana', id: 'm2', anchor: { from: 't3', to: 't3' }, value: 'まなぶ' },
    ]);

    const result = applyKana(doc, 't1', 't3', 'yomigana', 'しいわく');

    // t1-t1 と t3-t3 は t1-t3 と完全一致ではないので拒否
    expect(result).toBeNull();
  });
});

// ============================================================================
// D. 返り点の操作テスト
// ============================================================================

describe('返り点の操作', () => {
  /**
   * main.ts の applyKaeriValue ロジックをシミュレート
   *
   * 実装（main.ts:1332-1376）:
   *   1. 選択範囲を正規化
   *   2. position（blockId/after）を決定（single: 先頭トークン、tateten: 末尾トークン）
   *   3. 完全一致する既存返り点を検索して削除
   *   4. 新しい返り点を追加
   */
  function applyKaeri(
    doc: SKAMDocument,
    fromId: string,
    toId: string,
    value: string | null,
    mode: 'single' | 'tateten'
  ): SKAMDocument {
    let newDoc = doc;

    const tokens = doc.tokens;
    const fromIndex = tokens.findIndex((t) => t.id === fromId);
    const toIndex = tokens.findIndex((t) => t.id === toId);
    if (fromIndex === -1 || toIndex === -1) return doc;

    const startIndex = Math.min(fromIndex, toIndex);
    const endIndex = Math.max(fromIndex, toIndex);
    const normalizedFromId = tokens[startIndex]!.id;
    const normalizedToId = tokens[endIndex]!.id;

    // position ベース: after は single モードでは先頭トークン、tateten モードでは末尾トークン
    const afterTokenId = mode === 'single' ? normalizedFromId : normalizedToId;
    // blockId は先頭トークンが属するブロックから決定
    const block = doc.blocks.find((b) => b.tokenIds.includes(normalizedFromId));
    const blockId = block?.id ?? 'b1';

    // 既存の返り点を完全一致で検索して削除
    for (const mark of doc.marks) {
      if (
        mark.type === 'kaeri' &&
        mark.position.blockId === blockId &&
        mark.position.after === afterTokenId &&
        mark.id
      ) {
        newDoc = removeMark(newDoc, mark.id);
        break;
      }
    }

    if (value) {
      newDoc = addMark(newDoc, {
        type: 'kaeri',
        value,
        position: { blockId, after: afterTokenId },
      });
    }

    return newDoc;
  }

  describe('単一トークンモード', () => {
    it('既存なし → 新規追加', () => {
      const doc = createDoc([]);

      const result = applyKaeri(doc, 't1', 't1', 'レ', 'single');

      const marks = getMarksByType(result, 'kaeri');
      expect(marks).toHaveLength(1);
      expect(marks[0]).toMatchObject({
        type: 'kaeri',
        position: { blockId: 'b1', after: 't1' },
        value: 'レ',
      });
    });

    it('既存あり → 置換', () => {
      const doc = createDoc([
        { type: 'kaeri', id: 'm1', position: { blockId: 'b1', after: 't1' }, value: 'レ' },
      ]);

      const result = applyKaeri(doc, 't1', 't1', '一', 'single');

      const marks = getMarksByType(result, 'kaeri');
      expect(marks).toHaveLength(1);
      expect((marks[0] as { value: string }).value).toBe('一');
    });

    it('null で既存を削除', () => {
      const doc = createDoc([
        { type: 'kaeri', id: 'm1', position: { blockId: 'b1', after: 't1' }, value: 'レ' },
      ]);

      const result = applyKaeri(doc, 't1', 't1', null, 'single');

      expect(getMarksByType(result, 'kaeri')).toHaveLength(0);
    });

    it('single モードでは先頭トークンの after に配置（複数トークン選択でも最初のトークンだけ）', () => {
      // t1-t3 を選択しているが single モード
      const doc = createDoc([]);

      const result = applyKaeri(doc, 't1', 't3', 'レ', 'single');

      const marks = getMarksByType(result, 'kaeri');
      expect(marks).toHaveLength(1);
      // single モードでは after === normalizedFromId
      expect(marks[0]).toMatchObject({
        position: { blockId: 'b1', after: 't1' },
      });
    });
  });

  describe('竪点モード', () => {
    it('竪点範囲全体に返り点を適用', () => {
      const doc = createDoc([{ type: 'tateten', id: 'm1', anchor: { from: 't1', to: 't2' } }]);

      const result = applyKaeri(doc, 't1', 't2', '一', 'tateten');

      const marks = getMarksByType(result, 'kaeri');
      expect(marks).toHaveLength(1);
      expect(marks[0]).toMatchObject({
        type: 'kaeri',
        position: { blockId: 'b1', after: 't2' },
        value: '一',
      });
    });

    it('竪点範囲の返り点を更新', () => {
      const doc = createDoc([
        { type: 'tateten', id: 'm1', anchor: { from: 't1', to: 't2' } },
        { type: 'kaeri', id: 'm2', position: { blockId: 'b1', after: 't2' }, value: '一' },
      ]);

      const result = applyKaeri(doc, 't1', 't2', '二', 'tateten');

      const kaeriMarks = getMarksByType(result, 'kaeri');
      expect(kaeriMarks).toHaveLength(1);
      expect((kaeriMarks[0] as { value: string }).value).toBe('二');
      // 竪点自体は残る
      expect(getMarksByType(result, 'tateten')).toHaveLength(1);
    });

    it('竪点範囲の返り点を削除しても竪点は残る', () => {
      const doc = createDoc([
        { type: 'tateten', id: 'm1', anchor: { from: 't1', to: 't2' } },
        { type: 'kaeri', id: 'm2', position: { blockId: 'b1', after: 't2' }, value: '一' },
      ]);

      const result = applyKaeri(doc, 't1', 't2', null, 'tateten');

      expect(getMarksByType(result, 'kaeri')).toHaveLength(0);
      expect(getMarksByType(result, 'tateten')).toHaveLength(1);
    });
  });
});

// ============================================================================
// E. 竪点の操作テスト
// ============================================================================

describe('竪点の操作', () => {
  /**
   * main.ts の handleTatetenToggle ロジックをシミュレート
   */
  function toggleTateten(
    doc: SKAMDocument,
    fromId: string,
    toId: string,
    mode: 'single' | 'multi' | 'tateten',
    tatetenMarkId: string | null
  ): SKAMDocument {
    let newDoc = doc;

    const tokens = doc.tokens;
    const fromIndex = tokens.findIndex((t) => t.id === fromId);
    const toIndex = tokens.findIndex((t) => t.id === toId);
    if (fromIndex === -1 || toIndex === -1) return doc;

    const startIndex = Math.min(fromIndex, toIndex);
    const endIndex = Math.max(fromIndex, toIndex);
    const normalizedFromId = tokens[startIndex]!.id;
    const normalizedToId = tokens[endIndex]!.id;

    if (mode === 'tateten' && tatetenMarkId) {
      // 既存竪点の削除（返り点は独立しており連動削除しない）
      newDoc = removeMark(newDoc, tatetenMarkId);
    } else if (mode === 'multi') {
      // 新規竪点の追加
      newDoc = addMark(newDoc, {
        type: 'tateten',
        anchor: { from: normalizedFromId, to: normalizedToId },
      });
    }

    return newDoc;
  }

  it('複数トークン選択で竪点を追加', () => {
    const doc = createDoc([]);

    const result = toggleTateten(doc, 't1', 't2', 'multi', null);

    const marks = getMarksByType(result, 'tateten');
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({
      anchor: { from: 't1', to: 't2' },
    });
  });

  it('単一トークンでは竪点を追加しない', () => {
    const doc = createDoc([]);

    const result = toggleTateten(doc, 't1', 't1', 'single', null);

    expect(getMarksByType(result, 'tateten')).toHaveLength(0);
  });

  it('竪点を解除しても関連する返り点は独立して残る', () => {
    const doc = createDoc([
      { type: 'tateten', id: 'm1', anchor: { from: 't1', to: 't2' } },
      { type: 'kaeri', id: 'm2', position: { blockId: 'b1', after: 't2' }, value: '一' },
    ]);

    const result = toggleTateten(doc, 't1', 't2', 'tateten', 'm1');

    expect(getMarksByType(result, 'tateten')).toHaveLength(0);
    expect(getMarksByType(result, 'kaeri')).toHaveLength(1);
  });

  it('竪点を解除しても他のマークは影響を受けない', () => {
    const doc = createDoc([
      { type: 'tateten', id: 'm1', anchor: { from: 't1', to: 't2' } },
      { type: 'kaeri', id: 'm2', position: { blockId: 'b1', after: 't2' }, value: '一' },
      { type: 'yomigana', id: 'm3', anchor: { from: 't1', to: 't2' }, value: 'しいわく' },
    ]);

    const result = toggleTateten(doc, 't1', 't2', 'tateten', 'm1');

    expect(getMarksByType(result, 'tateten')).toHaveLength(0);
    expect(getMarksByType(result, 'kaeri')).toHaveLength(1);
    expect(getMarksByType(result, 'yomigana')).toHaveLength(1);
  });
});

// ============================================================================
// F. 仮名と他マークの相互作用テスト
// ============================================================================

describe('仮名と他マークの相互作用', () => {
  it('返り点のあるトークンに仮名を追加しても返り点は残る', () => {
    const doc = createDoc([
      { type: 'kaeri', id: 'm1', position: { blockId: 'b1', after: 't3' }, value: 'レ' },
    ]);

    const result = applyKana(doc, 't3', 't3', 'yomigana', 'まな');
    expect(result).not.toBeNull();

    expect(getMarksByType(result!, 'kaeri')).toHaveLength(1);
    expect(getMarksByType(result!, 'yomigana')).toHaveLength(1);
  });

  it('ref マークのあるトークンに仮名を追加しても ref は残る', () => {
    const doc = createDoc([
      {
        type: 'ref',
        id: 'ref-1',
        position: { blockId: 'b1', after: 't3' },
        format: 'iroha-katakana',
      },
    ]);

    const result = applyKana(doc, 't3', 't3', 'yomigana', 'まな');
    expect(result).not.toBeNull();

    const refMarks = doc.marks.filter((m) => m.type === 'ref');
    expect(refMarks).toHaveLength(1);
    expect(getMarksByType(result!, 'yomigana')).toHaveLength(1);
  });

  it('竪点範囲のトークンに仮名を追加', () => {
    const doc = createDoc([{ type: 'tateten', id: 'm1', anchor: { from: 't1', to: 't2' } }]);

    const result = applyKana(doc, 't1', 't2', 'yomigana', 'しいわく');
    expect(result).not.toBeNull();

    expect(getMarksByType(result!, 'tateten')).toHaveLength(1);
    expect(getMarksByType(result!, 'yomigana')).toHaveLength(1);
  });
});

// ============================================================================
// G. getMarksForToken の網羅テスト
// ============================================================================

describe('getMarksForToken: アンカー範囲との関係', () => {
  it('from === to === tokenId（完全一致）', () => {
    const doc = createDoc([
      { type: 'yomigana', id: 'm1', anchor: { from: 't2', to: 't2' }, value: 'いわく' },
    ]);
    expect(getMarksForToken(doc, 't2')).toHaveLength(1);
  });

  it('from < tokenId < to（範囲内）', () => {
    const doc = createDoc([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't3' }, value: 'しいわく' },
    ]);
    expect(getMarksForToken(doc, 't2')).toHaveLength(1);
  });

  it('from === tokenId < to（左端一致）', () => {
    const doc = createDoc([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't3' }, value: 'しいわく' },
    ]);
    expect(getMarksForToken(doc, 't1')).toHaveLength(1);
  });

  it('from < tokenId === to（右端一致）', () => {
    const doc = createDoc([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't3' }, value: 'しいわく' },
    ]);
    expect(getMarksForToken(doc, 't3')).toHaveLength(1);
  });

  it('tokenId < from（範囲外・左）', () => {
    const doc = createDoc([
      { type: 'yomigana', id: 'm1', anchor: { from: 't2', to: 't3' }, value: 'いわく' },
    ]);
    expect(getMarksForToken(doc, 't1')).toHaveLength(0);
  });

  it('tokenId > to（範囲外・右）', () => {
    const doc = createDoc([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't2' }, value: 'しいわく' },
    ]);
    expect(getMarksForToken(doc, 't3')).toHaveLength(0);
  });

  it('隣接する2つのマークが別々に検出される', () => {
    const doc = createDoc([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't2' }, value: 'しいわく' },
      { type: 'yomigana', id: 'm2', anchor: { from: 't2', to: 't3' }, value: 'いわくまなぶ' },
    ]);
    // t2 は両方のマークに含まれる
    expect(getMarksForToken(doc, 't2')).toHaveLength(2);
    // t1 は m1 のみ
    expect(getMarksForToken(doc, 't1')).toHaveLength(1);
    // t3 は m2 のみ
    expect(getMarksForToken(doc, 't3')).toHaveLength(1);
  });

  it('position ベースのマーク（kutoten）は after で検索', () => {
    const doc = createDoc([
      { type: 'kutoten', id: 'm1', position: { blockId: 'b1', after: 't2' }, value: '。' },
    ]);
    expect(getMarksForToken(doc, 't2')).toHaveLength(1);
    expect(getMarksForToken(doc, 't1')).toHaveLength(0);
    expect(getMarksForToken(doc, 't3')).toHaveLength(0);
  });

  it('anchor ベースと position ベースのマークが混在', () => {
    const doc = createDoc([
      { type: 'yomigana', id: 'm1', anchor: { from: 't2', to: 't3' }, value: 'いわく' },
      { type: 'kutoten', id: 'm2', position: { blockId: 'b1', after: 't3' }, value: '。' },
    ]);
    // t3: yomigana(anchor包含) + kutoten(position一致)
    expect(getMarksForToken(doc, 't3')).toHaveLength(2);
    // t2: yomigana のみ
    expect(getMarksForToken(doc, 't2')).toHaveLength(1);
  });
});

// ============================================================================
// H. 連続操作テスト（複数回の適用シナリオ）
// ============================================================================

describe('連続操作シナリオ', () => {
  it('仮名を追加 → 別の範囲に同タイプを追加（独立トークン）', () => {
    let doc = createDoc([]);

    doc = applyKana(doc, 't1', 't1', 'yomigana', 'し')!;
    doc = applyKana(doc, 't3', 't3', 'yomigana', 'まな')!;

    const marks = getMarksByType(doc, 'yomigana');
    expect(marks).toHaveLength(2);
  });

  it('仮名を追加 → 同じトークンで値を変更', () => {
    let doc = createDoc([]);

    doc = applyKana(doc, 't3', 't3', 'yomigana', 'がく')!;
    doc = applyKana(doc, 't3', 't3', 'yomigana', 'まな')!;

    const marks = getMarksByType(doc, 'yomigana');
    expect(marks).toHaveLength(1);
    expect((marks[0] as { value: string }).value).toBe('まな');
  });

  it('仮名を追加 → タイプを変更（yomigana → okurigana）', () => {
    let doc = createDoc([]);

    doc = applyKana(doc, 't3', 't3', 'yomigana', 'まな')!;
    doc = applyKana(doc, 't3', 't3', 'okurigana', 'ぶ')!;

    // 両方存在する（タイプが異なるため）
    expect(getMarksByType(doc, 'yomigana')).toHaveLength(1);
    expect(getMarksByType(doc, 'okurigana')).toHaveLength(1);
  });

  it('範囲を拡大しようとすると部分重なりで拒否される', () => {
    let doc = createDoc([]);

    // Step 1: t1 に yomigana
    doc = applyKana(doc, 't1', 't1', 'yomigana', 'し')!;
    expect(getMarksByType(doc, 'yomigana')).toHaveLength(1);

    // Step 2: t1-t3 に yomigana → t1 の既存マークが部分重なりのため拒否
    const result = applyKana(doc, 't1', 't3', 'yomigana', 'しいわく');
    expect(result).toBeNull();

    // doc は変更されていない
    expect(getMarksByType(doc, 'yomigana')).toHaveLength(1);
  });

  it('完全一致の置換後に別範囲に追加できる', () => {
    let doc = createDoc([]);

    // Step 1: t1 に yomigana
    doc = applyKana(doc, 't1', 't1', 'yomigana', 'し')!;

    // Step 2: t1 を完全一致で置換
    doc = applyKana(doc, 't1', 't1', 'yomigana', 'こ')!;
    expect(getMarksByType(doc, 'yomigana')).toHaveLength(1);
    expect((getMarksByType(doc, 'yomigana')[0] as { value: string }).value).toBe('こ');

    // Step 3: 重なりのない別範囲に追加
    doc = applyKana(doc, 't3', 't3', 'yomigana', 'まな')!;
    expect(getMarksByType(doc, 'yomigana')).toHaveLength(2);
  });

  it('t1 に適用 → t2-t3 に適用 → t1-t3 に適用しようとすると部分重なりで拒否', () => {
    let doc = createDoc([]);

    // Step 1: t1 に yomigana
    doc = applyKana(doc, 't1', 't1', 'yomigana', 'し')!;

    // Step 2: t2-t3 に yomigana（t1 とは重なりなし → 成功）
    doc = applyKana(doc, 't2', 't3', 'yomigana', 'いわく')!;

    // Step 3: t1-t3 に yomigana → t1-t1 と t2-t3 が部分重なりのため拒否
    const result = applyKana(doc, 't1', 't3', 'yomigana', 'しいわく');
    expect(result).toBeNull();

    // 既存マークは変更されていない
    expect(getMarksByType(doc, 'yomigana')).toHaveLength(2);
  });
});
