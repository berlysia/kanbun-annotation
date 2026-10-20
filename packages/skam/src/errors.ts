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
  | 'BLOCK_START_KAERI';

/**
 * ブロック先頭の返り点に対する案内文。
 * 返り点は直前の字に付く (anchor ベース) ため、ブロック先頭には置けない。
 * parser と validator が同じ文言で利用者を誘導する。
 */
export const BLOCK_START_KAERI_HINT =
  'ブロックは段落・文の単位です。表示上の改行のためにブロックを分けた場合は、ブロックを分けずに自動折り返しに任せてください。分けたままにする場合は、返り点を前のブロックの最後の字の後に置いてください。明示的な改行の手段は今後追加する予定です。';

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

/** 検証結果: 成功 */
export interface ValidationSuccess<T> {
  valid: true;
  document: T;
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
}
