/**
 * Issue #4: with `spacing: 'full'`, the characters inside a multi-token range
 * (e.g. the 啼鳥 range of 春曉) must be spaced like the characters outside it.
 *
 * Measures the pitch (distance between the start positions of neighbouring characters)
 * in the block direction (vertical writing, so y) in a real browser.
 *
 * Run: pnpm --filter @kanbun-skam/integration-tests test:visual -- range-spacing
 */

import { test, expect } from '@playwright/test';
import type { SKAMDocument } from '@kanbun-skam/skam';
import { render } from '@kanbun-skam/skam-html-renderer';
import { buildHTMLPage } from '@kanbun-skam/skam-screenshot';

// 處處 (2 single-character tokens) followed by the 啼鳥 range (1 yomigana over 2 tokens)
const doc: SKAMDocument = {
  format: 'skam@0.1',
  tokens: [
    { id: 't1', text: '處' },
    { id: 't2', text: '處' },
    { id: 't3', text: '啼' },
    { id: 't4', text: '鳥' },
  ],
  blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4'] }],
  marks: [{ type: 'yomigana', anchor: { from: 't3', to: 't4' }, value: 'ていてう' }],
  readings: [],
};

test('characters inside a multi-token range keep the same pitch as outside it', async ({
  page,
}) => {
  const { html, css } = render(doc, { spacing: 'full' });
  await page.setContent(buildHTMLPage(html, css), { waitUntil: 'networkidle' });
  await page.evaluate('document.fonts.ready');

  const measured = await page.evaluate(() => {
    const top = (el: Element) => el.getBoundingClientRect().top;
    const outside = Array.from(document.querySelectorAll('.skam-block > .skam-token > .skam-base'));
    const inside = Array.from(document.querySelectorAll('.skam-base-seg'));
    const block = document.querySelector('.skam-block');
    return {
      outsideCount: outside.length,
      insideCount: inside.length,
      outsidePitch: top(outside[1]!) - top(outside[0]!),
      insidePitch: top(inside[1]!) - top(inside[0]!),
      fontSize: parseFloat(getComputedStyle(block!).fontSize),
    };
  });

  expect(measured.outsideCount).toBe(2);
  expect(measured.insideCount).toBe(2);
  // full spacing is 1em of space plus 1em of advance, so the designed pitch is 2em.
  // 1.8em leaves 10% for font advance variation.
  expect(measured.insidePitch).toBeGreaterThanOrEqual(measured.fontSize * 1.8);
  expect(measured.insidePitch / measured.outsidePitch).toBeGreaterThanOrEqual(0.9);
  expect(measured.insidePitch / measured.outsidePitch).toBeLessThanOrEqual(1.1);
});
