/**
 * Render tree types for the display layer.
 *
 * Pass 1 (air-adapter.ts) turns an AIR document into a BlockRenderTree: the AIR nodes themselves
 * plus the block-level values that are decided once (block-start HTML, whether the block has a reading).
 * Pass 2 (render-tree.ts) walks the tree to emit HTML.
 */
import type { AIRBlockChild } from '@kanbun-skam/skam/rendering';

export interface TokenRenderResult {
  /** Token本体のHTML（suffix-row内にkutotenを含む） */
  html: string;
  /** 抽出されたsuffix-row HTML（extractSuffix=true の場合にtoken HTMLから分離） */
  suffixHtml: string;
  /** 傍点スタイル（トークンにemphasisがある場合のCSS値、例: "filled dot"） */
  emphasisStyle?: string;
}

/** ruby のグループの字全体を 1 つの単位として描くときの範囲の情報 */
export interface RangeUnit {
  /** 範囲の最初と最後の字の id (interactive の data-token-from / data-token-to) */
  from: string;
  to: string;
  /** 範囲の読み。AIR の `yomigana` */
  yomigana: { value: string; hidden: boolean };
}

/** The render tree for a single block. */
export interface BlockRenderTree {
  blockId: string;
  blockStartHtml: string;
  /** AIR のブロックの子 (字、区切り、ruby・竪点・傍線のグループ) */
  items: AIRBlockChild[];
  /** ブロック内に読み (字の slot の読み・送り仮名・添え仮名、または ruby のグループ) がある */
  blockHasRuby: boolean;
}
