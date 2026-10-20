/**
 * Source positions for elements, computed from the XML source text.
 *
 * Node's xmldom attaches `lineNumber` / `columnNumber` to every element; a browser DOM does not.
 * This module recovers the same value (the `<` of the element's start tag) from the source, so the
 * browser build can report the same positions as the Node build.
 *
 * Two line-break rules live here on purpose:
 * - XML rule (`computeXmlLineStarts`): `\r\n`, a lone `\r` and `\n` each count as one line break.
 *   This is what xmldom counts, so element positions found here agree with xmldom's. It is
 *   verified by tests that compare both paths on the same input.
 * - LF rule (`computeLfLineStarts`): only `\n` counts. `trackPositions` (token.ext.position) has
 *   always counted this way, and its existing output must not change, so it keeps this rule.
 * Columns are 1-based UTF-16 code units from the start of the line under either rule.
 *
 * This module must not import parser-core.ts (the dependency runs the other way).
 */

/** A 1-based line and column. */
export interface LineColumn {
  line: number;
  column: number;
}

/** Offsets at which each line starts (the first is always 0), for the XML line-break rule. */
export function computeXmlLineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    const c = source.charCodeAt(i);
    if (c === 10) {
      starts.push(i + 1);
    } else if (c === 13) {
      // `\r\n` is a single break
      if (source.charCodeAt(i + 1) === 10) i++;
      starts.push(i + 1);
    }
  }
  return starts;
}

/** Offsets at which each line starts (the first is always 0), counting only `\n`. */
export function computeLfLineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

/** Binary search for the line that contains `offset`. */
export function lineColumnAt(lineStarts: readonly number[], offset: number): LineColumn {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (lineStarts[mid]! <= offset) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return { line: low + 1, column: offset - lineStarts[low]! + 1 };
}

/** The `<` of a start tag and its qualified name. */
export interface StartTag {
  offset: number;
  name: string;
}

/** Index of the `>` that ends the tag starting at `start`, skipping quoted attribute values. */
function findTagEnd(source: string, start: number): number {
  let quote = 0;
  for (let j = start + 1; j < source.length; j++) {
    const c = source.charCodeAt(j);
    if (quote !== 0) {
      if (c === quote) quote = 0;
    } else if (c === 34 || c === 39) {
      quote = c;
    } else if (c === 62) {
      return j;
    }
  }
  return -1;
}

const NAME_END = /[\s/>]/;

/**
 * Start tags (self-closing ones included) in source order. Comments, CDATA sections, processing
 * instructions and end tags are skipped.
 *
 * This is deliberately a separate, tolerant scan, not a by-product of `checkInputLimits`: that
 * function is a fail-closed gate and stays unchanged. Input that is not scannable simply yields
 * fewer tags, and the caller's count check then refuses to hand out positions.
 */
export function collectStartTags(source: string): StartTag[] {
  const tags: StartTag[] = [];
  let i = 0;
  while (i < source.length) {
    const lt = source.indexOf('<', i);
    if (lt === -1) break;
    if (source.startsWith('<!--', lt)) {
      const end = source.indexOf('-->', lt + 4);
      if (end === -1) break;
      i = end + 3;
    } else if (source.startsWith('<![CDATA[', lt)) {
      const end = source.indexOf(']]>', lt + 9);
      if (end === -1) break;
      i = end + 3;
    } else if (source.startsWith('<?', lt)) {
      const end = source.indexOf('?>', lt + 2);
      if (end === -1) break;
      i = end + 2;
    } else if (source.startsWith('<!', lt)) {
      // DOCTYPE and friends are rejected by checkInputLimits; do not guess here.
      break;
    } else {
      const end = findTagEnd(source, lt);
      if (end === -1) break;
      if (source.charCodeAt(lt + 1) !== 47) {
        // `</` is an end tag
        let nameEnd = lt + 1;
        while (nameEnd < end && !NAME_END.test(source[nameEnd]!)) nameEnd++;
        tags.push({ offset: lt, name: source.slice(lt + 1, nameEnd) });
      }
      i = end + 1;
    }
  }
  return tags;
}

/** Returns the position of an element's start tag, or undefined when it cannot be determined. */
export type ElementPositionResolver = (element: Element) => LineColumn | undefined;

const NO_POSITION: ElementPositionResolver = () => undefined;

/**
 * Builds the index for `doc` / `source` and returns a resolver over it. Building is O(n) in the
 * source length; call this only when a position is actually needed.
 *
 * Elements in document order correspond one-to-one with start tags in source order, because
 * SKAM-ML rejects DOCTYPE and entity declarations (no entity can expand into elements). The
 * correspondence is checked (same count, same qualified name at every index); if it fails
 * anywhere the resolver answers undefined for every element rather than risk a wrong position.
 */
export function createElementPositionResolver(
  doc: Document,
  source: string
): ElementPositionResolver {
  const tags = collectStartTags(source);
  const elements = doc.getElementsByTagName('*');
  if (elements.length !== tags.length) return NO_POSITION;

  const indexOf = new Map<Element, number>();
  for (let i = 0; i < tags.length; i++) {
    const element = elements.item(i);
    if (element === null || element.tagName !== tags[i]!.name) return NO_POSITION;
    indexOf.set(element, i);
  }

  const lineStarts = computeXmlLineStarts(source);
  return (element) => {
    const index = indexOf.get(element);
    return index === undefined ? undefined : lineColumnAt(lineStarts, tags[index]!.offset);
  };
}
