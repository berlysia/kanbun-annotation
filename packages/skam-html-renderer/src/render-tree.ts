/**
 * Pass 2: Walk a BlockRenderTree and emit HTML.
 *
 * Simple recursive rendering replaces the flush/accumulator state machine.
 */
import type { Token, Mark, RefMark } from '@kanbun/skam';
import type {
  TokenRenderResult,
  TokenItem,
  TatetenGroupNode,
  HighlightGroupNode,
  BlockRenderTree,
  RenderNode,
} from './render-tree-types.js';
import type { RenderProfile } from './renderer.js';
import { escapeHtml, renderToken } from './renderer.js';

/** @internal */
export interface RenderTreeContext {
  prefix: string;
  profile: RenderProfile;
  tokens: Token[];
  marks: Mark[];
  interactive: boolean;
  refValueMap: Map<RefMark, string>;
  highlightRefIds: Set<string>;
}

// ---------------------------------------------------------------------------
// Token rendering wrapper
// ---------------------------------------------------------------------------

function callRenderToken(
  node: TokenItem,
  ctx: RenderTreeContext,
  extractTatetenKaeri?: boolean
): TokenRenderResult {
  return renderToken(
    node.token,
    ctx.marks,
    { prefix: ctx.prefix, profile: ctx.profile, tokens: ctx.tokens, interactive: ctx.interactive },
    node.rangeCtx,
    ctx.refValueMap,
    ctx.highlightRefIds,
    extractTatetenKaeri
  );
}

// ---------------------------------------------------------------------------
// Tateten group rendering
// ---------------------------------------------------------------------------

interface TatetenGroupResult {
  html: string;
  lastKutotenHtml: string;
}

function renderTatetenGroupItems(
  node: TatetenGroupNode,
  ctx: RenderTreeContext
): TatetenGroupResult {
  const { prefix } = ctx;

  // Pass 1: 全トークンをレンダリング（非レ kaeri を分離）
  const tokenResults = node.items.map((item) => callRenderToken(item, ctx, true));

  // Pass 2: 各セパレータ位置への kaeri 割り当て
  const numSeparators = tokenResults.length - 1;
  const separatorKaeri: string[] = new Array<string>(numSeparators).fill('');

  for (let i = 0; i < tokenResults.length; i++) {
    const kaeri = tokenResults[i]!.tatetenKaeriHtml;
    if (kaeri) {
      if (i < numSeparators) {
        // 非最終トークン: そのトークン直後のセパレータ
        separatorKaeri[i] = (separatorKaeri[i] ?? '') + kaeri;
      } else if (numSeparators > 0) {
        // 最終トークン: 最終セパレータに配置
        separatorKaeri[numSeparators - 1] = (separatorKaeri[numSeparators - 1] ?? '') + kaeri;
      }
    }
  }

  // Pass 3: HTML 構築
  const parts: string[] = [];
  for (let i = 0; i < tokenResults.length; i++) {
    const result = tokenResults[i]!;

    if (i < tokenResults.length - 1) {
      parts.push(result.html + result.kutotenHtml);
      // セパレータ: 常に tateten-sep ラッパーで囲み、vertical-align を suffix-row と統一
      const kaeri = separatorKaeri[i] ?? '';
      parts.push(
        `<span class="${prefix}-tateten-sep"><span class="${prefix}-tateten-mark">\u3190</span>${kaeri}</span>`
      );
    } else {
      parts.push(result.html);
    }
  }

  // 読み範囲が重複する場合: tateten-group 全体を <ruby> で囲む
  const rangeCtx = node.rangeCtx;
  const yomigana = rangeCtx?.yomiganaBaseText
    ? escapeHtml(
        // yomiganaBaseText はベーステキストなので、yomigana の値は先頭トークンの mark から取得
        (() => {
          const firstItem = node.items[0];
          if (!firstItem) return '';
          const yomiganaMarks = ctx.marks.filter(
            (m) => m.type === 'yomigana' && 'anchor' in m && m.anchor.from === firstItem.token.id
          );
          return yomiganaMarks
            .map((m) => ('value' in m ? (m as { value: string }).value : ''))
            .join('');
        })()
      )
    : '';

  let groupContent = parts.join('');
  if (yomigana) {
    // interactive 用 data 属性
    let dataAttrs = '';
    if (ctx.interactive && rangeCtx?.rangeTokenInfo) {
      dataAttrs = ` data-token-from="${escapeHtml(rangeCtx.rangeTokenInfo.from)}" data-token-to="${escapeHtml(rangeCtx.rangeTokenInfo.to)}"`;
    }
    groupContent = `<ruby><rb class="${prefix}-tateten-group"${dataAttrs}>${groupContent}</rb><rt class="${prefix}-ruby">${yomigana}</rt></ruby>`;
  } else {
    groupContent = `<span class="${prefix}-tateten-group">${groupContent}</span>`;
  }

  const lastKutotenHtml = tokenResults[tokenResults.length - 1]?.kutotenHtml ?? '';
  return { html: groupContent, lastKutotenHtml };
}

function renderTatetenGroupNode(node: TatetenGroupNode, ctx: RenderTreeContext): string {
  const result = renderTatetenGroupItems(node, ctx);
  return result.html + result.lastKutotenHtml;
}

// ---------------------------------------------------------------------------
// Highlight group rendering
// ---------------------------------------------------------------------------

function renderHighlightGroupNode(node: HighlightGroupNode, ctx: RenderTreeContext): string {
  const { prefix } = ctx;
  const style = node.highlight.style ?? 'solid';
  const styleClass = ` ${prefix}-highlight--${style}`;

  const contentParts: string[] = [];
  let trailingKutoten = '';

  for (let i = 0; i < node.items.length; i++) {
    const child = node.items[i]!;
    const isLast = i === node.items.length - 1;

    if (child.type === 'token') {
      const result = callRenderToken(child, ctx);
      if (isLast) {
        contentParts.push(result.html);
        trailingKutoten = result.kutotenHtml;
      } else {
        contentParts.push(result.html + result.kutotenHtml);
      }
    } else {
      // tateten-group
      const result = renderTatetenGroupItems(child, ctx);
      if (isLast) {
        contentParts.push(result.html);
        trailingKutoten = result.lastKutotenHtml;
      } else {
        contentParts.push(result.html + result.lastKutotenHtml);
      }
    }
  }

  return `<span class="${prefix}-highlight${styleClass}" data-style="${style}"><span class="${prefix}-highlight-content">${node.refHtml}${contentParts.join('')}</span></span>${trailingKutoten}`;
}

// ---------------------------------------------------------------------------
// Node dispatch
// ---------------------------------------------------------------------------

function renderNode(node: RenderNode, ctx: RenderTreeContext): string {
  switch (node.type) {
    case 'token': {
      const result = callRenderToken(node, ctx);
      return result.html + result.kutotenHtml;
    }
    case 'tateten-group':
      return renderTatetenGroupNode(node, ctx);
    case 'highlight-group':
      return renderHighlightGroupNode(node, ctx);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render a BlockRenderTree to HTML string.
 * @internal
 */
export function renderBlockTree(tree: BlockRenderTree, ctx: RenderTreeContext): string {
  const parts = [tree.blockStartHtml];
  for (const node of tree.items) {
    parts.push(renderNode(node, ctx));
  }
  return parts.join('');
}
