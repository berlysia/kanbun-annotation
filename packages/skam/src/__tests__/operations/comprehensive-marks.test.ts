/**
 * 包括的マークテスト
 *
 * 構成要素の積（組み合わせ）・可能な操作の観点から、
 * 既存テストで不足しているケースを網羅的にカバーする。
 *
 * カバー範囲:
 * 1. Multi-token anchor marks（各マーク種別 × 複数トークン範囲）
 * 2. Mark coexistence（同一トークン上のマーク共存マトリクス）
 * 3. Position-based mark combinations（kutoten + ref 等）
 * 4. Complex queries（多数マーク混在ドキュメントに対するクエリ）
 * 5. Display utilities（getAnchorText, sortMarksByPosition 等）
 * 6. Multi-block operations
 * 7. Saidoku / Okototen variations
 */
import { describe, it, expect } from 'vitest';
import type {
  KaeriMark,
  OkuriganaMark,
  YomiganaMark,
  SoeganaMark,
  EmphasisMark,
  HighlightMark,
  SaidokuMark,
  OkototenMark,
  KutotenMark,
  RefMark,
} from '../../index.js';
import {
  addMark,
  addMarkWithResult,
  updateMark,
  replaceMark,
  removeMark,
  getMarksForToken,
  getMarksForRange,
  getMarksExactRange,
  getAnchoredMarksExactRange,
  getPositionedMarksInRange,
  getMarkById,
  getBlockForToken,
  getAnchorText,
  getAnchorRangeLabel,
  getMarkSortIndex,
  sortMarksByPosition,
  isAnchorBasedMark,
  isPositionBasedMark,
  filterMarksByType,
  hasMarkValue,
  buildTokenIndexMap,
} from '../../operations/index.js';
import { assertValidDocument, createTestDocument, createMultiBlockDocument } from './helpers.js';

// ============================================================================
// 1. Multi-token anchor marks（各マーク種別 × 複数トークン範囲）
// ============================================================================

describe('Multi-token anchor marks', () => {
  describe('yomigana on multi-token range', () => {
    it('2-token range: add and validate', () => {
      const doc = createTestDocument([]);
      const result = addMark(doc, {
        type: 'yomigana',
        anchor: { from: 't1', to: 't2' },
        value: 'しいわく',
      });
      assertValidDocument(result);
      expect(result.marks).toHaveLength(1);
      const mark = result.marks[0] as YomiganaMark;
      expect(mark.anchor).toEqual({ from: 't1', to: 't2' });
      expect(mark.value).toBe('しいわく');
    });

    it('3-token range (full block): add and validate', () => {
      const doc = createTestDocument([]);
      const result = addMark(doc, {
        type: 'yomigana',
        anchor: { from: 't1', to: 't3' },
        value: 'しいわくまなぶ',
      });
      assertValidDocument(result);
      expect(result.marks).toHaveLength(1);
    });

    it('2-token range: update value', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, {
        type: 'yomigana',
        anchor: { from: 't1', to: 't2' },
        value: 'しいわく',
      });
      const id = doc.marks[0]!.id!;
      doc = updateMark(doc, id, { value: 'こいわく' });
      assertValidDocument(doc);
      expect((doc.marks[0] as YomiganaMark).value).toBe('こいわく');
    });

    it('2-token range: remove', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, {
        type: 'yomigana',
        anchor: { from: 't1', to: 't2' },
        value: 'しいわく',
      });
      doc = removeMark(doc, doc.marks[0]!.id!);
      assertValidDocument(doc);
      expect(doc.marks).toHaveLength(0);
    });

    it('multi-char value: long kana string', () => {
      const doc = createTestDocument([]);
      const result = addMark(doc, {
        type: 'yomigana',
        anchor: { from: 't1', to: 't3' },
        value: 'しのたまわくまなびて',
      });
      assertValidDocument(result);
      expect((result.marks[0] as YomiganaMark).value).toBe('しのたまわくまなびて');
    });
  });

  describe('okurigana on multi-token range', () => {
    it('2-token range: add and validate', () => {
      const doc = createTestDocument([]);
      const result = addMark(doc, {
        type: 'okurigana',
        anchor: { from: 't1', to: 't2' },
        value: 'と',
      });
      assertValidDocument(result);
      expect(result.marks).toHaveLength(1);
      expect((result.marks[0] as OkuriganaMark).anchor).toEqual({ from: 't1', to: 't2' });
    });

    it('multi-char value on 2-token range', () => {
      const doc = createTestDocument([]);
      const result = addMark(doc, {
        type: 'okurigana',
        anchor: { from: 't1', to: 't2' },
        value: 'びて',
      });
      assertValidDocument(result);
      expect((result.marks[0] as OkuriganaMark).value).toBe('びて');
    });
  });

  describe('soegana on multi-token range', () => {
    it('2-token range: add and validate', () => {
      const doc = createTestDocument([]);
      const result = addMark(doc, {
        type: 'soegana',
        anchor: { from: 't2', to: 't3' },
        value: 'をば',
      });
      assertValidDocument(result);
      expect(result.marks).toHaveLength(1);
      expect((result.marks[0] as SoeganaMark).value).toBe('をば');
    });
  });

  describe('kaeri on multi-token range', () => {
    it('2-token range: add and validate', () => {
      const doc = createTestDocument([]);
      const result = addMark(doc, {
        type: 'kaeri',
        anchor: { from: 't1', to: 't2' },
        value: '一',
      });
      assertValidDocument(result);
      expect(result.marks).toHaveLength(1);
    });

    it('compound kaeri on 2-token range', () => {
      const doc = createTestDocument([]);
      const result = addMark(doc, {
        type: 'kaeri',
        anchor: { from: 't2', to: 't3' },
        value: '一レ',
      });
      assertValidDocument(result);
      expect((result.marks[0] as KaeriMark).value).toBe('一レ');
    });
  });

  describe('emphasis on multi-token range', () => {
    it('3-token range (full block): add and validate', () => {
      const doc = createTestDocument([]);
      const result = addMark(doc, {
        type: 'emphasis',
        anchor: { from: 't1', to: 't3' },
        style: 'filled dot',
      });
      assertValidDocument(result);
      expect(result.marks).toHaveLength(1);
      expect((result.marks[0] as EmphasisMark).style).toBe('filled dot');
    });

    it('3-token range: replace to change anchor', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, {
        type: 'emphasis',
        anchor: { from: 't1', to: 't3' },
        style: 'filled dot',
      });
      const id = doc.marks[0]!.id!;
      doc = replaceMark(doc, id, {
        type: 'emphasis',
        anchor: { from: 't1', to: 't2' },
        style: 'filled sesame',
      });
      assertValidDocument(doc);
      expect((doc.marks[0] as EmphasisMark).anchor).toEqual({ from: 't1', to: 't2' });
      expect((doc.marks[0] as EmphasisMark).style).toBe('filled sesame');
    });
  });

  describe('highlight on multi-token range', () => {
    it('3-token range (full block): add and validate', () => {
      const doc = createTestDocument([]);
      const result = addMark(doc, {
        type: 'highlight',
        anchor: { from: 't1', to: 't3' },
        style: 'wavy',
      });
      assertValidDocument(result);
      expect(result.marks).toHaveLength(1);
    });

    it('3-token range: update style', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, {
        type: 'highlight',
        anchor: { from: 't1', to: 't3' },
        style: 'solid',
      });
      const id = doc.marks[0]!.id!;
      doc = updateMark(doc, id, { style: 'double' });
      assertValidDocument(doc);
      expect((doc.marks[0] as HighlightMark).style).toBe('double');
    });
  });

  describe('tateten on multi-token range', () => {
    it('3-token range (full block): add and validate', () => {
      const doc = createTestDocument([]);
      const result = addMark(doc, {
        type: 'tateten',
        anchor: { from: 't1', to: 't3' },
      });
      assertValidDocument(result);
      expect(result.marks).toHaveLength(1);
    });
  });

  describe('okimoji on multi-token range', () => {
    it('2-token range: add and validate', () => {
      const doc = createTestDocument([]);
      const result = addMark(doc, {
        type: 'okimoji',
        anchor: { from: 't1', to: 't2' },
      });
      assertValidDocument(result);
      expect(result.marks).toHaveLength(1);
    });
  });

  describe('joji on multi-token range', () => {
    it('2-token range: add and validate', () => {
      const doc = createTestDocument([]);
      const result = addMark(doc, {
        type: 'joji',
        anchor: { from: 't2', to: 't3' },
      });
      assertValidDocument(result);
      expect(result.marks).toHaveLength(1);
    });
  });

  describe('saidoku on multi-token range', () => {
    it('2-token range: add and validate', () => {
      const doc = createTestDocument([]);
      const result = addMark(doc, {
        type: 'saidoku',
        anchor: { from: 't1', to: 't2' },
        forms: [
          { n: 1, yomi: 'まさに' },
          { n: 2, yomi: 'べし' },
        ],
      });
      assertValidDocument(result);
      expect(result.marks).toHaveLength(1);
    });
  });
});

