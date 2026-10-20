import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Window } from 'happy-dom';
import type { SKAMDocument } from '@kanbun-skam/skam';

vi.mock('../calibrate.js', () => ({ calibrateGridBaseline: vi.fn() }));

import { mount, type MountOptions } from '../mount.js';
import { render, SKAMRenderProfileError } from '../index.js';
import { calibrateGridBaseline } from '../calibrate.js';

const calibrate = vi.mocked(calibrateGridBaseline);

function makeDoc(text: string, withOkurigana = false): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [{ id: 't1', text }],
    blocks: [{ id: 'b1', tokenIds: ['t1'] }],
    marks: withOkurigana
      ? [{ id: 'm1', type: 'okurigana', anchor: { tokenId: 't1' }, text: 'ヒミツ' } as never]
      : [],
    readings: [],
  };
}

const doc = makeDoc('甲');

function connectedContainer(parent: ParentNode = document.body): HTMLElement {
  const el = document.createElement('div');
  parent.appendChild(el);
  return el;
}

function skamStyles(root: ParentNode = document): HTMLStyleElement[] {
  return Array.from(root.querySelectorAll<HTMLStyleElement>('style[data-skam-css]'));
}

function setFonts(target: Document, ready: Promise<unknown>): void {
  Object.defineProperty(target, 'fonts', { configurable: true, value: { ready } });
}

function removeFonts(target: Document): void {
  Reflect.deleteProperty(target, 'fonts');
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  calibrate.mockReset();
  removeFonts(document);
});

afterEach(() => {
  vi.restoreAllMocks();
  removeFonts(document);
});

describe('mount: basic behavior', () => {
  it('inserts html, css once, calibrates once and returns render() output', () => {
    const container = connectedContainer();
    const result = mount(container, doc);
    const expected = render(doc);
    expect(container.innerHTML).toBe(expected.html);
    expect(result.html).toBe(expected.html);
    expect(result.css).toBe(expected.css);
    const styles = skamStyles(document.head);
    expect(styles).toHaveLength(1);
    expect(styles[0]?.textContent).toBe(expected.css);
    expect(calibrate).toHaveBeenCalledTimes(1);
    expect(calibrate).toHaveBeenCalledWith(container, { variablePrefix: 'skam' });
  });

  it('passes variablePrefix to calibration', () => {
    mount(connectedContainer(), doc, { variablePrefix: 'x' });
    expect(calibrate).toHaveBeenCalledWith(expect.anything(), { variablePrefix: 'x' });
  });

  it('adds a single style for two containers with the same options', () => {
    mount(connectedContainer(), doc);
    mount(connectedContainer(), makeDoc('乙'));
    expect(skamStyles()).toHaveLength(1);
  });

  it('adds a single style when mounting twice into the same container, and both fontsCalibrated resolve', async () => {
    const container = connectedContainer();
    const first = mount(container, doc);
    const second = mount(container, makeDoc('乙'));
    expect(skamStyles()).toHaveLength(1);
    expect(container.innerHTML).toBe(render(makeDoc('乙')).html);
    await expect(first.fontsCalibrated).resolves.toBeUndefined();
    await expect(second.fontsCalibrated).resolves.toBeUndefined();
  });

  it('does not duplicate the style across module copies', async () => {
    mount(connectedContainer(), doc);
    vi.resetModules();
    const other = await import('../mount.js');
    other.mount(connectedContainer(), doc);
    expect(skamStyles()).toHaveLength(1);
  });

  it('adds a second style when the options (css) differ', () => {
    mount(connectedContainer(), doc, { classPrefix: 'a' });
    mount(connectedContainer(), doc, { classPrefix: 'b' });
    expect(skamStyles()).toHaveLength(2);
  });

  it('re-inserts the style after it was removed from the DOM', () => {
    mount(connectedContainer(), doc);
    skamStyles()[0]?.remove();
    mount(connectedContainer(), doc);
    expect(skamStyles()).toHaveLength(1);
  });

  it('puts the style in the shadow root for a container inside a shadow root', () => {
    const host = connectedContainer();
    const shadow = host.attachShadow({ mode: 'open' });
    const container = document.createElement('div');
    shadow.appendChild(container);
    mount(container, doc);
    expect(skamStyles(shadow)).toHaveLength(1);
    expect(skamStyles(document.head)).toHaveLength(0);
    mount(container, doc);
    expect(skamStyles(shadow)).toHaveLength(1);
  });

  it('puts the style in the container own document, not the global one', () => {
    const other = new Window().document as unknown as Document;
    const container = other.createElement('div');
    other.body.appendChild(container);
    mount(container, doc);
    expect(skamStyles(other.head)).toHaveLength(1);
    expect(skamStyles(document.head)).toHaveLength(0);
    expect(skamStyles(other.head)[0]?.ownerDocument).toBe(other);
  });
});

describe('mount: nonce', () => {
  it('sets the nonce on the created style', () => {
    mount(connectedContainer(), doc, { nonce: 'abc' });
    expect(skamStyles()[0]?.nonce).toBe('abc');
  });

  it('reuses a style only when its nonce matches', () => {
    mount(connectedContainer(), doc);
    expect(skamStyles()).toHaveLength(1);
    mount(connectedContainer(), doc, { nonce: 'abc' });
    expect(skamStyles()).toHaveLength(2);
    mount(connectedContainer(), doc, { nonce: 'abc' });
    expect(skamStyles()).toHaveLength(2);
  });

  it('reuses a nonce-bearing style when no nonce is requested', () => {
    mount(connectedContainer(), doc, { nonce: 'abc' });
    mount(connectedContainer(), doc);
    expect(skamStyles()).toHaveLength(1);
  });
});

