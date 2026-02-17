import { describe, it, expect, afterEach } from 'vitest';
import { injectGoogleFontsLink, buildFontStyle } from '../font-loader.js';
import { expectStyleDeclaration } from './helpers/style-contract.js';

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
    expectStyleDeclaration(css, ':host', '--skam-font-family', '"Noto Serif JP", serif');
    expectStyleDeclaration(css, ':host', '--skam-font-family-ruby', '"Noto Serif JP", serif');
  });

  it('generates CSS with custom prefix', () => {
    const css = buildFontStyle('kb');
    expectStyleDeclaration(css, ':host', '--kb-font-family', '"Noto Serif JP", serif');
    expectStyleDeclaration(css, ':host', '--kb-font-family-ruby', '"Noto Serif JP", serif');
  });
});
