import { describe, it, expect } from 'vitest';
import { resolveSpacingEm } from '../spacing.js';

describe('resolveSpacingEm', () => {
  it('returns 0 for undefined', () => {
    expect(resolveSpacingEm(undefined)).toBe(0);
  });

  it('returns 0 for "solid"', () => {
    expect(resolveSpacingEm('solid')).toBe(0);
  });

  it('returns 0.25 for "quarter"', () => {
    expect(resolveSpacingEm('quarter')).toBe(0.25);
  });

  it('returns 0.5 for "half"', () => {
    expect(resolveSpacingEm('half')).toBe(0.5);
  });

  it('returns the number for positive values', () => {
    expect(resolveSpacingEm(0.3)).toBe(0.3);
    expect(resolveSpacingEm(1)).toBe(1);
  });

  it('clamps negative numbers to 0', () => {
    expect(resolveSpacingEm(-0.5)).toBe(0);
    expect(resolveSpacingEm(-1)).toBe(0);
  });

  it('returns 0 for zero', () => {
    expect(resolveSpacingEm(0)).toBe(0);
  });
});
