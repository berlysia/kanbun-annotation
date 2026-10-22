import { describe, it, expect } from 'vitest';
import type { Mark, SKAMDocument } from '@kanbun-skam/skam';
import { buildAnnotationIR, RENDER_PROFILES } from '@kanbun-skam/skam/rendering';
import type { AIRBlockChild } from '@kanbun-skam/skam/rendering';
import { render, type RenderOptions } from '../index.js';
import { expectCSSContains } from './helpers/css-contract.js';

/**
 * 重なる範囲 (ruby・竪点・傍線の部分交差) の html の描画。
 * 字は DOM に 1 回だけ現れ、各注記は自分の字の要素に付き、断片の印は AIR と一致する。
 */

const TEXTS = ['子', '曰', '學', '而', '時', '習'] as const;

function docOf(count: number, marks: Mark[], texts: readonly string[] = TEXTS): SKAMDocument {
  const ids = Array.from({ length: count }, (_, i) => `t${i + 1}`);
  return {
    format: 'skam@0.1',
    tokens: ids.map((id, i) => ({ id, text: texts[i]! })),
    blocks: [{ id: 'b1', tokenIds: ids }],
    marks,
    readings: [],
  };
}

const range = (from: number, to = from) => ({ from: `t${from}`, to: `t${to}` });
const after = (n: number) => ({ blockId: 'b1', after: `t${n}` });
const yomi = (from: number, to: number, value = 'あ'): Mark => ({
  type: 'yomigana',
  anchor: range(from, to),
  value,
});
const tateten = (from: number, to: number): Mark => ({ type: 'tateten', anchor: range(from, to) });
const highlight = (from: number, to: number, ref?: string): Mark => ({
  type: 'highlight',
  anchor: range(from, to),
  ...(ref ? { ref } : {}),
});

const VARIANTS: { label: string; options: RenderOptions }[] = [
  { label: 'grid', options: {} },
  { label: 'ruby', options: { rubyMethod: 'ruby' } },
  { label: 'grid + interactive', options: { interactive: true } },
  { label: 'ruby + interactive', options: { rubyMethod: 'ruby', interactive: true } },
];

function dom(doc: SKAMDocument, options: RenderOptions = {}): HTMLElement {
  const template = document.createElement('template');
  template.innerHTML = render(doc, options).html;
  const root = template.content.firstElementChild;
  if (!(root instanceof HTMLElement)) throw new Error('no root element');
  return root;
}

/** 字の単位が持つ本文の字 (字ごとの要素があればそれをつなぐ。範囲の読みの単位は範囲の字の全体) */
function charsOfUnit(unit: Element): string {
  const segs = [...unit.querySelectorAll('.skam-base-seg')];
  if (segs.length > 0) return segs.map((el) => el.textContent ?? '').join('');
  return unit.querySelector('.skam-base')?.textContent ?? '';
}

/** 文書の順に並べた字の単位 */
function units(root: Element): Element[] {
  return [...root.querySelectorAll('.skam-token')];
}

/** DOM の字を文書の順につないだもの。どの字も 1 回だけ現れるなら、原文と一致する */
function drawnChars(root: Element): string {
  return units(root).map(charsOfUnit).join('');
}

function unitOfChar(root: Element, ch: string): Element {
  const found = units(root).find((unit) => charsOfUnit(unit).includes(ch));
  if (!found) throw new Error(`no unit for ${ch}`);
  return found;
}

function fragmentFlags(root: Element, selector: string): { before: boolean; after: boolean }[] {
  return [...root.querySelectorAll(selector)].map((el) => ({
    before: el.hasAttribute('data-continues-before'),
    after: el.hasAttribute('data-continues-after'),
  }));
}

/** AIR の竪点・傍線の断片の印を文書順 (先行順) に並べる */
function airFlags(
  doc: SKAMDocument,
  type: 'tateten-group' | 'highlight-group'
): { before: boolean; after: boolean }[] {
  const out: { before: boolean; after: boolean }[] = [];
  const walk = (children: readonly AIRBlockChild[]): void => {
    for (const child of children) {
      if (child.type === 'tateten-separator' || child.type === 'token') continue;
      if (child.type === type) {
        out.push({
          before: child.continuesBefore === true,
          after: child.continuesAfter === true,
        });
      }
      walk(child.children);
    }
  };
  for (const block of buildAnnotationIR(doc, RENDER_PROFILES.full).blocks) walk(block.children);
  return out;
}

