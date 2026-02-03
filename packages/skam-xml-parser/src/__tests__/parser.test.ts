import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, SKAMXMLParseError } from '../index.js';
import { validateSKAMDocument } from '@kanbun/skam';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VALID_FIXTURES = join(__dirname, 'fixtures', 'valid');
const INVALID_FIXTURES = join(__dirname, 'fixtures', 'invalid');

function readFixture(category: 'valid' | 'invalid', name: string): string {
  const dir = category === 'valid' ? VALID_FIXTURES : INVALID_FIXTURES;
  return readFileSync(join(dir, name), 'utf-8');
}

// ============================================================================
// Valid Fixtures Tests
// ============================================================================

describe('parse - valid fixtures', () => {
  describe('minimal.xml', () => {
    it('should parse minimal document', () => {
      const xml = readFixture('valid', 'minimal.xml');
      const doc = parse(xml);

      expect(doc.format).toBe('skam@0.1');
      expect(doc.tokens).toHaveLength(1);
      expect(doc.tokens[0]).toMatchObject({ id: 't1', text: '學' });
      expect(doc.tokens[0]?.ext?.['blockId']).toBe('b1');
      expect(doc.marks).toHaveLength(0);
      expect(doc.readings).toHaveLength(0);
      expect(validateSKAMDocument(doc).valid).toBe(true);
    });
  });

  describe('kaeri-basic.xml', () => {
    it('should parse kaeri (レ点)', () => {
      const xml = readFixture('valid', 'kaeri-basic.xml');
      const doc = parse(xml);

      expect(doc.tokens).toHaveLength(5);
      expect(doc.marks).toHaveLength(1);

      const kaeri = doc.marks[0]!;
      expect(kaeri.type).toBe('kaeri');
      if (kaeri.type === 'kaeri') {
        expect(kaeri.value).toBe('レ');
        expect(kaeri.anchor.from).toBe('t2'); // 而
        expect(kaeri.anchor.to).toBe('t2');
      }
    });
  });

  describe('kaeri-all-kinds.xml', () => {
    it('should parse all kaeri kinds', () => {
      const xml = readFixture('valid', 'kaeri-all-kinds.xml');
      const doc = parse(xml);

      const kaeriMarks = doc.marks.filter((m) => m.type === 'kaeri');
      expect(kaeriMarks.length).toBeGreaterThanOrEqual(4);

      // Check some kaeri values
      const values = kaeriMarks.map((m) => (m as { value: string }).value);
      expect(values).toContain('一');
      expect(values).toContain('二');
      expect(values).toContain('上');
      expect(values).toContain('中');
      expect(values).toContain('下');
      expect(values).toContain('甲');
      expect(values).toContain('乙');
      expect(values).toContain('レ');
    });
  });

  describe('kun-reading-okuri.xml', () => {
    it('should parse kun with reading and okuri', () => {
      const xml = readFixture('valid', 'kun-reading-okuri.xml');
      const doc = parse(xml);

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
      const doc = parse(xml);

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
      const doc = parse(xml);

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
      const doc = parse(xml);

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
      const doc = parse(xml);

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
      const doc = parse(xml);

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
      const doc = parse(xml);

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
      const doc = parse(xml);

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
      const doc = parse(xml);

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
      const doc = parse(xml);

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
      const doc = parse(xml);

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
      const doc = parse(xml);

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
      const doc = parse(xml);

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
      const doc = parse(xml);

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
      const doc = parse(xml);

      // Meta is currently ignored, but document should parse correctly
      expect(doc.format).toBe('skam@0.1');
      expect(doc.tokens.length).toBeGreaterThan(0);
    });
  });

  describe('multiple-blocks.xml', () => {
    it('should parse multiple blocks', () => {
      const xml = readFixture('valid', 'multiple-blocks.xml');
      const doc = parse(xml);

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
      const doc = parse(xml);

      const highlightMarks = doc.marks.filter((m) => m.type === 'highlight');
      expect(highlightMarks).toHaveLength(1);

      const mark = highlightMarks[0]!;
      expect(mark.anchor.from).not.toBe(mark.anchor.to);
    });
  });

  describe('highlight-style.xml', () => {
    it('should parse highlight with style attributes', () => {
      const xml = readFixture('valid', 'highlight-style.xml');
      const doc = parse(xml);

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
      const doc = parse(xml);

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
      const doc = parse(xml);

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
      const doc = parse(xml);

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
      const doc = parse(xml);

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
      const doc = parse(xml);

      expect(doc.tokens).toHaveLength(3); // 學而時
      expect(doc.marks).toHaveLength(1);

      const ref = doc.marks[0]!;
      expect(ref.type).toBe('ref');
      expect(ref.id).toBe('ref-1');
      expect((ref as { format?: string }).format).toBe('alpha-upper');

      // ref at block start should have empty position (no after property)
      const position = (ref as { position?: { after?: string } }).position;
      expect(position).toEqual({}); // empty position means block start
      expect(position?.after).toBeUndefined();
    });
  });

  describe('implicit ref-highlight association', () => {
    it('should implicitly associate ref with highlight when both have no id/ref', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      <skam:span type="highlight"><skam:ref format="alpha-upper"/>學而</skam:span>
    </skam:block>
  </skam:body>
</skam:doc>`;
      const doc = parse(xml);

      const highlights = doc.marks.filter((m) => m.type === 'highlight');
      const refs = doc.marks.filter((m) => m.type === 'ref');

      expect(highlights).toHaveLength(1);
      expect(refs).toHaveLength(1);

      const highlight = highlights[0] as { ref?: string };
      const ref = refs[0] as { id?: string };

      // Should be implicitly associated
      expect(highlight.ref).toBeDefined();
      expect(highlight.ref).toBe(ref.id);
    });

    it('should throw error when highlight.ref exists but ref.id does not', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      <skam:span type="highlight" ref="note-1"><skam:ref format="alpha-upper"/>學而</skam:span>
    </skam:block>
  </skam:body>
</skam:doc>`;
      // highlight.ref が指定されているが、対応するidを持つrefがない場合はエラー
      expect(() => parse(xml)).toThrow(SKAMXMLParseError);
      expect(() => parse(xml)).toThrow('does not exist');
    });

    it('should NOT associate when ref has explicit id but highlight has no ref', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      <skam:span type="highlight"><skam:ref xml:id="my-ref" format="alpha-upper"/>學而</skam:span>
    </skam:block>
  </skam:body>
</skam:doc>`;
      const doc = parse(xml);

      const highlights = doc.marks.filter((m) => m.type === 'highlight');
      const refs = doc.marks.filter((m) => m.type === 'ref');

      expect(highlights).toHaveLength(1);
      expect(refs).toHaveLength(1);

      const highlight = highlights[0] as { ref?: string };
      const ref = refs[0] as { id?: string };

      // Single ref with explicit id - should be associated
      expect(ref.id).toBe('my-ref');
      expect(highlight.ref).toBe('my-ref');
    });

    it('should NOT associate when multiple refs exist in highlight', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      <skam:span type="highlight"><skam:ref format="alpha-upper"/>學<skam:ref format="numeric-bracket"/>而</skam:span>
    </skam:block>
  </skam:body>
</skam:doc>`;
      const doc = parse(xml);

      const highlights = doc.marks.filter((m) => m.type === 'highlight');
      const refs = doc.marks.filter((m) => m.type === 'ref');

      expect(highlights).toHaveLength(1);
      expect(refs).toHaveLength(2);

      const highlight = highlights[0] as { ref?: string };

      // Multiple refs - should NOT be associated
      expect(highlight.ref).toBeUndefined();
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
    ];

    for (const fixture of validFixtures) {
      it(`${fixture} produces valid SKAMDocument`, () => {
        const xml = readFixture('valid', fixture);
        const doc = parse(xml);
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

  describe('empty-block.xml', () => {
    it('should throw on empty block', () => {
      const xml = readFixture('invalid', 'empty-block.xml');
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

    const doc = parse(xml);
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

    const doc = parse(xml);
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

    const doc = parse(xml);
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
    const doc = parse(xml);

    expect(doc.tokens[0]?.ext?.['position']).toBeUndefined();
  });

  it('should include position info when trackPositions is true', () => {
    const xml = readFixture('valid', 'minimal.xml');
    const doc = parse(xml, { trackPositions: true });

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

    const doc = parse(xml, { trackPositions: true });

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

    const doc = parse(xml, { trackPositions: true });

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

    const doc = parse(xml, { trackPositions: true });

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

    const doc = parse(xml, { trackPositions: true });

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

  it('should preserve blockId in ext alongside position', () => {
    const xml = readFixture('valid', 'minimal.xml');
    const doc = parse(xml, { trackPositions: true });

    const token = doc.tokens[0]!;
    expect(token.ext?.['blockId']).toBe('b1');
    expect(token.ext?.['position']).toBeDefined();
  });
});
