import { describe, it, expect } from 'vitest';
import { validateSKAMDocument } from '../validator.js';
import { resolveExtensions } from '../extensions/index.js';
import type { SKAMExtensionDefinition } from '../extensions/index.js';
import type { ValidationError } from '../errors.js';

/** テストの中で作る仮の拡張。値は { n: number } だけを許す */
const test1: SKAMExtensionDefinition = {
  name: 'test1',
  uri: 'urn:skam:test1:1',
  required: true,
  validate(value, path) {
    const ok =
      typeof value === 'object' &&
      value !== null &&
      Object.keys(value).length === 1 &&
      typeof (value as Record<string, unknown>)['n'] === 'number';
    return ok
      ? []
      : [
          {
            kind: 'INVALID_VALUE',
            path,
            message: 'test1 must be { n: number }',
          } satisfies ValidationError,
        ];
  },
};

function baseDoc(extra: Record<string, unknown> = {}, markExt?: Record<string, unknown>) {
  return {
    format: 'skam@0.1',
    tokens: [{ id: 't1', text: '学' }],
    blocks: [{ id: 'b1', tokenIds: ['t1'] }],
    marks: [
      {
        type: 'yomigana',
        id: 'm1',
        anchor: { from: 't1', to: 't1' },
        value: 'まな',
        ...(markExt ? { ext: markExt } : {}),
      },
    ],
    readings: [],
    ...extra,
  };
}

function kinds(result: ReturnType<typeof validateSKAMDocument>): string[] {
  return result.valid ? [] : result.errors.map((e) => e.kind);
}

describe('extensions: declaration', () => {
  it('宣言の無い文書の ext は自由なデータとして読む', () => {
    expect(validateSKAMDocument(baseDoc({}, { foo: 1 })).valid).toBe(true);
  });

  it('extensions: [] の文書で宣言に無い名前の ext は INVALID_EXTENSION', () => {
    const result = validateSKAMDocument(baseDoc({ extensions: [] }, { foo: 1 }));
    expect(kinds(result)).toContain('INVALID_EXTENSION');
  });

  it('知っている拡張の値は validate で検査する', () => {
    const declared = { extensions: ['test1'], extensionsRequired: ['test1'] };
    const ok = validateSKAMDocument(baseDoc(declared, { test1: { n: 1 } }), {
      extensions: [test1],
    });
    expect(ok.valid).toBe(true);
    if (ok.valid) {
      expect(ok.document.extensions).toEqual(['test1']);
      expect(ok.document.extensionsRequired).toEqual(['test1']);
    }
    const bad = validateSKAMDocument(baseDoc(declared, { test1: { n: 'x' } }), {
      extensions: [test1],
    });
    expect(bad.valid).toBe(false);
    if (!bad.valid) expect(bad.errors[0]!.path).toBe('marks[0].ext.test1');
  });

  it('必須の拡張の値があるのに extensionsRequired に無ければ INVALID_EXTENSION', () => {
    const result = validateSKAMDocument(baseDoc({ extensions: ['test1'] }, { test1: { n: 1 } }), {
      extensions: [test1],
    });
    expect(kinds(result)).toContain('INVALID_EXTENSION');
  });

  it('知らない必須の拡張は INVALID_EXTENSION、知らない使うだけの拡張の値は無視する', () => {
    const unknownRequired = validateSKAMDocument(
      baseDoc({ extensions: ['zzz'], extensionsRequired: ['zzz'] })
    );
    expect(kinds(unknownRequired)).toContain('INVALID_EXTENSION');
    const unknownUsed = validateSKAMDocument(baseDoc({ extensions: ['zzz'] }, { zzz: { a: 1 } }));
    expect(unknownUsed.valid).toBe(true);
  });

  it('宣言の形の誤り', () => {
    const cases: Record<string, unknown>[] = [
      { extensions: ['zzz'], extensionsRequired: ['yyy'] },
      { extensions: ['test1', 'test1'] },
      { extensions: ['Test1'] },
      { extensions: ['1abc'] },
      { extensions: ['xmlfoo'] },
      { extensions: 'test1' },
      { extensions: [1] },
      { extensionsRequired: ['test1'] },
    ];
    for (const extra of cases) {
      const result = validateSKAMDocument(baseDoc(extra), { extensions: [test1] });
      expect(kinds(result)).toContain('INVALID_EXTENSION');
    }
  });

  it('toString などの継承した名前を知っている拡張と取り違えない', () => {
    const result = validateSKAMDocument(
      baseDoc({ extensions: ['tostring'], extensionsRequired: ['constructor'] })
    );
    expect(kinds(result)).toContain('INVALID_EXTENSION');
    const hasOwn = validateSKAMDocument(baseDoc({ extensions: ['valueof'] }, { valueof: 1 }));
    expect(hasOwn.valid).toBe(true);
  });
});

