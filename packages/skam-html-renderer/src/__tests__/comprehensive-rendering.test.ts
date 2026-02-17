/**
 * 包括的レンダリングテスト
 *
 * 構成要素の積（組み合わせ）の観点から、
 * 既存テストで不足しているケースを網羅的にカバーする。
 *
 * カバー範囲:
 * 1. Multi-token range rendering（各マーク種別）
 * 2. Mark combination rendering（同一トークン上の複数マーク）
 * 3. Kaeri value variations（全返り点 Unicode マッピング）
 * 4. Emphasis style variations（全スタイル）
 * 5. Highlight style variations（全スタイル）
 * 6. Ref format variations（全10フォーマット）
 * 7. Saidoku form variations
 * 8. Okototen grid/shape variations
 * 9. Complex document rendering（全マーク種別混在）
 * 10. Writing mode × mark type interactions
 */
import { describe, it, expect } from 'vitest';
import type { SKAMDocument, Mark } from '@kanbun/skam';
import { KAERI } from '@kanbun/skam';
import { render, PROFILES } from '../index.js';
import { expectCSSRule, expectCSSRuleLacksDeclaration } from './helpers/css-contract.js';

// ============================================================================
// Test Helpers
// ============================================================================

/** 単一トークン、1ブロックのドキュメント */
function createSingleTokenDoc(text: string, marks: Mark[] = []): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [{ id: 't1', text }],
    blocks: [{ id: 'b1', tokenIds: ['t1'] }],
    marks,
    readings: [],
  };
}

/** 2トークン、1ブロックのドキュメント */
function createTwoTokenDoc(text1: string, text2: string, marks: Mark[] = []): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: text1 },
      { id: 't2', text: text2 },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
    marks,
    readings: [],
  };
}

/** 3トークン、1ブロックのドキュメント */
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

/** 5トークン、1ブロック（「學而時習之」用） */
function createFiveTokenDoc(marks: Mark[] = []): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '學' },
      { id: 't2', text: '而' },
      { id: 't3', text: '時' },
      { id: 't4', text: '習' },
      { id: 't5', text: '之' },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4', 't5'] }],
    marks,
    readings: [],
  };
}

/** 2ブロックドキュメント */
function createMultiBlockDoc(marks: Mark[] = []): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '子' },
      { id: 't2', text: '曰' },
      { id: 't3', text: '學' },
      { id: 't4', text: '而' },
      { id: 't5', text: '時' },
      { id: 't6', text: '習' },
    ],
    blocks: [
      { id: 'b1', tokenIds: ['t1', 't2', 't3'] },
      { id: 'b2', tokenIds: ['t4', 't5', 't6'] },
    ],
    marks,
    readings: [],
  };
}

// ============================================================================
// 1. Multi-token range rendering
// ============================================================================

