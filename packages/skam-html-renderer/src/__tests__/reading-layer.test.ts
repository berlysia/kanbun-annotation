import { describe, it, expect } from 'vitest';
import { render, renderHTML, generateCSS } from '../index.js';
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

describe('reading layer hiding rule', () => {
  const declarationsOf = (css: string, prefix: string): string[] => {
    const match = css.match(new RegExp(`:where\\(\\.${prefix}-reading\\)\\s*\\{([^}]*)\\}`));
    expect(match).not.toBeNull();
    return match![1]!
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(';')
      .map((d) => d.trim())
      .filter((d) => d !== '');
  };

  it.each([
    ['skam', undefined],
    ['x', 'x'],
  ])('puts !important on every declaration (prefix %s)', (prefix, classPrefix) => {
    const declarations = declarationsOf(
      generateCSS(classPrefix === undefined ? {} : { classPrefix }),
      prefix
    );
    expect(declarations.length).toBeGreaterThan(0);
    for (const declaration of declarations) {
      expect(declaration).toMatch(/\s!important$/);
    }
    expect(declarations).toContain('min-width: 0 !important');
    expect(declarations).toContain('min-height: 0 !important');
  });
});

describe("readingLayerSource: 'readings' block separator", () => {
  const block = (id: string, ...ids: string[]) => ({ id, tokenIds: ids });
  const multi = (over: Partial<SKAMDocument> = {}): SKAMDocument => ({
    format: 'skam@0.1',
    tokens: [
      { id: 'a1', text: '學而時習之' },
      { id: 'a2', text: '不亦說乎' },
    ],
    blocks: [block('b1', 'a1'), block('b2', 'a2')],
    marks: [],
    readings: [],
    ...over,
  });
  const text = (doc: SKAMDocument, opts: Parameters<typeof render>[1] = {}) =>
    reading(render(doc, opts).html)?.textContent;

  it('separates blocks with one half-width space', () => {
    expect(text(multi())).toBe('學而時習之 不亦說乎');
  });
  it('emits a single space around a block whose ids resolve to no token', () => {
    const doc: SKAMDocument = {
      ...base(),
      tokens: [
        { id: 't1', text: '甲' },
        { id: 't3', text: '乙' },
      ],
      blocks: [block('b1', 't1'), block('b2', 'missing'), block('b3', 't3')],
    };
    expect(text(doc)).toBe('甲 乙');
  });
  it('emits no separator for blocks made only of empty-text tokens (leading, middle, trailing)', () => {
    const doc: SKAMDocument = {
      ...base(),
      tokens: [
        { id: 'e1', text: '' },
        { id: 't1', text: '甲' },
        { id: 'e2', text: '' },
        { id: 't3', text: '乙' },
        { id: 'e3', text: '' },
      ],
      blocks: [
        block('b1', 'e1'),
        block('b2', 't1'),
        block('b3', 'e2'),
        block('b4', 't3'),
        block('b5', 'e3'),
      ],
    };
    expect(text(doc)).toBe('甲 乙');
  });
  it('does not add a separator to the author-written kakikudashi', () => {
    expect(text(multi({ readings: [{ kind: 'kakikudashi', text: 'K' }] }))).toBe('K');
  });
  it('keeps tokens-array order as one group when blocks are empty', () => {
    expect(text(base({ blocks: [] }))).toBe('乙甲');
  });
  it("splits into the same number of blocks, with the same separator, as 'display'", () => {
    const readings = text(multi(), { readingLayerSource: 'readings' })!;
    const display = text(multi(), { readingLayerSource: 'display' })!;
    expect(readings.split(' ')).toHaveLength(2);
    expect(display.split(' ')).toHaveLength(2);
    expect(readings.replace(/[^ ]/g, '')).toBe(display.replace(/[^ ]/g, ''));
  });
});

describe('document lang', () => {
  const withLang = (lang: unknown, over: Partial<SKAMDocument> = {}) =>
    ({ ...base(over), lang }) as SKAMDocument;
  const attr = (html: string, selector: string) => {
    const el = dom(html).querySelector(selector);
    return el?.hasAttribute('lang') ? el.getAttribute('lang') : null;
  };

  it('uses the document lang on the display layer and keeps the container at ja', () => {
    const { html } = render(withLang('lzh'));
    expect(attr(html, '.skam-display')).toBe('lzh');
    expect(attr(html, '.skam-document')).toBe('ja');
  });
  it('prefers displayLang over the document lang', () => {
    expect(attr(render(withLang('lzh'), { displayLang: 'zh-Hant' }).html, '.skam-display')).toBe(
      'zh-Hant'
    );
  });
  it('renders a document without lang as before', () => {
    const { html } = render(base());
    expect(attr(html, '.skam-display')).toBe('ja');
    expect(attr(html, '.skam-document')).toBe('ja');
    expect(attr(html, '.skam-reading')).toBeNull();
  });
  it('puts the lang on the reading layer when it falls back to the base text', () => {
    expect(attr(render(withLang('lzh')).html, '.skam-reading')).toBe('lzh');
  });
  it('puts the lang on the reading layer for readingLayerSource: readings with no reading', () => {
    expect(
      attr(render(withLang('lzh'), { readingLayerSource: 'readings' }).html, '.skam-reading')
    ).toBe('lzh');
  });
  it.each(['kakikudashi', 'yomiage'] as const)('leaves %s reading text without lang', (kind) => {
    const doc = withLang('lzh', { readings: [{ kind, text: 'よみ' }] });
    expect(attr(render(doc).html, '.skam-reading')).toBeNull();
  });
  it('leaves the reading layer without lang for readingLayerSource: display', () => {
    expect(
      attr(render(withLang('lzh'), { readingLayerSource: 'display' }).html, '.skam-reading')
    ).toBeNull();
  });
  it('leaves the reading layer without lang when hideQuiz makes display the default source', () => {
    expect(attr(render(withLang('lzh'), { hideQuiz: true }).html, '.skam-reading')).toBeNull();
  });
  it('emits no reading layer element when the base text is empty', () => {
    const doc = withLang('lzh', { tokens: [], blocks: [] });
    expect(dom(render(doc).html).querySelector('.skam-reading')).toBeNull();
  });
  it('ignores an invalid document lang (documents that skipped the validator)', () => {
    const { html } = render(withLang('ja"><b'));
    expect(html).not.toContain('ja"><b');
    expect(attr(html, '.skam-display')).toBe('ja');
    expect(attr(html, '.skam-reading')).toBeNull();
  });
  it('ignores a non-string document lang', () => {
    const { html } = render(withLang({ toString: (): string => 'lzh' }));
    expect(attr(html, '.skam-display')).toBe('ja');
    expect(attr(html, '.skam-reading')).toBeNull();
  });
  it('rejects an invalid displayLang with a TypeError naming the option', () => {
    expect(() => render(base(), { displayLang: 'ja"><b' })).toThrow(
      new TypeError('displayLang must be a language tag such as ja or zh-Hant')
    );
  });
});
