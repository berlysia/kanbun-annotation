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

describe('parse - <skam:t>', () => {
  it('makes one token of its content without splitting it, and the kaeri after it follows the last token', () => {
    const doc = parseSeq(wrap('<skam:t>學問</skam:t>而<skam:kaeri kind="re"/>'));
    expect(doc.tokens.map((t) => t.text)).toEqual(['學問', '而']);
    expect(doc.tokens.map((t) => t.id)).toEqual(['b#1#1', 'b#1#2']);
    expect(doc.blocks[0]!.tokenIds).toEqual(['b#1#1', 'b#1#2']);
    const kaeri = doc.marks.find((m) => m.type === 'kaeri')!;
    expect(kaeri).toMatchObject({ position: { blockId: 'b#1', after: 'b#1#2' } });
  });

  it('puts the kaeri after a <skam:t> token', () => {
    const doc = parseSeq(wrap('而<skam:t>學問</skam:t><skam:kaeri kind="re"/>'));
    const kaeri = doc.marks.find((m) => m.type === 'kaeri')!;
    expect(kaeri).toMatchObject({ position: { after: 'b#1#2' } });
  });

  it('keeps whitespace as the token text', () => {
    expect(texts(wrap('<skam:t> </skam:t>'))).toEqual([' ']);
    expect(texts(wrap('<skam:t>&#13;</skam:t>'))).toEqual(['\r']);
    expect(texts(wrap('<skam:t> 學</skam:t>'))).toEqual([' 學']);
  });

  it('keeps a combining mark as its own token', () => {
    expect(texts(wrap('e<skam:t>&#x301;</skam:t>'))).toEqual(['e', '́']);
  });

  it('takes the token id from xml:id (or id), counting it in the automatic ids', () => {
    const doc = parseSeq(wrap('甲<skam:t xml:id="cite-1">學</skam:t>乙'));
    expect(doc.tokens.map((t) => t.id)).toEqual(['b#1#1', 'cite-1', 'b#1#3']);
    expect(doc.blocks[0]!.tokenIds).toEqual(['b#1#1', 'cite-1', 'b#1#3']);
    expect(parseSeq(wrap('<skam:t id="c2">學</skam:t>')).tokens[0]!.id).toBe('c2');
  });

  it('is readable inside annotation elements', () => {
    const doc = parseSeq(
      wrap(
        '<skam:kun yomi="まな"><skam:t>學問</skam:t></skam:kun>' +
          '<skam:span type="emphasis"><skam:t>而</skam:t></skam:span>' +
          '<skam:yomigana value="ア"><skam:t>時</skam:t>習</skam:yomigana>' +
          '<skam:okimoji><skam:t>之</skam:t></skam:okimoji>' +
          '<skam:soegana value="を"><skam:t>不</skam:t></skam:soegana>' +
          '<skam:saidoku><skam:base><skam:t>未</skam:t></skam:base><skam:kunform yomi="いま"/></skam:saidoku>'
      )
    );
    expect(doc.tokens.map((t) => t.text)).toEqual(['學問', '而', '時', '習', '之', '不', '未']);
    expect(doc.marks.find((m) => m.type === 'yomigana' && m.value === 'まな')).toMatchObject({
      anchor: { from: 'b#1#1', to: 'b#1#1' },
    });
    expect(doc.marks.find((m) => m.type === 'yomigana' && m.value === 'ア')).toMatchObject({
      anchor: { from: 'b#1#3', to: 'b#1#4' },
    });
  });

  it('mixes plain text and <skam:t> inside kun', () => {
    const doc = parseSeq(wrap('<skam:kun yomi="x">學<skam:t>問 </skam:t>而</skam:kun>'));
    expect(doc.tokens.map((t) => t.text)).toEqual(['學', '問 ', '而']);
    expect(doc.marks[0]).toMatchObject({ anchor: { from: 'b#1#1', to: 'b#1#3' } });
  });

  it('keeps positions of the tokens around it', () => {
    const xml = wrap('甲<skam:t>學問</skam:t>乙');
    const doc = parseSeq(xml, { trackPositions: true });
    const columns = doc.tokens.map(
      (t) => (t.ext!['position'] as { start: { column: number } }).start.column
    );
    expect(columns[0]).toBe(xml.indexOf('甲') + 1);
    expect(columns[2]).toBe(xml.indexOf('乙') + 1);
  });
});
