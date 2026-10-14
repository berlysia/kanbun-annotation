import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../html-escape.js';

describe('playground escapeHtml', () => {
  it('escapes all HTML-significant characters', () => {
    expect(escapeHtml(`<img src=x onerror="a">&'`)).toBe(
      '&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#x27;'
    );
  });
});
