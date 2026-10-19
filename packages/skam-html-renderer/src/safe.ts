/**
 * SKAM HTML Renderer - 文書由来の値を HTML / CSS に出すための内部ヘルパー
 *
 * 基盤層: 純粋関数のみ。ブランド型 (SafeHtml / SafeCssValue) は、エスケープか許可リスト照合を
 * 通った値であることを型で示す。外部へは export しない。
 */

import { isEmphasisKeyword } from '@kanbun-skam/skam/rendering';
import { escapeHtml } from './html-utils.js';

/** escapeHtml を通した文字列 */
export type SafeHtml = string & { readonly __safeHtml: unique symbol };
/** 許可リストか整数の検査を通した、属性値・CSS 値として出力してよい文字列 */
export type SafeCssValue = string & { readonly __safeCss: unique symbol };

/**
 * テキストとして出す値をエスケープする。
 * 文字列以外 (配列・toString を持つオブジェクトなど) は String() で変換せず TypeError にする。
 * 変換すると検査時と使用時で別の値になりうるため。
 */
export function toSafeHtml(s: unknown): SafeHtml {
  if (typeof s !== 'string') {
    throw new TypeError('Expected a string for HTML output');
  }
  return escapeHtml(s) as SafeHtml;
}

/** 許可リストに含まれる文字列ならそのまま、そうでなければ fallback を返す */
export function safeCssKeyword<T extends string>(
  v: unknown,
  allowed: readonly T[],
  fallback: T
): SafeCssValue {
  return (
    typeof v === 'string' && (allowed as readonly string[]).includes(v) ? v : fallback
  ) as SafeCssValue;
}

/** 安全な整数だけを通す。指数表記や NaN が出力に混ざるのを防ぐ */
export function safeCssInteger(n: number): SafeCssValue {
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) {
    throw new TypeError('Expected a safe integer for CSS output');
  }
  return String(n) as SafeCssValue;
}

/**
 * text-emphasis-style に出す値。
 * キーワードはそのまま、カスタムの 1 文字は CSS 文字列 `"\<hex> "` にする。
 * style は呼び出し側で isValidEmphasisStyle を通した値 (または既定値) であること。
 */
export function toCssEmphasisValue(style: string): SafeCssValue {
  if (isEmphasisKeyword(style)) return style as SafeCssValue;
  const cp = style.codePointAt(0);
  if (cp === undefined) return 'filled dot' as SafeCssValue;
  return `"\\${cp.toString(16)} "` as SafeCssValue;
}
