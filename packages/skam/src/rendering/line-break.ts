/**
 * ブロック内のトップレベルノード列に対して、index 番目のノードの直前で改行可能かを判定する。
 *
 * 現在の render tree では、ノードが既に不可分単位で構築されているため、
 * 判定はノードの位置（index）のみで行う。ノード種別による区別は不要。
 *
 * ルール:
 * - index === 0: ブロック先頭なので改行不可
 * - hasBlockStartContent && index === 1: blockStartHtml（ブロック先頭の kutoten/ref）が
 *   最初の不可分単位に吸着するため改行不可
 * - それ以外: 改行可能
 */
export function canBreakBefore(index: number, hasBlockStartContent: boolean): boolean {
  if (index === 0) return false;
  if (hasBlockStartContent && index === 1) return false;
  return true;
}
