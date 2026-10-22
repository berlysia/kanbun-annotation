import { describe, it, expect } from 'vitest';
import type { Mark, SKAMDocument } from '@kanbun-skam/skam';
import { render, type RenderOptions } from '../../index.js';
import {
  all,
  attr,
  closestPart,
  count,
  partText,
  parts,
  renderDom,
  unit,
  PART_SELECTORS,
  SLOT_PARTS,
} from './dom-contract.js';

function createDoc(texts: string[], marks: Mark[] = []): SKAMDocument {
  const ids = texts.map((_, i) => `t${i + 1}`);
  return {
    format: 'skam@0.1',
    tokens: texts.map((text, i) => ({ id: ids[i]!, text })),
    blocks: [{ id: 'b1', tokenIds: ids }],
    marks,
    readings: [],
  };
}

const span = (from: string, to: string) => ({ from, to });
const after = (id: string) => ({ blockId: 'b1', after: id });

/** interactive の有無と rubyMethod (grid, ruby) の 4 通り */
const RENDER_VARIANTS: { label: string; options: RenderOptions }[] = [
  { label: 'grid', options: {} },
  { label: 'grid + interactive', options: { interactive: true } },
  { label: 'ruby', options: { rubyMethod: 'ruby' } },
  { label: 'ruby + interactive', options: { rubyMethod: 'ruby', interactive: true } },
];

describe('range reading unit', () => {
  for (const { label, options } of RENDER_VARIANTS) {
    it(`finds the unit by the whole range text (${label})`, () => {
      const doc = createDoc(
        ['論', '語', '曰'],
        [{ type: 'yomigana', anchor: span('t1', 't2'), value: 'ろんご' }]
      );
      const root = renderDom(doc, options);
      expect(unit(root, '論語')).toBeTruthy();
      expect(partText(root, '論語', 'ruby')).toBe('ろんご');
      expect(partText(root, '曰', 'ruby')).toBeNull();
      expect(() => unit(root, '論')).toThrow(/論/);
    });
  }
});

describe('parts on a single unit', () => {
  const marks: Mark[] = [
    { type: 'yomigana', anchor: span('t1', 't1'), value: 'まな' },
    { type: 'okurigana', anchor: span('t1', 't1'), value: 'ビテ' },
    { type: 'kaeri', position: after('t1'), value: '㆑' },
  ];
  for (const { label, options } of RENDER_VARIANTS) {
    it(`reads, okurigana and kaeri belong to the unit that carries them (${label})`, () => {
      const root = renderDom(createDoc(['學', '而'], marks), options);
      expect(partText(root, '學', 'ruby')).toBe('まな');
      expect(partText(root, '學', 'okuri')).toBe('ビテ');
      expect(partText(root, '學', 'kaeri')).toBe('㆑');
      expect(partText(root, '而', 'ruby')).toBeNull();
      expect(partText(root, '而', 'okuri')).toBeNull();
      expect(partText(root, '而', 'kaeri')).toBeNull();
    });
  }

  it('returns null for a unit without the part', () => {
    const root = renderDom(createDoc(['學']));
    expect(partText(root, '學', 'ruby')).toBeNull();
    expect(parts(root, '學', 'ruby')).toEqual([]);
  });

  it('reads the class on the unit itself (emphasis, okimoji, joji, okototen)', () => {
    const doc = createDoc(
      ['道', '而', '之', '國'],
      [
        { type: 'emphasis', anchor: span('t1', 't1'), style: 'filled dot' },
        { type: 'okimoji', anchor: span('t2', 't2') },
        { type: 'joji', anchor: span('t3', 't3') },
        {
          type: 'okototen',
          anchor: span('t4', 't4'),
          position: { system: 'glyph-grid', grid: '5x5', x: 2, y: 2 },
          shape: 'dot',
        },
      ]
    );
    const root = renderDom(doc);
    expect(parts(root, '道', 'emphasis')).toHaveLength(1);
    expect(parts(root, '而', 'okimoji')).toHaveLength(1);
    expect(parts(root, '之', 'joji')).toHaveLength(1);
    expect(parts(root, '國', 'hasOkototen')).toHaveLength(1);
    expect(parts(root, '國', 'okototen')).toHaveLength(1);
    expect(parts(root, '而', 'emphasis')).toEqual([]);
    expect(count(root, 'okimoji')).toBe(1);
  });
});