describe('mount: trustedTypesPolicy', () => {
  it('calls createHTML once with render().html and inserts its return value', () => {
    const createHTML = vi.fn((s: string) => `<!--policy-->${s}`);
    const container = connectedContainer();
    mount(container, doc, { trustedTypesPolicy: { createHTML } });
    expect(createHTML).toHaveBeenCalledTimes(1);
    expect(createHTML).toHaveBeenCalledWith(render(doc).html);
    expect(container.innerHTML).toBe(`<!--policy-->${render(doc).html}`);
  });

  it('does not call createHTML when no policy is given', () => {
    const createHTML = vi.fn((s: string) => s);
    mount(connectedContainer(), doc);
    expect(createHTML).not.toHaveBeenCalled();
  });

  it('does not call createHTML or touch the DOM for invalid options', () => {
    const createHTML = vi.fn((s: string) => s);
    const container = connectedContainer();
    expect(() =>
      mount(container, doc, {
        trustedTypesPolicy: { createHTML },
        classPrefix: 'a"><script>',
      })
    ).toThrow();
    expect(createHTML).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe('');
    expect(skamStyles()).toHaveLength(0);
  });

  it('rethrows a createHTML error without changing the DOM', () => {
    const container = connectedContainer();
    expect(() =>
      mount(container, doc, {
        trustedTypesPolicy: {
          createHTML: () => {
            throw new Error('policy rejected');
          },
        },
      })
    ).toThrow('policy rejected');
    expect(container.innerHTML).toBe('');
    expect(skamStyles()).toHaveLength(0);
    expect(calibrate).not.toHaveBeenCalled();
  });

  it('calls createHTML once even with nonce (style text bypasses the policy)', () => {
    const createHTML = vi.fn((s: string) => s);
    mount(connectedContainer(), doc, { nonce: 'abc', trustedTypesPolicy: { createHTML } });
    expect(createHTML).toHaveBeenCalledTimes(1);
  });

  it('accepts the shape returned by trustedTypes.createPolicy (type check)', () => {
    // TrustedHTML-like return value; DOM typings of trustedTypes vary by TypeScript version.
    const policy = {
      name: 'p',
      createHTML: (s: string): { toString(): string } => ({ toString: () => s }),
    };
    const options: MountOptions = { trustedTypesPolicy: policy };
    const container = connectedContainer();
    mount(container, doc, options);
    expect(container.innerHTML).toBe(render(doc).html);
  });
});

describe('mount: errors leave the DOM untouched', () => {
  it('throws TypeError for a disconnected container', () => {
    const container = document.createElement('div');
    expect(() => mount(container, doc)).toThrow(TypeError);
    expect(container.innerHTML).toBe('');
    expect(document.head.innerHTML).toBe('');
    expect(calibrate).not.toHaveBeenCalled();
  });

  it('throws SKAMRenderProfileError for an invalid profile', () => {
    const container = connectedContainer();
    expect(() => mount(container, doc, { profile: { okurigna: false } as never })).toThrow(
      SKAMRenderProfileError
    );
    expect(container.innerHTML).toBe('');
    expect(document.head.innerHTML).toBe('');
  });
});

describe('mount: readingLayerSource display', () => {
  it('does not leak hidden annotations into the reading layer', () => {
    const container = connectedContainer();
    const d = makeDoc('甲', true);
    mount(container, d, {
      profile: { base: 'full', overrides: { okurigana: false } } as never,
      readingLayerSource: 'display',
    });
    expect(container.innerHTML).not.toContain('ヒミツ');
  });
});

describe('mount: fonts', () => {
  it('resolves immediately and calibrates once when document.fonts is absent', async () => {
    const result = mount(connectedContainer(), doc);
    await expect(result.fontsCalibrated).resolves.toBeUndefined();
    expect(calibrate).toHaveBeenCalledTimes(1);
  });

  it('reads fonts.ready after the first calibration and calibrates again once ready resolves', async () => {
    let resolveReady!: () => void;
    const ready = new Promise<void>((r) => {
      resolveReady = r;
    });
    const readSpy = vi.fn();
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        get ready() {
          readSpy(calibrate.mock.calls.length);
          return ready;
        },
      },
    });
    const container = connectedContainer();
    const result = mount(container, doc);
    expect(readSpy).toHaveBeenCalledTimes(1);
    expect(readSpy).toHaveBeenCalledWith(1);
    expect(calibrate).toHaveBeenCalledTimes(1);
    resolveReady();
    await result.fontsCalibrated;
    expect(calibrate).toHaveBeenCalledTimes(2);
    expect(calibrate).toHaveBeenLastCalledWith(container, { variablePrefix: 'skam' });
  });

  it('skips the second calibration when the container was removed before ready', async () => {
    let resolveReady!: () => void;
    setFonts(
      document,
      new Promise<void>((r) => {
        resolveReady = r;
      })
    );
    const container = connectedContainer();
    const result = mount(container, doc);
    container.remove();
    resolveReady();
    await expect(result.fontsCalibrated).resolves.toBeUndefined();
    expect(calibrate).toHaveBeenCalledTimes(1);
  });

  it('resolves and warns when the second calibration throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setFonts(document, Promise.resolve());
    const boom = new Error('boom');
    calibrate
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {
        throw boom;
      });
    const result = mount(connectedContainer(), doc);
    await expect(result.fontsCalibrated).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'skam mount: calibrateGridBaseline failed after fonts loaded',
      boom
    );
  });

  it('resolves and warns when fonts.ready rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failure = new Error('fonts failed');
    setFonts(document, Promise.reject(failure));
    const result = mount(connectedContainer(), doc);
    await expect(result.fontsCalibrated).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(calibrate).toHaveBeenCalledTimes(1);
  });
});
