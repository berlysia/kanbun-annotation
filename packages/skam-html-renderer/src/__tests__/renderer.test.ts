import { describe, it, expect } from 'vitest';
import type { SKAMDocument } from '@kanbun/skam';
import { parse } from '@kanbun/skam-xml-parser';
import { render, PROFILES, getDefaultStyles } from '../index.js';

describe('render', () => {
  describe('basic token rendering', () => {
    it('should render a simple token without data-token-id by default', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [],
        marks: [],
        readings: [],
      };

      const result = render(doc);

      expect(result.html).toContain('skam-document');
      expect(result.html).toContain('skam-display');
      expect(result.html).not.toContain('data-token-id');
      expect(result.html).toContain('學');
    });

    it('should render data-token-id when interactive: true', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [],
        marks: [],
        readings: [],
      };

      const result = render(doc, { interactive: true });

      expect(result.html).toContain('data-token-id="t1"');
    });

    it('should render multiple tokens without data-token-id by default', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [
          { id: 't1', text: '學' },
          { id: 't2', text: '而' },
          { id: 't3', text: '時' },
        ],
        blocks: [],
        marks: [],
        readings: [],
      };

      const result = render(doc);

      expect(result.html).not.toContain('data-token-id');
    });

    it('should render multiple tokens with data-token-id when interactive: true', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [
          { id: 't1', text: '學' },
          { id: 't2', text: '而' },
          { id: 't3', text: '時' },
        ],
        blocks: [],
        marks: [],
        readings: [],
      };

      const result = render(doc, { interactive: true });

      expect(result.html).toContain('data-token-id="t1"');
      expect(result.html).toContain('data-token-id="t2"');
      expect(result.html).toContain('data-token-id="t3"');
    });
  });

  describe('yomigana and okurigana', () => {
    it('should render yomigana with ruby element (no data-token-id by default)', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [],
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
      // rb要素にはdata-token-id属性が付与されない（デフォルト）
      expect(result.html).toContain('<rb class="skam-base">學</rb>');
      expect(result.html).not.toContain('data-token-id');
      expect(result.html).toContain('skam-ruby');
      expect(result.html).toContain('まな');
    });

    it('should render yomigana with data-token-id when interactive: true', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [],
        marks: [
          {
            type: 'yomigana',
            anchor: { from: 't1', to: 't1' },
            value: 'まな',
          },
        ],
        readings: [],
      };

      const result = render(doc, { interactive: true });

      expect(result.html).toContain('<ruby>');
      // rb要素にはdata-token-id属性が付与される（interactive: true）
      expect(result.html).toContain('<rb class="skam-base" data-token-id="t1">學</rb>');
    });

    it('should render okurigana within ruby element', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [],
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
      // Yomigana should be in rt, okurigana should be in suffix-okuri (within suffix-row grid)
      expect(result.html).toMatch(/<rt class="skam-ruby">まな<\/rt>/);
      expect(result.html).toContain('skam-suffix-okuri');
    });

    it('should render soegana in suffix-okuri container', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '之' }],
        blocks: [],
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
      expect(result.html).toContain('skam-suffix-okuri');
      // No ruby element when only soegana is present
      expect(result.html).not.toContain('<ruby>');
    });

    it('should not create ruby element when only okurigana is present', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '習' }],
        blocks: [],
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
      expect(result.html).toContain('skam-suffix-okuri');
    });
  });

  describe('kaeriten', () => {
    it('should render kaeriten with Unicode character', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '習' }],
        blocks: [],
        marks: [
          {
            type: 'kaeri',
            position: { blockId: '', after: 't1' },
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
        blocks: [],
        marks: [
          {
            type: 'kaeri',
            position: { blockId: '', after: 't1' },
            value: '二',
          },
          {
            type: 'kaeri',
            position: { blockId: '', after: 't2' },
            value: '一',
          },
        ],
        readings: [],
      };

      const result = render(doc);

      expect(result.html).toContain('\u3193'); // 二
      expect(result.html).toContain('\u3192'); // 一
    });

    it('should render compound kaeriten with Unicode characters', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '不' }],
        blocks: [],
        marks: [
          {
            type: 'kaeri',
            position: { blockId: '', after: 't1' },
            value: '一レ',
          },
        ],
        readings: [],
      };

      const result = render(doc);

      expect(result.html).toContain('skam-kaeriten');
      expect(result.html).toContain('\u3192\u3191'); // 一レ (Unicode)
    });
  });

  describe('kutoten', () => {
    it('should render kutoten', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '乎' }],
        blocks: [],
        marks: [
          {
            type: 'kutoten',
            position: { blockId: '', after: 't1' },
            value: '。',
          },
        ],
        readings: [],
      };

      const result = render(doc);

      expect(result.html).toContain('skam-suffix-kutoten');
      expect(result.html).toContain('。');
    });
  });

  describe('saidoku', () => {
    it('should render saidoku with multiple readings', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '將' }],
        blocks: [],
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
        blocks: [],
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
      // First reading okuri should be in suffix-okuri (right column of suffix-row)
      expect(result.html).toMatch(
        /<span class="skam-suffix-okuri"><span class="skam-okuri" data-saidoku-n="1">に<\/span><\/span>/
      );
      // Second reading okuri should be in suffix-saidoku (left column of suffix-row)
      expect(result.html).toMatch(
        /<span class="skam-suffix-saidoku"><span class="skam-okuri" data-saidoku-n="2">す<\/span><\/span>/
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
        blocks: [],
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
        blocks: [],
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
        blocks: [],
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

  describe('ref with content (notes)', () => {
    it('should render notes section for ref with content', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [],
        marks: [
          {
            type: 'ref',
            position: { blockId: '', after: 't1' },
            content: '學問の意。',
          },
        ],
        readings: [],
      };

      const result = render(doc);

      expect(result.html).toContain('skam-notes');
      expect(result.html).toContain('skam-note-item');
      expect(result.html).toContain('學問の意。');
    });

    it('should render ref reference marker in text', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [],
        marks: [
          {
            type: 'ref',
            position: { blockId: '', after: 't1' },
            content: '學問の意。',
          },
        ],
        readings: [],
      };

      const result = render(doc);

      // ref markers use skam-ref class
      expect(result.html).toContain('skam-ref');
      expect(result.html).toContain('[1]');
    });

    it('should render multiple ref references with correct numbering', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [
          { id: 't1', text: '學' },
          { id: 't2', text: '問' },
        ],
        blocks: [],
        marks: [
          {
            type: 'ref',
            position: { blockId: '', after: 't1' },
            content: '第一の注釈。',
          },
          {
            type: 'ref',
            position: { blockId: '', after: 't2' },
            content: '第二の注釈。',
          },
        ],
        readings: [],
      };

      const result = render(doc);

      expect(result.html).toContain('[1]');
      expect(result.html).toContain('[2]');
      expect(result.html).toContain('第一の注釈。');
      expect(result.html).toContain('第二の注釈。');
    });
  });

  describe('reading layer', () => {
    it('should include reading layer with yomiage text', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [],
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
        blocks: [],
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
        blocks: [],
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
        blocks: [],
        marks: [
          {
            type: 'yomigana',
            anchor: { from: 't1', to: 't1' },
            value: 'まな',
          },
          {
            type: 'kaeri',
            position: { blockId: '', after: 't1' },
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
        blocks: [],
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
        blocks: [],
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
        blocks: [],
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
        blocks: [],
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
        blocks: [],
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
        blocks: [],
        marks: [
          {
            type: 'ref',
            position: { blockId: '', after: 't1' },
            content: '<b>test</b>',
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

describe('highlight', () => {
  it('should render highlight mark', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '重' },
        { id: 't2', text: '要' },
      ],
      blocks: [],
      marks: [
        {
          type: 'highlight',
          anchor: { from: 't1', to: 't2' },
          style: 'solid',
        },
      ],
      readings: [],
    };

    const result = render(doc);

    expect(result.html).toContain('skam-highlight');
    expect(result.html).toContain('data-style="solid"');
  });

  it('should render highlight with wavy style', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '波' },
        { id: 't2', text: '線' },
      ],
      blocks: [],
      marks: [
        {
          type: 'highlight',
          anchor: { from: 't1', to: 't2' },
          style: 'wavy',
        },
      ],
      readings: [],
    };

    const result = render(doc);

    expect(result.html).toContain('skam-highlight');
    expect(result.html).toContain('data-style="wavy"');
  });

  it('should not render highlight when profile.highlight is false', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '重' },
        { id: 't2', text: '要' },
      ],
      blocks: [],
      marks: [
        {
          type: 'highlight',
          anchor: { from: 't1', to: 't2' },
          style: 'solid',
        },
      ],
      readings: [],
    };

    const result = render(doc, { profile: { highlight: false } });

    expect(result.html).not.toContain('skam-highlight');
  });

  it('should render kutoten inside highlight span via suffix-row (at highlight end)', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '學' },
        { id: 't2', text: '而' },
        { id: 't3', text: '時' },
        { id: 't4', text: '習' },
        { id: 't5', text: '之' },
      ],
      blocks: [],
      marks: [
        {
          type: 'highlight',
          anchor: { from: 't1', to: 't5' },
          style: 'solid',
        },
        {
          type: 'kutoten',
          position: { blockId: '', after: 't5' },
          value: '。',
        },
      ],
      readings: [],
    };

    const result = render(doc);

    // kutoten は suffix-row 内に配置され、highlight span の中にある
    expect(result.html).toMatch(/skam-highlight.*skam-suffix-kutoten.*。/s);
    expect(result.html).toMatch(/skam-suffix-row.*skam-suffix-kutoten/s);
  });

  it('should render all kutoten inside highlight via suffix-row', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '不' },
        { id: 't2', text: '亦' },
        { id: 't3', text: '説' },
        { id: 't4', text: '乎' },
      ],
      blocks: [],
      marks: [
        {
          type: 'highlight',
          anchor: { from: 't1', to: 't4' },
          style: 'solid',
        },
        {
          type: 'kutoten',
          position: { blockId: '', after: 't1' },
          value: '、',
          kind: 'ten',
        },
        {
          type: 'kutoten',
          position: { blockId: '', after: 't4' },
          value: '。',
          kind: 'ku',
        },
      ],
      readings: [],
    };

    const result = render(doc);
    const html = result.html;

    // 中間・終端ともに highlight 内の suffix-row に配置される
    expect(html).toMatch(
      /skam-highlight.*skam-suffix-kutoten[^"]*">、.*skam-suffix-kutoten[^"]*">。/s
    );
    // 両方とも suffix-row の直接の子
    expect(html).toMatch(/skam-suffix-row[^"]*">.*skam-suffix-kutoten[^"]*">、/s);
    expect(html).toMatch(/skam-suffix-row[^"]*">.*skam-suffix-kutoten[^"]*">。/s);
  });
});

describe('ref (label)', () => {
  it('should render ref with label value', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '語' }],
      blocks: [],
      marks: [
        {
          type: 'ref',
          position: { blockId: '', after: 't1' },
          label: '(A)',
        },
      ],
      readings: [],
    };

    const result = render(doc);

    expect(result.html).toContain('skam-ref');
    expect(result.html).toContain('(A)');
  });

  it('should render ref with format', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '一' },
        { id: 't2', text: '二' },
      ],
      blocks: [],
      marks: [
        {
          type: 'ref',
          position: { blockId: '', after: 't1' },
          format: 'alpha-upper',
        },
        {
          type: 'ref',
          position: { blockId: '', after: 't2' },
          format: 'alpha-upper',
        },
      ],
      readings: [],
    };

    const result = render(doc);

    expect(result.html).toContain('(A)');
    expect(result.html).toContain('(B)');
    // ref marks have skam-ref class
    expect(result.html).toContain('skam-ref');
  });

  it('should render ref with iroha-katakana format', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '一' },
        { id: 't2', text: '二' },
        { id: 't3', text: '三' },
      ],
      blocks: [],
      marks: [
        {
          type: 'ref',
          position: { blockId: '', after: 't1' },
          format: 'iroha-katakana',
        },
        {
          type: 'ref',
          position: { blockId: '', after: 't2' },
          format: 'iroha-katakana',
        },
        {
          type: 'ref',
          position: { blockId: '', after: 't3' },
          format: 'iroha-katakana',
        },
      ],
      readings: [],
    };

    const result = render(doc);

    expect(result.html).toContain('（イ）');
    expect(result.html).toContain('（ロ）');
    expect(result.html).toContain('（ハ）');
  });

  it('should render ref with numeric-circled format', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '一' },
        { id: 't2', text: '二' },
      ],
      blocks: [],
      marks: [
        {
          type: 'ref',
          position: { blockId: '', after: 't1' },
          format: 'numeric-circled',
        },
        {
          type: 'ref',
          position: { blockId: '', after: 't2' },
          format: 'numeric-circled',
        },
      ],
      readings: [],
    };

    const result = render(doc);

    expect(result.html).toContain('①');
    expect(result.html).toContain('②');
  });

  it('should reuse same index for same ext.value', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '一' },
        { id: 't2', text: '二' },
        { id: 't3', text: '三' },
      ],
      blocks: [],
      marks: [
        {
          type: 'ref',
          position: { blockId: '', after: 't1' },
          format: 'alpha-upper',
          ext: { value: 'x' },
        },
        {
          type: 'ref',
          position: { blockId: '', after: 't2' },
          format: 'alpha-upper',
          ext: { value: 'y' },
        },
        {
          type: 'ref',
          position: { blockId: '', after: 't3' },
          format: 'alpha-upper',
          ext: { value: 'x' },
        },
      ],
      readings: [],
    };

    const result = render(doc);

    // First and third should have same label (A), second should have (B)
    const matches = result.html.match(/\(A\)/g);
    expect(matches).toHaveLength(2);
  });

  it('should not render ref label when profile.ref is false', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '語' }],
      blocks: [],
      marks: [
        {
          type: 'ref',
          position: { blockId: '', after: 't1' },
          label: '(A)',
        },
      ],
      readings: [],
    };

    const result = render(doc, { profile: { ref: false } });

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
    expect(PROFILES.full.ref).toBe(true);
    expect(PROFILES.full.okimoji).toBe(true);
    expect(PROFILES.full.joji).toBe(true);
    expect(PROFILES.full.soegana).toBe(true);
    expect(PROFILES.full.highlight).toBe(true);
  });

  it('should have learningBasic profile with minimal elements', () => {
    expect(PROFILES.learningBasic.yomigana).toBe(false);
    expect(PROFILES.learningBasic.okurigana).toBe(false);
    expect(PROFILES.learningBasic.kaeriten).toBe(true);
    expect(PROFILES.learningBasic.kutoten).toBe(true);
    expect(PROFILES.learningBasic.highlight).toBe(true);
    expect(PROFILES.learningBasic.ref).toBe(true);
  });

  it('should have learningHint profile with helpful elements', () => {
    expect(PROFILES.learningHint.yomigana).toBe(false);
    expect(PROFILES.learningHint.okurigana).toBe(true);
    expect(PROFILES.learningHint.kaeriten).toBe(true);
    expect(PROFILES.learningHint.soegana).toBe(true);
    expect(PROFILES.learningHint.highlight).toBe(true);
    expect(PROFILES.learningHint.ref).toBe(true);
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
      blocks: [],
      marks: [
        { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まな' },
        { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'びて' },
        { type: 'yomigana', anchor: { from: 't3', to: 't3' }, value: 'とき' },
        { type: 'okurigana', anchor: { from: 't3', to: 't3' }, value: 'に' },
        { type: 'soegana', anchor: { from: 't5', to: 't5' }, value: 'を' },
        { type: 'kaeri', position: { blockId: '', after: 't4' }, value: 'レ' },
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
      blocks: [],
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
      blocks: [],
      marks: [
        {
          type: 'ref',
          position: { blockId: '', after: 't1' },
          content: '注釈テキスト',
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
      blocks: [],
      marks: [
        {
          type: 'ref',
          position: { blockId: '', after: 't1' },
          content: '注釈テキスト',
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
      blocks: [],
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
      blocks: [],
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
      blocks: [],
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
      blocks: [],
      marks: [],
      readings: [],
    };

    const result = render(doc, { inline: true, writingMode: 'horizontal' });

    expect(result.html).toContain('data-writing-mode="horizontal"');
    expect(result.css).not.toContain('writing-mode: vertical-rl');
  });
});

describe('renderHTML', () => {
  it('should return HTML only without CSS (no data-token-id by default)', async () => {
    const { renderHTML } = await import('../index.js');
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      blocks: [],
      marks: [],
      readings: [],
    };

    const html = renderHTML(doc);

    expect(html).toContain('skam-document');
    expect(html).not.toContain('data-token-id');
    expect(html).toContain('data-writing-mode="vertical"');
    expect(typeof html).toBe('string');
  });

  it('should return HTML with data-token-id when interactive: true', async () => {
    const { renderHTML } = await import('../index.js');
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      blocks: [],
      marks: [],
      readings: [],
    };

    const html = renderHTML(doc, { interactive: true });

    expect(html).toContain('data-token-id="t1"');
  });

  it('should respect writingMode option', async () => {
    const { renderHTML } = await import('../index.js');
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      blocks: [],
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
      blocks: [],
      marks: [],
      readings: [],
    };

    const htmlOnly = renderHTML(doc, { writingMode: 'vertical' });
    const { html } = render(doc, { writingMode: 'vertical' });

    expect(htmlOnly).toBe(html);
  });

  it('should produce same HTML as render() with interactive: true', async () => {
    const { renderHTML, render } = await import('../index.js');
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      blocks: [],
      marks: [],
      readings: [],
    };

    const htmlOnly = renderHTML(doc, { writingMode: 'vertical', interactive: true });
    const { html } = render(doc, { writingMode: 'vertical', interactive: true });

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
      blocks: [],
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
      blocks: [],
      marks: [],
      readings: [],
    };
    const doc2: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't2', text: '習' }],
      blocks: [],
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

