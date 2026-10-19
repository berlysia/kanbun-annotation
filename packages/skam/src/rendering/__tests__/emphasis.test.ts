import { describe, it, expect } from 'vitest';
import { resolveEmphasisCharacter, isEmphasisKeyword } from '../emphasis.js';
import { isValidEmphasisStyle } from '../../validator.js';
import * as rendering from '../index.js';
import * as root from '../../index.js';

const DEFAULT_CHAR = '\u2022';

/** spec K7 の対応表 (15 のキーワード) */
const KEYWORD_TABLE: Record<string, string> = {
  dot: '\u2022',
  'filled dot': '\u2022',
  'open dot': '\u25E6',
  circle: '\u25CF',
  'filled circle': '\u25CF',
  'open circle': '\u25CB',
  'double-circle': '\u25C9',
  'filled double-circle': '\u25C9',
  'open double-circle': '\u25CE',
  triangle: '\u25B2',
  'filled triangle': '\u25B2',
  'open triangle': '\u25B3',
  sesame: '\uFE45',
  'filled sesame': '\uFE45',
  'open sesame': '\uFE46',
};

describe('resolveEmphasisCharacter', () => {
  describe('文字列でない値', () => {
    it.each([
      ['undefined', undefined],
      ['null', null],
      ['number', 123],
      ['object', {}],
      ['array', ['dot']],
      ['symbol', Symbol('x')],
    ])('%s → 既定の点', (_name, value) => {
      expect(resolveEmphasisCharacter(value)).toBe(DEFAULT_CHAR);
    });

    it('引数なし → 既定の点', () => {
      expect(resolveEmphasisCharacter()).toBe(DEFAULT_CHAR);
    });
  });

  describe('キーワード', () => {
    it.each(Object.entries(KEYWORD_TABLE))('%s → 対応表の文字', (keyword, expected) => {
      expect(resolveEmphasisCharacter(keyword)).toBe(expected);
    });

    it('対応表のキーは validator が受ける 15 の形と一致する', () => {
      const prefixes = ['', 'filled ', 'open '];
      const shapes = ['dot', 'circle', 'double-circle', 'triangle', 'sesame'];
      const generated = prefixes.flatMap((p) => shapes.map((s) => `${p}${s}`));
      expect(new Set(generated).size).toBe(15);
      expect(new Set(Object.keys(KEYWORD_TABLE))).toEqual(new Set(generated));
      for (const keyword of generated) {
        expect(isValidEmphasisStyle(keyword)).toBe(true);
      }
    });

    it.each(['filled', 'open', 'filled open dot'])(
      '形のない値 %j は validator を通らず既定の点',
      (value) => {
        expect(isValidEmphasisStyle(value)).toBe(false);
        expect(resolveEmphasisCharacter(value)).toBe(DEFAULT_CHAR);
      }
    );

    it('対応表を 1 文字の判定より先に引く', () => {
      expect(resolveEmphasisCharacter('circle')).toBe('\u25CF');
    });

    it.each(['Circle', ' circle', 'circle ', 'xcircle', 'sesame circle'])(
      'キーワードに似た値 %j は既定の点',
      (value) => {
        expect(resolveEmphasisCharacter(value)).toBe(DEFAULT_CHAR);
      }
    );

    it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty'])(
      'Object.prototype のキー %j は既定の点',
      (value) => {
        expect(resolveEmphasisCharacter(value)).toBe(DEFAULT_CHAR);
      }
    );
  });

  describe('通る値 (カスタム文字)', () => {
    it.each([
      '\u2605',
      '\u203B',
      '\u3001',
      '\u3002',
      '\u00B1',
      '(',
      '/',
      'A',
      '1',
      '\u5929',
      '\u{1F600}',
      '\u2764',
      '\u{20BB7}',
    ])('%j はそのまま返る', (value) => {
      expect(resolveEmphasisCharacter(value)).toBe(value);
    });
  });

  describe('通らない値 (既定の点)', () => {
    it.each([
      ['空文字', ''],
      ['U+0020', '\u0020'],
      ['U+00A0', '\u00A0'],
      ['U+3000', '\u3000'],
      ['U+0009', '\u0009'],
      ['U+000A', '\u000A'],
      ['U+0000', '\u0000'],
      ['U+001F', '\u001F'],
      ['U+007F', '\u007F'],
      ['U+0080', '\u0080'],
      ['U+0085', '\u0085'],
      ['U+009F', '\u009F'],
      ['<', '<'],
      ['>', '>'],
      ['&', '&'],
      ['"', '"'],
      ["'", "'"],
      ['バックスラッシュ', '\\'],
      [';', ';'],
      ['{', '{'],
      ['}', '}'],
      ['U+0301 結合アキュート', '\u0301'],
      ['U+200B', '\u200B'],
      ['U+200D', '\u200D'],
      ['U+00AD', '\u00AD'],
      ['U+FEFF', '\uFEFF'],
      ['U+202E', '\u202E'],
      ['U+2066', '\u2066'],
      ['U+2069', '\u2069'],
      ['U+2028', '\u2028'],
      ['U+2029', '\u2029'],
      ['U+E000', '\uE000'],
      ['U+F8FF', '\uF8FF'],
      ['U+F0000', '\u{F0000}'],
      ['U+FDD0', '\uFDD0'],
      ['U+FFFE', '\uFFFE'],
      ['U+FFFF', '\uFFFF'],
      ['U+0378', '\u0378'],
      ['孤立した上位サロゲート U+D800', '\uD800'],
      ['孤立した下位サロゲート U+DC00', '\uDC00'],
      ['2 code point の記号', '\u2605\u2605'],
      ['U+2764 と U+FE0F', '\u2764\uFE0F'],
      ['U+FE0F だけ', '\uFE0F'],
    ])('%s', (_name, value) => {
      expect(resolveEmphasisCharacter(value)).toBe(DEFAULT_CHAR);
    });
  });
});

