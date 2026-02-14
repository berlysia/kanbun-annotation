import { describe, it, expect } from 'vitest';
import { getDefaultStyles } from '../index.js';

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
      expect(css).toContain('grid-template-areas: "okuri" "kutoten" "kaeri" "saidoku"');
    });
  });

  describe('ruby-grid', () => {
    it('should define ruby, suffix, base areas', () => {
      expect(css).toContain("grid-template-areas: 'ruby suffix' 'base .' '. .'");
    });
  });

  describe('ruby-grid--emphasis', () => {
    it('should define emphasis, ruby, suffix, base areas', () => {
      expect(css).toContain("grid-template-areas: 'emphasis .' 'ruby suffix' 'base .' '. .'");
    });
  });

  describe('ruby-grid--emphasis-no-ruby', () => {
    it('should define emphasis, base, suffix areas', () => {
      expect(css).toContain("grid-template-areas: 'emphasis .' 'base suffix' '. .'");
    });
  });

  describe('saidoku-grid', () => {
    it('should define ruby-over, base, ruby-under areas', () => {
      expect(css).toContain("grid-template-areas: 'ruby-over' 'base' 'ruby-under'");
    });
  });

  describe('saidoku-grid--emphasis', () => {
    it('should define emphasis, ruby-over, base, ruby-under areas', () => {
      expect(css).toContain("grid-template-areas: 'emphasis' 'ruby-over' 'base' 'ruby-under'");
    });
  });

  describe('tateten-sep', () => {
    it('should use named lines for grid-template-rows', () => {
      expect(css).toContain('[sep-spacer-start]');
      expect(css).toContain('[sep-tateten-start]');
      expect(css).toContain('[sep-kaeri-start]');
      expect(css).toContain('[sep-end]');
    });

    it('should reference named lines in child placement (no numeric grid-row)', () => {
      expect(css).toContain('grid-row: sep-spacer-start / sep-kaeri-start');
      expect(css).toContain('grid-row: sep-tateten-start / sep-end');
      expect(css).toContain('grid-row: sep-kaeri-start / span 2');
    });
  });
});
