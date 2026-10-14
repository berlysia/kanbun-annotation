/**
 * SKAM-ML/XML Parser (Browser)
 *
 * SKAMドキュメントのXML形式デシリアライズ
 */

import type { SKAMDocument } from '@kanbun-skam/skam';
import { parseWith, SKAMXMLParseError, type ParseOptions } from './parser-core.js';
import { parseXML } from './xml-parser.browser.js';

export type { SKAMDocument } from '@kanbun-skam/skam';
export { SKAMValidationError } from '@kanbun-skam/skam';
export {
  SKAMXMLParseError,
  type ParseOptions,
  type ParseWarning,
  type PositionInfo,
  type TokenPosition,
} from './parser-core.js';
/**
 * Parse SKAM-ML/XML string to SKAMDocument
 *
 * @param xml XML string
 * @param options Parse options
 * @returns SKAMDocument
 * @throws SKAMXMLParseError if parsing fails
 */
export function parse(xml: string, options: ParseOptions = {}): SKAMDocument {
  return parseWith(parseXML, xml, options);
}
