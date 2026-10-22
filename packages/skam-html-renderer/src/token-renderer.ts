/**
 * SKAM HTML Renderer - Token Rendering
 *
 * Display実装層: 字の単位 (AIR のトークンノード 1 つ、または ruby のグループの字全体) の HTML 生成。
 * 注記は AIR の slot と hiddenSlots だけから描く (文書の注記は引き直さない)。
 * 依存: 基盤層（render-config, html-utils）+ @kanbun-skam/skam + @kanbun-skam/skam/rendering
 * renderer.ts (API層) を参照しない。
 */

import { KAERI } from '@kanbun-skam/skam';
import { resolveEmphasisCharacter } from '@kanbun-skam/skam/rendering';
import type { AIRTokenNode, AIRTokenSlots } from '@kanbun-skam/skam/rendering';
import type { RubyMethod } from './render-config.js';
import {
  blankOut,
  escapeHtml,
  generateEmphasisMarks,
  shouldApplyTateChuYoko,
} from './html-utils.js';
import { safeCssInteger, toSafeHtml } from './safe.js';
import { emphasisStyleAttributes, okototenStyleAttributes } from './style-data.js';
import type { RangeUnit, TokenRenderResult } from './render-tree-types.js';

// ============================================================================
// Types
// ============================================================================

/** @internal */
export interface TokenRenderContext {
  prefix: string;
  interactive: boolean;
  rubyMethod: RubyMethod;
  /** false なら style 属性の代わりに data 属性を出す (既定 true)。style-data.ts を参照 */
  inlineStyles?: boolean;
}

/** 字の単位ごとの描画の指定 */
export interface TokenUnitOptions {
  /** ruby のグループの字全体を 1 つの単位として描く (範囲の読み、またはそれを持たない範囲の注記の字) */
  range?: RangeUnit;
  /** 傍線の中 (ADR-015: 注記の無い字でも傍点を grid にする) */
  inHighlight?: boolean;
  /** ブロック内に読みがある (傍点だけの字の grid の段を揃える) */
  blockHasRuby?: boolean;
  /** 傍点をグループ側で描くので、字では描かない */
  suppressEmphasis?: boolean;
  /** 送り仮名・句読点・返り点の行を字の外に出して返す */
  extractSuffix?: boolean;
  /** 本文の要素の class。ruby のグループの中の字は `base-seg` にして、字ごとの要素にする */
  baseClass?: 'base' | 'base-seg';
}

const DEFAULT_EMPHASIS_STYLE = 'filled dot';

// ============================================================================
// Annotation helpers
// ============================================================================

/**
 * 注記の要素。隠すときは中身を 1 字ずつ空白に置き換え、`quiz-hidden` と `aria-hidden` を付ける
 * (値は出力に残さない)。隠さないときは今までと同じ出力。
 */
function annotationSpan(
  prefix: string,
  className: string,
  text: string,
  hidden: boolean,
  extraAttributes = ''
): string {
  return hidden
    ? `<span class="${className} ${prefix}-quiz-hidden"${extraAttributes} aria-hidden="true">${blankOut(text)}</span>`
    : `<span class="${className}"${extraAttributes}>${escapeHtml(text)}</span>`;
}

/** 注記の中身。隠すときは空白に置き換え、隠さないときは escape する */
function annotationText(text: string, hidden: boolean): string {
  return hidden ? blankOut(text) : escapeHtml(text);
}

/** ルビの要素の開始タグ (`rt` か `span`)。隠すときは class と aria-hidden を足す */
function rubyOpenTag(
  tag: 'span' | 'rt',
  classNames: string,
  prefix: string,
  hidden: boolean,
  extra = ''
): string {
  return hidden
    ? `<${tag} class="${classNames} ${prefix}-quiz-hidden"${extra} aria-hidden="true">`
    : `<${tag} class="${classNames}"${extra}>`;
}

