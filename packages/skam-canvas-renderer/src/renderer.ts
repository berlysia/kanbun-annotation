/**
 * 公開 API: render() と measure()
 *
 * 3-Pass パイプラインのオーケストレータ。
 */

import type { SKAMDocument } from '@kanbun-skam/skam';
import { buildAnnotationIR } from '@kanbun-skam/skam/rendering';
import type { CanvasLike } from './canvas-context.js';
import type { CanvasRenderingContext2DLike } from './canvas-context.js';
import type { CanvasRenderOptions, MeasureOptions, DocumentDimensions } from './types.js';
import type { RenderProfile } from './profiles.js';
import { PROFILES } from './profiles.js';
import { convertAIRToCanvasRenderTree } from './air-adapter.js';
import { layout, resolveOptions } from './layout.js';
import { draw } from './draw.js';

/**
 * SKAMDocument を Canvas に描画する。
 *
 * 3-Pass パイプライン:
 * 1. Resolve & Group → CanvasRenderTree
 * 2. Measure & Layout → DocumentLayout
 * 3. Draw → Canvas draw calls
 */
export function render(doc: SKAMDocument, canvas: CanvasLike, options?: CanvasRenderOptions): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D rendering context from canvas');
  }

  const profile: RenderProfile = { ...PROFILES.full, ...options?.profile };
  const resolved = resolveOptions(options);

  // Pass 1: AIR 経由
  const air = buildAnnotationIR(doc, profile);
  const tree = convertAIRToCanvasRenderTree(air);

  // Pass 2 (論理ピクセル座標で計算)
  const documentLayout = layout(tree, ctx, options);

  // autoSize: canvas のサイズ設定は context の状態 (変換・font 等) をリセットするので、save / scale より前に行う。
  // maxExtent はデバイスピクセルで表した長い辺の上限 (canvas.width / height そのものの上限)。
  let drawScale = resolved.pixelRatio;
  if (resolved.autoSize) {
    const { width, height } = documentLayout;
    const shrink =
      resolved.maxExtent === undefined
        ? 1
        : Math.min(1, resolved.maxExtent / (Math.max(width, height, 1) * resolved.pixelRatio));
    drawScale = resolved.pixelRatio * shrink;
    canvas.width = Math.ceil(width * drawScale);
    canvas.height = Math.ceil(height * drawScale);
  }

  // HiDPI: コンテキストをスケーリングして論理座標→デバイスピクセルに変換
  ctx.save();
  ctx.scale(drawScale, drawScale);

  // Pass 3
  draw(ctx, documentLayout, resolved);

  ctx.restore();
}

/**
 * SKAMDocument の描画寸法を計測する（描画はしない）。
 */
export function measure(
  doc: SKAMDocument,
  ctx: CanvasRenderingContext2DLike,
  options?: MeasureOptions
): DocumentDimensions {
  const profile: RenderProfile = { ...PROFILES.full, ...options?.profile };

  // Pass 1: AIR 経由
  const air = buildAnnotationIR(doc, profile);
  const tree = convertAIRToCanvasRenderTree(air);

  // Pass 2 - spread MeasureOptions directly (compatible with CanvasRenderOptions)
  const documentLayout = layout(tree, ctx, options ? { ...options } : undefined);

  return {
    width: documentLayout.width,
    height: documentLayout.height,
  };
}