describe('tateten group', () => {
  it('kaeri on the separator belongs to every unit of the group', () => {
    const doc = createDoc(
      ['所', '以', '然'],
      [
        { type: 'tateten', anchor: span('t1', 't2') },
        { type: 'kaeri', position: after('t1'), value: '㆓' },
      ]
    );
    const root = renderDom(doc);
    expect(partText(root, '所', 'kaeri')).toBe('㆓');
    expect(partText(root, '以', 'kaeri')).toBe('㆓');
    expect(partText(root, '然', 'kaeri')).toBeNull();
  });

  const groupMarks: Mark[] = [
    { type: 'tateten', anchor: span('t1', 't2') },
    { type: 'yomigana', anchor: span('t1', 't2'), value: 'ゆゑん' },
    { type: 'okurigana', anchor: span('t1', 't2'), value: 'ニ' },
    { type: 'yomigana', anchor: span('t3', 't3'), value: 'あ' },
  ];
  for (const { label, options } of [RENDER_VARIANTS[0]!, RENDER_VARIANTS[2]!]) {
    it(`group reading and okurigana reach the units of the group, not the next unit (${label})`, () => {
      const root = renderDom(createDoc(['所', '以', '然'], groupMarks), options);
      expect(partText(root, '所', 'ruby')).toBe('ゆゑん');
      expect(partText(root, '以', 'ruby')).toBe('ゆゑん');
      expect(partText(root, '所', 'okuri')).toBe('ニ');
      expect(partText(root, '然', 'ruby')).toBe('あ');
      expect(partText(root, '然', 'okuri')).toBeNull();
    });
  }
});

describe('saidoku', () => {
  for (const { label, options } of [RENDER_VARIANTS[0]!, RENDER_VARIANTS[2]!]) {
    it(`reads the first form and finds the under slot (${label})`, () => {
      const doc = createDoc(
        ['未', '之'],
        [
          {
            type: 'saidoku',
            anchor: span('t1', 't1'),
            forms: [
              { n: 1, yomi: 'いま', okuri: 'ダ' },
              { n: 2, okuri: 'ず' },
            ],
          },
        ]
      );
      const root = renderDom(doc, options);
      expect(partText(root, '未', 'ruby')).toBe('いま');
      expect(parts(root, '未', 'saidokuUnder')).toHaveLength(1);
      expect(partText(root, '未', 'saidokuOkuri2')).toBe('ず');
      expect(parts(root, '之', 'saidokuUnder')).toEqual([]);
    });
  }
});

describe('ref', () => {
  it('a highlight label is the label of every unit inside the highlight', () => {
    const doc = createDoc(
      ['學', '而', '時'],
      [
        { type: 'highlight', id: 'h1', anchor: span('t1', 't2'), style: 'solid', ref: 'r1' },
        { type: 'ref', id: 'r1', position: after('t2'), format: 'alpha-upper' },
      ]
    );
    const root = renderDom(doc);
    expect(partText(root, '學', 'ref')).toBe('(A)');
    expect(partText(root, '而', 'ref')).toBe('(A)');
    expect(partText(root, '時', 'ref')).toBeNull();
  });

  it('a char ref (sup) belongs to the unit that follows it, not to the neighbour', () => {
    const doc = createDoc(
      ['學', '而'],
      [{ type: 'ref', position: after('t1'), format: 'alpha-upper' }]
    );
    const root = renderDom(doc);
    expect(partText(root, '學', 'ref')).toBe('(A)');
    expect(partText(root, '而', 'ref')).toBeNull();
  });

  it('two adjacent units each read their own ref', () => {
    const doc = createDoc(
      ['學', '而'],
      [
        { type: 'ref', position: after('t1'), format: 'alpha-upper' },
        { type: 'ref', position: after('t2'), format: 'alpha-upper' },
      ]
    );
    const root = renderDom(doc);
    expect(partText(root, '學', 'ref')).toBe('(A)');
    expect(partText(root, '而', 'ref')).toBe('(B)');
  });

  it('inside a highlight a unit reads its own char ref, not the highlight label', () => {
    const doc = createDoc(
      ['學', '而', '時'],
      [
        { type: 'highlight', id: 'h1', anchor: span('t1', 't3'), style: 'solid', ref: 'r1' },
        { type: 'ref', id: 'r1', position: after('t3'), format: 'alpha-upper' },
        { type: 'ref', position: after('t1'), format: 'numeric-circled' },
        { type: 'ref', position: after('t2'), format: 'numeric-circled' },
      ]
    );
    const root = renderDom(doc);
    expect(partText(root, '學', 'ref')).toBe('①');
    expect(partText(root, '而', 'ref')).toBe('②');
    expect(partText(root, '時', 'ref')).toBe('(A)');
    expect(parts(root, '學', 'ref')).toHaveLength(1);
  });
});

