import { describe, it, expect } from 'vitest';
import type { SKAMDocument } from '@kanbun/skam';
import { render, PROFILES, getDefaultStyles } from '../index.js';

describe('render', () => {
  describe('basic token rendering', () => {
    it('should render a simple token', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [],
        readings: [],
      };

      const result = render(doc);

      expect(result.html).toContain('skam-document');
      expect(result.html).toContain('skam-display');
      expect(result.html).toContain('data-token-id="t1"');
      expect(result.html).toContain('學');
    });

    it('should render multiple tokens', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [
          { id: 't1', text: '學' },
          { id: 't2', text: '而' },
          { id: 't3', text: '時' },
        ],
        marks: [],
        readings: [],
      };

      const result = render(doc);

      expect(result.html).toContain('data-token-id="t1"');
      expect(result.html).toContain('data-token-id="t2"');
      expect(result.html).toContain('data-token-id="t3"');
    });
  });

  describe('yomigana and okurigana', () => {
    it('should render yomigana with ruby element', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [
          {
            type: 'yomigana',
            anchor: { from: 't1', to: 't1' },
            value: 'まな',
          },
        ],
        readings: [],
      };

      const result = render(doc);

      expect(result.html).toContain('<ruby>');
      expect(result.html).toContain('<rb class="skam-base">學</rb>');
      expect(result.html).toContain('skam-ruby');
      expect(result.html).toContain('まな');
    });

    it('should render okurigana within ruby element', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [
          {
            type: 'yomigana',
            anchor: { from: 't1', to: 't1' },
            value: 'まな',
          },
          {
            type: 'okurigana',
            anchor: { from: 't1', to: 't1' },
            value: 'びて',
          },
        ],
        readings: [],
      };

      const result = render(doc);

      expect(result.html).toContain('skam-okuri');
      expect(result.html).toContain('びて');
      // Yomigana should be in rt, okurigana should be in suffix-right (within suffix-row grid)
      expect(result.html).toMatch(/<rt class="skam-ruby">まな<\/rt>/);
      expect(result.html).toContain('skam-suffix-right');
    });

    it('should render soegana in suffix-right container', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '之' }],
        marks: [
          {
            type: 'soegana',
            anchor: { from: 't1', to: 't1' },
            value: 'を',
          },
        ],
        readings: [],
      };

      const result = render(doc);

      expect(result.html).toContain('skam-soegana');
      expect(result.html).toContain('を');
      expect(result.html).toContain('skam-suffix-right');
      // No ruby element when only soegana is present
      expect(result.html).not.toContain('<ruby>');
    });

    it('should not create ruby element when only okurigana is present', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '習' }],
        marks: [
          {
            type: 'okurigana',
            anchor: { from: 't1', to: 't1' },
            value: 'ふ',
          },
        ],
        readings: [],
      };

      const result = render(doc);

      // No ruby element when only okurigana is present
      expect(result.html).not.toContain('<ruby>');
      expect(result.html).toContain('skam-okuri');
      expect(result.html).toContain('ふ');
      expect(result.html).toContain('skam-suffix-right');
    });
  });

  describe('kaeriten', () => {
    it('should render kaeriten with Unicode character', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '習' }],
        marks: [
          {
            type: 'kaeri',
            anchor: { from: 't1', to: 't1' },
            value: 'レ',
          },
        ],
        readings: [],
      };

      const result = render(doc);

      expect(result.html).toContain('skam-kaeriten');
      expect(result.html).toContain('\u3191'); // Unicode for レ
      expect(result.html).toContain('aria-hidden="true"');
    });

    it('should render numbered kaeriten', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [
          { id: 't1', text: '有' },
          { id: 't2', text: '朋' },
        ],
        marks: [
          {
            type: 'kaeri',
            anchor: { from: 't1', to: 't1' },
            value: '二',
          },
          {
            type: 'kaeri',
            anchor: { from: 't2', to: 't2' },
            value: '一',
          },
        ],
        readings: [],
      };

      const result = render(doc);

      expect(result.html).toContain('\u3193'); // 二
      expect(result.html).toContain('\u3192'); // 一
    });
  });

  describe('kutoten', () => {
    it('should render kutoten', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '乎' }],
        marks: [
          {
            type: 'kutoten',
            anchor: { from: 't1', to: 't1' },
            value: '。',
          },
        ],
        readings: [],
      };

      const result = render(doc);

      expect(result.html).toContain('skam-kutoten');
      expect(result.html).toContain('。');
    });
  });

  describe('saidoku', () => {
    it('should render saidoku with multiple readings', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '將' }],
        marks: [
          {
            type: 'saidoku',
            anchor: { from: 't1', to: 't1' },
            forms: [
              { n: 1, yomi: 'まさ', okuri: 'に' },
              { n: 2, okuri: 'す' },
            ],
          },
        ],
        readings: [],
      };

      const result = render(doc);

      expect(result.html).toContain('skam-saidoku');
      expect(result.html).toContain('data-saidoku-n="1"');
      expect(result.html).toContain('data-saidoku-n="2"');
      expect(result.html).toContain('まさ');
      expect(result.html).toContain('skam-saidoku-under');
    });

    it('should render saidoku with nested ruby (double ruby)', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '將' }],
        marks: [
          {
            type: 'saidoku',
            anchor: { from: 't1', to: 't1' },
            forms: [
              { n: 1, yomi: 'まさ', okuri: 'に' },
              { n: 2, okuri: 'す' },
            ],
          },
        ],
        readings: [],
      };

      const result = render(doc);

      // First reading yomi should be in inner ruby's rt element (without okuri)
      expect(result.html).toMatch(/<rt class="skam-ruby" data-saidoku-n="1">まさ<\/rt>/);
      // Second reading should be in outer ruby's rt element with saidoku-under class (yomi only)
      expect(result.html).toMatch(
        /<rt class="skam-ruby skam-saidoku-under" data-saidoku-n="2"><\/rt>/
      );
      // First reading okuri should be in suffix-right (right column of suffix-row)
      expect(result.html).toMatch(
        /<span class="skam-suffix-right"><span class="skam-okuri" data-saidoku-n="1">に<\/span><\/span>/
      );
      // Second reading okuri should be in suffix-left (left column of suffix-row)
      expect(result.html).toMatch(
        /<span class="skam-suffix-left"><span class="skam-okuri" data-saidoku-n="2">す<\/span><\/span>/
      );
      // Both okuri should be in suffix-row structure
      expect(result.html).toMatch(/<span class="skam-suffix-row">/);
      // Should have nested ruby structure with inner and outer ruby classes
      expect(result.html).toMatch(
        /<ruby class="skam-saidoku-outer"><ruby class="skam-saidoku-inner">.*<\/ruby><rt/
      );
    });
  });

  describe('okototen', () => {
    it('should render okototen with position', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '國' }],
        marks: [
          {
            type: 'okototen',
            anchor: { from: 't1', to: 't1' },
            position: { system: 'glyph-grid', grid: '5x5', x: 4, y: 4 },
            shape: 'dot',
          },
        ],
        readings: [],
      };

      const result = render(doc);

      expect(result.html).toContain('skam-has-okototen');
      expect(result.html).toContain('skam-okototen');
      expect(result.html).toContain('data-shape="dot"');
      expect(result.html).toContain('--okototen-x: 4');
      expect(result.html).toContain('--okototen-y: 4');
      expect(result.html).toContain('--okototen-grid: 5');
    });
  });

  describe('tateten', () => {
    it('should group tokens with tateten mark', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [
          { id: 't1', text: '朝' },
          { id: 't2', text: '聞' },
        ],
        marks: [
          {
            type: 'tateten',
            anchor: { from: 't1', to: 't2' },
          },
        ],
        readings: [],
      };

      const result = render(doc);

      expect(result.html).toContain('skam-tateten-group');
      expect(result.html).toContain('skam-tateten-mark');
    });
  });

  describe('emphasis', () => {
    it('should add emphasis class to token', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '道' }],
        marks: [
          {
            type: 'emphasis',
            anchor: { from: 't1', to: 't1' },
          },
        ],
        readings: [],
      };

      const result = render(doc);

      expect(result.html).toContain('skam-emphasis');
    });
  });

  describe('notes', () => {
    it('should render notes section', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [
          {
            type: 'note',
            anchor: { from: 't1', to: 't1' },
            value: '學問の意。',
          },
        ],
        readings: [],
      };

      const result = render(doc);

      expect(result.html).toContain('skam-notes');
      expect(result.html).toContain('skam-note-item');
      expect(result.html).toContain('學問の意。');
    });
  });

  describe('reading layer', () => {
    it('should include reading layer with yomiage text', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [],
        readings: [{ kind: 'yomiage', text: '学びて時に之を習ふ' }],
      };

      const result = render(doc);

      expect(result.html).toContain('skam-reading');
      expect(result.html).toContain('aria-label="読み上げテキスト"');
      expect(result.html).toContain('学びて時に之を習ふ');
    });

    it('should use kakikudashi if yomiage is not available', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [],
        readings: [{ kind: 'kakikudashi', text: '學びて時に之を習ふ' }],
      };

      const result = render(doc);

      expect(result.html).toContain('學びて時に之を習ふ');
    });

    it('should not include reading layer when disabled', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [],
        readings: [{ kind: 'yomiage', text: '学びて' }],
      };

      const result = render(doc, { includeReadingLayer: false });

      expect(result.html).not.toContain('skam-reading');
    });
  });

  describe('profiles', () => {
    it('should hide yomigana in learningBasic profile', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [
          {
            type: 'yomigana',
            anchor: { from: 't1', to: 't1' },
            value: 'まな',
          },
          {
            type: 'kaeri',
            anchor: { from: 't1', to: 't1' },
            value: 'レ',
          },
        ],
        readings: [],
      };

      const result = render(doc, { profile: PROFILES.learningBasic });

      expect(result.html).not.toContain('まな');
      expect(result.html).toContain('\u3191'); // kaeriten still visible
    });

    it('should show okurigana in learningHint profile', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [
          {
            type: 'yomigana',
            anchor: { from: 't1', to: 't1' },
            value: 'まな',
          },
          {
            type: 'okurigana',
            anchor: { from: 't1', to: 't1' },
            value: 'びて',
          },
        ],
        readings: [],
      };

      const result = render(doc, { profile: PROFILES.learningHint });

      expect(result.html).not.toContain('まな'); // yomigana hidden
      expect(result.html).toContain('びて'); // okurigana visible
    });
  });

  describe('options', () => {
    it('should use custom class prefix', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [],
        readings: [],
      };

      const result = render(doc, { classPrefix: 'kb' });

      expect(result.html).toContain('kb-document');
      expect(result.html).toContain('kb-display');
      expect(result.html).toContain('kb-token');
    });

    it('should set writing mode attribute', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [],
        readings: [],
      };

      const verticalResult = render(doc, { writingMode: 'vertical' });
      const horizontalResult = render(doc, { writingMode: 'horizontal' });

      expect(verticalResult.html).toContain('data-writing-mode="vertical"');
      expect(horizontalResult.html).toContain('data-writing-mode="horizontal"');
    });
  });

  describe('CSS output', () => {
    it('should include CSS in result', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [],
        readings: [],
      };

      const result = render(doc);

      expect(result.css).toContain('.skam-document');
      expect(result.css).toContain('.skam-token');
      expect(result.css).toContain('writing-mode: vertical-rl');
    });
  });

  describe('HTML escaping', () => {
    it('should escape special characters in token text', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '<script>' }],
        marks: [],
        readings: [],
      };

      const result = render(doc);

      expect(result.html).not.toContain('<script>');
      expect(result.html).toContain('&lt;script&gt;');
    });

    it('should escape special characters in mark values', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        marks: [
          {
            type: 'note',
            anchor: { from: 't1', to: 't1' },
            value: '<b>test</b>',
          },
        ],
        readings: [],
      };

      const result = render(doc);

      expect(result.html).not.toContain('<b>');
      expect(result.html).toContain('&lt;b&gt;');
    });
  });
});

