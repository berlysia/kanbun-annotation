// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { render, generateCSS } from '../index.js';

describe('html-renderer does not depend on the DOM (K8)', () => {
  it('renders without document/DOMParser', () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined');
    const out = render({
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '甲' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [],
      readings: [],
    });
    expect(out.html).toContain('甲');
    expect(generateCSS()).toContain('skam');
  });
});
