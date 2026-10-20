import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSequentialIdGenerator } from '@kanbun-skam/skam';
import { parse, SKAMValidationError } from '../index.js';
import {
  parseFromDocument,
  parseWith,
  type ParseOptions,
  type ParseWarning,
} from '../parser-core.js';
import { parseXML as parseXMLWithLocator } from '../xml-parser.js';
import { parseBrowserErrorLocation, parseXML } from '../xml-parser.browser.js';
import { SKAMXMLParseError } from '../parse-error.js';
import * as positionIndex from '../position-index.js';

// Wrap the exports so the tests can see whether an index was built. (collectStartTags is called
// from inside position-index.ts, which a module mock cannot intercept, so the observable is
// createElementPositionResolver, which parser-core calls only when a position is needed.)
vi.mock('../position-index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../position-index.js')>();
  return {
    ...actual,
    createElementPositionResolver: vi.fn(actual.createElementPositionResolver),
  };
});

// Sentences measured in Chromium 145 and Firefox (see the commit body of the change that added this file).
const CHROMIUM_SENTENCE =
  'This page contains the following errors:error on line 2 at column 12: Opening and ending tag mismatch: b line 2 and c\nBelow is a rendering of the page up to the first error.';
const FIREFOX_SENTENCE =
  'XML Parsing Error: mismatched tag. Expected: </b>.\nLocation: about:blank\nLine Number 2, Column 10:  <b>學而</c>\n---------^';

describe('parseBrowserErrorLocation', () => {
  it('reads the Chromium form', () => {
    expect(parseBrowserErrorLocation(CHROMIUM_SENTENCE)).toEqual({ line: 2, column: 12 });
  });

  it('reads the Firefox form', () => {
    expect(parseBrowserErrorLocation(FIREFOX_SENTENCE)).toEqual({ line: 2, column: 10 });
  });

  it('prefers the real Firefox location over a look-alike in the echoed source line', () => {
    const sentence =
      'XML Parsing Error: not well-formed\nLocation: about:blank\nLine Number 1, Column 7:<a>Line Number 9, Column 9: error on line 8 at column 8:\n------^';
    expect(parseBrowserErrorLocation(sentence)).toEqual({ line: 1, column: 7 });
  });

  it('prefers the real Chromium location over a look-alike in the reason', () => {
    const sentence =
      "This page contains the following errors:error on line 3 at column 4: Entity 'error on line 9 at column 9:' not defined\nLine Number 9, Column 9:\nBelow is a rendering of the page up to the first error.";
    expect(parseBrowserErrorLocation(sentence)).toEqual({ line: 3, column: 4 });
  });

  it('returns undefined for a sentence in neither form', () => {
    expect(parseBrowserErrorLocation('Unknown XML parse error')).toBeUndefined();
  });

  it('returns undefined for numbers longer than 9 digits', () => {
    expect(parseBrowserErrorLocation('error on line 1234567890 at column 1: x')).toBeUndefined();
    expect(parseBrowserErrorLocation('Line Number 1, Column 1234567890:')).toBeUndefined();
  });

  it('stays fast on a 5,000,000 character echoed source line', () => {
    const sentence = `XML Parsing Error: not well-formed\nLocation: about:blank\nLine Number 1, Column 7:${'a'.repeat(5_000_000)}\n------^`;
    const start = performance.now();
    const result = parseBrowserErrorLocation(sentence);
    expect(performance.now() - start).toBeLessThan(100);
    expect(result).toEqual({ line: 1, column: 7 });
  });
});

describe('browser parseXML', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('puts the location read from the parsererror on the thrown error and keeps the message', () => {
    vi.stubGlobal(
      'DOMParser',
      class {
        parseFromString() {
          return {
            querySelector: (selector: string) =>
              selector === 'parsererror' ? { textContent: CHROMIUM_SENTENCE } : null,
          };
        }
      }
    );
    let thrown: unknown;
    try {
      parseXML('<skam>\n  <b>學而</c>\n</skam>');
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(SKAMXMLParseError);
    const error = thrown as SKAMXMLParseError;
    expect(error.line).toBe(2);
    expect(error.column).toBe(12);
    expect(error.message).toBe(`XML parse error: ${CHROMIUM_SENTENCE}`);
  });
});

// ============================================================================
// Element positions without xmldom's lineNumber / columnNumber (what a browser DOM looks like)
// ============================================================================

/** xmldom sets lineNumber / columnNumber even without a locator, so they are removed from every element. */
function stripPositions(doc: Document): Document {
  const elements = doc.getElementsByTagName('*');
  for (let i = 0; i < elements.length; i++) {
    const element = elements.item(i) as unknown as Record<string, unknown>;
    delete element['lineNumber'];
    delete element['columnNumber'];
    if (element['lineNumber'] !== undefined) element['lineNumber'] = undefined;
    if (element['columnNumber'] !== undefined) element['columnNumber'] = undefined;
    // The premise of every test below: this DOM carries no position of its own.
    expect(element['lineNumber']).toBeUndefined();
    expect(element['columnNumber']).toBeUndefined();
  }
  return doc;
}

