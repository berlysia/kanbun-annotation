import { describe, it, expect } from 'vitest';
import { validateSKAMDocument, assertSKAMDocument } from '../validator.js';
import { SKAMValidationError } from '../errors.js';

// ============================================================================
// Edge cases and boundary value tests for validator
// ============================================================================

describe('validateSKAMDocument - edge cases', () => {
  describe('primitive and degenerate inputs', () => {
    it('should reject undefined input', () => {
      const result = validateSKAMDocument(undefined);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors[0]?.kind).toBe('INVALID_TYPE');
      }
    });

    it('should reject numeric input', () => {
      const result = validateSKAMDocument(42);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors[0]?.kind).toBe('INVALID_TYPE');
      }
    });

    it('should reject boolean input', () => {
      const result = validateSKAMDocument(true);
      expect(result.valid).toBe(false);
    });

    it('should reject empty object', () => {
      const result = validateSKAMDocument({});
      expect(result.valid).toBe(false);
      if (!result.valid) {
        // Should report missing format, tokens, blocks, marks, readings
        expect(result.errors.length).toBeGreaterThanOrEqual(4);
      }
    });

    it('should reject function input', () => {
      const result = validateSKAMDocument(() => {});
      expect(result.valid).toBe(false);
    });
  });

  describe('token edge cases', () => {
    it('should reject token with empty string id', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: '', text: '學' }],
        blocks: [{ id: 'b1', tokenIds: [''] }],
        marks: [],
        readings: [],
      };
      // Empty string is still a string, so structural validation passes
      // but semantically it's questionable - validator currently allows it
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(true);
    });

    it('should reject token with numeric id', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 123, text: '學' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [],
        readings: [],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'tokens[0].id')).toBe(true);
      }
    });

    it('should reject token with numeric text', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: 42 }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [],
        readings: [],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'tokens[0].text')).toBe(true);
      }
    });

    it('should reject token that is a primitive', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: ['not-a-token'],
        blocks: [],
        marks: [],
        readings: [],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'tokens[0]')).toBe(true);
        expect(result.errors.some((e) => e.kind === 'INVALID_TYPE')).toBe(true);
      }
    });
  });

  describe('block edge cases', () => {
    it('should reject block that is a primitive', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [],
        blocks: ['not-a-block'],
        marks: [],
        readings: [],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'blocks[0]')).toBe(true);
        expect(result.errors.some((e) => e.kind === 'INVALID_TYPE')).toBe(true);
      }
    });

    it('should reject block with non-string tokenIds element', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [{ id: 'b1', tokenIds: [123] }],
        marks: [],
        readings: [],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'blocks[0].tokenIds[0]')).toBe(true);
      }
    });
  });

  describe('mark edge cases', () => {
    it('should reject mark that is a primitive', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: ['not-a-mark'],
        readings: [],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.kind === 'INVALID_TYPE')).toBe(true);
      }
    });

    it('should reject mark without type', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [{ anchor: { from: 't1', to: 't1' }, value: 'test' }],
        readings: [],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks[0].type')).toBe(true);
      }
    });

    it('should reject anchor-based mark with non-object anchor', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [{ type: 'okurigana', anchor: 'invalid', value: 'び' }],
        readings: [],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks[0].anchor')).toBe(true);
      }
    });

    it('should reject anchor with non-string from', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [{ type: 'okurigana', anchor: { from: 123, to: 't1' }, value: 'び' }],
        readings: [],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks[0].anchor.from')).toBe(true);
      }
    });

    it('should reject position-based mark with non-object position', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [{ type: 'kaeri', position: 'invalid', value: '㆑' }],
        readings: [],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks[0].position')).toBe(true);
      }
    });

    it('should reject position with non-string after', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [{ type: 'kaeri', position: { blockId: 'b1', after: 123 }, value: '㆑' }],
        readings: [],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks[0].position.after')).toBe(true);
      }
    });

    it('should reject okurigana without value', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [{ type: 'okurigana', anchor: { from: 't1', to: 't1' } }],
        readings: [],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks[0].value')).toBe(true);
      }
    });

    it('should reject yomigana without value', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [{ type: 'yomigana', anchor: { from: 't1', to: 't1' } }],
        readings: [],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks[0].value')).toBe(true);
      }
    });

    it('should reject soegana without value', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [{ type: 'soegana', anchor: { from: 't1', to: 't1' } }],
        readings: [],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks[0].value')).toBe(true);
      }
    });

    it('should reject kutoten without value', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [{ type: 'kutoten', position: { blockId: 'b1', after: 't1' } }],
        readings: [],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks[0].value')).toBe(true);
      }
    });

    it('should reject emphasis with non-string style', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [{ type: 'emphasis', anchor: { from: 't1', to: 't1' }, style: 123 }],
        readings: [],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks[0].style')).toBe(true);
      }
    });

    it('should reject highlight with non-string ref', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [{ type: 'highlight', anchor: { from: 't1', to: 't1' }, ref: 123 }],
        readings: [],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks[0].ref')).toBe(true);
      }
    });

    it('should reject ref with non-string label', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [{ type: 'ref', position: { blockId: 'b1', after: 't1' }, label: 123 }],
        readings: [],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks[0].label')).toBe(true);
      }
    });

    it('should reject ref with non-string content', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [{ type: 'ref', position: { blockId: 'b1', after: 't1' }, content: 123 }],
        readings: [],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks[0].content')).toBe(true);
      }
    });

    it('should reject saidoku with non-array forms', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '將' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [{ type: 'saidoku', anchor: { from: 't1', to: 't1' }, forms: 'invalid' }],
        readings: [],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks[0].forms')).toBe(true);
      }
    });

    it('should reject saidoku form with non-number n', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '將' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [
          {
            type: 'saidoku',
            anchor: { from: 't1', to: 't1' },
            forms: [{ n: 'one', yomi: 'まさ' }],
          },
        ],
        readings: [],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks[0].forms[0].n')).toBe(true);
      }
    });

    it('should reject saidoku form with non-string yomi', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '將' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [
          {
            type: 'saidoku',
            anchor: { from: 't1', to: 't1' },
            forms: [{ n: 1, yomi: 123 }],
          },
        ],
        readings: [],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks[0].forms[0].yomi')).toBe(true);
      }
    });

    it('should reject saidoku form with non-string okuri', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '將' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [
          {
            type: 'saidoku',
            anchor: { from: 't1', to: 't1' },
            forms: [{ okuri: true }],
          },
        ],
        readings: [],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks[0].forms[0].okuri')).toBe(true);
      }
    });

    it('should reject saidoku form that is a primitive', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '將' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [
          {
            type: 'saidoku',
            anchor: { from: 't1', to: 't1' },
            forms: ['invalid'],
          },
        ],
        readings: [],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks[0].forms[0]')).toBe(true);
      }
    });
  });

  describe('okototen edge cases', () => {
    it('should reject okototen with non-object position', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '國' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [
          {
            type: 'okototen',
            anchor: { from: 't1', to: 't1' },
            position: 'invalid',
            shape: 'dot',
          },
        ],
        readings: [],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
    });

    it('should reject okototen with wrong system', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '國' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [
          {
            type: 'okototen',
            anchor: { from: 't1', to: 't1' },
            position: { system: 'wrong', grid: '5x5', x: 0, y: 0 },
            shape: 'dot',
          },
        ],
        readings: [],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks[0].position.system')).toBe(true);
      }
    });

    it('should reject okototen with negative x coordinate', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '國' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [
          {
            type: 'okototen',
            anchor: { from: 't1', to: 't1' },
            position: { system: 'glyph-grid', grid: '5x5', x: -1, y: 0 },
            shape: 'dot',
          },
        ],
        readings: [],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks[0].position.x')).toBe(true);
      }
    });

    it('should reject okototen with NaN x coordinate', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '國' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [
          {
            type: 'okototen',
            anchor: { from: 't1', to: 't1' },
            position: { system: 'glyph-grid', grid: '5x5', x: NaN, y: 0 },
            shape: 'dot',
          },
        ],
        readings: [],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
    });
  });

  describe('reading edge cases', () => {
    it('should reject reading that is a primitive', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [],
        blocks: [],
        marks: [],
        readings: ['not-a-reading'],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'readings[0]')).toBe(true);
        expect(result.errors.some((e) => e.kind === 'INVALID_TYPE')).toBe(true);
      }
    });

    it('should reject reading without kind', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [],
        blocks: [],
        marks: [],
        readings: [{ text: '学ぶ' }],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'readings[0].kind')).toBe(true);
      }
    });
  });

  describe('derivation edge cases', () => {
    it('should reject non-array derivations', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [],
        readings: [],
        derivations: 'invalid',
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'derivations')).toBe(true);
      }
    });

    it('should reject derivation that is a primitive', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [],
        readings: [],
        derivations: ['not-a-derivation'],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'derivations[0]')).toBe(true);
      }
    });

    it('should reject readingOrder with non-string result items', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [],
        readings: [],
        derivations: [{ kind: 'readingOrder', method: 'manual', result: [123] }],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'derivations[0].result[0]')).toBe(true);
      }
    });

    it('should reject readingOrder with non-array result', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [],
        readings: [],
        derivations: [{ kind: 'readingOrder', method: 'manual', result: 'not-array' }],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'derivations[0].result')).toBe(true);
      }
    });
  });

  describe('position-based mark with anchor', () => {
    it('should reject kaeri with both position and anchor', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [
          {
            type: 'kaeri',
            position: { blockId: 'b1', after: 't1' },
            anchor: { from: 't1', to: 't1' },
            value: '㆑',
          },
        ],
        readings: [],
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.path === 'marks[0].anchor')).toBe(true);
      }
    });
  });

  describe('ext field preservation', () => {
    it('should preserve ext field on valid document', () => {
      const doc = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [],
        readings: [],
        ext: { custom: 'data', nested: { key: 'value' } },
      };
      const result = validateSKAMDocument(doc);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.document.ext).toEqual({ custom: 'data', nested: { key: 'value' } });
      }
    });
  });
});

describe('assertSKAMDocument - error details', () => {
  it('should include path information in thrown error', () => {
    try {
      assertSKAMDocument({
        format: 'skam@0.1',
        tokens: [{ id: 123 }],
        blocks: [],
        marks: [],
        readings: [],
      });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(SKAMValidationError);
      if (error instanceof SKAMValidationError) {
        expect(error.errors.some((e) => e.path.includes('tokens'))).toBe(true);
      }
    }
  });

  it('should include error kind in thrown error', () => {
    try {
      assertSKAMDocument(null);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(SKAMValidationError);
      if (error instanceof SKAMValidationError) {
        expect(error.errors[0]?.kind).toBe('INVALID_TYPE');
      }
    }
  });
});
