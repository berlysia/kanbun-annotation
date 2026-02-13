/**
 * テキスト描画ヘルパー（縦書き用）
 *
 * CJK 文字は1文字ずつ fillText で描画する。
 */

import type { CanvasRenderingContext2DLike } from './canvas-context.js';

/**
 * 縦中横判定: 半角括弧付き1文字 or 2文字以下の半角文字
 *
 * HTML レンダラーの shouldApplyTateChuYoko と同等のロジック。
 * 全角括弧で囲まれた全角文字（例: "（イ）"）は縦中横不要。
 */
export function shouldApplyTateChuYoko(text: string): boolean {
  // 半角丸括弧または角括弧で囲まれた1文字の場合
  if (/^[([][A-Za-z0-9][)\]]$/.test(text)) {
    return true;
  }
  // 2文字以下の半角文字の場合（印字可能ASCII: 0x20-0x7E）
  if (/^[\x20-\x7E]{1,2}$/.test(text)) {
    return true;
  }
  return false;
}

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
  fontFamily: string
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
  fontFamily: string
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

/**
 * 縦中横テキストを描画する。
 * テキスト全体を横書きで1行に描画する（ref括弧等）。
 * y 座標はテキストブロックの上端。
 */
export function drawTateChuYokoText(
  ctx: CanvasRenderingContext2DLike,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  color: string,
  fontFamily: string
): void {
  ctx.save();
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  // テキスト全体を1つの fillText で横書き描画
  ctx.fillText(text, x, y);
  ctx.restore();
}
