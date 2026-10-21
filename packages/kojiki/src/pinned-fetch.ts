/**
 * 版を固定した外部ファイルの取得と cache の共通部品。古事記 (update-source.ts) と、integration-tests の
 * KanbunKundoku の取得が使う。呼び出し側ごとに安全の契約を持たないよう、https・host の完全一致・
 * 上限・時間の制限・redirect の拒否はここで強制し、呼び出し側は値だけを渡す。
 */

import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from 'node:fs';
import { dirname } from 'node:path';

export interface FetchPinnedOptions {
  /** 後方一致は使わない。host 名の完全一致だけを許す */
  readonly allowedHosts: readonly string[];
  readonly maxBytes: number;
  /** 本文の読み込みの終わりまでを覆う */
  readonly timeoutMs: number;
}

/** 失敗の理由 (応答の本文は含めない) */
export class PinnedFetchError extends Error {
  override readonly name = 'PinnedFetchError';
}

function assertAllowedUrl(url: string, allowedHosts: readonly string[]): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (error) {
    throw new PinnedFetchError(`${url}: not a valid URL`, { cause: error });
  }
  if (parsed.protocol !== 'https:') throw new PinnedFetchError(`${url}: only https is allowed`);
  if (parsed.username !== '' || parsed.password !== '') {
    throw new PinnedFetchError(`${url}: credentials in the URL are not allowed`);
  }
  if (parsed.port !== '') throw new PinnedFetchError(`${url}: a non-default port is not allowed`);
  if (!allowedHosts.includes(parsed.hostname)) {
    throw new PinnedFetchError(`${url}: host ${parsed.hostname} is not allowed`);
  }
}

/**
 * URL のバイト列を取る。redirect は辿らない。
 * 読み込んだ実際のバイト数で上限を見る (Content-Length は信用しない)。
 */
export async function fetchPinned(url: string, options: FetchPinnedOptions): Promise<Uint8Array> {
  const { allowedHosts, maxBytes, timeoutMs } = options;
  assertAllowedUrl(url, allowedHosts);
  const signal = AbortSignal.timeout(timeoutMs);
  // 本文を読む途中で止まった応答も時間の上限で止める (読み取りの待ちと競わせる)
  const timedOut = new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  timedOut.catch(() => {});
  const label = (error: unknown): string => (error instanceof Error ? error.name : 'unknown error');

  let response: Response;
  try {
    response = await Promise.race([globalThis.fetch(url, { redirect: 'error', signal }), timedOut]);
  } catch (error) {
    throw new PinnedFetchError(`${url}: request failed (${label(error)})`, { cause: error });
  }
  if (response.redirected || (response.status >= 300 && response.status < 400)) {
    await response.body?.cancel();
    throw new PinnedFetchError(`${url}: redirects are not followed (HTTP ${response.status})`);
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new PinnedFetchError(`${url}: HTTP ${response.status}`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new PinnedFetchError(`${url}: empty response`);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), timedOut]);
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new PinnedFetchError(`${url}: response exceeds the size limit (${maxBytes} bytes)`);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof PinnedFetchError) throw error;
    await reader.cancel().catch(() => {});
    throw new PinnedFetchError(`${url}: reading the body failed (${label(error)})`, {
      cause: error,
    });
  }
  return Buffer.concat(chunks);
}

/**
 * 一時ファイルに排他作成 (wx) で書いてから rename する。先にある一時ファイルや symlink を開かず、
 * 書き換えない。失敗したときは、自分が作った一時ファイルだけを消して投げる。
 */
export function writeFileAtomically(path: string, data: string | Uint8Array): void {
  const tmpPath = `${path}.${process.pid}.tmp`;
  let created = false;
  try {
    mkdirSync(dirname(path), { recursive: true });
    const fd = openSync(tmpPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o644);
    created = true;
    try {
      if (typeof data === 'string') writeSync(fd, data);
      else writeSync(fd, data);
    } finally {
      closeSync(fd);
    }
    renameSync(tmpPath, path);
  } catch (error) {
    if (created) rmSync(tmpPath, { force: true });
    throw error;
  }
}

export interface PinnedFile {
  readonly url: string;
  /** 小文字 64 桁の sha256 */
  readonly sha256: string;
  readonly cachePath: string;
}

export interface EnsurePinnedFilesOptions extends FetchPinnedOptions {
  readonly files: readonly PinnedFile[];
  /** 省くと fetchPinned。テストが差し替える */
  readonly fetch?: (url: string) => Promise<Uint8Array>;
  readonly log: (line: string) => void;
}

function errorLabel(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** cache を O_NOFOLLOW で開いて 1 回だけ読む。読めなければ理由を返す */
function readCache(path: string): { bytes: Buffer } | { reason: string } {
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    return { reason: `cannot open ${path} (${(error as NodeJS.ErrnoException).code ?? 'error'})` };
  }
  try {
    return { bytes: readFileSync(fd) };
  } catch (error) {
    return { reason: `cannot read ${path} (${(error as NodeJS.ErrnoException).code ?? 'error'})` };
  } finally {
    closeSync(fd);
  }
}

/**
 * 全ファイルの cache を用意して、終了コードを返す。
 *
 * cache の sha256 が全部合えば何もしない (ネットワークを使わない)。1 つでも合わなければ、合わない
 * ものを取って照合し、全部が合ったときだけ書く。1 つでも取得か照合に失敗したら何も書かない。
 * 2 つの rename の間で止まると片方だけ新しくなりうるが、読む側が毎回 sha256 で照合するので害は無い。
 */
export async function ensurePinnedFiles(options: EnsurePinnedFilesOptions): Promise<number> {
  const { files, allowedHosts, maxBytes, timeoutMs, log } = options;
  const fetchBytes =
    options.fetch ?? ((url: string) => fetchPinned(url, { allowedHosts, maxBytes, timeoutMs }));

  const stale: PinnedFile[] = [];
  for (const file of files) {
    const cached = readCache(file.cachePath);
    if ('bytes' in cached && sha256Of(cached.bytes) === file.sha256) {
      log(`cached: ${file.cachePath}`);
      continue;
    }
    log(`fetching ${file.url} (${'reason' in cached ? cached.reason : 'sha256 mismatch'})`);
    stale.push(file);
  }
  if (stale.length === 0) return 0;

  const fetched: { file: PinnedFile; bytes: Uint8Array }[] = [];
  let failed = false;
  for (const file of stale) {
    let bytes: Uint8Array;
    try {
      bytes = await fetchBytes(file.url);
    } catch (error) {
      log(`update-source failed: ${errorLabel(error)}`);
      failed = true;
      continue;
    }
    const actual = sha256Of(bytes);
    if (actual !== file.sha256) {
      log(
        `update-source failed: sha256 does not match for ${file.url}\n` +
          `  expected ${file.sha256}\n  actual   ${actual}\n` +
          'The pinned revision may have been changed or deleted. If you bumped it on purpose, ' +
          'update the sha256 in the pin file.'
      );
      failed = true;
      continue;
    }
    fetched.push({ file, bytes });
  }
  if (failed) return 1;

  for (const { file, bytes } of fetched) {
    try {
      writeFileAtomically(file.cachePath, bytes);
    } catch (error) {
      log(
        `update-source failed: could not write ${file.cachePath} (${error instanceof Error ? error.name : 'unknown error'})`
      );
      return 1;
    }
    log(`wrote ${file.cachePath} (sha256 ${file.sha256})`);
  }
  return 0;
}
