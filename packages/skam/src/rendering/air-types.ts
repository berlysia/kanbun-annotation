/**
 * AIR (Annotation Intermediate Representation) 型定義
 *
 * HTML/Canvas 両レンダラーの Pass1 相当の意味解決結果を統一する共通データモデル。
 * Resolver 層（buildAnnotationIR）が生成し、各 Adapter 層が消費する。
 *
 * 設計原則:
 * - 意味情報の完全保持（renderer 非依存）
 * - どの字もブロックの木に 1 回だけ現れ、その字自身の注記は字の slots に入る
 * - 範囲の注記（ruby、竪点、傍線）は区間の入れ子で表す。部分交差する竪点と傍線は断片に分けて入れ子にする
 * - BlockLayoutFlags 等の renderer 固有レイアウト補助値は含めない（Adapter が導出）
 */

import type { Token, TatetenMark, HighlightMark, HighlightStyle } from '../index.js';
import type { HiddenParts } from '../extensions/types.js';

// ============================================================================
// Render Profile（共通）
// ============================================================================

/** 表示要素の制御プロファイル（HTML/Canvas 共通） */
export interface AIRRenderProfile {
  yomigana: boolean;
  okurigana: boolean;
  kaeriten: boolean;
  kutoten: boolean;
  saidoku: boolean;
  okototen: boolean;
  tateten: boolean;
  emphasis: boolean;
  okimoji: boolean;
  joji: boolean;
  soegana: boolean;
  highlight: boolean;
  ref: boolean;
  linebreak: boolean;
}

// ============================================================================
// Token Node
// ============================================================================

/**
 * 解決済みトークンスロット。
 * Canvas の TokenSlots と同等だが、renderer 固有の最適化（rubySpan 等）は含まない。
 */
export interface AIRTokenSlots {
  ruby?: string;
  okuri?: string;
  soegana?: string;
  kaeri?: string;
  kutoten?: string;
  /**
   * 同じ位置の句読点の値を marks[] の順に 1 つずつ持つ。`kutoten` はこれをつないだ値。
   * 句読点を 1 つずつ別の要素に描く renderer (html) が使う。隠すかどうかは slot 単位で、`kutoten` と同じ
   */
  kutotenValues?: string[];
  isOkimoji?: boolean;
  isJoji?: boolean;
  emphasis?: string;
  /**
   * 傍点の注記の style の検証済みの値 (キーワードか 1 字のカスタム記号)。`emphasis` と同時に付く。
   * 検証を通らない style (型違いを含む) は既定の `filled dot`。`emphasis` は描画の文字に解決済みで
   * キーワード (`dot` と `filled dot` など) を戻せないので、別に持つ
   */
  emphasisStyle?: string;
  /**
   * 再読文字の形。marks[] で最初の saidoku の forms を、配列の順に持つ。
   * `n` は読みの順序で、正の整数でなければ配列の順 (1 から) にする。
   * `yomi` は profile の yomigana、`okuri` は profile の okurigana が有効なときだけ入る。
   * 下の `ruby` / `okuri` / `saidokuUnder` / `saidokuOkuri2` は、第 1・第 2 の形を canvas の置き場に
   * 合わせて入れたもので、第 3 の形以降は持たない
   */
  saidoku?: { forms: { n: number; yomi?: string; okuri?: string }[] };
  saidokuUnder?: string;
  saidokuOkuri2?: string;
  ref?: string;
  /**
   * 同じ位置の ref のラベルを marks[] の順に 1 つずつ持つ。`ref` は最後の値 (canvas が使う)。
   * ref を 1 つずつ別の要素に描く renderer (html) が使う
   */
  refLabels?: string[];
  /** ヲコト点。格子座標は `resolveOkototenCell` で検証済みのもののみ入る */
  okototen?: {
    x: number;
    y: number;
    cols: number;
    rows: number;
    shape: string;
    /** 拡張 (出題の印) が隠すセル。付かないときはキーごと無い */
    hidden?: true;
  }[];
}

/** 拡張が隠す slot の名前 */
export type AIRHiddenSlot = HiddenParts['slots'][number];

/** AIR のトークンノード */
export interface AIRTokenNode {
  type: 'token';
  token: Token;
  slots: AIRTokenSlots;
  /**
   * 拡張 (出題の印) が隠す slot。slot の値は消さない (canvas が場所を測るため)。
   * 隠す slot が無いときはキーごと無い。知らない印は読み飛ばせば今と同じに描ける
   */
  hiddenSlots?: AIRHiddenSlot[];
  /**
   * この字の直後で行を改める (linebreak の注記)。付かないときはキーごと無い。
   * その字で終わる ruby か竪点のグループがあれば、字には付かず、最も外側のグループのノードに付く
   * (傍線のグループには付かない。傍線の最後の字の後ろは、傍線の中の字かグループに付く)。
   * 知らない印は読み飛ばせばよく、AIR を読む adapter が無視しても今と同じに描ける。
   */
  lineBreakAfter?: true;
  /**
   * この字と、同じブロックの次の字の間で改行できない (同じ不可分単位に入る)。付かないときはキーごと無い。
   * 選んだ読み、竪点、再読文字・置字・助字の範囲から `line-units.ts` と同じ判定で決める
   * (profile で描かない種類の注記は数えない)。範囲の注記を描く上限で描かない竪点も不可分のまま。
   * この字が入れ子の木のどこにあっても、字ごとに付く。
   */
  joinedWithNext?: true;
}

