/**
 * Canvas AIR Adapter
 *
 * AIRDocument → CanvasRenderTree 変換。
 * BlockLayoutFlags は AIR のスロット情報から導出する。
 *
 * AIR の入れ子 (ruby、竪点、傍線のグループ) のうち、ruby のグループだけは木に残さない。
 * Canvas は字を 1 つずつ描くので、ruby のグループは最初の字の `slots.ruby` と `slots.rubySpan` に畳み、
 * グループの子はグループの親の子に並べる。竪点と傍線のグループは入れ子のまま残す
 */

import type {
  AIRDocument,
  AIRBlock,
  AIRTokenNode,
  AIRTatetenGroupNode,
  AIRTatetenSeparator,
  AIRHighlightGroupNode,
  AIRRubyGroupNode,
  AIRHiddenSlot,
} from '@kanbun-skam/skam/rendering';

import type {
  CanvasRenderTree,
  CanvasBlockNode,
  CanvasBlockChild,
  CanvasGroupChild,
  CanvasTokenNode,
  CanvasTatetenGroupNode,
  CanvasTatetenSeparator,
  CanvasHighlightGroupNode,
  TokenSlots,
  BlockLayoutFlags,
} from './types.js';

/** AIR の木のノード (ブロックの子と、グループの子の和) */
type AIRNode =
  | AIRTokenNode
  | AIRTatetenSeparator
  | AIRTatetenGroupNode
  | AIRHighlightGroupNode
  | AIRRubyGroupNode;

// ============================================================================
// Token 変換
// ============================================================================

function convertTokenSlots(airNode: AIRTokenNode): TokenSlots {
  // saidoku (全部の形) と emphasisStyle は Canvas の slot に無い。saidoku の第 1・第 2 の形は
  // ruby / okuri / saidokuUnder / saidokuOkuri2 に入っている
  const { saidoku: _saidoku, emphasisStyle: _emphasisStyle, ...slots } = airNode.slots;
  return slots;
}

/** slot を隠す印を、付ける / 外す。ruby のグループの値を置いた先で、隠すかどうかを合わせるために使う */
function setSlotHidden(node: CanvasTokenNode, slot: AIRHiddenSlot, hidden: boolean): void {
  const rest = (node.hiddenSlots ?? []).filter((name) => name !== slot);
  const next = hidden ? [...rest, slot] : rest;
  if (next.length > 0) node.hiddenSlots = next;
  else delete node.hiddenSlots;
}

function convertTokenNode(airNode: AIRTokenNode): CanvasTokenNode {
  const node: CanvasTokenNode = {
    type: 'token',
    token: airNode.token,
    slots: convertTokenSlots(airNode),
  };
  if (airNode.hiddenSlots) node.hiddenSlots = [...airNode.hiddenSlots];
  return node;
}

// ============================================================================
// 木の変換
// ============================================================================

function convertTatetenSeparator(airSep: AIRTatetenSeparator): CanvasTatetenSeparator {
  const sep: CanvasTatetenSeparator = { type: 'tateten-separator' };
  if (airSep.kaeri) sep.kaeri = airSep.kaeri;
  if (airSep.hidden) sep.hidden = true;
  if (airSep.kaeriHidden) sep.kaeriHidden = true;
  return sep;
}

function convertHighlightGroup(airGroup: AIRHighlightGroupNode): CanvasHighlightGroupNode {
  const fragment = airGroup.continuesBefore || airGroup.continuesAfter;
  return {
    type: 'highlight-group',
    highlightStyle: airGroup.highlightStyle,
    ...(airGroup.highlightMark.ref ? { highlightRef: airGroup.highlightMark.ref } : {}),
    ...(airGroup.refLabel ? { refLabel: airGroup.refLabel } : {}),
    children: convertChildren(airGroup.children),
    ...(airGroup.continuesBefore ? { continuesBefore: true as const } : {}),
    ...(airGroup.continuesAfter ? { continuesAfter: true as const } : {}),
    ...(fragment ? { fragmentOf: airGroup.highlightMark } : {}),
  };
}

/** 木を字の順に歩いて、字のノードを集める */
function collectTokens(nodes: readonly CanvasGroupChild[], out: CanvasTokenNode[]): void {
  for (const node of nodes) {
    if (node.type === 'token') out.push(node);
    else if (node.type !== 'tateten-separator') collectTokens(node.children, out);
  }
}

/**
 * ruby のグループを畳む。最初の字に値と字の数を置き、ほかの字の ruby を外す。
 * 再読文字の読みが字の ruby にあっても (`SAIDOKU_READING_OVERLAP`)、範囲の読みを描くので
 * 範囲の中の字の ruby は外す (範囲の読みの上に別の読みを重ねない)
 */
