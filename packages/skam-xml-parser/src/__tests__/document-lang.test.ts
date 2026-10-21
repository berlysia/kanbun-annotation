import { describe, it, expect } from 'vitest';
import { SKAMValidationError } from '@kanbun-skam/skam';
import { parse } from '../index.js';

// ルートの xml:lang が文書の lang になる。ルート以外の xml:lang は読まない

const wrap = (rootAttrs: string, inner = '甲') =>
  `<skam:doc xmlns:skam="urn:skam:1"${rootAttrs}><skam:body><skam:block>${inner}</skam:block></skam:body></skam:doc>`;

describe('root xml:lang', () => {
  it('reads xml:lang on the root as lang', () => {
    expect(parse(wrap(' xml:lang="lzh"')).lang).toBe('lzh');
  });

  it.each([
    ['', 'no attribute'],
    [' xml:lang=""', 'empty value'],
  ])('leaves no lang key for %s', (attrs) => {
    expect('lang' in parse(wrap(attrs))).toBe(false);
  });

  it('does not read xml:lang on elements other than the root', () => {
    const doc = parse(wrap('', '<skam:ruby xml:lang="lzh">甲</skam:ruby>'));
    expect('lang' in doc).toBe(false);
  });

  it('rejects an invalid value with validate: true, without a position', () => {
    const xml = wrap(' xml:lang="ja&quot;&gt;&lt;b"');
    let caught: unknown;
    try {
      parse(xml, { trackPositions: true });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(SKAMValidationError);
    const errors = (caught as SKAMValidationError).errors;
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ path: 'lang' });
    expect(errors[0]!.line).toBeUndefined();
    expect(errors[0]!.column).toBeUndefined();
  });

  it('keeps the raw value with validate: false', () => {
    expect(parse(wrap(' xml:lang="ja&quot;&gt;&lt;b"'), { validate: false }).lang).toBe('ja"><b');
  });
});
