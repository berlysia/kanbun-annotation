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
import { readVerifiedSource } from './build-document.ts';
import { convertVolumes, KOJIKI_VOLUMES, type KojikiVolume } from './convert-wikitext.ts';
import { fetchPinned, writeFileAtomically } from './pinned-fetch.ts';
import { KOJIKI_PAGES } from './source-pin.ts';

const WIKISOURCE_HOST = 'zh.wikisource.org';
const FETCH_TIMEOUT_MS = 30_000;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;

export function wikitextUrl(rev: number): string {
  return `https://${WIKISOURCE_HOST}/w/index.php?oldid=${rev}&action=raw`;
}

/**
 * 1 ページの wikitext を取る。安全の契約 (https、host、redirect の拒否、上限、時間) は
 * fetchPinned が強制する。
 */
export async function fetchWikitext(rev: number): Promise<string> {
  const bytes = await fetchPinned(wikitextUrl(rev), {
    allowedHosts: [WIKISOURCE_HOST],
    maxBytes: MAX_PAGE_BYTES,
    timeoutMs: FETCH_TIMEOUT_MS,
  });
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
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
  try {
    writeFileAtomically(cachePath, text);
  } catch (error) {
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
