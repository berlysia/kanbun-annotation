/**
 * Visual Regression Tests (VRT) using Playwright's toHaveScreenshot().
 *
 * ADR-022 fixed representative cases: threshold-based comparison
 * with automatic baseline management by Playwright Test.
 *
 * Run: pnpm --filter @kanbun-skam/integration-tests test:visual
 * Update baselines: UPDATE_SNAPSHOTS=1 pnpm --filter @kanbun-skam/integration-tests test:visual
 */

import { test, expect } from '@playwright/test';
import { render } from '@kanbun-skam/skam-html-renderer';
import { buildHTMLPage } from '@kanbun-skam/skam-screenshot';
import { FIXTURES } from '../../fixtures/test-documents.js';

test.describe('visual regression', () => {
  for (const [caseId, doc] of Object.entries(FIXTURES)) {
    test(caseId, async ({ page }) => {
      const { html, css } = render(doc);
      const pageContent = buildHTMLPage(html, css);

      await page.setContent(pageContent, { waitUntil: 'networkidle' });
      await page.evaluate('document.fonts.ready');

      const root = page.locator('#skam-root');
      await expect(root).toHaveScreenshot(`${caseId}.png`, {
        maxDiffPixelRatio: 0.01,
      });
    });
  }
});