describe('okurigana outside a highlight', () => {
  for (const { label, options } of [RENDER_VARIANTS[0]!, RENDER_VARIANTS[2]!]) {
    it(`a tateten group at the end of a highlight reaches the okurigana outside it (${label})`, () => {
      const doc = createDoc(
        ['A', '所', '以'],
        [
          { type: 'highlight', anchor: span('t1', 't3'), style: 'solid' },
          { type: 'tateten', anchor: span('t2', 't3') },
          { type: 'yomigana', anchor: span('t2', 't3'), value: 'ゆゑん' },
          { type: 'okurigana', anchor: span('t2', 't3'), value: 'ニ' },
        ]
      );
      const root = renderDom(doc, options);
      expect(partText(root, '所', 'okuri')).toBe('ニ');
      expect(partText(root, '以', 'okuri')).toBe('ニ');
    });
  }
});

describe('carriers that are not on the path', () => {
  it('a unit in a highlight does not read the part of its neighbour in the same highlight', () => {
    const doc = createDoc(
      ['學', '而', '時'],
      [
        { type: 'highlight', anchor: span('t1', 't3'), style: 'solid' },
        { type: 'yomigana', anchor: span('t1', 't1'), value: 'まな' },
        { type: 'okurigana', anchor: span('t1', 't1'), value: 'ビテ' },
      ]
    );
    const root = renderDom(doc);
    expect(partText(root, '學', 'ruby')).toBe('まな');
    for (const base of ['而', '時']) {
      expect(partText(root, base, 'ruby')).toBeNull();
      expect(partText(root, base, 'okuri')).toBeNull();
    }
  });

  it('a unit in a tateten group does not read the part of its neighbour in the same group', () => {
    const doc = createDoc(
      ['所', '以'],
      [
        { type: 'tateten', anchor: span('t1', 't2') },
        { type: 'okurigana', anchor: span('t1', 't1'), value: 'ニ' },
      ]
    );
    const root = renderDom(doc);
    expect(partText(root, '所', 'okuri')).toBe('ニ');
    expect(partText(root, '以', 'okuri')).toBeNull();
  });
});

describe('lookup', () => {
  it('nth picks the nth unit with the same text in document order', () => {
    const doc = createDoc(
      ['不', '可', '不'],
      [{ type: 'okurigana', anchor: span('t3', 't3'), value: 'ズ' }]
    );
    const root = renderDom(doc);
    expect(partText(root, '不', 'okuri', 0)).toBeNull();
    expect(partText(root, '不', 'okuri', 1)).toBe('ズ');
    expect(unit(root, '不', 1)).not.toBe(unit(root, '不', 0));
    expect(() => unit(root, '不', 2)).toThrow();
  });

  it('throws with the wanted text and the texts it found', () => {
    const root = renderDom(createDoc(['學', '而']));
    expect(() => unit(root, '時')).toThrow(/時.*學.*而/);
  });

  it('attr and count read the elements', () => {
    const doc = createDoc(
      ['重', '要'],
      [{ type: 'highlight', anchor: span('t1', 't2'), style: 'wavy' }]
    );
    const root = renderDom(doc);
    const highlight = closestPart(root, '重', 'highlight')!;
    expect(highlight).toBe(closestPart(root, '要', 'highlight'));
    expect(attr(highlight, 'data-style')).toBe('wavy');
    expect(all(root, 'highlight')).toEqual([highlight]);
    expect(closestPart(root, '重', 'tatetenGroup')).toBeNull();
    expect(attr(highlight, 'data-missing')).toBeNull();
    expect(count(root, 'highlight')).toBe(1);
    expect(count(root, 'ruby')).toBe(0);
  });

  it('works with another classPrefix and fails with the wrong one', () => {
    const doc = createDoc(
      ['學', '而'],
      [{ type: 'yomigana', anchor: span('t1', 't1'), value: 'まな' }]
    );
    const options: RenderOptions = { classPrefix: 'x' };
    const root = renderDom(doc, options);
    expect(partText(root, '學', 'ruby', 0, 'x')).toBe('まな');
    expect(() => unit(root, '學', 0, 'skam')).toThrow();
    // render と同じ html であること (renderDom は html を加工しない)
    expect(root.outerHTML).toBe(render(doc, options).html);
  });

  it('renderDom does not add interactive on its own', () => {
    const root = renderDom(createDoc(['學']));
    expect(root.querySelector('[data-token-id]')).toBeNull();
  });
});

describe('part table', () => {
  it('maps every AIR slot to parts that have selectors', () => {
    for (const names of Object.values(SLOT_PARTS)) {
      for (const name of names) {
        expect(PART_SELECTORS[name]).toBeTypeOf('function');
      }
    }
  });
});
