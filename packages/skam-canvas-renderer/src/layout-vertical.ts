/**
 * 縦書き単一列レイアウト — 2行×n列グリッドモデル
 *
 * HTML renderer では suffix-row と ruby-grid が別のインライン要素として
 * 異なる垂直位置に配置されるため重なりが生じない。
 * Canvas では同一空間に描画するため、base の左右に分離配置して重なりを回避する。
 *
 * 2行×n列グリッド:
 *
 *   Base row:    [saidoku yomi(R?)] [base(1/2)] [base(2/2)] [yomigana(R?)]
 *   Suffix row:  [saidoku okuri(R?)] [kaeri]    [kutoten]   [okuri/soegana(R?)]
 *
 *   R = rubyFontSize, F = fontSize
 *   [] 列: その文字/熟語単位で空なら詰めてよい
 *   () 列: emphasis/highlight は範囲全体で一貫させる（将来対応）
 *   base の中心が全要素のアライメント基準軸 (baseCenterX)
 *
 * グリッド幅（hasSuffix=true 時）:
 *   saidokuWidth = hasSaidoku ? R : 0
 *   rightColumnWidth = hasRightColumn ? R : 0
 *   columnWidth = saidokuWidth + F + rightColumnWidth
 *   baseCenterX = saidokuWidth + F/2
 *
 * 各スロット位置（baseCenterX 基準の対称配置）:
 *   saidoku2X = columnX + saidokuWidth/2              ← 左列中心
 *   kaeriX    = columnX + saidokuWidth + F/4           ← base 左半分中心
 *   kutotenX  = columnX + saidokuWidth + 3F/4          ← base 右半分中心
 *   suffixX   = columnX + saidokuWidth + F + R/2       ← 右列中心
 *
 * kaeri は suffix row（base の直下、y = tokenY + fontSize）に配置。
 * kutoten も suffix row（y = tokenY + fontSize）、base 右半分中心に配置。
 *
 * 列方向: 右→左（block[0] が右端）。各ブロックが独立カラムとなる。
 * 列内: 上→下。
 */

import type { HighlightStyle } from '@kanbun/skam';
import type {
  CanvasRenderTree,
  CanvasTokenNode,
  CanvasTatetenSeparator,
  CanvasBlockChild,
  DocumentLayout,
  ColumnLayout,
  ColumnChild,
  TokenLayout,
  TatetenSeparatorLayout,
  HighlightLineLayout,
  ResolvedSlotLayouts,
  ResolvedOptions,
  SlotLayout,
} from './types.js';
import type { TextMeasurer } from './measure.js';

/** ルビフォント文字列を生成 */
function rubyFont(options: ResolvedOptions): string {
  return `${Math.round(options.fontSize * options.rubyRatio)}px ${options.fontFamily}`;
}

/** テキストの幅を計測。未定義なら 0。 */
function measureTextWidth(text: string | undefined, font: string, measurer: TextMeasurer): number {
  if (!text) return 0;
  return measurer.measure(text, font).width;
}

/** 全ブロックからトークンをフラットに収集（tateten/highlight グループ内も含む） */
function collectAllTokens(tree: CanvasRenderTree): CanvasTokenNode[] {
  const tokens: CanvasTokenNode[] = [];
  for (const block of tree.blocks) {
    for (const child of block.children) {
      collectTokensFromChild(child, tokens);
    }
  }
  return tokens;
}

function collectTokensFromChild(child: CanvasBlockChild, tokens: CanvasTokenNode[]): void {
  if (child.type === 'token') {
    tokens.push(child);
  } else if (child.type === 'tateten-group') {
    for (const groupChild of child.children) {
      if (groupChild.type === 'token') {
        tokens.push(groupChild);
      }
    }
  } else {
    // highlight-group
    for (const hlChild of child.children) {
      if (hlChild.type === 'token') {
        tokens.push(hlChild);
      } else {
        // tateten-group inside highlight
        for (const tc of hlChild.children) {
          if (tc.type === 'token') {
            tokens.push(tc);
          }
        }
      }
    }
  }
}

