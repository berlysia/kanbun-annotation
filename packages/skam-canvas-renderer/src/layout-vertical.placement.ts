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

/** 可変追跡状態（range ruby 進行管理） */
interface BlockLayoutState {
  yOffset: number;
  rubySpanRemaining: number;
  blockRangeExtraPerToken: number;
  blockRangeSpanHeight: number | undefined;
  blockRangeRubyYOffset: number;
  blockRangeCenterBottomPad: number;
  blockRangeRubyEndY: number | undefined;
}

/** 読み取り専用のブロック配置定数群 */
interface PlacementContext {
  fontSize: number;
  rubyFontSize: number;
  cellAdvance: number;
  separatorAdvance: number;
  grid: GridColumns;
  columnY: number;
  blockColumnX: number;
  blockBaseCenterX: number;
  blockColumnWidth: number;
  highlightLineX: number;
  highlightGap: number;
  effectiveFlags: ColumnPlan['flags'];
  effectiveMaxRubyWidth: number;
  options: ResolvedOptions;
}

function createInitialState(): BlockLayoutState {
  return {
    yOffset: 0,
    rubySpanRemaining: 0,
    blockRangeExtraPerToken: 0,
    blockRangeSpanHeight: undefined,
    blockRangeRubyYOffset: 0,
    blockRangeCenterBottomPad: 0,
    blockRangeRubyEndY: undefined,
  };
}

function buildPlacementContext(plan: ColumnPlan, options: ResolvedOptions): PlacementContext {
  const { fontSize } = options;
  const rubyFontSize = Math.round(fontSize * options.rubyRatio);
  const highlightGap = 2;
  const columnY = options.padding.top;
  const blockColumnX = plan.x;
  const { columnWidth: blockColumnWidth, baseCenterX: blockBaseCenterX } = plan.dimensions;

  return {
    fontSize,
    rubyFontSize,
    cellAdvance: fontSize,
    separatorAdvance: rubyFontSize,
    grid: plan.grid,
    columnY,
    blockColumnX,
    blockBaseCenterX,
    blockColumnWidth,
    highlightLineX: blockColumnX + blockColumnWidth + highlightGap,
    highlightGap,
    effectiveFlags: plan.flags,
    effectiveMaxRubyWidth: plan.effectiveMaxRubyWidth,
    options,
  };
}

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
  rangeRubyAlign?: 'center' | 'start' | 'end' | 'justify' | 'space-around' | 'space-evenly';
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
    let rubyCharAdvance: number | undefined;
    if (slots.rubySpan && slots.rubySpan > 1) {
      // rangeRubySpanHeight: 均等割り付け後の実スパン高さ（overflow 時に設定）
      const spanHeight = lctx.rangeRubySpanHeight ?? slots.rubySpan * cellAdvance;
      const numChars = [...slots.ruby].length;
      const rubyTextHeight = numChars * rubyFontSize;
      const yOff = lctx.rangeRubyYOffset ?? 0;
      const align = lctx.rangeRubyAlign ?? 'center';

      if (align === 'justify' && numChars > 1 && spanHeight > rubyTextHeight) {
        // justify: ルビ文字をスパン全体に均等配分（先頭・末尾は文字端に揃える）
        rubyY = tokenY + yOff;
        rubyCharAdvance = (spanHeight - rubyFontSize) / (numChars - 1);
      } else if (align === 'space-around' && numChars > 0 && spanHeight > rubyTextHeight) {
        // space-around: 各文字の前後に均等な余白（端は半分の余白）
        const gap = (spanHeight - rubyTextHeight) / numChars;
        rubyY = tokenY + gap / 2 + yOff;
        if (numChars > 1) {
          rubyCharAdvance = rubyFontSize + gap;
        }
      } else if (align === 'space-evenly' && numChars > 0 && spanHeight > rubyTextHeight) {
        // space-evenly: 文字間と両端に均等な余白
        const gap = (spanHeight - rubyTextHeight) / (numChars + 1);
        rubyY = tokenY + gap + yOff;
        if (numChars > 1) {
          rubyCharAdvance = rubyFontSize + gap;
        }
      } else if (align === 'start') {
        rubyY = tokenY + yOff;
      } else if (align === 'end') {
        rubyY = tokenY + Math.max(0, spanHeight - rubyTextHeight) + yOff;
      } else {
        // center (default, also fallback for justify/space-around/space-evenly when overflow or single char)
        rubyY = tokenY + Math.max(0, (spanHeight - rubyTextHeight) / 2) + yOff;
      }
    }
    slotLayouts.ruby = {
      text: slots.ruby,
      x: grid.suffixX,
      y: rubyY,
      fontSize: rubyFontSize,
      ...(rubyCharAdvance !== undefined ? { charAdvance: rubyCharAdvance } : {}),
    };
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