describe('html: overlapping ranges', () => {
  describe('ruby of a range reading', () => {
    it('ruby method: the rb has one base-seg per character', () => {
      const root = dom(docOf(3, [yomi(1, 2, 'し')]), { rubyMethod: 'ruby' });
      const segs = [...root.querySelectorAll('rb.skam-base > .skam-base-seg')];
      expect(segs.map((el) => el.textContent)).toEqual(['子', '曰']);
      expect(drawnChars(root)).toBe('子曰學');
    });

    it('grid method: the base has one base-seg per character', () => {
      const root = dom(docOf(3, [yomi(1, 2, 'し')]));
      const segs = [...root.querySelectorAll('.skam-ruby-grid > .skam-base > .skam-base-seg')];
      expect(segs.map((el) => el.textContent)).toEqual(['子', '曰']);
    });
  });

  describe('highlight t1-t3 and ruby t2-t4', () => {
    const doc = docOf(5, [highlight(1, 3, 'r1'), yomi(2, 4, 'よみ'), refMark()]);
    function refMark(): Mark {
      return {
        id: 'r1',
        type: 'ref',
        label: 'L',
        content: '注',
        position: after(3),
      };
    }

    for (const { label, options } of VARIANTS) {
      it(`has two highlight fragments, the label on the last one (${label})`, () => {
        const root = dom(doc, options);
        const fragments = [...root.querySelectorAll('.skam-highlight')];
        expect(fragments).toHaveLength(2);
        expect(fragmentFlags(root, '.skam-highlight')).toEqual([
          { before: false, after: true },
          { before: true, after: false },
        ]);
        expect(fragmentFlags(root, '.skam-highlight')).toEqual(airFlags(doc, 'highlight-group'));
        // ref のラベル (傍線の始まりに置く span) は、AIR の refLabel がある最後の断片だけ
        const labelled = fragments.map((el) => el.querySelector(':scope > * > .skam-ref') !== null);
        expect(labelled).toEqual([false, true]);
        expect(fragments.map((el) => el.hasAttribute('data-has-ref'))).toEqual([false, true]);
      });

      it(`draws every character once, in order (${label})`, () => {
        const root = dom(doc, options);
        expect(drawnChars(root)).toBe('子曰學而時');
        expect(root.querySelectorAll('.skam-ruby')).toHaveLength(1);
        expect(root.querySelector('.skam-ruby')?.textContent).toBe('よみ');
      });
    }
  });

  describe('tateten t1-t4 and ruby t2-t3', () => {
    const doc = docOf(5, [tateten(1, 4), yomi(2, 3, 'よみ')]);
    for (const { label, options } of VARIANTS) {
      it(`puts the ruby inside the tateten group, with every separator (${label})`, () => {
        const root = dom(doc, options);
        expect(root.querySelectorAll('.skam-tateten-sep')).toHaveLength(3);
        expect(root.querySelectorAll('.skam-tateten-group')).toHaveLength(1);
        const ruby = root.querySelector('.skam-tateten-group .skam-ruby, .skam-tateten-group rt');
        expect(ruby?.textContent).toBe('よみ');
        expect(drawnChars(root)).toBe('子曰學而時');
        expect(fragmentFlags(root, '.skam-tateten-group')).toEqual(airFlags(doc, 'tateten-group'));
      });
    }
  });

  describe('annotations belong to their own character', () => {
    const doc = docOf(5, [
      tateten(1, 4),
      yomi(2, 3, 'よみ'),
      { type: 'kutoten', kind: 'ku', value: '。', position: after(2) },
      { type: 'kaeri', value: '㆑', position: after(2) },
      { type: 'okimoji', anchor: range(2) },
      { type: 'emphasis', anchor: range(3), style: 'dot' },
    ]);
    for (const { label, options } of VARIANTS) {
      it(`kutoten, kaeri, okimoji and emphasis stay on the character (${label})`, () => {
        const root = dom(doc, options);
        const second = unitOfChar(root, '曰');
        const third = unitOfChar(root, '學');
        const fourth = unitOfChar(root, '而');
        expect(second.querySelector('.skam-suffix-kutoten')?.textContent).toBe('。');
        expect(second.classList.contains('skam-okimoji')).toBe(true);
        expect(second.querySelector('.skam-kaeriten')?.textContent).toBe('㆑');
        expect(third.querySelector('.skam-kaeriten')).toBeNull();
        expect(
          third.classList.contains('skam-emphasis') ||
            third.querySelector('.skam-emphasis-row') !== null
        ).toBe(true);
        expect(fourth.querySelector('.skam-suffix-kutoten')).toBeNull();
        expect(fourth.querySelector('.skam-kaeriten')).toBeNull();
        expect(fourth.classList.contains('skam-okimoji')).toBe(false);
        expect(drawnChars(root)).toBe('子曰學而時');
      });
    }
  });

  describe('readings that overlap (READING_OVERLAP)', () => {
    it('draws the first and the third reading, every character once', () => {
      const doc = docOf(4, [yomi(1, 2, 'A'), yomi(2, 3, 'B'), yomi(3, 4, 'C')]);
      for (const { options } of VARIANTS) {
        const root = dom(doc, options);
        const readings = [...root.querySelectorAll('.skam-ruby')].map((el) => el.textContent);
        expect(readings).toEqual(['A', 'C']);
        expect(drawnChars(root)).toBe('子曰學而');
      }
    });
  });

  describe('input that the validator does not accept', () => {
    const inputs: { name: string; doc: SKAMDocument }[] = [
      { name: 'reversed range', doc: docOf(4, [yomi(3, 1), tateten(4, 2), highlight(3, 1)]) },
      {
        name: 'range to a token that does not exist',
        doc: docOf(3, [
          { type: 'yomigana', anchor: { from: 't1', to: 'missing' }, value: 'あ' },
          { type: 'highlight', anchor: { from: 'missing', to: 't3' } },
          { type: 'tateten', anchor: { from: 't2', to: 'missing' } },
        ]),
      },
      {
        name: 'range across blocks',
        doc: {
          format: 'skam@0.1',
          tokens: [
            { id: 't1', text: '子' },
            { id: 't2', text: '曰' },
            { id: 't3', text: '學' },
          ],
          blocks: [
            { id: 'b1', tokenIds: ['t1', 't2'] },
            { id: 'b2', tokenIds: ['t3'] },
          ],
          marks: [yomi(2, 3), highlight(1, 3), tateten(2, 3)],
          readings: [],
        },
      },
      {
        name: 'many equal highlights',
        doc: docOf(
          3,
          Array.from({ length: 200 }, () => highlight(1, 3)),
          TEXTS
        ),
      },
    ];
    for (const { name, doc } of inputs) {
      for (const { label, options } of VARIANTS) {
        it(`${name} does not throw and draws each character once (${label})`, () => {
          let root: HTMLElement | undefined;
          expect(() => {
            root = dom(doc, options);
          }).not.toThrow();
          const expected = doc.tokens.map((t) => t.text).join('');
          expect(drawnChars(root!)).toBe(expected);
        });
      }
    }
  });

  describe('a document without overlaps keeps its DOM', () => {
    it('range reading + tateten of the same range: ruby outside, tateten group inside (grid)', () => {
      const root = dom(docOf(3, [tateten(1, 2), yomi(1, 2, 'よみ')]));
      const grid = root.querySelector('.skam-ruby-grid');
      expect(grid?.querySelector(':scope > .skam-tateten-group')).not.toBeNull();
      expect(grid?.querySelectorAll('.skam-token')).toHaveLength(2);
      expect(root.querySelector('.skam-tateten-group')?.hasAttribute('data-continues-after')).toBe(
        false
      );
    });

    it('a saidoku with one form keeps its class and its reading order', () => {
      const root = dom(
        docOf(1, [
          {
            type: 'saidoku',
            anchor: range(1),
            forms: [{ n: 2, yomi: 'まさ', okuri: 'に' }],
          },
        ])
      );
      const unit = root.querySelector('.skam-token');
      expect(unit?.classList.contains('skam-saidoku')).toBe(true);
      expect(unit?.querySelector('.skam-ruby')?.getAttribute('data-saidoku-n')).toBe('2');
    });

    it('no fragment marks when nothing overlaps', () => {
      const root = dom(docOf(3, [highlight(1, 2), tateten(1, 2), yomi(1, 2)]));
      expect(root.innerHTML).not.toContain('data-continues');
    });
  });
});