// ============================================================================
// 2. Mark coexistence matrix（同一トークン上のマーク共存）
// ============================================================================

describe('Mark coexistence matrix', () => {
  describe('Common pairs', () => {
    it('yomigana + kaeri on same token', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'し' });
      doc = addMark(doc, { type: 'kaeri', anchor: { from: 't1', to: 't1' }, value: 'レ' });
      assertValidDocument(doc);
      expect(doc.marks).toHaveLength(2);
      expect(getMarksForToken(doc, 't1')).toHaveLength(2);
    });

    it('yomigana + soegana on same token', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'し' });
      doc = addMark(doc, { type: 'soegana', anchor: { from: 't1', to: 't1' }, value: 'の' });
      assertValidDocument(doc);
      expect(getMarksForToken(doc, 't1')).toHaveLength(2);
    });

    it('okurigana + kaeri on same token', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ク' });
      doc = addMark(doc, { type: 'kaeri', anchor: { from: 't1', to: 't1' }, value: '二' });
      assertValidDocument(doc);
      expect(getMarksForToken(doc, 't1')).toHaveLength(2);
    });

    it('okurigana + soegana on same token', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ク' });
      doc = addMark(doc, { type: 'soegana', anchor: { from: 't1', to: 't1' }, value: 'に' });
      assertValidDocument(doc);
      expect(getMarksForToken(doc, 't1')).toHaveLength(2);
    });

    it('kaeri + soegana on same token', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, { type: 'kaeri', anchor: { from: 't1', to: 't1' }, value: 'レ' });
      doc = addMark(doc, { type: 'soegana', anchor: { from: 't1', to: 't1' }, value: 'を' });
      assertValidDocument(doc);
      expect(getMarksForToken(doc, 't1')).toHaveLength(2);
    });

    it('kaeri + okimoji on same token', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, { type: 'kaeri', anchor: { from: 't1', to: 't1' }, value: '一' });
      doc = addMark(doc, { type: 'okimoji', anchor: { from: 't1', to: 't1' } });
      assertValidDocument(doc);
      expect(getMarksForToken(doc, 't1')).toHaveLength(2);
    });

    it('kaeri + joji on same token', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, { type: 'kaeri', anchor: { from: 't1', to: 't1' }, value: '上' });
      doc = addMark(doc, { type: 'joji', anchor: { from: 't1', to: 't1' } });
      assertValidDocument(doc);
      expect(getMarksForToken(doc, 't1')).toHaveLength(2);
    });

    it('emphasis + yomigana on same token', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, {
        type: 'emphasis',
        anchor: { from: 't1', to: 't1' },
        style: 'filled dot',
      });
      doc = addMark(doc, { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'し' });
      assertValidDocument(doc);
      expect(getMarksForToken(doc, 't1')).toHaveLength(2);
    });

    it('emphasis + kaeri on same token', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, {
        type: 'emphasis',
        anchor: { from: 't1', to: 't1' },
        style: 'filled dot',
      });
      doc = addMark(doc, { type: 'kaeri', anchor: { from: 't1', to: 't1' }, value: 'レ' });
      assertValidDocument(doc);
      expect(getMarksForToken(doc, 't1')).toHaveLength(2);
    });

    it('emphasis + okurigana on same token', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, {
        type: 'emphasis',
        anchor: { from: 't1', to: 't1' },
        style: 'filled dot',
      });
      doc = addMark(doc, { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ク' });
      assertValidDocument(doc);
      expect(getMarksForToken(doc, 't1')).toHaveLength(2);
    });

    it('highlight + yomigana on overlapping range', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, {
        type: 'highlight',
        anchor: { from: 't1', to: 't3' },
        style: 'solid',
      });
      doc = addMark(doc, { type: 'yomigana', anchor: { from: 't2', to: 't2' }, value: 'いわく' });
      assertValidDocument(doc);
      expect(getMarksForToken(doc, 't2')).toHaveLength(2);
    });

    it('highlight + kaeri on overlapping range', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, {
        type: 'highlight',
        anchor: { from: 't1', to: 't3' },
        style: 'solid',
      });
      doc = addMark(doc, { type: 'kaeri', anchor: { from: 't2', to: 't2' }, value: 'レ' });
      assertValidDocument(doc);
      expect(getMarksForToken(doc, 't2')).toHaveLength(2);
    });

    it('emphasis + highlight on same range', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, {
        type: 'emphasis',
        anchor: { from: 't1', to: 't2' },
        style: 'filled dot',
      });
      doc = addMark(doc, {
        type: 'highlight',
        anchor: { from: 't1', to: 't2' },
        style: 'solid',
      });
      assertValidDocument(doc);
      expect(getMarksForToken(doc, 't1')).toHaveLength(2);
      expect(getMarksExactRange(doc, 't1', 't2')).toHaveLength(2);
    });

    it('tateten + yomigana on same range', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, { type: 'tateten', anchor: { from: 't1', to: 't2' } });
      doc = addMark(doc, {
        type: 'yomigana',
        anchor: { from: 't1', to: 't2' },
        value: 'しいわく',
      });
      assertValidDocument(doc);
      expect(getMarksExactRange(doc, 't1', 't2')).toHaveLength(2);
    });

    it('tateten + kaeri on same range', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, { type: 'tateten', anchor: { from: 't1', to: 't2' } });
      doc = addMark(doc, { type: 'kaeri', anchor: { from: 't1', to: 't2' }, value: '一' });
      assertValidDocument(doc);
      expect(getMarksExactRange(doc, 't1', 't2')).toHaveLength(2);
    });

    it('saidoku + kaeri on same token', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, {
        type: 'saidoku',
        anchor: { from: 't1', to: 't1' },
        forms: [
          { n: 1, yomi: 'まさ', okuri: 'に' },
          { n: 2, okuri: 'す' },
        ],
      });
      doc = addMark(doc, { type: 'kaeri', anchor: { from: 't1', to: 't1' }, value: '二' });
      assertValidDocument(doc);
      expect(getMarksForToken(doc, 't1')).toHaveLength(2);
    });

    it('okimoji + joji on same token', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, { type: 'okimoji', anchor: { from: 't2', to: 't2' } });
      doc = addMark(doc, { type: 'joji', anchor: { from: 't2', to: 't2' } });
      assertValidDocument(doc);
      expect(getMarksForToken(doc, 't2')).toHaveLength(2);
    });

    it('soegana + okimoji on same token', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, { type: 'soegana', anchor: { from: 't2', to: 't2' }, value: 'を' });
      doc = addMark(doc, { type: 'okimoji', anchor: { from: 't2', to: 't2' } });
      assertValidDocument(doc);
      expect(getMarksForToken(doc, 't2')).toHaveLength(2);
    });

    it('okototen + kaeri on same token', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, {
        type: 'okototen',
        anchor: { from: 't1', to: 't1' },
        position: { system: 'glyph-grid', grid: '5x5', x: 4, y: 4 },
        shape: 'dot',
      });
      doc = addMark(doc, { type: 'kaeri', anchor: { from: 't1', to: 't1' }, value: 'レ' });
      assertValidDocument(doc);
      expect(getMarksForToken(doc, 't1')).toHaveLength(2);
    });
  });

  describe('Triple+ mark combinations', () => {
    it('yomigana + okurigana + kaeri (common kanbun pattern)', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, { type: 'yomigana', anchor: { from: 't3', to: 't3' }, value: 'まな' });
      doc = addMark(doc, { type: 'okurigana', anchor: { from: 't3', to: 't3' }, value: 'ブ' });
      doc = addMark(doc, { type: 'kaeri', anchor: { from: 't3', to: 't3' }, value: 'レ' });
      assertValidDocument(doc);

      const marks = getMarksForToken(doc, 't3');
      expect(marks).toHaveLength(3);
      expect(marks.map((m) => m.type).sort()).toEqual(['kaeri', 'okurigana', 'yomigana']);
    });

    it('yomigana + okurigana + kaeri + soegana (4 marks)', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, { type: 'yomigana', anchor: { from: 't3', to: 't3' }, value: 'まな' });
      doc = addMark(doc, { type: 'okurigana', anchor: { from: 't3', to: 't3' }, value: 'ブ' });
      doc = addMark(doc, { type: 'kaeri', anchor: { from: 't3', to: 't3' }, value: 'レ' });
      doc = addMark(doc, { type: 'soegana', anchor: { from: 't3', to: 't3' }, value: 'を' });
      assertValidDocument(doc);

      const marks = getMarksForToken(doc, 't3');
      expect(marks).toHaveLength(4);
    });

    it('yomigana + okurigana + kaeri + emphasis (4 marks)', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, { type: 'yomigana', anchor: { from: 't3', to: 't3' }, value: 'まな' });
      doc = addMark(doc, { type: 'okurigana', anchor: { from: 't3', to: 't3' }, value: 'ブ' });
      doc = addMark(doc, { type: 'kaeri', anchor: { from: 't3', to: 't3' }, value: 'レ' });
      doc = addMark(doc, {
        type: 'emphasis',
        anchor: { from: 't3', to: 't3' },
        style: 'filled dot',
      });
      assertValidDocument(doc);

      const marks = getMarksForToken(doc, 't3');
      expect(marks).toHaveLength(4);
    });

    it('full stack: yomigana + okurigana + soegana + kaeri + emphasis + highlight (6 marks)', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, { type: 'yomigana', anchor: { from: 't3', to: 't3' }, value: 'まな' });
      doc = addMark(doc, { type: 'okurigana', anchor: { from: 't3', to: 't3' }, value: 'ブ' });
      doc = addMark(doc, { type: 'soegana', anchor: { from: 't3', to: 't3' }, value: 'を' });
      doc = addMark(doc, { type: 'kaeri', anchor: { from: 't3', to: 't3' }, value: 'レ' });
      doc = addMark(doc, {
        type: 'emphasis',
        anchor: { from: 't3', to: 't3' },
        style: 'filled dot',
      });
      doc = addMark(doc, {
        type: 'highlight',
        anchor: { from: 't3', to: 't3' },
        style: 'solid',
      });
      assertValidDocument(doc);

      const marks = getMarksForToken(doc, 't3');
      expect(marks).toHaveLength(6);
    });

    it('marks on different tokens within same document', () => {
      let doc = createTestDocument([]);
      // t1: yomigana + okurigana
      doc = addMark(doc, { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'し' });
      doc = addMark(doc, { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'の' });
      // t2: kaeri + okimoji
      doc = addMark(doc, { type: 'kaeri', anchor: { from: 't2', to: 't2' }, value: 'レ' });
      doc = addMark(doc, { type: 'okimoji', anchor: { from: 't2', to: 't2' } });
      // t3: soegana + emphasis
      doc = addMark(doc, { type: 'soegana', anchor: { from: 't3', to: 't3' }, value: 'を' });
      doc = addMark(doc, {
        type: 'emphasis',
        anchor: { from: 't3', to: 't3' },
        style: 'filled dot',
      });
      assertValidDocument(doc);

      expect(getMarksForToken(doc, 't1')).toHaveLength(2);
      expect(getMarksForToken(doc, 't2')).toHaveLength(2);
      expect(getMarksForToken(doc, 't3')).toHaveLength(2);
    });
  });

  describe('Anchor + position marks coexistence', () => {
    it('anchor mark + kutoten after same token', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, { type: 'okurigana', anchor: { from: 't3', to: 't3' }, value: 'ブ' });
      doc = addMark(doc, {
        type: 'kutoten',
        position: { blockId: 'b1', after: 't3' },
        value: '。',
      });
      assertValidDocument(doc);

      const marks = getMarksForToken(doc, 't3');
      expect(marks).toHaveLength(2);
      expect(marks.map((m) => m.type).sort()).toEqual(['kutoten', 'okurigana']);
    });

    it('anchor mark + ref after same token', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'し' });
      doc = addMark(doc, {
        type: 'ref',
        position: { blockId: 'b1', after: 't1' },
        format: 'iroha-katakana',
      });
      assertValidDocument(doc);

      const marks = getMarksForToken(doc, 't1');
      expect(marks).toHaveLength(2);
    });

    it('highlight range + kutoten at end', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, {
        type: 'highlight',
        anchor: { from: 't1', to: 't3' },
        style: 'solid',
      });
      doc = addMark(doc, {
        type: 'kutoten',
        position: { blockId: 'b1', after: 't3' },
        value: '。',
      });
      assertValidDocument(doc);

      expect(getMarksForToken(doc, 't3')).toHaveLength(2);
    });

    it('highlight with ref association + kutoten', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, {
        type: 'ref',
        position: { blockId: 'b1', after: 't2' },
        format: 'alpha-upper',
      });
      const refId = doc.marks[0]!.id!;
      doc = addMark(doc, {
        type: 'highlight',
        anchor: { from: 't1', to: 't2' },
        style: 'solid',
        ref: refId,
      });
      doc = addMark(doc, {
        type: 'kutoten',
        position: { blockId: 'b1', after: 't3' },
        value: '。',
      });
      assertValidDocument(doc);
      expect(doc.marks).toHaveLength(3);
    });
  });
});

