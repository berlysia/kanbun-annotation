/**
 * 縦書き単一列レイアウト (Phase 1)
 *
 * HTML renderer の CSS Grid レイアウトに準拠。
 * vertical-rl では grid-template-rows が水平方向の列に展開される。
 *
 * 物理配置（左→右）:
 *
 *   suffix-row:  [saidoku2(R)] [kaeri(R)]  [kutoten(R)] [okuri/soegana(R)]
 *   ruby-grid:   [saidoku-under(R)]  [  base(fontSize) ] [ruby/yomigana(R)]
 *
 *   R = rubyFontSize, F = fontSize
 *   gridWidth = max(4R, 2R + F)
 *
 * suffix-row grid-template-rows: R × 4
 *   row1(右):   okuri/soegana     font-size: rubyFontSize
 *   row2(右寄り): kutoten          font-size: fontSize (親継承)
 *   row3(中央):  kaeri            font-size: rubyFontSize, align-self: end
 *   row4(左):   saidoku (Phase 2+) font-size: rubyFontSize
 *
 * 列方向: 右→左。列内: 上→下。
 */

import type { CanvasRenderTree, CanvasTokenNode, DocumentLayout, ColumnLayout, TokenLayout, ResolvedSlotLayouts, ResolvedOptions } from './types.js';
import type { TextMeasurer } from './measure.js';

/** ルビフォント文字列を生成 */
function rubyFont(options: ResolvedOptions): string {
  return `${Math.round(options.fontSize * options.rubyRatio)}px ${options.fontFamily}`;
}

/** テキストの幅を計測。未定義なら 0。 */
function measureTextWidth(
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
  const rFont = rubyFont(options);
  const rubyFontSize = Math.round(fontSize * options.rubyRatio);
  const cellAdvance = fontSize * lineHeight;

  // base-ruby 間のギャップ（suffix なしの場合のみ使用）
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

  // ruby の最大幅計測、suffix 有無判定
  let maxRubyWidth = 0;
  let hasSuffix = false;

  for (const tokenNode of allTokens) {
    const { slots } = tokenNode;
    const rubyW = measureTextWidth(slots.ruby, rFont, measurer);
    if (rubyW > maxRubyWidth) maxRubyWidth = rubyW;
    if (slots.okuri || slots.soegana || slots.kaeri || slots.kutoten) {
      hasSuffix = true;
    }
  }

  // 列幅とベース文字中心X座標の計算
  //
  // suffix あり: CSS Grid モデル（suffix-row 4列 + ruby-grid が整列）
  //   gridWidth = max(4R, 2R + F) で両グリッドを包含
  //   物理列（左→右）: [saidoku2(R)][kaeri(R)][kutoten(R)][okuri(R)]
  //                     [saidoku-under(R)] [   base(F)   ][ruby(R) ]
  //
  // suffix なし: base + gap + ruby の単純モデル
  let columnWidth: number;
  let baseCenterX: number;

  if (hasSuffix) {
    const gridWidth = Math.max(4 * rubyFontSize, 2 * rubyFontSize + fontSize);
    columnWidth = gridWidth;
    // base center = 左端から R + F/2（ruby-grid の row2 中心）
    baseCenterX = gridWidth - rubyFontSize - fontSize / 2;
  } else if (maxRubyWidth > 0) {
    columnWidth = fontSize + slotGap + maxRubyWidth;
    baseCenterX = fontSize / 2;
  } else {
    columnWidth = fontSize;
    baseCenterX = fontSize / 2;
  }

  // 列の高さ
  const columnHeight = allTokens.length * cellAdvance;

  // 列の絶対位置（Phase 1: 単一列）
  const columnX = padding.left;
  const columnY = padding.top;

  // 各トークンのレイアウト計算
  const tokenLayouts: TokenLayout[] = allTokens.map((tokenNode, index) => {
    const { token, slots } = tokenNode;
    const tokenX = columnX + baseCenterX;
    const tokenY = columnY + index * cellAdvance + fontSize / 2;

    const slotLayouts: ResolvedSlotLayouts = {};

    if (hasSuffix) {
      // Grid model: suffix-row の各列中心（列の右端からの距離）
      //   row1(右):     R/2 from right  → okuri/soegana, ruby
      //   row2(右寄り): 1.5R from right → kutoten
      //   row3(中央):   2.5R from right → kaeri
      //   row4(左):     3.5R from right → saidoku (Phase 2+)
      const rightColX = columnX + columnWidth - rubyFontSize / 2;
      const col2X = columnX + columnWidth - rubyFontSize * 1.5;
      const col3X = columnX + columnWidth - rubyFontSize * 2.5;

      // Ruby (RIGHT: 最右列、okuri と共有)
      if (slots.ruby) {
        slotLayouts.ruby = {
          text: slots.ruby,
          x: rightColX,
          y: tokenY,
          fontSize: rubyFontSize,
        };
      }

      // Okurigana (RIGHT: ruby と同じ列、ruby の下に配置)
      if (slots.okuri) {
        const rubyChars = slots.ruby ? [...slots.ruby].length : 0;
        slotLayouts.okuri = {
          text: slots.okuri,
          x: rightColX,
          y: tokenY + rubyChars * rubyFontSize,
          fontSize: rubyFontSize,
        };
      }

      // Soegana (RIGHT: okuri と同じ列、okuri の下に配置)
      if (slots.soegana) {
        const rubyChars = slots.ruby ? [...slots.ruby].length : 0;
        const okuriChars = slots.okuri ? [...slots.okuri].length : 0;
        slotLayouts.soegana = {
          text: slots.soegana,
          x: rightColX,
          y: tokenY + (rubyChars + okuriChars) * rubyFontSize,
          fontSize: rubyFontSize,
        };
      }

      // Kutoten (row2: base 右半分の位置、親フォントサイズ継承)
      if (slots.kutoten) {
        slotLayouts.kutoten = {
          text: slots.kutoten,
          x: col2X,
          y: tokenY,
          fontSize,
        };
      }

      // Kaeri (row3: base 左半分の位置)
      if (slots.kaeri) {
        slotLayouts.kaeri = {
          text: slots.kaeri,
          x: col3X,
          y: tokenY,
          fontSize: rubyFontSize,
        };
      }
    } else {
      // suffix なし: ruby のみ右側に配置
      if (slots.ruby) {
        slotLayouts.ruby = {
          text: slots.ruby,
          x: tokenX + fontSize / 2 + slotGap,
          y: tokenY,
          fontSize: rubyFontSize,
        };
      }
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
