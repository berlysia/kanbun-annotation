import { describe, it, expect } from 'vitest';
import { validateSKAMDocument, isLanguageTag } from '../index.js';

const minimal = {
  format: 'skam@0.1',
  tokens: [{ id: 't1', text: '学' }],
  blocks: [{ id: 'b1', tokenIds: ['t1'] }],
  marks: [],
  readings: [],
};

describe('document lang', () => {
  it.each(['lzh', 'zh-Hant', 'ja'])(
    'accepts lang %s and keeps it in the returned document',
    (lang) => {
      const result = validateSKAMDocument({ ...minimal, lang });
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.document.lang).toBe(lang);
    }
  );

  it('rejects a non-string lang with INVALID_TYPE at path lang', () => {
    const result = validateSKAMDocument({ ...minimal, lang: 1 });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.kind).toBe('INVALID_TYPE');
      expect(result.errors[0]?.path).toBe('lang');
    }
  });

  it.each(['', 'ja"><b', 'j', 'ja-'])('rejects lang %j with INVALID_VALUE at path lang', (lang) => {
    const result = validateSKAMDocument({ ...minimal, lang });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.kind).toBe('INVALID_VALUE');
      expect(result.errors[0]?.path).toBe('lang');
    }
  });

  it('leaves no lang key when the input has none', () => {
    const result = validateSKAMDocument(minimal);
    expect(result.valid).toBe(true);
    if (result.valid) expect('lang' in result.document).toBe(false);
  });
});

describe('isLanguageTag', () => {
  it.each([
    ['ja', true],
    ['zh-Hant', true],
    ['lzh', true],
    ['ja"><b', false],
    ['j', false],
    ['ja-', false],
    ['', false],
    [{ toString: (): string => 'ja' }, false],
    [undefined, false],
  ])('%j -> %s', (value, expected) => {
    expect(isLanguageTag(value)).toBe(expected);
  });
});
