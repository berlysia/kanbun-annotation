/**
 * テキスト計測ユーティリティ（キャッシュ付き）
 */

import type { CanvasRenderingContext2DLike, TextMetricsLike } from './canvas-context.js';

export class TextMeasurer {
  private cache = new Map<string, TextMetricsLike>();
  private ctx: CanvasRenderingContext2DLike;

  constructor(ctx: CanvasRenderingContext2DLike) {
    this.ctx = ctx;
  }

  /**
   * テキストを計測する。font+text をキーとしてキャッシュ。
   */
  measure(text: string, font?: string): TextMetricsLike {
    const effectiveFont = font ?? this.ctx.font;
    const key = `${effectiveFont}:${text}`;

    const cached = this.cache.get(key);
    if (cached) return cached;

    const prevFont = this.ctx.font;
    if (font && font !== prevFont) {
      this.ctx.font = font;
    }

    const metrics = this.ctx.measureText(text);
    const ascent = metrics.actualBoundingBoxAscent;
    const descent = metrics.actualBoundingBoxDescent;
    const fontAscent = metrics.fontBoundingBoxAscent;
    const fontDescent = metrics.fontBoundingBoxDescent;
    const result: TextMetricsLike =
      ascent != null && descent != null
        ? {
            width: metrics.width,
            actualBoundingBoxAscent: ascent,
            actualBoundingBoxDescent: descent,
            ...(fontAscent != null ? { fontBoundingBoxAscent: fontAscent } : {}),
            ...(fontDescent != null ? { fontBoundingBoxDescent: fontDescent } : {}),
          }
        : { width: metrics.width };

    if (font && font !== prevFont) {
      this.ctx.font = prevFont;
    }

    this.cache.set(key, result);
    return result;
  }

  /**
   * 文字の高さを取得する。actualBoundingBox がない場合は fontSize にフォールバック。
   */
  getCharHeight(text: string, fontSize: number, font?: string): number {
    const metrics = this.measure(text, font);
    if (metrics.actualBoundingBoxAscent != null && metrics.actualBoundingBoxDescent != null) {
      return metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    }
    return fontSize;
  }

  clearCache(): void {
    this.cache.clear();
  }
}
