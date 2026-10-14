import { describe, it, expect, vi, afterEach } from 'vitest';
import { SkamRendererElement } from '../skam-renderer.js';

if (!customElements.get('skam-renderer')) {
  customElements.define('skam-renderer', SkamRendererElement);
}

const XML =
  '<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>甲</skam:block></skam:body></skam:doc>';

function mount(attrs: Record<string, string>) {
  const el = document.createElement('skam-renderer') as SkamRendererElement;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  const errors: CustomEvent[] = [];
  const renders: CustomEvent[] = [];
  el.addEventListener('skam-error', (e) => errors.push(e as CustomEvent));
  el.addEventListener('skam-render', (e) => renders.push(e as CustomEvent));
  el.textContent = XML;
  document.body.append(el);
  return { el, errors, renders };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('attribute validation (K4, K5)', () => {
  it.each([
    ['class-prefix', 'a"><b'],
    ['display-lang', 'ja"><b'],
  ])('falls back and reports a recoverable error for invalid %s', async (name, value) => {
    const { el, errors, renders } = mount({ [name]: value });
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(el.shadowRoot!.querySelector('.skam-document')).not.toBeNull();
    // innerHTML は " と > をエスケープして直列化するので、文字列の比較ではなく要素の有無で確かめる
    expect(el.shadowRoot!.querySelector('b')).toBeNull();
    expect(errors).toHaveLength(1);
    expect((errors[0]!.detail.error as Error).message).not.toContain(value);
    expect(errors[0]!.detail).toMatchObject({ recoverable: true, attribute: name });
  });

  it('reports each invalid attribute separately, before skam-render', async () => {
    const order: string[] = [];
    const el = document.createElement('skam-renderer') as SkamRendererElement;
    el.setAttribute('class-prefix', 'a"><b');
    el.setAttribute('display-lang', 'ja"><b');
    el.addEventListener('skam-error', (e) =>
      order.push(`error:${(e as CustomEvent).detail.attribute}`)
    );
    el.addEventListener('skam-render', () => order.push('render'));
    el.textContent = XML;
    document.body.append(el);
    await vi.waitFor(() => expect(order).toContain('render'));
    expect(order).toEqual(['error:class-prefix', 'error:display-lang', 'render']);
  });

  it('does not re-fire for the same invalid value on re-render, but fires again when the value changes', async () => {
    const { el, errors, renders } = mount({ 'class-prefix': 'a"><b' });
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    el.textContent = XML.replace('甲', '乙');
    await vi.waitFor(() => expect(renders).toHaveLength(2));
    expect(errors).toHaveLength(1);
    el.setAttribute('class-prefix', 'c"><d');
    await vi.waitFor(() => expect(renders).toHaveLength(3));
    expect(errors).toHaveLength(2);
  });

  it('applies display-lang to the display layer and re-renders on change', async () => {
    const { el, renders } = mount({ 'display-lang': 'lzh' });
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(el.shadowRoot!.querySelector('.skam-display')?.getAttribute('lang')).toBe('lzh');
    el.setAttribute('display-lang', 'zh-Hant');
    await vi.waitFor(() => expect(renders).toHaveLength(2));
    expect(el.shadowRoot!.querySelector('.skam-display')?.getAttribute('lang')).toBe('zh-Hant');
  });
});