describe('getDefaultStyles', () => {
  it('should generate vertical CSS by default', () => {
    const css = getDefaultStyles();

    expect(css).toContain('writing-mode: vertical-rl');
    expect(css).toContain('.skam-document');
  });

  it('should generate horizontal CSS when specified', () => {
    const css = getDefaultStyles({ writingMode: 'horizontal' });

    expect(css).not.toContain('writing-mode: vertical-rl');
  });

  it('should use custom class prefix', () => {
    const css = getDefaultStyles({ classPrefix: 'kb' });

    expect(css).toContain('.kb-document');
    expect(css).toContain('.kb-token');
    expect(css).not.toContain('.skam-');
  });
});

describe('underline', () => {
  it('should render underline mark', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '重' },
        { id: 't2', text: '要' },
      ],
      marks: [
        {
          type: 'underline',
          anchor: { from: 't1', to: 't2' },
        },
      ],
      readings: [],
    };

    const result = render(doc);

    expect(result.html).toContain('skam-underline');
    expect(result.html).toContain('data-style="solid"');
  });

  it('should render underline with style', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '波' },
        { id: 't2', text: '線' },
      ],
      marks: [
        {
          type: 'underline',
          anchor: { from: 't1', to: 't2' },
          style: 'wavy',
        },
      ],
      readings: [],
    };

    const result = render(doc);

    expect(result.html).toContain('skam-underline');
    expect(result.html).toContain('data-style="wavy"');
  });

  it('should not render underline when profile.underline is false', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '重' },
        { id: 't2', text: '要' },
      ],
      marks: [
        {
          type: 'underline',
          anchor: { from: 't1', to: 't2' },
        },
      ],
      readings: [],
    };

    const result = render(doc, { profile: { underline: false } });

    expect(result.html).not.toContain('skam-underline');
  });
});

