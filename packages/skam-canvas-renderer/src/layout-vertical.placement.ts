/**
 * Placement レイヤ — ブロック内の子要素を配置
 *
 * token/tateten-group/highlight-group の配置ロジックを統合し、
 * 共通の Y 進行・token 配置ルーチンを提供する。
 */

import type { HighlightStyle } from '@kanbun/skam';
import type {
  CanvasTokenNode,
  CanvasTatetenSeparator,
  CanvasBlockChild,
  CanvasBlockNode,
  CanvasHighlightGroupNode,
  GridColumns,
  ColumnPlan,
  ColumnLayout,
  ColumnChild,
  TokenLayout,
  TokenSlots,
  TatetenSeparatorLayout,
  HighlightLineLayout,
  ResolvedSlotLayouts,
  ResolvedOptions,
  SlotLayout,
} from './types.js';
import { shouldApplyTateChuYoko } from './draw-text.js';

/** @internal per-token/per-group のレイアウト文脈 */
interface LayoutContext {
  fontSize: number;
  rubyFontSize: number;
  cellAdvance: number;
  grid: GridColumns;
  emphasisOverrideX?: number;
  rangeRubySpanHeight?: number;
  rangeRubyYOffset?: number;
  rangeRubyEndY?: number;
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
      // rangeRubySpanHeight: 均等割り付け後の実スパン高さ（overflow 時に設定）
      const spanHeight = lctx.rangeRubySpanHeight ?? slots.rubySpan * cellAdvance;
      const rubyTextHeight = [...slots.ruby].length * rubyFontSize;
      // ルビがスパンより長い場合、負のオフセットで上方にはみ出すのを防止
      // center モードでは rangeRubyYOffset で top padding 分を補正
      rubyY =
        tokenY + Math.max(0, (spanHeight - rubyTextHeight) / 2) + (lctx.rangeRubyYOffset ?? 0);
    }
    slotLayouts.ruby = { text: slots.ruby, x: grid.suffixX, y: rubyY, fontSize: rubyFontSize };
  }

  // okuri/soegana の基準 Y: 通常はベース文字+ルビの下端。
  // range ruby overflow 時は rangeRubyEndY（ルビ下端の絶対座標）で押し下げ。
  const rubyCharsForSuffix = slots.ruby ? [...slots.ruby].length : 0;
  const normalSuffixBaseY = tokenY + Math.max(fontSize, rubyCharsForSuffix * rubyFontSize);
  const suffixBaseY =
    lctx.rangeRubyEndY !== undefined
      ? Math.max(normalSuffixBaseY, lctx.rangeRubyEndY)
      : normalSuffixBaseY;

  if (slots.okuri) {
    slotLayouts.okuri = {
      text: slots.okuri,
      x: grid.suffixX,
      y: suffixBaseY,
      fontSize: rubyFontSize,
    };
  }

  if (slots.soegana) {
    const okuriChars = slots.okuri ? [...slots.okuri].length : 0;
    slotLayouts.soegana = {
      text: slots.soegana,
      x: grid.suffixX,
      y: suffixBaseY + okuriChars * rubyFontSize,
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
    // per-token emphasis 位置計算:
    // highlight-group, tateten-group 内: emphasisOverrideX（highlight 線の外側）
    // ruby あり: suffixX + rubyFontSize/2 * 2（ruby の右側）
    // ruby なし: tokenX + fontSize/2 + rubyFontSize/2（ベース文字右端の外側）
    //
    // HTML版では text-emphasis-position: right でブラウザが文字セル外側に配置する。
    // Canvas版では rubyFontSize/2 のオフセットで傍点がbaseに食い込むのを防止。
    let emphasisX: number;
    if (lctx.emphasisOverrideX !== undefined) {
      emphasisX = lctx.emphasisOverrideX;
    } else if (slots.ruby) {
      emphasisX = grid.suffixX + rubyFontSize;
    } else {
      emphasisX = tokenX + fontSize / 2 + rubyFontSize / 2;
    }
    slotLayouts.emphasis = {
      text: slots.emphasis,
      x: emphasisX,
      y: tokenY + (fontSize - rubyFontSize) / 2,
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
    const isTCY = shouldApplyTateChuYoko(slots.ref);
    // 縦中横: 1行分の高さ。通常: 文字数分の高さ。
    const refHeight = isTCY ? rubyFontSize : [...slots.ref].length * rubyFontSize;
    slotLayouts.ref = {
      text: slots.ref,
      x: tokenX,
      y: tokenY - refHeight,
      fontSize: rubyFontSize,
      ...(isTCY ? { tateChuYoko: true } : {}),
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
 * トークンの垂直コンテンツ高さを計算。
 * tokenY からコンテンツ最下端までの距離。
 *
 * Suffix row（kaeri/kutoten）も含む:
 * - kutoten は fontSize サイズで tokenY + fontSize に配置 → 下端 tokenY + 2*fontSize
 * - kaeri は rubyFontSize サイズで tokenY + fontSize に配置 → 下端 tokenY + fontSize + rubyFontSize
 */
function computeTokenContentHeight(
  slots: TokenSlots,
  fontSize: number,
  rubyFontSize: number
): number {
  const R = rubyFontSize;

  // rubySpan > 1 の場合、ruby は複数セルに分散 → 単一セルの高さに含めない
  // range ruby がスパンを超える場合の超過分は、レイアウトループ側で
  // 均等割り付け（extraAdvancePerToken）として処理する
  const rubyChars =
    slots.rubySpan && slots.rubySpan > 1 ? 0 : slots.ruby ? [...slots.ruby].length : 0;
  const okuriChars = slots.okuri ? [...slots.okuri].length : 0;
  const soeganaChars = slots.soegana ? [...slots.soegana].length : 0;
  const saidokuUnderChars = slots.saidokuUnder ? [...slots.saidokuUnder].length : 0;
  const saidokuOkuri2Chars = slots.saidokuOkuri2 ? [...slots.saidokuOkuri2].length : 0;

  // tokenY からの最大延伸量
  let maxExtent = fontSize; // ベース文字高さ

  // 右列: ruby → okuri → soegana（縦に積み上げ）
  const rightExtent = Math.max(fontSize, rubyChars * R) + okuriChars * R + soeganaChars * R;
  maxExtent = Math.max(maxExtent, rightExtent);

  // 左列: saidokuUnder → saidokuOkuri2
  if (saidokuUnderChars > 0 || saidokuOkuri2Chars > 0) {
    const leftExtent = Math.max(fontSize, saidokuUnderChars * R) + saidokuOkuri2Chars * R;
    maxExtent = Math.max(maxExtent, leftExtent);
  }

  // Suffix row: kaeri/kutoten は tokenY + fontSize に配置される
  if (slots.kutoten) {
    // kutoten は fontSize サイズで描画
    maxExtent = Math.max(maxExtent, fontSize + fontSize);
  }
  if (slots.kaeri) {
    // kaeri は rubyFontSize サイズで描画
    maxExtent = Math.max(maxExtent, fontSize + R);
  }

  return maxExtent;
}

/** highlight-group 内の仮名類（ruby/okuri/soegana）の有無を判定 */
function checkGroupHasRightColumn(group: CanvasHighlightGroupNode): boolean {
  for (const hlChild of group.children) {
    if (hlChild.type === 'token') {
      if (hlChild.slots.ruby || hlChild.slots.okuri || hlChild.slots.soegana) {
        return true;
      }
    } else {
      for (const tc of hlChild.children) {
        if (tc.type === 'token' && (tc.slots.ruby || tc.slots.okuri || tc.slots.soegana)) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * ブロック内の子要素を配置し、ColumnLayout を返す。
 */
export function placeBlock(
  block: CanvasBlockNode,
  plan: ColumnPlan,
  options: ResolvedOptions
): ColumnLayout {
  const { fontSize } = options;
  const rubyFontSize = Math.round(fontSize * options.rubyRatio);
  const cellAdvance = fontSize;
  const separatorAdvance = rubyFontSize;
  const highlightGap = 2;
  const columnY = options.padding.top;

  const blockColumnX = plan.x;
  const { columnWidth: blockColumnWidth, baseCenterX: blockBaseCenterX } = plan.dimensions;
  const effectiveFlags = plan.flags;
  const grid = plan.grid;
  const effectiveMaxRubyWidth = plan.effectiveMaxRubyWidth;
  const blockLctx: LayoutContext = { fontSize, rubyFontSize, cellAdvance, grid };

  const columnChildren: ColumnChild[] = [];
  const highlightLines: HighlightLineLayout[] = [];
  let yOffset = 0;
  const highlightLineX = blockColumnX + blockColumnWidth + highlightGap;

  /** tateten グループの children をレイアウト */
  function layoutTatetenChildren(
    children: (CanvasTokenNode | CanvasTatetenSeparator)[],
    lctx: LayoutContext = blockLctx
  ): void {
    // tateten グループ内の range ruby は先頭トークンにのみ slots.ruby が設定される。
    // 2文字目以降も ruby 列分の空きを確保するため、グループ内に ruby があれば
    // 全トークンの emphasis を ruby-aware 位置に統一する。
    if (lctx.emphasisOverrideX === undefined) {
      const groupHasRuby = children.some((c) => c.type === 'token' && c.slots.ruby);
      if (groupHasRuby) {
        lctx = {
          ...lctx,
          emphasisOverrideX: grid.suffixX + rubyFontSize,
        };
      }
    }

    // range ruby overflow: ルビがグループ自然高さを超える場合、
    // distribute: 超過分を全要素（トークン+セパレータ）で均等割り付け
    // center: グループを中央寄せ（前後にパディング）
    let extraAdvancePerElement = 0;
    let rangeRubySpanHeight: number | undefined;
    let rangeRubyYOffset = 0;
    let centerBottomPad = 0;
    const firstRubyToken = children.find(
      (c): c is CanvasTokenNode =>
        c.type === 'token' && !!(c.slots.rubySpan && c.slots.rubySpan > 1 && c.slots.ruby)
    );
    // rangeRubyEndY: ルビ下端の絶対 Y（okuri/soegana の押し下げ用）
    let rangeRubyEndY: number | undefined;
    if (firstRubyToken) {
      const numTokens = children.filter((c) => c.type === 'token').length;
      const numSeparators = children.length - numTokens;
      const naturalHeight = numTokens * fontSize + numSeparators * separatorAdvance;
      const rubyTextHeight = [...firstRubyToken.slots.ruby!].length * rubyFontSize;
      if (rubyTextHeight > naturalHeight) {
        const excess = rubyTextHeight - naturalHeight;
        rangeRubySpanHeight = rubyTextHeight;
        // ルビ下端 = グループ開始位置（leading/padding 適用前）+ rubyTextHeight
        rangeRubyEndY = columnY + yOffset + rubyTextHeight;
        if (options.rangeRubyAlignment === 'center') {
          yOffset += excess / 2;
          rangeRubyYOffset = -(excess / 2);
          centerBottomPad = excess / 2;
        } else {
          // N+1 ギャップモデル: leading + N elements で均等配分
          extraAdvancePerElement = excess / (children.length + 1);
          yOffset += extraAdvancePerElement; // leading
          rangeRubyYOffset = -extraAdvancePerElement;
        }
      }
    }

    // range ruby overflow 時はルビ centering 用のスパン高さと Y オフセット、ルビ下端を渡す
    const tokenLctx: LayoutContext =
      rangeRubySpanHeight !== undefined
        ? {
            ...lctx,
            rangeRubySpanHeight,
            rangeRubyYOffset,
            ...(rangeRubyEndY !== undefined ? { rangeRubyEndY } : {}),
          }
        : lctx;

    for (const groupChild of children) {
      if (groupChild.type === 'token') {
        const tokenX = blockColumnX + blockBaseCenterX;
        const tokenY = columnY + yOffset;
        columnChildren.push(layoutSingleToken(groupChild, tokenX, tokenY, tokenLctx));
        const contentHeight = computeTokenContentHeight(groupChild.slots, fontSize, rubyFontSize);
        yOffset += Math.max(fontSize, contentHeight) + extraAdvancePerElement;
      } else {
        // tateten-separator
        const sepX = blockColumnX + blockBaseCenterX;
        const sepY = columnY + yOffset;
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
        yOffset += separatorAdvance + extraAdvancePerElement;
      }
    }
    // center モード: 末尾パディング
    yOffset += centerBottomPad;
  }

  // range ruby（rubySpan > 1）の2文字目以降を追跡。
  // 先頭トークンにのみ slots.ruby が設定されるため、後続トークンの emphasis 位置を
  // ruby 列分右にずらして被りを防止する。
  let rubySpanRemaining = 0;

  // range ruby overflow: ルビがスパンの自然高さを超える場合の均等割り付け/中央寄せ
  let blockRangeExtraPerToken = 0;
  let blockRangeSpanHeight: number | undefined;
  let blockRangeRubyYOffset = 0;
  let blockRangeCenterBottomPad = 0;
  let blockRangeRubyEndY: number | undefined;

  /** CanvasBlockChild を展開してレイアウトに追加 */
  function layoutBlockChild(child: CanvasBlockChild): void {
    if (child.type === 'token') {
      const tokenX = blockColumnX + blockBaseCenterX;
      const tokenY = columnY + yOffset;
      // range ruby の2文字目以降: ruby 列分の空きを確保するため emphasis を右にずらす
      let lctx: LayoutContext =
        rubySpanRemaining > 0 && !child.slots.ruby && blockLctx.emphasisOverrideX === undefined
          ? { ...blockLctx, emphasisOverrideX: grid.suffixX + rubyFontSize }
          : blockLctx;
      // range ruby overflow 時はルビ centering 用のスパン高さ、Y オフセット、ルビ下端を渡す
      if (blockRangeSpanHeight !== undefined) {
        lctx = {
          ...lctx,
          rangeRubySpanHeight: blockRangeSpanHeight,
          rangeRubyYOffset: blockRangeRubyYOffset,
          ...(blockRangeRubyEndY !== undefined ? { rangeRubyEndY: blockRangeRubyEndY } : {}),
        };
      }
      columnChildren.push(layoutSingleToken(child, tokenX, tokenY, lctx));
      const contentHeight = computeTokenContentHeight(child.slots, fontSize, rubyFontSize);
      yOffset += Math.max(cellAdvance, contentHeight) + blockRangeExtraPerToken;
    } else if (child.type === 'tateten-group') {
      layoutTatetenChildren(child.children);
    } else {
      // highlight-group: track y range and layout children
      const groupHasRightColumn = checkGroupHasRightColumn(child);

      let rightAdjust = 0;
      if (effectiveFlags.hasSuffix && effectiveFlags.hasRightColumn && !groupHasRightColumn) {
        rightAdjust = rubyFontSize;
      } else if (!effectiveFlags.hasSuffix && effectiveMaxRubyWidth > 0 && !groupHasRightColumn) {
        rightAdjust = effectiveMaxRubyWidth;
      }
      const groupHighlightLineX = highlightLineX - rightAdjust;

      // ADR-015: emphasis+highlight 共存時、emphasis を highlight line の外側（右）に配置
      const hlLctx: LayoutContext = {
        ...blockLctx,
        emphasisOverrideX: groupHighlightLineX + highlightGap / 2 + rubyFontSize / 2,
      };
      const yStart = columnY + yOffset;
      for (const highlightChild of child.children) {
        if (highlightChild.type === 'token') {
          const tokenX = blockColumnX + blockBaseCenterX;
          const tokenY = columnY + yOffset;
          columnChildren.push(layoutSingleToken(highlightChild, tokenX, tokenY, hlLctx));
          const hlContentHeight = computeTokenContentHeight(
            highlightChild.slots,
            fontSize,
            rubyFontSize
          );
          yOffset += Math.max(cellAdvance, hlContentHeight);
        } else {
          // tateten-group inside highlight-group
          layoutTatetenChildren(highlightChild.children, hlLctx);
        }
      }
      const yEnd = columnY + yOffset;

      // highlight-ref: ラベルを highlight 線の開始位置（上端）に配置
      // HTML版: inset-inline-start: 0 (top: 0), inset-block-start: 0 (right: 0)
      // → X = 線と同じ位置、Y = グループ先頭（線の引き始め）
      let refLayout: SlotLayout | undefined;
      if (child.refLabel) {
        const isTCY = shouldApplyTateChuYoko(child.refLabel);
        refLayout = {
          text: child.refLabel,
          x: groupHighlightLineX + (rubyFontSize * 7) / 8,
          y: yStart,
          fontSize: rubyFontSize,
          ...(isTCY ? { tateChuYoko: true } : {}),
        };
      }

      highlightLines.push({
        style: child.highlightStyle as HighlightStyle,
        x: groupHighlightLineX,
        yStart,
        yEnd,
        ...(refLayout ? { refLayout } : {}),
      });
    }
  }

  for (const child of block.children) {
    if (child.type === 'token') {
      // range ruby の開始を検出
      if (child.slots.rubySpan && child.slots.rubySpan > 1) {
        rubySpanRemaining = child.slots.rubySpan - 1;
        // range ruby overflow: ルビがスパンを超える場合の均等割り付け/中央寄せを計算
        if (child.slots.ruby) {
          const rubyTextHeight = [...child.slots.ruby].length * rubyFontSize;
          const spanProvided = child.slots.rubySpan * cellAdvance;
          if (rubyTextHeight > spanProvided) {
            const excess = rubyTextHeight - spanProvided;
            blockRangeSpanHeight = rubyTextHeight;
            // ルビ下端 = スパン開始位置（leading/padding 適用前）+ rubyTextHeight
            blockRangeRubyEndY = columnY + yOffset + rubyTextHeight;
            if (options.rangeRubyAlignment === 'center') {
              yOffset += excess / 2;
              blockRangeRubyYOffset = -(excess / 2);
              blockRangeCenterBottomPad = excess / 2;
            } else {
              // N+1 ギャップモデル: leading + N tokens で均等配分
              blockRangeExtraPerToken = excess / (child.slots.rubySpan + 1);
              yOffset += blockRangeExtraPerToken; // leading
              blockRangeRubyYOffset = -blockRangeExtraPerToken;
            }
          }
        }
      }
    } else {
      // tateten-group/highlight-group は内部で独自に処理するためリセット
      rubySpanRemaining = 0;
      blockRangeExtraPerToken = 0;
      blockRangeSpanHeight = undefined;
      blockRangeRubyEndY = undefined;
    }

    layoutBlockChild(child);

    // range ruby の2文字目以降を消費
    if (child.type === 'token' && !child.slots.ruby && rubySpanRemaining > 0) {
      rubySpanRemaining--;
      if (rubySpanRemaining === 0) {
        // center モード: 末尾パディング
        yOffset += blockRangeCenterBottomPad;
        blockRangeCenterBottomPad = 0;
        blockRangeExtraPerToken = 0;
        blockRangeSpanHeight = undefined;
        blockRangeRubyEndY = undefined;
        blockRangeRubyYOffset = 0;
      }
    }
  }

  return {
    x: blockColumnX,
    y: columnY,
    width: blockColumnWidth,
    height: yOffset,
    children: columnChildren,
    ...(highlightLines.length > 0 ? { highlightLines } : {}),
  };
}