/** 返り点の要素。隠すときは中身を空白に置き換える */
export function kaeritenSpan(prefix: string, value: string, hidden: boolean): string {
  return hidden
    ? `<span class="${prefix}-kaeriten ${prefix}-quiz-hidden" aria-hidden="true">${blankOut(value)}</span>`
    : `<span class="${prefix}-kaeriten" aria-hidden="true">${value === KAERI.RE ? value : toSafeHtml(value)}</span>`;
}

function isHiddenSlot(node: AIRTokenNode, name: string): boolean {
  return node.hiddenSlots?.some((slot) => slot === name) === true;
}

/** 再読文字の形のうち描くもの (`n` は正の整数) */
type SaidokuForm = NonNullable<AIRTokenSlots['saidoku']>['forms'][number];

/** 描く再読文字の情報。第 1・第 2 の形と、形が 2 つ以上あるか */
interface SaidokuView {
  first: SaidokuForm | undefined;
  second: SaidokuForm | undefined;
  forms: readonly SaidokuForm[];
  n1: string;
  n2: string;
  hasSecond: boolean;
}

/** 再読文字として描くか。AIR が `slots.saidoku` を付けた字だけ */
function resolveSaidoku(node: AIRTokenNode): SaidokuView | undefined {
  const forms = node.slots.saidoku?.forms;
  if (!forms) return undefined;
  const [first, second] = forms;
  return {
    first,
    second,
    forms,
    n1: safeCssInteger(first?.n ?? 1),
    n2: safeCssInteger(second?.n ?? 2),
    hasSecond: forms.length > 1,
  };
}

// ============================================================================
// Base (本文) の組み立て
// ============================================================================

/**
 * 読み付きの字の HTML を生成（読み仮名のみ、送り仮名・添え仮名は含まない）
 *
 * - 読み仮名(yomigana)はruby要素のrt内に配置（中央揃え）
 * - 送り仮名・添え仮名は renderToken で返り点と一緒に suffix-line コンテナにまとめる
 * - 範囲の読みの場合は字ごとの `base-seg` に分けた本文を使う
 */
// oxlint-disable-next-line eslint/complexity
function renderBaseWithRuby(args: {
  ctx: TokenRenderContext;
  leadId: string;
  texts: readonly string[];
  range: RangeUnit | undefined;
  yomigana: string;
  hiddenRuby: boolean;
  gridEmphasisStyle: string | undefined;
  inHighlight: boolean;
  blockHasRuby: boolean;
  baseClass: 'base' | 'base-seg';
}): string {
  const { ctx, texts, range, yomigana, hiddenRuby, gridEmphasisStyle, baseClass } = args;
  const { prefix, interactive, rubyMethod } = ctx;
  const rubyClass = `${prefix}-ruby`;
  const baseClassName = `${prefix}-${baseClass}`;

  // data属性の構築（interactiveモードの場合のみ）
  // 範囲の読みは data-token-from/to、単一の字は data-token-id
  let dataAttrs = '';
  if (interactive) {
    dataAttrs = range
      ? ` data-token-from="${escapeHtml(range.from)}" data-token-to="${escapeHtml(range.to)}"`
      : ` data-token-id="${escapeHtml(args.leadId)}"`;
  }

  const displayText = texts.join('');
  const baseContent =
    texts.length > 1
      ? texts.map((t) => `<span class="${prefix}-base-seg">${escapeHtml(t)}</span>`).join('')
      : escapeHtml(displayText);

  if (yomigana) {
    if (rubyMethod === 'grid') {
      // grid モード: inline-grid で ruby と base を配置
      // 範囲の字の場合は data 属性を grid コンテナに付与（closest() 互換性のため）
      const gridDataAttrs = range && interactive ? dataAttrs : '';
      const baseDataAttrs = !range ? dataAttrs : '';
      const gridClass = gridEmphasisStyle ? `${prefix}-ruby-grid--emphasis` : `${prefix}-ruby-grid`;
      const emphasisRowHtml = gridEmphasisStyle
        ? `<span class="${prefix}-emphasis-row" aria-hidden="true">${generateEmphasisMarks(displayText, resolveEmphasisCharacter(gridEmphasisStyle))}</span>`
        : '';
      return `<span class="${gridClass}"${gridDataAttrs}>${emphasisRowHtml}${rubyOpenTag('span', rubyClass, prefix, hiddenRuby)}${yomigana}</span><span class="${baseClassName}"${baseDataAttrs}>${baseContent}</span></span>`;
    }
    return `<ruby><rb class="${baseClassName}"${dataAttrs}>${baseContent}</rb>${rubyOpenTag('rt', rubyClass, prefix, hiddenRuby)}${yomigana}</rt></ruby>`;
  } else if (gridEmphasisStyle) {
    // emphasis grid: bare token でも grid 構造で傍点を配置
    // blockHasRuby: ブロック内にルビ付きトークンがある場合は ruby 行付き 4行グリッドで
    // 文字の縦位置を揃える。なければ no-ruby 3行で節約。
    const emphasisRowHtml = `<span class="${prefix}-emphasis-row" aria-hidden="true">${generateEmphasisMarks(displayText, resolveEmphasisCharacter(gridEmphasisStyle))}</span>`;
    if (args.blockHasRuby) {
      return `<span class="${prefix}-ruby-grid--emphasis">${emphasisRowHtml}<span class="${prefix}-ruby"></span><span class="${baseClassName}"${dataAttrs}>${baseContent}</span></span>`;
    }
    return `<span class="${prefix}-ruby-grid--emphasis-no-ruby">${emphasisRowHtml}<span class="${baseClassName}"${dataAttrs}>${baseContent}</span></span>`;
  }
  return `<span class="${baseClassName}"${dataAttrs}>${baseContent}</span>`;
}

