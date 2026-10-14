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

describe('xmldom diagnostics (K2)', () => {
  const twoLine = '<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>甲\n<skam:kaeri kind=re/></skam:block></skam:body></skam:doc>';
  it('rejects unquoted attribute with line/column', () => {
    try { parse(twoLine); expect.unreachable(); }
    catch (e) {
      expect(e).toBeInstanceOf(SKAMXMLParseError);
      expect((e as SKAMXMLParseError).line).toBe(2); // T0 の実測値で固定する
      expect((e as SKAMXMLParseError).column).toBeTypeOf('number');
    }
  });
  it('rejects mismatched end tag', () => {
    // 下流の構造エラーに紛れず、xmldom の warning 自体が昇格していることを確かめる
    expect(() => parse(wrap('<skam:block>甲<skam:span type="emphasis">乙</skam:kun></skam:block>'))).toThrow(/XML parse error/);
  });
});
