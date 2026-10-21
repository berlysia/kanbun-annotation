/**
 * 取得するデータの固定。リポジトリの commit と、2 つのファイルの sha256、取得の安全の値、期待する件数を置く。
 *
 * sha256 は 2026-10-21 に、固定した commit の raw を取って計算した。GitHub の contents API が返す
 * git の blob の hash と、取得したバイト列から `git hash-object` で計算した値が、2 つとも一致している
 * (annotated/test.json は be5f3f26…、annotated_two_types/test.json は c8a63ec9…)。
 *
 * 期待する件数は、実装の出力を写さず、実データを別の手段で数えた値である (2026-10-21)。commit を
 * 上げるときも、独立に数え直してから置くこと。実装が出す値と違えば、当てはめの規則かデータのどちらかが
 * 変わっている。
 */

import { fileURLToPath } from 'node:url';

export const KUNDOKU_REPOSITORY = 'shiryusann/KanbunKundoku';
export const KUNDOKU_COMMIT = 'd4b80d67d5aff63fa9ec4a042382767f7840f45b';

export const KUNDOKU_ALLOWED_HOSTS: readonly string[] = ['raw.githubusercontent.com'];
export const KUNDOKU_MAX_BYTES = 4 * 1024 * 1024;
export const KUNDOKU_TIMEOUT_MS = 30_000;

export interface KundokuFile {
  /** リポジトリの中のパス */
  readonly path: string;
  /** cache のディレクトリの中のファイル名 */
  readonly cacheName: string;
  readonly sha256: string;
}

/** 元データ (印つき) */
export const KUNDOKU_ANNOTATED: KundokuFile = {
  path: 'annotated/test.json',
  cacheName: 'annotated-test.json',
  sha256: '0a299c1678e6189adb1cdf792d543ca4c243217a6346d0857b169836f3a35af2',
};

/** 変換済みの形 (返り点 left と右の仮名 right) */
export const KUNDOKU_TWO_TYPES: KundokuFile = {
  path: 'annotated_two_types/test.json',
  cacheName: 'annotated_two_types-test.json',
  sha256: '0bdd085a24105fefa0e1b23f0904390851e2db5e5d7ed2271822342fadc9898d',
};

export function kundokuRawUrl(path: string): string {
  return `https://raw.githubusercontent.com/${KUNDOKU_REPOSITORY}/${KUNDOKU_COMMIT}/${path}`;
}

/** cache のディレクトリ。実行する場所に依らず、パッケージ直下の `.cache/kundoku/` (commit しない) */
export const KUNDOKU_CACHE_DIR: string = fileURLToPath(
  new URL('../../.cache/kundoku/', import.meta.url)
);

export interface KundokuExpectedCounts {
  readonly sentences: number;
  /** 句読点を除いた字 */
  readonly tokens: number;
  readonly punctuation: number;
  /** 捨てた 1 件を引いた後の返り点 */
  readonly kaeri: number;
  readonly tateten: number;
  readonly okurigana: number;
  readonly soegana: number;
  /** 右の仮名から取り除いた「・」と「、」 */
  readonly strippedRight: number;
  /** 句読点の字に付いていて、直前の字の位置へ移した返り点 */
  readonly movedPunctuationKaeri: number;
  /** 移した結果、同じ位置に レ 以外の返り点が 2 つ並ぶので捨てた返り点 */
  readonly droppedKaeri: number;
}

export const KUNDOKU_EXPECTED_COUNTS: KundokuExpectedCounts = {
  sentences: 930,
  tokens: 7679,
  punctuation: 1471,
  kaeri: 2107,
  tateten: 33,
  okurigana: 2744,
  soegana: 2627,
  strippedRight: 115,
  movedPunctuationKaeri: 14,
  droppedKaeri: 1,
};