describe('label', () => {
  it('should render label with value', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '語' }],
      marks: [
        {
          type: 'label',
          anchor: { from: 't1', to: 't1' },
          value: '(A)',
        },
      ],
      readings: [],
    };

    const result = render(doc);

    expect(result.html).toContain('skam-label');
    expect(result.html).toContain('(A)');
  });

  it('should render label with format', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '一' },
        { id: 't2', text: '二' },
      ],
      marks: [
        {
          type: 'label',
          anchor: { from: 't1', to: 't1' },
          format: 'alpha-upper',
        },
        {
          type: 'label',
          anchor: { from: 't2', to: 't2' },
          format: 'alpha-upper',
        },
      ],
      readings: [],
    };

    const result = render(doc);

    expect(result.html).toContain('(A)');
    expect(result.html).toContain('(B)');
    expect(result.html).toContain('data-format="alpha-upper"');
  });

  it('should render label with iroha format', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '一' },
        { id: 't2', text: '二' },
        { id: 't3', text: '三' },
      ],
      marks: [
        {
          type: 'label',
          anchor: { from: 't1', to: 't1' },
          format: 'iroha',
        },
        {
          type: 'label',
          anchor: { from: 't2', to: 't2' },
          format: 'iroha',
        },
        {
          type: 'label',
          anchor: { from: 't3', to: 't3' },
          format: 'iroha',
        },
      ],
      readings: [],
    };

    const result = render(doc);

    expect(result.html).toContain('(イ)');
    expect(result.html).toContain('(ロ)');
    expect(result.html).toContain('(ハ)');
  });

  it('should render label with circled format', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '一' },
        { id: 't2', text: '二' },
      ],
      marks: [
        {
          type: 'label',
          anchor: { from: 't1', to: 't1' },
          format: 'circled',
        },
        {
          type: 'label',
          anchor: { from: 't2', to: 't2' },
          format: 'circled',
        },
      ],
      readings: [],
    };

    const result = render(doc);

    expect(result.html).toContain('①');
    expect(result.html).toContain('②');
  });

  it('should reuse same index for same value', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '一' },
        { id: 't2', text: '二' },
        { id: 't3', text: '三' },
      ],
      marks: [
        {
          type: 'label',
          anchor: { from: 't1', to: 't1' },
          value: 'x',
          format: 'alpha-upper',
        },
        {
          type: 'label',
          anchor: { from: 't2', to: 't2' },
          value: 'y',
          format: 'alpha-upper',
        },
        {
          type: 'label',
          anchor: { from: 't3', to: 't3' },
          value: 'x',
          format: 'alpha-upper',
        },
      ],
      readings: [],
    };

    const result = render(doc);

    // First and third should have same label (A), second should have (B)
    const matches = result.html.match(/\(A\)/g);
    expect(matches).toHaveLength(2);
  });

  it('should not render label when profile.label is false', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '語' }],
      marks: [
        {
          type: 'label',
          anchor: { from: 't1', to: 't1' },
          value: '(A)',
        },
      ],
      readings: [],
    };

    const result = render(doc, { profile: { label: false } });

    expect(result.html).not.toContain('skam-label');
    expect(result.html).not.toContain('(A)');
  });
});

