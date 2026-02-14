/**
 * テキスト描画ヘルパー（縦書き用）
 *
 * CJK 文字は1文字ずつ fillText で描画する。
 */

import type { CanvasRenderingContext2DLike } from './canvas-context.js';

/**
 * 横書き用括弧 → 縦書き用 Presentation Form への置換マップ。
 *
 * Canvas API は OpenType vert feature を適用しないため、
 * CJK 括弧類は横書きグリフのまま描画される。
 * ブラウザの writing-mode: vertical-rl では自動でグリフが切り替わるが、
 * Canvas では Unicode の Vertical Presentation Forms (U+FE30–FE4F) に
 * 手動で置換する必要がある。
 *
 * 参照: https://www.unicode.org/charts/nameslist/n_FE30.html
 */
const VERTICAL_FORM_MAP: ReadonlyMap<string, string> = new Map([
  // U+FF08/FF09 全角丸括弧 → U+FE35/FE36
  ['（', '︵'],
  ['）', '︶'],
  // U+3014/3015 亀甲括弧 → U+FE39/FE3A
  ['〔', '︹'],
  ['〕', '︺'],
  // U+3010/3011 隅付き括弧 → U+FE3B/FE3C
  ['【', '︻'],
  ['】', '︼'],
  // U+300A/300B 二重山括弧 → U+FE3D/FE3E
  ['《', '︽'],
  ['》', '︾'],
  // U+3008/3009 山括弧 → U+FE3F/FE40
  ['〈', '︿'],
  ['〉', '﹀'],
  // U+300C/300D 鉤括弧 → U+FE41/FE42
  ['「', '﹁'],
  ['」', '﹂'],
  // U+300E/300F 二重鉤括弧 → U+FE43/FE44
  ['『', '﹃'],
  ['』', '﹄'],
]);

/**
 * 縦書き用グリフへの置換が必要な文字か判定する。
 */
export function getVerticalForm(char: string): string | undefined {
  return VERTICAL_FORM_MAP.get(char);
}

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
    const verticalForm = getVerticalForm(char);
    ctx.fillText(verticalForm ?? char, x, currentY);
    currentY += fontSize;
  }
  ctx.restore();
}

/**
 * 句読点文字を縦書き位置に補正して描画する。
 *
 * Canvas API は横書きグリフのみ描画する。CJK 句読点（。、）の横書きグリフは
 * em box の左下に字形があるが、縦書きでは右上に移動する（OpenType vert feature）。
 * ブラウザの writing-mode: vertical-rl はこのグリフ切り替えを自動で行うが、
 * Canvas では手動でオフセット補正する必要がある。
 *
 * 横書きグリフの字形は em box 中心から左下に約半 em 偏っているため、
 * em box を (+fontSize/2, -fontSize/2) シフトして右上に移す。
 */
export function drawKutotenText(
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

  const offset = fontSize / 2;
  let currentY = y;
  for (const char of text) {
    ctx.fillText(char, x + offset, currentY - offset);
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
