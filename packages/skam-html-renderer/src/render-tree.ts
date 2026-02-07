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
  extractSuffix?: boolean,
  suppressEmphasis?: boolean
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
    extractSuffix,
    suppressEmphasis
  );
}

// ---------------------------------------------------------------------------
// Tateten group rendering
// ---------------------------------------------------------------------------

function renderTatetenGroup(node: TatetenGroupNode, ctx: RenderTreeContext): string {
  const { prefix } = ctx;

  // グループレベルで yomigana が処理される場合、個別トークンの yomigana ruby を抑制
  const groupHasYomigana = !!node.rangeCtx?.yomiganaBaseText;

  // Pass 1: 全トークンをレンダリング（非レ kaeri を分離）
  // yomigana がある場合、末尾トークンの suffix-row を ruby の外に抽出する
  // yomigana がある場合は emphasis も抑制（グループレベルで ruby の外に適用するため）
  const lastIndex = node.items.length - 1;
  const tokenResults = node.items.map((item, i) =>
    callRenderToken(
      item,
      ctx,
      true,
      groupHasYomigana,
      groupHasYomigana && i === lastIndex,
      groupHasYomigana
    )
  );

  // 末尾トークンから抽出された suffix を収集
  const collectedSuffix = tokenResults.map((r) => r.suffixHtml).join('');

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

  // グループ内トークンの emphasis スタイルを収集（yomigana 時にグループレベルで適用するため）
  const groupEmphasisStyle = groupHasYomigana
    ? tokenResults.find((r) => r.emphasisStyle)?.emphasisStyle
    : undefined;

  let groupContent = parts.join('');
  if (yomigana) {
    // interactive 用 data 属性（<ruby> に付与して <rt> からも closest() で辿れるようにする）
    let dataAttrs = '';
    if (ctx.interactive && rangeCtx?.rangeTokenInfo) {
      dataAttrs = ` data-token-from="${escapeHtml(rangeCtx.rangeTokenInfo.from)}" data-token-to="${escapeHtml(rangeCtx.rangeTokenInfo.to)}"`;
    }
    let rubyContent = `<ruby${dataAttrs}><rb class="${prefix}-tateten-group">${groupContent}</rb><rt class="${prefix}-ruby">${yomigana}</rt></ruby>${collectedSuffix}`;
    // emphasis がある場合、ruby の外側で emphasis ラッパーを適用
    // （text-emphasis が ruby のベーステキストに正しく表示されるよう、ruby より上位に配置）
    if (groupEmphasisStyle) {
      rubyContent = `<span class="${prefix}-emphasis" style="text-emphasis-style: ${escapeHtml(groupEmphasisStyle)};">${rubyContent}</span>`;
    }
    groupContent = rubyContent;
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
