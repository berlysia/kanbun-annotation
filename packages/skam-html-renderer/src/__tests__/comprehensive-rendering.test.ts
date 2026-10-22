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
 *
 * 検査は HTML の文字列への部分一致ではなく、DOM にして「どの字の単位のどの部品に何があるか」を
 * 引く (helpers/dom-contract.ts)。文字列のまま確かめるのは、出力の文字列そのものが契約である
 * escape と出力の先頭のタグだけ。
 */
import { describe, it, expect } from 'vitest';
import type { SKAMDocument, Mark } from '@kanbun-skam/skam';
import { KAERI } from '@kanbun-skam/skam';
import { render, PROFILES } from '../index.js';
import { expectCSSRule, expectCSSRuleLacksDeclaration } from './helpers/css-contract.js';
import {
  all,
  attr,
  closestPart,
  count,
  partText,
  parts,
  renderDom,
  unit,
} from './helpers/dom-contract.js';

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

/** 範囲 from..to に含まれる字 (文書の順)。件数の期待値を文書から数えるのに使う */
function tokensInRange(doc: SKAMDocument, from: string, to: string): string[] {
  const ids = doc.blocks.flatMap((block) => block.tokenIds);
  const start = ids.indexOf(from);
  const end = ids.indexOf(to);
  return ids.slice(start, end + 1).map((id) => doc.tokens.find((token) => token.id === id)!.text);
}

/** 文書の注記の数 */
function countMarks(doc: SKAMDocument, type: Mark['type']): number {
  return doc.marks.filter((mark) => mark.type === type).length;
}

function cssValue(el: Element, property: string): string {
  return (el as HTMLElement).style.getPropertyValue(property);
}

/** 字の単位のうち、部品を 1 つだけ持つもの */
function expectOnly(root: Element, texts: string[], name: Parameters<typeof parts>[2]): void {
  for (const text of texts) expect(parts(root, text, name)).toHaveLength(1);
}

