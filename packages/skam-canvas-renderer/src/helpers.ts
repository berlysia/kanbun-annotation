/**
 * ドメインヘルパー
 *
 * Phase 1: kaeri 変換のみ。
 * Phase 2-3 で emphasis 解決、ref 書式等を追加。
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