describe('不可分単位の折り返し (<wbr>)', () => {
  /** 本文の字を DOM の順に並べ、<wbr> の位置を | で示す */
  const flow = (doc: SKAMDocument, options: RenderOptions): string => {
    const root = dom(doc, options);
    const parts: string[] = [];
    for (const element of root.querySelectorAll(
      'wbr, .skam-base-seg, .skam-base:not(:has(.skam-base-seg))'
    )) {
      parts.push(element.tagName === 'WBR' ? '|' : (element.textContent ?? ''));
    }
    return parts.join('');
  };

  for (const options of [{}, { rubyMethod: 'ruby' } as RenderOptions]) {
    const label = options.rubyMethod ?? 'grid';

    it(`範囲の送り仮名・添え仮名の字の間には <wbr> が入らない (${label})`, () => {
      const okuri: Mark = { type: 'okurigana', anchor: range(1, 2), value: 'ト' };
      const soe: Mark = { type: 'soegana', anchor: range(4, 5), value: 'ヲ' };
      expect(flow(docOf(5, [okuri, soe]), options)).toBe('子曰|學|而時');
    });

    it(`竪点の断片の境目 (ruby t1-t3 と竪点 t2-t4 の t3|t4) と区切りの前後には <wbr> が入らない (${label})`, () => {
      expect(flow(docOf(5, [yomi(1, 3), tateten(2, 4)]), options)).toBe('子曰學而|時');
    });
  }
});

