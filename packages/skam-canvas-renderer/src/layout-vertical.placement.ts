/**
 * Placement レイヤ — ブロック内の子要素を配置
 *
 * token/tateten-group/highlight-group (入れ子を含む) の配置ロジックを統合し、
 * 共通の Y 進行・token 配置ルーチンを提供する。
 * 木は字・区切り・グループの出入りの並び (PlacementOp) にして、1 回の走査で配置する。
 * ruby の範囲 (rubySpan) は、並びの上で字を数えるので、竪点や傍線をまたいでもよい。
 */

import type { HighlightStyle } from '@kanbun-skam/skam';
import { splitGraphemes } from '@kanbun-skam/skam';
import { resolveSpacingEm } from '@kanbun-skam/skam/rendering';
import type {
  CanvasTokenNode,
  CanvasTatetenSeparator,
  CanvasGroupChild,
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
  OkototenLayout,
} from './types.js';
import { shouldApplyTateChuYoko } from './draw-text.js';
import { highlightLanePitch } from './draw-marks.js';

/** ruby の範囲 (rubySpan) を配置している間の状態 */
interface RubyRun {
  /** 範囲の残りの字の数 (いま置く字を含む) */
  remaining: number;
  /** 範囲の字と区切りに足す余白 (distribute) */
  extraPerElement: number;
  /** 範囲の後ろに足す余白 (center) */
  bottomPad: number;
  /** 読みを中央に寄せるための範囲の高さ */
  spanHeight: number;
  rubyYOffset: number;
  /** 読みがあふれたときの、読みの下端の絶対 Y */
  endY: number | undefined;
}

/** 可変追跡状態 */
interface BlockLayoutState {
  yOffset: number;
  run: RubyRun | undefined;
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
  return { yOffset: 0, run: undefined };
}

