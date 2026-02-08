/**
 * No-op tagged template literal for CSS.
 *
 * Stylelint (postcss-styled-syntax) がテンプレートリテラル内の CSS を認識するためのマーカー。
 * ランタイムでは通常のテンプレートリテラルと同等の文字列連結を行う。
 */
export function css(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce(
    (result, str, i) => result + str + (i < values.length ? String(values[i]) : ''),
    ''
  );
}
