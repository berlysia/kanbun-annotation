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
import { FIXTURES, FIXTURE_REF_SOURCE_ORDER } from '../../fixtures/test-documents.js';

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

  // 画像の許容差 (1%) はラベル程度の差を見逃しうるので、ref の番号の順は DOM で確かめる。
  // 注釈欄の行は marks[] の順に並ぶため、DOM の順でなく本文の文字で行を引く。
  test('ref-source-order labels follow source order', async ({ page }) => {
    const { html, css } = render(FIXTURE_REF_SOURCE_ORDER);
    await page.setContent(buildHTMLPage(html, css), { waitUntil: 'networkidle' });

    await expect(page.locator('.skam-display .skam-ref')).toHaveText(['(1)', '(2)', '(3)']);

    const expected = [
      ['注A', '(1)'],
      ['注B', '(2)'],
      ['注C', '(3)'],
    ] as const;
    for (const [content, label] of expected) {
      const item = page.locator('.skam-note-item').filter({ hasText: content });
      await expect(item.locator('.skam-note-marker')).toHaveText(label);
    }
  });
});
