/**
 * Pass 2: Walk a BlockRenderTree (an AIR tree) and emit HTML.
 *
 * Simple recursive rendering replaces the flush/accumulator state machine.
 * 注記は AIR の slot とノードだけから描く。AIR の木の入れ子 (傍線 ⊃ 竪点 ⊃ ruby など) は、
 * 重なりの無い文書で今までと同じ DOM になるように、同じ範囲の竪点と ruby だけ ruby を外側に描く。
 */
import type {
  AIRBlockChild,
  AIRHighlightGroupNode,
  AIRRubyGroupNode,
  AIRTatetenGroupNode,
  AIRTatetenSeparator,
  AIRTokenNode,
} from '@kanbun-skam/skam/rendering';
import type { BlockRenderTree, RangeUnit } from './render-tree-types.js';
import { canBreakBefore } from '@kanbun-skam/skam/rendering';
import { HIGHLIGHT_STYLES } from '@kanbun-skam/skam';
import {
  blankOut,
  escapeHtml,
  generateEmphasisMarks,
  shouldApplyTateChuYoko,
} from './html-utils.js';
import { resolveEmphasisCharacter } from '@kanbun-skam/skam/rendering';
import { safeCssKeyword } from './safe.js';
import { kaeritenSpan, renderToken, type TokenRenderContext } from './token-renderer.js';
import { emphasisStyleAttributes } from './style-data.js';

/** @internal */
export interface RenderTreeContext extends TokenRenderContext {
  /** ブロック内に読みがあるか。ブロックごとに renderBlockTree が差し替える */
  blockHasRuby?: boolean;
}

/** 木を下りるときに引き継ぐ状態 */
interface Env {
  /** 傍線の中 (ADR-015: 注記の無い字でも傍点を grid にする) */
  inHighlight: boolean;
  /**
   * 末尾の字の suffix-row を ruby の外に出すための受け皿。末尾の子だけが引き継ぐ
   * (入れ子の最後の字まで下りて、その字の suffix-row を `suffix` に集める)
   */
  tail?: { suffix: string };
}

/** 末尾でない子には、suffix-row を出す受け皿を渡さない */
function envFor(env: Env, isLast: boolean): Env {
  return env.tail && !isLast ? { inHighlight: env.inHighlight } : env;
}

// ---------------------------------------------------------------------------
// Line break
// ---------------------------------------------------------------------------

/**
 * 強制の改行。class の prefix は render-options.ts で形を検査済みなので、ほかの class と同じく escape しない。
 * 自動の折り返しの位置 (canBreakBefore の `<wbr>`) は変えず、改行の注記がある所だけ `<wbr>` の代わりにこれを置く。
 */
function lineBreakHtml(prefix: string): string {
  return `<br class="${prefix}-linebreak">`;
}

/**
 * 単位の後ろで行を改めるか。傍線のグループは `lineBreakAfter` を持たないので、
 * 傍線の span を閉じた後に出すため、最後の子に付いた改行を見る
 */
function endsWithLineBreak(node: AIRBlockChild): boolean {
  switch (node.type) {
    case 'highlight-group': {
      const last = node.children[node.children.length - 1];
      return last !== undefined && endsWithLineBreak(last);
    }
    case 'tateten-separator':
      return false;
    default:
      return node.lineBreakAfter === true;
  }
}

/** ノードの中で最後の字 (区切りは字を持たない) */
function lastTokenOf(node: AIRBlockChild): AIRTokenNode | undefined {
  if (node.type === 'token') return node;
  if (node.type === 'tateten-separator') return undefined;
  for (let i = node.children.length - 1; i >= 0; i--) {
    const found = lastTokenOf(node.children[i]!);
    if (found) return found;
  }
  return undefined;
}

/**
 * 子を不可分単位に分ける。直前までの最後の字が `joinedWithNext` なら、次の子はその字と同じ単位に入る
 * (区切りは前後の字の間にあるので、前後の字と同じ単位になる)
 */
function splitUnits(children: readonly AIRBlockChild[]): AIRBlockChild[][] {
  const units: AIRBlockChild[][] = [];
  let lastToken: AIRTokenNode | undefined;
  for (const child of children) {
    if (lastToken?.joinedWithNext === true) units[units.length - 1]!.push(child);
    else units.push([child]);
    lastToken = lastTokenOf(child) ?? lastToken;
  }
  return units;
}

