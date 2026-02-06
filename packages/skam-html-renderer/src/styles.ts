/**
 * SKAM HTML Renderer - Default CSS Styles
 */

/**
 * コピー可能にする要素の種類
 *
 * - 'ruby': 読み仮名（ルビ）
 * - 'okurigana': 送り仮名
 * - 'soegana': 添え仮名
 * - 'kaeriten': 返り点
 * - 'okototen': ヲコト点
 *
 * これらは data-copyable 属性で実行時に制御可能。
 * 例: <div class="skam-document" data-copyable="ruby okurigana">
 */
export type CopyableElement = 'ruby' | 'okurigana' | 'soegana' | 'kaeriten' | 'okototen';

/**
 * CSSスタイル生成オプション
 */
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

  const commonStyles = generateCommonStyles(prefix, vp);
  const inlineStyles = inline ? generateInlineStyles(prefix) : '';

  let css: string;

  if (writingMode === 'both') {
    // 縦書き・横書き両方のスタイルを data-writing-mode セレクタでラップして出力
    const verticalStyles = generateWritingModeStyles(prefix, true);
    const horizontalStyles = generateWritingModeStyles(prefix, false);

    css = `${commonStyles}

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
    const writingModeStyles = generateWritingModeStyles(prefix, isVertical);
    const documentWritingMode = isVertical
      ? `
:where(.${prefix}-document) {
  writing-mode: vertical-rl;
  text-orientation: mixed;
}`
      : '';

    css = `${commonStyles}
${documentWritingMode}
${writingModeStyles}
${inlineStyles}`.trim();
  }

  // @layer でラップ
  if (useLayer) {
    return `@layer ${layerName} {\n${css}\n}`;
  }

  return css;
}

/**
 * 共通スタイル（書字方向に依存しない）
 */
function generateCommonStyles(prefix: string, vp: string): string {
  return `
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
  --${vp}-letter-spacing: 0;

  /* Selection CSS Variables */
  --${vp}-selection-bg: rgba(66, 133, 244, 0.3);
  --${vp}-selection-border: #4285f4;

  /* 変数を適用 */
  font-family: var(--${vp}-font-family);
  line-height: var(--${vp}-line-height);
  letter-spacing: var(--${vp}-letter-spacing);
}

/* Display Layer */
:where(.${prefix}-display) {
  position: relative;
  font-size: var(--${vp}-glyph-size);
}

/* Block (論理的なブロック単位、句や段落など) */
:where(.${prefix}-block) {
  display: block;
}

