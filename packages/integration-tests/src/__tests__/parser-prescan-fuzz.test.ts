// Cross-checks the parser's pre-scan against xmldom's verdict.
import { describe, it, expect } from 'vitest';
import { parse, SKAMXMLParseError } from '@kanbun-skam/skam-xml-parser';

// Deterministic PRNG (mulberry32) so failures are reproducible.
const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const PIECES = ['>', '<', "'", '/', '<!--', '-->', '<![CDATA[', ']]>', '<?', '?>', '甲', 'a=', ' '];
const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

describe('pre-scan fuzz: well-formed attribute values never trip the pre-scan', () => {
  const r = rng(20261015);
  for (let n = 0; n < 300; n++) {
    const raw = Array.from(
      { length: 1 + Math.floor(r() * 6) },
      () => PIECES[Math.floor(r() * PIECES.length)]
    ).join('');
    const xml = `<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block><skam:span type="emphasis" data-x="${escapeAttr(raw)}">甲</skam:span></skam:block></skam:body></skam:doc>`;
    it(`case ${n}`, () => {
      try {
        parse(xml, { validate: false });
      } catch (e) {
        expect(e).toBeInstanceOf(SKAMXMLParseError);
        expect((e as Error).message).not.toMatch(/unterminated|unbalanced|maxDepth|declaration/);
      }
    });
  }
  it('raw ">" inside a quoted attribute passes both pre-scan and xmldom', () => {
    expect(() =>
      parse(
        '<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block><skam:span type="emphasis" data-x="a>b">甲</skam:span></skam:block></skam:body></skam:doc>',
        { validate: false }
      )
    ).not.toThrow();
  });
});
