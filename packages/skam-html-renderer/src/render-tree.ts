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
import type { RenderProfile, RubyMethod } from './renderer.js';
import { resolveEmphasisCharacter, canBreakBefore } from '@kanbun/skam/rendering';
import { escapeHtml, renderToken, generateEmphasisMarks } from './renderer.js';

/** @internal */
export interface RenderTreeContext {
  prefix: string;
  profile: RenderProfile;
  tokens: Token[];
  marks: Mark[];
  interactive: boolean;
  rubyMethod: RubyMethod;
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
    {
      prefix: ctx.prefix,
      profile: ctx.profile,
      tokens: ctx.tokens,
      interactive: ctx.interactive,
      rubyMethod: ctx.rubyMethod,
    },
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
  // emphasis はグループレベルで処理:
  //   ruby モード → emphasis wrapper を ruby の外に適用
  //   grid モード → emphasis-row をグリッド内に配置
  const suppressEmphasis = groupHasYomigana;
  const lastIndex = node.items.length - 1;
  const tokenResults = node.items.map((item, i) =>
    callRenderToken(
      item,
      ctx,
      true,
      groupHasYomigana,
      groupHasYomigana && i === lastIndex,
      suppressEmphasis
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

  // グループ内トークンの emphasis スタイルを収集（グループレベルで適用するため）
  const groupEmphasisStyle = suppressEmphasis
    ? tokenResults.find((r) => r.emphasisStyle)?.emphasisStyle
    : undefined;

  let groupContent = parts.join('');
  if (yomigana) {
    // interactive 用 data 属性
    let dataAttrs = '';
    if (ctx.interactive && rangeCtx?.rangeTokenInfo) {
      dataAttrs = ` data-token-from="${escapeHtml(rangeCtx.rangeTokenInfo.from)}" data-token-to="${escapeHtml(rangeCtx.rangeTokenInfo.to)}"`;
    }

    // suffix がある場合、ruby-grid/ruby 閉じタグと suffix-row の間に
    // Word Joiner (U+2060) を挿入して改行機会を抑制する。
    // ラッパー要素を使わないため highlight の描画範囲に影響しない。
    const suffixWithJoiner = collectedSuffix ? `\u2060${collectedSuffix}` : '';

    let rubyContent: string;
    if (ctx.rubyMethod === 'grid') {
      // grid モード: emphasis がある場合、emphasis-row をグリッド内に配置
      if (groupEmphasisStyle) {
        // tateten-group の構造をミラーリング: token 傍点マーク間に tateten-sep 相当のスペーサーを配置
        const emphasisChar = resolveEmphasisCharacter(groupEmphasisStyle);
        const emphasisSpacer = `<span class="${prefix}-emphasis-spacer"></span>`;
        const emphasisContent = node.items
          .map((item) => generateEmphasisMarks(item.token.text, emphasisChar))
          .join(emphasisSpacer);
        const emphasisRowHtml = `<span class="${prefix}-emphasis-row" aria-hidden="true">${emphasisContent}</span>`;
        rubyContent = `<span class="${prefix}-ruby-grid--emphasis"${dataAttrs}>${emphasisRowHtml}<span class="${prefix}-ruby">${yomigana}</span><span class="${prefix}-tateten-group">${groupContent}</span></span>${suffixWithJoiner}`;
      } else {
        rubyContent = `<span class="${prefix}-ruby-grid"${dataAttrs}><span class="${prefix}-ruby">${yomigana}</span><span class="${prefix}-tateten-group">${groupContent}</span></span>${suffixWithJoiner}`;
      }
    } else {
      // ruby モード（既存）
      rubyContent = `<ruby${dataAttrs}><rb class="${prefix}-tateten-group">${groupContent}</rb><rt class="${prefix}-ruby">${yomigana}</rt></ruby>${suffixWithJoiner}`;
      // ruby モード: emphasis がある場合、ruby の外側で emphasis ラッパーを適用
      // （text-emphasis が ruby のベーステキストに正しく表示されるよう、ruby より上位に配置）
      if (groupEmphasisStyle) {
        rubyContent = `<span class="${prefix}-emphasis" style="text-emphasis-style: ${escapeHtml(groupEmphasisStyle)};">${rubyContent}</span>`;
      }
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

  for (let i = 0; i < node.items.length; i++) {
    const child = node.items[i]!;
    // highlight グループ内: 先頭以外では改行可能
    if (i > 0) {
      contentParts.push('<wbr>');
    }
    if (child.type === 'token') {
      const result = callRenderToken(child, ctx);
      contentParts.push(result.html);
    } else {
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
  const hasBlockStartContent = tree.blockStartHtml.length > 0;
  const parts = [tree.blockStartHtml];

  for (let i = 0; i < tree.items.length; i++) {
    const node = tree.items[i]!;
    if (canBreakBefore(i, hasBlockStartContent)) {
      parts.push('<wbr>');
    }
    parts.push(renderNode(node, ctx));
  }
  return parts.join('');
}
