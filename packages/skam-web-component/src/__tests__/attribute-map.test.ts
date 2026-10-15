import { describe, it, expect } from 'vitest';
import { PROFILES } from '@kanbun-skam/skam-html-renderer';
import {
  parseWritingMode,
  resolveProfileAttribute,
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

  it('returns "vertical" for invalid value (reported via buildRenderOptions)', () => {
    expect(parseWritingMode('diagonal')).toBe('vertical');
  });
});

describe('resolveProfileAttribute', () => {
  it('resolves a preset name', () => {
    expect(resolveProfileAttribute('learningBasic')).toEqual(PROFILES.learningBasic);
    expect(resolveProfileAttribute('full').yomigana).toBe(true);
  });

  it('resolves the base form', () => {
    const p = resolveProfileAttribute('{"base":"learningBasic","overrides":{"okurigana":true}}');
    expect(p).toEqual({ ...PROFILES.learningBasic, okurigana: true });
  });

  it('overlays a partial JSON on full', () => {
    expect(resolveProfileAttribute('{"yomigana":false}')).toEqual({
      ...PROFILES.full,
      yomigana: false,
    });
  });

  it.each([
    '{bad json',
    'not-json',
    'unknownPreset',
    'constructor',
    '__proto__',
    'toString',
    'null',
    '[]',
    '[1,2,3]',
    '123',
    '"string"',
    '',
    '{"okuriganaa":false}',
    '{"okurigana":"false"}',
    '{"__proto__":{"okurigana":false}}',
  ])('throws TypeError for %j', (value) => {
    expect(() => resolveProfileAttribute(value)).toThrow(TypeError);
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
    'include-reading-layer': null,
    copyable: null,
    'class-prefix': null,
  };

  it('returns default options for all-null attributes', () => {
    const { options } = buildRenderOptions(defaultAttrs);
    expect(options.writingMode).toBe('vertical');
    expect(options.useLayer).toBe(false);
    expect(options.includeReadingLayer).toBe(true);
    expect(options.inline).toBeUndefined();
  });

  it('maps writing-mode attribute', () => {
    const { options } = buildRenderOptions({
      ...defaultAttrs,
      'writing-mode': 'horizontal',
    });
    expect(options.writingMode).toBe('horizontal');
  });

  it('maps inline boolean attribute', () => {
    const { options } = buildRenderOptions({
      ...defaultAttrs,
      inline: '',
    });
    expect(options.inline).toBe(true);
  });

  it('maps include-reading-layer="false"', () => {
    const { options } = buildRenderOptions({
      ...defaultAttrs,
      'include-reading-layer': 'false',
    });
    expect(options.includeReadingLayer).toBe(false);
  });

  it('include-reading-layer accepts "", "true" and "false"', () => {
    for (const [value, expected] of [
      ['', true],
      ['true', true],
      ['false', false],
    ] as const) {
      const { options, blocked } = buildRenderOptions({
        ...defaultAttrs,
        'include-reading-layer': value,
      });
      expect(options.includeReadingLayer).toBe(expected);
      expect(blocked).toEqual([]);
    }
  });

  it('blocks an invalid include-reading-layer and profile, in profile order', () => {
    const { blocked, options } = buildRenderOptions({
      ...defaultAttrs,
      profile: '{"okuriganaa":false}',
      'include-reading-layer': 'fasle',
    });
    expect(blocked.map((b) => b.attribute)).toEqual(['profile', 'include-reading-layer']);
    expect(options.profile).toBeUndefined();
  });

  it('lists an invalid writing-mode and copyable as recoverable', () => {
    const { options, invalid, blocked } = buildRenderOptions({
      ...defaultAttrs,
      'writing-mode': 'diagonal',
      copyable: 'ruby unknown',
    });
    expect(options.writingMode).toBe('vertical');
    expect(options.copyable).toEqual(['ruby']);
    expect(invalid.map((i) => i.attribute)).toEqual(['writing-mode', 'copyable']);
    expect(blocked).toEqual([]);
  });

  it('maps class-prefix attribute', () => {
    const { options } = buildRenderOptions({
      ...defaultAttrs,
      'class-prefix': 'my-prefix',
    });
    expect(options.classPrefix).toBe('my-prefix');
  });

  it('maps copyable attribute', () => {
    const { options } = buildRenderOptions({
      ...defaultAttrs,
      copyable: 'ruby okurigana',
    });
    expect(options.copyable).toEqual(['ruby', 'okurigana']);
  });

  it('maps display-lang attribute', () => {
    const { options, invalid } = buildRenderOptions({
      ...defaultAttrs,
      'display-lang': 'lzh',
    });
    expect(options.displayLang).toBe('lzh');
    expect(invalid).toEqual([]);
  });

  it('drops invalid values and lists them in class-prefix, display-lang order', () => {
    const { options, invalid } = buildRenderOptions({
      ...defaultAttrs,
      'class-prefix': 'a"><b',
      'display-lang': 'ja"><b',
    });
    expect(options.classPrefix).toBeUndefined();
    expect(options.displayLang).toBeUndefined();
    expect(invalid.map((i) => i.attribute)).toEqual(['class-prefix', 'display-lang']);
  });
});
