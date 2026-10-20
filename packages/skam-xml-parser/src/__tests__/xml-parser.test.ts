import { describe, it, expect } from 'vitest';
import { parse, SKAMXMLParseError } from '../index.js';
import { interpretXmldomReport } from '../xml-parser.js';

// ブラウザ版は同じ関数を持たないため、Node 版のモジュールを直接読む

describe('interpretXmldomReport', () => {
  const cases: ReadonlyArray<{
    name: string;
    report: string;
    message: string;
    position?: { line: number; column: number };
  }> = [
    {
      name: 'empty input (line 0, col undefined)',
      report: 'invalid doc source\n@#[line:0,col:undefined]',
      message: 'invalid doc source',
    },
    {
      name: 'xmldom prefix and a valid position',
      report: '[xmldom error]\tx\n@#[line:3,col:5]',
      message: 'x',
      position: { line: 3, column: 5 },
    },
    { name: 'line 0 and col 0', report: 'x\n@#[line:0,col:0]', message: 'x' },
    { name: 'empty col', report: 'x\n@#[line:3,col:]', message: 'x' },
    {
      name: 'line and col undefined',
      report: 'x\n@#[line:undefined,col:undefined]',
      message: 'x',
    },
    { name: 'valid line with col 0', report: 'x\n@#[line:1,col:0]', message: 'x' },
    {
      name: 'systemId present',
      report: 'x\n@file.xml#[line:2,col:4]',
      message: 'x',
      position: { line: 2, column: 4 },
    },
    { name: 'no fragment', report: 'x', message: 'x' },
  ];

  it.each(cases)('$name', ({ report, message, position }) => {
    const result = interpretXmldomReport(report);
    expect(result.message).toBe(message);
    if (position) {
      expect(result.line).toBe(position.line);
      expect(result.column).toBe(position.column);
    } else {
      expect(result).not.toHaveProperty('line');
      expect(result).not.toHaveProperty('column');
    }
  });
});

describe('parse - xmldom error reports', () => {
  const errorOf = (xml: string): SKAMXMLParseError => {
    try {
      parse(xml);
    } catch (e) {
      if (e instanceof SKAMXMLParseError) return e;
    }
    throw new Error('expected SKAMXMLParseError');
  };

  it('reports empty input as Empty document without a position', () => {
    const error = errorOf('');
    expect(error.message).toBe('Empty document');
    expect(error.line).toBeUndefined();
    expect(error.column).toBeUndefined();
  });

  it('keeps the xmldom position for a syntax error', () => {
    const error = errorOf('<a>\n\n  <b></c></a>');
    expect(error.message).toBe('XML parse error: unclosed xml attribute');
    expect(error.line).toBe(3);
    expect(error.column).toBe(3);
  });

  it('keeps the pre-scan position (not routed through xmldom)', () => {
    const error = errorOf('<a');
    expect(error.message).toBe('unterminated tag');
    expect(error.line).toBe(1);
    expect(error.column).toBe(1);
  });

  it('reports whitespace-only input as Empty document', () => {
    expect(errorOf('   ').message).toBe('Empty document');
  });
});
