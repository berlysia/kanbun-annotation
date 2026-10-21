/**
 * キャッシュのパスは、src/ から読んでも dist/ から読んでも (どちらもパッケージの直下から 1 段)
 * パッケージ直下の .cache/ を指す。dist/ から実行する fetch (CLI) と、src/ から読むテストや bench で
 * 同じファイルを使うための契約。
 */

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { getKojikiCachePath, KOJIKI_CACHE_PATH } from '../build-document.ts';

describe('getKojikiCachePath', () => {
  it('points at <pkg>/.cache/kojiki-source.txt from a src module and from a dist module', () => {
    expect(getKojikiCachePath('file:///work/pkg/src/build-document.ts')).toBe(
      '/work/pkg/.cache/kojiki-source.txt'
    );
    expect(getKojikiCachePath('file:///work/pkg/dist/index.js')).toBe(
      '/work/pkg/.cache/kojiki-source.txt'
    );
  });

  it('resolves KOJIKI_CACHE_PATH inside this package', () => {
    const pkgDir = fileURLToPath(new URL('../../', import.meta.url));
    expect(KOJIKI_CACHE_PATH).toBe(`${pkgDir}.cache/kojiki-source.txt`);
  });
});
