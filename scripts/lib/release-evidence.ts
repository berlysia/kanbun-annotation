// release の証拠 (.tmp/release/ の下の保存物) を書く関数。fs は FsApi 越しに受ける。
// import できるのは release-sanitize.ts と release-types.ts だけ (構造テストが固定する)。
// 保存物は、書く前に必ず無害化する。無害化しない内容を書く経路は無い。

import { join } from 'node:path';

import { sanitizeArtifact } from './release-sanitize.ts';
import type { FsApi } from './release-types.ts';

const EVIDENCE_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

// `..` のような `.` だけの名前も拒否する
export function assertEvidenceName(name: string): void {
  if (!EVIDENCE_NAME_PATTERN.test(name) || /^\.+$/.test(name)) {
    throw new Error(`invalid evidence file name ${JSON.stringify(name)}`);
  }
}

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;
const MAX_DIR_ATTEMPTS = 100;

// 1 回分のディレクトリ (<releaseRoot>/<parentRel>/<leaf>[-n]) を作る。parentRel は空でもよい。
// releaseRoot (.tmp/release) と親は 0700 にする (既にある .tmp は触らない)。
// 同じ名前の 2 つの実行が同じ dir を使わない (前の証拠を上書きしない)。umask は弱める側にしか動かないので、
// 作成の時点で mode を渡し、作った直後に chmod でも固定する
export function makeEvidenceDir(
  fsApi: FsApi,
  releaseRoot: string,
  parentRel: string,
  leaf: string
): string {
  const parent = parentRel === '' ? releaseRoot : join(releaseRoot, parentRel);
  fsApi.mkdirSync(parent, { recursive: true, mode: DIR_MODE });
  fsApi.chmodSync(releaseRoot, DIR_MODE);
  fsApi.chmodSync(parent, DIR_MODE);
  for (let n = 0; n < MAX_DIR_ATTEMPTS; n += 1) {
    const dir = join(parent, n === 0 ? leaf : `${leaf}-${n}`);
    try {
      fsApi.mkdirSync(dir, { mode: DIR_MODE });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue;
      throw error;
    }
    fsApi.chmodSync(dir, DIR_MODE);
    return dir;
  }
  throw new Error(`could not create a new evidence directory under ${parent}`);
}

// 1 ファイルを書く。名前は path の区切りを含められない。内容は無害化してから 0600 で書く。
// 書き込みの例外は捕まえずに投げる
export function writeEvidenceFile(fsApi: FsApi, dir: string, name: string, content: string): void {
  assertEvidenceName(name);
  const sanitized = sanitizeArtifact(content);
  const path = join(dir, name);
  fsApi.writeFileSync(path, sanitized, { mode: FILE_MODE });
  fsApi.chmodSync(path, FILE_MODE);
}
