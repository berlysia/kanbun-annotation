import type { SKAMDocument, Mark, Anchor } from '@kanbun/skam';

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
 * マークのanchorがtokenIdを含む（from <= tokenId <= to）場合に関連とみなす。
 * ただし、token IDの順序を正確に判定するにはtokens配列の順序を参照する必要がある。
 */
export function getMarksForToken(doc: SKAMDocument, tokenId: string): Mark[] {
  // tokens配列のインデックスマップを作成
  const tokenIndexMap = new Map<string, number>();
  for (let i = 0; i < doc.tokens.length; i++) {
    const token = doc.tokens[i];
    if (token != null) {
      tokenIndexMap.set(token.id, i);
    }
  }

  const targetIndex = tokenIndexMap.get(tokenId);
  if (targetIndex === undefined) {
    return [];
  }

  return doc.marks.filter((mark) => {
    const fromIndex = tokenIndexMap.get(mark.anchor.from);
    const toIndex = tokenIndexMap.get(mark.anchor.to);

    if (fromIndex === undefined || toIndex === undefined) {
      return false;
    }

    return fromIndex <= targetIndex && targetIndex <= toIndex;
  });
}