// ============================================================================
// 3. Position-based mark combinations
// ============================================================================

describe('Position-based mark combinations', () => {
  it('kutoten + ref at same position', () => {
    const doc = createTestDocument([
      { type: 'kutoten', id: 'm1', position: { blockId: 'b1', after: 't3' }, value: '。' },
      {
        type: 'ref',
        id: 'm2',
        position: { blockId: 'b1', after: 't3' },
        format: 'iroha-katakana',
      },
    ]);
    assertValidDocument(doc);

    const marks = getMarksForToken(doc, 't3');
    expect(marks).toHaveLength(2);
    expect(marks.map((m) => m.type).sort()).toEqual(['kutoten', 'ref']);
  });

  it('multiple kutoten at different positions in same block', () => {
    const doc = createTestDocument([
      {
        type: 'kutoten',
        id: 'm1',
        position: { blockId: 'b1', after: 't1' },
        value: '、',
        kind: 'ten',
      },
      {
        type: 'kutoten',
        id: 'm2',
        position: { blockId: 'b1', after: 't3' },
        value: '。',
        kind: 'ku',
      },
    ]);
    assertValidDocument(doc);

    expect(getMarksForToken(doc, 't1')).toHaveLength(1);
    expect(getMarksForToken(doc, 't3')).toHaveLength(1);
    expect(getPositionedMarksInRange(doc, 't1', 't3')).toHaveLength(2);
  });

  it('ref at block start (no after)', () => {
    const doc = createTestDocument([
      {
        type: 'ref',
        id: 'm1',
        position: { blockId: 'b1' },
        format: 'alpha-upper',
      },
    ]);
    assertValidDocument(doc);

    // after未定義のためトークンにはマッチしない
    expect(getMarksForToken(doc, 't1')).toHaveLength(0);
  });

  it('multiple refs with different formats', () => {
    const doc = createTestDocument([
      {
        type: 'ref',
        id: 'm1',
        position: { blockId: 'b1', after: 't1' },
        format: 'alpha-upper',
      },
      {
        type: 'ref',
        id: 'm2',
        position: { blockId: 'b1', after: 't2' },
        format: 'iroha-katakana',
      },
      {
        type: 'ref',
        id: 'm3',
        position: { blockId: 'b1', after: 't3' },
        label: '注1',
      },
    ]);
    assertValidDocument(doc);
    expect(doc.marks).toHaveLength(3);
    expect(getPositionedMarksInRange(doc, 't1', 't3')).toHaveLength(3);
  });

  it('ref with content (annotation text)', () => {
    const doc = createTestDocument([
      {
        type: 'ref',
        id: 'm1',
        position: { blockId: 'b1', after: 't1' },
        content: '子とは孔子のこと。',
      },
    ]);
    assertValidDocument(doc);
    const mark = getMarkById(doc, 'm1') as RefMark | undefined;
    expect(mark?.content).toBe('子とは孔子のこと。');
  });
});

