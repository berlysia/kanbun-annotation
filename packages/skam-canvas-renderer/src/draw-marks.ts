/**
 * Highlight 線の描画
 *
 * 5 種の CSS text-decoration-style 相当の線を Canvas API で描画する。
 */

import type { CanvasRenderingContext2DLike } from './canvas-context.js';
import type { HighlightLineLayout, OkototenLayout } from './types.js';

/**
 * highlight 線を描画する。
 * 縦書きなので、線は垂直方向（yStart → yEnd）に描画される。
 */
export function drawHighlightLine(
  ctx: CanvasRenderingContext2DLike,
  layout: HighlightLineLayout,
  color: string
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;

  switch (layout.style) {
    case 'solid':
      drawSolid(ctx, layout.x, layout.yStart, layout.yEnd);
      break;
    case 'dashed':
      drawDashed(ctx, layout.x, layout.yStart, layout.yEnd);
      break;
    case 'dotted':
      drawDotted(ctx, layout.x, layout.yStart, layout.yEnd);
      break;
    case 'wavy':
      drawWavy(ctx, layout.x, layout.yStart, layout.yEnd);
      break;
    case 'double':
      drawDouble(ctx, layout.x, layout.yStart, layout.yEnd);
      break;
  }

  ctx.restore();
}

function drawSolid(
  ctx: CanvasRenderingContext2DLike,
  x: number,
  yStart: number,
  yEnd: number
): void {
  ctx.beginPath();
  ctx.moveTo(x, yStart);
  ctx.lineTo(x, yEnd);
  ctx.stroke();
}

function drawDashed(
  ctx: CanvasRenderingContext2DLike,
  x: number,
  yStart: number,
  yEnd: number
): void {
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(x, yStart);
  ctx.lineTo(x, yEnd);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawDotted(
  ctx: CanvasRenderingContext2DLike,
  x: number,
  yStart: number,
  yEnd: number
): void {
  ctx.setLineDash([1, 3]);
  ctx.beginPath();
  ctx.moveTo(x, yStart);
  ctx.lineTo(x, yEnd);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawWavy(
  ctx: CanvasRenderingContext2DLike,
  x: number,
  yStart: number,
  yEnd: number
): void {
  const amplitude = 2;
  const wavelength = 8;
  const halfWave = wavelength / 2;

  ctx.beginPath();
  ctx.moveTo(x, yStart);

  let y = yStart;
  let direction = 1;
  while (y < yEnd) {
    const nextY = Math.min(y + halfWave, yEnd);
    const cpX = x + amplitude * direction;
    const cpY = y + (nextY - y) / 2;
    ctx.quadraticCurveTo(cpX, cpY, x, nextY);
    y = nextY;
    direction *= -1;
  }

  ctx.stroke();
}

function drawDouble(
  ctx: CanvasRenderingContext2DLike,
  x: number,
  yStart: number,
  yEnd: number
): void {
  const offset = 2;
  ctx.beginPath();
  ctx.moveTo(x - offset, yStart);
  ctx.lineTo(x - offset, yEnd);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + offset, yStart);
  ctx.lineTo(x + offset, yEnd);
  ctx.stroke();
}

/**
 * ヲコト点を描画する。shape ごとの見た目は HTML の ::before (・ / ○ / —) に対応させる。
 * 未知の shape は dot として塗りつぶす。
 */
export function drawOkototen(
  ctx: CanvasRenderingContext2DLike,
  dot: OkototenLayout,
  color: string
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  switch (dot.shape) {
    case 'circle':
      ctx.arc(dot.cx, dot.cy, dot.r, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'line':
      ctx.moveTo(dot.cx - dot.r, dot.cy);
      ctx.lineTo(dot.cx + dot.r, dot.cy);
      ctx.stroke();
      break;
    default:
      ctx.arc(dot.cx, dot.cy, dot.r, 0, Math.PI * 2);
      ctx.fill();
  }
  ctx.restore();
}
