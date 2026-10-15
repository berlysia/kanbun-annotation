import { describe, it, expect } from 'vitest';
import { extractDoctests } from '../doctest/extract.js';

const md = [
  '<!-- doctest -->',
  '```ts',
  "import { a } from '@kanbun-skam/skam';",
  '```',
  '<!-- doctest:typecheck -->',
  '```typescript',
  'const b = 1;',
  '```',
  '<!-- doctest:xml block -->',
  '```xml',
  '學',
  '```',
  '<!-- doctest:skip 型の一覧 -->',
  '```ts',
  'interface X {}',
  '```',
  '```ts',
  'unmarked();',
  '```',
  '```bash',
  'pnpm i',
  '```',
].join('\n');

describe('extractDoctests', () => {
  it('classifies blocks by the marker on the preceding line', () => {
    const r = extractDoctests(md, 'README.md');
    expect(r.blocks.map((b) => [b.mode, b.lang, b.line])).toEqual([
      ['run', 'ts', 2],
      ['typecheck', 'typescript', 6],
      ['xml-block', 'xml', 10],
      ['skip', 'ts', 14],
    ]);
    expect(r.blocks[3]!.reason).toBe('型の一覧');
  });
  it('accepts a blank line between the marker and the fence (prettier inserts one)', () => {
    const r = extractDoctests('<!-- doctest:typecheck -->\n\n```ts\nconst a = 1;\n```', 'R.md');
    expect(r.blocks.map((b) => [b.mode, b.line])).toEqual([['typecheck', 3]]);
    expect(r.unmarked).toEqual([]);
  });
  it('reports ts/xml blocks without a marker, and ignores other languages', () => {
    expect(extractDoctests(md, 'README.md').unmarked).toEqual([
      { file: 'README.md', line: 17, lang: 'ts' },
    ]);
  });
  it('rejects a skip marker without a reason', () => {
    expect(() => extractDoctests('<!-- doctest:skip -->\n```ts\nx\n```', 'R.md')).toThrow(/reason/);
  });
  it.each([
    "import { readFileSync } from 'node:fs';",
    "import { readFile } from 'fs/promises';",
    "import cp from 'node:child_process';",
    'await fetch ("x");',
    "const e = process['env'];",
    "const m = await import('node:fs');",
    'eval("1");',
    'globalThis.fetch;',
    "import{readFileSync}from'node:fs';",
    "export * from 'node:fs';",
    'console.log(`${process.env.X}`);',
    'const s = `a ${1} b`;',
  ])(
    'rejects a run block that uses a non-allowlisted import or forbidden identifier: %s',
    (code) => {
      expect(() => extractDoctests(`<!-- doctest -->\n\`\`\`ts\n${code}\n\`\`\``, 'R.md')).toThrow(
        /forbidden/
      );
    }
  );
  it('allows @kanbun-skam imports, the word fs inside a string, URLs in strings and quotes in comments', () => {
    const code =
      "import { parse } from '@kanbun-skam/skam-xml-parser';\nconst label = 'fs';\nconst url = 'http://example.com';\n// it's fine: import x from 'node:fs'\nconst t = `plain`;";
    expect(() =>
      extractDoctests(`<!-- doctest -->\n\`\`\`ts\n${code}\n\`\`\``, 'R.md')
    ).not.toThrow();
  });
  it('does not apply the run-block rules to typecheck blocks', () => {
    expect(() =>
      extractDoctests('<!-- doctest:typecheck -->\n```ts\nconst e = process.env;\n```', 'R.md')
    ).not.toThrow();
  });
});
