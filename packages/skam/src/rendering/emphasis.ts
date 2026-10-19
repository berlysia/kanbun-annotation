/**
 * 傍点スタイル解決
 */

import { isValidEmphasisStyle } from '../validator.js';

const DEFAULT_EMPHASIS_CHAR = '•';

/**
 * CSS text-emphasis-style のキーワード (validator の EMPHASIS_KEYWORD が受ける 15 の形) と
 * 描画する文字の対応。Map にして Object.prototype のキーを拾わないようにする。
 */
const EMPHASIS_KEYWORD_CHARS: ReadonlyMap<string, string> = new Map([
  ['dot', '•'],
  ['filled dot', '•'],
  ['open dot', '◦'],
  ['circle', '●'],
  ['filled circle', '●'],
  ['open circle', '○'],
  ['double-circle', '◉'],
  ['filled double-circle', '◉'],
  ['open double-circle', '◎'],
  ['triangle', '▲'],
  ['filled triangle', '▲'],
  ['open triangle', '△'],
  ['sesame', '﹅'],
  ['filled sesame', '﹅'],
  ['open sesame', '﹆'],
]);

/**
 * EmphasisMark.style から、描画する傍点の文字を解決する。
 *
 * 入力は未信頼 (validator を通っていない値や文字列でない値も来うる)。
 * 1. 文字列でなければ既定の点
 * 2. キーワードと完全に一致すれば対応する文字 (大文字・前後の空白は一致とみなさない)
 * 3. validator が許す 1 文字のカスタム記号ならその文字
 * 4. それ以外は既定の点
 */
export function resolveEmphasisCharacter(style?: unknown): string {
  if (typeof style !== 'string') return DEFAULT_EMPHASIS_CHAR;
  const keywordChar = EMPHASIS_KEYWORD_CHARS.get(style);
  if (keywordChar !== undefined) return keywordChar;
  if (isValidEmphasisStyle(style)) return style;
  return DEFAULT_EMPHASIS_CHAR;
}
