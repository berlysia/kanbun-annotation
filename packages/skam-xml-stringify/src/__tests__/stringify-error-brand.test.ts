import { describe, expect, it, vi } from 'vitest';
import { SKAMXMLStringifyError, type StringifyLoss } from '../losses.js';

// ADR-033 KD10: コピーと realm をまたぐ instanceof
describe('SKAMXMLStringifyError の判別 (KD10)', () => {
  // このキーの文字列は ADR-033 の互換の方針の対象。変えると版の違うコピーの間で判別できなくなる
  const BRAND = Symbol.for('@kanbun-skam/skam-xml-stringify/SKAMXMLStringifyError');
  const losses: StringifyLoss[] = [
    { category: 'unsupported', code: 'EXT', path: '/ext', message: 'no notation' },
  ];
  const make = (): SKAMXMLStringifyError => new SKAMXMLStringifyError(losses);

  it('インスタンスは instanceof が真で、name は変わらない', () => {
    const error = make();
    expect(error instanceof SKAMXMLStringifyError).toBe(true);
    expect(error.name).toBe('SKAMXMLStringifyError');
    expect(error.losses).toBe(losses);
  });

  it('目印のキーの値は true', () => {
    expect((make() as unknown as Record<symbol, unknown>)[BRAND]).toBe(true);
  });

  it('別のコピーのモジュールが作った誤りでも instanceof が真', async () => {
    vi.resetModules();
    const other = await import('../losses.js');
    expect(other.SKAMXMLStringifyError).not.toBe(SKAMXMLStringifyError);
    const error = new other.SKAMXMLStringifyError(losses);
    expect(error instanceof SKAMXMLStringifyError).toBe(true);
    expect(error instanceof other.SKAMXMLStringifyError).toBe(true);
    expect(make() instanceof other.SKAMXMLStringifyError).toBe(true);
  });

  it('関係のない値は偽で、例外を投げない', () => {
    for (const v of [new Error('x'), null, undefined, 'x', 1, {}, []]) {
      expect(v instanceof SKAMXMLStringifyError).toBe(false);
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
    expect(throwing instanceof SKAMXMLStringifyError).toBe(false);
    expect(proxy instanceof SKAMXMLStringifyError).toBe(false);
    expect({ [BRAND]: 1 } instanceof SKAMXMLStringifyError).toBe(false);
  });

  it('サブクラスでは通常の判定になり、基底のインスタンスは偽', () => {
    class Sub extends SKAMXMLStringifyError {}
    expect(make() instanceof Sub).toBe(false);
    const sub = new Sub(losses);
    expect(sub instanceof Sub).toBe(true);
    expect(sub instanceof SKAMXMLStringifyError).toBe(true);
  });

  it('目印は own property にならず、列挙も JSON 化もされない', () => {
    const error = make();
    expect(Object.getOwnPropertySymbols(error)).not.toContain(BRAND);
    expect(Object.keys(error).sort()).toEqual(['losses', 'name']);
    expect(Object.keys(JSON.parse(JSON.stringify(error))).sort()).toEqual(['losses', 'name']);
    const descriptor = Object.getOwnPropertyDescriptor(SKAMXMLStringifyError.prototype, BRAND);
    expect(descriptor?.enumerable).toBe(false);
    expect(descriptor?.configurable).toBe(true);
  });
});
