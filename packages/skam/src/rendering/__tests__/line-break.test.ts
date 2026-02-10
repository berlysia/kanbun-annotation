import { describe, it, expect } from 'vitest';
import { canBreakBefore } from '../line-break.js';

describe('canBreakBefore', () => {
  it('index === 0 → false（ブロック先頭改行禁止）', () => {
    expect(canBreakBefore(0, false)).toBe(false);
    expect(canBreakBefore(0, true)).toBe(false);
  });

  it('index === 1, hasBlockStartContent=true → false（blockStart 吸着）', () => {
    expect(canBreakBefore(1, true)).toBe(false);
  });

  it('index === 1, hasBlockStartContent=false → true', () => {
    expect(canBreakBefore(1, false)).toBe(true);
  });

  it('index >= 2, hasBlockStartContent=true → true', () => {
    expect(canBreakBefore(2, true)).toBe(true);
    expect(canBreakBefore(3, true)).toBe(true);
  });

  it('index >= 2, hasBlockStartContent=false → true', () => {
    expect(canBreakBefore(2, false)).toBe(true);
    expect(canBreakBefore(3, false)).toBe(true);
  });
});
