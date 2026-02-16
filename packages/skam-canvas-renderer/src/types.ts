/**
 * Canvas Renderer 型定義
 */

import type { Token, HighlightStyle } from '@kanbun/skam';
import type { RenderProfile } from './profiles.js';

// ============================================================================
// Render Options
// ============================================================================

export interface PaddingConfig {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface CanvasRenderOptions {
  writingMode?: 'vertical' | 'horizontal';
  profile?: Partial<RenderProfile>;
  fontSize?: number;
  fontFamily?: string;
  rubyRatio?: number;
  lineHeight?: number;
  columnGap?: number;
  padding?: number | PaddingConfig;
  backgroundColor?: string;
  textColor?: string;
  pixelRatio?: number;
  autoSize?: boolean;
  maxExtent?: number;
  /** 列幅モード: 'uniform'=全ブロック統一（デフォルト）, 'adaptive'=ブロック別最適化 */
  columnSizing?: 'uniform' | 'adaptive';
  /** range ruby overflow 時の配置: 'distribute'=均等配分（デフォルト）, 'center'=中央寄せ */
  rangeRubyAlignment?: 'distribute' | 'center';
  /** non-overflow 時（漢字列 >= ルビ）のルビ側配置: 'justify'=均等配分（デフォルト）, 'center'=中央, 'start'=先頭, 'end'=末尾 */
  rangeRubyAlign?: 'center' | 'start' | 'end' | 'justify' | 'space-around' | 'space-evenly';
  /**
   * em box 上端から alphabetic baseline までの距離の比率 (0–1)。
   * fontSize × emAscentRatio = em ascent として描画位置を補正する。
   *
   * Chrome/Firefox では ideographic baseline から自動算出されるが、
   * Safari では ideographic baseline の実装バグにより自動算出できない。
   * Safari のフォールバックはCJKフォント標準の 0.88 (sTypoAscender=880/UPM=1000)。
   * Noto Serif JP 以外のフォントで Safari の描画位置がずれる場合、
   * フォントの sTypoAscender / unitsPerEm を指定する。
   */
  emAscentRatio?: number;
}

export interface MeasureOptions {
  writingMode?: 'vertical' | 'horizontal';
  profile?: Partial<RenderProfile>;
  fontSize?: number;
  fontFamily?: string;
  rubyRatio?: number;
  lineHeight?: number;
  columnGap?: number;
  padding?: number | PaddingConfig;
  /** 列幅モード: 'uniform'=全ブロック統一（デフォルト）, 'adaptive'=ブロック別最適化 */
  columnSizing?: 'uniform' | 'adaptive';
  /** range ruby overflow 時の配置: 'distribute'=均等配分（デフォルト）, 'center'=中央寄せ */
  rangeRubyAlignment?: 'distribute' | 'center';
  /** non-overflow 時（漢字列 >= ルビ）のルビ側配置: 'justify'=均等配分（デフォルト）, 'center'=中央, 'start'=先頭, 'end'=末尾 */
  rangeRubyAlign?: 'center' | 'start' | 'end' | 'justify' | 'space-around' | 'space-evenly';
}

export interface DocumentDimensions {
  width: number;
  height: number;
}

// ============================================================================
// Render Tree (Pass 1 output)
// ============================================================================

export interface TokenSlots {
  ruby?: string;
  /** range yomigana がまたがるトークン数（省略時 = 1、先頭トークンにのみ設定） */
  rubySpan?: number;
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

export interface CanvasTokenNode {
  type: 'token';
  token: Token;
  slots: TokenSlots;
}

export interface CanvasTatetenSeparator {
  type: 'tateten-separator';
  kaeri?: string;
}

export interface CanvasTatetenGroupNode {
  type: 'tateten-group';
  children: (CanvasTokenNode | CanvasTatetenSeparator)[];
}

export interface CanvasHighlightGroupNode {
  type: 'highlight-group';
  highlightStyle: HighlightStyle;
  highlightRef?: string;
  refLabel?: string;
  children: (CanvasTokenNode | CanvasTatetenGroupNode)[];
}

export type CanvasBlockChild = CanvasTokenNode | CanvasTatetenGroupNode | CanvasHighlightGroupNode;

/** ブロック単位のレイアウトフラグ（各ブロックの children から集約） */
export interface BlockLayoutFlags {
  hasSuffix: boolean;
  hasSaidoku: boolean;
  hasRightColumn: boolean;
  hasEmphasis: boolean;
  hasHighlight: boolean;
  /** highlight-group に refLabel を持つものが存在 → 列右側に追加幅が必要 */
  hasRefLabel: boolean;
}

export interface CanvasBlockNode {
  type: 'block';
  blockId: string;
  children: CanvasBlockChild[];
  /** ブロック内トークンから集約したレイアウトフラグ */
  flags: BlockLayoutFlags;
}

export interface CanvasRenderTree {
  blocks: CanvasBlockNode[];
  /** 文書内にレイアウト拡張が必要なスロット（okuri/soegana/kaeri/kutoten/saidoku）があるか */
  hasSuffix: boolean;
  /** saidokuUnder or saidokuOkuri2 が存在 → 左列(R)を割り当て */
  hasSaidoku: boolean;
  /** ruby, okuri, soegana が存在 → 右列(R)を割り当て */
  hasRightColumn: boolean;
  /** emphasis マークが存在 → 列右側に追加幅が必要 */
  hasEmphasis: boolean;
  /** highlight マークが存在 → 列右側に追加幅が必要 */
  hasHighlight: boolean;
  /** highlight-group に refLabel を持つものが存在 → 列右側に追加幅が必要 */
  hasRefLabel: boolean;
}

// ============================================================================
// Layout (Pass 2 output)
// ============================================================================

export interface SlotLayout {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  /** 縦中横: テキストを横書きで1行に描画する（ref括弧等） */
  tateChuYoko?: boolean;
  /** justify 配置時の文字間隔（fontSize と異なる場合のみ設定） */
  charAdvance?: number;
}

export interface ResolvedSlotLayouts {
  ruby?: SlotLayout;
  okuri?: SlotLayout;
  soegana?: SlotLayout;
  kaeri?: SlotLayout;
  kutoten?: SlotLayout;
  emphasis?: SlotLayout;
  saidokuUnder?: SlotLayout;
  saidokuOkuri2?: SlotLayout;
  ref?: SlotLayout;
}

export interface TokenLayout {
  type: 'token';
  tokenId: string;
  x: number;
  y: number;
  baseChar: string;
  slots: ResolvedSlotLayouts;
}

export interface TatetenSeparatorLayout {
  type: 'tateten-separator';
  x: number;
  y: number;
  fontSize: number;
  kaeri?: SlotLayout;
}

export interface HighlightLineLayout {
  style: HighlightStyle;
  x: number;
  yStart: number;
  yEnd: number;
  refLayout?: SlotLayout;
}

export type ColumnChild = TokenLayout | TatetenSeparatorLayout;

export interface ColumnLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  children: ColumnChild[];
  highlightLines?: HighlightLineLayout[];
}

export interface DocumentLayout {
  width: number;
  height: number;
  columns: ColumnLayout[];
}

// ============================================================================
// Pass 2 Internal Types (layout-vertical layers)
// ============================================================================

/** @internal 列幅・ベース中心位置・右側追加幅 */
export interface ColumnDimensions {
  columnWidth: number;
  baseCenterX: number;
  extraRightWidth: number;
  /** columnWidth + extraRightWidth */
  fullColumnWidth: number;
}

/** @internal 事前計算済みグリッド列位置（絶対 X 座標） */
export interface GridColumns {
  /** ruby, okuri, soegana */
  suffixX: number;
  /** 返り点 */
  kaeriX: number;
  /** 再読2回目 */
  saidoku2X: number;
  /** 句読点 */
  kutotenX: number;
}

/** @internal Analysis レイヤ出力: ドキュメント全体の分析結果 */
export interface DocumentAnalysis {
  documentFlags: BlockLayoutFlags;
  documentMaxRubyWidth: number;
  blocks: BlockAnalysis[];
}

/** @internal Analysis レイヤ出力: ブロック単位の分析結果 */
export interface BlockAnalysis {
  block: CanvasBlockNode;
  tokens: CanvasTokenNode[];
  maxRubyWidth: number;
  /** block.flags の参照保持（再計算しない） */
  flags: BlockLayoutFlags;
}

/** @internal Column Planning レイヤ出力: ブロック単位の列計画 */
export interface ColumnPlan {
  blockIndex: number;
  x: number;
  dimensions: ColumnDimensions;
  /** effective flags（uniform: doc flags, adaptive: block flags） */
  flags: BlockLayoutFlags;
  grid: GridColumns;
  /** highlight rightAdjust 用（uniform: doc 値, adaptive: block 値） */
  effectiveMaxRubyWidth: number;
}

// ============================================================================
// Resolved Options (internal)
// ============================================================================

export interface ResolvedOptions {
  writingMode: 'vertical' | 'horizontal';
  profile: RenderProfile;
  fontSize: number;
  fontFamily: string;
  rubyRatio: number;
  lineHeight: number;
  columnGap: number;
  padding: PaddingConfig;
  backgroundColor: string;
  textColor: string;
  pixelRatio: number;
  autoSize: boolean;
  maxExtent: number | undefined;
  columnSizing: 'uniform' | 'adaptive';
  rangeRubyAlignment: 'distribute' | 'center';
  rangeRubyAlign: 'center' | 'start' | 'end' | 'justify' | 'space-around' | 'space-evenly';
  emAscentRatio: number | undefined;
}
