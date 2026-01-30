/**
 * Stand-off Kanbun Annotation Model (SKAM) v0.1
 *
 * 漢文本文と訓点・注記・読みを分離して保持する意味モデル
 */

// ============================================================================
// Format Version
// ============================================================================

/** SKAM フォーマットバージョン */
export type SKAMVersion = 'skam@0.1';

// ============================================================================
// Token
// ============================================================================

/**
 * 本文を構成する最小単位
 *
 * 分割規則（1字/熟語等）は仕様外だが、字単位を推奨（訓点・返り点の指示と一致するため）
 */
export interface Token {
  /** 一意識別子 */
  id: string;
  /** UTF-8 文字列 */
  text: string;
  /** 拡張フィールド（round-trip保持推奨） */
  ext?: Record<string, unknown>;
}

// ============================================================================
// Anchor
// ============================================================================

/**
 * 対象 token 範囲を指定するアンカー
 *
 * from ≤ to（token順）。単一tokenの場合も省略しない。
 */
export interface Anchor {
  /** 開始 token ID（inclusive） */
  from: string;
  /** 終了 token ID（inclusive） */
  to: string;
}

// ============================================================================
// Mark Types
// ============================================================================

/** 注記種別（v0.1） */
export type MarkType = 'kaeri' | 'okurigana' | 'okiji' | 'emphasis' | 'note';

/**
 * 注記の基底構造
 *
 * - id: 任意だが推奨（編集・差分・UI操作用）。無ければ配列indexを一時IDとして扱う
 * - placementHint: 表示上の弱いヒント（解釈不能でも問題としない）
 * - ext: 拡張フィールド（round-trip保持推奨）
 */
export interface BaseMark {
  /** 注記種別 */
  type: MarkType;
  /** 一意識別子（任意だが推奨） */
  id?: string;
  /** 対象 token 範囲 */
  anchor: Anchor;
  /** 表示上の弱いヒント */
  placementHint?: string;
  /** 拡張フィールド（round-trip保持推奨） */
  ext?: Record<string, unknown>;
}

// ============================================================================
// Concrete Mark Types
// ============================================================================

/** 返り点 */
export interface KaeriMark extends BaseMark {
  type: 'kaeri';
  /** 返り点記号（レ、一、二、上、下、甲、乙 等） */
  value: string;
}

/** 送り仮名 */
export interface OkuriganaMark extends BaseMark {
  type: 'okurigana';
  /** 送り仮名テキスト */
  value: string;
}

/** 助字・テニヲハ */
export interface OkijiMark extends BaseMark {
  type: 'okiji';
  /** 助字テキスト */
  value: string;
}

/** 傍点・圏点 */
export interface EmphasisMark extends BaseMark {
  type: 'emphasis';
  /** 傍点の種類（任意） */
  value?: string;
}

/** 注釈（割注・欄外注含む） */
export interface NoteMark extends BaseMark {
  type: 'note';
  /** 注釈テキスト */
  value: string;
}

/** すべての注記型 */
export type Mark =
  | KaeriMark
  | OkuriganaMark
  | OkijiMark
  | EmphasisMark
  | NoteMark;

// ============================================================================
// Reading
// ============================================================================

/** 読み層の種別 */
export type ReadingKind = 'kundoku' | 'kakikudashi' | 'yomiage';

/**
 * 読み層
 *
 * v0.1では全文テキストのみ。将来の拡張でalignment（対応情報）を追加予定。
 */
export interface Reading {
  /** 読みの種別 */
  kind: ReadingKind;
  /** 読みテキスト */
  text: string;
  /** 拡張フィールド（round-trip保持推奨） */
  ext?: Record<string, unknown>;
}

// ============================================================================
// Document
// ============================================================================

/**
 * SKAM ドキュメント
 *
 * 未知のフィールドは無視してよい。extは保持して再出力してよい（round-trip推奨）。
 */
export interface SKAMDocument {
  /** フォーマットバージョン */
  format: SKAMVersion;
  /** 本文 token 列 */
  tokens: Token[];
  /** 注記列 */
  marks: Mark[];
  /** 読み層 */
  readings: Reading[];
  /** 拡張フィールド（round-trip保持推奨） */
  ext?: Record<string, unknown>;
}
