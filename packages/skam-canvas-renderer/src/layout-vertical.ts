/**
 * 縦書き単一列レイアウト
 *
 * HTML renderer では suffix-row と ruby-grid が別のインライン要素として
 * 異なる垂直位置に配置されるため重なりが生じない。
 * Canvas では同一空間に描画するため、base の左右に分離配置して重なりを回避する。
 *
 * 物理配置（左→右）:
 *
 *   [saidoku2(R)] [kaeri(R)] [base(F)] [kutoten(R)] [okuri/soegana(R)]
 *
 *   R = rubyFontSize, F = fontSize
 *   gridWidth = 4R + F
 *   baseCenterX = 2R + F/2
 *
 * 左ゾーン（base の左側）:
 *   col4: saidoku2       center = R/2        font-size: rubyFontSize
 *   col3: kaeri          center = R + R/2    font-size: rubyFontSize, bottom-aligned
 *
 * 右ゾーン（base の右側）:
 *   col2: kutoten        center = 2R+F+R/2   font-size: fontSize
 *   col1: okuri/soegana  center = 3R+F+R/2   font-size: rubyFontSize
 *   ruby/yomigana は col1 と同じ X（base より上）
 *   emphasis は col1 の右隣（ruby がある場合はさらに右）
 *
 * 列方向: 右→左。列内: 上→下。
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

interface LayoutContext {
  columnX: number;
  columnY: number;
  columnWidth: number;
  baseCenterX: number;
  fontSize: number;
  rubyFontSize: number;
  cellAdvance: number;
  slotGap: number;
  hasSuffix: boolean;
}

/** 単一トークンのスロットレイアウトを計算 */
function layoutSingleToken(
  tokenNode: CanvasTokenNode,
  tokenX: number,
  tokenY: number,
  lctx: LayoutContext
): TokenLayout {
  const { slots } = tokenNode;
  const { columnX, columnWidth, fontSize, rubyFontSize, cellAdvance, slotGap, hasSuffix } = lctx;
  const slotLayouts: ResolvedSlotLayouts = {};

  if (hasSuffix) {
    // 右ゾーン: base の右側
    const rightColX = columnX + columnWidth - rubyFontSize / 2;
    const col2X = columnX + 2 * rubyFontSize + fontSize + rubyFontSize / 2;
    // 左ゾーン: base の左側
    const col3X = columnX + rubyFontSize + rubyFontSize / 2;

    if (slots.ruby) {
      let rubyY = tokenY;
      if (slots.rubySpan && slots.rubySpan > 1) {
        // range yomigana: N セル分の中央にセンタリング
        const spanHeight = slots.rubySpan * cellAdvance;
        const rubyTextHeight = [...slots.ruby].length * rubyFontSize;
        rubyY = tokenY + (spanHeight - rubyTextHeight) / 2;
      }
      slotLayouts.ruby = { text: slots.ruby, x: rightColX, y: rubyY, fontSize: rubyFontSize };
    }

    if (slots.okuri) {
      const rubyChars = slots.ruby ? [...slots.ruby].length : 0;
      // 送り仮名は基底文字の下端から開始（ruby が長い場合はその後から）
      const okuriStartY = tokenY + Math.max(fontSize, rubyChars * rubyFontSize);
      slotLayouts.okuri = {
        text: slots.okuri,
        x: rightColX,
        y: okuriStartY,
        fontSize: rubyFontSize,
      };
    }

    if (slots.soegana) {
      const rubyChars = slots.ruby ? [...slots.ruby].length : 0;
      const okuriChars = slots.okuri ? [...slots.okuri].length : 0;
      // 添え仮名は送り仮名の後に配置
      const soeganaStartY =
        tokenY + Math.max(fontSize, rubyChars * rubyFontSize) + okuriChars * rubyFontSize;
      slotLayouts.soegana = {
        text: slots.soegana,
        x: rightColX,
        y: soeganaStartY,
        fontSize: rubyFontSize,
      };
    }

    if (slots.kutoten) {
      slotLayouts.kutoten = { text: slots.kutoten, x: col2X, y: tokenY, fontSize };
    }

    if (slots.kaeri) {
      // 返り点は基底文字の下端に揃える（bottom-aligned）
      const kaeriChars = [...slots.kaeri].length;
      slotLayouts.kaeri = {
        text: slots.kaeri,
        x: col3X,
        y: tokenY + fontSize - kaeriChars * rubyFontSize,
        fontSize: rubyFontSize,
      };
    }

    if (slots.emphasis) {
      const emphasisX = slots.ruby ? rightColX + rubyFontSize : rightColX;
      slotLayouts.emphasis = {
        text: slots.emphasis,
        x: emphasisX,
        y: tokenY,
        fontSize: rubyFontSize,
      };
    }

    const col4X = columnX + rubyFontSize / 2;
    if (slots.saidokuUnder) {
      slotLayouts.saidokuUnder = {
        text: slots.saidokuUnder,
        x: col4X,
        y: tokenY,
        fontSize: rubyFontSize,
      };
    }
    if (slots.saidokuOkuri2) {
      const underChars = slots.saidokuUnder ? [...slots.saidokuUnder].length : 0;
      // 再読2回目送り仮名は基底文字の下端から開始（saidokuUnder が長い場合はその後から）
      const saidokuOkuri2StartY = tokenY + Math.max(fontSize, underChars * rubyFontSize);
      slotLayouts.saidokuOkuri2 = {
        text: slots.saidokuOkuri2,
        x: col4X,
        y: saidokuOkuri2StartY,
        fontSize: rubyFontSize,
      };
    }
  } else {
    if (slots.ruby) {
      let rubyY = tokenY;
      if (slots.rubySpan && slots.rubySpan > 1) {
        const spanHeight = slots.rubySpan * cellAdvance;
        const rubyTextHeight = [...slots.ruby].length * rubyFontSize;
        rubyY = tokenY + (spanHeight - rubyTextHeight) / 2;
      }
      slotLayouts.ruby = {
        text: slots.ruby,
        x: tokenX + fontSize / 2 + slotGap,
        y: rubyY,
        fontSize: rubyFontSize,
      };
    }

    if (slots.emphasis) {
      const emphasisX = slots.ruby
        ? tokenX + fontSize / 2 + slotGap + rubyFontSize
        : tokenX + fontSize / 2 + slotGap;
      slotLayouts.emphasis = {
        text: slots.emphasis,
        x: emphasisX,
        y: tokenY,
        fontSize: rubyFontSize,
      };
    }
  }

  // ref: base の上方向（block-start）に配置。hasSuffix/非 suffix 共通。
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

  // ruby の最大幅計測、suffix 有無判定
  let maxRubyWidth = 0;
  let hasSuffix = false;

  for (const tokenNode of allTokens) {
    const { slots } = tokenNode;
    const rubyW = measureTextWidth(slots.ruby, rFont, measurer);
    if (rubyW > maxRubyWidth) maxRubyWidth = rubyW;
    if (
      slots.okuri ||
      slots.soegana ||
      slots.kaeri ||
      slots.kutoten ||
      slots.saidokuUnder ||
      slots.saidokuOkuri2
    ) {
      hasSuffix = true;
    }
  }

  let columnWidth: number;
  let baseCenterX: number;

  if (hasSuffix) {
    // base の左右に suffix 列を分離配置するため 4R + F 幅が必要
    const gridWidth = 4 * rubyFontSize + fontSize;
    columnWidth = gridWidth;
    baseCenterX = 2 * rubyFontSize + fontSize / 2;
  } else if (maxRubyWidth > 0) {
    columnWidth = fontSize + slotGap + maxRubyWidth;
    baseCenterX = fontSize / 2;
  } else {
    columnWidth = fontSize;
    baseCenterX = fontSize / 2;
  }

  const columnX = padding.left;
  const columnY = padding.top;

  const lctx: LayoutContext = {
    columnX,
    columnY,
    columnWidth,
    baseCenterX,
    fontSize,
    rubyFontSize,
    cellAdvance,
    slotGap,
    hasSuffix,
  };

  // ブロックの children をフラットに展開してレイアウト
  const columnChildren: ColumnChild[] = [];
  const highlightLines: HighlightLineLayout[] = [];
  let yOffset = 0;

  // highlight 線の x 座標: 左側（col4 の外側）に配置
  const highlightGap = 2;
  const highlightLineX = columnX - highlightGap;

  /** tateten グループの children をレイアウト */
  function layoutTatetenChildren(children: (CanvasTokenNode | CanvasTatetenSeparator)[]): void {
    for (const groupChild of children) {
      if (groupChild.type === 'token') {
        const tokenX = columnX + baseCenterX;
        const tokenY = columnY + yOffset + fontSize / 2;
        columnChildren.push(layoutSingleToken(groupChild, tokenX, tokenY, lctx));
        yOffset += cellAdvance;
      } else {
        // tateten-separator
        const sepX = columnX + baseCenterX;
        const sepY = columnY + yOffset + separatorAdvance / 2;
        const sepLayout: TatetenSeparatorLayout = {
          type: 'tateten-separator',
          x: sepX,
          y: sepY,
          fontSize: rubyFontSize,
        };
        if (groupChild.kaeri) {
          const col3X = columnX + rubyFontSize + rubyFontSize / 2;
          const kaeriLayout: SlotLayout = {
            text: groupChild.kaeri,
            x: col3X,
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
      const tokenX = columnX + baseCenterX;
      const tokenY = columnY + yOffset + fontSize / 2;
      columnChildren.push(layoutSingleToken(child, tokenX, tokenY, lctx));
      yOffset += cellAdvance;
    } else if (child.type === 'tateten-group') {
      layoutTatetenChildren(child.children);
    } else {
      // highlight-group: track y range and layout children
      const yStart = columnY + yOffset;
      for (const highlightChild of child.children) {
        if (highlightChild.type === 'token') {
          const tokenX = columnX + baseCenterX;
          const tokenY = columnY + yOffset + fontSize / 2;
          columnChildren.push(layoutSingleToken(highlightChild, tokenX, tokenY, lctx));
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

  for (const block of tree.blocks) {
    for (const child of block.children) {
      layoutBlockChild(child);
    }
  }

  const columnHeight = yOffset;

  const column: ColumnLayout = {
    x: columnX,
    y: columnY,
    width: columnWidth,
    height: columnHeight,
    children: columnChildren,
    ...(highlightLines.length > 0 ? { highlightLines } : {}),
  };

  return {
    width: padding.left + columnWidth + padding.right,
    height: padding.top + columnHeight + padding.bottom,
    columns: [column],
  };
}