/**
 * 子を並べる。単位の間には、直前の単位が改行を持つなら `<br>`、そうでなければ折り返し可能位置の `<wbr>`
 * (`canBreak(単位の番号)` が真のとき)
 */
function renderFlow(
  children: readonly AIRBlockChild[],
  ctx: RenderTreeContext,
  env: Env,
  canBreak: (unitIndex: number) => boolean,
  renderOne: (child: AIRBlockChild, childEnv: Env) => string = (child, childEnv) =>
    renderNode(child, ctx, childEnv)
): string {
  const lastChild = children[children.length - 1];
  const units = splitUnits(children);
  const parts: string[] = [];
  units.forEach((unit, index) => {
    if (index > 0) {
      const previous = units[index - 1]!;
      const previousLast = previous[previous.length - 1]!;
      if (endsWithLineBreak(previousLast)) parts.push(lineBreakHtml(ctx.prefix));
      else if (canBreak(index)) parts.push('<wbr>');
    }
    for (const child of unit) parts.push(renderOne(child, envFor(env, child === lastChild)));
  });
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Sequence (不可分の並び: ruby と竪点の中)
// ---------------------------------------------------------------------------

interface SequenceResult {
  html: string;
  /** 末尾の字から抽出した suffix-row */
  suffix: string;
  /** 抑制した傍点のうち最初の style (グループ側で描く) */
  emphasisStyle?: string;
}

interface SequenceOptions {
  suppressEmphasis?: boolean;
  extractLastSuffix?: boolean;
  baseClass?: 'base' | 'base-seg';
}

function renderSequence(
  children: readonly AIRBlockChild[],
  ctx: RenderTreeContext,
  env: Env,
  options: SequenceOptions = {}
): SequenceResult {
  let html = '';
  let emphasisStyle: string | undefined;
  // 末尾の字の suffix-row は、入れ子の最後の字まで下りて集める
  const sink = { suffix: '' };
  const outerEnv: Env = options.extractLastSuffix ? { ...env, tail: sink } : env;
  const lastIndex = children.length - 1;
  children.forEach((child, index) => {
    const childEnv = envFor(outerEnv, index === lastIndex);
    if (child.type === 'token') {
      const result = renderToken([child], ctx, {
        inHighlight: childEnv.inHighlight,
        blockHasRuby: ctx.blockHasRuby === true,
        ...(options.suppressEmphasis ? { suppressEmphasis: true } : {}),
        ...(childEnv.tail ? { extractSuffix: true } : {}),
        ...(options.baseClass ? { baseClass: options.baseClass } : {}),
      });
      html += result.html;
      if (childEnv.tail) childEnv.tail.suffix += result.suffixHtml;
      emphasisStyle ??= result.emphasisStyle;
    } else {
      html += renderNode(child, ctx, childEnv);
    }
  });
  return emphasisStyle === undefined
    ? { html, suffix: sink.suffix }
    : { html, suffix: sink.suffix, emphasisStyle };
}

function collectTokens(children: readonly AIRBlockChild[]): AIRTokenNode[] {
  return children.flatMap((child) => {
    if (child.type === 'token') return [child];
    if (child.type === 'tateten-separator') return [];
    return collectTokens(child.children);
  });
}

// ---------------------------------------------------------------------------
// Separator
// ---------------------------------------------------------------------------

function renderSeparator(sep: AIRTatetenSeparator, ctx: RenderTreeContext): string {
  const { prefix } = ctx;
  // 区切り: 常に tateten-sep ラッパーで囲み、vertical-align を suffix-row と統一
  const kaeri = sep.kaeri ? kaeritenSpan(prefix, sep.kaeri, sep.kaeriHidden === true) : '';
  // 隠す竪点は、記号の字を空白にする CSS (quiz-hidden) の付いた同じ要素で場所を残す
  const markClass = sep.hidden
    ? `${prefix}-tateten-mark ${prefix}-quiz-hidden" aria-hidden="true`
    : `${prefix}-tateten-mark`;
  return `<span class="${prefix}-tateten-sep"><span class="${markClass}"></span>${kaeri}</span>`;
}

// ---------------------------------------------------------------------------
// Ruby wrapper (ruby-grid / <ruby>)
// ---------------------------------------------------------------------------

interface RubyWrapArgs {
  ruby: AIRRubyGroupNode;
  /** grid 方式で ruby の行と並べる本文の要素 */
  gridBaseHtml: string;
  /** ruby 方式の `<rb>` の開始タグと中身 */
  rbOpenTag: string;
  rbInnerHtml: string;
  /** ruby の外に出した suffix-row */
  suffixHtml: string;
  /** グループ側で描く傍点 */
  emphasis?: { style: string; rowHtml: string };
}

/** 範囲の読みを持つ ruby のグループの外側 (grid 方式は ruby-grid、ruby 方式は `<ruby>`) */
function wrapRuby(args: RubyWrapArgs, ctx: RenderTreeContext): string {
  const { prefix } = ctx;
  const { ruby, emphasis } = args;
  const value = ruby.yomigana.value;
  const hidden = ruby.yomigana.hidden === true && value !== '';
  const yomigana = hidden ? blankOut(value) : escapeHtml(value);
  const rubyAttrs = hidden
    ? `class="${prefix}-ruby ${prefix}-quiz-hidden" aria-hidden="true"`
    : `class="${prefix}-ruby"`;
  // interactive 用 data 属性
  const dataAttrs = ctx.interactive
    ? ` data-token-from="${escapeHtml(ruby.fromTokenId)}" data-token-to="${escapeHtml(ruby.toTokenId)}"`
    : '';

  if (ctx.rubyMethod === 'grid') {
    if (emphasis) {
      return `<span class="${prefix}-ruby-grid--emphasis"${dataAttrs}>${emphasis.rowHtml}<span ${rubyAttrs}>${yomigana}</span>${args.gridBaseHtml}${args.suffixHtml}</span>`;
    }
    return `<span class="${prefix}-ruby-grid"${dataAttrs}><span ${rubyAttrs}>${yomigana}</span>${args.gridBaseHtml}${args.suffixHtml}</span>`;
  }
  // ruby モード
  let result = `<ruby${dataAttrs}>${args.rbOpenTag}${args.rbInnerHtml}</rb><rt ${rubyAttrs}>${yomigana}</rt>${args.suffixHtml}</ruby>`;
  if (emphasis) {
    result = `<span class="${prefix}-emphasis"${emphasisStyleAttributes(emphasis.style, ctx.inlineStyles !== false)}>${result}</span>`;
  }
  return result;
}

function isRubyOnly(node: AIRTatetenGroupNode): AIRRubyGroupNode | undefined {
  const only = node.children.length === 1 ? node.children[0] : undefined;
  return only?.type === 'ruby-group' ? only : undefined;
}

// ---------------------------------------------------------------------------
// Ruby group rendering
// ---------------------------------------------------------------------------

/** 字ごとの要素 1 つにまとめられる字か (注記が ruby の読みと衝突しない、再読文字でない) */
function isPlainRangeToken(child: AIRBlockChild): child is AIRTokenNode {
  return (
    child.type === 'token' && child.slots.ruby === undefined && child.slots.saidoku === undefined
  );
}

function rangeOf(node: AIRRubyGroupNode): RangeUnit {
  return {
    from: node.fromTokenId,
    to: node.toTokenId,
    yomigana: { value: node.yomigana.value, hidden: node.yomigana.hidden === true },
  };
}

function renderRubyGroup(node: AIRRubyGroupNode, ctx: RenderTreeContext, env: Env): string {
  const blockHasRuby = ctx.blockHasRuby === true;
  // 字だけの範囲の読みは、字全体を 1 つの単位 (ruby-grid / <ruby> の中に字ごとの base-seg) に描く
  if (node.children.every(isPlainRangeToken)) {
    return renderToken(node.children as AIRTokenNode[], ctx, {
      range: rangeOf(node),
      inHighlight: env.inHighlight,
      blockHasRuby,
    }).html;
  }
  // 区切りや竪点・傍線の断片を含む範囲: 中の字と断片をその並びのまま base の中に置く
  const seq = renderSequence(node.children, ctx, env, {
    extractLastSuffix: true,
    baseClass: 'base-seg',
  });
  const base = `${ctx.prefix}-base`;
  return wrapRuby(
    {
      ruby: node,
      gridBaseHtml: `<span class="${base}">${seq.html}</span>`,
      rbOpenTag: `<rb class="${base}">`,
      rbInnerHtml: seq.html,
      suffixHtml: seq.suffix,
    },
    ctx
  );
}

// ---------------------------------------------------------------------------
// Tateten group rendering
// ---------------------------------------------------------------------------

function continuesAttributes(node: { continuesBefore?: true; continuesAfter?: true }): string {
  return `${node.continuesBefore ? ' data-continues-before' : ''}${node.continuesAfter ? ' data-continues-after' : ''}`;
}

/** 同じ範囲の竪点と ruby (熟語訓): 中の字の並びと、ruby の外に出す suffix、グループ側の傍点 */
interface JukugoKun {
  ruby: AIRRubyGroupNode;
  innerHtml: string;
  suffix: string;
  emphasis?: { style: string; rowHtml: string };
}

function buildJukugoKun(ruby: AIRRubyGroupNode, ctx: RenderTreeContext, env: Env): JukugoKun {
  // 傍点はグループ側で描くので字では抑制し、末尾の字の suffix-row は ruby の外に出す
  const seq = renderSequence(ruby.children, ctx, env, {
    suppressEmphasis: true,
    extractLastSuffix: true,
  });
  const result: JukugoKun = { ruby, innerHtml: seq.html, suffix: seq.suffix };
  if (seq.emphasisStyle) {
    const { prefix } = ctx;
    const emphasisChar = resolveEmphasisCharacter(seq.emphasisStyle);
    const spacer = `<span class="${prefix}-emphasis-spacer"></span>`;
    const content = collectTokens(ruby.children)
      .map((token) => generateEmphasisMarks(token.token.text, emphasisChar))
      .join(spacer);
    result.emphasis = {
      style: seq.emphasisStyle,
      rowHtml: `<span class="${prefix}-emphasis-row" aria-hidden="true">${content}</span>`,
    };
  }
  return result;
}

function renderTatetenGroup(node: AIRTatetenGroupNode, ctx: RenderTreeContext, env: Env): string {
  const { prefix } = ctx;
  const attrs = continuesAttributes(node);
  const ruby = isRubyOnly(node);

  if (!ruby) {
    return `<span class="${prefix}-tateten-group"${attrs}>${renderSequence(node.children, ctx, env).html}</span>`;
  }

  // 同じ範囲の竪点と ruby: ruby を外側に、竪点のグループを ruby の本文に描く (今までと同じ形)
  const jukugo = buildJukugoKun(ruby, ctx, env);
  const tatetenHtml = `<span class="${prefix}-tateten-group"${attrs}>${jukugo.innerHtml}</span>`;
  return wrapRuby(
    {
      ruby,
      gridBaseHtml: tatetenHtml,
      rbOpenTag: `<rb class="${prefix}-tateten-group"${attrs}>`,
      rbInnerHtml: jukugo.innerHtml,
      suffixHtml: jukugo.suffix,
      ...(jukugo.emphasis ? { emphasis: jukugo.emphasis } : {}),
    },
    ctx
  );
}

// ---------------------------------------------------------------------------
// Highlight group rendering
// ---------------------------------------------------------------------------

function highlightRefHtml(refLabel: string | undefined, prefix: string): string {
  if (!refLabel) return '';
  const halfWidthClass = shouldApplyTateChuYoko(refLabel) ? ` ${prefix}-ref--half-width` : '';
  return `<span class="${prefix}-ref${halfWidthClass}">${escapeHtml(refLabel)}</span>`;
}

function renderHighlightGroup(
  node: AIRHighlightGroupNode,
  ctx: RenderTreeContext,
  outer: Env
): string {
  const { prefix } = ctx;
  const env: Env = { ...outer, inHighlight: true };
  const style = safeCssKeyword(node.highlightMark.style, HIGHLIGHT_STYLES, 'solid');
  const styleClass = ` ${prefix}-highlight--${style}`;
  const contentClass = `${prefix}-highlight-content`;
  const kanaAttr = node.hasKana ? ' data-has-kana' : '';
  const emphasisAttr = node.hasEmphasis ? ' data-has-emphasis' : '';
  const refAttr = node.refLabel ? ' data-has-ref' : '';
  // 段は AIR の整数 (1 以上)。数値だけを属性と CSS 変数に出す
  const laneAttr =
    node.lane !== undefined && Number.isSafeInteger(node.lane) && node.lane >= 1
      ? ` data-lane="${node.lane}" style="--${prefix}-highlight-lane: ${node.lane}"`
      : '';
  const attributes = `data-style="${style}"${kanaAttr}${emphasisAttr}${refAttr}${continuesAttributes(node)}${laneAttr}`;
  const refHtml = highlightRefHtml(node.refLabel, prefix);
  const wrap = (content: string): string =>
    `<span class="${prefix}-highlight${styleClass}" ${attributes}><span class="${contentClass}">${refHtml}${content}</span></span>`;

  // 末尾の子が熟語訓（竪点 + ruby）で suffix を持つ場合:
  // ruby-grid を highlight の外側に配置し、suffix を highlight の外に出す。
  // これにより highlight の傍線が suffix（句読点等）に延びるのを防ぐ。
  //
  // 構造:
  //   ruby-grid > [ruby, highlight > highlight-content > tateten-group, suffix]
  const lastChild = node.children[node.children.length - 1];
  const lastRuby = lastChild?.type === 'tateten-group' ? isRubyOnly(lastChild) : undefined;
  if (lastChild?.type === 'tateten-group' && lastRuby) {
    const jukugo = buildJukugoKun(lastRuby, ctx, env);
    if (jukugo.suffix) {
      const tatetenAttrs = continuesAttributes(lastChild);
      const content = renderFlow(
        node.children,
        ctx,
        env,
        () => true,
        (child, childEnv) =>
          child === lastChild
            ? `<span class="${prefix}-tateten-group"${tatetenAttrs}>${jukugo.innerHtml}</span>`
            : renderNode(child, ctx, childEnv)
      );
      // ruby-grid で highlight と suffix をラップ
      // highlight は base row / column 1、suffix は base row / column 2
      const highlightHtml = wrap(content);
      return wrapRuby(
        {
          ruby: lastRuby,
          gridBaseHtml: highlightHtml,
          rbOpenTag: '<rb>',
          rbInnerHtml: highlightHtml,
          suffixHtml: jukugo.suffix,
          ...(jukugo.emphasis ? { emphasis: jukugo.emphasis } : {}),
        },
        ctx
      );
    }
  }

  // デフォルトパス: highlight グループ内は、先頭以外の単位の前で改行可能
  return wrap(renderFlow(node.children, ctx, env, () => true));
}

// ---------------------------------------------------------------------------
// Node dispatch
// ---------------------------------------------------------------------------

function renderNode(node: AIRBlockChild, ctx: RenderTreeContext, env: Env): string {
  switch (node.type) {
    case 'token': {
      const result = renderToken([node], ctx, {
        inHighlight: env.inHighlight,
        blockHasRuby: ctx.blockHasRuby === true,
        ...(env.tail ? { extractSuffix: true } : {}),
      });
      if (env.tail) env.tail.suffix += result.suffixHtml;
      return result.html;
    }
    case 'tateten-separator':
      return renderSeparator(node, ctx);
    case 'ruby-group':
      return renderRubyGroup(node, ctx, env);
    case 'tateten-group':
      return renderTatetenGroup(node, ctx, env);
    case 'highlight-group':
      return renderHighlightGroup(node, ctx, env);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render a BlockRenderTree to HTML string.
 * @internal
 */
export function renderBlockTree(tree: BlockRenderTree, context: RenderTreeContext): string {
  const ctx: RenderTreeContext = { ...context, blockHasRuby: tree.blockHasRuby };
  const hasBlockStartContent = tree.blockStartHtml.length > 0;
  return (
    tree.blockStartHtml +
    renderFlow(tree.items, ctx, { inHighlight: false }, (unitIndex) =>
      canBreakBefore(unitIndex, hasBlockStartContent)
    )
  );
}
