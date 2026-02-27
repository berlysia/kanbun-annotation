/**
 * SKAM HTML Renderer - Default CSS Styles
 */

import { css } from './css-tag.js';
import type { CopyableElement, RubyMethod } from './render-config.js';
import type { Spacing } from '@kanbun/skam/rendering';
import { resolveSpacingEm } from '@kanbun/skam/rendering';

export type { CopyableElement, RubyMethod } from './render-config.js';

export interface StyleOptions {
  /** CSSクラス名プレフィックス（default: 'skam'） */
  classPrefix?: string;
  /** 書字方向（'vertical' | 'horizontal' | 'both'） */
  writingMode?: 'vertical' | 'horizontal' | 'both';
  /** インラインモード用スタイルを含めるか */
  inline?: boolean;
  /** @layer でラップするか（default: true） */
  useLayer?: boolean;
  /** @layer のレイヤー名（default: 'skam-kanbun'） */
  layerName?: string;
  /** CSS Variables のプレフィックス（default: 'skam'） */
  variablePrefix?: string;
  /**
   * Ruby要素のレンダリング方式（default: 'ruby'）
   *
   * - 'ruby': ruby要素用CSS
   * - 'grid': inline-grid用CSS
   * - 'both': 両方のCSSを出力
   */
  rubyMethod?: RubyMethod | 'both';
  /**
   * 字間スペーシング（アキ組み）
   *
   * - 'solid': ベタ組み（アキなし、デフォルト）
   * - 'quarter': 四分アキ（0.25em）
   * - 'half': 二分アキ（0.5em）
   * - number: 任意の em 値（0以上、負の値は0にクランプ）
   */
  spacing?: Spacing;
}

/**
 * Generate default CSS styles for SKAM HTML output
 *
 * @param options - スタイル生成オプション
 * @param options.classPrefix - CSSクラス名プレフィックス（default: 'skam'）
 * @param options.writingMode - 書字方向（'vertical' | 'horizontal' | 'both'）
 * @param options.inline - インラインモード用スタイルを含めるか
 * @param options.useLayer - @layer でラップするか（default: true）
 * @param options.layerName - @layer のレイヤー名（default: 'skam-kanbun'）
 * @param options.variablePrefix - CSS Variables のプレフィックス（default: 'skam'）
 */
export function getDefaultStyles(options: StyleOptions = {}): string {
  const prefix = options.classPrefix ?? 'skam';
  const vp = options.variablePrefix ?? 'skam';
  const writingMode = options.writingMode ?? 'vertical';
  const inline = options.inline ?? false;
  const useLayer = options.useLayer ?? true;
  const layerName = options.layerName ?? 'skam-kanbun';
  const rubyMethod = options.rubyMethod ?? 'grid';
  const spacingEm = resolveSpacingEm(options.spacing);
  const letterSpacingValue = `${spacingEm}em`;

  const commonStyles = generateCommonStyles(prefix, vp, rubyMethod, letterSpacingValue);
  const inlineStyles = inline ? generateInlineStyles(prefix) : '';

  let result: string;

  if (writingMode === 'both') {
    // 縦書き・横書き両方のスタイルを data-writing-mode セレクタでラップして出力
    const verticalStyles = generateWritingModeStyles(prefix, true, rubyMethod, vp);
    const horizontalStyles = generateWritingModeStyles(prefix, false, rubyMethod, vp);

    result = `${commonStyles}

/* Vertical Writing Mode */
:where(.${prefix}-document[data-writing-mode="vertical"]) {
  writing-mode: vertical-rl;
  text-orientation: mixed;
}

${wrapWithSelector(`[data-writing-mode="vertical"]`, prefix, verticalStyles)}

/* Horizontal Writing Mode */
${wrapWithSelector(`[data-writing-mode="horizontal"]`, prefix, horizontalStyles)}
${inlineStyles}`.trim();
  } else {
    // 単一の書字方向のみ出力（data-writing-mode セレクタ不要）
    const isVertical = writingMode === 'vertical';
    const writingModeStyles = generateWritingModeStyles(prefix, isVertical, rubyMethod, vp);
    const documentWritingMode = isVertical
      ? `
:where(.${prefix}-document) {
  writing-mode: vertical-rl;
  text-orientation: mixed;
}`
      : '';

    result = `${commonStyles}
${documentWritingMode}
${writingModeStyles}
${inlineStyles}`.trim();
  }

  // @layer でラップ
  if (useLayer) {
    return `@layer ${layerName} {\n${result}\n}`;
  }

  return result;
}

/**
 * 共通スタイル（書字方向に依存しない）
 */
