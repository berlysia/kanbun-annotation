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
  | 'INVALID_VALUE';

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
