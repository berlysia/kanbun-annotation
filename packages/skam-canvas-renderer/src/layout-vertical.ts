/**
 * 縦書き単一列レイアウト
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
 *   row4(左):   saidoku           font-size: rubyFontSize
 *
 * 列方向: 右→左。列内: 上→下。
 */

import type {
  CanvasRenderTree,
  CanvasTokenNode,
  CanvasBlockChild,
  DocumentLayout,
  ColumnLayout,
  ColumnChild,
  TokenLayout,
  TatetenSeparatorLayout,
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

/** 全ブロックからトークンをフラットに収集（tateten グループ内も含む） */
function collectAllTokens(tree: CanvasRenderTree): CanvasTokenNode[] {
  const tokens: CanvasTokenNode[] = [];
  for (const block of tree.blocks) {
    for (const child of block.children) {
      if (child.type === 'token') {
        tokens.push(child);
      } else {
        // tateten-group: extract tokens from children
        for (const groupChild of child.children) {
          if (groupChild.type === 'token') {
            tokens.push(groupChild);
          }
        }
      }
    }
  }
  return tokens;
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
  const { columnX, columnWidth, fontSize, rubyFontSize, slotGap, hasSuffix } = lctx;
  const slotLayouts: ResolvedSlotLayouts = {};

  if (hasSuffix) {
    const rightColX = columnX + columnWidth - rubyFontSize / 2;
    const col2X = columnX + columnWidth - rubyFontSize * 1.5;
    const col3X = columnX + columnWidth - rubyFontSize * 2.5;

    if (slots.ruby) {
      slotLayouts.ruby = { text: slots.ruby, x: rightColX, y: tokenY, fontSize: rubyFontSize };
    }

    if (slots.okuri) {
      const rubyChars = slots.ruby ? [...slots.ruby].length : 0;
      slotLayouts.okuri = {
        text: slots.okuri,
        x: rightColX,
        y: tokenY + rubyChars * rubyFontSize,
        fontSize: rubyFontSize,
      };
    }

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

    if (slots.kutoten) {
      slotLayouts.kutoten = { text: slots.kutoten, x: col2X, y: tokenY, fontSize };
    }

    if (slots.kaeri) {
      slotLayouts.kaeri = { text: slots.kaeri, x: col3X, y: tokenY, fontSize: rubyFontSize };
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

    const col4X = columnX + columnWidth - rubyFontSize * 3.5;
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
      slotLayouts.saidokuOkuri2 = {
        text: slots.saidokuOkuri2,
        x: col4X,
        y: tokenY + underChars * rubyFontSize,
        fontSize: rubyFontSize,
      };
    }
  } else {
    if (slots.ruby) {
      slotLayouts.ruby = {
        text: slots.ruby,
        x: tokenX + fontSize / 2 + slotGap,
        y: tokenY,
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
    const gridWidth = Math.max(4 * rubyFontSize, 2 * rubyFontSize + fontSize);
    columnWidth = gridWidth;
    baseCenterX = gridWidth - rubyFontSize - fontSize / 2;
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
  let yOffset = 0;

  /** CanvasBlockChild を展開してレイアウトに追加 */
  function layoutBlockChild(child: CanvasBlockChild): void {
    if (child.type === 'token') {
      const tokenX = columnX + baseCenterX;
      const tokenY = columnY + yOffset + fontSize / 2;
      columnChildren.push(layoutSingleToken(child, tokenX, tokenY, lctx));
      yOffset += cellAdvance;
    } else {
      // tateten-group
      for (const groupChild of child.children) {
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
            const col3X = columnX + columnWidth - rubyFontSize * 2.5;
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
  };

  return {
    width: padding.left + columnWidth + padding.right,
    height: padding.top + columnHeight + padding.bottom,
    columns: [column],
  };
}
