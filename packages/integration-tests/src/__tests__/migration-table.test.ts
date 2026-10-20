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
const TODO_HEADING = '## やること';
const NO_ACTION_HEADING = '## 対応の要らない変更';
const DEPENDENCY_HEADING = '## 依存';
const ID_COUNT = 37;
const MIN_XMLDOM = '^0.8.15';

interface Item {
  id: string;
  packages: string[];
}

/** `## ` 見出しで始まる節の本文 (次の `## ` の見出しまで)。節が無ければ undefined */
function extractSection(text: string, heading: string): string | undefined {
  const start = `\n${text}`.indexOf(`\n${heading}\n`);
  if (start < 0) return undefined;
  const rest = text.slice(start + heading.length);
  const end = rest.search(/\n## /);
  return end < 0 ? rest : rest.slice(0, end);
}

/** 「やること」の節の見出し `### Mnn: 題 (pkg、pkg)` から、ID とパッケージ名を読む */
function parseTodoItems(doc: string): Item[] {
  const section = extractSection(doc, TODO_HEADING) ?? '';
  const items: Item[] = [];
  for (const line of section.split('\n')) {
    const m = /^###\s+(M\d+):.*[(（]([^()（）]*)[)）]\s*$/.exec(line);
    if (m)
      items.push({
        id: m[1]!,
        packages: m[2]!
          .split(/[、,]/)
          .map((p) => p.trim())
          .filter((p) => p !== ''),
      });
  }
  return items;
}

/** 「対応の要らない変更」の節に並ぶ ID */
function parseNoActionIds(doc: string): string[] {
  const section = extractSection(doc, NO_ACTION_HEADING) ?? '';
  return section.match(/\bM\d+\b/g) ?? [];
}

const expectedIds = Array.from(
  { length: ID_COUNT },
  (_, i) => `M${String(i + 1).padStart(2, '0')}`
);

/** 移行の文書の問題を文字列で返す。空なら問題なし */
function checkMigrationDoc(doc: string): string[] {
  const problems: string[] = [];
  const items = parseTodoItems(doc);
  const noAction = parseNoActionIds(doc);
  const all = [...items.map((i) => i.id), ...noAction];

  for (const id of expectedIds) {
    const n = all.filter((x) => x === id).length;
    if (n === 0) problems.push(`${id} is missing`);
    if (n > 1) problems.push(`${id} appears ${n} times`);
  }
  for (const id of new Set(all))
    if (!expectedIds.includes(id)) problems.push(`${id} is not a known ID`);

  for (const item of items) {
    if (item.packages.length === 0) problems.push(`${item.id} names no package`);
    for (const p of item.packages)
      if (!PUBLIC.includes(p)) problems.push(`${item.id}: ${p} is not a public package`);
  }

  const dependency = extractSection(doc, DEPENDENCY_HEADING);
  if (dependency === undefined) problems.push('dependency section is missing');
  else if (!dependency.includes(MIN_XMLDOM))
    problems.push(`dependency section lacks ${MIN_XMLDOM}`);

  return problems;
}

/** README の「0.1 からの移行」の節 (次の `## ` の見出しまで)。無ければ空文字列 */
function readmeSection(text: string): string {
  return extractSection(text, SECTION_HEADING) ?? '';
}

/** README の節の問題を文字列で返す。空なら問題なし */
function checkReadmeSection(section: string): string[] {
  const problems: string[] = [];
  if (section === '') return ['section is missing'];
  if (!section.includes(CANONICAL_URL)) problems.push('canonical URL is missing');
  if (section.split('\n').some((l) => l.startsWith('|'))) problems.push('contains a table row');
  if (/\bM\d+\b/.test(section)) problems.push('contains an M-number ID');
  return problems;
}

describe('migration document', () => {
  const doc = readFileSync(resolve(root, 'docs/migration-0.1-to-0.2.md'), 'utf8');

  it('has every ID exactly once, valid packages and the dependency section', () => {
    expect(checkMigrationDoc(doc)).toEqual([]);
  });

  describe.each(PUBLIC)('%s README', (pkg) => {
    const section = readmeSection(readFileSync(resolve(root, `packages/${pkg}/README.md`), 'utf8'));

    it('has the migration section that only links to the canonical document', () => {
      expect(checkReadmeSection(section)).toEqual([]);
    });

    it('links only to https:// targets', () => {
      for (const m of section.matchAll(/\]\(([^)]*)\)/g))
        expect(m[1], `link target ${m[1]}`).toMatch(/^https:\/\//);
    });
  });
});

