import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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
const CANONICAL_URL =
  'https://github.com/berlysia/kanbun-annotation/blob/master/docs/migration-0.1-to-0.2.md';
const SECTION_HEADING = '## 0.1 からの移行';

interface Row {
  id: string;
  packages: string[];
}

/** 正本の移行表 (`| M01 | pkgs | ...` の行) を読む */
function readTable(): Row[] {
  const text = readFileSync(resolve(root, 'docs/migration-0.1-to-0.2.md'), 'utf8');
  const rows: Row[] = [];
  for (const line of text.split('\n')) {
    const m = /^\|\s*(M\d+)\s*\|\s*([^|]*?)\s*\|/.exec(line);
    if (m) rows.push({ id: m[1]!, packages: m[2]!.split(',').map((p) => p.trim()) });
  }
  return rows;
}

/** README の「0.1 からの移行」の節 (次の `## ` の見出しまで) */
function readSection(pkg: string): string {
  const text = readFileSync(resolve(root, `packages/${pkg}/README.md`), 'utf8');
  const start = text.indexOf(`\n${SECTION_HEADING}\n`);
  if (start < 0) return '';
  const rest = text.slice(start + 1 + SECTION_HEADING.length);
  const end = rest.search(/\n## /);
  return end < 0 ? rest : rest.slice(0, end);
}

const rows = readTable();
const hasId = (text: string, id: string) => new RegExp(`\\b${id}\\b`).test(text);

describe('migration table', () => {
  it('has rows', () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it('has unique IDs', () => {
    const ids = rows.map((r) => r.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it('names at least one public package in every row, and only public packages', () => {
    for (const r of rows) {
      expect(r.packages.length, r.id).toBeGreaterThan(0);
      for (const p of r.packages) expect(PUBLIC, `${r.id}: ${p}`).toContain(p);
    }
  });

  describe.each(PUBLIC)('%s README', (pkg) => {
    const section = readSection(pkg);

    it('has the migration section with the canonical URL', () => {
      expect(section, 'section is missing').not.toBe('');
      expect(section).toContain(CANONICAL_URL);
    });

    it('lists every row that targets the package', () => {
      for (const r of rows.filter((x) => x.packages.includes(pkg)))
        expect(hasId(section, r.id), `${r.id} is missing`).toBe(true);
    });

    it('lists no ID that is absent from the table, and no row for another package', () => {
      const ids = new Set(section.match(/\bM\d+\b/g) ?? []);
      for (const id of ids) {
        const row = rows.find((r) => r.id === id);
        expect(row, `${id} is not in the table`).toBeDefined();
        expect(row!.packages, `${id} does not target ${pkg}`).toContain(pkg);
      }
    });

    it('links only to https:// targets', () => {
      for (const m of section.matchAll(/\]\(([^)]*)\)/g))
        expect(m[1], `link target ${m[1]}`).toMatch(/^https:\/\//);
    });
  });
});