describe('extensions: ext / custom limits', () => {
  function nested(depth: number): Record<string, unknown> {
    let value: Record<string, unknown> = {};
    for (let i = 1; i < depth; i++) value = { a: value };
    return value;
  }

  it('入れ子 32 段まで許し、33 段は INVALID_VALUE', () => {
    const at32 = baseDoc({});
    (at32.marks[0] as Record<string, unknown>)['custom'] = nested(32);
    expect(validateSKAMDocument(at32).valid).toBe(true);
    const at33 = baseDoc({});
    (at33.marks[0] as Record<string, unknown>)['custom'] = nested(33);
    expect(kinds(validateSKAMDocument(at33))).toEqual(['INVALID_VALUE']);
  });

  it('キー 1,001 個、長さ 10,001 の配列は INVALID_VALUE', () => {
    const keys = Object.fromEntries(Array.from({ length: 1001 }, (_, i) => [`k${i}`, 1]));
    expect(kinds(validateSKAMDocument(baseDoc({ custom: keys })))).toEqual(['INVALID_VALUE']);
    const arr = Array.from({ length: 10001 }, () => 0);
    expect(kinds(validateSKAMDocument(baseDoc({ custom: { arr } })))).toEqual(['INVALID_VALUE']);
    const arrOk = Array.from({ length: 10000 }, () => 0);
    expect(validateSKAMDocument(baseDoc({ custom: { arr: arrOk } })).valid).toBe(true);
  });

  it('__proto__ / constructor / prototype のキーは誤りで、prototype を汚染しない', () => {
    const proto = JSON.parse('{"__proto__":{"x":1}}') as Record<string, unknown>;
    expect(kinds(validateSKAMDocument(baseDoc({ custom: proto })))).toEqual(['INVALID_VALUE']);
    const deep = JSON.parse('{"a":{"__proto__":{"x":1}}}') as Record<string, unknown>;
    expect(kinds(validateSKAMDocument(baseDoc({ custom: deep })))).toEqual(['INVALID_VALUE']);
    expect(kinds(validateSKAMDocument(baseDoc({ custom: { prototype: 1 } })))).toEqual([
      'INVALID_VALUE',
    ]);
    const declared = validateSKAMDocument(baseDoc({ extensions: [] }, { constructor: { n: 1 } }));
    expect(declared.valid).toBe(false);
    expect(kinds(declared).every((k) => k === 'INVALID_VALUE' || k === 'INVALID_EXTENSION')).toBe(
      true
    );
    const projectedProto = JSON.parse('{"__proto__":{"x":1}}') as Record<string, unknown>;
    expect(kinds(validateSKAMDocument(baseDoc({ ext: projectedProto })))).toEqual([
      'INVALID_VALUE',
    ]);
    expect(({} as Record<string, unknown>)['x']).toBeUndefined();
  });

  it('文書全体の値の数が 100,000 を超えると INVALID_VALUE で止まる', () => {
    const chunk = () => Array.from({ length: 10000 }, () => 0);
    const doc = baseDoc({
      custom: Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`a${i}`, chunk()])),
    });
    const result = validateSKAMDocument(doc);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.kind).toBe('INVALID_VALUE');
    }
  });

  it('ext / custom がオブジェクトでなければ INVALID_TYPE', () => {
    expect(kinds(validateSKAMDocument(baseDoc({ custom: 1 })))).toEqual(['INVALID_TYPE']);
    expect(kinds(validateSKAMDocument(baseDoc({ ext: [] })))).toEqual(['INVALID_TYPE']);
  });
});

describe('extensions: resolveExtensions', () => {
  it('同じ名前の定義を 2 つ渡すと TypeError', () => {
    expect(() => resolveExtensions([test1, { ...test1 }])).toThrow(TypeError);
    expect(() => validateSKAMDocument(baseDoc(), { extensions: [test1, { ...test1 }] })).toThrow(
      TypeError
    );
  });

  it('名前が小文字の英数字でなければ TypeError', () => {
    expect(() => resolveExtensions([{ ...test1, name: 'Test-1' }])).toThrow(TypeError);
  });
});
