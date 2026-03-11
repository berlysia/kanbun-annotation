/**
 * Webフォントローダー
 *
 * Google Fonts から Noto Serif JP を読み込むユーティリティ。
 * ブラウザ環境（CSS Font Loading API 対応）でのみ動作する。
 */

/** デフォルトフォントファミリー名 */
export const DEFAULT_FONT_FAMILY = 'Noto Serif JP';

const GOOGLE_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Noto+Serif+JP&display=swap';

let loaded = false;

/**
 * デフォルトフォント (Noto Serif JP) を Google Fonts から読み込む。
 *
 * - ブラウザ環境で CSS Font Loading API を使用
 * - 冪等: 2回目以降の呼び出しは即座に返る
 * - 非ブラウザ環境 (Node.js / node-canvas 等) では何もしない
 *
 * @example
 * ```ts
 * import { loadDefaultFont, render } from '@kanbun-skam/skam-canvas-renderer';
 *
 * await loadDefaultFont();
 * render(doc, canvas);
 * ```
 */
export async function loadDefaultFont(): Promise<void> {
  if (loaded) return;

  if (typeof document === 'undefined' || typeof FontFace === 'undefined') {
    return;
  }

  // Google Fonts CSS がまだ注入されていなければ追加
  const existing = document.querySelector(
    'link[href*="fonts.googleapis.com"][href*="Noto+Serif+JP"]'
  );
  if (!existing) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = GOOGLE_FONTS_URL;
    document.head.appendChild(link);
  }

  // フォントの読み込み完了を待つ
  await document.fonts.load(`24px "${DEFAULT_FONT_FAMILY}"`);
  loaded = true;
}
