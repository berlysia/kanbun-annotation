import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const saved = {
  HTMLElement: globalThis.HTMLElement,
  customElements: globalThis.customElements,
};

describe('SSR import (K8)', () => {
  beforeEach(() => {
    vi.resetModules();
    Reflect.deleteProperty(globalThis, 'HTMLElement');
    Reflect.deleteProperty(globalThis, 'customElements');
    expect(typeof (globalThis as { HTMLElement?: unknown }).HTMLElement).toBe('undefined');
  });
  afterEach(() => {
    Object.assign(globalThis, saved);
    vi.resetModules();
  });

  it('imports index without HTMLElement / customElements', async () => {
    await expect(import('../index.js')).resolves.toBeDefined();
  });

  it('imports auto without HTMLElement / customElements', async () => {
    await expect(import('../auto.js')).resolves.toBeDefined();
  });
});
