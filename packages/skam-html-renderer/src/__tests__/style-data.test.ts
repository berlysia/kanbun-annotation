import { describe, it, expect, beforeEach } from 'vitest';
import type { Mark, SKAMDocument } from '@kanbun-skam/skam';
import { render, applyRenderedStyles, type RenderOptions } from '../index.js';
import { emphasisStyleAttributes } from '../style-data.js';

function makeDoc(texts: string[], marks: Mark[]): SKAMDocument {
  const tokens = texts.map((text, i) => ({ id: `t${i + 1}`, text }));
  return {
    format: 'skam@0.1',
    tokens,
    blocks: [{ id: 'b1', tokenIds: tokens.map((t) => t.id) }],
    marks,
    readings: [],
  };
}

const okototenMark: Mark = {
  type: 'okototen',
  anchor: { from: 't1', to: 't1' },
  position: { system: 'glyph-grid', grid: '4x4', x: 3, y: 1 },
  shape: 'dot',
};

/** ヲコト点、キーワードと任意の字の傍点、竪点のグループの傍点を 1 つずつ含む */
const richMarks: Mark[] = [
  okototenMark,
  { type: 'emphasis', anchor: { from: 't2', to: 't2' }, style: 'open sesame' },
  { type: 'emphasis', anchor: { from: 't3', to: 't3' }, style: '★' },
  { type: 'yomigana', anchor: { from: 't4', to: 't5' }, value: 'てんち' },
  { type: 'tateten', anchor: { from: 't4', to: 't5' } },
  { type: 'emphasis', anchor: { from: 't4', to: 't5' }, style: 'filled dot' },
];
const richDoc = makeDoc(['甲', '乙', '丙', '天', '地'], richMarks);
const richOptions: RenderOptions = { rubyMethod: 'ruby' };

const DATA_X = 'data-okototen-x';
const PROPS = [
  '--okototen-x',
  '--okototen-y',
  '--okototen-grid',
  '--okototen-grid-rows',
  'text-emphasis-style',
];