/** range ruby 開始時の overflow 検出 + State パラメータ設定 */
function detectRangeRubyOverflow(
  block: CanvasBlockNode,
  childIdx: number,
  token: CanvasTokenNode,
  state: BlockLayoutState,
  ctx: PlacementContext
): void {
  const { fontSize, rubyFontSize, cellAdvance, columnY } = ctx;
  const rubySpan = token.slots.rubySpan!;
  state.rubySpanRemaining = rubySpan - 1;

  // 先読み: スパン内トークンの実際の advance を合計
  let actualSpan = 0;
  let lastSpanTokenContentHeight = fontSize;
  for (let j = 0; j < rubySpan && childIdx + j < block.children.length; j++) {
    const spanChild = block.children[childIdx + j]!;
    if (spanChild.type === 'token') {
      lastSpanTokenContentHeight = computeTokenContentHeight(
        spanChild.slots,
        fontSize,
        rubyFontSize
      );
      actualSpan += Math.max(cellAdvance, lastSpanTokenContentHeight);
    }
  }
  // 最後のトークンの suffix 延伸分はルビ centering に含めない
  const spanTrailingExt = Math.max(0, lastSpanTokenContentHeight - fontSize);
  const baseSpan = actualSpan - spanTrailingExt;

  // range ruby overflow: ルビがスパンを超える場合の均等割り付け/中央寄せを計算
  if (token.slots.ruby) {
    const rubyTextHeight = [...token.slots.ruby].length * rubyFontSize;
    if (rubyTextHeight > actualSpan) {
      const excess = rubyTextHeight - actualSpan;
      state.blockRangeSpanHeight = rubyTextHeight;
      // ルビ下端 = スパン開始位置（leading/padding 適用前）+ rubyTextHeight
      state.blockRangeRubyEndY = columnY + state.yOffset + rubyTextHeight;
      if (ctx.options.rangeRubyAlignment === 'center') {
        state.yOffset += excess / 2;
        state.blockRangeRubyYOffset = -(excess / 2);
        state.blockRangeCenterBottomPad = excess / 2;
      } else {
        // N+1 ギャップモデル: leading + N tokens で均等配分
        state.blockRangeExtraPerToken = excess / (rubySpan + 1);
        state.yOffset += state.blockRangeExtraPerToken; // leading
        state.blockRangeRubyYOffset = -state.blockRangeExtraPerToken;
      }
    } else {
      // non-overflow: ベース文字スパンでセンタリング（suffix 延伸を除く）
      state.blockRangeSpanHeight = baseSpan;
    }
  }
}

/** 非トークン child 遭遇時の State リセット */
function resetRangeRubyState(state: BlockLayoutState): void {
  state.rubySpanRemaining = 0;
  state.blockRangeExtraPerToken = 0;
  state.blockRangeSpanHeight = undefined;
  state.blockRangeRubyEndY = undefined;
}

/** range ruby 2文字目以降の消費カウンタ更新 + 完了時リセット */
function consumeRangeRuby(child: CanvasBlockChild, state: BlockLayoutState): void {
  if (child.type === 'token' && !child.slots.ruby && state.rubySpanRemaining > 0) {
    state.rubySpanRemaining--;
    if (state.rubySpanRemaining === 0) {
      // center モード: 末尾パディング
      state.yOffset += state.blockRangeCenterBottomPad;
      state.blockRangeCenterBottomPad = 0;
      state.blockRangeExtraPerToken = 0;
      state.blockRangeSpanHeight = undefined;
      state.blockRangeRubyEndY = undefined;
      state.blockRangeRubyYOffset = 0;
    }
  }
}

