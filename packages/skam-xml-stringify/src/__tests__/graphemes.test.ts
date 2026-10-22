import { describe, it, expect } from 'vitest';
import { stringify, type StringifyLoss } from '../index.js';
import type { Mark, SKAMDocument } from '@kanbun-skam/skam';

/** 字の id は位置から決まる自動の形にする (手書きの id の字は `<skam:t xml:id>` で書かれる) */
const tokenId = (n: number) => `b#1#${n}`;

const docOf = (texts: string[], marks: Mark[] = []): SKAMDocument => ({
  format: 'skam@0.1',
  readings: [],
  tokens: texts.map((text, i) => ({ id: tokenId(i + 1), text })),
  blocks: [{ id: 'b#1', tokenIds: texts.map((_, i) => tokenId(i + 1)) }],
  marks,
});

const lossesOf = (d: SKAMDocument): StringifyLoss[] => {
  const out: StringifyLoss[] = [];
  stringify(d, { lossy: true, onLoss: (l) => out.push(l) });
  return out;
};

const codesOf = (d: SKAMDocument) => lossesOf(d).map((l) => `${l.category}:${l.code}@${l.path}`);

/** `<skam:block ...>` の中身 */
const blockBody = (xml: string): string => /<skam:block[^>]*>([^]*)<\/skam:block>/.exec(xml)![1]!;

describe('stringify - tokens that plain text cannot read back are written as <skam:t>', () => {
  it('writes a token of two graphemes, a whitespace token and a token starting with whitespace without loss', () => {
    const d = docOf(['學', '学問', ' ', ' 學']);
    expect(codesOf(d)).toEqual([]);
    expect(blockBody(stringify(d))).toBe(
      '學<skam:t>学問</skam:t><skam:t> </skam:t><skam:t> 學</skam:t>'
    );
  });

  it('writes CR, LF and TAB only tokens as <skam:t>, with a reference for CR', () => {
    const d = docOf(['\r\n', '\r', '\n', '\t']);
    expect(codesOf(d)).toEqual([]);
    expect(blockBody(stringify(d))).toBe(
      '<skam:t>&#13;\n</skam:t><skam:t>&#13;</skam:t><skam:t>\n</skam:t><skam:t>\t</skam:t>'
    );
  });

  it('is not needed for a single grapheme cluster (IVS, combining voiced mark) or U+3000', () => {
    const d = docOf(['葛\u{E0100}', 'が', '　']);
    expect(codesOf(d)).toEqual([]);
    expect(blockBody(stringify(d))).toBe('葛\u{E0100}が　');
  });

  it('writes the later token of a pair that would join into one grapheme as <skam:t>', () => {
    const d = docOf(['e', '́', '字']);
    expect(codesOf(d)).toEqual([]);
    expect(blockBody(stringify(d))).toBe('e<skam:t>́</skam:t>字');
  });

  it('does not join across an element boundary: a kun token and the plain token before it stay plain', () => {
    const d = docOf(
      ['e', '́'],
      [{ type: 'yomigana', anchor: { from: tokenId(2), to: tokenId(2) }, value: 'x' }]
    );
    expect(codesOf(d)).toEqual([]);
    expect(blockBody(stringify(d))).toBe('e<skam:kun yomi="x">́</skam:kun>');
  });

  it('does not join across a position mark', () => {
    const d = docOf(
      ['e', '́'],
      [{ type: 'kutoten', value: '。', position: { blockId: 'b#1', after: tokenId(1) } }]
    );
    expect(codesOf(d)).toEqual([]);
    expect(blockBody(stringify(d))).toBe('e<skam:kutoten value="。"/>́');
  });

  it('keeps the regional indicator pairs apart', () => {
    const [j, p] = ['\u{1F1EF}', '\u{1F1F5}'];
    const d = docOf([j!, p!, j!, p!]);
    expect(codesOf(d)).toEqual([]);
    expect(blockBody(stringify(d))).toBe(`${j}<skam:t>${p}</skam:t>${j}<skam:t>${p}</skam:t>`);
  });

  it('writes <skam:t> inside a kun element', () => {
    const d = docOf(
      ['学問'],
      [{ type: 'yomigana', anchor: { from: tokenId(1), to: tokenId(1) }, value: 'x' }]
    );
    expect(blockBody(stringify(d))).toBe('<skam:kun yomi="x"><skam:t>学問</skam:t></skam:kun>');
  });

  it('writes a hand-written id, ext and custom of a token on <skam:t>', () => {
    const d = docOf(['甲', '學']);
    d.tokens[1] = { id: 'cite-1', text: '學' };
    d.blocks[0]!.tokenIds = [tokenId(1), 'cite-1'];
    expect(blockBody(stringify(d))).toBe('甲<skam:t xml:id="cite-1">學</skam:t>');
    d.tokens[0]!.custom = { a: 1 };
    d.tokens[0]!.ext = { b: { c: 2 } };
    expect(codesOf(d)).toEqual([]);
    expect(blockBody(stringify(d))).toBe(
      '<skam:t skam:ext="{&quot;b&quot;:{&quot;c&quot;:2}}" skam:custom="{&quot;a&quot;:1}">甲</skam:t><skam:t xml:id="cite-1">學</skam:t>'
    );
  });

  it('does not write <skam:t> for a character XML cannot write, it is a loss instead', () => {
    const d = docOf(['\u0001']);
    expect(codesOf(d)).toEqual(['unrepresentable:XML_UNWRITABLE_CHAR@/tokens/0/text']);
    expect(blockBody(stringify(d, { lossy: true }))).not.toContain('skam:t');
  });
});
