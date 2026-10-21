/**
 * 古事記の文書の組み立て (buildDocumentFromSource) と、キャッシュの照合 (readVerifiedSource)。
 * 本文のキャッシュにも wikisource にも依存しない。
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
} from '../build-document.ts';

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
    await expect(import('../build-document.ts')).resolves.toBeDefined();
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
