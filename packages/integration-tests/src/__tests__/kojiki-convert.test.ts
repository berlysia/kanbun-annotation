/**
 * wikitext → 本文 (kojiki-source.txt) の変換と、取得 CLI の失敗時の振る舞い。
 * ネットワークは使わない (fetch は stub)。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { convertVolumes, convertWikitext } from '../fixtures/kojiki/convert-wikitext.ts';
import { fetchWikitext, KOJIKI_PAGES, runUpdateSource } from '../fixtures/kojiki/update-source.ts';

/** エラーの文言が、すべての断片を含むこと */
function messageOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('expected the call to throw');
}

describe('convertWikitext', () => {
  it('converts {{ul}} to {u:}', () => {
    expect(convertWikitext('臣{{ul|安萬侣}}言：')).toEqual(['臣{u:安萬侣}言：']);
  });

  it('converts {{另}} to {v:}', () => {
    expect(convertWikitext('氣象未{{另|效|敷/敦}}，無名')).toEqual(['氣象未{v:效|敷/敦}，無名']);
  });

  it('converts {{*}} to {n:}', () => {
    expect(convertWikitext('神倭伊波禮毘古命。{{*|自伊下五字以音。}}與其')).toEqual([
      '神倭伊波禮毘古命。{n:自伊下五字以音。}與其',
    ]);
  });

  it('turns a heading and two paragraphs into three lines', () => {
    expect(convertWikitext('== 序 ==\n甲乙。\n\n丙丁。\n')).toEqual(['序', '甲乙。', '丙丁。']);
  });

  it('turns each paragraph in a blockquote into a line', () => {
    expect(convertWikitext('<blockquote>甲乙。\n\n丙丁。</blockquote>')).toEqual([
      '甲乙。',
      '丙丁。',
    ]);
  });

  it('joins lines of one paragraph', () => {
    expect(convertWikitext('甲乙\n丙丁')).toEqual(['甲乙丙丁']);
  });

  it('replaces 〓[説明] with 〓', () => {
    expect(convertWikitext('出雲之石〓[石＋司]之')).toEqual(['出雲之石〓之']);
  });

  it('replaces a bracketed IDS with 〓', () => {
    expect(convertWikitext('氣[⿰方尓]自清')).toEqual(['氣〓自清']);
  });

  it('replaces a nested IDS inside a variant with one 〓', () => {
    expect(convertWikitext('{{另|璁|⿱⿰王尓心}}之')).toEqual(['{v:璁|〓}之']);
  });

  it('converts ＜X＞ to {n:} and drops the quotes', () => {
    expect(convertWikitext('田郎女。＜「三柱」。＞')).toEqual(['田郎女。{n:三柱。}']);
  });

  it('drops <ref> and the frame templates', () => {
    expect(
      convertWikitext(
        '{{header2\n| title = [[../]]\n}}\n甲<ref>真福寺本作「敷」</ref>乙\n{{reflist}}'
      )
    ).toEqual(['甲乙']);
  });

  it('keeps the characters inside {{right}}', () => {
    expect(convertWikitext('{{right|甲{{ul|乙}}丙。}}')).toEqual(['甲{u:乙}丙。']);
  });

  it('flattens notation nested in {{*}} and {{ul}}', () => {
    expect(convertWikitext('{{*|訓{{另|立|並}}云}}')).toEqual(['{n:訓立云}']);
    expect(convertWikitext('{{ul|紫{{另|宸|震}}}}而')).toEqual(['{u:紫宸}而']);
  });

  it('drops a heading that only introduces the reflist', () => {
    expect(convertWikitext('甲\n\n== 註釋 ==\n{{reflist}}\n')).toEqual(['甲']);
  });

  it('maps the katakana ト typo to 〓', () => {
    expect(convertWikitext('食ト。')).toEqual(['食〓。']);
  });

  it('rejects a Latin letter with its code point and the line number', () => {
    const message = messageOf(() => convertWikitext('甲\nabc'));
    expect(message).toContain('U+0061');
    expect(message).toContain('line 2');
  });

  it.each([
    ['U+200B', '甲\u200B乙'],
    ['U+202E', '甲\u202E乙'],
    ['U+0007', '甲\u0007乙'],
  ])('rejects %s with its code point and the line number', (codePoint, text) => {
    const message = messageOf(() => convertWikitext(`甲\n${text}`));
    expect(message).toContain(codePoint);
    expect(message).toContain('line 2');
  });

  it('rejects an unknown template with its name and the line number', () => {
    const message = messageOf(() => convertWikitext('甲\n乙{{foo|x}}'));
    expect(message).toContain('foo');
    expect(message).toContain('line 2');
  });

  it('rejects an unknown tag', () => {
    expect(() => convertWikitext('甲<br>乙')).toThrow(/<br>/);
  });
});

describe('fetchWikitext', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fails on a redirect response and asks fetch not to follow redirects', async () => {
    const stub = vi.fn(
      async () => new Response(null, { status: 302, headers: { location: 'https://example.com/' } })
    );
    vi.stubGlobal('fetch', stub);
    await expect(fetchWikitext(1)).rejects.toThrow(/302/);
    expect(stub).toHaveBeenCalledWith(
      'https://zh.wikisource.org/w/index.php?oldid=1&action=raw',
      expect.objectContaining({ redirect: 'error' })
    );
  });

  it('fails when the body exceeds 2 MB even without Content-Length', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    });
    vi.stubGlobal('fetch', async () => new Response(body, { status: 200 }));
    await expect(fetchWikitext(1)).rejects.toThrow(/2 MB|size/i);
  });

  it('returns the text of a small response', async () => {
    vi.stubGlobal('fetch', async () => new Response('甲乙', { status: 200 }));
    await expect(fetchWikitext(1)).resolves.toBe('甲乙');
  });
});

