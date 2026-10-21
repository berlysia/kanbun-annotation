/**
 * bench の準備で走る全文の検査 (checkKojikiDocuments) の検査。小さな本文で、検査が通ること・
 * どの検査で落ちたかが分かることを確かめる。本文のキャッシュにも wikisource にも依存しない。
 */

import { describe, expect, it } from 'vitest';
import { validateSKAMDocument } from '@kanbun-skam/skam';
import { buildDocumentFromSource } from '@kanbun-skam/kojiki';
import {
  checkKojikiDocuments,
  type KojikiDocuments,
  type KojikiExpectedCounts,
} from '../bench/check-kojiki-documents.ts';

// 3 巻の小さな本文。dotted の highlight は g % 50 === 20 (3 字ぶん同じ block にあるもの) に付く
const SMALL_BLOCK = '甲乙丙丁戊己庚辛壬癸'.repeat(6); // 60 字
const SMALL_SOURCE = [
  '# 上卷',
  `{u:甲乙}丙。{v:丁戊|己}${SMALL_BLOCK}`,
  '# 中卷',
  `${SMALL_BLOCK}{n:注}`,
  '# 下卷',
  SMALL_BLOCK,
].join('\n');

function smallDocuments(source: string = SMALL_SOURCE): KojikiDocuments {
  return {
    full: buildDocumentFromSource(source),
    volumes: [
      buildDocumentFromSource(source, { volume: '上卷' }),
      buildDocumentFromSource(source, { volume: '中卷' }),
      buildDocumentFromSource(source, { volume: '下卷' }),
    ],
    plain: buildDocumentFromSource(source, { synthetic: false }),
    fullAgain: buildDocumentFromSource(source),
  };
}

function expectedFor(docs: KojikiDocuments): KojikiExpectedCounts {
  const count = (pred: (m: (typeof docs.full.marks)[number]) => boolean): number =>
    docs.full.marks.filter(pred).length;
  return {
    tokenCount: docs.full.tokens.length,
    kaeriCount: count((m) => m.type === 'kaeri'),
    dottedCount: count((m) => m.type === 'highlight' && m.style === 'dotted'),
    firstVolumeUnderlines: 1,
    firstVolumeVariants: 1,
  };
}

describe('checkKojikiDocuments', () => {
  const docs = smallDocuments();
  const expected = expectedFor(docs);

  it('accepts documents that satisfy every check', () => {
    expect(validateSKAMDocument(docs.full).valid).toBe(true);
    expect(expected.dottedCount).toBeGreaterThan(0);
    expect(() => checkKojikiDocuments(docs, expected)).not.toThrow();
  });

  it('names the failed check when the token count differs by one', () => {
    expect(() =>
      checkKojikiDocuments(docs, { ...expected, tokenCount: expected.tokenCount + 1 })
    ).toThrow(/"token count"/);
  });

  it('names the failed check when a dotted highlight crosses a block', () => {
    const firstOfNext = docs.full.blocks[1]!.tokenIds[0]!;
    const marks = docs.full.marks.map((mark) =>
      mark.type === 'highlight' && mark.style === 'dotted'
        ? { ...mark, anchor: { from: mark.anchor.from, to: firstOfNext } }
        : mark
    );
    // block をまたぐ anchor は validator が先に拒否する
    expect(() =>
      checkKojikiDocuments({ ...docs, full: { ...docs.full, marks } }, expected)
    ).toThrow(/"validateSKAMDocument"/);
  });

  it('names the failed check when a dotted highlight is not two tokens wide', () => {
    // 上巻の注記との一致の検査に先に当たらないよう、最後の (下巻の) dotted を広げる
    const lastDotted = docs.full.marks.findLast(
      (m) => m.type === 'highlight' && m.style === 'dotted'
    );
    const marks = docs.full.marks.map((mark) => {
      if (mark !== lastDotted || mark.type !== 'highlight') return mark;
      const block = docs.full.blocks.find((b) => b.tokenIds.includes(mark.anchor.from))!;
      const to = block.tokenIds[block.tokenIds.indexOf(mark.anchor.from) + 3]!;
      return { ...mark, anchor: { from: mark.anchor.from, to } };
    });
    expect(() =>
      checkKojikiDocuments({ ...docs, full: { ...docs.full, marks } }, expected)
    ).toThrow(/"dotted highlight position"/);
  });

  it('names the failed check when two builds differ', () => {
    const fullAgain = { ...docs.fullAgain, marks: docs.fullAgain.marks.slice(1) };
    expect(() => checkKojikiDocuments({ ...docs, fullAgain }, expected)).toThrow(
      /"deterministic build"/
    );
  });
});
