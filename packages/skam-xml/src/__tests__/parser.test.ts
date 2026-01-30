import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, SKAMXMLParseError } from '../parser.js';
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
      expect(doc.tokens[0]).toEqual({ id: 't1', text: '學' });
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

  describe('okiji.xml', () => {
    it('should parse okiji mark', () => {
      const xml = readFixture('valid', 'okiji.xml');
      const doc = parse(xml);

      const okiji = doc.marks.find((m) => m.type === 'okiji');
      expect(okiji).toBeDefined();

      if (okiji?.type === 'okiji') {
        expect(okiji.value).toBe('を');
      }
    });
  });

  describe('span-emphasis.xml', () => {
    it('should parse emphasis marks', () => {
      const xml = readFixture('valid', 'span-emphasis.xml');
      const doc = parse(xml);

      const emphasisMarks = doc.marks.filter((m) => m.type === 'emphasis');
      expect(emphasisMarks.length).toBeGreaterThanOrEqual(1);

      // Check emphasis with kind
      const withKind = emphasisMarks.find((m) => (m as { value?: string }).value === 'dot');
      expect(withKind).toBeDefined();
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
        expect(saidoku.forms[0]!.reading).toBe('まさ');
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
    it('should parse and resolve note references', () => {
      const xml = readFixture('valid', 'ref-note.xml');
      const doc = parse(xml);

      const note = doc.marks.find((m) => m.type === 'note');
      expect(note).toBeDefined();

      if (note?.type === 'note') {
        expect(note.value).toBe('「之」は目的語として読む。');
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
      'okiji.xml',
      'span-emphasis.xml',
      'tateten.xml',
      'saidoku.xml',
      'saidoku-minimal.xml',
      'ref-note.xml',
      'readings.xml',
      'meta-tokenization.xml',
      'multiple-blocks.xml',
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
