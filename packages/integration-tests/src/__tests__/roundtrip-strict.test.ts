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
  createSequentialIdGenerator,
  validateSKAMDocument,
  SKAMValidationError,
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
const seq = () => ({ idGenerator: createSequentialIdGenerator() });
const normalize = (d: SKAMDocument) => {
  const order = d.blocks.flatMap((b) => b.tokenIds);
  const pos = (id: string | undefined) => (id === undefined ? 'start' : order.indexOf(id));
  const text = (id: string) => d.tokens.find((t) => t.id === id)!.text;
  const mark = (m: Mark) => {
    const { id: _id, ...rest } = m as Mark & { id?: string };
    const anchor = 'anchor' in m ? [pos(m.anchor.from), pos(m.anchor.to)] : undefined;
    const position =
      'position' in m && 'blockId' in (m.position as object)
        ? pos((m.position as { after?: string }).after)
        : undefined;
    // Key order depends on which side built the object, so sort keys before comparing.
    const entries = Object.entries({ ...rest, anchor, position }).sort(([x], [y]) =>
      x < y ? -1 : 1
    );
    return JSON.stringify(entries);
  };
  return {
    blocks: d.blocks.map((b) => b.tokenIds.map(text).join('')),
    marks: d.marks.map(mark).sort(),
    readings: d.readings,
  };
};

describe('strict round-trip over all valid fixtures', () => {
  const files = readdirSync(fixtureDir).filter((f) => f.endsWith('.xml'));
  it('finds fixtures', () => expect(files.length).toBeGreaterThanOrEqual(31));
  for (const name of files) {
    it(`${name}: parse → stringify (no loss) → parse preserves semantics`, () => {
      const a = parse(readFileSync(join(fixtureDir, name), 'utf8'), seq());
      const b = parse(stringify(a), seq());
      expect(normalize(b)).toEqual(normalize(a));
    });
  }
  it('U+3000 and CDATA survive', () => {
    const src =
      '<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>甲　<![CDATA[乙]]></skam:block></skam:body></skam:doc>';
    expect(normalize(parse(stringify(parse(src)))).blocks).toEqual(['甲　乙']);
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
    expect(normalize(parse(stringify(d), seq()))).toEqual(normalize(d));
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
    expect(normalize(parse(stringify(d), seq()))).toEqual(normalize(d));
  });
});

it('parser and stringify share the same SKAM-ML content model table', () => {
  expect(STRINGIFY_MODEL).toEqual(PARSER_MODEL);
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
const randomMark = (r: () => number, n: number) => {
  const a = Math.floor(r() * n);
  const b = Math.min(n - 1, a + Math.floor(r() * 3));
  const type = ANCHORED[Math.floor(r() * ANCHORED.length)]!;
  const anchor = { from: `t${a + 1}`, to: `t${b + 1}` };
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
const randomPositionMark = (r: () => number, n: number) => {
  const after = `t${1 + Math.floor(r() * n)}`;
  return r() < 0.5
    ? { type: 'kutoten', kind: 'ten', value: '、', position: { blockId: 'b1', after } }
    : { type: 'kaeri', value: '㆑', position: { blockId: 'b1', after } };
};

// 性質 (a)(b): validator を通るランダムな文書は、lossy stringify の後に strict parse を通る。
// 欠落を除いた部分は、意味が変わらない
describe('property (a)(b): validator-valid documents survive lossy stringify → strict parse', () => {
  const r = prng(4242);
  let checked = 0;
  for (let n = 0; n < 400; n++) {
    const len = 2 + Math.floor(r() * 4);
    const tokens = Array.from({ length: len }, (_, i) => ({
      id: `t${i + 1}`,
      text: '甲乙丙丁戊'[i]!,
    }));
    const doc = {
      format: 'skam@0.1' as const,
      readings: [],
      tokens,
      blocks: [{ id: 'b1', tokenIds: tokens.map((t) => t.id) }],
      marks: [
        ...Array.from({ length: 1 + Math.floor(r() * 4) }, () => randomMark(r, len)),
        ...Array.from({ length: Math.floor(r() * 2) }, () => randomPositionMark(r, len)),
      ],
    };
    if (!validateSKAMDocument(doc).valid) continue;
    checked++;
    it(`case ${n}`, () => {
      const losses: StringifyLoss[] = [];
      const xml = stringify(doc as unknown as SKAMDocument, {
        lossy: true,
        onLoss: (l) => losses.push(l),
      });
      const back = parse(xml, seq());
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
      first = parse(xml, seq());
    } catch (e) {
      if (e instanceof SKAMValidationError) continue; // 同型の重複・saidoku と kun の衝突など validator の制約だけを飛ばす
      throw e; // 表どおりの XML を parser が拒否したら、それ自体が不具合
    }
    checked++;
    it(`generated case ${n}`, () => {
      const losses: StringifyLoss[] = [];
      const out = stringify(first, { lossy: true, onLoss: (l) => losses.push(l) });
      expect(losses).toEqual([]);
      expect(normalize(parse(out, seq()))).toEqual(normalize(first));
    });
  }
  it('generated enough cases', () => expect(checked).toBeGreaterThanOrEqual(100));
});