interface PlaceBlockChildResult {
  children: ColumnChild[];
  highlightLines?: HighlightLineLayout[];
}

/** CanvasBlockChild を配置し、結果を返す。state.yOffset を直接変更する。 */
function placeBlockChild(
  child: CanvasBlockChild,
  state: BlockLayoutState,
  blockLctx: LayoutContext,
  ctx: PlacementContext
): PlaceBlockChildResult {
  const {
    fontSize,
    rubyFontSize,
    cellAdvance,
    grid,
    columnY,
    blockColumnX,
    blockBaseCenterX,
    blockColumnWidth,
    highlightLineX,
    highlightGap,
    effectiveFlags,
    effectiveMaxRubyWidth,
  } = ctx;

  if (child.type === 'token') {
    const tokenX = blockColumnX + blockBaseCenterX;
    const tokenY = columnY + state.yOffset;
    // range ruby の2文字目以降: ruby 列分の空きを確保するため emphasis を右にずらす
    let lctx: LayoutContext =
      state.rubySpanRemaining > 0 && !child.slots.ruby && blockLctx.emphasisOverrideX === undefined
        ? { ...blockLctx, emphasisOverrideX: grid.suffixX + rubyFontSize }
        : blockLctx;
    // range ruby overflow 時はルビ centering 用のスパン高さ、Y オフセット、ルビ下端を渡す
    if (state.blockRangeSpanHeight !== undefined) {
      lctx = {
        ...lctx,
        rangeRubySpanHeight: state.blockRangeSpanHeight,
        rangeRubyYOffset: state.blockRangeRubyYOffset,
        ...(state.blockRangeRubyEndY !== undefined
          ? { rangeRubyEndY: state.blockRangeRubyEndY }
          : {}),
      };
    }
    const tokenLayout = layoutSingleToken(child, tokenX, tokenY, lctx);
    const contentHeight = computeTokenContentHeight(child.slots, fontSize, rubyFontSize);
    state.yOffset += Math.max(cellAdvance, contentHeight) + state.blockRangeExtraPerToken;
    return { children: [tokenLayout] };
  }

  if (child.type === 'tateten-group') {
    const children = placeTatetenGroup(child.children, state, blockLctx, ctx);
    return { children };
  }

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
  const resultChildren: ColumnChild[] = [];
  const yStart = columnY + state.yOffset;
  for (const highlightChild of child.children) {
    if (highlightChild.type === 'token') {
      const tokenX = blockColumnX + blockBaseCenterX;
      const tokenY = columnY + state.yOffset;
      resultChildren.push(layoutSingleToken(highlightChild, tokenX, tokenY, hlLctx));
      const hlContentHeight = computeTokenContentHeight(
        highlightChild.slots,
        fontSize,
        rubyFontSize
      );
      state.yOffset += Math.max(cellAdvance, hlContentHeight);
    } else {
      // tateten-group inside highlight-group
      resultChildren.push(...placeTatetenGroup(highlightChild.children, state, hlLctx, ctx));
    }
  }
  const yEnd = columnY + state.yOffset;

  // highlight-ref: ラベルを highlight 線の開始位置（上端）に配置
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

  const highlightLine: HighlightLineLayout = {
    style: child.highlightStyle as HighlightStyle,
    x: groupHighlightLineX,
    yStart,
    yEnd,
    ...(refLayout ? { refLayout } : {}),
  };

  return { children: resultChildren, highlightLines: [highlightLine] };
}

/**
 * tateten グループの children を配置し、ColumnChild[] を返す。
 * state.yOffset を直接変更する。
 */
