/**
 * XML Parser for Node.js
 *
 * Uses @xmldom/xmldom for XML parsing
 */

import { DOMParser } from '@xmldom/xmldom';
import { SKAMXMLParseError } from './parser-core.js';

/**
 * Parse XML string to Document (Node.js implementation)
 *
 * @param xml XML string
 * @returns Parsed Document
 * @throws SKAMXMLParseError if XML parsing fails
 */
export function parseXML(xml: string): Document {
  const errors: string[] = [];
  const parser = new DOMParser({
    errorHandler: {
      warning: () => {},
      error: (msg) => errors.push(msg),
      fatalError: (msg) => errors.push(msg),
    },
  });

  const doc = parser.parseFromString(xml, 'application/xml');

  if (errors.length > 0) {
    throw new SKAMXMLParseError(`XML parse error: ${errors[0]}`);
  }

  return doc;
}
