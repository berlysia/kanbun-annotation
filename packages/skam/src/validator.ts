/**
 * SKAM Document Validator
 *
 * ランタイム検証機能の実装
 */

import type {
  SKAMDocument,
  SKAMVersion,
  Token,
  Mark,
  Anchor,
  Reading,
  Derivation,
  MarkType,
  ReadingKind,
  GlyphGridCoord,
  SaidokuForm,
} from './index.js';
import {
  type ValidationError,
  type ValidationResult,
  createValidationError,
  SKAMValidationError,
} from './errors.js';

const VALID_FORMAT: SKAMVersion = 'skam@0.1';

const VALID_MARK_TYPES: MarkType[] = [
  'kaeri',
  'okurigana',
  'yomigana',
  'okimoji',
  'joji',
  'soegana',
  'kutoten',
  'emphasis',
  'note',
  'saidoku',
  'okototen',
  'tateten',
  'underline',
  'label',
];

const VALID_UNDERLINE_STYLES = ['solid', 'dotted', 'dashed', 'wavy', 'double'] as const;
const VALID_LABEL_FORMATS = ['alpha-upper', 'alpha-lower', 'numeric', 'circled', 'iroha', 'iroha-hiragana', 'gojuon', 'gojuon-hiragana', 'kanji-numeric'] as const;

const VALID_READING_KINDS: ReadingKind[] = ['kundoku', 'kakikudashi', 'yomiage'];

// ============================================================================
// Type Guards
// ============================================================================

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

// ============================================================================
// Validation Helpers
// ============================================================================

function validateToken(token: unknown, index: number, errors: ValidationError[]): token is Token {
  const path = `tokens[${index}]`;

  if (!isObject(token)) {
    errors.push(
      createValidationError('INVALID_TYPE', path, 'Token must be an object', 'object', typeof token)
    );
    return false;
  }

  let valid = true;

  if (!isString(token['id'])) {
    errors.push(
      createValidationError(
        'MISSING_FIELD',
        `${path}.id`,
        'Token id is required and must be a string',
        'string',
        typeof token['id']
      )
    );
    valid = false;
  }

  if (!isString(token['text'])) {
    errors.push(
      createValidationError(
        'MISSING_FIELD',
        `${path}.text`,
        'Token text is required and must be a string',
        'string',
        typeof token['text']
      )
    );
    valid = false;
  }

  return valid;
}

function validateAnchor(
  anchor: unknown,
  path: string,
  errors: ValidationError[]
): anchor is Anchor {
  if (!isObject(anchor)) {
    errors.push(
      createValidationError(
        'INVALID_TYPE',
        path,
        'Anchor must be an object',
        'object',
        typeof anchor
      )
    );
    return false;
  }

  let valid = true;

  if (!isString(anchor['from'])) {
    errors.push(
      createValidationError(
        'MISSING_FIELD',
        `${path}.from`,
        'Anchor from is required and must be a string',
        'string',
        typeof anchor['from']
      )
    );
    valid = false;
  }

  if (!isString(anchor['to'])) {
    errors.push(
      createValidationError(
        'MISSING_FIELD',
        `${path}.to`,
        'Anchor to is required and must be a string',
        'string',
        typeof anchor['to']
      )
    );
    valid = false;
  }

  return valid;
}

function validateGlyphGridCoord(
  position: unknown,
  path: string,
  errors: ValidationError[]
): position is GlyphGridCoord {
  if (!isObject(position)) {
    errors.push(
      createValidationError(
        'INVALID_TYPE',
        path,
        'Position must be an object',
        'object',
        typeof position
      )
    );
    return false;
  }

  let valid = true;

  if (position['system'] !== 'glyph-grid') {
    errors.push(
      createValidationError(
        'INVALID_VALUE',
        `${path}.system`,
        'Position system must be "glyph-grid"',
        'glyph-grid',
        position['system']
      )
    );
    valid = false;
  }

  if (!isString(position['grid']) || !/^\d+x\d+$/.test(position['grid'])) {
    errors.push(
      createValidationError(
        'INVALID_VALUE',
        `${path}.grid`,
        'Grid must be in format "NxN" (e.g., "5x5")',
        'NxN pattern',
        position['grid']
      )
    );
    valid = false;
  }

  if (!isNumber(position['x']) || position['x'] < 0) {
    errors.push(
      createValidationError(
        'INVALID_VALUE',
        `${path}.x`,
        'X coordinate must be a non-negative number',
        'number >= 0',
        position['x']
      )
    );
    valid = false;
  }

  if (!isNumber(position['y']) || position['y'] < 0) {
    errors.push(
      createValidationError(
        'INVALID_VALUE',
        `${path}.y`,
        'Y coordinate must be a non-negative number',
        'number >= 0',
        position['y']
      )
    );
    valid = false;
  }

  return valid;
}