describe('PROFILES', () => {
  it('should have full profile with all elements enabled', () => {
    expect(PROFILES.full.yomigana).toBe(true);
    expect(PROFILES.full.okurigana).toBe(true);
    expect(PROFILES.full.kaeriten).toBe(true);
    expect(PROFILES.full.saidoku).toBe(true);
    expect(PROFILES.full.okototen).toBe(true);
    expect(PROFILES.full.tateten).toBe(true);
    expect(PROFILES.full.emphasis).toBe(true);
    expect(PROFILES.full.notes).toBe(true);
    expect(PROFILES.full.okimoji).toBe(true);
    expect(PROFILES.full.joji).toBe(true);
    expect(PROFILES.full.soegana).toBe(true);
    expect(PROFILES.full.underline).toBe(true);
    expect(PROFILES.full.label).toBe(true);
  });

  it('should have learningBasic profile with minimal elements', () => {
    expect(PROFILES.learningBasic.yomigana).toBe(false);
    expect(PROFILES.learningBasic.okurigana).toBe(false);
    expect(PROFILES.learningBasic.kaeriten).toBe(true);
    expect(PROFILES.learningBasic.kutoten).toBe(true);
    expect(PROFILES.learningBasic.underline).toBe(true);
    expect(PROFILES.learningBasic.label).toBe(true);
  });

  it('should have learningHint profile with helpful elements', () => {
    expect(PROFILES.learningHint.yomigana).toBe(false);
    expect(PROFILES.learningHint.okurigana).toBe(true);
    expect(PROFILES.learningHint.kaeriten).toBe(true);
    expect(PROFILES.learningHint.soegana).toBe(true);
    expect(PROFILES.learningHint.underline).toBe(true);
    expect(PROFILES.learningHint.label).toBe(true);
  });
});