describe('CSS layer options', () => {
  it('should wrap CSS with @layer by default', () => {
    const css = getDefaultStyles();
    expect(css).toMatch(/^@layer skam-kanbun \{/);
    expect(css).toContain(':where(.skam-document)');
  });

  it('should not wrap with @layer when useLayer is false', () => {
    const css = getDefaultStyles({ useLayer: false });
    expect(css).not.toContain('@layer');
    expect(css).toContain(':where(.skam-document)');
  });

  it('should use custom layer name', () => {
    const css = getDefaultStyles({ layerName: 'my-kanbun' });
    expect(css).toContain('@layer my-kanbun');
    expect(css).not.toContain('@layer skam-kanbun');
  });

  it('should generate @layer in render() output', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      blocks: [],
      marks: [],
      readings: [],
    };

    const result = render(doc);
    expect(result.css).toMatch(/^@layer skam-kanbun \{/);
  });

  it('should respect useLayer option in render()', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      blocks: [],
      marks: [],
      readings: [],
    };

    const result = render(doc, { useLayer: false });
    expect(result.css).not.toContain('@layer');
  });
});

describe('CSS variables options', () => {
  it('should use default variable prefix', () => {
    const css = getDefaultStyles();
    expect(css).toContain('--skam-color-fg');
    expect(css).toContain('--skam-font-family');
    expect(css).toContain('--skam-line-height');
  });

  it('should use custom variable prefix', () => {
    const css = getDefaultStyles({ variablePrefix: 'kb' });
    expect(css).toContain('--kb-color-fg');
    expect(css).toContain('--kb-font-family');
    expect(css).not.toContain('--skam-color-fg');
  });

  it('should use variables for styling', () => {
    const css = getDefaultStyles();
    expect(css).toContain('font-family: var(--skam-font-family)');
    expect(css).toContain('line-height: var(--skam-line-height)');
    expect(css).toContain('color: var(--skam-color-kaeriten)');
  });

  it('should define all expected CSS variables', () => {
    const css = getDefaultStyles();
    const expectedVariables = [
      '--skam-color-fg',
      '--skam-color-kaeriten',
      '--skam-color-ruby',
      '--skam-color-emphasis',
      '--skam-font-family',
      '--skam-font-family-ruby',
      '--skam-glyph-size',
      '--skam-ruby-font-size',
      '--skam-line-height',
      '--skam-letter-spacing',
      // Selection CSS variables
      '--skam-selection-bg',
      '--skam-selection-border',
    ];

    for (const variable of expectedVariables) {
      expect(css).toContain(variable);
    }
  });

  it('should include selection state classes', () => {
    const css = getDefaultStyles();

    // Selection state class
    expect(css).toContain(':where(.skam-selected)');
  });
});

