/**
 * Block-start position marks resolution
 *
 * block-start position（position.after を持たない）の ref/kutoten を取得する。
 * HTML/Canvas 両レンダラーで使用。
 */

import type { Mark, KutotenMark, RefMark, Position } from '../index.js';
import { isPositionBasedMark } from '../index.js';

/** Check if a position-based mark is at block start (empty position) */
function isBlockStartPosition(position: Position): boolean {
  return !('after' in position) || position.after === undefined;
}

/**
 * Get block-start position marks for a given blockId
 */
export function getBlockStartMarks(
  blockId: string,
  marks: Mark[]
): { refs: RefMark[]; kutotenMarks: KutotenMark[] } {
  const refs: RefMark[] = [];
  const kutotenMarks: KutotenMark[] = [];

  for (const mark of marks) {
    if (!isPositionBasedMark(mark)) continue;
    if (!isBlockStartPosition(mark.position)) continue;

    // Check if this mark belongs to this block via position.blockId
    if (mark.position.blockId !== blockId) continue;

    if (mark.type === 'ref') {
      refs.push(mark);
    } else if (mark.type === 'kutoten') {
      kutotenMarks.push(mark);
    }
  }

  return { refs, kutotenMarks };
}
