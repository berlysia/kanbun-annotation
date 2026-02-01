/**
 * SKAM HTML Renderer - Default CSS Styles
 */

export interface StyleOptions {
  classPrefix?: string;
  writingMode?: 'vertical' | 'horizontal';
  inline?: boolean;
}

/**
 * Generate default CSS styles for SKAM HTML output
 */
export function getDefaultStyles(options: StyleOptions = {}): string {
  const prefix = options.classPrefix ?? 'skam';
  const writingMode = options.writingMode ?? 'vertical';
  const inline = options.inline ?? false;

  const isVertical = writingMode === 'vertical';

  // インラインモード用スタイル
  const inlineStyles = inline
    ? `
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
}
`
    : '';

  return `
/* SKAM Document Container */
.${prefix}-document {
  --glyph-size: 1em;
  font-family: "Noto Serif JP", "Source Han Serif JP", "Yu Mincho", serif;
  line-height: 2;
  ${isVertical ? 'writing-mode: vertical-rl;' : ''}
  ${isVertical ? 'text-orientation: mixed;' : ''}
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

/* Tateten (たて点) */
.${prefix}-tateten-group {
  display: inline;
}

.${prefix}-tateten-mark {
  display: inline-block;
  ${isVertical ? 'width: 0.1em; height: 0.6em;' : 'width: 0.6em; height: 0.1em;'}
  background-color: currentColor;
  vertical-align: middle;
}

/* Emphasis (傍点) */
.${prefix}-emphasis {
  text-emphasis: filled circle;
  text-emphasis-position: ${isVertical ? 'right' : 'over'};
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

/*
 * Underline (傍線) - 教育用途
 *
 * box-shadow を使用して傍線を表示。
 * text-decoration は display: inline-block の子要素には伝播しないため、
 * box-shadow で代替実装。inset を使用し、spread で線の太さを制御。
 *
 * 縦書きでは右側に表示（漢文の傍線部が従来右側に引かれる慣習に従う）。
 * 横書きでは下側に表示。
 */
.${prefix}-underline {
  position: relative;
  ${isVertical ? 'box-shadow: inset -1px 0 0 0 currentColor;' : 'box-shadow: inset 0 -1px 0 0 currentColor;'}
  ${isVertical ? 'padding-right: 0.25em;' : 'padding-bottom: 0.1em;'}
}

/* 読み仮名がある場合はpadding-rightを広げる */
.${prefix}-underline--has-ruby {
  ${isVertical ? 'padding-right: 0.5em;' : ''}
}

.${prefix}-underline[data-style="solid"] {
  /* Default solid line - no change needed */
}

.${prefix}-underline[data-style="dotted"] {
  ${isVertical
      ? 'box-shadow: none; background-image: linear-gradient(to bottom, currentColor 2px, transparent 2px); background-size: 1px 4px; background-repeat: repeat-y; background-position: right;'
      : 'box-shadow: none; background-image: linear-gradient(to right, currentColor 2px, transparent 2px); background-size: 4px 1px; background-repeat: repeat-x; background-position: bottom;'}
}

.${prefix}-underline[data-style="dashed"] {
  ${isVertical
      ? 'box-shadow: none; background-image: linear-gradient(to bottom, currentColor 4px, transparent 4px); background-size: 1px 8px; background-repeat: repeat-y; background-position: right;'
      : 'box-shadow: none; background-image: linear-gradient(to right, currentColor 4px, transparent 4px); background-size: 8px 1px; background-repeat: repeat-x; background-position: bottom;'}
}

.${prefix}-underline[data-style="wavy"] {
  /*
   * Wavy line using repeating SVG pattern
   * SVG内でcurrentColorは効かないため、黒色を直接指定。
   * 縦書き: 右側に縦方向の波線（幅4px、周期8px）
   * 横書き: 下側に横方向の波線（周期8px、高さ4px）
   */
  ${isVertical
      ? `box-shadow: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='8' viewBox='0 0 4 8'%3E%3Cpath d='M3 0 Q0 4 3 8' stroke='%23333' fill='none' stroke-width='1'/%3E%3C/svg%3E"); background-size: 4px 8px; background-repeat: repeat-y; background-position: right;`
      : `box-shadow: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='4' viewBox='0 0 8 4'%3E%3Cpath d='M0 3 Q4 0 8 3' stroke='%23333' fill='none' stroke-width='1'/%3E%3C/svg%3E"); background-size: 8px 4px; background-repeat: repeat-x; background-position: bottom;`}
}

.${prefix}-underline[data-style="double"] {
  box-shadow: none;
  ${isVertical ? 'padding-right: 0.5em;' : 'padding-bottom: 0.3em;'}
}

.${prefix}-underline[data-style="double"]::before,
.${prefix}-underline[data-style="double"]::after {
  content: '';
  position: absolute;
  background-color: currentColor;
  ${isVertical
      ? 'top: 0; bottom: 0; width: 1px;'
      : 'left: 0; right: 0; height: 1px;'}
}

.${prefix}-underline[data-style="double"]::before {
  ${isVertical ? 'right: 0;' : 'bottom: 0;'}
}

.${prefix}-underline[data-style="double"]::after {
  ${isVertical ? 'right: 3px;' : 'bottom: 3px;'}
}

.${prefix}-underline--has-ruby[data-style="double"] {
  ${isVertical ? 'padding-right: 0.7em;' : ''}
}

/*
 * Label (番号振り) - 教育用途
 *
 * 傍線部の識別子や注番号として表示。
 * underline要素内では絶対配置で傍線の末尾外側に配置。
 * 縦書きで半角文字の場合は縦中横を適用。
 */
.${prefix}-label {
  font-size: 0.7em;
  vertical-align: super;
}

/* underline内のラベルは絶対配置（傍線の開始位置に配置） */
.${prefix}-underline .${prefix}-label {
  position: absolute;
  ${isVertical
      ? 'inset-inline-start: 0; inset-block-start: -1.5em;'
      : 'inset-inline-start: 0; inset-block-end: -1.5em;'}
  vertical-align: baseline;
  white-space: nowrap;
}

/* 縦書きで半角文字の場合は縦中横 */
.${prefix}-label--half-width {
  ${isVertical ? 'text-combine-upright: all;' : ''}
}
${inlineStyles}`.trim();
}
