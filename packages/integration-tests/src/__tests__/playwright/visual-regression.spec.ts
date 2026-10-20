/**
 * Visual Regression Tests (VRT) using Playwright's toHaveScreenshot().
 *
 * ADR-022 fixed representative cases: threshold-based comparison
 * with automatic baseline management by Playwright Test.
 *
 * Run: pnpm --filter @kanbun-skam/integration-tests test:visual
 * Update baselines: UPDATE_SNAPSHOTS=1 pnpm --filter @kanbun-skam/integration-tests test:visual
 * In the Playwright Docker image (fixed environment): pnpm test:visual:docker [playwright args]
 * (UPDATE_SNAPSHOTS=1 pnpm test:visual:docker updates baselines; see scripts/vrt-docker.ts)
 */

// page.evaluate の中の関数はブラウザで動くので DOM の型を使う (tsconfig の lib には DOM が無い)
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import { test, expect, type Page } from '@playwright/test';
import { render } from '@kanbun-skam/skam-html-renderer';
import { buildHTMLPage } from '@kanbun-skam/skam-screenshot';
import {
  FIXTURES,
  FIXTURE_HIGHLIGHT_SPACING,
  FIXTURE_REF_SOURCE_ORDER,
} from '../../fixtures/test-documents.js';

/**
 * 傍線がアキ (letter-spacing) の部分で途切れないことを画素で確かめる。
 * 画像の許容差 (1%) では 1px の線の欠けを検出できないので、solid の傍線の画素を直接読む。
 *
 * 線の位置は CSS から決める (styles.ts の傍線の節):
 * - 縦書き: highlight-content の background-image が右端 (幅 1px)。傍点つきは
 *   .highlight::after の border-right (right は computed style から読む)
 * - 横書き: highlight-content の box-shadow inset が下端 (高さ 1px)
 * 線の方向の範囲は、highlight 内の最初の字の矩形の始まりから最後の字の矩形の終わりまで。
 */
interface LineScanResult {
  id: string;
  scannedPx: number;
  longestGapPx: number;
  linePixelRatio: number;
}

/**
 * 線の色でない画素がこれより長く続いたら、傍線が途切れているとみなす (CSS px)。
 * 実測 (Playwright Docker image、deviceScaleFactor 2、spacing: 'half' = 16px) は
 * 縦書き・横書きの 3 本とも 0 px (線の画素の割合 1.0)。2 px は 1 px の線のにじみと
 * 丸めの余裕で、アキ 1 つ分 (16 px) の欠けは 8 分の 1 の値で落ちる。
 * 検出力は、線を 16 px だけ欠けさせて確かめた (longestGapPx = 16 で落ちる)。
 */
const MAX_LINE_GAP_CSS_PX = 2;

