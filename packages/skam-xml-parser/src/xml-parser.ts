/**
 * XML Parser for Node.js
 *
 * Uses @xmldom/xmldom for XML parsing
 */

import { DOMParser } from '@xmldom/xmldom';
import { SKAMXMLParseError } from './parse-error.js';

/**
 * xmldom が診断メッセージの末尾に埋め込む位置の断片 (locator 指定時)。書式は `\n@<systemId>#[line:L,col:C]`。
 * 空の入力では `line:0,col:undefined` のように数字以外が入るため、中身の形に依らず断片全体に一致させる。
 */
const LOCATION_FRAGMENT = /\n?@[^\n]*?#\[line:([^,\]]*),col:([^\]]*)\]/;

/** 1 以上の整数の表記 (xmldom の line と col は 1 始まり。0 は位置を読む前の初期値) */
const POSITIVE_INTEGER = /^[1-9]\d*$/;

/**
 * xmldom の報告から、メッセージ本文と位置を取り出す。
 * 位置は line と col がともに 1 以上の整数のときだけ付け、それ以外は 2 つとも付けない。
 */
export function interpretXmldomReport(report: string): {
  message: string;
  line?: number;
  column?: number;
} {
  const fragment = LOCATION_FRAGMENT.exec(report);
  const message = report
    .replace(LOCATION_FRAGMENT, '')
    .replace(/^\[xmldom \w+\]\s*/, '')
    .trim();
  const [, line, column] = fragment ?? [];
  if (
    line !== undefined &&
    column !== undefined &&
    POSITIVE_INTEGER.test(line) &&
    POSITIVE_INTEGER.test(column)
  ) {
    return { message, line: Number(line), column: Number(column) };
  }
  return { message };
}

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
    const { message, line, column } = interpretXmldomReport(first);
    throw new SKAMXMLParseError(`XML parse error: ${message}`, line, column);
  }

  return doc;
}
