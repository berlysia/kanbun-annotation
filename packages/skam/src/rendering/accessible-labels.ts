/**
 * 読み上げ用テキストの既定の言葉（日本語）。
 *
 * 構造（accessible-text.ts）から独立させ、別の言葉を使う利用者は `labels` で差し替える。
 */

import type { AccessibleNote } from './accessible-text.js';

/**
 * 注記の種類ごとの、言葉にする関数。
 *
 * kind が増えるとキーが増える。`Partial` で渡すかぎり、既存の呼び出しは壊れない。
 *
 * @experimental
 */
export type AccessibleLabels = {
  [K in AccessibleNote['kind']]: (note: Extract<AccessibleNote, { kind: K }>) => string;
};

/** U+3191〜U+319F の返り点の読み */
const KAERI_READINGS: Readonly<Record<string, string>> = {
  '㆑': 'レ',
  '㆒': '一',
  '㆓': '二',
  '㆔': '三',
  '㆕': '四',
  '㆖': '上',
  '㆗': '中',
  '㆘': '下',
  '㆙': '甲',
  '㆚': '乙',
  '㆛': '丙',
  '㆜': '丁',
  '㆝': '天',
  '㆞': '地',
  '㆟': '人',
};

/**
 * 返り点の名前。値の各文字を読みに変えて「点」を付ける（`㆒㆑` → `一レ点`）。
 * 表に無い文字を 1 つでも含む値は `返り点 {値}` とする。
 */
function nameKaeri(value: string): string {
  let name = '';
  for (const char of value) {
    const reading = Object.hasOwn(KAERI_READINGS, char) ? KAERI_READINGS[char] : undefined;
    if (reading === undefined) return `返り点 ${value}`;
    name += reading;
  }
  return `${name}点`;
}

/**
 * 既定の言葉。読み上げの言葉は 0.x の minor で変わりうる。
 *
 * @experimental
 */
export const DEFAULT_ACCESSIBLE_LABELS: Readonly<AccessibleLabels> = Object.freeze({
  yomigana: (note) => `読み ${note.value}`,
  okurigana: (note) => `送り仮名 ${note.value}`,
  soegana: (note) => `添え仮名 ${note.value}`,
  saidoku: (note) => ['再読文字', note.first, note.second].filter((part) => part !== '').join(' '),
  kaeri: (note) => nameKaeri(note.value),
  kutoten: (note) => {
    if (note.value === '。') return '句点';
    if (note.value === '、') return '読点';
    return `句読点 ${note.value}`;
  },
  okimoji: () => '置き字',
  joji: () => '助字',
  emphasis: () => '傍点',
  okototen: () => 'ヲコト点',
  ref: (note) => `注 ${note.label}`,
  tateten: (note) => (note.kaeri ? `竪点、${nameKaeri(note.kaeri)}` : '竪点'),
  highlightStart: (note) => (note.label ? `傍線 ${note.label} 始め` : '傍線 始め'),
  highlightEnd: () => '傍線 終わり',
});