describe('Multi-token range rendering', () => {
  describe('multi-token yomigana (jukugo ruby)', () => {
    it('2-token yomigana: segments token texts with base-seg spans', () => {
      const doc = createTwoTokenDoc('朝', '廷', [
        { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'ちょうてい' },
      ]);
      const { html } = render(doc);
      // Multi-token base text is segmented into individual spans
      expect(html).toContain('skam-base-seg');
      expect(html).toContain('朝');
      expect(html).toContain('廷');
      expect(html).toContain('ちょうてい');
      expect(html).toContain('skam-ruby');
    });

    it('3-token yomigana: segments all token texts with base-seg spans', () => {
      const doc = createThreeTokenDoc('自', '由', '民', [
        { type: 'yomigana', anchor: { from: 't1', to: 't3' }, value: 'じゆうみん' },
      ]);
      const { html } = render(doc);
      expect(html).toContain('skam-base-seg');
      expect(html).toContain('自');
      expect(html).toContain('由');
      expect(html).toContain('民');
      expect(html).toContain('じゆうみん');
    });

    it('2-token yomigana with interactive: data-token-from/to', () => {
      const doc = createTwoTokenDoc('朝', '廷', [
        { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'ちょうてい' },
      ]);
      const { html } = render(doc, { interactive: true });
      expect(html).toContain('data-token-from="t1"');
      expect(html).toContain('data-token-to="t2"');
    });

    it('multi-char yomi with single token', () => {
      const doc = createSingleTokenDoc('學', [
        { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まなぶ' },
      ]);
      const { html } = render(doc);
      expect(html).toContain('まなぶ');
      expect(html).toContain('skam-ruby');
    });
  });

  describe('multi-token okurigana', () => {
    it('2-token range okurigana', () => {
      const doc = createTwoTokenDoc('自', '然', [
        { type: 'okurigana', anchor: { from: 't1', to: 't2' }, value: 'と' },
      ]);
      const { html } = render(doc);
      expect(html).toContain('skam-okuri');
      expect(html).toContain('と');
    });

    it('multi-char okurigana on single token', () => {
      const doc = createSingleTokenDoc('學', [
        { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'びて' },
      ]);
      const { html } = render(doc);
      expect(html).toContain('びて');
      expect(html).toContain('skam-okuri');
    });
  });

  describe('multi-token soegana', () => {
    it('2-token range soegana', () => {
      const doc = createTwoTokenDoc('天', '下', [
        { type: 'soegana', anchor: { from: 't1', to: 't2' }, value: 'をば' },
      ]);
      const { html } = render(doc);
      expect(html).toContain('skam-soegana');
      expect(html).toContain('をば');
    });
  });

  describe('multi-token emphasis', () => {
    it('3-token range emphasis', () => {
      const doc = createThreeTokenDoc('子', '曰', '學', [
        { type: 'emphasis', anchor: { from: 't1', to: 't3' }, style: 'filled dot' },
      ]);
      const { html } = render(doc);
      expect(html).toContain('skam-emphasis');
      // All 3 tokens should have emphasis style applied
      // Count occurrences of emphasis style
      const emphasisCount = (html.match(/text-emphasis-style/g) ?? []).length;
      expect(emphasisCount).toBeGreaterThanOrEqual(3);
    });

    it('2-token range emphasis with different style', () => {
      const doc = createTwoTokenDoc('重', '要', [
        { type: 'emphasis', anchor: { from: 't1', to: 't2' }, style: 'open circle' },
      ]);
      const { html } = render(doc);
      expect(html).toContain('skam-emphasis');
      expect(html).toContain('text-emphasis-style: open circle');
    });
  });

  describe('multi-token highlight', () => {
    it('3-token range highlight', () => {
      const doc = createThreeTokenDoc('子', '曰', '學', [
        { type: 'highlight', anchor: { from: 't1', to: 't3' }, style: 'solid' },
      ]);
      const { html } = render(doc);
      expect(html).toContain('skam-highlight');
      expect(html).toContain('data-style="solid"');
    });

    it('multi-token highlight with wavy style', () => {
      const doc = createThreeTokenDoc('子', '曰', '學', [
        { type: 'highlight', anchor: { from: 't1', to: 't3' }, style: 'wavy' },
      ]);
      const { html } = render(doc);
      expect(html).toContain('data-style="wavy"');
    });
  });

  describe('multi-token tateten', () => {
    it('3-token tateten group', () => {
      const doc = createThreeTokenDoc('朝', '聞', '道', [
        { type: 'tateten', anchor: { from: 't1', to: 't3' } },
      ]);
      const { html } = render(doc);
      expect(html).toContain('skam-tateten-group');
      expect(html).toContain('skam-tateten-mark');
    });
  });

  describe('multi-token okimoji', () => {
    it('2-token okimoji range', () => {
      const doc = createTwoTokenDoc('於', '是', [
        { type: 'okimoji', anchor: { from: 't1', to: 't2' } },
      ]);
      const { html } = render(doc);
      expect(html).toContain('skam-okimoji');
    });

    it('3-token okimoji range: all tokens should have okimoji class', () => {
      const doc = createThreeTokenDoc('於', '是', '乎', [
        { type: 'okimoji', anchor: { from: 't1', to: 't3' } },
      ]);
      const { html } = render(doc);
      // All 3 tokens should have okimoji class applied
      const okimojiCount = (html.match(/skam-okimoji/g) ?? []).length;
      expect(okimojiCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('multi-token joji', () => {
    it('2-token joji range', () => {
      const doc = createTwoTokenDoc('而', '已', [
        { type: 'joji', anchor: { from: 't1', to: 't2' } },
      ]);
      const { html } = render(doc);
      expect(html).toContain('skam-joji');
    });

    it('3-token joji range: all tokens should have joji class', () => {
      const doc = createThreeTokenDoc('之', '乎', '矣', [
        { type: 'joji', anchor: { from: 't1', to: 't3' } },
      ]);
      const { html } = render(doc);
      // All 3 tokens should have joji class applied
      const jojiCount = (html.match(/skam-joji/g) ?? []).length;
      expect(jojiCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('multi-token kaeri', () => {
    it('3-token kaeri range: kaeriten should be rendered', () => {
      const doc = createThreeTokenDoc('不', '可', '得', [
        { type: 'kaeri', position: { blockId: 'b1', after: 't3' }, value: '㆒' },
      ]);
      const { html } = render(doc);
      // Kaeriten should be applied
      const kaeriCount = (html.match(/skam-kaeriten/g) ?? []).length;
      expect(kaeriCount).toBeGreaterThanOrEqual(1);
    });
  });
});

// ============================================================================
// 2. Mark combination rendering（同一トークン上の複数マーク）
// ============================================================================

describe('Mark combination rendering', () => {
  it('yomigana + okurigana on same token', () => {
    const doc = createSingleTokenDoc('學', [
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まな' },
      { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'びて' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('まな');
    expect(html).toContain('びて');
    expect(html).toContain('skam-ruby');
    expect(html).toContain('skam-okuri');
  });

  it('yomigana + kaeri on same token', () => {
    const doc = createSingleTokenDoc('習', [
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'なら' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆑' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('なら');
    expect(html).toContain('skam-kaeriten');
    expect(html).toContain(KAERI.RE); // レ
  });

  it('yomigana + okurigana + kaeri on same token', () => {
    const doc = createSingleTokenDoc('習', [
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'なら' },
      { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ふ' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆑' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('なら');
    expect(html).toContain('ふ');
    expect(html).toContain(KAERI.RE); // レ
    expect(html).toContain('skam-ruby');
    expect(html).toContain('skam-okuri');
    expect(html).toContain('skam-kaeriten');
  });

  it('yomigana + okurigana + kaeri + soegana on same token', () => {
    const doc = createSingleTokenDoc('學', [
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まな' },
      { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ブ' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆓' },
      { type: 'soegana', anchor: { from: 't1', to: 't1' }, value: 'を' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('まな');
    expect(html).toContain('ブ');
    expect(html).toContain(KAERI.NI); // 二
    expect(html).toContain('を');
    expect(html).toContain('skam-ruby');
    expect(html).toContain('skam-okuri');
    expect(html).toContain('skam-kaeriten');
    expect(html).toContain('skam-soegana');
  });

  it('emphasis + yomigana + okurigana on same token', () => {
    const doc = createSingleTokenDoc('學', [
      { type: 'emphasis', anchor: { from: 't1', to: 't1' }, style: 'filled dot' },
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まな' },
      { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ブ' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('skam-emphasis');
    expect(html).toContain('まな');
    expect(html).toContain('ブ');
  });

  it('okimoji + kaeri on same token', () => {
    const doc = createSingleTokenDoc('而', [
      { type: 'okimoji', anchor: { from: 't1', to: 't1' } },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆒' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('skam-okimoji');
    expect(html).toContain('skam-kaeriten');
    expect(html).toContain(KAERI.ICHI); // 一
  });

  it('joji + okurigana on same token', () => {
    const doc = createSingleTokenDoc('之', [
      { type: 'joji', anchor: { from: 't1', to: 't1' } },
      { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'の' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('skam-joji');
    expect(html).toContain('の');
  });

  it('anchor mark + kutoten after same token', () => {
    const doc = createSingleTokenDoc('乎', [
      { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'や' },
      { type: 'kutoten', position: { blockId: 'b1', after: 't1' }, value: '。' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('skam-okuri');
    expect(html).toContain('や');
    expect(html).toContain('skam-suffix-kutoten');
    expect(html).toContain('。');
  });

  it('yomigana + ref after same token', () => {
    const doc = createSingleTokenDoc('學', [
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まな' },
      { type: 'ref', position: { blockId: 'b1', after: 't1' }, format: 'iroha-katakana' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('まな');
    expect(html).toContain('skam-ref');
    expect(html).toContain('イ');
  });

  it('highlight range with yomigana on inner tokens', () => {
    const doc = createThreeTokenDoc('學', '而', '時', [
      { type: 'highlight', anchor: { from: 't1', to: 't3' }, style: 'solid' },
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まな' },
      { type: 'yomigana', anchor: { from: 't3', to: 't3' }, value: 'とき' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('skam-highlight');
    expect(html).toContain('まな');
    expect(html).toContain('とき');
  });

  it('highlight range with okurigana + kaeri on inner tokens', () => {
    const doc = createThreeTokenDoc('不', '能', '爲', [
      { type: 'highlight', anchor: { from: 't1', to: 't3' }, style: 'solid' },
      { type: 'okurigana', anchor: { from: 't2', to: 't2' }, value: 'ハズ' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: '㆑' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('skam-highlight');
    expect(html).toContain('ハズ');
    expect(html).toContain('skam-kaeriten');
  });

  it('tateten + yomigana on grouped tokens', () => {
    const doc = createTwoTokenDoc('朝', '聞', [
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'ちょうもん' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('skam-tateten-group');
    expect(html).toContain('ちょうもん');
  });

  it('tateten + yomigana: tateten-mark separator preserved between tokens', () => {
    const doc = createTwoTokenDoc('朝', '聞', [
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'ちょうもん' },
    ]);
    const { html } = render(doc);
    // tateten-mark separator should exist between grouped tokens
    // even when multi-token yomigana spans the same range
    expect(html).toContain('skam-tateten-mark');
  });

  it('tateten + okurigana: tateten-mark separator preserved between tokens', () => {
    const doc = createTwoTokenDoc('朝', '聞', [
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'okurigana', anchor: { from: 't1', to: 't2' }, value: 'き' },
    ]);
    const { html } = render(doc);
    // tateten-mark separator should exist between grouped tokens
    // even when multi-token okurigana spans the same range
    expect(html).toContain('skam-tateten-mark');
  });

  it('3-token tateten + yomigana: all tateten-mark separators preserved', () => {
    const doc = createThreeTokenDoc('朝', '聞', '道', [
      { type: 'tateten', anchor: { from: 't1', to: 't3' } },
      { type: 'yomigana', anchor: { from: 't1', to: 't3' }, value: 'ちょうもんどう' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('skam-tateten-group');
    expect(html).toContain('ちょうもんどう');
    // 3 tokens should have 2 tateten-mark separators
    const markCount = (html.match(/skam-tateten-mark/g) ?? []).length;
    expect(markCount).toBe(2);
  });

  it('tateten + soegana: tateten-mark separator preserved between tokens', () => {
    const doc = createTwoTokenDoc('朝', '聞', [
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'soegana', anchor: { from: 't1', to: 't2' }, value: 'を' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('skam-tateten-mark');
  });

  it('emphasis range + tateten on same range', () => {
    const doc = createTwoTokenDoc('天', '道', [
      { type: 'emphasis', anchor: { from: 't1', to: 't2' }, style: 'filled dot' },
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
    ]);
    const { html } = render(doc);
    expect(html).toContain('skam-emphasis');
    expect(html).toContain('skam-tateten-group');
  });

  // Range kana marks merge tokens, causing per-token marks on middle tokens to be lost
  // trailing marks (kaeri, kutoten, ref) are collected, but other marks are not

  it('range yomigana + okimoji on middle token: okimoji should be preserved', () => {
    const doc = createThreeTokenDoc('於', '是', '乎', [
      { type: 'yomigana', anchor: { from: 't1', to: 't3' }, value: 'ここに' },
      { type: 'okimoji', anchor: { from: 't2', to: 't2' } },
    ]);
    const { html } = render(doc);
    expect(html).toContain('ここに');
    // okimoji on the middle token should still be reflected in the output
    expect(html).toContain('skam-okimoji');
  });

  it('range yomigana + joji on middle token: joji should be preserved', () => {
    const doc = createThreeTokenDoc('不', '之', '得', [
      { type: 'yomigana', anchor: { from: 't1', to: 't3' }, value: 'えざる' },
      { type: 'joji', anchor: { from: 't2', to: 't2' } },
    ]);
    const { html } = render(doc);
    expect(html).toContain('えざる');
    // joji on the middle token should still be reflected in the output
    expect(html).toContain('skam-joji');
  });

  it('range yomigana + emphasis on middle token: emphasis should be preserved', () => {
    const doc = createThreeTokenDoc('天', '地', '人', [
      { type: 'yomigana', anchor: { from: 't1', to: 't3' }, value: 'てんちじん' },
      { type: 'emphasis', anchor: { from: 't2', to: 't2' }, style: 'filled dot' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('てんちじん');
    // emphasis on the middle token should still be reflected in the output
    expect(html).toContain('skam-emphasis');
  });

  it('range okurigana + okimoji on middle token: okimoji should be preserved', () => {
    const doc = createThreeTokenDoc('於', '是', '乎', [
      { type: 'okurigana', anchor: { from: 't1', to: 't3' }, value: 'ニ' },
      { type: 'okimoji', anchor: { from: 't2', to: 't2' } },
    ]);
    const { html } = render(doc);
    expect(html).toContain('ニ');
    // okimoji on the middle token should still be reflected
    expect(html).toContain('skam-okimoji');
  });
});

// ============================================================================
// 3. Kaeri value variations（全返り点 Unicode マッピング）
// ============================================================================

describe('Kaeri value rendering variations', () => {
  const kaeriExpected: Array<{ value: string; unicode: string; label: string }> = [
    { value: '㆑', unicode: KAERI.RE, label: 're' },
    { value: '㆒', unicode: KAERI.ICHI, label: 'ichi' },
    { value: '㆓', unicode: KAERI.NI, label: 'ni' },
    { value: '㆔', unicode: KAERI.SAN, label: 'san' },
    { value: '㆕', unicode: KAERI.SHI, label: 'shi' },
    { value: '㆖', unicode: KAERI.JO, label: 'jou' },
    { value: '㆗', unicode: KAERI.CHU, label: 'chuu' },
    { value: '㆘', unicode: KAERI.GE, label: 'ge' },
    { value: '㆙', unicode: KAERI.KO, label: 'kou' },
    { value: '㆚', unicode: KAERI.OTSU, label: 'otsu' },
    { value: '㆛', unicode: KAERI.HEI, label: 'hei' },
    { value: '㆜', unicode: KAERI.TEI, label: 'tei' },
    { value: '㆝', unicode: KAERI.TEN, label: 'ten' },
    { value: '㆞', unicode: KAERI.CHI, label: 'chi' },
    { value: '㆟', unicode: KAERI.JIN, label: 'jin' },
  ];

  for (const { value, unicode, label } of kaeriExpected) {
    it(`kaeri ${label}（${value}）→ Unicode ${unicode.codePointAt(0)?.toString(16)}`, () => {
      const doc = createSingleTokenDoc('漢', [
        { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value },
      ]);
      const { html } = render(doc);
      expect(html).toContain('skam-kaeriten');
      expect(html).toContain(unicode);
    });
  }

  describe('compound kaeri values', () => {
    it('一レ → 一 + レ Unicode', () => {
      const doc = createSingleTokenDoc('不', [
        { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆒㆑' },
      ]);
      const { html } = render(doc);
      expect(html).toContain(KAERI.ICHI + KAERI.RE); // 一レ
    });

    it('二レ → 二 + レ Unicode', () => {
      const doc = createSingleTokenDoc('不', [
        { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆓㆑' },
      ]);
      const { html } = render(doc);
      expect(html).toContain(KAERI.NI + KAERI.RE); // 二レ
    });

    it('上レ → 上 + レ Unicode', () => {
      const doc = createSingleTokenDoc('不', [
        { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆖㆑' },
      ]);
      const { html } = render(doc);
      expect(html).toContain(KAERI.JO + KAERI.RE); // 上レ
    });

    it('甲レ → 甲 + レ Unicode', () => {
      const doc = createSingleTokenDoc('不', [
        { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆙㆑' },
      ]);
      const { html } = render(doc);
      expect(html).toContain(KAERI.KO + KAERI.RE); // 甲レ
    });

    it('天レ → 天 + レ Unicode', () => {
      const doc = createSingleTokenDoc('不', [
        { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆝㆑' },
      ]);
      const { html } = render(doc);
      expect(html).toContain(KAERI.TEN + KAERI.RE); // 天レ
    });
  });
});

// ============================================================================
// 4. Emphasis style variations
// ============================================================================

describe('Emphasis style rendering variations', () => {
  const emphasisStyles = [
    { style: 'dot', expected: 'text-emphasis-style: dot' },
    { style: 'circle', expected: 'text-emphasis-style: circle' },
    { style: 'double-circle', expected: 'text-emphasis-style: double-circle' },
    { style: 'triangle', expected: 'text-emphasis-style: triangle' },
    { style: 'sesame', expected: 'text-emphasis-style: sesame' },
    { style: 'filled dot', expected: 'text-emphasis-style: filled dot' },
    { style: 'filled circle', expected: 'text-emphasis-style: filled circle' },
    { style: 'filled sesame', expected: 'text-emphasis-style: filled sesame' },
    { style: 'filled triangle', expected: 'text-emphasis-style: filled triangle' },
    { style: 'filled double-circle', expected: 'text-emphasis-style: filled double-circle' },
    { style: 'open dot', expected: 'text-emphasis-style: open dot' },
    { style: 'open circle', expected: 'text-emphasis-style: open circle' },
    { style: 'open sesame', expected: 'text-emphasis-style: open sesame' },
    { style: 'open triangle', expected: 'text-emphasis-style: open triangle' },
    { style: 'open double-circle', expected: 'text-emphasis-style: open double-circle' },
  ];

  for (const { style, expected } of emphasisStyles) {
    it(`emphasis style: ${style}`, () => {
      const doc = createSingleTokenDoc('道', [
        { type: 'emphasis', anchor: { from: 't1', to: 't1' }, style },
      ]);
      const { html } = render(doc);
      expect(html).toContain('skam-emphasis');
      expect(html).toContain(expected);
    });
  }

  it('emphasis without style (default: filled dot)', () => {
    const doc = createSingleTokenDoc('道', [
      { type: 'emphasis', anchor: { from: 't1', to: 't1' } },
    ]);
    const { html } = render(doc);
    expect(html).toContain('skam-emphasis');
    expect(html).toContain('text-emphasis-style: filled dot');
  });

  it('emphasis with custom character', () => {
    const doc = createSingleTokenDoc('道', [
      { type: 'emphasis', anchor: { from: 't1', to: 't1' }, style: '★' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('skam-emphasis');
    // Custom character should be rendered as-is in style attribute
    expect(html).toContain('text-emphasis-style: ★');
  });
});

// ============================================================================
// 5. Highlight style variations
// ============================================================================

describe('Highlight style rendering variations', () => {
  const highlightStyles = ['solid', 'dotted', 'dashed', 'wavy', 'double'] as const;

  for (const style of highlightStyles) {
    it(`highlight style: ${style}`, () => {
      const doc = createTwoTokenDoc('重', '要', [
        { type: 'highlight', anchor: { from: 't1', to: 't2' }, style },
      ]);
      const { html } = render(doc);
      expect(html).toContain('skam-highlight');
      expect(html).toContain(`data-style="${style}"`);
    });
  }

  it('highlight without style (default)', () => {
    const doc = createTwoTokenDoc('重', '要', [
      { type: 'highlight', anchor: { from: 't1', to: 't2' } },
    ]);
    const { html } = render(doc);
    expect(html).toContain('skam-highlight');
  });
});

// ============================================================================
// 6. Ref format variations（全10フォーマット）
// ============================================================================

describe('Ref format rendering variations', () => {
  it('alpha-upper: (A)', () => {
    const doc = createSingleTokenDoc('語', [
      { type: 'ref', position: { blockId: 'b1', after: 't1' }, format: 'alpha-upper' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('(A)');
    expect(html).toContain('skam-ref');
  });

  it('alpha-lower: (a)', () => {
    const doc = createSingleTokenDoc('語', [
      { type: 'ref', position: { blockId: 'b1', after: 't1' }, format: 'alpha-lower' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('(a)');
  });

  it('numeric-paren: (1)', () => {
    const doc = createSingleTokenDoc('語', [
      { type: 'ref', position: { blockId: 'b1', after: 't1' }, format: 'numeric-paren' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('(1)');
  });

  it('numeric-bracket: [1]', () => {
    const doc = createSingleTokenDoc('語', [
      { type: 'ref', position: { blockId: 'b1', after: 't1' }, format: 'numeric-bracket' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('[1]');
  });

  it('numeric-circled: ①', () => {
    const doc = createSingleTokenDoc('語', [
      { type: 'ref', position: { blockId: 'b1', after: 't1' }, format: 'numeric-circled' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('①');
  });

  it('iroha-katakana: （イ）', () => {
    const doc = createSingleTokenDoc('語', [
      { type: 'ref', position: { blockId: 'b1', after: 't1' }, format: 'iroha-katakana' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('（イ）');
  });

  it('iroha-hiragana: （い）', () => {
    const doc = createSingleTokenDoc('語', [
      { type: 'ref', position: { blockId: 'b1', after: 't1' }, format: 'iroha-hiragana' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('（い）');
  });

  it('gojuon-katakana: （ア）', () => {
    const doc = createSingleTokenDoc('語', [
      { type: 'ref', position: { blockId: 'b1', after: 't1' }, format: 'gojuon-katakana' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('（ア）');
  });

  it('gojuon-hiragana: （あ）', () => {
    const doc = createSingleTokenDoc('語', [
      { type: 'ref', position: { blockId: 'b1', after: 't1' }, format: 'gojuon-hiragana' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('（あ）');
  });

  it('kanji-numeric: （一）', () => {
    const doc = createSingleTokenDoc('語', [
      { type: 'ref', position: { blockId: 'b1', after: 't1' }, format: 'kanji-numeric' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('（一）');
  });

  describe('multiple refs with sequential numbering', () => {
    it('alpha-upper: (A), (B), (C)', () => {
      const doc = createThreeTokenDoc('一', '二', '三', [
        { type: 'ref', position: { blockId: 'b1', after: 't1' }, format: 'alpha-upper' },
        { type: 'ref', position: { blockId: 'b1', after: 't2' }, format: 'alpha-upper' },
        { type: 'ref', position: { blockId: 'b1', after: 't3' }, format: 'alpha-upper' },
      ]);
      const { html } = render(doc);
      expect(html).toContain('(A)');
      expect(html).toContain('(B)');
      expect(html).toContain('(C)');
    });

    it('iroha-katakana: （イ）,（ロ）,（ハ）', () => {
      const doc = createThreeTokenDoc('一', '二', '三', [
        { type: 'ref', position: { blockId: 'b1', after: 't1' }, format: 'iroha-katakana' },
        { type: 'ref', position: { blockId: 'b1', after: 't2' }, format: 'iroha-katakana' },
        { type: 'ref', position: { blockId: 'b1', after: 't3' }, format: 'iroha-katakana' },
      ]);
      const { html } = render(doc);
      expect(html).toContain('（イ）');
      expect(html).toContain('（ロ）');
      expect(html).toContain('（ハ）');
    });

    it('numeric-circled: ①, ②, ③', () => {
      const doc = createThreeTokenDoc('一', '二', '三', [
        { type: 'ref', position: { blockId: 'b1', after: 't1' }, format: 'numeric-circled' },
        { type: 'ref', position: { blockId: 'b1', after: 't2' }, format: 'numeric-circled' },
        { type: 'ref', position: { blockId: 'b1', after: 't3' }, format: 'numeric-circled' },
      ]);
      const { html } = render(doc);
      expect(html).toContain('①');
      expect(html).toContain('②');
      expect(html).toContain('③');
    });
  });

  it('ref with label (plain text)', () => {
    const doc = createSingleTokenDoc('語', [
      { type: 'ref', position: { blockId: 'b1', after: 't1' }, label: '※注' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('※注');
  });

  it('ref with content generates notes section', () => {
    const doc = createSingleTokenDoc('學', [
      {
        type: 'ref',
        position: { blockId: 'b1', after: 't1' },
        content: '學問に励むこと。',
      },
    ]);
    const { html } = render(doc);
    expect(html).toContain('skam-notes');
    expect(html).toContain('學問に励むこと。');
    expect(html).toContain('[1]'); // auto-numbered
  });
});

// ============================================================================
// 7. Saidoku form variations
// ============================================================================

describe('Saidoku rendering variations', () => {
  it('forms with only yomi (no okuri)', () => {
    const doc = createSingleTokenDoc('將', [
      {
        type: 'saidoku',
        anchor: { from: 't1', to: 't1' },
        forms: [
          { n: 1, yomi: 'まさに' },
          { n: 2, yomi: 'べし' },
        ],
      },
    ]);
    const { html } = render(doc);
    expect(html).toContain('skam-saidoku');
    expect(html).toContain('まさに');
    expect(html).toContain('data-saidoku-n="1"');
    expect(html).toContain('data-saidoku-n="2"');
  });

  it('forms with only okuri (no yomi)', () => {
    const doc = createSingleTokenDoc('須', [
      {
        type: 'saidoku',
        anchor: { from: 't1', to: 't1' },
        forms: [
          { n: 1, okuri: 'く' },
          { n: 2, okuri: 'し' },
        ],
      },
    ]);
    const { html } = render(doc);
    expect(html).toContain('skam-saidoku');
    expect(html).toContain('く');
    expect(html).toContain('し');
  });

  it('forms with mixed yomi/okuri', () => {
    const doc = createSingleTokenDoc('將', [
      {
        type: 'saidoku',
        anchor: { from: 't1', to: 't1' },
        forms: [
          { n: 1, yomi: 'まさ', okuri: 'に' },
          { n: 2, okuri: 'す' },
        ],
      },
    ]);
    const { html } = render(doc);
    expect(html).toContain('まさ');
    expect(html).toContain('に');
    expect(html).toContain('す');
    // First form's okuri is in suffix-okuri, second in suffix-saidoku
    expect(html).toContain('skam-suffix-okuri');
    expect(html).toContain('skam-suffix-saidoku');
  });

  it('3-form saidoku', () => {
    const doc = createSingleTokenDoc('將', [
      {
        type: 'saidoku',
        anchor: { from: 't1', to: 't1' },
        forms: [
          { n: 1, yomi: 'まさ', okuri: 'に' },
          { n: 2, yomi: 'べ', okuri: 'し' },
          { n: 3, okuri: 'む' },
        ],
      },
    ]);
    const { html } = render(doc);
    expect(html).toContain('data-saidoku-n="1"');
    expect(html).toContain('data-saidoku-n="2"');
    expect(html).toContain('data-saidoku-n="3"');
  });

  it('saidoku with multi-char yomi', () => {
    const doc = createSingleTokenDoc('宜', [
      {
        type: 'saidoku',
        anchor: { from: 't1', to: 't1' },
        forms: [
          { n: 1, yomi: 'よろしく', okuri: 'は' },
          { n: 2, okuri: 'し' },
        ],
      },
    ]);
    const { html } = render(doc);
    expect(html).toContain('よろしく');
    expect(html).toContain('は');
  });

  it('saidoku + kaeri on same token', () => {
    const doc = createSingleTokenDoc('將', [
      {
        type: 'saidoku',
        anchor: { from: 't1', to: 't1' },
        forms: [
          { n: 1, yomi: 'まさ', okuri: 'に' },
          { n: 2, okuri: 'す' },
        ],
      },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆓' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('skam-saidoku');
    expect(html).toContain('skam-kaeriten');
    expect(html).toContain(KAERI.NI); // 二
  });

  it('saidoku with interactive mode', () => {
    const doc = createSingleTokenDoc('將', [
      {
        type: 'saidoku',
        anchor: { from: 't1', to: 't1' },
        forms: [
          { n: 1, yomi: 'まさ', okuri: 'に' },
          { n: 2, okuri: 'す' },
        ],
      },
    ]);
    const { html } = render(doc, { interactive: true });
    expect(html).toContain('data-token-id="t1"');
  });
});

// ============================================================================
// 8. Okototen grid/shape variations
// ============================================================================

describe('Okototen rendering variations', () => {
  it('5x5 grid at center position', () => {
    const doc = createSingleTokenDoc('國', [
      {
        type: 'okototen',
        anchor: { from: 't1', to: 't1' },
        position: { system: 'glyph-grid', grid: '5x5', x: 2, y: 2 },
        shape: 'dot',
      },
    ]);
    const { html } = render(doc);
    expect(html).toContain('skam-has-okototen');
    expect(html).toContain('skam-okototen');
    expect(html).toContain('data-shape="dot"');
    expect(html).toContain('--okototen-x: 2');
    expect(html).toContain('--okototen-y: 2');
    expect(html).toContain('--okototen-grid: 5');
  });

  it('7x7 grid', () => {
    const doc = createSingleTokenDoc('國', [
      {
        type: 'okototen',
        anchor: { from: 't1', to: 't1' },
        position: { system: 'glyph-grid', grid: '7x7', x: 6, y: 6 },
        shape: 'circle',
      },
    ]);
    const { html } = render(doc);
    expect(html).toContain('--okototen-grid: 7');
    expect(html).toContain('--okototen-x: 6');
    expect(html).toContain('--okototen-y: 6');
    expect(html).toContain('data-shape="circle"');
  });

  it('different shapes: dot', () => {
    const doc = createSingleTokenDoc('漢', [
      {
        type: 'okototen',
        anchor: { from: 't1', to: 't1' },
        position: { system: 'glyph-grid', grid: '5x5', x: 4, y: 4 },
        shape: 'dot',
      },
    ]);
    const { html } = render(doc);
    expect(html).toContain('data-shape="dot"');
  });

  it('different shapes: circle', () => {
    const doc = createSingleTokenDoc('漢', [
      {
        type: 'okototen',
        anchor: { from: 't1', to: 't1' },
        position: { system: 'glyph-grid', grid: '5x5', x: 4, y: 4 },
        shape: 'circle',
      },
    ]);
    const { html } = render(doc);
    expect(html).toContain('data-shape="circle"');
  });

  it('different shapes: line', () => {
    const doc = createSingleTokenDoc('漢', [
      {
        type: 'okototen',
        anchor: { from: 't1', to: 't1' },
        position: { system: 'glyph-grid', grid: '5x5', x: 4, y: 4 },
        shape: 'line',
      },
    ]);
    const { html } = render(doc);
    expect(html).toContain('data-shape="line"');
  });

  it('corner positions (0,0) and (4,4)', () => {
    const doc = createSingleTokenDoc('漢', [
      {
        type: 'okototen',
        anchor: { from: 't1', to: 't1' },
        position: { system: 'glyph-grid', grid: '5x5', x: 0, y: 0 },
        shape: 'dot',
      },
    ]);
    const { html } = render(doc);
    expect(html).toContain('--okototen-x: 0');
    expect(html).toContain('--okototen-y: 0');
  });

  it('multiple okototen on same token', () => {
    const doc = createSingleTokenDoc('國', [
      {
        type: 'okototen',
        anchor: { from: 't1', to: 't1' },
        position: { system: 'glyph-grid', grid: '5x5', x: 0, y: 0 },
        shape: 'dot',
      },
      {
        type: 'okototen',
        anchor: { from: 't1', to: 't1' },
        position: { system: 'glyph-grid', grid: '5x5', x: 4, y: 4 },
        shape: 'circle',
      },
    ]);
    const { html } = render(doc);
    expect(html).toContain('skam-has-okototen');
    // Should have 2 okototen elements
    const okototenCount = (html.match(/skam-okototen"/g) ?? []).length;
    expect(okototenCount).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// 9. Complex document rendering
// ============================================================================

describe('Complex document rendering', () => {
  it('「學而時習之」with full annotations', () => {
    const doc = createFiveTokenDoc([
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まな' },
      { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'びて' },
      { type: 'yomigana', anchor: { from: 't3', to: 't3' }, value: 'とき' },
      { type: 'okurigana', anchor: { from: 't3', to: 't3' }, value: 'に' },
      { type: 'soegana', anchor: { from: 't5', to: 't5' }, value: 'を' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't4' }, value: '㆑' },
      { type: 'yomigana', anchor: { from: 't4', to: 't4' }, value: 'なら' },
      { type: 'okurigana', anchor: { from: 't4', to: 't4' }, value: 'ふ' },
      { type: 'kutoten', position: { blockId: 'b1', after: 't5' }, value: '。', kind: 'ku' },
    ]);

    const { html } = render(doc);

    // All tokens present
    expect(html).toContain('學');
    expect(html).toContain('而');
    expect(html).toContain('時');
    expect(html).toContain('習');
    expect(html).toContain('之');

    // All annotations present
    expect(html).toContain('まな');
    expect(html).toContain('びて');
    expect(html).toContain('とき');
    expect(html).toContain('に');
    expect(html).toContain('を');
    expect(html).toContain('なら');
    expect(html).toContain('ふ');
    expect(html).toContain(KAERI.RE); // レ
    expect(html).toContain('。');

    // CSS classes present
    expect(html).toContain('skam-ruby');
    expect(html).toContain('skam-okuri');
    expect(html).toContain('skam-soegana');
    expect(html).toContain('skam-kaeriten');
    expect(html).toContain('skam-suffix-kutoten');
  });

  it('document with all anchor-based mark types on different tokens', () => {
    const doc = createFiveTokenDoc([
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まな' },
      { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ブ' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: '㆑' },
      { type: 'okimoji', anchor: { from: 't2', to: 't2' } },
      { type: 'soegana', anchor: { from: 't3', to: 't3' }, value: 'を' },
      { type: 'emphasis', anchor: { from: 't4', to: 't4' }, style: 'filled dot' },
      { type: 'tateten', anchor: { from: 't4', to: 't5' } },
    ]);

    const { html } = render(doc);
    expect(html).toContain('skam-ruby');
    expect(html).toContain('skam-okuri');
    expect(html).toContain('skam-kaeriten');
    expect(html).toContain('skam-okimoji');
    expect(html).toContain('skam-soegana');
    expect(html).toContain('skam-emphasis');
    expect(html).toContain('skam-tateten-group');
  });

  it('document with highlight + ref + kutoten', () => {
    const doc = createThreeTokenDoc('重', '要', '語', [
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
        position: { blockId: 'b1', after: 't2' },
        format: 'alpha-upper',
      },
      {
        type: 'kutoten',
        position: { blockId: 'b1', after: 't3' },
        value: '。',
      },
    ]);

    const { html } = render(doc);
    expect(html).toContain('skam-highlight');
    expect(html).toContain('(A)');
    expect(html).toContain('。');
  });

  it('multi-block document with different marks per block', () => {
    const doc = createMultiBlockDoc([
      // Block 1: yomigana + kaeri
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'し' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: '㆑' },
      { type: 'kutoten', position: { blockId: 'b1', after: 't3' }, value: '。' },
      // Block 2: emphasis + okurigana
      { type: 'emphasis', anchor: { from: 't4', to: 't5' }, style: 'filled dot' },
      { type: 'okurigana', anchor: { from: 't6', to: 't6' }, value: 'ふ' },
    ]);

    const { html } = render(doc);
    // Block 1 marks
    expect(html).toContain('し');
    expect(html).toContain(KAERI.RE); // レ
    expect(html).toContain('。');
    // Block 2 marks
    expect(html).toContain('skam-emphasis');
    expect(html).toContain('ふ');
  });

  it('document with reading layer', () => {
    const doc: SKAMDocument = {
      ...createFiveTokenDoc([
        { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まな' },
        { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'びて' },
      ]),
      readings: [
        { kind: 'kakikudashi', text: '學びて時に之を習ふ' },
        { kind: 'yomiage', text: '学びて時に之を習ふ' },
      ],
    };

    const { html } = render(doc);
    expect(html).toContain('skam-reading');
    // Prefers yomiage over kakikudashi
    expect(html).toContain('学びて時に之を習ふ');
  });
});

// ============================================================================
// 10. Writing mode × mark type interactions
// ============================================================================

describe('Writing mode × mark type', () => {
  it('vertical mode: includes vertical-rl CSS', () => {
    const doc = createSingleTokenDoc('學', [
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まな' },
    ]);
    const { html, css } = render(doc, { writingMode: 'vertical' });
    expect(html).toContain('data-writing-mode="vertical"');
    expectCSSRule(css, ':where(.skam-document)', [
      { property: 'writing-mode', value: 'vertical-rl' },
    ]);
  });

  it('horizontal mode: no vertical-rl CSS', () => {
    const doc = createSingleTokenDoc('學', [
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まな' },
    ]);
    const { html, css } = render(doc, { writingMode: 'horizontal' });
    expect(html).toContain('data-writing-mode="horizontal"');
    expectCSSRuleLacksDeclaration(css, ':where(.skam-document)', {
      property: 'writing-mode',
      value: 'vertical-rl',
    });
  });

  it('vertical mode with kaeriten', () => {
    const doc = createSingleTokenDoc('習', [
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆑' },
    ]);
    const { html } = render(doc, { writingMode: 'vertical' });
    expect(html).toContain('skam-kaeriten');
    expect(html).toContain(KAERI.RE);
  });

  it('horizontal mode with kaeriten', () => {
    const doc = createSingleTokenDoc('習', [
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆑' },
    ]);
    const { html } = render(doc, { writingMode: 'horizontal' });
    expect(html).toContain('skam-kaeriten');
    expect(html).toContain(KAERI.RE);
  });

  it('vertical mode with saidoku', () => {
    const doc = createSingleTokenDoc('將', [
      {
        type: 'saidoku',
        anchor: { from: 't1', to: 't1' },
        forms: [
          { n: 1, yomi: 'まさ', okuri: 'に' },
          { n: 2, okuri: 'す' },
        ],
      },
    ]);
    const { html } = render(doc, { writingMode: 'vertical' });
    expect(html).toContain('skam-saidoku');
    expect(html).toContain('まさ');
  });

  it('horizontal mode with saidoku', () => {
    const doc = createSingleTokenDoc('將', [
      {
        type: 'saidoku',
        anchor: { from: 't1', to: 't1' },
        forms: [
          { n: 1, yomi: 'まさ', okuri: 'に' },
          { n: 2, okuri: 'す' },
        ],
      },
    ]);
    const { html } = render(doc, { writingMode: 'horizontal' });
    expect(html).toContain('skam-saidoku');
    expect(html).toContain('まさ');
  });

  it('vertical mode with emphasis', () => {
    const doc = createSingleTokenDoc('道', [
      { type: 'emphasis', anchor: { from: 't1', to: 't1' }, style: 'filled dot' },
    ]);
    const { html } = render(doc, { writingMode: 'vertical' });
    expect(html).toContain('skam-emphasis');
  });

  it('horizontal mode with emphasis', () => {
    const doc = createSingleTokenDoc('道', [
      { type: 'emphasis', anchor: { from: 't1', to: 't1' }, style: 'filled dot' },
    ]);
    const { html } = render(doc, { writingMode: 'horizontal' });
    expect(html).toContain('skam-emphasis');
  });
});

// ============================================================================
// 11. Profile × mark type interactions
// ============================================================================

describe('Profile × mark type interactions', () => {
  describe('learningBasic profile', () => {
    it('hides yomigana', () => {
      const doc = createSingleTokenDoc('學', [
        { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まな' },
      ]);
      const { html } = render(doc, { profile: PROFILES.learningBasic });
      expect(html).not.toContain('まな');
    });

    it('hides okurigana', () => {
      const doc = createSingleTokenDoc('學', [
        { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ブ' },
      ]);
      const { html } = render(doc, { profile: PROFILES.learningBasic });
      expect(html).not.toContain('ブ');
    });

    it('shows kaeriten', () => {
      const doc = createSingleTokenDoc('習', [
        { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆑' },
      ]);
      const { html } = render(doc, { profile: PROFILES.learningBasic });
      expect(html).toContain('skam-kaeriten');
      expect(html).toContain(KAERI.RE);
    });

    it('shows kutoten', () => {
      const doc = createSingleTokenDoc('乎', [
        { type: 'kutoten', position: { blockId: 'b1', after: 't1' }, value: '。' },
      ]);
      const { html } = render(doc, { profile: PROFILES.learningBasic });
      expect(html).toContain('。');
    });

    it('shows highlight', () => {
      const doc = createTwoTokenDoc('重', '要', [
        { type: 'highlight', anchor: { from: 't1', to: 't2' }, style: 'solid' },
      ]);
      const { html } = render(doc, { profile: PROFILES.learningBasic });
      expect(html).toContain('skam-highlight');
    });

    it('shows ref', () => {
      const doc = createSingleTokenDoc('語', [
        { type: 'ref', position: { blockId: 'b1', after: 't1' }, format: 'alpha-upper' },
      ]);
      const { html } = render(doc, { profile: PROFILES.learningBasic });
      expect(html).toContain('(A)');
    });
  });

  describe('learningHint profile', () => {
    it('hides yomigana but shows okurigana', () => {
      const doc = createSingleTokenDoc('學', [
        { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まな' },
        { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ブ' },
      ]);
      const { html } = render(doc, { profile: PROFILES.learningHint });
      expect(html).not.toContain('まな');
      expect(html).toContain('ブ');
    });

    it('shows soegana', () => {
      const doc = createSingleTokenDoc('之', [
        { type: 'soegana', anchor: { from: 't1', to: 't1' }, value: 'を' },
      ]);
      const { html } = render(doc, { profile: PROFILES.learningHint });
      expect(html).toContain('を');
    });

    it('shows kaeriten', () => {
      const doc = createSingleTokenDoc('習', [
        { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆑' },
      ]);
      const { html } = render(doc, { profile: PROFILES.learningHint });
      expect(html).toContain(KAERI.RE);
    });
  });

  describe('full profile', () => {
    it('shows all mark types', () => {
      const doc = createFiveTokenDoc([
        { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まな' },
        { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ブ' },
        { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: '㆑' },
        { type: 'soegana', anchor: { from: 't3', to: 't3' }, value: 'を' },
        { type: 'emphasis', anchor: { from: 't4', to: 't4' }, style: 'filled dot' },
        { type: 'highlight', anchor: { from: 't4', to: 't5' }, style: 'solid' },
      ]);
      const { html } = render(doc, { profile: PROFILES.full });
      expect(html).toContain('まな');
      expect(html).toContain('ブ');
      expect(html).toContain(KAERI.RE);
      expect(html).toContain('を');
      expect(html).toContain('skam-emphasis');
      expect(html).toContain('skam-highlight');
    });
  });

  describe('custom profile', () => {
    it('emphasis=false hides emphasis', () => {
      const doc = createSingleTokenDoc('道', [
        { type: 'emphasis', anchor: { from: 't1', to: 't1' }, style: 'filled dot' },
      ]);
      const { html } = render(doc, { profile: { emphasis: false } });
      expect(html).not.toContain('skam-emphasis');
    });

    it('okimoji=false hides okimoji class', () => {
      const doc = createSingleTokenDoc('而', [
        { type: 'okimoji', anchor: { from: 't1', to: 't1' } },
      ]);
      const { html } = render(doc, { profile: { okimoji: false } });
      expect(html).not.toContain('skam-okimoji');
    });

    it('joji=false hides joji class', () => {
      const doc = createSingleTokenDoc('之', [{ type: 'joji', anchor: { from: 't1', to: 't1' } }]);
      const { html } = render(doc, { profile: { joji: false } });
      expect(html).not.toContain('skam-joji');
    });

    it('tateten=false hides tateten group', () => {
      const doc = createTwoTokenDoc('朝', '聞', [
        { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      ]);
      const { html } = render(doc, { profile: { tateten: false } });
      expect(html).not.toContain('skam-tateten-group');
    });

    it('saidoku=false hides saidoku rendering', () => {
      const doc = createSingleTokenDoc('將', [
        {
          type: 'saidoku',
          anchor: { from: 't1', to: 't1' },
          forms: [
            { n: 1, yomi: 'まさ', okuri: 'に' },
            { n: 2, okuri: 'す' },
          ],
        },
      ]);
      const { html } = render(doc, { profile: { saidoku: false } });
      expect(html).not.toContain('skam-saidoku');
    });

    it('okototen=false hides okototen rendering', () => {
      const doc = createSingleTokenDoc('國', [
        {
          type: 'okototen',
          anchor: { from: 't1', to: 't1' },
          position: { system: 'glyph-grid', grid: '5x5', x: 4, y: 4 },
          shape: 'dot',
        },
      ]);
      const { html } = render(doc, { profile: { okototen: false } });
      expect(html).not.toContain('skam-okototen');
      expect(html).not.toContain('skam-has-okototen');
    });

    it('kutoten=false hides kutoten', () => {
      const doc = createSingleTokenDoc('乎', [
        { type: 'kutoten', position: { blockId: 'b1', after: 't1' }, value: '。' },
      ]);
      const { html } = render(doc, { profile: { kutoten: false } });
      expect(html).not.toContain('skam-suffix-kutoten');
    });

    it('soegana=false hides soegana', () => {
      const doc = createSingleTokenDoc('之', [
        { type: 'soegana', anchor: { from: 't1', to: 't1' }, value: 'を' },
      ]);
      const { html } = render(doc, { profile: { soegana: false } });
      expect(html).not.toContain('skam-soegana');
      expect(html).not.toContain('を');
    });
  });
});

// ============================================================================
// 12. Inline mode with various marks
// ============================================================================

describe('Inline mode with various marks', () => {
  it('inline mode with yomigana', () => {
    const doc = createSingleTokenDoc('學', [
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まな' },
    ]);
    const { html } = render(doc, { inline: true });
    expect(html).toMatch(/^<span/);
    expect(html).toContain('skam-document--inline');
    expect(html).toContain('まな');
  });

  it('inline mode with emphasis', () => {
    const doc = createSingleTokenDoc('道', [
      { type: 'emphasis', anchor: { from: 't1', to: 't1' }, style: 'filled dot' },
    ]);
    const { html } = render(doc, { inline: true });
    expect(html).toContain('skam-emphasis');
    expect(html).toContain('skam-document--inline');
  });

  it('inline mode hides ref content (notes)', () => {
    const doc = createSingleTokenDoc('學', [
      {
        type: 'ref',
        position: { blockId: 'b1', after: 't1' },
        content: '注釈テキスト',
      },
    ]);
    const { html } = render(doc, { inline: true });
    expect(html).not.toContain('skam-notes');
    expect(html).not.toContain('注釈テキスト');
  });

  it('inline mode with kaeriten', () => {
    const doc = createSingleTokenDoc('習', [
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆑' },
    ]);
    const { html } = render(doc, { inline: true });
    expect(html).toContain('skam-kaeriten');
    expect(html).toContain(KAERI.RE);
    expect(html).toContain('skam-document--inline');
  });
});

// ============================================================================
// 13. HTML escaping in mark values
// ============================================================================

describe('HTML escaping in various mark values', () => {
  it('yomigana value with special characters', () => {
    const doc = createSingleTokenDoc('學', [
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: '<script>alert(1)</script>' },
    ]);
    const { html } = render(doc);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('okurigana value with HTML entities', () => {
    const doc = createSingleTokenDoc('學', [
      { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: '<b>test</b>' },
    ]);
    const { html } = render(doc);
    expect(html).not.toContain('<b>');
  });

  it('soegana value with special characters', () => {
    const doc = createSingleTokenDoc('之', [
      { type: 'soegana', anchor: { from: 't1', to: 't1' }, value: '&を' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('&amp;を');
  });

  it('kutoten value with special characters', () => {
    const doc = createSingleTokenDoc('乎', [
      { type: 'kutoten', position: { blockId: 'b1', after: 't1' }, value: '<>' },
    ]);
    const { html } = render(doc);
    expect(html).not.toContain('<>');
    expect(html).toContain('&lt;&gt;');
  });
});

// ============================================================================
// 14. Interactive mode with various mark combinations
// ============================================================================

describe('Interactive mode with mark combinations', () => {
  it('interactive: single token with yomigana', () => {
    const doc = createSingleTokenDoc('學', [
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まな' },
    ]);
    const { html } = render(doc, { interactive: true, rubyMethod: 'ruby' });
    expect(html).toContain('data-token-id="t1"');
    expect(html).toContain('<rb class="skam-base" data-token-id="t1">學</rb>');
  });

  it('interactive: single token with okurigana only (no ruby)', () => {
    const doc = createSingleTokenDoc('習', [
      { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ふ' },
    ]);
    const { html } = render(doc, { interactive: true });
    expect(html).toContain('data-token-id="t1"');
    // No ruby element when only okurigana
    expect(html).not.toContain('<ruby>');
  });

  it('interactive: multi-token yomigana uses data-token-from/to', () => {
    const doc = createTwoTokenDoc('朝', '廷', [
      { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'ちょうてい' },
    ]);
    const { html } = render(doc, { interactive: true });
    expect(html).toContain('data-token-from="t1"');
    expect(html).toContain('data-token-to="t2"');
  });

  it('interactive: multiple tokens each with marks', () => {
    const doc = createThreeTokenDoc('子', '曰', '學', [
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'し' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: '㆑' },
      { type: 'yomigana', anchor: { from: 't3', to: 't3' }, value: 'まな' },
    ]);
    const { html } = render(doc, { interactive: true });
    expect(html).toContain('data-token-id="t1"');
    expect(html).toContain('data-token-id="t2"');
    expect(html).toContain('data-token-id="t3"');
  });
});
