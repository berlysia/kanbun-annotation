import { describe, it, expect } from 'vitest';
import { parse, SKAMXMLParseError, SKAMValidationError, SKAM_ML_CONTENT_MODEL } from '../index.js';
import * as browser from '../index.browser.js';
import { SKAMValidationError as CoreError } from '@kanbun-skam/skam';
import { createSequentialIdGenerator, BLOCK_START_KAERI_HINT } from '@kanbun-skam/skam';

const wrap = (inner: string, ns = 'urn:skam:1') =>
  `<skam:doc xmlns:skam="${ns}"><skam:body>${inner}</skam:body></skam:doc>`;
const blockTexts = (xml: string, opts = {}) => {
  const d = parse(xml, { idGenerator: createSequentialIdGenerator(), ...opts });
  return d.blocks.map((b) =>
    b.tokenIds.map((id) => d.tokens.find((t) => t.id === id)!.text).join('|')
  );
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
  const twoLine =
    '<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>甲\n<skam:kaeri kind=re/></skam:block></skam:body></skam:doc>';
  it('rejects unquoted attribute with line/column', () => {
    try {
      parse(twoLine);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(SKAMXMLParseError);
      expect((e as SKAMXMLParseError).line).toBe(2); // T0 の実測値で固定する
      expect((e as SKAMXMLParseError).column).toBeTypeOf('number');
    }
  });
  it('rejects mismatched end tag', () => {
    // 下流の構造エラーに紛れず、xmldom の warning 自体が昇格していることを確かめる
    expect(() =>
      parse(wrap('<skam:block>甲<skam:span type="emphasis">乙</skam:kun></skam:block>'))
    ).toThrow(/XML parse error/);
  });
});

describe('namespace and content model (K2)', () => {
  it('rejects root in wrong namespace', () => {
    expect(() => parse(wrap('<skam:block>甲</skam:block>', 'urn:wrong'))).toThrow(
      SKAMXMLParseError
    );
  });
  it('rejects foreign-namespace element in block, readings and notes', () => {
    const fx = (inner: string) =>
      `<skam:doc xmlns:skam="urn:skam:1" xmlns:x="urn:x"><skam:body><skam:block>甲</skam:block></skam:body>${inner}</skam:doc>`;
    expect(() =>
      parse(
        '<skam:doc xmlns:skam="urn:skam:1" xmlns:x="urn:x"><skam:body><skam:block>甲<x:kun yomi="a">乙</x:kun></skam:block></skam:body></skam:doc>'
      )
    ).toThrow(/namespace/);
    expect(() =>
      parse(fx('<skam:readings><x:reading kind="yomiage">a</x:reading></skam:readings>'))
    ).toThrow(/namespace/);
    expect(() => parse(fx('<skam:notes><x:note ref="r">a</x:note></skam:notes>'))).toThrow(
      /namespace/
    );
  });
  it('rejects foreign-namespace element in meta, saidoku, span and yomigana', () => {
    const doc = (body: string, head = '') =>
      `<skam:doc xmlns:skam="urn:skam:1" xmlns:x="urn:x">${head}<skam:body><skam:block>${body}</skam:block></skam:body></skam:doc>`;
    expect(() => parse(doc('甲', '<skam:meta><x:y/></skam:meta>'))).toThrow(/namespace/);
    expect(() =>
      parse(doc('<skam:saidoku><skam:base>將</skam:base><x:kunform n="1"/></skam:saidoku>'))
    ).toThrow(/namespace/);
    expect(() => parse(doc('<skam:span type="emphasis">甲<x:b>乙</x:b></skam:span>'))).toThrow(
      /namespace/
    );
    expect(() => parse(doc('<skam:yomigana value="x">甲<x:b>乙</x:b></skam:yomigana>'))).toThrow(
      /namespace/
    );
  });
  it('ignores unknown skam:* element (whole subtree) and reports UNKNOWN_ELEMENT', () => {
    const warnings: unknown[] = [];
    const d = parse(wrap('<skam:block>甲<skam:future>乙</skam:future>丙</skam:block>'), {
      onWarning: (w) => warnings.push(w),
    });
    expect(d.tokens.map((t) => t.text)).toEqual(['甲', '丙']);
    expect(warnings).toEqual([
      expect.objectContaining({ code: 'UNKNOWN_ELEMENT', name: 'future' }),
    ]);
  });
  it('drops warnings silently when onWarning is omitted', () => {
    expect(() =>
      parse(wrap('<skam:block>甲<skam:future>乙</skam:future></skam:block>'))
    ).not.toThrow();
  });
  it('rejects known skam:* inside kun', () => {
    expect(() =>
      parse(
        wrap(
          '<skam:block><skam:kun yomi="x"><skam:kun okuri="y">a</skam:kun>b</skam:kun></skam:block>'
        )
      )
    ).toThrow(/kun/);
  });
  it('accepts joji inside okimoji (§7.0 allows wrappers to nest)', () => {
    const d = parse(
      wrap('<skam:block><skam:okimoji><skam:joji>而</skam:joji></skam:okimoji></skam:block>')
    );
    expect(d.marks.map((m) => m.type).sort()).toEqual(['joji', 'okimoji']);
  });
  for (const [open, close] of [
    ['<skam:yomigana value="x">', '</skam:yomigana>'],
    ['<skam:span type="emphasis">', '</skam:span>'],
  ] as const) {
    it(`parses kun nested inside ${open} (inner ⊆ outer)`, () => {
      const d = parse(
        wrap(`<skam:block>${open}<skam:kun okuri="y">a</skam:kun>b${close}</skam:block>`),
        { idGenerator: createSequentialIdGenerator() }
      );
      const [ta, tb] = d.blocks[0]!.tokenIds;
      expect(d.marks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ anchor: { from: ta, to: tb } }),
          expect.objectContaining({ type: 'okurigana', value: 'y', anchor: { from: ta, to: ta } }),
        ])
      );
    });
  }
});

