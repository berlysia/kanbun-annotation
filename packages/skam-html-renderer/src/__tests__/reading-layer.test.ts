import { describe, it, expect } from 'vitest';
import { render } from '../index.js';
import type { SKAMDocument } from '@kanbun-skam/skam';

const base = (over: Partial<SKAMDocument> = {}): SKAMDocument => ({
  format: 'skam@0.1',
  tokens: [
    { id: 't2', text: '乙' },
    { id: 't1', text: '甲' },
  ],
  blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
  marks: [],
  readings: [],
  ...over,
});
const dom = (html: string) =>
  new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;

describe('reading layer fallback and lang (K5)', () => {
  it('falls back to plain base text in block order when there is no reading', () => {
    expect(dom(render(base()).html).querySelector('.skam-reading')?.textContent).toBe('甲乙');
  });
  it('prefers yomiage over kakikudashi', () => {
    const r = dom(
      render(
        base({
          readings: [
            { kind: 'kakikudashi', text: 'K' },
            { kind: 'yomiage', text: 'Y' },
          ],
        })
      ).html
    );
    expect(r.querySelector('.skam-reading')?.textContent).toBe('Y');
  });
  it('has no aria-label on the reading layer', () => {
    expect(
      dom(render(base()).html).querySelector('.skam-reading')?.hasAttribute('aria-label')
    ).toBe(false);
  });
  it('keeps root lang=ja, display layer aria-hidden, and puts displayLang only on the display layer', () => {
    const d = dom(render(base(), { displayLang: 'lzh' }).html);
    expect(d.querySelector('.skam-document')?.getAttribute('lang')).toBe('ja');
    expect(d.querySelector('.skam-display')?.getAttribute('lang')).toBe('lzh');
    expect(d.querySelector('.skam-display')?.getAttribute('aria-hidden')).toBe('true');
    expect(d.querySelector('.skam-reading')?.hasAttribute('lang')).toBe(false);
  });
  it('omits the reading layer when includeReadingLayer is false', () => {
    expect(
      dom(render(base(), { includeReadingLayer: false }).html).querySelector('.skam-reading')
    ).toBeNull();
  });
  it('falls back to tokens array order when blocks are empty', () => {
    expect(dom(render(base({ blocks: [] })).html).querySelector('.skam-reading')?.textContent).toBe(
      '乙甲'
    );
  });
  it('skips unknown token ids without throwing', () => {
    const d = base({ blocks: [{ id: 'b1', tokenIds: ['t1', 'missing', 't2'] }] });
    expect(dom(render(d).html).querySelector('.skam-reading')?.textContent).toBe('甲乙');
  });
  it('omits the reading layer (no throw) when blocks reference no existing token, matching the display layer', () => {
    // 表示層も AIR (groupTokensByBlock) で同じ token を落とすので、読み層だけ別の内容を出すことはしない
    const d = base({ blocks: [{ id: 'b1', tokenIds: ['missing'] }] });
    expect(dom(render(d).html).querySelector('.skam-reading')).toBeNull();
  });
  it.each(['', '  '])('skips an empty or blank yomiage (%j) and uses kakikudashi', (text) => {
    const r = dom(
      render(
        base({
          readings: [
            { kind: 'yomiage', text },
            { kind: 'kakikudashi', text: 'K' },
          ],
        })
      ).html
    );
    expect(r.querySelector('.skam-reading')?.textContent).toBe('K');
  });
  it('numbers refs in source order even when tokens array is reversed (K6)', () => {
    const d = base({
      marks: [
        { type: 'ref', format: 'numeric-paren', position: { blockId: 'b1', after: 't2' } },
        { type: 'ref', format: 'numeric-paren', position: { blockId: 'b1', after: 't1' } },
      ],
    });
    const html = render(d).html;
    const labels = Array.from(dom(html).querySelectorAll('.skam-display .skam-ref')).map(
      (e) => e.textContent
    );
    expect(labels).toEqual(['(1)', '(2)']);
  });
});
