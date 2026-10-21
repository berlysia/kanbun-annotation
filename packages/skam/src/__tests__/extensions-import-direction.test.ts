import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 拡張の依存の向きを、ソースの静的な import と再 export を読んで守る。
 * - src/extensions/<名前>/ は `import type` と同じ拡張の中のファイルだけを import する
 * - src/extensions/index.ts 以外は src/extensions/<名前>/ を import しない
 * - src/rendering/ は src/extensions/ の値を import しない (型は可。定義は呼ぶ側から渡される)
 * - html、canvas、web component、parser、stringify は `@kanbun-skam/skam/extensions/edu` を import しない
 */

const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = resolve(srcDir, '../..');

interface ImportRef {
  specifier: string;
  typeOnly: boolean;
}

/** 静的な import / export ... from と、動的な import( を読む */
export function readImports(source: string): { refs: ImportRef[]; dynamic: boolean } {
  const refs: ImportRef[] = [];
  const staticPattern =
    /(?:^|\n)\s*(import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  for (const m of source.matchAll(staticPattern)) {
    refs.push({ specifier: m[3]!, typeOnly: m[2] !== undefined });
  }
  // `import('x').Type` は型の位置の参照で、実行時の import ではない
  return { refs, dynamic: /\bimport\s*\(\s*[^)]*\)(?!\s*\.)/.test(source) };
}

function listSources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '__tests__') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listSources(full));
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

/** src からの相対パス (/ 区切り) */
function rel(file: string): string {
  return relative(srcDir, file).split(sep).join('/');
}

const EXT_DIR = /^extensions\/([^/]+)\//;

interface Violation {
  file: string;
  specifier: string;
  rule: string;
}

export function findViolations(files: { path: string; source: string }[]): Violation[] {
  const violations: Violation[] = [];
  for (const { path, source } of files) {
    const { refs, dynamic } = readImports(source);
    if (dynamic) violations.push({ file: path, specifier: 'import(', rule: 'no dynamic import' });
    for (const { specifier, typeOnly } of refs) {
      if (!specifier.startsWith('.')) continue;
      const target = relative(srcDir, resolve(srcDir, dirname(path), specifier))
        .split(sep)
        .join('/');
      const owner = EXT_DIR.exec(path)?.[1];
      if (owner !== undefined) {
        const inside = target.startsWith(`extensions/${owner}/`);
        const isType = typeOnly || target === 'extensions/types.js';
        if (!inside && !isType) {
          violations.push({ file: path, specifier, rule: 'extension imports only types of core' });
        }
        continue;
      }
      if (EXT_DIR.test(target) && path !== 'extensions/index.ts') {
        violations.push({ file: path, specifier, rule: 'only the bundle imports an extension' });
      }
      if (path.startsWith('rendering/') && target.startsWith('extensions/') && !typeOnly) {
        violations.push({ file: path, specifier, rule: 'rendering imports no extension value' });
      }
    }
  }
  return violations;
}

describe('extension import direction', () => {
  it('src の import と再 export が向きの規則を守る', () => {
    const files = listSources(srcDir).map((f) => ({
      path: rel(f),
      source: readFileSync(f, 'utf8'),
    }));
    expect(files.length).toBeGreaterThan(10);
    expect(findViolations(files)).toEqual([]);
  });

  it('規則を破るソースを検出する', () => {
    const bad = (path: string, source: string) => findViolations([{ path, source }]);
    expect(bad('extensions/edu/index.ts', "import { KAERI } from '../../index.js';")).toHaveLength(
      1
    );
    expect(bad('extensions/edu/index.ts', "import type { Mark } from '../../index.js';")).toEqual(
      []
    );
    expect(bad('extensions/edu/index.ts', "export { x } from '../../validator.js';")).toHaveLength(
      1
    );
    expect(bad('extensions/edu/index.ts', "import { y } from './other.js';")).toEqual([]);
    expect(bad('extensions/index.ts', "import { eduExtension } from './edu/index.js';")).toEqual(
      []
    );
    expect(
      bad('validator.ts', "import { eduExtension } from './extensions/edu/index.js';")
    ).toHaveLength(1);
    expect(
      bad('validator.ts', "import { resolveExtensions } from './extensions/index.js';")
    ).toEqual([]);
    expect(bad('rendering/a.ts', "import { x } from '../extensions/index.js';")).toHaveLength(1);
    expect(bad('rendering/a.ts', "import type { x } from '../extensions/index.js';")).toEqual([]);
    expect(bad('rendering/a.ts', 'const m = await import("../x.js");')).toHaveLength(1);
  });

  it('ほかのパッケージは @kanbun-skam/skam/extensions/edu を import しない', () => {
    const offenders: string[] = [];
    for (const pkg of [
      'skam-html-renderer',
      'skam-canvas-renderer',
      'skam-web-component',
      'skam-xml-parser',
      'skam-xml-stringify',
    ]) {
      for (const file of listSourcesIncludingTests(join(packagesDir, pkg, 'src'))) {
        const { refs } = readImports(readFileSync(file, 'utf8'));
        if (refs.some((r) => r.specifier.startsWith('@kanbun-skam/skam/extensions/edu'))) {
          offenders.push(file);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

function listSourcesIncludingTests(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listSourcesIncludingTests(full));
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}