async function scanSolidHighlightLines(
  page: Page,
  png: Buffer,
  orientation: 'vertical' | 'horizontal'
): Promise<LineScanResult[]> {
  return page.evaluate(
    async ({ base64, vertical }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${base64}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('2d context is unavailable');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

      const dpr = window.devicePixelRatio;
      const root = document.querySelector('#skam-root');
      if (!root) throw new Error('#skam-root not found');
      const rootRect = root.getBoundingClientRect();
      if (Math.abs(img.naturalWidth - rootRect.width * dpr) > 2) {
        throw new Error(`screenshot width ${img.naturalWidth} != root ${rootRect.width} * ${dpr}`);
      }

      const luminance = (x: number, y: number): number => {
        if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return 255;
        const i = (y * canvas.width + x) * 4;
        return 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
      };

      const results: LineScanResult[] = [];
      const highlights = document.querySelectorAll<HTMLElement>(
        '.skam-highlight[data-style="solid"]'
      );
      for (const hl of highlights) {
        const content = hl.querySelector<HTMLElement>('.skam-highlight-content');
        if (!content) throw new Error('highlight-content not found');
        const contentRects = [...content.getClientRects()];
        const tokenRects = [...hl.querySelectorAll('.skam-token')].map((t) =>
          t.getBoundingClientRect()
        );

        // 線の CSS 座標 (線の太さ方向): [lineEdge - 1, lineEdge]
        let lineEdge: number;
        if (vertical) {
          if (hl.hasAttribute('data-has-emphasis')) {
            const offset = Number.parseFloat(getComputedStyle(hl, '::after').right);
            lineEdge = hl.getBoundingClientRect().right - offset;
          } else {
            lineEdge = Math.max(...contentRects.map((r) => r.right));
          }
        } else {
          lineEdge = Math.max(...contentRects.map((r) => r.bottom));
        }

        // 線の方向の範囲: 最初の字の矩形の始まりから最後の字の矩形の終わりまで
        const from = Math.min(...tokenRects.map((r) => (vertical ? r.top : r.left)));
        const to = Math.max(...tokenRects.map((r) => (vertical ? r.bottom : r.right)));

        // 線の色と背景は輝度の中間で分ける。サブピクセル位置でにじんでも、
        // 線の太さ方向に ±1 device px の帯の最小輝度で見れば線とみなせる。
        const ink = getComputedStyle(content)
          .color.match(/\d+(\.\d+)?/g)
          ?.map(Number) ?? [0, 0, 0];
        const inkLum = 0.299 * ink[0]! + 0.587 * ink[1]! + 0.114 * ink[2]!;
        const threshold = (255 + inkLum) / 2;

        const crossOrigin = vertical ? rootRect.left : rootRect.top;
        const alongOrigin = vertical ? rootRect.top : rootRect.left;
        const crossLo = Math.floor((lineEdge - 1 - crossOrigin) * dpr) - 1;
        const crossHi = Math.ceil((lineEdge - crossOrigin) * dpr);
        const alongLo = Math.floor((from - alongOrigin) * dpr);
        const alongHi = Math.ceil((to - alongOrigin) * dpr);

        let longestGap = 0;
        let currentGap = 0;
        let linePixels = 0;
        for (let along = alongLo; along < alongHi; along++) {
          let minLum = 255;
          for (let cross = crossLo; cross <= crossHi; cross++) {
            const lum = vertical ? luminance(cross, along) : luminance(along, cross);
            if (lum < minLum) minLum = lum;
          }
          if (minLum < threshold) {
            linePixels++;
            currentGap = 0;
          } else {
            currentGap++;
            if (currentGap > longestGap) longestGap = currentGap;
          }
        }
        results.push({
          id: hl.textContent ?? '',
          scannedPx: (alongHi - alongLo) / dpr,
          longestGapPx: longestGap / dpr,
          linePixelRatio: linePixels / (alongHi - alongLo),
        });
      }
      return results;
    },
    { base64: png.toString('base64'), vertical: orientation === 'vertical' }
  );
}

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

  // ADR-008 検証 4: highlight の傍線がアキ (letter-spacing) の部分で途切れないこと。
  // solid の 3 つは画素で走査する。dotted / dashed / wavy / double は周期の隙間がある線なので
  // 走査せず、基準画像を目で見る。
  for (const orientation of ['vertical', 'horizontal'] as const) {
    test(`highlight-spacing-${orientation}`, async ({ page }) => {
      const { html, css } = render(FIXTURE_HIGHLIGHT_SPACING, {
        spacing: 'half',
        writingMode: orientation,
      });
      await page.setContent(buildHTMLPage(html, css), { waitUntil: 'networkidle' });
      await page.evaluate('document.fonts.ready');

      const root = page.locator('#skam-root');
      const png = await root.screenshot();
      const results = await scanSolidHighlightLines(page, png, orientation);

      expect(results).toHaveLength(3);
      for (const result of results) {
        console.log(`[highlight-spacing-${orientation}] ${JSON.stringify(result)}`);
        expect(result.longestGapPx, `line gap in "${result.id}"`).toBeLessThanOrEqual(
          MAX_LINE_GAP_CSS_PX
        );
      }

      await expect(root).toHaveScreenshot(`highlight-spacing-${orientation}.png`, {
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
