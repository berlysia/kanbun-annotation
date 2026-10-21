/**
 * `pnpm --filter @kanbun-skam/playground build:kojiki`。`pnpm playground:build` の後で、dist に
 * kojiki.html と kojiki-calibrate.js を足す。本文は初回に取得する (要ネットワーク。deploy-playground.yml
 * の段だけが走らせる)。手順は build-kojiki-page-core.ts。
 */

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import {
  buildKojikiDocument,
  fetchWikitext,
  KOJIKI_CACHE_PATH,
  KOJIKI_SOURCE_SHA256,
  KOJIKI_TOKEN_COUNT,
  runUpdateSource,
} from '@kanbun-skam/kojiki';
import { buildKojikiPage } from './build-kojiki-page-core.ts';

const playgroundDir = join(import.meta.dirname, '..');
const MIN_PAGE_BYTES = 1024 * 1024;

async function bundleCalibrate(): Promise<string> {
  const result = await build({
    root: playgroundDir,
    configFile: false,
    publicDir: false,
    logLevel: 'warn',
    build: {
      // write: false なので何も書かれない。outDir は dist に触れないための保険
      outDir: join(tmpdir(), 'kojiki-calibrate-unused'),
      emptyOutDir: false,
      write: false,
      cssCodeSplit: false,
      lib: {
        entry: join(playgroundDir, 'src/kojiki-page/calibrate.ts'),
        formats: ['es'],
        fileName: () => 'kojiki-calibrate.js',
      },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((entry) =>
    'output' in entry ? entry.output : []
  );
  const chunks = outputs.filter((output) => output.type === 'chunk');
  if (
    outputs.length !== 1 ||
    chunks.length !== 1 ||
    chunks[0]!.fileName !== 'kojiki-calibrate.js'
  ) {
    throw new Error(`unexpected bundle output: ${outputs.map((o) => o.fileName).join(', ')}`);
  }
  return chunks[0]!.code;
}

process.exitCode = await buildKojikiPage({
  distDir: join(playgroundDir, 'dist'),
  prepareSource: () =>
    runUpdateSource({
      cachePath: KOJIKI_CACHE_PATH,
      expectedSha256: KOJIKI_SOURCE_SHA256,
      fetchPage: fetchWikitext,
      log: (line) => console.log(line),
    }),
  buildDocument: (volume) => buildKojikiDocument({ volume, synthetic: false }),
  bundleCalibrate,
  expected: { tokenCount: KOJIKI_TOKEN_COUNT, minPageBytes: MIN_PAGE_BYTES },
  log: (line) => console.log(line),
});
