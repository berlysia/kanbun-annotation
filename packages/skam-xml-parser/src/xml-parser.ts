/**
 * XML Parser for Node.js
 *
 * Uses @xmldom/xmldom for XML parsing
 */

import { DOMParser } from '@xmldom/xmldom';
import { SKAMXMLParseError } from './parse-error.js';

/** xmldom が診断メッセージに埋め込む位置表記 (locator 指定時) */
const LOCATION = /@#\[line:(\d+),col:(\d+)\]/;

/**
 * 正当な入力でも出てくる xmldom の warning だけを許可する。
 * 0.8.15 では fixtures / サンプル / 仕様書の完全な例のいずれからも warning が出ないため空。
 */
const ALLOWED_XMLDOM_WARNINGS: readonly RegExp[] = [];

/**
 * Parse XML string to Document (Node.js implementation)
 *
 * xmldom は引用符のない属性値や閉じタグの不一致を warning として受理するため、
 * warning も error と同じく失敗として扱う (ブラウザの DOMParser が parsererror を返す挙動に揃える)。
 *
 * @param xml XML string
 * @returns Parsed Document
 * @throws SKAMXMLParseError if XML parsing fails
 */
export function parseXML(xml: string): Document {
  const problems: string[] = [];
  const parser = new DOMParser({
    locator: {},
    errorHandler: {
      warning: (m) => {
        if (!ALLOWED_XMLDOM_WARNINGS.some((r) => r.test(m))) problems.push(m);
      },
      error: (m) => problems.push(m),
      fatalError: (m) => problems.push(m),
    },
  });

  const doc = parser.parseFromString(xml, 'application/xml');

  const first = problems[0];
  if (first !== undefined) {
    const loc = LOCATION.exec(first);
    const message = first
      .replace(LOCATION, '')
      .replace(/^\[xmldom \w+\]\s*/, '')
      .trim();
    throw new SKAMXMLParseError(
      `XML parse error: ${message}`,
      loc ? Number(loc[1]) : undefined,
      loc ? Number(loc[2]) : undefined
    );
  }

  return doc;
}
