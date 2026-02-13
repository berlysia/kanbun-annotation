/**
 * 縦書き単一列レイアウト — 3-layer アーキテクチャ オーケストレーター
 *
 * Analysis → Column Planning → Placement の 3 レイヤを統合し、
 * DocumentLayout を返す。各レイヤの詳細は個別ファイルを参照。
 *
 * 2行×n列グリッドモデルの詳細は layout-vertical.placement.ts を参照。
 */

import type { CanvasRenderTree, DocumentLayout, ResolvedOptions } from './types.js';
import type { TextMeasurer } from './measure.js';
import { analyzeDocument } from './layout-vertical.analysis.js';
import { planColumns, computeTotalWidth } from './layout-vertical.columns.js';
import { placeBlock } from './layout-vertical.placement.js';

/**
 * 縦書き単一列レイアウト
 */
export function layoutVertical(
  tree: CanvasRenderTree,
  measurer: TextMeasurer,
  options: ResolvedOptions
): DocumentLayout {
  const { padding } = options;

  // --- Analysis レイヤ: token 収集・maxRubyWidth 計測を一度だけ実施 ---
  const analysis = analyzeDocument(tree, measurer, options);

  if (analysis.blocks.length === 0) {
    return {
      width: padding.left + padding.right,
      height: padding.top + padding.bottom,
      columns: [],
    };
  }

  // --- Column Planning レイヤ: 列寸法と X 座標を計画 ---
  const plans = planColumns(analysis, options);

  // --- Placement レイヤ: ブロックごとにカラムを作成 ---
  const columns = plans.map((plan) =>
    placeBlock(analysis.blocks[plan.blockIndex]!.block, plan, options)
  );

  const totalWidth = computeTotalWidth(plans, options);
  const maxColumnHeight = Math.max(...columns.map((c) => c.height));

  return {
    width: padding.left + totalWidth + padding.right,
    height: padding.top + maxColumnHeight + padding.bottom,
    columns,
  };
}
