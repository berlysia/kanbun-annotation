import { describe, it, expect } from 'vitest';
import { parse } from '@kanbun-skam/skam-xml-parser';
import { SAMPLES } from '../samples';

describe('SAMPLES', () => {
  it.each(SAMPLES)('$name をパースできる', ({ xml }) => {
    expect(() => parse(xml)).not.toThrow();
    const doc = parse(xml);
    expect(doc).toBeDefined();
    expect(doc.tokens.length).toBeGreaterThan(0);
  });
});
