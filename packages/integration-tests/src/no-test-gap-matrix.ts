import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type YesNo = 'yes' | 'no';
type MigrationState = 'legacy-only' | 'sem-ready' | 'dual' | 'migrated';

export interface MatrixRow {
  caseId: string;
  legacySnapshot: YesNo;
  semanticTest: YesNo;
  visualTest: YesNo;
  migrationState: MigrationState;
  owner: string;
  lastVerifiedAt: string;
}

const VALID_YES_NO = new Set<string>(['yes', 'no']);
const VALID_MIGRATION_STATES = new Set<string>(['legacy-only', 'sem-ready', 'dual', 'migrated']);

function assertYesNo(value: string, field: string, line: number): asserts value is YesNo {
  if (!VALID_YES_NO.has(value)) {
    throw new Error(`Line ${line}: "${field}" must be "yes" or "no", got "${value}"`);
  }
}

function assertMigrationState(value: string, line: number): asserts value is MigrationState {
  if (!VALID_MIGRATION_STATES.has(value)) {
    throw new Error(
      `Line ${line}: "migration_state" must be one of ${[...VALID_MIGRATION_STATES].join(', ')}, got "${value}"`
    );
  }
}

/**
 * Parse the No Test-Gap matrix from Markdown content.
 * Looks for the "## 移行対応表" section's table.
 */
export function parseMatrix(markdownContent: string): MatrixRow[] {
  const lines = markdownContent.split('\n');
  const rows: MatrixRow[] = [];

  let inMigrationTable = false;
  let headerFound = false;
  let separatorSkipped = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();

    // Detect the migration table section
    if (line === '## 移行対応表') {
      inMigrationTable = true;
      headerFound = false;
      separatorSkipped = false;
      continue;
    }

    // Stop at next section
    if (inMigrationTable && line.startsWith('## ') && line !== '## 移行対応表') {
      break;
    }

    if (!inMigrationTable) continue;

    // Skip non-table lines
    if (!line.startsWith('|')) continue;

    // Detect header row
    if (!headerFound && line.includes('case_id')) {
      headerFound = true;
      continue;
    }

    // Skip separator row (|---|---|...)
    if (headerFound && !separatorSkipped && /^\|[\s-|]+\|$/.test(line)) {
      separatorSkipped = true;
      continue;
    }

    // Parse data rows
    if (headerFound && separatorSkipped) {
      const cells = line
        .split('|')
        .map((c) => c.trim())
        .filter((c) => c !== '');

      if (cells.length < 7) {
        throw new Error(`Line ${i + 1}: Expected 7 columns, got ${cells.length}`);
      }

      const [
        caseId,
        legacySnapshot,
        semanticTest,
        visualTest,
        migrationState,
        owner,
        lastVerifiedAt,
      ] = cells;

      assertYesNo(legacySnapshot!, 'legacy_snapshot', i + 1);
      assertYesNo(semanticTest!, 'semantic_test', i + 1);
      assertYesNo(visualTest!, 'visual_test', i + 1);
      assertMigrationState(migrationState!, i + 1);

      rows.push({
        caseId: caseId!,
        legacySnapshot,
        semanticTest,
        visualTest,
        migrationState,
        owner: owner!,
        lastVerifiedAt: lastVerifiedAt!,
      });
    }
  }

  return rows;
}

/**
 * Read and parse the matrix file from the project root.
 */
export function readMatrix(projectRoot: string): MatrixRow[] {
  const matrixPath = resolve(projectRoot, 'docs/testing/no-test-gap-matrix.md');
  const content = readFileSync(matrixPath, 'utf-8');
  return parseMatrix(content);
}
