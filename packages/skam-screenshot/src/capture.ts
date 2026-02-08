import type { SKAMDocument } from '@kanbun/skam';
import { render } from '@kanbun/skam-html-renderer';
import type { Browser, CaptureOptions, CaptureHTMLOptions } from './types.js';
import { getDefaultBrowsers } from './platform.js';
import { buildHTMLPage } from './page-builder.js';
import {
  captureScreenshots,
  isFailure,
  type CaptureTask,
} from './browser-manager.js';

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

function buildTasks(
  html: string,
  options: {
    browsers?: Browser[];
    viewport?: { width: number; height: number };
    format?: 'png' | 'jpeg';
    fullPage?: boolean;
  },
): CaptureTask[] {
  const browsers = options.browsers ?? getDefaultBrowsers();
  const viewport = options.viewport ?? DEFAULT_VIEWPORT;
  const format = options.format ?? 'png';
  const fullPage = options.fullPage ?? true;

  return browsers.map((browser) => ({
    browser,
    html,
    viewport,
    fullPage,
    format,
  }));
}

/**
 * Captures screenshots of a SKAM document across multiple browsers.
 * Failed browsers are warned on stderr and omitted from the result Map.
 * Throws if all browsers fail.
 */
export async function capture(
  doc: SKAMDocument,
  options: CaptureOptions = {},
): Promise<Map<Browser, Buffer>> {
  const { html, css } = render(doc, options.renderOptions);
  return captureHTML(html, css, options);
}

/**
 * Captures screenshots from pre-rendered HTML+CSS across multiple browsers.
 * Failed browsers are warned on stderr and omitted from the result Map.
 * Throws if all browsers fail.
 */
export async function captureHTML(
  html: string,
  css: string,
  options: CaptureHTMLOptions = {},
): Promise<Map<Browser, Buffer>> {
  const page = buildHTMLPage(html, css);
  const tasks = buildTasks(page, options);
  const results = await captureScreenshots(tasks);

  const map = new Map<Browser, Buffer>();
  const errors: string[] = [];

  for (const result of results) {
    if (isFailure(result)) {
      const msg = `Warning: ${result.browser} screenshot failed: ${result.error.message}`;
      process.stderr.write(msg + '\n');
      errors.push(msg);
    } else {
      map.set(result.browser, result.screenshot);
    }
  }

  if (map.size === 0) {
    throw new Error(
      `All browser screenshots failed:\n${errors.join('\n')}`,
    );
  }

  return map;
}