function validateSaidokuForm(
  form: unknown,
  path: string,
  errors: ValidationError[]
): form is SaidokuForm {
  if (!isObject(form)) {
    errors.push(
      createValidationError(
        'INVALID_TYPE',
        path,
        'Saidoku form must be an object',
        'object',
        typeof form
      )
    );
    return false;
  }

  let valid = true;

  if ('n' in form && !isNumber(form['n'])) {
    errors.push(
      createValidationError(
        'INVALID_TYPE',
        `${path}.n`,
        'n must be a number if provided',
        'number',
        typeof form['n']
      )
    );
    valid = false;
  }

  if ('reading' in form && !isString(form['reading'])) {
    errors.push(
      createValidationError(
        'INVALID_TYPE',
        `${path}.reading`,
        'reading must be a string if provided',
        'string',
        typeof form['reading']
      )
    );
    valid = false;
  }

  if ('okuri' in form && !isString(form['okuri'])) {
    errors.push(
      createValidationError(
        'INVALID_TYPE',
        `${path}.okuri`,
        'okuri must be a string if provided',
        'string',
        typeof form['okuri']
      )
    );
    valid = false;
  }

  return valid;
}

function validateMark(mark: unknown, index: number, errors: ValidationError[]): mark is Mark {
  const path = `marks[${index}]`;

  if (!isObject(mark)) {
    errors.push(
      createValidationError('INVALID_TYPE', path, 'Mark must be an object', 'object', typeof mark)
    );
    return false;
  }

  let valid = true;

  // type (required)
  const markType = mark['type'];
  if (!isString(markType) || !VALID_MARK_TYPES.includes(markType as MarkType)) {
    errors.push(
      createValidationError(
        'INVALID_VALUE',
        `${path}.type`,
        `Mark type must be one of: ${VALID_MARK_TYPES.join(', ')}`,
        VALID_MARK_TYPES.join('|'),
        markType
      )
    );
    valid = false;
  }

  // anchor (required)
  if (!validateAnchor(mark['anchor'], `${path}.anchor`, errors)) {
    valid = false;
  }

  // Type-specific validation
  if (isString(markType)) {
    switch (markType as MarkType) {
      case 'kaeri':
      case 'okurigana':
      case 'yomigana':
      case 'soegana':
      case 'note':
        if (!isString(mark['value'])) {
          errors.push(
            createValidationError(
              'MISSING_FIELD',
              `${path}.value`,
              `${markType} requires a value field`,
              'string',
              typeof mark['value']
            )
          );
          valid = false;
        }
        break;

      case 'okimoji':
      case 'joji':
        // No additional required fields (label marks)
        break;

      case 'kutoten':
        if (!isString(mark['value'])) {
          errors.push(
            createValidationError(
              'MISSING_FIELD',
              `${path}.value`,
              'kutoten requires a value field',
              'string',
              typeof mark['value']
            )
          );
          valid = false;
        }
        if ('kind' in mark && mark['kind'] !== undefined) {
          if (!['ku', 'ten', 'other'].includes(mark['kind'] as string)) {
            errors.push(
              createValidationError(
                'INVALID_VALUE',
                `${path}.kind`,
                'kutoten kind must be "ku", "ten", or "other"',
                'ku|ten|other',
                mark['kind']
              )
            );
            valid = false;
          }
        }
        break;

      case 'emphasis':
        // value is optional
        if ('value' in mark && mark['value'] !== undefined && !isString(mark['value'])) {
          errors.push(
            createValidationError(
              'INVALID_TYPE',
              `${path}.value`,
              'emphasis value must be a string if provided',
              'string',
              typeof mark['value']
            )
          );
          valid = false;
        }
        break;

      case 'saidoku':
        if (!isArray(mark['forms'])) {
          errors.push(
            createValidationError(
              'MISSING_FIELD',
              `${path}.forms`,
              'saidoku requires a forms array',
              'array',
              typeof mark['forms']
            )
          );
          valid = false;
        } else {
          mark['forms'].forEach((form, formIndex) => {
            if (!validateSaidokuForm(form, `${path}.forms[${formIndex}]`, errors)) {
              valid = false;
            }
          });
        }
        break;

      case 'okototen':
        if (!validateGlyphGridCoord(mark['position'], `${path}.position`, errors)) {
          valid = false;
        }
        if (!isString(mark['shape'])) {
          errors.push(
            createValidationError(
              'MISSING_FIELD',
              `${path}.shape`,
              'okototen requires a shape field',
              'string',
              typeof mark['shape']
            )
          );
          valid = false;
        }
        break;

      case 'tateten':
        // No additional required fields
        break;

      case 'underline':
        // style is optional but must be valid if present
        if ('style' in mark && mark['style'] !== undefined) {
          if (!VALID_UNDERLINE_STYLES.includes(mark['style'] as (typeof VALID_UNDERLINE_STYLES)[number])) {
            errors.push(
              createValidationError(
                'INVALID_VALUE',
                `${path}.style`,
                `underline style must be one of: ${VALID_UNDERLINE_STYLES.join(', ')}`,
                VALID_UNDERLINE_STYLES.join('|'),
                mark['style']
              )
            );
            valid = false;
          }
        }
        // group is optional string
        if ('group' in mark && mark['group'] !== undefined && !isString(mark['group'])) {
          errors.push(
            createValidationError(
              'INVALID_TYPE',
              `${path}.group`,
              'group must be a string if provided',
              'string',
              typeof mark['group']
            )
          );
          valid = false;
        }
        break;

      case 'label':
        // Either value or format must be present (at least one)
        if (!('value' in mark) && !('format' in mark)) {
          errors.push(
            createValidationError(
              'MISSING_FIELD',
              `${path}`,
              'label requires either value or format (or both)',
              'value or format',
              'neither'
            )
          );
          valid = false;
        }
        // value is optional but must be string if present
        if ('value' in mark && mark['value'] !== undefined && !isString(mark['value'])) {
          errors.push(
            createValidationError(
              'INVALID_TYPE',
              `${path}.value`,
              'value must be a string if provided',
              'string',
              typeof mark['value']
            )
          );
          valid = false;
        }
        // format is optional but must be valid if present
        if ('format' in mark && mark['format'] !== undefined) {
          if (!VALID_LABEL_FORMATS.includes(mark['format'] as (typeof VALID_LABEL_FORMATS)[number])) {
            errors.push(
              createValidationError(
                'INVALID_VALUE',
                `${path}.format`,
                `label format must be one of: ${VALID_LABEL_FORMATS.join(', ')}`,
                VALID_LABEL_FORMATS.join('|'),
                mark['format']
              )
            );
            valid = false;
          }
        }
        // group is optional string
        if ('group' in mark && mark['group'] !== undefined && !isString(mark['group'])) {
          errors.push(
            createValidationError(
              'INVALID_TYPE',
              `${path}.group`,
              'group must be a string if provided',
              'string',
              typeof mark['group']
            )
          );
          valid = false;
        }
        break;
    }
  }

  return valid;
}

