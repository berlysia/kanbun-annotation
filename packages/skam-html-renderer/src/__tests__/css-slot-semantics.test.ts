import { describe, it } from 'vitest';
import { getDefaultStyles } from '../index.js';
import { expectCSSRule } from './helpers/css-contract.js';

/**
 * CSS slot semantics tests (ADR-020 Step 4)
 *
 * Verify that all 7 target containers use semantic area names or named lines
 * instead of numeric grid indices. This catches accidental renames or
 * structural changes that break the slot-based layout contract.
 */
describe('CSS slot semantics', () => {
  const css = getDefaultStyles({ rubyMethod: 'grid', useLayer: false });

  describe('suffix-row', () => {
    it('should define okuri, kutoten, kaeri, saidoku areas', () => {
      expectCSSRule(css, ':where(.skam-suffix-row)', [
        {
          property: 'grid-template-areas',
          value: /"okuri"\s+"kutoten"\s+"kaeri"\s+"saidoku"/,
        },
      ]);
    });
  });

  describe('ruby-grid', () => {
    it('should define ruby, suffix, base areas', () => {
      expectCSSRule(css, ':where(.skam-ruby-grid)', [
        {
          property: 'grid-template-areas',
          value: /'ruby suffix'\s+'base \.'\s+'\. \.'/,
        },
      ]);
    });
  });

  describe('ruby-grid--emphasis', () => {
    it('should define emphasis, ruby, suffix, base areas', () => {
      expectCSSRule(css, ':where(.skam-ruby-grid--emphasis)', [
        {
          property: 'grid-template-areas',
          value: /'emphasis \.'\s+'ruby suffix'\s+'base \.'\s+'\. \.'/,
        },
      ]);
    });
  });

  describe('ruby-grid--emphasis-no-ruby', () => {
    it('should define emphasis, base, suffix areas', () => {
      expectCSSRule(css, ':where(.skam-ruby-grid--emphasis-no-ruby)', [
        {
          property: 'grid-template-areas',
          value: /'emphasis \.'\s+'base suffix'\s+'\. \.'/,
        },
      ]);
    });
  });

  describe('saidoku-grid', () => {
    it('should define ruby-over, base, ruby-under areas', () => {
      expectCSSRule(css, ':where(.skam-saidoku-grid)', [
        {
          property: 'grid-template-areas',
          value: /'ruby-over'\s+'base'\s+'ruby-under'/,
        },
      ]);
    });
  });

  describe('saidoku-grid--emphasis', () => {
    it('should define emphasis, ruby-over, base, ruby-under areas', () => {
      expectCSSRule(css, ':where(.skam-saidoku-grid--emphasis)', [
        {
          property: 'grid-template-areas',
          value: /'emphasis'\s+'ruby-over'\s+'base'\s+'ruby-under'/,
        },
      ]);
    });
  });

  describe('tateten-sep', () => {
    it('should use named lines for grid-template-rows', () => {
      expectCSSRule(css, ':where(.skam-tateten-sep)', [
        {
          property: 'grid-template-rows',
          value: /\[sep-spacer-start\].*\[sep-tateten-start\].*\[sep-kaeri-start\].*\[sep-end\]/,
        },
      ]);
    });

    it('should reference named lines in child placement (no numeric grid-row)', () => {
      expectCSSRule(css, ':where(.skam-tateten-sep)::before', [
        { property: 'grid-row', value: 'sep-spacer-start / sep-kaeri-start' },
      ]);
      expectCSSRule(css, ':where(.skam-tateten-sep) > :where(.skam-tateten-mark)', [
        { property: 'grid-row', value: 'sep-tateten-start / sep-end' },
      ]);
      expectCSSRule(css, ':where(.skam-tateten-sep) > :where(.skam-kaeriten)', [
        { property: 'grid-row', value: 'sep-kaeri-start / span 2' },
      ]);
    });
  });
});