// ============================================================================
// Ruby Group
// ============================================================================

/**
 * ruby グループ: 2 字以上の yomigana の範囲。
 * 1 字の yomigana は字の `slots.ruby`。送り仮名と添え仮名の範囲は、範囲の最後の字の
 * `slots.okuri` / `slots.soegana` に入り、グループにはならない。
 * 同じ種類の読みが重なる文書 (`READING_OVERLAP`) では、marks[] で先にある読みだけがグループになる。
 */
export interface AIRRubyGroupNode {
  type: 'ruby-group';
  yomigana: { value: string; hidden?: true };
  fromTokenId: string;
  toTokenId: string;
  /** 範囲の字の数 */
  span: number;
  children: (AIRTokenNode | AIRTatetenSeparator | AIRTatetenGroupNode | AIRHighlightGroupNode)[];
  /** このグループの直後で行を改める (linebreak の注記)。付かないときはキーごと無い */
  lineBreakAfter?: true;
}

// ============================================================================
// Tateten Group
// ============================================================================

/** tateten セパレータ */
export interface AIRTatetenSeparator {
  type: 'tateten-separator';
  /** 非レ返り点（Unicode 変換済み） */
  kaeri?: string;
  /** 区切りの kaeri を拡張 (出題の印) が隠す。付かないときはキーごと無い */
  kaeriHidden?: true;
  /**
   * 区切りを含む竪点がどれも拡張 (出題の印) で隠されている。付かないときはキーごと無い。
   * 区切りは、2 字をともに含む最も内側のノード (竪点の断片とは限らない) の子なので、
   * 竪点のグループの `hidden` とは別に持つ
   */
  hidden?: true;
}

/**
 * tateten グループ: 竪点 1 つの範囲、または範囲を部分交差する ruby / 竪点で切った断片。
 * 重なる竪点を切るのは、後に置く側 (始まりの昇順、終わりの降順、marks[] の順)。
 */
export interface AIRTatetenGroupNode {
  type: 'tateten-group';
  tatetenMark: TatetenMark;
  /** 範囲に含まれる同じ種類の竪点 (竪点 t1-t4 の中の t2-t3) も子になる */
  children: (
    | AIRTokenNode
    | AIRTatetenSeparator
    | AIRTatetenGroupNode
    | AIRRubyGroupNode
    | AIRHighlightGroupNode
  )[];
  /** 前に同じ注記の断片がある。付かないときはキーごと無い */
  continuesBefore?: true;
  /** 後ろに同じ注記の断片がある。付かないときはキーごと無い */
  continuesAfter?: true;
  /** このグループの直後で行を改める (linebreak の注記)。付かないときはキーごと無い */
  lineBreakAfter?: true;
  /** 竪点の注記を拡張 (出題の印) が隠す。付かないときはキーごと無い。断片のどれにも付く */
  hidden?: true;
}

// ============================================================================
// Highlight Group
// ============================================================================

/**
 * highlight グループ: 傍線 1 つの範囲、または範囲を部分交差する ruby / 竪点 / 傍線で切った断片。
 * 傍線のグループは `lineBreakAfter` を持たない。
 */
export interface AIRHighlightGroupNode {
  type: 'highlight-group';
  highlightMark: HighlightMark;
  highlightStyle: HighlightStyle;
  /** highlight が参照する ref の解決済みラベル（例: "(1)"）。断片に分かれたときは最後の断片だけに付く */
  refLabel?: string;
  /** 範囲に含まれる同じ種類の傍線 (傍線 t1-t4 の中の t2-t3) も子になる */
  children: (
    | AIRTokenNode
    | AIRTatetenSeparator
    | AIRTatetenGroupNode
    | AIRRubyGroupNode
    | AIRHighlightGroupNode
  )[];
  /** 前に同じ注記の断片がある。付かないときはキーごと無い */
  continuesBefore?: true;
  /** 後ろに同じ注記の断片がある。付かないときはキーごと無い */
  continuesAfter?: true;
  /** グループ内 (断片の中) にルビ付きトークンか ruby グループが存在するか */
  hasKana: boolean;
  /** グループ内 (断片の中) に傍点付きトークンが存在するか */
  hasEmphasis: boolean;
}

// ============================================================================
// Block
// ============================================================================

/** block-start position の解決済みデータ */
export interface AIRBlockStartRef {
  refId?: string;
  resolved: string;
}

export interface AIRBlockStartKutoten {
  value: string;
  /** 拡張 (出題の印) が隠す句読点。付かないときはキーごと無い */
  hidden?: true;
}

/** AIR のブロックノード */
export interface AIRBlock {
  blockId: string;
  children: AIRBlockChild[];
  /** block-start position の ref（解決済みラベル） */
  blockStartRefs: AIRBlockStartRef[];
  /** block-start position の kutoten */
  blockStartKutoten: AIRBlockStartKutoten[];
}

export type AIRBlockChild =
  | AIRTokenNode
  | AIRTatetenSeparator
  | AIRTatetenGroupNode
  | AIRHighlightGroupNode
  | AIRRubyGroupNode;

// ============================================================================
// Document
// ============================================================================

/** AIR ドキュメント: buildAnnotationIR の出力 */
export interface AIRDocument {
  blocks: AIRBlock[];
}
