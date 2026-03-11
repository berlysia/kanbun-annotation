import { describe, it, expect } from 'vitest';
import type { SKAMDocument } from '@kanbun-skam/skam';
import { KAERI } from '@kanbun-skam/skam';
import { render, measure, PROFILES } from '../index.js';
import { RecordingCanvas, RecordingContext } from './recording-context.js';

function plainDoc(): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '子' },
      { id: 't2', text: '曰' },
      { id: 't3', text: '學' },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
    marks: [],
    readings: [],
  };
}

function annotatedDoc(): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '子' },
      { id: 't2', text: '曰' },
      { id: 't3', text: '學' },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
    marks: [
      { type: 'yomigana', anchor: { from: 't3', to: 't3' }, value: 'まな' },
      { type: 'okurigana', anchor: { from: 't3', to: 't3' }, value: 'ぶ' },
      { type: 'soegana', anchor: { from: 't1', to: 't1' }, value: 'は' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: '㆑' },
      { type: 'kutoten', position: { blockId: 'b1', after: 't3' }, value: '。' },
    ],
    readings: [],
  };
}

describe('integration: render()', () => {
  it('renders plain text document', () => {
    const canvas = new RecordingCanvas();
    render(plainDoc(), canvas);

    const ctx = canvas.getContext('2d');
    const fillTexts = ctx.getCalls('fillText');
    const chars = fillTexts.map((c) => c.args[0]);
    expect(chars).toContain('子');
    expect(chars).toContain('曰');
    expect(chars).toContain('學');
  });

  it('renders document with all 5 Phase 1 marks', () => {
    const canvas = new RecordingCanvas();
    render(annotatedDoc(), canvas);

    const ctx = canvas.getContext('2d');
    const fillTexts = ctx.getCalls('fillText');
    const chars = fillTexts.map((c) => c.args[0]);

    // Base characters
    expect(chars).toContain('子');
    expect(chars).toContain('曰');
    expect(chars).toContain('學');

    // Ruby (yomigana)
    expect(chars).toContain('ま');
    expect(chars).toContain('な');

    // Okurigana
    expect(chars).toContain('ぶ');

    // Soegana
    expect(chars).toContain('は');

    // Kaeri (Unicode)
    expect(chars).toContain(KAERI.RE);

    // Kutoten
    expect(chars).toContain('。');
  });

  it('renders background when backgroundColor is set', () => {
    const canvas = new RecordingCanvas();
    render(plainDoc(), canvas, { backgroundColor: '#fff' });

    const ctx = canvas.getContext('2d');
    const fillRects = ctx.getCalls('fillRect');
    expect(fillRects.length).toBeGreaterThanOrEqual(1);

    // Background should be drawn before any text
    const firstFillRect = ctx.calls.findIndex((c) => c.method === 'fillRect');
    const firstFillText = ctx.calls.findIndex((c) => c.method === 'fillText');
    expect(firstFillRect).toBeLessThan(firstFillText);
  });

  it('renders with custom options', () => {
    const canvas = new RecordingCanvas();
    render(plainDoc(), canvas, {
      fontSize: 32,
      fontFamily: 'sans-serif',
      padding: 20,
    });

    const ctx = canvas.getContext('2d');
    const fillTexts = ctx.getCalls('fillText');
    expect(fillTexts.length).toBeGreaterThan(0);
  });

  it('respects profile filtering', () => {
    const canvas = new RecordingCanvas();
    render(annotatedDoc(), canvas, {
      profile: PROFILES.learningBasic,
    });

    const ctx = canvas.getContext('2d');
    const fillTexts = ctx.getCalls('fillText');
    const chars = fillTexts.map((c) => c.args[0]);

    // Kaeri should be present (kaeriten: true)
    expect(chars).toContain(KAERI.RE);

    // Yomigana should NOT be present (yomigana: false)
    expect(chars).not.toContain('ま');
    expect(chars).not.toContain('な');
  });

  it('renders empty document without error', () => {
    const canvas = new RecordingCanvas();
    const emptyDoc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [],
      blocks: [],
      marks: [],
      readings: [],
    };
    expect(() => render(emptyDoc, canvas)).not.toThrow();
  });

  it('renders emphasis marks', () => {
    const canvas = new RecordingCanvas();
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '子' },
        { id: 't2', text: '曰' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [{ type: 'emphasis', anchor: { from: 't1', to: 't2' }, style: 'sesame' }],
      readings: [],
    };
    render(doc, canvas);

    const ctx = canvas.getContext('2d');
    const chars = ctx.getCalls('fillText').map((c) => c.args[0]);
    expect(chars).toContain('子');
    expect(chars).toContain('曰');
    // Sesame emphasis character
    expect(chars).toContain('\uFE45');
  });

  it('renders saidoku marks', () => {
    const canvas = new RecordingCanvas();
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [{ id: 't1', text: '將' }],
      blocks: [{ id: 'b1', tokenIds: ['t1'] }],
      marks: [
        {
          type: 'saidoku',
          anchor: { from: 't1', to: 't1' },
          forms: [
            { n: 1, yomi: 'まさ', okuri: 'に' },
            { n: 2, yomi: 'はた' },
          ],
        },
      ],
      readings: [],
    };
    render(doc, canvas);

    const ctx = canvas.getContext('2d');
    const chars = ctx.getCalls('fillText').map((c) => c.args[0]);
    expect(chars).toContain('將');
    expect(chars).toContain('ま');
    expect(chars).toContain('さ');
    expect(chars).toContain('に');
    expect(chars).toContain('は');
    expect(chars).toContain('た');
  });

  it('renders tateten group with separator', () => {
    const canvas = new RecordingCanvas();
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '而' },
        { id: 't2', text: '已' },
        { id: 't3', text: '矣' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
      marks: [
        { type: 'tateten', anchor: { from: 't1', to: 't2' } },
        { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆒㆑' },
      ],
      readings: [],
    };
    render(doc, canvas);

    const ctx = canvas.getContext('2d');
    const chars = ctx.getCalls('fillText').map((c) => c.args[0]);
    // Base characters
    expect(chars).toContain('而');
    expect(chars).toContain('已');
    expect(chars).toContain('矣');
    // Tateten separator U+3190
    expect(chars).toContain('\u3190');
    // レ component stays on token
    expect(chars).toContain(KAERI.RE);
    // 一 component goes to separator kaeri
    expect(chars).toContain(KAERI.ICHI);
  });

  it('renders ref mark label', () => {
    const canvas = new RecordingCanvas();
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '子' },
        { id: 't2', text: '曰' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [
        {
          type: 'ref',
          id: 'r1',
          position: { blockId: 'b1', after: 't1' },
          label: '※',
        },
      ],
      readings: [],
    };
    render(doc, canvas);

    const ctx = canvas.getContext('2d');
    const chars = ctx.getCalls('fillText').map((c) => c.args[0]);
    expect(chars).toContain('子');
    expect(chars).toContain('曰');
    expect(chars).toContain('※');
  });

  it('renders highlight with ref label', () => {
    const canvas = new RecordingCanvas();
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '子' },
        { id: 't2', text: '曰' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
      marks: [
        { type: 'highlight', anchor: { from: 't1', to: 't2' }, style: 'solid', ref: 'r1' },
        {
          type: 'ref',
          id: 'r1',
          position: { blockId: 'b1', after: 't2' },
          label: '注',
        },
      ],
      readings: [],
    };
    render(doc, canvas);

    const ctx = canvas.getContext('2d');
    const chars = ctx.getCalls('fillText').map((c) => c.args[0]);
    expect(chars).toContain('子');
    expect(chars).toContain('曰');
    expect(chars).toContain('注');
    // Highlight line should be drawn
    expect(ctx.getCalls('stroke').length).toBeGreaterThan(0);
  });

  it('renders multiple blocks', () => {
    const canvas = new RecordingCanvas();
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '子' },
        { id: 't2', text: '曰' },
        { id: 't3', text: '學' },
        { id: 't4', text: '而' },
      ],
      blocks: [
        { id: 'b1', tokenIds: ['t1', 't2'] },
        { id: 'b2', tokenIds: ['t3', 't4'] },
      ],
      marks: [],
      readings: [],
    };
    render(doc, canvas);

    const ctx = canvas.getContext('2d');
    const chars = ctx.getCalls('fillText').map((c) => c.args[0]);
    expect(chars).toContain('子');
    expect(chars).toContain('曰');
    expect(chars).toContain('學');
    expect(chars).toContain('而');
  });
});

