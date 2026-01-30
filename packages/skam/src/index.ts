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
// Coordinate System
// ============================================================================

/** 座標系の基底型 */
export interface BaseCoord {
  /** 座標系識別子 */
  system: string;
}

/** 字内グリッド座標（ヲコト点等） */
export interface GlyphGridCoord extends BaseCoord {
  system: 'glyph-grid';
  /** グリッドサイズ（"5x5", "7x7" 等） */
  grid: string;
  /** X座標（0-based、左から） */
  x: number;
  /** Y座標（0-based、上から） */
  y: number;
}

/** 版面座標（将来用） */
export interface PageCoord extends BaseCoord {
  system: 'page';
  /** 行番号 */
  line: number;
  /** 列位置（任意） */
  col?: number;
}

/** すべての座標型 */
export type Coord = GlyphGridCoord | PageCoord;

// ============================================================================
// Mark Types
// ============================================================================

/** 注記種別（v0.1） */
export type MarkType = 'kaeri' | 'okurigana' | 'yomigana' | 'okiji' | 'kutoten' | 'emphasis' | 'note' | 'saidoku' | 'okototen' | 'tateten';

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

/** 読み仮名（ルビ） */
export interface YomiganaMark extends BaseMark {
  type: 'yomigana';
  /** 読み仮名テキスト */
  value: string;
}

/** 助字・テニヲハ */
export interface OkijiMark extends BaseMark {
  type: 'okiji';
  /** 助字テキスト */
  value: string;
}

/** 句読点 */
export interface KutotenMark extends BaseMark {
  type: 'kutoten';
  /** 句読点記号（。、等） */
  value: string;
  /** 分類（任意） */
  kind?: 'ku' | 'ten' | 'other';
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

/** 再読文字の語形（1回分の読み） */
export interface SaidokuForm {
  /** 読み順（省略時は配列順） */
  n?: number;
  /** 読み仮名 */
  reading?: string;
  /** 送り仮名 */
  okuri?: string;
}

/** 再読文字 */
export interface SaidokuMark extends BaseMark {
  type: 'saidoku';
  /** 各回の語形 */
  forms: SaidokuForm[];
}

/** ヲコト点 */
export interface OkototenMark extends BaseMark {
  type: 'okototen';
  /** 字内座標（必須） */
  position: GlyphGridCoord;
  /** 点の形状（dot, circle, line 等） */
  shape: string;
  /** 対応する音節（任意） */
  sound?: string;
  /** 朱点・墨点等の区別（任意） */
  color?: string;
}

/** たて点（熟語境界標識） */
export interface TatetenMark extends BaseMark {
  type: 'tateten';
}

/** すべての注記型 */
export type Mark =
  | KaeriMark
  | OkuriganaMark
  | YomiganaMark
  | OkijiMark
  | KutotenMark
  | EmphasisMark
  | NoteMark
  | SaidokuMark
  | OkototenMark
  | TatetenMark;

// ============================================================================
// Derivations
// ============================================================================

/** 導出情報の種別 */
export type DerivationKind = 'readingOrder';

/** 導出情報の基底型 */
export interface BaseDerivation {
  /** 導出の種別 */
  kind: DerivationKind;
  /** 導出方法 */
  method: string;
  /** 拡張フィールド */
  ext?: Record<string, unknown>;
}

/** 読み順の導出 */
export interface ReadingOrderDerivation extends BaseDerivation {
  kind: 'readingOrder';
  /** 導出方法（kaeriten-stack, manual 等） */
  method: 'kaeriten-stack' | 'manual' | (string & {});
  /** 読み順（token ID の配列） */
  result: string[];
}

/** すべての導出型 */
export type Derivation = ReadingOrderDerivation;

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
  /** 導出情報（任意） */
  derivations?: Derivation[];
  /** 読み層 */
  readings: Reading[];
  /** 拡張フィールド（round-trip保持推奨） */
  ext?: Record<string, unknown>;
}

// ============================================================================
// Validation
// ============================================================================

export {
  type ValidationError,
  type ValidationErrorKind,
  type ValidationResult,
  type ValidationSuccess,
  type ValidationFailure,
  SKAMValidationError,
  createValidationError,
} from './errors.js';

export {
  validateSKAMDocument,
  isSKAMDocument,
  assertSKAMDocument,
} from './validator.js';
