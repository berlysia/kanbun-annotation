/**
 * @kanbun-skam/skam/rendering
 *
 * レンダラー共有ユーティリティ。
 * HTML / Canvas 両レンダラーで使用するマーク解決・変換ロジック。
 */

// 定数
export {
  IROHA_SEQUENCE,
  IROHA_HIRAGANA_SEQUENCE,
  GOJUON_SEQUENCE,
  GOJUON_HIRAGANA_SEQUENCE,
  KANJI_NUMBERS,
  CIRCLED_NUMBERS,
} from './constants.js';

// 型
export type { RangeMarkGroup } from './types.js';

// AIR 型定義
export type {
  AIRRenderProfile,
  AIRTrailingMark,
  AIRRangeInfo,
  AIRTokenSlots,
  AIRHiddenSlot,
  AIRTokenNode,
  AIRTatetenSeparator,
  AIRTatetenGroupNode,
  AIRHighlightGroupNode,
  AIRBlockStartRef,
  AIRBlockStartKutoten,
  AIRBlock,
  AIRBlockChild,
  AIRDocument,
} from './air-types.js';

// 表示設定
export {
  RENDER_PROFILES,
  RENDER_PROFILE_KEYS,
  SKAMRenderProfileError,
  resolveRenderProfile,
  type RenderProfile,
  type RenderProfileErrorKind,
  type RenderProfileInput,
  type RenderProfileKey,
  type RenderProfileName,
} from './render-profile.js';

// 読み上げ用テキスト (experimental)
export {
  describeAnnotationIR,
  formatAccessibleText,
  type AccessibleNote,
  type AccessibleUnit,
  type AccessibleBlock,
} from './accessible-text.js';

export { DEFAULT_ACCESSIBLE_LABELS, type AccessibleLabels } from './accessible-labels.js';

// 返り点
export { splitKaeriForTateten, joinKaeriValues } from './kaeri.js';

// 傍点
export { resolveEmphasisCharacter, isEmphasisKeyword } from './emphasis.js';

// Ref
export { formatRefIndex, resolveRefValues } from './ref.js';

// マークグルーピング
export { getTatetenGroups, getHighlightGroups, getRangeMarkGroups } from './mark-groups.js';

// マーク検索
export {
  getMarksForToken,
  createMarkLookup,
  type MarkLookup,
  type TokenMarks,
} from './mark-lookup.js';

// ヲコト点
export { resolveOkototenCell, type OkototenCell } from './okototen.js';

// ブロック
export { groupTokensByBlock } from './block-utils.js';

// Block-start marks
export { getBlockStartMarks } from './block-start.js';

// AIR Resolver
export { buildAnnotationIR } from './build-annotation-ir.js';

// 拡張が決める隠す所 (renderer が AIR と同じ判定を使う)
export { createHiding, type Hiding, type RenderExtensionOptions } from './hiding.js';

// 改行制御
export { canBreakBefore } from './line-break.js';

// アキ組み
export { resolveSpacingEm } from './spacing.js';
export type { Spacing, SpacingPreset } from './spacing.js';
