import { describe, it, expect } from 'vitest';
import { parse, stringify } from '../index.js';
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
// Kutoten Tests
// ============================================================================

describe('stringify - kutoten', () => {
  it('should stringify kutoten', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '學', ext: { blockId: 'b1' } },
        { id: 't2', text: '而', ext: { blockId: 'b1' } },
      ],
      marks: [
        {
          type: 'kutoten',
          id: 'm1',
          anchor: { from: 't2', to: 't2' },
          value: '。',
        } as KutotenMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('學而<skam:kutoten value="。"');
  });

  it('should stringify kutoten with kind', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學', ext: { blockId: 'b1' } }],
      marks: [
        {
          type: 'kutoten',
          id: 'm1',
          anchor: { from: 't1', to: 't1' },
          value: '、',
          kind: 'ten',
        } as KutotenMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('value="、"');
    expect(xml).toContain('kind="ten"');
  });
});

// ============================================================================
// Okimoji Tests
// ============================================================================

describe('stringify - okimoji', () => {
  it('should stringify okimoji', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '學', ext: { blockId: 'b1' } },
        { id: 't2', text: '而', ext: { blockId: 'b1' } },
      ],
      marks: [
        {
          type: 'okimoji',
          id: 'm1',
          anchor: { from: 't2', to: 't2' },
        } as OkimojiMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('學<skam:okimoji>而</skam:okimoji>');
  });
});

// ============================================================================
// Joji Tests
// ============================================================================

describe('stringify - joji', () => {
  it('should stringify joji', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '學', ext: { blockId: 'b1' } },
        { id: 't2', text: '之', ext: { blockId: 'b1' } },
      ],
      marks: [
        {
          type: 'joji',
          id: 'm1',
          anchor: { from: 't2', to: 't2' },
        } as JojiMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('學<skam:joji>之</skam:joji>');
  });
});

// ============================================================================
// Okototen Tests
// ============================================================================

describe('stringify - okototen', () => {
  it('should stringify okototen', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學', ext: { blockId: 'b1' } }],
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

    const xml = stringify(doc);

    expect(xml).toContain('<skam:okototen');
    expect(xml).toContain('grid="5x5"');
    expect(xml).toContain('x="4"');
    expect(xml).toContain('y="4"');
    expect(xml).toContain('shape="dot"');
    expect(xml).toContain('sound="り"');
    expect(xml).toContain('>學</skam:okototen>');
  });
});

// ============================================================================
// Saidoku Tests
// ============================================================================

describe('stringify - saidoku', () => {
  it('should stringify saidoku', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '將', ext: { blockId: 'b1' } }],
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

    const xml = stringify(doc);

    expect(xml).toContain('<skam:saidoku>');
    expect(xml).toContain('<skam:base>將</skam:base>');
    expect(xml).toContain('<skam:kunform n="1" yomi="まさ" okuri="に"/>');
    expect(xml).toContain('<skam:kunform n="2" okuri="す"/>');
    expect(xml).toContain('</skam:saidoku>');
  });
});

// ============================================================================
// Emphasis Tests
// ============================================================================

describe('stringify - emphasis', () => {
  it('should stringify emphasis (single token)', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '學', ext: { blockId: 'b1' } },
        { id: 't2', text: '而', ext: { blockId: 'b1' } },
      ],
      marks: [
        {
          type: 'emphasis',
          id: 'm1',
          anchor: { from: 't1', to: 't1' },
        } as EmphasisMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('<skam:span type="emphasis">學</skam:span>而');
  });

  it('should stringify emphasis (multiple tokens)', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '學', ext: { blockId: 'b1' } },
        { id: 't2', text: '而', ext: { blockId: 'b1' } },
        { id: 't3', text: '時', ext: { blockId: 'b1' } },
      ],
      marks: [
        {
          type: 'emphasis',
          id: 'm1',
          anchor: { from: 't1', to: 't2' },
        } as EmphasisMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('<skam:span type="emphasis">學而</skam:span>時');
  });

  it('should stringify emphasis with style', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學', ext: { blockId: 'b1' } }],
      marks: [
        {
          type: 'emphasis',
          id: 'm1',
          anchor: { from: 't1', to: 't1' },
          style: 'dot',
        } as EmphasisMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('type="emphasis"');
    expect(xml).toContain('style="dot"');
  });
});

// ============================================================================
// Tateten Tests
// ============================================================================

