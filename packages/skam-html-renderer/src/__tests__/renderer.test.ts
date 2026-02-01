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
      // Yomigana should be in rt, okurigana should be in suffix-kana (no kaeriten)
      expect(result.html).toMatch(/<rt class="skam-ruby">まな<\/rt>/);
      expect(result.html).toContain('skam-suffix-kana');
    });

    it('should render soegana in suffix-kana container', () => {
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
      expect(result.html).toContain('skam-suffix-kana');
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
      expect(result.html).toContain('skam-suffix-kana');
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
              { n: 1, reading: 'まさ', okuri: 'に' },
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
              { n: 1, reading: 'まさ', okuri: 'に' },
              { n: 2, okuri: 'す' },
            ],
          },
        ],
        readings: [],
      };

      const result = render(doc);

      // First reading should be in inner ruby's rt element
      expect(result.html).toMatch(
        /<rt class="skam-ruby" data-saidoku-n="1">まさ<span class="skam-okuri">に<\/span><\/rt>/
      );
      // Second reading should be in outer ruby's rt element with saidoku-under class
      expect(result.html).toMatch(
        /<rt class="skam-ruby skam-saidoku-under" data-saidoku-n="2"><span class="skam-okuri">す<\/span><\/rt>/
      );
      // Should have nested ruby structure with inner and outer ruby classes
      expect(result.html).toMatch(/<ruby class="skam-saidoku-outer"><ruby class="skam-saidoku-inner">.*<\/ruby><rt/);
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
  });

  it('should have learningBasic profile with minimal elements', () => {
    expect(PROFILES.learningBasic.yomigana).toBe(false);
    expect(PROFILES.learningBasic.okurigana).toBe(false);
    expect(PROFILES.learningBasic.kaeriten).toBe(true);
    expect(PROFILES.learningBasic.kutoten).toBe(true);
  });

  it('should have learningHint profile with helpful elements', () => {
    expect(PROFILES.learningHint.yomigana).toBe(false);
    expect(PROFILES.learningHint.okurigana).toBe(true);
    expect(PROFILES.learningHint.kaeriten).toBe(true);
    expect(PROFILES.learningHint.soegana).toBe(true);
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
