import { describe, it, expect } from 'vitest';
import type { CanvasLike, CanvasRenderingContext2DLike } from '../canvas-context.js';

// 実際の DOM の canvas と 2D context を、キャストなしで render / measure に渡せること。
// 判定は typecheck が行う。実行時は、関数が定義できることだけを確かめる。
describe('DOM assignability', () => {
  it('accepts a real HTMLCanvasElement and CanvasRenderingContext2D without casts', () => {
    const accept = (_canvas: CanvasLike, _ctx: CanvasRenderingContext2DLike): boolean => true;
    const check = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): boolean =>
      accept(canvas, ctx);
    expect(typeof check).toBe('function');
  });
});
