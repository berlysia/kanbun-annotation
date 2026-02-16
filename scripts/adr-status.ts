/**
 * ADR triage: display status of all ADRs.
 *
 * Usage:
 *   node scripts/adr-status.ts              # Full table
 *   node scripts/adr-status.ts --actionable # Only actionable ADRs
 *   node scripts/adr-status.ts --output x   # Also write to file
 */
import { writeFileSync } from 'node:fs';
import { parseAllAdrs, getPhase, getActionableAdrs } from './lib/adr-parser.ts';
import type { AdrInfo, AdrPhase, AdrStatus } from './lib/types.ts';

const REPO_ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

function padEnd(s: string, len: number): string {
  // Handle wide characters (CJK) by counting display width
  let width = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    // CJK Unified Ideographs and common fullwidth ranges
    if (
      (code >= 0x3000 && code <= 0x9fff) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff01 && code <= 0xff60)
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  const pad = Math.max(0, len - width);
  return s + ' '.repeat(pad);
}

function formatPhase(phase: AdrPhase): string {
  return phase;
}

function formatPlan(adr: AdrInfo): string {
  if (!adr.frontmatter.plan) return '-';
  if (!adr.planExists) return 'missing';
  if (adr.planValidated) return 'validated';
  return 'exists';
}

function formatRow(adr: AdrInfo): string {
  const num = String(adr.number).padStart(3, '0');
  const title = padEnd(adr.title.slice(0, 40), 40);
  const status = adr.frontmatter.status.padEnd(10);
  const plan = formatPlan(adr).padEnd(10);
  const phase = formatPhase(getPhase(adr));
  return `| ${num} | ${title} | ${status} | ${plan} | ${phase}`;
}

function formatTable(adrs: AdrInfo[], title: string): string {
  const lines: string[] = [];
  const today = new Date().toISOString().slice(0, 10);

  lines.push(`# ${title} (${today})`);
  lines.push('');
  lines.push(
    `| #   | ${padEnd('Title', 40)} | ${'Status'.padEnd(10)} | ${'Plan'.padEnd(10)} | Phase`
  );
  lines.push(`| --- | ${'-'.repeat(40)} | ${'-'.repeat(10)} | ${'-'.repeat(10)} | -----`);

  for (const adr of adrs) {
    lines.push(formatRow(adr));
  }

  // Summary
  const counts: Record<AdrStatus, number> = {
    Complete: 0,
    Accepted: 0,
    InProgress: 0,
    Proposed: 0,
  };
  for (const adr of adrs) {
    counts[adr.frontmatter.status]++;
  }
  lines.push('');
  lines.push(
    `Summary: Complete=${counts.Complete}, Accepted=${counts.Accepted}, InProgress=${counts.InProgress}, Proposed=${counts.Proposed}`
  );

  return lines.join('\n');
}

function main(): void {
  const args = process.argv.slice(2);
  const actionableOnly = args.includes('--actionable');
  const outputIdx = args.indexOf('--output');
  const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : undefined;

  const allAdrs = parseAllAdrs(REPO_ROOT);

  let adrs: AdrInfo[];
  let title: string;

  if (actionableOnly) {
    adrs = getActionableAdrs(allAdrs);
    title = 'ADR Actionable';
  } else {
    adrs = allAdrs;
    title = 'ADR Status';
  }

  const output = formatTable(adrs, title);
  console.log(output);

  if (outputPath) {
    writeFileSync(outputPath, output + '\n', 'utf-8');
    console.log(`\nWritten to ${outputPath}`);
  }
}

main();
