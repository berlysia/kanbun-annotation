/**
 * layout-vertical 共有ユーティリティ
 *
 * Analysis / Column Planning / Placement の各レイヤから import される。
 * orchestrator (layout-vertical.ts) からも利用可能。
 */

import type { ResolvedOptions } from './types.js';
import type { TextMeasurer } from './measure.js';

/** ルビフォント文字列を生成 */
export function rubyFont(options: ResolvedOptions): string {
  return `${Math.round(options.fontSize * options.rubyRatio)}px ${options.fontFamily}`;
}

/** テキストの幅を計測。未定義なら 0。 */
export function measureTextWidth(
  text: string | undefined,
  font: string,
  measurer: TextMeasurer
): number {
  if (!text) return 0;
  return measurer.measure(text, font).width;
}
