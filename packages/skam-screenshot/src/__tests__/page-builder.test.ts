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

  it('should include CSS reset with larger font size', () => {
    const result = buildHTMLPage('', '');

    expect(result).toContain('box-sizing: border-box');
    expect(result).toContain('font-size: 32px');
  });

  it('should embed css inside a style tag', () => {
    const css = '.kanbun { writing-mode: vertical-rl; }';
    const result = buildHTMLPage('', css);

    expect(result).toMatch(/<style>[\s\S]*\.kanbun[\s\S]*<\/style>/);
  });

  it('should wrap html in #skam-root inside body', () => {
    const html = '<div class="skam-document">content</div>';
    const result = buildHTMLPage(html, '');

    expect(result).toContain('<div id="skam-root"><div class="skam-document">content</div></div>');
  });

  it('should set width: fit-content on #skam-root', () => {
    const result = buildHTMLPage('', '');

    expect(result).toContain('width: fit-content');
  });
});