/**
 * 再読文字のToken HTMLを生成
 *
 * 入れ子ruby方式: 内側rubyで第1読み、外側rubyで第2読みを配置。
 * 送り仮名はkunと同様にsuffix領域に配置（ルビ内には含めない）。
 *
 * 構造:
 * <ruby class="outer">
 *   <ruby class="inner">將<rt>まさ</rt></ruby>
 *   <rt></rt>  <!-- 第2読みのyomiがあれば入る -->
 * </ruby>
 * + suffix（送り仮名）は呼び出し元で別途処理
 */
// oxlint-disable-next-line eslint/complexity
function renderSaidokuBase(
  node: AIRTokenNode,
  ctx: TokenRenderContext,
  saidoku: SaidokuView,
  gridEmphasisStyle: string | undefined
): string {
  const { prefix, interactive, rubyMethod } = ctx;
  const hiddenFirst = isHiddenSlot(node, 'ruby');
  const hiddenSecond = isHiddenSlot(node, 'saidokuUnder');

  // data-token-id属性（interactiveモードの場合のみ）
  const tokenIdAttr = interactive ? ` data-token-id="${escapeHtml(node.token.id)}"` : '';
  const text = escapeHtml(node.token.text);

  const firstYomi = saidoku.first?.yomi ? annotationText(saidoku.first.yomi, hiddenFirst) : '';
  const secondYomi = saidoku.second?.yomi ? annotationText(saidoku.second.yomi, hiddenSecond) : '';
  const firstHidden = hiddenFirst && firstYomi !== '';
  const secondHidden = hiddenSecond && secondYomi !== '';
  const firstAttr = ` data-saidoku-n="${saidoku.n1}"`;
  const secondAttr = ` data-saidoku-n="${saidoku.n2}"`;

  if (rubyMethod === 'grid') {
    // grid モード: フラットな3行グリッド（ネスト不要）
    const firstRubyHtml = `${rubyOpenTag('span', `${prefix}-ruby`, prefix, firstHidden, firstAttr)}${firstYomi}</span>`;
    const baseHtml = `<span class="${prefix}-base"${tokenIdAttr}>${text}</span>`;
    const emphasisRowHtml = gridEmphasisStyle
      ? `<span class="${prefix}-emphasis-row" aria-hidden="true">${generateEmphasisMarks(node.token.text, resolveEmphasisCharacter(gridEmphasisStyle))}</span>`
      : '';

    if (!saidoku.hasSecond) {
      // 第1読みのみ: 2行グリッド (ruby-grid) で十分
      const gridClass = gridEmphasisStyle ? `${prefix}-ruby-grid--emphasis` : `${prefix}-ruby-grid`;
      return `<span class="${gridClass}">${emphasisRowHtml}${firstRubyHtml}${baseHtml}</span>`;
    }

    const secondRubyHtml = `${rubyOpenTag('span', `${prefix}-ruby ${prefix}-saidoku-under`, prefix, secondHidden, secondAttr)}${secondYomi}</span>`;
    const saidokuGridClass = gridEmphasisStyle
      ? `${prefix}-saidoku-grid--emphasis`
      : `${prefix}-saidoku-grid`;
    return `<span class="${saidokuGridClass}">${emphasisRowHtml}${firstRubyHtml}${baseHtml}${secondRubyHtml}</span>`;
  }

  // ruby モード
  const firstRt = `${rubyOpenTag('rt', `${prefix}-ruby`, prefix, firstHidden, firstAttr)}${firstYomi}</rt>`;
  const innerRuby = `<ruby class="${prefix}-saidoku-inner"><rb class="${prefix}-base"${tokenIdAttr}>${text}</rb>${firstRt}</ruby>`;
  // 第2読みがなければ内側rubyのみ返す
  if (!saidoku.hasSecond) return innerRuby;
  const secondRt = `${rubyOpenTag('rt', `${prefix}-ruby ${prefix}-saidoku-under`, prefix, secondHidden, secondAttr)}${secondYomi}</rt>`;
  return `<ruby class="${prefix}-saidoku-outer">${innerRuby}${secondRt}</ruby>`;
}

