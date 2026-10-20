import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * `style-src 'nonce-abc'` だけを許すページで、ヲコト点の位置と傍点が効くことの実ブラウザ検証。
 *
 * インラインの style 属性は CSP に止められるが、CSSOM の `style.setProperty` は止められない。
 * mount と <skam-renderer> は style 属性を出さず、DOM に入れた後に CSSOM で値を設定する。
 * 束ねたコードを入れた後に CSP の meta を足す (先に置くと addScriptTag の script への代入が
 * Trusted Types に止められる場合があるため、他の spec と同じ順にする)。
 */

interface SkamGlobal {
  render(doc: unknown): { html: string; css: string };
  mount(container: HTMLElement, doc: unknown, options?: { nonce?: string }): unknown;
}

const DOC = {
  format: 'skam@0.1',
  tokens: [
    { id: 't1', text: '學' },
    { id: 't2', text: '而' },
  ],
  blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
  marks: [
    {
      type: 'okototen',
      anchor: { from: 't1', to: 't1' },
      position: { system: 'glyph-grid', grid: '4x4', x: 3, y: 1 },
      shape: 'dot',
    },
    { type: 'emphasis', anchor: { from: 't2', to: 't2' }, style: '★' },
  ],
  readings: [],
};

const WC_XML =
  '<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>' +
  '<skam:okototen grid="4x4" x="3" y="1" shape="dot" sound="り">學</skam:okototen>' +
  '<skam:span type="emphasis" style="★">而</skam:span>時<skam:kaeri kind="re"/>習' +
  '</skam:block></skam:body></skam:doc>';

let rendererBundle: string | undefined;
let componentBundle: string | undefined;

async function bundle(entry: string, name: string, browser: boolean): Promise<string> {
  const { build } = await import('vite');
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    // skam-xml-parser のブラウザ版 (DOMParser) を束ねる (web-component-mount.spec.ts と同じ)
    ...(browser ? { resolve: { conditions: ['browser'] } } : {}),
    build: {
      write: false,
      minify: false,
      lib: {
        entry: fileURLToPath(new URL(entry, import.meta.url)),
        formats: ['iife'],
        name,
      },
    },
  });
  const outputs = Array.isArray(result)
    ? result.flatMap((r) => ('output' in r ? r.output : []))
    : [];
  const chunk = outputs.find((o) => o.type === 'chunk');
  if (chunk?.type !== 'chunk') throw new Error(`${name} bundle was not produced`);
  return chunk.code;
}

async function openPage(page: Page, which: 'renderer' | 'component'): Promise<void> {
  await page.setContent('<!doctype html><html><head></head><body></body></html>');
  if (which === 'renderer') {
    rendererBundle ??= await bundle('../../skam-html-renderer/dist/index.js', 'SKAMHtml', false);
    await page.addScriptTag({ content: rendererBundle });
  } else {
    componentBundle ??= await bundle(
      '../../skam-web-component/dist/auto.js',
      'SKAMWebComponent',
      true
    );
    await page.addScriptTag({ content: componentBundle });
  }
  await page.evaluate(() => {
    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = "style-src 'nonce-abc'";
    document.head.appendChild(meta);
  });
}

