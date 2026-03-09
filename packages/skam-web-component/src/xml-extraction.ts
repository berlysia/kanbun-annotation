/**
 * XML テキスト取得ロジック
 *
 * 優先順位:
 * 1. xmlContent プロパティ（プログラマティック設定値）
 * 2. <script type="application/vnd.berlysia.skam+xml"> 子要素の textContent
 * 3. Light DOM の textContent（フォールバック）
 */

export const SKAM_XML_MEDIA_TYPE = 'application/vnd.berlysia.skam+xml';

/**
 * <script type="application/vnd.berlysia.skam+xml"> 要素からXMLを取得する
 */
export function extractXmlFromScriptElement(host: HTMLElement): string | null {
  const script = host.querySelector(`script[type="${SKAM_XML_MEDIA_TYPE}"]`);
  if (script) {
    const text = script.textContent?.trim();
    return text || null;
  }
  return null;
}

/**
 * Light DOM の textContent からXMLを取得する（フォールバック）
 */
export function extractXmlFromLightDOM(host: HTMLElement): string | null {
  const text = host.textContent;
  if (text && text.trim()) {
    return text;
  }
  return null;
}

/**
 * XML テキストを優先順位に従って取得する
 *
 * @param xmlContent - プログラマティックに設定された XML (undefined = 未設定)
 * @param host - カスタムエレメントのホスト要素
 * @returns XML テキストまたは null
 */
export function extractXml(xmlContent: string | undefined, host: HTMLElement): string | null {
  // 1. xmlContent プロパティ (undefined でない場合は空文字列でも使用)
  if (xmlContent !== undefined) {
    return xmlContent || null;
  }

  // 2. <script type="application/vnd.berlysia.skam+xml">
  const fromScript = extractXmlFromScriptElement(host);
  if (fromScript) {
    return fromScript;
  }

  // 3. Light DOM textContent
  return extractXmlFromLightDOM(host);
}