function mountHtml(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

function styleValues(el: Element): string[] {
  const style = (el as HTMLElement).style;
  return PROPS.map((p) => style.getPropertyValue(p));
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('render: inlineStyles', () => {
  it('false: no style attribute, data attributes instead', () => {
    const { html } = render(richDoc, { ...richOptions, inlineStyles: false });
    expect(html).not.toContain(' style="');
    expect(html).toContain('data-okototen-x="3"');
    expect(html).toContain('data-okototen-y="1"');
    expect(html).toContain('data-okototen-cols="4"');
    expect(html).toContain('data-okototen-rows="4"');
    expect(html).toContain('data-emphasis-style="open sesame"');
    expect(html).toContain('data-emphasis-style="★"');
    // 竪点のグループの <span class="skam-emphasis">
    expect(html).toMatch(/<span class="skam-emphasis" data-emphasis-style="filled dot">/);
    // 変換前の指定が出る
    expect(html).not.toContain('\\2605');
  });

  it('default and true are identical and keep style attributes', () => {
    const fixtures: [SKAMDocument, RenderOptions][] = [
      [richDoc, richOptions],
      [richDoc, {}],
      [richDoc, { rubyMethod: 'grid', interactive: true }],
      [richDoc, { writingMode: 'horizontal', classPrefix: 'x', inline: true }],
      [makeDoc(['甲'], [okototenMark]), {}],
      [makeDoc(['甲'], []), {}],
    ];
    for (const [doc, options] of fixtures) {
      const byDefault = render(doc, options);
      const explicit = render(doc, { ...options, inlineStyles: true });
      expect(explicit.html).toBe(byDefault.html);
      expect(explicit.css).toBe(byDefault.css);
    }
    expect(render(richDoc, richOptions).html).toContain(
      'style="--okototen-x: 3; --okototen-y: 1; --okototen-grid: 4; --okototen-grid-rows: 4;"'
    );
  });

  it('throws TypeError for a non-boolean', () => {
    expect(() => render(richDoc, { inlineStyles: 'no' as unknown as boolean })).toThrow(TypeError);
  });

  it('escapes the emphasis spec in the data attribute', () => {
    // 描画の経路では、検証を通らない指定 (`"` など) は既定の点になる。属性の出力側も単体で確かめる
    expect(emphasisStyleAttributes('"', false)).toBe(' data-emphasis-style="&quot;"');
    expect(emphasisStyleAttributes("<&>'", false)).toBe(
      ' data-emphasis-style="&lt;&amp;&gt;&#x27;"'
    );
    for (const style of ['"', '<', '&']) {
      const doc = makeDoc(['甲'], [{ type: 'emphasis', anchor: { from: 't1', to: 't1' }, style }]);
      const root = mountHtml(render(doc, { inlineStyles: false }).html);
      expect(root.querySelectorAll('[data-emphasis-style]').length).toBeLessThanOrEqual(1);
      expect(render(doc, { inlineStyles: false }).html).not.toContain(' style="');
    }
  });
});

describe('applyRenderedStyles', () => {
  it('gives the same property values as the default style attributes', () => {
    const inline = mountHtml(render(richDoc, richOptions).html);
    const data = mountHtml(render(richDoc, { ...richOptions, inlineStyles: false }).html);
    applyRenderedStyles(data);
    const inlineEls = Array.from(inline.querySelectorAll('[style]'));
    expect(inlineEls.length).toBeGreaterThanOrEqual(4);
    const dataEls = Array.from(data.querySelectorAll('[data-okototen-x], [data-emphasis-style]'));
    expect(dataEls).toHaveLength(inlineEls.length);
    inlineEls.forEach((el, i) => {
      const other = dataEls[i];
      expect(other).toBeDefined();
      expect(styleValues(other as Element)).toEqual(styleValues(el));
    });
    expect(styleValues(dataEls[0] as Element)[0]).toBe('3');
  });

  it('ignores invalid okototen integers without throwing', () => {
    for (const bad of ['1;color:red', '-1', '99999999999999999999', '', '1.5', ' 1']) {
      const root = mountHtml(`<span ${DATA_X}="${bad}"></span>`);
      expect(() => applyRenderedStyles(root)).not.toThrow();
      const el = root.firstElementChild as HTMLElement;
      expect(el.style.getPropertyValue('--okototen-x')).toBe('');
      expect(el.style.getPropertyValue('color')).toBe('');
    }
  });

  it('treats the four okototen attributes independently', () => {
    const root = mountHtml(`<span ${DATA_X}="2"></span>`);
    applyRenderedStyles(root);
    const el = root.firstElementChild as HTMLElement;
    expect(el.style.getPropertyValue('--okototen-x')).toBe('2');
    expect(el.style.getPropertyValue('--okototen-y')).toBe('');
    expect(el.style.getPropertyValue('--okototen-grid')).toBe('');
  });

  it('converts emphasis specs without letting other css in', () => {
    const cases: [string, string][] = [
      ['"', '"\\22 "'],
      ['\\', '"\\5c "'],
      [';', '"\\3b "'],
      ['\n', '"\\a "'],
      ['\ud800', '"\\d800 "'],
      ['', 'filled dot'],
      ['x"; color: red', '"\\78 "'],
      ['open sesame', 'open sesame'],
    ];
    for (const [spec, expected] of cases) {
      const root = document.createElement('div');
      const span = document.createElement('span');
      span.setAttribute('data-emphasis-style', spec);
      root.appendChild(span);
      applyRenderedStyles(root);
      expect(span.style.getPropertyValue('text-emphasis-style')).toBe(expected);
      expect(span.style.getPropertyValue('color')).toBe('');
    }
  });

  it('matches the default for escaped quote, angle, ampersand and surrogate pair specs', () => {
    for (const style of ['"', '<', '&', '\u{1F600}']) {
      const doc = makeDoc(['甲'], [{ type: 'emphasis', anchor: { from: 't1', to: 't1' }, style }]);
      const inline = mountHtml(render(doc).html).querySelector('[style]') as HTMLElement;
      const data = mountHtml(render(doc, { inlineStyles: false }).html);
      applyRenderedStyles(data);
      const target = data.querySelector('[data-emphasis-style]') as HTMLElement;
      expect(target.style.getPropertyValue('text-emphasis-style')).toBe(
        inline.style.getPropertyValue('text-emphasis-style')
      );
    }
  });

  it('is idempotent, also after innerHTML is replaced', () => {
    const html = render(richDoc, { ...richOptions, inlineStyles: false }).html;
    const root = mountHtml(html);
    applyRenderedStyles(root);
    const first = Array.from(root.querySelectorAll('[data-okototen-x], [data-emphasis-style]')).map(
      styleValues
    );
    applyRenderedStyles(root);
    const second = Array.from(
      root.querySelectorAll('[data-okototen-x], [data-emphasis-style]')
    ).map(styleValues);
    expect(second).toEqual(first);
    root.innerHTML = html;
    applyRenderedStyles(root);
    const third = Array.from(root.querySelectorAll('[data-okototen-x], [data-emphasis-style]')).map(
      styleValues
    );
    expect(third).toEqual(first);
  });

  it('does not touch root itself', () => {
    const root = document.createElement('div');
    root.setAttribute(DATA_X, '1');
    applyRenderedStyles(root);
    expect(root.style.getPropertyValue('--okototen-x')).toBe('');
  });

  it('works for a ShadowRoot', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = render(richDoc, { ...richOptions, inlineStyles: false }).html;
    applyRenderedStyles(shadow);
    const el = shadow.querySelector('[data-okototen-x]') as HTMLElement;
    expect(el.style.getPropertyValue('--okototen-x')).toBe('3');
  });
});
