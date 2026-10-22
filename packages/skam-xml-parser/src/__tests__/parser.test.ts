/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, SKAMXMLParseError } from '../index.js';
import type { ParseOptions } from '../index.js';
import { validateSKAMDocument, KAERI } from '@kanbun-skam/skam';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VALID_FIXTURES = join(__dirname, 'fixtures', 'valid');
const INVALID_FIXTURES = join(__dirname, 'fixtures', 'invalid');

function readFixture(category: 'valid' | 'invalid', name: string): string {
  const dir = category === 'valid' ? VALID_FIXTURES : INVALID_FIXTURES;
  return readFileSync(join(dir, name), 'utf-8');
}

/** 位置から決まる自動の id (b#1, b#1#1, m#1 等) で parse */
function parseSeq(xml: string, opts: Partial<ParseOptions> = {}) {
  return parse(xml, opts);
}

// ============================================================================
// Valid Fixtures Tests
// ============================================================================

describe('parse - valid fixtures', () => {
  describe('minimal.xml', () => {
    it('should parse minimal document', () => {
      const xml = readFixture('valid', 'minimal.xml');
      const doc = parseSeq(xml);

      expect(doc.format).toBe('skam@0.1');
      expect(doc.tokens).toHaveLength(1);
      expect(doc.tokens[0]).toMatchObject({ id: 'b#1#1', text: '學' });
      // blockId is now managed via blocks array, not token.ext
      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0]).toMatchObject({ id: 'b#1', tokenIds: ['b#1#1'] });
      expect(doc.marks).toHaveLength(0);
      expect(doc.readings).toHaveLength(0);
      expect(validateSKAMDocument(doc).valid).toBe(true);
    });
  });

  describe('kaeri-basic.xml', () => {
    it('should parse kaeri (レ点)', () => {
      const xml = readFixture('valid', 'kaeri-basic.xml');
      const doc = parseSeq(xml);

      expect(doc.tokens).toHaveLength(5);
      expect(doc.marks).toHaveLength(1);

      const kaeri = doc.marks[0]!;
      expect(kaeri.type).toBe('kaeri');
      if (kaeri.type === 'kaeri') {
        expect(kaeri.value).toBe(KAERI.RE);
        expect(kaeri.position.blockId).toBe('b#1');
        expect(kaeri.position.after).toBe('b#1#2'); // 而
      }
    });
  });

  describe('kaeri-all-kinds.xml', () => {
    it('should parse all kaeri kinds', () => {
      const xml = readFixture('valid', 'kaeri-all-kinds.xml');
      const doc = parseSeq(xml);

      const kaeriMarks = doc.marks.filter((m) => m.type === 'kaeri');
      expect(kaeriMarks.length).toBeGreaterThanOrEqual(4);

      // Check some kaeri values
      const values = kaeriMarks.map((m) => (m as { value: string }).value);
      expect(values).toContain(KAERI.ICHI);
      expect(values).toContain(KAERI.NI);
      expect(values).toContain(KAERI.JO);
      expect(values).toContain(KAERI.CHU);
      expect(values).toContain(KAERI.GE);
      expect(values).toContain(KAERI.KO);
      expect(values).toContain(KAERI.OTSU);
      expect(values).toContain(KAERI.RE);
    });
  });

  describe('kaeri-compound.xml', () => {
    it('should parse compound kaeri kinds', () => {
      const xml = readFixture('valid', 'kaeri-compound.xml');
      const doc = parseSeq(xml);

      const kaeriMarks = doc.marks.filter((m) => m.type === 'kaeri');
      expect(kaeriMarks).toHaveLength(3);

      const values = kaeriMarks.map((m) => (m as { value: string }).value);
      expect(values).toContain(KAERI.ICHI + KAERI.RE);
      expect(values).toContain(KAERI.RE);
      expect(values).toContain(KAERI.JO + KAERI.RE);
    });
  });

  describe('kun-reading-okuri.xml', () => {
    it('should parse kun with reading and okuri', () => {
      const xml = readFixture('valid', 'kun-reading-okuri.xml');
      const doc = parseSeq(xml);

      // Find yomigana and okurigana marks
      const yomigana = doc.marks.find((m) => m.type === 'yomigana');
      const okurigana = doc.marks.find((m) => m.type === 'okurigana');

      expect(yomigana).toBeDefined();
      expect(okurigana).toBeDefined();

      if (yomigana?.type === 'yomigana') {
        expect(yomigana.value).toBe('まな');
      }

      if (okurigana?.type === 'okurigana') {
        expect(okurigana.value).toBe('びて');
      }
    });
  });

  describe('kun-reading-only.xml', () => {
    it('should parse kun with reading only', () => {
      const xml = readFixture('valid', 'kun-reading-only.xml');
      const doc = parseSeq(xml);

      const yomigana = doc.marks.find((m) => m.type === 'yomigana');
      const okurigana = doc.marks.find((m) => m.type === 'okurigana');

      expect(yomigana).toBeDefined();
      expect(okurigana).toBeUndefined();

      if (yomigana?.type === 'yomigana') {
        expect(yomigana.value).toBe('まなぶ');
      }
    });
  });

  describe('kun-okuri-only.xml', () => {
    it('should parse kun with okuri only', () => {
      const xml = readFixture('valid', 'kun-okuri-only.xml');
      const doc = parseSeq(xml);

      const yomigana = doc.marks.find((m) => m.type === 'yomigana');
      const okurigana = doc.marks.find((m) => m.type === 'okurigana');

      expect(yomigana).toBeUndefined();
      expect(okurigana).toBeDefined();

      if (okurigana?.type === 'okurigana') {
        expect(okurigana.value).toBe('に');
      }
    });
  });

  describe('yomigana-only.xml', () => {
    it('should parse standalone yomigana element', () => {
      const xml = readFixture('valid', 'yomigana-only.xml');
      const doc = parseSeq(xml);

      const yomigana = doc.marks.find((m) => m.type === 'yomigana');
      expect(yomigana).toBeDefined();

      if (yomigana?.type === 'yomigana') {
        expect(yomigana.value).toBe('がく');
      }
    });
  });

  describe('kutoten.xml', () => {
    it('should parse kutoten marks', () => {
      const xml = readFixture('valid', 'kutoten.xml');
      const doc = parseSeq(xml);

      const kutotenMarks = doc.marks.filter((m) => m.type === 'kutoten');
      expect(kutotenMarks.length).toBeGreaterThanOrEqual(2);

      // Check values and kinds
      const kuMark = kutotenMarks.find((m) => (m as { kind?: string }).kind === 'ku');
      const tenMark = kutotenMarks.find((m) => (m as { kind?: string }).kind === 'ten');

      expect(kuMark).toBeDefined();
      expect(tenMark).toBeDefined();

      if (kuMark?.type === 'kutoten') {
        expect(kuMark.value).toBe('。');
      }
      if (tenMark?.type === 'kutoten') {
        expect(tenMark.value).toBe('、');
      }
    });
  });

  describe('okototen.xml', () => {
    it('should parse okototen with grid coordinates', () => {
      const xml = readFixture('valid', 'okototen.xml');
      const doc = parseSeq(xml);

      const okototenMarks = doc.marks.filter((m) => m.type === 'okototen');
      expect(okototenMarks.length).toBeGreaterThanOrEqual(1);

      const mark = okototenMarks[0]!;
      if (mark.type === 'okototen') {
        expect(mark.position.system).toBe('glyph-grid');
        expect(mark.position.grid).toBe('5x5');
        expect(mark.position.x).toBe(4);
        expect(mark.position.y).toBe(4);
        expect(mark.shape).toBe('dot');
        expect(mark.sound).toBe('り');
      }
    });

    it('should parse okototen with optional color', () => {
      const xml = readFixture('valid', 'okototen.xml');
      const doc = parseSeq(xml);

      const markWithColor = doc.marks.find(
        (m) => m.type === 'okototen' && (m as { color?: string }).color !== undefined
      );
      expect(markWithColor).toBeDefined();

      if (markWithColor?.type === 'okototen') {
        expect(markWithColor.color).toBe('red');
      }
    });
  });

  describe('soegana.xml', () => {
    it('should parse soegana mark', () => {
      const xml = readFixture('valid', 'soegana.xml');
      const doc = parseSeq(xml);

      const soegana = doc.marks.find((m) => m.type === 'soegana');
      expect(soegana).toBeDefined();

      if (soegana?.type === 'soegana') {
        expect(soegana.value).toBe('を');
      }
    });
  });

  describe('span-emphasis.xml', () => {
    it('should parse emphasis marks', () => {
      const xml = readFixture('valid', 'span-emphasis.xml');
      const doc = parseSeq(xml);

      const emphasisMarks = doc.marks.filter((m) => m.type === 'emphasis');
      expect(emphasisMarks.length).toBeGreaterThanOrEqual(1);

      // Check emphasis with style
      const withStyle = emphasisMarks.find((m) => (m as { style?: string }).style === 'dot');
      expect(withStyle).toBeDefined();
    });
  });

  describe('tateten.xml', () => {
    it('should parse tateten marks', () => {
      const xml = readFixture('valid', 'tateten.xml');
      const doc = parseSeq(xml);

      const tatetenMarks = doc.marks.filter((m) => m.type === 'tateten');
      expect(tatetenMarks.length).toBeGreaterThanOrEqual(1);

      // Check that anchor spans multiple tokens
      const mark = tatetenMarks[0]!;
      expect(mark.anchor.from).not.toBe(mark.anchor.to);
    });
  });

  describe('saidoku.xml', () => {
    it('should parse saidoku with forms', () => {
      const xml = readFixture('valid', 'saidoku.xml');
      const doc = parseSeq(xml);

      const saidoku = doc.marks.find((m) => m.type === 'saidoku');
      expect(saidoku).toBeDefined();

      if (saidoku?.type === 'saidoku') {
        expect(saidoku.forms).toHaveLength(2);
        expect(saidoku.forms[0]!.n).toBe(1);
        expect(saidoku.forms[0]!.yomi).toBe('まさ');
        expect(saidoku.forms[0]!.okuri).toBe('に');
        expect(saidoku.forms[1]!.n).toBe(2);
        expect(saidoku.forms[1]!.okuri).toBe('す');
      }
    });
  });

  describe('saidoku-minimal.xml', () => {
    it('should parse saidoku without n attribute', () => {
      const xml = readFixture('valid', 'saidoku-minimal.xml');
      const doc = parseSeq(xml);

      const saidoku = doc.marks.find((m) => m.type === 'saidoku');
      expect(saidoku).toBeDefined();

      if (saidoku?.type === 'saidoku') {
        expect(saidoku.forms.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('ref-note.xml', () => {
    it('should parse and resolve ref content references', () => {
      const xml = readFixture('valid', 'ref-note.xml');
      const doc = parseSeq(xml);

      const ref = doc.marks.find((m) => m.type === 'ref');
      expect(ref).toBeDefined();

      if (ref?.type === 'ref') {
        expect(ref.content).toBe('「之」は目的語として読む。');
      }
    });
  });

  describe('readings.xml', () => {
    it('should parse multiple reading kinds', () => {
      const xml = readFixture('valid', 'readings.xml');
      const doc = parseSeq(xml);

      expect(doc.readings).toHaveLength(3);

      const kinds = doc.readings.map((r) => r.kind);
      expect(kinds).toContain('kundoku');
      expect(kinds).toContain('kakikudashi');
      expect(kinds).toContain('yomiage');
    });
  });

  describe('meta-tokenization.xml', () => {
    it('should parse document with meta element', () => {
      const xml = readFixture('valid', 'meta-tokenization.xml');
      const doc = parseSeq(xml);

      // Meta is currently ignored, but document should parse correctly
      expect(doc.format).toBe('skam@0.1');
      expect(doc.tokens.length).toBeGreaterThan(0);
    });
  });

  describe('multiple-blocks.xml', () => {
    it('should parse multiple blocks', () => {
      const xml = readFixture('valid', 'multiple-blocks.xml');
      const doc = parseSeq(xml);

      // Should have tokens from all blocks
      expect(doc.tokens.length).toBeGreaterThan(10);

      // Should have various mark types
      const markTypes = [...new Set(doc.marks.map((m) => m.type))];
      expect(markTypes).toContain('kaeri');
      expect(markTypes).toContain('kutoten');

      // Should have readings
      expect(doc.readings).toHaveLength(1);
    });
  });

  describe('highlight-basic.xml', () => {
    it('should parse highlight element', () => {
      const xml = readFixture('valid', 'highlight-basic.xml');
      const doc = parseSeq(xml);

      const highlightMarks = doc.marks.filter((m) => m.type === 'highlight');
      expect(highlightMarks).toHaveLength(1);

      const mark = highlightMarks[0]!;
      expect(mark.anchor.from).not.toBe(mark.anchor.to);
    });
  });

  describe('highlight-style.xml', () => {
    it('should parse highlight with style attributes', () => {
      const xml = readFixture('valid', 'highlight-style.xml');
      const doc = parseSeq(xml);

      const highlightMarks = doc.marks.filter((m) => m.type === 'highlight');
      expect(highlightMarks.length).toBeGreaterThanOrEqual(5);

      const styles = highlightMarks.map((m) => (m as { style?: string }).style);
      expect(styles).toContain('solid');
      expect(styles).toContain('wavy');
      expect(styles).toContain('double');
      expect(styles).toContain('dotted');
      expect(styles).toContain('dashed');
    });
  });

  describe('ref-label.xml', () => {
    it('should parse ref with label attribute', () => {
      const xml = readFixture('valid', 'ref-label.xml');
      const doc = parseSeq(xml);

      const refMarks = doc.marks.filter((m) => m.type === 'ref');
      expect(refMarks.length).toBeGreaterThanOrEqual(3);

      const labels = refMarks.map((m) => (m as { label?: string }).label);
      expect(labels).toContain('(A)');
      expect(labels).toContain('(B)');
      expect(labels).toContain('※');
    });
  });

  describe('ref-format.xml', () => {
    it('should parse ref with format attribute', () => {
      const xml = readFixture('valid', 'ref-format.xml');
      const doc = parseSeq(xml);

      const refMarks = doc.marks.filter((m) => m.type === 'ref');
      expect(refMarks.length).toBeGreaterThanOrEqual(4);

      const formats = refMarks.map((m) => (m as { format?: string }).format);
      expect(formats).toContain('alpha-upper');
      expect(formats).toContain('numeric-circled');
      expect(formats).toContain('iroha-katakana');
    });
  });

  describe('highlight-ref-combined.xml', () => {
    it('should parse highlight with ref reference', () => {
      const xml = readFixture('valid', 'highlight-ref-combined.xml');
      const doc = parseSeq(xml);

      const highlightMarks = doc.marks.filter((m) => m.type === 'highlight');
      const refMarks = doc.marks.filter((m) => m.type === 'ref');

      expect(highlightMarks).toHaveLength(1);
      expect(refMarks).toHaveLength(1);

      const highlight = highlightMarks[0]!;
      const ref = refMarks[0]!;

      // ref has xml:id="ref-1", highlight has ref="ref-1"
      expect((highlight as { ref?: string }).ref).toBe('ref-1');
      expect(ref.id).toBe('ref-1');
      expect((ref as { format?: string }).format).toBe('alpha-upper');
    });
  });

  describe('ref-with-kun.xml', () => {
    it('should parse ref following kun element', () => {
      const xml = readFixture('valid', 'ref-with-kun.xml');
      const doc = parseSeq(xml);

      const yomiganaMarks = doc.marks.filter((m) => m.type === 'yomigana');
      const refMarks = doc.marks.filter((m) => m.type === 'ref');

      expect(yomiganaMarks).toHaveLength(1);
      expect(refMarks).toHaveLength(1);

      const yomigana = yomiganaMarks[0]!;
      const ref = refMarks[0]!;

      // yomigana should anchor to 學
      expect((yomigana as { value?: string }).value).toBe('まな');

      // ref should be positioned after 學 (preceding token)
      expect(ref.id).toBe('ref-1');
      expect((ref as { format?: string }).format).toBe('iroha-katakana');

      // ref is position-based, yomigana is anchor-based
      // ref should be positioned after the same token that yomigana anchors to
      expect(yomigana.anchor.from).toBe(yomigana.anchor.to); // single token
      expect((ref as { position?: { after?: string } }).position?.after).toBe(yomigana.anchor.from);
    });
  });

  describe('ref-at-block-start.xml', () => {
    it('should parse ref at the beginning of a block', () => {
      const xml = readFixture('valid', 'ref-at-block-start.xml');
      const doc = parseSeq(xml);

      expect(doc.tokens).toHaveLength(3); // 學而時
      expect(doc.marks).toHaveLength(1);

      const ref = doc.marks[0]!;
      expect(ref.type).toBe('ref');
      expect(ref.id).toBe('ref-1');
      expect((ref as { format?: string }).format).toBe('alpha-upper');

      // ref at block start should have blockId but no after property
      const position = (ref as { position?: { blockId?: string; after?: string } }).position;
      expect(position).toEqual({ blockId: 'b#1' }); // blockId only, no after = block start
      expect(position?.after).toBeUndefined();
    });
  });

  describe('all valid fixtures produce valid SKAMDocument', () => {
    const validFixtures = [
      'minimal.xml',
      'kaeri-basic.xml',
      'kaeri-all-kinds.xml',
      'kun-reading-okuri.xml',
      'kun-reading-only.xml',
      'kun-okuri-only.xml',
      'yomigana-only.xml',
      'kutoten.xml',
      'okototen.xml',
      'soegana.xml',
      'okimoji.xml',
      'joji.xml',
      'span-emphasis.xml',
      'tateten.xml',
      'saidoku.xml',
      'saidoku-minimal.xml',
      'ref-note.xml',
      'readings.xml',
      'meta-tokenization.xml',
      'multiple-blocks.xml',
      'highlight-basic.xml',
      'highlight-style.xml',
      'ref-label.xml',
      'ref-format.xml',
      'highlight-ref-combined.xml',
      'readme-example.xml',
      'ref-at-block-start.xml',
      'empty-block.xml',
    ];

    for (const fixture of validFixtures) {
      it(`${fixture} produces valid SKAMDocument`, () => {
        const xml = readFixture('valid', fixture);
        const doc = parseSeq(xml);
        expect(validateSKAMDocument(doc).valid).toBe(true);
      });
    }
  });
});

// ============================================================================
// Invalid Fixtures Tests
// ============================================================================

describe('parse - invalid fixtures', () => {
  describe('malformed-xml.xml', () => {
    it('should throw on malformed XML', () => {
      const xml = readFixture('invalid', 'malformed-xml.xml');
      expect(() => parse(xml)).toThrow(SKAMXMLParseError);
    });
  });

  describe('missing-namespace.xml', () => {
    it('should throw when SKAM namespace is missing', () => {
      const xml = readFixture('invalid', 'missing-namespace.xml');
      expect(() => parse(xml)).toThrow(SKAMXMLParseError);
    });
  });

  describe('missing-body.xml', () => {
    it('should throw when body is missing', () => {
      const xml = readFixture('invalid', 'missing-body.xml');
      expect(() => parse(xml)).toThrow(SKAMXMLParseError);
    });
  });

  describe('invalid-kaeri-kind.xml', () => {
    it('should throw on invalid kaeri kind', () => {
      const xml = readFixture('invalid', 'invalid-kaeri-kind.xml');
      expect(() => parse(xml)).toThrow(SKAMXMLParseError);
    });
  });

  describe('missing-kutoten-value.xml', () => {
    it('should throw when kutoten value is missing', () => {
      const xml = readFixture('invalid', 'missing-kutoten-value.xml');
      expect(() => parse(xml)).toThrow(SKAMXMLParseError);
    });
  });

  describe('invalid-okototen-grid.xml', () => {
    it('should throw on invalid okototen grid format', () => {
      const xml = readFixture('invalid', 'invalid-okototen-grid.xml');
      expect(() => parse(xml)).toThrow(SKAMXMLParseError);
    });
  });

  describe('missing-saidoku-base.xml', () => {
    it('should throw when saidoku base is missing', () => {
      const xml = readFixture('invalid', 'missing-saidoku-base.xml');
      expect(() => parse(xml)).toThrow(SKAMXMLParseError);
    });
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('parse - edge cases', () => {
  it('should handle whitespace correctly', () => {
    const xml = `<?xml version="1.0"?>
      <skam:doc xmlns:skam="urn:skam:1">
        <skam:body>
          <skam:block>
            學 而
          </skam:block>
        </skam:body>
      </skam:doc>`;

    const doc = parseSeq(xml);
    // Whitespace between characters should be skipped
    expect(doc.tokens).toHaveLength(2);
    expect(doc.tokens[0]!.text).toBe('學');
    expect(doc.tokens[1]!.text).toBe('而');
  });

  it('should generate unique token IDs', () => {
    const xml = `<?xml version="1.0"?>
      <skam:doc xmlns:skam="urn:skam:1">
        <skam:body>
          <skam:block>學而時習之</skam:block>
        </skam:body>
      </skam:doc>`;

    const doc = parseSeq(xml);
    const ids = doc.tokens.map((t) => t.id);
    const uniqueIds = [...new Set(ids)];
    expect(ids).toEqual(uniqueIds);
  });

  it('should generate unique mark IDs', () => {
    const xml = `<?xml version="1.0"?>
      <skam:doc xmlns:skam="urn:skam:1">
        <skam:body>
          <skam:block>
            <skam:kun reading="a">學</skam:kun>
            <skam:kun reading="b" okuri="c">而</skam:kun>
          </skam:block>
        </skam:body>
      </skam:doc>`;

    const doc = parseSeq(xml);
    const ids = doc.marks.map((m) => m.id);
    const uniqueIds = [...new Set(ids)];
    expect(ids).toEqual(uniqueIds);
  });
});

// ============================================================================
// Position Tracking Tests
// ============================================================================

describe('parse - position tracking', () => {
  it('should not include position info when trackPositions is false (default)', () => {
    const xml = readFixture('valid', 'minimal.xml');
    const doc = parseSeq(xml);

    expect(doc.tokens[0]?.ext?.['position']).toBeUndefined();
  });

  it('should include position info when trackPositions is true', () => {
    const xml = readFixture('valid', 'minimal.xml');
    const doc = parseSeq(xml, { trackPositions: true });

    const token = doc.tokens[0];
    expect(token).toBeDefined();
    expect(token?.text).toBe('學');
    expect(token?.ext?.['position']).toBeDefined();

    const position = token?.ext?.['position'] as {
      start: { line: number; column: number; offset: number };
      end: { line: number; column: number; offset: number };
    };

    // Position should have valid values
    expect(position.start.line).toBeGreaterThanOrEqual(1);
    expect(position.start.column).toBeGreaterThanOrEqual(1);
    expect(position.start.offset).toBeGreaterThanOrEqual(0);
    expect(position.end.line).toBeGreaterThanOrEqual(1);
    expect(position.end.column).toBeGreaterThanOrEqual(1);
    expect(position.end.offset).toBeGreaterThan(position.start.offset);
  });

  it('should track positions for multiple characters correctly', () => {
    const xml = `<?xml version="1.0"?>
<skam:doc xmlns:skam="urn:skam:1">
  <skam:body>
    <skam:block>學而</skam:block>
  </skam:body>
</skam:doc>`;

    const doc = parseSeq(xml, { trackPositions: true });

    expect(doc.tokens).toHaveLength(2);

    const token1 = doc.tokens[0]!;
    const token2 = doc.tokens[1]!;

    expect(token1.text).toBe('學');
    expect(token2.text).toBe('而');

    const pos1 = token1.ext?.['position'] as {
      start: { line: number; column: number; offset: number };
      end: { line: number; column: number; offset: number };
    };
    const pos2 = token2.ext?.['position'] as {
      start: { line: number; column: number; offset: number };
      end: { line: number; column: number; offset: number };
    };

    // Second token should start after first token
    expect(pos2.start.offset).toBeGreaterThanOrEqual(pos1.end.offset);
    // Both should be on the same line (line 4 in this case)
    expect(pos1.start.line).toBe(pos2.start.line);
  });

  it('should handle multi-byte characters (kanji) correctly', () => {
    const xml = `<?xml version="1.0"?>
<skam:doc xmlns:skam="urn:skam:1">
  <skam:body>
    <skam:block>漢字</skam:block>
  </skam:body>
</skam:doc>`;

    const doc = parseSeq(xml, { trackPositions: true });

    expect(doc.tokens).toHaveLength(2);

    const token1 = doc.tokens[0]!;
    const token2 = doc.tokens[1]!;

    expect(token1.text).toBe('漢');
    expect(token2.text).toBe('字');

    const pos1 = token1.ext?.['position'] as {
      start: { line: number; column: number; offset: number };
      end: { line: number; column: number; offset: number };
    };
    const pos2 = token2.ext?.['position'] as {
      start: { line: number; column: number; offset: number };
      end: { line: number; column: number; offset: number };
    };

    // Byte offsets for UTF-8 encoded kanji (3 bytes each)
    expect(pos1.end.offset - pos1.start.offset).toBe(3);
    expect(pos2.end.offset - pos2.start.offset).toBe(3);
  });

  it('should track positions across multiple blocks', () => {
    const xml = `<?xml version="1.0"?>
<skam:doc xmlns:skam="urn:skam:1">
  <skam:body>
    <skam:block>甲</skam:block>
    <skam:block>乙</skam:block>
  </skam:body>
</skam:doc>`;

    const doc = parseSeq(xml, { trackPositions: true });

    expect(doc.tokens).toHaveLength(2);

    const token1 = doc.tokens[0]!;
    const token2 = doc.tokens[1]!;

    expect(token1.text).toBe('甲');
    expect(token2.text).toBe('乙');

    const pos1 = token1.ext?.['position'] as {
      start: { line: number; column: number; offset: number };
      end: { line: number; column: number; offset: number };
    };
    const pos2 = token2.ext?.['position'] as {
      start: { line: number; column: number; offset: number };
      end: { line: number; column: number; offset: number };
    };

    // Second block should be on a different line
    expect(pos2.start.line).toBeGreaterThan(pos1.start.line);
  });

  it('should track positions for tokens inside skam:kun elements', () => {
    const xml = `<?xml version="1.0"?>
<skam:doc xmlns:skam="urn:skam:1">
  <skam:body>
    <skam:block><skam:kun yomi="まな">學</skam:kun></skam:block>
  </skam:body>
</skam:doc>`;

    const doc = parseSeq(xml, { trackPositions: true });

    expect(doc.tokens).toHaveLength(1);
    const token = doc.tokens[0]!;
    expect(token.text).toBe('學');

    const pos = token.ext?.['position'] as {
      start: { line: number; column: number; offset: number };
      end: { line: number; column: number; offset: number };
    };

    expect(pos).toBeDefined();
    expect(pos.start.line).toBeGreaterThanOrEqual(1);
  });

  it('should have blocks alongside position tracking', () => {
    const xml = readFixture('valid', 'minimal.xml');
    const doc = parseSeq(xml, { trackPositions: true });

    const token = doc.tokens[0]!;
    // blockId is now managed via blocks array, not token.ext
    expect(doc.blocks).toHaveLength(1);
    expect(doc.blocks[0]).toMatchObject({ id: 'b#1', tokenIds: ['b#1#1'] });
    expect(token.ext?.['position']).toBeDefined();
  });
});

// ============================================================================
// Sequential ID generator vs explicit ids
// ============================================================================

describe('parse - ids (hand-written and automatic)', () => {
  const wrap = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>${body}</skam:body>
</skam:doc>`;
  const markIds = (doc: ReturnType<typeof parseSeq>) => doc.marks.map((m) => m.id);

  it('gives id-less blocks and tokens the ids that follow from their position', () => {
    const doc = parseSeq(wrap('<skam:block>學而</skam:block><skam:block>時習</skam:block>'));
    expect(doc.blocks.map((b) => b.id)).toEqual(['b#1', 'b#2']);
    expect(doc.tokens.map((t) => t.id)).toEqual(['b#1#1', 'b#1#2', 'b#2#1', 'b#2#2']);
  });

  it('builds token ids from a hand-written block id', () => {
    const doc = parseSeq(wrap('<skam:block xml:id="p1">學</skam:block>'));
    expect(doc.tokens.map((t) => t.id)).toEqual(['p1#1']);
  });

  it('reads xml:id on a mark element', () => {
    const doc = parseSeq(
      wrap('<skam:block><skam:span type="emphasis" xml:id="e1">學</skam:span></skam:block>')
    );
    expect(doc.marks[0]?.id).toBe('e1');
  });

  it('reads xml:id on every kind of mark element', () => {
    const doc = parseSeq(
      wrap(
        '<skam:block xml:id="p1">' +
          '<skam:tateten xml:id="tt">學</skam:tateten>' +
          '<skam:okimoji xml:id="oki">而</skam:okimoji>' +
          '<skam:joji id="jo">時</skam:joji>' +
          '<skam:yomigana value="a" xml:id="yo">習</skam:yomigana>' +
          '<skam:kaeri kind="re" xml:id="ka"/>' +
          '<skam:kutoten value="、" xml:id="ku"/>' +
          '<skam:kun yomi="x" okuri="y" xml:id="kn">之</skam:kun>' +
          '</skam:block>'
      )
    );
    expect(
      markIds(doc)
        .filter((id) => !id?.startsWith('m#'))
        .sort()
    ).toEqual(['jo', 'ka', 'kn', 'ku', 'oki', 'tt', 'yo'].sort());
    // kun の xml:id は最初に作る注記 (yomigana) に付き、okurigana は自動の id
    expect(doc.marks.find((m) => m.type === 'yomigana' && m.value === 'x')?.id).toBe('kn');
    expect(doc.marks.find((m) => m.type === 'okurigana')?.id).toMatch(/^m#\d+$/);
  });

  it('prefers xml:id over id on the same element', () => {
    const doc = parseSeq(wrap('<skam:block xml:id="a" id="b">學</skam:block>'));
    expect(doc.blocks[0]?.id).toBe('a');
  });

  it('numbers id-less marks by their order in marks[]', () => {
    const doc = parseSeq(
      wrap(
        '<skam:block><skam:span type="emphasis">學</skam:span>' +
          '<skam:span type="emphasis">而</skam:span><skam:span type="emphasis">時</skam:span></skam:block>'
      )
    );
    expect(markIds(doc)).toEqual(['m#1', 'm#2', 'm#3']);
  });

  it('numbers around a hand-written mark id by position', () => {
    const doc = parseSeq(
      wrap(
        '<skam:block><skam:span type="emphasis" xml:id="n1">學</skam:span>' +
          '<skam:span type="emphasis">而</skam:span><skam:span type="emphasis">時</skam:span></skam:block>'
      )
    );
    expect(markIds(doc)).toEqual(['n1', 'm#2', 'm#3']);
  });

  it.each(['b#1', '1a', ' a', 'a b', 'a:b', 'x#1'])(
    'rejects the id %j with a positioned error',
    (id) => {
      const xml = wrap(`<skam:block xml:id="${id}">學</skam:block>`);
      expect(() => parseSeq(xml)).toThrow(SKAMXMLParseError);
      try {
        parseSeq(xml);
      } catch (e) {
        expect((e as SKAMXMLParseError).line).toBeDefined();
      }
    }
  );

  it('rejects an invalid id attribute on a mark element', () => {
    expect(() =>
      parseSeq(wrap('<skam:block><skam:span type="emphasis" id="1a">學</skam:span></skam:block>'))
    ).toThrow(SKAMXMLParseError);
  });

  it('treats an empty xml:id as absent', () => {
    const doc = parseSeq(wrap('<skam:block xml:id="">一</skam:block>'));
    expect(doc.blocks.map((b) => b.id)).toEqual(['b#1']);
  });

  it('still reports DUPLICATE_ID for two identical explicit ids', () => {
    const xml = wrap(
      '<skam:block xml:id="b1">一</skam:block>' + '<skam:block xml:id="b1">二</skam:block>'
    );
    expect(() => parseSeq(xml)).toThrow(/Duplicate block ID/);
    const marks = wrap(
      '<skam:block><skam:span type="emphasis" xml:id="x">一</skam:span><skam:span type="emphasis" xml:id="x">二</skam:span></skam:block>'
    );
    expect(() => parseSeq(marks)).toThrow(/Duplicate/);
  });
});

describe('parse - highlight and ref linking (by name only)', () => {
  const body = (inner: string) =>
    `<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>${inner}</skam:block></skam:body></skam:doc>`;
  const highlights = (doc: ReturnType<typeof parseSeq>) =>
    doc.marks.filter((m): m is Extract<typeof m, { type: 'highlight' }> => m.type === 'highlight');

  it('does not link a ref inside a highlight without a ref attribute', () => {
    const doc = parseSeq(
      body('<skam:span type="highlight">學<skam:ref label="ア"/>而</skam:span>')
    );
    expect(highlights(doc)[0]?.ref).toBeUndefined();
    expect(doc.marks.filter((m) => m.type === 'ref')).toHaveLength(1);
    const result = validateSKAMDocument(doc);
    expect(result.valid && result.warnings).toBeFalsy();
  });

  it('treats ref="" as no attribute', () => {
    const doc = parseSeq(
      body('<skam:span type="highlight" ref="">學<skam:ref label="ア"/>而</skam:span>')
    );
    expect(highlights(doc)[0]?.ref).toBeUndefined();
    expect(doc.marks.filter((m) => m.type === 'ref')).toHaveLength(1);
  });

  it('links by the ref attribute to a hand-written ref id inside the span', () => {
    const doc = parseSeq(
      body(
        '<skam:span type="highlight" ref="r1">學<skam:ref xml:id="r1" label="ア"/>而</skam:span>'
      )
    );
    expect(highlights(doc)[0]?.ref).toBe('r1');
    const result = validateSKAMDocument(doc);
    expect(result.valid && result.warnings).toBeFalsy();
  });

  it('does not link a hand-written ref id without a ref attribute', () => {
    const doc = parseSeq(
      body('<skam:span type="highlight">學<skam:ref xml:id="r1" label="ア"/>而</skam:span>')
    );
    expect(highlights(doc)[0]?.ref).toBeUndefined();
  });

  it.each(['nonexistent', '__proto__', 'constructor', 'toString'])(
    'throws a positioned error for ref="%s" that points to no ref',
    (name) => {
      const xml = body(`<skam:span type="highlight" ref="${name}">學</skam:span>`);
      expect(() => parseSeq(xml)).toThrow(SKAMXMLParseError);
      try {
        parseSeq(xml);
      } catch (e) {
        expect((e as SKAMXMLParseError).line).toBeDefined();
      }
    }
  );

  it('throws when the ref attribute names a block xml:id', () => {
    const xml = `<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block xml:id="p1">學<skam:span type="highlight" ref="p1">而</skam:span></skam:block></skam:body></skam:doc>`;
    expect(() => parseSeq(xml)).toThrow(SKAMXMLParseError);
  });

  it('throws when the ref attribute names a non-ref mark id', () => {
    const doc = body(
      '<skam:span type="emphasis" xml:id="e1">學</skam:span><skam:span type="highlight" ref="e1">而</skam:span>'
    );
    expect(() => parseSeq(doc)).toThrow(SKAMXMLParseError);
  });

  it('resolves a ref attribute that points to a ref after the highlight', () => {
    const doc = parseSeq(
      body(
        '<skam:span type="highlight" ref="r1">學而</skam:span>之<skam:ref xml:id="r1" label="ア"/>'
      )
    );
    expect(highlights(doc)[0]?.ref).toBe('r1');
  });

  it('lets highlights in different blocks share one ref by name', () => {
    const xml = `<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>學<skam:ref xml:id="r1" label="ア"/></skam:block><skam:block><skam:span type="highlight" ref="r1">而</skam:span></skam:block><skam:block><skam:span type="highlight" ref="r1">時</skam:span></skam:block></skam:body></skam:doc>`;
    const doc = parseSeq(xml);
    expect(highlights(doc).map((h) => h.ref)).toEqual(['r1', 'r1']);
  });

  it('does not link a ref that comes before the first character or outside the span', () => {
    const doc = parseSeq(
      body(
        '<skam:span type="highlight"><skam:ref label="ア"/>學而</skam:span><skam:ref label="イ"/>'
      )
    );
    expect(highlights(doc)[0]?.ref).toBeUndefined();
  });
});

describe('parse - skam:reading whitespace', () => {
  const withReading = (attrs: string, text: string) =>
    `<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>學</skam:block></skam:body><skam:readings><skam:reading kind="kundoku"${attrs}>${text}</skam:reading></skam:readings></skam:doc>`;

  it('trims the text without xml:space="preserve"', () => {
    expect(parseSeq(withReading('', ' 学 ')).readings[0]!.text).toBe('学');
  });

  it('keeps leading and trailing whitespace with xml:space="preserve"', () => {
    expect(parseSeq(withReading(' xml:space="preserve"', ' 学 ')).readings[0]!.text).toBe(' 学 ');
  });
});

// ============================================================================
// 緩めた入れ子と空要素の対 (plan-3 T2)
// ============================================================================

describe('parse - relaxed nesting and empty-element pairs', () => {
  const wrapBlock = (inner: string, ns = ''): string =>
    `<skam:doc xmlns:skam="urn:skam:1"${ns}><skam:body><skam:block>${inner}</skam:block></skam:body></skam:doc>`;

  /** 種類と、字の通し番号 (1 始まり) で表した範囲 */
  const summarize = (xml: string): string[] => {
    const doc = parse(xml);
    const order = new Map(doc.blocks.flatMap((b) => b.tokenIds).map((id, i) => [id, i + 1]));
    return doc.marks.map((m) =>
      'anchor' in m
        ? `${m.type} t${order.get(m.anchor.from)}-t${order.get(m.anchor.to)}`
        : `${m.type} after ${m.position.after ? `t${order.get(m.position.after)}` : '-'}`
    );
  };

  it('reads an okimoji inside a yomigana', () => {
    expect(
      summarize(
        wrapBlock('<skam:yomigana value="あ">甲<skam:okimoji>乙</skam:okimoji></skam:yomigana>')
      )
    ).toEqual(['yomigana t1-t2', 'okimoji t2-t2']);
  });

  it('reads a kun inside a kun in the order yomigana, okurigana', () => {
    expect(
      summarize(wrapBlock('<skam:kun yomi="あ">甲<skam:kun okuri="て">乙</skam:kun></skam:kun>'))
    ).toEqual(['yomigana t1-t2', 'okurigana t2-t2']);
  });

  it('keeps the characters of a span inside a kun', () => {
    const xml = wrapBlock(
      '<skam:kun okuri="て">甲<skam:span type="emphasis">乙</skam:span></skam:kun>'
    );
    expect(parse(xml).blocks[0]!.tokenIds).toHaveLength(2);
    expect(summarize(xml)).toEqual(['okurigana t1-t2', 'emphasis t2-t2']);
  });

  it('takes the preceding token of a kaeri inside an okimoji from the block', () => {
    expect(
      summarize(wrapBlock('<skam:okimoji>甲<skam:kaeri kind="re"/>乙</skam:okimoji>丙'))
    ).toEqual(['okimoji t1-t2', 'kaeri after t1']);
  });

  it('takes the preceding token of a kutoten at the start of a span from the block', () => {
    expect(
      summarize(wrapBlock('甲<skam:span type="emphasis"><skam:kutoten value="、"/>乙</skam:span>'))
    ).toEqual(['emphasis t2-t2', 'kutoten after t1']);
  });

  it('leaves out after for a kutoten at the start of the block', () => {
    const doc = parse(
      wrapBlock('<skam:span type="emphasis"><skam:kutoten value="、"/>甲</skam:span>')
    );
    const kutoten = doc.marks.find((m) => m.type === 'kutoten')!;
    expect('after' in (kutoten as { position: object }).position).toBe(false);
  });

  it('reads okimoji and span in either nesting order as the same JSON', () => {
    const a = parse(
      wrapBlock('<skam:okimoji><skam:span type="emphasis">甲</skam:span></skam:okimoji>')
    );
    const b = parse(
      wrapBlock('<skam:span type="emphasis"><skam:okimoji>甲</skam:okimoji></skam:span>')
    );
    const key = (d: typeof a): string[] =>
      d.marks
        .map((m) => `${m.type} ${'anchor' in m ? `${m.anchor.from}-${m.anchor.to}` : ''}`)
        .sort();
    expect(key(a)).toEqual(key(b));
  });

  it('reads a pair that is not nested with the next range', () => {
    expect(
      summarize(
        wrapBlock(
          '甲<skam:span type="emphasis" sID="r1"/>乙丙<skam:span type="highlight">丁<skam:span eID="r1"/>戊</skam:span>'
        )
      )
    ).toEqual(['emphasis t2-t4', 'highlight t4-t5']);
  });

  it('reads a kun pair as yomigana and okurigana in this order', () => {
    expect(
      summarize(wrapBlock('<skam:kun sID="r1" yomi="あ" okuri="て"/>甲乙<skam:kun eID="r1"/>'))
    ).toEqual(['yomigana t1-t2', 'okurigana t1-t2']);
  });

  it('orders marks by the opening tag (the start element of a pair)', () => {
    const doc = parse(
      wrapBlock(
        '<skam:span type="emphasis" sID="r1"/><skam:span type="highlight" sID="r2"/>' +
          '<skam:span type="emphasis">甲乙</skam:span><skam:span eID="r1"/><skam:span eID="r2"/>'
      )
    );
    expect(doc.marks.map((m) => m.type)).toEqual(['emphasis', 'highlight', 'emphasis']);
    expect(doc.marks.map((m) => m.id)).toEqual(['m#1', 'm#2', 'm#3']);
  });

  it('puts a hand-written id on the mark and reports validation errors at the start element', () => {
    const lines = (ref: string): string =>
      '<skam:doc xmlns:skam="urn:skam:1">\n<skam:body><skam:block>\n' +
      `<skam:span type="highlight" xml:id="e1" sID="r1"${ref}/>\n甲乙\n丙\n` +
      '<skam:span eID="r1"/>\n</skam:block></skam:body></skam:doc>';
    expect(parse(lines('')).marks[0]!.id).toBe('e1');
    try {
      parse(lines(' ref="nothing"'));
      expect.unreachable();
    } catch (e) {
      expect((e as SKAMXMLParseError).line).toBe(3);
    }
  });

  it('reads a pair whose start element is inside a kun and whose end element is outside', () => {
    expect(
      summarize(
        wrapBlock(
          '<skam:kun yomi="あ">甲<skam:span type="emphasis" sID="r1"/>乙</skam:kun>丙<skam:span eID="r1"/>'
        )
      )
    ).toEqual(['yomigana t1-t2', 'emphasis t2-t3']);
  });

  it('reads sID and eID values that are names on Object.prototype', () => {
    for (const name of ['__proto__', 'constructor', 'toString']) {
      const doc = parse(
        wrapBlock(`<skam:span type="emphasis" sID="${name}"/>甲<skam:span eID="${name}"/>`)
      );
      expect(doc.marks).toHaveLength(1);
    }
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    expect(Object.keys(Object.prototype)).toEqual([]);
  });

  it('reads a pair element that holds only whitespace and comments', () => {
    const doc = parse(
      wrapBlock(
        '<skam:span type="emphasis" sID="r1"> <!-- c --> </skam:span>甲<skam:span eID="r1"><!-- c --></skam:span>'
      )
    );
    expect(doc.marks).toHaveLength(1);
  });

  it('reads 56 nested range elements', () => {
    const open = '<skam:span type="emphasis">'.repeat(56);
    const close = '</skam:span>'.repeat(56);
    expect(parse(wrapBlock(`${open}甲${close}`)).marks).toHaveLength(56);
  });
});
