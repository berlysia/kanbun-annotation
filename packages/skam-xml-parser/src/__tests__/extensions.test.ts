import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SKAMExtensionDefinition } from '@kanbun-skam/skam/extensions';
import { parse, SKAMXMLParseError } from '../index.js';

const EDU_DECL =
  '<skam:meta><skam:extension name="edu" uri="urn:skam:edu:1" required="true"/></skam:meta>';

function docOf(block: string, meta = EDU_DECL, extraNs = ' xmlns:edu="urn:skam:edu:1"'): string {
  return `<skam:doc xmlns:skam="urn:skam:1"${extraNs}>${meta}<skam:body><skam:block xml:id="b1">${block}</skam:block></skam:body></skam:doc>`;
}

function parseSeq(xml: string, options: Parameters<typeof parse>[1] = {}) {
  return parse(xml, options);
}

afterEach(() => vi.unstubAllGlobals());

describe('parse: extension declaration', () => {
  it('skam:extension を extensions / extensionsRequired にし、edu:okuri-quiz を ext.edu.quiz にする', () => {
    const doc = parseSeq(
      docOf('<skam:kun yomi="まな" okuri="ブ" edu:okuri-quiz="問1">學</skam:kun>')
    );
    expect(doc.extensions).toEqual(['edu']);
    expect(doc.extensionsRequired).toEqual(['edu']);
    const okurigana = doc.marks.find((m) => m.type === 'okurigana')!;
    const yomigana = doc.marks.find((m) => m.type === 'yomigana')!;
    expect(okurigana.ext).toEqual({ edu: { quiz: '問1' } });
    expect(yomigana.ext).toBeUndefined();
  });

  it('skam:extension が 1 つも無ければ宣言の無い文書', () => {
    const doc = parseSeq(docOf('學', '<skam:meta tokenization="char"/>'));
    expect(doc.extensions).toBeUndefined();
    expect(doc.extensionsRequired).toBeUndefined();
  });

  it('required を外すと extensionsRequired は無く、validate が必須の挙げ忘れを報告する', () => {
    const meta = '<skam:meta><skam:extension name="edu" uri="urn:skam:edu:1"/></skam:meta>';
    const xml = docOf('學<skam:kaeri kind="ichi" edu:quiz="問1"/>', meta);
    expect(() => parseSeq(xml)).toThrow();
    const doc = parseSeq(xml, { validate: false });
    expect(doc.extensions).toEqual(['edu']);
    expect(doc.extensionsRequired).toBeUndefined();
  });

  it('名前と URI が登録簿と合わない、または重複する宣言は誤り', () => {
    const bad = [
      '<skam:meta><skam:extension name="edu" uri="urn:x"/></skam:meta>',
      '<skam:meta><skam:extension name="foo" uri="urn:skam:edu:1"/></skam:meta>',
      '<skam:meta><skam:extension name="Edu" uri="urn:skam:edu:1"/></skam:meta>',
      '<skam:meta><skam:extension uri="urn:skam:edu:1"/></skam:meta>',
      '<skam:meta><skam:extension name="edu" uri="urn:skam:edu:1" required="yes"/></skam:meta>',
      `<skam:meta>${'<skam:extension name="edu" uri="urn:skam:edu:1"/>'.repeat(2)}</skam:meta>`,
    ];
    for (const meta of bad) {
      expect(() => parseSeq(docOf('學', meta))).toThrow();
    }
  });

  it('知らない必須の拡張は validate: false でも誤り。required を外すと読め、その属性は読み飛ばす', () => {
    const required =
      '<skam:meta><skam:extension name="zzz" uri="urn:x:zzz" required="true"/></skam:meta>';
    expect(() => parseSeq(docOf('學', required), { validate: false })).toThrow();
    const optional = '<skam:meta><skam:extension name="zzz" uri="urn:x:zzz"/></skam:meta>';
    const doc = parseSeq(
      docOf('<skam:kaeri kind="ichi"/>', optional, ' xmlns:zzz="urn:x:zzz"').replace(
        '<skam:kaeri kind="ichi"/>',
        '學<skam:kaeri kind="ichi" zzz:a="1"/>'
      )
    );
    expect(doc.extensions).toEqual(['zzz']);
    expect(doc.marks[0]!.ext).toBeUndefined();
  });
});

