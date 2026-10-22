import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@kanbun-skam/skam-xml-parser';
import {
  stringify,
  SKAM_ML_CONTENT_MODEL as STRINGIFY_MODEL,
  SKAM_ML_NESTING_ORDER as STRINGIFY_NESTING_ORDER,
  type StringifyLoss,
} from '@kanbun-skam/skam-xml-stringify';
import { SKAM_ML_CONTENT_MODEL as PARSER_MODEL } from '@kanbun-skam/skam-xml-parser';
import {
  validateSKAMDocument,
  SKAMValidationError,
  isAutoId,
  isHandId,
  renumberAutoIds,
  type SKAMDocument,
  type Mark,
} from '@kanbun-skam/skam';

// The parser's valid fixtures are the single source of correct SKAM-ML examples.
// This package is private and never published, so a cross-package relative path is safe;
// if the fixtures move, readdirSync fails loudly instead of silently passing.
const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../skam-xml-parser/src/__tests__/fixtures/valid'
);
/**
 * spec K1 の「同じ文書」。
 * - ブロックの id と字の id は値まで比べる (手書きの id はそのまま、自動の id は位置の値)
 * - 字は id ごとに text、ext、custom を比べる。文書、ブロックの ext と custom も比べる
 * - 注記は、手書きの id は値まで、自動の id は値を比べない。highlight.ref は指す注記で比べる
 */
const normalize = (d: SKAMDocument) => {
  const order = d.blocks.flatMap((b) => b.tokenIds);
  const pos = (id: string | undefined) => (id === undefined ? 'start' : order.indexOf(id));
  const text = (id: string) => d.tokens.find((t) => t.id === id)!.text;
  const handId = (id: string | undefined) => (id !== undefined && isHandId(id) ? id : undefined);
  const markKey = (m: Mark, resolveRef: boolean): string => {
    const { id, ...rest } = m as Mark & { id?: string; ref?: string };
    const anchor = 'anchor' in m ? [pos(m.anchor.from), pos(m.anchor.to)] : undefined;
    const position =
      'position' in m && 'blockId' in (m.position as object)
        ? pos((m.position as { after?: string }).after)
        : undefined;
    const ref = 'ref' in rest ? (rest as { ref?: string }).ref : undefined;
    delete (rest as { ref?: string }).ref;
    const linked =
      resolveRef && ref !== undefined
        ? (() => {
            const target = d.marks.find((x) => x.id === ref);
            return target ? markKey(target, false) : `unresolved:${ref}`;
          })()
        : undefined;
    // Key order depends on which side built the object, so sort keys before comparing.
    const entries = Object.entries({ ...rest, anchor, position, handId: handId(id), linked }).sort(
      ([x], [y]) => (x < y ? -1 : 1)
    );
    return JSON.stringify(entries);
  };
  return {
    blocks: d.blocks.map((b) => ({
      id: b.id,
      text: b.tokenIds.map(text).join(''),
      tokenIds: b.tokenIds,
      ext: b.ext,
      custom: b.custom,
    })),
    tokens: d.tokens
      .map(({ id, text: tokenText, ext, custom }) => ({ id, text: tokenText, ext, custom }))
      .sort((x, y) => (x.id < y.id ? -1 : 1)),
    marks: d.marks.map((m) => markKey(m, true)).sort(),
    readings: d.readings,
    lang: d.lang,
    ext: d.ext,
    custom: d.custom,
  };
};
const rootXmlLang = (xml: string) => /<skam:doc[^>]*?\sxml:lang="([^"]*)"/.exec(xml)?.[1];