function validateReading(
  reading: unknown,
  index: number,
  errors: ValidationError[]
): reading is Reading {
  const path = `readings[${index}]`;

  if (!isObject(reading)) {
    errors.push(
      createValidationError(
        'INVALID_TYPE',
        path,
        'Reading must be an object',
        'object',
        typeof reading
      )
    );
    return false;
  }

  let valid = true;

  const kind = reading['kind'];
  if (!isString(kind) || !VALID_READING_KINDS.includes(kind as ReadingKind)) {
    errors.push(
      createValidationError(
        'INVALID_VALUE',
        `${path}.kind`,
        `Reading kind must be one of: ${VALID_READING_KINDS.join(', ')}`,
        VALID_READING_KINDS.join('|'),
        kind
      )
    );
    valid = false;
  }

  if (!isString(reading['text'])) {
    errors.push(
      createValidationError(
        'MISSING_FIELD',
        `${path}.text`,
        'Reading text is required and must be a string',
        'string',
        typeof reading['text']
      )
    );
    valid = false;
  }

  return valid;
}

function validateDerivation(
  derivation: unknown,
  index: number,
  errors: ValidationError[]
): derivation is Derivation {
  const path = `derivations[${index}]`;

  if (!isObject(derivation)) {
    errors.push(
      createValidationError(
        'INVALID_TYPE',
        path,
        'Derivation must be an object',
        'object',
        typeof derivation
      )
    );
    return false;
  }

  let valid = true;

  if (!isString(derivation['kind'])) {
    errors.push(
      createValidationError(
        'MISSING_FIELD',
        `${path}.kind`,
        'Derivation kind is required',
        'string',
        typeof derivation['kind']
      )
    );
    valid = false;
  }

  if (!isString(derivation['method'])) {
    errors.push(
      createValidationError(
        'MISSING_FIELD',
        `${path}.method`,
        'Derivation method is required',
        'string',
        typeof derivation['method']
      )
    );
    valid = false;
  }

  // kind-specific validation
  if (derivation['kind'] === 'readingOrder') {
    if (!isArray(derivation['result'])) {
      errors.push(
        createValidationError(
          'MISSING_FIELD',
          `${path}.result`,
          'readingOrder derivation requires a result array',
          'array',
          typeof derivation['result']
        )
      );
      valid = false;
    } else {
      derivation['result'].forEach((item, itemIndex) => {
        if (!isString(item)) {
          errors.push(
            createValidationError(
              'INVALID_TYPE',
              `${path}.result[${itemIndex}]`,
              'Result items must be strings (token IDs)',
              'string',
              typeof item
            )
          );
          valid = false;
        }
      });
    }
  }

  return valid;
}

