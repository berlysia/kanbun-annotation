/**
 * Grapheme cluster tokens: parse and stringify must agree on what one token is.
 */

import { describe, it, expect } from 'vitest';
import type { SKAMDocument } from '@kanbun-skam/skam';
import { parse } from '@kanbun-skam/skam-xml-parser';
import { stringify, type StringifyLoss } from '@kanbun-skam/skam-xml-stringify';

const IVS = '\u{E0100}';
const parseSeq = (xml: string) => parse(xml);
const wrap = (body: string) =>
  `<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>${body}</skam:block></skam:body></skam:doc>`;
const texts = (doc: SKAMDocument) => doc.tokens.map((t) => t.text);

const docOf = (...tokenTexts: string[]): SKAMDocument => ({
  format: 'skam@0.1',
  readings: [],
  tokens: tokenTexts.map((text, i) => ({ id: `t${i + 1}`, text })),
  blocks: [{ id: 'b1', tokenIds: tokenTexts.map((_, i) => `t${i + 1}`) }],
  marks: [],
});

const mixed = ['葛' + IVS, '葛︀', 'é', 'が', '字'];

describe('grapheme round-trip', () => {
  it('JSON -> XML -> JSON keeps the token count and text for IVS, SVS and combining marks', () => {
    const reparsed = parseSeq(stringify(docOf(...mixed)));
    expect(texts(reparsed)).toEqual(mixed);
  });

  it('XML -> JSON -> XML is stable', () => {
    const first = parseSeq(wrap(`葛&#xE0100;葛︀e&#x301;か${'゙'}字`));
    expect(texts(first)).toEqual(mixed);
    const xml = stringify(first);
    expect(texts(parseSeq(xml))).toEqual(mixed);
    expect(stringify(parseSeq(xml))).toBe(xml);
  });

  it('XML -> JSON -> XML -> JSON keeps an IVS that follows an element', () => {
    const first = parseSeq(wrap('<skam:kun yomi="かつ">葛</skam:kun>&#xE0100;'));
    expect(texts(first)).toEqual(['葛', IVS]);
    const second = parseSeq(stringify(first));
    expect(texts(second)).toEqual(['葛', IVS]);
  });

  describe('accepted limits (not reported as losses)', () => {
    const losses: StringifyLoss[] = [];
    const strOk = (d: SKAMDocument) => {
      losses.length = 0;
      const xml = stringify(d, { lossy: true, onLoss: (l) => losses.push(l) });
      expect(losses).toEqual([]);
      return xml;
    };

    it('(a) a leading ignored space is dropped when read again', () => {
      expect(texts(parseSeq(strOk(docOf(' ́'))))).toEqual(['́']);
    });

    it('(b) a combining token after a base token merges when read again', () => {
      expect(texts(parseSeq(strOk(docOf('葛', IVS))))).toEqual(['葛' + IVS]);
    });
  });
});
