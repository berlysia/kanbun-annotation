import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// src/__tests__ → integration-tests → packages → リポジトリのルート
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const PUBLIC = [
  'skam',
  'skam-xml-parser',
  'skam-xml-stringify',
  'skam-html-renderer',
  'skam-canvas-renderer',
  'skam-web-component',
];
/** IIFE を直接指す、型を持たない export (文字列) */
const UNTYPED = new Set(['skam-canvas-renderer:./browser-bundle']);

type Cond = string | { [k: string]: Cond };
/** 条件オブジェクトをすべて訪問する。types を持つオブジェクトでは、types が最初のキーで、import の .js と対になる .d.ts を指すこと */
function visit(c: Cond, at: string, problems: string[], typesPaths: string[]) {
  if (typeof c === 'string') return;
  const keys = Object.keys(c);
  if ('types' in c) {
    if (keys[0] !== 'types') problems.push(`${at}: types is not first (${keys.join(',')})`);
    const types = c['types'] as string;
    typesPaths.push(types);
    const imp = c['import'];
    if (typeof imp === 'string' && imp.replace(/\.js$/, '.d.ts') !== types)
      problems.push(`${at}: types ${types} does not pair with import ${imp}`);
  }
  for (const k of keys) if (k !== 'types') visit(c[k]!, `${at}.${k}`, problems, typesPaths);
}

describe('package exports (K8)', () => {
  for (const name of PUBLIC) {
    it(`${name}: every typed condition lists types first, every subpath has types, and the .d.ts exists`, () => {
      const dir = resolve(root, 'packages', name);
      const pkg = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8')) as {
        exports: Record<string, Cond>;
      };
      const problems: string[] = [];
      for (const [sub, cond] of Object.entries(pkg.exports)) {
        const typesPaths: string[] = [];
        visit(cond, sub, problems, typesPaths);
        if (!UNTYPED.has(`${name}:${sub}`) && typesPaths.length === 0)
          problems.push(`${sub}: no types condition`);
        for (const p of typesPaths)
          if (!existsSync(resolve(dir, p))) problems.push(`${sub}: missing ${p}`);
      }
      expect(problems).toEqual([]);
    });
  }
});
