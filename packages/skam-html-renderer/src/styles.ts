/**
 * SKAM HTML Renderer - Default CSS Styles
 */

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
  --${vp}-ruby-font-size: 0.5em;
  --${vp}-line-height: 2;
  --${vp}-letter-spacing: 0;

  /* 変数を適用 */
  font-family: var(--${vp}-font-family);
  line-height: var(--${vp}-line-height);
  letter-spacing: var(--${vp}-letter-spacing);
}

/* Display Layer */
:where(.${prefix}-display) {
  position: relative;
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
  font-size: var(--${vp}-ruby-font-size);
  font-family: var(--${vp}-font-family-ruby);
  color: var(--${vp}-color-ruby);
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
 * font-size: 0.5em 環境内なので、元の 0.5em → 1em, 元の 1em → 2em
 *
 * grid-template-rowsで3行配置（縦書き時は横方向、横書き時は縦方向）
 *   row1: 送り仮名（縦書き時は右、横書き時は上）
 *   row2: 返り点（中央）
 *   row3: 再読2送り（縦書き時は左、横書き時は下）
 */
:where(.${prefix}-suffix-row) {
  display: inline-grid;
  font-size: var(--${vp}-ruby-font-size);
  grid-template-rows: 1em 2em 1em;
  line-height: 1;
  vertical-align: top;
}

/* Suffix Right (送り仮名・添え仮名) */
:where(.${prefix}-suffix-right) {
  grid-row: 1;
}

/* Suffix Center (返り点) - 縦書き時は左寄せ、横書き時は下寄せ */
:where(.${prefix}-suffix-center) {
  grid-row: 2;
  align-self: end;
}

/* Suffix Left (再読文字2回目の送り仮名) */
:where(.${prefix}-suffix-left) {
  grid-row: 3;
}

/* Kaeriten (返り点) */
:where(.${prefix}-kaeriten) {
  color: var(--${vp}-color-kaeriten);
}

/* Suffix Kana (送り仮名・添え仮名のみの場合) */
:where(.${prefix}-suffix-kana) {
  font-size: var(--${vp}-ruby-font-size);
  vertical-align: top;
}

/* Kutoten (句読点) */
:where(.${prefix}-kutoten) {
  display: inline;
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

/* Tateten (たて点) - 共通部分 */
:where(.${prefix}-tateten-group) {
  display: inline;
}

:where(.${prefix}-tateten-mark) {
  display: inline-block;
  background-color: currentColor;
  vertical-align: middle;
}

/* Note (注釈) */
:where(.${prefix}-note-ref) {
  font-size: 0.7em;
  vertical-align: super;
  color: inherit;
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

/* Emphasis (傍点) - 共通部分 */
:where(.${prefix}-emphasis) {
  text-emphasis: filled circle;
  text-emphasis-color: var(--${vp}-color-emphasis);
}

/*
 * Underline (傍線) - 教育用途・共通部分
 *
 * box-shadow を使用して傍線を表示。
 * text-decoration は display: inline-block の子要素には伝播しないため、
 * box-shadow で代替実装。inset を使用し、spread で線の太さを制御。
 */
:where(.${prefix}-underline) {
  position: relative;
}

:where(.${prefix}-underline[data-style="solid"]) {
  /* Default solid line - スタイルは書字方向依存部分で定義 */
}

/*
 * Label (番号振り) - 教育用途・共通部分
 *
 * 傍線部の識別子や注番号として表示。
 */
:where(.${prefix}-label) {
  font-size: 0.7em;
  vertical-align: super;
}

/* underline内のラベル - 共通部分 */
:where(.${prefix}-underline .${prefix}-label) {
  position: absolute;
  vertical-align: baseline;
  white-space: nowrap;
}`;
}

/**
 * 書字方向依存スタイル
 */
function generateWritingModeStyles(prefix: string, isVertical: boolean): string {
  if (isVertical) {
    return `
/* Tateten (たて点) - 縦書き */
:where(.${prefix}-tateten-mark) {
  width: 0.1em;
  height: 0.6em;
}

/* Emphasis (傍点) - 縦書き */
:where(.${prefix}-emphasis) {
  text-emphasis-position: right;
}

/* Underline (傍線) - 縦書き: 右側に表示 */
:where(.${prefix}-underline) {
  box-shadow: inset -1px 0 0 0 currentColor;
  padding-right: 0.25em;
}

/* 読み仮名がある場合はpadding-rightを広げる */
:where(.${prefix}-underline--has-ruby) {
  padding-right: 0.5em;
}

:where(.${prefix}-underline[data-style="dotted"]) {
  box-shadow: none;
  background-image: linear-gradient(to bottom, currentColor 2px, transparent 2px);
  background-size: 1px 4px;
  background-repeat: repeat-y;
  background-position: right;
}

:where(.${prefix}-underline[data-style="dashed"]) {
  box-shadow: none;
  background-image: linear-gradient(to bottom, currentColor 4px, transparent 4px);
  background-size: 1px 8px;
  background-repeat: repeat-y;
  background-position: right;
}

:where(.${prefix}-underline[data-style="wavy"]) {
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

:where(.${prefix}-underline[data-style="double"]) {
  box-shadow: none;
  padding-right: 0.5em;
}

:where(.${prefix}-underline[data-style="double"])::before,
:where(.${prefix}-underline[data-style="double"])::after {
  content: '';
  position: absolute;
  background-color: currentColor;
  top: 0;
  bottom: 0;
  width: 1px;
}

:where(.${prefix}-underline[data-style="double"])::before {
  right: 0;
}

:where(.${prefix}-underline[data-style="double"])::after {
  right: 3px;
}

:where(.${prefix}-underline--has-ruby[data-style="double"]) {
  padding-right: 0.7em;
}

/* Label - 縦書き: 傍線の開始位置（上）に配置 */
:where(.${prefix}-underline .${prefix}-label) {
  inset-inline-start: 0;
  inset-block-start: -1.5em;
}

/* 縦書きで半角文字の場合は縦中横 */
:where(.${prefix}-label--half-width) {
  text-combine-upright: all;
}`;
  } else {
    return `
/* Tateten (たて点) - 横書き */
:where(.${prefix}-tateten-mark) {
  width: 0.6em;
  height: 0.1em;
}

/* Emphasis (傍点) - 横書き */
:where(.${prefix}-emphasis) {
  text-emphasis-position: over;
}

/* Underline (傍線) - 横書き: 下側に表示 */
:where(.${prefix}-underline) {
  box-shadow: inset 0 -1px 0 0 currentColor;
  padding-bottom: 0.1em;
}

/* 読み仮名がある場合 - 横書きでは特別な調整なし */
:where(.${prefix}-underline--has-ruby) {
  /* No additional padding needed for horizontal */
}

:where(.${prefix}-underline[data-style="dotted"]) {
  box-shadow: none;
  background-image: linear-gradient(to right, currentColor 2px, transparent 2px);
  background-size: 4px 1px;
  background-repeat: repeat-x;
  background-position: bottom;
}

:where(.${prefix}-underline[data-style="dashed"]) {
  box-shadow: none;
  background-image: linear-gradient(to right, currentColor 4px, transparent 4px);
  background-size: 8px 1px;
  background-repeat: repeat-x;
  background-position: bottom;
}

:where(.${prefix}-underline[data-style="wavy"]) {
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

:where(.${prefix}-underline[data-style="double"]) {
  box-shadow: none;
  padding-bottom: 0.3em;
}

:where(.${prefix}-underline[data-style="double"])::before,
:where(.${prefix}-underline[data-style="double"])::after {
  content: '';
  position: absolute;
  background-color: currentColor;
  left: 0;
  right: 0;
  height: 1px;
}

:where(.${prefix}-underline[data-style="double"])::before {
  bottom: 0;
}

:where(.${prefix}-underline[data-style="double"])::after {
  bottom: 3px;
}

:where(.${prefix}-underline--has-ruby[data-style="double"]) {
  /* No additional padding needed for horizontal */
}

/* Label - 横書き: 傍線の開始位置（下）に配置 */
:where(.${prefix}-underline .${prefix}-label) {
  inset-inline-start: 0;
  inset-block-end: -1.5em;
}

/* 横書きでは縦中横不要 */
:where(.${prefix}-label--half-width) {
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
