import type { SKAMDocument, Mark, Anchor, Position, KutotenMark, RefMark } from '../index.js';

/**
 * position ベースのマーク（kutoten, ref）かどうかを判定
 */
function isPositionBasedMark(mark: Mark): mark is KutotenMark | RefMark {
  return mark.type === 'kutoten' || mark.type === 'ref';
}

/**
 * Position から after の tokenId を取得
 */
function getPositionAfterTokenId(position: Position): string | undefined {
  if ('after' in position && position.after) {
    return position.after;
  }
  return undefined;
}

/**
 * idを含まないMark用の入力型
 *
 * discriminated unionに対するOmitは正しく動作しないため、
 * addMarkの引数としてはMark型を受け取り、id がある場合は無視する実装とする。
 * 型レベルではMarkを受け入れつつ、idを省略可能とする。
 */
export type MarkInput = Mark;

/**
 * updateMarkで使用する更新用の型
 *
 * id, type を除いた共通プロパティのみ更新可能。
 * 各Mark固有のプロパティ（value等）は型システムで保証できないため、
 * 実行時に適切な値を渡す責任は呼び出し側にある。
 */
export type MarkUpdates = {
  anchor?: Anchor;
  position?: Position;
  placementHint?: string;
  ext?: Record<string, unknown>;
};

/**
 * 新しいmarkIdを生成
 *
 * 既存のmarkIdから最大の数値を取得し、それに1を加えた形式で生成する。
 * 形式: `m{number}`
 */
export function generateMarkId(doc: SKAMDocument): string {
  let maxNum = 0;

  for (const mark of doc.marks) {
    if (mark.id != null) {
      const match = /^m(\d+)$/.exec(mark.id);
      if (match != null && match[1] != null) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) {
          maxNum = num;
        }
      }
    }
  }

  return `m${maxNum + 1}`;
}

/**
 * マークを追加（markIdは自動生成）
 *
 * イミュータブルに新しいドキュメントを返す。
 * 渡されたmarkにidが含まれていても、新しいidで上書きされる。
 */
export function addMark(doc: SKAMDocument, mark: MarkInput): SKAMDocument {
  const newId = generateMarkId(doc);
  // 既存のidを上書きして新しいidを付与
  const newMark = { ...mark, id: newId };

  return {
    ...doc,
    marks: [...doc.marks, newMark],
  };
}

/**
 * マークを更新
 *
 * イミュータブルに新しいドキュメントを返す。
 * 指定されたmarkIdが見つからない場合は元のドキュメントをそのまま返す。
 */
export function updateMark(doc: SKAMDocument, markId: string, updates: MarkUpdates): SKAMDocument {
  const markIndex = doc.marks.findIndex((m) => m.id === markId);

  if (markIndex === -1) {
    return doc;
  }

  const existingMark = doc.marks[markIndex];
  if (existingMark == null) {
    return doc;
  }

  const updatedMark = { ...existingMark, ...updates } as Mark;

  const newMarks = [...doc.marks];
  newMarks[markIndex] = updatedMark;

  return {
    ...doc,
    marks: newMarks,
  };
}

/**
 * マークを完全に置き換える
 *
 * イミュータブルに新しいドキュメントを返す。
 * 指定されたmarkIdが見つからない場合は元のドキュメントをそのまま返す。
 * 新しいマークには元のIDが保持される（配列内の位置も維持）。
 */
export function replaceMark(doc: SKAMDocument, markId: string, newMark: MarkInput): SKAMDocument {
  const markIndex = doc.marks.findIndex((m) => m.id === markId);

  if (markIndex === -1) {
    return doc;
  }

  // 元のIDを保持
  const replacedMark = { ...newMark, id: markId };

  const newMarks = [...doc.marks];
  newMarks[markIndex] = replacedMark;

  return {
    ...doc,
    marks: newMarks,
  };
}

