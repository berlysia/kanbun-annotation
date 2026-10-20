import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { SKAMRenderProfileError } from '@kanbun-skam/skam/rendering';

// ADR-033 KD10: IIFE 版は skam を内包した別のコピーで、vm の context は別の realm
describe('canvas-renderer の IIFE 版が投げる SKAMRenderProfileError', () => {
  it('skam の ESM 版のクラスに対して instanceof が真', () => {
    const require = createRequire(import.meta.url);
    let bundlePath: string;
    try {
      bundlePath = require.resolve('@kanbun-skam/skam-canvas-renderer/browser-bundle');
    } catch {
      bundlePath = '';
    }
    if (!bundlePath || !existsSync(bundlePath)) {
      throw new Error(
        '@kanbun-skam/skam-canvas-renderer/browser-bundle (dist/index.iife.js) が見つからない。先に `pnpm build` を実行する'
      );
    }

    const context = vm.createContext({});
    vm.runInContext(readFileSync(bundlePath, 'utf8'), context);
    const caught: unknown = vm.runInContext(
      `(() => { try { SKAMCanvasRenderer.resolveRenderProfile({ okurigna: false }); } catch (e) { return e; } })()`,
      context
    );

    expect(caught).toBeDefined();
    expect(caught instanceof SKAMRenderProfileError).toBe(true);
    expect((caught as SKAMRenderProfileError).kind).toBe('UNKNOWN_KEY');
  });
});
