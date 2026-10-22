/**
 * マークグルーピングユーティリティ
 *
 * tateten / highlight / range mark のグループ化。
 * 両レンダラーで共有。
 */

import type {
  Token,
  Mark,
  TatetenMark,
  HighlightMark,
  YomiganaMark,
  OkuriganaMark,
  SoeganaMark,
} from '../index.js';
import { isPositionBasedMark } from '../index.js';
import type { RangeMarkGroup } from './types.js';

/** 字の id から、字の並び (tokens) での位置を引く表。同じ id が複数あるときは最初の位置を使う */
function buildPositionMap(tokens: Token[]): Map<string, number> {
  const positions = new Map<string, number>();
  tokens.forEach((token, index) => {
    if (!positions.has(token.id)) positions.set(token.id, index);
  });
  return positions;
}

/**
 * 範囲の注記 (tateten または highlight) ごとに、範囲に含まれる字へ注記を割り当てる。
 * 字ごとの配列は marks[] の順。連続判定で === 参照比較を使えるよう、同じ注記には同じオブジェクトを入れる。
 * 範囲の端がこの tokens に無い注記と、始まりが終わりより後の注記は割り当てない。
 */
function groupRangeMarks<M extends TatetenMark | HighlightMark>(
  tokens: Token[],
  marks: Mark[],
  isTarget: (mark: Mark) => mark is M
): Map<string, M[]> {
  const positions = buildPositionMap(tokens);
  const result = new Map<string, M[]>();

  for (const mark of marks) {
    if (!isTarget(mark)) continue;
    const fromIdx = positions.get(mark.anchor.from);
    const toIdx = positions.get(mark.anchor.to);
    if (fromIdx === undefined || toIdx === undefined) continue;

    for (let i = fromIdx; i <= toIdx; i++) {
      const token = tokens[i]!;
      const list = result.get(token.id);
      if (list) list.push(mark);
      else result.set(token.id, [mark]);
    }
  }

  return result;
}

/**
 * tateten マークのアンカー範囲に含まれるトークンを、字ごとの注記の配列 (marks[] の順) にマッピング。
 * 重なる竪点は、どれも字の配列に入る。
 */
export function getTatetenGroups(tokens: Token[], marks: Mark[]): Map<string, TatetenMark[]> {
  return groupRangeMarks(tokens, marks, (m): m is TatetenMark => m.type === 'tateten');
}

/**
 * highlight マークのアンカー範囲に含まれるトークンを、字ごとの注記の配列 (marks[] の順) にマッピング。
 * tateten と同様に === 参照比較で同じ注記かを判定できる。
 */
export function getHighlightGroups(tokens: Token[], marks: Mark[]): Map<string, HighlightMark[]> {
  return groupRangeMarks(tokens, marks, (m): m is HighlightMark => m.type === 'highlight');
}

/**
 * anchor.from !== anchor.to の anchor-based マークをグループ化。
 * 各トークン ID → 所属する RangeMarkGroup のマップを返す。
 */
export function getRangeMarkGroups(
  tokens: Token[],
  marks: Mark[],
  type: 'yomigana' | 'okurigana' | 'soegana'
): Map<string, RangeMarkGroup> {
  const targetMarks = marks.filter(
    (m): m is YomiganaMark | OkuriganaMark | SoeganaMark =>
      m.type === type && !isPositionBasedMark(m) && m.anchor.from !== m.anchor.to
  );
  const result = new Map<string, RangeMarkGroup>();

  for (const mark of targetMarks) {
    const fromIdx = tokens.findIndex((t) => t.id === mark.anchor.from);
    const toIdx = tokens.findIndex((t) => t.id === mark.anchor.to);
    if (fromIdx === -1 || toIdx === -1) continue;

    const tokenIds: string[] = [];
    for (let i = fromIdx; i <= toIdx; i++) {
      const token = tokens[i];
      if (token) {
        tokenIds.push(token.id);
      }
    }

    const group: RangeMarkGroup = { mark, tokenIds };
    for (const tokenId of tokenIds) {
      result.set(tokenId, group);
    }
  }

  return result;
}
