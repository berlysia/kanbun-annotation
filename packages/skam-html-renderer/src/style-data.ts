/**
 * SKAM HTML Renderer - style 属性の代わりに出す data 属性
 *
 * `inlineStyles: false` の HTML は style 属性を持たず、値を data 属性に置く。
 * `applyRenderedStyles` が DOM に入れた後の要素へ CSSOM (`style.setProperty`) で値を設定する。
 * CSSOM の設定は CSP の `style-src` に止められないので、nonce だけを許すページでも値が効く。
 *
 * data 属性の名前と CSS のプロパティ名の対応は、この 1 か所で定める。
 * 依存の向きは renderer → style-data → safe / html-utils。renderer は import しない。
 */

import { escapeHtml } from './html-utils.js';
import { toCssEmphasisValue, type SafeCssValue } from './safe.js';

/** ヲコト点の <span> に付く 4 つの値。CSS 変数の名前は variablePrefix に依らない固定の名前 */
const OKOTOTEN_STYLE_DATA = {
  x: { attribute: 'data-okototen-x', property: '--okototen-x' },
  y: { attribute: 'data-okototen-y', property: '--okototen-y' },
  cols: { attribute: 'data-okototen-cols', property: '--okototen-grid' },
  rows: { attribute: 'data-okototen-rows', property: '--okototen-grid-rows' },
} as const;

/** 傍点の指定 (キーワードか字) を変換前のまま持つ属性 */
const EMPHASIS_STYLE_ATTRIBUTE = 'data-emphasis-style';
const EMPHASIS_STYLE_PROPERTY = 'text-emphasis-style';

export interface OkototenStyleValues {
  x: SafeCssValue;
  y: SafeCssValue;
  cols: SafeCssValue;
  rows: SafeCssValue;
}

/** ヲコト点の <span> の開始タグに足す属性 (先頭に空白を含む) */
export function okototenStyleAttributes(
  values: OkototenStyleValues,
  inlineStyles: boolean
): string {
  if (inlineStyles) {
    const { x, y, cols, rows } = OKOTOTEN_STYLE_DATA;
    return ` style="${x.property}: ${values.x}; ${y.property}: ${values.y}; ${cols.property}: ${values.cols}; ${rows.property}: ${values.rows};"`;
  }
  return Object.entries(OKOTOTEN_STYLE_DATA)
    .map(([key, { attribute }]) => ` ${attribute}="${values[key as keyof OkototenStyleValues]}"`)
    .join('');
}

/**
 * 傍点を持つ要素の開始タグに足す属性 (先頭に空白を含む)。
 * data 属性の値は変換前の指定で、CSS の値への変換は `applyRenderedStyles` だけが行う。
 */
export function emphasisStyleAttributes(emphasisStyle: string, inlineStyles: boolean): string {
  if (inlineStyles) {
    return ` style="${EMPHASIS_STYLE_PROPERTY}: ${escapeHtml(toCssEmphasisValue(emphasisStyle))};"`;
  }
  return ` ${EMPHASIS_STYLE_ATTRIBUTE}="${escapeHtml(emphasisStyle)}"`;
}

const SAFE_INTEGER_TEXT = /^\d+$/;

const STYLE_DATA_SELECTOR = [
  ...Object.values(OKOTOTEN_STYLE_DATA).map(({ attribute }) => `[${attribute}]`),
  `[${EMPHASIS_STYLE_ATTRIBUTE}]`,
].join(',');

/**
 * `inlineStyles: false` の HTML を DOM に入れた後に呼び、data 属性の値を CSSOM で設定する。
 *
 * `root` の子孫だけが対象で、`root` 自身は含まない。ShadowRoot も渡せる。
 * 同じ root に何度呼んでも結果は同じ。値が不正な属性は設定せず、投げない
 * (ヲコト点の 4 つは独立に扱う。整数は `^\d+$` に合い安全な整数の範囲のものだけ、傍点は
 * `toCssEmphasisValue` の結果だけが入る。任意の CSS は入らない)。
 *
 * @experimental 0.x の minor で変わりうる。
 */
export function applyRenderedStyles(root: ParentNode): void {
  for (const element of Array.from(root.querySelectorAll<HTMLElement>(STYLE_DATA_SELECTOR))) {
    for (const { attribute, property } of Object.values(OKOTOTEN_STYLE_DATA)) {
      const value = element.getAttribute(attribute);
      if (value !== null && SAFE_INTEGER_TEXT.test(value) && Number.isSafeInteger(Number(value))) {
        element.style.setProperty(property, value);
      }
    }
    const emphasis = element.getAttribute(EMPHASIS_STYLE_ATTRIBUTE);
    if (emphasis !== null) {
      element.style.setProperty(EMPHASIS_STYLE_PROPERTY, toCssEmphasisValue(emphasis));
    }
  }
}
