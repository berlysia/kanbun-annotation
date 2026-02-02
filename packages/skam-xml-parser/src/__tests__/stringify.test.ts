import { describe, it, expect } from 'vitest';
import { parse, stringify } from '../index.js';
import type {
  SKAMDocument,
  KaeriMark,
  OkuriganaMark,
  YomiganaMark,
  SoeganaMark,
} from '@kanbun/skam';

// ============================================================================
// Basic Stringify Tests
// ============================================================================

describe('stringify - basic', () => {
  it('should stringify minimal document', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學', ext: { blockId: 'b1' } }],
      marks: [],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<skam:doc xmlns:skam="urn:skam:1">');
    expect(xml).toContain('<skam:block>學</skam:block>');
    expect(xml).toContain('</skam:doc>');
  });

  it('should omit XML declaration when xmlDeclaration is false', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學', ext: { blockId: 'b1' } }],
      marks: [],
      readings: [],
    };

    const xml = stringify(doc, { xmlDeclaration: false });

    expect(xml).not.toContain('<?xml');
    expect(xml).toContain('<skam:doc');
  });

  it('should use custom indent size', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學', ext: { blockId: 'b1' } }],
      marks: [],
      readings: [],
    };

    const xml = stringify(doc, { indent: 4 });

    expect(xml).toContain('    <skam:meta>');
    expect(xml).toContain('        <skam:tokenize');
  });
});

// ============================================================================
// Kaeri Tests
// ============================================================================

describe('stringify - kaeri', () => {
  it('should stringify kaeri (レ点)', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '學', ext: { blockId: 'b1' } },
        { id: 't2', text: '而', ext: { blockId: 'b1' } },
        { id: 't3', text: '時', ext: { blockId: 'b1' } },
      ],
      marks: [
        {
          type: 'kaeri',
          id: 'm1',
          anchor: { from: 't2', to: 't2' },
          value: 'レ',
        } as KaeriMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('學而<skam:kaeri kind="re"/>時');
  });

  it('should stringify multiple kaeri kinds', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '甲', ext: { blockId: 'b1' } },
        { id: 't2', text: '乙', ext: { blockId: 'b1' } },
        { id: 't3', text: '丙', ext: { blockId: 'b1' } },
      ],
      marks: [
        { type: 'kaeri', id: 'm1', anchor: { from: 't1', to: 't1' }, value: '一' } as KaeriMark,
        { type: 'kaeri', id: 'm2', anchor: { from: 't2', to: 't2' }, value: '二' } as KaeriMark,
        { type: 'kaeri', id: 'm3', anchor: { from: 't3', to: 't3' }, value: '上' } as KaeriMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('kind="ichi"');
    expect(xml).toContain('kind="ni"');
    expect(xml).toContain('kind="jo"');
  });
});

// ============================================================================
// Okurigana Tests
// ============================================================================

describe('stringify - okurigana', () => {
  it('should stringify okurigana', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '學', ext: { blockId: 'b1' } },
        { id: 't2', text: '而', ext: { blockId: 'b1' } },
      ],
      marks: [
        {
          type: 'okurigana',
          id: 'm1',
          anchor: { from: 't1', to: 't1' },
          value: 'びて',
        } as OkuriganaMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('<skam:kun okuri="びて">學</skam:kun>而');
  });
});

// ============================================================================
// Yomigana Tests
// ============================================================================

describe('stringify - yomigana', () => {
  it('should stringify yomigana', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學', ext: { blockId: 'b1' } }],
      marks: [
        {
          type: 'yomigana',
          id: 'm1',
          anchor: { from: 't1', to: 't1' },
          value: 'まな',
        } as YomiganaMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('<skam:kun yomi="まな">學</skam:kun>');
  });
});

// ============================================================================
// Soegana Tests
// ============================================================================

describe('stringify - soegana', () => {
  it('should stringify soegana', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '之', ext: { blockId: 'b1' } }],
      marks: [
        {
          type: 'soegana',
          id: 'm1',
          anchor: { from: 't1', to: 't1' },
          value: 'を',
        } as SoeganaMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('<skam:kun soe="を">之</skam:kun>');
  });
});

// ============================================================================
// Combined Attributes Tests
// ============================================================================

describe('stringify - combined attributes', () => {
  it('should stringify yomi and okuri on same token', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學', ext: { blockId: 'b1' } }],
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

    const xml = stringify(doc);

    expect(xml).toContain('yomi="まな"');
    expect(xml).toContain('okuri="びて"');
    expect(xml).toContain('>學</skam:kun>');
  });

  it('should stringify yomi, okuri, and soe on same token', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學', ext: { blockId: 'b1' } }],
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
          value: 'び',
        } as OkuriganaMark,
        {
          type: 'soegana',
          id: 'm3',
          anchor: { from: 't1', to: 't1' },
          value: 'を',
        } as SoeganaMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('yomi="まな"');
    expect(xml).toContain('okuri="び"');
    expect(xml).toContain('soe="を"');
  });
});

// ============================================================================
// Multiple Blocks Tests
// ============================================================================

describe('stringify - multiple blocks', () => {
  it('should stringify multiple blocks', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '學', ext: { blockId: 'b1' } },
        { id: 't2', text: '而', ext: { blockId: 'b1' } },
        { id: 't3', text: '時', ext: { blockId: 'b2' } },
        { id: 't4', text: '習', ext: { blockId: 'b2' } },
      ],
      marks: [],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('<skam:block>學而</skam:block>');
    expect(xml).toContain('<skam:block>時習</skam:block>');
  });
});

// ============================================================================
// Round-trip Tests
// ============================================================================

describe('stringify - round-trip', () => {
  it('should produce XML that can be re-parsed (minimal)', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學', ext: { blockId: 'b1' } }],
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
        { id: 't1', text: '學', ext: { blockId: 'b1' } },
        { id: 't2', text: '而', ext: { blockId: 'b1' } },
      ],
      marks: [
        {
          type: 'kaeri',
          id: 'm1',
          anchor: { from: 't2', to: 't2' },
          value: 'レ',
        } as KaeriMark,
      ],
      readings: [],
    };

    const xml = stringify(originalDoc);
    const reparsedDoc = parse(xml);

    expect(reparsedDoc.marks).toHaveLength(1);
    expect(reparsedDoc.marks[0]!.type).toBe('kaeri');
    expect((reparsedDoc.marks[0] as KaeriMark).value).toBe('レ');
  });

  it('should produce XML that can be re-parsed (kun attributes)', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學', ext: { blockId: 'b1' } }],
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
// XML Escaping Tests
// ============================================================================

describe('stringify - XML escaping', () => {
  it('should escape special characters in text', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '<>&"\'', ext: { blockId: 'b1' } }],
      marks: [],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('&lt;&gt;&amp;&quot;&apos;');
  });

  it('should escape special characters in attributes', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學', ext: { blockId: 'b1' } }],
      marks: [
        {
          type: 'yomigana',
          id: 'm1',
          anchor: { from: 't1', to: 't1' },
          value: '<test>',
        } as YomiganaMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('yomi="&lt;test&gt;"');
  });
});
