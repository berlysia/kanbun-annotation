/**
 * Canvas Renderer 型定義
 */

import type { Token } from '@kanbun/skam';
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
  okuri?: string;
  soegana?: string;
  kaeri?: string;
  kutoten?: string;
  isOkimoji?: boolean;
  isJoji?: boolean;
}

export interface CanvasTokenNode {
  type: 'token';
  token: Token;
  slots: TokenSlots;
}

export interface CanvasBlockNode {
  type: 'block';
  blockId: string;
  tokens: CanvasTokenNode[];
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
}

export interface TokenLayout {
  tokenId: string;
  x: number;
  y: number;
  baseChar: string;
  slots: ResolvedSlotLayouts;
}

export interface ColumnLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  tokens: TokenLayout[];
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
