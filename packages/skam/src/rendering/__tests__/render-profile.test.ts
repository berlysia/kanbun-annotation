import { describe, it, expect } from 'vitest';
import {
  RENDER_PROFILES,
  RENDER_PROFILE_KEYS,
  SKAMRenderProfileError,
  resolveRenderProfile,
} from '../render-profile.js';

const FULL = RENDER_PROFILES.full;

describe('resolveRenderProfile', () => {
  it('undefined は full と等しい凍結済みの値になる', () => {
    const p = resolveRenderProfile(undefined);
    expect(p).toEqual(FULL);
    expect(Object.isFrozen(p)).toBe(true);
    expect(p).not.toBe(FULL);
  });

  it('{} は full', () => {
    expect(resolveRenderProfile({})).toEqual(FULL);
  });

  it('部分指定は full に重なる', () => {
    expect(resolveRenderProfile({ kaeriten: true, okurigana: false })).toEqual({
      ...FULL,
      okurigana: false,
    });
  });

  it('{ base } はプリセットの別 object を返す', () => {
    const p = resolveRenderProfile({ base: 'learningBasic' });
    expect(p).toEqual(RENDER_PROFILES.learningBasic);
    expect(p).not.toBe(RENDER_PROFILES.learningBasic);
  });

  it('{ base, overrides } はプリセットに overrides を重ねる', () => {
    expect(resolveRenderProfile({ base: 'learningHint', overrides: { saidoku: false } })).toEqual({
      ...RENDER_PROFILES.learningHint,
      saidoku: false,
    });
  });

  it.each<[string, unknown]>([
    ['null', null],
    ['string', 'full'],
    ['array', []],
    ['Date', new Date()],
    ['文字列の真偽値', { okurigana: 'false' }],
    ['undefined の値', { okurigana: undefined }],
    ['綴り違い', { okuriganaa: false }],
    ['base と個別キーの混在', { base: 'learningBasic', okurigana: false }],
    ['未知の base', { base: 'x' }],
    ['base: undefined', { base: undefined }],
    ['overrides: undefined', { base: 'full', overrides: undefined }],
    ['overrides: null', { base: 'full', overrides: null }],
    ['overrides: string', { base: 'full', overrides: 'x' }],
    ['overrides の未知キー', { base: 'full', overrides: { foo: true } }],
    ['base 形式の余計なキー', { base: 'full', extra: 1 }],
    ['base: constructor', { base: 'constructor' }],
    ['base: __proto__', { base: '__proto__' }],
    ['base: toString', { base: 'toString' }],
    ['overrides なしの overrides キー', { overrides: { okurigana: false } }],
  ])('TypeError: %s', (_name, input) => {
    expect(() => resolveRenderProfile(input)).toThrow(TypeError);
  });

  it('own property の __proto__ は拒否し、Object.prototype を汚さない', () => {
    expect(() => resolveRenderProfile(JSON.parse('{"__proto__": {"okurigana": false}}'))).toThrow(
      TypeError
    );
    expect(({} as Record<string, unknown>)['okurigana']).toBeUndefined();
  });

  it('overrides の own __proto__ は拒否する', () => {
    expect(() =>
      resolveRenderProfile({ base: 'full', overrides: JSON.parse('{"__proto__": {}}') })
    ).toThrow(TypeError);
  });

  it('getter は 1 回だけ読む', () => {
    let calls = 0;
    const input = {
      get okurigana() {
        calls += 1;
        return calls === 1 ? false : 'x';
      },
    };
    const p = resolveRenderProfile(input);
    expect(p.okurigana).toBe(false);
    expect(calls).toBe(1);
  });

  it('Object.create(null) の入力を受け付ける', () => {
    const input = Object.create(null) as Record<string, unknown>;
    input['okurigana'] = false;
    expect(resolveRenderProfile(input)).toEqual({ ...FULL, okurigana: false });
  });

  it('Symbol キーと non-enumerable の own キーは無視する', () => {
    const input: Record<PropertyKey, unknown> = { [Symbol('x')]: true };
    Object.defineProperty(input, 'okurigana', { value: false, enumerable: false });
    expect(resolveRenderProfile(input)).toEqual(FULL);
  });

  it('未知のキーは 64 文字に切り詰めてメッセージに入る', () => {
    const key = 'k'.repeat(100);
    expect(() => resolveRenderProfile({ [key]: true })).toThrow(
      new RegExp(`${'k'.repeat(64)}(?!k)`)
    );
  });

  it('継承した base は見ず、full になる', () => {
    expect(resolveRenderProfile(Object.create({ base: 'learningBasic' }))).toEqual(FULL);
  });

  it('getter の例外は TypeError に包み、cause に入れる', () => {
    const input = {
      get okurigana(): boolean {
        throw new Error('x');
      },
    };
    try {
      resolveRenderProfile(input);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(TypeError);
      expect(((e as TypeError).cause as Error).message).toBe('x');
    }
  });

  it('learningHint の saidoku だけを外し、ほかの 12 キーは変えない', () => {
    const p = resolveRenderProfile({ base: 'learningHint', overrides: { saidoku: false } });
    const { saidoku: _a, ...rest } = p;
    const { saidoku: _b, ...hintRest } = RENDER_PROFILES.learningHint;
    expect(rest).toEqual(hintRest);
    expect(Object.keys(p)).toHaveLength(13);
  });
});