/** 事前計算済みグリッド列位置（絶対 X 座標） */
interface GridColumns {
  suffixX: number; // ruby, okuri, soegana
  kaeriX: number; // 返り点
  saidoku2X: number; // 再読2回目
  kutotenX: number; // 句読点
  emphasisBaseX: number; // 傍点（ruby なし時）
  emphasisWithRubyX: number; // 傍点（ruby あり時）
}

/** hasSuffix に応じた列位置を事前計算 */
function computeGridColumns(
  columnX: number,
  columnWidth: number,
  fontSize: number,
  rubyFontSize: number,
  slotGap: number,
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

    return {
      suffixX,
      kaeriX,
      saidoku2X,
      kutotenX,
      emphasisBaseX: suffixX,
      emphasisWithRubyX: suffixX + rubyFontSize,
    };
  }
  // hasSuffix=false: kaeri/kutoten/saidoku スロットは存在しないため
  // kaeriX/saidoku2X/kutotenX は参照されない
  const suffixBaseX = columnX + baseCenterX + fontSize / 2 + slotGap;
  return {
    suffixX: suffixBaseX,
    kaeriX: 0,
    saidoku2X: 0,
    kutotenX: 0,
    emphasisBaseX: suffixBaseX,
    emphasisWithRubyX: suffixBaseX + rubyFontSize,
  };
}

interface LayoutContext {
  fontSize: number;
  rubyFontSize: number;
  cellAdvance: number;
  grid: GridColumns;
}

/**
 * 単一トークンのスロットレイアウトを計算。
 * hasSuffix の分岐は GridColumns に吸収済み。
 */
function layoutSingleToken(
  tokenNode: CanvasTokenNode,
  tokenX: number,
  tokenY: number,
  lctx: LayoutContext
): TokenLayout {
  const { slots } = tokenNode;
  const { fontSize, rubyFontSize, cellAdvance, grid } = lctx;
  const slotLayouts: ResolvedSlotLayouts = {};

  if (slots.ruby) {
    let rubyY = tokenY;
    if (slots.rubySpan && slots.rubySpan > 1) {
      const spanHeight = slots.rubySpan * cellAdvance;
      const rubyTextHeight = [...slots.ruby].length * rubyFontSize;
      rubyY = tokenY + (spanHeight - rubyTextHeight) / 2;
    }
    slotLayouts.ruby = { text: slots.ruby, x: grid.suffixX, y: rubyY, fontSize: rubyFontSize };
  }

  if (slots.okuri) {
    const rubyChars = slots.ruby ? [...slots.ruby].length : 0;
    const okuriStartY = tokenY + Math.max(fontSize, rubyChars * rubyFontSize);
    slotLayouts.okuri = {
      text: slots.okuri,
      x: grid.suffixX,
      y: okuriStartY,
      fontSize: rubyFontSize,
    };
  }

  if (slots.soegana) {
    const rubyChars = slots.ruby ? [...slots.ruby].length : 0;
    const okuriChars = slots.okuri ? [...slots.okuri].length : 0;
    const soeganaStartY =
      tokenY + Math.max(fontSize, rubyChars * rubyFontSize) + okuriChars * rubyFontSize;
    slotLayouts.soegana = {
      text: slots.soegana,
      x: grid.suffixX,
      y: soeganaStartY,
      fontSize: rubyFontSize,
    };
  }

  if (slots.kutoten) {
    slotLayouts.kutoten = { text: slots.kutoten, x: grid.kutotenX, y: tokenY + fontSize, fontSize };
  }

  if (slots.kaeri) {
    slotLayouts.kaeri = {
      text: slots.kaeri,
      x: grid.kaeriX,
      y: tokenY + fontSize,
      fontSize: rubyFontSize,
    };
  }

  if (slots.emphasis) {
    const emphasisX = slots.ruby ? grid.emphasisWithRubyX : grid.emphasisBaseX;
    slotLayouts.emphasis = {
      text: slots.emphasis,
      x: emphasisX,
      y: tokenY,
      fontSize: rubyFontSize,
    };
  }

  if (slots.saidokuUnder) {
    slotLayouts.saidokuUnder = {
      text: slots.saidokuUnder,
      x: grid.saidoku2X,
      y: tokenY,
      fontSize: rubyFontSize,
    };
  }

  if (slots.saidokuOkuri2) {
    const underChars = slots.saidokuUnder ? [...slots.saidokuUnder].length : 0;
    const saidokuOkuri2StartY = tokenY + Math.max(fontSize, underChars * rubyFontSize);
    slotLayouts.saidokuOkuri2 = {
      text: slots.saidokuOkuri2,
      x: grid.saidoku2X,
      y: saidokuOkuri2StartY,
      fontSize: rubyFontSize,
    };
  }

  if (slots.ref) {
    const refChars = [...slots.ref].length;
    slotLayouts.ref = {
      text: slots.ref,
      x: tokenX,
      y: tokenY - refChars * rubyFontSize,
      fontSize: rubyFontSize,
    };
  }

  return {
    type: 'token' as const,
    tokenId: tokenNode.token.id,
    x: tokenX,
    y: tokenY,
    baseChar: tokenNode.token.text,
    slots: slotLayouts,
  };
}

