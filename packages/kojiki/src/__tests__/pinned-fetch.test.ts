/**
 * 取得の共通部品 (fetchPinned、ensurePinnedFiles)。ネットワークは使わず、globalThis.fetch か
 * ensurePinnedFiles の fetch を差し替える。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensurePinnedFiles, fetchPinned } from '../pinned-fetch.ts';

const OPTIONS = { allowedHosts: ['raw.githubusercontent.com'], maxBytes: 16, timeoutMs: 1000 };
const URL_OK = 'https://raw.githubusercontent.com/o/r/abc/a.json';
const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchPinned', () => {
  it.each([
    ['http scheme', 'http://raw.githubusercontent.com/a'],
    ['host not allowed', 'https://example.com/a'],
    ['host with an allowed host as a prefix', 'https://raw.githubusercontent.com.evil.example/a'],
    ['host with an allowed host as a suffix', 'https://evilraw.githubusercontent.com/a'],
    ['non-default port', 'https://raw.githubusercontent.com:8443/a'],
    ['credentials', 'https://user:pw@raw.githubusercontent.com/a'],
    ['not a URL', 'raw.githubusercontent.com/a'],
  ])('rejects %s before calling fetch', async (_label, url) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchPinned(url, OPTIONS)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the body bytes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('hello'))
    );
    expect(Buffer.from(await fetchPinned(URL_OK, OPTIONS)).toString()).toBe('hello');
  });

  it('passes redirect: error to fetch', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('x'));
    vi.stubGlobal('fetch', fetchMock);
    await fetchPinned(URL_OK, OPTIONS);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error' });
  });

  it('rejects a redirect response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(null, { status: 302, headers: { location: 'https://evil.example/' } })
      )
    );
    await expect(fetchPinned(URL_OK, OPTIONS)).rejects.toThrow(/redirect/);
  });

  it('rejects a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('no', { status: 404 }))
    );
    await expect(fetchPinned(URL_OK, OPTIONS)).rejects.toThrow(/HTTP 404/);
  });

  it('stops a body of maxBytes + 1 bytes without a Content-Length', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(OPTIONS.maxBytes + 1));
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body))
    );
    await expect(fetchPinned(URL_OK, OPTIONS)).rejects.toThrow(/exceeds/);
  });

  it('accepts a body of exactly maxBytes bytes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array(OPTIONS.maxBytes)))
    );
    expect((await fetchPinned(URL_OK, OPTIONS)).byteLength).toBe(OPTIONS.maxBytes);
  });

  it('stops a body that stalls midway at the time limit', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1));
        // close しない: 続きが来ない
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body))
    );
    await expect(fetchPinned(URL_OK, { ...OPTIONS, timeoutMs: 50 })).rejects.toThrow(
      /reading the body failed/
    );
  });
});

describe('ensurePinnedFiles', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  function setup(): { dir: string; files: { url: string; sha256: string; cachePath: string }[] } {
    dir = mkdtempSync(join(tmpdir(), 'pinned-fetch-'));
    return {
      dir,
      files: [
        { url: `${URL_OK}/1`, sha256: sha('one'), cachePath: join(dir, 'cache', '1.json') },
        { url: `${URL_OK}/2`, sha256: sha('two'), cachePath: join(dir, 'cache', '2.json') },
      ],
    };
  }

  const run = (
    files: { url: string; sha256: string; cachePath: string }[],
    fetch: (url: string) => Promise<Uint8Array>
  ): Promise<number> => ensurePinnedFiles({ ...OPTIONS, files, fetch, log: () => {} });

  it('fetches nothing and returns 0 when every cache matches', async () => {
    const { dir: d, files } = setup();
    const fetchMock = vi.fn();
    mkdirSync(join(d, 'cache'));
    writeFileSync(files[0]!.cachePath, 'one');
    writeFileSync(files[1]!.cachePath, 'two');
    expect(await run(files, fetchMock)).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('writes both files when both fetched bodies match', async () => {
    const { files } = setup();
    const bodies = new Map([
      [files[0]!.url, 'one'],
      [files[1]!.url, 'two'],
    ]);
    expect(await run(files, async (url) => Buffer.from(bodies.get(url)!))).toBe(0);
    expect(readFileSync(files[0]!.cachePath, 'utf8')).toBe('one');
    expect(readFileSync(files[1]!.cachePath, 'utf8')).toBe('two');
  });

  it('writes neither file and returns 1 when one sha256 does not match', async () => {
    const { files } = setup();
    const lines: string[] = [];
    const code = await ensurePinnedFiles({
      ...OPTIONS,
      files,
      fetch: async (url) => Buffer.from(url === files[0]!.url ? 'one' : 'tampered'),
      log: (line) => lines.push(line),
    });
    expect(code).toBe(1);
    expect(existsSync(files[0]!.cachePath)).toBe(false);
    expect(existsSync(files[1]!.cachePath)).toBe(false);
    const message = lines.join('\n');
    expect(message).toContain(files[1]!.url);
    expect(message).toContain(`expected ${sha('two')}`);
    expect(message).toContain(`actual   ${sha('tampered')}`);
  });

  it('writes nothing and returns 1 when a fetch fails', async () => {
    const { files } = setup();
    const code = await run(files, async (url) => {
      if (url === files[1]!.url) throw new Error('network down');
      return Buffer.from('one');
    });
    expect(code).toBe(1);
    expect(existsSync(files[0]!.cachePath)).toBe(false);
  });

  it('fetches only the files whose cache does not match', async () => {
    const { dir: d, files } = setup();
    mkdirSync(join(d, 'cache'));
    writeFileSync(files[0]!.cachePath, 'one');
    writeFileSync(files[1]!.cachePath, 'stale');
    const fetchMock = vi.fn(async () => Buffer.from('two'));
    expect(await run(files, fetchMock)).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readFileSync(files[1]!.cachePath, 'utf8')).toBe('two');
  });
});
