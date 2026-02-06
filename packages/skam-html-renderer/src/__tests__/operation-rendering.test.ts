/**
 * オペレーション→レンダリング統合テスト
 *
 * @kanbun/skam のオペレーション（CRUD）適用後のドキュメントを
 * @kanbun/skam-html-renderer の render() に通した結果が、
 * 操作内容を正しく反映しているかを検証する。
 *
 * 関連: docs/decisions/adr-001-operation-renderer-integration-tests.md
 * 計画: docs/plans/plan-operation-renderer-integration-tests.md
 */
import { describe, it, expect } from 'vitest';
import type { SKAMDocument, Mark } from '@kanbun/skam';
import {
  addMark,
  addMarkWithResult,
  removeMark,
  updateMark,
  replaceMark,
  removeHighlightWithRef,
} from '@kanbun/skam';
import { render, PROFILES } from '../index.js';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * 3 token (子/曰/學, t1-t3) / 1 block (b1) のベースドキュメントを生成
 */
function createBaseDocument(marks: Mark[] = []): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '子' },
      { id: 't2', text: '曰' },
      { id: 't3', text: '學' },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
    marks,
    readings: [],
  };
}

// ============================================================================
// 1. addMark → レンダリング反映
// ============================================================================

describe('1. addMark → レンダリング反映', () => {
  it('1.1 kaeri: 返り点追加', () => {
    const doc = createBaseDocument();
    const beforeHtml = render(doc).html;

    const afterDoc = addMark(doc, {
      type: 'kaeri',
      position: { blockId: 'b1', after: 't3' },
      value: 'レ',
    });
    const afterHtml = render(afterDoc).html;

    expect(beforeHtml).not.toContain('skam-kaeriten');
    expect(afterHtml).toContain('skam-kaeriten');
    expect(afterHtml).toContain('\u3191'); // Unicode for レ
    // 既存トークンは影響なし
    expect(afterHtml).toContain('子');
    expect(afterHtml).toContain('曰');
    expect(afterHtml).toContain('學');
  });

  it('1.2 okurigana: 送り仮名追加', () => {
    const doc = createBaseDocument();
    const beforeHtml = render(doc).html;

    const afterDoc = addMark(doc, {
      type: 'okurigana',
      anchor: { from: 't3', to: 't3' },
      value: 'ブ',
    });
    const afterHtml = render(afterDoc).html;

    expect(beforeHtml).not.toContain('skam-okuri');
    expect(afterHtml).toContain('skam-okuri');
    expect(afterHtml).toContain('ブ');
  });

  it('1.3 yomigana: 読み仮名追加', () => {
    const doc = createBaseDocument();
    const beforeHtml = render(doc).html;

    const afterDoc = addMark(doc, {
      type: 'yomigana',
      anchor: { from: 't3', to: 't3' },
      value: 'まな',
    });
    const afterHtml = render(afterDoc).html;

    expect(beforeHtml).not.toContain('<ruby>');
    expect(beforeHtml).not.toContain('skam-ruby');
    expect(afterHtml).toContain('<ruby>');
    expect(afterHtml).toContain('skam-ruby');
    expect(afterHtml).toContain('まな');
    expect(afterHtml).toContain('<rt');
  });

  it('1.4 soegana: 添え仮名追加', () => {
    const doc = createBaseDocument();
    const beforeHtml = render(doc).html;

    const afterDoc = addMark(doc, {
      type: 'soegana',
      anchor: { from: 't3', to: 't3' },
      value: 'を',
    });
    const afterHtml = render(afterDoc).html;

    expect(beforeHtml).not.toContain('skam-soegana');
    expect(afterHtml).toContain('skam-soegana');
    expect(afterHtml).toContain('を');
  });

  it('1.5 okimoji: 置字追加', () => {
    const doc = createBaseDocument();
    const beforeHtml = render(doc).html;

    const afterDoc = addMark(doc, {
      type: 'okimoji',
      anchor: { from: 't2', to: 't2' },
    });
    const afterHtml = render(afterDoc).html;

    expect(beforeHtml).not.toContain('skam-okimoji');
    expect(afterHtml).toContain('skam-okimoji');
  });

  it('1.6 joji: 助字追加', () => {
    const doc = createBaseDocument();
    const beforeHtml = render(doc).html;

    const afterDoc = addMark(doc, {
      type: 'joji',
      anchor: { from: 't2', to: 't2' },
    });
    const afterHtml = render(afterDoc).html;

    expect(beforeHtml).not.toContain('skam-joji');
    expect(afterHtml).toContain('skam-joji');
  });

  it('1.7 kutoten: 句読点追加', () => {
    const doc = createBaseDocument();
    const beforeHtml = render(doc).html;

    const afterDoc = addMark(doc, {
      type: 'kutoten',
      position: { blockId: 'b1', after: 't3' },
      value: '。',
    });
    const afterHtml = render(afterDoc).html;

    expect(beforeHtml).not.toContain('skam-suffix-kutoten');
    expect(afterHtml).toContain('skam-suffix-kutoten');
    expect(afterHtml).toContain('。');
  });

  it('1.8 saidoku: 再読文字追加', () => {
    const doc = createBaseDocument();
    const beforeHtml = render(doc).html;

    const afterDoc = addMark(doc, {
      type: 'saidoku',
      anchor: { from: 't1', to: 't1' },
      forms: [
        { n: 1, yomi: 'まさ', okuri: 'に' },
        { n: 2, okuri: 'す' },
      ],
    });
    const afterHtml = render(afterDoc).html;

    expect(beforeHtml).not.toContain('skam-saidoku');
    expect(afterHtml).toContain('skam-saidoku');
    expect(afterHtml).toContain('data-saidoku-n="1"');
    expect(afterHtml).toContain('data-saidoku-n="2"');
    // nested ruby structure
    expect(afterHtml).toContain('skam-saidoku-inner');
    expect(afterHtml).toContain('skam-saidoku-outer');
  });

  it('1.9 okototen: ヲコト点追加', () => {
    const doc = createBaseDocument();
    const beforeHtml = render(doc).html;

    const afterDoc = addMark(doc, {
      type: 'okototen',
      anchor: { from: 't1', to: 't1' },
      position: { system: 'glyph-grid', grid: '5x5', x: 4, y: 4 },
      shape: 'dot',
    });
    const afterHtml = render(afterDoc).html;

    expect(beforeHtml).not.toContain('skam-okototen');
    expect(beforeHtml).not.toContain('skam-has-okototen');
    expect(afterHtml).toContain('skam-okototen');
    expect(afterHtml).toContain('skam-has-okototen');
    expect(afterHtml).toContain('data-shape="dot"');
    expect(afterHtml).toContain('--okototen-x: 4');
    expect(afterHtml).toContain('--okototen-y: 4');
  });

  it('1.10 tateten: たて点追加', () => {
    const doc = createBaseDocument();
    const beforeHtml = render(doc).html;

    const afterDoc = addMark(doc, {
      type: 'tateten',
      anchor: { from: 't1', to: 't2' },
    });
    const afterHtml = render(afterDoc).html;

    expect(beforeHtml).not.toContain('skam-tateten-group');
    expect(afterHtml).toContain('skam-tateten-group');
    expect(afterHtml).toContain('skam-tateten-mark');
  });

  it('1.11 emphasis: 傍点追加', () => {
    const doc = createBaseDocument();
    const beforeHtml = render(doc).html;

    const afterDoc = addMark(doc, {
      type: 'emphasis',
      anchor: { from: 't3', to: 't3' },
    });
    const afterHtml = render(afterDoc).html;

    expect(beforeHtml).not.toContain('skam-emphasis');
    expect(afterHtml).toContain('skam-emphasis');
    // default style is 'filled dot'
    expect(afterHtml).toContain('text-emphasis-style: filled dot');
  });

  it('1.12 highlight: 傍線追加', () => {
    const doc = createBaseDocument();
    const beforeHtml = render(doc).html;

    const afterDoc = addMark(doc, {
      type: 'highlight',
      anchor: { from: 't1', to: 't2' },
      style: 'solid',
    });
    const afterHtml = render(afterDoc).html;

    expect(beforeHtml).not.toContain('skam-highlight');
    expect(afterHtml).toContain('skam-highlight');
    expect(afterHtml).toContain('data-style="solid"');
  });

  it('1.13 ref: 参照追加', () => {
    const doc = createBaseDocument();
    const beforeHtml = render(doc).html;

    const afterDoc = addMark(doc, {
      type: 'ref',
      position: { blockId: 'b1', after: 't1' },
      label: '(A)',
    });
    const afterHtml = render(afterDoc).html;

    expect(beforeHtml).not.toContain('skam-ref');
    expect(afterHtml).toContain('skam-ref');
    expect(afterHtml).toContain('(A)');
  });
});