function foldRubyGroup(airGroup: AIRRubyGroupNode, out: CanvasGroupChild[]): void {
  const start = out.length;
  out.push(...convertChildren(airGroup.children));
  const tokens: CanvasTokenNode[] = [];
  collectTokens(out.slice(start), tokens);
  const [first, ...rest] = tokens;
  if (!first) return;

  first.slots = { ...first.slots, ruby: airGroup.yomigana.value, rubySpan: airGroup.span };
  setSlotHidden(first, 'ruby', airGroup.yomigana.hidden === true);
  for (const token of rest) {
    const { ruby: _ruby, rubySpan: _rubySpan, ...slots } = token.slots;
    token.slots = slots;
    setSlotHidden(token, 'ruby', false);
  }
}

function convertChildren(nodes: readonly AIRNode[]): CanvasGroupChild[] {
  const out: CanvasGroupChild[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case 'token':
        out.push(convertTokenNode(node));
        break;
      case 'tateten-separator':
        out.push(convertTatetenSeparator(node));
        break;
      case 'tateten-group':
        out.push({ type: 'tateten-group', children: convertChildren(node.children) });
        break;
      case 'highlight-group':
        out.push(convertHighlightGroup(node));
        break;
      case 'ruby-group':
        foldRubyGroup(node, out);
        break;
    }
  }
  return out;
}

// ============================================================================
// Layout Flags 導出（Q3: AIR に含めない → Adapter で導出）
// ============================================================================

function mergeTokenFlags(node: CanvasTokenNode, flags: BlockLayoutFlags): void {
  const { slots } = node;
  if (
    slots.okuri ||
    slots.soegana ||
    slots.kaeri ||
    slots.kutoten ||
    slots.saidokuUnder ||
    slots.saidokuOkuri2
  ) {
    flags.hasSuffix = true;
  }
  if (slots.saidokuUnder || slots.saidokuOkuri2) {
    flags.hasSaidoku = true;
  }
  if (slots.ruby || slots.okuri || slots.soegana) {
    flags.hasRightColumn = true;
  }
  if (slots.emphasis) {
    flags.hasEmphasis = true;
  }
}

function mergeFlags(nodes: readonly CanvasGroupChild[], flags: BlockLayoutFlags): void {
  for (const node of nodes) {
    if (node.type === 'token') {
      mergeTokenFlags(node, flags);
    } else if (node.type === 'tateten-group') {
      mergeFlags(node.children, flags);
    } else if (node.type === 'highlight-group') {
      flags.hasHighlight = true;
      if (node.refLabel) flags.hasRefLabel = true;
      mergeFlags(node.children, flags);
    }
  }
}

