import { describe, it, expect, vi, afterEach } from 'vitest';
import type { AccessibleLabels } from '@kanbun-skam/skam-html-renderer';
import { SkamRendererElement } from '../skam-renderer.js';

if (!customElements.get('skam-renderer')) {
  customElements.define('skam-renderer', SkamRendererElement);
}

const FRAMES = 5;

const XML =
  '<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>學而<skam:kaeri kind="re"/>時習之</skam:block></skam:body></skam:doc>';
const XML_B = XML.replace('學', '乙');
const BROKEN = '<skam:doc xmlns:skam="urn:skam:1"><skam:body>';

type Labels = Partial<AccessibleLabels>;
/** 型に合わない値を代入するテスト用 */
const bad = (value: unknown) => value as Labels;

async function nextFrames(n = FRAMES): Promise<void> {
  for (let i = 0; i < n; i++) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function mount(
  attrs: Record<string, string> = { 'reading-layer-source': 'display' },
  labels?: Labels,
  xml = XML
) {
  const el = document.createElement('skam-renderer') as SkamRendererElement;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  const errors: CustomEvent[] = [];
  const renders: CustomEvent[] = [];
  el.addEventListener('skam-error', (e) => errors.push(e as CustomEvent));
  el.addEventListener('skam-render', (e) => renders.push(e as CustomEvent));
  if (labels !== undefined) el.accessibleLabels = labels;
  el.textContent = xml;
  document.body.append(el);
  return { el, errors, renders };
}

const reading = (el: HTMLElement) => el.shadowRoot!.querySelector('.skam-reading');
const readingText = (el: HTMLElement) => reading(el)?.textContent ?? '';
const labelErrors = (errors: CustomEvent[]) =>
  errors.filter((e) => e.detail.attribute === 'accessibleLabels');

const INVALID = () => ({ foo: () => '' }) as unknown as Labels;

afterEach(() => {
  document.body.replaceChildren();
});

describe('accessibleLabels property (K3)', () => {
  it('uses the labels for the reading layer when reading-layer-source is display', async () => {
    const { el, errors, renders } = mount(undefined, { kaeri: () => 'X' });
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(readingText(el)).toContain('X');
    expect(errors).toHaveLength(0);
  });

  it('ignores the labels without reading-layer-source=display', async () => {
    const { el, errors, renders } = mount({}, { kaeri: () => 'X' });
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(readingText(el)).not.toContain('X');
    expect(errors).toHaveLength(0);
  });

  it('validates the labels even without reading-layer-source=display', async () => {
    const { errors, renders } = mount({}, INVALID());
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(errors).toHaveLength(1);
    expect(errors[0]!.detail).toMatchObject({ recoverable: true, attribute: 'accessibleLabels' });
  });

  it.each([
    ['a non-function value', { kaeri: 'x' }],
    ['an array', []],
    ['a string', 'str'],
    ['zero', 0],
  ])('reports %s once and still renders the body', async (_name, value) => {
    const { el, errors, renders } = mount(undefined, bad(value));
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(el.shadowRoot!.querySelector('.skam-document')).not.toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]!.detail).toMatchObject({ recoverable: true, attribute: 'accessibleLabels' });
  });

  it('treats a getter that throws a RangeError as invalid', async () => {
    const labels = {
      get kaeri(): () => string {
        throw new RangeError('getter failed');
      },
    };
    const { errors, renders } = mount(undefined, labels);
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(errors).toHaveLength(1);
    expect(errors[0]!.detail).toMatchObject({ recoverable: true, attribute: 'accessibleLabels' });
  });

  it('forgets the invalid labels when they become unspecified', async () => {
    const invalid = INVALID();
    const { el, errors, renders } = mount(undefined, invalid);
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    el.accessibleLabels = bad(null);
    await vi.waitFor(() => expect(renders).toHaveLength(2));
    el.accessibleLabels = invalid;
    await vi.waitFor(() => expect(renders).toHaveLength(3));
    expect(errors).toHaveLength(2);
  });

  it('notifies again for another invalid reference', async () => {
    const { el, errors, renders } = mount(undefined, INVALID());
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    el.accessibleLabels = INVALID();
    await vi.waitFor(() => expect(renders).toHaveLength(2));
    expect(errors).toHaveLength(2);
  });

  it('keeps the memory while the XML is empty', async () => {
    const { el, errors, renders } = mount(undefined, INVALID());
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    // happy-dom の MutationObserver は通知を落とすことがあるため、再描画は setter で起こす
    el.xmlContent = '';
    await nextFrames();
    expect(errors).toHaveLength(1);
    el.xmlContent = XML;
    await vi.waitFor(() => expect(renders).toHaveLength(2));
    expect(errors).toHaveLength(1);
  });

  it('renders the body and notifies once, not again on re-render', async () => {
    const { el, errors, renders } = mount(undefined, INVALID());
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(el.shadowRoot!.querySelector('.skam-document')).not.toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]!.detail).toMatchObject({ recoverable: true, attribute: 'accessibleLabels' });
    el.xmlContent = XML_B;
    await vi.waitFor(() => expect(renders).toHaveLength(2));
    expect(errors).toHaveLength(1);
  });

  it('applies valid labels after an invalid one, and notifies for a new invalid reference', async () => {
    const { el, errors, renders } = mount(undefined, INVALID());
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    el.accessibleLabels = { kaeri: () => 'X' };
    await vi.waitFor(() => expect(renders).toHaveLength(2));
    expect(errors).toHaveLength(1);
    expect(readingText(el)).toContain('X');
    el.accessibleLabels = INVALID();
    await vi.waitFor(() => expect(renders).toHaveLength(3));
    expect(errors).toHaveLength(2);
  });

  it('returns undefined for null and renders with the default reading', async () => {
    const { el, errors, renders } = mount();
    el.accessibleLabels = bad(null);
    expect(el.accessibleLabels).toBeUndefined();
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(readingText(el)).toContain('レ点');
    expect(errors).toHaveLength(0);
  });

  it('does not schedule a render for the same reference', async () => {
    const labels: Labels = { kaeri: () => 'X' };
    const { el, renders } = mount(undefined, labels);
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    el.accessibleLabels = labels;
    await nextFrames();
    expect(renders).toHaveLength(1);
  });

  it('does not loop when a label function assigns the same reference', async () => {
    const holder: { el?: SkamRendererElement } = {};
    const labels: Labels = {
      kaeri: () => {
        holder.el!.accessibleLabels = labels;
        return 'X';
      },
    };
    const { el, renders } = mount(undefined, labels);
    holder.el = el;
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    await nextFrames();
    expect(renders).toHaveLength(1);
  });

  it('escapes the label result exactly once', async () => {
    const { el, renders } = mount(undefined, { kaeri: () => '<img src=x onerror=alert(1)>' });
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(el.shadowRoot!.querySelector('img')).toBeNull();
    expect(readingText(el)).toContain('<img src=x onerror=alert(1)>');

    el.accessibleLabels = { kaeri: () => 'a&b' };
    await vi.waitFor(() => expect(renders).toHaveLength(2));
    expect(readingText(el)).toContain('a&b');
    expect(readingText(el)).not.toContain('&amp;');
  });

  it('omits only the note when a label function throws, without a notification', async () => {
    const { el, errors, renders } = mount(undefined, {
      kaeri: () => {
        throw new Error('x');
      },
    });
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(el.shadowRoot!.querySelector('.skam-document')).not.toBeNull();
    expect(reading(el)).not.toBeNull();
    expect(errors).toHaveLength(0);
  });

  it.each([
    ['a number', () => 123],
    ['an empty string', () => ''],
  ])('omits only the note when a label returns %s, without a notification', async (_n, fn) => {
    const { el, errors, renders } = mount(undefined, bad({ kaeri: fn }));
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(el.shadowRoot!.querySelector('.skam-document')).not.toBeNull();
    expect(errors).toHaveLength(0);
  });

  it('notifies again for the same invalid labels after a valid one in between', async () => {
    const invalid = INVALID();
    const { el, errors, renders } = mount(undefined, invalid);
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    el.accessibleLabels = { kaeri: () => 'X' };
    await vi.waitFor(() => expect(renders).toHaveLength(2));
    el.accessibleLabels = invalid;
    await vi.waitFor(() => expect(renders).toHaveLength(3));
    expect(labelErrors(errors)).toHaveLength(2);
  });

  it('does not re-notify when an unrelated attribute changes', async () => {
    const { el, errors, renders } = mount(
      {
        'reading-layer-source': 'display',
        'writing-mode': 'vertical',
      },
      INVALID()
    );
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    el.setAttribute('writing-mode', 'horizontal');
    await vi.waitFor(() => expect(renders).toHaveLength(2));
    expect(errors).toHaveLength(1);
  });

  it('notifies again after the element is disconnected and reconnected', async () => {
    const { el, errors, renders } = mount(undefined, INVALID());
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    el.remove();
    document.body.append(el);
    await vi.waitFor(() => expect(renders).toHaveLength(2));
    expect(errors).toHaveLength(2);
  });

  it('holds the label notification back while a fatal error stops the render', async () => {
    const { el, errors, renders } = mount(undefined, INVALID(), BROKEN);
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(errors[0]!.detail.recoverable).toBe(false);
    expect(errors[0]!.detail.attribute).toBeUndefined();
    el.xmlContent = XML;
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(errors).toHaveLength(2);
    expect(errors[1]!.detail).toMatchObject({ recoverable: true, attribute: 'accessibleLabels' });
  });

  it('holds the label notification back while a blocked attribute stops the render', async () => {
    const { el, errors, renders } = mount(
      { 'reading-layer-source': 'display', profile: 'no-such-profile' },
      INVALID()
    );
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(errors[0]!.detail.attribute).toBe('profile');
    el.removeAttribute('profile');
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    expect(errors).toHaveLength(2);
    expect(errors[1]!.detail).toMatchObject({ recoverable: true, attribute: 'accessibleLabels' });
  });

  it('notifies the label error after the attribute errors and before skam-render', async () => {
    const order: string[] = [];
    const el = document.createElement('skam-renderer') as SkamRendererElement;
    el.setAttribute('reading-layer-source', 'display');
    el.setAttribute('writing-mode', 'diagonal');
    el.addEventListener('skam-error', (e) =>
      order.push(`error:${(e as CustomEvent).detail.attribute}`)
    );
    el.addEventListener('skam-render', () => order.push('render'));
    el.accessibleLabels = INVALID();
    el.xmlContent = XML;
    document.body.append(el);
    await vi.waitFor(() => expect(order).toContain('render'));
    expect(order).toEqual(['error:writing-mode', 'error:accessibleLabels', 'render']);
  });

  it('treats labels that become invalid on the second read as a fatal error, once', async () => {
    let reads = 0;
    const labels = {
      get kaeri(): unknown {
        reads += 1;
        return reads === 1 ? () => 'X' : 'str';
      },
    };
    const { errors } = mount(undefined, bad(labels));
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(errors[0]!.detail.recoverable).toBe(false);
    await nextFrames();
    expect(errors).toHaveLength(1);
  });

  it('does not re-render when the contents of the same object are mutated', async () => {
    const obj: Labels = { kaeri: () => 'X' };
    const { el, renders } = mount(undefined, obj);
    await vi.waitFor(() => expect(renders).toHaveLength(1));
    obj.kaeri = () => 'Y';
    el.accessibleLabels = obj;
    await nextFrames();
    expect(renders).toHaveLength(1);
    expect(readingText(el)).toContain('X');
  });
});
