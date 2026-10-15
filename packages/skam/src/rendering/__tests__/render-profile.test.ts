import { describe, it, expect } from 'vitest';
import { RENDER_PROFILES, resolveRenderProfile } from '../render-profile.js';

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
