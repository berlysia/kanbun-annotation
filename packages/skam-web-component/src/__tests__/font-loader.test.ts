import { describe, it, expect, afterEach } from 'vitest';
import { injectGoogleFontsLink, buildFontStyle } from '../font-loader.js';

const LINK_SELECTOR = 'link[href*="fonts.googleapis.com"][href*="Noto+Serif+JP"]';

describe('injectGoogleFontsLink', () => {
  afterEach(() => {
    document.querySelectorAll(LINK_SELECTOR).forEach((el) => el.remove());
  });

  it('injects a <link> element into document.head', () => {
    injectGoogleFontsLink();
    const link = document.querySelector(LINK_SELECTOR);
    expect(link).not.toBeNull();
    expect(link!.getAttribute('rel')).toBe('stylesheet');
  });

  it('is idempotent - does not inject duplicate links', () => {
    injectGoogleFontsLink();
    injectGoogleFontsLink();
    const links = document.querySelectorAll(LINK_SELECTOR);
    expect(links.length).toBe(1);
  });

  it('does not inject if a matching link already exists', () => {
    const existing = document.createElement('link');
    existing.rel = 'stylesheet';
    existing.href =
      'https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700&display=swap';
    document.head.appendChild(existing);

    injectGoogleFontsLink();
    const links = document.querySelectorAll(LINK_SELECTOR);
    expect(links.length).toBe(1);
  });
});

describe('buildFontStyle', () => {
  it('generates CSS with default prefix', () => {
    const css = buildFontStyle('skam');
    expect(css).toContain('--skam-font-family');
    expect(css).toContain('--skam-font-family-ruby');
    expect(css).toContain('"Noto Serif JP", serif');
    expect(css).toContain(':host');
  });

  it('generates CSS with custom prefix', () => {
    const css = buildFontStyle('kb');
    expect(css).toContain('--kb-font-family');
    expect(css).toContain('--kb-font-family-ruby');
  });
});
