/**
 * SKAM-ML/XML Parser (Node.js)
 *
 * SKAMドキュメントのXML形式デシリアライズ
 */

import type { SKAMDocument } from '@kanbun-skam/skam';
import { parseWith, type ParseOptions } from './parser-core.js';
import { parseXML } from './xml-parser.js';

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
 * @param options Parse options. `trustedTypesPolicy` is ignored in this build (xmldom does not use Trusted Types)
 * @returns SKAMDocument
 * @throws SKAMXMLParseError if parsing fails
 */
export function parse(xml: string, options: ParseOptions = {}): SKAMDocument {
  return parseWith(parseXML, xml, options);
}
