import { describe, it, expect, vi, afterEach } from 'vitest';
import { SkamRendererElement } from '../skam-renderer.js';

/**
 * Properties assigned to an element before `customElements.define` live on the instance and
 * hide the class accessors after the upgrade. Each case defines its own tag, since a name can
 * be defined only once.
 */

const XML =
  '<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>學而時習之</skam:block></skam:body></skam:doc>';
const XML_WITH_RE =
  '<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>學而<skam:kaeri kind="re"/>時習之</skam:block></skam:body></skam:doc>';

let tagCount = 0;
const nextTag = (): string => `skam-upgrade-${++tagCount}`;
const define = (tag: string): void =>
  customElements.define(tag, class extends SkamRendererElement {});
const create = (tag: string): SkamRendererElement =>
  document.createElement(tag) as SkamRendererElement;
const contentText = (el: HTMLElement): string =>
  el.shadowRoot?.getElementById('content')?.textContent ?? '';

async function nextFrames(n = 5): Promise<void> {
  for (let i = 0; i < n; i++) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('properties assigned before customElements.define', () => {
  it('renders xmlContent assigned before define', async () => {
    const tag = nextTag();
    const el = create(tag);
    el.xmlContent = XML;
    document.body.append(el);
    define(tag);
    await nextFrames();
    expect(contentText(el)).toContain('學');
    expect(Object.hasOwn(el, 'xmlContent')).toBe(false);
  });

  it('renders xmlContent assigned before a define that happens while disconnected', async () => {
    const tag = nextTag();
    const el = create(tag);
    el.xmlContent = XML;
    define(tag);
    document.body.append(el);
    await nextFrames();
    expect(contentText(el)).toContain('學');
  });

  it('control: renders xmlContent assigned after define', async () => {
    const tag = nextTag();
    const el = create(tag);
    document.body.append(el);
    define(tag);
    el.xmlContent = XML;
    await nextFrames();
    expect(contentText(el)).toContain('學');
  });

  it('uses accessibleLabels assigned before define', async () => {
    const tag = nextTag();
    const el = create(tag);
    el.setAttribute('reading-layer-source', 'display');
    el.xmlContent = XML_WITH_RE;
    el.accessibleLabels = { kaeri: () => 'かえりてん' };
    document.body.append(el);
    define(tag);
    await nextFrames();
    expect(el.shadowRoot?.querySelector('.skam-reading')?.textContent ?? '').toContain(
      'かえりてん'
    );
  });

  it('uses trustedTypesPolicy assigned before define', async () => {
    const tag = nextTag();
    const el = create(tag);
    const policy = { createHTML: vi.fn((s: string) => s) };
    el.xmlContent = XML;
    el.trustedTypesPolicy = policy;
    document.body.append(el);
    define(tag);
    await nextFrames();
    expect(policy.createHTML).toHaveBeenCalled();
    expect(contentText(el)).toContain('學');
  });

  it('treats accessibleLabels = null assigned before define as not set', async () => {
    const tag = nextTag();
    const el = create(tag);
    el.xmlContent = XML;
    el.accessibleLabels = null as unknown as undefined;
    document.body.append(el);
    define(tag);
    await nextFrames();
    expect(contentText(el)).toContain('學');
    expect(el.accessibleLabels).toBeUndefined();
  });
});
