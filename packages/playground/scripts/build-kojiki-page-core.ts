/**
 * 古事記のページ (dist/kojiki.html と dist/kojiki-calibrate.js) を書き出す手順。副作用のうち、
 * ネットワークを使うもの (本文の用意) と vite の bundle は deps で受け取り、テストでは偽物にする。
 * Node の type stripping で直接読まれる (相対 import に .ts を付け、enum などは使わない)。
 */

import { existsSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { KOJIKI_PAGES } from '@kanbun-skam/kojiki';
import type { KojikiVolume } from '@kanbun-skam/kojiki';
import type { SKAMDocument } from '@kanbun-skam/skam';
import { render } from '@kanbun-skam/skam-html-renderer';
import { buildKojikiPageHtml } from '../src/kojiki-page/page.ts';
import type { KojikiRenderedVolumes } from '../src/kojiki-page/page.ts';

export interface BuildKojikiPageDeps {
  /** playground の build の出力先。index.html が先にあること */
  readonly distDir: string;
  /** 本文のキャッシュを用意する (0 で成功)。ネットワークを使いうる */
  readonly prepareSource: () => Promise<number>;
  readonly buildDocument: (volume: KojikiVolume) => SKAMDocument;
  /** calibrate.ts を bundle した JavaScript を返す */
  readonly bundleCalibrate: () => Promise<string>;
  /** 書く前の事後条件の基準 */
  readonly expected: { readonly tokenCount: number; readonly minPageBytes: number };
  readonly log: (line: string) => void;
}

// 名前空間の URI (SVG など) は取得を起こさないので許す
const W3C_NAMESPACE_URI = /http:\/\/www\.w3\.org\/[^\s"'`)]*/g;

function findExternalUrl(source: string): string | undefined {
  return /https?:\/\/[^\s"'`)]*/.exec(source.replace(W3C_NAMESPACE_URI, ''))?.[0];
}

/** 同じディレクトリの一時ファイルに書く。rename は全部書けてから */
function writeAllAtomically(files: readonly { path: string; content: string }[]): void {
  const temporaries = files.map((file) => `${file.path}.${process.pid}.tmp`);
  try {
    files.forEach((file, i) => writeFileSync(temporaries[i]!, file.content, { flag: 'wx' }));
    files.forEach((file, i) => renameSync(temporaries[i]!, file.path));
  } catch (error) {
    for (const temporary of temporaries) rmSync(temporary, { force: true });
    throw error;
  }
}

function errorLabel(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 終了コードを返す。事後条件を満たさなければ、何も書かずに 1 */
export async function buildKojikiPage(deps: BuildKojikiPageDeps): Promise<number> {
  const { distDir, log } = deps;
  if (!existsSync(join(distDir, 'index.html'))) {
    log(`${join(distDir, 'index.html')} is missing. Run \`pnpm playground:build\` first.`);
    return 1;
  }
  if ((await deps.prepareSource()) !== 0) {
    log('kojiki-page failed: the Kojiki source is not available');
    return 1;
  }

  let rendered: KojikiRenderedVolumes;
  let pageHtml: string;
  try {
    const [first, second, third] = KOJIKI_PAGES.map((page) => {
      const doc = deps.buildDocument(page.volume);
      const { html, css } = render(doc, { writingMode: 'vertical' });
      return { html, css, tokenCount: doc.tokens.length };
    });
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error('expected three volumes');
    }
    rendered = [first, second, third];
    pageHtml = buildKojikiPageHtml(rendered);
  } catch (error) {
    log(`kojiki-page failed: ${errorLabel(error)}`);
    return 1;
  }

  const tokenTotal = rendered.reduce((sum, volume) => sum + volume.tokenCount, 0);
  const pageBytes = Buffer.byteLength(pageHtml);
  const problems: string[] = [];
  if (rendered.some((volume) => volume.tokenCount < 1)) problems.push('a volume has no token');
  if (tokenTotal !== deps.expected.tokenCount) {
    problems.push(`token total ${tokenTotal} differs from ${deps.expected.tokenCount}`);
  }
  if (pageBytes < deps.expected.minPageBytes) {
    problems.push(`page is ${pageBytes} bytes, expected at least ${deps.expected.minPageBytes}`);
  }
  for (const id of ['kami', 'naka', 'shimo']) {
    if (!pageHtml.includes(`<section id="${id}">`)) problems.push(`section#${id} is missing`);
  }
  if (problems.length > 0) {
    log(`kojiki-page failed: ${problems.join('; ')}`);
    return 1;
  }

  let calibrateJs: string;
  try {
    calibrateJs = await deps.bundleCalibrate();
  } catch (error) {
    log(`kojiki-page failed: bundling calibrate.ts (${errorLabel(error)})`);
    return 1;
  }
  const externalUrl = findExternalUrl(calibrateJs);
  if (externalUrl !== undefined) {
    log(`kojiki-page failed: the calibrate bundle contains an external URL (${externalUrl})`);
    return 1;
  }

  const pagePath = join(distDir, 'kojiki.html');
  const calibratePath = join(distDir, 'kojiki-calibrate.js');
  try {
    writeAllAtomically([
      { path: calibratePath, content: calibrateJs },
      { path: pagePath, content: pageHtml },
    ]);
  } catch (error) {
    log(`kojiki-page failed: could not write (${errorLabel(error)})`);
    return 1;
  }
  log(`wrote ${pagePath} (${pageBytes} bytes)`);
  log(`wrote ${calibratePath} (${Buffer.byteLength(calibrateJs)} bytes)`);
  log(
    `tokens: ${rendered.map((volume, i) => `${KOJIKI_PAGES[i]!.volume} ${volume.tokenCount}`).join(', ')} (total ${tokenTotal})`
  );
  return 0;
}
