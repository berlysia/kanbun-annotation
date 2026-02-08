/**
 * Canvas レンダラー固有ヘルパー
 */

import { KAERI_UNICODE } from '@kanbun/skam/rendering';

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
