/**
 * Pass 3: DocumentLayout -> Canvas draw calls
 *
 * 描画順: 背景 -> ベーステキスト -> 注釈
 */

import type { CanvasRenderingContext2DLike } from './canvas-context.js';
import type { DocumentLayout, SlotLayout, ResolvedOptions } from './types.js';
import { drawChar, drawVerticalText, drawTateChuYokoText, drawKutotenText } from './draw-text.js';
import { drawHighlightLine, drawOkototen } from './draw-marks.js';

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
        // Draw tateten separator character (〼 U+3190)。拡張 (出題の印) が隠す記号と kaeri は描かない
        if (!child.hidden) {
          drawChar(
            ctx,
            '\u3190',
            child.x,
            child.y,
            child.fontSize,
            options.textColor,
            options.fontFamily,
            options.emAscentRatio
          );
        }
        // Draw kaeri on separator if present
        if (!child.kaeriHidden) drawSlotIfPresent(ctx, child.kaeri, options);
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
        options.fontFamily,
        options.emAscentRatio
      );

      // Draw slots（拡張 (出題の印) が隠す slot は、場所を測った後で描かない）
      const hidden = child.hiddenSlots;
      const visible = (slot: NonNullable<typeof hidden>[number], layout?: SlotLayout) =>
        hidden?.includes(slot) ? undefined : layout;
      drawSlotIfPresent(ctx, visible('ruby', child.slots.ruby), options);
      drawSlotIfPresent(ctx, visible('okuri', child.slots.okuri), options);
      drawSlotIfPresent(ctx, visible('soegana', child.slots.soegana), options);
      drawSlotIfPresent(ctx, visible('kaeri', child.slots.kaeri), options);
      drawKutotenSlotIfPresent(ctx, visible('kutoten', child.slots.kutoten), options);
      drawSlotIfPresent(ctx, child.slots.emphasis, options);
      drawSlotIfPresent(ctx, visible('saidokuUnder', child.slots.saidokuUnder), options);
      drawSlotIfPresent(ctx, visible('saidokuOkuri2', child.slots.saidokuOkuri2), options);
      drawSlotIfPresent(ctx, child.slots.ref, options);
      for (const dot of child.okototen ?? []) {
        if (!dot.hidden) drawOkototen(ctx, dot, options.textColor);
      }
    }

    // 3. Highlight lines + highlight-ref labels
    if (column.highlightLines) {
      for (const hl of column.highlightLines) {
        drawHighlightLine(ctx, hl, options.textColor);
        drawSlotIfPresent(ctx, hl.refLayout, options);
      }
    }
  }
}

function drawKutotenSlotIfPresent(
  ctx: CanvasRenderingContext2DLike,
  slot: SlotLayout | undefined,
  options: ResolvedOptions
): void {
  if (!slot) return;
  drawKutotenText(
    ctx,
    slot.text,
    slot.x,
    slot.y,
    slot.fontSize,
    options.textColor,
    options.fontFamily,
    options.emAscentRatio
  );
}

function drawSlotIfPresent(
  ctx: CanvasRenderingContext2DLike,
  slot: SlotLayout | undefined,
  options: ResolvedOptions
): void {
  if (!slot) return;
  if (slot.tateChuYoko) {
    drawTateChuYokoText(
      ctx,
      slot.text,
      slot.x,
      slot.y,
      slot.fontSize,
      options.textColor,
      options.fontFamily,
      options.emAscentRatio
    );
  } else {
    drawVerticalText(
      ctx,
      slot.text,
      slot.x,
      slot.y,
      slot.fontSize,
      options.textColor,
      options.fontFamily,
      options.emAscentRatio,
      slot.charAdvance
    );
  }
}