describe('同じ位置の注記は 1 つずつ別の要素に描く', () => {
  const refAfter = (n: number, content: string): Mark => ({
    type: 'ref',
    position: after(n),
    format: 'numeric-paren',
    content,
  });
  const kutotenAfter = (n: number, value: string): Mark => ({
    type: 'kutoten',
    position: after(n),
    value,
  });

  for (const options of [{}, { rubyMethod: 'ruby' } as RenderOptions]) {
    const label = options.rubyMethod ?? 'grid';

    it(`同じ字の後ろの ref 2 つは、上付き文字を 2 つ出す (${label})`, () => {
      const root = dom(docOf(2, [refAfter(1, 'A'), refAfter(1, 'B')]), options);
      const refs = [...root.querySelectorAll('sup.skam-ref')];
      expect(refs.map((el) => el.textContent)).toEqual(['(1)', '(2)']);
    });

    it(`同じ字の後ろの句読点 2 つは、句読点の要素を 2 つ出す (${label})`, () => {
      const root = dom(docOf(2, [kutotenAfter(2, '：'), kutotenAfter(2, '。')]), options);
      const kutoten = [...root.querySelectorAll('.skam-suffix-row > .skam-suffix-kutoten')];
      expect(kutoten.map((el) => el.textContent)).toEqual(['：', '。']);
    });
  }
});

describe('html: highlights that share a character (lane)', () => {
  const lanesOf = (doc: SKAMDocument, options: RenderOptions = {}) =>
    [...dom(doc, options).querySelectorAll('.skam-highlight')].map((el) => ({
      lane: el.getAttribute('data-lane'),
      style: el.getAttribute('style'),
    }));

  for (const { label, options } of VARIANTS) {
    it(`puts data-lane and the CSS variable on the inner highlight only (${label})`, () => {
      expect(lanesOf(docOf(5, [highlight(1, 5), highlight(3, 5)]), options)).toEqual([
        { lane: null, style: null },
        { lane: '1', style: '--skam-highlight-lane: 1' },
      ]);
    });

    it(`gives every fragment of one highlight the same lane (${label})`, () => {
      const lanes = lanesOf(docOf(6, [highlight(1, 4), highlight(3, 6), yomi(2, 5)]), options);
      expect(lanes.filter((l) => l.lane === '1').length).toBeGreaterThanOrEqual(1);
      expect(lanes.every((l) => l.lane === null || l.lane === '1')).toBe(true);
    });

    it(`adds no lane markup when highlights do not overlap (${label})`, () => {
      const root = dom(docOf(6, [highlight(1, 2), highlight(4, 6)]), options);
      expect(root.querySelector('[data-lane]')).toBeNull();
      expect(root.innerHTML).not.toContain('--skam-highlight-lane');
    });
  }

  it('shifts the line by lane x pitch in both writing modes', () => {
    for (const writingMode of ['vertical', 'horizontal'] as const) {
      const { css } = render(docOf(3, [highlight(1, 3), highlight(2, 3)]), { writingMode });
      expectCSSContains(css, 'var(--skam-highlight-lane, 0) * (4px + 0.1em)');
    }
  });
});