function generateCommonStyles(
  prefix: string,
  vp: string,
  rubyMethod: RubyMethod | 'both' = 'grid',
  letterSpacingValue = '0em'
): string {
  const includeRuby = rubyMethod === 'ruby' || rubyMethod === 'both';
  const includeGrid = rubyMethod === 'grid' || rubyMethod === 'both';

  // Annotation row height (ruby-ratio * 1em)
  const annotationRowH = `calc(var(--${vp}-ruby-ratio) * 1em)`;
  const halfAnnotationRowH = `calc(var(--${vp}-ruby-ratio) * 0.5em)`;

  // Font sizes
  const okototenFontSize = '0.3em';
  const refFontSize = '0.7em';
  const notesFontSize = '0.9em';

  // Notes spacing
  const notesMarginTop = '1em';
  const notesPaddingTop = '1em';
  const noteItemSpacing = '0.5em';
  const noteMarkerGap = '0.5em';

  // Selection
  const selectionOutlineWidth = '2px';
  const selectionOutlineOffset = '-1px';

  const rubyStyles = includeRuby
    ? css`
        /* Ruby styling */
        :where(.${prefix}-token ruby) {
          ruby-align: center;
          block-size: 1em;
        }
      `
    : '';

  const gridStyles = includeGrid
    ? css`
        /*
 * Ruby Grid (inline-grid 代替パターン)
 *
 * 2行グリッド: row1=ruby, row2=base
 * vertical-align: Chromium baseline バグ補正 (suffix-row と同形式)
 */
        :where(.${prefix}-ruby-grid) {
          display: inline-grid;
          grid-template-areas: 'ruby suffix' 'base .' '. .';
          grid-template-rows: ${annotationRowH} auto ${annotationRowH};
          grid-template-columns: auto auto;
          line-height: 1;
          /* アキ分の inline size を padding で確保。base の letter-spacing を遮断しても
           * grid 全体の inline size は glyph + LS を維持し、spacing absorption を保つ。 */
          padding-inline-end: var(--${vp}-letter-spacing);
          vertical-align: calc(
            var(--${vp}-grid-baseline-fix, 0) * (var(--${vp}-ruby-ratio) * 0.5em + 0.5em)
          );
        }

        /* Chromium baseline バグ補正: ruby 行にプレースホルダーを配置してベースラインを安定させる */
        :where(.${prefix}-ruby-grid)::before {
          content: '';
          grid-area: ruby;
        }

        /* ruby に内容がある場合はプレースホルダー不要（:not(:empty) で空 ruby を除外）
         *
         * フォールバック不要の根拠:
         * - ::before(content:'') と .ruby が同一 grid-row に共存しても、
         *   空コンテンツの暗黙列は auto sizing で幅 0 に解決され、column-gap も未設定のため視覚的影響なし
         * - ::before の本来の目的は Chromium baseline バグ補正だが、
         *   :has() 未対応ブラウザ (Firefox <121, Safari <15.4) は非 Chromium でありバグが存在しない */
        @supports selector(:has(a)) {
          :where(.${prefix}-ruby-grid:has(> .${prefix}-ruby:not(:empty)))::before {
            display: none;
          }
        }

        :where(.${prefix}-ruby-grid) > :where(.${prefix}-ruby) {
          grid-area: ruby;
          align-self: end;
          text-align: center;
        }

        :where(.${prefix}-ruby-grid) > :where(.${prefix}-base),
        :where(.${prefix}-ruby-grid) > :where(.${prefix}-tateten-group) {
          grid-area: base;
          /* letter-spacing の継承を遮断: base の LS による grid column 膨張を防止。
           * LS を含むと ruby/emphasis の text-align:center がアキまで含んだ範囲で
           * センタリングされ、文字位置からズレる。 */
          letter-spacing: 0;
        }

        /* 熟語訓: suffix-row を ruby-grid 内に配置して改行機会を排除する。
         * suffix 領域に配置し、ruby annotation の下に被らないようにする。 */
        :where(.${prefix}-ruby-grid) > :where(.${prefix}-suffix-row) {
          grid-area: suffix;
        }

        /* 熟語訓 + highlight: highlight を ruby-grid 内に grid item として配置。
         * highlight の傍線装飾が suffix（句読点等）に延びるのを防ぐため、
         * suffix 領域と分離して base 領域に配置する。
         * padding リセットは書字方向スタイルの後に配置（source order で確実にオーバーライド）。 */
        :where(.${prefix}-ruby-grid) > :where(.${prefix}-highlight) {
          grid-area: base;
        }

        /*
 * Saidoku Grid (inline-grid 代替パターン)
 *
 * 3行グリッド: row1=ruby-over, row2=base, row3=ruby-under
 * vertical-align: Chromium baseline バグ補正 (suffix-row と同形式)
 */
        :where(.${prefix}-saidoku-grid) {
          display: inline-grid;
          grid-template-areas: 'ruby-over' 'base' 'ruby-under';
          grid-template-rows: ${annotationRowH} auto ${annotationRowH};
          line-height: 1;
          padding-inline-end: var(--${vp}-letter-spacing);
          vertical-align: calc(
            var(--${vp}-grid-baseline-fix, 0) * (var(--${vp}-ruby-ratio) * 0.5em + 0.5em)
          );
        }

        /* Chromium baseline バグ補正: ruby-over 行にプレースホルダーを配置してベースラインを安定させる */
        :where(.${prefix}-saidoku-grid)::before {
          content: '';
          grid-area: ruby-over;
        }

        /* ruby-over に内容がある場合はプレースホルダー不要（:not(:empty) で空 ruby を除外）
         *
         * フォールバック不要の根拠:
         * - ::before(content:'') と .ruby が同一 grid-row に共存しても、
         *   空コンテンツの暗黙列は auto sizing で幅 0 に解決され、column-gap も未設定のため視覚的影響なし
         * - ::before の本来の目的は Chromium baseline バグ補正だが、
         *   :has() 未対応ブラウザ (Firefox <121, Safari <15.4) は非 Chromium でありバグが存在しない */
        @supports selector(:has(a)) {
          :where(.${prefix}-saidoku-grid:has(> .${prefix}-ruby:first-child:not(:empty)))::before {
            display: none;
          }
        }

        :where(.${prefix}-saidoku-grid) > :where(.${prefix}-ruby:not(.${prefix}-saidoku-under)) {
          grid-area: ruby-over;
          align-self: end;
          text-align: center;
        }

        :where(.${prefix}-saidoku-grid) > :where(.${prefix}-base) {
          grid-area: base;
          letter-spacing: 0;
        }

        :where(.${prefix}-saidoku-grid) > :where(.${prefix}-saidoku-under) {
          grid-area: ruby-under;
          align-self: start;
          text-align: center;
        }

        /*
 * Emphasis Row (emphasis + ruby 共存時の傍点専用行)
 *
 * Grid モードで yomigana と emphasis が共存する場合、
 * text-emphasis が ruby 行と重なるのを防ぐため、独立した行に傍点マーク文字を直接配置する。
 * 透明テキスト + text-emphasis-style 方式では不可視文字分の空白が生じるため、
 * 傍点文字（●, ﹅ 等）を直接出力する。
 */
        :where(.${prefix}-emphasis-row) {
          grid-area: emphasis;
          color: var(--${vp}-color-emphasis);
          font-size: ${annotationRowH};
          -webkit-user-select: none;
          user-select: none;
          align-self: end;
          text-align: center;
          /* letter-spacing の継承を遮断（傍点内部の字間にアキは不要） */
          letter-spacing: 0;
        }

        /*
 * tateten-sep 相当のスペーサー（emphasis-row 内でトークン間の傍点位置を揃える）
 *
 * 中心間距離の一致条件: token(1em) + sep(r*1em) - dot(r*1em) = 1em (glyph-size 定数)
 * emphasis context (font-size = r*1em) 換算: 1em_glyph / r = calc(1em / ruby-ratio)
 */
        :where(.${prefix}-emphasis-spacer) {
          display: inline-block;
          inline-size: calc(1em / var(--${vp}-ruby-ratio));
        }

        /*
 * Ruby Grid - Emphasis Variant (4行グリッド)
 *
 * row1: emphasis, row2: ruby, row3: base/tateten-group
 * emphasis-row が必ず row1 を占めるため ::before プレースホルダーは不要
 */
        :where(.${prefix}-ruby-grid--emphasis) {
          display: inline-grid;
          grid-template-areas: 'emphasis .' 'ruby suffix' 'base .' '. .';
          grid-template-rows: ${annotationRowH} ${annotationRowH} auto ${annotationRowH};
          grid-template-columns: auto auto;
          line-height: 1;
          padding-inline-end: var(--${vp}-letter-spacing);
          vertical-align: calc(
            var(--${vp}-ruby-ratio) * 0.5em + var(--${vp}-grid-baseline-fix, 0) * 1em
          );
        }

        :where(.${prefix}-ruby-grid--emphasis) > :where(.${prefix}-ruby) {
          grid-area: ruby;
          align-self: end;
          text-align: center;
        }

        :where(.${prefix}-ruby-grid--emphasis) > :where(.${prefix}-base),
        :where(.${prefix}-ruby-grid--emphasis) > :where(.${prefix}-tateten-group) {
          grid-area: base;
          letter-spacing: 0;
        }

        :where(.${prefix}-ruby-grid--emphasis) > :where(.${prefix}-suffix-row) {
          grid-area: suffix;
        }

        :where(.${prefix}-ruby-grid--emphasis) > :where(.${prefix}-highlight) {
          grid-area: base;
        }

        /*
 * Ruby Grid - Emphasis No-Ruby Variant (3行グリッド)
 *
 * row1: emphasis, row2: base/tateten-group
 * ルビなしの bare+emphasis トークン用。ruby 行を省略して 0.5em を節約。
 */
        :where(.${prefix}-ruby-grid--emphasis-no-ruby) {
          display: inline-grid;
          grid-template-areas: 'emphasis .' 'base suffix' '. .';
          grid-template-rows: ${annotationRowH} auto ${annotationRowH};
          grid-template-columns: auto auto;
          line-height: 1;
          padding-inline-end: var(--${vp}-letter-spacing);
          vertical-align: calc(
            var(--${vp}-ruby-ratio) * 0.5em + var(--${vp}-grid-baseline-fix, 0) * 1em
          );
        }

        :where(.${prefix}-ruby-grid--emphasis-no-ruby) > :where(.${prefix}-base),
        :where(.${prefix}-ruby-grid--emphasis-no-ruby) > :where(.${prefix}-tateten-group) {
          grid-area: base;
          letter-spacing: 0;
        }

        :where(.${prefix}-ruby-grid--emphasis-no-ruby) > :where(.${prefix}-suffix-row) {
          grid-area: suffix;
        }

        :where(.${prefix}-ruby-grid--emphasis-no-ruby) > :where(.${prefix}-highlight) {
          grid-area: base;
        }

        /*
 * Saidoku Grid - Emphasis Variant (4行グリッド)
 *
 * row1: emphasis, row2: ruby-over, row3: base, row4: ruby-under
 * emphasis-row が必ず row1 を占めるため ::before プレースホルダーは不要
 */
        :where(.${prefix}-saidoku-grid--emphasis) {
          display: inline-grid;
          grid-template-areas: 'emphasis' 'ruby-over' 'base' 'ruby-under';
          grid-template-rows: ${annotationRowH} ${annotationRowH} auto ${annotationRowH};
          line-height: 1;
          padding-inline-end: var(--${vp}-letter-spacing);
          vertical-align: calc(
            var(--${vp}-grid-baseline-fix, 0) * (var(--${vp}-ruby-ratio) * 1em + 0.5em)
          );
        }

        :where(.${prefix}-saidoku-grid--emphasis)
          > :where(.${prefix}-ruby:not(.${prefix}-saidoku-under)) {
          grid-area: ruby-over;
          align-self: end;
          text-align: center;
        }

        :where(.${prefix}-saidoku-grid--emphasis) > :where(.${prefix}-base) {
          grid-area: base;
          letter-spacing: 0;
        }

        :where(.${prefix}-saidoku-grid--emphasis) > :where(.${prefix}-saidoku-under) {
          grid-area: ruby-under;
          align-self: start;
          text-align: center;
        }
      `
    : '';

  return css`
/* SKAM Document Container */
:where(.${prefix}-document) {
  /* CSS Variables - カスタマイズポイント */
  --${vp}-color-fg: currentColor;
  --${vp}-color-kaeriten: currentColor;
  --${vp}-color-ruby: currentColor;
  --${vp}-color-emphasis: currentColor;
  --${vp}-font-family: inherit;
  --${vp}-font-family-ruby: inherit;
  --${vp}-glyph-size: 1em;
  --${vp}-ruby-ratio: 0.5;
  --${vp}-ruby-font-size: calc(var(--${vp}-ruby-ratio) * var(--${vp}-glyph-size));
  --${vp}-line-height: 2;
  --${vp}-letter-spacing: ${letterSpacingValue};

  /* Selection CSS Variables */
  --${vp}-selection-bg: rgba(66, 133, 244, 0.3);
  --${vp}-selection-border: #4285f4;

  /* 変数を適用 */
  font-family: var(--${vp}-font-family);
  line-height: var(--${vp}-line-height);
}

/* Display Layer
 *
 * letter-spacing を document ではなく display に適用する理由:
 * アキ量はグリフサイズ基準（四分アキ = 0.25 × glyph-size）であり、
 * letter-spacing の em 単位は要素自身の font-size を基準に解決される。
 * display の font-size = glyph-size なので、ここに適用することで
 * em が正しくグリフサイズ基準で解決される。
 */
:where(.${prefix}-display) {
  position: relative;
  font-size: var(--${vp}-glyph-size);
  letter-spacing: var(--${vp}-letter-spacing);
}

/* Block (論理的なブロック単位、句や段落など) */
:where(.${prefix}-block) {
  display: block;
  /* CJK 文字間のデフォルト改行を抑止し、<wbr> のみで改行位置を制御する。
   * word-break: keep-all は CJK 改行機会を除去するが、<wbr> による
   * 明示的な改行機会は維持される。 */
  word-break: keep-all;
}

/* Reading Layer (a11y, visually hidden) */
:where(.${prefix}-reading) {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(0);
  white-space: nowrap;
  border: 0;
}

/* Token */
:where(.${prefix}-token) {
  /* 不可分単位: トークンとその付随マーク（suffix-row 内の送り仮名・返り点・句読点）の
   * 間での改行を禁止する。改行許可位置は <wbr> で明示的に指定する。
   * 子要素に継承されるが、suffix-row (display: inline-grid) は独立した
   * フォーマッティングコンテキストを生成するため、grid レイアウトに悪影響はない。 */
  white-space: nowrap;
}

/* Base character */
:where(.${prefix}-base) {
  display: inline;
}
${rubyStyles}

:where(.${prefix}-ruby) {
  /* font-size 適用後のコンテキストなので 1em = glyph-size */
  font-size: ${annotationRowH};
  font-family: var(--${vp}-font-family-ruby);
  color: var(--${vp}-color-ruby);
  /* text-emphasis は継承するため、親要素の傍点がルビに伝播するのを防止 */
  text-emphasis: none;
  /* letter-spacing の継承を遮断（ルビ仮名内部の字間にアキは不要） */
  letter-spacing: 0;
  -webkit-user-select: none;
  user-select: none;
}
${gridStyles}

/* Base Segment (multi-token range の個別文字を letter-spacing で分離) */
:where(.${prefix}-base-seg) + :where(.${prefix}-base-seg) {
  margin-inline-start: var(--${vp}-letter-spacing);
}

/* Okurigana (送り仮名) */
:where(.${prefix}-okuri) {
  display: inline;
}

/* Soegana (添え仮名) */
:where(.${prefix}-soegana) {
  display: inline;
}

/* Okimoji (置字) - 訓読時に読まない漢字 */
:where(.${prefix}-okimoji) {
  /* デフォルトでは特別なスタイルなし（必要に応じてカスタマイズ可能） */
}

/* Joji (助字) - 文法的機能を持つ漢字の分類ラベル */
:where(.${prefix}-joji) {
  /* デフォルトでは特別なスタイルなし（必要に応じてカスタマイズ可能） */
}

/*
 * Suffix Row (送り仮名・返り点の配置コンテナ)
 *
 * font-size 適用後のコンテキストなので 1em = glyph-size
 *
 *   row1: ruby-font-size（送り仮名）
 *   row2: glyph-size（返り点 = 本文サイズ）
 *   row3: ruby-font-size（再読2送り）
 *
 * NOTE: Chromium の inline-grid baseline バグ補正
 * CSS 仕様上、縦書き (vertical-rl + text-orientation: mixed) では central が
 * dominant baseline になる (CSS Writing Modes L4 §4.2, CSS Inline L3 §4.1)。
 * Firefox/Safari は仕様準拠だが、Chromium は FontBaseline に central がなく
 * 誤ったアライメントを行う (https://issues.chromium.org/issues/40403675)。
 * calibrateGridBaseline() がランタイムで挙動を実測し、バグが検出された場合に
 * --${vp}-grid-baseline-fix: 1 をセットする。
 *
 * fix=0 (正常): 0 * (...) = 0
 * fix=1 (バグ): 1 * (ruby-ratio * 0.5em + 0.5em)
 */
:where(.${prefix}-suffix-row) {
  display: inline-grid;
  grid-template-areas: "okuri" "kutoten" "kaeri" "saidoku";
  grid-template-rows: ${annotationRowH} ${annotationRowH} ${annotationRowH} ${annotationRowH};
  line-height: 1;
  /* text-emphasis は継承するため、親要素の傍点が添字・送り仮名に伝播するのを防止 */
  text-emphasis: none;
  /* letter-spacing の継承を遮断（suffix-row 内部レイアウトへの影響を防止） */
  letter-spacing: 0;
  /* suffix-row は漢字(base)の直下に密着する。margin-inline-start の負マージンで
   * letter-spacing による base→suffix 間のアキを相殺する。
   * min-inline-size で suffix が LS より短い場合も最低 LS を確保し、
   * max(suffix_content, LS) モデルを実現する（tateten-sep と同等）。
   * ベタ組み時は calc(-1 * 0em) = 0 / min-inline-size: 0em となり無効化される。
   * 効果: [base][max(suffix_content, LS)][次token] */
  margin-inline-start: calc(-1 * var(--${vp}-letter-spacing));
  margin-inline-end: 0;
  min-inline-size: var(--${vp}-letter-spacing);
  vertical-align: calc(var(--${vp}-grid-baseline-fix, 0) * (var(--${vp}-ruby-ratio) * 0.5em + 0.5em));
}

/* okuri 行にプレースホルダーを配置してベースラインを安定させる */
:where(.${prefix}-suffix-row)::before {
  content: '';
  grid-area: okuri;
}

/* suffix-okuri がある場合はプレースホルダー不要
 *
 * フォールバック不要の根拠:
 * - ::before(content:'') と .suffix-okuri が同一 grid-row に共存しても、
 *   空コンテンツの暗黙列は auto sizing で幅 0 に解決され、column-gap も未設定のため視覚的影響なし
 * - ::before の本来の目的は Chromium baseline バグ補正だが、
 *   :has() 未対応ブラウザ (Firefox <121, Safari <15.4) は非 Chromium でありバグが存在しない */
@supports selector(:has(a)) {
  :where(.${prefix}-suffix-row:has(.${prefix}-suffix-okuri))::before {
    display: none;
  }
}

/* Suffix Right (送り仮名・添え仮名) */
:where(.${prefix}-suffix-okuri) {
  grid-area: okuri;
  font-size: ${annotationRowH};
  -webkit-user-select: none;
  user-select: none;
}

/* Suffix Center (返り点) - 縦書き時は左寄せ、横書き時は下寄せ */
:where(.${prefix}-suffix-kaeri) {
  grid-area: kaeri;
  font-size: ${annotationRowH};
  align-self: end;
  -webkit-user-select: none;
  user-select: none;
}

/* Suffix Left (再読文字2回目の送り仮名) */
:where(.${prefix}-suffix-saidoku) {
  grid-area: saidoku;
  font-size: ${annotationRowH};
  -webkit-user-select: none;
  user-select: none;
}

/* Kaeriten (返り点) */
:where(.${prefix}-kaeriten) {
  color: var(--${vp}-color-kaeriten);
  -webkit-user-select: none;
  user-select: none;
}

/* Suffix Kana (送り仮名・添え仮名のみの場合) */
:where(.${prefix}-suffix-kana) {
  font-size: ${annotationRowH};
  vertical-align: top;
  -webkit-user-select: none;
  user-select: none;
}

/* Kutoten (句読点) - suffix-row の kutoten 行に配置、行内（親）のフォントサイズを継承 */
:where(.${prefix}-suffix-kutoten) {
  grid-area: kutoten;
}

${
  includeRuby
    ? css`
        /*
 * Saidoku (再読文字) - 入れ子ruby方式
 *
 * 構造: <ruby class="outer"><ruby class="inner">將<rt>まさに</rt></ruby><rt>す</rt></ruby>
 *
 * 注意:
 * - ruby-position は ruby 要素に適用する（rt 要素ではない）
 * - ruby-position は継承するため、内側 ruby にも明示的に設定が必要
 */
        :where(.${prefix}-saidoku-outer) {
          ruby-position: under;
        }

        :where(.${prefix}-saidoku-inner) {
          ruby-position: over;
        }
      `
    : ''
}

/* Okototen (ヲコト点) */
:where(.${prefix}-has-okototen) {
  position: relative;
}

:where(.${prefix}-okototen) {
  position: absolute;
  font-size: ${okototenFontSize};
  left: calc((var(--okototen-x) / var(--okototen-grid)) * var(--${vp}-glyph-size));
  top: calc((var(--okototen-y) / var(--okototen-grid)) * var(--${vp}-glyph-size));
  pointer-events: none;
  -webkit-user-select: none;
  user-select: none;
}

:where(.${prefix}-okototen[data-shape="dot"])::before {
  content: "・";
}

:where(.${prefix}-okototen[data-shape="circle"])::before {
  content: "○";
}

:where(.${prefix}-okototen[data-shape="line"])::before {
  content: "—";
}

/*
 * Selection States (選択状態)
 *
 * token選択状態を視覚的に表示するためのクラス。
 */

/* 選択状態 */
:where(.${prefix}-selected) {
  background-color: var(--${vp}-selection-bg);
  outline: ${selectionOutlineWidth} solid var(--${vp}-selection-border);
  outline-offset: ${selectionOutlineOffset};
}

/* Tateten (たて点) - 共通部分 */
:where(.${prefix}-tateten-group) {
  display: inline;
  /* 不可分単位: tateten グループ内のトークン間での改行を禁止する。 */
  white-space: nowrap;
}

:where(.${prefix}-tateten-mark) {
  display: inline-block;
  vertical-align: middle;
  font-size: ${annotationRowH};
  -webkit-user-select: none;
  user-select: none;
  /* text-emphasis は継承するため、親要素の傍点が竪点記号に伝播するのを防止 */
  text-emphasis: none;
}

:where(.${prefix}-tateten-mark)::after {
  content: '\\3190';
}

/*
 * Tateten Separator (竪点セパレータ)
 *
 * 竪点マークと非レ返り点を並置するためのコンパクトグリッドコンテナ。
 * 全要素を同一グリッド領域 (1 / -1) に重ねて配置し、
 * align-self (start / center / end) で水平位置を分離する。
 *
 * 縦書き (vertical-rl) での物理配置:
 *   grid-template-rows → 水平方向（本文側↔注記側）のスロット分割
 *   grid-template-columns: 1fr → 垂直方向の全体をカバー
 *
 *   ::before (start)      → 右側（本文側余白、ベースライン安定用）
 *   tateten-mark (center)  → 中央（水平）/ 中央（垂直: justify-self）
 *   kaeriten (end)         → 左側（注記側）/ 中央（垂直: justify-self）
 *
 * グリッド総幅 = 4 * ruby-ratio * 0.5em = ruby-ratio * 2em
 * (suffix-row の半分のため、vertical-align で中央揃え補正が必要)
 *
 * インラインセンタリング:
 * inline-grid トークンは letter-spacing (LS) を高さ拡張として吸収する。
 * そのためトークン間には LS によるギャップが生じない。
 * sep を margin-inline-start: -LS で前トークンの LS 領域に引き戻し、
 * height: 1em + LS でグリフ間の全空間をカバーする。
 * justify-self: center でマークを空間の正確な中央に配置する。
 *
 * vertical-align: Chromium baseline バグ補正 (suffix-row と同形式)
 * fix=0 (仕様準拠ブラウザ): 0
 * fix=1 (Chromium): 0.5em - ruby-ratio * 0.5em
 */
:where(.${prefix}-tateten-sep) {
  display: inline-grid;
  grid-template-rows: [sep-spacer-start] ${halfAnnotationRowH} [sep-tateten-start] ${halfAnnotationRowH} [sep-kaeri-start] ${halfAnnotationRowH} [sep-end] ${halfAnnotationRowH};
  grid-template-columns: 1fr;
  line-height: 1;
  /* letter-spacing の継承を遮断（sep 内部レイアウトへの影響を防止） */
  letter-spacing: 0;
  /* 高さはマーク表示に必要な 1em と LS の大きい方を取る。 */
  height: max(1em, var(--${vp}-letter-spacing));
  vertical-align: calc(var(--${vp}-grid-baseline-fix, 0) * (0.5em - var(--${vp}-ruby-ratio) * 0.5em));
}

/* tateten-group 直後の suffix-row は LS 吸収不要（グループ内で完結済み） */
:where(.${prefix}-tateten-group) + :where(.${prefix}-suffix-row) {
  margin-inline-start: 0;
}

:where(.${prefix}-tateten-sep)::before {
  content: '';
  grid-row: sep-spacer-start / sep-kaeri-start;
  grid-column: 1;
}

:where(.${prefix}-tateten-sep) > :where(.${prefix}-tateten-mark) {
  grid-row: sep-tateten-start / sep-end;
  grid-column: 1;
  align-self: center;
  justify-self: center;
}

:where(.${prefix}-tateten-sep) > :where(.${prefix}-kaeriten) {
  grid-row: sep-kaeri-start / span 2;
  grid-column: 1;
  font-size: ${annotationRowH};
  align-self: center;
  justify-self: center;
  -webkit-user-select: none;
  user-select: none;
}

/* Ref (参照ラベル) */
:where(.${prefix}-ref) {
  font-size: ${refFontSize};
  vertical-align: super;
  color: inherit;
  text-spacing-trim: trim-start;
  /* letter-spacing の継承を遮断（参照ラベル内部の字間にアキは不要） */
  letter-spacing: 0;
}

:where(.${prefix}-notes) {
  margin-top: ${notesMarginTop};
  padding-top: ${notesPaddingTop};
  border-top: 1px solid currentColor;
  font-size: ${notesFontSize};
}

:where(.${prefix}-note-item) {
  margin-bottom: ${noteItemSpacing};
}

:where(.${prefix}-note-marker) {
  font-weight: bold;
  margin-right: ${noteMarkerGap};
}

/*
 * Emphasis (傍点) - CSS text-emphasis-style 準拠
 *
 * style 属性は CSS text-emphasis-style の値をそのまま使用。
 * デフォルト: filled dot
 * 有効な値: dot, circle, double-circle, triangle, sesame,
 *           filled/open + 上記形状（例: filled sesame, open circle）
 *
 * インラインスタイルで text-emphasis-style を設定するため、
 * ここでは色のみを指定。
 */
:where(.${prefix}-emphasis) {
  text-emphasis-color: var(--${vp}-color-emphasis);
  /* letter-spacing の継承を遮断: LS を含むと text-emphasis マークが
   * 文字＋アキの中央に配置され、文字位置からズレる。
   * LS=0 にすると trailing spacing も失われるため、margin-inline-end で補完。 */
  letter-spacing: 0;
  margin-inline-end: var(--${vp}-letter-spacing);
}

/*
 * Highlight (傍線) - 教育用途・共通部分
 *
 * box-shadow を使用して傍線を表示。
 * text-decoration は display: inline-block の子要素には伝播しないため、
 * box-shadow で代替実装。inset を使用し、spread で線の太さを制御。
 *
 * 構造:
 *   .${prefix}-highlight           - 外側コンテナ（パディングで隣行との間隔を確保）
 *   .${prefix}-highlight-content   - 内側コンテナ（傍線を描画）
 */
:where(.${prefix}-highlight) {
  position: relative;
}

:where(.${prefix}-highlight[data-style="solid"]) {
  /* Default solid line - スタイルは書字方向依存部分で定義 */
}

/* highlight内のラベル - 共通部分 */
:where(.${prefix}-highlight-content > .${prefix}-ref) {
  position: absolute;
  vertical-align: baseline;
  white-space: nowrap;
  line-height: 1;
}

/*
 * Copyable Elements Override (data-copyable 属性による選択可能化)
 *
 * デフォルトでは注記要素は user-select: none（コピー不可）。
 * data-copyable 属性で特定の要素をコピー可能にする。
 *
 * 使用例:
 *   <div class="skam-document" data-copyable="ruby">           → ルビのみコピー可能
 *   <div class="skam-document" data-copyable="okurigana">      → 送り仮名のみコピー可能
 *   <div class="skam-document" data-copyable="ruby okurigana"> → 両方コピー可能
 *   <div class="skam-document" data-copyable="all">            → 全てコピー可能
 */

/* ruby をコピー可能にする */
:where(.${prefix}-document[data-copyable~="ruby"]) :where(.${prefix}-ruby),
:where(.${prefix}-document[data-copyable~="all"]) :where(.${prefix}-ruby) {
  -webkit-user-select: text;
  user-select: text;
}

/* okurigana をコピー可能にする (suffix-okuri, suffix-saidoku, suffix-kana) */
:where(.${prefix}-document[data-copyable~="okurigana"]) :where(.${prefix}-suffix-okuri),
:where(.${prefix}-document[data-copyable~="okurigana"]) :where(.${prefix}-suffix-saidoku),
:where(.${prefix}-document[data-copyable~="okurigana"]) :where(.${prefix}-suffix-kana),
:where(.${prefix}-document[data-copyable~="all"]) :where(.${prefix}-suffix-okuri),
:where(.${prefix}-document[data-copyable~="all"]) :where(.${prefix}-suffix-saidoku),
:where(.${prefix}-document[data-copyable~="all"]) :where(.${prefix}-suffix-kana) {
  -webkit-user-select: text;
  user-select: text;
}

/* soegana をコピー可能にする (suffix-okuri, suffix-kana と同じ要素) */
:where(.${prefix}-document[data-copyable~="soegana"]) :where(.${prefix}-suffix-okuri),
:where(.${prefix}-document[data-copyable~="soegana"]) :where(.${prefix}-suffix-kana) {
  -webkit-user-select: text;
  user-select: text;
}

/* kaeriten をコピー可能にする */
:where(.${prefix}-document[data-copyable~="kaeriten"]) :where(.${prefix}-suffix-kaeri),
:where(.${prefix}-document[data-copyable~="kaeriten"]) :where(.${prefix}-kaeriten),
:where(.${prefix}-document[data-copyable~="all"]) :where(.${prefix}-suffix-kaeri),
:where(.${prefix}-document[data-copyable~="all"]) :where(.${prefix}-kaeriten) {
  -webkit-user-select: text;
  user-select: text;
}

/* okototen をコピー可能にする */
:where(.${prefix}-document[data-copyable~="okototen"]) :where(.${prefix}-okototen),
:where(.${prefix}-document[data-copyable~="all"]) :where(.${prefix}-okototen) {
  -webkit-user-select: text;
  user-select: text;
}`;
}

