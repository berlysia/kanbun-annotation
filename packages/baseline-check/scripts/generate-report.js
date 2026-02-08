/**
 * Generate a Baseline compatibility report from ESLint CSS, Stylelint, and ESLint JS results.
 *
 * Runs all three tools in JSON mode, aggregates findings,
 * and outputs a markdown report to stdout (and optionally to a file).
 */

import { execSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(__dirname, '..');
const bin = join(pkgDir, 'node_modules', '.bin');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run a command, return output containing JSON.
 * Handles different tools' output behavior:
 * - ESLint: JSON to stdout, exits 1 on warnings
 * - Stylelint: JSON to stderr, exits 0 on warnings
 */
function run(cmd) {
  try {
    const stdout = execSync(cmd, {
      cwd: pkgDir,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return stdout;
  } catch (e) {
    // Non-zero exit: check both streams for JSON
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

/** Extract the JSON array portion from tool output (strips non-JSON prefix/suffix). */
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

/** Extract the CSS feature name from a warning message */
function extractFeature(msg) {
  // "Property 'user-select' is not..." or "Selector 'has' is not..."
  // or "Value 'break-word' of property 'word-break' is not..."
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

/** Deduplicate by feature name, count occurrences */
function summarize(results) {
  const map = new Map();
  for (const r of results) {
    const key = r.feature;
    if (!map.has(key)) {
      map.set(key, { feature: key, category: r.category, count: 0, files: new Set() });
    }
    const entry = map.get(key);
    entry.count++;
    entry.files.add(r.file);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/** Classify features into renderer vs playground origin */
function classifyOrigin(files) {
  const isRenderer = [...files].some((f) => f.startsWith('renderer-'));
  const isPlayground = [...files].some((f) => f.startsWith('playground-'));
  if (isRenderer && isPlayground) return 'both';
  if (isRenderer) return 'renderer';
  return 'playground';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const now = new Date().toISOString().slice(0, 10);

  // 1. Extract files
  console.error('Extracting CSS/JS...');
  run('node scripts/extract-css.js');

  // 2. Run tools
  console.error('Running ESLint CSS...');
  const eslintCssJson = run(`${bin}/eslint -c eslint.config.js -f json 'extracted/css/**/*.css'`);

  console.error('Running Stylelint...');
  // Stylelint outputs JSON formatter to stderr
  const stylelintOut = runCaptureBoth(`${bin}/stylelint -f json 'extracted/css/**/*.css'`);
  const stylelintJson = stylelintOut.stderr || stylelintOut.stdout;

  console.error('Running ESLint JS...');
  const eslintJsJson = run(`${bin}/eslint -c eslint-js.config.js -f json 'extracted/js/**/*.js'`);

  // 3. Parse results
  const eslintCssResults = parseEslintJson(eslintCssJson, 'eslint-css');
  const stylelintResults = parseStylelintJson(stylelintJson);
  const eslintJsResults = parseEslintJson(eslintJsJson, 'eslint-js');

  // 4. Summarize
  const cssSummary = summarize(eslintCssResults);
  const jsSummary = summarize(eslintJsResults);

  // 5. Check tool consistency
  const eslintFeatures = new Set(eslintCssResults.map((r) => r.feature));
  const stylelintFeatures = new Set(stylelintResults.map((r) => r.feature));
  const onlyEslint = [...eslintFeatures].filter((f) => !stylelintFeatures.has(f));
  const onlyStylelint = [...stylelintFeatures].filter((f) => !eslintFeatures.has(f));

  // 6. Generate report
  const lines = [];
  lines.push(`# Web Platform Baseline Report`);
  lines.push(``);
  lines.push(`Generated: ${now}`);
  lines.push(`Baseline level: **widely** (supported in all core browsers for 30+ months)`);
  lines.push(``);
  lines.push(`## Summary`);
  lines.push(``);
  lines.push(`| Category | Unique Features | Total Occurrences |`);
  lines.push(`|----------|----------------|-------------------|`);
  lines.push(`| CSS (ESLint) | ${cssSummary.length} | ${eslintCssResults.length} |`);
  lines.push(
    `| CSS (Stylelint) | ${summarize(stylelintResults).length} | ${stylelintResults.length} |`
  );
  lines.push(`| JS (ESLint) | ${jsSummary.length} | ${eslintJsResults.length} |`);
  lines.push(``);

  // Tool consistency
  if (onlyEslint.length === 0 && onlyStylelint.length === 0) {
    lines.push(`> ESLint CSS and Stylelint produced **identical** results.`);
  } else {
    if (onlyEslint.length > 0) {
      lines.push(`> ESLint-only detections: ${onlyEslint.join(', ')}`);
    }
    if (onlyStylelint.length > 0) {
      lines.push(`> Stylelint-only detections: ${onlyStylelint.join(', ')}`);
    }
  }
  lines.push(``);

  // CSS details
  lines.push(`## CSS Baseline Violations`);
  lines.push(``);
  lines.push(`| Feature | Category | Occurrences | Origin |`);
  lines.push(`|---------|----------|-------------|--------|`);
  for (const entry of cssSummary) {
    const origin = classifyOrigin(entry.files);
    lines.push(`| \`${entry.feature}\` | ${entry.category} | ${entry.count} | ${origin} |`);
  }
  lines.push(``);

  // JS details
  lines.push(`## JS Baseline Violations`);
  lines.push(``);
  if (jsSummary.length === 0) {
    lines.push(`No violations detected.`);
  } else {
    lines.push(`| Feature | Category | Occurrences |`);
    lines.push(`|---------|----------|-------------|`);
    for (const entry of jsSummary) {
      lines.push(`| \`${entry.feature}\` | ${entry.category} | ${entry.count} |`);
    }
  }
  lines.push(``);

  // Per-file breakdown
  lines.push(`## Per-File Breakdown (CSS)`);
  lines.push(``);
  const byFile = new Map();
  for (const r of eslintCssResults) {
    if (!byFile.has(r.file)) byFile.set(r.file, []);
    byFile.get(r.file).push(r);
  }
  for (const [file, results] of [...byFile.entries()].sort()) {
    const unique = new Set(results.map((r) => r.feature));
    lines.push(`### ${file}`);
    lines.push(``);
    lines.push(`Warnings: ${results.length} (${unique.size} unique features)`);
    lines.push(``);
    for (const feature of [...unique].sort()) {
      const count = results.filter((r) => r.feature === feature).length;
      lines.push(`- \`${feature}\` (${count}x)`);
    }
    lines.push(``);
  }

  const report = lines.join('\n');

  // Output
  const outPath = process.argv[2] || join(pkgDir, 'baseline-report.md');
  writeFileSync(outPath, report, 'utf-8');
  console.error(`\nReport written to: ${outPath}`);

  // Also print to stdout
  console.log(report);
}

main();
