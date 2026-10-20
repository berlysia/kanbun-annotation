/**
 * The reading layer (.skam-reading) must stay visually hidden even when the page's own CSS
 * styles `.skam-reading` (position, size, min-size, overflow, clip-path, ...).
 *
 * Measures the bounding rect and computed style in a real browser (no screenshots).
 *
 * Run: pnpm --filter @kanbun-skam/integration-tests test:visual -- reading-layer-hiding
 */

import { test, expect, type Page } from '@playwright/test';
import type { SKAMDocument } from '@kanbun-skam/skam';
import { generateCSS, render } from '@kanbun-skam/skam-html-renderer';

const doc: SKAMDocument = {
  format: 'skam@0.1',
  tokens: [
    { id: 't1', text: '學而時習之' },
    { id: 't2', text: '不亦說乎' },
  ],
  blocks: [
    { id: 'b1', tokenIds: ['t1'] },
    { id: 'b2', tokenIds: ['t2'] },
  ],
  marks: [],
  readings: [],
};

const overrideDeclarations = [
  'position: static',
  'width: auto',
  'height: auto',
  'min-width: 10em',
  'min-height: 10em',
  'margin: 0',
  'overflow: visible',
  'clip-path: none',
  'white-space: normal',
];
const override = (important: boolean) =>
  `.skam-reading { ${overrideDeclarations.map((d) => `${d}${important ? ' !important' : ''};`).join(' ')} }`;

const load = async (page: Page, styles: string[], options: Parameters<typeof render>[1] = {}) => {
  const { html } = render(doc, options);
  await page.setContent(
    `<!DOCTYPE html><html><head><meta charset="UTF-8">${styles
      .map((s) => `<style>${s}</style>`)
      .join('')}</head><body><div id="skam-root">${html}</div></body></html>`
  );
};

const expectHidden = async (page: Page) => {
  expect(await page.locator('.skam-reading').count()).toBe(1);
  const measured = await page.evaluate<{
    width: number;
    height: number;
    position: string;
    overflow: string;
    clipPath: string;
  }>(`(() => {
    const el = document.querySelector('.skam-reading');
    const rect = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      width: rect.width,
      height: rect.height,
      position: s.position,
      overflow: s.overflow,
      clipPath: s.clipPath,
    };
  })()`);
  expect(measured.width).toBeLessThanOrEqual(1);
  expect(measured.height).toBeLessThanOrEqual(1);
  const style = measured;
  expect(style.position).toBe('absolute');
  expect(style.overflow).toBe('hidden');
  expect(style.clipPath).not.toBe('none');
};

test('stays hidden when the page overrides .skam-reading outside the layer', async ({ page }) => {
  await load(page, [generateCSS(), override(false)]);
  await expectHidden(page);
});

test('stays hidden when the page overrides .skam-reading with !important outside the layer', async ({
  page,
}) => {
  await load(page, [generateCSS(), override(true)]);
  await expectHidden(page);
});

test('useLayer: false stays hidden when the page override comes before the generated CSS', async ({
  page,
}) => {
  await load(page, [override(false), generateCSS({ useLayer: false })]);
  await expectHidden(page);
});

test('useLayer: false stays hidden when the page override comes after the generated CSS', async ({
  page,
}) => {
  await load(page, [generateCSS({ useLayer: false }), override(false)]);
  await expectHidden(page);
});

// The accessibility tree is what assistive technology receives. It must hold only the reading
// layer (the display layer is aria-hidden), keep the half-width space between blocks under
// white-space: nowrap, and stay the same when the page CSS overrides .skam-reading.
// It does not show how a screen reader speaks the text; that needs a real device.
const accessibleTree = (page: Page) => page.locator('#skam-root').ariaSnapshot();

test('exposes only the reading layer, with blocks separated, to the accessibility tree', async ({
  page,
}) => {
  await load(page, [generateCSS()]);
  expect(await accessibleTree(page)).toBe('- text: 學而時習之 不亦說乎');
});

test('keeps the same accessibility tree when the page overrides .skam-reading', async ({
  page,
}) => {
  await load(page, [generateCSS(), override(true)]);
  expect(await accessibleTree(page)).toBe('- text: 學而時習之 不亦說乎');
});

test("separates blocks the same way in the accessibility tree for 'display'", async ({ page }) => {
  // 'display' ends each unit with 。; the separator between blocks is the same half-width space
  await load(page, [generateCSS()], { readingLayerSource: 'display' });
  expect(await accessibleTree(page)).toBe('- text: 學而時習之。 不亦說乎。');
});
