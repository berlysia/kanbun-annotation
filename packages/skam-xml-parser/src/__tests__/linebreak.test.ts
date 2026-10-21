import { describe, it, expect } from 'vitest';
import { createSequentialIdGenerator, validateSKAMDocument } from '@kanbun-skam/skam';
import { parse, SKAMXMLParseError } from '../index.js';
import type { ParseWarning } from '../index.js';

function docOf(blockXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1">
  <skam:body>
    <skam:block xml:id="b1">${blockXml}</skam:block>
  </skam:body>
</skam:doc>`;
}

function parseSeq(blockXml: string, options: Parameters<typeof parse>[1] = {}) {
  return parse(docOf(blockXml), { idGenerator: createSequentialIdGenerator(), ...options });
}

function linebreaks(doc: ReturnType<typeof parse>) {
  return doc.marks.filter((m) => m.type === 'linebreak');
}

describe('parse - skam:br', () => {
  it('字の後ろの位置の linebreak になる', () => {
    const doc = parseSeq('學<skam:br/>而');
    expect(doc.tokens.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(linebreaks(doc)).toEqual([
      { type: 'linebreak', id: expect.any(String), position: { blockId: 'b1', after: 't1' } },
    ]);
  });

  it('tateten の最後の子の br と tateten の直後の br は同じ注記になる', () => {
    const inside = parseSeq('<skam:tateten>學而<skam:br/></skam:tateten>時');
    const outside = parseSeq('<skam:tateten>學而</skam:tateten><skam:br/>時');
    const position = { blockId: 'b1', after: 't2' };
    expect(linebreaks(inside).map((m) => (m as { position: unknown }).position)).toEqual([
      position,
    ]);
    expect(linebreaks(outside).map((m) => (m as { position: unknown }).position)).toEqual([
      position,
    ]);
  });

  it('tateten の途中の br は直前の字の後ろ', () => {
    // 竪点の中は validator が inside-unit で拒否するので、位置の読みだけを見る
    const doc = parseSeq('<skam:tateten>學<skam:br/>而</skam:tateten>', { validate: false });
    expect(linebreaks(doc).map((m) => (m as { position: unknown }).position)).toEqual([
      { blockId: 'b1', after: 't1' },
    ]);
  });

  it('span の中の br も直前の字の後ろ', () => {
    const doc = parseSeq('<skam:span type="highlight">學<skam:br/>而</skam:span>');
    expect(linebreaks(doc).map((m) => (m as { position: unknown }).position)).toEqual([
      { blockId: 'b1', after: 't1' },
    ]);
  });

  it('ブロック先頭の br は after の無い注記で、validate: false なら読める', () => {
    const doc = parseSeq('<skam:br/>學而', { validate: false });
    expect(linebreaks(doc).map((m) => (m as { position: unknown }).position)).toEqual([
      { blockId: 'b1' },
    ]);
    expect(() => parseSeq('<skam:br/>學而')).toThrow(/INVALID_LINEBREAK|linebreak/);
  });

  it('前のブロックの末尾には付かない', () => {
    const xml = `<skam:doc xmlns:skam="urn:skam:1"><skam:body>
      <skam:block xml:id="b1">學</skam:block><skam:block xml:id="b2"><skam:br/>而</skam:block>
    </skam:body></skam:doc>`;
    const doc = parse(xml, { validate: false });
    expect(linebreaks(doc).map((m) => (m as { position: unknown }).position)).toEqual([
      { blockId: 'b2' },
    ]);
  });

  it('子や文字を持つ br は誤り', () => {
    expect(() => parseSeq('學<skam:br>x</skam:br>而')).toThrow(SKAMXMLParseError);
    expect(() => parseSeq('學<skam:br><skam:kutoten value="。"/></skam:br>而')).toThrow(
      SKAMXMLParseError
    );
  });

  it('既知の要素なので UNKNOWN_ELEMENT の警告は出ない', () => {
    const warnings: ParseWarning[] = [];
    parseSeq('學<skam:br/>而', { onWarning: (w) => warnings.push(w) });
    expect(warnings).toEqual([]);
  });

  it('xml:id を mark の id にし、重複は DUPLICATE_ID の誤りになる', () => {
    const one = parseSeq('學<skam:br xml:id="a"/>而');
    expect(linebreaks(one)[0]!.id).toBe('a');
    expect(() => parseSeq('學<skam:br xml:id="a"/>而<skam:br xml:id="a"/>時習')).toThrow(
      /Duplicate/
    );
  });

  it('知らない属性は kutoten と同じく読み飛ばす', () => {
    const doc = parseSeq('學<skam:br foo="1"/>而');
    expect(linebreaks(doc)).toHaveLength(1);
    expect(linebreaks(doc)[0]).not.toHaveProperty('foo');
  });

  it('yomigana の中の br は内容モデル違反', () => {
    expect(() => parseSeq('<skam:yomigana value="x">學<skam:br/>而</skam:yomigana>')).toThrow(
      SKAMXMLParseError
    );
  });

  it('1 字の後ろに 10 万個並べても例外なく読める (validate: false)', () => {
    const count = 100_000;
    const xml = docOf(`學${'<skam:br/>'.repeat(count)}而`);
    const doc = parse(xml, { validate: false });
    expect(linebreaks(doc)).toHaveLength(count);
    // 10 万個は duplicate なので validate すると誤りになる
    expect(validateSKAMDocument(doc).valid).toBe(false);
  });

  it('maxInputLength を超える入力は今と同じ長さの誤りになる', () => {
    const xml = docOf(`學${'<skam:br/>'.repeat(1000)}而`);
    expect(() => parse(xml, { maxInputLength: 100, validate: false })).toThrow(/maxInputLength/);
  });
});
