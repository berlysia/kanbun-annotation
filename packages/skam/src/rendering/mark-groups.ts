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

/**
 * tateten マークのアンカー範囲に含まれるトークンを同一マーク参照にマッピング。
 * 連続判定で === 参照比較を使えるよう、同じ TatetenMark オブジェクトを割り当てる。
 */
export function getTatetenGroups(tokens: Token[], marks: Mark[]): Map<string, TatetenMark> {
  const tatetenMarks = marks.filter((m): m is TatetenMark => m.type === 'tateten');
  const result = new Map<string, TatetenMark>();

  for (const mark of tatetenMarks) {
    const fromIdx = tokens.findIndex((t) => t.id === mark.anchor.from);
    const toIdx = tokens.findIndex((t) => t.id === mark.anchor.to);
    if (fromIdx === -1 || toIdx === -1) continue;

    for (let i = fromIdx; i <= toIdx; i++) {
      const token = tokens[i];
      if (token) {
        result.set(token.id, mark);
      }
    }
  }

  return result;
}

/**
 * highlight マークのアンカー範囲に含まれるトークンを同一マーク参照にマッピング。
 * tateten と同様に === 参照比較で連続判定する。
 */
export function getHighlightGroups(tokens: Token[], marks: Mark[]): Map<string, HighlightMark> {
  const highlightMarks = marks.filter((m): m is HighlightMark => m.type === 'highlight');
  const result = new Map<string, HighlightMark>();

  for (const mark of highlightMarks) {
    const fromIdx = tokens.findIndex((t) => t.id === mark.anchor.from);
    const toIdx = tokens.findIndex((t) => t.id === mark.anchor.to);
    if (fromIdx === -1 || toIdx === -1) continue;

    for (let i = fromIdx; i <= toIdx; i++) {
      const token = tokens[i];
      if (token) {
        result.set(token.id, mark);
      }
    }
  }

  return result;
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
