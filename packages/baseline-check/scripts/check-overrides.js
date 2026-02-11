/**
 * Detect features without override definitions by parsing the baseline report.
 *
 * Reads the generated report (docs/baseline-compatibility.md) and identifies
 * features with ❓ unknown status per section.
 *
 * Prerequisites: Run `pnpm --filter @kanbun/baseline-check report` first.
 *
 * Output: Human-readable summary to stderr, JSON array to stdout.
 * When all features have overrides, exits with code 0 and empty JSON array.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..', '..', '..');
const reportPath = join(rootDir, 'docs', 'baseline-compatibility.md');

let report;
try {
  report = readFileSync(reportPath, 'utf-8');
} catch {
  console.error(`Report not found: ${reportPath}`);
  console.error('Run `pnpm --filter @kanbun/baseline-check report` first.');
  process.exit(1);
}

// Map section titles to override file info
const sectionMap = {
  'HTML Renderer': { key: 'renderer', file: 'baseline-overrides-renderer.json' },
  'Canvas Renderer': { key: 'renderer', file: 'baseline-overrides-renderer.json' },
  Playground: { key: 'playground', file: 'baseline-overrides-playground.json' },
};

const unknowns = [];
let currentSection = null;
let currentYear = null;

for (const line of report.split('\n')) {
  // Track ## section headers
  const h2 = line.match(/^## (.+)/);
  if (h2) {
    currentSection = sectionMap[h2[1]] || null;
    currentYear = null;
    continue;
  }
  if (!currentSection) continue;

  // Track ### year subheaders
  const h3 = line.match(/^### Baseline (\d+)/);
  if (h3) {
    currentYear = Number(h3[1]);
    continue;
  }
  if (line.startsWith('### Not yet Baseline')) {
    currentYear = null;
    continue;
  }

  // Parse table rows with unknown status
  const row = line.match(/^\| `(.+?)` \| ❓ unknown \|/);
  if (row) {
    unknowns.push({
      feature: row[1],
      section: currentSection.key,
      overrideFile: currentSection.file,
      baselineYear: currentYear,
    });
  }
}

// Deduplicate (same feature in html + canvas both map to "renderer")
const seen = new Set();
const unique = unknowns.filter((u) => {
  const key = `${u.section}:${u.feature}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

if (unique.length === 0) {
  console.error('All features have override definitions.');
  console.log('[]');
  process.exit(0);
}

// Human-readable summary to stderr
const grouped = new Map();
for (const u of unique) {
  if (!grouped.has(u.overrideFile)) grouped.set(u.overrideFile, []);
  grouped.get(u.overrideFile).push(u);
}

console.error(`${unique.length} feature(s) without override definitions:\n`);
for (const [file, features] of grouped) {
  console.error(`  ${file}:`);
  for (const f of features) {
    const year = f.baselineYear ? ` (Baseline ${f.baselineYear})` : ' (Not yet Baseline)';
    console.error(`    - ${f.feature}${year}`);
  }
}

// Machine-readable JSON to stdout
console.log(JSON.stringify(unique, null, 2));
