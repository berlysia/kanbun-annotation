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
import { renderToken } from './renderer.js';

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

function callRenderToken(node: TokenItem, ctx: RenderTreeContext): TokenRenderResult {
  return renderToken(
    node.token,
    ctx.marks,
    { prefix: ctx.prefix, profile: ctx.profile, tokens: ctx.tokens, interactive: ctx.interactive },
    node.rangeCtx,
    ctx.refValueMap,
    ctx.highlightRefIds
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
  const htmlParts: string[] = [];
  let lastKutotenHtml = '';

  for (let i = 0; i < node.items.length; i++) {
    const item = node.items[i]!;
    const result = callRenderToken(item, ctx);

    if (i < node.items.length - 1) {
      // Non-last items: include kutotenHtml inline
      htmlParts.push(result.html + result.kutotenHtml);
    } else {
      // Last item: extract kutotenHtml for caller to place after group
      htmlParts.push(result.html);
      lastKutotenHtml = result.kutotenHtml;
    }
  }

  const inner = htmlParts.join(`<span class="${prefix}-tateten-mark"></span>`);
  const html = `<span class="${prefix}-tateten-group">${inner}</span>`;
  return { html, lastKutotenHtml };
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
