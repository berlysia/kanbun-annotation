import { describe, it, expect } from 'vitest';
import { render } from '@kanbun/skam-html-renderer';
import { FIXTURES } from '../fixtures/test-documents.js';
import { LEGACY_CASE_IDS, type LegacyCaseId } from '../legacy-case-registry.js';

type RenderResult = {
  html: string;
  css: string;
};

const LEGACY_CASE_ASSERTIONS: Record<LegacyCaseId, (result: RenderResult) => void> = {
  'ruby-range-core': ({ html, css }) => {
    expect(html).toContain('skam-ruby-grid');
    expect(html).toContain('ろんご');
    expect(html).toContain('論');
    expect(html).toContain('語');
    expect(css).toContain('skam-ruby-grid');
  },
  'tateten-kaeri-split': ({ html, css }) => {
    expect(html).toContain('skam-tateten-group');
    expect(html).toContain('skam-tateten-sep');
    expect(html).toContain('㆑');
    expect(html).toContain('㆒');
    expect(css).toContain('skam-tateten-sep');
  },
  'highlight-ref-label': ({ html, css }) => {
    expect(html).toContain('skam-highlight');
    expect(html).toContain('skam-ref');
    expect(html).toContain('(1)');
    expect(css).toContain('skam-highlight');
  },
  'saidoku-two-stage': ({ html, css }) => {
    expect(html).toContain('skam-saidoku-grid');
    expect(html).toContain('いま');
    expect(html).toContain('ず');
    expect(css).toContain('skam-saidoku-grid');
  },
};

describe('legacy detector (temporary)', () => {
  for (const caseId of LEGACY_CASE_IDS) {
    it(`[legacy][case:${caseId}] keeps visible HTML/CSS anchors`, () => {
      const result = render(FIXTURES[caseId]);
      LEGACY_CASE_ASSERTIONS[caseId](result);
    });
  }
});
