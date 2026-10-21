/**
 * Round-trip integration tests: parse → stringify → parse
 *
 * These tests verify that SKAM documents survive the XML round-trip
 * by using both @kanbun-skam/skam-xml-parser and @kanbun-skam/skam-xml-stringify.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { createSequentialIdGenerator } from '@kanbun-skam/skam';
import type { SKAMExtensionDefinition } from '@kanbun-skam/skam/extensions';
import { parse } from '@kanbun-skam/skam-xml-parser';
import { stringify, type StringifyLoss } from '@kanbun-skam/skam-xml-stringify';
import type {
  SKAMDocument,
  KaeriMark,
  OkuriganaMark,
  YomiganaMark,
  SoeganaMark,
  KutotenMark,
  OkimojiMark,
  JojiMark,
  OkototenMark,
  SaidokuMark,
  EmphasisMark,
  TatetenMark,
  HighlightMark,
  RefMark,
  Mark,
} from '@kanbun-skam/skam';

// ============================================================================
// Basic Round-trip Tests
// ============================================================================

describe('round-trip - basic', () => {
  it('should produce XML that can be re-parsed (minimal)', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [],
      readings: [],
    };

    const xml = stringify(originalDoc);
    const reparsedDoc = parse(xml);

    expect(reparsedDoc.tokens).toHaveLength(1);
    expect(reparsedDoc.tokens[0]!.text).toBe('學');
  });

  it('should produce XML that can be re-parsed (kaeri)', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '學' },
        { id: 't2', text: '而' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [
        {
          type: 'kaeri',
          id: 'm1',
          position: { blockId: 'b1', after: 't2' },
          value: '㆑',
        } as KaeriMark,
      ],
      readings: [],
    };

    const xml = stringify(originalDoc);
    const reparsedDoc = parse(xml);

    expect(reparsedDoc.marks).toHaveLength(1);
    expect(reparsedDoc.marks[0]!.type).toBe('kaeri');
    expect((reparsedDoc.marks[0] as KaeriMark).value).toBe('㆑');
  });

  it('should produce XML that can be re-parsed (compound kaeri)', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '不' },
        { id: 't2', text: '可' },
        { id: 't3', text: '不' },
        { id: 't4', text: '學' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4'] }],
      marks: [
        // 互換: 複数の字の kaeri は 0.3 では読めるが非推奨 (0.4.0 で誤り)。この値を読めることを確かめる
        {
          type: 'kaeri',
          id: 'm1',
          position: { blockId: 'b1', after: 't1' },
          value: '㆒㆑',
        } as KaeriMark,
        {
          type: 'kaeri',
          id: 'm2',
          position: { blockId: 'b1', after: 't3' },
          value: '㆑',
        } as KaeriMark,
      ],
      readings: [],
    };

    const xml = stringify(originalDoc);
    expect(xml).toContain('kind="ichi-re"');
    expect(xml).toContain('kind="re"');

    const reparsedDoc = parse(xml);
    const kaeriMarks = reparsedDoc.marks.filter((m) => m.type === 'kaeri');
    expect(kaeriMarks).toHaveLength(2);

    const values = kaeriMarks.map((m) => (m as KaeriMark).value);
    expect(values).toContain('㆒㆑');
    expect(values).toContain('㆑');
  });

  it('should produce XML that can be re-parsed (kun attributes)', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [
        {
          type: 'yomigana',
          id: 'm1',
          anchor: { from: 't1', to: 't1' },
          value: 'まな',
        } as YomiganaMark,
        {
          type: 'okurigana',
          id: 'm2',
          anchor: { from: 't1', to: 't1' },
          value: 'びて',
        } as OkuriganaMark,
      ],
      readings: [],
    };

    const xml = stringify(originalDoc);
    const reparsedDoc = parse(xml);

    const yomigana = reparsedDoc.marks.find((m) => m.type === 'yomigana');
    const okurigana = reparsedDoc.marks.find((m) => m.type === 'okurigana');

    expect(yomigana).toBeDefined();
    expect((yomigana as YomiganaMark).value).toBe('まな');

    expect(okurigana).toBeDefined();
    expect((okurigana as OkuriganaMark).value).toBe('びて');
  });
});

// ============================================================================
// Ref Round-trip Test
// ============================================================================

describe('round-trip - ref', () => {
  it('should round-trip ref with yomigana on same token', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [
        {
          type: 'yomigana',
          id: 'm1',
          anchor: { from: 't1', to: 't1' },
          value: 'まな',
        } as YomiganaMark,
        {
          type: 'ref',
          id: 'ref-1',
          position: { blockId: 'b1', after: 't1' },
          format: 'iroha-katakana',
        } as RefMark,
      ],
      readings: [],
    };

    const xml = stringify(originalDoc);
    const reparsedDoc = parse(xml);

    const yomigana = reparsedDoc.marks.find((m) => m.type === 'yomigana');
    const ref = reparsedDoc.marks.find((m) => m.type === 'ref');

    expect(yomigana).toBeDefined();
    expect((yomigana as YomiganaMark).value).toBe('まな');
    expect(ref).toBeDefined();
    expect((ref as RefMark).format).toBe('iroha-katakana');
  });
});

// ============================================================================
// New Marks Round-trip Tests
// ============================================================================

describe('round-trip - new marks', () => {
  it('should round-trip kutoten', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [
        {
          type: 'kutoten',
          id: 'm1',
          position: { blockId: 'b1', after: 't1' },
          value: '。',
        } as KutotenMark,
      ],
      readings: [],
    };

    const xml = stringify(originalDoc);
    const reparsedDoc = parse(xml);

    const kutoten = reparsedDoc.marks.find((m) => m.type === 'kutoten');
    expect(kutoten).toBeDefined();
    expect((kutoten as KutotenMark).value).toBe('。');
    expect((kutoten as KutotenMark).position).toBeDefined();
  });

  it('should round-trip emphasis', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '學' },
        { id: 't2', text: '而' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [
        {
          type: 'emphasis',
          id: 'm1',
          anchor: { from: 't1', to: 't2' },
        } as EmphasisMark,
      ],
      readings: [],
    };

    const xml = stringify(originalDoc);
    const reparsedDoc = parse(xml);

    const emphasis = reparsedDoc.marks.find((m) => m.type === 'emphasis');
    expect(emphasis).toBeDefined();
    expect(emphasis!.anchor.from).not.toBe(emphasis!.anchor.to);
  });

  it('should round-trip highlight', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '學' },
        { id: 't2', text: '而' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [
        {
          type: 'highlight',
          id: 'm1',
          anchor: { from: 't1', to: 't2' },
          style: 'solid',
        } as HighlightMark,
      ],
      readings: [],
    };

    const xml = stringify(originalDoc);
    const reparsedDoc = parse(xml);

    const highlight = reparsedDoc.marks.find((m) => m.type === 'highlight');
    expect(highlight).toBeDefined();
    expect((highlight as HighlightMark).style).toBe('solid');
  });

  it('should round-trip tateten', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '國' },
        { id: 't2', text: '家' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [
        {
          type: 'tateten',
          id: 'm1',
          anchor: { from: 't1', to: 't2' },
        } as TatetenMark,
      ],
      readings: [],
    };

    const xml = stringify(originalDoc);
    const reparsedDoc = parse(xml);

    const tateten = reparsedDoc.marks.find((m) => m.type === 'tateten');
    expect(tateten).toBeDefined();
  });

  it('should round-trip okimoji', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '而' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [
        {
          type: 'okimoji',
          id: 'm1',
          anchor: { from: 't1', to: 't1' },
        } as OkimojiMark,
      ],
      readings: [],
    };

    const xml = stringify(originalDoc);
    const reparsedDoc = parse(xml);

    const okimoji = reparsedDoc.marks.find((m) => m.type === 'okimoji');
    expect(okimoji).toBeDefined();
  });

  it('should round-trip joji', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '之' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [
        {
          type: 'joji',
          id: 'm1',
          anchor: { from: 't1', to: 't1' },
        } as JojiMark,
      ],
      readings: [],
    };

    const xml = stringify(originalDoc);
    const reparsedDoc = parse(xml);

    const joji = reparsedDoc.marks.find((m) => m.type === 'joji');
    expect(joji).toBeDefined();
  });

  it('should round-trip saidoku', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '將' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [
        {
          type: 'saidoku',
          id: 'm1',
          anchor: { from: 't1', to: 't1' },
          forms: [
            { n: 1, yomi: 'まさ', okuri: 'に' },
            { n: 2, okuri: 'す' },
          ],
        } as SaidokuMark,
      ],
      readings: [],
    };

    const xml = stringify(originalDoc);
    const reparsedDoc = parse(xml);

    const saidoku = reparsedDoc.marks.find((m) => m.type === 'saidoku');
    expect(saidoku).toBeDefined();
    expect((saidoku as SaidokuMark).forms).toHaveLength(2);
  });

  it('should round-trip okototen', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [
        {
          type: 'okototen',
          id: 'm1',
          anchor: { from: 't1', to: 't1' },
          position: { system: 'glyph-grid', grid: '5x5', x: 4, y: 4 },
          shape: 'dot',
          sound: 'り',
        } as OkototenMark,
      ],
      readings: [],
    };

    const xml = stringify(originalDoc);
    const reparsedDoc = parse(xml);

    const okototen = reparsedDoc.marks.find((m) => m.type === 'okototen');
    expect(okototen).toBeDefined();
    expect((okototen as OkototenMark).position.grid).toBe('5x5');
    expect((okototen as OkototenMark).shape).toBe('dot');
  });
});

// ============================================================================
// Multi-token Round-trip Tests
// ============================================================================

describe('round-trip - multi-token', () => {
  it('should round-trip multi-token soegana', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '夜' },
        { id: 't2', text: '來' },
        { id: 't3', text: '風' },
        { id: 't4', text: '雨' },
        { id: 't5', text: '聲' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4', 't5'] }],
      marks: [
        {
          type: 'soegana',
          id: 'm1',
          anchor: { from: 't3', to: 't4' },
          value: 'ノ',
        } as SoeganaMark,
      ],
      readings: [],
    };

    const xml = stringify(originalDoc);
    expect(xml).toContain('<skam:kun soe="ノ">風雨</skam:kun>');

    const reparsedDoc = parse(xml);
    const soegana = reparsedDoc.marks.find((m) => m.type === 'soegana');
    expect(soegana).toBeDefined();
    expect((soegana as SoeganaMark).value).toBe('ノ');

    const fromIndex = reparsedDoc.tokens.findIndex((t) => t.id === soegana!.anchor.from);
    const toIndex = reparsedDoc.tokens.findIndex((t) => t.id === soegana!.anchor.to);
    expect(fromIndex).not.toBe(-1);
    expect(toIndex).not.toBe(-1);
    expect(toIndex - fromIndex).toBe(1);
  });

  it('should round-trip multi-token yomigana', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '風' },
        { id: 't2', text: '雨' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [
        {
          type: 'yomigana',
          id: 'm1',
          anchor: { from: 't1', to: 't2' },
          value: 'ふうう',
        } as YomiganaMark,
      ],
      readings: [],
    };

    const xml = stringify(originalDoc);
    expect(xml).toContain('<skam:kun yomi="ふうう">風雨</skam:kun>');

    const reparsedDoc = parse(xml);
    const yomigana = reparsedDoc.marks.find((m) => m.type === 'yomigana');
    expect(yomigana).toBeDefined();
    expect((yomigana as YomiganaMark).value).toBe('ふうう');

    const fromIndex = reparsedDoc.tokens.findIndex((t) => t.id === yomigana!.anchor.from);
    const toIndex = reparsedDoc.tokens.findIndex((t) => t.id === yomigana!.anchor.to);
    expect(toIndex - fromIndex).toBe(1);
  });

  it('should round-trip multi-token okurigana', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '風' },
        { id: 't2', text: '雨' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [
        {
          type: 'okurigana',
          id: 'm1',
          anchor: { from: 't1', to: 't2' },
          value: 'の',
        } as OkuriganaMark,
      ],
      readings: [],
    };

    const xml = stringify(originalDoc);
    expect(xml).toContain('<skam:kun okuri="の">風雨</skam:kun>');

    const reparsedDoc = parse(xml);
    const okurigana = reparsedDoc.marks.find((m) => m.type === 'okurigana');
    expect(okurigana).toBeDefined();
    expect((okurigana as OkuriganaMark).value).toBe('の');
  });

  it('should round-trip multi-token kun with combined attributes', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '風' },
        { id: 't2', text: '雨' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [
        {
          type: 'yomigana',
          id: 'm1',
          anchor: { from: 't1', to: 't2' },
          value: 'ふうう',
        } as YomiganaMark,
        {
          type: 'soegana',
          id: 'm2',
          anchor: { from: 't1', to: 't2' },
          value: 'ノ',
        } as SoeganaMark,
      ],
      readings: [],
    };

    const xml = stringify(originalDoc);
    expect(xml).toContain('yomi="ふうう"');
    expect(xml).toContain('soe="ノ"');
    expect(xml).toContain('>風雨</skam:kun>');

    const reparsedDoc = parse(xml);
    const yomigana = reparsedDoc.marks.find((m) => m.type === 'yomigana');
    const soegana = reparsedDoc.marks.find((m) => m.type === 'soegana');
    expect(yomigana).toBeDefined();
    expect(soegana).toBeDefined();
    expect((yomigana as YomiganaMark).value).toBe('ふうう');
    expect((soegana as SoeganaMark).value).toBe('ノ');
  });

  it('should round-trip multi-token emphasis with inner marks preserved', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '學' },
        { id: 't2', text: '而' },
        { id: 't3', text: '時' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
      marks: [
        {
          type: 'emphasis',
          id: 'm1',
          anchor: { from: 't1', to: 't2' },
          style: 'filled dot',
        } as EmphasisMark,
        {
          type: 'okurigana',
          id: 'm2',
          anchor: { from: 't1', to: 't1' },
          value: 'びて',
        } as OkuriganaMark,
      ],
      readings: [],
    };

    const xml = stringify(originalDoc);
    const reparsedDoc = parse(xml);

    const emphasis = reparsedDoc.marks.find((m) => m.type === 'emphasis');
    const okurigana = reparsedDoc.marks.find((m) => m.type === 'okurigana');
    expect(emphasis).toBeDefined();
    expect(okurigana).toBeDefined();
    expect((okurigana as OkuriganaMark).value).toBe('びて');
  });

  it('should round-trip multi-token tateten with kaeri', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '國' },
        { id: 't2', text: '家' },
        { id: 't3', text: '之' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
      marks: [
        {
          type: 'tateten',
          id: 'm1',
          anchor: { from: 't1', to: 't2' },
        } as TatetenMark,
        {
          type: 'kaeri',
          id: 'm2',
          position: { blockId: 'b1', after: 't1' },
          value: '㆑',
        } as KaeriMark,
      ],
      readings: [],
    };

    const xml = stringify(originalDoc);
    const reparsedDoc = parse(xml);

    const tateten = reparsedDoc.marks.find((m) => m.type === 'tateten');
    const kaeri = reparsedDoc.marks.find((m) => m.type === 'kaeri');
    expect(tateten).toBeDefined();
    expect(kaeri).toBeDefined();
    expect((kaeri as KaeriMark).value).toBe('㆑');
  });

  it('should round-trip multi-token highlight with style', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '學' },
        { id: 't2', text: '而' },
        { id: 't3', text: '時' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
      marks: [
        {
          type: 'highlight',
          id: 'm1',
          anchor: { from: 't1', to: 't3' },
          style: 'wavy',
        } as HighlightMark,
      ],
      readings: [],
    };

    const xml = stringify(originalDoc);
    const reparsedDoc = parse(xml);

    const highlight = reparsedDoc.marks.find((m) => m.type === 'highlight');
    expect(highlight).toBeDefined();
    expect((highlight as HighlightMark).style).toBe('wavy');

    const fromIndex = reparsedDoc.tokens.findIndex((t) => t.id === highlight!.anchor.from);
    const toIndex = reparsedDoc.tokens.findIndex((t) => t.id === highlight!.anchor.to);
    expect(toIndex - fromIndex).toBe(2);
  });

  it('should place kaeri after closing tag of multi-token kun range', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '處' },
        { id: 't2', text: '處' },
        { id: 't3', text: '聞' },
        { id: 't4', text: '啼' },
        { id: 't5', text: '鳥' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4', 't5'] }],
      marks: [
        {
          type: 'yomigana',
          id: 'm1',
          anchor: { from: 't3', to: 't3' },
          value: 'き',
        } as YomiganaMark,
        {
          type: 'okurigana',
          id: 'm2',
          anchor: { from: 't3', to: 't3' },
          value: 'ク',
        } as OkuriganaMark,
        {
          type: 'kaeri',
          id: 'm3',
          position: { blockId: 'b1', after: 't3' },
          value: '㆓',
        } as KaeriMark,
        {
          type: 'yomigana',
          id: 'm4',
          anchor: { from: 't4', to: 't5' },
          value: 'ていてう',
        } as YomiganaMark,
        {
          type: 'soegana',
          id: 'm5',
          anchor: { from: 't4', to: 't5' },
          value: 'ヲ',
        } as SoeganaMark,
        {
          type: 'kaeri',
          id: 'm6',
          position: { blockId: 'b1', after: 't5' },
          value: '㆒',
        } as KaeriMark,
      ],
      readings: [],
    };

    const xml = stringify(originalDoc);

    expect(xml).toContain('</skam:kun><skam:kaeri kind="ichi"/>');
    expect(xml).not.toContain('啼鳥<skam:kaeri kind="ichi"/></skam:kun>');

    const reparsedDoc = parse(xml);
    const kaeriMarks = reparsedDoc.marks.filter((m) => m.type === 'kaeri');
    expect(kaeriMarks).toHaveLength(2);

    const yomiganaMarks = reparsedDoc.marks.filter((m) => m.type === 'yomigana');
    expect(yomiganaMarks).toHaveLength(2);

    const soeganaMarks = reparsedDoc.marks.filter((m) => m.type === 'soegana');
    expect(soeganaMarks).toHaveLength(1);
  });

  it('should keep kaeri inside range element when on non-last token', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '國' },
        { id: 't2', text: '家' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [
        {
          type: 'tateten',
          id: 'm1',
          anchor: { from: 't1', to: 't2' },
        } as TatetenMark,
        {
          type: 'kaeri',
          id: 'm2',
          position: { blockId: 'b1', after: 't1' },
          value: '㆑',
        } as KaeriMark,
      ],
      readings: [],
    };

    const xml = stringify(originalDoc);

    expect(xml).toContain('<skam:tateten>國<skam:kaeri kind="re"/>家</skam:tateten>');
  });

  it('should round-trip multi-token kun inside emphasis', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '風' },
        { id: 't2', text: '雨' },
        { id: 't3', text: '聲' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
      marks: [
        {
          type: 'emphasis',
          id: 'm1',
          anchor: { from: 't1', to: 't3' },
        } as EmphasisMark,
        {
          type: 'soegana',
          id: 'm2',
          anchor: { from: 't1', to: 't2' },
          value: 'ノ',
        } as SoeganaMark,
      ],
      readings: [],
    };

    const xml = stringify(originalDoc);
    const reparsedDoc = parse(xml);

    const emphasis = reparsedDoc.marks.find((m) => m.type === 'emphasis');
    const soegana = reparsedDoc.marks.find((m) => m.type === 'soegana');
    expect(emphasis).toBeDefined();
    expect(soegana).toBeDefined();
    expect((soegana as SoeganaMark).value).toBe('ノ');
  });
});

// ============================================================================
// Saidoku + trailing marks Round-trip Tests
// ============================================================================

describe('round-trip - saidoku with trailing marks', () => {
  it('should round-trip saidoku with kaeri', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '將' },
        { id: 't2', text: '死' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [
        {
          type: 'saidoku',
          id: 'm1',
          anchor: { from: 't1', to: 't1' },
          forms: [
            { n: 1, yomi: 'まさ', okuri: 'に' },
            { n: 2, okuri: 'す' },
          ],
        } as SaidokuMark,
        {
          type: 'kaeri',
          id: 'm2',
          position: { blockId: 'b1', after: 't1' },
          value: '㆑',
        } as KaeriMark,
      ],
      readings: [],
    };

    const xml = stringify(originalDoc);

    // kaeri should be after </skam:saidoku>, not inside <skam:base>
    expect(xml).toContain('</skam:saidoku><skam:kaeri kind="re"/>');

    const reparsedDoc = parse(xml);

    const saidoku = reparsedDoc.marks.find((m) => m.type === 'saidoku');
    const kaeri = reparsedDoc.marks.find((m) => m.type === 'kaeri');

    expect(saidoku).toBeDefined();
    expect((saidoku as SaidokuMark).forms).toHaveLength(2);
    expect(kaeri).toBeDefined();
    expect((kaeri as KaeriMark).value).toBe('㆑');
  });
});

// ============================================================================
// Joji/Okimoji + trailing marks Round-trip Tests
// ============================================================================

describe('round-trip - joji with trailing marks', () => {
  it('should round-trip joji with kutoten', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '矣' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [
        {
          type: 'joji',
          id: 'm1',
          anchor: { from: 't1', to: 't1' },
        } as JojiMark,
        {
          type: 'kutoten',
          id: 'm2',
          position: { blockId: 'b1', after: 't1' },
          value: '。',
        } as KutotenMark,
      ],
      readings: [],
    };

    const xml = stringify(originalDoc);

    // kutoten should be after </skam:joji>, not inside it
    expect(xml).toContain('</skam:joji><skam:kutoten');

    const reparsedDoc = parse(xml);

    const joji = reparsedDoc.marks.find((m) => m.type === 'joji');
    const kutoten = reparsedDoc.marks.find((m) => m.type === 'kutoten');

    expect(joji).toBeDefined();
    expect(kutoten).toBeDefined();
    expect((kutoten as KutotenMark).value).toBe('。');
  });

  it('should round-trip joji with kaeri', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '矣' },
        { id: 't2', text: '學' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [
        {
          type: 'joji',
          id: 'm1',
          anchor: { from: 't1', to: 't1' },
        } as JojiMark,
        {
          type: 'kaeri',
          id: 'm2',
          position: { blockId: 'b1', after: 't1' },
          value: '㆑',
        } as KaeriMark,
      ],
      readings: [],
    };

    const xml = stringify(originalDoc);

    // kaeri should be after </skam:joji>, not inside it
    expect(xml).toContain('</skam:joji><skam:kaeri kind="re"/>');

    const reparsedDoc = parse(xml);

    const joji = reparsedDoc.marks.find((m) => m.type === 'joji');
    const kaeri = reparsedDoc.marks.find((m) => m.type === 'kaeri');

    expect(joji).toBeDefined();
    expect(kaeri).toBeDefined();
    expect((kaeri as KaeriMark).value).toBe('㆑');
  });
});

describe('round-trip - okimoji with trailing marks', () => {
  it('should round-trip okimoji with kutoten', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '而' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [
        {
          type: 'okimoji',
          id: 'm1',
          anchor: { from: 't1', to: 't1' },
        } as OkimojiMark,
        {
          type: 'kutoten',
          id: 'm2',
          position: { blockId: 'b1', after: 't1' },
          value: '。',
        } as KutotenMark,
      ],
      readings: [],
    };

    const xml = stringify(originalDoc);

    // kutoten should be after </skam:okimoji>, not inside it
    expect(xml).toContain('</skam:okimoji><skam:kutoten');

    const reparsedDoc = parse(xml);

    const okimoji = reparsedDoc.marks.find((m) => m.type === 'okimoji');
    const kutoten = reparsedDoc.marks.find((m) => m.type === 'kutoten');

    expect(okimoji).toBeDefined();
    expect(kutoten).toBeDefined();
    expect((kutoten as KutotenMark).value).toBe('。');
  });
});

// ============================================================================
// Readings Round-trip Tests
// ============================================================================

describe('round-trip - readings', () => {
  it('should round-trip readings', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '學' },
        { id: 't2', text: '而' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [],
      readings: [
        { kind: 'kakikudashi', text: '学びて' },
        { kind: 'yomiage', text: 'まなびて' },
      ],
    };

    const xml = stringify(originalDoc);
    const reparsedDoc = parse(xml);

    expect(reparsedDoc.readings).toHaveLength(2);
    expect(reparsedDoc.readings[0]!.kind).toBe('kakikudashi');
    expect(reparsedDoc.readings[0]!.text).toBe('学びて');
    expect(reparsedDoc.readings[1]!.kind).toBe('yomiage');
    expect(reparsedDoc.readings[1]!.text).toBe('まなびて');
  });
});

// ============================================================================
// kaeri: 複数の字の書き方 (0.3 の互換) と同じ位置の 1 字ずつの注記の往復
// ============================================================================

describe('round-trip - kaeri', () => {
  const wrap = (inner: string) =>
    `<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>甲${inner}乙</skam:block></skam:body></skam:doc>`;
  const kaeriValues = (doc: SKAMDocument) =>
    doc.marks.filter((m) => m.type === 'kaeri').map((m) => (m as KaeriMark).value);

  // 互換: 複数の字の kind は 0.4.0 で誤りになる。0.3 の間は往復で変わらないことを確かめる
  it('keeps a hyphen-joined kind (deprecated) through parse -> stringify -> parse', () => {
    const first = parse(wrap('<skam:kaeri kind="ichi-re"/>'));
    const second = parse(stringify(first));
    expect(kaeriValues(first)).toEqual(['㆒㆑']);
    expect(kaeriValues(second)).toEqual(['㆒㆑']);
  });

  it('keeps the order of kaeri marks at the same position', () => {
    const first = parse(wrap('<skam:kaeri kind="re"/><skam:kaeri kind="ichi"/>'));
    const second = parse(stringify(first));
    expect(kaeriValues(first)).toEqual(['㆑', '㆒']);
    expect(kaeriValues(second)).toEqual(['㆑', '㆒']);
  });
});

// ============================================================================
// linebreak: <skam:br/> の書き順と往復
// ============================================================================

describe('round-trip - linebreak', () => {
  const tokens = [
    { id: 't1', text: '學' },
    { id: 't2', text: '而' },
    { id: 't3', text: '時' },
    { id: 't4', text: '習' },
  ];
  const makeDoc = (marks: Mark[]): SKAMDocument => ({
    format: 'skam@0.1',
    tokens,
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4'] }],
    marks,
    readings: [],
  });
  const br = (after?: string): Mark => ({
    type: 'linebreak',
    position: after === undefined ? { blockId: 'b1' } : { blockId: 'b1', after },
  });
  const tateten = (from: string, to: string): Mark => ({ type: 'tateten', anchor: { from, to } });

  /** id を除き、字の id を文書内の字の添字に置き換えた注記の一覧 (往復で id が変わるため) */
  function comparable(doc: SKAMDocument): string[] {
    const index = (id: string) => doc.tokens.findIndex((t) => t.id === id);
    return doc.marks
      .map((m) => {
        const { id: _id, ...rest } = m as Mark & { id?: string };
        const copy = JSON.parse(JSON.stringify(rest)) as Record<string, any>;
        if (copy['position']?.['after'])
          copy['position']['after'] = index(copy['position']['after']);
        if (copy['anchor']) {
          copy['anchor'] = { from: index(copy['anchor'].from), to: index(copy['anchor'].to) };
        }
        return JSON.stringify(copy);
      })
      .sort();
  }

  /** inside-unit など validator が拒否する配置も、位置の往復は壊れない */
  const reparse = (xml: string) => parse(xml, { validate: false });

  it('kaeri、kutoten、ref、linebreak の順に書き、往復で同じ注記に戻る', () => {
    const doc = makeDoc([
      br('t1'),
      { type: 'ref', position: { blockId: 'b1', after: 't1' }, label: 'A' },
      { type: 'kutoten', position: { blockId: 'b1', after: 't1' }, value: '。' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆑' },
    ]);
    const xml = stringify(doc);
    expect(xml).toContain(
      '學<skam:kaeri kind="re"/><skam:kutoten value="。"/><skam:ref label="A"/><skam:br/>而'
    );
    expect(comparable(parse(xml))).toEqual(comparable(doc));
  });

  it('id があれば xml:id を付け、往復で id が戻る', () => {
    const doc = makeDoc([{ ...br('t1'), id: 'lb1' }]);
    const xml = stringify(doc);
    expect(xml).toContain('學<skam:br xml:id="lb1"/>而');
    expect(parse(xml).marks.find((m) => m.type === 'linebreak')!.id).toBe('lb1');
  });

  it('竪点の途中の字の後ろの linebreak は tateten の中に書き、往復で戻る', () => {
    const doc = makeDoc([tateten('t1', 't2'), br('t1')]);
    const xml = stringify(doc);
    expect(xml).toContain('<skam:tateten>學<skam:br/>而</skam:tateten>');
    expect(comparable(reparse(xml))).toEqual(comparable(doc));
  });

  it('竪点の最後の字の後ろの linebreak は </skam:tateten> の後ろに書き、往復で戻る', () => {
    const doc = makeDoc([tateten('t1', 't2'), br('t2')]);
    const xml = stringify(doc);
    expect(xml).toContain('<skam:tateten>學而</skam:tateten><skam:br/>時習');
    expect(comparable(parse(xml))).toEqual(comparable(doc));
  });

  it('竪点の最後の字の後ろの kaeri と kutoten と linebreak は、この順に </skam:tateten> の後ろに並ぶ', () => {
    const doc = makeDoc([
      tateten('t1', 't2'),
      br('t2'),
      { type: 'kutoten', position: { blockId: 'b1', after: 't2' }, value: '。' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: '㆑' },
    ]);
    const xml = stringify(doc);
    expect(xml).toContain(
      '<skam:tateten>學而</skam:tateten><skam:kaeri kind="re"/><skam:kutoten value="。"/><skam:br/>時習'
    );
    expect(comparable(parse(xml))).toEqual(comparable(doc));
  });

  it('隣り合う 2 つの竪点の間の linebreak は </skam:tateten><skam:br/><skam:tateten>', () => {
    const doc = makeDoc([tateten('t1', 't2'), tateten('t3', 't4'), br('t2')]);
    const xml = stringify(doc);
    expect(xml).toContain('</skam:tateten><skam:br/><skam:tateten>');
    expect(comparable(parse(xml))).toEqual(comparable(doc));
  });

  it('JSON -> XML -> JSON で注記の集合が変わらない', () => {
    const doc = makeDoc([
      br('t1'),
      br('t3'),
      { type: 'highlight', anchor: { from: 't1', to: 't3' } },
    ]);
    expect(comparable(parse(stringify(doc)))).toEqual(comparable(doc));
  });

  it('after の無い linebreak は表現できない (例外 / lossy なら onLoss)', () => {
    const doc = makeDoc([br()]);
    expect(() => stringify(doc)).toThrow(/BLOCK_START_LINEBREAK/);
    const losses: { code: string }[] = [];
    const xml = stringify(doc, { lossy: true, onLoss: (l) => losses.push(l) });
    expect(losses.map((l) => l.code)).toEqual(['BLOCK_START_LINEBREAK']);
    expect(xml).not.toContain('skam:br');
  });

  it('linebreak の未知のフィールドは書かない', () => {
    const doc = makeDoc([{ ...br('t1'), value: 'x' } as Mark]);
    expect(stringify(doc)).toContain('學<skam:br/>而');
  });
});

