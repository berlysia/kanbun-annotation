/**
 * Pass 3: DocumentLayout -> Canvas draw calls
 *
 * 描画順: 背景 -> ベーステキスト -> 注釈
 */

import type { CanvasRenderingContext2DLike } from './canvas-context.js';
import type { DocumentLayout, SlotLayout, ResolvedOptions } from './types.js';
import { drawChar, drawVerticalText } from './draw-text.js';

/**
 * Pass 3: DocumentLayout を Canvas に描画する
 */
export function draw(
  ctx: CanvasRenderingContext2DLike,
  documentLayout: DocumentLayout,
  options: ResolvedOptions
): void {
  // 1. Background
  if (options.backgroundColor && options.backgroundColor !== 'transparent') {
    ctx.save();
    ctx.fillStyle = options.backgroundColor;
    ctx.fillRect(0, 0, documentLayout.width, documentLayout.height);
    ctx.restore();
  }

  // 2. For each column -> each token
  for (const column of documentLayout.columns) {
    for (const tokenLayout of column.tokens) {
      // Draw base character
      drawChar(
        ctx,
        tokenLayout.baseChar,
        tokenLayout.x,
        tokenLayout.y,
        options.fontSize,
        options.textColor,
        options.fontFamily
      );

      // Draw slots
      drawSlotIfPresent(ctx, tokenLayout.slots.ruby, options);
      drawSlotIfPresent(ctx, tokenLayout.slots.okuri, options);
      drawSlotIfPresent(ctx, tokenLayout.slots.soegana, options);
      drawSlotIfPresent(ctx, tokenLayout.slots.kaeri, options);
      drawSlotIfPresent(ctx, tokenLayout.slots.kutoten, options);
      drawSlotIfPresent(ctx, tokenLayout.slots.emphasis, options);
      drawSlotIfPresent(ctx, tokenLayout.slots.saidokuUnder, options);
      drawSlotIfPresent(ctx, tokenLayout.slots.saidokuOkuri2, options);
    }
  }
}

function drawSlotIfPresent(
  ctx: CanvasRenderingContext2DLike,
  slot: SlotLayout | undefined,
  options: ResolvedOptions
): void {
  if (!slot) return;
  drawVerticalText(
    ctx,
    slot.text,
    slot.x,
    slot.y,
    slot.fontSize,
    options.textColor,
    options.fontFamily
  );
}
