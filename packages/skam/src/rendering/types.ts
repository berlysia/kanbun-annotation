/**
 * レンダリング共有型定義
 */

import type { YomiganaMark, OkuriganaMark, SoeganaMark } from '../index.js';

/** range mark グループ情報 */
export interface RangeMarkGroup {
  mark: YomiganaMark | OkuriganaMark | SoeganaMark;
  tokenIds: string[];
}
