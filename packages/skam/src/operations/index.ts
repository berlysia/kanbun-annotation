import type {
  SKAMDocument,
  Mark,
  MarkType,
  Position,
  Token,
  Block,
  AnchoredMark,
  PositionedMark,
  PersistedMark,
  MarkTypeMap,
  AnchoredMarkType,
  PositionedMarkType,
  KaeriMark,
  OkuriganaMark,
  YomiganaMark,
  SoeganaMark,
  KutotenMark,
} from '../index.js';

// ============================================================================
// Internal Utilities
// ============================================================================

/**
 * position ベースのマーク（kaeri, kutoten, ref）かどうかを判定
 *
 * 注意: `'position' in mark` による判定は使用しないこと。
 * OkototenMark も position プロパティを持つが anchor ベース。
 */
export function isPositionBasedMark(mark: Mark): mark is Extract<Mark, PositionedMark> {
  return mark.type === 'kaeri' || mark.type === 'kutoten' || mark.type === 'ref';
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

// ============================================================================
// Types
// ============================================================================

/**
 * idを含まないMark用の入力型
 *
 * discriminated unionに対するOmitは正しく動作しないため、
 * addMarkの引数としてはMark型を受け取り、id がある場合は無視する実装とする。
 * 型レベルではMarkを受け入れつつ、idを省略可能とする。
 */
export type MarkInput = Mark;

/**
 * addMarkWithResult の戻り値型
 */
export interface AddMarkResult {
  /** マーク追加後のドキュメント */
  doc: SKAMDocument;
  /** 自動生成されたマークID */
  markId: string;
}

/**
 * updateMarkで使用する更新用の型
 *
 * ジェネリクスにより、対象Markの型に応じた更新プロパティのみを許可する。
 * 分散条件型で discriminated union の各メンバーに個別に Omit + Partial を適用。
 *
 * @example
 * // 型パラメータ指定で厳密な検証
 * MarkUpdates<KaeriMark>     // { position?, value?, placementHint?, ext? }
 * MarkUpdates<EmphasisMark>  // { anchor?, style?: EmphasisStyle, placementHint?, ext? }
 * MarkUpdates<KutotenMark>   // { position?, value?, kind?, placementHint?, ext? }
 *
 * // デフォルト（Mark）は全型の union（後方互換）
 * MarkUpdates                // = MarkUpdates<Mark>
 */
export type MarkUpdates<M extends Mark = Mark> = M extends unknown
  ? Partial<Omit<M, 'type' | 'id'>>
  : never;

/** PersistedMark と Mark の MarkUpdates 互換性をコンパイルタイムで検証 */
type _TestPersistedUpdates = MarkUpdates<PersistedMark>;
type _TestMarkUpdates = MarkUpdates<Mark>;
type _AssertUpdatesCompat = _TestPersistedUpdates extends _TestMarkUpdates
  ? _TestMarkUpdates extends _TestPersistedUpdates
    ? true
    : never
  : never;
const _assertUpdatesCompat: _AssertUpdatesCompat = true;

// ============================================================================
// Token Index Utilities
// ============================================================================

/**
 * blocks.tokenIds の連結順でトークンの位置インデックスマップを構築
 *
 * SKAM仕様: tokens配列の順序は無意味。原文順序はblocks[].tokenIdsの連結順で規定。
 * このマップはその仕様に従い、ドキュメント内でのトークンのグローバル位置を提供する。
 */
export function buildTokenIndexMap(doc: SKAMDocument): Map<string, number> {
  const tokenIndexMap = new Map<string, number>();
  let globalIndex = 0;
  for (const block of doc.blocks) {
    for (const tid of block.tokenIds) {
      tokenIndexMap.set(tid, globalIndex++);
    }
  }
  return tokenIndexMap;
}

/**
 * blocks.tokenIds の連結順でトークンの位置を取得
 *
 * @returns トークンの0-basedグローバル位置。見つからない場合は undefined
 */
export function getTokenIndex(doc: SKAMDocument, tokenId: string): number | undefined {
  const indexMap = buildTokenIndexMap(doc);
  return indexMap.get(tokenId);
}

/**
 * blocks.tokenIds の連結順でインデックスからトークンを取得
 *
 * @returns 指定位置のToken。範囲外の場合は undefined
 */
export function getTokenByIndex(doc: SKAMDocument, index: number): Token | undefined {
  const tokenMap = new Map<string, Token>();
  for (const token of doc.tokens) {
    tokenMap.set(token.id, token);
  }

  let currentIndex = 0;
  for (const block of doc.blocks) {
    for (const tid of block.tokenIds) {
      if (currentIndex === index) {
        return tokenMap.get(tid);
      }
      currentIndex++;
    }
  }
  return undefined;
}

// ============================================================================
// Mark Lookup
// ============================================================================

/**
 * マークをIDで取得
 *
 * @returns 指定IDのMark。見つからない場合は undefined
 */
export function getMarkById(doc: SKAMDocument, markId: string): PersistedMark | undefined;
export function getMarkById<T extends MarkType>(
  doc: SKAMDocument,
  markId: string,
  type: T
): (MarkTypeMap[T] & { id: string }) | undefined;
export function getMarkById(
  doc: SKAMDocument,
  markId: string,
  type?: MarkType
): PersistedMark | undefined {
  // id でフィルタリングしているため、結果は必ず id を持つ
  const found = doc.marks.find((m) => m.id === markId);
  if (!found) return undefined;
  if (type !== undefined && found.type !== type) return undefined;
  return found as PersistedMark;
}

/**
 * トークンが属するブロックを取得
 *
 * @returns トークンが属するBlock。見つからない場合は undefined
 */
export function getBlockForToken(doc: SKAMDocument, tokenId: string): Block | undefined {
  return doc.blocks.find((b) => b.tokenIds.includes(tokenId));
}

// ============================================================================
// ID Generation
// ============================================================================

/**
 * ランダムIDを生成する。
 * 形式: `{prefix}-{8hex}`（例: 'm-a7f3b2c1', 'ref-5e2d1a9b'）
 *
 * 既存のマークIDとの衝突を回避する。
 *
 * @param doc ドキュメント
 * @param prefix IDプレフィックス（デフォルト: 'm'）
 * @returns 新しいID
 */
export function generateId(doc: SKAMDocument, prefix = 'm'): string {
  const existingIds = new Set(doc.marks.filter((m) => m.id != null).map((m) => m.id!));
  let id: string;
  do {
    const hex = Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join(
      ''
    );
    id = `${prefix}-${hex}`;
  } while (existingIds.has(id));
  return id;
}

/**
 * 新しいmarkIdを生成
 *
 * generateId(doc, 'm') のエイリアス。
 */
export function generateMarkId(doc: SKAMDocument): string {
  return generateId(doc, 'm');
}

// ============================================================================
// Mark CRUD
// ============================================================================

/**
 * マークを追加し、生成されたIDも返す
 *
 * イミュータブルに新しいドキュメントを返す。
 * 渡されたmarkにidが含まれていても、新しいidで上書きされる。
 */
export function addMarkWithResult(doc: SKAMDocument, mark: MarkInput): AddMarkResult {
  const newId = generateMarkId(doc);
  const newMark = { ...mark, id: newId };

  return {
    doc: {
      ...doc,
      marks: [...doc.marks, newMark],
    },
    markId: newId,
  };
}

/**
 * マークを追加（markIdは自動生成）
 *
 * イミュータブルに新しいドキュメントを返す。
 * 渡されたmarkにidが含まれていても、新しいidで上書きされる。
 */
export function addMark(doc: SKAMDocument, mark: MarkInput): SKAMDocument {
  return addMarkWithResult(doc, mark).doc;
}

/**
 * マークを更新
 *
 * イミュータブルに新しいドキュメントを返す。
 * 指定されたmarkIdが見つからない場合は元のドキュメントをそのまま返す。
 *
 * 型パラメータ M を指定すると、updates が対象 Mark 型に適した
 * プロパティのみに制限される。省略時は全 Mark 型の union（後方互換）。
 *
 * @example
 * updateMark<EmphasisMark>(doc, 'm1', { style: 'filled sesame' });
 * updateMark<KaeriMark>(doc, 'm2', { value: '㆑' });
 */
export function updateMark<M extends Mark = Mark>(
  doc: SKAMDocument,
  markId: string,
  updates: MarkUpdates<M>
): SKAMDocument {
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
 * highlight マークとその参照先 ref マークをまとめて削除
 *
 * highlight マークの ref プロパティが ref マークを参照している場合、
 * ref マークも一緒に削除する。
 * highlight が見つからない場合は removeMark にフォールバック（no-op）。
 */
export function removeHighlightWithRef(doc: SKAMDocument, highlightMarkId: string): SKAMDocument {
  const highlight = getMarkById(doc, highlightMarkId);
  if (!highlight) return removeMark(doc, highlightMarkId);

  let newDoc = doc;
  if (highlight.type === 'highlight' && highlight.ref) {
    const refMark = getMarkById(newDoc, highlight.ref);
    if (refMark?.id && refMark.type === 'ref') {
      newDoc = removeMark(newDoc, refMark.id);
    }
  }
  return removeMark(newDoc, highlightMarkId);
}

// ============================================================================
// Mark Queries
// ============================================================================

/**
 * tokenIdに関連するマークを取得
 *
 * anchor ベースのマーク: anchorがtokenIdを含む（from <= tokenId <= to）場合に関連とみなす。
 * position ベースのマーク（kaeri, kutoten, ref）: position.after が tokenId と一致する場合に関連とみなす。
 * token ID の順序は blocks.tokenIds の連結順で判定する。
 */
export function getMarksForToken(doc: SKAMDocument, tokenId: string): Mark[] {
  const tokenIndexMap = buildTokenIndexMap(doc);

  const targetIndex = tokenIndexMap.get(tokenId);
  if (targetIndex === undefined) {
    return [];
  }

  return doc.marks.filter((mark) => {
    // position ベースのマーク（kaeri, kutoten, ref）
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
 * position ベースのマーク（kaeri, kutoten, ref）: position.after が指定範囲内にある場合にマッチ。
 */
export function getMarksForRange(doc: SKAMDocument, fromId: string, toId: string): Mark[] {
  const tokenIndexMap = buildTokenIndexMap(doc);

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

/**
 * 指定範囲と一致するマークを取得（anchor/position 両方対応）
 *
 * - anchor ベース: from/to が範囲と完全一致
 * - position ベース: after トークンが範囲内にある
 * オプションで type フィルタが可能。
 */
export function getMarksExactRange(doc: SKAMDocument, fromId: string, toId: string): Mark[];
export function getMarksExactRange<T extends MarkType>(
  doc: SKAMDocument,
  fromId: string,
  toId: string,
  type: T
): MarkTypeMap[T][];
export function getMarksExactRange(
  doc: SKAMDocument,
  fromId: string,
  toId: string,
  type?: MarkType
): Mark[] {
  const tokenIndexMap = buildTokenIndexMap(doc);

  const rangeFrom = tokenIndexMap.get(fromId);
  const rangeTo = tokenIndexMap.get(toId);
  if (rangeFrom === undefined || rangeTo === undefined) {
    return [];
  }

  const rangeStart = Math.min(rangeFrom, rangeTo);
  const rangeEnd = Math.max(rangeFrom, rangeTo);

  return doc.marks.filter((mark) => {
    // type フィルタ
    if (type !== undefined && mark.type !== type) return false;

    // position ベース: after トークンが範囲内にあるか
    if (isPositionBasedMark(mark)) {
      const afterTokenId = getPositionAfterTokenId(mark.position);
      if (afterTokenId === undefined) return false;
      const afterIndex = tokenIndexMap.get(afterTokenId);
      if (afterIndex === undefined) return false;
      return rangeStart <= afterIndex && afterIndex <= rangeEnd;
    }

    // anchor ベース: 完全一致
    const markFrom = tokenIndexMap.get(mark.anchor.from);
    const markTo = tokenIndexMap.get(mark.anchor.to);
    if (markFrom === undefined || markTo === undefined) return false;

    const markStart = Math.min(markFrom, markTo);
    const markEnd = Math.max(markFrom, markTo);

    return markStart === rangeStart && markEnd === rangeEnd;
  });
}

/**
 * anchor ベースマーク専用: アンカーが指定範囲と完全一致するマークを取得
 *
 * 戻り型が AnchoredMark (のサブタイプ) なので anchor プロパティに安全にアクセス可能。
 */
export function getAnchoredMarksExactRange(
  doc: SKAMDocument,
  fromId: string,
  toId: string
): Extract<Mark, AnchoredMark>[];
export function getAnchoredMarksExactRange<T extends AnchoredMarkType>(
  doc: SKAMDocument,
  fromId: string,
  toId: string,
  type: T
): MarkTypeMap[T][];
export function getAnchoredMarksExactRange(
  doc: SKAMDocument,
  fromId: string,
  toId: string,
  type?: AnchoredMarkType
): Extract<Mark, AnchoredMark>[] {
  const tokenIndexMap = buildTokenIndexMap(doc);

  const rangeFrom = tokenIndexMap.get(fromId);
  const rangeTo = tokenIndexMap.get(toId);
  if (rangeFrom === undefined || rangeTo === undefined) {
    return [];
  }

  const rangeStart = Math.min(rangeFrom, rangeTo);
  const rangeEnd = Math.max(rangeFrom, rangeTo);

  return doc.marks.filter((mark): mark is Extract<Mark, AnchoredMark> => {
    if (isPositionBasedMark(mark)) return false;
    if (type !== undefined && mark.type !== type) return false;

    const markFrom = tokenIndexMap.get(mark.anchor.from);
    const markTo = tokenIndexMap.get(mark.anchor.to);
    if (markFrom === undefined || markTo === undefined) return false;

    const markStart = Math.min(markFrom, markTo);
    const markEnd = Math.max(markFrom, markTo);

    return markStart === rangeStart && markEnd === rangeEnd;
  });
}

/**
 * position ベースマーク専用: after トークンが指定範囲内にあるマークを取得
 *
 * 戻り型が PositionedMark (のサブタイプ) なので position プロパティに安全にアクセス可能。
 * after が未定義のマークはマッチしない。
 */
export function getPositionedMarksInRange(
  doc: SKAMDocument,
  fromId: string,
  toId: string
): Extract<Mark, PositionedMark>[];
export function getPositionedMarksInRange<T extends PositionedMarkType>(
  doc: SKAMDocument,
  fromId: string,
  toId: string,
  type: T
): MarkTypeMap[T][];
export function getPositionedMarksInRange(
  doc: SKAMDocument,
  fromId: string,
  toId: string,
  type?: PositionedMarkType
): Extract<Mark, PositionedMark>[] {
  const tokenIndexMap = buildTokenIndexMap(doc);

  const rangeFrom = tokenIndexMap.get(fromId);
  const rangeTo = tokenIndexMap.get(toId);
  if (rangeFrom === undefined || rangeTo === undefined) {
    return [];
  }

  const rangeStart = Math.min(rangeFrom, rangeTo);
  const rangeEnd = Math.max(rangeFrom, rangeTo);

  return doc.marks.filter((mark): mark is Extract<Mark, PositionedMark> => {
    if (!isPositionBasedMark(mark)) return false;
    if (type !== undefined && mark.type !== type) return false;

    const afterTokenId = getPositionAfterTokenId(mark.position);
    if (afterTokenId === undefined) return false;
    const afterIndex = tokenIndexMap.get(afterTokenId);
    if (afterIndex === undefined) return false;

    return rangeStart <= afterIndex && afterIndex <= rangeEnd;
  });
}

// ============================================================================
// Mark Display Utilities
// ============================================================================

/**
 * マークが対象とするトークンのテキストを連結して返す
 *
 * - anchor ベース: from〜to のトークンテキストを連結（blocks順で解決）
 * - position ベース: after のトークンテキストを返す（after 未定義なら空文字列）
 */
export function getAnchorText(doc: SKAMDocument, mark: Mark): string {
  const tokenMap = new Map<string, Token>();
  for (const token of doc.tokens) {
    tokenMap.set(token.id, token);
  }

  // position ベースのマーク
  if (isPositionBasedMark(mark)) {
    const afterTokenId = getPositionAfterTokenId(mark.position);
    if (afterTokenId) {
      const token = tokenMap.get(afterTokenId);
      return token?.text ?? '';
    }
    return '';
  }

  // anchor ベースのマーク
  const tokenIndexMap = buildTokenIndexMap(doc);
  const fromIndex = tokenIndexMap.get(mark.anchor.from);
  const toIndex = tokenIndexMap.get(mark.anchor.to);
  if (fromIndex === undefined || toIndex === undefined) return '';

  const startIdx = Math.min(fromIndex, toIndex);
  const endIdx = Math.max(fromIndex, toIndex);

  // blocks 順でトークンを収集
  const texts: string[] = [];
  let currentIndex = 0;
  for (const block of doc.blocks) {
    for (const tid of block.tokenIds) {
      if (currentIndex >= startIdx && currentIndex <= endIdx) {
        const token = tokenMap.get(tid);
        if (token) {
          texts.push(token.text);
        }
      }
      currentIndex++;
    }
  }

  return texts.join('');
}

/**
 * マークのドキュメント内表示位置を数値で返す
 *
 * - anchor ベース: from の位置
 * - position ベース: after の位置（after 未定義なら -1）
 */
export function getMarkSortIndex(doc: SKAMDocument, mark: Mark): number {
  const tokenIndexMap = buildTokenIndexMap(doc);

  if (isPositionBasedMark(mark)) {
    const afterTokenId = getPositionAfterTokenId(mark.position);
    if (afterTokenId === undefined) return -1;
    return tokenIndexMap.get(afterTokenId) ?? -1;
  }

  return tokenIndexMap.get(mark.anchor.from) ?? -1;
}

/**
 * マークをドキュメント内の出現順にソートして返す
 *
 * 元の marks 配列は変更しない。
 */
export function sortMarksByPosition(doc: SKAMDocument): Mark[] {
  return [...doc.marks].sort((a, b) => getMarkSortIndex(doc, a) - getMarkSortIndex(doc, b));
}

// ============================================================================
// Mark Type Guards & Utilities
// ============================================================================

/**
 * anchor ベースのマークかどうかを判定
 *
 * KaeriMark, KutotenMark, RefMark 以外の全 Mark が anchor ベース。
 *
 * 注意: `'anchor' in mark` による判定は使用しないこと。
 * 型ガードの一貫性を保つため、この関数を使うこと。
 */
export function isAnchorBasedMark(mark: Mark): mark is Extract<Mark, AnchoredMark> {
  return !isPositionBasedMark(mark);
}

/**
 * 指定した type の Mark かどうかを判定し、具体的な Mark サブタイプにナローする
 */
export function isMarkType<T extends MarkType>(mark: Mark, type: T): mark is MarkTypeMap[T] {
  return mark.type === type;
}

/**
 * Mark 配列を type でフィルタリングし、型安全な配列を返す
 */
export function filterMarksByType<T extends MarkType>(
  marks: readonly Mark[],
  type: T
): MarkTypeMap[T][] {
  return marks.filter((m): m is MarkTypeMap[T] => m.type === type);
}

/** value プロパティを持つマーク型 */
type MarkWithValue = KaeriMark | OkuriganaMark | YomiganaMark | SoeganaMark | KutotenMark;

/**
 * value プロパティを持つマークかどうかを判定
 *
 * KaeriMark, OkuriganaMark, YomiganaMark, SoeganaMark, KutotenMark が該当。
 */
export function hasMarkValue(mark: Mark): mark is MarkWithValue {
  return 'value' in mark;
}

/**
 * マークのアンカー範囲をラベル文字列で返す
 *
 * anchor ベースのマーク: "from〜to" 形式（例: "t1〜t3"）
 * position ベースのマーク: 空文字列
 */
export function getAnchorRangeLabel(mark: Mark): string {
  if (isPositionBasedMark(mark)) return '';
  return `${mark.anchor.from}〜${mark.anchor.to}`;
}

/**
 * マークのアンカーが指定範囲と完全一致するか判定
 *
 * position ベースのマークは常に false を返す。
 */
export function isExactAnchorMatch(mark: Mark, fromId: string, toId: string): boolean {
  if (isPositionBasedMark(mark)) return false;
  return mark.anchor.from === fromId && mark.anchor.to === toId;
}
