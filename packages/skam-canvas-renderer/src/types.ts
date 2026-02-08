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

export interface CanvasBlockNode {
  type: 'block';
  blockId: string;
  children: CanvasBlockChild[];
}

export interface CanvasRenderTree {
  blocks: CanvasBlockNode[];
}

// ============================================================================
// Layout (Pass 2 output)
// ============================================================================

export interface SlotLayout {
  text: string;
  x: number;
  y: number;
  fontSize: number;
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
}
