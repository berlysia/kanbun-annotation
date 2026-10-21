/**
 * Canvas AIR Adapter
 *
 * AIRDocument → CanvasRenderTree 変換。
 * BlockLayoutFlags は AIR のスロット情報から導出する。
 */

import type {
  AIRDocument,
  AIRBlock,
  AIRBlockChild,
  AIRTokenNode,
  AIRTatetenGroupNode,
  AIRTatetenSeparator,
  AIRHighlightGroupNode,
  AIRHiddenSlot,
  AIRRangeInfo,
} from '@kanbun-skam/skam/rendering';

import type {
  CanvasRenderTree,
  CanvasBlockNode,
  CanvasBlockChild,
  CanvasTokenNode,
  CanvasTatetenGroupNode,
  CanvasTatetenSeparator,
  CanvasHighlightGroupNode,
  TokenSlots,
  BlockLayoutFlags,
} from './types.js';

// ============================================================================
// Token 変換
// ============================================================================

function convertTokenSlots(airNode: AIRTokenNode): TokenSlots {
  const slots: TokenSlots = { ...airNode.slots };

  // range info がある場合、先頭トークンに yomigana の span を設定
  if (airNode.rangeInfo?.yomigana) {
    slots.ruby = airNode.rangeInfo.yomigana.value;
    slots.rubySpan = airNode.rangeInfo.yomigana.span;
  }

  // range okurigana: last concentration → Canvas では okuri を先頭トークンに集約せず
  // AIR は先頭トークンに rangeInfo を持つが、Canvas は last concentration なので
  // Adapter で調整が必要
  // → 実際には Canvas の applyRangeConcentration が先頭/末尾を切り替えるが、
  //   AIR からの変換では rangeInfo の値をそのまま使う
  if (airNode.rangeInfo?.okurigana) {
    slots.okuri = airNode.rangeInfo.okurigana.value;
  }
  if (airNode.rangeInfo?.soegana) {
    slots.soegana = airNode.rangeInfo.soegana.value;
  }

  return slots;
}

/** slot を隠す印を、付ける / 外す。範囲の値を動かした先で、隠すかどうかを合わせるために使う */
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
  // 範囲の値を置く字は、範囲の注記の印で隠すかを決める
  if (airNode.rangeInfo?.yomigana) setSlotHidden(node, 'ruby', !!airNode.rangeInfo.yomigana.hidden);
  return node;
}

// ============================================================================
// Tateten 変換
// ============================================================================

function convertTatetenSeparator(
  airSep: AIRTatetenSeparator,
  groupHidden: boolean
): CanvasTatetenSeparator {
  const sep: CanvasTatetenSeparator = { type: 'tateten-separator' };
  if (airSep.kaeri) {
    sep.kaeri = airSep.kaeri;
  }
  if (groupHidden) sep.hidden = true;
  if (airSep.kaeriHidden) sep.kaeriHidden = true;
  return sep;
}

function convertTatetenGroup(airGroup: AIRTatetenGroupNode): CanvasTatetenGroupNode {
  const children: (CanvasTokenNode | CanvasTatetenSeparator)[] = airGroup.children.map((child) =>
    child.type === 'token'
      ? convertTokenNode(child)
      : convertTatetenSeparator(child, airGroup.hidden === true)
  );

  // tateten + range 重複時: rangeInfo を先頭トークンに適用
  if (airGroup.rangeInfo) {
    applyRangeInfoToTokens(children, airGroup.rangeInfo);
  }

  return { type: 'tateten-group', children };
}

// ============================================================================
// Highlight 変換
// ============================================================================

function convertHighlightGroup(airGroup: AIRHighlightGroupNode): CanvasHighlightGroupNode {
  const children: (CanvasTokenNode | CanvasTatetenGroupNode)[] = airGroup.children.map((child) =>
    child.type === 'token' ? convertTokenNode(child) : convertTatetenGroup(child)
  );

  const hlGroup: CanvasHighlightGroupNode = {
    type: 'highlight-group',
    highlightStyle: airGroup.highlightStyle,
    ...(airGroup.highlightMark.ref ? { highlightRef: airGroup.highlightMark.ref } : {}),
    ...(airGroup.refLabel ? { refLabel: airGroup.refLabel } : {}),
    children,
  };

  return hlGroup;
}

// ============================================================================
// Range info → Canvas tokens の変換ヘルパー
// ============================================================================

/**
 * rangeInfo の yomigana/okurigana/soegana を Canvas トークンに適用。
 * Canvas の concentration ルール:
 * - yomigana: first concentration（先頭トークンに ruby + rubySpan）
 * - okurigana/soegana: last concentration（末尾トークンに okuri/soegana）
 */
