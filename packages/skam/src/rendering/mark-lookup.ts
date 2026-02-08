/**
 * レンダラー向けマーク検索
 *
 * anchor endpoint に応じた type-aware なマーク紐付け。
 * - yomigana: anchor.from で紐付け（先頭に付く）
 * - okurigana, soegana: anchor.to で紐付け（末尾に付く）
 * - その他 anchor-based: from/to 完全一致 + 範囲内中間トークン
 * - position-based: position.after で紐付け
 */

import type { Token, Mark } from '../index.js';
import { isPositionBasedMark } from '../index.js';

/**
 * Token ごとのマークをタイプ別にマップで返す。
 *
 * Position-based marks は position.after の tokenId で紐付け。
 * Anchor-based marks は type に応じて from / to で紐付け。
 */
export function getMarksForToken(
  tokenId: string,
  marks: Mark[],
  allTokens: Token[]
): Map<Mark['type'], Mark[]> {
  const result = new Map<Mark['type'], Mark[]>();

  // yomigana は anchor.from で紐付け
  const startMarkTypes = new Set(['yomigana']);
  // okurigana, soegana は anchor.to で紐付け
  const endMarkTypes = new Set(['okurigana', 'soegana']);

  for (const mark of marks) {
    if (isPositionBasedMark(mark)) {
      // position-based: after が一致する場合のみ
      if ('after' in mark.position && mark.position.after === tokenId) {
        const existing = result.get(mark.type) ?? [];
        existing.push(mark);
        result.set(mark.type, existing);
      }
      continue;
    }

    // anchor-based
    if (startMarkTypes.has(mark.type)) {
      if (mark.anchor.from === tokenId) {
        const existing = result.get(mark.type) ?? [];
        existing.push(mark);
        result.set(mark.type, existing);
      }
    } else if (endMarkTypes.has(mark.type)) {
      if (mark.anchor.to === tokenId) {
        const existing = result.get(mark.type) ?? [];
        existing.push(mark);
        result.set(mark.type, existing);
      }
    } else {
      let matched = mark.anchor.from === tokenId || mark.anchor.to === tokenId;
      if (!matched && mark.anchor.from !== mark.anchor.to) {
        const fromIdx = allTokens.findIndex((t) => t.id === mark.anchor.from);
        const toIdx = allTokens.findIndex((t) => t.id === mark.anchor.to);
        const tokenIdx = allTokens.findIndex((t) => t.id === tokenId);
        if (fromIdx !== -1 && toIdx !== -1 && tokenIdx !== -1) {
          matched = tokenIdx > fromIdx && tokenIdx < toIdx;
        }
      }
      if (matched) {
        const existing = result.get(mark.type) ?? [];
        existing.push(mark);
        result.set(mark.type, existing);
      }
    }
  }

  return result;
}