/** 表示される文字 (DOM の textContent) に、その文字列があるか */
function containsText(root: Element, text: string): boolean {
  return (root.textContent ?? '').includes(text);
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
      const root = renderDom(doc);
      const base = tokensInRange(doc, 't1', 't2');
      // Multi-token base text is segmented into individual spans, in one unit
      expect(parts(root, base.join(''), 'baseSeg').map((seg) => seg.textContent)).toEqual(base);
      expect(partText(root, base.join(''), 'ruby')).toBe('ちょうてい');
    });

    it('3-token yomigana: segments all token texts with base-seg spans', () => {
      const doc = createThreeTokenDoc('自', '由', '民', [
        { type: 'yomigana', anchor: { from: 't1', to: 't3' }, value: 'じゆうみん' },
      ]);
      const root = renderDom(doc);
      const base = tokensInRange(doc, 't1', 't3');
      expect(parts(root, base.join(''), 'baseSeg').map((seg) => seg.textContent)).toEqual(base);
      expect(partText(root, base.join(''), 'ruby')).toBe('じゆうみん');
    });

    it('2-token yomigana with interactive: data-token-from/to', () => {
      const doc = createTwoTokenDoc('朝', '廷', [
        { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'ちょうてい' },
      ]);
      const root = renderDom(doc, { interactive: true });
      const range = unit(root, '朝廷').querySelector('[data-token-from]')!;
      expect(attr(range, 'data-token-from')).toBe('t1');
      expect(attr(range, 'data-token-to')).toBe('t2');
    });

    it('multi-char yomi with single token', () => {
      const doc = createSingleTokenDoc('學', [
        { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まなぶ' },
      ]);
      const root = renderDom(doc);
      expect(partText(root, '學', 'ruby')).toBe('まなぶ');
    });
  });

  describe('multi-token okurigana', () => {
    it('2-token range okurigana', () => {
      const doc = createTwoTokenDoc('自', '然', [
        { type: 'okurigana', anchor: { from: 't1', to: 't2' }, value: 'と' },
      ]);
      const root = renderDom(doc);
      // 送り仮名の範囲は区間にならず、範囲の最後の字の slot に入る
      expect(partText(root, '然', 'okuri')).toBe('と');
      expect(partText(root, '自', 'okuri')).toBeNull();
    });

    it('multi-char okurigana on single token', () => {
      const doc = createSingleTokenDoc('學', [
        { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'びて' },
      ]);
      const root = renderDom(doc);
      expect(partText(root, '學', 'okuri')).toBe('びて');
    });
  });

  describe('multi-token soegana', () => {
    it('2-token range soegana', () => {
      const doc = createTwoTokenDoc('天', '下', [
        { type: 'soegana', anchor: { from: 't1', to: 't2' }, value: 'をば' },
      ]);
      const root = renderDom(doc);
      // 添え仮名の範囲は区間にならず、範囲の最後の字の slot に入る
      expect(partText(root, '下', 'soe')).toBe('をば');
      expect(partText(root, '天', 'soe')).toBeNull();
    });
  });

  describe('multi-token emphasis', () => {
    it('3-token range emphasis', () => {
      const doc = createThreeTokenDoc('子', '曰', '學', [
        { type: 'emphasis', anchor: { from: 't1', to: 't3' }, style: 'filled dot' },
      ]);
      const root = renderDom(doc);
      const covered = tokensInRange(doc, 't1', 't3');
      // All 3 tokens should have emphasis style applied, and no more
      expect(count(root, 'emphasis')).toBe(covered.length);
      for (const text of covered) {
        const [emphasis] = parts(root, text, 'emphasis');
        expect(cssValue(emphasis!, 'text-emphasis-style')).toBe('filled dot');
      }
    });

    it('2-token range emphasis with different style', () => {
      const doc = createTwoTokenDoc('重', '要', [
        { type: 'emphasis', anchor: { from: 't1', to: 't2' }, style: 'open circle' },
      ]);
      const root = renderDom(doc);
      const covered = tokensInRange(doc, 't1', 't2');
      expect(count(root, 'emphasis')).toBe(covered.length);
      for (const text of covered) {
        const [emphasis] = parts(root, text, 'emphasis');
        expect(cssValue(emphasis!, 'text-emphasis-style')).toBe('open circle');
      }
    });
  });

  describe('multi-token highlight', () => {
    it('3-token range highlight', () => {
      const doc = createThreeTokenDoc('子', '曰', '學', [
        { type: 'highlight', anchor: { from: 't1', to: 't3' }, style: 'solid' },
      ]);
      const root = renderDom(doc);
      const highlight = closestPart(root, '子', 'highlight')!;
      expect(attr(highlight, 'data-style')).toBe('solid');
      // One highlight holds the whole range
      expect(all(root, 'highlight')).toEqual([highlight]);
      for (const text of tokensInRange(doc, 't1', 't3')) {
        expect(closestPart(root, text, 'highlight')).toBe(highlight);
      }
    });

    it('multi-token highlight with wavy style', () => {
      const doc = createThreeTokenDoc('子', '曰', '學', [
        { type: 'highlight', anchor: { from: 't1', to: 't3' }, style: 'wavy' },
      ]);
      const root = renderDom(doc);
      expect(attr(closestPart(root, '子', 'highlight')!, 'data-style')).toBe('wavy');
    });
  });

  describe('multi-token tateten', () => {
    it('3-token tateten group', () => {
      const doc = createThreeTokenDoc('朝', '聞', '道', [
        { type: 'tateten', anchor: { from: 't1', to: 't3' } },
      ]);
      const root = renderDom(doc);
      const covered = tokensInRange(doc, 't1', 't3');
      const group = closestPart(root, '朝', 'tatetenGroup')!;
      expect(all(root, 'tatetenGroup')).toEqual([group]);
      for (const text of covered) expect(closestPart(root, text, 'tatetenGroup')).toBe(group);
      // A mark between each pair of neighbours
      expect(count(root, 'tatetenMark')).toBe(covered.length - 1);
    });
  });

  describe('multi-token okimoji', () => {
    it('2-token okimoji range', () => {
      const doc = createTwoTokenDoc('於', '是', [
        { type: 'okimoji', anchor: { from: 't1', to: 't2' } },
      ]);
      const root = renderDom(doc);
      expectOnly(root, tokensInRange(doc, 't1', 't2'), 'okimoji');
    });

    it('3-token okimoji range: all tokens should have okimoji class', () => {
      const doc = createThreeTokenDoc('於', '是', '乎', [
        { type: 'okimoji', anchor: { from: 't1', to: 't3' } },
      ]);
      const root = renderDom(doc);
      // All 3 tokens should have okimoji class applied, and no more
      const covered = tokensInRange(doc, 't1', 't3');
      expectOnly(root, covered, 'okimoji');
      expect(count(root, 'okimoji')).toBe(covered.length);
    });
  });

  describe('multi-token joji', () => {
    it('2-token joji range', () => {
      const doc = createTwoTokenDoc('而', '已', [
        { type: 'joji', anchor: { from: 't1', to: 't2' } },
      ]);
      const root = renderDom(doc);
      expectOnly(root, tokensInRange(doc, 't1', 't2'), 'joji');
    });

    it('3-token joji range: all tokens should have joji class', () => {
      const doc = createThreeTokenDoc('之', '乎', '矣', [
        { type: 'joji', anchor: { from: 't1', to: 't3' } },
      ]);
      const root = renderDom(doc);
      // All 3 tokens should have joji class applied, and no more
      const covered = tokensInRange(doc, 't1', 't3');
      expectOnly(root, covered, 'joji');
      expect(count(root, 'joji')).toBe(covered.length);
    });
  });

  describe('multi-token kaeri', () => {
    it('3-token kaeri range: kaeriten should be rendered', () => {
      const doc = createThreeTokenDoc('不', '可', '得', [
        { type: 'kaeri', position: { blockId: 'b1', after: 't3' }, value: '㆒' },
      ]);
      const root = renderDom(doc);
      // Kaeriten is applied to the token it follows, and only there
      expect(partText(root, '得', 'kaeri')).toBe(KAERI.ICHI);
      expect(count(root, 'kaeri')).toBe(countMarks(doc, 'kaeri'));
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
    const root = renderDom(doc);
    expect(partText(root, '學', 'ruby')).toBe('まな');
    expect(partText(root, '學', 'okuri')).toBe('びて');
  });

  it('yomigana + kaeri on same token', () => {
    const doc = createSingleTokenDoc('習', [
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'なら' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆑' },
    ]);
    const root = renderDom(doc);
    expect(partText(root, '習', 'ruby')).toBe('なら');
    expect(partText(root, '習', 'kaeri')).toBe(KAERI.RE); // レ
  });

  it('yomigana + okurigana + kaeri on same token', () => {
    const doc = createSingleTokenDoc('習', [
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'なら' },
      { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ふ' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆑' },
    ]);
    const root = renderDom(doc);
    expect(partText(root, '習', 'ruby')).toBe('なら');
    expect(partText(root, '習', 'okuri')).toBe('ふ');
    expect(partText(root, '習', 'kaeri')).toBe(KAERI.RE); // レ
  });

  it('yomigana + okurigana + kaeri + soegana on same token', () => {
    const doc = createSingleTokenDoc('學', [
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まな' },
      { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ブ' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆓' },
      { type: 'soegana', anchor: { from: 't1', to: 't1' }, value: 'を' },
    ]);
    const root = renderDom(doc);
    expect(partText(root, '學', 'ruby')).toBe('まな');
    expect(partText(root, '學', 'okuri')).toBe('ブ');
    expect(partText(root, '學', 'kaeri')).toBe(KAERI.NI); // 二
    expect(partText(root, '學', 'soe')).toBe('を');
  });

  it('emphasis + yomigana + okurigana on same token', () => {
    const doc = createSingleTokenDoc('學', [
      { type: 'emphasis', anchor: { from: 't1', to: 't1' }, style: 'filled dot' },
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まな' },
      { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ブ' },
    ]);
    const root = renderDom(doc);
    // With a reading, the grid draws the emphasis in its own row
    expect(parts(root, '學', 'emphasisRow')).toHaveLength(1);
    expect(partText(root, '學', 'ruby')).toBe('まな');
    expect(partText(root, '學', 'okuri')).toBe('ブ');
  });

  it('okimoji + kaeri on same token', () => {
    const doc = createSingleTokenDoc('而', [
      { type: 'okimoji', anchor: { from: 't1', to: 't1' } },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆒' },
    ]);
    const root = renderDom(doc);
    expect(parts(root, '而', 'okimoji')).toHaveLength(1);
    expect(partText(root, '而', 'kaeri')).toBe(KAERI.ICHI); // 一
  });

  it('joji + okurigana on same token', () => {
    const doc = createSingleTokenDoc('之', [
      { type: 'joji', anchor: { from: 't1', to: 't1' } },
      { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'の' },
    ]);
    const root = renderDom(doc);
    expect(parts(root, '之', 'joji')).toHaveLength(1);
    expect(partText(root, '之', 'okuri')).toBe('の');
  });

  it('anchor mark + kutoten after same token', () => {
    const doc = createSingleTokenDoc('乎', [
      { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'や' },
      { type: 'kutoten', position: { blockId: 'b1', after: 't1' }, value: '。' },
    ]);
    const root = renderDom(doc);
    expect(partText(root, '乎', 'okuri')).toBe('や');
    expect(partText(root, '乎', 'kutoten')).toBe('。');
  });

  it('yomigana + ref after same token', () => {
    const doc = createSingleTokenDoc('學', [
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まな' },
      { type: 'ref', position: { blockId: 'b1', after: 't1' }, format: 'iroha-katakana' },
    ]);
    const root = renderDom(doc);
    expect(partText(root, '學', 'ruby')).toBe('まな');
    expect(partText(root, '學', 'ref')).toBe('（イ）');
  });

  it('highlight range with yomigana on inner tokens', () => {
    const doc = createThreeTokenDoc('學', '而', '時', [
      { type: 'highlight', anchor: { from: 't1', to: 't3' }, style: 'solid' },
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まな' },
      { type: 'yomigana', anchor: { from: 't3', to: 't3' }, value: 'とき' },
    ]);
    const root = renderDom(doc);
    const highlight = closestPart(root, '學', 'highlight');
    expect(highlight).not.toBeNull();
    expect(closestPart(root, '時', 'highlight')).toBe(highlight);
    expect(partText(root, '學', 'ruby')).toBe('まな');
    expect(partText(root, '時', 'ruby')).toBe('とき');
    // The token between them has no reading
    expect(partText(root, '而', 'ruby')).toBeNull();
  });

  it('highlight range with okurigana + kaeri on inner tokens', () => {
    const doc = createThreeTokenDoc('不', '能', '爲', [
      { type: 'highlight', anchor: { from: 't1', to: 't3' }, style: 'solid' },
      { type: 'okurigana', anchor: { from: 't2', to: 't2' }, value: 'ハズ' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: '㆑' },
    ]);
    const root = renderDom(doc);
    expect(closestPart(root, '能', 'highlight')).not.toBeNull();
    expect(partText(root, '能', 'okuri')).toBe('ハズ');
    expect(partText(root, '能', 'kaeri')).toBe(KAERI.RE);
    expect(partText(root, '不', 'okuri')).toBeNull();
    expect(partText(root, '爲', 'kaeri')).toBeNull();
  });

  it('tateten + yomigana on grouped tokens', () => {
    const doc = createTwoTokenDoc('朝', '聞', [
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'ちょうもん' },
    ]);
    const root = renderDom(doc);
    expect(closestPart(root, '朝', 'tatetenGroup')).not.toBeNull();
    // The group reading belongs to every token of the group
    expect(partText(root, '朝', 'ruby')).toBe('ちょうもん');
    expect(partText(root, '聞', 'ruby')).toBe('ちょうもん');
  });

  it('tateten + yomigana: tateten-mark separator preserved between tokens', () => {
    const doc = createTwoTokenDoc('朝', '聞', [
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'ちょうもん' },
    ]);
    const root = renderDom(doc);
    // tateten-mark separator should exist between grouped tokens
    // even when multi-token yomigana spans the same range
    expect(count(root, 'tatetenMark')).toBe(doc.tokens.length - 1);
  });

  it('tateten + okurigana: tateten-mark separator preserved between tokens', () => {
    const doc = createTwoTokenDoc('朝', '聞', [
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'okurigana', anchor: { from: 't1', to: 't2' }, value: 'き' },
    ]);
    const root = renderDom(doc);
    // tateten-mark separator should exist between grouped tokens
    // even when multi-token okurigana spans the same range
    expect(count(root, 'tatetenMark')).toBe(doc.tokens.length - 1);
  });

  it('3-token tateten + yomigana: all tateten-mark separators preserved', () => {
    const doc = createThreeTokenDoc('朝', '聞', '道', [
      { type: 'tateten', anchor: { from: 't1', to: 't3' } },
      { type: 'yomigana', anchor: { from: 't1', to: 't3' }, value: 'ちょうもんどう' },
    ]);
    const root = renderDom(doc);
    const covered = tokensInRange(doc, 't1', 't3');
    const group = closestPart(root, '朝', 'tatetenGroup');
    expect(group).not.toBeNull();
    for (const text of covered) {
      expect(closestPart(root, text, 'tatetenGroup')).toBe(group);
      expect(partText(root, text, 'ruby')).toBe('ちょうもんどう');
    }
    // 3 tokens should have 2 tateten-mark separators
    expect(count(root, 'tatetenMark')).toBe(covered.length - 1);
  });

  it('tateten + soegana: tateten-mark separator preserved between tokens', () => {
    const doc = createTwoTokenDoc('朝', '聞', [
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'soegana', anchor: { from: 't1', to: 't2' }, value: 'を' },
    ]);
    const root = renderDom(doc);
    expect(count(root, 'tatetenMark')).toBe(doc.tokens.length - 1);
  });

  it('emphasis range + tateten on same range', () => {
    const doc = createTwoTokenDoc('天', '道', [
      { type: 'emphasis', anchor: { from: 't1', to: 't2' }, style: 'filled dot' },
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
    ]);
    const root = renderDom(doc);
    const covered = tokensInRange(doc, 't1', 't2');
    expectOnly(root, covered, 'emphasis');
    const group = closestPart(root, '天', 'tatetenGroup');
    expect(group).not.toBeNull();
    expect(closestPart(root, '道', 'tatetenGroup')).toBe(group);
  });

  // Range kana marks merge tokens, causing per-token marks on middle tokens to be lost
  // trailing marks (kaeri, kutoten, ref) are collected, but other marks are not

  it('range yomigana + okimoji on middle token: okimoji should be preserved', () => {
    const doc = createThreeTokenDoc('於', '是', '乎', [
      { type: 'yomigana', anchor: { from: 't1', to: 't3' }, value: 'ここに' },
      { type: 'okimoji', anchor: { from: 't2', to: 't2' } },
    ]);
    const root = renderDom(doc);
    const range = tokensInRange(doc, 't1', 't3').join('');
    expect(partText(root, range, 'ruby')).toBe('ここに');
    // okimoji on the middle token should still be reflected in the output
    expect(parts(root, range, 'okimoji')).toHaveLength(1);
  });

  it('range yomigana + joji on middle token: joji should be preserved', () => {
    const doc = createThreeTokenDoc('不', '之', '得', [
      { type: 'yomigana', anchor: { from: 't1', to: 't3' }, value: 'えざる' },
      { type: 'joji', anchor: { from: 't2', to: 't2' } },
    ]);
    const root = renderDom(doc);
    const range = tokensInRange(doc, 't1', 't3').join('');
    expect(partText(root, range, 'ruby')).toBe('えざる');
    // joji on the middle token should still be reflected in the output
    expect(parts(root, range, 'joji')).toHaveLength(1);
  });

  it('range yomigana + emphasis on middle token: emphasis should be preserved', () => {
    const doc = createThreeTokenDoc('天', '地', '人', [
      { type: 'yomigana', anchor: { from: 't1', to: 't3' }, value: 'てんちじん' },
      { type: 'emphasis', anchor: { from: 't2', to: 't2' }, style: 'filled dot' },
    ]);
    const root = renderDom(doc);
    const range = tokensInRange(doc, 't1', 't3').join('');
    expect(partText(root, range, 'ruby')).toBe('てんちじん');
    // emphasis on the middle token should still be reflected in the output
    expect(parts(root, range, 'emphasisRow')).toHaveLength(1);
  });

  it('range okurigana + okimoji on middle token: okimoji should be preserved', () => {
    const doc = createThreeTokenDoc('於', '是', '乎', [
      { type: 'okurigana', anchor: { from: 't1', to: 't3' }, value: 'ニ' },
      { type: 'okimoji', anchor: { from: 't2', to: 't2' } },
    ]);
    const root = renderDom(doc);
    // 送り仮名は範囲の最後の字の slot、置字は中の字自身の slot
    expect(partText(root, '乎', 'okuri')).toBe('ニ');
    expect(parts(root, '是', 'okimoji')).toHaveLength(1);
    expect(count(root, 'okimoji')).toBe(1);
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
      const root = renderDom(doc);
      expect(partText(root, '漢', 'kaeri')).toBe(unicode);
    });
  }

  describe('compound kaeri values', () => {
    it('一レ → 一 + レ Unicode', () => {
      const doc = createSingleTokenDoc('不', [
        // 互換: 複数の字の kaeri は 0.3 では読めるが非推奨 (0.4.0 で誤り)。この値を読めることを確かめる
        { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆒㆑' },
      ]);
      const root = renderDom(doc);
      expect(partText(root, '不', 'kaeri')).toBe(KAERI.ICHI + KAERI.RE); // 一レ
    });

    it('二レ → 二 + レ Unicode', () => {
      const doc = createSingleTokenDoc('不', [
        { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆓㆑' },
      ]);
      const root = renderDom(doc);
      expect(partText(root, '不', 'kaeri')).toBe(KAERI.NI + KAERI.RE); // 二レ
    });

    it('上レ → 上 + レ Unicode', () => {
      const doc = createSingleTokenDoc('不', [
        // 互換: 複数の字の kaeri は 0.3 では読めるが非推奨 (0.4.0 で誤り)。この値を読めることを確かめる
        { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆖㆑' },
      ]);
      const root = renderDom(doc);
      expect(partText(root, '不', 'kaeri')).toBe(KAERI.JO + KAERI.RE); // 上レ
    });

    it('甲レ → 甲 + レ Unicode', () => {
      const doc = createSingleTokenDoc('不', [
        { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆙㆑' },
      ]);
      const root = renderDom(doc);
      expect(partText(root, '不', 'kaeri')).toBe(KAERI.KO + KAERI.RE); // 甲レ
    });

    it('天レ → 天 + レ Unicode', () => {
      const doc = createSingleTokenDoc('不', [
        { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆝㆑' },
      ]);
      const root = renderDom(doc);
      expect(partText(root, '不', 'kaeri')).toBe(KAERI.TEN + KAERI.RE); // 天レ
    });
  });
});

// ============================================================================
// 4. Emphasis style variations
// ============================================================================

describe('Emphasis style rendering variations', () => {
  const emphasisStyles = [
    { style: 'dot', expected: 'dot' },
    { style: 'circle', expected: 'circle' },
    { style: 'double-circle', expected: 'double-circle' },
    { style: 'triangle', expected: 'triangle' },
    { style: 'sesame', expected: 'sesame' },
    { style: 'filled dot', expected: 'filled dot' },
    { style: 'filled circle', expected: 'filled circle' },
    { style: 'filled sesame', expected: 'filled sesame' },
    { style: 'filled triangle', expected: 'filled triangle' },
    { style: 'filled double-circle', expected: 'filled double-circle' },
    { style: 'open dot', expected: 'open dot' },
    { style: 'open circle', expected: 'open circle' },
    { style: 'open sesame', expected: 'open sesame' },
    { style: 'open triangle', expected: 'open triangle' },
    { style: 'open double-circle', expected: 'open double-circle' },
  ];

  for (const { style, expected } of emphasisStyles) {
    it(`emphasis style: ${style}`, () => {
      const doc = createSingleTokenDoc('道', [
        { type: 'emphasis', anchor: { from: 't1', to: 't1' }, style },
      ]);
      const root = renderDom(doc);
      const [emphasis] = parts(root, '道', 'emphasis');
      expect(emphasis).toBeDefined();
      expect(cssValue(emphasis!, 'text-emphasis-style')).toBe(expected);
    });
  }

  it('emphasis without style (default: filled dot)', () => {
    const doc = createSingleTokenDoc('道', [
      { type: 'emphasis', anchor: { from: 't1', to: 't1' } },
    ]);
    const root = renderDom(doc);
    const [emphasis] = parts(root, '道', 'emphasis');
    expect(emphasis).toBeDefined();
    expect(cssValue(emphasis!, 'text-emphasis-style')).toBe('filled dot');
  });

  it('emphasis with custom character', () => {
    const doc = createSingleTokenDoc('道', [
      { type: 'emphasis', anchor: { from: 't1', to: 't1' }, style: '★' },
    ]);
    const root = renderDom(doc);
    const [emphasis] = parts(root, '道', 'emphasis');
    expect(emphasis).toBeDefined();
    // Custom character is emitted as a CSS string literal (lowercase hex escape).
    // Read through the DOM, the attribute's HTML escaping is already undone
    expect(cssValue(emphasis!, 'text-emphasis-style')).toBe('"\\2605 "');
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
      const root = renderDom(doc);
      const highlight = closestPart(root, '重', 'highlight');
      expect(highlight).not.toBeNull();
      expect(attr(highlight!, 'data-style')).toBe(style);
      expect(closestPart(root, '要', 'highlight')).toBe(highlight);
    });
  }

  it('highlight without style (default)', () => {
    const doc = createTwoTokenDoc('重', '要', [
      { type: 'highlight', anchor: { from: 't1', to: 't2' } },
    ]);
    const root = renderDom(doc);
    const highlight = closestPart(root, '重', 'highlight');
    expect(highlight).not.toBeNull();
    // emphasis なし・ref なしの highlight には data-has-emphasis / data-has-ref が付かない
    expect(highlight!.hasAttribute('data-has-emphasis')).toBe(false);
    expect(highlight!.hasAttribute('data-has-ref')).toBe(false);
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
    const root = renderDom(doc);
    expect(partText(root, '語', 'ref')).toBe('(A)');
  });

  it('alpha-lower: (a)', () => {
    const doc = createSingleTokenDoc('語', [
      { type: 'ref', position: { blockId: 'b1', after: 't1' }, format: 'alpha-lower' },
    ]);
    const root = renderDom(doc);
    expect(partText(root, '語', 'ref')).toBe('(a)');
  });

  it('numeric-paren: (1)', () => {
    const doc = createSingleTokenDoc('語', [
      { type: 'ref', position: { blockId: 'b1', after: 't1' }, format: 'numeric-paren' },
    ]);
    const root = renderDom(doc);
    expect(partText(root, '語', 'ref')).toBe('(1)');
  });

  it('numeric-bracket: [1]', () => {
    const doc = createSingleTokenDoc('語', [
      { type: 'ref', position: { blockId: 'b1', after: 't1' }, format: 'numeric-bracket' },
    ]);
    const root = renderDom(doc);
    expect(partText(root, '語', 'ref')).toBe('[1]');
  });

  it('numeric-circled: ①', () => {
    const doc = createSingleTokenDoc('語', [
      { type: 'ref', position: { blockId: 'b1', after: 't1' }, format: 'numeric-circled' },
    ]);
    const root = renderDom(doc);
    expect(partText(root, '語', 'ref')).toBe('①');
  });

  it('iroha-katakana: （イ）', () => {
    const doc = createSingleTokenDoc('語', [
      { type: 'ref', position: { blockId: 'b1', after: 't1' }, format: 'iroha-katakana' },
    ]);
    const root = renderDom(doc);
    expect(partText(root, '語', 'ref')).toBe('（イ）');
  });

  it('iroha-hiragana: （い）', () => {
    const doc = createSingleTokenDoc('語', [
      { type: 'ref', position: { blockId: 'b1', after: 't1' }, format: 'iroha-hiragana' },
    ]);
    const root = renderDom(doc);
    expect(partText(root, '語', 'ref')).toBe('（い）');
  });

  it('gojuon-katakana: （ア）', () => {
    const doc = createSingleTokenDoc('語', [
      { type: 'ref', position: { blockId: 'b1', after: 't1' }, format: 'gojuon-katakana' },
    ]);
    const root = renderDom(doc);
    expect(partText(root, '語', 'ref')).toBe('（ア）');
  });

  it('gojuon-hiragana: （あ）', () => {
    const doc = createSingleTokenDoc('語', [
      { type: 'ref', position: { blockId: 'b1', after: 't1' }, format: 'gojuon-hiragana' },
    ]);
    const root = renderDom(doc);
    expect(partText(root, '語', 'ref')).toBe('（あ）');
  });

  it('kanji-numeric: （一）', () => {
    const doc = createSingleTokenDoc('語', [
      { type: 'ref', position: { blockId: 'b1', after: 't1' }, format: 'kanji-numeric' },
    ]);
    const root = renderDom(doc);
    expect(partText(root, '語', 'ref')).toBe('（一）');
  });

  describe('multiple refs with sequential numbering', () => {
    const sequential = (format: 'alpha-upper' | 'iroha-katakana' | 'numeric-circled'): Mark[] => [
      { type: 'ref', position: { blockId: 'b1', after: 't1' }, format },
      { type: 'ref', position: { blockId: 'b1', after: 't2' }, format },
      { type: 'ref', position: { blockId: 'b1', after: 't3' }, format },
    ];

    it('alpha-upper: (A), (B), (C)', () => {
      const doc = createThreeTokenDoc('一', '二', '三', sequential('alpha-upper'));
      const root = renderDom(doc);
      expect(['一', '二', '三'].map((text) => partText(root, text, 'ref'))).toEqual([
        '(A)',
        '(B)',
        '(C)',
      ]);
    });

    it('iroha-katakana: （イ）,（ロ）,（ハ）', () => {
      const doc = createThreeTokenDoc('一', '二', '三', sequential('iroha-katakana'));
      const root = renderDom(doc);
      expect(['一', '二', '三'].map((text) => partText(root, text, 'ref'))).toEqual([
        '（イ）',
        '（ロ）',
        '（ハ）',
      ]);
    });

    it('numeric-circled: ①, ②, ③', () => {
      const doc = createThreeTokenDoc('一', '二', '三', sequential('numeric-circled'));
      const root = renderDom(doc);
      expect(['一', '二', '三'].map((text) => partText(root, text, 'ref'))).toEqual([
        '①',
        '②',
        '③',
      ]);
    });
  });

  it('ref with label (plain text)', () => {
    const doc = createSingleTokenDoc('語', [
      { type: 'ref', position: { blockId: 'b1', after: 't1' }, label: '※注' },
    ]);
    const root = renderDom(doc);
    expect(partText(root, '語', 'ref')).toBe('※注');
  });

  it('ref with content generates notes section', () => {
    const doc = createSingleTokenDoc('學', [
      {
        type: 'ref',
        position: { blockId: 'b1', after: 't1' },
        content: '學問に励むこと。',
      },
    ]);
    const root = renderDom(doc);
    expect(count(root, 'notes')).toBe(1);
    const items = all(root, 'noteItem');
    expect(items).toHaveLength(countMarks(doc, 'ref'));
    expect(items[0]!.textContent).toBe('[1]學問に励むこと。');
    // auto-numbered: the marker in the text and the one in the note agree
    expect(partText(root, '學', 'ref')).toBe('[1]');
    expect(all(root, 'noteMarker')[0]!.textContent).toBe('[1]');
  });
});

// ============================================================================
// 7. Saidoku form variations
// ============================================================================

describe('Saidoku rendering variations', () => {
  /** 再読文字の読みの要素 (data-saidoku-n の順に) */
  function saidokuReadings(root: Element, base: string): Array<[string | null, string]> {
    return parts(root, base, 'ruby').map((el) => [
      attr(el, 'data-saidoku-n'),
      el.textContent ?? '',
    ]);
  }

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
    const root = renderDom(doc);
    expect(parts(root, '將', 'saidoku')).toHaveLength(1);
    expect(saidokuReadings(root, '將')).toEqual([
      ['1', 'まさに'],
      ['2', 'べし'],
    ]);
    // The second reading goes under the character
    expect(partText(root, '將', 'saidokuUnder')).toBe('べし');
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
    const root = renderDom(doc);
    expect(parts(root, '須', 'saidoku')).toHaveLength(1);
    expect(partText(root, '須', 'okuri')).toBe('く');
    expect(partText(root, '須', 'saidokuOkuri2')).toBe('し');
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
    const root = renderDom(doc);
    expect(partText(root, '將', 'ruby')).toBe('まさ');
    // First form's okuri is in suffix-okuri, second in suffix-saidoku
    expect(partText(root, '將', 'okuri')).toBe('に');
    expect(partText(root, '將', 'saidokuOkuri2')).toBe('す');
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
    const root = renderDom(doc);
    const marked = [...unit(root, '將').querySelectorAll('[data-saidoku-n]')];
    const numbers = new Set(marked.map((el) => attr(el, 'data-saidoku-n')));
    expect([...numbers].sort()).toEqual(['1', '2', '3']);
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
    const root = renderDom(doc);
    expect(partText(root, '宜', 'ruby')).toBe('よろしく');
    expect(partText(root, '宜', 'okuri')).toBe('は');
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
    const root = renderDom(doc);
    expect(parts(root, '將', 'saidoku')).toHaveLength(1);
    expect(partText(root, '將', 'kaeri')).toBe(KAERI.NI); // 二
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
    const root = renderDom(doc, { interactive: true });
    expect(attr(unit(root, '將'), 'data-token-id')).toBe('t1');
  });
});