/** 旧実装の正規表現。isEmphasisKeyword が同じ集合を受けることの比較に使う */
const LEGACY_EMPHASIS_KEYWORD =
  /^(?:(?:filled|open) )?(?:dot|circle|double-circle|triangle|sesame)$/;

const KEYWORD_COMPARISON_INPUTS = [
  ...Object.keys(KEYWORD_TABLE),
  '',
  'open',
  'filled',
  'Circle',
  ' circle',
  'circle ',
  'circle\n',
  'dot\n',
  'filled  dot',
  'open-dot',
  '\u2605',
  '<',
  'constructor',
  '__proto__',
  'toString',
  'dotdot',
  'open constructor',
  'filled __proto__',
];

describe('isEmphasisKeyword', () => {
  it('compares 33 inputs against the legacy regex', () => {
    expect(KEYWORD_COMPARISON_INPUTS).toHaveLength(33);
    for (const s of KEYWORD_COMPARISON_INPUTS) {
      expect(isEmphasisKeyword(s), JSON.stringify(s)).toBe(LEGACY_EMPHASIS_KEYWORD.test(s));
    }
  });

  it('resolves keywords through the same table', () => {
    expect(isEmphasisKeyword('filled sesame')).toBe(true);
    expect(resolveEmphasisCharacter('filled sesame')).toBe('\uFE45');
    expect(resolveEmphasisCharacter('open double-circle')).toBe('\u25CE');
  });

  it('treats a custom character as valid but not a keyword', () => {
    expect(isEmphasisKeyword('\u2605')).toBe(false);
    expect(isValidEmphasisStyle('\u2605')).toBe(true);
    expect(resolveEmphasisCharacter('\u2605')).toBe('\u2605');
  });

  it.each(['constructor', 'hasOwnProperty', 'valueOf'])(
    'does not pick up Object.prototype key %j',
    (value) => {
      expect(isEmphasisKeyword(value)).toBe(false);
      expect(resolveEmphasisCharacter(value)).toBe(DEFAULT_CHAR);
    }
  );

  it('falls back to the default dot for null and for an object whose toString gives a keyword', () => {
    expect(resolveEmphasisCharacter(null)).toBe(DEFAULT_CHAR);
    expect(
      resolveEmphasisCharacter({
        toString() {
          return 'dot';
        },
      })
    ).toBe(DEFAULT_CHAR);
  });

  it.each(['<', 'Circle'])('resolves %j to the default dot', (value) => {
    expect(resolveEmphasisCharacter(value)).toBe(DEFAULT_CHAR);
  });

  it('is exported from /rendering but not from the package root', () => {
    expect(typeof rendering.isEmphasisKeyword).toBe('function');
    expect('isEmphasisKeyword' in root).toBe(false);
  });

  it('does not leak the keyword table through either entry point', () => {
    for (const name of ['EMPHASIS_KEYWORD_CHARS', 'EMPHASIS_SHAPE_CHARS']) {
      expect(Object.keys(root)).not.toContain(name);
      expect(Object.keys(rendering)).not.toContain(name);
    }
  });
});
