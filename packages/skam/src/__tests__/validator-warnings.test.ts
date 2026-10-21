import { describe, it, expect } from 'vitest';
import { validateSKAMDocument } from '../validator.js';
import { KAERI_MULTI_CHARACTER } from '../errors.js';
import type { SKAMDocument, Mark } from '../index.js';

function docWithMarks(marks: Mark[]): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '学' },
      { id: 't2', text: '而' },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
    marks,
    readings: [],
  };
}

const position = { blockId: 'b1', after: 't2' };

describe('validateSKAMDocument warnings (kaeri)', () => {
  it('複数の字の kaeri は valid: true のまま警告を 1 件返す', () => {
    const result = validateSKAMDocument(
      docWithMarks([{ type: 'kaeri', id: 'm1', position, value: '㆒㆑' }])
    );
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.warnings).toHaveLength(1);
    const warning = result.warnings![0]!;
    expect(warning.kind).toBe('KAERI_MULTI_CHARACTER');
    expect(warning.kind).toBe(KAERI_MULTI_CHARACTER);
    expect(warning.path).toBe('marks[0].value');
    expect(warning.message).toContain('0.4.0');
    expect(warning.message).toContain('splitMultiCharacterKaeri');
    // 入力由来の値を message に埋め込まない
    expect(warning.message).not.toContain('㆒');
  });

  it('警告の path は marks[] の添字を使う', () => {
    const result = validateSKAMDocument(
      docWithMarks([
        { type: 'kutoten', id: 'm0', position, value: 'comma' } as Mark,
        { type: 'kaeri', id: 'm1', position, value: '㆒㆑' },
      ])
    );
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.warnings?.[0]?.path).toBe('marks[1].value');
  });

  it('同じ位置の 1 字ずつの kaeri は警告なし (warnings のキーが無い)', () => {
    const result = validateSKAMDocument(
      docWithMarks([
        { type: 'kaeri', id: 'm1', position, value: '㆒' },
        { type: 'kaeri', id: 'm2', position, value: '㆑' },
      ])
    );
    expect(result.valid).toBe(true);
    expect(result).not.toHaveProperty('warnings');
  });

  it('1 字の kaeri は warnings のキーが無い', () => {
    const result = validateSKAMDocument(
      docWithMarks([{ type: 'kaeri', id: 'm1', position, value: '㆒' }])
    );
    expect(result.valid).toBe(true);
    expect(result).not.toHaveProperty('warnings');
  });

  it('Kanbun の字でない kaeri は今と同じ INVALID_VALUE', () => {
    const result = validateSKAMDocument(
      docWithMarks([{ type: 'kaeri', id: 'm1', position, value: '一' }])
    );
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors[0]?.kind).toBe('INVALID_VALUE');
    expect(result).not.toHaveProperty('warnings');
  });
});
