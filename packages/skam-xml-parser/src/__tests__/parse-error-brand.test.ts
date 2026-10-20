import { describe, expect, it, vi } from 'vitest';
import { SKAMXMLParseError } from '../parse-error.js';

// ADR-033 KD10: コピーと realm をまたぐ instanceof
describe('SKAMXMLParseError の判別 (KD10)', () => {
  // このキーの文字列は ADR-033 の互換の方針の対象。変えると版の違うコピーの間で判別できなくなる
  const BRAND = Symbol.for('@kanbun-skam/skam-xml-parser/SKAMXMLParseError');
  const make = (): SKAMXMLParseError => new SKAMXMLParseError('bad', 3, 4);

  it('インスタンスは instanceof が真で、name は変わらない', () => {
    const error = make();
    expect(error instanceof SKAMXMLParseError).toBe(true);
    expect(error.name).toBe('SKAMXMLParseError');
    expect(error.line).toBe(3);
    expect(error.column).toBe(4);
  });

  it('目印のキーの値は true', () => {
    expect((make() as unknown as Record<symbol, unknown>)[BRAND]).toBe(true);
  });

  it('別のコピーのモジュールが作った誤りでも instanceof が真', async () => {
    vi.resetModules();
    const other = await import('../parse-error.js');
    expect(other.SKAMXMLParseError).not.toBe(SKAMXMLParseError);
    const error = new other.SKAMXMLParseError('bad', 3, 4);
    expect(error instanceof SKAMXMLParseError).toBe(true);
    expect(error instanceof other.SKAMXMLParseError).toBe(true);
    expect(make() instanceof other.SKAMXMLParseError).toBe(true);
  });

  it('関係のない値は偽で、例外を投げない', () => {
    for (const v of [new Error('x'), null, undefined, 'x', 1, {}, []]) {
      expect(v instanceof SKAMXMLParseError).toBe(false);
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
    expect(throwing instanceof SKAMXMLParseError).toBe(false);
    expect(proxy instanceof SKAMXMLParseError).toBe(false);
    expect({ [BRAND]: 1 } instanceof SKAMXMLParseError).toBe(false);
  });

  it('サブクラスでは通常の判定になり、基底のインスタンスは偽', () => {
    class Sub extends SKAMXMLParseError {}
    expect(make() instanceof Sub).toBe(false);
    const sub = new Sub('bad', 1, 1);
    expect(sub instanceof Sub).toBe(true);
    expect(sub instanceof SKAMXMLParseError).toBe(true);
  });

  it('目印は own property にならず、列挙も JSON 化もされない', () => {
    const error = make();
    expect(Object.getOwnPropertySymbols(error)).not.toContain(BRAND);
    expect(Object.keys(error).sort()).toEqual(['column', 'line', 'name']);
    expect(Object.keys(JSON.parse(JSON.stringify(error))).sort()).toEqual([
      'column',
      'line',
      'name',
    ]);
    const descriptor = Object.getOwnPropertyDescriptor(SKAMXMLParseError.prototype, BRAND);
    expect(descriptor?.enumerable).toBe(false);
    expect(descriptor?.configurable).toBe(true);
  });

  // 依存の重複の実際の形: 読み直した parser は読み直した skam を使い、元の skam の SKAMValidationError とは別のクラスを投げる
  it('読み直した parser が投げる SKAMValidationError は、元の skam の instanceof で真', async () => {
    const { SKAMValidationError: original } = await import('@kanbun-skam/skam');
    vi.resetModules();
    const reloaded = await import('@kanbun-skam/skam');
    // 読み直されず外部化されていると、この前提が崩れる
    expect(reloaded.SKAMValidationError).not.toBe(original);
    const { parse } = await import('../index.js');
    const invalid =
      '<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>甲</skam:block></skam:body><skam:readings><skam:reading kind="bogus">x</skam:reading></skam:readings></skam:doc>';
    let thrown: unknown;
    try {
      parse(invalid);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(reloaded.SKAMValidationError);
    expect(thrown instanceof original).toBe(true);
  });
});
