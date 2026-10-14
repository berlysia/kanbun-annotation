import { describe, it, expect } from 'vitest';
import { render, measure } from '../index.js';
import { RecordingContext } from './recording-context.js';
import type { SKAMDocument } from '@kanbun-skam/skam';
import type { CanvasRenderOptions } from '../types.js';
const doc = (marks: SKAMDocument['marks'] = []): SKAMDocument => ({
  format: 'skam@0.1',
  tokens: [{ id: 't1', text: '甲' }],
  blocks: [{ id: 'b1', tokenIds: ['t1'] }],
  marks,
  readings: [],
});
/** width / height の書き込みを ctx.calls に記録する canvas。サイズを設定した順序を確かめるため */
const canvasOf = (ctx: RecordingContext) => {
  let w = 300;
  let h = 150;
  return {
    get width() {
      return w;
    },
    set width(v: number) {
      w = v;
      ctx.calls.push({ method: 'set-width', args: [v] });
    },
    get height() {
      return h;
    },
    set height(v: number) {
      h = v;
      ctx.calls.push({ method: 'set-height', args: [v] });
    },
    getContext: () => ctx,
  };
};
const oko = (x: number, y: number, grid = '5x5') => ({
  type: 'okototen' as const,
  anchor: { from: 't1', to: 't1' },
  shape: 'dot',
  position: { system: 'glyph-grid' as const, grid, x, y },
});

describe('canvas okototen (K7)', () => {
  it('draws one dot at the HTML-equivalent cell position', () => {
    const ctx = new RecordingContext();
    render(doc([oko(4, 0)]), canvasOf(ctx) as never, { fontSize: 20, padding: 0, autoSize: false });
    const arcs = ctx.calls.filter((c) => c.method === 'arc');
    expect(arcs).toHaveLength(1);
    const [cx] = arcs[0]!.args as number[];
    const base = ctx.calls.find((c) => c.method === 'fillText')!.args as [string, number, number];
    expect(cx).toBeCloseTo(base[1] - 10 + (4 / 5) * 20);
  });
  it('uses rows for the vertical position on a rectangular grid (5x7)', () => {
    // em ボックスの上端は ascent に依存するので、y=0 の点との差で縦の位置を確かめる
    const arcY = (y: number) => {
      const ctx = new RecordingContext();
      render(doc([oko(0, y, '5x7')]), canvasOf(ctx) as never, {
        fontSize: 20,
        padding: 0,
        autoSize: false,
      });
      return (ctx.calls.find((c) => c.method === 'arc')!.args as number[])[1]!;
    };
    expect(arcY(6) - arcY(0)).toBeCloseTo((6 / 7) * 20);
  });
  it('skips an okototen outside the grid', () => {
    const ctx = new RecordingContext();
    render(doc([oko(5, 0)]), canvasOf(ctx) as never, { fontSize: 20, autoSize: false });
    expect(ctx.calls.filter((c) => c.method === 'arc')).toHaveLength(0);
  });
});

describe('canvas autoSize (K7)', () => {
  const expected = (w: number, h: number, pr: number, max?: number) => {
    // maxExtent はデバイスピクセルで表した長い辺の上限 (canvas.width / height そのもの)
    const scale = max === undefined ? 1 : Math.min(1, max / (Math.max(w, h, 1) * pr));
    return [Math.ceil(w * pr * scale), Math.ceil(h * pr * scale)];
  };
  it('sets canvas size from measured extent × pixelRatio', () => {
    const ctx = new RecordingContext();
    const canvas = canvasOf(ctx);
    const m = measure(doc(), ctx as never, { fontSize: 20 });
    render(doc(), canvas as never, { fontSize: 20, pixelRatio: 2 });
    expect([canvas.width, canvas.height]).toEqual(expected(m.width, m.height, 2));
  });
  it('caps the device-pixel extent by maxExtent', () => {
    const ctx = new RecordingContext();
    const canvas = canvasOf(ctx);
    const m = measure(doc(), ctx as never, { fontSize: 20 });
    render(doc(), canvas as never, { fontSize: 20, pixelRatio: 2, maxExtent: 10 });
    expect([canvas.width, canvas.height]).toEqual(expected(m.width, m.height, 2, 10));
    expect(Math.max(canvas.width, canvas.height)).toBeLessThanOrEqual(10 + 1); // ceil による 1px 未満の切り上げのみ許す
  });
  it('sets size before save/scale (width assignment resets the context)', () => {
    const ctx = new RecordingContext();
    render(doc(), canvasOf(ctx) as never, { fontSize: 20 });
    const idx = (m: string) => ctx.calls.findIndex((c) => c.method === m);
    expect(idx('set-width')).toBeGreaterThanOrEqual(0);
    expect(idx('set-width')).toBeLessThan(idx('save'));
    expect(idx('set-height')).toBeLessThan(idx('scale'));
  });
  it('does not shrink when maxExtent exceeds the content', () => {
    const ctx = new RecordingContext();
    const canvas = canvasOf(ctx);
    const m = measure(doc(), ctx as never, { fontSize: 20 });
    render(doc(), canvas as never, { fontSize: 20, pixelRatio: 2, maxExtent: 1e6 });
    expect([canvas.width, canvas.height]).toEqual(expected(m.width, m.height, 2));
  });
  it.each([undefined, 0])(
    'sizes an empty document from its measured extent (padding=%s) without throwing',
    (padding) => {
      const ctx = new RecordingContext();
      const canvas = canvasOf(ctx);
      const empty: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [],
        blocks: [],
        marks: [],
        readings: [],
      };
      // MeasureOptions は maxExtent / pixelRatio を持たないので、render 用と measure 用でオプションを分ける
      const renderOpts: CanvasRenderOptions =
        padding === undefined
          ? { maxExtent: 100, pixelRatio: 2 }
          : { maxExtent: 100, pixelRatio: 2, padding };
      const m = measure(empty, ctx as never, padding === undefined ? {} : { padding });
      expect(() => render(empty, canvas as never, renderOpts)).not.toThrow();
      expect([canvas.width, canvas.height]).toEqual(expected(m.width, m.height, 2, 100));
    }
  );
  it('does not touch canvas size when autoSize is false', () => {
    const ctx = new RecordingContext();
    const canvas = canvasOf(ctx);
    render(doc(), canvas as never, { autoSize: false });
    expect([canvas.width, canvas.height]).toEqual([300, 150]);
  });
  it.each<[CanvasRenderOptions, RegExp]>([
    [{ pixelRatio: Number.NaN }, /pixelRatio/],
    [{ pixelRatio: 0 }, /pixelRatio/],
    [{ maxExtent: 0 }, /maxExtent/],
    [{ maxExtent: -1 }, /maxExtent/],
    [{ pixelRatio: Number.NaN, autoSize: false }, /pixelRatio/],
  ])('throws TypeError for %o', (opts, re) => {
    const ctx = new RecordingContext();
    expect(() => render(doc(), canvasOf(ctx) as never, opts)).toThrow(TypeError);
    expect(() => render(doc(), canvasOf(ctx) as never, opts)).toThrow(re);
  });
});

describe('canvas writingMode type (K7)', () => {
  it('accepts only vertical (checked by typecheck)', () => {
    const horizontal: CanvasRenderOptions = {
      // @ts-expect-error horizontal is no longer accepted by the type
      writingMode: 'horizontal',
    };
    expect(horizontal).toBeDefined();
  });
});
