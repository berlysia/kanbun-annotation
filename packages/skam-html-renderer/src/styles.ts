/**
 * SKAM HTML Renderer - Default CSS Styles
 */

/**
 * CSSスタイル生成オプション
 */
export interface StyleOptions {
  classPrefix?: string;
  writingMode?: 'vertical' | 'horizontal' | 'both';
  inline?: boolean;
}

/**
 * Generate default CSS styles for SKAM HTML output
 *
 * @param options - スタイル生成オプション
 * @param options.classPrefix - CSSクラス名プレフィックス（default: 'skam'）
 * @param options.writingMode - 書字方向（'vertical' | 'horizontal' | 'both'）
 * @param options.inline - インラインモード用スタイルを含めるか
 */
export function getDefaultStyles(options: StyleOptions = {}): string {
  const prefix = options.classPrefix ?? 'skam';
  const writingMode = options.writingMode ?? 'vertical';
  const inline = options.inline ?? false;

  const commonStyles = generateCommonStyles(prefix);
  const inlineStyles = inline ? generateInlineStyles(prefix) : '';

  if (writingMode === 'both') {
    // 縦書き・横書き両方のスタイルを data-writing-mode セレクタでラップして出力
    const verticalStyles = generateWritingModeStyles(prefix, true);
    const horizontalStyles = generateWritingModeStyles(prefix, false);

    return `${commonStyles}

/* Vertical Writing Mode */
.${prefix}-document[data-writing-mode="vertical"] {
  writing-mode: vertical-rl;
  text-orientation: mixed;
}

${wrapWithSelector(`[data-writing-mode="vertical"]`, prefix, verticalStyles)}

/* Horizontal Writing Mode */
${wrapWithSelector(`[data-writing-mode="horizontal"]`, prefix, horizontalStyles)}
${inlineStyles}`.trim();
  } else {
    // 単一の書字方向のみ出力（後方互換）
    const isVertical = writingMode === 'vertical';
    const writingModeStyles = generateWritingModeStyles(prefix, isVertical);
    const documentWritingMode = isVertical
      ? `
.${prefix}-document {
  writing-mode: vertical-rl;
  text-orientation: mixed;
}`
      : '';

    return `${commonStyles}
${documentWritingMode}
${writingModeStyles}
${inlineStyles}`.trim();
  }
}

/**
 * 共通スタイル（書字方向に依存しない）
 */