const parseWithoutPositions = (xml: string, options: ParseOptions = {}) =>
  parseWith((source) => stripPositions(parseXMLWithLocator(source)), xml, {
    idGenerator: createSequentialIdGenerator(),
    ...options,
  });

const parseOnNode = (xml: string, options: ParseOptions = {}) =>
  parse(xml, { idGenerator: createSequentialIdGenerator(), ...options });

function caught(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error('expected a throw');
}

/** The error the position-less path throws must carry the same position as the Node build's. */
function expectSamePositionAsNode(xml: string, expected?: { line: number; column: number }) {
  const node = caught(() => parseOnNode(xml)) as SKAMXMLParseError;
  const bare = caught(() => parseWithoutPositions(xml)) as SKAMXMLParseError;
  expect(node).toBeInstanceOf(SKAMXMLParseError);
  expect(bare).toBeInstanceOf(SKAMXMLParseError);
  expect(bare.line).toBe(node.line);
  expect(bare.column).toBe(node.column);
  expect(bare.message).toBe(node.message);
  if (expected) expect({ line: bare.line, column: bare.column }).toEqual(expected);
}

const NS = 'xmlns:skam="urn:skam:1"';
// A kutoten without `value` fails while the element is processed.
const BAD = '<skam:kutoten kind="ku"/>';