// ============================================================================
// 4. Complex queries on rich documents
// ============================================================================

describe('Complex queries on rich documents', () => {
  /**
   * Create a document with many marks of different types
   */
  function createRichDocument(): ReturnType<typeof createTestDocument> {
    return createTestDocument([
      // t1: yomigana, okurigana
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'し' },
      { type: 'okurigana', id: 'm2', anchor: { from: 't1', to: 't1' }, value: 'の' },
      // t2: kaeri, okimoji
      { type: 'kaeri', id: 'm3', anchor: { from: 't2', to: 't2' }, value: 'レ' },
      { type: 'okimoji', id: 'm4', anchor: { from: 't2', to: 't2' } },
      // t3: yomigana, okurigana, soegana, kaeri
      { type: 'yomigana', id: 'm5', anchor: { from: 't3', to: 't3' }, value: 'まな' },
      { type: 'okurigana', id: 'm6', anchor: { from: 't3', to: 't3' }, value: 'ブ' },
      { type: 'soegana', id: 'm7', anchor: { from: 't3', to: 't3' }, value: 'を' },
      { type: 'kaeri', id: 'm8', anchor: { from: 't3', to: 't3' }, value: '二' },
      // range marks
      { type: 'emphasis', id: 'm9', anchor: { from: 't1', to: 't3' }, style: 'filled dot' },
      { type: 'highlight', id: 'm10', anchor: { from: 't1', to: 't2' }, style: 'solid' },
      // position-based
      {
        type: 'kutoten',
        id: 'm11',
        position: { blockId: 'b1', after: 't3' },
        value: '。',
        kind: 'ku',
      },
      {
        type: 'ref',
        id: 'm12',
        position: { blockId: 'b1', after: 't1' },
        format: 'iroha-katakana',
      },
    ]);
  }

  it('getMarksForToken: t1 returns anchor + position marks', () => {
    const doc = createRichDocument();
    const marks = getMarksForToken(doc, 't1');
    // m1 (yomigana t1), m2 (okurigana t1), m9 (emphasis t1-t3), m10 (highlight t1-t2), m12 (ref after t1)
    expect(marks).toHaveLength(5);
    expect(marks.map((m) => m.id).sort()).toEqual(['m1', 'm10', 'm12', 'm2', 'm9']);
  });

  it('getMarksForToken: t2 returns overlapping range marks', () => {
    const doc = createRichDocument();
    const marks = getMarksForToken(doc, 't2');
    // m3 (kaeri t2), m4 (okimoji t2), m9 (emphasis t1-t3), m10 (highlight t1-t2)
    expect(marks).toHaveLength(4);
    expect(marks.map((m) => m.id).sort()).toEqual(['m10', 'm3', 'm4', 'm9']);
  });

  it('getMarksForToken: t3 returns all marks on t3', () => {
    const doc = createRichDocument();
    const marks = getMarksForToken(doc, 't3');
    // m5 (yomigana t3), m6 (okurigana t3), m7 (soegana t3), m8 (kaeri t3),
    // m9 (emphasis t1-t3), m11 (kutoten after t3)
    expect(marks).toHaveLength(6);
  });

  it('getMarksForRange: full range returns all marks', () => {
    const doc = createRichDocument();
    const marks = getMarksForRange(doc, 't1', 't3');
    expect(marks).toHaveLength(12); // all marks
  });

  it('getMarksForRange: partial range t1-t2', () => {
    const doc = createRichDocument();
    const marks = getMarksForRange(doc, 't1', 't2');
    // m1-m4 (single token on t1/t2), m9 (overlaps), m10 (exact), m12 (ref after t1)
    // Does NOT include: m5-m8 (on t3), m11 (after t3)
    const ids = marks.map((m) => m.id).sort();
    expect(ids).toContain('m1');
    expect(ids).toContain('m2');
    expect(ids).toContain('m3');
    expect(ids).toContain('m4');
    expect(ids).toContain('m9');
    expect(ids).toContain('m10');
    expect(ids).toContain('m12');
    expect(ids).not.toContain('m11'); // kutoten after t3 is out of range
  });

  it('getMarksExactRange: single token exact match', () => {
    const doc = createRichDocument();
    const marks = getMarksExactRange(doc, 't1', 't1');
    // m1 (yomigana t1-t1), m2 (okurigana t1-t1), m12 (ref after t1)
    expect(marks.map((m) => m.id).sort()).toEqual(['m1', 'm12', 'm2']);
  });

  it('getMarksExactRange: range exact match', () => {
    const doc = createRichDocument();
    const marks = getMarksExactRange(doc, 't1', 't2');
    // m10 (highlight t1-t2) + m12 (ref, after: t1 is within range 0-1)
    expect(marks).toHaveLength(2);
    const ids = marks.map((m) => m.id);
    expect(ids).toContain('m10');
    expect(ids).toContain('m12');
  });

  it('getAnchoredMarksExactRange: excludes position-based', () => {
    const doc = createRichDocument();
    const marks = getAnchoredMarksExactRange(doc, 't1', 't1');
    // Only m1, m2 (not m12 which is position-based)
    expect(marks).toHaveLength(2);
    expect(marks.every((m) => isAnchorBasedMark(m))).toBe(true);
  });

  it('getPositionedMarksInRange: returns position-based marks in range', () => {
    const doc = createRichDocument();
    const marks = getPositionedMarksInRange(doc, 't1', 't3');
    // m11 (kutoten after t3), m12 (ref after t1)
    expect(marks).toHaveLength(2);
    expect(marks.every((m) => isPositionBasedMark(m))).toBe(true);
  });

  it('getPositionedMarksInRange with type filter: kutoten only', () => {
    const doc = createRichDocument();
    const marks = getPositionedMarksInRange(doc, 't1', 't3', 'kutoten');
    expect(marks).toHaveLength(1);
    expect(marks[0]?.type).toBe('kutoten');
  });

  it('getPositionedMarksInRange with type filter: ref only', () => {
    const doc = createRichDocument();
    const marks = getPositionedMarksInRange(doc, 't1', 't3', 'ref');
    expect(marks).toHaveLength(1);
    expect(marks[0]?.type).toBe('ref');
  });

  it('filterMarksByType: filter each type from rich document', () => {
    const doc = createRichDocument();
    expect(filterMarksByType(doc.marks, 'yomigana')).toHaveLength(2);
    expect(filterMarksByType(doc.marks, 'okurigana')).toHaveLength(2);
    expect(filterMarksByType(doc.marks, 'kaeri')).toHaveLength(2);
    expect(filterMarksByType(doc.marks, 'okimoji')).toHaveLength(1);
    expect(filterMarksByType(doc.marks, 'soegana')).toHaveLength(1);
    expect(filterMarksByType(doc.marks, 'emphasis')).toHaveLength(1);
    expect(filterMarksByType(doc.marks, 'highlight')).toHaveLength(1);
    expect(filterMarksByType(doc.marks, 'kutoten')).toHaveLength(1);
    expect(filterMarksByType(doc.marks, 'ref')).toHaveLength(1);
  });

  it('hasMarkValue: correct for each mark in rich document', () => {
    const doc = createRichDocument();
    // Marks with 'value' field return true
    const yomigana = doc.marks.find((m) => m.type === 'yomigana')!;
    expect(hasMarkValue(yomigana)).toBe(true);
    const kaeri = doc.marks.find((m) => m.type === 'kaeri')!;
    expect(hasMarkValue(kaeri)).toBe(true);
    const okurigana = doc.marks.find((m) => m.type === 'okurigana')!;
    expect(hasMarkValue(okurigana)).toBe(true);
    const kutoten = doc.marks.find((m) => m.type === 'kutoten')!;
    expect(hasMarkValue(kutoten)).toBe(true);
    // Marks without 'value' field return false
    const okimoji = doc.marks.find((m) => m.type === 'okimoji')!;
    expect(hasMarkValue(okimoji)).toBe(false);
    // emphasis has style, not value
    const emphasis = doc.marks.find((m) => m.type === 'emphasis')!;
    expect(hasMarkValue(emphasis)).toBe(false);
  });
});

