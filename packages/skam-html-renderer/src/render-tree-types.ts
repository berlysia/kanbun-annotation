/**
 * Render tree types for the display layer.
 *
 * Pass 1 (build-render-tree.ts) constructs a BlockRenderTree from a SKAMDocument block,
 * Pass 2 (render-tree.ts) walks the tree to emit HTML.
 */
import type {
  Token,
  TatetenMark,
  HighlightMark,
  KaeriMark,
  KutotenMark,
  RefMark,
  OkimojiMark,
  JojiMark,
  EmphasisMark,
} from '@kanbun/skam';

// ---------------------------------------------------------------------------
// Moved from renderer.ts
// ---------------------------------------------------------------------------

export interface TokenRenderResult {
  /** Token本体のHTML（suffix-row内にkutotenを含む） */
  html: string;
  /** 竪点セパレータに並置する非レ返り点のHTML */
  tatetenKaeriHtml: string;
  /** 抽出されたsuffix-row HTML（extractSuffix=true の場合にtoken HTMLから分離） */
  suffixHtml: string;
}

export interface RangeTokenInfo {
  from: string;
  to: string;
}

export interface RangeMarkContext {
  /** 範囲yomiganaのベーステキスト（全トークンのテキストを結合） */
  yomiganaBaseText?: string;
  /** 範囲okuriganaのベーステキスト */
  okuriganaBaseText?: string;
  /** 範囲okuriganaの値 */
  okuriganaValue?: string;
  /** 範囲soeganaのベーステキスト */
  soeganaBaseText?: string;
  /** 範囲soeganaの値 */
  soeganaValue?: string;
  /** 範囲グループ内の後続トークンに付いている返り点 */
  trailingKaeriMarks?: KaeriMark[];
  /** 範囲グループ内の後続トークンに付いている句読点 */
  trailingKutotenMarks?: KutotenMark[];
  /** 範囲グループ内の後続トークンに付いているrefマーク */
  trailingRefMarks?: RefMark[];
  /** 範囲グループ内の後続トークンに付いている置字マーク */
  trailingOkimojiMarks?: OkimojiMark[];
  /** 範囲グループ内の後続トークンに付いている助字マーク */
  trailingJojiMarks?: JojiMark[];
  /** 範囲グループ内の後続トークンに付いている傍点マーク */
  trailingEmphasisMarks?: EmphasisMark[];
  /** 範囲のトークンID情報（熟語ルビ等でdata-token-from/to出力用） */
  rangeTokenInfo?: RangeTokenInfo;
}

// ---------------------------------------------------------------------------
// New render tree node types
// ---------------------------------------------------------------------------

/** A single token leaf node in the render tree. */
export interface TokenItem {
  type: 'token';
  token: Token;
  rangeCtx?: RangeMarkContext;
}

/** A tateten group wrapping consecutive tokens that share a tateten mark. */
export interface TatetenGroupNode {
  type: 'tateten-group';
  tateten: TatetenMark;
  items: TokenItem[];
  /** tateten と読み範囲が重複する場合の読み情報（グループ全体に適用） */
  rangeCtx?: RangeMarkContext;
}

/** A highlight group wrapping nodes (tokens or tateten groups) that share a highlight mark. */
export interface HighlightGroupNode {
  type: 'highlight-group';
  highlight: HighlightMark;
  refHtml: string;
  items: (TokenItem | TatetenGroupNode)[];
}

/** Union of all render tree node types. */
export type RenderNode = TokenItem | TatetenGroupNode | HighlightGroupNode;

/** The render tree for a single block. */
export interface BlockRenderTree {
  blockId: string;
  blockStartHtml: string;
  items: RenderNode[];
}
