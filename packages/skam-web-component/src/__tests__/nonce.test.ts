import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@kanbun-skam/skam-html-renderer';
import { SkamRendererElement } from '../skam-renderer.js';

// mount に渡る nonce を spy で確かめる。実装は元のまま呼ぶ。
vi.mock('@kanbun-skam/skam-html-renderer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kanbun-skam/skam-html-renderer')>();
  return { ...actual, mount: vi.fn(actual.mount) };
});

if (!customElements.get('skam-renderer')) {
  customElements.define('skam-renderer', SkamRendererElement);
}

const mountSpy = vi.mocked(mount);

const XML =
  '<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>學而時習之</skam:block></skam:body></skam:doc>';
const FONT_LINK = 'link[href*="fonts.googleapis.com"][href*="Noto+Serif+JP"]';

async function nextFrames(n = 5): Promise<void> {
  for (let i = 0; i < n; i++) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function mountElement(attrs: Record<string, string> = {}) {
  const el = document.createElement('skam-renderer') as SkamRendererElement;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  const renders: Event[] = [];
  el.addEventListener('skam-render', (e) => renders.push(e));
  el.xmlContent = XML;
  document.body.append(el);
  return { el, renders };
}

const shadowStyle = (el: HTMLElement, id: string) => el.shadowRoot!.getElementById(id)!;

beforeEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  mountSpy.mockClear();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('skam-renderer nonce', () => {
  it('puts the nonce on the three shadow styles and the mount style, and passes it to mount', async () => {
    const { el, renders } = mountElement({ nonce: 'abc' });
    await nextFrames();
    expect(renders).toHaveLength(1);
    for (const id of ['font-css', 'main-css', 'error-css']) {
      expect(shadowStyle(el, id).getAttribute('nonce')).toBe('abc');
    }
    expect(shadowStyle(el, 'error-css').textContent).toContain('[role="alert"]');
    expect(shadowStyle(el, 'main-css').textContent).toContain(':host');
    const mountStyle = el.shadowRoot!.querySelector<HTMLStyleElement>('style[data-skam-css]');
    expect(mountStyle?.nonce).toBe('abc');
    expect(mountSpy).toHaveBeenCalledTimes(1);
    expect(mountSpy.mock.calls[0]?.[2]).toMatchObject({ nonce: 'abc' });
  });

  it('adds no nonce without the attribute', async () => {
    const { el } = mountElement();
    await nextFrames();
    for (const id of ['font-css', 'main-css', 'error-css']) {
      expect(shadowStyle(el, id).getAttribute('nonce')).toBeNull();
    }
    expect(mountSpy).toHaveBeenCalledTimes(1);
    expect(mountSpy.mock.calls[0]?.[2]).not.toHaveProperty('nonce');
  });

  it('does not re-render when the nonce changes, and uses the new one at the next render', async () => {
    const { el, renders } = mountElement({ nonce: 'abc' });
    await nextFrames();
    expect(renders).toHaveLength(1);
    el.setAttribute('nonce', 'def');
    await nextFrames();
    expect(renders).toHaveLength(1);
    expect(mountSpy).toHaveBeenCalledTimes(1);
    el.setAttribute('writing-mode', 'horizontal');
    await nextFrames();
    expect(renders).toHaveLength(2);
    expect(mountSpy.mock.calls[1]?.[2]).toMatchObject({ nonce: 'def' });
    for (const id of ['font-css', 'main-css', 'error-css']) {
      expect(shadowStyle(el, id).getAttribute('nonce')).toBe('def');
    }
  });

  it('puts the nonce on the injected auto-font link, once', async () => {
    const { el } = mountElement({ nonce: 'abc', 'auto-font': '' });
    await nextFrames();
    const link = document.head.querySelector(FONT_LINK);
    expect(link?.getAttribute('nonce')).toBe('abc');
    el.setAttribute('writing-mode', 'horizontal');
    await nextFrames();
    expect(document.head.querySelectorAll(FONT_LINK)).toHaveLength(1);
  });
});
