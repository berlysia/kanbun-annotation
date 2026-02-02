/**
 * XML Parser for Browser
 *
 * Uses native DOMParser
 */

import { SKAMXMLParseError } from './parser-core.js';

/**
 * Parse XML string to Document (Browser implementation)
 *
 * @param xml XML string
 * @returns Parsed Document
 * @throws SKAMXMLParseError if XML parsing fails
 */
export function parseXML(xml: string): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');

  // Browser DOMParser returns parsererror element on error
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    const errorText = parseError.textContent ?? 'Unknown XML parse error';
    throw new SKAMXMLParseError(`XML parse error: ${errorText}`);
  }

  return doc;
}