describe('parse: edu attributes', () => {
  const SELF: [string, string][] = [
    ['kaeri', '學<skam:kaeri kind="ichi" edu:quiz="問2"/>'],
    ['kutoten', '學<skam:kutoten value="。" edu:quiz="問2"/>'],
    ['okimoji', '<skam:okimoji edu:quiz="問2">而</skam:okimoji>'],
    ['joji', '<skam:joji edu:quiz="問2">而</skam:joji>'],
    [
      'okototen',
      '<skam:okototen grid="5x5" x="1" y="1" shape="dot" edu:quiz="問2">而</skam:okototen>',
    ],
    ['tateten', '<skam:tateten edu:quiz="問2">學而</skam:tateten>'],
    [
      'saidoku',
      '<skam:saidoku edu:quiz="問2"><skam:base>未</skam:base><skam:kunform yomi="いま"/><skam:kunform okuri="ず"/></skam:saidoku>',
    ],
    ['yomigana', '<skam:yomigana value="まな" edu:quiz="問2">學而</skam:yomigana>'],
    ['soegana', '<skam:soegana value="を" edu:quiz="問2">之</skam:soegana>'],
  ];

  it.each(SELF)('%s の要素の edu:quiz を ext.edu.quiz にする', (type, block) => {
    const doc = parseSeq(docOf(block));
    const mark = doc.marks.find((m) => m.type === type)!;
    expect(mark.ext).toEqual({ edu: { quiz: '問2' } });
  });

  it('skam:kun の yomi-quiz と soe-quiz は、それぞれの注記の印になる', () => {
    const doc = parseSeq(
      docOf('<skam:kun yomi="まな" soe="を" edu:yomi-quiz="甲" edu:soe-quiz="乙">學</skam:kun>')
    );
    expect(doc.marks.find((m) => m.type === 'yomigana')!.ext).toEqual({ edu: { quiz: '甲' } });
    expect(doc.marks.find((m) => m.type === 'soegana')!.ext).toEqual({ edu: { quiz: '乙' } });
  });

  it('範囲の skam:kun の部分の属性は範囲全体の注記 1 つの印になる', () => {
    const doc = parseSeq(docOf('<skam:kun yomi="まな" edu:yomi-quiz="甲">學而</skam:kun>'));
    const yomigana = doc.marks.find((m) => m.type === 'yomigana')!;
    expect(yomigana).toMatchObject({
      anchor: { from: 'b1#1', to: 'b1#2' },
      ext: { edu: { quiz: '甲' } },
    });
  });

  it('宣言の無い文書の edu 属性は誤り、登録されていない名前空間の属性は読み飛ばす', () => {
    const noDecl = docOf('學<skam:kaeri kind="ichi" edu:quiz="問1"/>', '<skam:meta/>');
    expect(() => parseSeq(noDecl)).toThrow();
    const foreign = parseSeq(
      docOf('學<skam:kaeri kind="ichi" foo:bar="1"/>', '<skam:meta/>', ' xmlns:foo="urn:foo"')
    );
    expect(foreign.marks[0]!.ext).toBeUndefined();
  });

  it('付けられない所の edu 属性は誤りで、メッセージに属性の値を含まない', () => {
    const SECRET = 'SECRETVALUE';
    const cases = [
      `<skam:kun yomi="まな" okuri="ブ" edu:okuri-quiz="${SECRET}" edu:soe-quiz="${SECRET}">學</skam:kun>`,
      `<skam:kun yomi="まな" edu:quiz="${SECRET}">學</skam:kun>`,
      `<skam:kun yomi="まな" edu:okuri-quiz="${SECRET}">學</skam:kun>`,
      `<skam:saidoku><skam:base>未</skam:base><skam:kunform yomi="いま" edu:quiz="${SECRET}"/></skam:saidoku>`,
      `<skam:span type="highlight" edu:quiz="${SECRET}">學</skam:span>`,
      `學<skam:ref label="a" edu:quiz="${SECRET}"/>`,
      `學<skam:br/>`.replace('<skam:br/>', `<skam:br edu:quiz="${SECRET}"/>而`),
      '學<skam:kaeri kind="ichi" edu:quiz=""/>',
    ];
    for (const block of cases) {
      let message = '';
      try {
        parseSeq(docOf(block));
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).not.toBe('');
      expect(message).not.toContain(SECRET);
    }
  });

  it('saidoku の edu:quiz は saidoku の注記の印になる', () => {
    const doc = parseSeq(
      docOf(
        '<skam:saidoku edu:quiz="問1"><skam:base>未</skam:base><skam:kunform yomi="いま"/><skam:kunform okuri="ず"/></skam:saidoku>'
      )
    );
    expect(doc.marks[0]).toMatchObject({ type: 'saidoku', ext: { edu: { quiz: '問1' } } });
  });
});

