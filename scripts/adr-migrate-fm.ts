/**
 * ADR frontmatter migration script.
 *
 * Usage:
 *   node scripts/adr-migrate-fm.ts --dry-run   # Preview changes
 *   node scripts/adr-migrate-fm.ts --write      # Apply changes
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { serializeFrontmatter } from './lib/adr-parser.ts';
import type { AdrFrontmatter, AdrStatus, AdrSubstatus } from './lib/types.ts';

const REPO_ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const DECISIONS_DIR = join(REPO_ROOT, 'docs', 'decisions');

interface MigrationResult {
  file: string;
  frontmatter: AdrFrontmatter;
  original: string;
  migrated: string;
  notes: string[];
}

function inferStatus(statusText: string): AdrStatus {
  const lower = statusText.toLowerCase();
  if (/complete|done|実装完了/.test(lower)) return 'Complete';
  if (/in\s*progress/.test(lower)) return 'InProgress';
  if (/proposed/.test(lower)) return 'Proposed';
  return 'Accepted';
}

function extractPlanFile(statusSection: string): string | undefined {
  // Match: 実装計画: [Plan](../plans/plan-xxx.md)
  const match = statusSection.match(/実装計画:\s*\[.*?\]\(\.\.\/plans\/(plan-[^)]+\.md)\)/);
  if (match) return match[1];
  return undefined;
}

function extractRelatedAdrs(statusSection: string): number[] {
  // Match: 関連 ADR: [ADR-NNN](...) patterns
  const refs: number[] = [];
  const regex = /ADR-(\d{3})/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(statusSection)) !== null) {
    refs.push(parseInt(m[1]!, 10));
  }
  return [...new Set(refs)].sort((a, b) => a - b);
}

function extractStatusSection(content: string): {
  section: string;
  startIdx: number;
  endIdx: number;
} | null {
  const startMatch = content.match(/^## ステータス\s*\n/m);
  if (!startMatch || startMatch.index === undefined) return null;

  const sectionStart = startMatch.index;
  const afterHeading = sectionStart + startMatch[0].length;

  // Find next ## heading
  const nextHeading = content.indexOf('\n## ', afterHeading);
  const sectionEnd = nextHeading === -1 ? content.length : nextHeading;

  return {
    section: content.slice(afterHeading, sectionEnd).trim(),
    startIdx: sectionStart,
    endIdx: sectionEnd,
  };
}

function parseSubstatus(statusSection: string): AdrSubstatus | undefined {
  // Detect multi-line renderer-specific status like ADR-015
  // Pattern: "HTML レンダラー: **Done** ..." / "Canvas レンダラー: In Progress"
  const rendererPattern =
    /(?:HTML|Canvas)\s*(?:レンダラー)?:\s*\*{0,2}(Done|Complete|In Progress|Accepted|Proposed)\*{0,2}/gi;
  const matches = [...statusSection.matchAll(rendererPattern)];
  if (matches.length < 2) return undefined;

  const sub: AdrSubstatus = {};
  for (const m of matches) {
    const fullMatch = m[0]!;
    const statusVal = m[1]!;
    const key = /html/i.test(fullMatch) ? 'html' : 'canvas';
    sub[key] = inferStatus(statusVal);
  }
  return Object.keys(sub).length > 0 ? sub : undefined;
}

function migrateFile(filePath: string): MigrationResult | null {
  const content = readFileSync(filePath, 'utf-8');
  const fileName = filePath.split('/').pop()!;
  const notes: string[] = [];

  // Skip if already has frontmatter
  if (content.startsWith('---\n')) {
    return null;
  }

  const statusInfo = extractStatusSection(content);
  if (!statusInfo) {
    notes.push('WARNING: No ## ステータス section found');
    return {
      file: fileName,
      frontmatter: { status: 'Proposed' },
      original: content,
      migrated: content,
      notes,
    };
  }

  const { section, startIdx, endIdx } = statusInfo;

  // Parse status
  const substatus = parseSubstatus(section);
  let status: AdrStatus;
  if (substatus) {
    // Derive overall status from substatus (least advanced)
    const priority: AdrStatus[] = ['Proposed', 'Accepted', 'InProgress', 'Complete'];
    const vals = Object.values(substatus);
    status = priority.find((p) => vals.includes(p)) ?? 'Accepted';
  } else {
    // First meaningful line of status section (before 実装計画/関連 ADR)
    const firstLine = section
      .split('\n')
      .find((l) => l.trim() && !l.startsWith('実装計画') && !l.startsWith('関連 ADR'));
    status = firstLine ? inferStatus(firstLine) : 'Proposed';
  }

  // Extract plan
  const plan = extractPlanFile(section);
  if (plan) {
    // ADR-012 has multiple plans — take the first one only
    const allPlans = [
      ...section.matchAll(
        /\[(?:Plan|Phase \d+ Plan|Layout Fixes Plan)\]\(\.\.\/plans\/(plan-[^)]+\.md)\)/g
      ),
    ].map((m) => m[1]!);
    if (allPlans.length > 1) {
      notes.push(`Multiple plans found: ${allPlans.join(', ')}. Using first: ${plan}`);
    }
  }

  // Extract related ADRs from status section — note only, not auto-set as deps
  // deps require manual review to determine which are truly blocking
  const relatedInStatus = extractRelatedAdrs(section);
  if (relatedInStatus.length > 0) {
    notes.push(
      `Related ADRs in status section: [${relatedInStatus.join(', ')}] — set deps manually if blocking`
    );
  }

  // Check for qualifier text that should be preserved
  const qualifierMatch = section.match(/\(([^)]*(?:移管|完了|管理)[^)]*)\)/);
  if (qualifierMatch) {
    notes.push(`Qualifier preserved as note: "${qualifierMatch[0]}"`);
  }

  // Check for "未作成" plan references
  if (/実装計画:\s*未作成/.test(section)) {
    notes.push('Plan marked as 未作成 (not yet created)');
  }

  // Build frontmatter (deps intentionally left empty — requires manual review)
  const fm: AdrFrontmatter = {
    status,
    ...(plan ? { plan } : {}),
    ...(substatus ? { substatus } : {}),
  };

  // Build migrated content: insert frontmatter, remove ## ステータス section
  const beforeStatus = content.slice(0, startIdx);
  const afterStatus = content.slice(endIdx);
  const fmStr = serializeFrontmatter(fm);

  // If there was a qualifier, add it as a note after the first ## heading
  let migratedBody = (beforeStatus + afterStatus).replace(/\n{3,}/g, '\n\n');

  // Add qualifier note if needed
  if (qualifierMatch) {
    const noteText = `\n> **Note:** ${qualifierMatch[0]}\n`;
    const contextIdx = migratedBody.indexOf('## コンテキスト');
    if (contextIdx !== -1) {
      migratedBody =
        migratedBody.slice(0, contextIdx) + noteText + '\n' + migratedBody.slice(contextIdx);
    }
  }

  const migrated = fmStr + '\n' + migratedBody.replace(/^\n+/, '');

  return {
    file: fileName,
    frontmatter: fm,
    original: content,
    migrated,
    notes,
  };
}

function main(): void {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const write = args.includes('--write');

  if (!dryRun && !write) {
    console.error('Usage: node scripts/adr-migrate-fm.ts --dry-run|--write');
    process.exit(1);
  }

  const files = readdirSync(DECISIONS_DIR)
    .filter((f) => /^adr-\d{3}-.+\.md$/.test(f))
    .sort();

  let migratedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    const filePath = join(DECISIONS_DIR, file);
    const result = migrateFile(filePath);

    if (!result) {
      console.log(`SKIP ${file} (already has frontmatter)`);
      skippedCount++;
      continue;
    }

    migratedCount++;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`${result.file}`);
    console.log(`  status: ${result.frontmatter.status}`);
    if (result.frontmatter.deps) {
      console.log(`  deps: [${result.frontmatter.deps.join(', ')}]`);
    }
    if (result.frontmatter.plan) {
      console.log(`  plan: ${result.frontmatter.plan}`);
    }
    if (result.frontmatter.substatus) {
      console.log(`  substatus: ${JSON.stringify(result.frontmatter.substatus)}`);
    }
    if (result.notes.length > 0) {
      for (const note of result.notes) {
        console.log(`  📝 ${note}`);
      }
    }

    if (write) {
      writeFileSync(filePath, result.migrated, 'utf-8');
      console.log(`  ✓ Written`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Done: ${migratedCount} migrated, ${skippedCount} skipped`);
  if (dryRun) {
    console.log('(dry-run mode — no files were modified)');
  }
}

main();
