/**
 * HTML AIR Adapter
 *
 * AIRDocument → BlockRenderTree[] 変換。
 * AIR の意味解決済みデータを HTML renderer の Pass 2 入力に変換する。
 *
 * blockStartHtml, refHtml は AIR の意味データから Adapter 側で HTML を生成する。
 * trailing marks は AIR の raw フィールドから元の Mark オブジェクトを復元する。
 */

import type {
  KaeriMark,
  KutotenMark,
  RefMark,
  OkimojiMark,
  JojiMark,
  EmphasisMark,
  Token,
  Mark,
} from '@kanbun/skam';

import type {
  AIRDocument,
  AIRBlock,
  AIRBlockChild,
  AIRTokenNode,
  AIRTatetenGroupNode,
  AIRHighlightGroupNode,
  AIRRangeInfo,
  AIRTrailingMark,
} from '@kanbun/skam/rendering';

import type {
  BlockRenderTree,
  RenderNode,
  TokenItem,
  TatetenGroupNode,
  HighlightGroupNode,
  RangeMarkContext,
  RangeTokenInfo,
} from './render-tree-types.js';
import { escapeHtml, shouldApplyTateChuYoko } from './html-utils.js';
import { getMarksForToken } from '@kanbun/skam/rendering';

// ============================================================================
// Block-start HTML 生成
// ============================================================================

function buildBlockStartHtml(airBlock: AIRBlock, prefix: string): string {
  const parts: string[] = [];

  for (const ref of airBlock.blockStartRefs) {
    const halfWidthClass = shouldApplyTateChuYoko(ref.resolved) ? ` ${prefix}-ref--half-width` : '';
    parts.push(`<span class="${prefix}-ref${halfWidthClass}">${escapeHtml(ref.resolved)}</span>`);
  }

  for (const kutoten of airBlock.blockStartKutoten) {
    parts.push(`<span class="${prefix}-suffix-kutoten">${escapeHtml(kutoten.value)}</span>`);
  }

  return parts.join('');
}

// ============================================================================
// Highlight refHtml 生成
// ============================================================================

function buildHighlightRefHtml(refLabel: string | undefined, prefix: string): string {
  if (!refLabel) return '';
  const halfWidthClass = shouldApplyTateChuYoko(refLabel) ? ` ${prefix}-ref--half-width` : '';
  return `<span class="${prefix}-ref${halfWidthClass}">${escapeHtml(refLabel)}</span>`;
}

// ============================================================================
// Trailing marks → RangeMarkContext への変換
// ============================================================================

function convertTrailingMarks(trailingMarks: AIRTrailingMark[]): Partial<RangeMarkContext> {
  const trailingKaeriMarks: KaeriMark[] = [];
  const trailingKutotenMarks: KutotenMark[] = [];
  const trailingRefMarks: RefMark[] = [];
  const trailingOkimojiMarks: OkimojiMark[] = [];
  const trailingJojiMarks: JojiMark[] = [];
  const trailingEmphasisMarks: EmphasisMark[] = [];

  for (const tm of trailingMarks) {
    switch (tm.kind) {
      case 'kaeri':
        trailingKaeriMarks.push(tm.raw as KaeriMark);
        break;
      case 'kutoten':
        trailingKutotenMarks.push(tm.raw as KutotenMark);
        break;
      case 'ref':
        trailingRefMarks.push(tm.raw as RefMark);
        break;
      case 'okimoji':
        trailingOkimojiMarks.push(tm.raw as OkimojiMark);
        break;
      case 'joji':
        trailingJojiMarks.push(tm.raw as JojiMark);
        break;
      case 'emphasis':
        trailingEmphasisMarks.push(tm.raw as EmphasisMark);
        break;
    }
  }

  return {
    trailingKaeriMarks,
    trailingKutotenMarks,
    trailingRefMarks,
    ...(trailingOkimojiMarks.length > 0 ? { trailingOkimojiMarks } : {}),
    ...(trailingJojiMarks.length > 0 ? { trailingJojiMarks } : {}),
    ...(trailingEmphasisMarks.length > 0 ? { trailingEmphasisMarks } : {}),
  };
}

