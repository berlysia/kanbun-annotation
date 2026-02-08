/**
 * Pass 3: DocumentLayout -> Canvas draw calls
 *
 * 描画順: 背景 -> ベーステキスト -> 注釈
 */

import type { CanvasRenderingContext2DLike } from './canvas-context.js';
import type { DocumentLayout, SlotLayout, ResolvedOptions } from './types.js';
import { drawChar, drawVerticalText } from './draw-text.js';
import { drawHighlightLine } from './draw-marks.js';

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

  // 2. For each column -> each child (token or tateten-separator)
  for (const column of documentLayout.columns) {
    for (const child of column.children) {
      if (child.type === 'tateten-separator') {
        // Draw tateten separator character (〼 U+3190)
        drawChar(
          ctx,
          '\u3190',
          child.x,
          child.y,
          child.fontSize,
          options.textColor,
          options.fontFamily
        );
        // Draw kaeri on separator if present
        drawSlotIfPresent(ctx, child.kaeri, options);
        continue;
      }

      // Draw base character
      drawChar(
        ctx,
        child.baseChar,
        child.x,
        child.y,
        options.fontSize,
        options.textColor,
        options.fontFamily
      );

      // Draw slots
      drawSlotIfPresent(ctx, child.slots.ruby, options);
      drawSlotIfPresent(ctx, child.slots.okuri, options);
      drawSlotIfPresent(ctx, child.slots.soegana, options);
      drawSlotIfPresent(ctx, child.slots.kaeri, options);
      drawSlotIfPresent(ctx, child.slots.kutoten, options);
      drawSlotIfPresent(ctx, child.slots.emphasis, options);
      drawSlotIfPresent(ctx, child.slots.saidokuUnder, options);
      drawSlotIfPresent(ctx, child.slots.saidokuOkuri2, options);
    }

    // 3. Highlight lines
    if (column.highlightLines) {
      for (const hl of column.highlightLines) {
        drawHighlightLine(ctx, hl, options.textColor);
      }
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
