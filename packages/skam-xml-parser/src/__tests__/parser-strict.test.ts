import { describe, it, expect } from 'vitest';
import { parse, SKAMXMLParseError } from '../index.js';
import { createSequentialIdGenerator } from '@kanbun-skam/skam';

const wrap = (inner: string, ns = 'urn:skam:1') =>
  `<skam:doc xmlns:skam="${ns}"><skam:body>${inner}</skam:body></skam:doc>`;
const blockTexts = (xml: string, opts = {}) => {
  const d = parse(xml, { idGenerator: createSequentialIdGenerator(), ...opts });
  return d.blocks.map((b) => b.tokenIds.map((id) => d.tokens.find((t) => t.id === id)!.text).join('|'));
};

describe('whitespace and CDATA (K2)', () => {
  it('keeps U+3000 as a token', () => {
    expect(blockTexts(wrap('<skam:block>甲　乙</skam:block>'))).toEqual(['甲|　|乙']);
  });
  it('ignores U+0009/000A/0020 and U+000D (&#13;)', () => {
    expect(blockTexts(wrap('<skam:block>甲 \t\n&#13;乙</skam:block>'))).toEqual(['甲|乙']);
  });
  it('tokenizes CDATA as text', () => {
    expect(blockTexts(wrap('<skam:block>甲<![CDATA[乙]]>丙</skam:block>'))).toEqual(['甲|乙|丙']);
  });
});