describe('「學而時習之」sample rendering', () => {
  it('should render the classic example correctly', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '學' },
        { id: 't2', text: '而' },
        { id: 't3', text: '時' },
        { id: 't4', text: '習' },
        { id: 't5', text: '之' },
      ],
      marks: [
        { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まな' },
        { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'びて' },
        { type: 'yomigana', anchor: { from: 't3', to: 't3' }, value: 'とき' },
        { type: 'okurigana', anchor: { from: 't3', to: 't3' }, value: 'に' },
        { type: 'soegana', anchor: { from: 't5', to: 't5' }, value: 'を' },
        { type: 'kaeri', anchor: { from: 't4', to: 't4' }, value: 'レ' },
        { type: 'yomigana', anchor: { from: 't4', to: 't4' }, value: 'なら' },
        { type: 'okurigana', anchor: { from: 't4', to: 't4' }, value: 'ふ' },
      ],
      readings: [{ kind: 'kakikudashi', text: '学びて時に之を習ふ' }],
    };

    const result = render(doc);

    // Check structure
    expect(result.html).toContain('skam-document');
    expect(result.html).toContain('lang="ja"');
    expect(result.html).toContain('data-writing-mode="vertical"');

    // Check tokens
    expect(result.html).toContain('學');
    expect(result.html).toContain('而');
    expect(result.html).toContain('時');
    expect(result.html).toContain('習');
    expect(result.html).toContain('之');

    // Check yomigana
    expect(result.html).toContain('まな');
    expect(result.html).toContain('とき');
    expect(result.html).toContain('なら');

    // Check okurigana
    expect(result.html).toContain('びて');
    expect(result.html).toContain('ふ');

    // Check soegana
    expect(result.html).toContain('を');
    expect(result.html).toContain('skam-soegana');

    // Check kaeriten
    expect(result.html).toContain('\u3191'); // レ

    // Check reading layer
    expect(result.html).toContain('学びて時に之を習ふ');

    // Check CSS
    expect(result.css).toContain('.skam-document');
  });
});

