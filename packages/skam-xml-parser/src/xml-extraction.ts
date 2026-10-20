/**
 * SKAM-ML を HTML に埋め込むときのメディアタイプ。仕様の約束であり、実装の都合では変えない。
 * 根拠と範囲は SKAM-ML-draft §3.3 を参照。
 */
export const SKAM_XML_MEDIA_TYPE = 'application/vnd.berlysia.skam+xml';

/**
 * <script type="application/vnd.berlysia.skam+xml"> 要素から SKAM-ML を取り出す。
 *
 * このパッケージは DOM の型を読み込まないため、引数は querySelector を持つ構造の型で受ける
 * (HTMLElement も Document も渡せる)。取り出した文字列は必ず parse に通すこと。
 * 第三者が書ける領域があるページでは、document ではなく信頼できる container を渡す。
 *
 * @experimental 0.x の minor で変わりうる。
 */
export function extractXmlFromScriptElement(host: {
  querySelector(selector: string): { textContent: string | null } | null;
}): string | null {
  const script = host.querySelector(`script[type="${SKAM_XML_MEDIA_TYPE}"]`);
  if (script) {
    const text = script.textContent?.trim();
    return text || null;
  }
  return null;
}
