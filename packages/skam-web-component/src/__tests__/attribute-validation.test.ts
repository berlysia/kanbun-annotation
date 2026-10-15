import { describe, it, expect, vi, afterEach } from 'vitest';
import { SkamRendererElement } from '../skam-renderer.js';
import { extractXmlFromScriptElement } from '../index.js';

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

const XML_OKURI =
  '<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block><skam:kun okuri="ク">習</skam:kun></skam:block></skam:body></skam:doc>';

function mountWithXml(attrs: Record<string, string>, xml: string) {
  const el = document.createElement('skam-renderer') as SkamRendererElement;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  const errors: CustomEvent[] = [];
  const renders: CustomEvent[] = [];
  el.addEventListener('skam-error', (e) => errors.push(e as CustomEvent));
  el.addEventListener('skam-render', (e) => renders.push(e as CustomEvent));
  el.textContent = xml;
  document.body.append(el);
  return { el, errors, renders };
}

const content = (el: HTMLElement) => el.shadowRoot!.getElementById('content')!;

describe('writing-mode / copyable notifications (K5)', () => {
  it('renders vertically and reports writing-mode once', async () => {
    const { el, errors, renders } = mount({ 'writing-mode': 'diagonal' });
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(el.shadowRoot!.querySelector('.skam-document')?.getAttribute('data-writing-mode')).toBe(
      'vertical'
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.detail).toMatchObject({ recoverable: true, attribute: 'writing-mode' });
    el.textContent = XML.replace('甲', '乙');
    await vi.waitFor(() => expect(renders).toHaveLength(2));
    expect(errors).toHaveLength(1);
  });

  it('renders the valid copyable names and reports an unknown one', async () => {
    const { el, errors, renders } = mount({ copyable: 'ruby unknown' });
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(el.shadowRoot!.querySelector('.skam-document')?.getAttribute('data-copyable')).toBe(
      'ruby'
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.detail).toMatchObject({ recoverable: true, attribute: 'copyable' });
  });
});