describe('runUpdateSource', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  const GOOD_WIKITEXT = '甲乙。\n\n丙丁。';
  const goodText = convertVolumes({
    上卷: GOOD_WIKITEXT,
    中卷: GOOD_WIKITEXT,
    下卷: GOOD_WIKITEXT,
  });
  const sha = (text: string): string => createHash('sha256').update(text).digest('hex');
  const GOOD_SHA = sha(goodText);

  function setup(): { cachePath: string; cacheDir: string } {
    dir = mkdtempSync(join(tmpdir(), 'kojiki-convert-'));
    const cacheDir = join(dir, 'cache', 'kojiki');
    return { cachePath: join(cacheDir, 'kojiki-source.txt'), cacheDir };
  }

  function run(
    cachePath: string,
    fetchPage: (rev: number) => Promise<string>,
    expectedSha256: string = GOOD_SHA
  ): Promise<{ code: number; log: string }> {
    const lines: string[] = [];
    return runUpdateSource({
      cachePath,
      expectedSha256,
      fetchPage,
      log: (line) => lines.push(line),
    }).then((code) => ({ code, log: lines.join('\n') }));
  }

  const goodFetch = async (): Promise<string> => GOOD_WIKITEXT;

  it('does not fetch when the cache matches the sha256', async () => {
    const { cachePath, cacheDir } = setup();
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cachePath, goodText);
    const fetchPage = vi.fn(goodFetch);
    const { code, log } = await run(cachePath, fetchPage);
    expect(code).toBe(0);
    expect(fetchPage).not.toHaveBeenCalled();
    expect(log).toMatch(/cached/);
    expect(readFileSync(cachePath, 'utf8')).toBe(goodText);
  });

  it('creates the directory and writes the cache, leaving no temp file', async () => {
    const { cachePath, cacheDir } = setup();
    const { code, log } = await run(cachePath, goodFetch);
    expect(code).toBe(0);
    expect(readdirSync(cacheDir)).toEqual(['kojiki-source.txt']);
    expect(log).toMatch(/sha256 [0-9a-f]{64}/);
  });

  it('exits 1 and creates nothing when the converted sha256 differs', async () => {
    const { cachePath } = setup();
    const { code, log } = await run(cachePath, async () => '甲乙丙。');
    expect(code).toBe(1);
    expect(log).toContain(`expected ${GOOD_SHA}`);
    expect(log).toMatch(/actual +[0-9a-f]{64}/);
    expect(log).toMatch(/changed or deleted/);
    expect(readdirSync(dir!)).toEqual([]);
  });

  it.each([
    ['one character off', (p: string) => writeFileSync(p, goodText.replace('甲', '乙'))],
    ['empty', (p: string) => writeFileSync(p, '')],
    [
      'a symlink',
      (p: string) => {
        writeFileSync(join(dir!, 'other.txt'), goodText);
        symlinkSync(join(dir!, 'other.txt'), p);
      },
    ],
  ])('fetches again when the cache is %s', async (_label, prepare) => {
    const { cachePath, cacheDir } = setup();
    mkdirSync(cacheDir, { recursive: true });
    prepare(cachePath);
    const fetchPage = vi.fn(goodFetch);
    const { code } = await run(cachePath, fetchPage);
    expect(code).toBe(0);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(readFileSync(cachePath, 'utf8')).toBe(goodText);
    expect(readdirSync(cacheDir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('keeps the old cache and exits 1 when the third page fails', async () => {
    const { cachePath, cacheDir } = setup();
    mkdirSync(cacheDir, { recursive: true });
    const stale = goodText.replace('甲', '乙');
    writeFileSync(cachePath, stale);
    const { code, log } = await run(cachePath, async (rev) => {
      if (rev === KOJIKI_PAGES[2].rev) throw new Error(`HTTP 500 for rev ${rev}`);
      return GOOD_WIKITEXT;
    });
    expect(code).toBe(1);
    expect(log).toMatch(/HTTP 500/);
    expect(readFileSync(cachePath, 'utf8')).toBe(stale);
    expect(readdirSync(cacheDir)).toEqual(['kojiki-source.txt']);
  });

  it('exits 1 without touching anything when the temp file already exists', async () => {
    const { cachePath, cacheDir } = setup();
    mkdirSync(cacheDir, { recursive: true });
    const tmpPath = `${cachePath}.${process.pid}.tmp`;
    writeFileSync(tmpPath, 'left by another run');
    const { code } = await run(cachePath, goodFetch);
    expect(code).toBe(1);
    expect(readFileSync(tmpPath, 'utf8')).toBe('left by another run');
    expect(existsSync(cachePath)).toBe(false);
  });

  it('does not write through a symlink at the temp path', async () => {
    const { cachePath, cacheDir } = setup();
    mkdirSync(cacheDir, { recursive: true });
    const target = join(dir!, 'victim.txt');
    writeFileSync(target, 'victim');
    symlinkSync(target, `${cachePath}.${process.pid}.tmp`);
    const { code } = await run(cachePath, goodFetch);
    expect(code).toBe(1);
    expect(readFileSync(target, 'utf8')).toBe('victim');
    expect(existsSync(cachePath)).toBe(false);
  });

  it.each([
    ['a redirect', async (): Promise<string> => Promise.reject(new Error('HTTP 302'))],
    [
      'an oversized body',
      async (): Promise<string> => Promise.reject(new Error('2 MB size limit')),
    ],
  ])('exits 1 and writes nothing on %s', async (_label, fetchPage) => {
    const { cachePath } = setup();
    const { code } = await run(cachePath, fetchPage);
    expect(code).toBe(1);
    expect(readdirSync(dir!)).toEqual([]);
  });
});