// ============================================================================
// 5. Display utilities with complex marks
// ============================================================================

describe('Display utilities with complex marks', () => {
  describe('getAnchorText', () => {
    it('single token: returns token text', () => {
      const doc = createTestDocument([
        { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'し' },
      ]);
      const mark = doc.marks[0]!;
      expect(getAnchorText(doc, mark)).toBe('子');
    });

    it('2-token range: concatenates texts', () => {
      const doc = createTestDocument([
        {
          type: 'yomigana',
          id: 'm1',
          anchor: { from: 't1', to: 't2' },
          value: 'しいわく',
        },
      ]);
      const mark = doc.marks[0]!;
      expect(getAnchorText(doc, mark)).toBe('子曰');
    });

    it('3-token range (full block): concatenates all texts', () => {
      const doc = createTestDocument([
        {
          type: 'emphasis',
          id: 'm1',
          anchor: { from: 't1', to: 't3' },
          style: 'filled dot',
        },
      ]);
      const mark = doc.marks[0]!;
      expect(getAnchorText(doc, mark)).toBe('子曰學');
    });

    it('multi-block: range within single block', () => {
      const doc = createMultiBlockDocument([
        {
          type: 'yomigana',
          id: 'm1',
          anchor: { from: 't4', to: 't6' },
          value: 'ときならう',
        },
      ]);
      const mark = doc.marks[0]!;
      expect(getAnchorText(doc, mark)).toBe('而時習');
    });
  });

  describe('getAnchorRangeLabel', () => {
    it('single token: returns token id', () => {
      const doc = createTestDocument([
        { type: 'kaeri', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'レ' },
      ]);
      expect(getAnchorRangeLabel(doc.marks[0]!)).toBe('t1〜t1');
    });

    it('2-token range: returns range label', () => {
      const doc = createTestDocument([
        { type: 'tateten', id: 'm1', anchor: { from: 't1', to: 't2' } },
      ]);
      expect(getAnchorRangeLabel(doc.marks[0]!)).toBe('t1〜t2');
    });

    it('3-token range: returns full range label', () => {
      const doc = createTestDocument([
        {
          type: 'emphasis',
          id: 'm1',
          anchor: { from: 't1', to: 't3' },
          style: 'filled dot',
        },
      ]);
      expect(getAnchorRangeLabel(doc.marks[0]!)).toBe('t1〜t3');
    });
  });

  describe('sortMarksByPosition', () => {
    it('sorts marks by document position (anchor from)', () => {
      const doc = createTestDocument([
        { type: 'kaeri', id: 'm3', anchor: { from: 't3', to: 't3' }, value: 'レ' },
        { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'し' },
        { type: 'okurigana', id: 'm2', anchor: { from: 't2', to: 't2' }, value: 'ク' },
      ]);

      const sorted = sortMarksByPosition(doc);
      const ids = sorted.map((m) => m.id);
      expect(ids).toEqual(['m1', 'm2', 'm3']);
    });

    it('sorts mixed anchor + position marks', () => {
      const doc = createTestDocument([
        { type: 'kaeri', id: 'm2', anchor: { from: 't2', to: 't2' }, value: 'レ' },
        { type: 'kutoten', id: 'm3', position: { blockId: 'b1', after: 't3' }, value: '。' },
        { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'し' },
      ]);

      const sorted = sortMarksByPosition(doc);
      expect(sorted[0]?.id).toBe('m1');
      expect(sorted[1]?.id).toBe('m2');
    });

    it('sorts range marks by from position', () => {
      const doc = createTestDocument([
        {
          type: 'emphasis',
          id: 'm2',
          anchor: { from: 't2', to: 't3' },
          style: 'filled dot',
        },
        {
          type: 'highlight',
          id: 'm1',
          anchor: { from: 't1', to: 't3' },
          style: 'solid',
        },
      ]);

      const sorted = sortMarksByPosition(doc);
      expect(sorted[0]?.id).toBe('m1');
      expect(sorted[1]?.id).toBe('m2');
    });
  });

  describe('getMarkSortIndex', () => {
    it('marks on later tokens have higher sort index', () => {
      const doc = createTestDocument([
        { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'し' },
        { type: 'yomigana', id: 'm2', anchor: { from: 't3', to: 't3' }, value: 'まな' },
      ]);

      const idx1 = getMarkSortIndex(doc, doc.marks[0]!);
      const idx2 = getMarkSortIndex(doc, doc.marks[1]!);
      expect(idx1).toBeLessThan(idx2);
    });
  });
});

// ============================================================================
// 6. Multi-block operations
// ============================================================================

describe('Multi-block operations', () => {
  it('add marks to both blocks', () => {
    let doc = createMultiBlockDocument([]);
    doc = addMark(doc, { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'し' });
    doc = addMark(doc, { type: 'yomigana', anchor: { from: 't4', to: 't4' }, value: 'しかして' });
    assertValidDocument(doc);
    expect(doc.marks).toHaveLength(2);
  });

  it('add position-based marks to different blocks', () => {
    let doc = createMultiBlockDocument([]);
    doc = addMark(doc, {
      type: 'kutoten',
      position: { blockId: 'b1', after: 't3' },
      value: '。',
    });
    doc = addMark(doc, {
      type: 'kutoten',
      position: { blockId: 'b2', after: 't6' },
      value: '。',
    });
    assertValidDocument(doc);
    expect(doc.marks).toHaveLength(2);
  });

  it('query marks in specific block', () => {
    const doc = createMultiBlockDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'し' },
      { type: 'yomigana', id: 'm2', anchor: { from: 't4', to: 't4' }, value: 'しかして' },
      { type: 'kaeri', id: 'm3', anchor: { from: 't5', to: 't5' }, value: 'レ' },
    ]);

    // b1 tokens
    expect(getMarksForToken(doc, 't1')).toHaveLength(1);
    expect(getMarksForToken(doc, 't2')).toHaveLength(0);
    // b2 tokens
    expect(getMarksForToken(doc, 't4')).toHaveLength(1);
    expect(getMarksForToken(doc, 't5')).toHaveLength(1);
  });

  it('range query within single block', () => {
    const doc = createMultiBlockDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't4', to: 't5' }, value: 'しかとき' },
      { type: 'kaeri', id: 'm2', anchor: { from: 't6', to: 't6' }, value: 'レ' },
    ]);

    const b2Range = getMarksForRange(doc, 't4', 't6');
    expect(b2Range).toHaveLength(2);

    const b1Range = getMarksForRange(doc, 't1', 't3');
    expect(b1Range).toHaveLength(0);
  });

  it('cross-block range query', () => {
    const doc = createMultiBlockDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'し' },
      { type: 'yomigana', id: 'm2', anchor: { from: 't6', to: 't6' }, value: 'なら' },
    ]);

    const allMarks = getMarksForRange(doc, 't1', 't6');
    expect(allMarks).toHaveLength(2);
  });

  it('remove mark from second block preserves first block marks', () => {
    let doc = createMultiBlockDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'し' },
      { type: 'yomigana', id: 'm2', anchor: { from: 't4', to: 't4' }, value: 'しかして' },
    ]);

    doc = removeMark(doc, 'm2');
    assertValidDocument(doc);
    expect(doc.marks).toHaveLength(1);
    expect(doc.marks[0]?.id).toBe('m1');
    expect(getMarksForToken(doc, 't1')).toHaveLength(1);
    expect(getMarksForToken(doc, 't4')).toHaveLength(0);
  });

  it('getBlockForToken returns correct block for each token', () => {
    const doc = createMultiBlockDocument([]);
    expect(getBlockForToken(doc, 't1')?.id).toBe('b1');
    expect(getBlockForToken(doc, 't2')?.id).toBe('b1');
    expect(getBlockForToken(doc, 't3')?.id).toBe('b1');
    expect(getBlockForToken(doc, 't4')?.id).toBe('b2');
    expect(getBlockForToken(doc, 't5')?.id).toBe('b2');
    expect(getBlockForToken(doc, 't6')?.id).toBe('b2');
  });

  it('buildTokenIndexMap covers all tokens across blocks', () => {
    const doc = createMultiBlockDocument([]);
    const indexMap = buildTokenIndexMap(doc);
    expect(indexMap.get('t1')).toBe(0);
    expect(indexMap.get('t2')).toBe(1);
    expect(indexMap.get('t3')).toBe(2);
    expect(indexMap.get('t4')).toBe(3);
    expect(indexMap.get('t5')).toBe(4);
    expect(indexMap.get('t6')).toBe(5);
  });
});

