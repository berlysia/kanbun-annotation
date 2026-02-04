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
// Block
// ============================================================================

/**
 * 論理的なブロック（段落・文単位）
 *
 * tokens の部分集合を順序付きで保持する。全 token はちょうど1つの block に属する。
 */
export interface Block {
  /** 一意識別子 */
  id: string;
  /** この block に属する token ID の配列（順序保持） */
  tokenIds: string[];
  /** 拡張フィールド（round-trip保持推奨） */
  ext?: Record<string, unknown>;
}

// ============================================================================
// Anchor
// ============================================================================

/**
 * 対象 token 範囲を指定するアンカー（anchor ベース Mark 用）
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
// Position
// ============================================================================

/**
 * トークン間の位置を指定（position ベース Mark 用）
 *
 * - blockId: この mark が属する block の ID（必須）
 * - after が指定されている: そのトークンの後ろに配置
 * - after が未定義: ブロック先頭に配置
 */
export interface Position {
  /** この mark が属する block の ID（必須） */
  blockId: string;
  /** この mark が配置されるトークンの ID。未定義の場合はブロック先頭に配置。 */
  after?: string;
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
export type MarkType =
  | 'kaeri'
  | 'okurigana'
  | 'yomigana'
  | 'okimoji'
  | 'joji'
  | 'soegana'
  | 'kutoten'
  | 'emphasis'
  | 'saidoku'
  | 'okototen'
  | 'tateten'
  | 'highlight'
  | 'ref';

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

/** 置字（訓読時に読まない漢字をマーク） */
export interface OkimojiMark extends BaseMark {
  type: 'okimoji';
}

/** 助字（文法的機能を持つ漢字の分類ラベル） */
export interface JojiMark extends BaseMark {
  type: 'joji';
}

/** 添え仮名（訓読時に補う助詞・テニヲハ） */
export interface SoeganaMark extends BaseMark {
  type: 'soegana';
  /** 添え仮名テキスト（を、に、は 等） */
  value: string;
}

/**
 * 句読点（position ベース）
 *
 * トークン間の位置に配置される。anchor ではなく position を使用。
 */
export interface KutotenMark {
  type: 'kutoten';
  /** 一意識別子（任意だが推奨） */
  id?: string;
  /** 配置位置（トークン間） */
  position: Position;
  /** 句読点記号（。、等） */
  value: string;
  /** 分類（任意） */
  kind?: 'ku' | 'ten' | 'other';
  /** 表示上の弱いヒント */
  placementHint?: string;
  /** 拡張フィールド（round-trip保持推奨） */
  ext?: Record<string, unknown>;
}

/**
 * 傍点の形状（CSS text-emphasis-style 準拠、キーワード値）
 *
 * 形状キーワード: dot, circle, double-circle, triangle, sesame
 * 修飾子なしの場合は filled がデフォルト
 */
export type EmphasisShape = 'dot' | 'circle' | 'double-circle' | 'triangle' | 'sesame';

/**
 * 傍点スタイル（CSS text-emphasis-style 準拠）
 *
 * CSS text-emphasis-style の値をそのまま使用可能:
 * - 形状キーワード: dot, circle, double-circle, triangle, sesame
 * - 修飾子付き: filled/open + 形状（例: 'filled sesame', 'open circle'）
 * - カスタム文字列: 任意の1文字（例: '★', '○'）
 *
 * デフォルト値（style 省略時）: 'filled dot'
 */
export type EmphasisStyle =
  | EmphasisShape
  | `filled ${EmphasisShape}`
  | `open ${EmphasisShape}`
  | (string & {}); // カスタム文字列も許可

/** 傍点・圏点（後世の記述） */
export interface EmphasisMark extends BaseMark {
  type: 'emphasis';
  /**
   * 傍点スタイル（CSS text-emphasis-style 準拠）
   * 省略時のデフォルト: 'filled dot'
   */
  style?: EmphasisStyle;
}

/** 参照フォーマット（RefFormat） */
export type RefFormat =
  | 'alpha-upper'
  | 'alpha-lower'
  | 'numeric-paren'
  | 'numeric-bracket'
  | 'numeric-circled'
  | 'iroha-katakana'
  | 'iroha-hiragana'
  | 'gojuon-katakana'
  | 'gojuon-hiragana'
  | 'kanji-numeric';

/** 傍線スタイル（CSS text-decoration-style 準拠） */
export type HighlightStyle = 'solid' | 'dotted' | 'dashed' | 'wavy' | 'double';

/** 傍線・ハイライト（後世の記述、refを参照） */
export interface HighlightMark extends BaseMark {
  type: 'highlight';
  /** 傍線スタイル（CSS text-decoration-style 準拠、省略時は solid） */
  style?: HighlightStyle;
  /** 参照する ref の識別子 */
  ref?: string;
}

/**
 * 参照識別子・注釈（ref）（position ベース）
 *
 * トークン間の位置に配置される。anchor ではなく position を使用。
 * label / format / content のいずれか必須。
 * label と format は排他（併用禁止）。
 */
export interface RefMark {
  type: 'ref';
  /** 一意識別子（分離定義時は必須） */
  id?: string;
  /** 配置位置（トークン間） */
  position: Position;
  /** 表示ラベル（明示値、format と排他） */
  label?: string;
  /** 自動番号フォーマット（label と排他） */
  format?: RefFormat;
  /** 注釈テキスト（任意） */
  content?: string;
  /** 表示上の弱いヒント */
  placementHint?: string;
  /** 拡張フィールド（round-trip保持推奨） */
  ext?: Record<string, unknown>;
}

/** 再読文字の語形（1回分の読み） */
export interface SaidokuForm {
  /** 読み順（省略時は配列順） */
  n?: number;
  /** 読み仮名 */
  yomi?: string;
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
  | OkimojiMark
  | JojiMark
  | SoeganaMark
  | KutotenMark
  | EmphasisMark
  | SaidokuMark
  | OkototenMark
  | TatetenMark
  | HighlightMark
  | RefMark;

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
  /** 本文 token のマスター定義（順序は無意味） */
  tokens: Token[];
  /** ブロック構造（必須、原文順） */
  blocks: Block[];
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

export { validateSKAMDocument, isSKAMDocument, assertSKAMDocument } from './validator.js';

// ============================================================================
// Operations
// ============================================================================

export {
  // ID generation
  generateId,
  generateMarkId,
  // CRUD
  addMark,
  addMarkWithResult,
  updateMark,
  replaceMark,
  removeMark,
  // Compound operations
  removeHighlightWithRef,
  // Token utilities
  buildTokenIndexMap,
  getTokenIndex,
  getTokenByIndex,
  // Mark lookup
  getMarkById,
  getBlockForToken,
  // Mark queries
  getMarksForToken,
  getMarksForRange,
  getMarksExactRange,
  // Mark display utilities
  getAnchorText,
  getAnchorRangeLabel,
  getMarkSortIndex,
  sortMarksByPosition,
  // Mark type guards
  isAnchorBasedMark,
  hasMarkValue,
  isExactAnchorMatch,
  // Types
  type MarkInput,
  type MarkUpdates,
  type AddMarkResult,
} from './operations/index.js';
