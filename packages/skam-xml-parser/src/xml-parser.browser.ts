/**
 * XML Parser for Browser
 *
 * Uses native DOMParser
 */

import { SKAMXMLParseError } from './parse-error.js';

/**
 * Chromium (and probably WebKit): `error on line N at column M: <reason>`.
 * Digits are capped so that a huge number cannot become an imprecise float, and the patterns have
 * no nested quantifiers, so matching stays linear in the length of the sentence.
 */
const CHROMIUM_LOCATION = /error on line (\d{1,9}) at column (\d{1,9}):/;

/**
 * Firefox: `Line Number N, Column M:<echoed source line>` at the start of a line.
 * Anchored to a line start because the echoed source line can contain arbitrary text.
 */
const FIREFOX_LOCATION = /^Line Number (\d{1,9}), Column (\d{1,9}):/m;

/**
 * Read the line and column a browser reports in the text of its `parsererror` element.
 *
 * The values are what the browser reports, not a position computed from the source: the source is
 * not well-formed, so there is no single correct position. Chromium reports where it detected the
 * error (after the offending end tag, counted in code points), Firefox points near the offending
 * token. Both differ from the start-tag position the Node build reports.
 *
 * When both forms occur, the earlier one wins: in a real sentence the browser's own location comes
 * before any text copied from the source (Firefox echoes the source line after its location), and
 * the reason of a Chromium error comes after its location.
 *
 * @returns undefined when the text matches neither form (e.g. WebKit, whose text is unverified)
 */
export function parseBrowserErrorLocation(
  text: string
): { line: number; column: number } | undefined {
  const chromium = CHROMIUM_LOCATION.exec(text);
  const firefox = FIREFOX_LOCATION.exec(text);
  const match =
    chromium && firefox
      ? chromium.index <= firefox.index
        ? chromium
        : firefox
      : (chromium ?? firefox);
  if (!match) return undefined;
  return { line: Number(match[1]), column: Number(match[2]) };
}

const FIREFOX_PREFIX = 'XML Parsing Error: ';
const MAX_REASON_LENGTH = 500;

function firstLine(text: string): string {
  const newline = text.indexOf('\n');
  return newline === -1 ? text : text.slice(0, newline);
}

/**
 * Take the reason out of a `parsererror` sentence, so the message does not carry the rest of it:
 * Chromium appends a fixed note and Firefox echoes the source line (a 2000 character line made a
 * 4121 character message). The position is read from the full sentence, not from this reason.
 *
 * Control and format characters (Cc, Cf) are removed because the reason can contain text from the
 * source, and the message may reach a terminal or a log. The cap is in UTF-16 units and does not
 * split a surrogate pair.
 */
function extractBrowserErrorReason(text: string): string {
  let raw = text;
  if (text.startsWith(FIREFOX_PREFIX)) {
    raw = firstLine(text.slice(FIREFOX_PREFIX.length));
  } else {
    const chromium = CHROMIUM_LOCATION.exec(text);
    if (chromium) raw = firstLine(text.slice(chromium.index + chromium[0].length));
  }
  const reason = raw.replace(/[\p{Cc}\p{Cf}]/gu, '').trim();
  if (reason.length <= MAX_REASON_LENGTH) return reason;
  let end = MAX_REASON_LENGTH;
  const last = reason.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return `${reason.slice(0, end)}…`;
}

/**
 * Parse XML string to Document (Browser implementation)
 *
 * @param xml XML string
 * @param policy Trusted Types policy. When given, its `createHTML(xml)` result is what DOMParser receives
 * @returns Parsed Document
 * @throws SKAMXMLParseError if XML parsing fails
 */
export function parseXML(xml: string, policy?: { createHTML(input: string): unknown }): Document {
  const parser = new DOMParser();
  // createHTML returns unknown, so the type is matched here only (TrustedHTML is accepted at run time)
  const input = policy ? (policy.createHTML(xml) as string) : xml;
  const doc = parser.parseFromString(input, 'application/xml');

  // Browser DOMParser returns parsererror element on error
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    const errorText = parseError.textContent ?? 'Unknown XML parse error';
    const location = parseBrowserErrorLocation(errorText);
    throw new SKAMXMLParseError(
      `XML parse error: ${extractBrowserErrorReason(errorText)}`,
      location?.line,
      location?.column
    );
  }

  return doc;
}