// ============================================================================
// 8. Okototen grid/shape variations
// ============================================================================

describe('Okototen rendering variations', () => {
  /** ヲコト点の要素と、その形・格子の位置 */
  function okototenCells(root: Element, base: string) {
    return parts(root, base, 'okototen').map((el) => ({
      shape: attr(el, 'data-shape'),
      x: cssValue(el, '--okototen-x'),
      y: cssValue(el, '--okototen-y'),
      grid: cssValue(el, '--okototen-grid'),
    }));
  }

  it('5x5 grid at center position', () => {
    const doc = createSingleTokenDoc('國', [
      {
        type: 'okototen',
        anchor: { from: 't1', to: 't1' },
        position: { system: 'glyph-grid', grid: '5x5', x: 2, y: 2 },
        shape: 'dot',
      },
    ]);
    const root = renderDom(doc);
    expect(parts(root, '國', 'hasOkototen')).toHaveLength(1);
    expect(okototenCells(root, '國')).toEqual([{ shape: 'dot', x: '2', y: '2', grid: '5' }]);
  });

  it('7x7 grid', () => {
    const doc = createSingleTokenDoc('國', [
      {
        type: 'okototen',
        anchor: { from: 't1', to: 't1' },
        // x と y を違う値にして、取り違えが値に出るようにする
        position: { system: 'glyph-grid', grid: '7x7', x: 6, y: 3 },
        shape: 'circle',
      },
    ]);
    const root = renderDom(doc);
    expect(okototenCells(root, '國')).toEqual([{ shape: 'circle', x: '6', y: '3', grid: '7' }]);
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
    const root = renderDom(doc);
    expect(okototenCells(root, '漢').map((cell) => cell.shape)).toEqual(['dot']);
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
    const root = renderDom(doc);
    expect(okototenCells(root, '漢').map((cell) => cell.shape)).toEqual(['circle']);
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
    const root = renderDom(doc);
    expect(okototenCells(root, '漢').map((cell) => cell.shape)).toEqual(['line']);
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
    const root = renderDom(doc);
    const [cell] = okototenCells(root, '漢');
    expect(cell).toMatchObject({ x: '0', y: '0' });
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
    const root = renderDom(doc);
    expect(parts(root, '國', 'hasOkototen')).toHaveLength(1);
    // Should have 2 okototen elements, each with its own shape and position
    expect(okototenCells(root, '國')).toHaveLength(countMarks(doc, 'okototen'));
    expect(okototenCells(root, '國')).toEqual([
      { shape: 'dot', x: '0', y: '0', grid: '5' },
      { shape: 'circle', x: '4', y: '4', grid: '5' },
    ]);
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

    const root = renderDom(doc);

    // All tokens present, each as its own unit
    for (const token of doc.tokens) expect(unit(root, token.text)).toBeDefined();

    // Each annotation sits on the token it was given to
    expect(partText(root, '學', 'ruby')).toBe('まな');
    expect(partText(root, '學', 'okuri')).toBe('びて');
    expect(partText(root, '而', 'ruby')).toBeNull();
    expect(partText(root, '而', 'okuri')).toBeNull();
    expect(partText(root, '時', 'ruby')).toBe('とき');
    expect(partText(root, '時', 'okuri')).toBe('に');
    expect(partText(root, '習', 'ruby')).toBe('なら');
    expect(partText(root, '習', 'okuri')).toBe('ふ');
    expect(partText(root, '習', 'kaeri')).toBe(KAERI.RE); // レ
    expect(partText(root, '之', 'soe')).toBe('を');
    expect(partText(root, '之', 'kutoten')).toBe('。');
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

    const root = renderDom(doc);
    expect(partText(root, '學', 'ruby')).toBe('まな');
    expect(partText(root, '學', 'okuri')).toBe('ブ');
    expect(partText(root, '而', 'kaeri')).toBe(KAERI.RE);
    expect(parts(root, '而', 'okimoji')).toHaveLength(1);
    expect(partText(root, '時', 'soe')).toBe('を');
    expect(parts(root, '習', 'emphasis')).toHaveLength(1);
    const group = closestPart(root, '習', 'tatetenGroup');
    expect(group).not.toBeNull();
    expect(closestPart(root, '之', 'tatetenGroup')).toBe(group);
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

    const root = renderDom(doc);
    const highlight = closestPart(root, '重', 'highlight');
    expect(highlight).not.toBeNull();
    expect(closestPart(root, '要', 'highlight')).toBe(highlight);
    expect(closestPart(root, '語', 'highlight')).toBeNull();
    // The highlight's ref label is shared by the characters inside it
    expect(partText(root, '重', 'ref')).toBe('(A)');
    expect(partText(root, '要', 'ref')).toBe('(A)');
    expect(partText(root, '語', 'ref')).toBeNull();
    expect(partText(root, '語', 'kutoten')).toBe('。');
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

    const root = renderDom(doc);
    // Block 1 marks
    expect(partText(root, '子', 'ruby')).toBe('し');
    expect(partText(root, '曰', 'kaeri')).toBe(KAERI.RE); // レ
    expect(partText(root, '學', 'kutoten')).toBe('。');
    // Block 2 marks
    const emphasized = tokensInRange(doc, 't4', 't5');
    expectOnly(root, emphasized, 'emphasis');
    expect(count(root, 'emphasis')).toBe(emphasized.length);
    expect(partText(root, '習', 'okuri')).toBe('ふ');
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

    const root = renderDom(doc);
    // Prefers yomiage over kakikudashi
    const readings = all(root, 'reading');
    expect(readings).toHaveLength(1);
    expect(readings[0]!.textContent).toBe('学びて時に之を習ふ');
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
    const { css } = render(doc, { writingMode: 'vertical' });
    const root = renderDom(doc, { writingMode: 'vertical' });
    expect(attr(root, 'data-writing-mode')).toBe('vertical');
    expectCSSRule(css, ':where(.skam-document)', [
      { property: 'writing-mode', value: 'vertical-rl' },
    ]);
  });

  it('horizontal mode: no vertical-rl CSS', () => {
    const doc = createSingleTokenDoc('學', [
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まな' },
    ]);
    const { css } = render(doc, { writingMode: 'horizontal' });
    const root = renderDom(doc, { writingMode: 'horizontal' });
    expect(attr(root, 'data-writing-mode')).toBe('horizontal');
    expectCSSRuleLacksDeclaration(css, ':where(.skam-document)', {
      property: 'writing-mode',
      value: 'vertical-rl',
    });
  });

  it('vertical mode with kaeriten', () => {
    const doc = createSingleTokenDoc('習', [
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆑' },
    ]);
    const root = renderDom(doc, { writingMode: 'vertical' });
    expect(partText(root, '習', 'kaeri')).toBe(KAERI.RE);
  });

  it('horizontal mode with kaeriten', () => {
    const doc = createSingleTokenDoc('習', [
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆑' },
    ]);
    const root = renderDom(doc, { writingMode: 'horizontal' });
    expect(partText(root, '習', 'kaeri')).toBe(KAERI.RE);
  });

  const saidokuDoc = (): SKAMDocument =>
    createSingleTokenDoc('將', [
      {
        type: 'saidoku',
        anchor: { from: 't1', to: 't1' },
        forms: [
          { n: 1, yomi: 'まさ', okuri: 'に' },
          { n: 2, okuri: 'す' },
        ],
      },
    ]);

  it('vertical mode with saidoku', () => {
    const root = renderDom(saidokuDoc(), { writingMode: 'vertical' });
    expect(parts(root, '將', 'saidoku')).toHaveLength(1);
    expect(partText(root, '將', 'ruby')).toBe('まさ');
  });

  it('horizontal mode with saidoku', () => {
    const root = renderDom(saidokuDoc(), { writingMode: 'horizontal' });
    expect(parts(root, '將', 'saidoku')).toHaveLength(1);
    expect(partText(root, '將', 'ruby')).toBe('まさ');
  });

  it('vertical mode with emphasis', () => {
    const doc = createSingleTokenDoc('道', [
      { type: 'emphasis', anchor: { from: 't1', to: 't1' }, style: 'filled dot' },
    ]);
    const root = renderDom(doc, { writingMode: 'vertical' });
    expect(parts(root, '道', 'emphasis')).toHaveLength(1);
  });

  it('horizontal mode with emphasis', () => {
    const doc = createSingleTokenDoc('道', [
      { type: 'emphasis', anchor: { from: 't1', to: 't1' }, style: 'filled dot' },
    ]);
    const root = renderDom(doc, { writingMode: 'horizontal' });
    expect(parts(root, '道', 'emphasis')).toHaveLength(1);
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
      const root = renderDom(doc, { profile: PROFILES.learningBasic });
      // Neither the reading's text nor an empty reading element is left
      expect(count(root, 'ruby')).toBe(0);
      expect(containsText(root, 'まな')).toBe(false);
    });

    it('hides okurigana', () => {
      const doc = createSingleTokenDoc('學', [
        { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ブ' },
      ]);
      const root = renderDom(doc, { profile: PROFILES.learningBasic });
      expect(count(root, 'okuri')).toBe(0);
      expect(containsText(root, 'ブ')).toBe(false);
    });

    it('shows kaeriten', () => {
      const doc = createSingleTokenDoc('習', [
        { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆑' },
      ]);
      const root = renderDom(doc, { profile: PROFILES.learningBasic });
      expect(partText(root, '習', 'kaeri')).toBe(KAERI.RE);
    });

    it('shows kutoten', () => {
      const doc = createSingleTokenDoc('乎', [
        { type: 'kutoten', position: { blockId: 'b1', after: 't1' }, value: '。' },
      ]);
      const root = renderDom(doc, { profile: PROFILES.learningBasic });
      expect(partText(root, '乎', 'kutoten')).toBe('。');
    });

    it('shows highlight', () => {
      const doc = createTwoTokenDoc('重', '要', [
        { type: 'highlight', anchor: { from: 't1', to: 't2' }, style: 'solid' },
      ]);
      const root = renderDom(doc, { profile: PROFILES.learningBasic });
      const highlight = closestPart(root, '重', 'highlight');
      expect(highlight).not.toBeNull();
      expect(closestPart(root, '要', 'highlight')).toBe(highlight);
    });

    it('shows ref', () => {
      const doc = createSingleTokenDoc('語', [
        { type: 'ref', position: { blockId: 'b1', after: 't1' }, format: 'alpha-upper' },
      ]);
      const root = renderDom(doc, { profile: PROFILES.learningBasic });
      expect(partText(root, '語', 'ref')).toBe('(A)');
    });
  });

  describe('learningHint profile', () => {
    it('hides yomigana but shows okurigana', () => {
      const doc = createSingleTokenDoc('學', [
        { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まな' },
        { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ブ' },
      ]);
      const root = renderDom(doc, { profile: PROFILES.learningHint });
      expect(count(root, 'ruby')).toBe(0);
      expect(containsText(root, 'まな')).toBe(false);
      expect(partText(root, '學', 'okuri')).toBe('ブ');
    });

    it('shows soegana', () => {
      const doc = createSingleTokenDoc('之', [
        { type: 'soegana', anchor: { from: 't1', to: 't1' }, value: 'を' },
      ]);
      const root = renderDom(doc, { profile: PROFILES.learningHint });
      expect(partText(root, '之', 'soe')).toBe('を');
    });

    it('shows kaeriten', () => {
      const doc = createSingleTokenDoc('習', [
        { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆑' },
      ]);
      const root = renderDom(doc, { profile: PROFILES.learningHint });
      expect(partText(root, '習', 'kaeri')).toBe(KAERI.RE);
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
      const root = renderDom(doc, { profile: PROFILES.full });
      expect(partText(root, '學', 'ruby')).toBe('まな');
      expect(partText(root, '學', 'okuri')).toBe('ブ');
      expect(partText(root, '而', 'kaeri')).toBe(KAERI.RE);
      expect(partText(root, '時', 'soe')).toBe('を');
      // Inside a highlight, the emphasis is drawn in the grid's emphasis row
      expect(parts(root, '習', 'emphasisRow')).toHaveLength(1);
      const highlight = closestPart(root, '習', 'highlight');
      expect(highlight).not.toBeNull();
      expect(closestPart(root, '之', 'highlight')).toBe(highlight);
    });
  });

  describe('custom profile', () => {
    it('emphasis=false hides emphasis', () => {
      const doc = createSingleTokenDoc('道', [
        { type: 'emphasis', anchor: { from: 't1', to: 't1' }, style: 'filled dot' },
      ]);
      const root = renderDom(doc, { profile: { emphasis: false } });
      expect(count(root, 'emphasis')).toBe(0);
      expect(count(root, 'emphasisRow')).toBe(0);
    });

    it('okimoji=false hides okimoji class', () => {
      const doc = createSingleTokenDoc('而', [
        { type: 'okimoji', anchor: { from: 't1', to: 't1' } },
      ]);
      const root = renderDom(doc, { profile: { okimoji: false } });
      expect(count(root, 'okimoji')).toBe(0);
    });

    it('joji=false hides joji class', () => {
      const doc = createSingleTokenDoc('之', [{ type: 'joji', anchor: { from: 't1', to: 't1' } }]);
      const root = renderDom(doc, { profile: { joji: false } });
      expect(count(root, 'joji')).toBe(0);
    });

    it('tateten=false hides tateten group', () => {
      const doc = createTwoTokenDoc('朝', '聞', [
        { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      ]);
      const root = renderDom(doc, { profile: { tateten: false } });
      expect(count(root, 'tatetenGroup')).toBe(0);
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
      const root = renderDom(doc, { profile: { saidoku: false } });
      // No element is classed as saidoku in any way (token, grid, under, suffix)
      expect(count(root, 'anySaidoku')).toBe(0);
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
      const root = renderDom(doc, { profile: { okototen: false } });
      expect(count(root, 'okototen')).toBe(0);
      expect(count(root, 'hasOkototen')).toBe(0);
    });

    it('kutoten=false hides kutoten', () => {
      const doc = createSingleTokenDoc('乎', [
        { type: 'kutoten', position: { blockId: 'b1', after: 't1' }, value: '。' },
      ]);
      const root = renderDom(doc, { profile: { kutoten: false } });
      expect(count(root, 'kutoten')).toBe(0);
    });

    it('soegana=false hides soegana', () => {
      const doc = createSingleTokenDoc('之', [
        { type: 'soegana', anchor: { from: 't1', to: 't1' }, value: 'を' },
      ]);
      const root = renderDom(doc, { profile: { soegana: false } });
      expect(count(root, 'soe')).toBe(0);
      expect(containsText(root, 'を')).toBe(false);
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
    // The tag the output starts with is part of the output string itself
    expect(html).toMatch(/^<span/);
    const root = renderDom(doc, { inline: true });
    expect(root.classList.contains('skam-document--inline')).toBe(true);
    expect(partText(root, '學', 'ruby')).toBe('まな');
  });

  it('inline mode with emphasis', () => {
    const doc = createSingleTokenDoc('道', [
      { type: 'emphasis', anchor: { from: 't1', to: 't1' }, style: 'filled dot' },
    ]);
    const root = renderDom(doc, { inline: true });
    expect(parts(root, '道', 'emphasis')).toHaveLength(1);
    expect(root.classList.contains('skam-document--inline')).toBe(true);
  });

  it('inline mode hides ref content (notes)', () => {
    const doc = createSingleTokenDoc('學', [
      {
        type: 'ref',
        position: { blockId: 'b1', after: 't1' },
        content: '注釈テキスト',
      },
    ]);
    const root = renderDom(doc, { inline: true });
    expect(count(root, 'notes')).toBe(0);
    expect(containsText(root, '注釈テキスト')).toBe(false);
  });

  it('inline mode with kaeriten', () => {
    const doc = createSingleTokenDoc('習', [
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆑' },
    ]);
    const root = renderDom(doc, { inline: true });
    expect(partText(root, '習', 'kaeri')).toBe(KAERI.RE);
    expect(root.classList.contains('skam-document--inline')).toBe(true);
  });
});

// ============================================================================
// 13. HTML escaping in mark values
// ============================================================================

describe('HTML escaping in various mark values', () => {
  // 文字列一致のまま残す: escape は出力の文字列そのものの契約。
  // DOM の検査 (値が文字としてそのまま読めること、要素が増えないこと) を併せて確かめる

  it('yomigana value with special characters', () => {
    const doc = createSingleTokenDoc('學', [
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: '<script>alert(1)</script>' },
    ]);
    const { html } = render(doc);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    const root = renderDom(doc);
    expect(root.querySelector('script')).toBeNull();
    expect(partText(root, '學', 'ruby')).toBe('<script>alert(1)</script>');
  });

  it('okurigana value with HTML entities', () => {
    const doc = createSingleTokenDoc('學', [
      { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: '<b>test</b>' },
    ]);
    const { html } = render(doc);
    expect(html).not.toContain('<b>');
    const root = renderDom(doc);
    expect(root.querySelector('b')).toBeNull();
    expect(partText(root, '學', 'okuri')).toBe('<b>test</b>');
  });

  it('soegana value with special characters', () => {
    const doc = createSingleTokenDoc('之', [
      { type: 'soegana', anchor: { from: 't1', to: 't1' }, value: '&を' },
    ]);
    const { html } = render(doc);
    expect(html).toContain('&amp;を');
    const root = renderDom(doc);
    expect(partText(root, '之', 'soe')).toBe('&を');
  });

  it('kutoten value with special characters', () => {
    const doc = createSingleTokenDoc('乎', [
      { type: 'kutoten', position: { blockId: 'b1', after: 't1' }, value: '<>' },
    ]);
    const { html } = render(doc);
    expect(html).not.toContain('<>');
    expect(html).toContain('&lt;&gt;');
    const root = renderDom(doc);
    expect(partText(root, '乎', 'kutoten')).toBe('<>');
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
    const root = renderDom(doc, { interactive: true, rubyMethod: 'ruby' });
    expect(attr(unit(root, '學'), 'data-token-id')).toBe('t1');
    const base = unit(root, '學').querySelector('rb')!;
    expect(base.classList.contains('skam-base')).toBe(true);
    expect(attr(base, 'data-token-id')).toBe('t1');
    expect(base.textContent).toBe('學');
  });

  it('interactive: single token with okurigana only (no ruby)', () => {
    const doc = createSingleTokenDoc('習', [
      { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ふ' },
    ]);
    const root = renderDom(doc, { interactive: true });
    expect(attr(unit(root, '習'), 'data-token-id')).toBe('t1');
    // No ruby element when only okurigana
    expect(root.querySelector('ruby')).toBeNull();
    expect(count(root, 'ruby')).toBe(0);
  });

  it('interactive: multi-token yomigana uses data-token-from/to', () => {
    const doc = createTwoTokenDoc('朝', '廷', [
      { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'ちょうてい' },
    ]);
    const root = renderDom(doc, { interactive: true });
    const range = unit(root, '朝廷').querySelector('[data-token-from]')!;
    expect(attr(range, 'data-token-from')).toBe('t1');
    expect(attr(range, 'data-token-to')).toBe('t2');
  });

  it('interactive: multiple tokens each with marks', () => {
    const doc = createThreeTokenDoc('子', '曰', '學', [
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'し' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: '㆑' },
      { type: 'yomigana', anchor: { from: 't3', to: 't3' }, value: 'まな' },
    ]);
    const root = renderDom(doc, { interactive: true });
    for (const token of doc.tokens) {
      expect(attr(unit(root, token.text), 'data-token-id')).toBe(token.id);
    }
  });
});
