import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parse } from '@kanbun-skam/skam-xml-parser';
import { mount as mountRenderer } from '@kanbun-skam/skam-html-renderer';
import { SkamRendererElement } from '../skam-renderer.js';

// 例外の経路だけを差し替えるため、元の実装を呼ぶ vi.fn にしておく。
// このファイルの外には影響しない (vi.mock はファイル単位)。
vi.mock('@kanbun-skam/skam-xml-parser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kanbun-skam/skam-xml-parser')>();
  return { ...actual, parse: vi.fn(actual.parse) };
});
vi.mock('@kanbun-skam/skam-html-renderer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kanbun-skam/skam-html-renderer')>();
  return { ...actual, mount: vi.fn(actual.mount) };
});

if (!customElements.get('skam-renderer')) {
  customElements.define('skam-renderer', SkamRendererElement);
}

const parseMock = vi.mocked(parse);
const mountMock = vi.mocked(mountRenderer);
let actualParse: typeof parse;
let actualMount: typeof mountRenderer;

const FRAMES = 5;

const VALID =
  '<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>甲</skam:block></skam:body></skam:doc>';
// parse が SKAMXMLParseError を投げる、閉じていない XML
const BROKEN_A = '<skam:doc xmlns:skam="urn:skam:1"><skam:body>';
const BROKEN_B = '<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>';

async function nextFrames(n = FRAMES): Promise<void> {
  for (let i = 0; i < n; i++) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function mount(xml: string, attrs: Record<string, string> = {}) {
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

/** parse の呼び出し回数が total になる (= 描画が 1 回終わる) のを待つ */
const waitParseCalls = (total: number) =>
  vi.waitFor(() => expect(parseMock).toHaveBeenCalledTimes(total));

beforeEach(async () => {
  const parser = await vi.importActual<typeof import('@kanbun-skam/skam-xml-parser')>(
    '@kanbun-skam/skam-xml-parser'
  );
  const html = await vi.importActual<typeof import('@kanbun-skam/skam-html-renderer')>(
    '@kanbun-skam/skam-html-renderer'
  );
  actualParse = parser.parse;
  actualMount = html.mount;
  parseMock.mockReset();
  parseMock.mockImplementation(actualParse);
  mountMock.mockReset();
  mountMock.mockImplementation(actualMount);
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('fatal error notification (K2)', () => {
  it('notifies once for the same broken XML across re-renders and keeps the same alert node', async () => {
    const { el, errors } = mount(BROKEN_A);
    await waitParseCalls(1);
    expect(errors).toHaveLength(1);
    const alert = content(el).firstElementChild;
    expect(alert?.getAttribute('role')).toBe('alert');

    // 同じ内容での再描画を setter で起こす。
    el.xmlContent = BROKEN_A;
    await waitParseCalls(2);
    el.xmlContent = BROKEN_A;
    await waitParseCalls(3);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.detail.recoverable).toBe(false);
    expect(content(el).childNodes).toHaveLength(1);
    expect(content(el).firstElementChild === alert).toBe(true);
  });

  it('notifies again when the broken XML changes', async () => {
    const { el, errors } = mount(BROKEN_A);
    await waitParseCalls(1);
    el.xmlContent = BROKEN_B;
    await waitParseCalls(2);
    expect(errors).toHaveLength(2);
  });

  it('notifies again after a successful render', async () => {
    const { el, errors, renders } = mount(BROKEN_A);
    await waitParseCalls(1);
    el.xmlContent = VALID;
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    el.xmlContent = BROKEN_A;
    await waitParseCalls(3);
    expect(errors).toHaveLength(2);
    expect(renders).toHaveLength(1);
  });

  it('notifies again after a blocked render clears the memory', async () => {
    const { el, errors } = mount(BROKEN_A);
    await waitParseCalls(1);
    el.setAttribute('profile', 'no-such-profile');
    await vi.waitFor(() => expect(errors).toHaveLength(2));
    el.removeAttribute('profile');
    await waitParseCalls(2);
    expect(errors).toHaveLength(3);
    expect(errors.map((e) => e.detail.attribute)).toEqual([undefined, 'profile', undefined]);
  });

  it('notifies again after the element is disconnected and reconnected', async () => {
    const { el, errors } = mount(BROKEN_A);
    await waitParseCalls(1);
    el.remove();
    document.body.append(el);
    await waitParseCalls(2);
    expect(errors).toHaveLength(2);
  });

  it('notifies again after the XML was emptied', async () => {
    const { el, errors } = mount(BROKEN_A);
    await waitParseCalls(1);
    // 空の XML への変更は setter で起こす
    el.xmlContent = '';
    await nextFrames();
    expect(parseMock).toHaveBeenCalledTimes(1);
    el.xmlContent = undefined;
    await waitParseCalls(2);
    expect(errors).toHaveLength(2);
  });

  it('treats a thrown string as an error and notifies once for the same one', async () => {
    parseMock.mockImplementation(() => {
      throw 'boom';
    });
    const { el, errors } = mount(VALID);
    await waitParseCalls(1);
    el.xmlContent = VALID;
    await waitParseCalls(2);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.detail.error).toBe('boom');
    expect(errors[0]!.detail.recoverable).toBe(false);
  });

  it('treats a thrown object whose String() matches as the same error', async () => {
    const thrown = {};
    parseMock.mockImplementation(() => {
      throw thrown;
    });
    const { el, errors } = mount(VALID);
    await waitParseCalls(1);
    el.xmlContent = VALID;
    await waitParseCalls(2);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.detail.error).toBe(thrown);
  });

  it('notifies once and leaves only the alert when mount throws after writing the body', async () => {
    // 本物の mount が本文と CSS を書いた後に投げる (mount の中の補正が投げた場合に相当する)
    mountMock.mockImplementation((...args) => {
      actualMount(...args);
      throw new Error('calibrate failed');
    });
    const { el, errors, renders } = mount(VALID);
    await waitParseCalls(1);
    el.xmlContent = VALID;
    await waitParseCalls(2);
    el.xmlContent = VALID;
    await waitParseCalls(3);
    expect(errors).toHaveLength(1);
    expect(renders).toHaveLength(0);
    expect(content(el).childNodes).toHaveLength(1);
    expect(content(el).firstElementChild?.getAttribute('role')).toBe('alert');
    expect(content(el).querySelector('.skam-document')).toBeNull();
  });

  it('does not re-notify when only a valid attribute changes', async () => {
    const { el, errors } = mount(BROKEN_A);
    await waitParseCalls(1);
    const alert = content(el).firstElementChild;
    el.setAttribute('writing-mode', 'vertical');
    await waitParseCalls(2);
    expect(errors).toHaveLength(1);
    expect(content(el).firstElementChild === alert).toBe(true);
  });
});
