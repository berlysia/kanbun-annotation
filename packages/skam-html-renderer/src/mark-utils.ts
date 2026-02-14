/**
 * SKAM HTML Renderer - Mark Utility Functions
 *
 * 基盤層: mark 解決の純粋関数。他の内部モジュール（renderer.ts 等）を参照しない。
 */

import type { Mark, KutotenMark, RefMark, Position } from '@kanbun/skam';
import { isPositionBasedMark } from '@kanbun/skam';

/** Check if a position-based mark is at block start (empty position) */
function isBlockStartPosition(position: Position): boolean {
  return !('after' in position) || position.after === undefined;
}

/**
 * Get block-start position marks for a given blockId
 * @internal
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
