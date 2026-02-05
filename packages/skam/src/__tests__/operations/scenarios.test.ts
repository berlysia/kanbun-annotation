import { describe, it, expect } from 'vitest';
import type { KaeriMark, EmphasisMark, HighlightMark } from '../../index.js';
import {
  addMark,
  updateMark,
  replaceMark,
  removeMark,
  getMarksForToken,
  getMarksForRange,
  getMarksExactRange,
} from '../../operations/index.js';
import { assertValidDocument, createTestDocument } from './helpers.js';

// ============================================================================
// 8. Playground scenario（既存維持）
// ============================================================================

describe('Playground scenario: yomiganaを追加してもrefは残る', () => {
  it('8.1: refがついているトークンにyomiganaを追加してもrefは削除されない', () => {
    const initialDoc = createTestDocument([
      {
        type: 'ref',
        id: 'ref-1',
        position: { blockId: 'b1', after: 't3' },
        format: 'iroha-katakana',
      },
    ]);
    assertValidDocument(initialDoc);

    const existingYomigana = getMarksForToken(initialDoc, 't3').find((m) => m.type === 'yomigana');

    let newDoc = initialDoc;
    if (existingYomigana?.id) {
      newDoc = removeMark(newDoc, existingYomigana.id);
    }

    newDoc = addMark(newDoc, {
      type: 'yomigana',
      anchor: { from: 't3', to: 't3' },
      value: 'まな',
    });
    assertValidDocument(newDoc);

    expect(newDoc.marks).toHaveLength(2);
    expect(newDoc.marks.filter((m) => m.type === 'ref')).toHaveLength(1);
    expect(newDoc.marks.filter((m) => m.type === 'yomigana')).toHaveLength(1);
  });

  it('8.2: yomiganaがついているトークンでyomiganaを変更してもrefは削除されない', () => {
    const initialDoc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't3', to: 't3' }, value: 'がく' },
      {
        type: 'ref',
        id: 'ref-1',
        position: { blockId: 'b1', after: 't3' },
        format: 'iroha-katakana',
      },
    ]);
    assertValidDocument(initialDoc);

    const existingYomigana = getMarksForToken(initialDoc, 't3').find((m) => m.type === 'yomigana');

    let newDoc = initialDoc;
    if (existingYomigana?.id) {
      newDoc = removeMark(newDoc, existingYomigana.id);
    }

    newDoc = addMark(newDoc, {
      type: 'yomigana',
      anchor: { from: 't3', to: 't3' },
      value: 'まな',
    });
    assertValidDocument(newDoc);

    expect(newDoc.marks).toHaveLength(2);
    expect(newDoc.marks.filter((m) => m.type === 'ref')[0]?.id).toBe('ref-1');
    expect((newDoc.marks.filter((m) => m.type === 'yomigana')[0] as { value?: string }).value).toBe(
      'まな'
    );
  });
});

// ============================================================================
// 9. 操作連鎖
// ============================================================================

