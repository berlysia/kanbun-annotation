/**
 * KanbunKundoku の 2 つのファイルの cache を用意する。CLI の入口は cli.ts。
 * 取得と照合の安全の契約は @kanbun-skam/kojiki の ensurePinnedFiles にある。
 */

import { ensurePinnedFiles, type PinnedFile } from '@kanbun-skam/kojiki';
import { join } from 'node:path';
import {
  KUNDOKU_ALLOWED_HOSTS,
  KUNDOKU_ANNOTATED,
  KUNDOKU_CACHE_DIR,
  KUNDOKU_MAX_BYTES,
  KUNDOKU_TIMEOUT_MS,
  KUNDOKU_TWO_TYPES,
  kundokuRawUrl,
} from './source-pin.ts';

export function kundokuPinnedFiles(cacheDir: string = KUNDOKU_CACHE_DIR): PinnedFile[] {
  return [KUNDOKU_ANNOTATED, KUNDOKU_TWO_TYPES].map((file) => ({
    url: kundokuRawUrl(file.path),
    sha256: file.sha256,
    cachePath: join(cacheDir, file.cacheName),
  }));
}

/** 終了コードを返す */
export function runKundokuUpdateSource(log: (line: string) => void): Promise<number> {
  return ensurePinnedFiles({
    files: kundokuPinnedFiles(),
    allowedHosts: KUNDOKU_ALLOWED_HOSTS,
    maxBytes: KUNDOKU_MAX_BYTES,
    timeoutMs: KUNDOKU_TIMEOUT_MS,
    log,
  });
}
