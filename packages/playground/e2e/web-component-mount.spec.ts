import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * <skam-renderer> が mount() を通して描くことの実ブラウザ検証。
 *
 * skam-web-component の dist/auto.js (要素を登録する入口) を依存ごと iife に束ねてページに入れる。
 * CSP の meta は束ねたコードを入れた後に足す (先に置くと addScriptTag の script への代入が
 * Trusted Types に止められるため)。
 */

interface SkamRendererLike extends HTMLElement {
  trustedTypesPolicy: { createHTML(input: string): unknown } | null | undefined;
}

const XML =
  '<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>學而<skam:kaeri kind="re"/>時習之</skam:block></skam:body></skam:doc>';

let bundleCode: string | undefined;

async function getBundle(): Promise<string> {
  if (bundleCode) return bundleCode;
  const { build } = await import('vite');
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    // skam-xml-parser のブラウザ版 (DOMParser) を束ねる。default 条件の Node 版 (xmldom) では、
    // Trusted Types が必須のページで parse から描画までが止まらないことを確かめられない
    resolve: { conditions: ['browser'] },
    build: {
      write: false,
      minify: false,
      lib: {
        entry: fileURLToPath(new URL('../../skam-web-component/dist/auto.js', import.meta.url)),
        formats: ['iife'],
        name: 'SKAMWebComponent',
      },
    },
  });
  const outputs = Array.isArray(result)
    ? result.flatMap((r) => ('output' in r ? r.output : []))
    : [];
  const chunk = outputs.find((o) => o.type === 'chunk');
  if (chunk?.type !== 'chunk') throw new Error('web-component bundle was not produced');
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

interface Outcome {
  event: 'skam-render' | 'skam-error';
  rendered: boolean;
  styleCount: number;
  contentChildCount: number;
  contentFirstRole: string | null;
}

/** 要素を作って接続し、最初の skam-render か skam-error を待って shadow root の状態を返す */
async function mountElement(
  page: Page,
  options: { attrs?: Record<string, string>; policy?: string; hostStyle?: Record<string, string> }
): Promise<Outcome> {
  return page.evaluate(
    async ({ xml, attrs, policy, hostStyle }) => {
      const el = document.createElement('skam-renderer') as SkamRendererLike;
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      for (const [k, v] of Object.entries(hostStyle)) el.style.setProperty(k, v);
      if (policy !== null) {
        const created = (
          globalThis as unknown as {
            trustedTypes: {
              createPolicy(
                name: string,
                rules: { createHTML(s: string): string }
              ): { createHTML(s: string): unknown };
            };
          }
        ).trustedTypes.createPolicy(policy, { createHTML: (s) => s });
        el.trustedTypesPolicy = created;
      }
      el.textContent = xml;
      const first = new Promise<'skam-render' | 'skam-error'>((resolve) => {
        el.addEventListener('skam-render', () => resolve('skam-render'), { once: true });
        el.addEventListener('skam-error', () => resolve('skam-error'), { once: true });
      });
      document.body.appendChild(el);
      const event = await first;
      const shadow = el.shadowRoot!;
      const content = shadow.getElementById('content')!;
      return {
        event,
        rendered: content.querySelector('.skam-document') !== null,
        styleCount: shadow.querySelectorAll('style[data-skam-css]').length,
        contentChildCount: content.childNodes.length,
        contentFirstRole:
          (content.firstElementChild as HTMLElement | null)?.getAttribute('role') ?? null,
      };
    },
    {
      xml: XML,
      attrs: options.attrs ?? {},
      policy: options.policy ?? null,
      hostStyle: options.hostStyle ?? {},
    }
  );
}

/**
 * 返り点の字の computed color。class-prefix で名前が変わるので、接尾辞で探す。
 * --color-fg は CSS のどのルールからも参照されないため、参照される --color-kaeriten で確かめる。
 */
async function kaeritenColor(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const el = document.querySelector('skam-renderer');
    const target = el?.shadowRoot?.querySelector('[class$="-kaeriten"]');
    return target ? getComputedStyle(target).color : null;
  });
}

test.describe('<skam-renderer> mount (Chromium)', () => {
  test('with require-trusted-types-for, an element with a policy renders', async ({ page }) => {
    await openPage(page);
    await addCspMeta(page, "require-trusted-types-for 'script'; trusted-types skam-test");
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const outcome = await mountElement(page, { policy: 'skam-test' });
    expect(outcome.event).toBe('skam-render');
    expect(outcome.rendered).toBe(true);
    expect(outcome.styleCount).toBe(1);
    expect(errors).toEqual([]);
  });

  test('control: without a policy it reports skam-error and leaves only the alert', async ({
    page,
  }) => {
    await openPage(page);
    await addCspMeta(page, "require-trusted-types-for 'script'; trusted-types skam-test");
    const outcome = await mountElement(page, {});
    expect(outcome.event).toBe('skam-error');
    expect(outcome.rendered).toBe(false);
    // parse の parseFromString が先に投げるので、mount は呼ばれず style は入らない
    expect(outcome.styleCount).toBe(0);
    expect(outcome.contentChildCount).toBe(1);
    expect(outcome.contentFirstRole).toBe('alert');
  });

  test('class-prefix="foo" follows the host --foo-* variable', async ({ page }) => {
    await openPage(page);
    const outcome = await mountElement(page, {
      attrs: { 'class-prefix': 'foo' },
      hostStyle: { '--foo-color-kaeriten': 'rgb(255, 0, 0)' },
    });
    expect(outcome.event).toBe('skam-render');
    expect(await kaeritenColor(page)).toBe('rgb(255, 0, 0)');
  });

  test('without class-prefix the host --skam-* variable applies', async ({ page }) => {
    await openPage(page);
    const outcome = await mountElement(page, {
      hostStyle: { '--skam-color-kaeriten': 'rgb(0, 128, 0)' },
    });
    expect(outcome.event).toBe('skam-render');
    expect(await kaeritenColor(page)).toBe('rgb(0, 128, 0)');
  });
});