describe('parse: extension definitions', () => {
  const test1: SKAMExtensionDefinition = {
    name: 'test1',
    uri: 'urn:test1:1',
    required: false,
    readXmlAttributes(attributes, target) {
      const n = attributes.get('n');
      if (n === undefined) return { values: [] };
      const mark = target.marks[0]?.mark;
      if (!mark) return { error: 'no mark' };
      return { values: [{ mark, value: { n: Number(n) } }] };
    },
  };

  it('渡した定義の属性を読む', () => {
    const meta = '<skam:meta><skam:extension name="test1" uri="urn:test1:1"/></skam:meta>';
    const doc = parseSeq(
      docOf('學<skam:kaeri kind="ichi" test1:n="1"/>', meta, ' xmlns:test1="urn:test1:1"'),
      { extensions: [test1] }
    );
    expect(doc.marks[0]!.ext).toEqual({ test1: { n: 1 } });
  });

  it('同じ名前の定義を 2 つ渡すと TypeError', () => {
    expect(() => parseSeq(docOf('學'), { extensions: [test1, { ...test1 }] })).toThrow(TypeError);
  });

  it('名前空間の URI は取りに行かない', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    parseSeq(docOf('學<skam:kaeri kind="ichi" edu:quiz="問1"/>'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('parse: skam:ext / skam:custom / placement-hint', () => {
  const NS = 'xmlns:skam="urn:skam:1" xmlns:edu="urn:skam:edu:1"';
  const doc = (rootAttrs: string, block: string, blockAttrs = '', readings = '') =>
    `<skam:doc ${NS}${rootAttrs}><skam:body><skam:block xml:id="b1"${blockAttrs}>${block}</skam:block></skam:body>${readings}</skam:doc>`;

  it('reads custom and ext on the root and on skam:block', () => {
    const result = parse(
      doc(
        ` skam:custom='{"a":1}' skam:ext='{"x":{"y":2}}'`,
        '學',
        ` skam:custom='{"b":[1,2]}' skam:ext='{"z":true}'`
      )
    );
    expect(result.custom).toEqual({ a: 1 });
    expect(result.ext).toEqual({ x: { y: 2 } });
    expect(result.blocks[0]).toMatchObject({ custom: { b: [1, 2] }, ext: { z: true } });
  });

  it('reads custom and ext on <skam:t>, and on skam:reading', () => {
    const result = parse(
      doc(
        '',
        `<skam:t skam:custom='{"c":1}' skam:ext='{"e":2}'>學</skam:t>`,
        '',
        `<skam:readings><skam:reading kind="kundoku" skam:custom='{"r":1}' skam:ext='{"s":2}'>まなぶ</skam:reading></skam:readings>`
      )
    );
    expect(result.tokens[0]).toMatchObject({ custom: { c: 1 }, ext: { e: 2 } });
    expect(result.readings[0]).toMatchObject({ custom: { r: 1 }, ext: { s: 2 } });
  });

  it('reads the three attributes on an annotation element', () => {
    const result = parse(
      doc(
        '',
        `<skam:okimoji skam:custom='{"c":1}' skam:ext='{"e":2}' placement-hint="left">學</skam:okimoji>` +
          `學<skam:kaeri kind="re" placement-hint="top" skam:custom='{"k":1}'/>`
      )
    );
    expect(result.marks.find((m) => m.type === 'okimoji')).toMatchObject({
      custom: { c: 1 },
      ext: { e: 2 },
      placementHint: 'left',
    });
    expect(result.marks.find((m) => m.type === 'kaeri')).toMatchObject({
      custom: { k: 1 },
      placementHint: 'top',
    });
  });

  it('keeps a namespaced attribute value of a declared extension next to skam:custom', () => {
    const meta = EDU_DECL;
    const result = parse(
      `<skam:doc ${NS}>${meta}<skam:body><skam:block xml:id="b1">學<skam:kaeri kind="ichi" edu:quiz="q1" skam:custom='{"k":1}'/></skam:block></skam:body></skam:doc>`
    );
    expect(result.marks[0]).toMatchObject({ ext: { edu: { quiz: 'q1' } }, custom: { k: 1 } });
  });

  it('reads skam:kun parts by prefix: yomi without a prefix, okuri-* and soe-*', () => {
    const result = parse(
      doc(
        '',
        '<skam:kun yomi="まな" okuri="ブ" soe="を" ' +
          `skam:custom='{"y":1}' placement-hint="top" ` +
          `skam:okuri-custom='{"o":1}' skam:okuri-ext='{"oe":1}' okuri-placement-hint="right" ` +
          `skam:soe-ext='{"se":1}' soe-placement-hint="left">學</skam:kun>`
      )
    );
    const byType = (type: string) => result.marks.find((m) => m.type === type)!;
    expect(byType('yomigana')).toMatchObject({ custom: { y: 1 }, placementHint: 'top' });
    expect(byType('yomigana').ext).toBeUndefined();
    expect(byType('okurigana')).toMatchObject({
      custom: { o: 1 },
      ext: { oe: 1 },
      placementHint: 'right',
    });
    expect(byType('soegana')).toMatchObject({ ext: { se: 1 }, placementHint: 'left' });
  });

  it('sets the okurigana placementHint from okuri-placement-hint', () => {
    const result = parse(
      doc('', '<skam:kun yomi="まな" okuri="ブ" okuri-placement-hint="right">學</skam:kun>')
    );
    expect(result.marks.find((m) => m.type === 'okurigana')!.placementHint).toBe('right');
  });

  it('ignores attributes of an unregistered namespace', () => {
    const result = parse(
      `<skam:doc xmlns:skam="urn:skam:1" xmlns:foo="urn:foo" foo:ext='{"a":1}' foo:placement-hint="x"><skam:body><skam:block>學</skam:block></skam:body></skam:doc>`
    );
    expect(result.ext).toBeUndefined();
  });

  it('keeps the parsed objects own keys, not inherited ones', () => {
    const result = parse(doc(` skam:custom='{"constructor":1}'`, '學'), { validate: false });
    expect(Object.hasOwn(result.custom!, 'constructor')).toBe(true);
    expect(Object.getPrototypeOf(result.custom)).toBe(Object.prototype);
  });
});

describe('parse: skam:extension without uri', () => {
  const noUriDoc = (
    meta: string,
    block: string,
    rootAttrs = '',
    ns = ' xmlns:edu="urn:skam:edu:1"'
  ): string =>
    `<skam:doc xmlns:skam="urn:skam:1"${ns}${rootAttrs}>${meta}<skam:body><skam:block xml:id="b1">${block}</skam:block></skam:body></skam:doc>`;
  const saidokuWithQuiz =
    '<skam:saidoku edu:quiz="問2"><skam:base>未</skam:base><skam:kunform yomi="いま"/></skam:saidoku>';

  it('reads an unknown name as a declaration of an unknown extension', () => {
    const doc = parse(
      noUriDoc(
        '<skam:meta><skam:extension name="zzz"/></skam:meta>',
        '甲',
        ` skam:ext='{"zzz":{"a":1}}'`
      )
    );
    expect(doc.extensions).toEqual(['zzz']);
    expect((doc.ext as { zzz: { a: number } }).zzz.a).toBe(1);
  });

  it('reads a registered name as that extension and its namespaced attribute', () => {
    const doc = parse(
      noUriDoc(
        '<skam:meta><skam:extension name="edu" required="true"/></skam:meta>',
        saidokuWithQuiz
      )
    );
    expect(doc.extensions).toEqual(['edu']);
    expect(doc.marks.find((m) => m.type === 'saidoku')!.ext).toEqual({ edu: { quiz: '問2' } });
  });

  it('rejects a registered name whose prefix is bound to another namespace', () => {
    expect(() =>
      parse(
        noUriDoc(
          '<skam:meta><skam:extension name="edu" required="true"/></skam:meta>',
          saidokuWithQuiz,
          '',
          ' xmlns:edu="urn:other"'
        )
      )
    ).toThrow(SKAMXMLParseError);
  });

  it('keeps required with an unknown name, an empty uri and double declarations as errors', () => {
    const bad = [
      '<skam:meta><skam:extension name="zzz" required="true"/></skam:meta>',
      '<skam:meta><skam:extension name="zzz" uri=""/></skam:meta>',
      '<skam:meta><skam:extension name="zzz" uri="urn:x:zzz"/><skam:extension name="zzz"/></skam:meta>',
      '<skam:meta><skam:extension name="zzz"/><skam:extension name="zzz" uri="urn:x:zzz"/></skam:meta>',
    ];
    for (const meta of bad) expect(() => parse(noUriDoc(meta, '甲'))).toThrow(SKAMXMLParseError);
  });
});