/**
 * マークを削除
 *
 * イミュータブルに新しいドキュメントを返す。
 * 指定されたmarkIdが見つからない場合は元のドキュメントをそのまま返す。
 */
export function removeMark(doc: SKAMDocument, markId: string): SKAMDocument {
  const newMarks = doc.marks.filter((m) => m.id !== markId);

  // 何も削除されなかった場合は元のドキュメントを返す
  if (newMarks.length === doc.marks.length) {
    return doc;
  }

  return {
    ...doc,
    marks: newMarks,
  };
}

/**
 * tokenIdに関連するマークを取得
 *
 * anchor ベースのマーク: anchorがtokenIdを含む（from <= tokenId <= to）場合に関連とみなす。
 * position ベースのマーク（kutoten, ref）: position.after が tokenId と一致する場合に関連とみなす。
 * token ID の順序は blocks.tokenIds の連結順で判定する。
 */
export function getMarksForToken(doc: SKAMDocument, tokenId: string): Mark[] {
  // blocks の tokenIds 順にインデックスマップを作成
  const tokenIndexMap = new Map<string, number>();
  let globalIndex = 0;
  for (const block of doc.blocks) {
    for (const tid of block.tokenIds) {
      tokenIndexMap.set(tid, globalIndex++);
    }
  }

  const targetIndex = tokenIndexMap.get(tokenId);
  if (targetIndex === undefined) {
    return [];
  }

  return doc.marks.filter((mark) => {
    // position ベースのマーク（kutoten, ref）
    if (isPositionBasedMark(mark)) {
      const afterTokenId = getPositionAfterTokenId(mark.position);
      return afterTokenId === tokenId;
    }

    // anchor ベースのマーク
    const fromIndex = tokenIndexMap.get(mark.anchor.from);
    const toIndex = tokenIndexMap.get(mark.anchor.to);

    if (fromIndex === undefined || toIndex === undefined) {
      return false;
    }

    return fromIndex <= targetIndex && targetIndex <= toIndex;
  });
}

/**
 * 指定されたtoken範囲に重なるマークを全て取得
 *
 * anchor ベースのマーク: マークの [from, to] と指定範囲 [fromId, toId] が重なる場合にマッチ。
 * position ベースのマーク（kutoten, ref）: position.after が指定範囲内にある場合にマッチ。
 */
export function getMarksForRange(doc: SKAMDocument, fromId: string, toId: string): Mark[] {
  const tokenIndexMap = new Map<string, number>();
  let globalIndex = 0;
  for (const block of doc.blocks) {
    for (const tid of block.tokenIds) {
      tokenIndexMap.set(tid, globalIndex++);
    }
  }

  const rangeFrom = tokenIndexMap.get(fromId);
  const rangeTo = tokenIndexMap.get(toId);
  if (rangeFrom === undefined || rangeTo === undefined) {
    return [];
  }

  const rangeStart = Math.min(rangeFrom, rangeTo);
  const rangeEnd = Math.max(rangeFrom, rangeTo);

  return doc.marks.filter((mark) => {
    if (isPositionBasedMark(mark)) {
      const afterTokenId = getPositionAfterTokenId(mark.position);
      if (afterTokenId === undefined) return false;
      const afterIndex = tokenIndexMap.get(afterTokenId);
      if (afterIndex === undefined) return false;
      return rangeStart <= afterIndex && afterIndex <= rangeEnd;
    }

    const markFrom = tokenIndexMap.get(mark.anchor.from);
    const markTo = tokenIndexMap.get(mark.anchor.to);
    if (markFrom === undefined || markTo === undefined) return false;

    const markStart = Math.min(markFrom, markTo);
    const markEnd = Math.max(markFrom, markTo);

    // 2つの範囲が重なるかどうか: !(markEnd < rangeStart || markStart > rangeEnd)
    return markEnd >= rangeStart && markStart <= rangeEnd;
  });
}
