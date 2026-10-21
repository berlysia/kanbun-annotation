import { describe, it, expect } from 'vitest';
import { splitMultiCharacterKaeri } from '../kaeri-migration.js';
import { validateSKAMDocument } from '../validator.js';
import type { SKAMDocument, Mark } from '../index.js';
import type { IdGenerator } from '../id-generator.js';

const position = { blockId: 'b1', after: 't2' };

function docWithMarks(marks: Mark[]): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '不' },
      { id: 't2', text: '可' },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
    marks,
    readings: [],
  };
}

function sequence(ids: string[]): IdGenerator {
  let i = 0;
  return { generate: () => ids[i++]! };
}

const kutoten = { type: 'kutoten', id: 'm0', position, value: '。' } as Mark;
const okurigana = {
  type: 'okurigana',
  id: 'm2',
  anchor: { from: 't1', to: 't1' },
  value: 'ず',
} as Mark;

describe('splitMultiCharacterKaeri', () => {
  it('分けた注記を元の位置に字の順で並べ、1 つ目は id と ext を引き継ぐ', () => {
    const doc = docWithMarks([
      kutoten,
      { type: 'kaeri', id: 'm1', position, value: '㆒㆑', ext: { note: 1 } },
      okurigana,
    ]);
    const snapshot = structuredClone(doc);
    const result = splitMultiCharacterKaeri(doc, { idGenerator: sequence(['n1']) });
    expect(result.marks).toEqual([
      kutoten,
      { type: 'kaeri', id: 'm1', position, value: '㆒', ext: { note: 1 } },
      { type: 'kaeri', id: 'n1', position, value: '㆑' },
      okurigana,
    ]);
    expect(doc).toEqual(snapshot);
  });

  it('字の順を保つ (㆑㆒)', () => {
    const doc = docWithMarks([{ type: 'kaeri', id: 'm1', position, value: '㆑㆒' }]);
    const result = splitMultiCharacterKaeri(doc, { idGenerator: sequence(['k9']) });
    expect(result.marks.map((m) => [m.id, (m as { value: string }).value])).toEqual([
      ['m1', '㆑'],
      ['k9', '㆒'],
    ]);
  });

  it('3 字以上も分ける', () => {
    const doc = docWithMarks([{ type: 'kaeri', id: 'm1', position, value: '㆒㆑㆑' }]);
    const result = splitMultiCharacterKaeri(doc, { idGenerator: sequence(['a', 'b']) });
    expect(result.marks.map((m) => (m as { value: string }).value)).toEqual(['㆒', '㆑', '㆑']);
  });

  it('複数の字の kaeri が無い文書は、同じ内容の別のオブジェクトを返す', () => {
    const doc = docWithMarks([kutoten, { type: 'kaeri', id: 'm1', position, value: '㆒' }]);
    const result = splitMultiCharacterKaeri(doc);
    expect(result).toEqual(doc);
    expect(result).not.toBe(doc);
  });

  it('変換の後の文書は警告なしで valid', () => {
    const doc = docWithMarks([{ type: 'kaeri', id: 'm1', position, value: '㆒㆑' }]);
    const result = splitMultiCharacterKaeri(doc);
    const validation = validateSKAMDocument(result);
    expect(validation.valid).toBe(true);
    expect(validation).not.toHaveProperty('warnings');
  });

  it('冪等', () => {
    const doc = docWithMarks([{ type: 'kaeri', id: 'm1', position, value: '㆒㆑' }]);
    const once = splitMultiCharacterKaeri(doc);
    expect(splitMultiCharacterKaeri(once)).toEqual(once);
  });

  it('既存の id と重なった id は振り直す', () => {
    const doc = docWithMarks([
      { type: 'kaeri', id: 'm1', position, value: '㆒㆑' },
      { type: 'okurigana', id: 'k2', anchor: { from: 't1', to: 't1' }, value: 'ず' },
    ]);
    const result = splitMultiCharacterKaeri(doc, { idGenerator: sequence(['k2', 'k3']) });
    expect(result.marks.map((m) => m.id)).toEqual(['m1', 'k3', 'k2']);
  });

  it('token や block の id とも重ならない', () => {
    const doc = docWithMarks([{ type: 'kaeri', id: 'm1', position, value: '㆒㆑' }]);
    const result = splitMultiCharacterKaeri(doc, { idGenerator: sequence(['t1', 'b1', 'x']) });
    expect(result.marks.map((m) => m.id)).toEqual(['m1', 'x']);
  });

  it('この変換で振った id とも重ならない', () => {
    const doc = docWithMarks([{ type: 'kaeri', id: 'm1', position, value: '㆒㆑㆑' }]);
    const result = splitMultiCharacterKaeri(doc, { idGenerator: sequence(['a', 'a', 'b']) });
    expect(result.marks.map((m) => m.id)).toEqual(['m1', 'a', 'b']);
  });

  it('100 回続けて重なったら Error を投げる', () => {
    const doc = docWithMarks([{ type: 'kaeri', id: 'm1', position, value: '㆒㆑' }]);
    expect(() => splitMultiCharacterKaeri(doc, { idGenerator: { generate: () => 'm1' } })).toThrow(
      Error
    );
  });

  it('Kanbun の字でない字を含む値は変えない', () => {
    const doc = docWithMarks([{ type: 'kaeri', id: 'm1', position, value: '㆒一' }]);
    expect(splitMultiCharacterKaeri(doc).marks).toEqual(doc.marks);
  });

  it('同じ位置の既存の kaeri との順は marks[] の順のまま', () => {
    const doc = docWithMarks([
      { type: 'kaeri', id: 'm1', position, value: '㆓' },
      { type: 'kaeri', id: 'm2', position, value: '㆒㆑' },
    ]);
    const result = splitMultiCharacterKaeri(doc, { idGenerator: sequence(['n1']) });
    expect(result.marks.map((m) => (m as { value: string }).value)).toEqual(['㆓', '㆒', '㆑']);
  });
});
