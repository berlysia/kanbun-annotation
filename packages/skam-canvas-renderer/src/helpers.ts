/**
 * ドメインヘルパー
 */

import type { Token, Mark, RefMark, RefFormat } from '@kanbun/skam';
import {
  KAERI_UNICODE,
  IROHA_SEQUENCE,
  IROHA_HIRAGANA_SEQUENCE,
  GOJUON_SEQUENCE,
  GOJUON_HIRAGANA_SEQUENCE,
  KANJI_NUMBERS,
  CIRCLED_NUMBERS,
} from './constants.js';

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

/**
 * インデックスをフォーマットに従って文字列化
 */
export function formatRefIndex(index: number, format: RefFormat): string {
  switch (format) {
    case 'alpha-upper':
      return `(${String.fromCharCode(65 + index)})`; // A=65
    case 'alpha-lower':
      return `(${String.fromCharCode(97 + index)})`; // a=97
    case 'numeric-paren':
      return `(${index + 1})`;
    case 'numeric-bracket':
      return `[${index + 1}]`;
    case 'numeric-circled':
      return CIRCLED_NUMBERS[index] ?? `(${index + 1})`;
    case 'iroha-katakana':
      return `（${IROHA_SEQUENCE[index] ?? String(index + 1)}）`;
    case 'iroha-hiragana':
      return `（${IROHA_HIRAGANA_SEQUENCE[index] ?? String(index + 1)}）`;
    case 'gojuon-katakana':
      return `（${GOJUON_SEQUENCE[index] ?? String(index + 1)}）`;
    case 'gojuon-hiragana':
      return `（${GOJUON_HIRAGANA_SEQUENCE[index] ?? String(index + 1)}）`;
    case 'kanji-numeric':
      return `（${KANJI_NUMBERS[index] ?? String(index + 1)}）`;
    default:
      return `(${index + 1})`;
  }
}

/** position.after のトークン ID を取得 */
function getPositionAfterTokenId(position: { after?: string }): string | undefined {
  if ('after' in position && position.after) {
    return position.after;
  }
  return undefined;
}

/**
 * ドキュメント内の RefMark を解決して表示文字列マップを生成。
 *
 * 同一性判定:
 * - 同じ label 値を持つ ref は同一
 * - 同じ format + 同じ ext.value を持つ ref は同一
 *
 * 番号付けは文書内での登場順（position.after のトークン位置）に基づく。
 */
export function resolveRefValues(tokens: Token[], marks: Mark[]): Map<RefMark, string> {
  const refMarks = marks.filter((m): m is RefMark => m.type === 'ref');

  // token位置のインデックスマップを作成
  const tokenIndexMap = new Map<string, number>();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token) {
      tokenIndexMap.set(token.id, i);
    }
  }

  // position.afterのtoken位置でソート（文書内の登場順）
  const sortedRefMarks = [...refMarks].sort((a, b) => {
    const aTokenId = getPositionAfterTokenId(a.position);
    const bTokenId = getPositionAfterTokenId(b.position);
    const aIndex = aTokenId ? (tokenIndexMap.get(aTokenId) ?? Infinity) : Infinity;
    const bIndex = bTokenId ? (tokenIndexMap.get(bTokenId) ?? Infinity) : Infinity;
    return aIndex - bIndex;
  });

  const result = new Map<RefMark, string>();

  // label指定ありのrefをlabel値でグループ化
  const labelToIndex = new Map<string, number>();

  // format指定ありのrefをフォーマット別にグループ化
  const formatGroups = new Map<string, RefMark[]>();

  let nextLabelIndex = 0;

  for (const ref of sortedRefMarks) {
    if (ref.label) {
      let index = labelToIndex.get(ref.label);
      if (index === undefined) {
        index = nextLabelIndex++;
        labelToIndex.set(ref.label, index);
      }
      result.set(ref, ref.label);
    } else if (ref.format) {
      const group = formatGroups.get(ref.format) ?? [];
      group.push(ref);
      formatGroups.set(ref.format, group);
    } else if (ref.content && !ref.label && !ref.format) {
      // contentのみの場合: 暗黙的にnumeric-bracketフォーマットで番号を割り当て
      const group = formatGroups.get('numeric-bracket') ?? [];
      group.push(ref);
      formatGroups.set('numeric-bracket', group);
    }
  }

  // 各フォーマットグループ内でインデックスを割り当て
  for (const [format, refs] of formatGroups) {
    const valueToIndex = new Map<string, number>();
    let nextIndex = 0;

    for (const ref of refs) {
      let index: number;

      // ext.value を同一性判定に使用
      const extValue = ref.ext?.['value'] as string | undefined;

      if (extValue !== undefined) {
        const existingIndex = valueToIndex.get(extValue);
        if (existingIndex !== undefined) {
          index = existingIndex;
        } else {
          index = nextIndex++;
          valueToIndex.set(extValue, index);
        }
      } else {
        index = nextIndex++;
      }

      result.set(ref, formatRefIndex(index, format as RefFormat));
    }
  }

  return result;
}
