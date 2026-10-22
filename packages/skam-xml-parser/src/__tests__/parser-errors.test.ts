import { describe, it, expect, vi } from 'vitest';
import { parse, SKAMXMLParseError } from '../index.js';
import { parseWith } from '../parser-core.js';

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
    for (const source of ['', ' ', '\n', '   \n  ', '\t\r\n']) {
      const error = positionOf(source);
      expect(error.message).toBe('Empty document');
      expect(error.line).toBeUndefined();
      expect(error.column).toBeUndefined();
    }
  });

  it('does not count U+3000 or U+FEFF as XML whitespace', () => {
    // Node's xmldom happens to report both as Empty document too; what matters is that the
    // new check does not intercept them (the parser is still called).
    for (const source of ['\u3000', '\uFEFF']) {
      const parseXML = vi.fn(() => {
        throw new Error('reached the XML parser');
      });
      expect(() => parseWith(parseXML, source)).toThrow('reached the XML parser');
      expect(parseXML).toHaveBeenCalledTimes(1);
    }
  });

  it('keeps Empty document for an XML declaration only', () => {
    expect(positionOf('<?xml version="1.0"?>').message).toBe('Empty document');
  });

  it('reports the input limit before Empty document', () => {
    expect(() => parse(' '.repeat(20), { maxInputLength: 10 })).toThrow(/maxInputLength/);
  });

  it('keeps positions on other element errors (okototen, ref, saidoku)', () => {
    expect(
      positionOf(doc('<skam:okototen grid="x" x="1" y="1" shape="a">學</skam:okototen>')).line
    ).toBe(3);
    expect(positionOf(doc('<skam:ref/>')).line).toBe(3);
    expect(positionOf(doc('<skam:saidoku><skam:kunform yomi="a"/></skam:saidoku>')).line).toBe(3);
  });
});