describe('strict round-trip over all valid fixtures', () => {
  const files = readdirSync(fixtureDir).filter((f) => f.endsWith('.xml'));
  it('finds fixtures', () => expect(files.length).toBeGreaterThanOrEqual(31));
  for (const name of files) {
    it(`${name}: parse → stringify (no loss) → parse preserves semantics`, () => {
      const a = parse(readFileSync(join(fixtureDir, name), 'utf8'));
      const b = parse(stringify(a));
      expect(normalize(b)).toEqual(normalize(a));
    });
    it(`${name}: root xml:lang survives XML → JSON → XML`, () => {
      const source = readFileSync(join(fixtureDir, name), 'utf8');
      const expected = rootXmlLang(source);
      // 空の xml:lang は「言語の情報が無い」の意味で、lang を持たない文書になる
      expect(rootXmlLang(stringify(parse(source)))).toBe(expected === '' ? undefined : expected);
    });
  }
  it('finds a fixture whose root has xml:lang', () => {
    const withLang = files.filter((f) => rootXmlLang(readFileSync(join(fixtureDir, f), 'utf8')));
    expect(withLang.length).toBeGreaterThan(0);
  });
  it('lang survives JSON → XML → JSON, including characters that need escaping', () => {
    const base: SKAMDocument = {
      format: 'skam@0.1',
      readings: [],
      tokens: [{ id: 't1', text: '甲' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [],
    };
    for (const lang of ['lzh', 'zh-Hant']) {
      expect(parse(stringify({ ...base, lang })).lang).toBe(lang);
    }
    const hostile = { ...base, lang: 'a"b<c&' } as SKAMDocument;
    expect(parse(stringify(hostile), { validate: false }).lang).toBe('a"b<c&');
  });
  it('U+3000 and CDATA survive', () => {
    const src =
      '<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>甲　<![CDATA[乙]]></skam:block></skam:body></skam:doc>';
    expect(normalize(parse(stringify(parse(src)))).blocks.map((b) => b.text)).toEqual(['甲　乙']);
  });
  it('block-start kutoten/ref and content-only ref round-trip', () => {
    const d: SKAMDocument = {
      format: 'skam@0.1',
      readings: [],
      tokens: [
        { id: 't1', text: '甲' },
        { id: 't2', text: '乙' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [
        { type: 'kutoten', kind: 'ku', value: '。', position: { blockId: 'b1' } },
        { id: 'r1', type: 'ref', format: 'numeric-bracket', position: { blockId: 'b1' } },
        {
          type: 'ref',
          format: 'numeric-bracket',
          content: '注',
          position: { blockId: 'b1', after: 't1' },
        },
      ],
    };
    expect(normalize(parse(stringify(d)))).toEqual(normalize(d));
  });
  it('yomigana range with inner kun round-trips', () => {
    const d: SKAMDocument = {
      format: 'skam@0.1',
      readings: [],
      tokens: [
        { id: 't1', text: '甲' },
        { id: 't2', text: '乙' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [
        { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'x' },
        { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'y' },
      ],
    };
    expect(normalize(parse(stringify(d)))).toEqual(normalize(d));
  });
});

it('parser and stringify share the same SKAM-ML content model table', () => {
  expect(STRINGIFY_MODEL).toBe(PARSER_MODEL);
});

// draft §7.0 の Markdown の表を読み取り、定数と突き合わせる (spec K2a: 表と定数のずれを機械的に止める)
it('SKAM_ML_CONTENT_MODEL matches the normative table in SKAM-ML-draft §7.0', () => {
  const draft = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../../../SKAM-ML-draft.md'),
    'utf8'
  );
  const section = draft.split('### 7.0')[1]!.split(/\n### /)[0]!;
  const rows = section.split('\n').filter((l) => l.startsWith('| `skam:'));
  const parsed: Record<string, string[]> = {};
  for (const row of rows) {
    const [parentCell, childCell] = row
      .split('|')
      .slice(1, 3)
      .map((c) => c.trim());
    const children = /テキストのみ/.test(childCell!)
      ? ['#text']
      : [
          ...(/テキスト/.test(childCell!) ? ['#text'] : []),
          ...[...childCell!.matchAll(/`skam:([a-z]+)`/g)].map((m) => m[1]!),
        ];
    for (const [, name] of parentCell!.matchAll(/`skam:([a-z]+)`/g)) parsed[name!] = children;
  }
  // 子の制約がない行と saidoku は、定数に含めない (K2a)
  for (const k of ['block', 'span', 'tateten', 'saidoku']) delete parsed[k];
  expect(parsed).toEqual(
    Object.fromEntries(Object.entries(PARSER_MODEL).map(([k, v]) => [k, [...v]]))
  );
  // 入れ子順: §7.0 の番号付きリストから要素名を取り出し、定数と照合する
  const orderList = section
    .split('\n')
    .filter((l) => /^\s*\d+\.\s/.test(l))
    .flatMap((l) => [...l.matchAll(/`skam:([a-z]+)`/g)].map((m) => m[1]!));
  expect(orderList).toEqual([...STRINGIFY_NESTING_ORDER]);
});

const prng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const ANCHORED = [
  'yomigana',
  'okurigana',
  'soegana',
  'okimoji',
  'joji',
  'okototen',
  'saidoku',
  'emphasis',
  'highlight',
  'tateten',
] as const;
const randomMark = (r: () => number, n: number, blockId: string) => {
  const a = Math.floor(r() * n);
  const b = Math.min(n - 1, a + Math.floor(r() * 3));
  const type = ANCHORED[Math.floor(r() * ANCHORED.length)]!;
  const anchor = { from: `${blockId}#${a + 1}`, to: `${blockId}#${b + 1}` };
  switch (type) {
    case 'yomigana':
    case 'okurigana':
    case 'soegana':
      return { type, anchor, value: 'か' };
    case 'okototen':
      return {
        type,
        anchor,
        shape: 'dot',
        position: { system: 'glyph-grid', grid: '5x5', x: 1, y: 2 },
      };
    case 'saidoku':
      return { type, anchor, forms: [{ yomi: 'まさ' }, { okuri: 'す' }] };
    default:
      return { type, anchor };
  }
};
// 注記の id は、なし / 自動の形 / 手書きの形をばらまく。kun にまとめて書く 3 種は、
// xml:id を 1 つしか書けないので手書きの id を付けない
const KUN_TYPES: ReadonlySet<string> = new Set(['yomigana', 'okurigana', 'soegana']);
const withMarkId = <T extends { type: string }>(r: () => number, mark: T, k: number): T => {
  const roll = r();
  if (roll < 1 / 3) return mark;
  if (roll < 2 / 3) return { ...mark, id: `m#${k + 1}` };
  return KUN_TYPES.has(mark.type) ? mark : { ...mark, id: `n${k + 1}` };
};
const randomPositionMark = (r: () => number, n: number, blockId: string) => {
  const after = `${blockId}#${1 + Math.floor(r() * n)}`;
  return r() < 0.5
    ? { type: 'kutoten', kind: 'ten', value: '、', position: { blockId, after } }
    : { type: 'kaeri', value: '㆑', position: { blockId, after } };
};

// 性質 (a)(b): validator を通るランダムな文書は、lossy stringify の後に strict parse を通る。
// 欠落を除いた部分は、意味が変わらない
describe('property (a)(b): validator-valid documents survive lossy stringify → strict parse', () => {
  const r = prng(4242);
  let checked = 0;
  for (let n = 0; n < 400; n++) {
    const len = 2 + Math.floor(r() * 4);
    // ブロックの id は自動の形と手書きの形の両方。字の id は自動の形だけ (手書きの字の id を書くのは plan-2)
    const blockId = r() < 0.5 ? 'b#1' : 'p1';
    const tokens = Array.from({ length: len }, (_, i) => ({
      id: `${blockId}#${i + 1}`,
      text: '甲乙丙丁戊'[i]!,
    }));
    const rawMarks = [
      ...Array.from({ length: 1 + Math.floor(r() * 4) }, () => randomMark(r, len, blockId)),
      ...Array.from({ length: Math.floor(r() * 2) }, () => randomPositionMark(r, len, blockId)),
    ];
    const doc = {
      format: 'skam@0.1' as const,
      readings: [],
      tokens,
      blocks: [{ id: blockId, tokenIds: tokens.map((t) => t.id) }],
      marks: rawMarks.map((mark, k) => withMarkId(r, mark, k)),
    };
    if (!validateSKAMDocument(doc).valid) continue;
    checked++;
    it(`case ${n}`, () => {
      const losses: StringifyLoss[] = [];
      const xml = stringify(doc as unknown as SKAMDocument, {
        lossy: true,
        onLoss: (l) => losses.push(l),
      });
      const back = parse(xml);
      const lost = new Set(losses.map((l) => l.path));
      const kept = {
        ...doc,
        marks: doc.marks.filter((_, i) => !lost.has(`/marks/${i}`)),
      } as unknown as SKAMDocument;
      expect(normalize(back)).toEqual(normalize(kept));
    });
  }
  it('generated enough valid cases', () => expect(checked).toBeGreaterThanOrEqual(100));
});

// 性質 (c): §7.0 の表に沿って生成した SKAM-ML は、往復しても欠落が 0 件である (stringify から独立した生成器)
const CHARS = '甲乙丙丁戊己庚辛';
const genXml = (r: () => number) => {
  let c = 0;
  const ch = () => CHARS[c++ % CHARS.length]!;
  const oto = () =>
    `<skam:okototen grid="5x5" x="${Math.floor(r() * 5)}" y="${Math.floor(r() * 5)}" shape="dot">`;
  const inner = (kind: 'wrapper' | 'yomigana' | 'kun', depth: number): string => {
    const pick = Math.floor(r() * (kind === 'kun' || depth > 2 ? 1 : kind === 'yomigana' ? 2 : 5));
    const n = 1 + Math.floor(r() * 2);
    if (pick === 0) return Array.from({ length: n }, ch).join('');
    if (pick === 1) return `<skam:kun okuri="ニ">${inner('kun', depth + 1)}</skam:kun>`;
    if (pick === 2) return `<skam:okimoji>${inner('wrapper', depth + 1)}</skam:okimoji>`;
    if (pick === 3) return `<skam:joji>${inner('wrapper', depth + 1)}</skam:joji>`;
    return `${oto()}${inner('wrapper', depth + 1)}</skam:okototen>`;
  };
  const blockItem = (depth: number): string => {
    switch (Math.floor(r() * (depth > 1 ? 1 : 8))) {
      case 0:
        return ch();
      case 1:
        return `<skam:kun yomi="か">${inner('kun', depth + 1)}</skam:kun>`;
      case 2:
        return `<skam:yomigana value="よ">${inner('yomigana', depth + 1)}</skam:yomigana>`;
      case 3:
        return `<skam:okimoji>${inner('wrapper', depth + 1)}</skam:okimoji>`;
      case 4:
        return `${oto()}${inner('wrapper', depth + 1)}</skam:okototen>`;
      case 5:
        return `<skam:span type="emphasis">${blockItem(depth + 1)}${blockItem(depth + 1)}</skam:span>`;
      case 6:
        return `<skam:saidoku><skam:base>${inner('wrapper', depth + 1)}</skam:base><skam:kunform n="1" yomi="まさ"/></skam:saidoku>`;
      default:
        return `${ch()}<skam:kutoten value="、" kind="ten"/>`;
    }
  };
  const body = Array.from({ length: 2 + Math.floor(r() * 4) }, () => blockItem(0)).join('');
  return `<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>${ch()}${body}</skam:block></skam:body></skam:doc>`;
};

describe('property (c): content-model-generated SKAM-ML round-trips with zero losses', () => {
  const r = prng(777);
  let checked = 0;
  for (let n = 0; n < 300; n++) {
    const xml = genXml(r);
    let first: SKAMDocument;
    try {
      first = parse(xml);
    } catch (e) {
      if (e instanceof SKAMValidationError) continue; // 同型の重複・saidoku と kun の衝突など validator の制約だけを飛ばす
      throw e; // 表どおりの XML を parser が拒否したら、それ自体が不具合
    }
    checked++;
    it(`generated case ${n}`, () => {
      const losses: StringifyLoss[] = [];
      const out = stringify(first, { lossy: true, onLoss: (l) => losses.push(l) });
      expect(losses).toEqual([]);
      expect(normalize(parse(out))).toEqual(normalize(first));
    });
  }
  it('generated enough cases', () => expect(checked).toBeGreaterThanOrEqual(100));
});

// ============================================================================
// id の体系 (spec K2): 手書きの id は値まで往復し、自動の id は位置から計算し直す
// ============================================================================

describe('ids: hand-written ids round-trip, automatic ids are recomputed', () => {
  const fixtureFiles = readdirSync(fixtureDir).filter((f) => f.endsWith('.xml'));
  const wrapBody = (inner: string) =>
    `<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>${inner}</skam:block></skam:body></skam:doc>`;
  const highlightRefs = (doc: SKAMDocument) =>
    doc.marks.flatMap((m) => (m.type === 'highlight' ? [m.ref] : []));

  for (const name of fixtureFiles) {
    it(`${name}: parsed ids are a fixed point of renumberAutoIds, with no id warnings`, () => {
      const doc = parse(readFileSync(join(fixtureDir, name), 'utf8'));
      const once = renumberAutoIds(doc);
      expect(once).toEqual(doc);
      expect(renumberAutoIds(once)).toEqual(once);
      const result = validateSKAMDocument(doc);
      const idWarnings = (result.valid ? (result.warnings ?? []) : []).filter(
        (w) => w.kind === 'ID_FORM' || w.kind === 'XML_UNWRITABLE_CHAR'
      );
      expect(idWarnings).toEqual([]);
    });
    it(`${name}: stringify never writes an automatic id`, () => {
      const xml = stringify(parse(readFileSync(join(fixtureDir, name), 'utf8')));
      expect(xml).not.toMatch(/xml:id="[^"]*#/);
    });
  }

  it('a document that mixes hand-written and automatic mark ids keeps the hand-written values', () => {
    const d: SKAMDocument = {
      format: 'skam@0.1',
      readings: [],
      tokens: [
        { id: 'b#1#1', text: '甲' },
        { id: 'b#1#2', text: '乙' },
        { id: 'b#1#3', text: '丙' },
      ],
      blocks: [{ id: 'b#1', tokenIds: ['b#1#1', 'b#1#2', 'b#1#3'] }],
      marks: [
        { type: 'emphasis', id: 'm#1', anchor: { from: 'b#1#1', to: 'b#1#1' } },
        { type: 'tateten', id: 'cite-1', anchor: { from: 'b#1#2', to: 'b#1#3' } },
        {
          type: 'kutoten',
          id: 'm#3',
          kind: 'ku',
          value: '。',
          position: { blockId: 'b#1', after: 'b#1#3' },
        },
        { type: 'ref', id: 'ref-1', label: 'a', position: { blockId: 'b#1', after: 'b#1#1' } },
      ],
    };
    const xml = stringify(d);
    expect(xml).toContain('xml:id="cite-1"');
    expect(xml).toContain('xml:id="ref-1"');
    expect(xml).not.toContain('#');
    const back = parse(xml);
    expect(back.marks.map((m) => m.id).filter((id) => !id?.startsWith('m#'))).toEqual(
      expect.arrayContaining(['cite-1', 'ref-1'])
    );
    expect(normalize(back)).toEqual(normalize(d));
  });

  it('hand-written block ids round-trip and give the tokens ids built from them', () => {
    const d = parse(
      '<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block xml:id="p1">甲乙</skam:block><skam:block>丙</skam:block></skam:body></skam:doc>'
    );
    const back = parse(stringify(d));
    expect(back.blocks.map((b) => b.id)).toEqual(['p1', 'b#2']);
    expect(back.tokens.map((t) => t.id)).toEqual(['p1#1', 'p1#2', 'b#2#1']);
  });

  describe('highlight and ref linking round-trips (by name only)', () => {
    const cases: [string, string][] = [
      [
        'a ref attribute naming a ref after the first character',
        '<skam:span type="highlight" ref="r1">甲<skam:ref xml:id="r1" label="a"/>乙</skam:span>',
      ],
      [
        'a ref attribute naming a ref after the last character',
        '<skam:span type="highlight" ref="r1">甲乙<skam:ref xml:id="r1" label="a"/></skam:span>',
      ],
      [
        'a ref attribute naming a later ref, with an unrelated ref inside',
        '<skam:span type="highlight" ref="r1">甲<skam:ref label="a"/>乙</skam:span>丙<skam:ref xml:id="r1" label="b"/>',
      ],
      [
        'a ref attribute naming a ref before the highlight',
        '<skam:ref xml:id="r1" label="a"/><skam:span type="highlight" ref="r1">甲乙</skam:span>',
      ],
      [
        'nested highlights naming the same ref',
        '<skam:span type="highlight" ref="r1"><skam:span type="highlight" ref="r1">甲<skam:ref xml:id="r1" label="a"/>乙</skam:span>丙</skam:span>',
      ],
      [
        'a linked ref after the last character under an emphasis, with a kutoten',
        '<skam:span type="emphasis">甲<skam:span type="highlight" ref="r1">乙丙<skam:ref xml:id="r1" label="a"/></skam:span></skam:span><skam:kutoten value="、"/>',
      ],
      [
        'a ref inside a highlight without a ref attribute stays unlinked',
        '<skam:span type="highlight">甲<skam:ref label="a"/>乙</skam:span>',
      ],
      [
        'a hand-written ref inside a highlight without a ref attribute stays unlinked',
        '<skam:span type="highlight">甲<skam:ref xml:id="r1" label="a"/>乙</skam:span>',
      ],
      [
        'a ref after the last character of a highlight without a ref attribute',
        '<skam:span type="highlight">甲乙<skam:ref label="a"/></skam:span>',
      ],
      [
        'a ref after the highlight and one inside, both unlinked',
        '<skam:span type="highlight">甲<skam:ref label="a"/></skam:span><skam:ref label="b"/>',
      ],
      [
        'ref="" with a ref inside is the same as no attribute',
        '<skam:span type="highlight" ref="">甲<skam:ref label="a"/>乙</skam:span>',
      ],
    ];
    for (const [title, inner] of cases) {
      it(`${title}: parse → stringify → parse keeps the links and reaches a fixed point`, () => {
        const first = parse(wrapBody(inner));
        const result = validateSKAMDocument(first);
        expect(result.valid && result.warnings).toBeFalsy();
        const xml = stringify(first);
        expect(xml).not.toContain('ref=""');
        const second = parse(xml);
        expect(normalize(second)).toEqual(normalize(first));
        expect(highlightRefs(second)).toEqual(highlightRefs(first));
        // 種類の違う注記どうしの順は問わない。ref どうしの順は保つ
        const refLabels = (doc: SKAMDocument) =>
          doc.marks.flatMap((m) => (m.type === 'ref' ? [m.label] : []));
        expect(refLabels(second)).toEqual(refLabels(first));
        expect(stringify(second)).toBe(xml);
      });
    }

    it('two highlights in different blocks share one ref by name', () => {
      const xml =
        '<skam:doc xmlns:skam="urn:skam:1"><skam:body>' +
        '<skam:block>甲<skam:ref xml:id="r1" label="a"/></skam:block>' +
        '<skam:block><skam:span type="highlight" ref="r1">乙</skam:span></skam:block>' +
        '<skam:block><skam:span type="highlight" ref="r1">丙</skam:span></skam:block>' +
        '</skam:body></skam:doc>';
      const first = parse(xml);
      expect(highlightRefs(first)).toEqual(['r1', 'r1']);
      const second = parse(stringify(first));
      expect(highlightRefs(second)).toEqual(['r1', 'r1']);
      expect(normalize(second)).toEqual(normalize(first));
    });

    it('a highlight without ref, with one ref inside, is written without a ref attribute and stays unlinked', () => {
      const d: SKAMDocument = {
        format: 'skam@0.1',
        readings: [],
        tokens: [
          { id: 'b#1#1', text: '甲' },
          { id: 'b#1#2', text: '乙' },
        ],
        blocks: [{ id: 'b#1', tokenIds: ['b#1#1', 'b#1#2'] }],
        marks: [
          { type: 'highlight', id: 'm#1', anchor: { from: 'b#1#1', to: 'b#1#2' } },
          { type: 'ref', id: 'm#2', label: 'a', position: { blockId: 'b#1', after: 'b#1#1' } },
        ],
      };
      const xml = stringify(d);
      expect(xml).not.toContain('ref="');
      expect(highlightRefs(parse(xml))).toEqual([undefined]);
    });
  });
});

// ============================================================================
// <skam:t> と ext / custom / placementHint (spec K3、K5): 損失なしで往復し、K1 の「同じ文書」に戻る
// ============================================================================

describe('<skam:t>, ext, custom and placementHint round-trip without loss', () => {
  const T = (n: number) => `b#1#${n}`;
  const rich = (): SKAMDocument => ({
    format: 'skam@0.1',
    readings: [
      { kind: 'kundoku', text: ' 学 ', custom: { r: 1 } },
      { kind: 'yomiage', text: '学', ext: { e: [1, 2] } },
    ],
    ext: { legacy: { n: 1 } },
    custom: { doc: 'x', fffe: `${String.fromCharCode(0xfffe)}${String.fromCharCode(0xffff)}` },
    tokens: [
      { id: T(1), text: 'e' },
      { id: T(2), text: '́' },
      { id: T(3), text: '學問' },
      { id: T(4), text: ' ' },
      { id: T(5), text: ' 學' },
      { id: T(6), text: '\r\n' },
      { id: 'cite-1', text: '甲', ext: { tok: 1 } },
      { id: T(8), text: '乙', custom: { tc: '\u0001' } },
      { id: T(9), text: '丙' },
      { id: T(10), text: '丁' },
    ],
    blocks: [
      {
        id: 'b#1',
        tokenIds: [T(1), T(2), T(3), T(4), T(5), T(6), 'cite-1', T(8), T(9), T(10)],
        ext: { blk: true },
        custom: { bc: [1, { a: null }] },
      },
    ],
    marks: [
      {
        type: 'okimoji',
        id: 'note-1',
        anchor: { from: T(3), to: T(3) },
        placementHint: 'left',
        ext: { x: 1 },
        custom: { y: 2 },
      },
      { type: 'emphasis', id: 'm#2', anchor: { from: T(5), to: 'cite-1' }, custom: { em: true } },
      { type: 'tateten', id: 'm#3', anchor: { from: T(8), to: T(9) }, placementHint: 'top' },
      {
        type: 'yomigana',
        id: 'm#4',
        anchor: { from: T(10), to: T(10) },
        value: 'ア',
        custom: { y: 1 },
      },
      {
        type: 'okurigana',
        id: 'm#5',
        anchor: { from: T(10), to: T(10) },
        value: 'ブ',
        placementHint: 'right',
        ext: { o: 1 },
      },
      {
        type: 'soegana',
        id: 'm#6',
        anchor: { from: T(10), to: T(10) },
        value: 'を',
        custom: { s: 1 },
      },
      {
        type: 'kaeri',
        id: 'm#7',
        value: '㆑',
        position: { blockId: 'b#1', after: 'cite-1' },
        placementHint: 'p',
        custom: { k: 1 },
      },
      {
        type: 'ref',
        id: 'r-1',
        label: 'a',
        position: { blockId: 'b#1', after: T(9) },
        ext: { re: 1 },
      },
      {
        type: 'highlight',
        id: 'm#9',
        anchor: { from: T(9), to: T(9) },
        ref: 'r-1',
        custom: { h: 1 },
      },
      {
        type: 'linebreak',
        id: 'm#10',
        position: { blockId: 'b#1', after: T(9) },
        placementHint: 'q',
      },
    ],
  });

  it('is valid with no warnings, stringifies without loss and parses back to the same document', () => {
    const d = rich();
    const checked = validateSKAMDocument(d);
    expect(checked.valid).toBe(true);
    const losses: StringifyLoss[] = [];
    const xml = stringify(d, { lossy: true, onLoss: (l) => losses.push(l) });
    expect(losses).toEqual([]);
    const back = parse(xml);
    expect(normalize(back)).toEqual(normalize(d));
    expect(stringify(back)).toBe(xml);
  });

  it('writes no raw control character or U+FFFE / U+FFFF in an attribute', () => {
    const xml = stringify(rich());
    for (const [, value] of xml.matchAll(/="([^"]*)"/g)) {
      // formatter が正規表現の U+FFFE の escape を実際の文字に書き換えるので、文字列から組み立てる
      expect(value).not.toMatch(
        new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\uFFFE\\uFFFF]')
      );
    }
  });
});