describe('操作連鎖', () => {
  it('9.1: add→update→remove の連鎖', () => {
    let doc = createTestDocument([]);
    assertValidDocument(doc);

    doc = addMark(doc, { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ク' });
    assertValidDocument(doc);
    const markId = doc.marks[0]?.id;
    expect(markId).toBeDefined();

    doc = updateMark(doc, markId!, { anchor: { from: 't2', to: 't2' } });
    assertValidDocument(doc);
    const mark = doc.marks[0];
    expect(mark != null && 'anchor' in mark && mark.anchor.from).toBe('t2');

    doc = removeMark(doc, markId!);
    assertValidDocument(doc);
    expect(doc.marks).toHaveLength(0);
  });

  it('9.2: 複数add→全remove', () => {
    let doc = createTestDocument([]);

    doc = addMark(doc, { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ク' });
    doc = addMark(doc, { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: 'レ' });
    doc = addMark(doc, { type: 'yomigana', anchor: { from: 't3', to: 't3' }, value: 'まな' });
    assertValidDocument(doc);
    const ids = doc.marks.map((m) => m.id);
    expect(ids).toHaveLength(3);
    for (const id of ids) {
      expect(id).toMatch(/^m-[0-9a-f]{8}$/);
    }

    doc = removeMark(doc, ids[2]!);
    doc = removeMark(doc, ids[1]!);
    doc = removeMark(doc, ids[0]!);
    assertValidDocument(doc);
    expect(doc.marks).toHaveLength(0);
  });

  it('9.3: add→getMarksForToken→remove→getMarksForToken', () => {
    let doc = createTestDocument([]);

    doc = addMark(doc, { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ク' });
    assertValidDocument(doc);
    expect(getMarksForToken(doc, 't1')).toHaveLength(1);

    doc = removeMark(doc, doc.marks[0]!.id!);
    assertValidDocument(doc);
    expect(getMarksForToken(doc, 't1')).toHaveLength(0);
  });
});

// ============================================================================
// 20. Playground シナリオ（拡充）
// ============================================================================

describe('Playground シナリオ（拡充）', () => {
  // 20.1 返り点操作
  describe('20.1 返り点操作', () => {
    it('20.1a: 返り点追加', () => {
      const doc = createTestDocument([
        { type: 'okurigana', id: 'm1', anchor: { from: 't3', to: 't3' }, value: 'ブ' },
      ]);
      assertValidDocument(doc);

      const result = addMark(doc, {
        type: 'kaeri',
        position: { blockId: 'b1', after: 't2' },
        value: 'レ',
      });
      assertValidDocument(result);

      expect(result.marks).toHaveLength(2);
      expect(result.marks[0]?.id).toBe('m1');
      expect((result.marks.find((m) => m.type === 'kaeri') as KaeriMark).value).toBe('レ');
    });

    it('20.1b: 返り点削除', () => {
      const doc = createTestDocument([
        { type: 'kaeri', id: 'm1', position: { blockId: 'b1', after: 't2' }, value: 'レ' },
        { type: 'okurigana', id: 'm2', anchor: { from: 't3', to: 't3' }, value: 'ブ' },
      ]);

      const result = removeMark(doc, 'm1');
      assertValidDocument(result);
      expect(result.marks).toHaveLength(1);
      expect(result.marks[0]?.id).toBe('m2');
    });

    it('20.1c: 返り点値変更（remove + add）', () => {
      const doc = createTestDocument([
        { type: 'kaeri', id: 'm1', position: { blockId: 'b1', after: 't2' }, value: 'レ' },
      ]);

      let result = removeMark(doc, 'm1');
      result = addMark(result, {
        type: 'kaeri',
        position: { blockId: 'b1', after: 't2' },
        value: '一レ',
      });
      assertValidDocument(result);
      expect((result.marks[0] as KaeriMark).value).toBe('一レ');
    });
  });

  // 20.2 たて点操作
  describe('20.2 たて点操作', () => {
    it('20.2a: たて点追加', () => {
      const result = addMark(createTestDocument([]), {
        type: 'tateten',
        anchor: { from: 't1', to: 't2' },
      });
      assertValidDocument(result);
      expect(result.marks[0]?.type).toBe('tateten');
    });

    it('20.2b: たて点解除（kaeri残存）', () => {
      const doc = createTestDocument([
        { type: 'tateten', id: 'm1', anchor: { from: 't1', to: 't2' } },
        { type: 'kaeri', id: 'm2', position: { blockId: 'b1', after: 't2' }, value: 'レ' },
      ]);

      const result = removeMark(doc, 'm1');
      assertValidDocument(result);
      expect(result.marks).toHaveLength(1);
      expect(result.marks[0]?.type).toBe('kaeri');
    });

    it('20.2c: たて点+返り点共存', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, { type: 'tateten', anchor: { from: 't1', to: 't2' } });
      doc = addMark(doc, { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '一' });
      assertValidDocument(doc);

      expect(getMarksExactRange(doc, 't1', 't2', 'tateten')).toHaveLength(1);
      // tateten (anchor t1-t2 exact) + kaeri (position after t1, within range 0-1)
      expect(getMarksExactRange(doc, 't1', 't2')).toHaveLength(2);
    });
  });

  // 20.3 傍点操作
  describe('20.3 傍点操作', () => {
    it('20.3a: 傍点追加', () => {
      const result = addMark(createTestDocument([]), {
        type: 'emphasis',
        anchor: { from: 't1', to: 't2' },
        style: 'filled dot',
      });
      assertValidDocument(result);
      expect((result.marks[0] as EmphasisMark).style).toBe('filled dot');
    });

    it('20.3b: 傍点スタイル変更（replaceMark）', () => {
      let doc = addMark(createTestDocument([]), {
        type: 'emphasis',
        anchor: { from: 't1', to: 't2' },
        style: 'filled dot',
      });
      const id = doc.marks[0]!.id!;

      const result = replaceMark(doc, id, {
        type: 'emphasis',
        anchor: { from: 't1', to: 't2' },
        style: 'open circle',
      });
      assertValidDocument(result);
      expect(result.marks[0]?.id).toBe(id);
      expect((result.marks[0] as EmphasisMark).style).toBe('open circle');
    });

    it('20.3c: 傍点解除', () => {
      let doc = addMark(createTestDocument([]), {
        type: 'emphasis',
        anchor: { from: 't1', to: 't2' },
        style: 'filled dot',
      });

      const result = removeMark(doc, doc.marks[0]!.id!);
      assertValidDocument(result);
      expect(result.marks).toHaveLength(0);
    });

    it('20.3d: 部分重複検出', () => {
      let doc = addMark(createTestDocument([]), {
        type: 'emphasis',
        anchor: { from: 't1', to: 't3' },
        style: 'filled dot',
      });

      expect(getMarksForRange(doc, 't2', 't3')).toHaveLength(1);
      expect(getMarksExactRange(doc, 't2', 't3')).toHaveLength(0);
    });
  });

  // 20.4 傍線操作
  describe('20.4 傍線操作', () => {
    it('20.4a: 傍線追加', () => {
      const result = addMark(createTestDocument([]), {
        type: 'highlight',
        anchor: { from: 't1', to: 't2' },
        style: 'solid',
      });
      assertValidDocument(result);
      expect(result.marks[0]?.type).toBe('highlight');
    });

    it('20.4b: 傍線スタイル変更（replaceMark）', () => {
      let doc = addMark(createTestDocument([]), {
        type: 'highlight',
        anchor: { from: 't1', to: 't2' },
        style: 'solid',
      });
      const id = doc.marks[0]!.id!;

      const result = replaceMark(doc, id, {
        type: 'highlight',
        anchor: { from: 't1', to: 't2' },
        style: 'wavy',
      });
      assertValidDocument(result);
      expect(result.marks[0]?.id).toBe(id);
      expect((result.marks[0] as HighlightMark).style).toBe('wavy');
    });

    it('20.4c: ref付き傍線追加', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, {
        type: 'ref',
        position: { blockId: 'b1', after: 't2' },
        format: 'iroha-katakana',
      });
      const refId = doc.marks[0]!.id!;

      doc = addMark(doc, {
        type: 'highlight',
        anchor: { from: 't1', to: 't2' },
        style: 'solid',
        ref: refId,
      });
      assertValidDocument(doc);
      expect(doc.marks).toHaveLength(2);
    });

    it('20.4d: ref付き傍線解除（両方削除）', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, {
        type: 'ref',
        position: { blockId: 'b1', after: 't2' },
        format: 'iroha-katakana',
      });
      const refId = doc.marks[0]!.id!;
      doc = addMark(doc, {
        type: 'highlight',
        anchor: { from: 't1', to: 't2' },
        style: 'solid',
        ref: refId,
      });

      doc = removeMark(doc, doc.marks[1]!.id!);
      expect(doc.marks).toHaveLength(1);

      doc = removeMark(doc, refId);
      assertValidDocument(doc);
      expect(doc.marks).toHaveLength(0);
    });

    it('20.4e: 傍線解除（ref無し）', () => {
      let doc = addMark(createTestDocument([]), {
        type: 'highlight',
        anchor: { from: 't1', to: 't2' },
        style: 'solid',
      });

      doc = removeMark(doc, doc.marks[0]!.id!);
      assertValidDocument(doc);
      expect(doc.marks).toHaveLength(0);
    });
  });

  // 20.5 仮名操作
  describe('20.5 仮名操作', () => {
    it('20.5a: 読み仮名追加', () => {
      const result = addMark(createTestDocument([]), {
        type: 'yomigana',
        anchor: { from: 't1', to: 't1' },
        value: 'し',
      });
      assertValidDocument(result);
      expect(result.marks[0]?.type).toBe('yomigana');
    });

    it('20.5b: 読み仮名更新（remove + add）', () => {
      let doc = addMark(createTestDocument([]), {
        type: 'yomigana',
        anchor: { from: 't1', to: 't1' },
        value: 'し',
      });

      doc = removeMark(doc, doc.marks[0]!.id!);
      doc = addMark(doc, {
        type: 'yomigana',
        anchor: { from: 't1', to: 't1' },
        value: 'こ',
      });
      assertValidDocument(doc);
      expect((doc.marks[0] as { value: string }).value).toBe('こ');
    });

    it('20.5c: 送り仮名追加', () => {
      const result = addMark(createTestDocument([]), {
        type: 'okurigana',
        anchor: { from: 't3', to: 't3' },
        value: 'ブ',
      });
      assertValidDocument(result);
      expect(result.marks[0]?.type).toBe('okurigana');
    });

    it('20.5d: 添え仮名追加', () => {
      const result = addMark(createTestDocument([]), {
        type: 'soegana',
        anchor: { from: 't2', to: 't2' },
        value: 'ク',
      });
      assertValidDocument(result);
      expect(result.marks[0]?.type).toBe('soegana');
    });

    it('20.5e: 異種仮名共存', () => {
      let doc = createTestDocument([]);
      doc = addMark(doc, { type: 'yomigana', anchor: { from: 't3', to: 't3' }, value: 'まな' });
      doc = addMark(doc, { type: 'okurigana', anchor: { from: 't3', to: 't3' }, value: 'ブ' });
      assertValidDocument(doc);

      const types = doc.marks.map((m) => m.type);
      expect(types).toContain('yomigana');
      expect(types).toContain('okurigana');
    });

    it('20.5f: 部分重複拒否確認', () => {
      let doc = addMark(createTestDocument([]), {
        type: 'yomigana',
        anchor: { from: 't1', to: 't3' },
        value: 'しいわくまなぶ',
      });

      expect(getMarksForRange(doc, 't1', 't2').filter((m) => m.type === 'yomigana')).toHaveLength(
        1
      );
      expect(getMarksExactRange(doc, 't1', 't2', 'yomigana')).toHaveLength(0);
    });
  });

  // 20.6 replaceMarkによる更新パターン
  describe('20.6 replaceMarkによる更新パターン', () => {
    it('20.6a: emphasis の remove+add と replaceMark は同等結果', () => {
      const initialDoc = createTestDocument([]);

      // パターンA: remove + add
      let docA = addMark(initialDoc, {
        type: 'emphasis',
        anchor: { from: 't1', to: 't2' },
        style: 'filled dot',
      });
      docA = removeMark(docA, docA.marks[0]!.id!);
      docA = addMark(docA, {
        type: 'emphasis',
        anchor: { from: 't1', to: 't2' },
        style: 'open circle',
      });

      // パターンB: replaceMark
      let docB = addMark(initialDoc, {
        type: 'emphasis',
        anchor: { from: 't1', to: 't2' },
        style: 'filled dot',
      });
      const idB = docB.marks[0]!.id!;
      docB = replaceMark(docB, idB, {
        type: 'emphasis',
        anchor: { from: 't1', to: 't2' },
        style: 'open circle',
      });

      expect((docA.marks[0] as EmphasisMark).style).toBe('open circle');
      expect((docB.marks[0] as EmphasisMark).style).toBe('open circle');
      expect(docB.marks[0]?.id).toBe(idB); // replaceMarkはID保持
    });

    it('20.6b: highlight の replace（ID保持、全プロパティ更新）', () => {
      let doc = addMark(createTestDocument([]), {
        type: 'highlight',
        anchor: { from: 't1', to: 't2' },
        style: 'solid',
      });
      const id = doc.marks[0]!.id!;

      doc = replaceMark(doc, id, {
        type: 'highlight',
        anchor: { from: 't1', to: 't3' },
        style: 'wavy',
        ref: 'ref-1',
      });
      assertValidDocument(doc);

      expect(doc.marks[0]?.id).toBe(id);
      const highlight = doc.marks[0] as HighlightMark;
      expect(highlight.style).toBe('wavy');
      expect(highlight.ref).toBe('ref-1');
      expect(highlight.anchor).toEqual({ from: 't1', to: 't3' });
    });
  });
});
