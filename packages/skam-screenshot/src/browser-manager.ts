import type { Browser, ImageFormat, Viewport } from './types.js';
import { PADDING } from './page-builder.js';

export interface CaptureTask {
  browser: Browser;
  html: string;
  viewport: Viewport;
  fullPage: boolean;
  format: ImageFormat;
  scale: number;
}

export interface CaptureSuccess {
  browser: Browser;
  screenshot: Buffer;
}

export interface CaptureFailure {
  browser: Browser;
  error: Error;
}

export type CaptureResult = CaptureSuccess | CaptureFailure;

export function isSuccess(result: CaptureResult): result is CaptureSuccess {
  return 'screenshot' in result;
}

export function isFailure(result: CaptureResult): result is CaptureFailure {
  return 'error' in result;
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    throw new Error(
      'Playwright is not installed. Run: pnpm add -D playwright && npx playwright install',
    );
  }
}

async function captureOne(
  pw: typeof import('playwright'),
  task: CaptureTask,
): Promise<CaptureResult> {
  let browser;
  try {
    browser = await pw[task.browser].launch();
    const context = await browser.newContext({
      deviceScaleFactor: task.scale,
    });
    const page = await context.newPage();
    await page.setViewportSize(task.viewport);
    await page.setContent(task.html, { waitUntil: 'networkidle' });

    // Wait for web fonts (e.g. Google Fonts Noto Serif JP) to finish loading
    await page.evaluate(() => document.fonts.ready);

    // Run calibrateGridBaseline to detect Chromium's inline-grid baseline bug.
    // Sets --skam-grid-baseline-fix: 1 on #skam-root if the bug is detected,
    // which triggers CSS compensation in the generated stylesheet.
    // See: packages/skam-html-renderer/src/calibrate.ts
    await page.evaluate(() => {
      const vp = 'skam';
      const fontSize = 100;
      const rowSize = 50;

      function measureLineBoxWidth(verticalAlign: string): number {
        const outer = document.createElement('div');
        outer.style.cssText =
          'position:absolute;left:-9999px;top:-9999px;' +
          `writing-mode:vertical-rl;font-size:${fontSize}px;line-height:1;`;
        const wrapper = document.createElement('span');
        wrapper.style.cssText = 'display:inline-block;';
        const ref = document.createElement('span');
        ref.textContent = '字';
        const grid = document.createElement('span');
        grid.style.cssText =
          `display:inline-grid;` +
          `grid-template-rows:${rowSize}px ${rowSize}px ${rowSize}px ${rowSize}px;` +
          `vertical-align:${verticalAlign};line-height:1;`;
        const slot = document.createElement('span');
        slot.style.cssText = `grid-row:1;font-size:${rowSize}px;line-height:1;`;
        slot.textContent = 'あ';
        grid.appendChild(slot);
        wrapper.append(ref, grid);
        outer.appendChild(wrapper);
        document.body.appendChild(outer);
        const width = wrapper.getBoundingClientRect().width;
        document.body.removeChild(outer);
        return width;
      }

      const excess = measureLineBoxWidth('0') - measureLineBoxWidth('top');
      if (excess > 5) {
        const root = document.getElementById('skam-root');
        if (root) {
          root.style.setProperty(`--${vp}-grid-baseline-fix`, '1');
        }
      }
    });

    // Fit viewport to actual content size so the screenshot is tight
    const contentSize = await page.evaluate(() => {
      const root = document.getElementById('skam-root');
      if (!root) return null;
      const rect = root.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });

    if (contentSize) {
      const fitWidth = Math.ceil(contentSize.width) + PADDING * 2;
      const fitHeight = Math.ceil(contentSize.height) + PADDING * 2;
      await page.setViewportSize({
        width: Math.max(fitWidth, 100),
        height: Math.max(fitHeight, 100),
      });
    }

    const screenshot = await page.screenshot({
      fullPage: task.fullPage,
      type: task.format,
    });
    return { browser: task.browser, screenshot: Buffer.from(screenshot) };
  } catch (err) {
    return {
      browser: task.browser,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  } finally {
    await browser?.close();
  }
}

/**
 * Captures screenshots from multiple browsers in parallel.
 * Each browser runs independently — one failure does not affect others.
 */
export async function captureScreenshots(
  tasks: CaptureTask[],
): Promise<CaptureResult[]> {
  const pw = await loadPlaywright();

  const settled = await Promise.allSettled(
    tasks.map((task) => captureOne(pw, task)),
  );

  return settled.map((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    // Promise.allSettled rejection (should not happen since captureOne catches all errors)
    return {
      browser: tasks[i]!.browser,
      error:
        result.reason instanceof Error
          ? result.reason
          : new Error(String(result.reason)),
    };
  });
}
