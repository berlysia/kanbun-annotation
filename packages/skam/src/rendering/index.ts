/**
 * @kanbun/skam/rendering
 *
 * レンダラー共有ユーティリティ。
 * HTML / Canvas 両レンダラーで使用するマーク解決・変換ロジック。
 */

// 定数
export {
  KAERI_UNICODE,
  IROHA_SEQUENCE,
  IROHA_HIRAGANA_SEQUENCE,
  GOJUON_SEQUENCE,
  GOJUON_HIRAGANA_SEQUENCE,
  KANJI_NUMBERS,
  CIRCLED_NUMBERS,
} from './constants.js';

// 型
export type { RangeMarkGroup } from './types.js';

// 返り点
export { convertKaeriToUnicode } from './kaeri.js';

// 傍点
export { resolveEmphasisCharacter } from './emphasis.js';

// Ref
export { formatRefIndex, resolveRefValues } from './ref.js';

// マークグルーピング
export { getTatetenGroups, getHighlightGroups, getRangeMarkGroups } from './mark-groups.js';

// マーク検索
export { getMarksForToken } from './mark-lookup.js';

// ブロック
export { groupTokensByBlock } from './block-utils.js';
