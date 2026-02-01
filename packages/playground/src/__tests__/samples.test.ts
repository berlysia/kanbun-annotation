import { describe, it, expect } from 'vitest';
import { parse } from '@kanbun/skam-xml-parser';
import { SAMPLES } from '../samples';

describe('SAMPLES', () => {
  it.each(SAMPLES)('$name をパースできる', ({ name, xml }) => {
    expect(() => parse(xml)).not.toThrow();
    const doc = parse(xml);
    expect(doc).toBeDefined();
    expect(doc.tokens.length).toBeGreaterThan(0);
  });
});
