/**
 * SKAM Validation Errors
 *
 * バリデーションエラーの型定義
 */

/** 検証エラーの種別 */
export type ValidationErrorKind =
  | 'INVALID_FORMAT'
  | 'MISSING_FIELD'
  | 'INVALID_TYPE'
  | 'DUPLICATE_ID'
  | 'INVALID_ANCHOR'
  | 'INVALID_POSITION'
  | 'UNKNOWN_TOKEN_REF'
  | 'INVALID_VALUE'
  | 'MARK_CONFLICT'
  | 'BLOCK_START_KAERI'
  | 'INVALID_LINEBREAK'
  | 'INVALID_EXTENSION';

/**
 * ブロック先頭の返り点に対する案内文。
 * 返り点は直前の字に付く (anchor ベース) ため、ブロック先頭には置けない。
 * parser と validator が同じ文言で利用者を誘導する。
 */
export const BLOCK_START_KAERI_HINT =
  'ブロックは段落・文の単位です。表示上の改行のためにブロックを分けた場合は、ブロックを分けずに自動折り返しに任せてください。分けたままにする場合は、返り点を前のブロックの最後の字の後に置いてください。行を改めたいときは、改行の注記 (linebreak、SKAM-ML では <skam:br/>) を使ってください。';

/** 検証エラー */
export interface ValidationError {
  /** エラー種別 */
  kind: ValidationErrorKind;
  /** JSON パス（e.g., "marks[0].anchor.from"） */
  path: string;
  /** エラーメッセージ */
  message: string;
  /** 期待される値・型 */
  expected?: string;
  /** 実際の値 */
  actual?: unknown;
  /**
   * 元の SKAM-ML の行 (1 始まり)。`@kanbun-skam/skam-xml-parser` の `parse` (`validate: true`) が、
   * path が tokens / marks / blocks の要素を指すエラーに足す。
   * `validateSKAMDocument` を直接呼んだときや、開始タグと要素の対応が取れないときは付かない。値が無いときはキーごと無い
   */
  line?: number;
  /** 元の SKAM-ML の列。`line` と同じ条件で付く */
  column?: number;
}

/**
 * 複数の字の kaeri (`㆒㆑` など) を指す警告・誤りのコード。
 * 0.3 では警告 (`ValidationWarning`) として、0.4.0 では同じコードの誤りとして使う。
 * `@kanbun-skam/skam-xml-parser` の `ParseWarning.code` もこの値を使う
 */
export const KAERI_MULTI_CHARACTER = 'KAERI_MULTI_CHARACTER';

/**
 * 宣言 (`extensions`) の無い文書に `ext` がある、という警告のコード。
 * 0.3 では `ext` を自由なデータとして読んで警告し、0.4.0 では同じコードの誤りにする。
 * 移すには `moveLegacyExtToCustom` を使う
 */
export const LEGACY_EXT = 'LEGACY_EXT';

/**
 * `LEGACY_EXT` のうち、`ext` のキーが登録済みの拡張の名前と同じものを指す警告のコード。
 * 宣言の書き忘れの疑いを知らせる。0.4.0 では `LEGACY_EXT` の誤りが同じ所を指すので、このコードは無くす
 */
export const LEGACY_EXT_REGISTERED_NAME = 'LEGACY_EXT_REGISTERED_NAME';

/**
 * id が NCName でも、位置に合う自動の形でもない、という警告のコード。
 * 0.3 では警告、0.4.0 では同じコードの誤りにする。
 * `highlight.ref` が、SKAM-ML に書けない自動の id の ref を指すときにも使う
 */
export const ID_FORM = 'ID_FORM';

/**
 * XML 1.0 で書けない文字 (U+0009、U+000A、U+000D を除く U+0000〜U+001F、U+FFFE、U+FFFF、対の無いサロゲート) が、
 * SKAM-ML の本文か属性値に書く文字列にある、という警告のコード。0.3 では警告、0.4.0 では同じコードの誤りにする
 */
export const XML_UNWRITABLE_CHAR = 'XML_UNWRITABLE_CHAR';

/** 検証の警告の種別。値を足すのは minor の変更として扱う */
export type ValidationWarningKind =
  | typeof KAERI_MULTI_CHARACTER
  | typeof LEGACY_EXT
  | typeof LEGACY_EXT_REGISTERED_NAME
  | typeof ID_FORM
  | typeof XML_UNWRITABLE_CHAR;

/** 検証の警告。文書は有効だが、将来の版で誤りになる書き方を指す */
export interface ValidationWarning {
  kind: ValidationWarningKind;
  /** 警告が指す場所 (`marks[i].value` の添字は marks[] の添字) */
  path: string;
  /** 固定の文。入力由来の値を含まないので、表示するときの escape は要らない */
  message: string;
}

/** 検証結果: 成功 */
export interface ValidationSuccess<T> {
  valid: true;
  document: T;
  /** 警告があるときだけ付く。無いときはキーごと無い */
  warnings?: ValidationWarning[];
}

/** 検証結果: 失敗 */
export interface ValidationFailure {
  valid: false;
  errors: ValidationError[];
}

/** 検証結果 */
export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

/** バリデーションエラーを生成するヘルパー */
export function createValidationError(
  kind: ValidationErrorKind,
  path: string,
  message: string,
  expected?: string,
  actual?: unknown
): ValidationError {
  const error: ValidationError = { kind, path, message };
  if (expected !== undefined) {
    error.expected = expected;
  }
  if (actual !== undefined) {
    error.actual = actual;
  }
  return error;
}

/** 目印のキーの文字列は契約 (ADR-033 KD10)。変えると版の違うコピーの間で判別できなくなる */
const VALIDATION_ERROR_BRAND = Symbol.for('@kanbun-skam/skam/SKAMValidationError');

/** ValidationErrorをthrow可能なErrorに変換 */
export class SKAMValidationError extends Error {
  readonly errors: ValidationError[];

  constructor(errors: ValidationError[]) {
    const summary = errors
      .slice(0, 3)
      .map((e) => `${e.path}: ${e.message}`)
      .join('; ');
    const suffix = errors.length > 3 ? ` (+${errors.length - 3} more)` : '';
    super(`SKAM validation failed: ${summary}${suffix}`);
    this.name = 'SKAMValidationError';
    this.errors = errors;
  }
  /**
   * skam の重複、canvas-renderer の IIFE 版との併用、別の realm (iframe) ではクラスが別になり、
   * 通常の instanceof が偽になる。Symbol.for のレジストリは同じ agent の realm の間で共有されるので、
   * 目印で判別する (ADR-033 KD10)。
   * `this` がサブクラスのときは通常の判定に任せ、基底のインスタンスまで真になるのを防ぐ。
   */
  static override [Symbol.hasInstance](value: unknown): boolean {
    if (this !== SKAMValidationError) {
      return Function.prototype[Symbol.hasInstance].call(this, value);
    }
    try {
      if ((typeof value !== 'object' && typeof value !== 'function') || value === null)
        return false;
      return (value as Record<symbol, unknown>)[VALIDATION_ERROR_BRAND] === true;
    } catch {
      // getter や Proxy が投げても、判定は例外を出さない
      return false;
    }
  }
}

// 目印はプロトタイプの getter。インスタンスの own property にせず、列挙・JSON 化に出さない
Object.defineProperty(SKAMValidationError.prototype, VALIDATION_ERROR_BRAND, {
  get: () => true,
  enumerable: false,
  configurable: true,
});
