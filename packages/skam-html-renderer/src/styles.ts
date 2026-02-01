/**
 * SKAM HTML Renderer - Default CSS Styles
 */

export interface StyleOptions {
  classPrefix?: string;
  writingMode?: 'vertical' | 'horizontal';
}

/**
 * Generate default CSS styles for SKAM HTML output
 */
export function getDefaultStyles(options: StyleOptions = {}): string {
  const prefix = options.classPrefix ?? 'skam';
  const writingMode = options.writingMode ?? 'vertical';

  const isVertical = writingMode === 'vertical';

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

/* Okurigana (送り仮名) - ruby内rtに配置 */
.${prefix}-okuri {
  font-size: inherit;
}

/* Soegana (添え仮名) - ruby内rtに配置（okuriganaと同じパターン） */
.${prefix}-soegana {
  font-size: inherit;
}

/* Okimoji (置字) - 訓読時に読まない漢字 */
.${prefix}-okimoji {
  opacity: 0.6;
}

/* Joji (助字) - 文法的機能を持つ漢字の分類ラベル */
.${prefix}-joji {
  /* デフォルトでは特別なスタイルなし（必要に応じてカスタマイズ可能） */
}

/* Kaeriten (返り点) - 縦書き時は右下に配置 */
.${prefix}-kaeriten {
  font-size: 0.5em;
  color: inherit;
  ${isVertical ? 'position: relative; inset-block-end: -1em;' : 'vertical-align: sub;'}
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
`.trim();
}
