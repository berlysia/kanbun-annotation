import { describe, it, expect } from 'vitest';
import { parseMatrix } from '../no-test-gap-matrix.js';

describe('parseMatrix', () => {
  it('parses a valid sem-ready matrix', () => {
    const markdown = `# No Test-Gap 移行対応表

## 移行対応表

| case_id | legacy_snapshot | semantic_test | visual_test | migration_state | owner | last_verified_at |
|---------|----------------|---------------|-------------|-----------------|-------|-----------------|
| ruby-range-core | yes | yes | no | sem-ready | berlysia | 2026-02-15 |
| tateten-kaeri-split | yes | yes | no | sem-ready | berlysia | 2026-02-15 |
`;

    const rows = parseMatrix(markdown);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      caseId: 'ruby-range-core',
      legacySnapshot: 'yes',
      semanticTest: 'yes',
      visualTest: 'no',
      migrationState: 'sem-ready',
      owner: 'berlysia',
      lastVerifiedAt: '2026-02-15',
    });
  });

  it('parses all migration states', () => {
    const markdown = `## 移行対応表

| case_id | legacy_snapshot | semantic_test | visual_test | migration_state | owner | last_verified_at |
|---------|----------------|---------------|-------------|-----------------|-------|-----------------|
| a | yes | no | no | legacy-only | x | 2026-01-01 |
| b | yes | yes | no | sem-ready | x | 2026-01-01 |
| c | yes | yes | yes | dual | x | 2026-01-01 |
| d | no | yes | yes | migrated | x | 2026-01-01 |
`;

    const rows = parseMatrix(markdown);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.migrationState)).toEqual([
      'legacy-only',
      'sem-ready',
      'dual',
      'migrated',
    ]);
  });

  it('throws on invalid migration_state', () => {
    const markdown = `## 移行対応表

| case_id | legacy_snapshot | semantic_test | visual_test | migration_state | owner | last_verified_at |
|---------|----------------|---------------|-------------|-----------------|-------|-----------------|
| a | yes | no | no | invalid | x | 2026-01-01 |
`;

    expect(() => parseMatrix(markdown)).toThrow('migration_state');
  });

  it('throws on invalid yes/no value', () => {
    const markdown = `## 移行対応表

| case_id | legacy_snapshot | semantic_test | visual_test | migration_state | owner | last_verified_at |
|---------|----------------|---------------|-------------|-----------------|-------|-----------------|
| a | maybe | no | no | legacy-only | x | 2026-01-01 |
`;

    expect(() => parseMatrix(markdown)).toThrow('legacy_snapshot');
  });

  it('returns empty array for empty file', () => {
    const rows = parseMatrix('');
    expect(rows).toHaveLength(0);
  });

  it('ignores non-migration-table sections', () => {
    const markdown = `## Case ID マッピング

| case_id | semantic テスト |
|---------|----------------|
| ruby-range-core | something |

## 移行対応表

| case_id | legacy_snapshot | semantic_test | visual_test | migration_state | owner | last_verified_at |
|---------|----------------|---------------|-------------|-----------------|-------|-----------------|
| ruby-range-core | yes | yes | no | sem-ready | berlysia | 2026-02-15 |
`;

    const rows = parseMatrix(markdown);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.caseId).toBe('ruby-range-core');
  });
});
