import { describe, it, expect, vi, afterEach } from 'vitest';
import { splitGraphemes } from '../graphemes.js';

describe('splitGraphemes', () => {
  it('keeps an IVS and a combining mark with their base character', () => {
    expect(splitGraphemes('葛\u{E0100}é︀字')).toEqual(['葛\u{E0100}', 'é︀', '字']);
  });

  it('keeps an SVS with its base character', () => {
    expect(splitGraphemes('葛︀城')).toEqual(['葛︀', '城']);
  });

  it('keeps a combining voiced mark with its base character', () => {
    expect(splitGraphemes('が')).toEqual(['が']);
  });

  it('keeps a surrogate pair as one cluster', () => {
    expect(splitGraphemes('𠮷')).toEqual(['𠮷']);
  });

  it('splits a leading lone selector into its own cluster', () => {
    expect(splitGraphemes('\u{E0100}字')).toEqual(['\u{E0100}', '字']);
  });

  it('returns an empty array for an empty string', () => {
    expect(splitGraphemes('')).toEqual([]);
  });

  it('splits plain characters one by one', () => {
    expect(splitGraphemes('学問')).toEqual(['学', '問']);
  });

  describe('without Intl.Segmenter', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.resetModules();
    });

    it('throws TypeError when called, but importing does not throw', async () => {
      vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined });
      vi.resetModules();
      const mod = await import('../graphemes.js');
      expect(() => mod.splitGraphemes('学')).toThrow(TypeError);
    });
  });
});
