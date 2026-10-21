/**
 * 返り点ユーティリティ
 */

import { KAERI } from '../index.js';
import type { KaeriMark } from '../index.js';

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
    if (char === KAERI.RE) {
      re += char;
    } else {
      nonRe += char;
    }
  }
  return { re, nonRe };
}

/**
 * 同じ位置の kaeri の注記を、marks[] の順に値をつないだ 1 つの値にする。
 *
 * 同じ位置の複数の kaeri は、つないだ値の 1 つの注記と同じに描く (順は意味を持つ)。
 * 描画の経路 (AIR、html、canvas) はすべてこの関数でつなぐ。値が文字列でない注記は飛ばす。
 * 描画は注記の `ext` を使わないので、つなぐ元の注記ごとの `ext` は結果に影響しない。
 */
export function joinKaeriValues(marks: readonly KaeriMark[]): string {
  let joined = '';
  for (const mark of marks) {
    if (typeof mark.value === 'string') joined += mark.value;
  }
  return joined;
}