// ============================================================================
// 7. Saidoku variations
// ============================================================================

describe('Saidoku variations', () => {
  it('forms with only yomi (no okuri)', () => {
    const doc = createTestDocument([]);
    const result = addMark(doc, {
      type: 'saidoku',
      anchor: { from: 't1', to: 't1' },
      forms: [
        { n: 1, yomi: 'まさに' },
        { n: 2, yomi: 'べし' },
      ],
    });
    assertValidDocument(result);
    const mark = result.marks[0] as SaidokuMark;
    expect(mark.forms).toHaveLength(2);
    expect(mark.forms[0]?.yomi).toBe('まさに');
    expect(mark.forms[0]?.okuri).toBeUndefined();
  });

  it('forms with only okuri (no yomi)', () => {
    const doc = createTestDocument([]);
    const result = addMark(doc, {
      type: 'saidoku',
      anchor: { from: 't1', to: 't1' },
      forms: [
        { n: 1, okuri: 'に' },
        { n: 2, okuri: 'す' },
      ],
    });
    assertValidDocument(result);
    const mark = result.marks[0] as SaidokuMark;
    expect(mark.forms[0]?.yomi).toBeUndefined();
    expect(mark.forms[0]?.okuri).toBe('に');
  });

  it('forms with mixed yomi/okuri presence', () => {
    const doc = createTestDocument([]);
    const result = addMark(doc, {
      type: 'saidoku',
      anchor: { from: 't1', to: 't1' },
      forms: [
        { n: 1, yomi: 'まさ', okuri: 'に' },
        { n: 2, okuri: 'す' },
      ],
    });
    assertValidDocument(result);
    const mark = result.marks[0] as SaidokuMark;
    expect(mark.forms[0]?.yomi).toBe('まさ');
    expect(mark.forms[0]?.okuri).toBe('に');
    expect(mark.forms[1]?.yomi).toBeUndefined();
    expect(mark.forms[1]?.okuri).toBe('す');
  });

  it('3-form saidoku', () => {
    const doc = createTestDocument([]);
    const result = addMark(doc, {
      type: 'saidoku',
      anchor: { from: 't1', to: 't1' },
      forms: [
        { n: 1, yomi: 'まさ', okuri: 'に' },
        { n: 2, yomi: 'べ', okuri: 'し' },
        { n: 3, okuri: 'む' },
      ],
    });
    assertValidDocument(result);
    expect((result.marks[0] as SaidokuMark).forms).toHaveLength(3);
  });

  it('forms without n (rely on array order)', () => {
    const doc = createTestDocument([]);
    const result = addMark(doc, {
      type: 'saidoku',
      anchor: { from: 't1', to: 't1' },
      forms: [{ yomi: 'まさ', okuri: 'に' }, { okuri: 'す' }],
    });
    assertValidDocument(result);
    const mark = result.marks[0] as SaidokuMark;
    expect(mark.forms[0]?.n).toBeUndefined();
    expect(mark.forms[1]?.n).toBeUndefined();
  });

  it('multi-char yomi in saidoku forms', () => {
    const doc = createTestDocument([]);
    const result = addMark(doc, {
      type: 'saidoku',
      anchor: { from: 't1', to: 't1' },
      forms: [
        { n: 1, yomi: 'よろしく', okuri: 'に' },
        { n: 2, yomi: 'べし' },
      ],
    });
    assertValidDocument(result);
    expect((result.marks[0] as SaidokuMark).forms[0]?.yomi).toBe('よろしく');
  });

  it('update saidoku forms', () => {
    let doc = createTestDocument([]);
    doc = addMark(doc, {
      type: 'saidoku',
      anchor: { from: 't1', to: 't1' },
      forms: [
        { n: 1, yomi: 'まさ', okuri: 'に' },
        { n: 2, okuri: 'す' },
      ],
    });
    const id = doc.marks[0]!.id!;
    doc = updateMark(doc, id, {
      forms: [
        { n: 1, yomi: 'よろしく', okuri: 'は' },
        { n: 2, okuri: 'く' },
      ],
    });
    assertValidDocument(doc);
    const mark = doc.marks[0] as SaidokuMark;
    expect(mark.forms[0]?.yomi).toBe('よろしく');
    expect(mark.forms[1]?.okuri).toBe('く');
  });
});

// ============================================================================
// 8. Okototen variations
// ============================================================================

describe('Okototen variations', () => {
  it('5x5 grid at various positions', () => {
    const positions = [
      { x: 0, y: 0 }, // top-left
      { x: 4, y: 4 }, // bottom-right
      { x: 2, y: 2 }, // center
      { x: 0, y: 4 }, // bottom-left
      { x: 4, y: 0 }, // top-right
    ];

    for (const { x, y } of positions) {
      const doc = createTestDocument([]);
      const result = addMark(doc, {
        type: 'okototen',
        anchor: { from: 't1', to: 't1' },
        position: { system: 'glyph-grid', grid: '5x5', x, y },
        shape: 'dot',
      });
      assertValidDocument(result);
      const mark = result.marks[0] as OkototenMark;
      expect(mark.position.x).toBe(x);
      expect(mark.position.y).toBe(y);
    }
  });

  it('7x7 grid', () => {
    const doc = createTestDocument([]);
    const result = addMark(doc, {
      type: 'okototen',
      anchor: { from: 't1', to: 't1' },
      position: { system: 'glyph-grid', grid: '7x7', x: 6, y: 6 },
      shape: 'circle',
    });
    assertValidDocument(result);
    const mark = result.marks[0] as OkototenMark;
    expect(mark.position.grid).toBe('7x7');
    expect(mark.position.x).toBe(6);
    expect(mark.position.y).toBe(6);
  });

  it('different shapes', () => {
    const shapes = ['dot', 'circle', 'line'];
    for (const shape of shapes) {
      const doc = createTestDocument([]);
      const result = addMark(doc, {
        type: 'okototen',
        anchor: { from: 't1', to: 't1' },
        position: { system: 'glyph-grid', grid: '5x5', x: 4, y: 4 },
        shape,
      });
      assertValidDocument(result);
      expect((result.marks[0] as OkototenMark).shape).toBe(shape);
    }
  });

  it('with optional sound field', () => {
    const doc = createTestDocument([]);
    const result = addMark(doc, {
      type: 'okototen',
      anchor: { from: 't1', to: 't1' },
      position: { system: 'glyph-grid', grid: '5x5', x: 4, y: 4 },
      shape: 'dot',
      sound: 'を',
    });
    assertValidDocument(result);
    expect((result.marks[0] as OkototenMark).sound).toBe('を');
  });

  it('with optional color field', () => {
    const doc = createTestDocument([]);
    const result = addMark(doc, {
      type: 'okototen',
      anchor: { from: 't1', to: 't1' },
      position: { system: 'glyph-grid', grid: '5x5', x: 4, y: 4 },
      shape: 'dot',
      color: '朱',
    });
    assertValidDocument(result);
    expect((result.marks[0] as OkototenMark).color).toBe('朱');
  });

  it('multiple okototen on same token', () => {
    let doc = createTestDocument([]);
    doc = addMark(doc, {
      type: 'okototen',
      anchor: { from: 't1', to: 't1' },
      position: { system: 'glyph-grid', grid: '5x5', x: 4, y: 4 },
      shape: 'dot',
    });
    doc = addMark(doc, {
      type: 'okototen',
      anchor: { from: 't1', to: 't1' },
      position: { system: 'glyph-grid', grid: '5x5', x: 0, y: 0 },
      shape: 'circle',
    });
    assertValidDocument(doc);
    expect(getMarksForToken(doc, 't1')).toHaveLength(2);
  });
});

