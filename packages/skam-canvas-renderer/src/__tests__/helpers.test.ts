import { describe, it } from 'vitest';
import { expect } from 'vitest';
import { convertKaeriToUnicode } from '../helpers.js';

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