describe('integration: layout refactor regression', () => {
  it('multi-block + adaptive + highlight', () => {
    const canvas = new RecordingCanvas();
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '子' },
        { id: 't2', text: '曰' },
        { id: 't3', text: '學' },
        { id: 't4', text: '而' },
      ],
      blocks: [
        { id: 'b1', tokenIds: ['t1', 't2'] },
        { id: 'b2', tokenIds: ['t3', 't4'] },
      ],
      marks: [
        { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'し' },
        { type: 'highlight', anchor: { from: 't3', to: 't4' }, style: 'solid' },
      ],
      readings: [],
    };
    render(doc, canvas, { columnSizing: 'adaptive' });

    const ctx = canvas.getContext('2d');
    const chars = ctx.getCalls('fillText').map((c) => c.args[0]);
    expect(chars).toContain('子');
    expect(chars).toContain('曰');
    expect(chars).toContain('學');
    expect(chars).toContain('而');
    expect(chars).toContain('し');
    // Highlight line should be drawn
    expect(ctx.getCalls('stroke').length).toBeGreaterThan(0);
  });

  it('tateten in highlight-group', () => {
    const canvas = new RecordingCanvas();
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '而' },
        { id: 't2', text: '已' },
        { id: 't3', text: '矣' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
      marks: [
        { type: 'tateten', anchor: { from: 't1', to: 't2' } },
        { type: 'highlight', anchor: { from: 't1', to: 't3' }, style: 'dashed' },
      ],
      readings: [],
    };
    render(doc, canvas);

    const ctx = canvas.getContext('2d');
    const chars = ctx.getCalls('fillText').map((c) => c.args[0]);
    expect(chars).toContain('而');
    expect(chars).toContain('已');
    expect(chars).toContain('矣');
    // Tateten separator
    expect(chars).toContain('\u3190');
    // Highlight line should be drawn
    expect(ctx.getCalls('stroke').length).toBeGreaterThan(0);
  });

  it('range ruby + emphasis coexistence', () => {
    const canvas = new RecordingCanvas();
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '如' },
        { id: 't2', text: '何' },
        { id: 't3', text: '也' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
      marks: [
        { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'いかん' },
        { type: 'emphasis', anchor: { from: 't1', to: 't2' }, style: 'sesame' },
      ],
      readings: [],
    };
    render(doc, canvas);

    const ctx = canvas.getContext('2d');
    const chars = ctx.getCalls('fillText').map((c) => c.args[0]);
    expect(chars).toContain('如');
    expect(chars).toContain('何');
    expect(chars).toContain('也');
    // Range ruby characters
    expect(chars).toContain('い');
    expect(chars).toContain('か');
    expect(chars).toContain('ん');
    // Sesame emphasis character
    expect(chars).toContain('\uFE45');
  });
});