function applyRangeInfoToTokens(
  children: (CanvasTokenNode | CanvasTatetenSeparator)[],
  rangeInfo: AIRRangeInfo
): void {
  const tokenNodes = children.filter((c): c is CanvasTokenNode => c.type === 'token');
  if (tokenNodes.length === 0) return;

  const firstToken = tokenNodes[0]!;
  const lastToken = tokenNodes[tokenNodes.length - 1]!;

  // yomigana: first concentration
  if (rangeInfo.yomigana) {
    firstToken.slots = {
      ...firstToken.slots,
      ruby: rangeInfo.yomigana.value,
      rubySpan: rangeInfo.yomigana.span,
    };
    setSlotHidden(firstToken, 'ruby', !!rangeInfo.yomigana.hidden);
    // 後続トークンの ruby をクリア
    for (const t of tokenNodes.slice(1)) {
      const { ruby: _, rubySpan: __, ...rest } = t.slots;
      t.slots = rest;
      setSlotHidden(t, 'ruby', false);
    }
  }

  // okurigana: last concentration
  if (rangeInfo.okurigana) {
    lastToken.slots = { ...lastToken.slots, okuri: rangeInfo.okurigana.value };
    setSlotHidden(lastToken, 'okuri', !!rangeInfo.okurigana.hidden);
    // 先行トークンの okuri をクリア
    for (const t of tokenNodes.slice(0, -1)) {
      const { okuri: _, ...rest } = t.slots;
      t.slots = rest;
      setSlotHidden(t, 'okuri', false);
    }
  }

  // soegana: last concentration
  if (rangeInfo.soegana) {
    lastToken.slots = { ...lastToken.slots, soegana: rangeInfo.soegana.value };
    setSlotHidden(lastToken, 'soegana', !!rangeInfo.soegana.hidden);
    for (const t of tokenNodes.slice(0, -1)) {
      const { soegana: _, ...rest } = t.slots;
      t.slots = rest;
      setSlotHidden(t, 'soegana', false);
    }
  }
}

// ============================================================================
// Block 変換
// ============================================================================

function convertBlockChild(airChild: AIRBlockChild): CanvasBlockChild {
  switch (airChild.type) {
    case 'token':
      return convertTokenNode(airChild);
    case 'tateten-group':
      return convertTatetenGroup(airChild);
    case 'highlight-group':
      return convertHighlightGroup(airChild);
  }
}

// ============================================================================
// Layout Flags 導出（Q3: AIR に含めない → Adapter で導出）
// ============================================================================

interface LayoutFlags {
  hasSuffix: boolean;
  hasSaidoku: boolean;
  hasRightColumn: boolean;
  hasEmphasis: boolean;
}

