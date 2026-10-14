import { describe, it, expect } from 'vitest';
import { formatStringifyLosses } from '../stringify-losses.js';

describe('formatStringifyLosses', () => {
  it('maps losses to error panel entries', () => {
    expect(
      formatStringifyLosses([
        {
          category: 'unsupported',
          code: 'PARTIAL_OVERLAP',
          path: '/marks/1',
          markId: 'h1',
          message: 'm',
        },
      ])
    ).toEqual([
      { message: 'XMLに変換できない注記があります (unsupported: PARTIAL_OVERLAP, /marks/1): m' },
    ]);
  });
});