// ============================================================================
// Extensions: declaration and edu quiz marks
// ============================================================================

describe('round-trip - extensions', () => {
  const EDU = { extensions: ['edu'], extensionsRequired: ['edu'] };
  const quizExt = (quiz: string) => ({ edu: { quiz } });

  function declared(
    tokens: string[],
    marks: Mark[],
    extra: Partial<SKAMDocument> = {}
  ): SKAMDocument {
    const ids = tokens.map((_, i) => `t${i + 1}`);
    return {
      format: 'skam@0.1',
      ...EDU,
      tokens: tokens.map((text, i) => ({ id: ids[i]!, text })),
      blocks: [{ id: 'b1', tokenIds: ids }],
      marks,
      readings: [],
      ...extra,
    };
  }

  /** XML → JSON の往復。id は stringify が書かないので、連番の生成器で読み直し、mark の id を外して比べる */
  function roundTrip(doc: SKAMDocument): SKAMDocument {
    return parse(stringify(doc), { idGenerator: createSequentialIdGenerator() });
  }
  function withoutIds(doc: SKAMDocument) {
    return {
      ...doc,
      marks: doc.marks.map((m) => {
        const { id: _id, ...rest } = m;
        return rest;
      }),
    };
  }

  const anchor = { from: 't1', to: 't1' };
  const after = { blockId: 'b1', after: 't1' };
  const TEN_TYPES: [string, Mark][] = [
    ['kaeri', { type: 'kaeri', position: after, value: '㆒', ext: quizExt('問1') } as KaeriMark],
    [
      'kutoten',
      { type: 'kutoten', position: after, value: '。', ext: quizExt('問1') } as KutotenMark,
    ],
    ['okurigana', { type: 'okurigana', anchor, value: 'ブ', ext: quizExt('問1') } as OkuriganaMark],
    ['yomigana', { type: 'yomigana', anchor, value: 'まな', ext: quizExt('問1') } as YomiganaMark],
    ['soegana', { type: 'soegana', anchor, value: 'を', ext: quizExt('問1') } as SoeganaMark],
    ['okimoji', { type: 'okimoji', anchor, ext: quizExt('問1') } as OkimojiMark],
    ['joji', { type: 'joji', anchor, ext: quizExt('問1') } as JojiMark],
    [
      'okototen',
      {
        type: 'okototen',
        anchor,
        position: { system: 'glyph-grid', grid: '5x5', x: 1, y: 1 },
        shape: 'dot',
        ext: quizExt('問1'),
      } as OkototenMark,
    ],
    ['tateten', { type: 'tateten', anchor, ext: quizExt('問1') } as TatetenMark],
    [
      'saidoku',
      {
        type: 'saidoku',
        anchor,
        forms: [{ yomi: 'いま' }, { okuri: 'ず' }],
        ext: quizExt('問1'),
      } as SaidokuMark,
    ],
  ];

  it.each(TEN_TYPES)('%s の ext.edu.quiz が JSON → XML → JSON で保たれる', (_type, mark) => {
    const original = declared(['學', '而'], [mark]);
    expect(withoutIds(roundTrip(original))).toEqual(withoutIds(original));
  });

  it('範囲の yomigana と範囲の okurigana が同じ範囲で quiz が違っても保たれる', () => {
    const range = { from: 't1', to: 't2' };
    const original = declared(
      ['學', '而'],
      [
        { type: 'yomigana', anchor: range, value: 'まなび', ext: quizExt('甲') } as YomiganaMark,
        { type: 'okurigana', anchor: range, value: 'ブ', ext: quizExt('乙') } as OkuriganaMark,
      ]
    );
    expect(withoutIds(roundTrip(original))).toEqual(withoutIds(original));
  });

  it('読みだけの範囲を skam:yomigana で書いても quiz が保たれる', () => {
    const original = declared(
      ['學', '而', '時'],
      [
        {
          type: 'yomigana',
          anchor: { from: 't1', to: 't3' },
          value: 'がくじ',
          ext: quizExt('甲'),
        } as YomiganaMark,
        { type: 'okurigana', anchor: { from: 't2', to: 't2' }, value: 'ず' } as OkuriganaMark,
      ]
    );
    // 入れ子の内側の注記が先に読まれるので、注記の並びは種類で揃えて比べる
    const sorted = (doc: SKAMDocument) => ({
      ...withoutIds(doc),
      marks: withoutIds(doc).marks.sort((a, b) => a.type.localeCompare(b.type)),
    });
    expect(roundTrip(original).marks.map((m) => m.type)).toEqual(['okurigana', 'yomigana']);
    expect(sorted(roundTrip(original))).toEqual(sorted(original));
  });

  it('属性の escape を要する quiz の値が同じ値に戻る', () => {
    const quiz = 'a"<&>改行\'';
    const original = declared(
      ['學'],
      [{ type: 'kaeri', position: after, value: '㆒', ext: quizExt(quiz) } as KaeriMark]
    );
    const xml = stringify(original);
    expect(xml).not.toContain('a"<');
    expect(withoutIds(parse(xml, { idGenerator: createSequentialIdGenerator() }))).toEqual(
      withoutIds(original)
    );
  });

  it('宣言のある文書は skam:extension とルートの名前空間を書く', () => {
    const xml = stringify(declared(['學'], []));
    expect(xml).toContain('xmlns:edu="urn:skam:edu:1"');
    expect(xml).toContain('<skam:extension name="edu" uri="urn:skam:edu:1" required="true"/>');
  });

  it('拡張を使わない文書の出力に skam:extension と xmlns:edu は無い', () => {
    const plain: SKAMDocument = { ...declared(['學'], []) };
    delete plain.extensions;
    delete plain.extensionsRequired;
    const xml = stringify(plain);
    expect(xml).not.toContain('skam:extension');
    expect(xml).not.toContain('xmlns:edu');
    expect(xml).toContain('<skam:meta tokenization="char"/>');
  });

  it('知らない拡張の値は書けない: 例外、lossy なら UNKNOWN_EXTENSION、custom と宣言の無い ext は EXT', () => {
    const unknown = declared(
      ['學'],
      [{ type: 'okimoji', anchor, ext: { zzz: { a: 1 } } } as OkimojiMark],
      { extensions: ['edu', 'zzz'] }
    );
    expect(() => stringify(unknown)).toThrow();
    const losses: StringifyLoss[] = [];
    stringify(unknown, { lossy: true, onLoss: (l) => losses.push(l) });
    expect(losses.map((l) => l.code)).toContain('UNKNOWN_EXTENSION');
    expect(losses.find((l) => l.path === '/marks/0/ext/zzz')?.code).toBe('UNKNOWN_EXTENSION');

    const withCustom = declared(
      ['學'],
      [{ type: 'okimoji', anchor, custom: { a: 1 } } as OkimojiMark]
    );
    const customLosses: StringifyLoss[] = [];
    stringify(withCustom, { lossy: true, onLoss: (l) => customLosses.push(l) });
    expect(customLosses).toMatchObject([{ code: 'EXT', path: '/marks/0/custom' }]);

    const undeclared: SKAMDocument = declared(
      ['學'],
      [{ type: 'okimoji', anchor, ext: { foo: 1 } } as OkimojiMark]
    );
    delete undeclared.extensions;
    delete undeclared.extensionsRequired;
    const extLosses: StringifyLoss[] = [];
    stringify(undeclared, { lossy: true, onLoss: (l) => extLosses.push(l) });
    expect(extLosses).toMatchObject([{ code: 'EXT', path: '/marks/0/ext' }]);
  });

  it('宣言した拡張の値でも書く場所が無ければ損失になる', () => {
    const doc = declared(
      ['學'],
      [{ type: 'emphasis', anchor, ext: quizExt('問1') } as EmphasisMark]
    );
    const losses: StringifyLoss[] = [];
    stringify(doc, { lossy: true, onLoss: (l) => losses.push(l) });
    expect(losses).toMatchObject([{ code: 'EXT', path: '/marks/0/ext/edu' }]);
  });

  it('渡した定義の属性が往復で同じ値に戻る', () => {
    const test1: SKAMExtensionDefinition = {
      name: 'test1',
      uri: 'urn:test1:1',
      required: false,
      readXmlAttributes(attributes, target) {
        const n = attributes.get('n');
        const mark = target.marks[0]?.mark;
        if (n === undefined || !mark) return { values: [] };
        return { values: [{ mark, value: { n: Number(n) } }] };
      },
      writeXmlAttributes(target) {
        const value = (target.marks[0]?.mark.ext?.['test1'] ?? {}) as { n?: number };
        return new Map(value.n === undefined ? [] : [['n', String(value.n)]]);
      },
    };
    const original = declared(
      ['學'],
      [{ type: 'kaeri', position: after, value: '㆒', ext: { test1: { n: 3 } } } as KaeriMark],
      { extensions: ['test1'], extensionsRequired: [] }
    );
    delete original.extensionsRequired;
    const xml = stringify(original, { extensions: [test1] });
    expect(xml).toContain('test1:n="3"');
    const back = parse(xml, {
      extensions: [test1],
      idGenerator: createSequentialIdGenerator(),
    });
    expect(withoutIds(back)).toEqual(withoutIds(original));
  });

  it('既存の fixture の出力に拡張の記述は出ない', () => {
    for (const fixture of ['kaeri-basic', 'comprehensive', 'kun-reading-okuri', 'kutoten']) {
      const xml = readFileSync(
        new URL(
          `../../../skam-xml-parser/src/__tests__/fixtures/valid/${fixture}.xml`,
          import.meta.url
        ),
        'utf8'
      );
      const out = stringify(parse(xml));
      expect(out).not.toContain('skam:extension');
      expect(out).not.toContain('xmlns:edu');
    }
  });
});
