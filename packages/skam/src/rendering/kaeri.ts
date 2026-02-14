/**
 * 返り点 Unicode 変換
 */

import { KAERI_UNICODE } from './constants.js';

/**
 * 返り点記号を Unicode に変換。
 * 複合返り点（例: 一レ）は1文字ずつ変換して連結する。
 */
export function convertKaeriToUnicode(value: string): string {
  if (value.length === 1) {
    return KAERI_UNICODE[value] ?? value;
  }
  let result = '';
  for (const char of value) {
    result += KAERI_UNICODE[char] ?? char;
  }
  return result;
}

/**
 * tateten 内の返り点を「レ成分」と「非レ成分」に分離。
 * レはトークンの suffix に付与、非レはセパレータの kaeri に配置。
 */
export function splitKaeriForTateten(value: string): { re: string; nonRe: string } {
  let re = '';
  let nonRe = '';
  for (const char of value) {
    if (char === 'レ') {
      re += KAERI_UNICODE[char] ?? char;
    } else {
      nonRe += KAERI_UNICODE[char] ?? char;
    }
  }
  return { re, nonRe };
}
