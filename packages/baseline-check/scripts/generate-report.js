/**
 * Generate a Baseline compatibility report with yearly analysis and fallback info.
 *
 * Runs stylelint/eslint with year-based configs (Baseline 2022–current),
 * merges with manual overrides, and outputs a markdown report.
 */

import { execSync, spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(__dirname, '..');
const bin = join(pkgDir, 'node_modules', '.bin');

const BASELINE_START_YEAR = 2022;
const CURRENT_YEAR = new Date().getFullYear();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run a command, return output containing JSON. */
function run(cmd) {
  try {
    return execSync(cmd, {
      cwd: pkgDir,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (e) {
    return e.stdout || e.stderr || '';
  }
}

/** Run a command via shell, capture stdout and stderr separately. */
function runCaptureBoth(cmd) {
  const result = spawnSync('sh', ['-c', cmd], {
    cwd: pkgDir,
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  });
  return { stdout: result.stdout || '', stderr: result.stderr || '' };
}

/** Extract the JSON array portion from tool output. */
function extractJsonArray(raw) {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1) return '[]';
  return raw.slice(start, end + 1);
}

/** Parse ESLint JSON output → { file, feature, category, message }[] */
function parseEslintJson(json, source) {
  if (!json.trim()) return [];
  const data = JSON.parse(extractJsonArray(json));
  const results = [];
  for (const file of data) {
    const name = basename(file.filePath);
    for (const msg of file.messages) {
      results.push({
        source,
        file: name,
        feature: extractFeature(msg.message),
        category: extractCategory(msg.message),
        message: msg.message,
        line: msg.line,
        ruleId: msg.ruleId,
        severity: msg.severity === 2 ? 'error' : 'warning',
      });
    }
  }
  return results;
}

/** Parse Stylelint JSON output → same shape */
function parseStylelintJson(json) {
  if (!json.trim()) return [];
  const data = JSON.parse(extractJsonArray(json));
  const results = [];
  for (const file of data) {
    const name = basename(file.source);
    for (const w of file.warnings) {
      results.push({
        source: 'stylelint',
        file: name,
        feature: extractFeature(w.text),
        category: extractCategory(w.text),
        message: w.text,
        line: w.line,
        ruleId: w.rule,
        severity: w.severity,
      });
    }
  }
  return results;
}

/** Extract the CSS/JS feature name from a warning message */
function extractFeature(msg) {
  const valueMatch = msg.match(/Value ['"](.+?)['"] of property ['"](.+?)['"]/);
  if (valueMatch) return `${valueMatch[2]}: ${valueMatch[1]}`;

  const match = msg.match(/(?:Property|Selector|Function|At-rule) ['"](.+?)['"]/);
  return match ? match[1] : msg;
}

/** Classify the warning category */
function extractCategory(msg) {
  if (msg.includes('Property')) return 'property';
  if (msg.includes('Selector')) return 'selector';
  if (msg.includes('Value')) return 'value';
  if (msg.includes('Function')) return 'function';
  if (msg.includes('At-rule')) return 'at-rule';
  return 'other';
}

// ---------------------------------------------------------------------------
// Yearly config generation
// ---------------------------------------------------------------------------

function writeYearlyStylelintConfig(year) {
  const config = `export default {
  plugins: ['stylelint-plugin-use-baseline'],
  rules: { 'plugin/use-baseline': [true, { available: ${year}, severity: 'warning' }] },
};
`;
  const path = join(pkgDir, `.stylelint-${year}.config.js`);
  writeFileSync(path, config, 'utf-8');
  return path;
}

function writeYearlyEslintConfig(year) {
  const config = `import baselineJs from 'eslint-plugin-baseline-js';
export default [
  { plugins: { 'baseline-js': baselineJs } },
  baselineJs.configs.recommended({ available: ${year}, level: 'warn' }),
  { files: ['**/*.js'], rules: { 'baseline-js/use-baseline': ['warn', { available: ${year} }] } },
];
`;
  const path = join(pkgDir, `.eslint-${year}.config.js`);
  writeFileSync(path, config, 'utf-8');
  return path;
}

// ---------------------------------------------------------------------------
// Year detection & classification
// ---------------------------------------------------------------------------

function getBaselineYears() {
  const years = [];
  for (let y = BASELINE_START_YEAR; y <= CURRENT_YEAR; y++) years.push(y);
  return years;
}

/** Collect all unique features from a set of results. */
function collectFeatures(results) {
  return new Set(results.map((r) => r.feature));
}

/** Classify features into sections based on file name patterns.
 *  Shared files (both-both, no-layer, skam-html-*, skam-xml-*, skam.js) are
 *  excluded from ruby/grid classification so that only variant-specific files
 *  determine which section a feature belongs to. */
function classifySection(files) {
  const sections = new Set();
  for (const f of files) {
    if (f.includes('-ruby')) sections.add('html-ruby');
    else if (f.includes('-grid')) sections.add('html-grid');
    else if (f.startsWith('skam-canvas-')) sections.add('canvas');
    else if (f.startsWith('playground-')) sections.add('playground');
    // renderer-both-both, renderer-no-layer, skam-html-*, skam-xml-*, skam.js
    // are shared — skip them to avoid leaking features across ruby/grid
  }
  return [...sections];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const now = new Date().toISOString().slice(0, 10);

  // Load section-specific overrides
  const rendererOverrides = JSON.parse(
    readFileSync(join(pkgDir, 'baseline-overrides-renderer.json'), 'utf-8')
  );
  const playgroundOverrides = JSON.parse(
    readFileSync(join(pkgDir, 'baseline-overrides-playground.json'), 'utf-8')
  );
  const sectionOverrides = {
    'html-ruby': rendererOverrides,
    'html-grid': rendererOverrides,
    canvas: rendererOverrides,
    playground: playgroundOverrides,
  };

  // 1. Extract files
  console.error('Extracting CSS/JS...');
  run('node scripts/extract-css.js');

  // 2. Run yearly checks
  const years = getBaselineYears();
  /** @type {Map<number, { css: any[], js: any[] }>} */
  const yearlyResults = new Map();

  for (const year of years) {
    console.error(`Running checks for Baseline ${year}...`);
    const stylelintConfig = writeYearlyStylelintConfig(year);
    const eslintConfig = writeYearlyEslintConfig(year);
    try {
      const cssOut = runCaptureBoth(
        `${bin}/stylelint -f json --config ${stylelintConfig} 'extracted/css/**/*.css'`
      );
      const jsOut = run(`${bin}/eslint -c ${eslintConfig} -f json 'extracted/js/**/*.js'`);
      yearlyResults.set(year, {
        css: parseStylelintJson(cssOut.stderr || cssOut.stdout),
        js: parseEslintJson(jsOut, 'eslint-js'),
      });
    } finally {
      try {
        unlinkSync(stylelintConfig);
      } catch {}
      try {
        unlinkSync(eslintConfig);
      } catch {}
    }
  }

  // 3. Collect all detected features across all years
  // Use the earliest year (most strict) to get the full feature set
  const allResults = yearlyResults.get(years[0]);
  if (!allResults) {
    console.error('No results for the earliest year. Aborting.');
    process.exit(1);
  }
  const allWarnings = [...allResults.css, ...allResults.js];

  // Build feature map: feature → { files, category }
  /** @type {Map<string, { files: Set<string>, category: string }>} */
  const featureMap = new Map();
  for (const r of allWarnings) {
    if (!featureMap.has(r.feature)) {
      featureMap.set(r.feature, { files: new Set(), category: r.category });
    }
    featureMap.get(r.feature).files.add(r.file);
  }

  // 4. Detect baseline year per feature
  // The baseline year is the first year where the feature is no longer warned
  /** @type {Map<string, { feature: string, baselineYear: number | null, sections: string[], category: string }>} */
  const features = new Map();

  for (const [feature, { files, category }] of featureMap) {
    let baselineYear = null;
    for (const year of years) {
      const results = yearlyResults.get(year);
      const allFeatures = collectFeatures([...results.css, ...results.js]);
      if (!allFeatures.has(feature)) {
        baselineYear = year;
        break;
      }
    }

    features.set(feature, {
      feature,
      baselineYear,
      sections: classifySection(files),
      category,
    });
  }

  // 5. Generate report
  const lines = [];
  lines.push(`# Baseline Compatibility Report`);
  lines.push(``);
  lines.push(`Generated: ${now}`);
  lines.push(``);

  const all = [...features.values()];

  /** Resolve status for a feature in a given section */
  function resolveStatus(feature, sectionKey) {
    const ov = sectionOverrides[sectionKey]?.[feature];
    return ov?.status ?? 'unknown';
  }

  /** Resolve fallback for a feature in a given section */
  function resolveFallback(feature, sectionKey) {
    const ov = sectionOverrides[sectionKey]?.[feature];
    return ov?.fallback ?? '-';
  }

  /** Compute per-section summary stats */
  function getSectionSummary(sectionKey) {
    const feats = all.filter((f) => f.sections.includes(sectionKey));
    const broken = feats.filter((f) => resolveStatus(f.feature, sectionKey) === 'broken');
    const unknown = feats.filter((f) => resolveStatus(f.feature, sectionKey) === 'unknown');
    const withYear = feats.filter(
      (f) => f.baselineYear != null && resolveStatus(f.feature, sectionKey) !== 'broken'
    );
    const maxYear = withYear.length > 0 ? Math.max(...withYear.map((f) => f.baselineYear)) : null;
    const notYetBaseline = feats.filter((f) => f.baselineYear == null);
    // safe な Limited 機能は「解決済み」として除外し、degraded のみを問題として扱う
    const unresolvedNotBaseline = notYetBaseline.filter(
      (f) => resolveStatus(f.feature, sectionKey) !== 'safe'
    );
    const hasDegradedNotBaseline = unresolvedNotBaseline.some(
      (f) => resolveStatus(f.feature, sectionKey) === 'degraded'
    );
    return {
      feats,
      broken,
      unknown,
      maxYear,
      notYetBaseline,
      unresolvedNotBaseline,
      hasDegradedNotBaseline,
    };
  }

  const rendererSections = [
    { key: 'html-grid', label: 'HTML Renderer (Grid)' },
    { key: 'html-ruby', label: 'HTML Renderer (Ruby)' },
    { key: 'canvas', label: 'Canvas Renderer' },
  ];
  const playgroundSummary = getSectionSummary('playground');

  lines.push(`## Summary`);
  lines.push(``);
  lines.push(`| Renderer | Baseline Year | Notes |`);
  lines.push(`|----------|--------------|-------|`);

  for (const { key, label } of rendererSections) {
    const s = getSectionSummary(key);
    if (s.broken.length > 0) {
      lines.push(`| ${label} | ❌ broken | 一部機能は非対応ブラウザで動作しません |`);
    } else {
      const notes = [];
      if (s.hasDegradedNotBaseline) notes.push('一部 cosmetic な体験低下あり');
      if (s.unknown.length > 0) notes.push(`${s.unknown.length} 件フォールバック未定義`);
      // safe な Limited 機能を除外した上で baseline 年度を決定
      // maxYear がなければ全機能が Baseline 2022 より前から対応済み
      const yearLabel =
        s.maxYear != null ? `**Baseline ${s.maxYear}**` : `< Baseline ${BASELINE_START_YEAR}`;
      lines.push(`| ${label} | ${yearLabel} | ${notes.join('、') || '—'} |`);
    }
  }

  lines.push(``);

  if (playgroundSummary.unknown.length > 0) {
    lines.push(
      `> Playground: ${playgroundSummary.unknown.length} 件のフォールバック未定義機能があります（\`baseline-overrides-playground.json\` に追加してください）`
    );
  }

  lines.push(``);

  // Section renderers
  const statusIcon = {
    safe: '✅ safe',
    degraded: '⚠️ degraded',
    broken: '❌ broken',
    unknown: '❓ unknown',
  };

  function renderSection(title, sectionKey, isReference) {
    lines.push(`## ${title}`);
    lines.push(``);

    if (isReference) {
      lines.push(`> 参考情報: Playground 固有の機能はライブラリ利用者に影響しません`);
      lines.push(``);
    }

    const sectionFeatures = all.filter((f) => f.sections.includes(sectionKey));

    if (sectionFeatures.length === 0) {
      lines.push(`全機能 Baseline 対応済み — 非 Baseline 機能は検出されませんでした。`);
      lines.push(``);
      return;
    }

    // Group by baseline year
    const byYear = new Map();
    const notBaseline = [];
    for (const f of sectionFeatures) {
      if (f.baselineYear == null) {
        notBaseline.push(f);
      } else {
        if (!byYear.has(f.baselineYear)) byYear.set(f.baselineYear, []);
        byYear.get(f.baselineYear).push(f);
      }
    }

    // Render year groups (ascending)
    const sortedYears = [...byYear.keys()].sort((a, b) => a - b);
    for (const year of sortedYears) {
      const feats = byYear.get(year);
      lines.push(`### Baseline ${year}`);
      lines.push(``);
      lines.push(`| Feature | Status | Fallback |`);
      lines.push(`|---------|--------|----------|`);
      for (const f of feats) {
        const status = resolveStatus(f.feature, sectionKey);
        const fallback = resolveFallback(f.feature, sectionKey);
        lines.push(`| \`${f.feature}\` | ${statusIcon[status] || status} | ${fallback} |`);
      }
      lines.push(``);
    }

    // Not yet baseline
    if (notBaseline.length > 0) {
      lines.push(`### Limited Availability`);
      lines.push(``);
      lines.push(`| Feature | Status | Fallback |`);
      lines.push(`|---------|--------|----------|`);
      for (const f of notBaseline) {
        const status = resolveStatus(f.feature, sectionKey);
        const fallback = resolveFallback(f.feature, sectionKey);
        lines.push(`| \`${f.feature}\` | ${statusIcon[status] || status} | ${fallback} |`);
      }
      lines.push(``);
    }
  }

  renderSection('HTML Renderer (Grid)', 'html-grid', false);
  renderSection('HTML Renderer (Ruby)', 'html-ruby', false);
  renderSection('Canvas Renderer', 'canvas', false);
  renderSection('Playground', 'playground', true);

  // Yearly check summary (debug info)
  lines.push(`## Yearly Check Summary`);
  lines.push(``);
  lines.push(`| Year | CSS Warnings | JS Warnings | Total |`);
  lines.push(`|------|-------------|-------------|-------|`);
  for (const year of years) {
    const results = yearlyResults.get(year);
    const cssCount = results.css.length;
    const jsCount = results.js.length;
    lines.push(`| ${year} | ${cssCount} | ${jsCount} | ${cssCount + jsCount} |`);
  }
  lines.push(``);

  const report = lines.join('\n');

  // Output
  const outPath = process.argv[2] || join(pkgDir, 'baseline-report.md');
  writeFileSync(outPath, report, 'utf-8');
  console.error(`\nReport written to: ${outPath}`);

  // Also print to stdout
  console.log(report);
}

main();
