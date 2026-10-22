import { describe, it, expect, vi, afterEach } from 'vitest';
import { splitGraphemes, tokenizePlainText } from '../graphemes.js';
import { SKAM_ML_CONTENT_MODEL } from '../skam-ml-content-model.js';

describe('tokenizePlainText', () => {
  const texts = (text: string) => tokenizePlainText(text).map((t) => t.text);

  it('splits into graphemes', () => {
    expect(texts('學問')).toEqual(['學', '問']);
  });

  it('drops leading ASCII whitespace of a grapheme and drops empty ones', () => {
    expect(texts(' 學')).toEqual(['學']);
    expect(texts('\r\n')).toEqual([]);
    expect(texts('\t\n\r ')).toEqual([]);
  });

  it('keeps a combining mark with its base', () => {
    expect(texts('é')).toEqual(['é']);
  });

  it('keeps U+3000 as a token', () => {
    expect(texts('　')).toEqual(['　']);
  });

  it('keeps the combining mark of a whitespace + combining mark grapheme', () => {
    expect(texts(' ́')).toEqual(['́']);
  });

  it('returns the UTF-16 offsets of the grapheme before stripping', () => {
    expect(tokenizePlainText('a ́\u{20BB7}')).toEqual([
      { text: 'a', start: 0, end: 1 },
      { text: '́', start: 1, end: 3 },
      { text: '\u{20BB7}', start: 3, end: 5 },
    ]);
  });
});

describe('SKAM_ML_CONTENT_MODEL: skam:t', () => {
  it('lets every element that takes text take skam:t, and skam:t takes only text', () => {
    const owners = ['yomigana', 'okimoji', 'joji', 'okototen', 'base', 'kun', 'soegana'] as const;
    for (const owner of owners) expect(SKAM_ML_CONTENT_MODEL[owner]).toContain('t');
    expect(SKAM_ML_CONTENT_MODEL.t).toEqual(['#text']);
  });
});

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

describe('SKAM_ML_CONTENT_MODEL: relaxed nesting (§7.0)', () => {
  it('lets kun, yomigana, okimoji and base take okimoji, span, kaeri and t', () => {
    for (const owner of ['kun', 'yomigana', 'okimoji', 'base'] as const) {
      for (const child of ['okimoji', 'span', 'kaeri', 't']) {
        expect(SKAM_ML_CONTENT_MODEL[owner]).toContain(child);
      }
    }
  });

  it('keeps saidoku out of kun, yomigana and base only', () => {
    for (const owner of ['kun', 'yomigana', 'base'] as const) {
      expect(SKAM_ML_CONTENT_MODEL[owner]).not.toContain('saidoku');
    }
    expect(SKAM_ML_CONTENT_MODEL.okimoji).toContain('saidoku');
  });

  it('has a key for every parent that takes text', () => {
    expect(Object.keys(SKAM_ML_CONTENT_MODEL).sort()).toEqual(
      [
        'base',
        'block',
        'joji',
        'kun',
        'okimoji',
        'okototen',
        'soegana',
        'span',
        't',
        'tateten',
        'yomigana',
      ].sort()
    );
  });
});
