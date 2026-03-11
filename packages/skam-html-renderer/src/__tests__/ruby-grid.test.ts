import { describe, it, expect } from 'vitest';
import type { SKAMDocument } from '@kanbun-skam/skam';
import { render, renderHTML, generateCSS, getDefaultStyles } from '../index.js';
import { resolveEmphasisCharacter } from '@kanbun-skam/skam/rendering';
import { generateEmphasisMarks } from '../html-utils.js';
import {
  expectCSSContains,
  expectCSSSelector,
  expectNoCSSSelector,
} from './helpers/css-contract.js';

/**
 * Helper: create a minimal SKAMDocument
 */
function createDoc(overrides: Partial<SKAMDocument> = {}): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [{ id: 't1', text: '學' }],
    blocks: [],
    marks: [],
    readings: [],
    ...overrides,
  };
}

describe('rubyMethod: grid', () => {
  describe('renderTokenWithRuby - yomigana', () => {
    const doc = createDoc({
      tokens: [{ id: 't1', text: '學' }],
      marks: [
        {
          type: 'yomigana',
          anchor: { from: 't1', to: 't1' },
          value: 'まな',
        },
      ],
    });

    it('should use grid by default', () => {
      const result = render(doc);
      expect(result.html).toContain('skam-ruby-grid');
      expect(result.html).toContain('<span class="skam-ruby">まな</span>');
      expect(result.html).not.toContain('<ruby>');
    });

    it('should use ruby element when rubyMethod is ruby', () => {
      const result = render(doc, { rubyMethod: 'ruby' });
      expect(result.html).toContain('<ruby>');
      expect(result.html).toContain('<rt class="skam-ruby">まな</rt>');
      expect(result.html).not.toContain('skam-ruby-grid');
    });

    it('should use inline-grid when rubyMethod is grid', () => {
      const result = render(doc, { rubyMethod: 'grid' });
      expect(result.html).toContain('skam-ruby-grid');
      expect(result.html).toContain('<span class="skam-ruby">まな</span>');
      expect(result.html).toContain('<span class="skam-base">學</span>');
      expect(result.html).not.toContain('<ruby>');
      expect(result.html).not.toContain('<rt');
    });

    it('should preserve token text in grid mode', () => {
      const result = render(doc, { rubyMethod: 'grid' });
      expect(result.html).toContain('學');
      expect(result.html).toContain('まな');
    });
  });

  describe('renderTokenWithRuby - range yomigana', () => {
    const doc = createDoc({
      tokens: [
        { id: 't1', text: '論' },
        { id: 't2', text: '語' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [
        {
          type: 'yomigana',
          anchor: { from: 't1', to: 't2' },
          value: 'ろんご',
        },
      ],
    });

    it('should render range yomigana with grid by default', () => {
      const result = render(doc);
      expect(result.html).toContain('skam-ruby-grid');
      expect(result.html).toContain('ろんご');
      expect(result.html).not.toContain('<ruby>');
    });

    it('should render range yomigana with grid', () => {
      const result = render(doc, { rubyMethod: 'grid' });
      expect(result.html).toContain('skam-ruby-grid');
      expect(result.html).toContain('<span class="skam-ruby">ろんご</span>');
      expect(result.html).not.toContain('<ruby>');
    });

    it('should add data-token-from/to on grid container in interactive mode', () => {
      const result = render(doc, { rubyMethod: 'grid', interactive: true });
      expect(result.html).toMatch(/skam-ruby-grid[^>]*data-token-from="t1"/);
      expect(result.html).toMatch(/skam-ruby-grid[^>]*data-token-to="t2"/);
    });
  });

  describe('renderSaidokuToken', () => {
    const doc = createDoc({
      tokens: [{ id: 't1', text: '將' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [
        {
          type: 'saidoku',
          anchor: { from: 't1', to: 't1' },
          forms: [
            { n: 1, yomi: 'まさ', okuri: 'に' },
            { n: 2, yomi: '', okuri: 'す' },
          ],
        },
      ],
    });

    it('should use saidoku-grid by default', () => {
      const result = render(doc);
      expect(result.html).toContain('skam-saidoku-grid');
      expect(result.html).not.toContain('skam-saidoku-outer');
      expect(result.html).not.toContain('skam-saidoku-inner');
    });

    it('should use nested ruby when rubyMethod is ruby', () => {
      const result = render(doc, { rubyMethod: 'ruby' });
      expect(result.html).toContain('skam-saidoku-outer');
      expect(result.html).toContain('skam-saidoku-inner');
      expect(result.html).not.toContain('skam-saidoku-grid');
    });

    it('should use saidoku-grid in grid mode', () => {
      const result = render(doc, { rubyMethod: 'grid' });
      expect(result.html).toContain('skam-saidoku-grid');
      expect(result.html).not.toContain('skam-saidoku-outer');
      expect(result.html).not.toContain('skam-saidoku-inner');
      // 3行フラットグリッド: ruby(over), base, ruby(under)
      expect(result.html).toContain('<span class="skam-ruby" data-saidoku-n="1">まさ</span>');
      expect(result.html).toContain('<span class="skam-base"');
      expect(result.html).toContain('skam-saidoku-under');
    });

    it('should render saidoku with single form as ruby-grid', () => {
      const singleFormDoc = createDoc({
        tokens: [{ id: 't1', text: '將' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [
          {
            type: 'saidoku',
            anchor: { from: 't1', to: 't1' },
            forms: [{ n: 1, yomi: 'まさ' }],
          },
        ],
      });
      const result = render(singleFormDoc, { rubyMethod: 'grid' });
      expect(result.html).toContain('skam-ruby-grid');
      expect(result.html).not.toContain('skam-saidoku-grid');
    });
  });

  describe('renderTatetenGroup + yomigana', () => {
    const doc = createDoc({
      tokens: [
        { id: 't1', text: '天' },
        { id: 't2', text: '下' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [
        {
          type: 'tateten',
          anchor: { from: 't1', to: 't2' },
        },
        {
          type: 'yomigana',
          anchor: { from: 't1', to: 't2' },
          value: 'てんか',
        },
      ],
    });

    it('should wrap tateten group with grid by default', () => {
      const result = render(doc);
      expect(result.html).toContain('skam-ruby-grid');
      expect(result.html).toContain('skam-tateten-group');
      expect(result.html).toContain('てんか');
      expect(result.html).not.toContain('<ruby');
    });

    it('should wrap tateten group with ruby-grid in grid mode', () => {
      const result = render(doc, { rubyMethod: 'grid' });
      expect(result.html).toContain('skam-ruby-grid');
      expect(result.html).toContain('skam-tateten-group');
      expect(result.html).toContain('<span class="skam-ruby">てんか</span>');
      expect(result.html).not.toContain('<ruby');
    });
  });

  describe('renderTatetenGroup + yomigana + emphasis', () => {
    const doc = createDoc({
      tokens: [
        { id: 't1', text: '天' },
        { id: 't2', text: '下' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [
        {
          type: 'tateten',
          anchor: { from: 't1', to: 't2' },
        },
        {
          type: 'yomigana',
          anchor: { from: 't1', to: 't2' },
          value: 'てんか',
        },
        {
          type: 'emphasis',
          anchor: { from: 't1', to: 't2' },
          style: 'filled dot',
        },
      ],
    });

    it('default (grid) mode: emphasis-row in grid', () => {
      const result = render(doc);
      expect(result.html).toContain('skam-ruby-grid--emphasis');
      expect(result.html).toContain('skam-emphasis-row');
      // individual tokens should not have emphasis
      expect(result.html).not.toMatch(/skam-token skam-emphasis/);
    });

    it('ruby mode: emphasis wraps ruby from outside', () => {
      const result = render(doc, { rubyMethod: 'ruby' });
      expect(result.html).toMatch(/skam-emphasis.*<ruby/s);
      // individual tokens should not have emphasis
      expect(result.html).not.toMatch(/skam-token skam-emphasis/);
    });

    it('grid mode: emphasis-row in grid, no emphasis on individual tokens', () => {
      const result = render(doc, { rubyMethod: 'grid' });
      expect(result.html).toContain('skam-ruby-grid--emphasis');
      expect(result.html).toContain('てんか');
      // emphasis-row should contain direct emphasis marks with spacer between tokens
      expect(result.html).toContain('skam-emphasis-row');
      // filled dot → U+2022 (•), one per character, with spacer between token groups
      expect(result.html).toMatch(
        /skam-emphasis-row[^>]*>\u2022<span class="skam-emphasis-spacer"><\/span>\u2022/
      );
      // no inline text-emphasis-style on emphasis-row (marks are direct characters)
      expect(result.html).not.toMatch(/skam-emphasis-row[^>]*text-emphasis-style/);
      // individual tokens should NOT have emphasis class
      expect(result.html).not.toMatch(/skam-token skam-emphasis/);
      // no group-level emphasis wrapper outside the grid
      expect(result.html).not.toMatch(/skam-emphasis[^"]*>[\s]*<span class="skam-ruby-grid/s);
    });
  });

  describe('emphasis-row: single token + yomigana + emphasis', () => {
    const doc = createDoc({
      tokens: [{ id: 't1', text: '學' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [
        {
          type: 'yomigana',
          anchor: { from: 't1', to: 't1' },
          value: 'まな',
        },
        {
          type: 'emphasis',
          anchor: { from: 't1', to: 't1' },
          style: 'filled sesame',
        },
      ],
    });

    it('grid: should have emphasis-row with sesame mark, token should not have emphasis class', () => {
      const result = render(doc, { rubyMethod: 'grid' });
      expect(result.html).toContain('skam-ruby-grid--emphasis');
      expect(result.html).toContain('skam-emphasis-row');
      // filled sesame → U+FE45 (﹅)
      expect(result.html).toContain('\uFE45');
      expect(result.html).not.toMatch(/skam-token skam-emphasis/);
    });

    it('ruby: backward compatible - emphasis on token, no emphasis-row', () => {
      const result = render(doc, { rubyMethod: 'ruby' });
      expect(result.html).toMatch(/skam-token skam-emphasis/);
      expect(result.html).not.toContain('skam-emphasis-row');
      expect(result.html).not.toContain('skam-ruby-grid--emphasis');
    });
  });

  describe('emphasis-row: single token + emphasis only (no yomigana)', () => {
    const doc = createDoc({
      tokens: [{ id: 't1', text: '學' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [
        {
          type: 'emphasis',
          anchor: { from: 't1', to: 't1' },
          style: 'filled dot',
        },
      ],
    });

    it('grid: no emphasis-row, emphasis on token directly', () => {
      const result = render(doc, { rubyMethod: 'grid' });
      expect(result.html).not.toContain('skam-emphasis-row');
      expect(result.html).not.toContain('skam-ruby-grid--emphasis');
      expect(result.html).toMatch(/skam-token skam-emphasis/);
    });
  });

  describe('emphasis-row: saidoku (2-form) + emphasis', () => {
    const doc = createDoc({
      tokens: [{ id: 't1', text: '將' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [
        {
          type: 'saidoku',
          anchor: { from: 't1', to: 't1' },
          forms: [
            { n: 1, yomi: 'まさ', okuri: 'に' },
            { n: 2, yomi: '', okuri: 'す' },
          ],
        },
        {
          type: 'emphasis',
          anchor: { from: 't1', to: 't1' },
          style: 'filled dot',
        },
      ],
    });

    it('grid: should use saidoku-grid--emphasis with emphasis-row', () => {
      const result = render(doc, { rubyMethod: 'grid' });
      expect(result.html).toContain('skam-saidoku-grid--emphasis');
      expect(result.html).toContain('skam-emphasis-row');
      // filled dot → U+2022 (•)
      expect(result.html).toContain('\u2022');
      // token should not have emphasis class (handled by emphasis-row)
      expect(result.html).not.toMatch(/skam-token skam-emphasis/);
    });
  });

  describe('emphasis-row: saidoku (1-form) + emphasis', () => {
    const doc = createDoc({
      tokens: [{ id: 't1', text: '將' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [
        {
          type: 'saidoku',
          anchor: { from: 't1', to: 't1' },
          forms: [{ n: 1, yomi: 'まさ' }],
        },
        {
          type: 'emphasis',
          anchor: { from: 't1', to: 't1' },
          style: 'filled dot',
        },
      ],
    });

    it('grid: should use ruby-grid--emphasis with emphasis-row', () => {
      const result = render(doc, { rubyMethod: 'grid' });
      expect(result.html).toContain('skam-ruby-grid--emphasis');
      expect(result.html).not.toContain('skam-saidoku-grid--emphasis');
      expect(result.html).toContain('skam-emphasis-row');
    });
  });

  describe('emphasis-row: tateten + emphasis only (no yomigana)', () => {
    const doc = createDoc({
      tokens: [
        { id: 't1', text: '天' },
        { id: 't2', text: '下' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [
        {
          type: 'tateten',
          anchor: { from: 't1', to: 't2' },
        },
        {
          type: 'emphasis',
          anchor: { from: 't1', to: 't2' },
          style: 'filled dot',
        },
      ],
    });

    it('grid: no emphasis-row, emphasis on individual tokens', () => {
      const result = render(doc, { rubyMethod: 'grid' });
      expect(result.html).not.toContain('skam-emphasis-row');
      expect(result.html).not.toContain('skam-ruby-grid--emphasis');
      expect(result.html).toMatch(/skam-token skam-emphasis/);
    });
  });

  describe('CSS generation', () => {
    it('should include grid CSS by default', () => {
      const css = generateCSS();
      expectCSSSelector(css, ':where(.skam-ruby-grid)');
      expectCSSSelector(css, ':where(.skam-saidoku-grid)');
      expectNoCSSSelector(css, ':where(.skam-token ruby)');
      expectNoCSSSelector(css, ':where(.skam-saidoku-outer)');
    });

    it('should include ruby CSS when rubyMethod is ruby', () => {
      const css = generateCSS({ rubyMethod: 'ruby' });
      expectCSSSelector(css, ':where(.skam-token ruby)');
      expectCSSContains(css, 'ruby-align');
      expectNoCSSSelector(css, ':where(.skam-ruby-grid)');
    });

    it('should include grid CSS when rubyMethod is grid', () => {
      const css = generateCSS({ rubyMethod: 'grid' });
      expectCSSSelector(css, ':where(.skam-ruby-grid)');
      expectCSSSelector(css, ':where(.skam-saidoku-grid)');
      expectNoCSSSelector(css, ':where(.skam-token ruby)');
      expectNoCSSSelector(css, ':where(.skam-saidoku-outer)');
    });

    it('should include emphasis variant CSS when rubyMethod is grid', () => {
      const css = generateCSS({ rubyMethod: 'grid' });
      expectCSSSelector(css, ':where(.skam-ruby-grid--emphasis)');
      expectCSSSelector(css, ':where(.skam-saidoku-grid--emphasis)');
      expectCSSSelector(css, ':where(.skam-emphasis-row)');
    });

    it('should include both CSS when rubyMethod is both', () => {
      const css = generateCSS({ rubyMethod: 'both' });
      expectCSSSelector(css, ':where(.skam-token ruby)');
      expectCSSSelector(css, ':where(.skam-ruby-grid)');
      expectCSSSelector(css, ':where(.skam-saidoku-grid)');
      expectCSSSelector(css, ':where(.skam-saidoku-outer)');
    });

    it('should include grid CSS via getDefaultStyles', () => {
      const css = getDefaultStyles({ rubyMethod: 'grid' });
      expectCSSSelector(css, ':where(.skam-ruby-grid)');
    });
  });

  describe('renderHTML with grid', () => {
    it('should render HTML with grid mode', () => {
      const doc = createDoc({
        marks: [
          {
            type: 'yomigana',
            anchor: { from: 't1', to: 't1' },
            value: 'まな',
          },
        ],
      });
      const html = renderHTML(doc, { rubyMethod: 'grid' });
      expect(html).toContain('skam-ruby-grid');
      expect(html).not.toContain('<ruby>');
    });
  });

  describe('backward compatibility', () => {
    it('should use grid when rubyMethod is not specified', () => {
      const doc = createDoc({
        marks: [
          {
            type: 'yomigana',
            anchor: { from: 't1', to: 't1' },
            value: 'まな',
          },
        ],
      });
      const withoutOption = render(doc);
      const withGridOption = render(doc, { rubyMethod: 'grid' });
      expect(withoutOption.html).toBe(withGridOption.html);
    });
  });

  describe('horizontal writing mode + grid', () => {
    it('should generate grid CSS for horizontal mode', () => {
      const css = generateCSS({ writingMode: 'horizontal', rubyMethod: 'grid' });
      expectCSSSelector(css, ':where(.skam-ruby-grid)');
      expectCSSContains(css, 'grid-template-rows');
    });

    it('should render grid HTML in horizontal mode', () => {
      const doc = createDoc({
        marks: [
          {
            type: 'yomigana',
            anchor: { from: 't1', to: 't1' },
            value: 'まな',
          },
        ],
      });
      const result = render(doc, { writingMode: 'horizontal', rubyMethod: 'grid' });
      expect(result.html).toContain('skam-ruby-grid');
      expectCSSContains(result.css, 'grid-template-rows');
    });
  });
});

describe('resolveEmphasisCharacter', () => {
  it('filled dot → U+2022', () => {
    expect(resolveEmphasisCharacter('filled dot')).toBe('\u2022');
  });

  it('open dot → U+25E6', () => {
    expect(resolveEmphasisCharacter('open dot')).toBe('\u25E6');
  });

  it('filled sesame → U+FE45', () => {
    expect(resolveEmphasisCharacter('filled sesame')).toBe('\uFE45');
  });

  it('open sesame → U+FE46', () => {
    expect(resolveEmphasisCharacter('open sesame')).toBe('\uFE46');
  });

  it('filled circle → U+25CF', () => {
    expect(resolveEmphasisCharacter('filled circle')).toBe('\u25CF');
  });

  it('open circle → U+25CB', () => {
    expect(resolveEmphasisCharacter('open circle')).toBe('\u25CB');
  });

  it('filled double-circle → U+25C9', () => {
    expect(resolveEmphasisCharacter('filled double-circle')).toBe('\u25C9');
  });

  it('filled triangle → U+25B2', () => {
    expect(resolveEmphasisCharacter('filled triangle')).toBe('\u25B2');
  });

  it('dot (default filled) → U+2022', () => {
    expect(resolveEmphasisCharacter('dot')).toBe('\u2022');
  });
});

describe('generateEmphasisMarks', () => {
  it('generates one mark per character', () => {
    expect(generateEmphasisMarks('學', '\u2022')).toBe('\u2022');
    expect(generateEmphasisMarks('天下', '\u2022')).toBe('\u2022\u2022');
    expect(generateEmphasisMarks('論語', '\uFE45')).toBe('\uFE45\uFE45');
  });
});