describe('parse - <skam:t> and free-data attribute errors', () => {
  const wrap = (body: string, rootAttrs = '') =>
    `<skam:doc xmlns:skam="urn:skam:1" xmlns:edu="urn:skam:edu:1"${rootAttrs}><skam:body><skam:block>${body}</skam:block></skam:body></skam:doc>`;
  const positionedError = (xml: string): SKAMXMLParseError => {
    try {
      parse(xml);
    } catch (e) {
      expect(e).toBeInstanceOf(SKAMXMLParseError);
      expect(typeof (e as SKAMXMLParseError).line).toBe('number');
      return e as SKAMXMLParseError;
    }
    throw new Error('expected parse to throw');
  };

  it('rejects an empty <skam:t> and one with a child element, with a position', () => {
    positionedError(wrap('<skam:t></skam:t>'));
    positionedError(wrap('<skam:t/>'));
    positionedError(wrap('<skam:t><skam:kun yomi="x">學</skam:kun></skam:t>'));
    positionedError(wrap('<skam:t>學<skam:unknown/></skam:t>'));
  });

  it('accepts a comment inside <skam:t> and ignores it', () => {
    expect(parse(wrap('<skam:t>學<!-- c -->問</skam:t>')).tokens[0]!.text).toBe('學問');
  });

  it('rejects <skam:t> inside <skam:t>', () => {
    positionedError(wrap('<skam:t><skam:t>學</skam:t></skam:t>'));
  });

  it.each([['{'], ['[1]'], ['1'], ['null'], ['"a"']])(
    'rejects skam:custom=%j that is not a JSON object',
    (value) => {
      positionedError(wrap('學', ` skam:custom='${value.replaceAll('"', '&quot;')}'`));
    }
  );

  it('rejects skam:ext that is not a JSON object', () => {
    positionedError(wrap('學', ` skam:ext="1"`));
  });

  it('rejects a JSON nested too deep to parse', () => {
    positionedError(wrap('學', ` skam:custom="${'['.repeat(200000)}"`));
  });

  it('rejects an attribute value longer than 1,000,000 characters, and accepts exactly that long', () => {
    const json = (length: number) => `{&quot;a&quot;:&quot;${'x'.repeat(length - 8)}&quot;}`;
    const raw = (length: number) => `{"a":"${'x'.repeat(length - 8)}"}`;
    expect(raw(1_000_000)).toHaveLength(1_000_000);
    const accepted = parse(wrap('學', ` skam:custom="${json(1_000_000)}"`), { validate: false });
    expect(accepted.custom).toBeDefined();
    positionedError(wrap('學', ` skam:custom="${json(1_000_001)}"`));
  });

  it('does not pollute Object.prototype with __proto__ in skam:custom or skam:ext, and the validator rejects it', () => {
    const xml = wrap('學', ` skam:custom='{"__proto__":{"x":1}}'`);
    expect(() => parse(xml)).toThrow();
    const unvalidated = parse(xml, { validate: false });
    expect(({} as Record<string, unknown>)['x']).toBeUndefined();
    expect(Object.hasOwn(unvalidated.custom!, '__proto__')).toBe(true);
    const ext = parse(wrap('學', ` skam:ext='{"__proto__":{"x":1}}'`), { validate: false });
    expect(({} as Record<string, unknown>)['x']).toBeUndefined();
    expect(Object.hasOwn(ext.ext!, '__proto__')).toBe(true);
  });

  it('rejects the same extension given as a namespaced attribute and in skam:ext', () => {
    const meta = '<skam:meta><skam:extension name="edu" uri="urn:skam:edu:1"/></skam:meta>';
    const xml =
      `<skam:doc xmlns:skam="urn:skam:1" xmlns:edu="urn:skam:edu:1">${meta}<skam:body><skam:block>` +
      `學<skam:kaeri kind="ichi" edu:quiz="q1" skam:ext='{"edu":{"quiz":"q2"}}'/></skam:block></skam:body></skam:doc>`;
    positionedError(xml);
  });

  it('rejects okuri-* and soe-* attributes without the matching annotation', () => {
    positionedError(wrap('<skam:kun yomi="まな" okuri-placement-hint="right">學</skam:kun>'));
    positionedError(wrap('<skam:kun yomi="まな" soe-placement-hint="right">學</skam:kun>'));
    positionedError(wrap(`<skam:kun yomi="まな" skam:okuri-custom='{"a":1}'>學</skam:kun>`));
    positionedError(wrap(`<skam:kun okuri="ブ" skam:custom='{"a":1}'>學</skam:kun>`));
    positionedError(wrap(`<skam:kun yomi="まな" skam:soe-ext='{"a":1}'>學</skam:kun>`));
  });
});

// ============================================================================
// 空要素の対と深さの誤り (plan-3 T2)
// ============================================================================