describe('RENDER_PROFILES', () => {
  it('自身と 3 つの値が凍結されている', () => {
    expect(Object.isFrozen(RENDER_PROFILES)).toBe(true);
    for (const p of Object.values(RENDER_PROFILES)) {
      expect(Object.isFrozen(p)).toBe(true);
    }
  });
});

function catchError(input: unknown): SKAMRenderProfileError {
  try {
    resolveRenderProfile(input);
  } catch (error) {
    expect(error).toBeInstanceOf(SKAMRenderProfileError);
    return error as SKAMRenderProfileError;
  }
  throw new Error('expected resolveRenderProfile to throw');
}

describe('SKAMRenderProfileError', () => {
  it('null は NOT_PLAIN_OBJECT で、key を持たない', () => {
    const error = catchError(null);
    expect(error).toBeInstanceOf(TypeError);
    expect(error.name).toBe('SKAMRenderProfileError');
    expect(error.kind).toBe('NOT_PLAIN_OBJECT');
    expect(error.where).toBe('profile');
    expect('key' in error).toBe(false);
    expect('cause' in error).toBe(false);
    expect(error.message).toBe('profile must be a plain object (got null)');
  });

  it('クラスのインスタンスは NOT_PLAIN_OBJECT (プロトタイプの連鎖の側)', () => {
    const error = catchError(new Date());
    expect(error.kind).toBe('NOT_PLAIN_OBJECT');
    expect(error.where).toBe('profile');
    expect('key' in error).toBe(false);
  });

  it('overrides が配列なら where は profile.overrides', () => {
    const error = catchError({ base: 'full', overrides: [] });
    expect(error.kind).toBe('NOT_PLAIN_OBJECT');
    expect(error.where).toBe('profile.overrides');
  });

  it('overrides がクラスのインスタンスなら where は profile.overrides', () => {
    const error = catchError({ base: 'full', overrides: new Date() });
    expect(error.kind).toBe('NOT_PLAIN_OBJECT');
    expect(error.where).toBe('profile.overrides');
  });

  it('getter が投げると UNREADABLE_KEY で、cause に元の例外を持つ', () => {
    const original = new Error('x');
    const error = catchError({
      get okurigana(): boolean {
        throw original;
      },
    });
    expect(error.kind).toBe('UNREADABLE_KEY');
    expect(error.key).toBe('okurigana');
    expect(error.where).toBe('profile');
    expect(error.cause).toBe(original);
  });

  it('overrides の getter が投げると where は profile.overrides', () => {
    const error = catchError({
      base: 'full',
      overrides: {
        get okurigana(): boolean {
          throw new Error('x');
        },
      },
    });
    expect(error.kind).toBe('UNREADABLE_KEY');
    expect(error.where).toBe('profile.overrides');
    expect(error.key).toBe('okurigana');
  });

  it('未知のキーは UNKNOWN_KEY で、cause を持たない', () => {
    const error = catchError({ okurigna: false });
    expect(error.kind).toBe('UNKNOWN_KEY');
    expect(error.key).toBe('okurigna');
    expect(error.where).toBe('profile');
    expect('cause' in error).toBe(false);
    expect(error.message).toBe('profile has an unknown key "okurigna"');
  });

  it('overrides の未知のキーは where が profile.overrides', () => {
    const error = catchError({ base: 'full', overrides: { okurigna: false } });
    expect(error.kind).toBe('UNKNOWN_KEY');
    expect(error.where).toBe('profile.overrides');
    expect(error.key).toBe('okurigna');
  });

  it('base なしの { overrides } は overrides が UNKNOWN_KEY', () => {
    const error = catchError({ overrides: { okurigana: false } });
    expect(error.kind).toBe('UNKNOWN_KEY');
    expect(error.key).toBe('overrides');
    expect(error.where).toBe('profile');
  });

  it('真偽値でない値は NOT_BOOLEAN', () => {
    const error = catchError({ okurigana: 'false' });
    expect(error.kind).toBe('NOT_BOOLEAN');
    expect(error.key).toBe('okurigana');
    expect(error.where).toBe('profile');
    expect(error.message).toBe('profile.okurigana must be a boolean (got "false")');
  });

  it('overrides の真偽値でない値は where が profile.overrides', () => {
    const error = catchError({ base: 'full', overrides: { okurigana: 1 } });
    expect(error.kind).toBe('NOT_BOOLEAN');
    expect(error.where).toBe('profile.overrides');
    expect(error.key).toBe('okurigana');
  });

  it('base と個別キーの混在は MIXED_BASE', () => {
    const error = catchError({ base: 'full', okurigana: false });
    expect(error.kind).toBe('MIXED_BASE');
    expect(error.key).toBe('okurigana');
    expect(error.where).toBe('profile');
  });

  it('未知の preset 名は UNKNOWN_BASE で key は base', () => {
    const error = catchError({ base: 'nope' });
    expect(error.kind).toBe('UNKNOWN_BASE');
    expect(error.key).toBe('base');
    expect(error.where).toBe('profile');
    expect(error.message).toBe('profile.base must be a known preset name (got "nope")');
  });

  it('base が文字列でなくても UNKNOWN_BASE', () => {
    const error = catchError({ base: 1 });
    expect(error.kind).toBe('UNKNOWN_BASE');
    expect(error.key).toBe('base');
  });

  it.each<[string, () => unknown]>([
    ['未知のキー', () => ({ ['a'.repeat(100)]: true })],
    ['base と混ざったキー', () => ({ base: 'full', ['a'.repeat(100)]: true })],
    [
      '読み出しで投げるキー',
      () =>
        Object.defineProperty({}, 'a'.repeat(100), {
          enumerable: true,
          get() {
            throw new Error('x');
          },
        }),
    ],
  ])('key は先頭 64 字で切る: %s', (_label, make) => {
    expect(catchError(make()).key).toBe('a'.repeat(64));
  });

  it('__proto__ の own キーは UNKNOWN_KEY で、Object.prototype を汚さない', () => {
    const error = catchError(JSON.parse('{"__proto__":true}'));
    expect(error.kind).toBe('UNKNOWN_KEY');
    expect(error.key).toBe('__proto__');
    expect(({} as Record<string, unknown>)['true']).toBeUndefined();
  });

  it.each(['__proto__', 'constructor'])('base が %s なら UNKNOWN_BASE', (base) => {
    expect(catchError({ base }).kind).toBe('UNKNOWN_BASE');
  });
});

describe('RENDER_PROFILE_KEYS', () => {
  it('13 個の名前を固定する', () => {
    // このテストを変える変更は ADR-033 の互換の方針 (改名・削除をしない) の対象になる。
    expect([...RENDER_PROFILE_KEYS].sort()).toEqual([
      'emphasis',
      'highlight',
      'joji',
      'kaeriten',
      'kutoten',
      'okimoji',
      'okototen',
      'okurigana',
      'ref',
      'saidoku',
      'soegana',
      'tateten',
      'yomigana',
    ]);
  });

  it('凍結されている', () => {
    expect(Object.isFrozen(RENDER_PROFILE_KEYS)).toBe(true);
  });

  it('各プリセットのキーの集合と一致する', () => {
    for (const preset of Object.values(RENDER_PROFILES)) {
      expect(Object.keys(preset).sort()).toEqual([...RENDER_PROFILE_KEYS].sort());
    }
  });
});
