/**
 * SKAM Document Validator
 *
 * ランタイム検証機能の実装
 */

import type {
  SKAMDocument,
  SKAMVersion,
  Token,
  Block,
  Mark,
  Anchor,
  Position,
  Reading,
  Derivation,
  MarkType,
  ReadingKind,
  GlyphGridCoord,
  SaidokuForm,
  RefFormat,
  HighlightStyle,
} from './index.js';
import {
  type ValidationError,
  type ValidationResult,
  createValidationError,
  SKAMValidationError,
} from './errors.js';
import { isPositionBasedMark } from './operations/index.js';

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
  'saidoku',
  'okototen',
  'tateten',
  'highlight',
  'ref',
];

const VALID_HIGHLIGHT_STYLES: HighlightStyle[] = ['solid', 'dotted', 'dashed', 'wavy', 'double'];
const VALID_REF_FORMATS: RefFormat[] = [
  'alpha-upper',
  'alpha-lower',
  'numeric-paren',
  'numeric-bracket',
  'numeric-circled',
  'iroha-katakana',
  'iroha-hiragana',
  'gojuon-katakana',
  'gojuon-hiragana',
  'kanji-numeric',
];

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

/**
 * Position（位置指定）の構造検証
 *
 * 有効なパターン:
 * - { blockId: string, after: string } - block 内のトークンの後ろに配置
 * - { blockId: string } (after 省略) - ブロック先頭に配置
 */
