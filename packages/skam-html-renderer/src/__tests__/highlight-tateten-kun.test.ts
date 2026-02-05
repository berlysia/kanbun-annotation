import { describe, it, expect } from 'vitest';
import type { SKAMDocument, Mark } from '@kanbun/skam';
import { render } from '../index.js';

function createThreeTokenDoc(
  text1: string,
  text2: string,
  text3: string,
  marks: Mark[] = []
): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: text1 },
      { id: 't2', text: text2 },
      { id: 't3', text: text3 },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
    marks,
    readings: [],
  };
}

function createFiveTokenDoc(marks: Mark[] = []): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '夜' },
      { id: 't2', text: '來' },
      { id: 't3', text: '風' },
      { id: 't4', text: '雨' },
      { id: 't5', text: '聲' },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4', 't5'] }],
    marks,
    readings: [],
  };
}

function createSixTokenDoc(marks: Mark[] = []): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '春' },
      { id: 't2', text: '眠' },
      { id: 't3', text: '不' },
      { id: 't4', text: '覺' },
      { id: 't5', text: '曉' },
      { id: 't6', text: '處' },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4', 't5', 't6'] }],
    marks,
    readings: [],
  };
}

describe('Complex: multi-token kun + highlight + tateten', () => {
  it('3-token yomigana + highlight + tateten - should have tateten separators', () => {
    const doc = createThreeTokenDoc('朝', '聞', '道', [
      { type: 'yomigana', anchor: { from: 't1', to: 't3' }, value: 'ちょうもんどう' },
      { type: 'highlight', anchor: { from: 't1', to: 't3' }, style: 'solid' },
      { type: 'tateten', anchor: { from: 't1', to: 't3' } },
    ]);
    const { html } = render(doc);

    // yomigana is rendered as ruby annotation (rt with skam-ruby class)
    expect(html).toContain('skam-ruby');
    expect(html).toContain('ちょうもんどう');
    expect(html).toContain('skam-highlight');
    expect(html).toContain('skam-tateten');

    // tateten separators must be present inside <rb>
    const tatetenMarkCount = (html.match(/skam-tateten-mark/g) ?? []).length;
    expect(tatetenMarkCount).toBeGreaterThan(0);
  });

  it('3-token okurigana + highlight + tateten', () => {
    const doc = createThreeTokenDoc('不', '能', '爲', [
      { type: 'okurigana', anchor: { from: 't1', to: 't3' }, value: 'ハズ' },
      { type: 'highlight', anchor: { from: 't1', to: 't3' }, style: 'wavy' },
      { type: 'tateten', anchor: { from: 't1', to: 't3' } },
    ]);
    const { html } = render(doc);

    expect(html).toContain('ハズ');
    expect(html).toContain('skam-highlight');
    expect(html).toContain('skam-tateten');
  });

  it('3-token soegana + highlight + tateten', () => {
    const doc = createThreeTokenDoc('天', '地', '人', [
      { type: 'soegana', anchor: { from: 't1', to: 't3' }, value: 'を' },
      { type: 'highlight', anchor: { from: 't1', to: 't3' }, style: 'dashed' },
      { type: 'tateten', anchor: { from: 't1', to: 't3' } },
    ]);
    const { html } = render(doc);

    expect(html).toContain('を');
    expect(html).toContain('skam-highlight');
    expect(html).toContain('skam-tateten');
  });
});