describe('integration: measure()', () => {
  it('returns positive dimensions for plain document', () => {
    const ctx = new RecordingContext();
    const dims = measure(plainDoc(), ctx);

    expect(dims.width).toBeGreaterThan(0);
    expect(dims.height).toBeGreaterThan(0);
    // Vertical layout of 3 chars: height > width
    expect(dims.height).toBeGreaterThan(dims.width);
  });

  it('increases width when marks are added', () => {
    const ctx1 = new RecordingContext();
    const plainDims = measure(plainDoc(), ctx1);

    const ctx2 = new RecordingContext();
    const annotatedDims = measure(annotatedDoc(), ctx2);

    // Ruby/suffix marks should widen the column
    expect(annotatedDims.width).toBeGreaterThan(plainDims.width);
  });

  it('includes custom padding in dimensions', () => {
    const ctx = new RecordingContext();
    const dimsDefault = measure(plainDoc(), ctx);

    const ctx2 = new RecordingContext();
    const dimsCustom = measure(plainDoc(), ctx2, {
      padding: { top: 40, right: 40, bottom: 40, left: 40 },
    });

    // Larger padding = larger dimensions
    expect(dimsCustom.width).toBeGreaterThan(dimsDefault.width);
    expect(dimsCustom.height).toBeGreaterThan(dimsDefault.height);
  });

  it('does not issue draw calls', () => {
    const ctx = new RecordingContext();
    measure(plainDoc(), ctx);

    // measure() should not call fillText or fillRect
    expect(ctx.getCalls('fillText')).toHaveLength(0);
    expect(ctx.getCalls('fillRect')).toHaveLength(0);
  });
});
