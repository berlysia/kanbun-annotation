import { describe, it, expect } from 'vitest';
import { generateCompareHTML } from '../compare-html.js';
import type { Browser } from '../types.js';

// PNG magic bytes followed by minimal data
const PNG_BUFFER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// JPEG magic bytes (SOI marker)
const JPEG_BUFFER = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

function makeMap(entries: [Browser, Buffer][]): Map<Browser, Buffer> {
  return new Map(entries);
}

describe('generateCompareHTML', () => {
  it('should produce valid HTML with browser cards', () => {
    const screenshots = makeMap([
      ['chromium', PNG_BUFFER],
      ['firefox', PNG_BUFFER],
    ]);

    const html = generateCompareHTML(screenshots);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('chromium');
    expect(html).toContain('firefox');
  });

  it('should embed PNG as data:image/png', () => {
    const screenshots = makeMap([['chromium', PNG_BUFFER]]);

    const html = generateCompareHTML(screenshots);

    expect(html).toContain('data:image/png;base64,');
  });

  it('should embed JPEG as data:image/jpeg', () => {
    const screenshots = makeMap([['firefox', JPEG_BUFFER]]);

    const html = generateCompareHTML(screenshots);

    expect(html).toContain('data:image/jpeg;base64,');
  });

  it('should use default title when not specified', () => {
    const screenshots = makeMap([['chromium', PNG_BUFFER]]);

    const html = generateCompareHTML(screenshots);

    expect(html).toContain('SKAM Screenshot Comparison');
  });

  it('should use custom title when specified', () => {
    const screenshots = makeMap([['chromium', PNG_BUFFER]]);

    const html = generateCompareHTML(screenshots, { title: 'Custom Title' });

    expect(html).toContain('Custom Title');
  });

  it('should escape HTML in title to prevent XSS', () => {
    const screenshots = makeMap([['chromium', PNG_BUFFER]]);

    const html = generateCompareHTML(screenshots, {
      title: '<script>alert("xss")</script>',
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('should include timestamp metadata', () => {
    const screenshots = makeMap([['chromium', PNG_BUFFER]]);

    const html = generateCompareHTML(screenshots);

    expect(html).toContain('Generated:');
    // ISO timestamp pattern
    expect(html).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('should include base64 encoded data', () => {
    const screenshots = makeMap([['chromium', PNG_BUFFER]]);

    const html = generateCompareHTML(screenshots);
    const expected = PNG_BUFFER.toString('base64');

    expect(html).toContain(expected);
  });
});
