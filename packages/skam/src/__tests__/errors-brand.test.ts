import { describe, expect, it, vi } from 'vitest';
import { SKAMValidationError, type ValidationError } from '../errors.js';

// ADR-033 KD10: コピーと realm をまたぐ instanceof
describe('SKAMValidationError の判別 (KD10)', () => {
  // このキーの文字列は ADR-033 の互換の方針の対象。変えると版の違うコピーの間で判別できなくなる
  const BRAND = Symbol.for('@kanbun-skam/skam/SKAMValidationError');
  const errors: ValidationError[] = [{ kind: 'INVALID_FORMAT', path: 'x', message: 'bad' }];
  const make = (): SKAMValidationError => new SKAMValidationError(errors);

  it('インスタンスは instanceof が真で、name は変わらない', () => {
    const error = make();
    expect(error instanceof SKAMValidationError).toBe(true);
    expect(error.name).toBe('SKAMValidationError');
    expect(error.errors).toBe(errors);
  });

  it('目印のキーの値は true', () => {
    expect((make() as unknown as Record<symbol, unknown>)[BRAND]).toBe(true);
  });

  it('別のコピーのモジュールが作った誤りでも instanceof が真', async () => {
    vi.resetModules();
    const other = await import('../errors.js');
    expect(other.SKAMValidationError).not.toBe(SKAMValidationError);
    const error = new other.SKAMValidationError(errors);
    expect(error instanceof SKAMValidationError).toBe(true);
    expect(error instanceof other.SKAMValidationError).toBe(true);
    expect(make() instanceof other.SKAMValidationError).toBe(true);
  });

  it('関係のない値は偽で、例外を投げない', () => {
    for (const v of [new Error('x'), null, undefined, 'x', 1, {}, []]) {
      expect(v instanceof SKAMValidationError).toBe(false);
    }
  });

  it('目印の読み出しが例外を投げる object と、目印が true でない object は偽', () => {
    const throwing = {
      get [BRAND](): boolean {
        throw new Error('boom');
      },
    };
    const proxy = new Proxy(
      {},
      {
        get() {
          throw new Error('boom');
        },
        getPrototypeOf() {
          throw new Error('boom');
        },
        has() {
          throw new Error('boom');
        },
      }
    );
    expect(throwing instanceof SKAMValidationError).toBe(false);
    expect(proxy instanceof SKAMValidationError).toBe(false);
    expect({ [BRAND]: 1 } instanceof SKAMValidationError).toBe(false);
  });

  it('サブクラスでは通常の判定になり、基底のインスタンスは偽', () => {
    class Sub extends SKAMValidationError {}
    expect(make() instanceof Sub).toBe(false);
    const sub = new Sub(errors);
    expect(sub instanceof Sub).toBe(true);
    expect(sub instanceof SKAMValidationError).toBe(true);
  });

  it('目印は own property にならず、列挙も JSON 化もされない', () => {
    const error = make();
    expect(Object.getOwnPropertySymbols(error)).not.toContain(BRAND);
    expect(Object.keys(error)).not.toContain(String(BRAND));
    expect(Object.keys(error).sort()).toEqual(['errors', 'name']);
    expect(Object.keys(JSON.parse(JSON.stringify(error))).sort()).toEqual(['errors', 'name']);
    const descriptor = Object.getOwnPropertyDescriptor(SKAMValidationError.prototype, BRAND);
    expect(descriptor?.enumerable).toBe(false);
    expect(descriptor?.configurable).toBe(true);
  });
});