// ============================================================================
// AIRRangeInfo → RangeMarkContext 変換
// ============================================================================

function convertRangeInfo(rangeInfo: AIRRangeInfo): RangeMarkContext {
  const rangeTokenInfo: RangeTokenInfo = {
    from: rangeInfo.fromTokenId,
    to: rangeInfo.toTokenId,
  };

  let ctx: RangeMarkContext = { rangeTokenInfo };

  if (rangeInfo.yomigana) {
    ctx = { ...ctx, yomiganaBaseText: rangeInfo.yomigana.baseText };
  }
  if (rangeInfo.okurigana) {
    ctx = {
      ...ctx,
      okuriganaBaseText: rangeInfo.okurigana.baseText,
      okuriganaValue: rangeInfo.okurigana.value,
    };
  }
  if (rangeInfo.soegana) {
    ctx = {
      ...ctx,
      soeganaBaseText: rangeInfo.soegana.baseText,
      soeganaValue: rangeInfo.soegana.value,
    };
  }

  if (rangeInfo.trailingMarks.length > 0) {
    ctx = { ...ctx, ...convertTrailingMarks(rangeInfo.trailingMarks) };
  }

  return ctx;
}

// ============================================================================
// Token 変換
// ============================================================================

function convertTokenNode(airToken: AIRTokenNode): TokenItem {
  const item: TokenItem = { type: 'token', token: airToken.token };
  if (airToken.rangeInfo) {
    item.rangeCtx = convertRangeInfo(airToken.rangeInfo);
  }
  return item;
}

// ============================================================================
// Tateten group 変換
// ============================================================================

function convertTatetenGroup(airGroup: AIRTatetenGroupNode): TatetenGroupNode {
  const items: TokenItem[] = [];
  for (const child of airGroup.children) {
    if (child.type === 'token') {
      items.push(convertTokenNode(child));
    }
    // tateten-separator は TatetenGroupNode の items には含まれない
    // （HTML Pass2 が独自にセパレータを生成する）
  }

  const node: TatetenGroupNode = {
    type: 'tateten-group',
    tateten: airGroup.tatetenMark,
    items,
  };

  if (airGroup.rangeInfo) {
    node.rangeCtx = convertRangeInfo(airGroup.rangeInfo);
  }

  return node;
}

// ============================================================================
// Highlight group 変換
// ============================================================================

function convertHighlightGroup(
  airGroup: AIRHighlightGroupNode,
  prefix: string,
  tokens: Token[],
  marks: Mark[]
): HighlightGroupNode {
  const items: (TokenItem | TatetenGroupNode)[] = airGroup.children.map((child) =>
    child.type === 'token' ? convertTokenNode(child) : convertTatetenGroup(child)
  );

  // hasKana 判定: AIR の hasKana を使用
  const hasKana = airGroup.hasKana;

  // inHighlightGroup, highlightGroupHasRuby, blockHasRuby を各 token に設定
  // （HTML Pass2 がこれらのフラグを使用してグリッドクラスを選択する）
  // blockHasRuby は block レベルで後から設定するため、ここでは false
  for (const item of items) {
    if (item.type === 'token') {
      item.rangeCtx = {
        ...item.rangeCtx,
        inHighlightGroup: true,
        highlightGroupHasRuby: hasKana,
        blockHasRuby: false, // block 変換時に更新
      };
    } else {
      for (const tatetenItem of item.items) {
        tatetenItem.rangeCtx = {
          ...tatetenItem.rangeCtx,
          inHighlightGroup: true,
          highlightGroupHasRuby: hasKana,
          blockHasRuby: false, // block 変換時に更新
        };
      }
    }
  }

  const refHtml = buildHighlightRefHtml(airGroup.refLabel, prefix);

  return {
    type: 'highlight-group',
    highlight: airGroup.highlightMark,
    refHtml,
    items,
    hasKana,
  };
}