describe('block-start kaeri and empty block', () => {
  const twoBlocks =
    '<skam:doc xmlns:skam="urn:skam:1"><skam:body>\n<skam:block>甲</skam:block>\n<skam:block><skam:kaeri kind="re"/>乙</skam:block>\n</skam:body></skam:doc>';
  it('rejects kaeri at the start of the 2nd block with hint and position', () => {
    try {
      parse(twoBlocks);
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toContain(BLOCK_START_KAERI_HINT);
      expect((e as SKAMXMLParseError).line).toBe(3);
    }
  });
  it('rejects it even with validate:false', () => {
    expect(() => parse(twoBlocks, { validate: false })).toThrow(SKAMXMLParseError);
  });
  it('accepts an empty block', () => {
    expect(parse(wrap('<skam:block xml:id="b1"/>')).blocks).toEqual([{ id: 'b1', tokenIds: [] }]);
  });
});

describe('validate option (K2)', () => {
  it('re-exports the same SKAMValidationError class', () => {
    expect(SKAMValidationError).toBe(CoreError);
  });
  it('validates by default (unknown reading kind is rejected)', () => {
    const xml =
      '<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>甲</skam:block></skam:body><skam:readings><skam:reading kind="bogus">x</skam:reading></skam:readings></skam:doc>';
    expect(() => parse(xml)).toThrow(SKAMValidationError);
    expect(() => parse(xml, { validate: false })).not.toThrow();
  });
});

