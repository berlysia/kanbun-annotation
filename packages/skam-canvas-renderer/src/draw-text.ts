/**
 * テキスト描画ヘルパー（縦書き用）
 *
 * CJK 文字は1文字ずつ fillText で描画する。
 */

import type { CanvasRenderingContext2DLike } from './canvas-context.js';

/**
 * 単一文字を描画する
 */
export function drawChar(
  ctx: CanvasRenderingContext2DLike,
  char: string,
  x: number,
  y: number,
  fontSize: number,
  color: string,
  fontFamily: string,
): void {
  ctx.save();
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  ctx.fillText(char, x, y);
  ctx.restore();
}

/**
 * 注釈テキスト（ruby, okurigana 等）を縦書きで描画する。
 * 各文字を個別に上→下へ配置する。
 */
export function drawVerticalText(
  ctx: CanvasRenderingContext2DLike,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  color: string,
  fontFamily: string,
): void {
  ctx.save();
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';

  let currentY = y;
  for (const char of text) {
    ctx.fillText(char, x, currentY);
    currentY += fontSize;
  }
  ctx.restore();
}
