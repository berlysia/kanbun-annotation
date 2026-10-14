import { describe, it, expect } from 'vitest';
import {
  render,
  renderHTML,
  generateCSS,
  getDefaultStyles,
  calibrateGridBaseline,
  validateRenderOptions,
  validateCSSOptions,
  type RenderOptions,
  type CSSOptions,
} from '../index.js';
import type { SKAMDocument } from '@kanbun-skam/skam';
const doc: SKAMDocument = {
  format: 'skam@0.1',
  tokens: [{ id: 't1', text: '甲' }],
  blocks: [{ id: 'b1', tokenIds: ['t1'] }],
  marks: [],
  readings: [],
};

const badRender: [RenderOptions, RegExp][] = [
  [{ classPrefix: 'a"><script>' }, /classPrefix/],
  [
    { copyable: ['ruby', 'x" onx="y'] as unknown as NonNullable<RenderOptions['copyable']> },
    /copyable/,
  ],
  [{ writingMode: 'both' as unknown as NonNullable<RenderOptions['writingMode']> }, /writingMode/],
  [{ rubyMethod: 'both' as unknown as NonNullable<RenderOptions['rubyMethod']> }, /rubyMethod/],
  [{ displayLang: 'ja"><x' }, /displayLang/],
  // render は CSS も生成するので、CSS 用のオプションも validateRenderOptions が検査する
  [{ layerName: 'a{}' }, /layerName/],
  [{ variablePrefix: 'x;}' }, /variablePrefix/],
  [{ spacing: Number.NaN }, /spacing/],
  [{ spacing: Number.POSITIVE_INFINITY }, /spacing/],
  [{ spacing: 'x;}' as unknown as NonNullable<RenderOptions['spacing']> }, /spacing/],
  // 文字列でない値: 検査した後に toString が別の値を返す (検査時と使用時のずれ) のを防ぐため、型で拒否する
  [{ classPrefix: { toString: () => 'ok' } as unknown as string }, /classPrefix/],
];
const badCSS: [CSSOptions, RegExp][] = [
  [{ classPrefix: 'a{' }, /classPrefix/],
  [{ variablePrefix: 'x;}' }, /variablePrefix/],
  [{ layerName: 'a{}' }, /layerName/],
  [{ spacing: Number.NaN }, /spacing/],
  [{ spacing: 'x;}' as unknown as NonNullable<CSSOptions['spacing']> }, /spacing/],
  [{ writingMode: 'diagonal' as unknown as NonNullable<CSSOptions['writingMode']> }, /writingMode/],
  [{ layerName: ['a{}'] as unknown as string }, /layerName/],
];

describe('option validation (K4)', () => {
  it.each(badRender)('render/renderHTML reject %o', (opts, re) => {
    expect(() => validateRenderOptions(opts)).toThrow(re);
    expect(() => render(doc, opts)).toThrow(TypeError);
    expect(() => renderHTML(doc, opts)).toThrow(TypeError);
  });
  it.each(badCSS)('generateCSS/getDefaultStyles reject %o', (opts, re) => {
    expect(() => validateCSSOptions(opts)).toThrow(re);
    expect(() => generateCSS(opts)).toThrow(TypeError);
    expect(() => getDefaultStyles(opts)).toThrow(TypeError);
  });
  it('accepts CSS-only "both" in generateCSS', () => {
    expect(() => generateCSS({ writingMode: 'both', rubyMethod: 'both' })).not.toThrow();
  });
  it('accepts valid render options', () => {
    expect(() =>
      validateRenderOptions({
        classPrefix: 'my_x-1',
        copyable: ['ruby', 'kaeriten'],
        writingMode: 'horizontal',
        displayLang: 'zh-Hant',
        rubyMethod: 'ruby',
      })
    ).not.toThrow();
    expect(() => validateRenderOptions({ copyable: 'all', displayLang: 'lzh' })).not.toThrow();
    expect(() =>
      validateRenderOptions({ layerName: 'skam.base', variablePrefix: 'my_x', spacing: 'half' })
    ).not.toThrow();
    expect(() => validateRenderOptions({ spacing: 0.25 })).not.toThrow();
    expect(() =>
      validateRenderOptions({ writingMode: 'vertical', rubyMethod: 'grid' })
    ).not.toThrow();
    expect(() => validateRenderOptions({})).not.toThrow();
    // undefined は「指定なし」として扱う (web-component が未設定の属性を undefined で渡しうる)
    expect(() =>
      validateRenderOptions({
        classPrefix: undefined,
        spacing: undefined,
      } as unknown as RenderOptions)
    ).not.toThrow();
  });
  it.each([
    ...badRender.map(([o]) => [o, validateRenderOptions] as const),
    ...badCSS.map(([o]) => [o, validateCSSOptions] as const),
  ] as unknown as [Record<string, unknown>, (o: never) => void][])(
    'does not echo the rejected value in the error message: %o',
    (opts, validate) => {
      let message = '';
      try {
        validate(opts as never);
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).not.toBe('');
      for (const v of Object.values(opts).flat()) {
        if (typeof v === 'string' && v.length > 0) expect(message).not.toContain(v);
      }
    }
  );
  it('calibrateGridBaseline rejects a hostile or non-string variablePrefix', () => {
    expect(() =>
      calibrateGridBaseline(document.createElement('div'), { variablePrefix: 'x;}' })
    ).toThrow(TypeError);
    expect(() =>
      calibrateGridBaseline(document.createElement('div'), {
        variablePrefix: ['x'] as unknown as string,
      })
    ).toThrow(TypeError);
  });
});
