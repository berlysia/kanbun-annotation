import { describe, it, expect } from 'vitest';
import { buildHTMLPage } from '../page-builder.js';

describe('buildHTMLPage', () => {
  it('should produce a valid HTML document', () => {
    const result = buildHTMLPage('<div>hello</div>', '.test { color: red; }');

    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('<meta charset="UTF-8">');
    expect(result).toContain('<div>hello</div>');
    expect(result).toContain('.test { color: red; }');
  });

  it('should include CSS reset', () => {
    const result = buildHTMLPage('', '');

    expect(result).toContain('box-sizing: border-box');
    expect(result).toContain('body { margin: 0; padding: 16px; }');
  });

  it('should embed css inside a style tag', () => {
    const css = '.kanbun { writing-mode: vertical-rl; }';
    const result = buildHTMLPage('', css);

    expect(result).toMatch(/<style>[\s\S]*\.kanbun[\s\S]*<\/style>/);
  });

  it('should place html inside body', () => {
    const html = '<div class="skam-document">content</div>';
    const result = buildHTMLPage(html, '');

    expect(result).toMatch(/<body>\s*<div class="skam-document">content<\/div>/);
  });
});
