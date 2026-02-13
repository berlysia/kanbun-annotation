/**
 * Column Planning レイヤ — 列寸法と X 座標の計画
 *
 * `uniform` / `adaptive` 分岐をこの層に閉じ込め、
 * Placement レイヤがモードを意識しないようにする。
 */

import type {
  BlockLayoutFlags,
  ColumnDimensions,
  GridColumns,
  ColumnPlan,
  DocumentAnalysis,
  ResolvedOptions,
} from './types.js';

/**
 * BlockLayoutFlags と ruby 情報から列の幅・配置を計算。
 * uniform モードではドキュメント全体の OR フラグ、
 * adaptive モードではブロック単位のフラグを渡す。
 */
export function computeColumnDimensions(
  flags: BlockLayoutFlags,
  fontSize: number,
  rubyFontSize: number,
  maxRubyWidth: number,
  highlightGap: number
): ColumnDimensions {
  let columnWidth: number;
  let baseCenterX: number;

  if (flags.hasSuffix) {
    const saidokuWidth = flags.hasSaidoku ? rubyFontSize : 0;
    const rightColumnWidth = flags.hasRightColumn ? rubyFontSize : 0;
    columnWidth = saidokuWidth + fontSize + rightColumnWidth;
    baseCenterX = saidokuWidth + fontSize / 2;
  } else if (maxRubyWidth > 0) {
    columnWidth = fontSize + maxRubyWidth;
    baseCenterX = fontSize / 2;
  } else {
    columnWidth = fontSize;
    baseCenterX = fontSize / 2;
  }

  // emphasis/highlight による列右側の追加幅
  let extraRightWidth: number;
  if (flags.hasHighlight && flags.hasEmphasis) {
    extraRightWidth = 2 * highlightGap + Math.ceil(rubyFontSize / 2);
  } else if (flags.hasHighlight) {
    extraRightWidth = highlightGap;
  } else if (flags.hasEmphasis) {
    // emphasis 右端 = baseCenterX + fontSize/2 + rubyFontSize
    // columnWidth 端 = baseCenterX + fontSize/2 (+rightColumnWidth)
    // hasRightColumn 時は columnWidth に含まれるが、!hasRightColumn 時は rubyFontSize 分が必要
    extraRightWidth = rubyFontSize;
  } else {
    extraRightWidth = 0;
  }

  // highlight-ref label: ラベル右端が extraRightWidth 内に収まるよう保証
  // label x = highlightLineX + (rubyFontSize * 7) / 8  (center of label text)
  // textAlign: 'center' なので右端 = highlightLineX + (7/8 + 1/2) * rubyFontSize
  // highlightLineX = columnWidth + highlightGap なので、
  // 必要な extraRightWidth = highlightGap + ceil((11/8) * rubyFontSize)
  if (flags.hasHighlight && flags.hasRefLabel) {
    const labelRightEdge = highlightGap + Math.ceil((rubyFontSize * 11) / 8);
    extraRightWidth = Math.max(extraRightWidth, labelRightEdge);
  }

  return {
    columnWidth,
    baseCenterX,
    extraRightWidth,
    fullColumnWidth: columnWidth + extraRightWidth,
  };
}

/** hasSuffix に応じた列位置を事前計算 */
export function computeGridColumns(
  columnX: number,
  columnWidth: number,
  fontSize: number,
  rubyFontSize: number,
  hasSuffix: boolean,
  hasSaidoku: boolean,
  baseCenterX: number
): GridColumns {
  if (hasSuffix) {
    const saidokuWidth = hasSaidoku ? rubyFontSize : 0;
    const baseLeft = columnX + saidokuWidth;

    // base 中心基準の対称配置
    const kaeriX = baseLeft + fontSize / 4;
    const kutotenX = baseLeft + (3 * fontSize) / 4;
    const saidoku2X = columnX + saidokuWidth / 2;
    const suffixX = baseLeft + fontSize + rubyFontSize / 2;

    return { suffixX, kaeriX, saidoku2X, kutotenX };
  }
  // hasSuffix=false: kaeri/kutoten/saidoku スロットは存在しないため
  // kaeriX/saidoku2X/kutotenX は参照されない
  const suffixBaseX = columnX + baseCenterX + fontSize / 2;
  return {
    suffixX: suffixBaseX,
    kaeriX: 0,
    saidoku2X: 0,
    kutotenX: 0,
  };
}

/**
 * DocumentAnalysis とオプションから全ブロックの ColumnPlan を生成する。
 * `uniform` / `adaptive` 分岐をここに閉じ込める。
 */
export function planColumns(analysis: DocumentAnalysis, options: ResolvedOptions): ColumnPlan[] {
  const { fontSize, padding, columnGap } = options;
  const rubyFontSize = Math.round(fontSize * options.rubyRatio);
  const highlightGap = 2;
  const isAdaptive = options.columnSizing === 'adaptive';
  const numBlocks = analysis.blocks.length;

  // --- Dimensions 計算 ---
  let blockDimsArray: ColumnDimensions[];

  if (isAdaptive) {
    blockDimsArray = analysis.blocks.map((ba) =>
      computeColumnDimensions(ba.flags, fontSize, rubyFontSize, ba.maxRubyWidth, highlightGap)
    );
  } else {
    const uniformDims = computeColumnDimensions(
      analysis.documentFlags,
      fontSize,
      rubyFontSize,
      analysis.documentMaxRubyWidth,
      highlightGap
    );
    blockDimsArray = analysis.blocks.map(() => uniformDims);
  }

  // --- ブロック X 座標計算: 右→左配置 (block[0] が右端) ---
  const blockColumnXs: number[] = Array.from({ length: numBlocks });
  if (isAdaptive) {
    let curX = padding.left;
    for (let i = numBlocks - 1; i >= 0; i--) {
      blockColumnXs[i] = curX;
      if (i > 0) curX += blockDimsArray[i]!.fullColumnWidth + columnGap;
    }
  } else {
    const uniformFullWidth = blockDimsArray[0]!.fullColumnWidth;
    for (let i = 0; i < numBlocks; i++) {
      blockColumnXs[i] = padding.left + (numBlocks - 1 - i) * (uniformFullWidth + columnGap);
    }
  }

  // --- ColumnPlan 生成 ---
  return analysis.blocks.map((ba, i) => {
    const dims = blockDimsArray[i]!;
    const columnX = blockColumnXs[i]!;
    const effectiveFlags = isAdaptive ? ba.flags : analysis.documentFlags;
    const effectiveMaxRubyWidth = isAdaptive ? ba.maxRubyWidth : analysis.documentMaxRubyWidth;

    const grid = computeGridColumns(
      columnX,
      dims.columnWidth,
      fontSize,
      rubyFontSize,
      effectiveFlags.hasSuffix,
      effectiveFlags.hasSaidoku,
      dims.baseCenterX
    );

    return {
      blockIndex: i,
      x: columnX,
      dimensions: dims,
      flags: effectiveFlags,
      grid,
      effectiveMaxRubyWidth,
    };
  });
}

/**
 * ColumnPlan[] からドキュメントの totalWidth を計算する。
 */
export function computeTotalWidth(plans: ColumnPlan[], options: ResolvedOptions): number {
  const numBlocks = plans.length;
  if (numBlocks === 0) return 0;

  let totalWidth = 0;
  for (const plan of plans) {
    totalWidth += plan.dimensions.fullColumnWidth;
  }
  totalWidth += Math.max(0, numBlocks - 1) * options.columnGap;
  return totalWidth;
}
