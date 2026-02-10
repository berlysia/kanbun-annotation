import { describe, it, expect } from 'vitest';
import {
  parseWritingMode,
  parseProfile,
  parseBooleanAttr,
  parseCopyable,
  buildRenderOptions,
} from '../attribute-map.js';

describe('parseWritingMode', () => {
  it('returns "vertical" for null', () => {
    expect(parseWritingMode(null)).toBe('vertical');
  });

  it('returns "vertical" for "vertical"', () => {
    expect(parseWritingMode('vertical')).toBe('vertical');
  });

  it('returns "horizontal" for "horizontal"', () => {
    expect(parseWritingMode('horizontal')).toBe('horizontal');
  });

  it('returns "vertical" for invalid value', () => {
    expect(parseWritingMode('diagonal')).toBe('vertical');
  });
});

describe('parseProfile', () => {
  it('returns undefined for null', () => {
    expect(parseProfile(null)).toBeUndefined();
  });

  it('returns preset profile for known name', () => {
    const result = parseProfile('full');
    expect(result).toBeDefined();
    expect(result!.yomigana).toBe(true);
  });

  it('returns preset for "learningBasic"', () => {
    const result = parseProfile('learningBasic');
    expect(result).toBeDefined();
  });

  it('parses valid JSON object', () => {
    const result = parseProfile('{"yomigana":false}');
    expect(result).toEqual({ yomigana: false });
  });

  it('returns undefined for invalid JSON', () => {
    expect(parseProfile('not-json')).toBeUndefined();
  });

  it('returns undefined for JSON array', () => {
    expect(parseProfile('[1,2,3]')).toBeUndefined();
  });

  it('returns undefined for JSON primitive', () => {
    expect(parseProfile('"string"')).toBeUndefined();
  });
});

describe('parseBooleanAttr', () => {
  it('returns false for null (absent)', () => {
    expect(parseBooleanAttr(null)).toBe(false);
  });

  it('returns true for empty string (present)', () => {
    expect(parseBooleanAttr('')).toBe(true);
  });

  it('returns true for any value (present)', () => {
    expect(parseBooleanAttr('true')).toBe(true);
    expect(parseBooleanAttr('false')).toBe(true); // HTML spec: presence = true
  });
});

describe('parseCopyable', () => {
  it('returns undefined for null', () => {
    expect(parseCopyable(null)).toBeUndefined();
  });

  it('returns "all" for "all"', () => {
    expect(parseCopyable('all')).toBe('all');
  });

  it('parses space-separated elements', () => {
    expect(parseCopyable('ruby okurigana')).toEqual(['ruby', 'okurigana']);
  });

  it('filters invalid elements', () => {
    expect(parseCopyable('ruby invalid soegana')).toEqual(['ruby', 'soegana']);
  });

  it('returns undefined for all-invalid elements', () => {
    expect(parseCopyable('invalid')).toBeUndefined();
  });
});

describe('buildRenderOptions', () => {
  const defaultAttrs = {
    'writing-mode': null,
    profile: null,
    inline: null,
    interactive: null,
    'include-reading-layer': null,
    copyable: null,
    'class-prefix': null,
  };

  it('returns default options for all-null attributes', () => {
    const options = buildRenderOptions(defaultAttrs);
    expect(options.writingMode).toBe('vertical');
    expect(options.useLayer).toBe(false);
    expect(options.includeReadingLayer).toBe(true);
    expect(options.inline).toBeUndefined();
    expect(options.interactive).toBeUndefined();
  });

  it('maps writing-mode attribute', () => {
    const options = buildRenderOptions({
      ...defaultAttrs,
      'writing-mode': 'horizontal',
    });
    expect(options.writingMode).toBe('horizontal');
  });

  it('maps inline boolean attribute', () => {
    const options = buildRenderOptions({
      ...defaultAttrs,
      inline: '',
    });
    expect(options.inline).toBe(true);
  });

  it('maps interactive boolean attribute', () => {
    const options = buildRenderOptions({
      ...defaultAttrs,
      interactive: '',
    });
    expect(options.interactive).toBe(true);
  });

  it('maps include-reading-layer="false"', () => {
    const options = buildRenderOptions({
      ...defaultAttrs,
      'include-reading-layer': 'false',
    });
    expect(options.includeReadingLayer).toBe(false);
  });

  it('maps class-prefix attribute', () => {
    const options = buildRenderOptions({
      ...defaultAttrs,
      'class-prefix': 'my-prefix',
    });
    expect(options.classPrefix).toBe('my-prefix');
  });

  it('maps copyable attribute', () => {
    const options = buildRenderOptions({
      ...defaultAttrs,
      copyable: 'ruby okurigana',
    });
    expect(options.copyable).toEqual(['ruby', 'okurigana']);
  });
});
