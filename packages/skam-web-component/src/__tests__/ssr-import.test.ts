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

  // resetModules の後の import は依存を変換し直す。単独では約 100 ms だが、全パッケージを並列に流す負荷の下で
  // import に 27 秒かかった記録があるので、既定の 5 秒でなくその 2 倍強を待つ
  const IMPORT_TIMEOUT_MS = 60_000;

  it(
    'imports index without HTMLElement / customElements',
    { timeout: IMPORT_TIMEOUT_MS },
    async () => {
      await expect(import('../index.js')).resolves.toBeDefined();
    }
  );

  it(
    'imports auto without HTMLElement / customElements',
    { timeout: IMPORT_TIMEOUT_MS },
    async () => {
      await expect(import('../auto.js')).resolves.toBeDefined();
    }
  );
});