function generateCommonStyles(prefix: string): string {
  return `
/* SKAM Document Container */
.${prefix}-document {
  --glyph-size: 1em;
  font-family: "Noto Serif JP", "Source Han Serif JP", "Yu Mincho", serif;
  line-height: 2;
}

/* Display Layer */
.${prefix}-display {
  position: relative;
}

/* Block (論理的なブロック単位、句や段落など) */
.${prefix}-block {
  display: block;
}

/* Reading Layer (a11y, visually hidden) */
.${prefix}-reading {
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
.${prefix}-token {
  position: relative;
  display: inline-block;
}

/* Base character */
.${prefix}-base {
  display: inline;
}

/* Ruby styling */
.${prefix}-token ruby {
  ruby-align: center;
}

.${prefix}-ruby {
  font-size: 0.5em;
}

/* Okurigana (送り仮名) */
.${prefix}-okuri {
  display: inline;
}

/* Soegana (添え仮名) */
.${prefix}-soegana {
  display: inline;
}

/* Okimoji (置字) - 訓読時に読まない漢字 */
.${prefix}-okimoji {
  opacity: 0.6;
}

/* Joji (助字) - 文法的機能を持つ漢字の分類ラベル */
.${prefix}-joji {
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
.${prefix}-suffix-row {
  display: inline-grid;
  font-size: 0.5em;
  grid-template-rows: 1em 2em 1em;
  line-height: 1;
  vertical-align: top;
}

/* Suffix Right (送り仮名・添え仮名) */
.${prefix}-suffix-right {
  grid-row: 1;
}

/* Suffix Center (返り点) - 縦書き時は左寄せ、横書き時は下寄せ */
.${prefix}-suffix-center {
  grid-row: 2;
  align-self: end;
}

/* Suffix Left (再読文字2回目の送り仮名) */
.${prefix}-suffix-left {
  grid-row: 3;
}

/* Kaeriten (返り点) */
.${prefix}-kaeriten {
  color: inherit;
}

/* Suffix Kana (送り仮名・添え仮名のみの場合) */
.${prefix}-suffix-kana {
  font-size: 0.5em;
  vertical-align: top;
}

/* Kutoten (句読点) */
.${prefix}-kutoten {
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
.${prefix}-saidoku-outer {
  ruby-position: under;
}

.${prefix}-saidoku-inner {
  ruby-position: over;
}

/* Okototen (ヲコト点) */
.${prefix}-has-okototen {
  position: relative;
}

.${prefix}-okototen {
  position: absolute;
  font-size: 0.3em;
  left: calc((var(--okototen-x) / var(--okototen-grid)) * var(--glyph-size));
  top: calc((var(--okototen-y) / var(--okototen-grid)) * var(--glyph-size));
  pointer-events: none;
}

.${prefix}-okototen[data-shape="dot"]::before {
  content: "・";
}

.${prefix}-okototen[data-shape="circle"]::before {
  content: "○";
}

.${prefix}-okototen[data-shape="line"]::before {
  content: "—";
}

/* Tateten (たて点) - 共通部分 */
.${prefix}-tateten-group {
  display: inline;
}

.${prefix}-tateten-mark {
  display: inline-block;
  background-color: currentColor;
  vertical-align: middle;
}

/* Note (注釈) */
.${prefix}-note-ref {
  font-size: 0.7em;
  vertical-align: super;
  color: inherit;
}

.${prefix}-notes {
  margin-top: 1em;
  padding-top: 1em;
  border-top: 1px solid currentColor;
  font-size: 0.9em;
}

.${prefix}-note-item {
  margin-bottom: 0.5em;
}

.${prefix}-note-marker {
  font-weight: bold;
  margin-right: 0.5em;
}

/* Emphasis (傍点) - 共通部分 */
.${prefix}-emphasis {
  text-emphasis: filled circle;
}

/*
 * Underline (傍線) - 教育用途・共通部分
 *
 * box-shadow を使用して傍線を表示。
 * text-decoration は display: inline-block の子要素には伝播しないため、
 * box-shadow で代替実装。inset を使用し、spread で線の太さを制御。
 */
.${prefix}-underline {
  position: relative;
}

.${prefix}-underline[data-style="solid"] {
  /* Default solid line - スタイルは書字方向依存部分で定義 */
}

/*
 * Label (番号振り) - 教育用途・共通部分
 *
 * 傍線部の識別子や注番号として表示。
 */
.${prefix}-label {
  font-size: 0.7em;
  vertical-align: super;
}

/* underline内のラベル - 共通部分 */
.${prefix}-underline .${prefix}-label {
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
.${prefix}-tateten-mark {
  width: 0.1em;
  height: 0.6em;
}

/* Emphasis (傍点) - 縦書き */
.${prefix}-emphasis {
  text-emphasis-position: right;
}

/* Underline (傍線) - 縦書き: 右側に表示 */
.${prefix}-underline {
  box-shadow: inset -1px 0 0 0 currentColor;
  padding-right: 0.25em;
}

/* 読み仮名がある場合はpadding-rightを広げる */
.${prefix}-underline--has-ruby {
  padding-right: 0.5em;
}

.${prefix}-underline[data-style="dotted"] {
  box-shadow: none;
  background-image: linear-gradient(to bottom, currentColor 2px, transparent 2px);
  background-size: 1px 4px;
  background-repeat: repeat-y;
  background-position: right;
}

.${prefix}-underline[data-style="dashed"] {
  box-shadow: none;
  background-image: linear-gradient(to bottom, currentColor 4px, transparent 4px);
  background-size: 1px 8px;
  background-repeat: repeat-y;
  background-position: right;
}

.${prefix}-underline[data-style="wavy"] {
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

.${prefix}-underline[data-style="double"] {
  box-shadow: none;
  padding-right: 0.5em;
}

.${prefix}-underline[data-style="double"]::before,
.${prefix}-underline[data-style="double"]::after {
  content: '';
  position: absolute;
  background-color: currentColor;
  top: 0;
  bottom: 0;
  width: 1px;
}

.${prefix}-underline[data-style="double"]::before {
  right: 0;
}

.${prefix}-underline[data-style="double"]::after {
  right: 3px;
}

.${prefix}-underline--has-ruby[data-style="double"] {
  padding-right: 0.7em;
}

/* Label - 縦書き: 傍線の開始位置（上）に配置 */
.${prefix}-underline .${prefix}-label {
  inset-inline-start: 0;
  inset-block-start: -1.5em;
}

/* 縦書きで半角文字の場合は縦中横 */
.${prefix}-label--half-width {
  text-combine-upright: all;
}`;
  } else {
    return `
/* Tateten (たて点) - 横書き */
.${prefix}-tateten-mark {
  width: 0.6em;
  height: 0.1em;
}

/* Emphasis (傍点) - 横書き */
.${prefix}-emphasis {
  text-emphasis-position: over;
}

/* Underline (傍線) - 横書き: 下側に表示 */
.${prefix}-underline {
  box-shadow: inset 0 -1px 0 0 currentColor;
  padding-bottom: 0.1em;
}

/* 読み仮名がある場合 - 横書きでは特別な調整なし */
.${prefix}-underline--has-ruby {
  /* No additional padding needed for horizontal */
}

.${prefix}-underline[data-style="dotted"] {
  box-shadow: none;
  background-image: linear-gradient(to right, currentColor 2px, transparent 2px);
  background-size: 4px 1px;
  background-repeat: repeat-x;
  background-position: bottom;
}

.${prefix}-underline[data-style="dashed"] {
  box-shadow: none;
  background-image: linear-gradient(to right, currentColor 4px, transparent 4px);
  background-size: 8px 1px;
  background-repeat: repeat-x;
  background-position: bottom;
}

.${prefix}-underline[data-style="wavy"] {
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

.${prefix}-underline[data-style="double"] {
  box-shadow: none;
  padding-bottom: 0.3em;
}

.${prefix}-underline[data-style="double"]::before,
.${prefix}-underline[data-style="double"]::after {
  content: '';
  position: absolute;
  background-color: currentColor;
  left: 0;
  right: 0;
  height: 1px;
}

.${prefix}-underline[data-style="double"]::before {
  bottom: 0;
}

.${prefix}-underline[data-style="double"]::after {
  bottom: 3px;
}

.${prefix}-underline--has-ruby[data-style="double"] {
  /* No additional padding needed for horizontal */
}

/* Label - 横書き: 傍線の開始位置（下）に配置 */
.${prefix}-underline .${prefix}-label {
  inset-inline-start: 0;
  inset-block-end: -1.5em;
}

/* 横書きでは縦中横不要 */
.${prefix}-label--half-width {
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
.${prefix}-document--inline {
  display: inline-block;
  position: relative;
  vertical-align: baseline;
}

.${prefix}-document--inline .${prefix}-display {
  display: inline;
}

.${prefix}-document--inline .${prefix}-block {
  display: inline;
}`;
}