// ============================================================================
// 9. Kaeri value variations
// ============================================================================

describe('Kaeri value variations', () => {
  const kaeriValues = [
    'レ',
    '一',
    '二',
    '三',
    '四',
    '上',
    '中',
    '下',
    '甲',
    '乙',
    '丙',
    '丁',
    '天',
    '地',
    '人',
  ];

  for (const value of kaeriValues) {
    it(`kaeri value: ${value}`, () => {
      const doc = createTestDocument([]);
      const result = addMark(doc, {
        type: 'kaeri',
        anchor: { from: 't1', to: 't1' },
        value,
      });
      assertValidDocument(result);
      expect((result.marks[0] as KaeriMark).value).toBe(value);
    });
  }

  const compoundKaeriValues = ['一レ', '二レ', '上レ', '甲レ', '天レ'];
  for (const value of compoundKaeriValues) {
    it(`compound kaeri value: ${value}`, () => {
      const doc = createTestDocument([]);
      const result = addMark(doc, {
        type: 'kaeri',
        anchor: { from: 't1', to: 't1' },
        value,
      });
      assertValidDocument(result);
      expect((result.marks[0] as KaeriMark).value).toBe(value);
    });
  }
});

// ============================================================================
// 10. Emphasis style variations
// ============================================================================

describe('Emphasis style variations', () => {
  const emphasisStyles = [
    'dot',
    'circle',
    'double-circle',
    'triangle',
    'sesame',
    'filled dot',
    'filled circle',
    'filled double-circle',
    'filled triangle',
    'filled sesame',
    'open dot',
    'open circle',
    'open double-circle',
    'open triangle',
    'open sesame',
  ];

  for (const style of emphasisStyles) {
    it(`emphasis style: ${style}`, () => {
      const doc = createTestDocument([]);
      const result = addMark(doc, {
        type: 'emphasis',
        anchor: { from: 't1', to: 't1' },
        style,
      });
      assertValidDocument(result);
      expect((result.marks[0] as EmphasisMark).style).toBe(style);
    });
  }

  it('emphasis without style (default)', () => {
    const doc = createTestDocument([]);
    const result = addMark(doc, {
      type: 'emphasis',
      anchor: { from: 't1', to: 't1' },
    });
    assertValidDocument(result);
    expect((result.marks[0] as EmphasisMark).style).toBeUndefined();
  });

  it('emphasis with custom character style', () => {
    const doc = createTestDocument([]);
    const result = addMark(doc, {
      type: 'emphasis',
      anchor: { from: 't1', to: 't1' },
      style: '★',
    });
    assertValidDocument(result);
    expect((result.marks[0] as EmphasisMark).style).toBe('★');
  });
});

// ============================================================================
// 11. Highlight style variations
// ============================================================================

describe('Highlight style variations', () => {
  const highlightStyles: Array<'solid' | 'dotted' | 'dashed' | 'wavy' | 'double'> = [
    'solid',
    'dotted',
    'dashed',
    'wavy',
    'double',
  ];

  for (const style of highlightStyles) {
    it(`highlight style: ${style}`, () => {
      const doc = createTestDocument([]);
      const result = addMark(doc, {
        type: 'highlight',
        anchor: { from: 't1', to: 't2' },
        style,
      });
      assertValidDocument(result);
      expect((result.marks[0] as HighlightMark).style).toBe(style);
    });
  }

  it('highlight without style (default)', () => {
    const doc = createTestDocument([]);
    const result = addMark(doc, {
      type: 'highlight',
      anchor: { from: 't1', to: 't2' },
    });
    assertValidDocument(result);
    expect((result.marks[0] as HighlightMark).style).toBeUndefined();
  });
});

// ============================================================================
// 12. Ref format variations
// ============================================================================

describe('Ref format variations', () => {
  const refFormats = [
    'alpha-upper',
    'alpha-lower',
    'numeric-paren',
    'numeric-bracket',
    'numeric-circled',
    'iroha-katakana',
    'iroha-hiragana',
    'gojuon-katakana',
    'gojuon-hiragana',
    'kanji-numeric',
  ] as const;

  for (const format of refFormats) {
    it(`ref format: ${format}`, () => {
      const doc = createTestDocument([]);
      const result = addMark(doc, {
        type: 'ref',
        position: { blockId: 'b1', after: 't1' },
        format,
      });
      assertValidDocument(result);
      expect((result.marks[0] as RefMark).format).toBe(format);
    });
  }

  it('ref with label (no format)', () => {
    const doc = createTestDocument([]);
    const result = addMark(doc, {
      type: 'ref',
      position: { blockId: 'b1', after: 't1' },
      label: '(A)',
    });
    assertValidDocument(result);
    const mark = result.marks[0] as RefMark;
    expect(mark.label).toBe('(A)');
    expect(mark.format).toBeUndefined();
  });

  it('ref with content only', () => {
    const doc = createTestDocument([]);
    const result = addMark(doc, {
      type: 'ref',
      position: { blockId: 'b1', after: 't1' },
      content: '注釈テキスト',
    });
    assertValidDocument(result);
    const mark = result.marks[0] as RefMark;
    expect(mark.content).toBe('注釈テキスト');
  });

  it('ref with format + content', () => {
    const doc = createTestDocument([]);
    const result = addMark(doc, {
      type: 'ref',
      position: { blockId: 'b1', after: 't1' },
      format: 'numeric-bracket',
      content: '孔子の弟子',
    });
    assertValidDocument(result);
    const mark = result.marks[0] as RefMark;
    expect(mark.format).toBe('numeric-bracket');
    expect(mark.content).toBe('孔子の弟子');
  });
});

// ============================================================================
// 13. Kutoten variations
// ============================================================================

describe('Kutoten variations', () => {
  it('ku (period)', () => {
    const doc = createTestDocument([]);
    const result = addMark(doc, {
      type: 'kutoten',
      position: { blockId: 'b1', after: 't3' },
      value: '。',
      kind: 'ku',
    });
    assertValidDocument(result);
    const mark = result.marks[0] as KutotenMark;
    expect(mark.value).toBe('。');
    expect(mark.kind).toBe('ku');
  });

  it('ten (comma)', () => {
    const doc = createTestDocument([]);
    const result = addMark(doc, {
      type: 'kutoten',
      position: { blockId: 'b1', after: 't1' },
      value: '、',
      kind: 'ten',
    });
    assertValidDocument(result);
    const mark = result.marks[0] as KutotenMark;
    expect(mark.value).toBe('、');
    expect(mark.kind).toBe('ten');
  });

  it('other punctuation (nakaguro)', () => {
    const doc = createTestDocument([]);
    const result = addMark(doc, {
      type: 'kutoten',
      position: { blockId: 'b1', after: 't2' },
      value: '・',
      kind: 'other',
    });
    assertValidDocument(result);
    expect((result.marks[0] as KutotenMark).kind).toBe('other');
  });

  it('kutoten without kind (inferred)', () => {
    const doc = createTestDocument([]);
    const result = addMark(doc, {
      type: 'kutoten',
      position: { blockId: 'b1', after: 't3' },
      value: '。',
    });
    assertValidDocument(result);
    expect((result.marks[0] as KutotenMark).kind).toBeUndefined();
  });
});

// ============================================================================
// 14. CRUD operations preserving document validity
// ============================================================================

