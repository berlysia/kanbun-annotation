/**
 * レンダラー向けマーク検索
 *
 * anchor endpoint に応じた type-aware なマーク紐付け。
 * - yomigana: anchor.from で紐付け（先頭に付く）
 * - okurigana, soegana: anchor.to で紐付け（末尾に付く）
 * - その他 anchor-based: from/to 完全一致 + 範囲内中間トークン
 * - position-based: position.after で紐付け
 *
 * 字ごとに全注記を走査すると描画全体が O(字数² × 注記数) になるため、
 * 描画の初めに 1 回だけ索引を作り、字ごとの引き当てを O(1) にする。
 */

import type { Token, Mark } from '../index.js';
import { isPositionBasedMark } from '../index.js';

/** 字に付く注記の、種別ごとの一覧 (鍵の順序と各配列の順序は marks の順) */
export type TokenMarks = ReadonlyMap<Mark['type'], readonly Mark[]>;

/** 字の id から、その字に付く注記を引く */
export type MarkLookup = (tokenId: string) => TokenMarks;

const EMPTY_TOKEN_MARKS: TokenMarks = new Map();

// yomigana は anchor.from、okurigana と soegana は anchor.to で紐付ける
const START_MARK_TYPES: ReadonlySet<string> = new Set(['yomigana']);
const END_MARK_TYPES: ReadonlySet<string> = new Set(['okurigana', 'soegana']);

/**
 * 注記の索引を作る。
 *
 * tokenGroups は renderer が実際に描く字の配列の列 (groupTokensByBlock の各 tokens)。
 * 範囲の「間の字」は、tokens[] の順序ではなく、この列の中の位置で決める。
 * 同じ id が複数の位置に現れる (validator が拒否する) 文書では、
 * 最初に現れた列・添字をその id の位置とする。
 *
 * 索引は Map だけで持つ。id は文書由来の任意の文字列なので、
 * plain object を使うと `__proto__` などで壊れる。
 */
export function createMarkLookup(
  marks: readonly Mark[],
  tokenGroups: readonly (readonly Pick<Token, 'id'>[])[]
): MarkLookup {
  // id → 最初に現れた (列, 列内の添字)
  const positions = new Map<string, { group: number; index: number }>();
  for (const [group, tokens] of tokenGroups.entries()) {
    for (const [index, token] of tokens.entries()) {
      if (!positions.has(token.id)) positions.set(token.id, { group, index });
    }
  }

  const index = new Map<string, Map<Mark['type'], Mark[]>>();
  const attach = (tokenId: string, mark: Mark): void => {
    let byType = index.get(tokenId);
    if (!byType) {
      byType = new Map();
      index.set(tokenId, byType);
    }
    const list = byType.get(mark.type);
    if (list) list.push(mark);
    else byType.set(mark.type, [mark]);
  };

  // 注記を marks の順に処理するので、各字の鍵と配列の順序が marks の順になる
  for (const mark of marks) {
    if (isPositionBasedMark(mark)) {
      if ('after' in mark.position) attach(mark.position.after, mark);
      continue;
    }

    const { from, to } = mark.anchor;
    if (START_MARK_TYPES.has(mark.type)) {
      attach(from, mark);
      continue;
    }
    if (END_MARK_TYPES.has(mark.type)) {
      attach(to, mark);
      continue;
    }

    attach(from, mark);
    if (to !== from) attach(to, mark);
    if (from === to) continue;

    // 間の字: from と to が同じ列にあり、from < 添字 < to の位置が自分の最初の位置である字
    const fromPos = positions.get(from);
    const toPos = positions.get(to);
    if (!fromPos || !toPos || fromPos.group !== toPos.group || fromPos.index >= toPos.index) {
      continue;
    }
    const tokens = tokenGroups[fromPos.group]!;
    for (let i = fromPos.index + 1; i < toPos.index; i++) {
      const id = tokens[i]!.id;
      const own = positions.get(id)!;
      // 同じ id が列の中で繰り返されるときは、最初の位置でだけ判定する
      if (own.group === fromPos.group && own.index === i && id !== from && id !== to) {
        attach(id, mark);
      }
    }
  }

  return (tokenId) => index.get(tokenId) ?? EMPTY_TOKEN_MARKS;
}

/**
 * Token ごとのマークをタイプ別にマップで返す。
 *
 * 呼ぶたびに索引を作るので、字ごとに引くときは createMarkLookup を使う。
 * 返す Map と配列は呼び出しごとの新しいもので、書き換えても他に影響しない。
 */
export function getMarksForToken(
  tokenId: string,
  marks: Mark[],
  allTokens: Token[]
): Map<Mark['type'], Mark[]> {
  const found = createMarkLookup(marks, [allTokens])(tokenId);
  const result = new Map<Mark['type'], Mark[]>();
  for (const [type, list] of found) {
    result.set(type, [...list]);
  }
  return result;
}
