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
  extractTatetenKaeri?: boolean,
  suppressYomigana?: boolean,
  extractKutoten?: boolean
): TokenRenderResult {
  return renderToken(
    node.token,
    ctx.marks,
    { prefix: ctx.prefix, profile: ctx.profile, tokens: ctx.tokens, interactive: ctx.interactive },
    node.rangeCtx,
    ctx.refValueMap,
    ctx.highlightRefIds,
    extractTatetenKaeri,
    suppressYomigana,
    extractKutoten
  );
}

// ---------------------------------------------------------------------------
// Tateten group rendering
// ---------------------------------------------------------------------------

function renderTatetenGroup(node: TatetenGroupNode, ctx: RenderTreeContext): string {
  const { prefix } = ctx;

  // グループレベルで yomigana が処理される場合、個別トークンの yomigana ruby を抑制
  const groupHasYomigana = !!node.rangeCtx?.yomiganaBaseText;

  // yomigana がある場合は kutoten も抽出して ruby の外に配置する
  const extractKutoten = groupHasYomigana;

  // Pass 1: 全トークンをレンダリング（非レ kaeri を分離、yomigana 時は kutoten も分離）
  const tokenResults = node.items.map((item) =>
    callRenderToken(item, ctx, true, groupHasYomigana, extractKutoten)
  );

  // 抽出された kutoten を収集
  const collectedKutoten = tokenResults.map((r) => r.kutotenHtml).join('');

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
    parts.push(result.html);

    if (i < tokenResults.length - 1) {
      // セパレータ: 常に tateten-sep ラッパーで囲み、vertical-align を suffix-row と統一
      const kaeri = separatorKaeri[i] ?? '';
      parts.push(
        `<span class="${prefix}-tateten-sep"><span class="${prefix}-tateten-mark"></span>${kaeri}</span>`
      );
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
    groupContent = `<ruby><rb class="${prefix}-tateten-group"${dataAttrs}>${groupContent}</rb><rt class="${prefix}-ruby">${yomigana}</rt></ruby>${collectedKutoten}`;
  } else {
    groupContent = `<span class="${prefix}-tateten-group">${groupContent}</span>`;
  }

  return groupContent;
}

// ---------------------------------------------------------------------------
// Highlight group rendering
// ---------------------------------------------------------------------------

function renderHighlightGroupNode(node: HighlightGroupNode, ctx: RenderTreeContext): string {
  const { prefix } = ctx;
  const style = node.highlight.style ?? 'solid';
  const styleClass = ` ${prefix}-highlight--${style}`;

  const contentParts: string[] = [];

  for (const child of node.items) {
    if (child.type === 'token') {
      const result = callRenderToken(child, ctx);
      contentParts.push(result.html);
    } else {
      // tateten-group
      contentParts.push(renderTatetenGroup(child, ctx));
    }
  }

  return `<span class="${prefix}-highlight${styleClass}" data-style="${style}"><span class="${prefix}-highlight-content">${node.refHtml}${contentParts.join('')}</span></span>`;
}

// ---------------------------------------------------------------------------
// Node dispatch
// ---------------------------------------------------------------------------

function renderNode(node: RenderNode, ctx: RenderTreeContext): string {
  switch (node.type) {
    case 'token': {
      const result = callRenderToken(node, ctx);
      return result.html;
    }
    case 'tateten-group':
      return renderTatetenGroup(node, ctx);
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