test.describe('nonce-only style-src: mount (Chromium)', () => {
  test('mount with a nonce positions the okototen and applies the emphasis', async ({ page }) => {
    await openPage(page, 'renderer');
    const result = await page.evaluate((doc) => {
      const skam = (globalThis as unknown as { SKAMHtml: SkamGlobal }).SKAMHtml;
      const container = document.createElement('div');
      document.body.appendChild(container);
      skam.mount(container, doc, { nonce: 'abc' });
      const okototen = container.querySelector<HTMLElement>('[data-okototen-x]');
      const emphasized = container.querySelector<HTMLElement>('[data-emphasis-style]');
      if (!okototen || !emphasized) return null;
      const left = getComputedStyle(okototen).left;
      okototen.style.setProperty('--okototen-x', '0');
      const leftAtZero = getComputedStyle(okototen).left;
      return {
        left,
        leftAtZero,
        emphasis: getComputedStyle(emphasized).textEmphasisStyle,
        hasStyleAttribute: container.innerHTML.includes(' style="'),
      };
    }, DOC);
    expect(result).not.toBeNull();
    expect(result?.left).not.toBe(result?.leftAtZero);
    expect(result?.left).not.toBe('auto');
    expect(result?.emphasis).toContain('★');
  });

  test('control: the default render html in a nonce style loses the okototen position', async ({
    page,
  }) => {
    await openPage(page, 'renderer');
    const result = await page.evaluate((doc) => {
      const skam = (globalThis as unknown as { SKAMHtml: SkamGlobal }).SKAMHtml;
      const { html, css } = skam.render(doc);
      const style = document.createElement('style');
      style.nonce = 'abc';
      style.textContent = css;
      document.head.appendChild(style);
      const container = document.createElement('div');
      container.innerHTML = html;
      document.body.appendChild(container);
      const okototen = container.querySelector<HTMLElement>('.skam-okototen');
      if (!okototen) return null;
      const blocked = getComputedStyle(okototen).left;
      // CSSOM は止められないので、同じ値を設定したときの位置が、属性が効いたときの位置になる
      okototen.style.setProperty('--okototen-x', '3');
      okototen.style.setProperty('--okototen-y', '1');
      okototen.style.setProperty('--okototen-grid', '4');
      okototen.style.setProperty('--okototen-grid-rows', '4');
      const expected = getComputedStyle(okototen).left;
      return { blocked, expected };
    }, DOC);
    expect(result).not.toBeNull();
    expect(result?.blocked).not.toBe(result?.expected);
  });
});

test.describe('nonce-only style-src: <skam-renderer> (Chromium)', () => {
  async function mountElement(page: Page, xml: string): Promise<void> {
    await page.evaluate(async (source) => {
      const el = document.createElement('skam-renderer');
      el.setAttribute('nonce', 'abc');
      el.style.setProperty('--skam-color-kaeriten', 'rgb(0, 128, 0)');
      el.textContent = source;
      const first = new Promise<void>((resolve) => {
        el.addEventListener('skam-render', () => resolve(), { once: true });
        el.addEventListener('skam-error', () => resolve(), { once: true });
      });
      document.body.appendChild(el);
      await first;
    }, xml);
  }

  test('okototen position, emphasis and the host variable take effect', async ({ page }) => {
    await openPage(page, 'component');
    await mountElement(page, WC_XML);
    const result = await page.evaluate(() => {
      const shadow = document.querySelector('skam-renderer')?.shadowRoot;
      const okototen = shadow?.querySelector<HTMLElement>('[data-okototen-x]');
      const emphasized = shadow?.querySelector<HTMLElement>('[data-emphasis-style]');
      const kaeriten = shadow?.querySelector<HTMLElement>('[class$="-kaeriten"]');
      if (!okototen || !emphasized || !kaeriten) return null;
      const left = getComputedStyle(okototen).left;
      okototen.style.setProperty('--okototen-x', '0');
      const leftAtZero = getComputedStyle(okototen).left;
      return {
        left,
        leftAtZero,
        emphasis: getComputedStyle(emphasized).textEmphasisStyle,
        kaeritenColor: getComputedStyle(kaeriten).color,
      };
    });
    expect(result).not.toBeNull();
    expect(result?.left).not.toBe(result?.leftAtZero);
    expect(result?.emphasis).toContain('★');
    expect(result?.kaeritenColor).toBe('rgb(0, 128, 0)');
  });

  test('the error style applies to an alert for an invalid xml', async ({ page }) => {
    await openPage(page, 'component');
    await mountElement(page, '<skam:doc xmlns:skam="urn:skam:1"><skam:body>');
    const color = await page.evaluate(() => {
      const alert = document
        .querySelector('skam-renderer')
        ?.shadowRoot?.querySelector<HTMLElement>('[role="alert"]');
      return alert ? getComputedStyle(alert).color : null;
    });
    expect(color).toBe('rgb(204, 0, 0)');
  });
});
