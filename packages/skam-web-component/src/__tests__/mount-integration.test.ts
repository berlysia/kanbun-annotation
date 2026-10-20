import { describe, it, expect, expectTypeOf, vi, beforeEach, afterEach } from 'vitest';
import { parse, type ParseOptions } from '@kanbun-skam/skam-xml-parser';
import { mount, render, type MountOptions } from '@kanbun-skam/skam-html-renderer';
import { buildRenderOptions, type AttributeValues } from '../attribute-map.js';
import { SkamRendererElement } from '../skam-renderer.js';

// 描画が mount と parse を通ることを spy で確かめる。実装は元のまま呼ぶ (このファイルの外には影響しない)。
// この環境の parse は Node 版 (xmldom) に解決され、policy を呼ばない。
vi.mock('@kanbun-skam/skam-html-renderer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kanbun-skam/skam-html-renderer')>();
  return { ...actual, mount: vi.fn(actual.mount) };
});
vi.mock('@kanbun-skam/skam-xml-parser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kanbun-skam/skam-xml-parser')>();
  return { ...actual, parse: vi.fn(actual.parse) };
});

if (!customElements.get('skam-renderer')) {
  customElements.define('skam-renderer', SkamRendererElement);
}

const mountSpy = vi.mocked(mount);
const parseSpy = vi.mocked(parse);

const FRAMES = 5;

const XML =
  '<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>學而時習之</skam:block></skam:body></skam:doc>';
const BROKEN = '<skam:doc xmlns:skam="urn:skam:1"><skam:body>';