function mergeTokenFlags(node: CanvasTokenNode, flags: LayoutFlags): void {
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

function checkLayoutFlags(child: CanvasBlockChild): LayoutFlags {
  const flags: LayoutFlags = {
    hasSuffix: false,
    hasSaidoku: false,
    hasRightColumn: false,
    hasEmphasis: false,
  };
  if (child.type === 'token') {
    mergeTokenFlags(child, flags);
  } else if (child.type === 'tateten-group') {
    for (const c of child.children) {
      if (c.type === 'token') mergeTokenFlags(c, flags);
    }
  } else {
    for (const c of child.children) {
      if (c.type === 'token') {
        mergeTokenFlags(c, flags);
      } else {
        for (const tc of c.children) {
          if (tc.type === 'token') mergeTokenFlags(tc, flags);
        }
      }
    }
  }
  return flags;
}

function computeBlockFlags(children: CanvasBlockChild[]): BlockLayoutFlags {
  let hasSuffix = false;
  let hasSaidoku = false;
  let hasRightColumn = false;
  let hasEmphasis = false;
  let hasHighlight = false;
  let hasRefLabel = false;

  for (const child of children) {
    const flags = checkLayoutFlags(child);
    if (flags.hasSuffix) hasSuffix = true;
    if (flags.hasSaidoku) hasSaidoku = true;
    if (flags.hasRightColumn) hasRightColumn = true;
    if (flags.hasEmphasis) hasEmphasis = true;
    if (child.type === 'highlight-group') {
      hasHighlight = true;
      if (child.refLabel) hasRefLabel = true;
    }
  }

  return { hasSuffix, hasSaidoku, hasRightColumn, hasEmphasis, hasHighlight, hasRefLabel };
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
    const children: CanvasBlockChild[] = airBlock.children.map(convertBlockChild);

    // Range info が non-tateten トークンにある場合の concentration 適用
    applyNonTatetenRangeConcentration(airBlock, children);

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

/**
 * AIR の lineBreakAfter から、「この字の後ろで列を改める」字の id を集める。
 * 読みの範囲の印は範囲を描く先頭の字に付いているが、Canvas は字を 1 つずつ描くので、
 * 範囲の最後の字の後ろで改める。竪点のグループの印はグループの最後の字の後ろ。
 */
function collectLineBreakAfterTokenIds(airBlock: AIRBlock): Set<string> {
  const ids = new Set<string>();
  const visit = (node: AIRTokenNode | AIRTatetenGroupNode): void => {
    if (!node.lineBreakAfter) return;
    if (node.type === 'token') {
      ids.add(node.rangeInfo?.toTokenId ?? node.token.id);
      return;
    }
    const lastToken = node.children.findLast((c): c is AIRTokenNode => c.type === 'token');
    if (lastToken) ids.add(lastToken.token.id);
  };
  for (const child of airBlock.children) {
    if (child.type === 'highlight-group') child.children.forEach(visit);
    else visit(child);
  }
  return ids;
}

/** 子の中で最後に描く字の id */
function lastTokenIdOf(child: CanvasTokenNode | CanvasTatetenGroupNode): string | undefined {
  if (child.type === 'token') return child.token.id;
  return child.children.findLast((c): c is CanvasTokenNode => c.type === 'token')?.token.id;
}

/**
 * ブロックの子を、改行の後ろで区間に分ける。改行が無ければ元の子の並びを 1 区間で返す。
 * highlight-group の途中で分けるときは、グループを 2 つに分ける (傍線は列ごとに引く)。
 * 参照ラベルは傍線の上端に付くので、前の区間のグループが持つ。
 */
function splitAtLineBreaks(
  children: CanvasBlockChild[],
  breakAfter: ReadonlySet<string>
): CanvasBlockChild[][] {
  if (breakAfter.size === 0) return [children];

  const segments: CanvasBlockChild[][] = [];
  let current: CanvasBlockChild[] = [];
  const cut = (): void => {
    segments.push(current);
    current = [];
  };

  for (const child of children) {
    if (child.type !== 'highlight-group') {
      current.push(child);
      const last = lastTokenIdOf(child);
      if (last !== undefined && breakAfter.has(last)) cut();
      continue;
    }

    let part: (CanvasTokenNode | CanvasTatetenGroupNode)[] = [];
    let isFirstPart = true;
    const flush = (): void => {
      const { highlightRef, refLabel, ...rest } = child;
      current.push({
        ...rest,
        ...(isFirstPart && highlightRef ? { highlightRef } : {}),
        ...(isFirstPart && refLabel ? { refLabel } : {}),
        children: part,
      });
      part = [];
      isFirstPart = false;
    };
    child.children.forEach((hlChild) => {
      part.push(hlChild);
      const last = lastTokenIdOf(hlChild);
      if (last === undefined || !breakAfter.has(last)) return;
      // 最後の子の後ろなら、flush した 1 つ目が group 全体になり、group の後ろで切ることになる
      flush();
      cut();
    });
    if (part.length > 0) flush();
  }

  if (current.length > 0) segments.push(current);
  return segments;
}

/**
 * non-tateten トークンの rangeInfo に対して Canvas の concentration ルールを適用。
 * AIR では先頭トークンに rangeInfo があるが、Canvas では:
 * - yomigana: first concentration（先頭に値設定）
 * - okurigana/soegana: last concentration（末尾に値設定）
 */
function applyNonTatetenRangeConcentration(
  airBlock: AIRBlock,
  canvasChildren: CanvasBlockChild[]
): void {
  // AIR の rangeInfo を持つトークンを探し、対応する Canvas トークンに concentration を適用
  for (const airChild of airBlock.children) {
    if (airChild.type !== 'token' || !airChild.rangeInfo) continue;

    const rangeInfo = airChild.rangeInfo;
    const tokenIds = rangeInfo.tokenIds;

    // Canvas children からフラットなトークンリストを収集
    const canvasTokens: CanvasTokenNode[] = [];
    for (const cc of canvasChildren) {
      if (cc.type === 'token' && tokenIds.includes(cc.token.id)) {
        canvasTokens.push(cc);
      }
    }

    if (canvasTokens.length < 2) continue;

    const firstToken = canvasTokens[0]!;
    const lastToken = canvasTokens[canvasTokens.length - 1]!;

    // yomigana: first concentration
    if (rangeInfo.yomigana) {
      firstToken.slots = {
        ...firstToken.slots,
        ruby: rangeInfo.yomigana.value,
        rubySpan: rangeInfo.yomigana.span,
      };
      setSlotHidden(firstToken, 'ruby', !!rangeInfo.yomigana.hidden);
      for (const t of canvasTokens.slice(1)) {
        const { ruby: _, rubySpan: __, ...rest } = t.slots;
        t.slots = rest;
        setSlotHidden(t, 'ruby', false);
      }
    }

    // okurigana: last concentration
    if (rangeInfo.okurigana) {
      lastToken.slots = { ...lastToken.slots, okuri: rangeInfo.okurigana.value };
      setSlotHidden(lastToken, 'okuri', !!rangeInfo.okurigana.hidden);
      for (const t of canvasTokens.slice(0, -1)) {
        const { okuri: _, ...rest } = t.slots;
        t.slots = rest;
        setSlotHidden(t, 'okuri', false);
      }
    }

    // soegana: last concentration
    if (rangeInfo.soegana) {
      lastToken.slots = { ...lastToken.slots, soegana: rangeInfo.soegana.value };
      setSlotHidden(lastToken, 'soegana', !!rangeInfo.soegana.hidden);
      for (const t of canvasTokens.slice(0, -1)) {
        const { soegana: _, ...rest } = t.slots;
        t.slots = rest;
        setSlotHidden(t, 'soegana', false);
      }
    }
  }
}