function computeBlockFlags(children: readonly CanvasBlockChild[]): BlockLayoutFlags {
  const flags: BlockLayoutFlags = {
    hasSuffix: false,
    hasSaidoku: false,
    hasRightColumn: false,
    hasEmphasis: false,
    hasHighlight: false,
    hasRefLabel: false,
  };
  mergeFlags(children, flags);
  return flags;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * AIRDocument → CanvasRenderTree
 *
 * AIR の意味解決済みデータを Canvas レンダラーの内部表現に変換する。
 * BlockLayoutFlags は AIR のスロット情報から導出する。
 */
export function convertAIRToCanvasRenderTree(air: AIRDocument): CanvasRenderTree {
  const blockNodes: CanvasBlockNode[] = air.blocks.flatMap((airBlock) => {
    const children = convertChildren(airBlock.children);

    // 改行の注記 (lineBreakAfter) は、ブロックの中を区間に分けて 1 区間を 1 列にする。
    // 区間の間の空きは、ブロックの間の空き (columnGap) と同じ値になる。
    // 区間ごとにフラグを求めるので、改行で分けた区間は、最初からブロックを分けた文書と同じ幅・座標になる
    return splitAtLineBreaks(children, collectLineBreakAfterTokenIds(airBlock)).map((segment) => ({
      type: 'block' as const,
      blockId: airBlock.blockId,
      children: segment,
      flags: computeBlockFlags(segment),
    }));
  });

  // ドキュメント全体のフラグ
  let hasSuffix = false;
  let hasSaidoku = false;
  let hasRightColumn = false;
  let hasEmphasis = false;
  let hasHighlight = false;
  let hasRefLabel = false;
  for (const block of blockNodes) {
    if (block.flags.hasSuffix) hasSuffix = true;
    if (block.flags.hasSaidoku) hasSaidoku = true;
    if (block.flags.hasRightColumn) hasRightColumn = true;
    if (block.flags.hasEmphasis) hasEmphasis = true;
    if (block.flags.hasHighlight) hasHighlight = true;
    if (block.flags.hasRefLabel) hasRefLabel = true;
  }

  return {
    blocks: blockNodes,
    hasSuffix,
    hasSaidoku,
    hasRightColumn,
    hasEmphasis,
    hasHighlight,
    hasRefLabel,
  };
}

// ============================================================================
// 改行 (linebreak): ブロックを区間に分ける
// ============================================================================

/** AIR のノードの中で最後に描く字の id */
function lastTokenIdOfAIR(node: AIRNode): string | undefined {
  if (node.type === 'token') return node.token.id;
  if (node.type === 'tateten-separator') return undefined;
  for (let i = node.children.length - 1; i >= 0; i--) {
    const id = lastTokenIdOfAIR(node.children[i]!);
    if (id !== undefined) return id;
  }
  return undefined;
}

/**
 * AIR の lineBreakAfter から、「この字の後ろで列を改める」字の id を集める。
 * 字の印はその字の後ろ、ruby と竪点のグループの印はグループの最後の字の後ろ。
 */
function collectLineBreakAfterTokenIds(airBlock: AIRBlock): Set<string> {
  const ids = new Set<string>();
  const visit = (nodes: readonly AIRNode[]): void => {
    for (const node of nodes) {
      if (node.type === 'tateten-separator') continue;
      if (node.type !== 'highlight-group' && node.lineBreakAfter) {
        const id = lastTokenIdOfAIR(node);
        if (id !== undefined) ids.add(id);
      }
      if (node.type !== 'token') visit(node.children);
    }
  };
  visit(airBlock.children);
  return ids;
}

interface SegmentAccumulator {
  segments: CanvasGroupChild[][];
  current: CanvasGroupChild[];
}

function cut(acc: SegmentAccumulator): void {
  acc.segments.push(acc.current);
  acc.current = [];
}

/**
 * 子を、改行の後ろで区間に積む。グループの途中で分けるときは、グループを区間ごとの 2 つ以上に分ける
 * (傍線は列ごとに引く)。参照ラベルは傍線の上端に付くので、最初の区間のグループが持つ。
 * 不可分単位の中の改行は AIR が付けないので、竪点のグループが分かれることは通常ない
 */
function accumulate(
  nodes: readonly CanvasGroupChild[],
  breakAfter: ReadonlySet<string>,
  acc: SegmentAccumulator
): void {
  for (const node of nodes) {
    if (node.type === 'token') {
      acc.current.push(node);
      if (breakAfter.has(node.token.id)) cut(acc);
      continue;
    }
    if (node.type === 'tateten-separator') {
      acc.current.push(node);
      continue;
    }

    const inner: SegmentAccumulator = { segments: [], current: [] };
    accumulate(node.children, breakAfter, inner);
    const endsWithCut = inner.current.length === 0 && inner.segments.length > 0;
    const parts = inner.current.length > 0 ? [...inner.segments, inner.current] : inner.segments;
    if (parts.length <= 1) {
      acc.current.push(node);
    } else {
      parts.forEach((part, i) => {
        acc.current.push(splitCopy(node, part, i === 0));
        if (i < parts.length - 1) cut(acc);
      });
    }
    if (endsWithCut) cut(acc);
  }
}

/** グループを、子を差し替えた 1 つの区間のコピーにする。参照ラベルは最初の区間だけが持つ */
function splitCopy(
  node: CanvasTatetenGroupNode | CanvasHighlightGroupNode,
  children: CanvasGroupChild[],
  isFirstPart: boolean
): CanvasTatetenGroupNode | CanvasHighlightGroupNode {
  if (node.type === 'tateten-group') return { ...node, children };
  const { highlightRef, refLabel, ...rest } = node;
  return {
    ...rest,
    ...(isFirstPart && highlightRef ? { highlightRef } : {}),
    ...(isFirstPart && refLabel ? { refLabel } : {}),
    children,
  };
}

/** ブロックの子を、改行の後ろで区間に分ける。改行が無ければ元の子の並びを 1 区間で返す */
function splitAtLineBreaks(
  children: CanvasBlockChild[],
  breakAfter: ReadonlySet<string>
): CanvasBlockChild[][] {
  if (breakAfter.size === 0) return [children];

  const acc: SegmentAccumulator = { segments: [], current: [] };
  accumulate(children, breakAfter, acc);
  if (acc.current.length > 0) acc.segments.push(acc.current);
  return acc.segments;
}