// ============================================================================
// 2. removeMark → レンダリング反映
// ============================================================================

describe('2. removeMark → レンダリング反映', () => {
  it('2.1 kaeri: 返り点削除', () => {
    const doc = createBaseDocument([
      {
        type: 'kaeri',
        id: 'mk1',
        position: { blockId: 'b1', after: 't3' },
        value: 'レ',
      },
    ]);
    const beforeHtml = render(doc).html;

    const afterDoc = removeMark(doc, 'mk1');
    const afterHtml = render(afterDoc).html;

    expect(beforeHtml).toContain('skam-kaeriten');
    expect(afterHtml).not.toContain('skam-kaeriten');
    // トークンは保持
    expect(afterHtml).toContain('學');
  });

  it('2.2 okurigana: 送り仮名削除', () => {
    const doc = createBaseDocument([
      {
        type: 'okurigana',
        id: 'mk1',
        anchor: { from: 't3', to: 't3' },
        value: 'ブ',
      },
    ]);
    const beforeHtml = render(doc).html;

    const afterDoc = removeMark(doc, 'mk1');
    const afterHtml = render(afterDoc).html;

    expect(beforeHtml).toContain('skam-okuri');
    expect(beforeHtml).toContain('ブ');
    expect(afterHtml).not.toContain('skam-okuri');
  });

  it('2.3 yomigana: 読み仮名削除', () => {
    const doc = createBaseDocument([
      {
        type: 'yomigana',
        id: 'mk1',
        anchor: { from: 't3', to: 't3' },
        value: 'まな',
      },
    ]);
    const beforeHtml = render(doc).html;

    const afterDoc = removeMark(doc, 'mk1');
    const afterHtml = render(afterDoc).html;

    expect(beforeHtml).toContain('<rt');
    expect(beforeHtml).toContain('まな');
    expect(afterHtml).not.toContain('<rt');
    expect(afterHtml).not.toContain('まな');
  });

  it('2.4 soegana: 添え仮名削除', () => {
    const doc = createBaseDocument([
      {
        type: 'soegana',
        id: 'mk1',
        anchor: { from: 't3', to: 't3' },
        value: 'を',
      },
    ]);
    const beforeHtml = render(doc).html;

    const afterDoc = removeMark(doc, 'mk1');
    const afterHtml = render(afterDoc).html;

    expect(beforeHtml).toContain('skam-soegana');
    expect(afterHtml).not.toContain('skam-soegana');
  });

  it('2.5 okimoji: 置字削除', () => {
    const doc = createBaseDocument([
      {
        type: 'okimoji',
        id: 'mk1',
        anchor: { from: 't2', to: 't2' },
      },
    ]);
    const beforeHtml = render(doc).html;

    const afterDoc = removeMark(doc, 'mk1');
    const afterHtml = render(afterDoc).html;

    expect(beforeHtml).toContain('skam-okimoji');
    expect(afterHtml).not.toContain('skam-okimoji');
  });

  it('2.6 joji: 助字削除', () => {
    const doc = createBaseDocument([
      {
        type: 'joji',
        id: 'mk1',
        anchor: { from: 't2', to: 't2' },
      },
    ]);
    const beforeHtml = render(doc).html;

    const afterDoc = removeMark(doc, 'mk1');
    const afterHtml = render(afterDoc).html;

    expect(beforeHtml).toContain('skam-joji');
    expect(afterHtml).not.toContain('skam-joji');
  });

  it('2.7 kutoten: 句読点削除', () => {
    const doc = createBaseDocument([
      {
        type: 'kutoten',
        id: 'mk1',
        position: { blockId: 'b1', after: 't3' },
        value: '。',
      },
    ]);
    const beforeHtml = render(doc).html;

    const afterDoc = removeMark(doc, 'mk1');
    const afterHtml = render(afterDoc).html;

    expect(beforeHtml).toContain('skam-suffix-kutoten');
    expect(beforeHtml).toContain('。');
    expect(afterHtml).not.toContain('skam-suffix-kutoten');
  });

  it('2.8 saidoku: 再読文字削除', () => {
    const doc = createBaseDocument([
      {
        type: 'saidoku',
        id: 'mk1',
        anchor: { from: 't1', to: 't1' },
        forms: [
          { n: 1, yomi: 'まさ', okuri: 'に' },
          { n: 2, okuri: 'す' },
        ],
      },
    ]);
    const beforeHtml = render(doc).html;

    const afterDoc = removeMark(doc, 'mk1');
    const afterHtml = render(afterDoc).html;

    expect(beforeHtml).toContain('skam-saidoku');
    expect(beforeHtml).toContain('skam-saidoku-outer');
    expect(afterHtml).not.toContain('skam-saidoku-outer');
    expect(afterHtml).not.toContain('skam-saidoku-inner');
    // saidoku class on token should also be gone
    expect(afterHtml).not.toMatch(/skam-token[^"]*skam-saidoku/);
  });

  it('2.9 okototen: ヲコト点削除', () => {
    const doc = createBaseDocument([
      {
        type: 'okototen',
        id: 'mk1',
        anchor: { from: 't1', to: 't1' },
        position: { system: 'glyph-grid', grid: '5x5', x: 4, y: 4 },
        shape: 'dot',
      },
    ]);
    const beforeHtml = render(doc).html;

    const afterDoc = removeMark(doc, 'mk1');
    const afterHtml = render(afterDoc).html;

    expect(beforeHtml).toContain('skam-okototen');
    expect(beforeHtml).toContain('skam-has-okototen');
    expect(afterHtml).not.toContain('skam-okototen');
    expect(afterHtml).not.toContain('skam-has-okototen');
  });

  it('2.10 tateten: たて点削除', () => {
    const doc = createBaseDocument([
      {
        type: 'tateten',
        id: 'mk1',
        anchor: { from: 't1', to: 't2' },
      },
    ]);
    const beforeHtml = render(doc).html;

    const afterDoc = removeMark(doc, 'mk1');
    const afterHtml = render(afterDoc).html;

    expect(beforeHtml).toContain('skam-tateten-group');
    expect(afterHtml).not.toContain('skam-tateten-group');
  });

  it('2.11 emphasis: 傍点削除', () => {
    const doc = createBaseDocument([
      {
        type: 'emphasis',
        id: 'mk1',
        anchor: { from: 't3', to: 't3' },
      },
    ]);
    const beforeHtml = render(doc).html;

    const afterDoc = removeMark(doc, 'mk1');
    const afterHtml = render(afterDoc).html;

    expect(beforeHtml).toContain('skam-emphasis');
    expect(afterHtml).not.toContain('skam-emphasis');
  });

  it('2.12 highlight: 傍線削除', () => {
    const doc = createBaseDocument([
      {
        type: 'highlight',
        id: 'mk1',
        anchor: { from: 't1', to: 't2' },
        style: 'solid',
      },
    ]);
    const beforeHtml = render(doc).html;

    const afterDoc = removeMark(doc, 'mk1');
    const afterHtml = render(afterDoc).html;

    expect(beforeHtml).toContain('skam-highlight');
    expect(beforeHtml).toContain('data-style="solid"');
    expect(afterHtml).not.toContain('skam-highlight');
  });

  it('2.13 ref: 参照削除', () => {
    const doc = createBaseDocument([
      {
        type: 'ref',
        id: 'mk1',
        position: { blockId: 'b1', after: 't1' },
        label: '(A)',
      },
    ]);
    const beforeHtml = render(doc).html;

    const afterDoc = removeMark(doc, 'mk1');
    const afterHtml = render(afterDoc).html;

    expect(beforeHtml).toContain('skam-ref');
    expect(beforeHtml).toContain('(A)');
    expect(afterHtml).not.toContain('skam-ref');
    expect(afterHtml).not.toContain('(A)');
  });
});

// ============================================================================
// 3. updateMark → レンダリング反映
// ============================================================================

describe('3. updateMark → レンダリング反映', () => {
  it('3.1 okurigana value変更: 仮名テキスト更新', () => {
    const doc = createBaseDocument([
      {
        type: 'okurigana',
        id: 'mk1',
        anchor: { from: 't3', to: 't3' },
        value: 'ブ',
      },
    ]);
    const beforeHtml = render(doc).html;

    const afterDoc = updateMark(doc, 'mk1', { value: 'ビ' });
    const afterHtml = render(afterDoc).html;

    expect(beforeHtml).toContain('ブ');
    expect(beforeHtml).not.toContain('ビ');
    expect(afterHtml).toContain('ビ');
    expect(afterHtml).not.toContain('ブ');
    // okuri class is still present
    expect(afterHtml).toContain('skam-okuri');
  });

  it('3.2 kaeri value変更: 返り点種類変更（レ→一二）', () => {
    const doc = createBaseDocument([
      {
        type: 'kaeri',
        id: 'mk1',
        position: { blockId: 'b1', after: 't3' },
        value: 'レ',
      },
    ]);
    const beforeHtml = render(doc).html;

    const afterDoc = updateMark(doc, 'mk1', { value: '二' });
    const afterHtml = render(afterDoc).html;

    expect(beforeHtml).toContain('\u3191'); // レ
    expect(beforeHtml).not.toContain('\u3193'); // 二
    expect(afterHtml).toContain('\u3193'); // 二
    expect(afterHtml).not.toContain('\u3191'); // レ
  });

  it('3.3 emphasis style変更: 傍点スタイル変更', () => {
    const doc = createBaseDocument([
      {
        type: 'emphasis',
        id: 'mk1',
        anchor: { from: 't3', to: 't3' },
        // default style: 'filled dot'
      },
    ]);
    const beforeHtml = render(doc).html;

    const afterDoc = updateMark(doc, 'mk1', { style: 'filled sesame' });
    const afterHtml = render(afterDoc).html;

    expect(beforeHtml).toContain('text-emphasis-style: filled dot');
    expect(afterHtml).toContain('text-emphasis-style: filled sesame');
    // emphasis class is still present
    expect(afterHtml).toContain('skam-emphasis');
  });

  it('3.4 highlight style変更: 傍線スタイル変更', () => {
    const doc = createBaseDocument([
      {
        type: 'highlight',
        id: 'mk1',
        anchor: { from: 't1', to: 't2' },
        style: 'solid',
      },
    ]);
    const beforeHtml = render(doc).html;

    const afterDoc = updateMark(doc, 'mk1', { style: 'wavy' });
    const afterHtml = render(afterDoc).html;

    expect(beforeHtml).toContain('data-style="solid"');
    expect(beforeHtml).not.toContain('data-style="wavy"');
    expect(afterHtml).toContain('data-style="wavy"');
    expect(afterHtml).not.toContain('data-style="solid"');
  });
});

// ============================================================================
// 4. replaceMark → レンダリング反映
// ============================================================================

describe('4. replaceMark → レンダリング反映', () => {
  it('4.1 okurigana → yomigana: 送り仮名→読み仮名に変更', () => {
    const doc = createBaseDocument([
      {
        type: 'okurigana',
        id: 'mk1',
        anchor: { from: 't3', to: 't3' },
        value: 'ブ',
      },
    ]);
    const beforeHtml = render(doc).html;

    const afterDoc = replaceMark(doc, 'mk1', {
      type: 'yomigana',
      anchor: { from: 't3', to: 't3' },
      value: 'まな',
    });
    const afterHtml = render(afterDoc).html;

    // okurigana elements should disappear
    expect(beforeHtml).toContain('skam-okuri');
    expect(afterHtml).not.toContain('skam-okuri');
    // yomigana elements should appear
    expect(beforeHtml).not.toContain('<ruby>');
    expect(afterHtml).toContain('<ruby>');
    expect(afterHtml).toContain('skam-ruby');
    expect(afterHtml).toContain('まな');
  });

  it('4.2 emphasis style変更: replaceMarkでスタイル変更', () => {
    const doc = createBaseDocument([
      {
        type: 'emphasis',
        id: 'mk1',
        anchor: { from: 't3', to: 't3' },
        style: 'dot',
      },
    ]);
    const beforeHtml = render(doc).html;

    const afterDoc = replaceMark(doc, 'mk1', {
      type: 'emphasis',
      anchor: { from: 't3', to: 't3' },
      style: 'filled sesame',
    });
    const afterHtml = render(afterDoc).html;

    expect(beforeHtml).toContain('text-emphasis-style: dot');
    expect(afterHtml).toContain('text-emphasis-style: filled sesame');
    expect(afterHtml).toContain('skam-emphasis');
  });
});

// ============================================================================
// 5. 複合オペレーション → レンダリング反映
// ============================================================================

describe('5. 複合オペレーション → レンダリング反映', () => {
  it('5.1 removeHighlightWithRef: highlight + ref 両方がHTMLから消滅', () => {
    const doc = createBaseDocument([
      {
        type: 'highlight',
        id: 'hl1',
        anchor: { from: 't1', to: 't2' },
        style: 'solid',
        ref: 'ref1',
      },
      {
        type: 'ref',
        id: 'ref1',
        position: { blockId: 'b1', after: 't1' },
        label: '(A)',
      },
    ]);
    const beforeHtml = render(doc).html;

    const afterDoc = removeHighlightWithRef(doc, 'hl1');
    const afterHtml = render(afterDoc).html;

    // highlight should be gone
    expect(beforeHtml).toContain('skam-highlight');
    expect(afterHtml).not.toContain('skam-highlight');
    // ref should also be gone
    expect(beforeHtml).toContain('(A)');
    expect(afterHtml).not.toContain('(A)');
    expect(afterHtml).not.toContain('skam-ref');
    // tokens still present
    expect(afterHtml).toContain('子');
    expect(afterHtml).toContain('曰');
  });

  it('5.2 返り点追加 → 送り仮名追加: 両方の要素がHTMLに出現', () => {
    let doc = createBaseDocument();

    // Step 1: 返り点追加
    doc = addMark(doc, {
      type: 'kaeri',
      position: { blockId: 'b1', after: 't3' },
      value: 'レ',
    });

    // Step 2: 送り仮名追加
    doc = addMark(doc, {
      type: 'okurigana',
      anchor: { from: 't3', to: 't3' },
      value: 'ブ',
    });

    const html = render(doc).html;

    expect(html).toContain('skam-kaeriten');
    expect(html).toContain('\u3191'); // レ
    expect(html).toContain('skam-okuri');
    expect(html).toContain('ブ');
  });

  it('5.3 yomigana追加 → ref残存確認: yomigana追加後もref要素が保持されている', () => {
    const doc = createBaseDocument([
      {
        type: 'ref',
        id: 'ref1',
        position: { blockId: 'b1', after: 't3' },
        label: '(A)',
      },
    ]);

    const afterDoc = addMark(doc, {
      type: 'yomigana',
      anchor: { from: 't3', to: 't3' },
      value: 'まな',
    });
    const afterHtml = render(afterDoc).html;

    // yomigana should be present
    expect(afterHtml).toContain('skam-ruby');
    expect(afterHtml).toContain('まな');
    // ref should still be present
    expect(afterHtml).toContain('skam-ref');
    expect(afterHtml).toContain('(A)');
  });

  it('5.4 複数mark追加 → 1つ削除: 残りのmark要素は保持されている', () => {
    const { doc: doc1, markId: kaeriId } = addMarkWithResult(createBaseDocument(), {
      type: 'kaeri',
      position: { blockId: 'b1', after: 't3' },
      value: 'レ',
    });

    const doc2 = addMark(doc1, {
      type: 'okurigana',
      anchor: { from: 't3', to: 't3' },
      value: 'ブ',
    });

    // Before removal: both present
    const beforeHtml = render(doc2).html;
    expect(beforeHtml).toContain('skam-kaeriten');
    expect(beforeHtml).toContain('skam-okuri');

    // Remove only kaeri
    const afterDoc = removeMark(doc2, kaeriId);
    const afterHtml = render(afterDoc).html;

    expect(afterHtml).not.toContain('skam-kaeriten');
    // okurigana should still be present
    expect(afterHtml).toContain('skam-okuri');
    expect(afterHtml).toContain('ブ');
  });

  it('5.5 kaeri値変更（remove+add）: 返り点Unicode文字の変化を検証', () => {
    const { doc: doc1, markId: kaeriId } = addMarkWithResult(createBaseDocument(), {
      type: 'kaeri',
      position: { blockId: 'b1', after: 't3' },
      value: 'レ',
    });
    const beforeHtml = render(doc1).html;
    expect(beforeHtml).toContain('\u3191'); // レ

    // remove + add で値変更
    const doc2 = removeMark(doc1, kaeriId);
    const doc3 = addMark(doc2, {
      type: 'kaeri',
      position: { blockId: 'b1', after: 't3' },
      value: '一',
    });
    const afterHtml = render(doc3).html;

    expect(afterHtml).not.toContain('\u3191'); // レ should be gone
    expect(afterHtml).toContain('\u3192'); // 一
    expect(afterHtml).toContain('skam-kaeriten');
  });
});

// ============================================================================
// 6. プロファイル×オペレーション
// ============================================================================

describe('6. プロファイル×オペレーション', () => {
  it('6.1 addMark(yomigana) + profile.yomigana=false: 追加してもrtは出力されない', () => {
    const doc = createBaseDocument();

    const afterDoc = addMark(doc, {
      type: 'yomigana',
      anchor: { from: 't3', to: 't3' },
      value: 'まな',
    });
    const html = render(afterDoc, { profile: { yomigana: false } }).html;

    // yomigana should not be visible
    expect(html).not.toContain('まな');
    // ruby/rt should not appear
    expect(html).not.toContain('<rt');
    // token text should still be present
    expect(html).toContain('學');
  });

  it('6.2 addMark(kaeri) + profile.kaeriten=false: 追加してもskam-kaeritenは出力されない', () => {
    const doc = createBaseDocument();

    const afterDoc = addMark(doc, {
      type: 'kaeri',
      position: { blockId: 'b1', after: 't3' },
      value: 'レ',
    });
    const html = render(afterDoc, { profile: { kaeriten: false } }).html;

    // kaeriten should not be visible
    expect(html).not.toContain('skam-kaeriten');
    expect(html).not.toContain('\u3191');
    // token text should still be present
    expect(html).toContain('學');
  });

  it('6.3 addMark(kaeri) + learningBasic プロファイル: kaeriは表示、yomigana/okuriganaは非表示', () => {
    let doc = createBaseDocument();

    doc = addMark(doc, {
      type: 'kaeri',
      position: { blockId: 'b1', after: 't3' },
      value: 'レ',
    });
    doc = addMark(doc, {
      type: 'yomigana',
      anchor: { from: 't3', to: 't3' },
      value: 'まな',
    });
    doc = addMark(doc, {
      type: 'okurigana',
      anchor: { from: 't3', to: 't3' },
      value: 'ブ',
    });

    const html = render(doc, { profile: PROFILES.learningBasic }).html;

    // kaeri should be visible (learningBasic: kaeriten=true)
    expect(html).toContain('skam-kaeriten');
    expect(html).toContain('\u3191'); // レ
    // yomigana should be hidden (learningBasic: yomigana=false)
    expect(html).not.toContain('まな');
    // okurigana should be hidden (learningBasic: okurigana=false)
    expect(html).not.toContain('ブ');
  });
});
