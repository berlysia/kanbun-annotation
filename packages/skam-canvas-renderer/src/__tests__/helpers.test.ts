import { describe, it } from 'vitest';
import { expect } from 'vitest';
import { convertKaeriToUnicode, resolveEmphasisCharacter } from '../helpers.js';

describe('convertKaeriToUnicode', () => {
  it('converts single kaeri characters', () => {
    expect(convertKaeriToUnicode('レ')).toBe('\u3191');
    expect(convertKaeriToUnicode('一')).toBe('\u3192');
    expect(convertKaeriToUnicode('二')).toBe('\u3193');
    expect(convertKaeriToUnicode('三')).toBe('\u3194');
    expect(convertKaeriToUnicode('上')).toBe('\u3196');
    expect(convertKaeriToUnicode('中')).toBe('\u3197');
    expect(convertKaeriToUnicode('下')).toBe('\u3198');
    expect(convertKaeriToUnicode('甲')).toBe('\u3199');
    expect(convertKaeriToUnicode('乙')).toBe('\u319A');
  });

  it('converts compound kaeri (e.g. 一レ)', () => {
    expect(convertKaeriToUnicode('一レ')).toBe('\u3192\u3191');
    expect(convertKaeriToUnicode('上レ')).toBe('\u3196\u3191');
  });

  it('passes through unknown characters', () => {
    expect(convertKaeriToUnicode('X')).toBe('X');
  });

  it('handles empty string', () => {
    expect(convertKaeriToUnicode('')).toBe('');
  });
});

describe('resolveEmphasisCharacter', () => {
  it('returns filled dot for undefined style', () => {
    expect(resolveEmphasisCharacter(undefined)).toBe('\u2022');
  });

  it('returns filled dot for "dot"', () => {
    expect(resolveEmphasisCharacter('dot')).toBe('\u2022');
  });

  it('returns open dot for "open dot"', () => {
    expect(resolveEmphasisCharacter('open dot')).toBe('\u25E6');
  });

  it('returns filled sesame for "sesame"', () => {
    expect(resolveEmphasisCharacter('sesame')).toBe('\uFE45');
  });

  it('returns open sesame for "open sesame"', () => {
    expect(resolveEmphasisCharacter('open sesame')).toBe('\uFE46');
  });

  it('returns filled circle for "circle"', () => {
    expect(resolveEmphasisCharacter('circle')).toBe('\u25CF');
  });

  it('returns open circle for "open circle"', () => {
    expect(resolveEmphasisCharacter('open circle')).toBe('\u25CB');
  });

  it('returns filled triangle for "triangle"', () => {
    expect(resolveEmphasisCharacter('triangle')).toBe('\u25B2');
  });

  it('returns open triangle for "open triangle"', () => {
    expect(resolveEmphasisCharacter('open triangle')).toBe('\u25B3');
  });

  it('returns filled double-circle for "double-circle"', () => {
    expect(resolveEmphasisCharacter('double-circle')).toBe('\u25C9');
  });

  it('returns open double-circle for "open double-circle"', () => {
    expect(resolveEmphasisCharacter('open double-circle')).toBe('\u25CE');
  });

  it('returns filled dot for "filled dot"', () => {
    expect(resolveEmphasisCharacter('filled dot')).toBe('\u2022');
  });

  it('returns filled sesame for "filled sesame"', () => {
    expect(resolveEmphasisCharacter('filled sesame')).toBe('\uFE45');
  });
});