describe('migration checks (fixtures)', () => {
  // 37 個の ID を、M01〜M30 は見出し、M31〜M37 は対応の要らない行に置いた最小の文書
  const todo = expectedIds
    .slice(0, 30)
    .map((id) => `### ${id}: 題 (skam、skam-xml-parser)\n\n本文\n`)
    .join('\n');
  const build = (opts: { todo?: string; noAction?: string; dependency?: string } = {}) =>
    [
      '# 移行',
      '',
      '冒頭の段落。',
      '',
      TODO_HEADING,
      '',
      opts.todo ?? todo,
      NO_ACTION_HEADING,
      '',
      opts.noAction ?? `${expectedIds.slice(30).join('、')} は、上げるだけでよい。`,
      '',
      DEPENDENCY_HEADING,
      '',
      opts.dependency ?? '`@xmldom/xmldom` は `^0.8.15` 以上にする。',
      '',
    ].join('\n');

  it('accepts a well-formed document', () => {
    expect(checkMigrationDoc(build())).toEqual([]);
  });

  it('accepts comma-separated packages', () => {
    const doc = build({
      todo: todo.replace(
        '### M01: 題 (skam、skam-xml-parser)',
        '### M01: 題 (skam, skam-xml-parser)'
      ),
    });
    expect(parseTodoItems(doc)[0]).toEqual({ id: 'M01', packages: ['skam', 'skam-xml-parser'] });
    expect(checkMigrationDoc(doc)).toEqual([]);
  });

  it('reports an ID whose heading was removed', () => {
    const doc = build({ todo: todo.replace('### M05: 題 (skam、skam-xml-parser)', '') });
    expect(checkMigrationDoc(doc)).toContain('M05 is missing');
  });

  it('reports an ID listed both as a heading and as no-action', () => {
    const doc = build({ noAction: `${expectedIds.slice(29).join('、')} は、上げるだけでよい。` });
    expect(checkMigrationDoc(doc)).toContain('M30 appears 2 times');
  });

  it('reports a package that is not public', () => {
    const doc = build({
      todo: todo.replace(
        '### M02: 題 (skam、skam-xml-parser)',
        '### M02: 題 (skam、integration-tests)'
      ),
    });
    expect(checkMigrationDoc(doc)).toContain('M02: integration-tests is not a public package');
  });

  it('does not count IDs mentioned outside the two sections', () => {
    const doc = build({ dependency: '`^0.8.15` 以上。M01 の補足。' });
    expect(checkMigrationDoc(doc)).toEqual([]);
  });

  it('reports a missing dependency section or a missing version', () => {
    const noVersion = build({ dependency: '固定している場合は上げる。' });
    expect(checkMigrationDoc(noVersion)).toContain(`dependency section lacks ${MIN_XMLDOM}`);
    const noSection = build().replace(DEPENDENCY_HEADING, '## 別の節');
    expect(checkMigrationDoc(noSection)).toContain('dependency section is missing');
  });

  const readme = `# pkg\n\n${SECTION_HEADING}\n\n0.1.x から上げるときにやることは [移行の文書](${CANONICAL_URL}) にまとめてある。\n\n## 次の節\n\n| M01 | x |\n`;

  it('accepts a README section with only the link', () => {
    expect(checkReadmeSection(readmeSection(readme))).toEqual([]);
  });

  it('reports a table row in the README section', () => {
    const bad = readme.replace('\n\n## 次の節', '\n\n| 列 | 列 |\n\n## 次の節');
    expect(checkReadmeSection(readmeSection(bad))).toContain('contains a table row');
  });

  it('reports a changed URL in the README section', () => {
    const bad = readme.replace('blob/master/', 'blob/main/');
    expect(checkReadmeSection(readmeSection(bad))).toContain('canonical URL is missing');
  });

  it('reports an M-number ID in the README section', () => {
    const bad = readme.replace('まとめてある。', 'まとめてある。M01 を見よ。');
    expect(checkReadmeSection(readmeSection(bad))).toContain('contains an M-number ID');
  });

  it('reports a README without the section', () => {
    expect(checkReadmeSection(readmeSection('# pkg\n\n## 他\n'))).toEqual(['section is missing']);
  });
});
