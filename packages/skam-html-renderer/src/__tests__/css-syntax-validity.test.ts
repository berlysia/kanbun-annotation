/**
 * CSS Syntax Validity Tests
 *
 * getDefaultStyles / generateCSS が生成する CSS に構文エラーがないことを検証する。
 * stylelint API を使い、CssSyntaxError の有無をチェックする。
 */
import { describe, it, expect } from 'vitest';
import stylelint from 'stylelint';
import { getDefaultStyles, generateCSS } from '../index.js';

/**
 * CSS 文字列を stylelint でパースし、CssSyntaxError があれば失敗させる。
 */
async function assertValidCSS(css: string, label: string): Promise<void> {
  const result = await stylelint.lint({
    code: css,
    config: { rules: {} },
  });

  const syntaxErrors = result.results[0]?.warnings.filter((w) => w.rule === 'CssSyntaxError');

  if (syntaxErrors && syntaxErrors.length > 0) {
    const details = syntaxErrors.map((e) => `  line ${e.line}:${e.column} - ${e.text}`).join('\n');
    expect.fail(`CSS syntax errors in "${label}":\n${details}`);
  }
}

describe('CSS syntax validity', () => {
  describe('getDefaultStyles', () => {
    const variants = [
      {
        label: 'vertical-ruby',
        options: { writingMode: 'vertical' as const, rubyMethod: 'ruby' as const },
      },
      {
        label: 'vertical-grid',
        options: { writingMode: 'vertical' as const, rubyMethod: 'grid' as const },
      },
      {
        label: 'horizontal-ruby',
        options: { writingMode: 'horizontal' as const, rubyMethod: 'ruby' as const },
      },
      {
        label: 'horizontal-grid',
        options: { writingMode: 'horizontal' as const, rubyMethod: 'grid' as const },
      },
      {
        label: 'both-both',
        options: { writingMode: 'both' as const, rubyMethod: 'both' as const, inline: true },
      },
      { label: 'no-layer', options: { writingMode: 'vertical' as const, useLayer: false } },
      {
        label: 'both-ruby',
        options: { writingMode: 'both' as const, rubyMethod: 'ruby' as const },
      },
      {
        label: 'both-grid',
        options: { writingMode: 'both' as const, rubyMethod: 'grid' as const },
      },
    ];

    for (const { label, options } of variants) {
      it(`should produce valid CSS for variant: ${label}`, async () => {
        const css = getDefaultStyles(options);
        await assertValidCSS(css, label);
      });
    }
  });

  describe('generateCSS', () => {
    const variants = [
      { label: 'default', options: {} },
      { label: 'vertical', options: { writingMode: 'vertical' as const } },
      { label: 'horizontal', options: { writingMode: 'horizontal' as const } },
      { label: 'both', options: { writingMode: 'both' as const } },
      { label: 'custom-prefix', options: { classPrefix: 'kb' } },
      { label: 'inline', options: { inline: true } },
      { label: 'both-inline', options: { writingMode: 'both' as const, inline: true } },
    ];

    for (const { label, options } of variants) {
      it(`should produce valid CSS for variant: ${label}`, async () => {
        const css = generateCSS(options);
        await assertValidCSS(css, label);
      });
    }
  });
});
