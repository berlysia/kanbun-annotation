/**
 * 返り点ユーティリティ
 */

/** Unicode Kanbun ブロック レ点 (U+3191) */
const KAERI_RE = '\u3191';

/**
 * tateten 内の返り点を「レ成分」と「非レ成分」に分離。
 * レはトークンの suffix に付与、非レはセパレータの kaeri に配置。
 *
 * value は既に Unicode Kanbun ブロック文字のため変換不要。
 */
export function splitKaeriForTateten(value: string): { re: string; nonRe: string } {
  let re = '';
  let nonRe = '';
  for (const char of value) {
    if (char === KAERI_RE) {
      re += char;
    } else {
      nonRe += char;
    }
  }
  return { re, nonRe };
}