/**
 * 書字方向依存スタイル
 */
function generateWritingModeStyles(
  prefix: string,
  isVertical: boolean,
  rubyMethod: RubyMethod | 'both' = 'grid',
  variablePrefix?: string
): string {
  const vp = variablePrefix ?? prefix;
  const includeGrid = rubyMethod === 'grid' || rubyMethod === 'both';
  // Highlight layout (vertical): text → line → next column
  //
  // With kana:    |-- lineDistance (0.5em) --||---- columnGap (1em) ----|
  // Without kana: |- lineDistNoKana (0.1em) ||-- columnGap-reduction --|
  //               Both reduced by noKanaReduction (0.4em)
  const highlightLineDistance = '0.5em';
  const highlightLineDistanceNoKana = '0.1em';
  const highlightColumnGap = '1em';
  const noKanaReduction = '0.4em'; // = highlightLineDistance - highlightLineDistanceNoKana
  const annotationRowH = `calc(var(--${vp}-ruby-ratio) * 1em)`;
  // Horizontal
  const highlightRowGap = '0.5em';

  if (isVertical) {
    return css`
      /* Tateten (たて点) - 縦書き: U+3190 グリフがそのまま縦線として機能 */

      /* Emphasis (傍点) - 縦書き */
      :where(.${prefix}-emphasis) {
        text-emphasis-position: right;
      }

      /* Highlight (傍線部) - 縦書き: 右側に表示
       *
       * inline-block にすることで padding-right がレイアウトに反映され、
       * 隣の列に侵入しない。
       * highlight-content の padding-right でルビ・傍点より外側に線を描画。
       * highlight の padding-right で線と次の列の間に余白を確保。
       */
      :where(.${prefix}-highlight) {
        display: inline-block;
        padding-right: ${highlightColumnGap};
      }

      :where(.${prefix}-highlight-content) {
        display: inline;
        padding-right: ${highlightLineDistance};
      }

      /* 仮名なし: 傍線をbase文字に近接配置し、ラベルとの距離も縮小 */
      :where(.${prefix}-highlight:not([data-has-kana])) {
        padding-right: calc(${highlightColumnGap} - ${noKanaReduction});
      }

      :where(.${prefix}-highlight:not([data-has-kana])) > :where(.${prefix}-highlight-content) {
        padding-right: ${highlightLineDistanceNoKana};
      }

      /* 傍線スタイル共通: background-image + background-position で描画。
       * box-shadow ではなく background-image に統一することで、
       * emphasis+highlight 共存時に background-position のみで傍線位置を調整可能。
       * 既定は右端 (background-position: right) に描画。 */
      :where(.${prefix}-highlight[data-style="solid"]) > :where(.${prefix}-highlight-content) {
        background-image: linear-gradient(to bottom, currentColor, currentColor);
        background-size: 1px 100%;
        background-repeat: no-repeat;
        background-position: right;
      }

      :where(.${prefix}-highlight[data-style="dotted"]) > :where(.${prefix}-highlight-content) {
        background-image: linear-gradient(to bottom, currentColor 2px, transparent 2px);
        background-size: 1px 4px;
        background-repeat: repeat-y;
        background-position: right;
      }

      :where(.${prefix}-highlight[data-style="dashed"]) > :where(.${prefix}-highlight-content) {
        background-image: linear-gradient(to bottom, currentColor 4px, transparent 4px);
        background-size: 1px 8px;
        background-repeat: repeat-y;
        background-position: right;
      }

      :where(.${prefix}-highlight[data-style="wavy"]) > :where(.${prefix}-highlight-content) {
        /*
   * Wavy line using repeating SVG pattern
   * SVG内でcurrentColorは効かないため、黒色を直接指定。
   * 縦書き: 右側に縦方向の波線（幅4px、周期8px）
   */
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='8' viewBox='0 0 4 8'%3E%3Cpath d='M3 0 Q0 4 3 8' stroke='%23333' fill='none' stroke-width='1'/%3E%3C/svg%3E");
        background-size: 4px 8px;
        background-repeat: repeat-y;
        background-position: right;
      }

      :where(.${prefix}-highlight[data-style="double"]) > :where(.${prefix}-highlight-content) {
        background-image: linear-gradient(
          to left,
          currentColor 1px,
          transparent 1px 2px,
          currentColor 2px 3px,
          transparent 3px
        );
        background-repeat: repeat-y;
        background-position: right;
      }

      /* Label - 縦書き: 傍線の開始位置（上）に配置
       * inset-block-start: 0 = right: 0 in vertical-rl → highlight 境界内に収める
       * inset-inline-start: 0 = top
       */
      :where(.${prefix}-highlight-content > .${prefix}-ref) {
        inset-inline-start: 0;
        inset-block-start: 0;
      }

      /* Ref (参照ラベル) - 縦中横 */
      :where(.${prefix}-ref--half-width) {
        text-combine-upright: all;
      }

      /* Note marker - 縦中横 */
      :where(.${prefix}-note-marker--half-width) {
        text-combine-upright: all;
      }
      ${includeGrid
        ? css`
            /* highlight が ruby-grid のグリッドアイテムの場合、padding-right をリセット。
             * 書字方向スタイルの後に配置して source order でオーバーライドする。
             * padding-right は通常、傍線と隣列の間隔確保に使われるが、
             * ruby-grid 内では column 幅を不必要に広げ ruby の中央揃えに影響する。 */
            :where(.${prefix}-ruby-grid) > :where(.${prefix}-highlight),
            :where(.${prefix}-ruby-grid--emphasis) > :where(.${prefix}-highlight),
            :where(.${prefix}-ruby-grid--emphasis-no-ruby) > :where(.${prefix}-highlight) {
              padding-right: 0;
            }

            /*
             * Highlight + Emphasis 共存 (ADR-015: Approach 5)
             *
             * 配置順を「本文 → ルビ → 傍線 → 傍点」にするため、
             * emphasis+highlight 共存時は highlight ラッパー (.highlight) の ::after 疑似要素で
             * 傍線を emphasis-row の手前（本文寄り）に描画する。
             *
             * highlight-content は inline 要素のため子の inline-grid の emphasis-row を
             * 包含しない。background/box-shadow では正確な位置制御ができない。
             * 一方 highlight ラッパーは子を完全に包含するため、
             * position: absolute の ::after で正確な位置指定が可能。
             *
             * ::after の right offset:
             *   highlight の padding-right (${highlightColumnGap}) + emphasis-row 幅 (ruby-ratio * 1em = 0.5em)
             *   = 1.5em（ruby-ratio=0.5 時）で、emphasis-row の内側辺（= ruby の外側辺）に傍線を配置。
             *
             * emphasis+highlight 共存時は highlight-content の傍線描画を無効化し、
             * 代わりに highlight::after で全スタイルを再現する。
             */
            @supports selector(:has(a)) {
              /* emphasis 共存時: highlight-content の傍線を無効化 */
              :where(
                  .${prefix}-highlight:has(:is(.${prefix}-ruby-grid--emphasis, .${prefix}-ruby-grid--emphasis-no-ruby))
                )
                > :where(.${prefix}-highlight-content) {
                background-image: none !important;
              }

              /* emphasis 共存時: ::after で傍線を描画（共通）
               * right offset = emphasis-row 幅 (ruby-ratio * 1em) + highlight padding (${highlightColumnGap})
               * ruby 行有無で同じ値（emphasis-row は常に grid 最右列） */
              :where(
                .${prefix}-highlight:has(:is(.${prefix}-ruby-grid--emphasis, .${prefix}-ruby-grid--emphasis-no-ruby))
              )::after {
                content: '';
                position: absolute;
                top: 0;
                bottom: 0;
                right: calc(${annotationRowH} + ${highlightColumnGap});
                width: 0;
              }

              /* 仮名なし: padding-right が noKanaReduction 分小さいため right offset も同量削減 */
              :where(
                .${prefix}-highlight:not([data-has-kana]):has(
                    :is(.${prefix}-ruby-grid--emphasis, .${prefix}-ruby-grid--emphasis-no-ruby)
                  )
              )::after {
                right: calc(${annotationRowH} + ${highlightColumnGap} - ${noKanaReduction});
              }

              /* solid */
              :where(.${prefix}-highlight[data-style="solid"]:has(:is(.${prefix}-ruby-grid--emphasis, .${prefix}-ruby-grid--emphasis-no-ruby)))::after {
                border-right: 1px solid currentColor;
              }

              /* dotted */
              :where(.${prefix}-highlight[data-style="dotted"]:has(:is(.${prefix}-ruby-grid--emphasis, .${prefix}-ruby-grid--emphasis-no-ruby)))::after {
                border-right: none;
                width: 1px;
                background-image: linear-gradient(to bottom, currentColor 2px, transparent 2px);
                background-size: 1px 4px;
                background-repeat: repeat-y;
              }

              /* dashed */
              :where(.${prefix}-highlight[data-style="dashed"]:has(:is(.${prefix}-ruby-grid--emphasis, .${prefix}-ruby-grid--emphasis-no-ruby)))::after {
                border-right: none;
                width: 1px;
                background-image: linear-gradient(to bottom, currentColor 4px, transparent 4px);
                background-size: 1px 8px;
                background-repeat: repeat-y;
              }

              /* wavy */
              :where(.${prefix}-highlight[data-style="wavy"]:has(:is(.${prefix}-ruby-grid--emphasis, .${prefix}-ruby-grid--emphasis-no-ruby)))::after {
                border-right: none;
                width: 4px;
                right: calc(${annotationRowH} + ${highlightColumnGap} - 1.5px);
                background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='8' viewBox='0 0 4 8'%3E%3Cpath d='M3 0 Q0 4 3 8' stroke='%23333' fill='none' stroke-width='1'/%3E%3C/svg%3E");
                background-size: 4px 8px;
                background-repeat: repeat-y;
              }

              :where(.${prefix}-highlight[data-style="wavy"]:not([data-has-kana]):has(:is(.${prefix}-ruby-grid--emphasis, .${prefix}-ruby-grid--emphasis-no-ruby)))::after {
                right: calc(${annotationRowH} + ${highlightColumnGap} - ${noKanaReduction} - 1.5px);
              }

              /* double */
              :where(.${prefix}-highlight[data-style="double"]:has(:is(.${prefix}-ruby-grid--emphasis, .${prefix}-ruby-grid--emphasis-no-ruby)))::after {
                border-right: none;
                width: 3px;
                right: calc(${annotationRowH} + ${highlightColumnGap} - 1px);
                background-image: linear-gradient(
                  to left,
                  currentColor 1px,
                  transparent 1px 2px,
                  currentColor 2px 3px,
                  transparent 3px
                );
                background-repeat: repeat-y;
              }

              :where(.${prefix}-highlight[data-style="double"]:not([data-has-kana]):has(:is(.${prefix}-ruby-grid--emphasis, .${prefix}-ruby-grid--emphasis-no-ruby)))::after {
                right: calc(${annotationRowH} + ${highlightColumnGap} - ${noKanaReduction} - 1px);
              }
            }
          `
        : ''}
    `;
  } else {
    return css`
      /* Tateten (たて点) - 横書き: U+3190 グリフは縦長なので90°回転して横線にする */
      :where(.${prefix}-tateten-mark) {
        transform: rotate(90deg);
      }

      /* Emphasis (傍点) - 横書き */
      :where(.${prefix}-emphasis) {
        text-emphasis-position: over;
      }

      /* Highlight (傍線) - 横書き: 下側に表示 */
      :where(.${prefix}-highlight) {
        padding-bottom: ${highlightRowGap};
      }

      :where(.${prefix}-highlight-content) {
        display: inline;
        box-shadow: inset 0 -1px 0 0 currentColor;
      }

      :where(.${prefix}-highlight[data-style="dotted"]) > :where(.${prefix}-highlight-content) {
        box-shadow: none;
        background-image: linear-gradient(to right, currentColor 2px, transparent 2px);
        background-size: 4px 1px;
        background-repeat: repeat-x;
        background-position: bottom;
      }

      :where(.${prefix}-highlight[data-style="dashed"]) > :where(.${prefix}-highlight-content) {
        box-shadow: none;
        background-image: linear-gradient(to right, currentColor 4px, transparent 4px);
        background-size: 8px 1px;
        background-repeat: repeat-x;
        background-position: bottom;
      }

      :where(.${prefix}-highlight[data-style="wavy"]) > :where(.${prefix}-highlight-content) {
        /*
   * Wavy line using repeating SVG pattern
   * SVG内でcurrentColorは効かないため、黒色を直接指定。
   * 横書き: 下側に横方向の波線（周期8px、高さ4px）
   */
        box-shadow: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='4' viewBox='0 0 8 4'%3E%3Cpath d='M0 3 Q4 0 8 3' stroke='%23333' fill='none' stroke-width='1'/%3E%3C/svg%3E");
        background-size: 8px 4px;
        background-repeat: repeat-x;
        background-position: bottom;
      }

      :where(.${prefix}-highlight[data-style="double"]) > :where(.${prefix}-highlight-content) {
        box-shadow: none;
        background-image: linear-gradient(
          to top,
          currentColor 1px,
          transparent 1px 2px,
          currentColor 2px 3px,
          transparent 3px
        );
        background-repeat: repeat-y;
        background-position: bottom;
      }

      /* Label - 横書き: 傍線の開始位置（下）に配置 */
      :where(.${prefix}-highlight-content > .${prefix}-ref) {
        inset-inline-start: 0;
        inset-block-end: 0;
      }

      /* Ref ラベルのレイアウト参加:
       * inline 要素の padding-bottom は行ボックスの高さに寄与しないため、
       * ref を持つ highlight を inline-block にして padding を寸法に反映させる。 */
      @supports selector(:has(a)) {
        :where(.${prefix}-highlight:has(> .${prefix}-highlight-content > .${prefix}-ref)) {
          display: inline-block;
        }
      }

      /* 横書きでは縦中横不要 */
      :where(.${prefix}-ref--half-width) {
        /* No text-combine-upright needed for horizontal */
      }
      ${includeGrid
        ? css`
            /* highlight が ruby-grid のグリッドアイテムの場合、padding-bottom をリセット */
            :where(.${prefix}-ruby-grid) > :where(.${prefix}-highlight),
            :where(.${prefix}-ruby-grid--emphasis) > :where(.${prefix}-highlight),
            :where(.${prefix}-ruby-grid--emphasis-no-ruby) > :where(.${prefix}-highlight) {
              padding-bottom: 0;
            }
          `
        : ''}
    `;
  }
}