// ============================================================================
// Token Reference Validation
// ============================================================================

function validateTokenReferences(
  tokens: Token[],
  marks: Mark[],
  derivations: Derivation[] | undefined,
  errors: ValidationError[]
): void {
  const tokenIds = new Set(tokens.map((t) => t.id));

  // Check mark anchors
  marks.forEach((mark, index) => {
    const path = `marks[${index}].anchor`;
    if (!tokenIds.has(mark.anchor.from)) {
      errors.push(
        createValidationError(
          'UNKNOWN_TOKEN_REF',
          `${path}.from`,
          `Token "${mark.anchor.from}" not found`,
          'valid token ID',
          mark.anchor.from
        )
      );
    }
    if (!tokenIds.has(mark.anchor.to)) {
      errors.push(
        createValidationError(
          'UNKNOWN_TOKEN_REF',
          `${path}.to`,
          `Token "${mark.anchor.to}" not found`,
          'valid token ID',
          mark.anchor.to
        )
      );
    }
  });

  // Check derivation results
  derivations?.forEach((derivation, index) => {
    if (derivation.kind === 'readingOrder') {
      derivation.result.forEach((tokenId, itemIndex) => {
        if (!tokenIds.has(tokenId)) {
          errors.push(
            createValidationError(
              'UNKNOWN_TOKEN_REF',
              `derivations[${index}].result[${itemIndex}]`,
              `Token "${tokenId}" not found`,
              'valid token ID',
              tokenId
            )
          );
        }
      });
    }
  });
}

// ============================================================================
// ID Uniqueness Validation
// ============================================================================

function validateUniqueIds(tokens: Token[], marks: Mark[], errors: ValidationError[]): void {
  // Token IDs
  const tokenIdCounts = new Map<string, number>();
  tokens.forEach((token, index) => {
    const count = (tokenIdCounts.get(token.id) ?? 0) + 1;
    tokenIdCounts.set(token.id, count);
    if (count > 1) {
      errors.push(
        createValidationError(
          'DUPLICATE_ID',
          `tokens[${index}].id`,
          `Duplicate token ID "${token.id}"`,
          'unique ID',
          token.id
        )
      );
    }
  });

  // Mark IDs (optional but should be unique if present)
  const markIdCounts = new Map<string, number>();
  marks.forEach((mark, index) => {
    if (mark.id !== undefined) {
      const count = (markIdCounts.get(mark.id) ?? 0) + 1;
      markIdCounts.set(mark.id, count);
      if (count > 1) {
        errors.push(
          createValidationError(
            'DUPLICATE_ID',
            `marks[${index}].id`,
            `Duplicate mark ID "${mark.id}"`,
            'unique ID',
            mark.id
          )
        );
      }
    }
  });
}

