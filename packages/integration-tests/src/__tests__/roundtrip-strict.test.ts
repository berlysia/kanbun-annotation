import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@kanbun-skam/skam-xml-parser';
import { stringify } from '@kanbun-skam/skam-xml-stringify';
import { createSequentialIdGenerator, type SKAMDocument, type Mark } from '@kanbun-skam/skam';

// The parser's valid fixtures are the single source of correct SKAM-ML examples.
// This package is private and never published, so a cross-package relative path is safe;
// if the fixtures move, readdirSync fails loudly instead of silently passing.
const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../skam-xml-parser/src/__tests__/fixtures/valid'
);
const seq = () => ({ idGenerator: createSequentialIdGenerator() });
const normalize = (d: SKAMDocument) => {
  const order = d.blocks.flatMap((b) => b.tokenIds);
  const pos = (id: string | undefined) => (id === undefined ? 'start' : order.indexOf(id));
  const text = (id: string) => d.tokens.find((t) => t.id === id)!.text;
  const mark = (m: Mark) => {
    const { id: _id, ...rest } = m as Mark & { id?: string };
    const anchor = 'anchor' in m ? [pos(m.anchor.from), pos(m.anchor.to)] : undefined;
    const position =
      'position' in m && 'blockId' in (m.position as object)
        ? pos((m.position as { after?: string }).after)
        : undefined;
    // Key order depends on which side built the object, so sort keys before comparing.
    const entries = Object.entries({ ...rest, anchor, position }).sort(([x], [y]) =>
      x < y ? -1 : 1
    );
    return JSON.stringify(entries);
  };
  return {
    blocks: d.blocks.map((b) => b.tokenIds.map(text).join('')),
    marks: d.marks.map(mark).sort(),
    readings: d.readings,
  };
};

describe('strict round-trip over all valid fixtures', () => {
  const files = readdirSync(fixtureDir).filter((f) => f.endsWith('.xml'));
  it('finds fixtures', () => expect(files.length).toBeGreaterThanOrEqual(31));
  for (const name of files) {
    it(`${name}: parse → stringify (no loss) → parse preserves semantics`, () => {
      const a = parse(readFileSync(join(fixtureDir, name), 'utf8'), seq());
      const b = parse(stringify(a), seq());
      expect(normalize(b)).toEqual(normalize(a));
    });
  }
  it('U+3000 and CDATA survive', () => {
    const src =
      '<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>甲　<![CDATA[乙]]></skam:block></skam:body></skam:doc>';
    expect(normalize(parse(stringify(parse(src)))).blocks).toEqual(['甲　乙']);
  });
  it('block-start kutoten/ref and content-only ref round-trip', () => {
    const d: SKAMDocument = {
      format: 'skam@0.1',
      readings: [],
      tokens: [
        { id: 't1', text: '甲' },
        { id: 't2', text: '乙' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [
        { type: 'kutoten', kind: 'ku', value: '。', position: { blockId: 'b1' } },
        { id: 'r1', type: 'ref', format: 'numeric-bracket', position: { blockId: 'b1' } },
        {
          type: 'ref',
          format: 'numeric-bracket',
          content: '注',
          position: { blockId: 'b1', after: 't1' },
        },
      ],
    };
    expect(normalize(parse(stringify(d), seq()))).toEqual(normalize(d));
  });
  it('yomigana range with inner kun round-trips', () => {
    const d: SKAMDocument = {
      format: 'skam@0.1',
      readings: [],
      tokens: [
        { id: 't1', text: '甲' },
        { id: 't2', text: '乙' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [
        { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'x' },
        { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'y' },
      ],
    };
    expect(normalize(parse(stringify(d), seq()))).toEqual(normalize(d));
  });
});