async function nextFrames(n = FRAMES): Promise<void> {
  for (let i = 0; i < n; i++) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function createElement(attrs: Record<string, string> = {}, xml = XML) {
  const el = document.createElement('skam-renderer') as SkamRendererElement;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  const errors: CustomEvent[] = [];
  const renders: CustomEvent[] = [];
  el.addEventListener('skam-error', (e) => errors.push(e as CustomEvent));
  el.addEventListener('skam-render', (e) => renders.push(e as CustomEvent));
  el.xmlContent = xml;
  return { el, errors, renders };
}

function mountElement(attrs: Record<string, string> = {}, xml = XML) {
  const created = createElement(attrs, xml);
  document.body.append(created.el);
  return created;
}

const content = (el: HTMLElement) => el.shadowRoot!.getElementById('content')!;
const skamStyles = (el: HTMLElement) =>
  Array.from(el.shadowRoot!.querySelectorAll<HTMLStyleElement>('style[data-skam-css]'));

const NO_ATTRS: AttributeValues = {
  'writing-mode': null,
  profile: null,
  inline: null,
  'include-reading-layer': null,
  copyable: null,
  'class-prefix': null,
  'display-lang': null,
  'reading-layer-source': null,
};

/** 属性から Web Component と同じオプションを作って render した CSS */
function expectedCss(attrs: Partial<AttributeValues>): string {
  const { options } = buildRenderOptions({ ...NO_ATTRS, ...attrs });
  return render(parse(XML), options).css;
}

let actualParse: typeof parse;
let actualMount: typeof mount;

beforeEach(async () => {
  const parser = await vi.importActual<typeof import('@kanbun-skam/skam-xml-parser')>(
    '@kanbun-skam/skam-xml-parser'
  );
  const html = await vi.importActual<typeof import('@kanbun-skam/skam-html-renderer')>(
    '@kanbun-skam/skam-html-renderer'
  );
  actualParse = parser.parse;
  actualMount = html.mount;
  mountSpy.mockReset();
  mountSpy.mockImplementation(actualMount);
  parseSpy.mockReset();
  parseSpy.mockImplementation(actualParse);
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('描画は mount を通る (T1)', () => {
  it('calls mount once with #content and the render options', async () => {
    const { el, renders } = mountElement({ 'writing-mode': 'horizontal', 'class-prefix': 'foo' });
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(mountSpy).toHaveBeenCalledTimes(1);
    const [container, doc, options] = mountSpy.mock.calls[0]!;
    expect(container).toBe(content(el));
    // トークン ID は parse のたびに変わるので、文字列だけを比べる
    expect(doc.tokens.map((t) => t.text).join('')).toBe('學而時習之');
    expect(options).toMatchObject({
      classPrefix: 'foo',
      variablePrefix: 'foo',
      useLayer: false,
    });
    expect(options!.trustedTypesPolicy).toBeUndefined();
  });

  it('keeps exactly one style[data-skam-css] with the current css across re-renders', async () => {
    const { el, renders } = mountElement({ 'writing-mode': 'vertical' });
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(skamStyles(el).map((s) => s.textContent)).toEqual([
      expectedCss({ 'writing-mode': 'vertical' }),
    ]);

    el.setAttribute('writing-mode', 'horizontal');
    await vi.waitFor(() => expect(renders).toHaveLength(2));
    expect(skamStyles(el).map((s) => s.textContent)).toEqual([
      expectedCss({ 'writing-mode': 'horizontal' }),
    ]);

    el.setAttribute('writing-mode', 'vertical');
    await vi.waitFor(() => expect(renders).toHaveLength(3));
    expect(skamStyles(el).map((s) => s.textContent)).toEqual([
      expectedCss({ 'writing-mode': 'vertical' }),
    ]);
  });

  it('removes the style and the content when the content becomes empty', async () => {
    const { el, renders } = mountElement();
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(skamStyles(el)).toHaveLength(1);
    el.xmlContent = '';
    await nextFrames();
    expect(skamStyles(el)).toHaveLength(0);
    expect(content(el).childNodes).toHaveLength(0);
  });

  it('removes the style and leaves only the alert when a hiding attribute becomes invalid', async () => {
    const { el, errors, renders } = mountElement();
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    el.setAttribute('profile', 'bogus');
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(skamStyles(el)).toHaveLength(0);
    expect(content(el).childNodes).toHaveLength(1);
    expect(content(el).firstElementChild?.getAttribute('role')).toBe('alert');
  });

  it('removes the style and leaves only the alert when the XML becomes invalid', async () => {
    const { el, errors, renders } = mountElement();
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    el.xmlContent = BROKEN;
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(errors[0]!.detail.recoverable).toBe(false);
    expect(skamStyles(el)).toHaveLength(0);
    expect(content(el).childNodes).toHaveLength(1);
    expect(content(el).firstElementChild?.getAttribute('role')).toBe('alert');
  });
});

describe('接続前は描かない (T1)', () => {
  it('renders nothing and emits no events until connected, then renders once', async () => {
    const { el, errors, renders } = createElement();
    await nextFrames();
    expect(errors).toHaveLength(0);
    expect(renders).toHaveLength(0);
    expect(content(el).childNodes).toHaveLength(0);
    expect(mountSpy).not.toHaveBeenCalled();

    document.body.append(el);
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    await nextFrames();
    expect(renders).toHaveLength(1);
    expect(errors).toHaveLength(0);
    expect(content(el).querySelector('.skam-document')).not.toBeNull();
  });

  it('reports a blocked attribute set before connecting only after connecting', async () => {
    const { el, errors, renders } = createElement({ profile: 'bogus' });
    await nextFrames();
    expect(errors).toHaveLength(0);
    expect(renders).toHaveLength(0);

    document.body.append(el);
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(errors[0]!.detail.recoverable).toBe(false);
    expect(renders).toHaveLength(0);
  });
});

describe('class-prefix は変数の prefix にも使われる (T2)', () => {
  it("class-prefix='foo' uses --foo-* in the render css, the override css and the font css", async () => {
    const { el, renders } = mountElement({ 'class-prefix': 'foo', 'auto-font': '' });
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    const [style] = skamStyles(el);
    expect(style!.textContent).toContain('--foo-grid-baseline-fix');
    expect(style!.textContent).not.toContain('--skam-');
    const main = el.shadowRoot!.getElementById('main-css')!.textContent!;
    expect(main).toMatch(/:host\s*\{[^}]*--foo-color-fg:/);
    expect(main).not.toContain('--skam-');
    expect(el.shadowRoot!.getElementById('font-css')!.textContent).toContain('--foo-font-family');
  });

  it('without class-prefix the render css equals render(doc)', async () => {
    const { el, renders } = mountElement();
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(skamStyles(el)[0]!.textContent).toBe(render(parse(XML), { useLayer: false }).css);
  });
});

describe('trustedTypesPolicy プロパティ (T3)', () => {
  it('passes the policy to parse and mount as-is and renders what createHTML returns', async () => {
    const policy = { createHTML: vi.fn((s: string) => s) };
    const { el, renders } = createElement();
    el.trustedTypesPolicy = policy;
    document.body.append(el);
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(policy.createHTML).toHaveBeenCalledTimes(1);
    expect(policy.createHTML.mock.calls[0]![0]).toContain('skam-document');
    expect(mountSpy.mock.calls[0]![2]!.trustedTypesPolicy).toBe(policy);
    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(parseSpy.mock.calls[0]![1]).toEqual({ trustedTypesPolicy: policy });
    expect(parseSpy.mock.calls[0]![1]!.trustedTypesPolicy).toBe(policy);
    expect(content(el).querySelector('.skam-document')).not.toBeNull();
    expect(el.trustedTypesPolicy).toBe(policy);
  });

  it('calls parse without options when no policy is set', async () => {
    const { renders } = mountElement();
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(parseSpy.mock.calls[0]).toHaveLength(1);
  });

  it('reports a fatal error and adds no style when parse throws (the policy threw on the XML)', async () => {
    parseSpy.mockImplementation(() => {
      throw new Error('policy refused the xml');
    });
    const { el, errors, renders } = createElement();
    el.trustedTypesPolicy = { createHTML: (s: string) => s };
    document.body.append(el);
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    await nextFrames();
    expect(errors).toHaveLength(1);
    expect(errors[0]!.detail.recoverable).toBe(false);
    expect(errors[0]!.detail.error.message).toBe('policy refused the xml');
    expect(renders).toHaveLength(0);
    expect(mountSpy).not.toHaveBeenCalled();
    expect(content(el).childNodes).toHaveLength(1);
    expect(content(el).firstElementChild?.getAttribute('role')).toBe('alert');
    expect(skamStyles(el)).toHaveLength(0);
  });

  it('accepts the setter value type as both ParseOptions and MountOptions trustedTypesPolicy', () => {
    type SetterValue = NonNullable<SkamRendererElement['trustedTypesPolicy']>;
    expectTypeOf<SetterValue>().toExtend<NonNullable<ParseOptions['trustedTypesPolicy']>>();
    expectTypeOf<SetterValue>().toExtend<NonNullable<MountOptions['trustedTypesPolicy']>>();
    const value: SetterValue = { createHTML: (s: string) => s };
    const forParse: ParseOptions['trustedTypesPolicy'] = value;
    const forMount: MountOptions['trustedTypesPolicy'] = value;
    expect(forParse).toBe(forMount);
  });

  it('reports a fatal error and leaves only the alert when createHTML throws', async () => {
    const policy = {
      createHTML: () => {
        throw new Error('policy refused');
      },
    };
    const { el, errors, renders } = createElement();
    el.trustedTypesPolicy = policy;
    document.body.append(el);
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    await nextFrames();
    expect(errors).toHaveLength(1);
    expect(errors[0]!.detail.recoverable).toBe(false);
    expect(errors[0]!.detail.error.message).toBe('policy refused');
    expect(renders).toHaveLength(0);
    expect(content(el).childNodes).toHaveLength(1);
    expect(content(el).firstElementChild?.getAttribute('role')).toBe('alert');
    expect(content(el).firstElementChild?.textContent).toBe('policy refused');
    expect(skamStyles(el)).toHaveLength(0);
  });

  it('does not re-render when the same policy is assigned again', async () => {
    const policy = { createHTML: (s: string) => s };
    const { el, renders } = createElement();
    el.trustedTypesPolicy = policy;
    document.body.append(el);
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    el.trustedTypesPolicy = policy;
    await nextFrames();
    expect(renders).toHaveLength(1);
    expect(mountSpy).toHaveBeenCalledTimes(1);
  });

  it('re-renders when a different policy is assigned', async () => {
    const { el, renders } = createElement();
    el.trustedTypesPolicy = { createHTML: (s: string) => s };
    document.body.append(el);
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    el.trustedTypesPolicy = { createHTML: (s: string) => s };
    await vi.waitFor(() => expect(renders).toHaveLength(2));
  });

  it('treats null as no policy: getter returns undefined and createHTML is not called', async () => {
    const policy = { createHTML: vi.fn((s: string) => s) };
    const { el, renders } = createElement();
    el.trustedTypesPolicy = policy;
    document.body.append(el);
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    policy.createHTML.mockClear();

    el.trustedTypesPolicy = null;
    expect(el.trustedTypesPolicy).toBeUndefined();
    await vi.waitFor(() => expect(renders).toHaveLength(2));
    expect(policy.createHTML).not.toHaveBeenCalled();
    expect(mountSpy.mock.calls.at(-1)![2]!.trustedTypesPolicy).toBeUndefined();
  });

  it('reports a fatal error and adds no style when createHTML is not a function', async () => {
    const { el, errors, renders } = createElement();
    el.trustedTypesPolicy = { createHTML: 1 } as unknown as { createHTML(s: string): unknown };
    document.body.append(el);
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    await nextFrames();
    expect(errors).toHaveLength(1);
    expect(errors[0]!.detail.recoverable).toBe(false);
    expect(errors[0]!.detail.error).toBeInstanceOf(TypeError);
    expect(renders).toHaveLength(0);
    expect(skamStyles(el)).toHaveLength(0);
  });
});
