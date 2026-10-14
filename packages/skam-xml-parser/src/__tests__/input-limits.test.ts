import { describe, it, expect } from 'vitest';
import { checkInputLimits } from '../input-limits.js';
import { parse, SKAMXMLParseError } from '../index.js';

const L = { maxInputLength: 1_000_000, maxDepth: 64 };
const nest = (n: number) => '<a>'.repeat(n) + '</a>'.repeat(n);
const rejects = (xml: string, re: RegExp, limits = L) => expect(() => checkInputLimits(xml, limits)).toThrow(re);

describe('checkInputLimits (fail-closed pre-scan)', () => {
  it('rejects input longer than maxInputLength (UTF-16 code units)', () =>
    rejects('x'.repeat(11), /maxInputLength/, { maxInputLength: 10, maxDepth: 64 }));
  it('rejects every <! declaration except comment and CDATA, case-insensitively', () => {
    rejects('<!DOCTYPE x [<!ENTITY e "y">]><r/>', /declaration/);
    rejects('<!doctype x><r/>', /declaration/);
    rejects('﻿  <!DoCtYpE x><r/>', /declaration/);
    rejects('<r><!ELEMENT r ANY></r>', /declaration/);
  });
  it('ignores markup-like text inside comment / CDATA / PI / attribute values', () => {
    expect(() => checkInputLimits('<r><!-- <!DOCTYPE <a> --><![CDATA[<!DOCTYPE <a>]]><?pi <a> ?><c x="a>b" y=\'<z>\'/></r>', L)).not.toThrow();
  });
  it('counts depth; self-closing tags do not add depth', () => {
    expect(() => checkInputLimits(nest(64), L)).not.toThrow();
    rejects(nest(65), /maxDepth/);
    expect(() => checkInputLimits(nest(64).replace('<a>', '<a><b/>'), L)).not.toThrow();
  });
  it('fails closed on unterminated constructs and negative depth', () => {
    rejects('<r a="x>' + nest(100), /unterminated/);
    rejects('<r><!-- ' + nest(100), /unterminated/);
    rejects('<r><![CDATA[ ' + nest(100), /unterminated/);
    rejects('<r><?pi ' + nest(100), /unterminated/);
    rejects('<r', /unterminated/);
    rejects('</x></x>' + nest(100), /unbalanced/);
  });
  it('rejects unquoted attribute values, stray quotes and "<" inside a tag', () => {
    rejects('<a b=c/>' + nest(100), /unquoted/);
    rejects('<a b=c"d>' + nest(100), /unquoted|quote/);
    rejects('<a <b>', /"<" in tag/);
    rejects('<a "x">', /unexpected quote/);
  });
  it('attaches line/column to pre-scan errors', () => {
    try { checkInputLimits('<r>\n  <k kind=re/></r>', L); expect.unreachable(); }
    catch (e) { expect(e).toMatchObject({ line: 2, column: 11 }); }
  });
  it('does not treat <!--> or <?> as complete constructs', () => {
    rejects('<r><!--> ' + nest(3), /unterminated comment/);
    rejects('<r><?> ' + nest(3), /unterminated processing instruction/);
  });
  it('checks length first, then reports whichever of declaration / depth appears first in the input', () => {
    rejects('<!DOCTYPE x>' + nest(3), /maxInputLength/, { maxInputLength: 5, maxDepth: 1 });
    rejects('<!DOCTYPE x>' + nest(3), /declaration/, { maxInputLength: 1e6, maxDepth: 1 });
  });
  it('parse() applies defaults (maxDepth 64 / maxInputLength 5,000,000) as SKAMXMLParseError', () => {
    expect(() => parse(nest(65))).toThrow(SKAMXMLParseError);
    expect(() => parse('x'.repeat(5_000_001))).toThrow(/maxInputLength/);
  });
});
