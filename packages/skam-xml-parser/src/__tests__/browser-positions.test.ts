import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseBrowserErrorLocation, parseXML } from '../xml-parser.browser.js';
import { SKAMXMLParseError } from '../parse-error.js';

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