describe(':where() specificity', () => {
  it('should wrap all selectors with :where()', () => {
    const css = getDefaultStyles({ useLayer: false });
    // All class selectors should be wrapped with :where()
    expect(css).toContain(':where(.skam-document)');
    expect(css).toContain(':where(.skam-token)');
    expect(css).toContain(':where(.skam-ruby)');
    expect(css).toContain(':where(.skam-kaeriten)');
    expect(css).toContain(':where(.skam-emphasis)');
  });

  it('should wrap attribute selectors with :where()', () => {
    const css = getDefaultStyles({ useLayer: false });
    // highlight[data-style] selectors now include :not(:has()) for ref handling
    expect(css).toContain(':where(.skam-highlight[data-style="dotted"]');
    expect(css).toContain(':where(.skam-okototen[data-shape="dot"])');
  });

  it('should not have unwrapped class selectors', () => {
    const css = getDefaultStyles({ useLayer: false });
    // Should not have bare .skam-document { (without :where())
    // But should have :where(.skam-document) {
    const bareSelectors = css.match(/(?<!:where\()\.skam-[\w-]+\s*\{/g);
    expect(bareSelectors).toBeNull();
  });
});

describe('data-token-id attributes', () => {
  it('should render data-token-id on rb element when yomigana is present', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      blocks: [],
      marks: [
        {
          type: 'yomigana',
          anchor: { from: 't1', to: 't1' },
          value: 'まな',
        },
      ],
      readings: [],
    };

    const result = render(doc, { interactive: true });

    // rb要素にdata-token-id属性が付与されている
    expect(result.html).toContain('data-token-id="t1"');
    expect(result.html).toContain('<rb class="skam-base" data-token-id="t1">學</rb>');
  });

  it('should render data-token-id on span when no ruby is needed', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      blocks: [],
      marks: [],
      readings: [],
    };

    const result = render(doc, { interactive: true });

    // span.skam-base要素にdata-token-id属性が付与されている
    expect(result.html).toContain('<span class="skam-base" data-token-id="t1">學</span>');
  });

  it('should render data-token-id on saidoku rb element', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '將' }],
      blocks: [],
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

    const result = render(doc, { interactive: true });

    // rb要素にdata-token-id属性が付与されている
    expect(result.html).toContain('<rb class="skam-base" data-token-id="t1">將</rb>');
  });

  it('should render data-token-from/to on range yomigana (jukugo ruby)', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '朝' },
        { id: 't2', text: '廷' },
      ],
      blocks: [],
      marks: [
        {
          type: 'yomigana',
          anchor: { from: 't1', to: 't2' },
          value: 'ちょうてい',
        },
      ],
      readings: [],
    };

    const result = render(doc, { interactive: true });

    // 範囲マークの場合はdata-token-from/toが使用される
    expect(result.html).toContain('data-token-from="t1"');
    expect(result.html).toContain('data-token-to="t2"');
    // 熟語全体のテキストが表示される
    expect(result.html).toContain('朝廷');
    expect(result.html).toContain('ちょうてい');
  });

  it('should render data-token-from/to on range okurigana when interactive: true', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '自' },
        { id: 't2', text: '然' },
      ],
      blocks: [],
      marks: [
        {
          type: 'okurigana',
          anchor: { from: 't1', to: 't2' },
          value: 'と',
        },
      ],
      readings: [],
    };

    const result = render(doc, { interactive: true });

    // 範囲マークの場合はdata-token-from/toが使用される
    expect(result.html).toContain('data-token-from="t1"');
    expect(result.html).toContain('data-token-to="t2"');
  });

  it('should not render data-token-id by default', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '學' }],
      blocks: [],
      marks: [],
      readings: [],
    };

    const result = render(doc);

    expect(result.html).not.toContain('data-token-id');
  });

  it('should not render data-token-from/to by default', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '朝' },
        { id: 't2', text: '廷' },
      ],
      blocks: [],
      marks: [
        {
          type: 'yomigana',
          anchor: { from: 't1', to: 't2' },
          value: 'ちょうてい',
        },
      ],
      readings: [],
    };

    const result = render(doc);

    expect(result.html).not.toContain('data-token-from');
    expect(result.html).not.toContain('data-token-to');
    // 熟語全体のテキストは表示される
    expect(result.html).toContain('朝廷');
    expect(result.html).toContain('ちょうてい');
  });

  describe('ref with other marks', () => {
    it('should render both ref and yomigana on same token', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [],
        marks: [
          {
            type: 'yomigana',
            id: 'm1',
            anchor: { from: 't1', to: 't1' },
            value: 'まな',
          },
          {
            type: 'ref',
            id: 'ref-1',
            position: { blockId: '', after: 't1' },
            format: 'iroha-katakana',
          },
        ],
        readings: [],
      };

      const result = render(doc, { profile: PROFILES.full });

      // Yomigana should be rendered
      expect(result.html).toContain('まな');
      // Ref should be rendered with イ (first iroha character)
      expect(result.html).toContain('skam-ref');
      expect(result.html).toContain('イ');
    });

    it('should render ref before token when position changed', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [],
        marks: [
          {
            type: 'ref',
            id: 'ref-1',
            position: { blockId: '', after: 't1' },
            format: 'alpha-upper',
          },
        ],
        readings: [],
      };

      const result = render(doc, { profile: PROFILES.full });

      // Ref marker should appear before the token content
      const htmlContent = result.html;
      const refIndex = htmlContent.indexOf('skam-ref');
      const tokenIndex = htmlContent.indexOf('skam-base');
      expect(refIndex).toBeLessThan(tokenIndex);
    });

    it('should render ref at block start (empty position)', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [
          { id: 't1', text: '學' },
          { id: 't2', text: '而' },
        ],
        blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
        marks: [
          {
            type: 'ref',
            id: 'ref-1',
            position: { blockId: 'b1' },
            format: 'alpha-upper',
          },
        ],
        readings: [],
      };

      const result = render(doc, { profile: PROFILES.full });

      // Ref should be rendered
      expect(result.html).toContain('skam-ref');
      expect(result.html).toContain('A'); // alpha-upper first value

      // Ref marker should appear before the first token content
      const htmlContent = result.html;
      const refIndex = htmlContent.indexOf('skam-ref');
      const tokenIndex = htmlContent.indexOf('skam-base');
      expect(refIndex).toBeLessThan(tokenIndex);
    });
  });
});

