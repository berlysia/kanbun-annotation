/**
 * Legacy detector layer targets (temporary).
 *
 * These case IDs are expected to stay in sync with
 * docs/testing/no-test-gap-matrix.md rows where legacy_snapshot=yes.
 */
export const LEGACY_CASE_IDS = [
  'ruby-range-core',
  'tateten-kaeri-split',
  'highlight-ref-label',
  'saidoku-two-stage',
] as const;

export type LegacyCaseId = (typeof LEGACY_CASE_IDS)[number];