describe('Partial range: multi-token kun + highlight + tateten with surrounding tokens', () => {
  it('soegana + highlight + tateten on middle 2 tokens - highlight wraps tateten-group', () => {
    const doc = createFiveTokenDoc([
      { type: 'soegana', anchor: { from: 't3', to: 't4' }, value: 'ノ' },
      { type: 'tateten', anchor: { from: 't3', to: 't4' } },
      { type: 'highlight', anchor: { from: 't3', to: 't4' }, style: 'solid' },
    ]);
    const { html } = render(doc);

    expect(html).toContain('skam-highlight');
    expect(html).toContain('skam-tateten');
    expect(html).toContain('skam-soegana');
    // highlight must wrap tateten-group
    expect(html).toMatch(/skam-highlight-content.*skam-tateten-group/s);
  });

  it('yomigana + highlight + tateten on middle 2 tokens - highlight wraps ruby', () => {
    const doc = createFiveTokenDoc([
      { type: 'yomigana', anchor: { from: 't3', to: 't4' }, value: 'ふうう' },
      { type: 'tateten', anchor: { from: 't3', to: 't4' } },
      { type: 'highlight', anchor: { from: 't3', to: 't4' }, style: 'solid' },
    ]);
    const { html } = render(doc);

    expect(html).toContain('skam-highlight');
    expect(html).toContain('skam-tateten');
    expect(html).toContain('skam-ruby');
    expect(html).toMatch(/skam-highlight-content.*skam-tateten-group/s);
  });

  it('okurigana + highlight + tateten on middle 2 tokens', () => {
    const doc = createFiveTokenDoc([
      { type: 'okurigana', anchor: { from: 't3', to: 't4' }, value: 'ス' },
      { type: 'tateten', anchor: { from: 't3', to: 't4' } },
      { type: 'highlight', anchor: { from: 't3', to: 't4' }, style: 'wavy' },
    ]);
    const { html } = render(doc);

    expect(html).toContain('skam-highlight');
    expect(html).toContain('skam-tateten');
    expect(html).toContain('skam-okuri');
  });

  it('surrounding tokens are not wrapped in highlight', () => {
    const doc = createFiveTokenDoc([
      { type: 'soegana', anchor: { from: 't3', to: 't4' }, value: 'ノ' },
      { type: 'tateten', anchor: { from: 't3', to: 't4' } },
      { type: 'highlight', anchor: { from: 't3', to: 't4' }, style: 'solid' },
    ]);
    const { html } = render(doc);

    // highlight appears exactly once
    const highlightCount = (html.match(/skam-highlight-content/g) ?? []).length;
    expect(highlightCount).toBe(1);

    // 夜 and 聲 should NOT be inside highlight
    const highlightMatch = html.match(/skam-highlight-content">(.*?)<\/span><\/span>/s);
    expect(highlightMatch).toBeTruthy();
    const highlightContent = highlightMatch![1]!;
    expect(highlightContent).not.toContain('夜');
    expect(highlightContent).not.toContain('聲');
    expect(highlightContent).toContain('風');
    expect(highlightContent).toContain('雨');
  });
});

describe('Adjacent highlight groups: first group has range kana + tateten', () => {
  it('two highlights - first has soegana + tateten, second is plain', () => {
    const doc = createSixTokenDoc([
      { type: 'soegana', anchor: { from: 't1', to: 't2' }, value: 'ノ' },
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'highlight', anchor: { from: 't1', to: 't2' }, style: 'solid' },
      { type: 'highlight', anchor: { from: 't3', to: 't4' }, style: 'wavy' },
    ]);
    const { html } = render(doc);

    // both highlights must be present
    const highlightCount = (html.match(/skam-highlight-content/g) ?? []).length;
    expect(highlightCount).toBe(2);
    expect(html).toContain('data-style="solid"');
    expect(html).toContain('data-style="wavy"');
    // first highlight must contain tateten + soegana
    expect(html).toMatch(/data-style="solid".*skam-tateten-group/s);
    expect(html).toMatch(/data-style="solid".*skam-soegana/s);
  });

  it('two highlights - first has yomigana + tateten, second is plain', () => {
    const doc = createSixTokenDoc([
      { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'しゅんみん' },
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'highlight', anchor: { from: 't1', to: 't2' }, style: 'solid' },
      { type: 'highlight', anchor: { from: 't3', to: 't4' }, style: 'dashed' },
    ]);
    const { html } = render(doc);

    const highlightCount = (html.match(/skam-highlight-content/g) ?? []).length;
    expect(highlightCount).toBe(2);
    expect(html).toContain('しゅんみん');
    expect(html).toMatch(/data-style="solid".*skam-ruby/s);
  });

  it('two highlights - both have range kana + tateten', () => {
    const doc = createSixTokenDoc([
      { type: 'soegana', anchor: { from: 't1', to: 't2' }, value: 'ノ' },
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'highlight', anchor: { from: 't1', to: 't2' }, style: 'solid' },
      { type: 'soegana', anchor: { from: 't3', to: 't4' }, value: 'ヲ' },
      { type: 'tateten', anchor: { from: 't3', to: 't4' } },
      { type: 'highlight', anchor: { from: 't3', to: 't4' }, style: 'wavy' },
    ]);
    const { html } = render(doc);

    const highlightCount = (html.match(/skam-highlight-content/g) ?? []).length;
    expect(highlightCount).toBe(2);
    expect(html).toContain('ノ');
    expect(html).toContain('ヲ');
  });
});