/**
 * 縦書き単一列レイアウト
 */
export function layoutVertical(
  tree: CanvasRenderTree,
  measurer: TextMeasurer,
  options: ResolvedOptions
): DocumentLayout {
  const { fontSize, padding, lineHeight } = options;
  const rFont = rubyFont(options);
  const rubyFontSize = Math.round(fontSize * options.rubyRatio);
  const cellAdvance = fontSize * lineHeight;
  const separatorAdvance = 2 * options.rubyRatio * fontSize;

  // base-ruby 間のギャップ（suffix なしの場合のみ使用）
  const slotGap = 2;

  // 全トークンをフラットに収集（統計用）
  const allTokens = collectAllTokens(tree);

  if (allTokens.length === 0) {
    return {
      width: padding.left + padding.right,
      height: padding.top + padding.bottom,
      columns: [],
    };
  }

  // hasSuffix / hasSaidoku / hasRightColumn は Pass 1 で事前計算済み
  const { hasSuffix, hasSaidoku, hasRightColumn } = tree;

  // ruby の最大幅計測
  let maxRubyWidth = 0;
  for (const tokenNode of allTokens) {
    const rubyW = measureTextWidth(tokenNode.slots.ruby, rFont, measurer);
    if (rubyW > maxRubyWidth) maxRubyWidth = rubyW;
  }

  let columnWidth: number;
  let baseCenterX: number;

  if (hasSuffix) {
    // 2行×n列グリッド: 必要な列のみ割り当て
    const saidokuWidth = hasSaidoku ? rubyFontSize : 0;
    const rightColumnWidth = hasRightColumn ? rubyFontSize : 0;
    columnWidth = saidokuWidth + fontSize + rightColumnWidth;
    baseCenterX = saidokuWidth + fontSize / 2;
  } else if (maxRubyWidth > 0) {
    columnWidth = fontSize + slotGap + maxRubyWidth;
    baseCenterX = fontSize / 2;
  } else {
    columnWidth = fontSize;
    baseCenterX = fontSize / 2;
  }

  const columnY = padding.top;
  const highlightGap = 2;

  // ブロックごとにカラムを作成（右→左配置: block[0] が右端）
  const numBlocks = tree.blocks.length;
  const columns: ColumnLayout[] = [];

  for (let blockIdx = 0; blockIdx < numBlocks; blockIdx++) {
    const block = tree.blocks[blockIdx]!;
    const blockColumnX =
      padding.left + (numBlocks - 1 - blockIdx) * (columnWidth + options.columnGap);

    const grid = computeGridColumns(
      blockColumnX,
      columnWidth,
      fontSize,
      rubyFontSize,
      slotGap,
      hasSuffix,
      hasSaidoku,
      baseCenterX
    );
    const blockLctx: LayoutContext = { fontSize, rubyFontSize, cellAdvance, grid };

    const columnChildren: ColumnChild[] = [];
    const highlightLines: HighlightLineLayout[] = [];
    let yOffset = 0;
    const highlightLineX = blockColumnX - highlightGap;

    /** tateten グループの children をレイアウト */
    function layoutTatetenChildren(children: (CanvasTokenNode | CanvasTatetenSeparator)[]): void {
      for (const groupChild of children) {
        if (groupChild.type === 'token') {
          const tokenX = blockColumnX + baseCenterX;
          const tokenY = columnY + yOffset + fontSize / 2;
          columnChildren.push(layoutSingleToken(groupChild, tokenX, tokenY, blockLctx));
          yOffset += cellAdvance;
        } else {
          // tateten-separator
          const sepX = blockColumnX + baseCenterX;
          const sepY = columnY + yOffset + separatorAdvance / 2;
          const sepLayout: TatetenSeparatorLayout = {
            type: 'tateten-separator',
            x: sepX,
            y: sepY,
            fontSize: rubyFontSize,
          };
          if (groupChild.kaeri) {
            const kaeriLayout: SlotLayout = {
              text: groupChild.kaeri,
              x: grid.kaeriX,
              y: sepY,
              fontSize: rubyFontSize,
            };
            sepLayout.kaeri = kaeriLayout;
          }
          columnChildren.push(sepLayout);
          yOffset += separatorAdvance;
        }
      }
    }

    /** CanvasBlockChild を展開してレイアウトに追加 */
    function layoutBlockChild(child: CanvasBlockChild): void {
      if (child.type === 'token') {
        const tokenX = blockColumnX + baseCenterX;
        const tokenY = columnY + yOffset + fontSize / 2;
        columnChildren.push(layoutSingleToken(child, tokenX, tokenY, blockLctx));
        yOffset += cellAdvance;
      } else if (child.type === 'tateten-group') {
        layoutTatetenChildren(child.children);
      } else {
        // highlight-group: track y range and layout children
        const yStart = columnY + yOffset;
        for (const highlightChild of child.children) {
          if (highlightChild.type === 'token') {
            const tokenX = blockColumnX + baseCenterX;
            const tokenY = columnY + yOffset + fontSize / 2;
            columnChildren.push(layoutSingleToken(highlightChild, tokenX, tokenY, blockLctx));
            yOffset += cellAdvance;
          } else {
            // tateten-group inside highlight-group
            layoutTatetenChildren(highlightChild.children);
          }
        }
        const yEnd = columnY + yOffset;

        // highlight-ref: ラベルを highlight 線の上端に配置
        let refLayout: SlotLayout | undefined;
        if (child.refLabel) {
          const refChars = [...child.refLabel].length;
          refLayout = {
            text: child.refLabel,
            x: highlightLineX,
            y: yStart - refChars * rubyFontSize,
            fontSize: rubyFontSize,
          };
        }

        highlightLines.push({
          style: child.highlightStyle as HighlightStyle,
          x: highlightLineX,
          yStart,
          yEnd,
          ...(refLayout ? { refLayout } : {}),
        });
      }
    }

    for (const child of block.children) {
      layoutBlockChild(child);
    }

    columns.push({
      x: blockColumnX,
      y: columnY,
      width: columnWidth,
      height: yOffset,
      children: columnChildren,
      ...(highlightLines.length > 0 ? { highlightLines } : {}),
    });
  }

  const totalWidth = numBlocks * columnWidth + Math.max(0, numBlocks - 1) * options.columnGap;
  const maxColumnHeight = Math.max(...columns.map((c) => c.height));

  return {
    width: padding.left + totalWidth + padding.right,
    height: padding.top + maxColumnHeight + padding.bottom,
    columns,
  };
}
