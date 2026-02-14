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
  AIRRangeInfo,
} from '@kanbun/skam/rendering';

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

function convertTokenNode(airNode: AIRTokenNode): CanvasTokenNode {
  return {
    type: 'token',
    token: airNode.token,
    slots: convertTokenSlots(airNode),
  };
}

// ============================================================================
// Tateten 変換
// ============================================================================

function convertTatetenSeparator(airSep: AIRTatetenSeparator): CanvasTatetenSeparator {
  const sep: CanvasTatetenSeparator = { type: 'tateten-separator' };
  if (airSep.kaeri) {
    sep.kaeri = airSep.kaeri;
  }
  return sep;
}

function convertTatetenGroup(airGroup: AIRTatetenGroupNode): CanvasTatetenGroupNode {
  const children: (CanvasTokenNode | CanvasTatetenSeparator)[] = airGroup.children.map((child) =>
    child.type === 'token' ? convertTokenNode(child) : convertTatetenSeparator(child)
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
    // 後続トークンの ruby をクリア
    for (const t of tokenNodes.slice(1)) {
      const { ruby: _, rubySpan: __, ...rest } = t.slots;
      t.slots = rest;
    }
  }

  // okurigana: last concentration
  if (rangeInfo.okurigana) {
    lastToken.slots = { ...lastToken.slots, okuri: rangeInfo.okurigana.value };
    // 先行トークンの okuri をクリア
    for (const t of tokenNodes.slice(0, -1)) {
      const { okuri: _, ...rest } = t.slots;
      t.slots = rest;
    }
  }

  // soegana: last concentration
  if (rangeInfo.soegana) {
    lastToken.slots = { ...lastToken.slots, soegana: rangeInfo.soegana.value };
    for (const t of tokenNodes.slice(0, -1)) {
      const { soegana: _, ...rest } = t.slots;
      t.slots = rest;
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
  const blockNodes: CanvasBlockNode[] = air.blocks.map((airBlock) => {
    const children: CanvasBlockChild[] = airBlock.children.map(convertBlockChild);

    // Range info が non-tateten トークンにある場合の concentration 適用
    applyNonTatetenRangeConcentration(airBlock, children);

    const flags = computeBlockFlags(children);

    return {
      type: 'block' as const,
      blockId: airBlock.blockId,
      children,
      flags,
    };
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
      for (const t of canvasTokens.slice(1)) {
        const { ruby: _, rubySpan: __, ...rest } = t.slots;
        t.slots = rest;
      }
    }

    // okurigana: last concentration
    if (rangeInfo.okurigana) {
      lastToken.slots = { ...lastToken.slots, okuri: rangeInfo.okurigana.value };
      for (const t of canvasTokens.slice(0, -1)) {
        const { okuri: _, ...rest } = t.slots;
        t.slots = rest;
      }
    }

    // soegana: last concentration
    if (rangeInfo.soegana) {
      lastToken.slots = { ...lastToken.slots, soegana: rangeInfo.soegana.value };
      for (const t of canvasTokens.slice(0, -1)) {
        const { soegana: _, ...rest } = t.slots;
        t.slots = rest;
      }
    }
  }
}
