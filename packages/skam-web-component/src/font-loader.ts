/**
 * Google Fonts からの Noto Serif JP 自動ロード
 *
 * document.head に <link> を注入する冪等ユーティリティ。
 * Shadow DOM 内のフォント CSS Variable 設定も提供する。
 */

export const DEFAULT_FONT_FAMILY = 'Noto Serif JP';

const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700&display=swap';

const LINK_SELECTOR = 'link[href*="fonts.googleapis.com"][href*="Noto+Serif+JP"]';

/**
 * Google Fonts CSS <link> を document.head に注入する（冪等）。
 * 既に同等の <link> が存在する場合はスキップ。
 */
export function injectGoogleFontsLink(): void {
  if (typeof document === 'undefined') return;

  if (!document.querySelector(LINK_SELECTOR)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = GOOGLE_FONTS_URL;
    document.head.appendChild(link);
  }
}

/**
 * Shadow DOM に注入するフォント CSS Variable のスタイル文字列を生成する。
 * :host に設定することで、外部 CSS からのオーバーライドが可能。
 */
export function buildFontStyle(variablePrefix: string): string {
  const family = `"${DEFAULT_FONT_FAMILY}", serif`;
  return `:host {
  --${variablePrefix}-font-family: ${family};
  --${variablePrefix}-font-family-ruby: ${family};
}`;
}