/**
 * セレクタでラップ（data-writing-mode 属性セレクタ用）
 *
 * 各ルールのセレクタに親セレクタを付与する
 * 例: `.skam-emphasis { ... }` → `.skam-document[data-writing-mode="vertical"] .skam-emphasis { ... }`
 */
function wrapWithSelector(attrSelector: string, prefix: string, css: string): string {
  // CSSルールを解析して各セレクタにプレフィックスを追加
  // 簡易的な実装: 行頭の .${prefix}- で始まるセレクタを検出
  const lines = css.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    // セレクタ行を検出（.prefix- で始まり { で終わる、または , で終わる）
    const selectorMatch = line.match(/^(\s*)(\.[\w-]+.*?)(\s*\{?\s*,?\s*)$/);
    if (selectorMatch) {
      const indent = selectorMatch[1] ?? '';
      const selector = selectorMatch[2];
      const suffix = selectorMatch[3] ?? '';
      // セレクタが prefix を含む場合のみ変換
      if (selector && selector.includes(`.${prefix}-`)) {
        // 複数セレクタ（カンマ区切り）の場合は分割して処理
        const selectors = selector.split(',').map((s) => s.trim());
        const wrappedSelectors = selectors.map((s) => `.${prefix}-document${attrSelector} ${s}`);
        result.push(`${indent}${wrappedSelectors.join(',\n' + indent)}${suffix}`);
        continue;
      }
    }
    result.push(line);
  }

  return result.join('\n');
}
