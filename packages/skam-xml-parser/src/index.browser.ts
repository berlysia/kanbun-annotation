/**
 * SKAM-ML/XML Parser (Browser)
 *
 * SKAMドキュメントのXML形式デシリアライズ
 */

import type { SKAMDocument } from '@kanbun/skam';
import { parseFromDocument, SKAMXMLParseError, type ParseOptions } from './parser-core.js';
import { parseXML } from './xml-parser.browser.js';

export type { SKAMDocument } from '@kanbun/skam';
export {
  SKAMXMLParseError,
  type ParseOptions,
  type PositionInfo,
  type TokenPosition,
} from './parser-core.js';
export { stringify, type StringifyOptions } from './stringify.js';

/**
 * Parse SKAM-ML/XML string to SKAMDocument
 *
 * @param xml XML string
 * @param options Parse options
 * @returns SKAMDocument
 * @throws SKAMXMLParseError if parsing fails
 */
export function parse(xml: string, options: ParseOptions = {}): SKAMDocument {
  const doc = parseXML(xml);
  return parseFromDocument(doc, options, xml);
}
