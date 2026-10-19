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

  const outside = page.locator('.skam-block > .skam-token > .skam-base');
  const inside = page.locator('.skam-base-seg');
  expect(await outside.count()).toBe(2);
  expect(await inside.count()).toBe(2);

  // vertical writing: the block direction is y
  const top = async (locator: ReturnType<typeof page.locator>) => {
    const box = await locator.boundingBox();
    return box!.y;
  };
  const outsidePitch = (await top(outside.nth(1))) - (await top(outside.nth(0)));
  const insidePitch = (await top(inside.nth(1))) - (await top(inside.nth(0)));
  const fontSize = await page.evaluate<number>(
    "parseFloat(getComputedStyle(document.querySelector('.skam-block')).fontSize)"
  );

  // full spacing is 1em of space plus 1em of advance, so the designed pitch is 2em.
  // 1.8em leaves 10% for font advance variation.
  expect(insidePitch).toBeGreaterThanOrEqual(fontSize * 1.8);
  expect(insidePitch / outsidePitch).toBeGreaterThanOrEqual(0.9);
  expect(insidePitch / outsidePitch).toBeLessThanOrEqual(1.1);
});