describe('SKAM-ML content model (§7.0) — hand-written representative cases', () => {
  const seqParse = (inner: string) =>
    parse(wrap(`<skam:block>${inner}</skam:block>`), {
      idGenerator: createSequentialIdGenerator(),
    });
  const types = (inner: string) =>
    seqParse(inner)
      .marks.map((m) => m.type)
      .sort();
  it('span accepts any annotation element and position marks', () => {
    expect(
      types(
        '<skam:span type="emphasis"><skam:okimoji>甲</skam:okimoji>乙<skam:kutoten value="、"/><skam:saidoku><skam:base>丙</skam:base><skam:kunform n="1" yomi="a"/></skam:saidoku></skam:span>'
      )
    ).toEqual(['emphasis', 'kutoten', 'okimoji', 'saidoku']);
  });
  it('wrappers accept kun and other wrappers', () => {
    expect(
      types(
        '<skam:okototen grid="5x5" x="1" y="1" shape="dot"><skam:kun okuri="ニ">甲</skam:kun></skam:okototen>乙'
      )
    ).toEqual(['okototen', 'okurigana']);
    expect(
      types(
        '<skam:okimoji><skam:okototen grid="5x5" x="0" y="0" shape="dot"><skam:kun okuri="ニ">甲</skam:kun></skam:okototen></skam:okimoji>'
      )
    ).toEqual(['okimoji', 'okototen', 'okurigana']);
  });
  it('saidoku base accepts kun', () => {
    expect(
      types(
        '<skam:saidoku><skam:base><skam:kun soe="ヲ">將</skam:kun></skam:base><skam:kunform n="1" yomi="まさ"/></skam:saidoku>'
      )
    ).toEqual(['saidoku', 'soegana']);
  });
  it('yomigana accepts kun only', () => {
    expect(
      types('<skam:yomigana value="x"><skam:kun okuri="y">a</skam:kun>b</skam:yomigana>')
    ).toEqual(['okurigana', 'yomigana']);
    expect(() =>
      seqParse('<skam:yomigana value="x"><skam:okimoji>甲</skam:okimoji></skam:yomigana>')
    ).toThrow(/yomigana/);
  });
  it('multi-token wrapper keeps inner ⊆ outer', () => {
    const d = seqParse('<skam:okimoji><skam:kun okuri="ニ">甲</skam:kun>乙</skam:okimoji>');
    const [t1, t2] = d.blocks[0]!.tokenIds;
    expect(d.marks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'okimoji', anchor: { from: t1, to: t2 } }),
        expect.objectContaining({ type: 'okurigana', anchor: { from: t1, to: t1 } }),
      ])
    );
  });
  it('rejects disallowed children: span/kaeri/saidoku/yomigana in wrappers, anything in kun and soegana', () => {
    expect(() =>
      seqParse('<skam:okimoji><skam:span type="emphasis">甲</skam:span></skam:okimoji>')
    ).toThrow(/okimoji/);
    expect(() =>
      seqParse(
        '<skam:okototen grid="5x5" x="0" y="0" shape="dot">甲<skam:kaeri kind="re"/></skam:okototen>'
      )
    ).toThrow(/okototen/);
    expect(() =>
      seqParse(
        '<skam:okimoji><skam:saidoku><skam:base>甲</skam:base><skam:kunform n="1" yomi="a"/></skam:saidoku></skam:okimoji>'
      )
    ).toThrow(/okimoji/);
    expect(() =>
      seqParse('<skam:joji><skam:yomigana value="x">甲</skam:yomigana></skam:joji>')
    ).toThrow(/joji/);
    expect(() =>
      seqParse(
        '<skam:saidoku><skam:base><skam:span type="emphasis">將</skam:span></skam:base><skam:kunform n="1" yomi="a"/></skam:saidoku>'
      )
    ).toThrow(/base/);
    expect(() =>
      seqParse('<skam:kun okuri="a"><skam:okimoji>甲</skam:okimoji></skam:kun>')
    ).toThrow(/kun/);
    expect(() =>
      seqParse('甲<skam:soegana value="ヲ"><skam:okimoji>乙</skam:okimoji></skam:soegana>')
    ).toThrow(/soegana/);
  });
  it('exports the same table from Node and browser entry points', () => {
    expect(browser.SKAM_ML_CONTENT_MODEL).toEqual(SKAM_ML_CONTENT_MODEL);
    expect(SKAM_ML_CONTENT_MODEL.kun).toEqual(['#text']);
  });
});