function placeTatetenGroup(
  children: (CanvasTokenNode | CanvasTatetenSeparator)[],
  state: BlockLayoutState,
  baseLctx: LayoutContext,
  ctx: PlacementContext
): ColumnChild[] {
  const {
    fontSize,
    rubyFontSize,
    separatorAdvance,
    grid,
    columnY,
    blockColumnX,
    blockBaseCenterX,
  } = ctx;
  const result: ColumnChild[] = [];

  // tateten グループ内の range ruby は先頭トークンにのみ slots.ruby が設定される。
  // 2文字目以降も ruby 列分の空きを確保するため、グループ内に ruby があれば
  // 全トークンの emphasis を ruby-aware 位置に統一する。
  let lctx = baseLctx;
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
    // naturalHeight: セパレータを含むグループの実際の物理高さ（advance 合計）
    // baseSpanHeight: 最初のベース文字上端〜最後のベース文字下端（ルビ centering 用）
    let naturalHeight = 0;
    let lastTokenContentHeight = fontSize;
    for (const child of children) {
      if (child.type === 'token') {
        lastTokenContentHeight = computeTokenContentHeight(child.slots, fontSize, rubyFontSize);
        naturalHeight += Math.max(fontSize, lastTokenContentHeight);
      } else {
        naturalHeight += separatorAdvance;
      }
    }
    // 最後のトークンの suffix 延伸分（okuri/soegana 等）はルビ centering のスパンに含めない
    const trailingExtension = Math.max(0, lastTokenContentHeight - fontSize);
    const baseSpanHeight = naturalHeight - trailingExtension;
    const rubyTextHeight = [...firstRubyToken.slots.ruby!].length * rubyFontSize;
    if (rubyTextHeight > naturalHeight) {
      const excess = rubyTextHeight - naturalHeight;
      rangeRubySpanHeight = rubyTextHeight;
      // ルビ下端 = グループ開始位置（leading/padding 適用前）+ rubyTextHeight
      rangeRubyEndY = columnY + state.yOffset + rubyTextHeight;
      if (ctx.options.rangeRubyAlignment === 'center') {
        state.yOffset += excess / 2;
        rangeRubyYOffset = -(excess / 2);
        centerBottomPad = excess / 2;
      } else {
        // N+1 ギャップモデル: leading + N elements で均等配分
        extraAdvancePerElement = excess / (children.length + 1);
        state.yOffset += extraAdvancePerElement; // leading
        rangeRubyYOffset = -extraAdvancePerElement;
      }
    } else {
      // non-overflow: ベース文字スパンでセンタリング（suffix 延伸を除く）
      rangeRubySpanHeight = baseSpanHeight;
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
      const tokenY = columnY + state.yOffset;
      result.push(layoutSingleToken(groupChild, tokenX, tokenY, tokenLctx));
      const contentHeight = computeTokenContentHeight(groupChild.slots, fontSize, rubyFontSize);
      state.yOffset += Math.max(fontSize, contentHeight) + extraAdvancePerElement;
    } else {
      // tateten-separator
      const sepX = blockColumnX + blockBaseCenterX;
      const sepY = columnY + state.yOffset;
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
      result.push(sepLayout);
      state.yOffset += separatorAdvance + extraAdvancePerElement;
    }
  }
  // center モード: 末尾パディング
  state.yOffset += centerBottomPad;

  return result;
}

/**
 * ブロック内の子要素を配置し、ColumnLayout を返す。
 */
export function placeBlock(
  block: CanvasBlockNode,
  plan: ColumnPlan,
  options: ResolvedOptions
): ColumnLayout {
  const ctx = buildPlacementContext(plan, options);
  const blockLctx: LayoutContext = {
    fontSize: ctx.fontSize,
    rubyFontSize: ctx.rubyFontSize,
    cellAdvance: ctx.cellAdvance,
    grid: ctx.grid,
    rangeRubyAlign: options.rangeRubyAlign,
  };
  const state = createInitialState();
  const columnChildren: ColumnChild[] = [];
  const highlightLines: HighlightLineLayout[] = [];

  for (let i = 0; i < block.children.length; i++) {
    const child = block.children[i]!;
    if (child.type === 'token' && child.slots.rubySpan && child.slots.rubySpan > 1) {
      detectRangeRubyOverflow(block, i, child, state, ctx);
    } else if (child.type !== 'token') {
      resetRangeRubyState(state);
    }

    const result = placeBlockChild(child, state, blockLctx, ctx);
    columnChildren.push(...result.children);
    if (result.highlightLines) highlightLines.push(...result.highlightLines);

    consumeRangeRuby(child, state);
  }

  return {
    x: ctx.blockColumnX,
    y: ctx.columnY,
    width: ctx.blockColumnWidth,
    height: state.yOffset,
    children: columnChildren,
    ...(highlightLines.length > 0 ? { highlightLines } : {}),
  };
}
