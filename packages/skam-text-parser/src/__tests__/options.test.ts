import { describe, expect, it } from 'vitest';
import { createParser, NotationConfigError } from '../index.js';
import type { NotationOptions } from '../options.js';
import { featureNames } from './fixtures.js';

describe('configuration', () => {
  it('accepts defaults', () => expect(() => createParser()).not.toThrow());
  it.each([
    [{ symbols: { kaeri: [{ open: '＼', close: '＞' }] } }, 'SYMBOL_CONFLICT'],
    [{ symbols: { kaeri: [{ open: '「', close: '」' }] } }, 'SYMBOL_CONFLICT'],
    [{ symbols: { soegana: ['＋＋'], tateten: ['＋'] } }, 'SYMBOL_CONFLICT'],
    [{ symbols: { soegana: [''] } }, 'EMPTY_SYMBOL'],
    ...[0, -1, 1.5, NaN, Infinity].map(
      (maxInputLength) => [{ maxInputLength }, 'INVALID_LIMIT'] as const
    ),
  ] satisfies readonly (readonly [NotationOptions, string])[])('rejects %j', (options, code) => {
    try {
      createParser(options);
      expect.fail('configuration must fail');
    } catch (error) {
      expect(error).toBeInstanceOf(NotationConfigError);
      if (!(error instanceof NotationConfigError)) throw error;
      expect(error.issues.some((issue) => issue.code === code)).toBe(true);
      if (code === 'SYMBOL_CONFLICT') expect(error.issues[0]?.message).toMatch(/kaeri|soegana/);
    }
  });
  it('excludes disabled symbols from conflicts', () => {
    expect(() =>
      createParser({
        features: { soegana: false },
        symbols: { kaeri: [{ open: '＋', close: '》' }] },
      })
    ).not.toThrow();
  });
  it.each(Array.from({ length: 256 }, (_, mask) => mask))('accepts feature subset %i', (mask) => {
    const features = Object.fromEntries(
      featureNames.map((name, bit) => [name, !!(mask & (1 << bit))])
    );
    expect(() => createParser({ features })).not.toThrow();
  });
});