// ============================================================================
// Main Validation Functions
// ============================================================================

/**
 * SKAMDocument を検証する
 *
 * @param input 検証対象のオブジェクト
 * @returns 検証結果
 */
export function validateSKAMDocument(input: unknown): ValidationResult<SKAMDocument> {
  const errors: ValidationError[] = [];

  // Root object check
  if (!isObject(input)) {
    errors.push(
      createValidationError('INVALID_TYPE', '', 'Input must be an object', 'object', typeof input)
    );
    return { valid: false, errors };
  }

  // format (required)
  if (input['format'] !== VALID_FORMAT) {
    errors.push(
      createValidationError(
        'INVALID_FORMAT',
        'format',
        `Format must be "${VALID_FORMAT}"`,
        VALID_FORMAT,
        input['format']
      )
    );
  }

  // tokens (required array)
  const tokens = input['tokens'];
  if (!isArray(tokens)) {
    errors.push(
      createValidationError(
        'MISSING_FIELD',
        'tokens',
        'tokens is required and must be an array',
        'array',
        typeof tokens
      )
    );
  } else {
    tokens.forEach((token, index) => {
      validateToken(token, index, errors);
    });
  }

  // marks (required array)
  const marks = input['marks'];
  if (!isArray(marks)) {
    errors.push(
      createValidationError(
        'MISSING_FIELD',
        'marks',
        'marks is required and must be an array',
        'array',
        typeof marks
      )
    );
  } else {
    marks.forEach((mark, index) => {
      validateMark(mark, index, errors);
    });
  }

  // readings (required array)
  const readings = input['readings'];
  if (!isArray(readings)) {
    errors.push(
      createValidationError(
        'MISSING_FIELD',
        'readings',
        'readings is required and must be an array',
        'array',
        typeof readings
      )
    );
  } else {
    readings.forEach((reading, index) => {
      validateReading(reading, index, errors);
    });
  }

  // derivations (optional array)
  const derivations = input['derivations'];
  if (derivations !== undefined) {
    if (!isArray(derivations)) {
      errors.push(
        createValidationError(
          'INVALID_TYPE',
          'derivations',
          'derivations must be an array if provided',
          'array',
          typeof derivations
        )
      );
    } else {
      derivations.forEach((derivation, index) => {
        validateDerivation(derivation, index, errors);
      });
    }
  }

  // Cross-reference validation (only if basic validation passed)
  if (errors.length === 0 && isArray(tokens) && isArray(marks)) {
    validateUniqueIds(tokens as Token[], marks as Mark[], errors);
    validateTokenReferences(
      tokens as Token[],
      marks as Mark[],
      isArray(derivations) ? (derivations as Derivation[]) : undefined,
      errors
    );
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // At this point, all validations passed so we can safely cast
  const document: SKAMDocument = {
    format: input['format'] as SKAMVersion,
    tokens: input['tokens'] as Token[],
    marks: input['marks'] as Mark[],
    readings: input['readings'] as Reading[],
  };

  if (input['derivations'] !== undefined) {
    document.derivations = input['derivations'] as Derivation[];
  }

  if (input['ext'] !== undefined) {
    document.ext = input['ext'] as Record<string, unknown>;
  }

  return { valid: true, document };
}

/**
 * 型ガード: SKAMDocument かどうか判定
 *
 * @param input 判定対象
 * @returns SKAMDocument の場合 true
 */
export function isSKAMDocument(input: unknown): input is SKAMDocument {
  return validateSKAMDocument(input).valid;
}

/**
 * アサーション: SKAMDocument でなければ例外
 *
 * @param input 検証対象
 * @throws {SKAMValidationError} 検証失敗時
 */
export function assertSKAMDocument(input: unknown): asserts input is SKAMDocument {
  const result = validateSKAMDocument(input);
  if (!result.valid) {
    throw new SKAMValidationError(result.errors);
  }
}