/* Reading Layer (a11y, visually hidden) */
:where(.${prefix}-reading) {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Token */
:where(.${prefix}-token) {
  position: relative;
  display: inline-block;
}

/* Base character */
:where(.${prefix}-base) {
  display: inline;
}

/* Ruby styling */
:where(.${prefix}-token ruby) {
  ruby-align: center;
}

:where(.${prefix}-ruby) {
  /* font-size 適用後のコンテキストなので 1em = glyph-size */
  font-size: calc(var(--${vp}-ruby-ratio) * 1em);
  font-family: var(--${vp}-font-family-ruby);
  color: var(--${vp}-color-ruby);
  /* text-emphasis は継承するため、親要素の傍点がルビに伝播するのを防止 */
  text-emphasis: none;
  user-select: none;
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
  opacity: 0.6;
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
 * NOTE: vertical-align のブラウザ差異対応
 * - Firefox/Safari: vertical-align: 0 で inline-grid ボックス全体が揃う
 * - Chrome: inline-grid 内テキストの central baseline でアライメントされるバグあり
 *           calc() で補正が必要
 *
 * 以下のCSSハックで出し分け:
 * - デフォルト: Chrome 用 calc() 値
 * - @-moz-document: Firefox 用
 * - @supports (-webkit-touch-callout: none): Safari 用
 */
:where(.${prefix}-suffix-row) {
  display: inline-grid;
  grid-template-rows: calc(var(--${vp}-ruby-ratio) * 1em) calc(var(--${vp}-ruby-ratio) * 1em) calc(var(--${vp}-ruby-ratio) * 1em) calc(var(--${vp}-ruby-ratio) * 1em);
  line-height: 1;
  /* text-emphasis は継承するため、親要素の傍点が添字・送り仮名に伝播するのを防止 */
  text-emphasis: none;
  /* Chrome 用（デフォルト） */
  vertical-align: calc(var(--${vp}-ruby-ratio) * 0.5em + 0.5em);
}

/* Firefox: vertical-align: 0 で正常動作 */
@-moz-document url-prefix() {
  :where(.${prefix}-suffix-row) {
    vertical-align: 0;
  }
}

/* Safari: vertical-align: 0 で正常動作 */
@supports (-webkit-touch-callout: none) {
  :where(.${prefix}-suffix-row) {
    vertical-align: 0;
  }
}

/* row1 にプレースホルダーを配置してベースラインを安定させる */
:where(.${prefix}-suffix-row)::before {
  content: '';
  grid-row: 1;
}

/* suffix-okuri がある場合はプレースホルダー不要 */
:where(.${prefix}-suffix-row:has(.${prefix}-suffix-okuri))::before {
  display: none;
}

/* Suffix Right (送り仮名・添え仮名) */
:where(.${prefix}-suffix-okuri) {
  grid-row: 1;
  font-size: calc(var(--${vp}-ruby-ratio) * 1em);
  user-select: none;
}

/* Suffix Center (返り点) - 縦書き時は左寄せ、横書き時は下寄せ */
:where(.${prefix}-suffix-kaeri) {
  grid-row: 3;
  font-size: calc(var(--${vp}-ruby-ratio) * 1em);
  align-self: end;
  user-select: none;
}

/* Suffix Left (再読文字2回目の送り仮名) */
:where(.${prefix}-suffix-saidoku) {
  grid-row: 4;
  font-size: calc(var(--${vp}-ruby-ratio) * 1em);
  user-select: none;
}

/* Kaeriten (返り点) */
:where(.${prefix}-kaeriten) {
  color: var(--${vp}-color-kaeriten);
  user-select: none;
}

/* Suffix Kana (送り仮名・添え仮名のみの場合) */
:where(.${prefix}-suffix-kana) {
  font-size: calc(var(--${vp}-ruby-ratio) * 1em);
  vertical-align: top;
  user-select: none;
}

/* Kutoten (句読点) - suffix-row の row2 に配置、行内（親）のフォントサイズを継承 */
:where(.${prefix}-suffix-kutoten) {
  grid-row: 2;
}

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

/* Okototen (ヲコト点) */
:where(.${prefix}-has-okototen) {
  position: relative;
}

:where(.${prefix}-okototen) {
  position: absolute;
  font-size: 0.3em;
  left: calc((var(--okototen-x) / var(--okototen-grid)) * var(--${vp}-glyph-size));
  top: calc((var(--okototen-y) / var(--okototen-grid)) * var(--${vp}-glyph-size));
  pointer-events: none;
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
  outline: 2px solid var(--${vp}-selection-border);
  outline-offset: -1px;
}

/* Tateten (たて点) - 共通部分 */
:where(.${prefix}-tateten-group) {
  display: inline;
}

:where(.${prefix}-tateten-mark) {
  display: inline-block;
  vertical-align: middle;
  font-size: calc(var(--${vp}-ruby-ratio) * 1em);
  user-select: none;
}

/*
 * Tateten Separator (竪点セパレータ)
 *
 * 竪点マークと非レ返り点を並置するためのコンパクトグリッドコンテナ。
 * 全要素を同一グリッド領域 (1 / -1) に重ねて配置し、
 * align-self (start / center / end) で位置を分離する。
 *
 * 縦書き (vertical-rl) での物理配置:
 *   ::before (start)      → 右側（本文側余白、ベースライン安定用）
 *   tateten-mark (center)  → 中央
 *   kaeriten (end)         → 左側（注記側）
 *
 * グリッド総幅 = 4 * ruby-ratio * 0.5em = ruby-ratio * 2em
 * (suffix-row の半分のため、vertical-align で中央揃え補正が必要)
 *
 * NOTE: vertical-align: middle は Chrome の縦書きモードで正しく動作しない (bug)。
 * suffix-row VA から centering offset (ruby-ratio * 1em) を引いて補正する。
 */
:where(.${prefix}-tateten-sep) {
  display: inline-grid;
  grid-template-rows: repeat(4, calc(var(--${vp}-ruby-ratio) * 0.5em));
  line-height: 1;
  /* Chrome: suffix-row VA - centering offset = (ruby-ratio*0.5em + 0.5em) - ruby-ratio*1em */
  vertical-align: calc(0.5em - var(--${vp}-ruby-ratio) * 0.5em);
}

/* Firefox: 0 - centering offset (ruby-ratio*1em) */
@-moz-document url-prefix() {
  :where(.${prefix}-tateten-sep) {
    vertical-align: calc(var(--${vp}-ruby-ratio) * -1em);
  }
}

/* Safari: 0 - centering offset (ruby-ratio*1em) */
@supports (-webkit-touch-callout: none) {
  :where(.${prefix}-tateten-sep) {
    vertical-align: calc(var(--${vp}-ruby-ratio) * -1em);
  }
}

:where(.${prefix}-tateten-sep)::before {
  content: '';
  grid-row: 1 / 3;
  grid-column: 1;
}

:where(.${prefix}-tateten-sep) > :where(.${prefix}-tateten-mark) {
  grid-row: 2 / 4;
  grid-column: 1;
  align-self: center;
}

:where(.${prefix}-tateten-sep) > :where(.${prefix}-kaeriten) {
  grid-row: 3 / 5;
  grid-column: 1;
  font-size: calc(var(--${vp}-ruby-ratio) * 1em);
  align-self: center;
  user-select: none;
}

/* Ref (参照ラベル) */
:where(.${prefix}-ref) {
  font-size: 0.7em;
  vertical-align: super;
  color: inherit;
  text-spacing-trim: trim-start;
}

:where(.${prefix}-notes) {
  margin-top: 1em;
  padding-top: 1em;
  border-top: 1px solid currentColor;
  font-size: 0.9em;
}

:where(.${prefix}-note-item) {
  margin-bottom: 0.5em;
}

:where(.${prefix}-note-marker) {
  font-weight: bold;
  margin-right: 0.5em;
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

/*
 * Label (番号振り) - 教育用途・共通部分
 *
 * 傍線部の識別子や注番号として表示。
 */
:where(.${prefix}-ref) {
  font-size: 0.7em;
  vertical-align: super;
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
  user-select: text;
}

/* okurigana をコピー可能にする (suffix-okuri, suffix-saidoku, suffix-kana) */
:where(.${prefix}-document[data-copyable~="okurigana"]) :where(.${prefix}-suffix-okuri),
:where(.${prefix}-document[data-copyable~="okurigana"]) :where(.${prefix}-suffix-saidoku),
:where(.${prefix}-document[data-copyable~="okurigana"]) :where(.${prefix}-suffix-kana),
:where(.${prefix}-document[data-copyable~="all"]) :where(.${prefix}-suffix-okuri),
:where(.${prefix}-document[data-copyable~="all"]) :where(.${prefix}-suffix-saidoku),
:where(.${prefix}-document[data-copyable~="all"]) :where(.${prefix}-suffix-kana) {
  user-select: text;
}

/* soegana をコピー可能にする (suffix-okuri, suffix-kana と同じ要素) */
:where(.${prefix}-document[data-copyable~="soegana"]) :where(.${prefix}-suffix-okuri),
:where(.${prefix}-document[data-copyable~="soegana"]) :where(.${prefix}-suffix-kana) {
  user-select: text;
}

/* kaeriten をコピー可能にする */
:where(.${prefix}-document[data-copyable~="kaeriten"]) :where(.${prefix}-suffix-kaeri),
:where(.${prefix}-document[data-copyable~="kaeriten"]) :where(.${prefix}-kaeriten),
:where(.${prefix}-document[data-copyable~="all"]) :where(.${prefix}-suffix-kaeri),
:where(.${prefix}-document[data-copyable~="all"]) :where(.${prefix}-kaeriten) {
  user-select: text;
}

/* okototen をコピー可能にする */
:where(.${prefix}-document[data-copyable~="okototen"]) :where(.${prefix}-okototen),
:where(.${prefix}-document[data-copyable~="all"]) :where(.${prefix}-okototen) {
  user-select: text;
}`;
}

/**
 * 書字方向依存スタイル
 */
function generateWritingModeStyles(prefix: string, isVertical: boolean): string {
  if (isVertical) {
    return `
/* Tateten (たて点) - 縦書き: U+3190 グリフがそのまま縦線として機能 */

/* Emphasis (傍点) - 縦書き */
:where(.${prefix}-emphasis) {
  text-emphasis-position: right;
}

/* Highlight (傍線部) - 縦書き: 右側に表示 */
:where(.${prefix}-highlight) {
  padding-right: 1em;
}

:where(.${prefix}-highlight-content) {
  display: inline-block;
  position: relative;
}

:where(.${prefix}-highlight[data-style="solid"]) > :where(.${prefix}-highlight-content) {
  box-shadow: inset -1px 0 0 0 currentColor;
}

:where(.${prefix}-highlight[data-style="dotted"]) > :where(.${prefix}-highlight-content) {
  box-shadow: none;
  background-image: linear-gradient(to bottom, currentColor 2px, transparent 2px);
  background-size: 1px 4px;
  background-repeat: repeat-y;
  background-position: right;
}

:where(.${prefix}-highlight[data-style="dashed"]) > :where(.${prefix}-highlight-content) {
  box-shadow: none;
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
  box-shadow: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='8' viewBox='0 0 4 8'%3E%3Cpath d='M3 0 Q0 4 3 8' stroke='%23333' fill='none' stroke-width='1'/%3E%3C/svg%3E");
  background-size: 4px 8px;
  background-repeat: repeat-y;
  background-position: right;
}

:where(.${prefix}-highlight[data-style="double"]) > :where(.${prefix}-highlight-content) {
  box-shadow: none;
  position: relative;
}

:where(.${prefix}-highlight[data-style="double"]) > :where(.${prefix}-highlight-content)::before,
:where(.${prefix}-highlight[data-style="double"]) > :where(.${prefix}-highlight-content)::after {
  content: '';
  position: absolute;
  background-color: currentColor;
  top: 0;
  bottom: 0;
  width: 1px;
}

:where(.${prefix}-highlight[data-style="double"]) > :where(.${prefix}-highlight-content)::before {
  right: 0;
}

:where(.${prefix}-highlight[data-style="double"]) > :where(.${prefix}-highlight-content)::after {
  right: 3px;
}

/* Label - 縦書き: 傍線の開始位置（上）に配置 */
:where(.${prefix}-highlight-content > .${prefix}-ref) {
  inset-inline-start: 0;
  inset-block-start: -1em;
}

/* Ref (参照ラベル) - 縦中横 */
:where(.${prefix}-ref--half-width) {
  text-combine-upright: all;
}

/* Note marker - 縦中横 */
:where(.${prefix}-note-marker--half-width) {
  text-combine-upright: all;
}`;
  } else {
    return `
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
  padding-bottom: 0.5em;
}

:where(.${prefix}-highlight-content) {
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
  position: relative;
}

:where(.${prefix}-highlight[data-style="double"]) > :where(.${prefix}-highlight-content)::before,
:where(.${prefix}-highlight[data-style="double"]) > :where(.${prefix}-highlight-content)::after {
  content: '';
  position: absolute;
  background-color: currentColor;
  left: 0;
  right: 0;
  height: 1px;
}

:where(.${prefix}-highlight[data-style="double"]) > :where(.${prefix}-highlight-content)::before {
  bottom: 0;
}

:where(.${prefix}-highlight[data-style="double"]) > :where(.${prefix}-highlight-content)::after {
  bottom: 3px;
}

/* Label - 横書き: 傍線の開始位置（下）に配置 */
:where(.${prefix}-highlight-content > .${prefix}-ref) {
  inset-inline-start: 0;
  inset-block-end: 0;
}

/* 横書きでは縦中横不要 */
:where(.${prefix}-ref--half-width) {
  /* No text-combine-upright needed for horizontal */
}`;
  }
}

/**
 * インラインモード用スタイル
 */
function generateInlineStyles(prefix: string): string {
  return `

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
}`;
}

/**
 * セレクタでラップ（data-writing-mode 属性セレクタ用）
 *
 * 各ルールのセレクタに親セレクタを付与する
 * 例: `:where(.skam-emphasis) { ... }` → `:where(.skam-document[data-writing-mode="vertical"] .skam-emphasis) { ... }`
 */
function wrapWithSelector(attrSelector: string, prefix: string, css: string): string {
  // CSSルールを解析して各セレクタにプレフィックスを追加
  // :where() でラップされたセレクタを検出
  const lines = css.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    // :where() セレクタ行を検出
    const whereMatch = line.match(/^(\s*)(:where\()(.+?)(\).*)$/);
    if (whereMatch) {
      const indent = whereMatch[1] ?? '';
      const whereOpen = whereMatch[2]; // ':where('
      const innerSelector = whereMatch[3]; // '.skam-emphasis' など
      const rest = whereMatch[4]; // ')' 以降（')', ')::before', ') {' など）

      // セレクタが prefix を含む場合のみ変換
      if (innerSelector && innerSelector.includes(`.${prefix}-`)) {
        // 複数セレクタ（カンマ区切り）の場合は分割して処理
        const selectors = innerSelector.split(',').map((s) => s.trim());
        const wrappedSelectors = selectors.map(
          (s) => `${whereOpen}.${prefix}-document${attrSelector} ${s}${rest}`
        );
        result.push(`${indent}${wrappedSelectors.join(',\n' + indent)}`);
        continue;
      }
    }
    result.push(line);
  }

  return result.join('\n');
}
