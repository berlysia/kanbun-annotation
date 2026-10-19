import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AdrFrontmatter, AdrInfo, AdrPhase, AdrStatus, AdrSubstatus } from './types.ts';

const VALID_STATUSES: readonly AdrStatus[] = ['Proposed', 'Accepted', 'InProgress', 'Complete'];

function isValidStatus(s: string): s is AdrStatus {
  return (VALID_STATUSES as readonly string[]).includes(s);
}

export function parseFrontmatter(content: string): AdrFrontmatter | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1]!;
  let status: AdrStatus | undefined;
  let deps: number[] | undefined;
  let plan: string | undefined;
  let substatus: AdrSubstatus | undefined;

  for (const line of yaml.split('\n')) {
    const statusMatch = line.match(/^status:(.*)/);
    if (statusMatch) {
      const raw = statusMatch[1]!.trim();
      // An empty value is the same as a missing key, reported below.
      if (raw !== '') {
        if (!isValidStatus(raw)) {
          throw new Error(
            `Invalid status ${JSON.stringify(raw)}: expected one of ${VALID_STATUSES.join(', ')}`
          );
        }
        status = raw;
      }
    }

    const depsMatch = line.match(/^deps:\s*\[([^\]]*)\]/);
    if (depsMatch) {
      const inner = depsMatch[1]!.trim();
      if (inner) {
        deps = inner.split(',').map((s) => {
          const item = s.trim();
          if (!/^\d+$/.test(item)) {
            throw new Error(
              `Invalid deps entry ${JSON.stringify(item)}: expected a number like 16`
            );
          }
          return parseInt(item, 10);
        });
      }
    }

    const planMatch = line.match(/^plan:\s*(.+)/);
    if (planMatch) {
      plan = planMatch[1]!.trim();
    }

    const substatusMatch = line.match(/^substatus:/);
    if (substatusMatch) {
      substatus = {};
    }

    // Indented substatus entries (2-space indent under substatus:)
    if (substatus !== undefined) {
      const entryMatch = line.match(/^\s{2}(\w+):\s*(.+)/);
      if (entryMatch) {
        const key = entryMatch[1]!;
        const val = entryMatch[2]!.trim();
        if (isValidStatus(val)) {
          substatus[key] = val;
        }
      }
    }
  }

  if (status === undefined) {
    throw new Error('Missing status');
  }

  return {
    status,
    ...(deps && deps.length > 0 ? { deps } : {}),
    ...(plan ? { plan } : {}),
    ...(substatus && Object.keys(substatus).length > 0 ? { substatus } : {}),
  };
}

function extractTitle(content: string): string {
  // Skip frontmatter if present
  let body = content;
  if (body.startsWith('---\n')) {
    const endIdx = body.indexOf('\n---\n', 4);
    if (endIdx !== -1) {
      body = body.slice(endIdx + 5);
    }
  }
  const match = body.match(/^#\s+(.+)/m);
  if (!match) return '(untitled)';
  // Remove ADR-NNN: prefix
  return match[1]!.replace(/^ADR-\d{3}:\s*/, '').trim();
}

function extractBodyRefs(content: string): number[] {
  // Skip frontmatter
  let body = content;
  if (body.startsWith('---\n')) {
    const endIdx = body.indexOf('\n---\n', 4);
    if (endIdx !== -1) {
      body = body.slice(endIdx + 5);
    }
  }
  const refs = new Set<number>();
  const regex = /ADR-(\d{3})/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(body)) !== null) {
    refs.add(parseInt(m[1]!, 10));
  }
  return [...refs].sort((a, b) => a - b);
}

function checkPlanValidated(planPath: string): boolean {
  if (!existsSync(planPath)) return false;
  const content = readFileSync(planPath, 'utf-8');
  return content.includes('<!-- validated -->');
}

export function parseAdrFile(filePath: string, repoRoot: string): AdrInfo {
  const content = readFileSync(filePath, 'utf-8');
  const relPath = relative(repoRoot, filePath);

  // Extract number and slug from filename: adr-NNN-slug.md
  const fnMatch = filePath.match(/adr-(\d{3})-(.+)\.md$/);
  const number = fnMatch ? parseInt(fnMatch[1]!, 10) : 0;
  const slug = fnMatch ? fnMatch[2]! : '';

  let frontmatter: AdrFrontmatter | null;
  try {
    frontmatter = parseFrontmatter(content);
  } catch (error) {
    throw new Error(`${relPath}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
  if (!frontmatter) {
    throw new Error(`No frontmatter found in ${relPath}`);
  }

  const title = extractTitle(content);
  const bodyRefs = extractBodyRefs(content);

  // Check plan existence
  const planFile = frontmatter.plan;
  const plansDir = join(repoRoot, 'docs', 'plans');
  const planPath = planFile ? join(plansDir, planFile) : '';
  const planExists = planFile ? existsSync(planPath) : false;
  const planValidated = planExists ? checkPlanValidated(planPath) : false;

  return {
    number,
    slug,
    title,
    frontmatter,
    filePath: relPath,
    planExists,
    planValidated,
    bodyRefs,
  };
}

export function parseAllAdrs(repoRoot: string): AdrInfo[] {
  const decisionsDir = join(repoRoot, 'docs', 'decisions');
  const files = readdirSync(decisionsDir)
    .filter((f) => /^adr-\d{3}-.+\.md$/.test(f))
    .sort();

  return files.map((f) => parseAdrFile(join(decisionsDir, f), repoRoot));
}

export function getPhase(adr: AdrInfo): AdrPhase {
  const { status } = adr.frontmatter;

  if (status === 'Complete') return 'done';
  if (status === 'InProgress') return 'implementation';
  if (status === 'Proposed') return 'investigation';

  // Accepted
  if (!adr.frontmatter.plan) return 'planning';
  if (!adr.planExists) return 'planning';
  if (!adr.planValidated) return 'validation';
  return 'implementation';
}

export function formatPlan(adr: AdrInfo): string {
  if (!adr.frontmatter.plan) return '-';
  if (!adr.planExists) return 'missing';
  if (adr.planValidated) return 'validated';
  return 'exists';
}

export function getActionableAdrs(adrs: AdrInfo[]): AdrInfo[] {
  const completeNumbers = new Set(
    adrs.filter((a) => a.frontmatter.status === 'Complete').map((a) => a.number)
  );

  return adrs.filter((adr) => {
    if (adr.frontmatter.status === 'Complete') return false;
    const deps = adr.frontmatter.deps ?? [];
    return deps.every((d) => completeNumbers.has(d));
  });
}

// CLAUDE.md asks for the plan and the plan: key to be removed in the PR that completes an ADR.
export function getCompleteWithPlanWarnings(adrs: AdrInfo[]): string[] {
  return adrs
    .filter((adr) => adr.frontmatter.status === 'Complete' && adr.frontmatter.plan)
    .map((adr) => {
      const num = String(adr.number).padStart(3, '0');
      return `warning: ADR-${num} is Complete but still has plan: ${adr.frontmatter.plan} (remove the plan and the plan: key; see CLAUDE.md "ADR-Plan ワークフロー")`;
    });
}

// Result of `adr-status.ts --check`: any line is a failure.
export function checkAdrs(adrs: AdrInfo[]): { lines: string[]; exitCode: 0 | 1 } {
  const lines = getCompleteWithPlanWarnings(adrs);
  return { lines, exitCode: lines.length > 0 ? 1 : 0 };
}
