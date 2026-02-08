/**
 * 縦書き単一列レイアウト (Phase 1)
 *
 * 物理レイアウトモデル:
 *   [kaeri] [kutoten] [okuri/soegana]  BASE  [ruby/yomigana]
 *    LEFT <--                         CENTER           --> RIGHT
 *
 * 列方向: 右→左。列内: 上→下。
 */

import type { CanvasRenderTree, CanvasTokenNode, DocumentLayout, ColumnLayout, TokenLayout, ResolvedSlotLayouts, ResolvedOptions } from './types.js';
import type { TextMeasurer } from './measure.js';

/** ベースフォント文字列を生成 */
function baseFont(options: ResolvedOptions): string {
  return `${options.fontSize}px ${options.fontFamily}`;
}

/** ルビフォント文字列を生成 */
function rubyFont(options: ResolvedOptions): string {
  return `${Math.round(options.fontSize * options.rubyRatio)}px ${options.fontFamily}`;
}

/** スロットの幅を計測。未定義なら 0。 */
function measureSlotWidth(
  text: string | undefined,
  font: string,
  measurer: TextMeasurer,
): number {
  if (!text) return 0;
  return measurer.measure(text, font).width;
}

/**
 * 縦書き単一列レイアウト
 */
export function layoutVertical(
  tree: CanvasRenderTree,
  measurer: TextMeasurer,
  options: ResolvedOptions,
): DocumentLayout {
  const { fontSize, padding, lineHeight } = options;
  const bFont = baseFont(options);
  const rFont = rubyFont(options);
  const rubyFontSize = Math.round(fontSize * options.rubyRatio);
  const cellAdvance = fontSize * lineHeight;

  // suffix 領域とベース文字の間のギャップ
  const slotGap = 2;

  // 全トークンをフラットに集めてレイアウト
  const allTokens: CanvasTokenNode[] = [];
  for (const block of tree.blocks) {
    for (const token of block.tokens) {
      allTokens.push(token);
    }
  }

  if (allTokens.length === 0) {
    return {
      width: padding.left + padding.right,
      height: padding.top + padding.bottom,
      columns: [],
    };
  }

  // 列の幅を計算するため、全トークンの左右マージンを計算
  let maxRubyWidth = 0;
  let maxSuffixWidth = 0;

  for (const tokenNode of allTokens) {
    const { slots } = tokenNode;
    // 右側: ruby
    const rubyW = measureSlotWidth(slots.ruby, rFont, measurer);
    if (rubyW > maxRubyWidth) maxRubyWidth = rubyW;

    // 左側: okuri, soegana, kaeri, kutoten の最大幅
    const okuriW = measureSlotWidth(slots.okuri, rFont, measurer);
    const soeganaW = measureSlotWidth(slots.soegana, rFont, measurer);
    const kaeriW = measureSlotWidth(slots.kaeri, rFont, measurer);
    const kutotenW = measureSlotWidth(slots.kutoten, bFont, measurer);
    const suffixW = Math.max(okuriW, soeganaW, kaeriW, kutotenW);
    if (suffixW > maxSuffixWidth) maxSuffixWidth = suffixW;
  }

  // 列幅 = ruby 領域 + gap + ベース文字幅 + gap + suffix 領域
  const rubyArea = maxRubyWidth > 0 ? maxRubyWidth + slotGap : 0;
  const suffixArea = maxSuffixWidth > 0 ? maxSuffixWidth + slotGap : 0;
  const columnWidth = rubyArea + fontSize + suffixArea;

  // ベース文字の中心X座標（列内）
  const baseCenterX = rubyArea + fontSize / 2;

  // 列の高さ
  const columnHeight = allTokens.length * cellAdvance;

  // 列の絶対位置（Phase 1: 単一列、右→左で1列目のみ）
  const columnX = padding.left;
  const columnY = padding.top;

  // 各トークンのレイアウト計算
  const tokenLayouts: TokenLayout[] = allTokens.map((tokenNode, index) => {
    const { token, slots } = tokenNode;
    const tokenX = columnX + baseCenterX;
    const tokenY = columnY + index * cellAdvance + fontSize / 2;

    const slotLayouts: ResolvedSlotLayouts = {};

    // Ruby (right side)
    if (slots.ruby) {
      slotLayouts.ruby = {
        text: slots.ruby,
        x: tokenX + fontSize / 2 + slotGap,
        y: tokenY,
        fontSize: rubyFontSize,
      };
    }

    // Okurigana (left side)
    if (slots.okuri) {
      slotLayouts.okuri = {
        text: slots.okuri,
        x: tokenX - fontSize / 2 - slotGap,
        y: tokenY,
        fontSize: rubyFontSize,
      };
    }

    // Soegana (left side, below okurigana)
    if (slots.soegana) {
      const okuriOffset = slots.okuri ? rubyFontSize : 0;
      slotLayouts.soegana = {
        text: slots.soegana,
        x: tokenX - fontSize / 2 - slotGap,
        y: tokenY + okuriOffset,
        fontSize: rubyFontSize,
      };
    }

    // Kutoten (left side)
    if (slots.kutoten) {
      slotLayouts.kutoten = {
        text: slots.kutoten,
        x: tokenX - fontSize / 2 - slotGap,
        y: tokenY + cellAdvance / 2,
        fontSize,
      };
    }

    // Kaeri (left side, furthest left)
    if (slots.kaeri) {
      slotLayouts.kaeri = {
        text: slots.kaeri,
        x: tokenX - fontSize / 2 - slotGap,
        y: tokenY,
        fontSize: rubyFontSize,
      };
    }

    return {
      tokenId: token.id,
      x: tokenX,
      y: tokenY,
      baseChar: token.text,
      slots: slotLayouts,
    };
  });

  const column: ColumnLayout = {
    x: columnX,
    y: columnY,
    width: columnWidth,
    height: columnHeight,
    tokens: tokenLayouts,
  };

  return {
    width: padding.left + columnWidth + padding.right,
    height: padding.top + columnHeight + padding.bottom,
    columns: [column],
  };
}
