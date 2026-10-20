/**
 * SKAM-ML/XML Parser (Browser)
 *
 * SKAMドキュメントのXML形式デシリアライズ
 */

import type { SKAMDocument } from '@kanbun-skam/skam';
import { parseWith, type ParseOptions } from './parser-core.js';
import { parseXML } from './xml-parser.browser.js';

export type { SKAMDocument } from '@kanbun-skam/skam';
export { SKAMValidationError } from '@kanbun-skam/skam';
export {
  SKAM_ML_CONTENT_MODEL,
  SKAMXMLParseError,
  type ParseOptions,
  type ParseWarning,
  type PositionInfo,
  type TokenPosition,
} from './parser-core.js';
export { SKAM_XML_MEDIA_TYPE, extractXmlFromScriptElement } from './xml-extraction.js';
/**
 * Parse SKAM-ML/XML string to SKAMDocument
 *
 * @param xml XML string
 * @param options Parse options
 * @returns SKAMDocument
 * @throws SKAMXMLParseError if parsing fails
 */
export function parse(xml: string, options: ParseOptions = {}): SKAMDocument {
  return parseWith((source) => parseXML(source, options.trustedTypesPolicy), xml, options);
}