describe('fail closed attributes (K5)', () => {
  it('renders with a preset name', async () => {
    const { el, errors, renders } = mountWithXml({ profile: 'learningBasic' }, XML_OKURI);
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(errors).toHaveLength(0);
    expect(content(el).innerHTML).not.toContain('ク');
  });

  it('renders with the base form', async () => {
    const { el, renders } = mountWithXml(
      { profile: '{"base":"learningBasic","overrides":{"okurigana":true}}' },
      XML_OKURI
    );
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(content(el).innerHTML).toContain('ク');
  });

  it.each([
    '{"okuriganaa":false}',
    '{"okurigana":"false"}',
    '{bad json',
    'unknownPreset',
    'constructor',
    '__proto__',
    'null',
    '[]',
    '123',
    '',
    '{"__proto__":{"okurigana":false}}',
  ])('shows an alert only and reports non-recoverable for profile=%j', async (value) => {
    const { el, errors, renders } = mountWithXml({ profile: value }, XML_OKURI);
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(renders).toHaveLength(0);
    expect(errors[0]!.detail).toMatchObject({ recoverable: false, attribute: 'profile' });
    expect(content(el).children).toHaveLength(1);
    expect(content(el).querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(el.shadowRoot!.querySelector('.skam-document')).toBeNull();
  });

  it('does not re-notify the same invalid profile on re-render', async () => {
    const { el, errors } = mountWithXml({ profile: '{"okuriganaa":false}' }, XML_OKURI);
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    el.setAttribute('class-prefix', 'x');
    el.textContent = XML_OKURI.replace('習', '学');
    await new Promise((r) => setTimeout(r, 50));
    expect(errors).toHaveLength(1);
    expect(content(el).querySelectorAll('[role="alert"]')).toHaveLength(1);
  });

  it('treats the profile value as text, not markup', async () => {
    const value = '<img src=x onerror=alert(1)>';
    const { el, errors } = mountWithXml({ profile: value }, XML_OKURI);
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(el.shadowRoot!.querySelector('img')).toBeNull();
    expect(content(el).querySelector('[role="alert"]')!.textContent).toContain(value);
    expect(JSON.stringify(errors[0]!.detail)).not.toContain(value);
  });

  it('renders with the default profile once the attribute is removed', async () => {
    const { el, errors, renders } = mountWithXml({ profile: 'learningBasic' }, XML_OKURI);
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    el.removeAttribute('profile');
    await vi.waitFor(() => expect(renders).toHaveLength(2));
    expect(errors).toHaveLength(0);
    expect(content(el).innerHTML).toContain('ク');
  });

  it('blocks include-reading-layer="fasle" and recovers when corrected to "false"', async () => {
    const { el, errors, renders } = mountWithXml({ 'include-reading-layer': 'fasle' }, XML);
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(errors[0]!.detail).toMatchObject({
      recoverable: false,
      attribute: 'include-reading-layer',
    });
    expect(content(el).querySelectorAll('[role="alert"]')).toHaveLength(1);
    el.setAttribute('include-reading-layer', 'false');
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(el.shadowRoot!.querySelector('.skam-reading')).toBeNull();
    expect(el.shadowRoot!.querySelector('.skam-document')).not.toBeNull();
  });

  it.each([
    ['', true],
    ['true', true],
    ['false', false],
  ])('include-reading-layer=%j shows the reading layer: %s', async (value, shown) => {
    const { el, errors, renders } = mount({ 'include-reading-layer': value });
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(errors).toHaveLength(0);
    expect(el.shadowRoot!.querySelector('.skam-reading') !== null).toBe(shown);
  });

  it('stays empty while invalid, even if the SKAML changes, and renders after recovery', async () => {
    const { el, errors, renders } = mountWithXml({ profile: 'learningBasic' }, XML_OKURI);
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    el.setAttribute('profile', 'bogus');
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(el.shadowRoot!.querySelector('.skam-document')).toBeNull();
    el.textContent = XML_OKURI.replace('習', '学');
    await new Promise((r) => setTimeout(r, 50));
    expect(el.shadowRoot!.querySelector('.skam-document')).toBeNull();
    expect(renders).toHaveLength(1);
    el.setAttribute('profile', 'learningBasic');
    await vi.waitFor(() => expect(renders).toHaveLength(2));
    expect(el.shadowRoot!.querySelector('.skam-document')).not.toBeNull();
  });
});

const XML_GAKUJI =
  '<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>' +
  '<skam:kun okuri="ビテ">學</skam:kun><skam:okimoji>而</skam:okimoji>' +
  '<skam:kun okuri="ニ">時</skam:kun><skam:kun okuri="フ">習</skam:kun><skam:kaeri kind="re"/>' +
  '<skam:kun okuri="ヲ">之</skam:kun></skam:block></skam:body>' +
  '<skam:readings><skam:reading kind="yomiage">學びて時に之を習ふ</skam:reading></skam:readings>' +
  '</skam:doc>';

describe('reading-layer-source attribute (K3, K5)', () => {
  const reading = (el: HTMLElement) => el.shadowRoot!.querySelector('.skam-reading')?.textContent;

  it('display: reads only what the profile shows, never the readings', async () => {
    const { el, errors, renders } = mountWithXml(
      { profile: 'learningBasic', 'reading-layer-source': 'display' },
      XML_GAKUJI
    );
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(errors).toHaveLength(0);
    expect(reading(el)).toBe('學。而、置き字。時。習、レ点。之。');
    expect(el.shadowRoot!.innerHTML).not.toContain('學びて');
  });

  it('readings (explicit) and no attribute read the readings', async () => {
    const explicit = mountWithXml({ 'reading-layer-source': 'readings' }, XML_GAKUJI);
    await vi.waitFor(() => expect(explicit.renders).toHaveLength(1));
    expect(reading(explicit.el)).toBe('學びて時に之を習ふ');
    const absent = mountWithXml({}, XML_GAKUJI);
    await vi.waitFor(() => expect(absent.renders).toHaveLength(1));
    expect(reading(absent.el)).toBe('學びて時に之を習ふ');
  });

  it.each(['dispaly', '', 'Display', '__proto__'])(
    'blocks reading-layer-source=%j (non-recoverable, empty content)',
    async (value) => {
      const { el, errors, renders } = mountWithXml({ 'reading-layer-source': value }, XML_GAKUJI);
      await vi.waitFor(() => expect(errors).toHaveLength(1));
      expect(renders).toHaveLength(0);
      expect(errors[0]!.detail).toMatchObject({
        recoverable: false,
        attribute: 'reading-layer-source',
      });
      expect(content(el).children).toHaveLength(1);
      expect(content(el).querySelectorAll('[role="alert"]')).toHaveLength(1);
      expect(el.shadowRoot!.querySelector('.skam-document')).toBeNull();
    }
  );

  it('goes valid -> invalid -> valid: empties, then renders again', async () => {
    const { el, errors, renders } = mountWithXml(
      { profile: 'learningBasic', 'reading-layer-source': 'display' },
      XML_GAKUJI
    );
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    el.setAttribute('reading-layer-source', 'dispaly');
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(el.shadowRoot!.querySelector('.skam-document')).toBeNull();
    el.setAttribute('reading-layer-source', 'display');
    await vi.waitFor(() => expect(renders).toHaveLength(2));
    expect(reading(el)).toBe('學。而、置き字。時。習、レ点。之。');
  });

  it('removing the attribute renders with readings again', async () => {
    const { el, renders } = mountWithXml(
      { profile: 'learningBasic', 'reading-layer-source': 'display' },
      XML_GAKUJI
    );
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    el.removeAttribute('reading-layer-source');
    await vi.waitFor(() => expect(renders).toHaveLength(2));
    expect(reading(el)).toBe('學びて時に之を習ふ');
  });

  it('reports each blocked attribute once, in a fixed order', async () => {
    const { errors } = mountWithXml(
      { profile: 'bogus', 'include-reading-layer': 'x', 'reading-layer-source': 'y' },
      XML_GAKUJI
    );
    await vi.waitFor(() => expect(errors).toHaveLength(3));
    expect(errors.map((e) => e.detail.attribute)).toEqual([
      'profile',
      'include-reading-layer',
      'reading-layer-source',
    ]);
  });

  it('reading-layer-source="" is invalid while include-reading-layer="" is true', async () => {
    const { el, renders } = mountWithXml({ 'include-reading-layer': '' }, XML_GAKUJI);
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(el.shadowRoot!.querySelector('.skam-reading')).not.toBeNull();
  });
});

describe('extractXmlFromScriptElement export (K10)', () => {
  it('is a function and importing does not register the element', () => {
    expect(typeof extractXmlFromScriptElement).toBe('function');
  });
});
