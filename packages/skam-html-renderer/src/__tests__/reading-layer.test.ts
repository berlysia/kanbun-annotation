import { describe, it, expect } from 'vitest';
import { render, renderHTML } from '../index.js';
import { formatReadingText, renderReadingLayerElement } from '../reading-text.js';
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
const reading = (html: string) => dom(html).querySelector('.skam-reading');
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

// ============================================================================
// readingLayerSource: 'display' (K3, experimental)
// ============================================================================

describe("readingLayerSource: 'display'", () => {
  const gakuji = (over: Partial<SKAMDocument> = {}): SKAMDocument => ({
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '學' },
      { id: 't2', text: '而' },
      { id: 't3', text: '時' },
      { id: 't4', text: '習' },
      { id: 't5', text: '之' },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4', 't5'] }],
    marks: [
      { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ビテ' },
      { type: 'okimoji', anchor: { from: 't2', to: 't2' } },
      { type: 'okurigana', anchor: { from: 't3', to: 't3' }, value: 'ニ' },
      { type: 'okurigana', anchor: { from: 't4', to: 't4' }, value: 'フ' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't4' }, value: '㆑' },
      { type: 'okurigana', anchor: { from: 't5', to: 't5' }, value: 'ヲ' },
    ],
    readings: [{ kind: 'kakikudashi', text: '學びて時に之を習ふ' }],
    ...over,
  });
  const learningBasic = { base: 'learningBasic' } as const;

  it('learningBasic の読み上げ層は、見えている注記だけを言葉にする', () => {
    const html = render(gakuji(), { profile: learningBasic, readingLayerSource: 'display' }).html;
    expect(reading(html)?.textContent).toBe('學。而、置き字。時。習、レ点。之。');
    expect(html).not.toContain('學びて');
    expect(html).not.toContain('ビテ');
  });

  it("既定 ('readings') は現挙動のまま、読み下しを読み上げる", () => {
    const html = render(gakuji(), { profile: learningBasic }).html;
    expect(reading(html)?.textContent).toBe('學びて時に之を習ふ');
  });

  it('full の読み上げ層は送り仮名も言葉にする', () => {
    const html = render(gakuji(), { readingLayerSource: 'display' }).html;
    expect(reading(html)?.textContent).toBe(
      '學、送り仮名 ビテ。而、置き字。時、送り仮名 ニ。習、送り仮名 フ、レ点。之、送り仮名 ヲ。'
    );
  });

  it('copyable: all / interactive でも、隠した送り仮名は HTML のどこにも現れない', () => {
    const html = render(gakuji(), {
      profile: learningBasic,
      readingLayerSource: 'display',
      copyable: 'all',
      interactive: true,
    }).html;
    expect(html).not.toContain('ビテ');
    expect(html).not.toContain('學びて');
  });

  it('readings の無い文書でも白文に落ちない (すべての label が空)', () => {
    const empty = Object.fromEntries(
      [
        'yomigana',
        'okurigana',
        'soegana',
        'saidoku',
        'kaeri',
        'kutoten',
        'okimoji',
        'joji',
        'emphasis',
        'okototen',
        'ref',
        'tateten',
        'highlightStart',
        'highlightEnd',
      ].map((k) => [k, () => ''])
    );
    const html = render(gakuji({ readings: [] }), {
      profile: learningBasic,
      readingLayerSource: 'display',
      accessibleLabels: empty,
    }).html;
    expect(reading(html)?.textContent).toBe('學。而。時。習。之。');
    expect(reading(html)?.textContent).not.toBe('學而時習之');
  });

  it('readings に読み下しを持つ文書でも、読み下しは HTML に現れない (すべての label が空)', () => {
    const html = render(gakuji(), {
      profile: learningBasic,
      readingLayerSource: 'display',
      accessibleLabels: { kaeri: () => '', okimoji: () => '' },
    }).html;
    expect(reading(html)?.textContent).toBe('學。而。時。習。之。');
    expect(html).not.toContain('學びて');
  });

  it('includeReadingLayer: false なら読み上げ層を出さない', () => {
    const html = render(gakuji(), {
      readingLayerSource: 'display',
      includeReadingLayer: false,
    }).html;
    expect(reading(html)).toBeNull();
  });

  it('本文の & は 1 回だけエスケープされる', () => {
    const doc = gakuji({
      tokens: [{ id: 't1', text: 'A&B"\'' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [],
    });
    const html = render(doc, { readingLayerSource: 'display' }).html;
    const readingHtml = /<div class="skam-reading">(.*?)<\/div>/.exec(html)?.[1];
    expect(readingHtml).toBe('A&amp;B&quot;&#x27;。');
    expect(html).not.toContain('&amp;amp;');
    expect(reading(html)?.textContent).toBe('A&B"\'。');
  });

  it('本文に < を含む token は &lt; にエスケープされる', () => {
    const doc = gakuji({
      tokens: [{ id: 't1', text: '<b>' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [],
    });
    const html = render(doc, { readingLayerSource: 'display' }).html;
    const readingHtml = /<div class="skam-reading">(.*?)<\/div>/.exec(html)?.[1];
    expect(readingHtml).toBe('&lt;b&gt;。');
  });

  it('label が HTML を返しても、エスケープされる', () => {
    const html = render(gakuji(), {
      profile: learningBasic,
      readingLayerSource: 'display',
      accessibleLabels: { kaeri: () => '<img src=x onerror=1>' },
    }).html;
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
  });

  it('label の例外は render を止めず、その注記だけが出ない', () => {
    const html = render(gakuji(), {
      profile: learningBasic,
      readingLayerSource: 'display',
      accessibleLabels: {
        kaeri: () => {
          throw new Error('x');
        },
      },
    }).html;
    expect(reading(html)?.textContent).toBe('學。而、置き字。時。習。之。');
  });

  it('renderHTML でも同じ', () => {
    const html = renderHTML(gakuji(), { profile: learningBasic, readingLayerSource: 'display' });
    expect(reading(html)?.textContent).toBe('學。而、置き字。時。習、レ点。之。');
  });

  it('返り点の記号 (U+3191〜U+319F) は読み上げ層に入らない', () => {
    const html = render(gakuji(), { readingLayerSource: 'display' }).html;
    expect(reading(html)?.textContent).not.toMatch(/[㆑-㆟]/);
  });

  it('inline のときは span で出す', () => {
    const html = render(gakuji(), { readingLayerSource: 'display', inline: true }).html;
    expect(html).toContain('<span class="skam-reading">');
  });
});

describe('readingLayerElement', () => {
  it('空の文字列は要素を出さない', () => {
    expect(renderReadingLayerElement('', 'skam', false)).toBe('');
  });

  it('空の blocks の AIR から作った文字列は空で、要素を出さない', () => {
    const text = formatReadingText({ blocks: [] }, undefined);
    expect(text).toBe('');
    expect(renderReadingLayerElement(text, 'skam', false)).toBe('');
  });

  it('文字列は escapeHtml を 1 回通す', () => {
    expect(renderReadingLayerElement('a<b', 'p', false)).toBe(
      '<div class="p-reading">a&lt;b</div>'
    );
  });
});

describe('accessibleLabels の正規化', () => {
  const doc = base();

  it('getter は render 1 回につき 1 回だけ読まれる', () => {
    let reads = 0;
    const labels = {
      get kaeri() {
        reads++;
        return () => 'K';
      },
    };
    render(doc, { readingLayerSource: 'display', accessibleLabels: labels });
    expect(reads).toBe(1);
  });

  it('正規化は呼び出しごとで、差し替えた関数が次の render で使われる', () => {
    const labels: { kaeri: () => string } = { kaeri: () => 'A' };
    const withKaeri = base({
      marks: [{ type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆑' }],
    });
    const first = render(withKaeri, { readingLayerSource: 'display', accessibleLabels: labels });
    labels.kaeri = () => 'B';
    const second = render(withKaeri, { readingLayerSource: 'display', accessibleLabels: labels });
    expect(reading(first.html)?.textContent).toBe('甲、A。乙。');
    expect(reading(second.html)?.textContent).toBe('甲、B。乙。');
  });

  it('render の途中で getter が別の関数を返しても、検査した関数を使う', () => {
    let calls = 0;
    const labels = {
      get kaeri() {
        calls++;
        return calls === 1 ? () => 'FIRST' : () => 'SECOND';
      },
    };
    const withKaeri = base({
      marks: [{ type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆑' }],
    });
    const html = render(withKaeri, {
      readingLayerSource: 'display',
      accessibleLabels: labels,
    }).html;
    expect(reading(html)?.textContent).toBe('甲、FIRST。乙。');
  });
});