describe('inline mode', () => {
  it('should render with span container when inline: true', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      marks: [],
      readings: [],
    };

    const result = render(doc, { inline: true });

    // Should use span instead of div for document container
    expect(result.html).toMatch(/^<span class="skam-document skam-document--inline"/);
    expect(result.html).toMatch(/<\/span>$/);
    // Display layer should also be span
    expect(result.html).toContain('<span class="skam-display"');
  });

  it('should not render notes section when inline: true', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      marks: [
        {
          type: 'note',
          anchor: { from: 't1', to: 't1' },
          value: '注釈テキスト',
        },
      ],
      readings: [],
    };

    const result = render(doc, { inline: true });

    // Notes should not be rendered
    expect(result.html).not.toContain('skam-notes');
    expect(result.html).not.toContain('注釈テキスト');
  });

  it('should render notes when inline: false (default)', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      marks: [
        {
          type: 'note',
          anchor: { from: 't1', to: 't1' },
          value: '注釈テキスト',
        },
      ],
      readings: [],
    };

    const result = render(doc, { inline: false });

    // Notes should be rendered
    expect(result.html).toContain('skam-notes');
    expect(result.html).toContain('注釈テキスト');
  });

  it('should include reading layer when inline: true', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      marks: [],
      readings: [{ kind: 'kakikudashi', text: '学ぶ' }],
    };

    const result = render(doc, { inline: true });

    // Reading layer should be included as span
    expect(result.html).toContain('skam-reading');
    expect(result.html).toContain('学ぶ');
    expect(result.html).toContain('<span class="skam-reading"');
  });

  it('should generate inline CSS styles when inline: true', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      marks: [],
      readings: [],
    };

    const result = render(doc, { inline: true });

    expect(result.css).toContain('.skam-document--inline');
    expect(result.css).toContain('display: inline-block');
  });

  it('should work with vertical writing mode', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      marks: [],
      readings: [],
    };

    const result = render(doc, { inline: true, writingMode: 'vertical' });

    expect(result.html).toContain('data-writing-mode="vertical"');
    expect(result.css).toContain('writing-mode: vertical-rl');
  });

  it('should work with horizontal writing mode', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      marks: [],
      readings: [],
    };

    const result = render(doc, { inline: true, writingMode: 'horizontal' });

    expect(result.html).toContain('data-writing-mode="horizontal"');
    expect(result.css).not.toContain('writing-mode: vertical-rl');
  });
});

