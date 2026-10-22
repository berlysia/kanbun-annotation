import { describe, it, expect } from 'vitest';
import { parse, SKAMXMLParseError, SKAMValidationError, SKAM_ML_CONTENT_MODEL } from '../index.js';
import * as browser from '../index.browser.js';
import { SKAMValidationError as CoreError } from '@kanbun-skam/skam';
import { BLOCK_START_KAERI_HINT, validateSKAMDocument } from '@kanbun-skam/skam';

const wrap = (inner: string, ns = 'urn:skam:1') =>
  `<skam:doc xmlns:skam="${ns}"><skam:body>${inner}</skam:body></skam:doc>`;
const blockTexts = (xml: string, opts = {}) => {
  const d = parse(xml, opts);
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
  it('rejects saidoku inside kun (the other known skam:* are allowed since §7.0 was relaxed)', () => {
    expect(() =>
      parse(
        wrap(
          '<skam:block><skam:kun yomi="x"><skam:saidoku><skam:base>a</skam:base><skam:kunform yomi="y"/></skam:saidoku>b</skam:kun></skam:block>'
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
        wrap(`<skam:block>${open}<skam:kun okuri="y">a</skam:kun>b${close}</skam:block>`)
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
  const seqParse = (inner: string) => parse(wrap(`<skam:block>${inner}</skam:block>`));
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
  it('yomigana accepts everything but saidoku', () => {
    expect(
      types('<skam:yomigana value="x"><skam:kun okuri="y">a</skam:kun>b</skam:yomigana>')
    ).toEqual(['okurigana', 'yomigana']);
    expect(
      types('<skam:yomigana value="x"><skam:okimoji>甲</skam:okimoji>乙</skam:yomigana>')
    ).toEqual(['okimoji', 'yomigana']);
    expect(() =>
      seqParse(
        '<skam:yomigana value="x"><skam:saidoku><skam:base>甲</skam:base><skam:kunform n="1" yomi="a"/></skam:saidoku></skam:yomigana>'
      )
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
  it('accepts what §7.0 allows in wrappers, kun and soegana now that the model is relaxed', () => {
    expect(types('<skam:okimoji><skam:span type="emphasis">甲</skam:span></skam:okimoji>')).toEqual(
      ['emphasis', 'okimoji']
    );
    expect(
      types(
        '<skam:okototen grid="5x5" x="0" y="0" shape="dot">甲<skam:kaeri kind="re"/></skam:okototen>'
      )
    ).toEqual(['kaeri', 'okototen']);
    expect(
      types(
        '<skam:okimoji><skam:saidoku><skam:base>甲</skam:base><skam:kunform n="1" yomi="a"/></skam:saidoku></skam:okimoji>'
      )
    ).toEqual(['okimoji', 'saidoku']);
    expect(types('<skam:joji><skam:yomigana value="x">甲</skam:yomigana></skam:joji>')).toEqual([
      'joji',
      'yomigana',
    ]);
    expect(types('<skam:kun okuri="a"><skam:okimoji>甲</skam:okimoji></skam:kun>')).toEqual([
      'okimoji',
      'okurigana',
    ]);
    expect(
      types('甲<skam:soegana value="ヲ"><skam:okimoji>乙</skam:okimoji></skam:soegana>')
    ).toEqual(['okimoji', 'soegana']);
  });
  it('rejects saidoku inside base, kun and yomigana, and anything but text in skam:t', () => {
    const saidoku =
      '<skam:saidoku><skam:base>將</skam:base><skam:kunform n="1" yomi="a"/></skam:saidoku>';
    expect(() =>
      seqParse(
        `<skam:saidoku><skam:base>${saidoku}</skam:base><skam:kunform n="1" yomi="a"/></skam:saidoku>`
      )
    ).toThrow(/base/);
    expect(() => seqParse(`<skam:kun okuri="a">${saidoku}</skam:kun>`)).toThrow(/kun/);
    expect(() => seqParse('<skam:t><skam:kun okuri="a">甲</skam:kun></skam:t>')).toThrow(/skam:t/);
  });
  it('exports the same table from Node and browser entry points', () => {
    expect(browser.SKAM_ML_CONTENT_MODEL).toEqual(SKAM_ML_CONTENT_MODEL);
    expect(SKAM_ML_CONTENT_MODEL.kun).toContain('okimoji');
    expect(SKAM_ML_CONTENT_MODEL.kun).not.toContain('saidoku');
  });
});

describe('validation error positions (K7 b)', () => {
  const lines = (...rows: string[]) =>
    `<skam:doc xmlns:skam="urn:skam:1">\n<skam:body>\n${rows.join('\n')}\n</skam:body>\n</skam:doc>`;
  const validationErrors = (xml: string, opts = {}) => {
    try {
      parse(xml, opts);
    } catch (e) {
      expect(e).toBeInstanceOf(SKAMValidationError);
      return (e as SKAMValidationError).errors;
    }
    throw new Error('expected parse to throw');
  };

  it('puts the line of the failing mark on a marks[...] error', () => {
    const errors = validationErrors(
      lines(
        '<skam:block>',
        '<skam:okototen grid="5x5" x="9" y="0" shape="dot">甲</skam:okototen>',
        '</skam:block>'
      )
    );
    expect(errors[0]!.path).toMatch(/^marks\[/);
    expect(errors[0]!.line).toBe(4);
    expect(errors[0]!.column).toBeTypeOf('number');
  });

  it('gives every mark expanded from one element the position of that element', () => {
    // kun (3 行目) は yomigana と okurigana の 2 つの mark に展開され、どちらも saidoku (2 行目) と衝突する
    const errors = validationErrors(
      lines(
        '<skam:block><skam:saidoku><skam:base>',
        '<skam:kun yomi="a" okuri="b">未</skam:kun>',
        '</skam:base><skam:kunform n="1" yomi="x"/></skam:saidoku></skam:block>'
      )
    );
    const conflicts = errors.filter((e) => e.kind === 'MARK_CONFLICT');
    expect(conflicts).toHaveLength(2);
    expect(conflicts.map((e) => e.line)).toEqual([4, 4]);
  });

  it('looks positions up by object identity, not by id (duplicate xml:id)', () => {
    const errors = validationErrors(
      lines(
        '<skam:block xml:id="dup">甲</skam:block>',
        '<skam:block>乙</skam:block>',
        '<skam:block xml:id="dup">丙</skam:block>'
      )
    );
    // 字の id は <ブロックの id>#<順> なので、同じ id のブロックの字も重なる。ここではブロックだけを見る
    const duplicates = errors.filter(
      (e) => e.kind === 'DUPLICATE_ID' && e.path.startsWith('blocks[')
    );
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]!.path).toBe('blocks[2].id');
    expect(duplicates[0]!.line).toBe(5);
  });

  it('reports the duplicate on a mark by the line of the element that made it', () => {
    const errors = validationErrors(
      lines(
        '<skam:block>甲<skam:ref xml:id="r" label="1"/>',
        '乙',
        '<skam:ref xml:id="r" label="2"/></skam:block>'
      )
    );
    const duplicates = errors.filter((e) => e.kind === 'DUPLICATE_ID');
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]!.path).toMatch(/^marks\[\d+\]\.id$/);
    expect(duplicates[0]!.line).toBe(5);
  });

  it('does not add line/column to paths that cannot be resolved (e.g. readings)', () => {
    const xml = lines(
      '<skam:block>甲</skam:block>',
      '<skam:readings><skam:reading kind="kundoku">x</skam:reading></skam:readings>'
    );
    const doc = parse(xml);
    const broken = { ...doc, readings: [{ kind: 'nope', text: 'x' }] };
    const result = validateSKAMDocument(broken);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    const error = result.errors.find((e) => e.path.startsWith('readings'))!;
    expect('line' in error).toBe(false);
    expect('column' in error).toBe(false);
  });

  it('does not add line/column when validateSKAMDocument is called directly', () => {
    const doc = parse(
      lines(
        '<skam:block>',
        '<skam:okototen grid="5x5" x="0" y="0" shape="dot">甲</skam:okototen>',
        '</skam:block>'
      )
    );
    const mark = doc.marks.find((m) => m.type === 'okototen')!;
    const result = validateSKAMDocument({
      ...doc,
      marks: [{ ...mark, position: { system: 'glyph-grid', grid: '5x5', x: 9, y: 0 } }],
    });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    for (const error of result.errors) {
      expect('line' in error).toBe(false);
      expect('column' in error).toBe(false);
    }
  });

  it('adds positions even with trackPositions: false', () => {
    const xml = lines(
      '<skam:block>',
      '<skam:okototen grid="5x5" x="9" y="0" shape="dot">甲</skam:okototen>',
      '</skam:block>'
    );
    expect(validationErrors(xml, { trackPositions: false })[0]!.line).toBe(4);
    expect(validationErrors(xml, { trackPositions: true })[0]!.line).toBe(4);
  });
});
