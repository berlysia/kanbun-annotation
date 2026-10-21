import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSequentialIdGenerator } from '@kanbun-skam/skam';
import type { SKAMExtensionDefinition } from '@kanbun-skam/skam/extensions';
import { parse } from '../index.js';

const EDU_DECL =
  '<skam:meta><skam:extension name="edu" uri="urn:skam:edu:1" required="true"/></skam:meta>';

function docOf(block: string, meta = EDU_DECL, extraNs = ' xmlns:edu="urn:skam:edu:1"'): string {
  return `<skam:doc xmlns:skam="urn:skam:1"${extraNs}>${meta}<skam:body><skam:block xml:id="b1">${block}</skam:block></skam:body></skam:doc>`;
}

function parseSeq(xml: string, options: Parameters<typeof parse>[1] = {}) {
  return parse(xml, { idGenerator: createSequentialIdGenerator(), ...options });
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
      '<skam:meta><skam:extension name="edu"/></skam:meta>',
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
      anchor: { from: 't1', to: 't2' },
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
