/**
 * Visual Regression Tests (VRT) using Playwright's toHaveScreenshot().
 *
 * ADR-022 fixed representative cases: threshold-based comparison
 * with automatic baseline management by Playwright Test.
 *
 * Run: pnpm --filter @kanbun/integration-tests test:visual
 * Update baselines: UPDATE_SNAPSHOTS=1 pnpm --filter @kanbun/integration-tests test:visual
 */

import { test, expect } from '@playwright/test';
import { render } from '@kanbun/skam-html-renderer';
import { FIXTURES } from '../../fixtures/test-documents.js';

const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700&display=swap';

const FONT_STACK = `"Noto Serif JP", "Yu Mincho", "Hiragino Mincho ProN", serif`;

function buildPage(html: string, css: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${GOOGLE_FONTS_URL}">
<style>
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  padding: 32px;
  font-size: 32px;
  font-family: ${FONT_STACK};
}
#skam-root {
  width: fit-content;
}
${css}
</style>
</head>
<body>
<div id="skam-root">${html}</div>
</body>
</html>`;
}

test.describe('visual regression', () => {
  for (const [caseId, doc] of Object.entries(FIXTURES)) {
    test(caseId, async ({ page }) => {
      const { html, css } = render(doc);
      const pageContent = buildPage(html, css);

      await page.setContent(pageContent, { waitUntil: 'networkidle' });
      await page.evaluate('document.fonts.ready');

      const root = page.locator('#skam-root');
      await expect(root).toHaveScreenshot(`${caseId}.png`, {
        maxDiffPixelRatio: 0.01,
      });
    });
  }
});
