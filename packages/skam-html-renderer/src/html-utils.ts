/**
 * SKAM HTML Renderer - HTML Utility Functions
 *
 * 基盤層: 純粋関数のみ。他の内部モジュール（renderer.ts 等）を参照しない。
 */

import type { SKAMDocument, Token } from '@kanbun-skam/skam';
import { groupTokensByBlock } from '@kanbun-skam/skam/rendering';

/**
 * 原文順の token 列。AIR (表示層) と同じ規則で並べる。
 * blocks が空なら tokens の配列順、存在しない id は飛ばし、どの block にも属さない token は含めない。
 * @internal
 */
export function getSourceOrderedTokens(doc: SKAMDocument): Token[] {
  return groupTokensByBlock(doc.blocks, doc.tokens).flatMap((g) => g.tokens);
}

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

/** 半角幅で描かれる字: ASCII と Latin-1、半角カナ (U+FF61〜U+FF9F)、半角の記号 (U+FFE8〜U+FFEE) */
function isNarrowCodePoint(codePoint: number): boolean {
  return (
    codePoint <= 0xff ||
    (codePoint >= 0xff61 && codePoint <= 0xff9f) ||
    (codePoint >= 0xffe8 && codePoint <= 0xffee)
  );
}

/**
 * 隠す注記の中身を、1 字ずつ空白に置き換える。全角の字は U+3000、半角の字は U+00A0。
 * 占める場所は残るが、字数は空白の数から分かる。結果は escape の要らない空白だけ
 * @internal
 */
export function blankOut(text: string): string {
  let blank = '';
  for (const char of text) {
    blank += isNarrowCodePoint(char.codePointAt(0)!) ? '\u00A0' : '\u3000';
  }
  return blank;
}

/**
 * テキストの各文字に対応する傍点マーク文字列を生成
 * @internal
 */
export function generateEmphasisMarks(text: string, emphasisChar: string): string {
  // 公開関数なので、直接呼ばれても HTML を壊さないよう傍点の文字をここで 1 回だけ escape する
  const escapedChar = escapeHtml(emphasisChar);
  return Array.from(text)
    .map(() => escapedChar)
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