describe('highlight with ref association', () => {
  it('should render ref inside highlight span (explicit association)', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '重' },
        { id: 't2', text: '要' },
      ],
      blocks: [],
      marks: [
        {
          type: 'highlight',
          anchor: { from: 't1', to: 't2' },
          style: 'solid',
          ref: 'ref1',
        },
        {
          type: 'ref',
          id: 'ref1',
          position: { blockId: '', after: 't1' },
          label: '(A)',
        },
      ],
      readings: [],
    };

    const result = render(doc, { profile: PROFILES.full });

    // Ref should be rendered inside highlight
    expect(result.html).toContain('skam-ref');
    expect(result.html).toContain('(A)');

    // Ref marker should appear inside highlight span (as direct child)
    const htmlContent = result.html;
    expect(htmlContent).toMatch(/skam-highlight[^>]*>.*skam-ref.*<\/span>/);
  });

  it('should not render ref standalone when associated with highlight', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '重' },
        { id: 't2', text: '要' },
      ],
      blocks: [],
      marks: [
        {
          type: 'highlight',
          anchor: { from: 't1', to: 't2' },
          style: 'solid',
          ref: 'ref1',
        },
        {
          type: 'ref',
          id: 'ref1',
          position: { blockId: '', after: 't1' },
          label: '(A)',
        },
      ],
      readings: [],
    };

    const result = render(doc, { profile: PROFILES.full });

    // Count occurrences of (A) - should be exactly 1 (inside highlight, not standalone)
    const matches = result.html.match(/\(A\)/g);
    expect(matches).toHaveLength(1);

    // Should NOT have <sup> (standalone ref marker)
    expect(result.html).not.toContain('<sup class="skam-ref');
  });

  it('should render ref standalone when not associated with any highlight', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '重' },
        { id: 't2', text: '要' },
      ],
      blocks: [],
      marks: [
        {
          type: 'highlight',
          anchor: { from: 't1', to: 't2' },
          style: 'solid',
          // no ref attribute
        },
        {
          type: 'ref',
          id: 'ref1',
          position: { blockId: '', after: 't1' },
          label: '(A)',
        },
      ],
      readings: [],
    };

    const result = render(doc, { profile: PROFILES.full });

    // Ref should be rendered as standalone (inside token area)
    expect(result.html).toContain('skam-ref');
    expect(result.html).toContain('(A)');

    // Ref should appear after the token it follows (t1), not before highlight
    const htmlContent = result.html;
    // The ref with sup tag appears in renderToken
    expect(htmlContent).toContain('<sup class="skam-ref');
  });

  it('should render implicitly associated ref inside highlight (single ref, no ids)', () => {
    // When highlight and single ref inside both lack explicit ids,
    // parser sets highlight.ref = ref.id (auto-generated id)
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '重' },
        { id: 't2', text: '要' },
      ],
      blocks: [],
      marks: [
        {
          type: 'highlight',
          anchor: { from: 't1', to: 't2' },
          style: 'solid',
          ref: 'm1', // implicitly set by parser
        },
        {
          type: 'ref',
          id: 'm1', // auto-generated id
          position: { blockId: '', after: 't1' },
          label: '(A)',
        },
      ],
      readings: [],
    };

    const result = render(doc, { profile: PROFILES.full });

    // Ref should be rendered inside highlight (not standalone)
    const htmlContent = result.html;
    expect(htmlContent).toMatch(/skam-highlight[^>]*>.*skam-ref.*<\/span>/);

    // Should appear exactly once
    const matches = htmlContent.match(/\(A\)/g);
    expect(matches).toHaveLength(1);

    // Should NOT have <sup> (standalone ref uses <sup>, associated uses <span>)
    expect(htmlContent).not.toContain('<sup class="skam-ref');
  });
});

