import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * mount() の実ブラウザ検証。
 *
 * html-renderer には browser 用の入口が無いので、dist/index.js を @kanbun-skam/skam ごと
 * iife に束ねてページに入れる。CSP の meta は束ねたコードを入れた後に足す
 * (先に置くと addScriptTag の script への代入が Trusted Types に止められるため)。
 */

interface SkamGlobal {
  render(doc: unknown): { html: string; css: string };
  calibrateGridBaseline(root: HTMLElement): void;
  mount(
    container: HTMLElement,
    doc: unknown,
    options?: {
      nonce?: string;
      trustedTypesPolicy?: { createHTML(input: string): unknown };
    }
  ): { html: string; css: string; fontsCalibrated: Promise<void> };
}

const DOC = {
  format: 'skam@0.1',
  tokens: [
    { id: 't1', text: '學' },
    { id: 't2', text: '而' },
  ],
  blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
  marks: [],
  readings: [],
};

let bundleCode: string | undefined;

async function getBundle(): Promise<string> {
  if (bundleCode) return bundleCode;
  const { build } = await import('vite');
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: {
        entry: fileURLToPath(new URL('../../skam-html-renderer/dist/index.js', import.meta.url)),
        formats: ['iife'],
        name: 'SKAMHtml',
      },
    },
  });
  const outputs = Array.isArray(result)
    ? result.flatMap((r) => ('output' in r ? r.output : []))
    : [];
  const chunk = outputs.find((o) => o.type === 'chunk');
  if (chunk?.type !== 'chunk') throw new Error('html-renderer bundle was not produced');
  bundleCode = chunk.code;
  return bundleCode;
}

async function openPage(page: Page): Promise<void> {
  await page.setContent('<!doctype html><html><head></head><body></body></html>');
  await page.addScriptTag({ content: await getBundle() });
}

async function addCspMeta(page: Page, content: string): Promise<void> {
  await page.evaluate((policy) => {
    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = policy;
    document.head.appendChild(meta);
  }, content);
}

test.describe('mount (Chromium)', () => {
  test('grid baseline calibration matches a direct calibrateGridBaseline call', async ({
    page,
  }) => {
    await openPage(page);
    const { direct, mounted } = await page.evaluate(async (doc) => {
      const skam = (globalThis as unknown as { SKAMHtml: SkamGlobal }).SKAMHtml;
      const probe = document.createElement('div');
      document.body.appendChild(probe);
      skam.calibrateGridBaseline(probe);
      const container = document.createElement('div');
      document.body.appendChild(container);
      const result = skam.mount(container, doc);
      await result.fontsCalibrated;
      const read = (el: HTMLElement) => el.style.getPropertyValue('--skam-grid-baseline-fix');
      return { direct: read(probe), mounted: read(container) };
    }, DOC);
    expect(mounted).toBe(direct);
  });

  test('two mounts with the same options add one style with the mount css', async ({ page }) => {
    await openPage(page);
    const { css, count } = await page.evaluate(async (doc) => {
      const skam = (globalThis as unknown as { SKAMHtml: SkamGlobal }).SKAMHtml;
      const a = document.createElement('div');
      const b = document.createElement('div');
      document.body.append(a, b);
      const first = skam.mount(a, doc);
      await first.fontsCalibrated;
      await skam.mount(b, doc).fontsCalibrated;
      const matching = Array.from(document.head.querySelectorAll('style[data-skam-css]')).filter(
        (s) => s.textContent === first.css
      );
      return { css: first.css, count: matching.length };
    }, DOC);
    expect(css.length).toBeGreaterThan(0);
    expect(count).toBe(1);
  });

  test('with a nonce-only style-src CSP, mount with the nonce applies the style', async ({
    page,
  }) => {
    await openPage(page);
    await addCspMeta(page, "style-src 'nonce-abc'");
    const writingMode = await page.evaluate((doc) => {
      const skam = (globalThis as unknown as { SKAMHtml: SkamGlobal }).SKAMHtml;
      const container = document.createElement('div');
      document.body.appendChild(container);
      skam.mount(container, doc, { nonce: 'abc' });
      const el = container.querySelector('.skam-document');
      return el ? getComputedStyle(el).writingMode : null;
    }, DOC);
    expect(writingMode).toBe('vertical-rl');
  });

  test('control: without the nonce the CSP blocks the style', async ({ page }) => {
    await openPage(page);
    await addCspMeta(page, "style-src 'nonce-abc'");
    const writingMode = await page.evaluate((doc) => {
      const skam = (globalThis as unknown as { SKAMHtml: SkamGlobal }).SKAMHtml;
      const container = document.createElement('div');
      document.body.appendChild(container);
      skam.mount(container, doc);
      const el = container.querySelector('.skam-document');
      return el ? getComputedStyle(el).writingMode : null;
    }, DOC);
    expect(writingMode).not.toBeNull();
    expect(writingMode).not.toBe('vertical-rl');
  });

  test('with require-trusted-types-for, mount with a policy renders', async ({ page }) => {
    await openPage(page);
    await addCspMeta(page, "require-trusted-types-for 'script'; trusted-types skam-test");
    const rendered = await page.evaluate((doc) => {
      const skam = (globalThis as unknown as { SKAMHtml: SkamGlobal }).SKAMHtml;
      const policy = (
        globalThis as unknown as {
          trustedTypes: {
            createPolicy(
              name: string,
              rules: { createHTML(s: string): string }
            ): { createHTML(s: string): unknown };
          };
        }
      ).trustedTypes.createPolicy('skam-test', { createHTML: (s) => s });
      const container = document.createElement('div');
      document.body.appendChild(container);
      skam.mount(container, doc, { trustedTypesPolicy: policy });
      return container.querySelector('.skam-document') !== null;
    }, DOC);
    expect(rendered).toBe(true);
  });

  test('control: without a policy mount throws TypeError and the container stays empty', async ({
    page,
  }) => {
    await openPage(page);
    await addCspMeta(page, "require-trusted-types-for 'script'; trusted-types skam-test");
    const outcome = await page.evaluate((doc) => {
      const skam = (globalThis as unknown as { SKAMHtml: SkamGlobal }).SKAMHtml;
      const container = document.createElement('div');
      document.body.appendChild(container);
      let errorName: string | null = null;
      try {
        skam.mount(container, doc);
      } catch (error) {
        errorName = error instanceof Error ? error.name : String(error);
      }
      return { errorName, html: container.innerHTML };
    }, DOC);
    expect(outcome.errorName).toBe('TypeError');
    expect(outcome.html).toBe('');
  });
});
