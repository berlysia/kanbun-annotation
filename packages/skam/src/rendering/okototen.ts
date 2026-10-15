import type { OkototenMark } from '../index.js';

export interface OkototenCell {
  x: number;
  y: number;
  cols: number;
  rows: number;
  shape: string;
}

/**
 * ヲコト点の格子座標を解決する。validator の glyph-grid 規則 (NxM、0 <= x < cols、0 <= y < rows、整数)
 * に合わせたうえで、出力に使う値として安全な整数であることも求める (巨大な数が指数表記で出るのを防ぐ)。
 * 規則を満たさなければ undefined を返し、呼び出し側はその点を描かない。
 */
export function resolveOkototenCell(mark: OkototenMark): OkototenCell | undefined {
  const { position, shape } = mark;
  if (typeof position.grid !== 'string') return undefined;
  const m = /^(\d+)x(\d+)$/.exec(position.grid);
  if (!m) return undefined;
  const cols = Number(m[1]);
  const rows = Number(m[2]);
  const { x, y } = position;
  if (![x, y, cols, rows].every((n) => typeof n === 'number' && Number.isSafeInteger(n))) {
    return undefined;
  }
  if (cols < 1 || rows < 1 || x < 0 || y < 0 || x >= cols || y >= rows) return undefined;
  return { x, y, cols, rows, shape };
}
