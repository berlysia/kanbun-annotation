import { describe, it, expect } from 'vitest';
import { parse, SKAMXMLParseError } from '../index.js';

// ============================================================================
// Parser error handling tests (inline, no fixtures required)
// ============================================================================

describe('parse - error handling', () => {
  describe('completely invalid input', () => {
    it('should throw on empty string', () => {
      expect(() => parse('')).toThrow();
    });

    it('should throw on plain text (non-XML)', () => {
      expect(() => parse('This is not XML')).toThrow();
    });

    it('should throw on JSON input', () => {
      expect(() => parse('{"format": "skam@0.1"}')).toThrow();
    });

    it('should throw on XML without skam namespace', () => {
      expect(() => parse('<?xml version="1.0"?><doc><body><block>學</block></body></doc>')).toThrow(
        SKAMXMLParseError
      );
    });

    it('should throw on XML with wrong root element', () => {
      expect(() =>
        parse(
          '<?xml version="1.0"?><wrong xmlns:skam="urn:skam:1"><skam:body><skam:block>學</skam:block></skam:body></wrong>'
        )
      ).toThrow(SKAMXMLParseError);
    });
  });

  describe('missing required elements', () => {
    it('should throw when body element is missing', () => {
      const xml = `<?xml version="1.0"?>
<skam:doc xmlns:skam="urn:skam:1">
</skam:doc>`;
      expect(() => parse(xml)).toThrow(SKAMXMLParseError);
    });

    it('should accept an empty block', () => {
      const xml = `<?xml version="1.0"?>
<skam:doc xmlns:skam="urn:skam:1">
  <skam:body>
    <skam:block></skam:block>
  </skam:body>
</skam:doc>`;
      expect(parse(xml).blocks).toHaveLength(1);
      expect(parse(xml).blocks[0]!.tokenIds).toEqual([]);
    });

    it('should throw when saidoku has no base element', () => {
      const xml = `<?xml version="1.0"?>
<skam:doc xmlns:skam="urn:skam:1">
  <skam:body>
    <skam:block>
      <skam:saidoku>
        <skam:kunform n="1" yomi="まさ" okuri="に"/>
      </skam:saidoku>
    </skam:block>
  </skam:body>
</skam:doc>`;
      expect(() => parse(xml)).toThrow(SKAMXMLParseError);
    });
  });

  describe('invalid attribute values', () => {
    it('should throw on invalid kaeri kind', () => {
      const xml = `<?xml version="1.0"?>
<skam:doc xmlns:skam="urn:skam:1">
  <skam:body>
    <skam:block>學<skam:kaeri kind="invalid"/></skam:block>
  </skam:body>
</skam:doc>`;
      expect(() => parse(xml)).toThrow(SKAMXMLParseError);
    });

    it('should throw when kutoten value is missing', () => {
      const xml = `<?xml version="1.0"?>
<skam:doc xmlns:skam="urn:skam:1">
  <skam:body>
    <skam:block>學<skam:kutoten kind="ku"/></skam:block>
  </skam:body>
</skam:doc>`;
      expect(() => parse(xml)).toThrow(SKAMXMLParseError);
    });

    it('should throw on invalid okototen grid format', () => {
      const xml = `<?xml version="1.0"?>
<skam:doc xmlns:skam="urn:skam:1">
  <skam:body>
    <skam:block>
      <skam:okototen grid="abc" x="1" y="1" shape="dot">國</skam:okototen>
    </skam:block>
  </skam:body>
</skam:doc>`;
      expect(() => parse(xml)).toThrow(SKAMXMLParseError);
    });
  });

  describe('structural errors', () => {
    it('should throw on unclosed tags', () => {
      const xml = `<?xml version="1.0"?>
<skam:doc xmlns:skam="urn:skam:1">
  <skam:body>
    <skam:block>學</skam:block>
  </skam:body>`;
      expect(() => parse(xml)).toThrow();
    });

    it('should throw on mismatched tags', () => {
      const xml = `<?xml version="1.0"?>
<skam:doc xmlns:skam="urn:skam:1">
  <skam:body>
    <skam:block>學</skam:wrong>
  </skam:body>
</skam:doc>`;
      expect(() => parse(xml)).toThrow();
    });
  });

  describe('reference integrity', () => {
    it('should throw when highlight.ref references non-existent ref id with matching ref element', () => {
      // highlight.ref が指定されているが、対応する xml:id を持つ ref が存在しない場合はエラー
      const xml = `<?xml version="1.0"?>
<skam:doc xmlns:skam="urn:skam:1">
  <skam:body>
    <skam:block>
      <skam:span type="highlight" ref="nonexistent"><skam:ref format="alpha-upper"/>學而</skam:span>
    </skam:block>
  </skam:body>
</skam:doc>`;
      expect(() => parse(xml)).toThrow(SKAMXMLParseError);
      expect(() => parse(xml)).toThrow('does not exist');
    });
  });

  describe('SKAMXMLParseError properties', () => {
    it('should be instanceof Error', () => {
      try {
        parse('');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should have meaningful message for namespace error', () => {
      try {
        parse('<?xml version="1.0"?><doc><body><block>學</block></body></doc>');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(SKAMXMLParseError);
        if (error instanceof SKAMXMLParseError) {
          expect(error.message.length).toBeGreaterThan(0);
        }
      }
    });
  });
});

describe('parse - error positions (K7 a)', () => {
  const positionOf = (xml: string): SKAMXMLParseError => {
    try {
      parse(xml);
    } catch (e) {
      expect(e).toBeInstanceOf(SKAMXMLParseError);
      return e as SKAMXMLParseError;
    }
    throw new Error('expected parse to throw');
  };
  const doc = (body: string) =>
    `<skam:doc xmlns:skam="urn:skam:1">\n<skam:body><skam:block>\n${body}\n</skam:block></skam:body>\n</skam:doc>`;

  it('puts line 1 and a numeric column on a wrong root element', () => {
    const error = positionOf('<foo xmlns="urn:x"/>');
    expect(error.line).toBe(1);
    expect(error.column).toBeTypeOf('number');
  });

  it('puts the element line on an unknown kaeri kind', () => {
    const xml = `<skam:doc xmlns:skam="urn:skam:1">\n<skam:body><skam:block>學\n<skam:kaeri kind="unknown"/></skam:block></skam:body></skam:doc>`;
    expect(positionOf(xml).line).toBe(3);
  });

  it('puts the element line on an empty yomigana', () => {
    const xml = `<skam:doc xmlns:skam="urn:skam:1">\n<skam:body><skam:block>\n<skam:yomigana value="x"></skam:yomigana></skam:block></skam:body></skam:doc>`;
    expect(positionOf(xml).line).toBe(3);
  });

  it('puts the element line on a missing required attribute', () => {
    const xml = `<skam:doc xmlns:skam="urn:skam:1">\n<skam:body>\n<skam:block>學\n<skam:kaeri/></skam:block></skam:body></skam:doc>`;
    expect(positionOf(xml).line).toBe(4);
  });

  it('uses the root element position when <skam:body> is missing', () => {
    expect(positionOf('<skam:doc xmlns:skam="urn:skam:1">\n</skam:doc>').line).toBe(1);
  });

  it('leaves Empty document without a position', () => {
    const error = positionOf('');
    expect(error.message).toMatch(/Empty document|XML parse error/);
    expect(error.line).toBeUndefined();
  });

  it('keeps positions on other element errors (okototen, ref, saidoku)', () => {
    expect(
      positionOf(doc('<skam:okototen grid="x" x="1" y="1" shape="a">學</skam:okototen>')).line
    ).toBe(3);
    expect(positionOf(doc('<skam:ref/>')).line).toBe(3);
    expect(positionOf(doc('<skam:saidoku><skam:kunform yomi="a"/></skam:saidoku>')).line).toBe(3);
  });
});