describe('parse - pair and depth errors', () => {
  const wrapBlocks = (...blocks: string[]): string =>
    `<skam:doc xmlns:skam="urn:skam:1" xmlns:edu="urn:skam:edu:1"><skam:body>${blocks
      .map((b) => `<skam:block>${b}</skam:block>`)
      .join('')}</skam:body></skam:doc>`;
  const start = (id: string): string => `<skam:span type="emphasis" sID="${id}"/>`;
  const end = (id: string): string => `<skam:span eID="${id}"/>`;

  function positioned(xml: string): SKAMXMLParseError {
    try {
      parse(xml);
    } catch (e) {
      expect(e).toBeInstanceOf(SKAMXMLParseError);
      expect((e as SKAMXMLParseError).line).toBeGreaterThan(0);
      return e as SKAMXMLParseError;
    }
    throw new Error('expected a parse error');
  }

  it('rejects sID / eID values that are not NCNames, without echoing the value', () => {
    for (const value of ['', 'a b', 'a:b', '1a']) {
      const error = positioned(
        wrapBlocks(`<skam:span type="emphasis" sID="${value}"/>甲<skam:span eID="${value}"/>`)
      );
      if (value !== '') expect(error.message).not.toContain(value);
    }
    const eid = positioned(wrapBlocks(`${start('r1')}甲<skam:span eID="9z"/>`));
    expect(eid.message).not.toContain('9z');
  });

  it.each([
    ['an sID without eID', start('r1') + '甲'],
    ['an eID before its sID', end('r1') + '甲' + start('r1')],
    ['two eIDs', start('r1') + '甲' + end('r1') + end('r1')],
    [
      'an sID used again after it closed',
      start('r1') + '甲' + end('r1') + start('r1') + '乙' + end('r1'),
    ],
    ['a pair with different element names', start('r1') + '甲<skam:tateten eID="r1"/>'],
    ['an element with both sID and eID', '<skam:span type="emphasis" sID="r1" eID="r1"/>甲'],
    ['an end element with a style attribute', start('r1') + '甲<skam:span eID="r1" style="dot"/>'],
    [
      'an end element with a namespaced attribute',
      start('r1') + '甲<skam:span eID="r1" edu:quiz="q"/>',
    ],
    [
      'a start element with content',
      '<skam:span type="emphasis" sID="r1">甲</skam:span>' + end('r1'),
    ],
    [
      'a pair with only a position mark between',
      start('r1') + '<skam:kutoten value="、"/>' + end('r1') + '甲',
    ],
    [
      'a saidoku with sID',
      '<skam:saidoku sID="r1"><skam:base>甲</skam:base><skam:kunform yomi="あ"/></skam:saidoku>',
    ],
    ['a skam:t with sID', '<skam:t sID="r1">甲</skam:t>'],
    ['a kaeri with sID', '甲<skam:kaeri sID="r1" kind="re"/>'],
    [
      'a pair element with a processing instruction',
      '<skam:span type="emphasis" sID="r1"><?pi x?></skam:span>甲' + end('r1'),
    ],
    [
      'a pair element with whitespace-only CDATA',
      '<skam:span type="emphasis" sID="r1"><![CDATA[ ]]></skam:span>甲' + end('r1'),
    ],
  ])('rejects %s', (_label, inner) => {
    positioned(wrapBlocks(inner));
  });

  it('rejects an sID reused in another block and a pair across two blocks', () => {
    positioned(wrapBlocks(start('r1') + '甲' + end('r1'), start('r1') + '乙' + end('r1')));
    positioned(wrapBlocks(start('r1') + '甲', '乙' + end('r1')));
  });

  it('rejects saidoku inside yomigana, kun and base', () => {
    const saidoku =
      '<skam:saidoku><skam:base>未</skam:base><skam:kunform yomi="いま"/></skam:saidoku>';
    positioned(wrapBlocks(`<skam:yomigana value="あ">甲${saidoku}</skam:yomigana>`));
    positioned(wrapBlocks(`<skam:kun yomi="あ">甲${saidoku}</skam:kun>`));
    positioned(
      wrapBlocks(
        `<skam:saidoku><skam:base>${saidoku}</skam:base><skam:kunform yomi="いま"/></skam:saidoku>`
      )
    );
  });

  it('allows 56 nested range elements and rejects 57 with a positioned error', () => {
    const nest = (n: number): string =>
      wrapBlocks(`${'<skam:span type="emphasis">'.repeat(n)}甲${'</skam:span>'.repeat(n)}`);
    expect(() => parse(nest(56))).not.toThrow();
    // 既定の maxDepth (64) では要素の深さの事前走査が先に止めることがある
    positioned(nest(57));
    // 呼び出し側が maxDepth を上げたときの防御
    expect(() => parse(nest(57), { maxDepth: 200 })).toThrow(SKAMXMLParseError);
  });

  it('rejects 10,000 different open sIDs (unmatched) and a repeated sID at the second one', () => {
    const many = Array.from({ length: 10_000 }, (_, i) => start(`r${i}`)).join('');
    positioned(wrapBlocks(many + '甲'));
    const same = Array.from({ length: 10_000 }, () => start('r1')).join('');
    positioned(wrapBlocks(same + '甲'));
  });
});