/** ヲコト点を生成。格子の座標は AIR が検証済み */
function renderOkototen(
  cell: NonNullable<AIRTokenSlots['okototen']>[number],
  prefix: string,
  inlineStyles: boolean
): string {
  const x = safeCssInteger(cell.x);
  const y = safeCssInteger(cell.y);
  const cols = safeCssInteger(cell.cols);
  const rows = safeCssInteger(cell.rows);

  const styleAttributes = okototenStyleAttributes({ x, y, cols, rows }, inlineStyles);
  return `<span class="${prefix}-okototen" data-shape="${escapeHtml(cell.shape)}"${styleAttributes}></span>`;
}

/** 字の直前に出す ref の上付き文字 */
function renderRefSup(label: string, prefix: string): string {
  const halfWidthClass = shouldApplyTateChuYoko(label) ? ` ${prefix}-ref--half-width` : '';
  return `<sup class="${prefix}-ref${halfWidthClass}">${escapeHtml(label)}</sup>`;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * 字の単位の HTML を生成
 *
 * `nodes` は 1 字、または ruby のグループの字全体 (`options.range` を付ける)。
 * 字全体のとき、各字の slot の注記 (返り点、句読点、ref、置字、助字、傍点) は 1 つの単位に集める。
 *
 * @returns TokenRenderResult - html（token本体）とsuffixHtml（抽出されたsuffix-row）を分離して返す
 * @internal
 */
// oxlint-disable-next-line eslint/complexity
export function renderToken(
  nodes: readonly AIRTokenNode[],
  ctx: TokenRenderContext,
  options: TokenUnitOptions = {}
): TokenRenderResult {
  const { prefix } = ctx;
  const lead = nodes[0]!;
  const range = options.range;
  const inHighlight = options.inHighlight === true;
  const baseClass = options.baseClass ?? 'base';

  const saidokuView = nodes.length === 1 ? resolveSaidoku(lead) : undefined;
  const saidoku = saidokuView !== undefined;

  // 傍点: 最初の字の指定を単位全体に使う
  const emphasisNode = nodes.find((n) => n.slots.emphasis !== undefined);
  const hasEmphasis = emphasisNode !== undefined;
  // 検証を通らない style (型違いを含む) は既定値にする。キーワードか 1 文字のままの値を保持し、
  // CSS 文字列への変換は style-data.ts の出力と applyRenderedStyles でだけ行う
  let resolvedEmphasisStyle: string | undefined;
  if (emphasisNode) {
    resolvedEmphasisStyle = emphasisNode.slots.emphasisStyle ?? DEFAULT_EMPHASIS_STYLE;
  }

  // 読み
  const yomigana = range?.yomigana
    ? annotationText(range.yomigana.value, range.yomigana.hidden)
    : lead.slots.ruby
      ? annotationText(lead.slots.ruby, isHiddenSlot(lead, 'ruby'))
      : '';
  const hiddenRuby = range?.yomigana
    ? range.yomigana.hidden && yomigana !== ''
    : isHiddenSlot(lead, 'ruby') && yomigana !== '';
  const hasYomigana = yomigana !== '';

  // suppressEmphasis: tateten+yomigana 時にグループレベルで emphasis を適用するため、個別トークンでは抑制
  // grid モードで yomigana/saidoku と emphasis が共存する場合、emphasis-row で処理
  // ADR-015: highlight グループ内の bare token でも grid 構造を強制して emphasis-row を使用
  const emphasisHandledByGrid =
    hasEmphasis && ctx.rubyMethod === 'grid' && (hasYomigana || saidoku || inHighlight);
  const gridEmphasisStyle = emphasisHandledByGrid ? resolvedEmphasisStyle : undefined;
  const applyEmphasis = hasEmphasis && !options.suppressEmphasis && !emphasisHandledByGrid;

  // 送り仮名・添え仮名
  // 再読文字: 第1読みは右側（通常の送り仮名位置）、第2読みは左側（返り点位置）
  let okuri = '';
  let soegana = '';
  let saidokuOkuri2 = '';
  for (const node of nodes) {
    const { slots } = node;
    if (saidokuView) {
      // 再読文字: 送り仮名は形ごとに置く。n が 1 の形は通常の位置、それ以外は左の位置
      // (同じ位置に複数あれば後の形が残る)
      for (const form of saidokuView.forms) {
        if (!form.okuri) continue;
        const n = safeCssInteger(form.n);
        const isFirst = n === '1';
        const html = annotationSpan(
          prefix,
          `${prefix}-okuri`,
          form.okuri,
          isHiddenSlot(node, isFirst ? 'okuri' : 'saidokuOkuri2'),
          ` data-saidoku-n="${n}"`
        );
        if (isFirst) okuri = html;
        else saidokuOkuri2 = html;
      }
    } else if (slots.okuri) {
      okuri += annotationSpan(prefix, `${prefix}-okuri`, slots.okuri, isHiddenSlot(node, 'okuri'));
    }
    if (slots.soegana) {
      soegana += annotationSpan(
        prefix,
        `${prefix}-soegana`,
        slots.soegana,
        isHiddenSlot(node, 'soegana')
      );
    }
  }

  // 返り点と句読点: 字ごとの slot を字の順に並べる
  const kaeriten = nodes
    .map((node) =>
      node.slots.kaeri ? kaeritenSpan(prefix, node.slots.kaeri, isHiddenSlot(node, 'kaeri')) : ''
    )
    .join('');
  const kutoten = nodes
    .flatMap((node) =>
      (node.slots.kutotenValues ?? []).map((value) =>
        annotationSpan(prefix, `${prefix}-suffix-kutoten`, value, isHiddenSlot(node, 'kutoten'))
      )
    )
    .join('');

  // suffix-row: 4行グリッドで送り仮名・句読点・返り点・再読2回目送り仮名を配置
  // row1(右): 送り仮名・添え仮名、再読1回目送り仮名
  // row2(右寄り): 句読点（行内サイズ、auto で不在時は潰れる）
  // row3(中央): 返り点
  // row4(左): 再読2回目送り仮名
  const suffixRight = okuri + soegana; // row1
  const suffixCenter = kaeriten; // row3
  const suffixLeft = saidokuOkuri2; // row4

  const hasSuffix = suffixRight || kutoten || suffixCenter || suffixLeft;
  let suffixRowHtml = '';
  let extractedSuffixHtml = '';
  if (hasSuffix) {
    // extractSuffix + interactive: suffix-row を ruby 外に抽出する際、クリックで token を特定できるよう data-suffix-for を付与
    const suffixForAttr =
      options.extractSuffix && ctx.interactive
        ? ` data-suffix-for="${escapeHtml(nodes[nodes.length - 1]!.token.id)}"`
        : '';
    suffixRowHtml = `<span class="${prefix}-suffix-row"${suffixForAttr}>${
      suffixRight ? `<span class="${prefix}-suffix-okuri">${suffixRight}</span>` : ''
    }${kutoten}${
      suffixCenter ? `<span class="${prefix}-suffix-kaeri">${suffixCenter}</span>` : ''
    }${suffixLeft ? `<span class="${prefix}-suffix-saidoku">${suffixLeft}</span>` : ''}</span>`;
    if (options.extractSuffix) {
      extractedSuffixHtml = suffixRowHtml;
      suffixRowHtml = '';
    }
  }

  // 置字・助字
  const isOkimoji = nodes.some((n) => n.slots.isOkimoji === true);
  const isJoji = nodes.some((n) => n.slots.isJoji === true);

  // Token本体のHTML
  const baseHtml = saidokuView
    ? renderSaidokuBase(lead, ctx, saidokuView, gridEmphasisStyle)
    : renderBaseWithRuby({
        ctx,
        leadId: lead.token.id,
        texts: nodes.map((n) => n.token.text),
        range,
        yomigana,
        hiddenRuby,
        gridEmphasisStyle,
        inHighlight,
        blockHasRuby: options.blockHasRuby === true,
        baseClass,
      });

  // ヲコト点追加 (隠すヲコト点は要素を出さない: 点は字の上に重なるので、場所を残す必要が無い)
  const okototenCells = nodes.flatMap((n) => n.slots.okototen ?? []);
  const hasOkototen = okototenCells.length > 0;
  const okototenHtml = okototenCells
    .filter((cell) => cell.hidden !== true)
    .map((cell) => renderOkototen(cell, prefix, ctx.inlineStyles !== false))
    .join('');

  // クラス名構築
  const classes = [`${prefix}-token`];
  if (saidoku) classes.push(`${prefix}-saidoku`);
  if (hasOkototen) classes.push(`${prefix}-has-okototen`);
  if (applyEmphasis) classes.push(`${prefix}-emphasis`);
  if (isOkimoji) classes.push(`${prefix}-okimoji`);
  if (isJoji) classes.push(`${prefix}-joji`);

  // ref 参照（本文中のマーカー）。傍線のラベルになる ref は AIR が slot に入れない
  const refHtml = nodes
    .flatMap((n) => n.slots.refLabels ?? [])
    .map((label) => renderRefSup(label, prefix))
    .join('');

  // data-token-id属性（interactiveモードの場合のみ）
  const tokenIdAttr = ctx.interactive ? ` data-token-id="${escapeHtml(lead.token.id)}"` : '';

  // 傍点スタイル（インラインスタイル、または inlineStyles: false なら data 属性）
  let emphasisInlineStyle = '';
  if (applyEmphasis && resolvedEmphasisStyle) {
    emphasisInlineStyle = emphasisStyleAttributes(
      resolvedEmphasisStyle,
      ctx.inlineStyles !== false
    );
  }

  const result: TokenRenderResult = {
    html: `${refHtml}<span class="${classes.join(' ')}"${tokenIdAttr}${emphasisInlineStyle}>${baseHtml}${okototenHtml}${suffixRowHtml}</span>`,
    suffixHtml: extractedSuffixHtml,
  };
  if (resolvedEmphasisStyle) {
    result.emphasisStyle = resolvedEmphasisStyle;
  }
  return result;
}
