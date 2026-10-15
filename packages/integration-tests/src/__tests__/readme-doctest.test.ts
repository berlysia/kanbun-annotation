import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parse } from '@kanbun-skam/skam-xml-parser';
import { extractDoctests, type DoctestBlock } from '../doctest/extract.js';

// 信頼の境界: doctest のブロックはこのプロセスで実行される。README の変更はコードの変更としてレビューする。
// CI は contents: read の権限で動き、抽出器は fs / child_process / fetch / process.env を使う実行ブロックを拒否する。
const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const root = resolve(pkgDir, '../..');
const READMES = [
  'README.md',
  ...[
    'skam',
    'skam-xml-parser',
    'skam-xml-stringify',
    'skam-html-renderer',
    'skam-canvas-renderer',
    'skam-web-component',
  ].map((p) => `packages/${p}/README.md`),
];
const outDir = resolve(pkgDir, '.doctest');
const all = READMES.map((f) => extractDoctests(readFileSync(resolve(root, f), 'utf8'), f));
const blocks = all.flatMap((r) => r.blocks);
const base = (b: DoctestBlock) => `${b.file.replace(/[/.]/g, '_')}_L${b.line}`;
const wrap = (b: DoctestBlock) =>
  b.mode === 'xml'
    ? b.code
    : b.mode === 'xml-body'
      ? `<skam:doc xmlns:skam="urn:skam:1"><skam:body>${b.code}</skam:body></skam:doc>`
      : `<skam:doc xmlns:skam="urn:skam:1"><skam:body><skam:block>${b.code}</skam:block></skam:body></skam:doc>`;

let typeErrors = '';
beforeAll(() => {
  // 消す対象が integration-tests の .doctest であることを確かめてから消す
  if (!outDir.startsWith(pkgDir + sep) || !outDir.endsWith(`${sep}.doctest`))
    throw new Error(`unexpected outDir ${outDir}`);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const b of blocks.filter((x) => x.mode === 'run' || x.mode === 'typecheck')) {
    // export {} で、各ブロックを独立したモジュールにする
    writeFileSync(resolve(outDir, `${base(b)}.ts`), `${b.code}\nexport {};\n`);
  }
  writeFileSync(
    resolve(outDir, 'tsconfig.json'),
    JSON.stringify({
      extends: '../../../tsconfig.base.json',
      compilerOptions: {
        rootDir: '.',
        outDir: 'out',
        noEmit: false,
        declaration: false,
        declarationMap: false,
        sourceMap: false,
        lib: ['ES2022', 'DOM'],
        types: [],
      },
      include: ['*.ts'],
    })
  );
  try {
    execFileSync(
      resolve(root, 'node_modules/.bin/tsgo'),
      ['-p', resolve(outDir, 'tsconfig.json')],
      { encoding: 'utf8' }
    );
  } catch (e) {
    const err = e as { status?: number | null; stdout?: string; code?: string };
    // 起動できなかった (ENOENT など) ことと、型エラーを区別して報告する
    typeErrors = err.code
      ? `tsgo failed to start: ${err.code}`
      : err.stdout || `tsgo exited with ${err.status}`;
  }
}, 120_000);

describe('README doctests (K9)', () => {
  it('emitted one .js per run/typecheck block (tsgo actually ran)', () => {
    for (const b of blocks.filter((x) => x.mode === 'run' || x.mode === 'typecheck')) {
      expect(existsSync(resolve(outDir, 'out', `${base(b)}.js`)), `${b.file}:${b.line}`).toBe(true);
    }
  });
  it('every ts/xml block carries a doctest marker', () => {
    expect(all.flatMap((r) => r.unmarked)).toEqual([]);
  });
  it('each README has at least one checked (non-skip) block', () => {
    for (const f of READMES)
      expect(
        blocks.some((b) => b.file === f && b.mode !== 'skip'),
        f
      ).toBe(true);
  });
  it('all ts blocks typecheck', () => {
    expect(typeErrors).toBe('');
  });
  for (const b of blocks.filter((x) => x.mode === 'run')) {
    it(`runs ${b.file}:${b.line}`, async () => {
      await import(pathToFileURL(resolve(outDir, 'out', `${base(b)}.js`)).href);
    });
  }
  for (const b of blocks.filter((x) => x.mode.startsWith('xml'))) {
    it(`parses ${b.file}:${b.line} strictly`, () => {
      expect(() => parse(wrap(b))).not.toThrow();
    });
  }
});