describe('XML to HTML integration - highlight with ref', () => {
  it('should render ref inside highlight - sample 9 case', () => {
    // This is the exact XML from sample 9 (試験問題形式)
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      <skam:span type="highlight" style="solid" ref="ref-a"><skam:kun yomi="まな" okuri="ビテ">學</skam:kun>而<skam:ref xml:id="ref-a" format="alpha-upper"/></skam:span>
      <skam:kun okuri="ニ">時</skam:kun>
      <skam:kun okuri="フ">習</skam:kun>
      <skam:span type="highlight" style="solid" ref="ref-b"><skam:kun soe="ヲ">之</skam:kun><skam:kaeri kind="re"/><skam:ref xml:id="ref-b" format="alpha-upper"/></skam:span><skam:kutoten value="。" kind="ku"/>
    </skam:block>
  </skam:body>
</skam:doc>`;

    const doc = parse(xml);
    const result = render(doc, { profile: PROFILES.full });

    // Both (A) and (B) should appear inside their respective highlights
    const htmlContent = result.html;

    // (A) should appear exactly once
    const matchesA = htmlContent.match(/\(A\)/g);
    expect(matchesA).toHaveLength(1);

    // (B) should appear exactly once
    const matchesB = htmlContent.match(/\(B\)/g);
    expect(matchesB).toHaveLength(1);

    // Refs should NOT be rendered as standalone <sup>
    expect(htmlContent).not.toContain('<sup class="skam-ref');

    // Refs should be inside highlight spans (as direct children)
    expect(htmlContent).toContain('skam-highlight');
    // Check that ref is inside highlight (appears after highlight opens and before it closes)
    expect(htmlContent).toMatch(/skam-highlight[^>]*>.*\(A\).*<\/span>/);
  });

  it('should render ref inside highlight from parsed XML (explicit association)', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1">
  <skam:body>
    <skam:block>
      <skam:span type="highlight" style="solid" ref="ref-1">傍線部<skam:ref xml:id="ref-1" format="alpha-upper"/></skam:span>を現代語訳せよ。
    </skam:block>
  </skam:body>
</skam:doc>`;

    const doc = parse(xml);
    const result = render(doc, { profile: PROFILES.full });

    // Ref should appear inside highlight, not as standalone
    const htmlContent = result.html;
    expect(htmlContent).toMatch(/skam-highlight[^>]*>.*skam-ref.*<\/span>/);

    // Should have (A) exactly once
    const matches = htmlContent.match(/\(A\)/g);
    expect(matches).toHaveLength(1);

    // Should NOT have <sup> (standalone ref marker)
    expect(htmlContent).not.toContain('<sup class="skam-ref');
  });

  it('should render ref inside highlight from parsed XML (implicit association)', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      <skam:span type="highlight"><skam:ref format="alpha-upper"/>學而</skam:span>
    </skam:block>
  </skam:body>
</skam:doc>`;

    const doc = parse(xml);
    const result = render(doc, { profile: PROFILES.full });

    // Ref should appear inside highlight, not as standalone
    const htmlContent = result.html;
    expect(htmlContent).toMatch(/skam-highlight[^>]*>.*skam-ref.*<\/span>/);

    // Should have (A) exactly once
    const matches = htmlContent.match(/\(A\)/g);
    expect(matches).toHaveLength(1);

    // Should NOT have <sup> (standalone ref marker)
    expect(htmlContent).not.toContain('<sup class="skam-ref');
  });

  it('should render multiple refs standalone when not associated', () => {
    // blocks ベースのドキュメント構造で直接テスト
    // （パーサーの blocks 出力対応は別タスクで実施）
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '學' },
        { id: 't2', text: '而' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [
        {
          type: 'ref',
          id: 'm1',
          position: { blockId: 'b1' },
          format: 'alpha-upper',
        },
        {
          type: 'ref',
          id: 'm2',
          position: { blockId: 'b1', after: 't1' },
          format: 'numeric-bracket',
        },
        {
          type: 'highlight',
          id: 'm3',
          anchor: { from: 't1', to: 't2' },
        },
      ],
      readings: [],
    };

    const result = render(doc, { profile: PROFILES.full });

    // Both refs should be rendered as standalone
    const htmlContent = result.html;

    // Should have (A) and [1] (numeric-bracket format uses brackets)
    expect(htmlContent).toContain('(A)');
    expect(htmlContent).toContain('[1]');

    // First ref (block-start) uses <span>, second ref (after token) uses <sup>
    // Note: block-start refs are rendered differently from position-based refs
    expect(htmlContent).toContain('<sup class="skam-ref');
  });
});
