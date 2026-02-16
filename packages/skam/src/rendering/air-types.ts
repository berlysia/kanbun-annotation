/**
 * AIR (Annotation Intermediate Representation) 型定義
 *
 * HTML/Canvas 両レンダラーの Pass1 相当の意味解決結果を統一する共通データモデル。
 * Resolver 層（buildAnnotationIR）が生成し、各 Adapter 層が消費する。
 *
 * 設計原則:
 * - 意味情報の完全保持（renderer 非依存）
 * - trailing marks は二層構造: raw（元 Mark 参照）+ resolved（描画用文字列）
 * - BlockLayoutFlags 等の renderer 固有レイアウト補助値は含めない（Adapter が導出）
 */

import type { Token, Mark, TatetenMark, HighlightMark, HighlightStyle } from '../index.js';

// ============================================================================
// Render Profile（共通）
// ============================================================================

/** 表示要素の制御プロファイル（HTML/Canvas 共通） */
export interface AIRRenderProfile {
  yomigana: boolean;
  okurigana: boolean;
  kaeriten: boolean;
  kutoten: boolean;
  saidoku: boolean;
  okototen: boolean;
  tateten: boolean;
  emphasis: boolean;
  okimoji: boolean;
  joji: boolean;
  soegana: boolean;
  highlight: boolean;
  ref: boolean;
}

// ============================================================================
// Trailing Mark（二層構造: raw + resolved）
// ============================================================================

/**
 * range mark 集約時に後続トークンから収集される mark の中間表現。
 * kind: mark の種類
 * sourceTokenId: 元々この mark が紐づいていたトークン ID
 * raw: 元の Mark オブジェクト参照（HTML Adapter が属性抽出に使用）
 * resolved: 描画用の解決済み文字列（Canvas Adapter がそのまま使用）
 */
export interface AIRTrailingMark {
  kind: 'kaeri' | 'kutoten' | 'ref' | 'okimoji' | 'joji' | 'emphasis';
  sourceTokenId: string;
  raw: Mark;
  resolved: string;
}

// ============================================================================
// Range mark 集約情報
// ============================================================================

/** range mark の集約結果（yomigana/okurigana/soegana） */
export interface AIRRangeInfo {
  /** 集約対象の先頭トークン ID */
  fromTokenId: string;
  /** 集約対象の末尾トークン ID */
  toTokenId: string;
  /** 集約対象の全トークン ID（順序保持） */
  tokenIds: string[];
  /** yomigana: 全トークンのテキストを結合したベーステキスト + 読み値 */
  yomigana?: { baseText: string; value: string; span: number };
  /** okurigana: 全トークンのテキストを結合したベーステキスト + 値 */
  okurigana?: { baseText: string; value: string };
  /** soegana: 全トークンのテキストを結合したベーステキスト + 値 */
  soegana?: { baseText: string; value: string };
  /** 後続トークンから収集された trailing marks */
  trailingMarks: AIRTrailingMark[];
}

// ============================================================================
// Token Node
// ============================================================================

/**
 * 解決済みトークンスロット。
 * Canvas の TokenSlots と同等だが、renderer 固有の最適化（rubySpan 等）は含まない。
 */
export interface AIRTokenSlots {
  ruby?: string;
  okuri?: string;
  soegana?: string;
  kaeri?: string;
  kutoten?: string;
  isOkimoji?: boolean;
  isJoji?: boolean;
  emphasis?: string;
  saidokuUnder?: string;
  saidokuOkuri2?: string;
  ref?: string;
}

/** AIR のトークンノード */
export interface AIRTokenNode {
  type: 'token';
  token: Token;
  slots: AIRTokenSlots;
  /** range mark に属する場合の集約情報（先頭トークンのみに設定） */
  rangeInfo?: AIRRangeInfo;
  /** range group の非リードトークン（リードトークンの rangeInfo に集約済み） */
  rangeConsumed?: true;
}

// ============================================================================
// Tateten Group
// ============================================================================

/** tateten セパレータ */
export interface AIRTatetenSeparator {
  type: 'tateten-separator';
  /** 非レ返り点（Unicode 変換済み） */
  kaeri?: string;
}

/** tateten グループ: 連続する同一 tateten mark のトークン群 */
export interface AIRTatetenGroupNode {
  type: 'tateten-group';
  tatetenMark: TatetenMark;
  children: (AIRTokenNode | AIRTatetenSeparator)[];
  /** tateten と読み範囲が重複する場合の集約情報 */
  rangeInfo?: AIRRangeInfo;
}

// ============================================================================
// Highlight Group
// ============================================================================

/** highlight グループ: 連続する同一 highlight mark のノード群 */
export interface AIRHighlightGroupNode {
  type: 'highlight-group';
  highlightMark: HighlightMark;
  highlightStyle: HighlightStyle;
  /** highlight が参照する ref の解決済みラベル（例: "(1)"） */
  refLabel?: string;
  children: (AIRTokenNode | AIRTatetenGroupNode)[];
  /** グループ内にルビ付きトークンが存在するか */
  hasKana: boolean;
}

// ============================================================================
// Block
// ============================================================================

/** block-start position の解決済みデータ */
export interface AIRBlockStartRef {
  refId?: string;
  resolved: string;
}

export interface AIRBlockStartKutoten {
  value: string;
}

/** AIR のブロックノード */
export interface AIRBlock {
  blockId: string;
  children: AIRBlockChild[];
  /** block-start position の ref（解決済みラベル） */
  blockStartRefs: AIRBlockStartRef[];
  /** block-start position の kutoten */
  blockStartKutoten: AIRBlockStartKutoten[];
}

export type AIRBlockChild = AIRTokenNode | AIRTatetenGroupNode | AIRHighlightGroupNode;

// ============================================================================
// Document
// ============================================================================

/** AIR ドキュメント: buildAnnotationIR の出力 */
export interface AIRDocument {
  blocks: AIRBlock[];
}
