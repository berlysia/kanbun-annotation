/**
 * canvas renderer の計測用の偽の canvas。
 *
 * 描画の命令は数えるだけで、中身は記録しない (記録の確保が計測に混ざらないようにするため)。
 * renderer が使う API の範囲は `CanvasRenderingContext2DLike` の型で決まり、型に API が増えればここで typecheck が落ちる。
 */

import type { CanvasLike, CanvasRenderingContext2DLike } from '@kanbun-skam/skam-canvas-renderer';

/** 1 字の幅 */
const GLYPH_WIDTH = 24;
const ASCENT = 20;
const DESCENT = 4;

export interface FakeCanvas extends CanvasLike {
  readonly stats: { fillText: number };
}

export function createFakeCanvas(): FakeCanvas {
  const stats = { fillText: 0 };
  let fillStyle = '';
  let strokeStyle = '';
  const noop = (): void => {};
  const context: CanvasRenderingContext2DLike = {
    font: '',
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value: string) {
      fillStyle = value;
    },
    get strokeStyle() {
      return strokeStyle;
    },
    set strokeStyle(value: string) {
      strokeStyle = value;
    },
    lineWidth: 1,
    textBaseline: 'alphabetic',
    textAlign: 'start',
    globalAlpha: 1,
    fillText: () => {
      stats.fillText += 1;
    },
    strokeText: noop,
    measureText: (text) => ({
      width: [...text].length * GLYPH_WIDTH,
      actualBoundingBoxAscent: ASCENT,
      actualBoundingBoxDescent: DESCENT,
      fontBoundingBoxAscent: ASCENT,
      fontBoundingBoxDescent: DESCENT,
    }),
    fillRect: noop,
    strokeRect: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    quadraticCurveTo: noop,
    stroke: noop,
    fill: noop,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    setLineDash: noop,
    clearRect: noop,
  };
  // width / height は renderer の autoSize が設定する
  return { width: 0, height: 0, getContext: () => context, stats };
}
