/**
 * KanbunKundoku の取得の配線。安全の契約そのもの (https、host、上限、時間) は
 * packages/kojiki/src/__tests__/pinned-fetch.test.ts が検査する。ここは 2 ファイルの形で、
 * 「cache が合えば取得しない」「片方が違えば両方とも書かない」ことと、固定した値の形を確かめる。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensurePinnedFiles } from '@kanbun-skam/kojiki';
import {
  KUNDOKU_ALLOWED_HOSTS,
  KUNDOKU_COMMIT,
  KUNDOKU_MAX_BYTES,
  KUNDOKU_TIMEOUT_MS,
} from '../kundoku/source-pin.ts';
import { kundokuPinnedFiles } from '../kundoku/update-source.ts';

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

describe('kundokuPinnedFiles', () => {
  it('points at the pinned commit on an allowed host, with 64-hex sha256 and cache paths in the dir', () => {
    const files = kundokuPinnedFiles('/work/cache');
    expect(files.map((file) => file.url)).toEqual([
      `https://raw.githubusercontent.com/shiryusann/KanbunKundoku/${KUNDOKU_COMMIT}/annotated/test.json`,
      `https://raw.githubusercontent.com/shiryusann/KanbunKundoku/${KUNDOKU_COMMIT}/annotated_two_types/test.json`,
    ]);
    expect(KUNDOKU_COMMIT).toMatch(/^[0-9a-f]{40}$/);
    for (const file of files) {
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(file.cachePath.startsWith('/work/cache/')).toBe(true);
      expect(KUNDOKU_ALLOWED_HOSTS).toContain(new URL(file.url).hostname);
    }
    expect(new Set(files.map((file) => file.cachePath)).size).toBe(2);
  });
});

describe('ensurePinnedFiles with two files', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  function twoFiles(): { url: string; sha256: string; cachePath: string }[] {
    dir = mkdtempSync(join(tmpdir(), 'kundoku-update-'));
    return [
      {
        url: 'https://raw.githubusercontent.com/o/r/c/a.json',
        sha256: sha('[1]'),
        cachePath: join(dir, 'a.json'),
      },
      {
        url: 'https://raw.githubusercontent.com/o/r/c/b.json',
        sha256: sha('[2]'),
        cachePath: join(dir, 'b.json'),
      },
    ];
  }

  const options = {
    allowedHosts: KUNDOKU_ALLOWED_HOSTS,
    maxBytes: KUNDOKU_MAX_BYTES,
    timeoutMs: KUNDOKU_TIMEOUT_MS,
    log: () => {},
  };

  it('does not fetch when both caches match', async () => {
    const files = twoFiles();
    mkdirSync(dir!, { recursive: true });
    writeFileSync(files[0]!.cachePath, '[1]');
    writeFileSync(files[1]!.cachePath, '[2]');
    const fetch = vi.fn();
    expect(await ensurePinnedFiles({ ...options, files, fetch })).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('writes neither file when one fetched body has a different sha256', async () => {
    const files = twoFiles();
    const code = await ensurePinnedFiles({
      ...options,
      files,
      fetch: async (url) => Buffer.from(url === files[0]!.url ? '[1]' : '[3]'),
    });
    expect(code).toBe(1);
    expect(existsSync(files[0]!.cachePath)).toBe(false);
    expect(existsSync(files[1]!.cachePath)).toBe(false);
  });

  it('writes both files when both match', async () => {
    const files = twoFiles();
    const code = await ensurePinnedFiles({
      ...options,
      files,
      fetch: async (url) => Buffer.from(url === files[0]!.url ? '[1]' : '[2]'),
    });
    expect(code).toBe(0);
    expect(readFileSync(files[0]!.cachePath, 'utf8')).toBe('[1]');
    expect(readFileSync(files[1]!.cachePath, 'utf8')).toBe('[2]');
  });
});
