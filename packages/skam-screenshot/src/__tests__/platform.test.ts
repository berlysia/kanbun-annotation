import { describe, it, expect } from 'vitest';
import {
  getDefaultBrowsers,
  parseBrowserList,
  VALID_BROWSERS,
} from '../platform.js';

describe('VALID_BROWSERS', () => {
  it('should contain chromium, firefox, and webkit', () => {
    expect(VALID_BROWSERS).toEqual(['chromium', 'firefox', 'webkit']);
  });
});

describe('getDefaultBrowsers', () => {
  it('should return an array of valid browsers', () => {
    const browsers = getDefaultBrowsers();
    expect(browsers.length).toBeGreaterThan(0);
    for (const b of browsers) {
      expect(VALID_BROWSERS).toContain(b);
    }
  });

  it('should always include chromium', () => {
    const browsers = getDefaultBrowsers();
    expect(browsers).toContain('chromium');
  });
});

describe('parseBrowserList', () => {
  it('should parse a single browser', () => {
    expect(parseBrowserList('chromium')).toEqual(['chromium']);
  });

  it('should parse comma-separated browsers', () => {
    expect(parseBrowserList('chromium,firefox')).toEqual([
      'chromium',
      'firefox',
    ]);
  });

  it('should trim whitespace around browser names', () => {
    expect(parseBrowserList(' chromium , firefox , webkit ')).toEqual([
      'chromium',
      'firefox',
      'webkit',
    ]);
  });

  it('should ignore empty segments', () => {
    expect(parseBrowserList('chromium,,firefox')).toEqual([
      'chromium',
      'firefox',
    ]);
  });

  it('should throw on empty input', () => {
    expect(() => parseBrowserList('')).toThrow('Browser list cannot be empty');
  });

  it('should throw on invalid browser name', () => {
    expect(() => parseBrowserList('chromium,ie')).toThrow(
      'Invalid browser(s): ie',
    );
  });

  it('should list all invalid browsers in error message', () => {
    expect(() => parseBrowserList('ie,edge')).toThrow(
      'Invalid browser(s): ie, edge',
    );
  });
});
