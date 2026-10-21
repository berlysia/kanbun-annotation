import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDocumentFromSource } from '@kanbun-skam/kojiki';
import { buildKojikiPage, type BuildKojikiPageDeps } from '../build-kojiki-page-core.ts';

const SMALL_SOURCE = ['# 上卷', '{u:甲乙}丙。', '# 中卷', '丁戊{n:注}己', '# 下卷', '庚辛壬'].join(
  '\n'
);
const INDEX_HTML = '<!doctype html><title>playground</title>';

let dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
});

function makeDist(withIndex = true): string {
  const root = mkdtempSync(join(tmpdir(), 'kojiki-page-'));
  dirs.push(root);
  const distDir = join(root, 'dist');
  mkdirSync(distDir);
  if (withIndex) writeFileSync(join(distDir, 'index.html'), INDEX_HTML);
  return distDir;
}

const smallTokenCount = buildDocumentFromSource(SMALL_SOURCE, { synthetic: false }).tokens.length;

function makeDeps(
  distDir: string,
  overrides: Partial<BuildKojikiPageDeps> = {}
): BuildKojikiPageDeps {
  return {
    distDir,
    prepareSource: async () => 0,
    buildDocument: (volume) => buildDocumentFromSource(SMALL_SOURCE, { volume, synthetic: false }),
    bundleCalibrate: async () => 'console.log("calibrate");\n',
    expected: { tokenCount: smallTokenCount, minPageBytes: 1000 },
    log: () => {},
    ...overrides,
  };
}

describe('buildKojikiPage', () => {
  it('returns 1 and writes nothing when dist/index.html is missing', async () => {
    const distDir = makeDist(false);
    const lines: string[] = [];
    expect(await buildKojikiPage(makeDeps(distDir, { log: (line) => lines.push(line) }))).toBe(1);
    expect(readdirSync(distDir)).toEqual([]);
    expect(lines.join('\n')).toContain('pnpm playground:build');
  });

  it('returns 1 and writes nothing when preparing the source fails', async () => {
    const distDir = makeDist();
    const deps = makeDeps(distDir, { prepareSource: async () => 1 });
    expect(await buildKojikiPage(deps)).toBe(1);
    expect(readdirSync(distDir)).toEqual(['index.html']);
  });

  it('returns 1 and writes nothing when the token total differs from the expected count', async () => {
    const distDir = makeDist();
    const deps = makeDeps(distDir, {
      expected: { tokenCount: smallTokenCount + 1, minPageBytes: 1000 },
    });
    expect(await buildKojikiPage(deps)).toBe(1);
    expect(readdirSync(distDir)).toEqual(['index.html']);
  });

  it('returns 1 and writes nothing when the page is smaller than the minimum', async () => {
    const distDir = makeDist();
    const deps = makeDeps(distDir, {
      expected: { tokenCount: smallTokenCount, minPageBytes: 10_000_000 },
    });
    expect(await buildKojikiPage(deps)).toBe(1);
    expect(readdirSync(distDir)).toEqual(['index.html']);
  });

  it('returns 1 and writes nothing when the calibrate bundle has an external URL', async () => {
    const distDir = makeDist();
    const deps = makeDeps(distDir, {
      bundleCalibrate: async () => 'fetch("https://example.com/x");',
    });
    expect(await buildKojikiPage(deps)).toBe(1);
    expect(readdirSync(distDir)).toEqual(['index.html']);
  });

  it('allows the SVG namespace URI in the calibrate bundle', async () => {
    const distDir = makeDist();
    const deps = makeDeps(distDir, {
      bundleCalibrate: async () => 'document.createElementNS("http://www.w3.org/2000/svg", "svg");',
    });
    expect(await buildKojikiPage(deps)).toBe(0);
  });

  it('returns 0 and adds only kojiki.html and kojiki-calibrate.js, leaving index.html as it was', async () => {
    const distDir = makeDist();
    expect(await buildKojikiPage(makeDeps(distDir))).toBe(0);
    expect(readdirSync(distDir).sort()).toEqual([
      'index.html',
      'kojiki-calibrate.js',
      'kojiki.html',
    ]);
    expect(readFileSync(join(distDir, 'index.html'), 'utf8')).toBe(INDEX_HTML);
    expect(readFileSync(join(distDir, 'kojiki.html'), 'utf8')).toContain('<section id="shimo">');
  });
});
