import { describe, it, expect } from 'vitest';
import type { Mark, SKAMDocument } from '@kanbun-skam/skam';
import { render } from '../index.js';

/** 學而時習 (t1〜t4) を 1 ブロックに置く */
function createDoc(marks: Mark[]): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '學' },
      { id: 't2', text: '而' },
      { id: 't3', text: '時' },
      { id: 't4', text: '習' },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4'] }],
    marks,
    readings: [],
  };
}

const br = (after: string): Mark => ({ type: 'linebreak', position: { blockId: 'b1', after } });

function blockOf(html: string): Element {
  const body = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
  return body.querySelector('.skam-block')!;
}

/** 要素の直下の子を「タグ名.最初のクラス」で並べる (wbr と br の位置を見る) */
function childSummary(el: Element): string[] {
  return Array.from(el.children).map((c) => {
    const cls = c.classList[0];
    return cls ? `${c.tagName.toLowerCase()}.${cls}` : c.tagName.toLowerCase();
  });
}

describe('html: linebreak', () => {
  it('學の後ろは <br class="skam-linebreak"> だけで、前後に <wbr> が無い', () => {
    const block = blockOf(render(createDoc([br('t1')])).html);
    expect(childSummary(block)).toEqual([
      'span.skam-token',
      'br.skam-linebreak',
      'span.skam-token',
      'wbr',
      'span.skam-token',
      'wbr',
      'span.skam-token',
    ]);
  });

  it('ブロック先頭の kutoten があっても先頭の <wbr> の扱いは変わらず、學の後ろに <br>', () => {
    const doc = createDoc([
      { type: 'kutoten', position: { blockId: 'b1' }, value: '。' },
      br('t1'),
    ]);
    const summary = childSummary(blockOf(render(doc).html));
    // kutoten (blockStart) と學の間に wbr が無い
    expect(summary.slice(0, 3)).toEqual([
      'span.skam-suffix-kutoten',
      'span.skam-token',
      'br.skam-linebreak',
    ]);
  });

  it('highlight の範囲の途中 (學〜時の學の後ろ) は highlight の span の中に <br>', () => {
    const doc = createDoc([{ type: 'highlight', anchor: { from: 't1', to: 't3' } }, br('t1')]);
    const block = blockOf(render(doc).html);
    const content = block.querySelector('.skam-highlight-content')!;
    expect(childSummary(content)).toEqual([
      'span.skam-token',
      'br.skam-linebreak',
      'span.skam-token',
      'wbr',
      'span.skam-token',
    ]);
    // highlight の外にある <br> は無い
    expect(Array.from(block.children).some((c) => c.tagName === 'BR')).toBe(false);
  });

  it('highlight の最後の字の後ろは、highlight の span を閉じた後に <br>', () => {
    const doc = createDoc([{ type: 'highlight', anchor: { from: 't1', to: 't2' } }, br('t2')]);
    const block = blockOf(render(doc).html);
    expect(block.querySelector('.skam-highlight br')).toBeNull();
    expect(childSummary(block)).toEqual([
      'span.skam-highlight',
      'br.skam-linebreak',
      'span.skam-token',
      'wbr',
      'span.skam-token',
    ]);
  });

  it('竪点のグループの最後の字の後ろは、グループの後ろに <br>', () => {
    const doc = createDoc([{ type: 'tateten', anchor: { from: 't1', to: 't2' } }, br('t2')]);
    const block = blockOf(render(doc).html);
    expect(block.querySelector('.skam-tateten-group br')).toBeNull();
    expect(childSummary(block).slice(0, 3)).toEqual([
      'span.skam-tateten-group',
      'br.skam-linebreak',
      'span.skam-token',
    ]);
  });

  it('熟語訓の読みを持つ竪点のグループで終わる highlight は、ruby-grid の後ろに <br>', () => {
    const doc = createDoc([
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'がくじ' },
      { type: 'kutoten', position: { blockId: 'b1', after: 't2' }, value: '。' },
      { type: 'highlight', anchor: { from: 't1', to: 't2' } },
      br('t2'),
    ]);
    const block = blockOf(render(doc).html);
    expect(block.querySelector('.skam-ruby-grid br, ruby br')).toBeNull();
    const summary = childSummary(block);
    expect(summary.filter((s) => s === 'br.skam-linebreak')).toHaveLength(1);
    const index = summary.indexOf('br.skam-linebreak');
    expect(summary[index - 1]).toMatch(/ruby-grid|ruby/);
    expect(summary[index + 1]).toBe('span.skam-token');
  });

  it('profile.linebreak が false なら <br> を出さない', () => {
    const html = render(createDoc([br('t1')]), { profile: { linebreak: false } }).html;
    expect(html).not.toContain('<br');
    expect(html).toContain('<wbr>');
  });

  it('置けない場所 (竪点の中、ブロック末尾) の linebreak は無視し、例外も出さない', () => {
    const doc = createDoc([
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      br('t1'),
      br('t4'),
    ]);
    expect(render(doc).html).not.toContain('<br');
  });

  it('linebreak の無い文書の出力は、linebreak を足しても profile で消せば同じ', () => {
    const plain = render(createDoc([])).html;
    const hidden = render(createDoc([br('t1')]), { profile: { linebreak: false } }).html;
    expect(hidden).toBe(plain);
  });
});
