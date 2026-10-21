/**
 * 取得する本文の固定。deploy-playground.yml の cache の key はこのファイルの hash から作るので、
 * 取得と照合に関わる定数だけを置く (組み立てや変換のロジックを編集しても key は変わらない)。
 *
 * 本文 (変換後) の sha256 と token 数は、2026-10-21 に、次の版を update-source.ts で変換して採った:
 * 古事記/上卷 oldid 7906965、古事記/中卷 oldid 11119047、古事記/下卷 oldid 3802853。
 * 版か変換の規則を変えたら、ここも直す (README.md の手順)。workflow はこの値を書き換えない。
 */

import type { KojikiVolume } from './convert-wikitext.ts';

export interface KojikiPage {
  readonly volume: KojikiVolume;
  readonly title: string;
  readonly rev: number;
}

export const KOJIKI_PAGES: readonly KojikiPage[] = [
  { volume: '上卷', title: '古事記/上卷', rev: 7906965 },
  { volume: '中卷', title: '古事記/中卷', rev: 11119047 },
  { volume: '下卷', title: '古事記/下卷', rev: 3802853 },
];

export const KOJIKI_SOURCE_SHA256 =
  'dda1c08a0a5c17100c4a5c147f0a941920e41a44921c6e06efa16c0ad50056cf';
export const KOJIKI_TOKEN_COUNT = 42387;
