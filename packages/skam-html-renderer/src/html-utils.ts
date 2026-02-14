/**
 * SKAM HTML Renderer - HTML Utility Functions
 *
 * 基盤層: 純粋関数のみ。他の内部モジュール（renderer.ts 等）を参照しない。
 */

/**
 * HTMLエスケープ
 * @internal
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * テキストの各文字に対応する傍点マーク文字列を生成
 * @internal
 */
export function generateEmphasisMarks(text: string, emphasisChar: string): string {
  return Array.from(text)
    .map(() => emphasisChar)
    .join('');
}

/**
 * 縦中横を適用すべきかを判定
 *
 * 以下の条件で縦中横を適用:
 * - 半角括弧で囲まれた1文字（例: "(A)", "(1)", "[1]"）
 * - または2文字以下の半角文字
 *
 * 全角括弧で囲まれた全角文字（例: "（イ）"）は縦中横不要
 * @internal
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
