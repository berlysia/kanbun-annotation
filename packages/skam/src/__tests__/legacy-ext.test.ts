import { describe, it, expect } from 'vitest';
import { moveLegacyExtToCustom } from '../legacy-ext.js';
import { validateSKAMDocument } from '../validator.js';
import type { SKAMDocument } from '../index.js';

function legacyDoc(patch: (doc: Record<string, any>) => void = () => {}): SKAMDocument {
  const doc: Record<string, any> = {
    format: 'skam@0.1',
    tokens: [{ id: 't1', text: '学' }],
    blocks: [{ id: 'b1', tokenIds: ['t1'] }],
    marks: [{ type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'まな' }],
    readings: [],
  };
  patch(doc);
  return doc as SKAMDocument;
}

/** 失敗のメッセージ (値が入らないことを確かめるために取り出す) */
function messageOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('did not throw');
}

describe('moveLegacyExtToCustom', () => {
  it('ext を custom に移し、元の文書は変えない', () => {
    const doc = legacyDoc((d) => {
      d['marks'][0].ext = { foo: 1 };
      d['blocks'][0].ext = { bar: 'x' };
    });
    const before = structuredClone(doc);
    const { document, registeredNameKeys } = moveLegacyExtToCustom(doc);
    expect(document.marks[0]).toEqual({
      type: 'yomigana',
      id: 'm1',
      anchor: { from: 't1', to: 't1' },
      value: 'まな',
      custom: { foo: 1 },
    });
    expect(document.marks[0]).not.toHaveProperty('ext');
    expect(document.blocks[0]).toEqual({ id: 'b1', tokenIds: ['t1'], custom: { bar: 'x' } });
    expect(document.blocks[0]).not.toHaveProperty('ext');
    expect(registeredNameKeys).toEqual([]);
    expect(doc).toEqual(before);
  });

  it('文書、readings、token、derivations の ext も移す', () => {
    const doc = legacyDoc((d) => {
      d['ext'] = { a: 1 };
      d['readings'] = [{ kind: 'kundoku', text: '学', ext: { b: 1 } }];
      d['tokens'][0].ext = { c: 1 };
      d['derivations'] = [
        { kind: 'readingOrder', method: 'manual', result: ['t1'], ext: { d: 1 } },
      ];
    });
    const { document } = moveLegacyExtToCustom(doc);
    expect(document.custom).toEqual({ a: 1 });
    expect(document).not.toHaveProperty('ext');
    expect(document.readings[0]).toEqual({ kind: 'kundoku', text: '学', custom: { b: 1 } });
    expect(document.tokens[0]).toEqual({ id: 't1', text: '学', custom: { c: 1 } });
    expect(document.derivations?.[0]).toEqual({
      kind: 'readingOrder',
      method: 'manual',
      result: ['t1'],
      custom: { d: 1 },
    });
  });

  it('登録済みの拡張の名前のキーは registeredNameKeys に path で返す', () => {
    const doc = legacyDoc((d) => {
      d['marks'][0].ext = { edu: { quiz: '問1' } };
    });
    const { document, registeredNameKeys } = moveLegacyExtToCustom(doc);
    expect(document.marks[0]!.custom).toEqual({ edu: { quiz: '問1' } });
    expect(registeredNameKeys).toEqual(['marks[0].ext.edu']);
  });

  it('文書の ext の登録済みの名前は ext.<名前> の path', () => {
    const doc = legacyDoc((d) => {
      d['ext'] = { edu: 1 };
    });
    expect(moveLegacyExtToCustom(doc).registeredNameKeys).toEqual(['ext.edu']);
  });

  it('宣言のある文書は TypeError (空の extensions、extensionsRequired だけの文書も)', () => {
    expect(() => moveLegacyExtToCustom(legacyDoc((d) => (d['extensions'] = ['edu'])))).toThrow(
      TypeError
    );
    expect(() => moveLegacyExtToCustom(legacyDoc((d) => (d['extensions'] = [])))).toThrow(
      TypeError
    );
    expect(() =>
      moveLegacyExtToCustom(legacyDoc((d) => (d['extensionsRequired'] = ['edu'])))
    ).toThrow(TypeError);
  });

  it('ext と custom の両方がある注記は TypeError。path を入れ、値は入れない', () => {
    const doc = legacyDoc((d) => {
      d['marks'][0].ext = { secret: 'EXT-VALUE' };
      d['marks'][0].custom = { secret: 'CUSTOM-VALUE' };
    });
    expect(() => moveLegacyExtToCustom(doc)).toThrow(TypeError);
    const message = messageOf(() => moveLegacyExtToCustom(doc));
    expect(message).toContain('marks[0]');
    expect(message).not.toContain('VALUE');
  });

  it('オブジェクトでない ext は TypeError。path を入れ、値は入れない', () => {
    const doc = legacyDoc((d) => {
      d['blocks'][0].ext = 'SECRET-VALUE';
    });
    expect(() => moveLegacyExtToCustom(doc)).toThrow(TypeError);
    const message = messageOf(() => moveLegacyExtToCustom(doc));
    expect(message).toContain('blocks[0]');
    expect(message).not.toContain('SECRET');
  });

  it('own の __proto__ キーを保ち、prototype を汚染しない', () => {
    const doc = legacyDoc((d) => {
      d['marks'][0].ext = JSON.parse('{"__proto__":{"x":1}}');
    });
    const { document } = moveLegacyExtToCustom(doc);
    const custom = document.marks[0]!.custom as Record<string, unknown>;
    expect(Object.hasOwn(custom, '__proto__')).toBe(true);
    expect(({} as Record<string, unknown>)['x']).toBeUndefined();
  });

  it('空のオブジェクトの ext も custom に移る', () => {
    const doc = legacyDoc((d) => {
      d['marks'][0].ext = {};
    });
    const { document } = moveLegacyExtToCustom(doc);
    expect(document.marks[0]!.custom).toEqual({});
    expect(document.marks[0]).not.toHaveProperty('ext');
  });

  it('変換の後の文書に extensions を足してもう一度呼ぶと TypeError', () => {
    const { document } = moveLegacyExtToCustom(legacyDoc((d) => (d['marks'][0].ext = { a: 1 })));
    expect(() => moveLegacyExtToCustom({ ...document, extensions: ['edu'] })).toThrow(TypeError);
  });

  it('2 回かけても結果は同じで、registeredNameKeys は空', () => {
    const first = moveLegacyExtToCustom(
      legacyDoc((d) => (d['marks'][0].ext = { edu: { quiz: '問1' } }))
    );
    const second = moveLegacyExtToCustom(first.document);
    expect(second.document).toEqual(first.document);
    expect(second.registeredNameKeys).toEqual([]);
  });

  it('変換の後の文書は LEGACY_EXT の警告が無い', () => {
    const doc = legacyDoc((d) => {
      d['ext'] = { a: 1 };
      d['marks'][0].ext = { edu: { quiz: '問1' } };
    });
    const before = validateSKAMDocument(doc);
    expect(before.valid && before.warnings?.some((w) => w.kind === 'LEGACY_EXT')).toBe(true);
    const after = validateSKAMDocument(moveLegacyExtToCustom(doc).document);
    expect(after.valid).toBe(true);
    expect(after).not.toHaveProperty('warnings');
  });
});