/**
 * インラインモード用スタイル
 */
function generateInlineStyles(prefix: string): string {
  return css`
    /* Inline Mode */
    :where(.${prefix}-document--inline) {
      display: inline-block;
      position: relative;
      vertical-align: baseline;
    }

    :where(.${prefix}-document--inline .${prefix}-display) {
      display: inline;
    }

    :where(.${prefix}-document--inline .${prefix}-block) {
      display: inline;
    }
  `;
}

/**
 * セレクタでラップ（data-writing-mode 属性セレクタ用）
 *
 * 各ルールのセレクタに親セレクタを付与する
 * 例: `:where(.skam-emphasis) { ... }` → `:where(.skam-document[data-writing-mode="vertical"] .skam-emphasis) { ... }`
 */
/**
 * 括弧のネストを考慮して、トップレベルのカンマ位置で文字列を分割する。
 * `:is(.a, .b)` 内部のカンマでは分割しない。
 */
function splitTopLevelCommas(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    else if (s[i] === ',' && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}

/**
 * 括弧のネストを考慮して、最外側の `:where(...)` を分解する。
 * `:where(` の直後から対応する `)` までを innerSelector とし、
 * それ以降を rest とする。
 *
 * @returns `{ indent, inner, rest }` or `null` if not a :where() line
 */
function parseWhereLine(line: string): { indent: string; inner: string; rest: string } | null {
  const leadingMatch = line.match(/^(\s*):where\(/);
  if (!leadingMatch) return null;

  const indent = leadingMatch[1] ?? '';
  const contentStart = leadingMatch[0].length; // `:where(` の直後

  // 括弧ネストを追跡して対応する `)` を見つける
  let depth = 1;
  let i = contentStart;
  for (; i < line.length && depth > 0; i++) {
    if (line[i] === '(') depth++;
    else if (line[i] === ')') depth--;
  }

  if (depth !== 0) return null; // 対応する `)` が見つからない

  // i は対応する `)` の直後を指す
  const inner = line.slice(contentStart, i - 1); // `)` 自体は含まない
  const rest = line.slice(i - 1); // `)` 以降（')::after {' など）

  return { indent, inner, rest };
}

function wrapWithSelector(attrSelector: string, prefix: string, css: string): string {
  // CSSルールを解析して各セレクタにプレフィックスを追加
  // :where() でラップされたセレクタを検出
  const lines = css.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    const parsed = parseWhereLine(line);
    if (parsed) {
      const { indent, inner: innerSelector, rest } = parsed;

      // セレクタが prefix を含む場合のみ変換
      if (innerSelector.includes(`.${prefix}-`)) {
        // 複数セレクタ（トップレベルのカンマ区切り）の場合は分割して処理
        const selectors = splitTopLevelCommas(innerSelector).map((s) => s.trim());
        const wrappedSelectors = selectors.map(
          (s) => `:where(.${prefix}-document${attrSelector} ${s}${rest}`
        );
        result.push(`${indent}${wrappedSelectors.join(',\n' + indent)}`);
        continue;
      }
    }
    result.push(line);
  }

  return result.join('\n');
}