describe('element positions without xmldom positions', () => {
  beforeEach(() => {
    vi.mocked(positionIndex.createElementPositionResolver).mockClear();
  });

  it('gives the same SKAMDocument as the Node build for every valid fixture', () => {
    const dir = new URL('./fixtures/valid/', import.meta.url);
    const files = readdirSync(dir).filter((f) => f.endsWith('.xml'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const xml = readFileSync(new URL(file, dir), 'utf8');
      expect(parseWithoutPositions(xml, { validate: true }), file).toEqual(
        parseOnNode(xml, { validate: true })
      );
    }
  });

  it('reports a missing attribute at line 2, column 3', () => {
    const xml = `<skam:doc ${NS}><skam:body><skam:block>\n  ${BAD}</skam:block></skam:body>\n</skam:doc>`;
    expectSamePositionAsNode(xml, { line: 2, column: 3 });
  });

  it('reports column 1 for an element at the start of a line', () => {
    expectSamePositionAsNode(
      `<skam:doc ${NS}>\n<skam:body><skam:block>\n${BAD}</skam:block>\n</skam:body></skam:doc>`,
      {
        line: 3,
        column: 1,
      }
    );
  });

  it('counts columns in UTF-16 units after surrogate pairs', () => {
    expectSamePositionAsNode(
      `<skam:doc ${NS}><skam:body><skam:block>𠮷𠮷${BAD}</skam:block></skam:body></skam:doc>`
    );
  });

  it('counts \\r\\n and a lone \\r as one line break each', () => {
    const doc = (nl: string) =>
      `<skam:doc ${NS}>${nl}<skam:body>${nl}  <skam:block>x${nl}${BAD}</skam:block></skam:body></skam:doc>`;
    expectSamePositionAsNode(doc('\r\n'), { line: 4, column: 1 });
    expectSamePositionAsNode(doc('\r'), { line: 4, column: 1 });
    expectSamePositionAsNode(doc('\n'), { line: 4, column: 1 });
  });

  it('is not misled by comments, CDATA, processing instructions, self-closing tags or ">" in attribute values', () => {
    expectSamePositionAsNode(
      `<?xml version="1.0"?>\n<!-- <skam:fake> -->\n<skam:doc ${NS}>\n<?pi <x> ?>\n<skam:meta/>\n<skam:body>\n<skam:block>a<![CDATA[<skam:fake/>]]><skam:okimoji title="a>b">乙</skam:okimoji>\n${BAD}</skam:block></skam:body></skam:doc>`
    );
  });

  it('handles prefixed elements', () => {
    expectSamePositionAsNode(
      `<skam:doc ${NS}>\n <skam:body>\n  <skam:block>x</skam:block>\n  <skam:block>y${BAD}</skam:block></skam:body></skam:doc>`
    );
  });

  it('reports 1:1 for an error on a root that is the only element, and on a self-closing root', () => {
    expectSamePositionAsNode(`<skam:doc ${NS}></skam:doc>`, { line: 1, column: 1 });
    expectSamePositionAsNode(`<skam:doc ${NS}/>`, { line: 1, column: 1 });
  });

  it('puts the position of the failing mark on validation errors', () => {
    const xml = `<skam:doc ${NS}>\n<skam:body>\n<skam:block>甲\n<skam:okototen grid="5x5" x="9" y="0" shape="dot">乙</skam:okototen>\n</skam:block>\n</skam:body>\n</skam:doc>`;
    const node = caught(() => parseOnNode(xml)) as SKAMValidationError;
    const bare = caught(() => parseWithoutPositions(xml)) as SKAMValidationError;
    expect(bare).toBeInstanceOf(SKAMValidationError);
    expect(node.errors[0]?.line).toBe(4);
    expect(bare.errors).toEqual(node.errors);
  });

  it('puts the position on warnings', () => {
    const xml = `<skam:doc ${NS}>\n<skam:body>\n <skam:block>甲\n <skam:future/></skam:block>\n</skam:body>\n</skam:doc>`;
    const collect = (parseFn: (xml: string, o: ParseOptions) => unknown) => {
      const warnings: ParseWarning[] = [];
      parseFn(xml, { onWarning: (w) => warnings.push(w) });
      return warnings;
    };
    const node = collect(parseOnNode);
    const bare = collect(parseWithoutPositions);
    expect(node).toHaveLength(1);
    expect(node[0]?.line).toBe(4);
    expect(bare).toEqual(node);
  });

  it('gives no position when the DOM has one more element than the source has start tags', () => {
    const xml = `<skam:doc ${NS}><skam:body><skam:block>${BAD}</skam:block></skam:body></skam:doc>`;
    const mutated = (source: string) => {
      const doc = stripPositions(parseXMLWithLocator(source));
      doc.documentElement.appendChild(doc.createElementNS('urn:skam:1', 'skam:extra'));
      return doc;
    };
    const error = caught(() => parseWith(mutated, xml)) as SKAMXMLParseError;
    expect(error).toBeInstanceOf(SKAMXMLParseError);
    expect(error.line).toBeUndefined();
    expect(error.column).toBeUndefined();
  });

  it('gives no position when one element name differs from the start tag at the same index', () => {
    const xml = `<skam:doc ${NS}><skam:meta/><skam:body><skam:block>${BAD}</skam:block></skam:body></skam:doc>`;
    const mutated = (source: string) => {
      const doc = stripPositions(parseXMLWithLocator(source));
      // Same count, different name: the meta becomes an unknown (ignored) element.
      const meta = doc.getElementsByTagName('skam:meta').item(0)!;
      const replacement = doc.createElementNS('urn:skam:1', 'skam:future');
      meta.parentNode!.replaceChild(replacement, meta);
      return doc;
    };
    const error = caught(() => parseWith(mutated, xml)) as SKAMXMLParseError;
    expect(error).toBeInstanceOf(SKAMXMLParseError);
    expect(error.line).toBeUndefined();
    expect(error.column).toBeUndefined();
  });

  it('does not build an index for a parse without errors', () => {
    const xml = `<skam:doc ${NS}><skam:body><skam:block>甲</skam:block></skam:body></skam:doc>`;
    parseWithoutPositions(xml, { validate: true });
    expect(positionIndex.createElementPositionResolver).not.toHaveBeenCalled();
    // The same document with a fault does need one.
    caught(() => parseWithoutPositions(`<skam:doc ${NS}>${BAD}</skam:doc>`));
    expect(positionIndex.createElementPositionResolver).toHaveBeenCalledTimes(1);
  });

  it('keeps the positions of two documents apart when one is parsed inside the other', () => {
    const inner = `<skam:doc ${NS}><skam:body><skam:block>\n\n  ${BAD}</skam:block></skam:body></skam:doc>`;
    const outer = `<skam:doc ${NS}>\n<skam:body><skam:block>甲\n\n\n    ${BAD}</skam:block></skam:body></skam:doc>`;
    let innerError: unknown;
    const base = createSequentialIdGenerator();
    let nested = false;
    const idGenerator = {
      ...base,
      generate: (...args: Parameters<typeof base.generate>) => {
        if (!nested) {
          nested = true;
          innerError = caught(() => parseWithoutPositions(inner));
        }
        return base.generate(...args);
      },
    };
    const outerError = caught(() =>
      parseWithoutPositions(outer, { idGenerator: idGenerator as typeof base })
    ) as SKAMXMLParseError;
    expect((innerError as SKAMXMLParseError).line).toBe(3);
    expect((innerError as SKAMXMLParseError).column).toBe(3);
    expect(outerError.line).toBe(5);
    expect(outerError.column).toBe(5);
  });

  it('keeps the outer registration when the same Document is parsed again inside the parse', () => {
    const xml = `<skam:doc ${NS}>\n<skam:body><skam:block>甲\n\n${BAD}</skam:block></skam:body></skam:doc>`;
    const doc = stripPositions(parseXMLWithLocator(xml));
    const base = createSequentialIdGenerator();
    let nested = false;
    const idGenerator = {
      ...base,
      generate: (...args: Parameters<typeof base.generate>) => {
        if (!nested) {
          nested = true;
          // Re-enter on the same Document with the same source; it fails at the same element.
          caught(() => parseFromDocument(doc, {}, xml));
        }
        return base.generate(...args);
      },
    };
    const error = caught(() =>
      parseFromDocument(doc, { idGenerator: idGenerator as typeof base }, xml)
    ) as SKAMXMLParseError;
    expect(error.line).toBe(4);
    expect(error.column).toBe(1);
  });
});