describe('CRUD operations preserve validity', () => {
  it('add many marks sequentially maintains valid document', () => {
    let doc = createTestDocument([]);
    doc = addMark(doc, { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'し' });
    doc = addMark(doc, { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'の' });
    doc = addMark(doc, { type: 'kaeri', anchor: { from: 't2', to: 't2' }, value: 'レ' });
    doc = addMark(doc, { type: 'yomigana', anchor: { from: 't3', to: 't3' }, value: 'まな' });
    doc = addMark(doc, { type: 'okurigana', anchor: { from: 't3', to: 't3' }, value: 'ブ' });
    doc = addMark(doc, {
      type: 'kutoten',
      position: { blockId: 'b1', after: 't3' },
      value: '。',
    });
    doc = addMark(doc, {
      type: 'emphasis',
      anchor: { from: 't1', to: 't3' },
      style: 'filled dot',
    });
    assertValidDocument(doc);
    expect(doc.marks).toHaveLength(7);
  });

  it('remove marks one by one maintains valid document', () => {
    let doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'し' },
      { type: 'kaeri', id: 'm2', anchor: { from: 't2', to: 't2' }, value: 'レ' },
      { type: 'okurigana', id: 'm3', anchor: { from: 't3', to: 't3' }, value: 'ブ' },
      { type: 'kutoten', id: 'm4', position: { blockId: 'b1', after: 't3' }, value: '。' },
    ]);
    assertValidDocument(doc);

    doc = removeMark(doc, 'm4');
    assertValidDocument(doc);
    expect(doc.marks).toHaveLength(3);

    doc = removeMark(doc, 'm2');
    assertValidDocument(doc);
    expect(doc.marks).toHaveLength(2);

    doc = removeMark(doc, 'm1');
    assertValidDocument(doc);
    expect(doc.marks).toHaveLength(1);

    doc = removeMark(doc, 'm3');
    assertValidDocument(doc);
    expect(doc.marks).toHaveLength(0);
  });

  it('replace mark maintains valid document', () => {
    let doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'し' },
    ]);
    assertValidDocument(doc);

    doc = replaceMark(doc, 'm1', {
      type: 'okurigana',
      anchor: { from: 't2', to: 't2' },
      value: 'ク',
    });
    assertValidDocument(doc);
    expect(doc.marks[0]?.type).toBe('okurigana');
    expect(doc.marks[0]?.id).toBe('m1');
  });

  it('update mark maintains valid document', () => {
    let doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'し' },
    ]);
    assertValidDocument(doc);

    doc = updateMark(doc, 'm1', { value: 'こ', anchor: { from: 't2', to: 't2' } });
    assertValidDocument(doc);
    expect((doc.marks[0] as YomiganaMark).value).toBe('こ');
  });

  it('addMarkWithResult returns correct markId', () => {
    const doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'し' },
    ]);

    const { doc: newDoc, markId } = addMarkWithResult(doc, {
      type: 'kaeri',
      anchor: { from: 't2', to: 't2' },
      value: 'レ',
    });
    assertValidDocument(newDoc);
    expect(markId).toBe('m2');
    expect(newDoc.marks).toHaveLength(2);
  });
});

// ============================================================================
// 15. Ext field preservation
// ============================================================================

describe('Ext field preservation', () => {
  it('ext on token is preserved through operations', () => {
    const doc = createTestDocument([]);
    // Add ext to tokens
    const docWithExt = {
      ...doc,
      tokens: doc.tokens.map((t) => ({ ...t, ext: { source: 'test' } })),
    };
    assertValidDocument(docWithExt);

    const result = addMark(docWithExt, {
      type: 'yomigana',
      anchor: { from: 't1', to: 't1' },
      value: 'し',
    });
    assertValidDocument(result);
    expect(result.tokens[0]?.ext).toEqual({ source: 'test' });
  });

  it('ext on mark is preserved through operations', () => {
    const doc = createTestDocument([
      {
        type: 'yomigana',
        id: 'm1',
        anchor: { from: 't1', to: 't1' },
        value: 'し',
        ext: { editor: 'test-tool' },
      },
    ]);
    assertValidDocument(doc);

    const result = addMark(doc, {
      type: 'kaeri',
      anchor: { from: 't2', to: 't2' },
      value: 'レ',
    });
    assertValidDocument(result);
    const yomigana = result.marks.find((m) => m.id === 'm1');
    expect(yomigana?.ext).toEqual({ editor: 'test-tool' });
  });

  it('ext on document is preserved', () => {
    const doc: ReturnType<typeof createTestDocument> = {
      ...createTestDocument([]),
      ext: { creator: 'test', version: 1 },
    };
    assertValidDocument(doc);

    const result = addMark(doc, {
      type: 'yomigana',
      anchor: { from: 't1', to: 't1' },
      value: 'し',
    });
    assertValidDocument(result);
    expect(result.ext).toEqual({ creator: 'test', version: 1 });
  });
});

// ============================================================================
// 16. PlacementHint field
// ============================================================================

describe('PlacementHint field', () => {
  it('mark with placementHint is valid', () => {
    const doc = createTestDocument([]);
    const result = addMark(doc, {
      type: 'okurigana',
      anchor: { from: 't1', to: 't1' },
      value: 'ク',
      placementHint: 'right-bottom',
    });
    assertValidDocument(result);
    expect(result.marks[0]?.placementHint).toBe('right-bottom');
  });

  it('placementHint is preserved through update', () => {
    let doc = createTestDocument([]);
    doc = addMark(doc, {
      type: 'okurigana',
      anchor: { from: 't1', to: 't1' },
      value: 'ク',
      placementHint: 'right-bottom',
    });
    const id = doc.marks[0]!.id!;
    doc = updateMark(doc, id, { value: 'ケ' });
    assertValidDocument(doc);
    expect(doc.marks[0]?.placementHint).toBe('right-bottom');
  });
});

// ============================================================================
// 17. Readings
// ============================================================================

describe('Readings in documents with marks', () => {
  it('document with marks and kakikudashi reading', () => {
    const doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't3', to: 't3' }, value: 'まな' },
      { type: 'okurigana', id: 'm2', anchor: { from: 't3', to: 't3' }, value: 'ブ' },
    ]);
    const withReadings = {
      ...doc,
      readings: [{ kind: 'kakikudashi' as const, text: '子曰く學ぶ' }],
    };
    assertValidDocument(withReadings);
    expect(withReadings.readings).toHaveLength(1);
  });

  it('document with marks and multiple reading kinds', () => {
    const doc = createTestDocument([
      { type: 'kaeri', id: 'm1', anchor: { from: 't2', to: 't2' }, value: 'レ' },
    ]);
    const withReadings = {
      ...doc,
      readings: [
        { kind: 'kundoku' as const, text: '子曰く學ぶ' },
        { kind: 'kakikudashi' as const, text: '子曰く學ぶ' },
        { kind: 'yomiage' as const, text: 'し、のたまわく、まなぶ' },
      ],
    };
    assertValidDocument(withReadings);
    expect(withReadings.readings).toHaveLength(3);
  });
});

// ============================================================================
// 18. Derivations
// ============================================================================

describe('Derivations in documents with marks', () => {
  it('document with readingOrder derivation', () => {
    const doc = createTestDocument([
      { type: 'kaeri', id: 'm1', anchor: { from: 't2', to: 't2' }, value: 'レ' },
    ]);
    const withDerivations = {
      ...doc,
      derivations: [
        {
          kind: 'readingOrder' as const,
          method: 'kaeriten-stack' as const,
          result: ['t1', 't3', 't2'],
        },
      ],
    };
    assertValidDocument(withDerivations);
    expect(withDerivations.derivations?.[0]?.result).toEqual(['t1', 't3', 't2']);
  });

  it('readingOrder with saidoku duplicate token', () => {
    const doc = createTestDocument([
      {
        type: 'saidoku',
        id: 'm1',
        anchor: { from: 't1', to: 't1' },
        forms: [
          { n: 1, yomi: 'まさ', okuri: 'に' },
          { n: 2, okuri: 'す' },
        ],
      },
    ]);
    const withDerivations = {
      ...doc,
      derivations: [
        {
          kind: 'readingOrder' as const,
          method: 'kaeriten-stack' as const,
          result: ['t1', 't2', 't3', 't1'], // t1 appears twice (saidoku re-read)
        },
      ],
    };
    assertValidDocument(withDerivations);
    expect(withDerivations.derivations?.[0]?.result.filter((id) => id === 't1')).toHaveLength(2);
  });
});
