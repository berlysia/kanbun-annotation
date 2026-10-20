/**
 * XML テキスト取得ロジック
 *
 * 優先順位:
 * 1. xmlContent プロパティ（プログラマティック設定値）
 * 2. <script type="application/vnd.berlysia.skam+xml"> 子要素の textContent
 * 3. Light DOM の textContent（フォールバック）
 */

import { extractXmlFromScriptElement } from '@kanbun-skam/skam-xml-parser';

// parser が実体を持つ。Web Component からの import 元も維持するため再 export する。
export { SKAM_XML_MEDIA_TYPE, extractXmlFromScriptElement } from '@kanbun-skam/skam-xml-parser';

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
