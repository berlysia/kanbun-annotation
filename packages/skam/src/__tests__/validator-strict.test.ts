import { describe, it, expect } from 'vitest';
import { BLOCK_START_KAERI_HINT } from '../index.js';
import type { ValidationErrorKind } from '../index.js';

describe('BLOCK_START_KAERI kind and hint (K3)', () => {
  it('exports hint text mentioning the workaround', () => {
    expect(BLOCK_START_KAERI_HINT).toContain('前のブロックの最後の字の後');
  });
  it('kind union accepts BLOCK_START_KAERI (checked by typecheck)', () => {
    const k: ValidationErrorKind = 'BLOCK_START_KAERI';
    expect(k).toBe('BLOCK_START_KAERI');
  });
});
