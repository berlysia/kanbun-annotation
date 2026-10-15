import { describe, it, expect } from 'vitest';
import { resolveOkototenCell } from '../rendering/index.js';
import type { OkototenMark } from '../index.js';
const m = (grid: string, x: unknown, y: unknown): OkototenMark => ({
  type: 'okototen',
  anchor: { from: 't1', to: 't1' },
  shape: 'dot',
  position: { system: 'glyph-grid', grid, x: x as number, y: y as number },
});
describe('resolveOkototenCell', () => {
  it('accepts integer cells inside an NxN grid', () => {
    expect(resolveOkototenCell(m('5x5', 4, 0))).toEqual({
      x: 4,
      y: 0,
      cols: 5,
      rows: 5,
      shape: 'dot',
    });
  });
  it('accepts rectangular grids the validator accepts (NxM)', () => {
    expect(resolveOkototenCell(m('5x7', 4, 6))).toEqual({
      x: 4,
      y: 6,
      cols: 5,
      rows: 7,
      shape: 'dot',
    });
  });
  it.each([
    ['5x5', 5, 0],
    ['5x5', -1, 0],
    ['5x5', 1.5, 0],
    ['5x5', Number.NaN, 0],
    ['5x5', 1e21, 0],
    ['5x5', '1', 0],
    ['5x7', 0, 7],
    ['0x0', 0, 0],
    ['abc', 1, 1],
    ['5x5;', 1, 1],
    ['99999999999999999999999x1', 1e21, 0],
    ['99999999999999999999999x1', 0, 0], // cols だけが安全な整数の範囲を超える
    [['5x5'] as unknown as string, 1, 1], // grid が文字列でない
  ])('rejects grid=%s x=%s y=%s', (grid, x, y) => {
    expect(resolveOkototenCell(m(grid, x, y))).toBeUndefined();
  });
});