function validatePosition(
  position: unknown,
  path: string,
  errors: ValidationError[]
): position is Position {
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

  // blockId (required)
  if (!isString(position['blockId'])) {
    errors.push(
      createValidationError(
        'MISSING_FIELD',
        `${path}.blockId`,
        'position.blockId is required and must be a string',
        'string',
        typeof position['blockId']
      )
    );
    valid = false;
  }

  const hasAfter = 'after' in position && position['after'] !== undefined;

  // If after is present, it must be a string
  if (hasAfter && !isString(position['after'])) {
    errors.push(
      createValidationError(
        'INVALID_TYPE',
        `${path}.after`,
        'after must be a string (token ID)',
        'string',
        typeof position['after']
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

  if ('yomi' in form && !isString(form['yomi'])) {
    errors.push(
      createValidationError(
        'INVALID_TYPE',
        `${path}.yomi`,
        'yomi must be a string if provided',
        'string',
        typeof form['yomi']
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

// ============================================================================
// Type-specific Mark Validators
// ============================================================================

/** value フィールドが必須のマーク型 (kaeri, okurigana, yomigana, soegana, kutoten) */
function validateValueMark(
  mark: Record<string, unknown>,
  path: string,
  markType: string,
  errors: ValidationError[]
): boolean {
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
    return false;
  }
  return true;
}

function validateKutotenMark(
  mark: Record<string, unknown>,
  path: string,
  errors: ValidationError[]
): boolean {
  let valid = validateValueMark(mark, path, 'kutoten', errors);
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
  return valid;
}

function validateEmphasisMark(
  mark: Record<string, unknown>,
  path: string,
  errors: ValidationError[]
): boolean {
  if ('style' in mark && mark['style'] !== undefined && !isString(mark['style'])) {
    errors.push(
      createValidationError(
        'INVALID_TYPE',
        `${path}.style`,
        'emphasis style must be a string if provided',
        'string',
        typeof mark['style']
      )
    );
    return false;
  }
  return true;
}

function validateSaidokuMark(
  mark: Record<string, unknown>,
  path: string,
  errors: ValidationError[]
): boolean {
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
    return false;
  }
  let valid = true;
  mark['forms'].forEach((form, formIndex) => {
    if (!validateSaidokuForm(form, `${path}.forms[${formIndex}]`, errors)) {
      valid = false;
    }
  });
  return valid;
}

function validateOkototenMark(
  mark: Record<string, unknown>,
  path: string,
  errors: ValidationError[]
): boolean {
  let valid = true;
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
  return valid;
}

function validateHighlightMark(
  mark: Record<string, unknown>,
  path: string,
  errors: ValidationError[]
): boolean {
  let valid = true;
  if ('style' in mark && mark['style'] !== undefined) {
    if (!VALID_HIGHLIGHT_STYLES.includes(mark['style'] as HighlightStyle)) {
      errors.push(
        createValidationError(
          'INVALID_VALUE',
          `${path}.style`,
          `highlight style must be one of: ${VALID_HIGHLIGHT_STYLES.join(', ')}`,
          VALID_HIGHLIGHT_STYLES.join('|'),
          mark['style']
        )
      );
      valid = false;
    }
  }
  if ('ref' in mark && mark['ref'] !== undefined && !isString(mark['ref'])) {
    errors.push(
      createValidationError(
        'INVALID_TYPE',
        `${path}.ref`,
        'ref must be a string if provided',
        'string',
        typeof mark['ref']
      )
    );
    valid = false;
  }
  return valid;
}

function validateRefMark(
  mark: Record<string, unknown>,
  path: string,
  errors: ValidationError[]
): boolean {
  let valid = true;

  // At least one of label, format, or content must be present
  if (!('label' in mark) && !('format' in mark) && !('content' in mark)) {
    errors.push(
      createValidationError(
        'MISSING_FIELD',
        `${path}`,
        'ref requires at least one of: label, format, or content',
        'label, format, or content',
        'none'
      )
    );
    valid = false;
  }
  // label and format are mutually exclusive
  if (
    'label' in mark &&
    mark['label'] !== undefined &&
    'format' in mark &&
    mark['format'] !== undefined
  ) {
    errors.push(
      createValidationError(
        'INVALID_VALUE',
        `${path}`,
        'ref cannot have both label and format (mutually exclusive)',
        'label OR format',
        'both'
      )
    );
    valid = false;
  }
  // label is optional but must be string if present
  if ('label' in mark && mark['label'] !== undefined && !isString(mark['label'])) {
    errors.push(
      createValidationError(
        'INVALID_TYPE',
        `${path}.label`,
        'label must be a string if provided',
        'string',
        typeof mark['label']
      )
    );
    valid = false;
  }
  // format is optional but must be valid if present
  if ('format' in mark && mark['format'] !== undefined) {
    if (!VALID_REF_FORMATS.includes(mark['format'] as RefFormat)) {
      errors.push(
        createValidationError(
          'INVALID_VALUE',
          `${path}.format`,
          `ref format must be one of: ${VALID_REF_FORMATS.join(', ')}`,
          VALID_REF_FORMATS.join('|'),
          mark['format']
        )
      );
      valid = false;
    }
  }
  // content is optional but must be string if present
  if ('content' in mark && mark['content'] !== undefined && !isString(mark['content'])) {
    errors.push(
      createValidationError(
        'INVALID_TYPE',
        `${path}.content`,
        'content must be a string if provided',
        'string',
        typeof mark['content']
      )
    );
    valid = false;
  }
  return valid;
}

/**
 * Type-specific validation dispatch
 *
 * 各マーク型固有のフィールド検証を対応するバリデーターに委任する
 */
function validateMarkTypeFields(
  mark: Record<string, unknown>,
  markType: MarkType,
  path: string,
  errors: ValidationError[]
): boolean {
  switch (markType) {
    case 'kaeri':
    case 'okurigana':
    case 'yomigana':
    case 'soegana':
      return validateValueMark(mark, path, markType, errors);
    case 'okimoji':
    case 'joji':
    case 'tateten':
      return true; // No additional required fields
    case 'kutoten':
      return validateKutotenMark(mark, path, errors);
    case 'emphasis':
      return validateEmphasisMark(mark, path, errors);
    case 'saidoku':
      return validateSaidokuMark(mark, path, errors);
    case 'okototen':
      return validateOkototenMark(mark, path, errors);
    case 'highlight':
      return validateHighlightMark(mark, path, errors);
    case 'ref':
      return validateRefMark(mark, path, errors);
  }
}

// ============================================================================
// Main Mark Validator
// ============================================================================

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

  // Position-based marks (kaeri, kutoten, ref) require position instead of anchor
  const isPositionBased = markType === 'kaeri' || markType === 'kutoten' || markType === 'ref';

  if (isPositionBased) {
    if (!validatePosition(mark['position'], `${path}.position`, errors)) {
      valid = false;
    }
    if ('anchor' in mark && mark['anchor'] !== undefined) {
      errors.push(
        createValidationError(
          'INVALID_VALUE',
          `${path}.anchor`,
          `${markType} uses position, not anchor`,
          'no anchor',
          'anchor present'
        )
      );
      valid = false;
    }
  } else {
    if (!validateAnchor(mark['anchor'], `${path}.anchor`, errors)) {
      valid = false;
    }
  }

  // Type-specific validation (dispatch to dedicated validators)
  if (isString(markType)) {
    if (!validateMarkTypeFields(mark, markType as MarkType, path, errors)) {
      valid = false;
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
// Block Validation
// ============================================================================

function validateBlock(block: unknown, index: number, errors: ValidationError[]): block is Block {
  const path = `blocks[${index}]`;

  if (!isObject(block)) {
    errors.push(
      createValidationError('INVALID_TYPE', path, 'Block must be an object', 'object', typeof block)
    );
    return false;
  }

  let valid = true;

  if (!isString(block['id'])) {
    errors.push(
      createValidationError(
        'MISSING_FIELD',
        `${path}.id`,
        'Block id is required and must be a string',
        'string',
        typeof block['id']
      )
    );
    valid = false;
  }

  if (!isArray(block['tokenIds'])) {
    errors.push(
      createValidationError(
        'MISSING_FIELD',
        `${path}.tokenIds`,
        'Block tokenIds is required and must be an array',
        'array',
        typeof block['tokenIds']
      )
    );
    valid = false;
  } else {
    block['tokenIds'].forEach((tokenId, tokenIdIndex) => {
      if (!isString(tokenId)) {
        errors.push(
          createValidationError(
            'INVALID_TYPE',
            `${path}.tokenIds[${tokenIdIndex}]`,
            'tokenIds items must be strings',
            'string',
            typeof tokenId
          )
        );
        valid = false;
      }
    });
  }

  return valid;
}

// ============================================================================
// Token Reference Validation
// ============================================================================

/**
 * Block-Token 整合性検証
 *
 * - 全 token がちょうど1回 blocks に出現
 * - tokenIds の各要素は tokens に存在
 * - Block ID は一意
 */
function validateBlockTokenIntegrity(
  tokens: Token[],
  blocks: Block[],
  errors: ValidationError[]
): void {
  const tokenIdSet = new Set(tokens.map((t) => t.id));

  // Block ID uniqueness
  const blockIdCounts = new Map<string, number>();
  blocks.forEach((block, index) => {
    const count = (blockIdCounts.get(block.id) ?? 0) + 1;
    blockIdCounts.set(block.id, count);
    if (count > 1) {
      errors.push(
        createValidationError(
          'DUPLICATE_ID',
          `blocks[${index}].id`,
          `Duplicate block ID "${block.id}"`,
          'unique ID',
          block.id
        )
      );
    }
  });

  // Track which tokens are referenced by blocks
  const tokenToBlock = new Map<string, string>();

  blocks.forEach((block, blockIndex) => {
    block.tokenIds.forEach((tokenId, tokenIdIndex) => {
      // tokenId must exist in tokens
      if (!tokenIdSet.has(tokenId)) {
        errors.push(
          createValidationError(
            'UNKNOWN_TOKEN_REF',
            `blocks[${blockIndex}].tokenIds[${tokenIdIndex}]`,
            `Token "${tokenId}" not found in tokens`,
            'valid token ID',
            tokenId
          )
        );
        return;
      }

      // Token must not appear in multiple blocks
      const existingBlock = tokenToBlock.get(tokenId);
      if (existingBlock !== undefined) {
        errors.push(
          createValidationError(
            'INVALID_VALUE',
            `blocks[${blockIndex}].tokenIds[${tokenIdIndex}]`,
            `Token "${tokenId}" already belongs to block "${existingBlock}"`,
            'unique block membership',
            `also in block "${existingBlock}"`
          )
        );
      } else {
        tokenToBlock.set(tokenId, block.id);
      }
    });
  });

  // All tokens must belong to exactly one block
  tokens.forEach((token, index) => {
    if (!tokenToBlock.has(token.id)) {
      errors.push(
        createValidationError(
          'INVALID_VALUE',
          `tokens[${index}]`,
          `Token "${token.id}" does not belong to any block`,
          'block membership',
          'orphaned token'
        )
      );
    }
  });
}

/**
 * Anchor の block 制約検証
 *
 * - from/to は同一 block 内
 * - from のインデックス ≤ to のインデックス（blocks.tokenIds 内の順序）
 */
function validateAnchorBlockConstraints(
  blocks: Block[],
  marks: Mark[],
  errors: ValidationError[]
): void {
  // Build tokenId → { blockId, index in block } map
  const tokenBlockInfo = new Map<string, { blockId: string; indexInBlock: number }>();
  for (const block of blocks) {
    for (let i = 0; i < block.tokenIds.length; i++) {
      const tokenId = block.tokenIds[i];
      if (tokenId !== undefined) {
        tokenBlockInfo.set(tokenId, { blockId: block.id, indexInBlock: i });
      }
    }
  }

  const blockIdSet = new Set(blocks.map((b) => b.id));

  marks.forEach((mark, index) => {
    if (isPositionBasedMark(mark)) {
      // Position-based: validate blockId exists and after belongs to that block
      const path = `marks[${index}].position`;
      const position = mark.position;

      if (!blockIdSet.has(position.blockId)) {
        errors.push(
          createValidationError(
            'INVALID_VALUE',
            `${path}.blockId`,
            `Block "${position.blockId}" not found`,
            'valid block ID',
            position.blockId
          )
        );
      }

      if (position.after !== undefined) {
        const afterInfo = tokenBlockInfo.get(position.after);
        if (afterInfo && afterInfo.blockId !== position.blockId) {
          errors.push(
            createValidationError(
              'INVALID_VALUE',
              `${path}.after`,
              `Token "${position.after}" belongs to block "${afterInfo.blockId}", not "${position.blockId}"`,
              `token in block "${position.blockId}"`,
              `token in block "${afterInfo.blockId}"`
            )
          );
        }
      }
    } else {
      // Anchor-based: from/to must be in same block, from ≤ to in block order
      const path = `marks[${index}].anchor`;
      const fromInfo = tokenBlockInfo.get(mark.anchor.from);
      const toInfo = tokenBlockInfo.get(mark.anchor.to);

      if (fromInfo && toInfo) {
        if (fromInfo.blockId !== toInfo.blockId) {
          errors.push(
            createValidationError(
              'INVALID_ANCHOR',
              path,
              `anchor.from (block "${fromInfo.blockId}") and anchor.to (block "${toInfo.blockId}") must be in the same block`,
              'same block',
              `from in "${fromInfo.blockId}", to in "${toInfo.blockId}"`
            )
          );
        } else if (fromInfo.indexInBlock > toInfo.indexInBlock) {
          errors.push(
            createValidationError(
              'INVALID_ANCHOR',
              path,
              `anchor.from appears after anchor.to in block "${fromInfo.blockId}"`,
              'from ≤ to in block order',
              `from at index ${fromInfo.indexInBlock}, to at index ${toInfo.indexInBlock}`
            )
          );
        }
      }
    }
  });
}

function validateTokenReferences(
  tokens: Token[],
  marks: Mark[],
  derivations: Derivation[] | undefined,
  errors: ValidationError[]
): void {
  const tokenIdSet = new Set(tokens.map((t) => t.id));

  // Check mark references (anchor or position)
  marks.forEach((mark, index) => {
    if (isPositionBasedMark(mark)) {
      // Position-based mark: check position.after reference if present
      const path = `marks[${index}].position`;
      const position = mark.position;

      if (position.after !== undefined) {
        if (!tokenIdSet.has(position.after)) {
          errors.push(
            createValidationError(
              'UNKNOWN_TOKEN_REF',
              `${path}.after`,
              `Token "${position.after}" not found`,
              'valid token ID',
              position.after
            )
          );
        }
      }
    } else {
      // Anchor-based mark: check anchor references
      const path = `marks[${index}].anchor`;
      if (!tokenIdSet.has(mark.anchor.from)) {
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
      if (!tokenIdSet.has(mark.anchor.to)) {
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
    }
  });

  // Check derivation results
  derivations?.forEach((derivation, index) => {
    if (derivation.kind === 'readingOrder') {
      derivation.result.forEach((tokenId, itemIndex) => {
        if (!tokenIdSet.has(tokenId)) {
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

// ============================================================================
// Mark Conflict Validation
// ============================================================================

/**
 * マーク間の意味的衝突を検出
 *
 * 同一 anchor 上で saidoku と yomigana/okurigana が共存する場合エラー
 * （saidoku は forms[].yomi / forms[].okuri で読み仮名・送り仮名を内包するため）
 */
function validateMarkConflicts(marks: Mark[], errors: ValidationError[]): void {
  // anchor-based marks を anchor key でグループ化
  const anchorGroups = new Map<string, { type: string; index: number }[]>();

  marks.forEach((mark, index) => {
    if (!isPositionBasedMark(mark)) {
      const key = `${mark.anchor.from}:${mark.anchor.to}`;
      const group = anchorGroups.get(key);
      if (group) {
        group.push({ type: mark.type, index });
      } else {
        anchorGroups.set(key, [{ type: mark.type, index }]);
      }
    }
  });

  // 各グループ内で saidoku と yomigana/okurigana の衝突を検出
  for (const [, group] of anchorGroups) {
    const hasSaidoku = group.some((m) => m.type === 'saidoku');
    if (!hasSaidoku) continue;

    for (const m of group) {
      if (m.type === 'yomigana') {
        errors.push(
          createValidationError(
            'MARK_CONFLICT',
            `marks[${m.index}]`,
            'yomigana cannot coexist with saidoku on the same anchor (saidoku includes readings via forms[].yomi)',
            'no yomigana with saidoku',
            'yomigana'
          )
        );
      }
      if (m.type === 'okurigana') {
        errors.push(
          createValidationError(
            'MARK_CONFLICT',
            `marks[${m.index}]`,
            'okurigana cannot coexist with saidoku on the same anchor (saidoku includes suffixes via forms[].okuri)',
            'no okurigana with saidoku',
            'okurigana'
          )
        );
      }
    }
  }
}

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

function validateRequiredArray(
  input: Record<string, unknown>,
  field: string,
  errors: ValidationError[],
  itemValidator: (item: unknown, index: number, errors: ValidationError[]) => void
): void {
  const value = input[field];
  if (!isArray(value)) {
    errors.push(
      createValidationError(
        'MISSING_FIELD',
        field,
        `${field} is required and must be an array`,
        'array',
        typeof value
      )
    );
  } else {
    value.forEach((item, index) => {
      itemValidator(item, index, errors);
    });
  }
}

function validateDocumentFields(input: Record<string, unknown>, errors: ValidationError[]): void {
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

  validateRequiredArray(input, 'tokens', errors, validateToken);
  validateRequiredArray(input, 'marks', errors, validateMark);
  validateRequiredArray(input, 'readings', errors, validateReading);

  // blocks (required array with additional empty-document check)
  const blocks = input['blocks'];
  if (!isArray(blocks)) {
    errors.push(
      createValidationError(
        'MISSING_FIELD',
        'blocks',
        'blocks is required and must be an array',
        'array',
        typeof blocks
      )
    );
  } else {
    blocks.forEach((block, index) => {
      validateBlock(block, index, errors);
    });

    const tokens = input['tokens'];
    if (blocks.length === 0 && isArray(tokens) && tokens.length > 0) {
      errors.push(
        createValidationError(
          'INVALID_VALUE',
          'blocks',
          'blocks is empty but tokens is not empty. All tokens must belong to a block.',
          'non-empty blocks',
          'empty blocks with tokens'
        )
      );
    }
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
}

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

  // Field-level validation
  validateDocumentFields(input, errors);

  // Cross-reference validation (only if basic validation passed)
  const tokens = input['tokens'];
  const blocks = input['blocks'];
  const marks = input['marks'];
  const derivations = input['derivations'];
  if (errors.length === 0 && isArray(tokens) && isArray(marks) && isArray(blocks)) {
    validateUniqueIds(tokens as Token[], marks as Mark[], errors);
    validateBlockTokenIntegrity(tokens as Token[], blocks as Block[], errors);
    validateTokenReferences(
      tokens as Token[],
      marks as Mark[],
      isArray(derivations) ? (derivations as Derivation[]) : undefined,
      errors
    );
    validateAnchorBlockConstraints(blocks as Block[], marks as Mark[], errors);
    validateMarkConflicts(marks as Mark[], errors);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // At this point, all validations passed so we can safely cast
  const document: SKAMDocument = {
    format: input['format'] as SKAMVersion,
    tokens: input['tokens'] as Token[],
    blocks: input['blocks'] as Block[],
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
