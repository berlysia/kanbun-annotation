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
  let status: AdrStatus = 'Proposed';
  let deps: number[] | undefined;
  let plan: string | undefined;
  let substatus: AdrSubstatus | undefined;

  for (const line of yaml.split('\n')) {
    const statusMatch = line.match(/^status:\s*(.+)/);
    if (statusMatch) {
      const raw = statusMatch[1]!.trim();
      if (isValidStatus(raw)) status = raw;
    }

    const depsMatch = line.match(/^deps:\s*\[([^\]]*)\]/);
    if (depsMatch) {
      const inner = depsMatch[1]!.trim();
      if (inner) {
        deps = inner.split(',').map((s) => parseInt(s.trim(), 10));
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

  return {
    status,
    ...(deps && deps.length > 0 ? { deps } : {}),
    ...(plan ? { plan } : {}),
    ...(substatus && Object.keys(substatus).length > 0 ? { substatus } : {}),
  };
}

export function serializeFrontmatter(fm: AdrFrontmatter): string {
  const lines: string[] = ['---'];
  lines.push(`status: ${fm.status}`);
  if (fm.deps && fm.deps.length > 0) {
    lines.push(`deps: [${fm.deps.join(', ')}]`);
  }
  if (fm.plan) {
    lines.push(`plan: ${fm.plan}`);
  }
  if (fm.substatus && Object.keys(fm.substatus).length > 0) {
    lines.push('substatus:');
    for (const [key, val] of Object.entries(fm.substatus)) {
      lines.push(`  ${key}: ${val}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
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

  const frontmatter = parseFrontmatter(content);
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
