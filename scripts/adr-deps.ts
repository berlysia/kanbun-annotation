/**
 * ADR dependency map: Mermaid diagram + actionable list.
 *
 * Usage:
 *   node scripts/adr-deps.ts              # Print to stdout
 *   node scripts/adr-deps.ts --output x   # Also write to file
 */
import { writeFileSync } from 'node:fs';
import { parseAllAdrs, getPhase, getActionableAdrs } from './lib/adr-parser.ts';
import type { AdrInfo, AdrStatus } from './lib/types.ts';

const REPO_ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

function statusToClass(status: AdrStatus): string {
  switch (status) {
    case 'Complete':
      return 'complete';
    case 'Accepted':
      return 'accepted';
    case 'InProgress':
      return 'inprogress';
    case 'Proposed':
      return 'proposed';
  }
}

function generateMermaid(adrs: AdrInfo[]): string {
  const lines: string[] = [];
  lines.push('```mermaid');
  lines.push('graph TD');
  lines.push('  classDef complete fill:#d4edda,stroke:#28a745');
  lines.push('  classDef accepted fill:#cce5ff,stroke:#0d6efd');
  lines.push('  classDef proposed fill:#fff3cd,stroke:#ffc107');
  lines.push('  classDef inprogress fill:#ffe0b2,stroke:#ff9800');
  lines.push('');

  // Node definitions
  for (const adr of adrs) {
    const id = String(adr.number).padStart(3, '0');
    // Sanitize label for Mermaid (remove backticks, quotes, angle brackets)
    const rawTitle = adr.title.slice(0, 30).replace(/["`<>]/g, '');
    const label = `${id}: ${rawTitle}`;
    const cls = statusToClass(adr.frontmatter.status);
    lines.push(`  ${id}["${label}"]:::${cls}`);
  }

  lines.push('');

  // Edges (deps → this ADR)
  for (const adr of adrs) {
    const deps = adr.frontmatter.deps ?? [];
    const to = String(adr.number).padStart(3, '0');
    for (const dep of deps) {
      const from = String(dep).padStart(3, '0');
      lines.push(`  ${from} --> ${to}`);
    }
  }

  lines.push('```');
  return lines.join('\n');
}

function generateActionableList(adrs: AdrInfo[]): string {
  const actionable = getActionableAdrs(adrs);
  if (actionable.length === 0) {
    return 'No actionable ADRs (all have unresolved dependencies or are Complete).';
  }

  const lines: string[] = [];
  lines.push('## Next Actionable ADRs');
  lines.push('');
  lines.push('ADRs with all dependencies resolved (or no dependencies):');
  lines.push('');

  for (const adr of actionable) {
    const num = String(adr.number).padStart(3, '0');
    const phase = getPhase(adr);
    lines.push(`- **ADR-${num}** ${adr.title} [${phase}]`);
  }

  return lines.join('\n');
}

function main(): void {
  const args = process.argv.slice(2);
  const outputIdx = args.indexOf('--output');
  const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : undefined;

  const adrs = parseAllAdrs(REPO_ROOT);

  const mermaid = generateMermaid(adrs);
  const actionable = generateActionableList(adrs);
  const output = `# ADR Dependency Map\n\n${mermaid}\n\n${actionable}\n`;

  console.log(output);

  if (outputPath) {
    writeFileSync(outputPath, output, 'utf-8');
    console.log(`Written to ${outputPath}`);
  }
}

main();