describe('renderHTML', () => {
  it('should return HTML only without CSS', async () => {
    const { renderHTML } = await import('../index.js');
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      marks: [],
      readings: [],
    };

    const html = renderHTML(doc);

    expect(html).toContain('skam-document');
    expect(html).toContain('data-token-id="t1"');
    expect(html).toContain('data-writing-mode="vertical"');
    expect(typeof html).toBe('string');
  });

  it('should respect writingMode option', async () => {
    const { renderHTML } = await import('../index.js');
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      marks: [],
      readings: [],
    };

    const html = renderHTML(doc, { writingMode: 'horizontal' });

    expect(html).toContain('data-writing-mode="horizontal"');
  });

  it('should produce same HTML as render()', async () => {
    const { renderHTML, render } = await import('../index.js');
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      marks: [],
      readings: [],
    };

    const htmlOnly = renderHTML(doc, { writingMode: 'vertical' });
    const { html } = render(doc, { writingMode: 'vertical' });

    expect(htmlOnly).toBe(html);
  });
});

describe('generateCSS', () => {
  it('should return CSS string', async () => {
    const { generateCSS } = await import('../index.js');

    const css = generateCSS();

    expect(typeof css).toBe('string');
    expect(css).toContain('.skam-document');
    expect(css).toContain('.skam-token');
  });

  it('should generate vertical-only CSS by default', async () => {
    const { generateCSS } = await import('../index.js');

    const css = generateCSS({ writingMode: 'vertical' });

    expect(css).toContain('writing-mode: vertical-rl');
    expect(css).not.toContain('[data-writing-mode="vertical"]');
    expect(css).not.toContain('[data-writing-mode="horizontal"]');
  });

  it('should generate horizontal-only CSS', async () => {
    const { generateCSS } = await import('../index.js');

    const css = generateCSS({ writingMode: 'horizontal' });

    expect(css).not.toContain('writing-mode: vertical-rl');
    expect(css).not.toContain('[data-writing-mode="vertical"]');
  });

  it('should generate both vertical and horizontal CSS with writingMode: both', async () => {
    const { generateCSS } = await import('../index.js');

    const css = generateCSS({ writingMode: 'both' });

    // Should contain data-writing-mode selectors for both directions
    expect(css).toContain('[data-writing-mode="vertical"]');
    expect(css).toContain('[data-writing-mode="horizontal"]');
    // Should contain vertical-specific styles
    expect(css).toContain('writing-mode: vertical-rl');
    expect(css).toContain('text-orientation: mixed');
  });

  it('should produce same CSS as render() for single writingMode', async () => {
    const { generateCSS, render } = await import('../index.js');
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      marks: [],
      readings: [],
    };

    const cssOnly = generateCSS({ writingMode: 'vertical' });
    const { css } = render(doc, { writingMode: 'vertical' });

    expect(cssOnly).toBe(css);
  });

  it('should respect classPrefix option', async () => {
    const { generateCSS } = await import('../index.js');

    const css = generateCSS({ classPrefix: 'custom' });

    expect(css).toContain('.custom-document');
    expect(css).toContain('.custom-token');
    expect(css).not.toContain('.skam-');
  });

  it('should include inline styles when inline option is true', async () => {
    const { generateCSS } = await import('../index.js');

    const cssWithInline = generateCSS({ inline: true });
    const cssWithoutInline = generateCSS({ inline: false });

    expect(cssWithInline).toContain('.skam-document--inline');
    expect(cssWithoutInline).not.toContain('.skam-document--inline');
  });
});

describe('CSS and HTML integration', () => {
  it('should work together for multiple documents with shared CSS', async () => {
    const { renderHTML, generateCSS } = await import('../index.js');
    const doc1: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      marks: [],
      readings: [],
    };
    const doc2: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't2', text: '習' }],
      marks: [],
      readings: [],
    };

    // Generate shared CSS once
    const css = generateCSS({ writingMode: 'both' });

    // Generate HTML for each document
    const html1 = renderHTML(doc1, { writingMode: 'vertical' });
    const html2 = renderHTML(doc2, { writingMode: 'horizontal' });

    // Verify CSS contains both writing mode styles
    expect(css).toContain('[data-writing-mode="vertical"]');
    expect(css).toContain('[data-writing-mode="horizontal"]');

    // Verify HTML has correct data attributes
    expect(html1).toContain('data-writing-mode="vertical"');
    expect(html2).toContain('data-writing-mode="horizontal"');
  });
});