// ============================================================================
// blockHasRuby 判定 & 設定
// ============================================================================

function checkBlockHasRuby(items: RenderNode[], tokens: Token[], marks: Mark[]): boolean {
  for (const item of items) {
    if (item.type === 'token') {
      const tokenMarks = getMarksForToken(item.token.id, marks, tokens);
      if (
        (tokenMarks.get('yomigana')?.length ?? 0) > 0 ||
        (tokenMarks.get('okurigana')?.length ?? 0) > 0 ||
        (tokenMarks.get('soegana')?.length ?? 0) > 0 ||
        !!item.rangeCtx?.yomiganaBaseText ||
        !!item.rangeCtx?.okuriganaBaseText ||
        !!item.rangeCtx?.soeganaBaseText
      ) {
        return true;
      }
    } else if (item.type === 'tateten-group') {
      for (const ti of item.items) {
        const tokenMarks = getMarksForToken(ti.token.id, marks, tokens);
        if (
          (tokenMarks.get('yomigana')?.length ?? 0) > 0 ||
          (tokenMarks.get('okurigana')?.length ?? 0) > 0 ||
          (tokenMarks.get('soegana')?.length ?? 0) > 0 ||
          !!ti.rangeCtx?.yomiganaBaseText ||
          !!ti.rangeCtx?.okuriganaBaseText ||
          !!ti.rangeCtx?.soeganaBaseText
        ) {
          return true;
        }
      }
      if (
        item.rangeCtx?.yomiganaBaseText ||
        item.rangeCtx?.okuriganaBaseText ||
        item.rangeCtx?.soeganaBaseText
      ) {
        return true;
      }
    } else {
      // highlight-group
      for (const child of item.items) {
        if (child.type === 'token') {
          const tokenMarks = getMarksForToken(child.token.id, marks, tokens);
          if (
            (tokenMarks.get('yomigana')?.length ?? 0) > 0 ||
            (tokenMarks.get('okurigana')?.length ?? 0) > 0 ||
            (tokenMarks.get('soegana')?.length ?? 0) > 0 ||
            !!child.rangeCtx?.yomiganaBaseText ||
            !!child.rangeCtx?.okuriganaBaseText ||
            !!child.rangeCtx?.soeganaBaseText
          ) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

function setBlockHasRuby(items: RenderNode[], blockHasRuby: boolean): void {
  for (const item of items) {
    if (item.type === 'highlight-group') {
      for (const child of item.items) {
        if (child.type === 'token') {
          if (child.rangeCtx) {
            child.rangeCtx = { ...child.rangeCtx, blockHasRuby };
          }
        } else {
          for (const ti of child.items) {
            if (ti.rangeCtx) {
              ti.rangeCtx = { ...ti.rangeCtx, blockHasRuby };
            }
          }
        }
      }
    }
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * AIRDocument → BlockRenderTree[]
 *
 * AIR の意味解決済みデータを HTML renderer の Pass 2 入力に変換する。
 */
export function convertAIRToBlockRenderTrees(
  air: AIRDocument,
  prefix: string,
  tokens: Token[],
  marks: Mark[]
): BlockRenderTree[] {
  return air.blocks.map((airBlock) => {
    const blockStartHtml = buildBlockStartHtml(airBlock, prefix);

    const items: RenderNode[] = airBlock.children
      // rangeConsumed トークンをスキップ（リードトークンの rangeInfo.baseText で連結描画済み）
      .filter((child) => !(child.type === 'token' && child.rangeConsumed))
      .map((child): RenderNode => {
        switch (child.type) {
          case 'token':
            return convertTokenNode(child);
          case 'tateten-group':
            return convertTatetenGroup(child);
          case 'highlight-group':
            return convertHighlightGroup(child, prefix, tokens, marks);
        }
      });

    // blockHasRuby 判定 & highlight group 内のフラグ更新
    const blockHasRuby = checkBlockHasRuby(items, tokens, marks);
    setBlockHasRuby(items, blockHasRuby);

    return { blockId: airBlock.blockId, blockStartHtml, items };
  });
}
