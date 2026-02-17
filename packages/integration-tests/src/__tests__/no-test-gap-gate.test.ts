import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { readMatrix } from '../no-test-gap-matrix.js';
import type { MatrixRow } from '../no-test-gap-matrix.js';
import { LEGACY_CASE_IDS } from '../legacy-case-registry.js';

describe('No Test-Gap Gate', () => {
  const projectRoot = resolve(import.meta.dirname, '../../../..');
  const rows = readMatrix(projectRoot);

  it('matrix is not empty', () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it('all rows satisfy state invariant conditions', () => {
    for (const row of rows) {
      const label = `case_id="${row.caseId}" migration_state="${row.migrationState}"`;
      switch (row.migrationState) {
        case 'legacy-only':
          expect(row.legacySnapshot, `${label}: legacy_snapshot`).toBe('yes');
          expect(row.semanticTest, `${label}: semantic_test`).toBe('no');
          expect(row.visualTest, `${label}: visual_test`).toBe('no');
          break;
        case 'sem-ready':
          expect(row.legacySnapshot, `${label}: legacy_snapshot`).toBe('yes');
          expect(row.semanticTest, `${label}: semantic_test`).toBe('yes');
          expect(row.visualTest, `${label}: visual_test`).toBe('no');
          break;
        case 'dual':
          expect(row.legacySnapshot, `${label}: legacy_snapshot`).toBe('yes');
          expect(row.semanticTest, `${label}: semantic_test`).toBe('yes');
          expect(row.visualTest, `${label}: visual_test`).toBe('yes');
          break;
        case 'migrated':
          expect(row.legacySnapshot, `${label}: legacy_snapshot`).toBe('no');
          expect(row.semanticTest, `${label}: semantic_test`).toBe('yes');
          expect(row.visualTest, `${label}: visual_test`).toBe('yes');
          break;
        default: {
          const _exhaustive: never = row.migrationState;
          throw new Error(`Unknown migration_state: ${_exhaustive}`);
        }
      }
    }
  });

  it('all 4 required representative cases exist', () => {
    const requiredCases = [
      'ruby-range-core',
      'tateten-kaeri-split',
      'highlight-ref-label',
      'saidoku-two-stage',
    ];
    const caseIds = rows.map((r: MatrixRow) => r.caseId);
    for (const required of requiredCases) {
      expect(caseIds, `missing required case: ${required}`).toContain(required);
    }
  });

  it('legacy_snapshot=yes rows are covered by legacy detector registry', () => {
    const matrixLegacyCases = rows
      .filter((row) => row.legacySnapshot === 'yes')
      .map((row) => row.caseId)
      .sort();
    const registryCases = [...LEGACY_CASE_IDS].sort();

    expect(matrixLegacyCases).toEqual(registryCases);
  });

  it('owner is not empty', () => {
    for (const row of rows) {
      expect(row.owner, `case_id="${row.caseId}": owner is empty`).not.toBe('');
    }
  });

  it('last_verified_at is YYYY-MM-DD format', () => {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    for (const row of rows) {
      expect(
        row.lastVerifiedAt,
        `case_id="${row.caseId}": invalid date format "${row.lastVerifiedAt}"`
      ).toMatch(datePattern);
    }
  });
});
