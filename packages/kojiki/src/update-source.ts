/**
 * 本文のキャッシュ (パッケージ直下の .cache/kojiki-source.txt) を用意する。CLI の入口は cli.ts
 * (`pnpm --filter @kanbun-skam/kojiki run fetch`、build が先に要る)。`pnpm bench` の前段と、
 * deploy-playground.yml のページの書き出しで走る。
 *
 * キャッシュが定数の sha256 と一致すれば何もしない (ネットワークを使わない)。無い・空・symlink・
 * 不一致なら、版 (rev) を固定した zh.wikisource の wikitext を取って変換し、変換後の sha256 が
 * 定数と一致したときだけ、一時ファイル経由で書く。host と rev はこのファイルの定数で、引数では
 * 変えられない。取得した wikitext はファイルに残さない。
 */

import { createHash } from 'node:crypto';
import { closeSync, constants, mkdirSync, openSync, renameSync, rmSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';
import { readVerifiedSource } from './build-document.ts';
import { convertVolumes, KOJIKI_VOLUMES, type KojikiVolume } from './convert-wikitext.ts';
import { KOJIKI_PAGES } from './source-pin.ts';

const WIKISOURCE_HOST = 'https://zh.wikisource.org';
const FETCH_TIMEOUT_MS = 30_000;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;

export function wikitextUrl(rev: number): string {
  return `${WIKISOURCE_HOST}/w/index.php?oldid=${rev}&action=raw`;
}

/** 失敗の理由 (応答の本文は含めない) */
export class FetchPageError extends Error {
  override readonly name = 'FetchPageError';
}

/**
 * 1 ページの wikitext を取る。リダイレクトは辿らない。
 * 読み込んだ実際のバイト数で上限を見る (Content-Length は信用しない)。
 */
export async function fetchWikitext(rev: number): Promise<string> {
  const url = wikitextUrl(rev);
  let response: Response;
  try {
    response = await globalThis.fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    const kind = error instanceof Error ? error.name : 'unknown error';
    throw new FetchPageError(`${url}: request failed (${kind})`, { cause: error });
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new FetchPageError(`${url}: HTTP ${response.status}`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new FetchPageError(`${url}: empty response`);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_PAGE_BYTES) {
        await reader.cancel();
        throw new FetchPageError(`${url}: response exceeds the 2 MB size limit`);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof FetchPageError) throw error;
    const kind = error instanceof Error ? error.name : 'unknown error';
    throw new FetchPageError(`${url}: reading the body failed (${kind})`, { cause: error });
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
}

export interface UpdateSourceOptions {
  readonly cachePath: string;
  readonly expectedSha256: string;
  readonly fetchPage: (rev: number) => Promise<string>;
  readonly log: (line: string) => void;
}

function errorLabel(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 終了コードを返す。書くのは、変換後の sha256 が expectedSha256 と一致したときだけ */
export async function runUpdateSource(options: UpdateSourceOptions): Promise<number> {
  const { cachePath, expectedSha256, fetchPage, log } = options;
  try {
    readVerifiedSource(cachePath, expectedSha256);
    log(`cached: ${cachePath}`);
    return 0;
  } catch (error) {
    // 無い・空・symlink・不一致はどれも取り直す。理由だけ出す
    log(`fetching (${errorLabel(error)})`);
  }
  let text: string;
  try {
    const wikitext = {} as Record<KojikiVolume, string>;
    for (const page of KOJIKI_PAGES) wikitext[page.volume] = await fetchPage(page.rev);
    text = convertVolumes(wikitext);
  } catch (error) {
    log(
      `update-source failed: ${errorLabel(error)}\n` +
        'Re-run the workflow (workflow_dispatch) once wikisource is reachable.'
    );
    return 1;
  }
  const actualSha256 = createHash('sha256').update(text).digest('hex');
  if (actualSha256 !== expectedSha256) {
    log(
      `update-source failed: sha256 of the converted text does not match\n` +
        `  expected ${expectedSha256}\n  actual   ${actualSha256}\n` +
        'The source revision may have been changed or deleted. If you bumped the revision or the ' +
        'conversion on purpose, update KOJIKI_SOURCE_SHA256 and KOJIKI_TOKEN_COUNT in source-pin.ts. ' +
        'Otherwise re-run the workflow (workflow_dispatch) once wikisource is reachable.'
    );
    return 1;
  }
  const tmpPath = `${cachePath}.${process.pid}.tmp`;
  let created = false;
  try {
    mkdirSync(dirname(cachePath), { recursive: true });
    // wx (排他作成): 先にある一時ファイルや symlink を開かず、書き換えない
    const fd = openSync(tmpPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o644);
    created = true;
    try {
      writeSync(fd, text);
    } finally {
      closeSync(fd);
    }
    renameSync(tmpPath, cachePath);
  } catch (error) {
    // 自分が作った一時ファイルだけを消す (先にあったものは触らない)
    if (created) rmSync(tmpPath, { force: true });
    log(
      `update-source failed: could not write ${cachePath} (${error instanceof Error ? error.name : 'unknown error'})`
    );
    return 1;
  }
  const lines = text.split('\n');
  lines.pop();
  const counts = KOJIKI_VOLUMES.map((volume, idx) => {
    const start = lines.indexOf(`# ${volume}`);
    const next = KOJIKI_VOLUMES[idx + 1];
    const stop = next === undefined ? lines.length : lines.indexOf(`# ${next}`);
    return `${volume} ${stop - start - 1}`;
  });
  log(`revs: ${KOJIKI_PAGES.map((p) => `${p.volume} ${p.rev}`).join(', ')}`);
  log(`lines: ${counts.join(', ')}`);
  log(`sha256 ${actualSha256}`);
  log(`wrote ${cachePath}`);
  return 0;
}
