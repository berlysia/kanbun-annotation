/**
 * Pass 2 オーケストレータ: CanvasRenderTree -> DocumentLayout
 */

import type { CanvasRenderingContext2DLike } from './canvas-context.js';
import type {
  CanvasRenderTree,
  DocumentLayout,
  ResolvedOptions,
  PaddingConfig,
  CanvasRenderOptions,
} from './types.js';
import type { RenderProfile } from './profiles.js';
import { PROFILES } from './profiles.js';
import { DEFAULT_FONT_FAMILY } from './font-loader.js';
import { TextMeasurer } from './measure.js';
import { layoutVertical } from './layout-vertical.js';

function normalizePadding(padding: number | PaddingConfig): PaddingConfig {
  if (typeof padding === 'number') {
    return { top: padding, right: padding, bottom: padding, left: padding };
  }
  return padding;
}

export function resolveOptions(options?: CanvasRenderOptions): ResolvedOptions {
  const profile: RenderProfile = { ...PROFILES.full, ...options?.profile };
  return {
    writingMode: options?.writingMode ?? 'vertical',
    profile,
    fontSize: options?.fontSize ?? 24,
    fontFamily: options?.fontFamily ?? `${DEFAULT_FONT_FAMILY}, serif`,
    rubyRatio: options?.rubyRatio ?? 0.5,
    lineHeight: options?.lineHeight ?? 2.0,
    columnGap: options?.columnGap ?? 16,
    padding: normalizePadding(options?.padding ?? 16),
    backgroundColor: options?.backgroundColor ?? 'transparent',
    textColor: options?.textColor ?? '#000',
    pixelRatio: options?.pixelRatio ?? 1,
    autoSize: options?.autoSize ?? true,
    maxExtent: options?.maxExtent,
    columnSizing: options?.columnSizing ?? 'uniform',
  };
}

export function layout(
  tree: CanvasRenderTree,
  ctx: CanvasRenderingContext2DLike,
  options?: CanvasRenderOptions
): DocumentLayout {
  const resolved = resolveOptions(options);
  const measurer = new TextMeasurer(ctx);

  if (resolved.writingMode === 'horizontal') {
    throw new Error('Horizontal layout not yet implemented');
  }

  return layoutVertical(tree, measurer, resolved);
}
