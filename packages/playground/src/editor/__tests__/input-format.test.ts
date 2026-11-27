import { describe, expect, it } from 'vitest';
import { parseInput } from '../input-format.js';

describe('parseInput', () => {
  it('parses notation with a reading and okurigana', () => {
    const result = parseInput('notation', '學（まな）びて');
    expect(result.doc?.tokens).toHaveLength(1);
    expect(result.errors).toEqual([]);
  });

  it('keeps the code and start position of a notation error', () => {
    const result = parseInput('notation', '學（まな');
    expect(result.doc).toBeNull();
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'UNCLOSED_SYMBOL',
        line: 1,
        column: 2,
        severity: 'error',
      }),
    ]);
  });

  it('returns a document alongside notation warnings', () => {
    const result = parseInput('notation', '｜未だ｛ず｝知（いまだしらず）');
    expect(result.doc).not.toBeNull();
    expect(result.errors).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'SAIDOKU_READING_OVERLAP' })
    );
  });

  it('keeps XML parse error positions', () => {
    const result = parseInput('xml', '<skam:doc');
    expect(result.doc).toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.line).toEqual(expect.any(Number));
  });

  it.each(['xml', 'notation'] as const)('rejects whitespace-only %s input', (format) => {
    const result = parseInput(format, '   ');
    expect(result.doc).toBeNull();
    expect(result.errors).toEqual([
      { message: format === 'xml' ? 'XMLを入力してください' : '簡易記法を入力してください' },
    ]);
  });

  it('parses existing XML without adding diagnostics', () => {
    const result = parseInput(
      'xml',
      '<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>學</skam:block></skam:body></skam:doc>'
    );
    expect(result.doc?.tokens).toHaveLength(1);
    expect(result.errors).toEqual([]);
  });
});
