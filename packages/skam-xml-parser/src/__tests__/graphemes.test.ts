import { describe, it, expect } from 'vitest';
import { parse, SKAMXMLParseError } from '../index.js';
import type { ParseOptions } from '../index.js';

const parseSeq = (xml: string, opts: Partial<ParseOptions> = {}) => parse(xml, opts);

const wrap = (body: string) =>
  `<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>${body}</skam:block></skam:body></skam:doc>`;

const texts = (xml: string, opts: Partial<ParseOptions> = {}) =>
  parseSeq(xml, opts).tokens.map((t) => t.text);

const IVS = '\u{E0100}';

describe('parse - grapheme cluster tokens', () => {
  it('joins a character reference IVS to its base character', () => {
    expect(texts(wrap('葛&#xE0100;城'))).toEqual([`葛${IVS}`, '城']);
  });

  it('joins a literal IVS to its base character', () => {
    expect(texts(wrap(`葛${IVS}城`))).toEqual([`葛${IVS}`, '城']);
  });

  it('joins a combining mark written as a character reference', () => {
    expect(texts(wrap('e&#x301;'))).toEqual(['é'.normalize('NFD')]);
    expect(parseSeq(wrap('e&#x301;')).tokens).toHaveLength(1);
  });

  it('keeps an element boundary as a cluster boundary', () => {
    expect(texts(wrap(`<skam:kun yomi="か">葛</skam:kun>&#xE0100;`))).toEqual(['葛', IVS]);
  });

  it('does not make a token of a CRLF cluster', () => {
    expect(texts(wrap('&#13;&#10;'))).toEqual([]);
  });

  it('keeps a combining mark after an ignored space as its own token', () => {
    expect(texts(wrap(' ́'))).toEqual(['́']);
  });

  it('drops ignored whitespace and keeps U+3000', () => {
    expect(texts(wrap(' 學\t\n　而 '))).toEqual(['學', '　', '而']);
  });

  describe('positions', () => {
    type Pos = { start: { line: number; column: number }; end: { line: number; column: number } };
    const posOf = (xml: string) =>
      parseSeq(xml, { trackPositions: true }).tokens.map((t) => t.ext?.['position'] as Pos);

    it('puts a cluster at the base character with a character-reference IVS', () => {
      const xml = wrap(`葛&#xE0100;城<skam:kun yomi="か">X</skam:kun>`);
      const [p0, p1] = posOf(xml);
      const base = xml.indexOf('葛');
      expect(p0!.start.column).toBe(base + 1);
      expect(p1!.start.column).toBe(xml.indexOf('城') + 1);
    });

    it('puts a cluster at the base character with a literal IVS', () => {
      const xml = wrap(`葛${IVS}城`);
      const [p0, p1] = posOf(xml);
      expect(p0!.start.column).toBe(xml.indexOf('葛') + 1);
      // the IVS is 2 UTF-16 units, so the next column skips both
      expect(p0!.end.column).toBe(xml.indexOf('葛') + 1 + 3);
      expect(p1!.start.column).toBe(xml.indexOf('城') + 1);
    });

    it('keeps the line and column of an error after a cluster', () => {
      const xml = `<skam:doc xmlns:skam="urn:skam:1">\n<skam:body><skam:block>葛&#xE0100;\n<skam:kaeri/></skam:block></skam:body></skam:doc>`;
      try {
        parse(xml);
        throw new Error('expected parse to throw');
      } catch (e) {
        expect(e).toBeInstanceOf(SKAMXMLParseError);
        expect((e as SKAMXMLParseError).line).toBe(3);
      }
    });
  });
});
