/**
 * SKAM HTML Renderer - Token Rendering
 *
 * Display実装層: 単一トークンのHTML生成。
 * 依存: 基盤層（render-config, html-utils）+ @kanbun-skam/skam + @kanbun-skam/skam/rendering
 * renderer.ts (API層) を参照しない。
 */

import type {
  Token,
  Mark,
  KaeriMark,
  OkuriganaMark,
  YomiganaMark,
  OkimojiMark,
  JojiMark,
  SoeganaMark,
  KutotenMark,
  EmphasisMark,
  SaidokuMark,
  OkototenMark,
  RefMark,
} from '@kanbun-skam/skam';
import { KAERI } from '@kanbun-skam/skam';
import { resolveEmphasisCharacter, getMarksForToken } from '@kanbun-skam/skam/rendering';
import type { RenderProfile, RubyMethod } from './render-config.js';
import { escapeHtml, generateEmphasisMarks, shouldApplyTateChuYoko } from './html-utils.js';
import type { RangeMarkContext, RangeTokenInfo, TokenRenderResult } from './render-tree-types.js';

// ============================================================================
// Types
// ============================================================================

/** @internal */
export interface TokenRenderContext {
  prefix: string;
  profile: RenderProfile;
  tokens: Token[];
  tokenMarks: Map<Mark['type'], Mark[]>;
  interactive: boolean;
  rubyMethod: RubyMethod;
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * ルビ付きのToken HTMLを生成（読み仮名のみ、送り仮名・添え仮名は含まない）
 *
 * - 読み仮名(yomigana)はruby要素のrt内に配置（中央揃え）
 * - 送り仮名・添え仮名はrenderTokenで返り点と一緒にsuffix-lineコンテナにまとめる
 * - 熟語ルビ（範囲yomigana）の場合はbaseTextを使用
 */
function renderTokenWithRuby(
  token: Token,
  ctx: TokenRenderContext,
  baseText?: string,
  rangeInfo?: RangeTokenInfo,
  suppressYomigana?: boolean,
  gridEmphasisStyle?: string,
  blockHasRuby?: boolean,
  tokenTexts?: string[]
): string {
  const { prefix, profile, tokenMarks, interactive, rubyMethod } = ctx;

  // 読み仮名（ruby要素のrt内に配置、中央揃え）
  // suppressYomigana: tateten グループレベルで yomigana が処理される場合、個別トークンの ruby を抑制
  const yomiganaMarks = (tokenMarks.get('yomigana') ?? []) as YomiganaMark[];
  const yomigana =
    !suppressYomigana && profile.yomigana && yomiganaMarks.length > 0
      ? yomiganaMarks.map((m) => escapeHtml(m.value)).join('')
      : '';

  // data属性の構築（interactiveモードの場合のみ）
  // 熟語ルビ（範囲マーク）の場合はdata-token-from/toを使用、単一トークンの場合はdata-token-idを使用
  let dataAttrs = '';
  if (interactive) {
    dataAttrs = rangeInfo
      ? ` data-token-from="${escapeHtml(rangeInfo.from)}" data-token-to="${escapeHtml(rangeInfo.to)}"`
      : ` data-token-id="${escapeHtml(token.id)}"`;
  }

  // ルビ（読み仮名）が必要な場合
  // 熟語ルビの場合はbaseTextを使用
  const displayText = baseText ?? token.text;
  const baseContent = escapeHtml(displayText);
  if (yomigana) {
    if (rubyMethod === 'grid') {
      // grid モード: inline-grid で ruby と base を配置
      // 範囲トークンの場合は data 属性を grid コンテナに付与（closest() 互換性のため）
      const gridDataAttrs =
        rangeInfo && interactive
          ? ` data-token-from="${escapeHtml(rangeInfo.from)}" data-token-to="${escapeHtml(rangeInfo.to)}"`
          : '';
      const baseDataAttrs = !rangeInfo ? dataAttrs : '';
      const gridClass = gridEmphasisStyle ? `${prefix}-ruby-grid--emphasis` : `${prefix}-ruby-grid`;
      const emphasisRowHtml = gridEmphasisStyle
        ? `<span class="${prefix}-emphasis-row" aria-hidden="true">${generateEmphasisMarks(displayText, resolveEmphasisCharacter(gridEmphasisStyle))}</span>`
        : '';
      // multi-token range: 個別 token テキストを <span class="skam-base-seg"> に分割し、
      // CSS margin で inter-character spacing を確保。letter-spacing: 0 は維持してルビ中央寄せを保護。
      const segmentedBaseContent =
        tokenTexts && tokenTexts.length > 1
          ? tokenTexts
              .map((t) => `<span class="${prefix}-base-seg">${escapeHtml(t)}</span>`)
              .join('')
          : baseContent;
      return `<span class="${gridClass}"${gridDataAttrs}>${emphasisRowHtml}<span class="${prefix}-ruby">${yomigana}</span><span class="${prefix}-base"${baseDataAttrs}>${segmentedBaseContent}</span></span>`;
    }
    return `<ruby><rb class="${prefix}-base"${dataAttrs}>${baseContent}</rb><rt class="${prefix}-ruby">${yomigana}</rt></ruby>`;
  } else if (gridEmphasisStyle) {
    // emphasis grid: bare token でも grid 構造で傍点を配置
    // blockHasRuby: ブロック内にルビ付きトークンがある場合は ruby 行付き 4行グリッドで
    // 文字の縦位置を揃える。なければ no-ruby 3行で節約。
    const emphasisRowHtml = `<span class="${prefix}-emphasis-row" aria-hidden="true">${generateEmphasisMarks(displayText, resolveEmphasisCharacter(gridEmphasisStyle))}</span>`;
    if (blockHasRuby) {
      return `<span class="${prefix}-ruby-grid--emphasis">${emphasisRowHtml}<span class="${prefix}-ruby"></span><span class="${prefix}-base"${dataAttrs}>${baseContent}</span></span>`;
    }
    return `<span class="${prefix}-ruby-grid--emphasis-no-ruby">${emphasisRowHtml}<span class="${prefix}-base"${dataAttrs}>${baseContent}</span></span>`;
  } else {
    return `<span class="${prefix}-base"${dataAttrs}>${baseContent}</span>`;
  }
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
function renderSaidokuToken(
  token: Token,
  saidokuMark: SaidokuMark,
  ctx: TokenRenderContext,
  gridEmphasisStyle?: string
): string {
  const { prefix, profile, interactive, rubyMethod } = ctx;

  // data-token-id属性（interactiveモードの場合のみ）
  const tokenIdAttr = interactive ? ` data-token-id="${escapeHtml(token.id)}"` : '';

  if (!profile.saidoku) {
    return `<span class="${prefix}-base"${tokenIdAttr}>${escapeHtml(token.text)}</span>`;
  }

  const forms = saidokuMark.forms;
  const firstForm = forms[0];
  const secondForm = forms[1];

  if (rubyMethod === 'grid') {
    // grid モード: フラットな3行グリッド（ネスト不要）
    const firstN = firstForm?.n ?? 1;
    const firstYomi = profile.yomigana && firstForm?.yomi ? escapeHtml(firstForm.yomi) : '';
    const firstRubyHtml = `<span class="${prefix}-ruby" data-saidoku-n="${firstN}">${firstYomi}</span>`;
    const baseHtml = `<span class="${prefix}-base"${tokenIdAttr}>${escapeHtml(token.text)}</span>`;
    const emphasisRowHtml = gridEmphasisStyle
      ? `<span class="${prefix}-emphasis-row" aria-hidden="true">${generateEmphasisMarks(token.text, resolveEmphasisCharacter(gridEmphasisStyle))}</span>`
      : '';

    if (!secondForm) {
      // 第1読みのみ: 2行グリッド (ruby-grid) で十分
      const gridClass = gridEmphasisStyle ? `${prefix}-ruby-grid--emphasis` : `${prefix}-ruby-grid`;
      return `<span class="${gridClass}">${emphasisRowHtml}${firstRubyHtml}${baseHtml}</span>`;
    }

    const n2 = secondForm.n ?? 2;
    const yomi2 = profile.yomigana && secondForm.yomi ? escapeHtml(secondForm.yomi) : '';
    const secondRubyHtml = `<span class="${prefix}-ruby ${prefix}-saidoku-under" data-saidoku-n="${n2}">${yomi2}</span>`;
    const saidokuGridClass = gridEmphasisStyle
      ? `${prefix}-saidoku-grid--emphasis`
      : `${prefix}-saidoku-grid`;

    return `<span class="${saidokuGridClass}">${emphasisRowHtml}${firstRubyHtml}${baseHtml}${secondRubyHtml}</span>`;
  }

  // ruby モード（既存）
  // 第1読み用のrt（読み仮名のみ、送り仮名は含めない）
  // 読み仮名の表示はprofile.yomiganaに従う
  let firstRt = '';
  if (firstForm) {
    const n = firstForm.n ?? 1;
    const yomi = profile.yomigana && firstForm.yomi ? escapeHtml(firstForm.yomi) : '';
    firstRt = `<rt class="${prefix}-ruby" data-saidoku-n="${n}">${yomi}</rt>`;
  }

  // 内側ruby（第1読み）- rb要素にdata-token-idを付与
  const innerRuby = `<ruby class="${prefix}-saidoku-inner"><rb class="${prefix}-base"${tokenIdAttr}>${escapeHtml(token.text)}</rb>${firstRt}</ruby>`;

  // 第2読みがなければ内側rubyのみ返す
  if (!secondForm) {
    return innerRuby;
  }

  // 第2読み用のrt（読み仮名のみ、送り仮名は含めない）
  // 読み仮名の表示はprofile.yomiganaに従う
  const n2 = secondForm.n ?? 2;
  const yomi2 = profile.yomigana && secondForm.yomi ? escapeHtml(secondForm.yomi) : '';
  const secondRt = `<rt class="${prefix}-ruby ${prefix}-saidoku-under" data-saidoku-n="${n2}">${yomi2}</rt>`;

  // 外側ruby（第2読み）で内側rubyを包む
  return `<ruby class="${prefix}-saidoku-outer">${innerRuby}${secondRt}</ruby>`;
}

/**
 * ヲコト点を生成
 */
function renderOkototen(okototenMark: OkototenMark, prefix: string): string {
  const { position, shape } = okototenMark;
  const gridSize = parseInt(position.grid.split('x')[0] ?? '5', 10);

  return `<span class="${prefix}-okototen" data-shape="${escapeHtml(shape)}" style="--okototen-x: ${position.x}; --okototen-y: ${position.y}; --okototen-grid: ${gridSize};"></span>`;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * 単一TokenのHTMLを生成
 *
 * @returns TokenRenderResult - html（token本体）とsuffixHtml（抽出されたsuffix-row）を分離して返す
 * @internal
 */
// oxlint-disable-next-line eslint/complexity
export function renderToken(
  token: Token,
  marks: Mark[],
  ctx: Omit<TokenRenderContext, 'tokenMarks'>,
  rangeCtx?: RangeMarkContext,
  refValueMap?: Map<RefMark, string>,
  highlightRefIds?: Set<string>,
  extractTatetenKaeri?: boolean,
  suppressYomigana?: boolean,
  extractSuffix?: boolean,
  suppressEmphasis?: boolean
): TokenRenderResult {
  const { prefix, profile } = ctx;
  const tokenMarks = getMarksForToken(token.id, marks, ctx.tokens);

  const fullCtx: TokenRenderContext = { ...ctx, tokenMarks };

  // 再読文字チェック
  const saidokuMarks = (tokenMarks.get('saidoku') ?? []) as SaidokuMark[];
  const saidokuMark = saidokuMarks[0];

  // 傍点チェック（trailing marks を合算）
  const emphasisMarks = (tokenMarks.get('emphasis') ?? []) as EmphasisMark[];
  const allEmphasisMarks = [...emphasisMarks, ...(rangeCtx?.trailingEmphasisMarks ?? [])];
  const hasEmphasis = profile.emphasis && allEmphasisMarks.length > 0;
  const resolvedEmphasisStyle = hasEmphasis
    ? (allEmphasisMarks[0]?.style ?? 'filled dot')
    : undefined;
  // suppressEmphasis: tateten+yomigana 時にグループレベルで emphasis を適用するため、個別トークンでは抑制
  // grid モードで yomigana/saidoku と emphasis が共存する場合、emphasis-row で処理
  // ADR-015: highlight グループ内の bare token でも grid 構造を強制して emphasis-row を使用
  const yomiganaMarks = (tokenMarks.get('yomigana') ?? []) as YomiganaMark[];
  const hasYomigana = !suppressYomigana && profile.yomigana && yomiganaMarks.length > 0;
  const inHighlight = !!rangeCtx?.inHighlightGroup;
  const emphasisHandledByGrid =
    hasEmphasis && ctx.rubyMethod === 'grid' && (hasYomigana || !!saidokuMark || inHighlight);
  const gridEmphasisStyle = emphasisHandledByGrid ? resolvedEmphasisStyle : undefined;
  const applyEmphasis = hasEmphasis && !suppressEmphasis && !emphasisHandledByGrid;

  // ヲコト点チェック
  const okototenMarks = (tokenMarks.get('okototen') ?? []) as OkototenMark[];
  const hasOkototen = profile.okototen && okototenMarks.length > 0;

  // 送り仮名（再読文字の場合はformsから取得）
  // 再読文字の場合: 第1読みは右側（通常の送り仮名位置）、第2読みは左側（返り点位置）
  // 送り仮名の表示はprofile.okuriganaに従う（profile.saidokuとは独立）
  let saidokuOkuri1 = ''; // 第1読みの送り仮名（右側）
  let saidokuOkuri2 = ''; // 第2読みの送り仮名（左側、返り点と同じ位置）
  let okurigana = '';
  if (profile.okurigana) {
    if (saidokuMark) {
      // 再読文字の場合: formsから送り仮名を取得
      for (const form of saidokuMark.forms) {
        if (form.okuri) {
          const n = form.n ?? saidokuMark.forms.indexOf(form) + 1;
          const okuriHtml = `<span class="${prefix}-okuri" data-saidoku-n="${n}">${escapeHtml(form.okuri)}</span>`;
          if (n === 1) {
            saidokuOkuri1 = okuriHtml;
          } else {
            saidokuOkuri2 = okuriHtml;
          }
        }
      }
    } else {
      // 通常のToken: okuriganaMarksから取得、または範囲グループの値を使用
      const okuriganaMarks = (tokenMarks.get('okurigana') ?? []) as OkuriganaMark[];
      if (okuriganaMarks.length > 0) {
        okurigana = `<span class="${prefix}-okuri">${okuriganaMarks.map((m) => escapeHtml(m.value)).join('')}</span>`;
      } else if (rangeCtx?.okuriganaValue) {
        // 範囲okuriganaグループの値を使用
        okurigana = `<span class="${prefix}-okuri">${escapeHtml(rangeCtx.okuriganaValue)}</span>`;
      }
    }
  }

  // 添え仮名
  const soeganaMarks = (tokenMarks.get('soegana') ?? []) as SoeganaMark[];
  let soegana = '';
  if (profile.soegana) {
    if (soeganaMarks.length > 0) {
      soegana = `<span class="${prefix}-soegana">${soeganaMarks.map((m) => escapeHtml(m.value)).join('')}</span>`;
    } else if (rangeCtx?.soeganaValue) {
      // 範囲soeganaグループの値を使用
      soegana = `<span class="${prefix}-soegana">${escapeHtml(rangeCtx.soeganaValue)}</span>`;
    }
  }

  // 返り点（現在のトークン + 範囲グループ後続トークンの返り点）
  // extractTatetenKaeri=true の場合、非レ返り点を tatetenKaeriHtml に分離
  const kaeriMarks = (tokenMarks.get('kaeri') ?? []) as KaeriMark[];
  const allKaeriMarks = [...kaeriMarks, ...(rangeCtx?.trailingKaeriMarks ?? [])];

  // extractTatetenKaeri=true の場合、返り点を suffix（レ部分）と separator（非レ部分）に分離
  // 複合返り点（一レ等）は分割: レ→suffix、非レ→separator
  let kaeriten = '';
  let tatetenKaeriHtml = '';
  if (extractTatetenKaeri && profile.kaeriten) {
    const suffixParts: string[] = [];
    const separatorParts: string[] = [];
    for (const m of allKaeriMarks) {
      const hasRe = m.value.includes(KAERI.RE);
      const nonRePart = m.value.replace(new RegExp(KAERI.RE, 'g'), '');
      if (hasRe) {
        suffixParts.push(`<span class="${prefix}-kaeriten" aria-hidden="true">${KAERI.RE}</span>`);
      }
      if (nonRePart) {
        separatorParts.push(
          `<span class="${prefix}-kaeriten" aria-hidden="true">${nonRePart}</span>`
        );
      }
    }
    kaeriten = suffixParts.join('');
    tatetenKaeriHtml = separatorParts.join('');
  } else if (profile.kaeriten && allKaeriMarks.length > 0) {
    kaeriten = allKaeriMarks
      .map((m) => `<span class="${prefix}-kaeriten" aria-hidden="true">${m.value}</span>`)
      .join('');
  }

  // 句読点（現在のトークン + 範囲グループ後続トークンの句読点）
  const kutotenMarks = (tokenMarks.get('kutoten') ?? []) as KutotenMark[];
  const allKutotenMarks = [...kutotenMarks, ...(rangeCtx?.trailingKutotenMarks ?? [])];
  const kutoten =
    profile.kutoten && allKutotenMarks.length > 0
      ? allKutotenMarks
          .map((m) => `<span class="${prefix}-suffix-kutoten">${escapeHtml(m.value)}</span>`)
          .join('')
      : '';

  // suffix-row: 4行グリッドで送り仮名・句読点・返り点・再読2回目送り仮名を配置
  // row1(右): 送り仮名・添え仮名、再読1回目送り仮名
  // row2(右寄り): 句読点（行内サイズ、auto で不在時は潰れる）
  // row3(中央): 返り点
  // row4(左): 再読2回目送り仮名
  const suffixRight = (saidokuOkuri1 || okurigana) + soegana; // row1
  const suffixCenter = kaeriten; // row3
  const suffixLeft = saidokuOkuri2; // row4

  const hasSuffix = suffixRight || kutoten || suffixCenter || suffixLeft;
  let suffixRowHtml = '';
  let extractedSuffixHtml = '';
  if (hasSuffix) {
    // extractSuffix + interactive: suffix-row を ruby 外に抽出する際、クリックで token を特定できるよう data-suffix-for を付与
    const suffixForAttr =
      extractSuffix && ctx.interactive ? ` data-suffix-for="${escapeHtml(token.id)}"` : '';
    suffixRowHtml = `<span class="${prefix}-suffix-row"${suffixForAttr}>${
      suffixRight ? `<span class="${prefix}-suffix-okuri">${suffixRight}</span>` : ''
    }${kutoten}${
      suffixCenter ? `<span class="${prefix}-suffix-kaeri">${suffixCenter}</span>` : ''
    }${suffixLeft ? `<span class="${prefix}-suffix-saidoku">${suffixLeft}</span>` : ''}</span>`;
    if (extractSuffix) {
      extractedSuffixHtml = suffixRowHtml;
      suffixRowHtml = '';
    }
  }

  // 置字チェック（trailing marks を合算）
  const okimojiMarks = (tokenMarks.get('okimoji') ?? []) as OkimojiMark[];
  const isOkimoji =
    profile.okimoji &&
    (okimojiMarks.length > 0 || (rangeCtx?.trailingOkimojiMarks ?? []).length > 0);

  // 助字チェック（trailing marks を合算）
  const jojiMarks = (tokenMarks.get('joji') ?? []) as JojiMark[];
  const isJoji =
    profile.joji && (jojiMarks.length > 0 || (rangeCtx?.trailingJojiMarks ?? []).length > 0);

  // Token本体のHTML
  let baseHtml: string;

  // 範囲グループのベーステキストを決定（優先順位: yomigana > okurigana > soegana）
  const rangeBaseText =
    rangeCtx?.yomiganaBaseText ?? rangeCtx?.okuriganaBaseText ?? rangeCtx?.soeganaBaseText;

  if (saidokuMark) {
    baseHtml = renderSaidokuToken(token, saidokuMark, fullCtx, gridEmphasisStyle);
  } else {
    // 範囲グループがある場合は熟語全体のテキストを使用し、範囲情報も渡す
    baseHtml = renderTokenWithRuby(
      token,
      fullCtx,
      rangeBaseText,
      rangeCtx?.rangeTokenInfo,
      suppressYomigana,
      gridEmphasisStyle,
      rangeCtx?.blockHasRuby,
      rangeCtx?.tokenTexts
    );
  }

  // ヲコト点追加
  let okototenHtml = '';
  if (hasOkototen) {
    okototenHtml = okototenMarks.map((m) => renderOkototen(m, prefix)).join('');
  }

  // クラス名構築
  const classes = [`${prefix}-token`];
  if (saidokuMark && profile.saidoku) {
    classes.push(`${prefix}-saidoku`);
  }
  if (hasOkototen) {
    classes.push(`${prefix}-has-okototen`);
  }
  if (applyEmphasis) {
    classes.push(`${prefix}-emphasis`);
  }
  if (isOkimoji) {
    classes.push(`${prefix}-okimoji`);
  }
  if (isJoji) {
    classes.push(`${prefix}-joji`);
  }

  // ref 参照（本文中のマーカー）
  // regionから参照されているrefはregion終端で出力するのでここではスキップ
  // 範囲グループ後続トークンのrefも含める
  let refHtml = '';
  if (profile.ref && refValueMap) {
    const refMarks = (tokenMarks.get('ref') ?? []) as RefMark[];
    const allRefMarks = [...refMarks, ...(rangeCtx?.trailingRefMarks ?? [])];
    if (allRefMarks.length > 0) {
      refHtml = allRefMarks
        .filter((m) => !highlightRefIds || !m.id || !highlightRefIds.has(m.id))
        .map((m) => {
          const refText = refValueMap.get(m) ?? '';
          if (refText) {
            const halfWidthClass = shouldApplyTateChuYoko(refText)
              ? ` ${prefix}-ref--half-width`
              : '';
            return `<sup class="${prefix}-ref${halfWidthClass}">${escapeHtml(refText)}</sup>`;
          } else if (m.content) {
            // contentのみの場合: 注釈アイコンを表示
            return `<sup class="${prefix}-ref ${prefix}-ref--content-only">*</sup>`;
          }
          return '';
        })
        .join('');
    }
  }

  // data-token-id属性（interactiveモードの場合のみ）
  const tokenIdAttr = ctx.interactive ? ` data-token-id="${escapeHtml(token.id)}"` : '';

  // 傍点スタイル（インラインスタイル、デフォルト: filled dot）
  let emphasisInlineStyle = '';
  if (applyEmphasis && resolvedEmphasisStyle) {
    emphasisInlineStyle = ` style="text-emphasis-style: ${escapeHtml(resolvedEmphasisStyle)};"`;
  }

  const result: TokenRenderResult = {
    html: `${refHtml}<span class="${classes.join(' ')}"${tokenIdAttr}${emphasisInlineStyle}>${baseHtml}${okototenHtml}${suffixRowHtml}</span>`,
    tatetenKaeriHtml,
    suffixHtml: extractedSuffixHtml,
  };
  if (resolvedEmphasisStyle) {
    result.emphasisStyle = resolvedEmphasisStyle;
  }
  return result;
}
