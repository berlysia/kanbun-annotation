/**
 * 古事記 fixture の組み立て (buildDocumentFromSource) と、全文の検査の関数の検査。
 * 本文のキャッシュにも wikisource にも依存しない (全文の検査は bench の準備で走る)。
 */

import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateSKAMDocument } from '@kanbun-skam/skam';
import {
  buildDocumentFromSource,
  KojikiSourceMismatchError,
  KojikiSourceMissingError,
  readVerifiedSource,
} from '../fixtures/kojiki/build-document.ts';
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

describe('readVerifiedSource', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });
  const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

  it('returns the text when the sha256 matches', () => {
    dir = mkdtempSync(join(tmpdir(), 'kojiki-fixture-'));
    writeFileSync(join(dir, 's.txt'), '甲乙');
    expect(readVerifiedSource(join(dir, 's.txt'), sha('甲乙'))).toBe('甲乙');
  });

  it('throws a "not found" error that points at pnpm bench when the file is missing', () => {
    dir = mkdtempSync(join(tmpdir(), 'kojiki-fixture-'));
    const run = (): unknown => readVerifiedSource(join(dir!, 'none.txt'), sha('x'));
    expect(run).toThrow(KojikiSourceMissingError);
    expect(run).toThrow(/pnpm bench/);
  });

  it('throws a mismatch error with the expected and actual values', () => {
    dir = mkdtempSync(join(tmpdir(), 'kojiki-fixture-'));
    writeFileSync(join(dir, 's.txt'), '甲乙');
    const run = (): unknown => readVerifiedSource(join(dir!, 's.txt'), sha('丙'));
    expect(run).toThrow(KojikiSourceMismatchError);
    expect(run).toThrow(new RegExp(`expected ${sha('丙')}, actual ${sha('甲乙')}`));
    expect(run).not.toThrow(KojikiSourceMissingError);
  });

  it('does not follow a symlink', () => {
    dir = mkdtempSync(join(tmpdir(), 'kojiki-fixture-'));
    writeFileSync(join(dir, 'real.txt'), '甲乙');
    symlinkSync(join(dir, 'real.txt'), join(dir, 's.txt'));
    expect(() => readVerifiedSource(join(dir!, 's.txt'), sha('甲乙'))).toThrow(/cannot open/);
  });
});

describe('build-document module', () => {
  it('does not read the cache just by being imported', async () => {
    // このファイルの先頭の import で既に読み込み済み。キャッシュが無い環境でもここまで来る
    await expect(import('../fixtures/kojiki/build-document.ts')).resolves.toBeDefined();
  });
});

describe('buildDocumentFromSource', () => {
  it('anchors an underline from the first to the last character', () => {
    const doc = buildDocumentFromSource('{u:甲乙}丙', { synthetic: false });
    const highlight = doc.marks.find((m) => m.type === 'highlight');
    expect(highlight).toMatchObject({
      anchor: { from: doc.tokens[0]!.id, to: doc.tokens[1]!.id },
      style: 'solid',
    });
  });

  it('puts the variant ref after the last adopted character', () => {
    const doc = buildDocumentFromSource('{v:甲乙|丙}丁', { synthetic: false });
    const ref = doc.marks.find((m) => m.type === 'ref');
    expect(ref).toMatchObject({ position: { after: doc.tokens[1]!.id }, content: '異本: 丙' });
  });

  it('leaves out `after` for a punctuation mark or a note at the start of a block', () => {
    const doc = buildDocumentFromSource('。甲\n{n:注}甲', { synthetic: false });
    const kutoten = doc.marks.find((m) => m.type === 'kutoten');
    const ref = doc.marks.find((m) => m.type === 'ref');
    expect(kutoten).toMatchObject({ type: 'kutoten', position: { blockId: 'b0' } });
    expect(ref).toMatchObject({ type: 'ref', position: { blockId: 'b1' } });
    expect(kutoten && 'position' in kutoten && 'after' in kutoten.position).toBe(false);
    expect(ref && 'position' in ref && 'after' in ref.position).toBe(false);
  });

  it('stacks a kutoten and a ref after the same token and still validates', () => {
    const doc = buildDocumentFromSource('甲。{n:注}乙', { synthetic: false });
    const after = doc.tokens[0]!.id;
    const types = doc.marks.map((m) => [
      m.type,
      'position' in m && 'after' in m.position ? m.position.after : undefined,
    ]);
    expect(types).toEqual([
      ['kutoten', after],
      ['ref', after],
    ]);
    expect(validateSKAMDocument(doc).valid).toBe(true);
  });

  it.each([
    ['unclosed', '甲\n乙{u:丙'],
    ['nested', '{n:甲{u:乙}}'],
  ])('rejects a %s notation with the line number', (_label, source) => {
    expect(() => buildDocumentFromSource(source, { synthetic: false })).toThrow(/line \d+/);
  });

  it('rejects a character outside the allowed set with its line number', () => {
    expect(() => buildDocumentFromSource('甲\nA', { synthetic: false })).toThrow(/line 2.*U\+0041/);
  });
});
