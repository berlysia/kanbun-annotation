/**
 * ドメインヘルパー
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
 * CSS text-emphasis-style 値から対応する Unicode 傍点文字を解決。
 * EmphasisMark.style（省略時は 'filled dot'）を受け取る。
 */
export function resolveEmphasisCharacter(style?: string): string {
  if (!style) return '\u2022'; // default: filled dot
  const s = style.trim().toLowerCase();
  const open = s.includes('open');

  if (s.includes('sesame')) return open ? '\uFE46' : '\uFE45';
  if (s.includes('double-circle')) return open ? '\u25CE' : '\u25C9';
  if (s.includes('circle')) return open ? '\u25CB' : '\u25CF';
  if (s.includes('triangle')) return open ? '\u25B3' : '\u25B2';
  // 'dot' or default
  return open ? '\u25E6' : '\u2022';
}
