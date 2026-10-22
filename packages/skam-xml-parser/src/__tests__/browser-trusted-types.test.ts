import { DOMParser as XmldomParser } from '@xmldom/xmldom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse as parseOnBrowser } from '../index.browser.js';
import { parse as parseOnNode } from '../index.js';
import { SKAMXMLParseError } from '../parse-error.js';

const VALID =
  '<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>學而時習之</skam:block></skam:body></skam:doc>';
const MALFORMED = '<skam:doc xmlns:skam="urn:skam:1">\n<skam:body>學而</skam:doc>';
const CHROMIUM_SENTENCE =
  'This page contains the following errors:error on line 2 at column 12: Opening and ending tag mismatch\nBelow is a rendering of the page up to the first error.';

/** createHTML が返す目印。Trusted Types が必須のページの TrustedHTML の代わり */
const TRUSTED = { trusted: true };

interface ParsedCall {
  input: unknown;
  /** parseFromString に渡された値が TRUSTED か文字列か */
  source: string;
}

/**
 * Trusted Types が必須のページの DOMParser の代わり。
 * 文字列を受け取ると TypeError を投げ、TRUSTED を受け取ったときは `sources` の対応する XML を解釈する。
 * 文字列の入力は `requireTrusted: false` で許す (policy なしの比較用)。
 */
function stubDomParser(options: { requireTrusted: boolean; sources?: Map<object, string> }) {
  const calls: ParsedCall[] = [];
  class FakeDomParser {
    parseFromString(input: unknown, type: string) {
      expect(type).toBe('application/xml');
      if (typeof input === 'string') {
        if (options.requireTrusted) {
          throw new TypeError("This document requires 'TrustedHTML' assignment.");
        }
        calls.push({ input, source: input });
        return interpret(input);
      }
      const source = options.sources?.get(input as object);
      if (source === undefined) throw new TypeError('unknown marker');
      calls.push({ input, source });
      return interpret(source);
    }
  }
  vi.stubGlobal('DOMParser', FakeDomParser);
  return calls;
}

/** ブラウザの Document の形 (querySelector を持つ) にして返す。不正な XML は parsererror を持つ */
function interpret(xml: string): Document {
  if (xml === MALFORMED) {
    return {
      querySelector: (selector: string) =>
        selector === 'parsererror' ? { textContent: CHROMIUM_SENTENCE } : null,
    } as unknown as Document;
  }
  const doc = new XmldomParser().parseFromString(xml, 'application/xml');
  return Object.assign(doc, { querySelector: () => null }) as unknown as Document;
}

function caught(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error('expected a throw');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browser build: trustedTypesPolicy', () => {
  it('calls createHTML once with the original XML and gives the same document as without a policy', () => {
    stubDomParser({ requireTrusted: false });
    const policy = { createHTML: vi.fn((input: string) => input) };
    const withPolicy = parseOnBrowser(VALID, { trustedTypesPolicy: policy });
    expect(policy.createHTML).toHaveBeenCalledTimes(1);
    expect(policy.createHTML).toHaveBeenCalledWith(VALID);
    expect(withPolicy).toEqual(parseOnBrowser(VALID));
  });

  it('passes the value createHTML returned to parseFromString as-is', () => {
    const calls = stubDomParser({ requireTrusted: true, sources: new Map([[TRUSTED, VALID]]) });
    const policy = { createHTML: vi.fn(() => TRUSTED) };
    parseOnBrowser(VALID, { trustedTypesPolicy: policy });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.input).toBe(TRUSTED);
  });

  it('parses on a page that requires Trusted Types only when a policy is given', () => {
    stubDomParser({ requireTrusted: true, sources: new Map([[TRUSTED, VALID]]) });
    const doc = parseOnBrowser(VALID, {
      trustedTypesPolicy: { createHTML: () => TRUSTED },
    });
    expect(doc.tokens.map((t) => t.text).join('')).toBe('學而時習之');
    expect(() => parseOnBrowser(VALID)).toThrow(TypeError);
  });

  it('rethrows what createHTML threw without wrapping', () => {
    stubDomParser({ requireTrusted: false });
    const refusal = new Error('policy refused');
    const thrown = caught(() =>
      parseOnBrowser(VALID, {
        trustedTypesPolicy: {
          createHTML: () => {
            throw refusal;
          },
        },
      })
    );
    expect(thrown).toBe(refusal);
  });

  it('does not call createHTML when the pre-scan fails', () => {
    stubDomParser({ requireTrusted: false });
    const policy = { createHTML: vi.fn((input: string) => input) };
    const thrown = caught(() =>
      parseOnBrowser(VALID, { maxInputLength: 10, trustedTypesPolicy: policy })
    );
    expect(thrown).toBeInstanceOf(SKAMXMLParseError);
    expect(policy.createHTML).not.toHaveBeenCalled();
  });

  it('reports a malformed XML with the same message, line and column as without a policy', () => {
    stubDomParser({ requireTrusted: false });
    const without = caught(() => parseOnBrowser(MALFORMED)) as SKAMXMLParseError;
    const policy = { createHTML: (input: string) => input };
    const withPolicy = caught(() =>
      parseOnBrowser(MALFORMED, { trustedTypesPolicy: policy })
    ) as SKAMXMLParseError;
    expect(without).toBeInstanceOf(SKAMXMLParseError);
    expect(withPolicy).toBeInstanceOf(SKAMXMLParseError);
    expect(withPolicy.message).toBe(without.message);
    expect(withPolicy.line).toBe(without.line);
    expect(withPolicy.column).toBe(without.column);
    expect(without.line).toBe(2);
    expect(without.column).toBe(12);
  });
});

describe('Node build: trustedTypesPolicy', () => {
  it('ignores the policy: createHTML is not called and the result is the same', () => {
    const policy = { createHTML: vi.fn((input: string) => input) };
    const withPolicy = parseOnNode(VALID, { trustedTypesPolicy: policy });
    expect(policy.createHTML).not.toHaveBeenCalled();
    expect(withPolicy).toEqual(parseOnNode(VALID));
  });
});