function buildPlacementContext(plan: ColumnPlan, options: ResolvedOptions): PlacementContext {
  const { fontSize } = options;
  const rubyFontSize = Math.round(fontSize * options.rubyRatio);
  const highlightGap = 2;
  const columnY = options.padding.top;
  const blockColumnX = plan.x;
  const { columnWidth: blockColumnWidth, baseCenterX: blockBaseCenterX } = plan.dimensions;

  const spacingPx = resolveSpacingEm(options.spacing) * fontSize;
  return {
    fontSize,
    rubyFontSize,
    cellAdvance: fontSize + spacingPx,
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

/** ヲコト点の半径 / fontSize (HTML の 0.3em フォントの「・」に相当する大きさ) */
const OKOTOTEN_RADIUS_RATIO = 0.08;

/**
 * okototen: HTML の CSS と同じ式で、ベース文字の em ボックス (左上 = tokenX - fontSize / 2, tokenY) 内の格子点に置く。
 */
function layoutOkototen(
  cells: TokenSlots['okototen'],
  tokenX: number,
  tokenY: number,
  fontSize: number
): OkototenLayout[] | undefined {
  if (!cells || cells.length === 0) return undefined;
  return cells.map((cell) => ({
    cx: tokenX - fontSize / 2 + (cell.x / cell.cols) * fontSize,
    cy: tokenY + (cell.y / cell.rows) * fontSize,
    r: fontSize * OKOTOTEN_RADIUS_RATIO,
    shape: cell.shape,
    ...(cell.hidden ? { hidden: true as const } : {}),
  }));
}

/**
 * 単一トークンのスロットレイアウトを計算。
 * hasSuffix の分岐は GridColumns に吸収済み。
 */
// oxlint-disable-next-line eslint/complexity
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
      const numChars = splitGraphemes(slots.ruby).length;
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
  const rubyCharsForSuffix = slots.ruby ? splitGraphemes(slots.ruby).length : 0;
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
    const okuriChars = slots.okuri ? splitGraphemes(slots.okuri).length : 0;
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
    const underChars = slots.saidokuUnder ? splitGraphemes(slots.saidokuUnder).length : 0;
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
    const refHeight = isTCY ? rubyFontSize : splitGraphemes(slots.ref).length * rubyFontSize;
    slotLayouts.ref = {
      text: slots.ref,
      x: tokenX,
      y: tokenY - refHeight,
      fontSize: rubyFontSize,
      ...(isTCY ? { tateChuYoko: true } : {}),
    };
  }

  const okototen = layoutOkototen(slots.okototen, tokenX, tokenY, fontSize);

  return {
    type: 'token' as const,
    tokenId: tokenNode.token.id,
    x: tokenX,
    y: tokenY,
    baseChar: tokenNode.token.text,
    slots: slotLayouts,
    ...(tokenNode.hiddenSlots && tokenNode.hiddenSlots.length > 0
      ? { hiddenSlots: tokenNode.hiddenSlots }
      : {}),
    ...(okototen ? { okototen } : {}),
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
    slots.rubySpan && slots.rubySpan > 1 ? 0 : slots.ruby ? splitGraphemes(slots.ruby).length : 0;
  const okuriChars = slots.okuri ? splitGraphemes(slots.okuri).length : 0;
  const soeganaChars = slots.soegana ? splitGraphemes(slots.soegana).length : 0;
  const saidokuUnderChars = slots.saidokuUnder ? splitGraphemes(slots.saidokuUnder).length : 0;
  const saidokuOkuri2Chars = slots.saidokuOkuri2 ? splitGraphemes(slots.saidokuOkuri2).length : 0;

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

/**
 * range ruby が自然な高さを超える場合の余白の計算（block と tateten で共有する純関数）。
 * center: 超過分の半分を前後に振る。distribute: N+1 ギャップモデル（leading + N 要素）で均等配分する。
 */
export function computeRangeRubyOverflow(input: {
  rubyChars: number;
  rubyFontSize: number;
  naturalSpan: number;
  baseSpan: number;
  elementCount: number;
  alignment: 'center' | 'distribute';
}): {
  overflow: boolean;
  spanHeight: number;
  rubyEndOffset: number | undefined;
  leading: number;
  rubyYOffset: number;
  trailing: number;
  extraPerElement: number;
} {
  const { rubyChars, rubyFontSize, naturalSpan, baseSpan, elementCount, alignment } = input;
  const rubyTextHeight = rubyChars * rubyFontSize;
  if (!(rubyTextHeight > naturalSpan)) {
    // non-overflow: ベース文字スパンでセンタリング（suffix 延伸を除く）
    return {
      overflow: false,
      spanHeight: baseSpan,
      rubyEndOffset: undefined,
      leading: 0,
      rubyYOffset: 0,
      trailing: 0,
      extraPerElement: 0,
    };
  }
  const excess = rubyTextHeight - naturalSpan;
  if (alignment === 'center') {
    return {
      overflow: true,
      spanHeight: rubyTextHeight,
      rubyEndOffset: rubyTextHeight,
      leading: excess / 2,
      rubyYOffset: -(excess / 2),
      trailing: excess / 2,
      extraPerElement: 0,
    };
  }
  const extraPerElement = excess / (elementCount + 1);
  return {
    overflow: true,
    spanHeight: rubyTextHeight,
    rubyEndOffset: rubyTextHeight,
    leading: extraPerElement,
    rubyYOffset: -extraPerElement,
    trailing: 0,
    extraPerElement,
  };
}
// ============================================================================
// 木 → 配置の並び
// ============================================================================

/** 木を歩いた並び。配置は、この並びを先頭から 1 回走査して決める */
type PlacementOp =
  | {
      kind: 'token';
      node: CanvasTokenNode;
      /** 竪点のグループの中 (字の高さは fontSize を下限にする) */
      inTateten: boolean;
      /** 傍線のグループの中 */
      inHighlight: boolean;
      /** 傍点の x。傍線の外側か、ruby のある竪点の ruby の右側。無ければ字の位置から決める */
      emphasisOverrideX: number | undefined;
    }
  | { kind: 'separator'; node: CanvasTatetenSeparator }
  /** 竪点のグループの終わり。グループの後ろに字間の余白を足す */
  | { kind: 'tateten-exit' }
  | { kind: 'highlight-enter' }
  | { kind: 'highlight-exit'; node: CanvasHighlightGroupNode; lineX: number };

interface FlattenEnv {
  inTateten: boolean;
  inHighlight: boolean;
  emphasisOverrideX: number | undefined;
}

function someToken(
  nodes: readonly CanvasGroupChild[],
  predicate: (token: CanvasTokenNode) => boolean
): boolean {
  return nodes.some((node) => {
    if (node.type === 'token') return predicate(node);
    if (node.type === 'tateten-separator') return false;
    return someToken(node.children, predicate);
  });
}

/** highlight-group 内の仮名類（ruby/okuri/soegana）の有無を判定 */
function checkGroupHasRightColumn(group: CanvasHighlightGroupNode): boolean {
  return someToken(group.children, ({ slots }) => !!(slots.ruby || slots.okuri || slots.soegana));
}

function flatten(
  nodes: readonly CanvasGroupChild[],
  env: FlattenEnv,
  ctx: PlacementContext,
  ops: PlacementOp[]
): void {
  for (const node of nodes) {
    if (node.type === 'token') {
      ops.push({
        kind: 'token',
        node,
        inTateten: env.inTateten,
        inHighlight: env.inHighlight,
        emphasisOverrideX: env.emphasisOverrideX,
      });
    } else if (node.type === 'tateten-separator') {
      ops.push({ kind: 'separator', node });
    } else if (node.type === 'tateten-group') {
      // tateten グループ内の range ruby は先頭トークンにのみ slots.ruby が設定される。
      // 2文字目以降も ruby 列分の空きを確保するため、グループ内に ruby があれば
      // 全トークンの emphasis を ruby-aware 位置に統一する。
      const emphasisOverrideX =
        env.emphasisOverrideX ??
        (someToken(node.children, (token) => !!token.slots.ruby)
          ? ctx.grid.suffixX + ctx.rubyFontSize
          : undefined);
      flatten(node.children, { ...env, inTateten: true, emphasisOverrideX }, ctx, ops);
      ops.push({ kind: 'tateten-exit' });
    } else {
      const { effectiveFlags, effectiveMaxRubyWidth, rubyFontSize, highlightLineX, highlightGap } =
        ctx;
      const groupHasRightColumn = checkGroupHasRightColumn(node);
      let rightAdjust = 0;
      if (effectiveFlags.hasSuffix && effectiveFlags.hasRightColumn && !groupHasRightColumn) {
        rightAdjust = rubyFontSize;
      } else if (!effectiveFlags.hasSuffix && effectiveMaxRubyWidth > 0 && !groupHasRightColumn) {
        rightAdjust = effectiveMaxRubyWidth;
      }
      const lineX =
        highlightLineX - rightAdjust + (node.lane ?? 0) * highlightLanePitch(highlightGap);
      ops.push({ kind: 'highlight-enter' });
      // ADR-015: emphasis+highlight 共存時、emphasis を highlight line の外側（右）に配置
      flatten(
        node.children,
        {
          ...env,
          inHighlight: true,
          emphasisOverrideX: lineX + highlightGap / 2 + rubyFontSize / 2,
        },
        ctx,
        ops
      );
      ops.push({ kind: 'highlight-exit', node, lineX });
    }
  }
}

// ============================================================================
// 配置
// ============================================================================

function tokenAdvance(op: PlacementOp & { kind: 'token' }, ctx: PlacementContext): number {
  const contentHeight = computeTokenContentHeight(op.node.slots, ctx.fontSize, ctx.rubyFontSize);
  return Math.max(op.inTateten ? ctx.fontSize : ctx.cellAdvance, contentHeight);
}

/**
 * ruby の範囲 (rubySpan) の字から始まる走りを作る。範囲の字と区切りの高さを先読みして、
 * 読みがあふれるときの余白を決める。あふれるときは先頭の余白を state.yOffset に足す。
 */
function startRubyRun(
  ops: readonly PlacementOp[],
  index: number,
  state: BlockLayoutState,
  ctx: PlacementContext
): RubyRun {
  const { fontSize, rubyFontSize, columnY } = ctx;
  const first = ops[index] as PlacementOp & { kind: 'token' };
  const span = first.node.slots.rubySpan!;
  const spacingPx = ctx.cellAdvance - ctx.fontSize;

  // 先読み: 範囲の字の実際の advance と、範囲の途中の区切りと竪点のグループの後ろの余白を合計
  let naturalSpan = 0;
  let elementCount = 0;
  let counted = 0;
  let lastTokenContentHeight = fontSize;
  for (let j = index; j < ops.length && counted < span; j++) {
    const op = ops[j]!;
    if (op.kind === 'token') {
      lastTokenContentHeight = computeTokenContentHeight(op.node.slots, fontSize, rubyFontSize);
      naturalSpan += tokenAdvance(op, ctx);
      elementCount++;
      counted++;
    } else if (op.kind === 'separator') {
      naturalSpan += ctx.separatorAdvance;
      elementCount++;
    } else if (op.kind === 'tateten-exit' && spacingPx > 0) {
      naturalSpan += spacingPx;
    }
  }
  // 最後のトークンの suffix 延伸分（okuri/soegana 等）はルビ centering のスパンに含めない
  const trailingExtension = Math.max(0, lastTokenContentHeight - fontSize);
  const baseSpan = naturalSpan - trailingExtension;

  // range ruby overflow: ルビがスパンを超える場合の均等割り付け/中央寄せを計算
  const alignment = ctx.options.rangeRubyAlignment === 'center' ? 'center' : 'distribute';
  const result = computeRangeRubyOverflow({
    rubyChars: splitGraphemes(first.node.slots.ruby!).length,
    rubyFontSize,
    naturalSpan,
    baseSpan,
    elementCount,
    alignment,
  });
  const run: RubyRun = {
    remaining: span,
    extraPerElement: result.extraPerElement,
    bottomPad: result.trailing,
    spanHeight: result.spanHeight,
    rubyYOffset: result.overflow ? result.rubyYOffset : 0,
    // ルビ下端 = スパン開始位置（leading/padding 適用前）+ rubyTextHeight
    endY: result.overflow ? columnY + state.yOffset + result.rubyEndOffset! : undefined,
  };
  if (result.overflow) state.yOffset += result.leading;
  return run;
}

interface HighlightEntry {
  node: CanvasHighlightGroupNode;
  line: HighlightLineLayout;
}

/**
 * 断片に分かれた傍線は、続きの側の端を閉じず、隣の断片の始まりまで線をつなぐ。
 * 断片の間に区切りや余白があっても、線は切れない
 */
function joinHighlightFragments(entries: readonly HighlightEntry[]): void {
  const byMark = new Map<unknown, HighlightEntry[]>();
  for (const entry of entries) {
    const mark = entry.node.fragmentOf;
    if (!mark) continue;
    const list = byMark.get(mark) ?? [];
    list.push(entry);
    byMark.set(mark, list);
  }
  for (const list of byMark.values()) {
    list.sort((a, b) => a.line.yStart - b.line.yStart);
    for (let i = 0; i + 1 < list.length; i++) {
      const [current, next] = [list[i]!, list[i + 1]!];
      if (current.node.continuesAfter && next.node.continuesBefore) {
        current.line.yEnd = Math.max(current.line.yEnd, next.line.yStart);
      }
    }
  }
}

type TokenOp = PlacementOp & { kind: 'token' };

/** 字を置き、Y を進める。ruby の範囲の先頭ならあふれの余白を決め、範囲の最後の字で閉じる */
function placeTokenOp(
  ops: readonly PlacementOp[],
  index: number,
  state: BlockLayoutState,
  blockLctx: LayoutContext,
  ctx: PlacementContext
): TokenLayout {
  const op = ops[index] as TokenOp;
  // 傍線の中の ruby の範囲 (竪点の外) は、読みのあふれを扱わない。範囲の読みの高さは字の数 × cellAdvance。
  // 今までの描画の命令を変えないために、この扱いを保つ
  const isRangeRubyStart = op.node.slots.ruby && (op.node.slots.rubySpan ?? 0) > 1;
  if (isRangeRubyStart && (!op.inHighlight || op.inTateten)) {
    state.run = startRubyRun(ops, index, state, ctx);
  }
  const run = state.run;
  const tokenX = ctx.blockColumnX + ctx.blockBaseCenterX;
  const tokenY = ctx.columnY + state.yOffset;
  // range ruby の2文字目以降: ruby 列分の空きを確保するため emphasis を右にずらす
  const emphasisOverrideX =
    op.emphasisOverrideX ??
    (run && !op.node.slots.ruby ? ctx.grid.suffixX + ctx.rubyFontSize : undefined);
  // range ruby overflow 時はルビ centering 用のスパン高さ、Y オフセット、ルビ下端を渡す
  const lctx: LayoutContext = {
    ...blockLctx,
    ...(emphasisOverrideX !== undefined ? { emphasisOverrideX } : {}),
    ...(run
      ? {
          rangeRubySpanHeight: run.spanHeight,
          rangeRubyYOffset: run.rubyYOffset,
          ...(run.endY !== undefined ? { rangeRubyEndY: run.endY } : {}),
        }
      : {}),
  };
  const layoutOfToken = layoutSingleToken(op.node, tokenX, tokenY, lctx);
  state.yOffset += tokenAdvance(op, ctx) + (run?.extraPerElement ?? 0);
  if (run && --run.remaining <= 0) {
    // center モード: 範囲の末尾パディング
    state.yOffset += run.bottomPad;
    state.run = undefined;
  }
  return layoutOfToken;
}

/** 竪点の区切りを置き、Y を進める */
function placeSeparatorOp(
  node: CanvasTatetenSeparator,
  state: BlockLayoutState,
  ctx: PlacementContext
): TatetenSeparatorLayout {
  const { rubyFontSize } = ctx;
  // HTML の letter-spacing に相当するスペーシング量。
  // HTML では sep の negative margin で前トークンの LS を潰した上で、
  // sep 高さ = max(1em, LS) で間隔を確保する
  const spacingPx = ctx.cellAdvance - ctx.fontSize;
  const effectiveSepAdvance = Math.max(ctx.separatorAdvance, spacingPx);
  // spacing が大きい場合、separator を advance 領域の中央に配置する
  const sepCenterOffset = (effectiveSepAdvance - rubyFontSize) / 2;
  const sepY = ctx.columnY + state.yOffset + sepCenterOffset;
  const sepLayout: TatetenSeparatorLayout = {
    type: 'tateten-separator',
    x: ctx.blockColumnX + ctx.blockBaseCenterX,
    y: sepY,
    fontSize: rubyFontSize,
    ...(node.hidden ? { hidden: true as const } : {}),
    ...(node.kaeriHidden ? { kaeriHidden: true as const } : {}),
  };
  if (node.kaeri) {
    sepLayout.kaeri = { text: node.kaeri, x: ctx.grid.kaeriX, y: sepY, fontSize: rubyFontSize };
  }
  state.yOffset += effectiveSepAdvance + (state.run?.extraPerElement ?? 0);
  return sepLayout;
}

/** 傍線の線 (と参照ラベル) の配置。ラベルは線の始まり (上端) に置く */
function layoutHighlightLine(
  node: CanvasHighlightGroupNode,
  lineX: number,
  yStart: number,
  yEnd: number,
  rubyFontSize: number
): HighlightLineLayout {
  let refLayout: SlotLayout | undefined;
  if (node.refLabel) {
    const isTCY = shouldApplyTateChuYoko(node.refLabel);
    refLayout = {
      text: node.refLabel,
      x: lineX + (rubyFontSize * 7) / 8,
      y: yStart,
      fontSize: rubyFontSize,
      ...(isTCY ? { tateChuYoko: true } : {}),
    };
  }
  return {
    style: node.highlightStyle as HighlightStyle,
    x: lineX,
    yStart,
    yEnd,
    ...(refLayout ? { refLayout } : {}),
  };
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
  const highlightEntries: HighlightEntry[] = [];
  const highlightStarts: number[] = [];

  const ops: PlacementOp[] = [];
  flatten(
    block.children,
    { inTateten: false, inHighlight: false, emphasisOverrideX: undefined },
    ctx,
    ops
  );

  // HTML では最後のトークンの letter-spacing がグループと次の要素の間にギャップを作る
  const groupTrailingSpacing = ctx.cellAdvance - ctx.fontSize;

  ops.forEach((op, index) => {
    switch (op.kind) {
      case 'token':
        columnChildren.push(placeTokenOp(ops, index, state, blockLctx, ctx));
        break;
      case 'separator':
        columnChildren.push(placeSeparatorOp(op.node, state, ctx));
        break;
      case 'tateten-exit':
        // tateten グループ後のスペーシング
        if (groupTrailingSpacing > 0) state.yOffset += groupTrailingSpacing;
        break;
      case 'highlight-enter':
        highlightStarts.push(ctx.columnY + state.yOffset);
        break;
      case 'highlight-exit': {
        const yStart = highlightStarts.pop()!;
        const yEnd = ctx.columnY + state.yOffset;
        highlightEntries.push({
          node: op.node,
          line: layoutHighlightLine(op.node, op.lineX, yStart, yEnd, ctx.rubyFontSize),
        });
        break;
      }
    }
  });

  joinHighlightFragments(highlightEntries);
  const highlightLines = highlightEntries.map((entry) => entry.line);

  return {
    x: ctx.blockColumnX,
    y: ctx.columnY,
    width: ctx.blockColumnWidth,
    height: state.yOffset,
    children: columnChildren,
    ...(highlightLines.length > 0 ? { highlightLines } : {}),
  };
}
