import { describe, it, expect } from 'vitest';
import { validateSKAMDocument, isSKAMDocument, assertSKAMDocument } from '../validator.js';
import { SKAMValidationError } from '../errors.js';
import type { SKAMDocument } from '../index.js';

// ============================================================================
// Test Data
// ============================================================================

const validMinimalDocument: SKAMDocument = {
  format: 'skam@0.1',
  tokens: [{ id: 't1', text: '學' }],
  marks: [],
  readings: [],
};

const validCompleteDocument: SKAMDocument = {
  format: 'skam@0.1',
  tokens: [
    { id: 't1', text: '学' },
    { id: 't2', text: '而' },
  ],
  marks: [
    { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'びて' },
    { type: 'kaeri', id: 'm2', anchor: { from: 't2', to: 't2' }, value: 'レ' },
  ],
  derivations: [{ kind: 'readingOrder', method: 'manual', result: ['t1', 't2'] }],
  readings: [{ kind: 'kakikudashi', text: '学びて' }],
};

// ============================================================================
// validateSKAMDocument Tests
// ============================================================================

describe('validateSKAMDocument', () => {
  describe('有効なドキュメント', () => {
    it('should validate minimal document', () => {
      const result = validateSKAMDocument(validMinimalDocument);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.document).toEqual(validMinimalDocument);
      }
    });

    it('should validate complete document with all fields', () => {
      const result = validateSKAMDocument(validCompleteDocument);
      expect(result.valid).toBe(true);
    });

    it('should validate document with all mark types', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '國' }],
        marks: [
          { type: 'kaeri', anchor: { from: 't1', to: 't1' }, value: 'レ' },
          { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'び' },
          { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'くに' },
          { type: 'okimoji', anchor: { from: 't1', to: 't1' } },
          { type: 'joji', anchor: { from: 't1', to: 't1' } },
          { type: 'soegana', anchor: { from: 't1', to: 't1' }, value: 'を' },
          { type: 'kutoten', anchor: { from: 't1', to: 't1' }, value: '。' },
          { type: 'emphasis', anchor: { from: 't1', to: 't1' } },
          {
            type: 'saidoku',
            anchor: { from: 't1', to: 't1' },
            forms: [{ yomi: 'まさ', okuri: 'に' }],
          },
          {
            type: 'okototen',
            anchor: { from: 't1', to: 't1' },
            position: { system: 'glyph-grid', grid: '5x5', x: 4, y: 4 },
            shape: 'dot',
          },
          { type: 'tateten', anchor: { from: 't1', to: 't1' } },
          { type: 'region', anchor: { from: 't1', to: 't1' } },
          { type: 'ref', anchor: { from: 't1', to: 't1' }, label: '(A)' },
        ],
        readings: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(true);
    });

    it('should validate region with all optional fields', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [{ type: 'region', anchor: { from: 't1', to: 't1' }, style: 'wavy', ref: 'ref-1' }],
        readings: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(true);
    });

    it('should validate ref with label only', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [{ type: 'ref', anchor: { from: 't1', to: 't1' }, label: '(A)' }],
        readings: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(true);
    });

    it('should validate ref with format only', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [{ type: 'ref', anchor: { from: 't1', to: 't1' }, format: 'alpha-upper' }],
        readings: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(true);
    });

    it('should validate ref with content only', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [{ type: 'ref', anchor: { from: 't1', to: 't1' }, content: '注釈テキスト' }],
        readings: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(true);
    });

    it('should validate ref with format and content', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [
          {
            type: 'ref',
            anchor: { from: 't1', to: 't1' },
            format: 'numeric-bracket',
            content: '注釈テキスト',
          },
        ],
        readings: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(true);
    });

    it('should validate all region styles', () => {
      const styles = ['none', 'solid', 'dotted', 'dashed', 'wavy', 'double'] as const;
      for (const style of styles) {
        const doc: SKAMDocument = {
          format: 'skam@0.1',
          tokens: [{ id: 't1', text: '學' }],
          marks: [{ type: 'region', anchor: { from: 't1', to: 't1' }, style }],
          readings: [],
        };

        const result = validateSKAMDocument(doc);
        expect(result.valid).toBe(true);
      }
    });

    it('should validate all ref formats', () => {
      const formats = [
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
      ] as const;
      for (const format of formats) {
        const doc: SKAMDocument = {
          format: 'skam@0.1',
          tokens: [{ id: 't1', text: '學' }],
          marks: [{ type: 'ref', anchor: { from: 't1', to: 't1' }, format }],
          readings: [],
        };

        const result = validateSKAMDocument(doc);
        expect(result.valid).toBe(true);
      }
    });

    it('should validate kutoten with kind field', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [
          { type: 'kutoten', anchor: { from: 't1', to: 't1' }, value: '。', kind: 'ku' },
          { type: 'kutoten', anchor: { from: 't1', to: 't1' }, value: '、', kind: 'ten' },
        ],
        readings: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(true);
    });

    it('should validate emphasis with optional value', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [
          { type: 'emphasis', anchor: { from: 't1', to: 't1' } },
          { type: 'emphasis', anchor: { from: 't1', to: 't1' }, value: '﹅' },
        ],
        readings: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(true);
    });

    it('should validate all reading kinds', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [],
        readings: [
          { kind: 'kundoku', text: '学ぶ' },
          { kind: 'kakikudashi', text: '学ぶ' },
          { kind: 'yomiage', text: 'まなぶ' },
        ],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(true);
    });

    it('should validate saidoku with n field', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '將' }],
        marks: [
          {
            type: 'saidoku',
            anchor: { from: 't1', to: 't1' },
            forms: [
              { n: 1, yomi: 'まさ', okuri: 'に' },
              { n: 2, okuri: 'す' },
            ],
          },
        ],
        readings: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(true);
    });

    it('should validate okototen with optional sound and color', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '國' }],
        marks: [
          {
            type: 'okototen',
            anchor: { from: 't1', to: 't1' },
            position: { system: 'glyph-grid', grid: '7x7', x: 3, y: 6 },
            shape: 'circle',
            sound: 'り',
            color: 'red',
          },
        ],
        readings: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(true);
    });
  });

  describe('無効なドキュメント - 型エラー', () => {
    it('should reject non-object input', () => {
      const result = validateSKAMDocument('not an object');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors[0]?.kind).toBe('INVALID_TYPE');
      }
    });

    it('should reject null input', () => {
      const result = validateSKAMDocument(null);
      expect(result.valid).toBe(false);
    });

    it('should reject array input', () => {
      const result = validateSKAMDocument([]);
      expect(result.valid).toBe(false);
    });
  });

  describe('無効なドキュメント - format', () => {
    it('should reject invalid format version', () => {
      const doc = {
        format: 'skam@0.2',
        tokens: [],
        marks: [],
        readings: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.kind === 'INVALID_FORMAT')).toBe(true);
      }
    });

    it('should reject missing format', () => {
      const doc = {
        tokens: [],
        marks: [],
        readings: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'format')).toBe(true);
      }
    });
  });

  describe('無効なドキュメント - tokens', () => {
    it('should reject missing tokens', () => {
      const doc = {
        format: 'skam@0.1',
        marks: [],
        readings: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'tokens')).toBe(true);
      }
    });

    it('should reject token without id', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ text: '學' }],
        marks: [],
        readings: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'tokens[0].id')).toBe(true);
      }
    });

    it('should reject token without text', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1' }],
        marks: [],
        readings: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'tokens[0].text')).toBe(true);
      }
    });

    it('should reject duplicate token IDs', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [
          { id: 't1', text: '學' },
          { id: 't1', text: '而' },
        ],
        marks: [],
        readings: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.kind === 'DUPLICATE_ID')).toBe(true);
      }
    });
  });

  describe('無効なドキュメント - marks', () => {
    it('should reject missing marks', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [],
        readings: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks')).toBe(true);
      }
    });

    it('should reject mark with invalid type', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [{ type: 'unknown', anchor: { from: 't1', to: 't1' } }],
        readings: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks[0].type')).toBe(true);
      }
    });

    it('should reject mark with missing anchor', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [{ type: 'kaeri', value: 'レ' }],
        readings: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks[0].anchor')).toBe(true);
      }
    });

    it('should reject mark with unknown token reference', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [{ type: 'kaeri', anchor: { from: 'unknown', to: 't1' }, value: 'レ' }],
        readings: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.kind === 'UNKNOWN_TOKEN_REF')).toBe(true);
      }
    });

    it('should reject kaeri without value', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [{ type: 'kaeri', anchor: { from: 't1', to: 't1' } }],
        readings: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks[0].value')).toBe(true);
      }
    });

    it('should reject saidoku without forms', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '將' }],
        marks: [{ type: 'saidoku', anchor: { from: 't1', to: 't1' } }],
        readings: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks[0].forms')).toBe(true);
      }
    });

    it('should reject okototen without position', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '國' }],
        marks: [{ type: 'okototen', anchor: { from: 't1', to: 't1' }, shape: 'dot' }],
        readings: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks[0].position')).toBe(true);
      }
    });

    it('should reject okototen without shape', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '國' }],
        marks: [
          {
            type: 'okototen',
            anchor: { from: 't1', to: 't1' },
            position: { system: 'glyph-grid', grid: '5x5', x: 0, y: 0 },
          },
        ],
        readings: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks[0].shape')).toBe(true);
      }
    });

    it('should reject okototen with invalid grid format', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '國' }],
        marks: [
          {
            type: 'okototen',
            anchor: { from: 't1', to: 't1' },
            position: { system: 'glyph-grid', grid: 'invalid', x: 0, y: 0 },
            shape: 'dot',
          },
        ],
        readings: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks[0].position.grid')).toBe(true);
      }
    });

    it('should reject duplicate mark IDs', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [
          { type: 'kaeri', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'レ' },
          { type: 'kaeri', id: 'm1', anchor: { from: 't1', to: 't1' }, value: '一' },
        ],
        readings: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.kind === 'DUPLICATE_ID')).toBe(true);
      }
    });

    it('should reject invalid kutoten kind', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [
          { type: 'kutoten', anchor: { from: 't1', to: 't1' }, value: '。', kind: 'invalid' },
        ],
        readings: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks[0].kind')).toBe(true);
      }
    });

    it('should reject region with invalid style', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [{ type: 'region', anchor: { from: 't1', to: 't1' }, style: 'invalid' }],
        readings: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks[0].style')).toBe(true);
      }
    });

    it('should reject ref without label, format, or content', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [{ type: 'ref', anchor: { from: 't1', to: 't1' } }],
        readings: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.message.includes('label, format, or content'))).toBe(
          true
        );
      }
    });

    it('should reject ref with invalid format', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [{ type: 'ref', anchor: { from: 't1', to: 't1' }, format: 'invalid' }],
        readings: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks[0].format')).toBe(true);
      }
    });

    it('should reject ref with both label and format', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [
          { type: 'ref', anchor: { from: 't1', to: 't1' }, label: '(A)', format: 'alpha-upper' },
        ],
        readings: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.message.includes('mutually exclusive'))).toBe(true);
      }
    });
  });

  describe('無効なドキュメント - readings', () => {
    it('should reject missing readings', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [],
        marks: [],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'readings')).toBe(true);
      }
    });

    it('should reject reading with invalid kind', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [],
        marks: [],
        readings: [{ kind: 'unknown', text: 'test' }],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'readings[0].kind')).toBe(true);
      }
    });

    it('should reject reading without text', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [],
        marks: [],
        readings: [{ kind: 'kakikudashi' }],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'readings[0].text')).toBe(true);
      }
    });
  });

  describe('無効なドキュメント - derivations', () => {
    it('should reject derivation without kind', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [],
        readings: [],
        derivations: [{ method: 'manual', result: ['t1'] }],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'derivations[0].kind')).toBe(true);
      }
    });

    it('should reject derivation without method', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [],
        readings: [],
        derivations: [{ kind: 'readingOrder', result: ['t1'] }],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'derivations[0].method')).toBe(true);
      }
    });

    it('should reject readingOrder without result', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [],
        readings: [],
        derivations: [{ kind: 'readingOrder', method: 'manual' }],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'derivations[0].result')).toBe(true);
      }
    });

    it('should reject derivation with unknown token in result', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [],
        readings: [],
        derivations: [{ kind: 'readingOrder', method: 'manual', result: ['t1', 'unknown'] }],
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.kind === 'UNKNOWN_TOKEN_REF')).toBe(true);
      }
    });
  });

  describe('複数エラーの報告', () => {
    it('should report multiple errors', () => {
      const doc = {
        format: 'invalid',
        tokens: 'not-array',
        marks: 'not-array',
        readings: 'not-array',
      };

      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.length).toBeGreaterThan(1);
      }
    });
  });
});

