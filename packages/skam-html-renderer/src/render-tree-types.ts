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
  /** 傍点スタイル（トークンにemphasisがある場合のCSS値、例: "filled dot"） */
  emphasisStyle?: string;
}

export interface RangeTokenInfo {
  from: string;
  to: string;
}

export interface RangeMarkContext {
  /** multi-token range の個別 token テキスト（2+ tokens のみ設定） */
  tokenTexts?: string[];
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
  /** highlight グループ内のトークンであることを示すフラグ（ADR-015: bare+emphasis の grid 化用） */
  inHighlightGroup?: boolean;
  /** highlight グループ内にルビ付きトークンが存在するかを示すフラグ。
   * true の場合、ルビなしトークンでも ruby 行のスペースを確保して本文位置を揃える。 */
  highlightGroupHasRuby?: boolean;
  /** ブロック内にルビ付きトークンが存在するかを示すフラグ。
   * グリッドクラス選択（文字縦位置揃え）に使用。highlightGroupHasRuby と異なり
   * 別 highlight 間でも文字位置を揃えるためブロック全体スコープで判定。 */
  blockHasRuby?: boolean;
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
  /** グループ内にルビ付きトークンが存在するか（傍線位置の調整に使用） */
  hasKana: boolean;
  /** グループ内に傍点付きトークンが存在するか（emphasis+highlight 共存のスタイル切替に使用） */
  hasEmphasis: boolean;
  /** グループに ref ラベルが存在するか（inline-block 切替に使用） */
  hasRef: boolean;
}

/** Union of all render tree node types. */
export type RenderNode = TokenItem | TatetenGroupNode | HighlightGroupNode;

/** The render tree for a single block. */
export interface BlockRenderTree {
  blockId: string;
  blockStartHtml: string;
  items: RenderNode[];
}