describe('stringify - tateten', () => {
  it('should stringify tateten', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '國', ext: { blockId: 'b1' } },
        { id: 't2', text: '家', ext: { blockId: 'b1' } },
        { id: 't3', text: '之', ext: { blockId: 'b1' } },
      ],
      marks: [
        {
          type: 'tateten',
          id: 'm1',
          anchor: { from: 't1', to: 't2' },
        } as TatetenMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('<skam:tateten>國家</skam:tateten>之');
  });
});

// ============================================================================
// Highlight Tests
// ============================================================================

describe('stringify - highlight', () => {
  it('should stringify highlight', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '學', ext: { blockId: 'b1' } },
        { id: 't2', text: '而', ext: { blockId: 'b1' } },
        { id: 't3', text: '時', ext: { blockId: 'b1' } },
      ],
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

    const xml = stringify(doc);

    expect(xml).toContain('<skam:span type="highlight" style="solid">學而</skam:span>時');
  });

  it('should stringify highlight with ref', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '學', ext: { blockId: 'b1' } },
        { id: 't2', text: '而', ext: { blockId: 'b1' } },
      ],
      marks: [
        {
          type: 'highlight',
          id: 'm1',
          anchor: { from: 't1', to: 't2' },
          style: 'solid',
          ref: 'ref-1',
        } as HighlightMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('type="highlight"');
    expect(xml).toContain('style="solid"');
    expect(xml).toContain('ref="ref-1"');
  });
});

// ============================================================================
// Ref Tests
// ============================================================================

describe('stringify - ref', () => {
  it('should stringify ref with format (empty element)', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學', ext: { blockId: 'b1' } }],
      marks: [
        {
          type: 'ref',
          id: 'ref-1',
          anchor: { from: 't1', to: 't1' },
          format: 'iroha-katakana',
        } as RefMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('學<skam:ref xml:id="ref-1" format="iroha-katakana"/>');
  });

  it('should stringify ref with label', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學', ext: { blockId: 'b1' } }],
      marks: [
        {
          type: 'ref',
          id: 'ref-1',
          anchor: { from: 't1', to: 't1' },
          label: '(※)',
        } as RefMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    expect(xml).toContain('label="(※)"');
  });
});

// ============================================================================
// Nested Range Marks Tests
// ============================================================================

describe('stringify - nested range marks', () => {
  it('should stringify nested emphasis and tateten', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '國', ext: { blockId: 'b1' } },
        { id: 't2', text: '家', ext: { blockId: 'b1' } },
        { id: 't3', text: '之', ext: { blockId: 'b1' } },
      ],
      marks: [
        {
          type: 'emphasis',
          id: 'm1',
          anchor: { from: 't1', to: 't3' },
        } as EmphasisMark,
        {
          type: 'tateten',
          id: 'm2',
          anchor: { from: 't1', to: 't2' },
        } as TatetenMark,
      ],
      readings: [],
    };

    const xml = stringify(doc);

    // emphasis が外側、tateten が内側
    expect(xml).toContain(
      '<skam:span type="emphasis"><skam:tateten>國家</skam:tateten>之</skam:span>'
    );
  });
});

// ============================================================================
// Round-trip Tests (New Marks)
// ============================================================================

describe('stringify - round-trip (new marks)', () => {
  it('should round-trip kutoten', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學', ext: { blockId: 'b1' } }],
      marks: [
        {
          type: 'kutoten',
          id: 'm1',
          anchor: { from: 't1', to: 't1' },
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
  });

  it('should round-trip emphasis', () => {
    const originalDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '學', ext: { blockId: 'b1' } },
        { id: 't2', text: '而', ext: { blockId: 'b1' } },
      ],
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
        { id: 't1', text: '學', ext: { blockId: 'b1' } },
        { id: 't2', text: '而', ext: { blockId: 'b1' } },
      ],
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
        { id: 't1', text: '國', ext: { blockId: 'b1' } },
        { id: 't2', text: '家', ext: { blockId: 'b1' } },
      ],
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
      tokens: [{ id: 't1', text: '而', ext: { blockId: 'b1' } }],
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
      tokens: [{ id: 't1', text: '之', ext: { blockId: 'b1' } }],
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
      tokens: [{ id: 't1', text: '將', ext: { blockId: 'b1' } }],
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
      tokens: [{ id: 't1', text: '學', ext: { blockId: 'b1' } }],
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