// ============================================================================
// isSKAMDocument Tests
// ============================================================================

describe('isSKAMDocument', () => {
  it('should return true for valid document', () => {
    expect(isSKAMDocument(validMinimalDocument)).toBe(true);
  });

  it('should return false for invalid document', () => {
    expect(isSKAMDocument({ invalid: true })).toBe(false);
  });

  it('should narrow type correctly', () => {
    const input: unknown = validMinimalDocument;
    if (isSKAMDocument(input)) {
      // TypeScript should allow accessing SKAMDocument properties
      expect(input.format).toBe('skam@0.1');
    }
  });
});

// ============================================================================
// assertSKAMDocument Tests
// ============================================================================

describe('assertSKAMDocument', () => {
  it('should not throw for valid document', () => {
    expect(() => assertSKAMDocument(validMinimalDocument)).not.toThrow();
  });

  it('should throw SKAMValidationError for invalid document', () => {
    expect(() => assertSKAMDocument({ invalid: true })).toThrow(SKAMValidationError);
  });

  it('should include errors in thrown exception', () => {
    try {
      assertSKAMDocument({ format: 'invalid' });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(SKAMValidationError);
      if (error instanceof SKAMValidationError) {
        expect(error.errors.length).toBeGreaterThan(0);
      }
    }
  });

  it('should assert type correctly', () => {
    const input: unknown = validMinimalDocument;
    assertSKAMDocument(input);
    // TypeScript should allow accessing SKAMDocument properties after assertion
    expect(input.format).toBe('skam@0.1');
  });
});

// ============================================================================
// SKAMValidationError Tests
// ============================================================================

describe('SKAMValidationError', () => {
  it('should format error message correctly', () => {
    const error = new SKAMValidationError([
      { kind: 'INVALID_FORMAT', path: 'format', message: 'Invalid format' },
    ]);
    expect(error.message).toContain('SKAM validation failed');
    expect(error.message).toContain('format');
  });

  it('should truncate long error lists', () => {
    const errors = Array.from({ length: 10 }, (_, i) => ({
      kind: 'INVALID_TYPE' as const,
      path: `path${i}`,
      message: `Error ${i}`,
    }));
    const error = new SKAMValidationError(errors);
    expect(error.message).toContain('+7 more');
  });
});
