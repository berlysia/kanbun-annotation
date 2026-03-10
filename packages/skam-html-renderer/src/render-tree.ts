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
import type { RenderProfile, RubyMethod } from './render-config.js';
import { resolveEmphasisCharacter, canBreakBefore } from '@kanbun/skam/rendering';
import { escapeHtml, generateEmphasisMarks } from './html-utils.js';
import { renderToken } from './token-renderer.js';

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
// Tateten group: inner computation (shared by standalone and highlight)
// ---------------------------------------------------------------------------

/** @internal Result of computing a tateten group's inner parts */
interface TatetenGroupInner {
  /** Token + separator HTML (inner content, without tateten-group wrapper) */
  innerHtml: string;
  /** Extracted suffix HTML (empty if no suffix) */
  collectedSuffix: string;
  /** Escaped yomigana text (empty if no yomigana) */
  yomigana: string;
  /** Interactive data attributes string */
  dataAttrs: string;
  /** Emphasis row HTML for grid mode (empty if no emphasis) */
  emphasisRowHtml: string;
  /** Emphasis style string for ruby mode (undefined if no emphasis) */
  groupEmphasisStyle?: string;
}

function buildTatetenGroupInner(node: TatetenGroupNode, ctx: RenderTreeContext): TatetenGroupInner {
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
  const separatorKaeri: string[] = Array.from({ length: numSeparators }, () => '');

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

  // 読み範囲が重複する場合の yomigana テキスト取得
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

  // emphasis-row HTML (grid モード用)
  let emphasisRowHtml = '';
  if (groupEmphasisStyle) {
    const emphasisChar = resolveEmphasisCharacter(groupEmphasisStyle);
    const emphasisSpacer = `<span class="${prefix}-emphasis-spacer"></span>`;
    const emphasisContent = node.items
      .map((item) => generateEmphasisMarks(item.token.text, emphasisChar))
      .join(emphasisSpacer);
    emphasisRowHtml = `<span class="${prefix}-emphasis-row" aria-hidden="true">${emphasisContent}</span>`;
  }

  // interactive 用 data 属性
  let dataAttrs = '';
  if (ctx.interactive && rangeCtx?.rangeTokenInfo) {
    dataAttrs = ` data-token-from="${escapeHtml(rangeCtx.rangeTokenInfo.from)}" data-token-to="${escapeHtml(rangeCtx.rangeTokenInfo.to)}"`;
  }

  const result: TatetenGroupInner = {
    innerHtml: parts.join(''),
    collectedSuffix,
    yomigana,
    dataAttrs,
    emphasisRowHtml,
  };
  if (groupEmphasisStyle) {
    result.groupEmphasisStyle = groupEmphasisStyle;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Tateten group: ruby-grid / ruby assembly
// ---------------------------------------------------------------------------

/**
 * Wrap a base content element in ruby-grid/ruby.
 *
 * @param inner - Computed parts from buildTatetenGroupInner
 * @param baseHtml - The HTML to place in the base text position (row 2 in grid)
 * @param suffixHtml - Suffix HTML to place as a sibling grid item (column 2)
 * @param ctx - Render context
 * @param useRbClass - Whether to use <rb class="tateten-group"> in ruby mode
 *                     (true for standalone, false when baseHtml is already wrapped)
 */
function wrapInTatetenRuby(
  inner: TatetenGroupInner,
  baseHtml: string,
  suffixHtml: string,
  ctx: RenderTreeContext,
  useRbClass: boolean
): string {
  const { prefix } = ctx;

  if (ctx.rubyMethod === 'grid') {
    if (inner.groupEmphasisStyle && inner.emphasisRowHtml) {
      return `<span class="${prefix}-ruby-grid--emphasis"${inner.dataAttrs}>${inner.emphasisRowHtml}<span class="${prefix}-ruby">${inner.yomigana}</span>${baseHtml}${suffixHtml}</span>`;
    }
    return `<span class="${prefix}-ruby-grid"${inner.dataAttrs}><span class="${prefix}-ruby">${inner.yomigana}</span>${baseHtml}${suffixHtml}</span>`;
  } else {
    // ruby モード
    let result: string;
    if (useRbClass) {
      // standalone: <rb class="tateten-group"> を使用
      result = `<ruby${inner.dataAttrs}><rb class="${prefix}-tateten-group">${inner.innerHtml}</rb><rt class="${prefix}-ruby">${inner.yomigana}</rt>${suffixHtml}</ruby>`;
    } else {
      // highlight: baseHtml をそのまま <rb> 内に配置
      result = `<ruby${inner.dataAttrs}><rb>${baseHtml}</rb><rt class="${prefix}-ruby">${inner.yomigana}</rt>${suffixHtml}</ruby>`;
    }
    if (inner.groupEmphasisStyle) {
      result = `<span class="${prefix}-emphasis" style="text-emphasis-style: ${escapeHtml(inner.groupEmphasisStyle)};">${result}</span>`;
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// Tateten group rendering
// ---------------------------------------------------------------------------

function renderTatetenGroup(node: TatetenGroupNode, ctx: RenderTreeContext): string {
  const { prefix } = ctx;
  const inner = buildTatetenGroupInner(node, ctx);

  if (!inner.yomigana) {
    return `<span class="${prefix}-tateten-group">${inner.innerHtml}</span>`;
  }

  // Has yomigana: wrap in ruby-grid/ruby with suffix inside
  const tatetenGroupHtml = `<span class="${prefix}-tateten-group">${inner.innerHtml}</span>`;
  return wrapInTatetenRuby(inner, tatetenGroupHtml, inner.collectedSuffix, ctx, true);
}

// ---------------------------------------------------------------------------
// Highlight group rendering
// ---------------------------------------------------------------------------

function renderHighlightGroupNode(node: HighlightGroupNode, ctx: RenderTreeContext): string {
  const { prefix } = ctx;
  const style = node.highlight.style ?? 'solid';
  const styleClass = ` ${prefix}-highlight--${style}`;

  const contentClass = `${prefix}-highlight-content`;

  // 末尾の子ノードが jukugo-kun（tateten+yomigana）で suffix を持つ場合:
  // ruby-grid を highlight の外側に配置し、suffix を highlight の外に出す。
  // これにより highlight の傍線が suffix（句読点等）に延びるのを防ぐ。
  //
  // 構造:
  //   ruby-grid > [ruby, highlight > highlight-content > tateten-group, suffix]
  const lastChild = node.items[node.items.length - 1];
  let lastTatetenInner: TatetenGroupInner | null = null;
  if (lastChild?.type === 'tateten-group') {
    const inner = buildTatetenGroupInner(lastChild, ctx);
    if (inner.yomigana && inner.collectedSuffix) {
      lastTatetenInner = inner;
    }
  }

  if (lastTatetenInner) {
    // highlight 内のコンテンツを構築（suffix を除外）
    const contentParts: string[] = [];
    for (let i = 0; i < node.items.length; i++) {
      const child = node.items[i]!;
      if (i > 0) contentParts.push('<wbr>');

      if (i === node.items.length - 1) {
        // 末尾の tateten group: ruby-grid ラッパーなしの tateten-group のみ
        contentParts.push(
          `<span class="${prefix}-tateten-group">${lastTatetenInner.innerHtml}</span>`
        );
      } else if (child.type === 'token') {
        contentParts.push(callRenderToken(child, ctx).html);
      } else {
        contentParts.push(renderTatetenGroup(child, ctx));
      }
    }

    const kanaAttr = node.hasKana ? ' data-has-kana' : '';
    const emphasisAttr = node.hasEmphasis ? ' data-has-emphasis' : '';
    const refAttr = node.hasRef ? ' data-has-ref' : '';
    const highlightHtml = `<span class="${prefix}-highlight${styleClass}" data-style="${style}"${kanaAttr}${emphasisAttr}${refAttr}><span class="${contentClass}">${node.refHtml}${contentParts.join('')}</span></span>`;

    // ruby-grid で highlight と suffix をラップ
    // highlight は base row / column 1、suffix は base row / column 2
    return wrapInTatetenRuby(
      lastTatetenInner,
      highlightHtml,
      lastTatetenInner.collectedSuffix,
      ctx,
      false
    );
  }

  // デフォルトパス: suffix の抽出不要（yomigana なし、または suffix なし）
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

  const kanaAttr = node.hasKana ? ' data-has-kana' : '';
  const emphasisAttr = node.hasEmphasis ? ' data-has-emphasis' : '';
  const refAttr = node.hasRef ? ' data-has-ref' : '';
  return `<span class="${prefix}-highlight${styleClass}" data-style="${style}"${kanaAttr}${emphasisAttr}${refAttr}><span class="${contentClass}">${node.refHtml}${contentParts.join('')}</span></span>`;
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
