/**
 * Round-trip integration tests: parse → stringify → parse
 *
 * These tests verify that SKAM documents survive the XML round-trip
 * by using both @kanbun-skam/skam-xml-parser and @kanbun-skam/skam-xml-stringify.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@kanbun-skam/skam-xml-parser';
import { stringify } from '@kanbun-skam/skam-xml-stringify';
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
