import { describe, it, expect } from 'vitest';
import type { SKAMDocument, Mark } from '@kanbun/skam';
import { buildRenderTree } from '../render-tree.js';
import { layout } from '../layout.js';
import { PROFILES } from '../profiles.js';
import { RecordingContext } from './recording-context.js';

const DEFAULT_FONT_SIZE = 24;
const DEFAULT_RUBY_RATIO = 0.5;
const DEFAULT_LINE_HEIGHT = 2.0;
const DEFAULT_PADDING = 16;

function singleTokenDoc(marks: Mark[] = []): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [{ id: 't1', text: '學' }],
    blocks: [{ id: 'b1', tokenIds: ['t1'] }],
    marks,
    readings: [],
  };
}

function threeTokenDoc(marks: Mark[] = []): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '子' },
      { id: 't2', text: '曰' },
      { id: 't3', text: '學' },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
    marks,
    readings: [],
  };
}

describe('layoutVertical', () => {
  it('lays out single token with no marks', () => {
    const ctx = new RecordingContext();
    const tree = buildRenderTree(singleTokenDoc(), PROFILES.full);
    const result = layout(tree, ctx);

    expect(result.columns).toHaveLength(1);
    expect(result.columns[0]!.tokens).toHaveLength(1);

    const token = result.columns[0]!.tokens[0]!;
    // baseCenterX = 0 (no ruby) + fontSize/2 = 12
    // tokenX = padding + baseCenterX = 16 + 12 = 28
    expect(token.x).toBe(DEFAULT_PADDING + DEFAULT_FONT_SIZE / 2);
    // tokenY = padding + 0 * cellAdvance + fontSize/2 = 16 + 12 = 28
    expect(token.y).toBe(DEFAULT_PADDING + DEFAULT_FONT_SIZE / 2);
    expect(token.baseChar).toBe('學');
  });

  it('lays out multiple tokens top-to-bottom', () => {
    const ctx = new RecordingContext();
    const tree = buildRenderTree(threeTokenDoc(), PROFILES.full);
    const result = layout(tree, ctx);

    expect(result.columns[0]!.tokens).toHaveLength(3);

    const cellAdvance = DEFAULT_FONT_SIZE * DEFAULT_LINE_HEIGHT;
    const tokens = result.columns[0]!.tokens;

    // All tokens share same x
    expect(tokens[0]!.x).toBe(tokens[1]!.x);
    expect(tokens[1]!.x).toBe(tokens[2]!.x);

    // y positions increment by cellAdvance
    expect(tokens[1]!.y - tokens[0]!.y).toBe(cellAdvance);
    expect(tokens[2]!.y - tokens[1]!.y).toBe(cellAdvance);
  });

  it('places yomigana (ruby) on right side of base', () => {
    const ctx = new RecordingContext();
    const doc = singleTokenDoc([
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まな' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);
    const result = layout(tree, ctx);

    const token = result.columns[0]!.tokens[0]!;
    expect(token.slots.ruby).toBeDefined();
    // ruby x should be to the right of the base character center
    expect(token.slots.ruby!.x).toBeGreaterThan(token.x);
    expect(token.slots.ruby!.fontSize).toBe(Math.round(DEFAULT_FONT_SIZE * DEFAULT_RUBY_RATIO));
    expect(token.slots.ruby!.text).toBe('まな');
  });

  it('places okurigana on right side of base (same column as ruby)', () => {
    const ctx = new RecordingContext();
    const doc = singleTokenDoc([
      { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ぶ' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);
    const result = layout(tree, ctx);

    const token = result.columns[0]!.tokens[0]!;
    expect(token.slots.okuri).toBeDefined();
    // okuri is in rightmost grid column (same as ruby)
    expect(token.slots.okuri!.x).toBeGreaterThan(token.x);
    expect(token.slots.okuri!.fontSize).toBe(Math.round(DEFAULT_FONT_SIZE * DEFAULT_RUBY_RATIO));
  });

  it('places soegana on right side (same column as okuri/ruby)', () => {
    const ctx = new RecordingContext();
    const doc = singleTokenDoc([
      { type: 'soegana', anchor: { from: 't1', to: 't1' }, value: 'は' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);
    const result = layout(tree, ctx);

    const token = result.columns[0]!.tokens[0]!;
    expect(token.slots.soegana).toBeDefined();
    expect(token.slots.soegana!.x).toBeGreaterThan(token.x);
  });

  it('places kaeri on left side with Unicode conversion', () => {
    const ctx = new RecordingContext();
    const doc = threeTokenDoc([
      { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: 'レ' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);
    const result = layout(tree, ctx);

    const t2 = result.columns[0]!.tokens[1]!;
    expect(t2.slots.kaeri).toBeDefined();
    expect(t2.slots.kaeri!.text).toBe('\u3191');
    expect(t2.slots.kaeri!.x).toBeLessThan(t2.x);
  });

  it('places kutoten right of base center (grid row2)', () => {
    const ctx = new RecordingContext();
    const doc = threeTokenDoc([
      { type: 'kutoten', position: { blockId: 'b1', after: 't3' }, value: '。' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);
    const result = layout(tree, ctx);

    const t3 = result.columns[0]!.tokens[2]!;
    expect(t3.slots.kutoten).toBeDefined();
    expect(t3.slots.kutoten!.text).toBe('。');
    // kutoten is in grid row2 (right of base center, left of okuri/ruby)
    expect(t3.slots.kutoten!.x).toBeGreaterThan(t3.x);
  });

  it('handles multiple marks on same token', () => {
    const ctx = new RecordingContext();
    const doc = singleTokenDoc([
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まな' },
      { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ぶ' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '一レ' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);
    const result = layout(tree, ctx);

    const token = result.columns[0]!.tokens[0]!;
    expect(token.slots.ruby).toBeDefined();
    expect(token.slots.okuri).toBeDefined();
    expect(token.slots.kaeri).toBeDefined();
    // Ruby and okuri are on right (same column), kaeri is on left
    expect(token.slots.ruby!.x).toBeGreaterThan(token.x);
    expect(token.slots.okuri!.x).toBeGreaterThan(token.x);
    expect(token.slots.ruby!.x).toBe(token.slots.okuri!.x);
    expect(token.slots.kaeri!.x).toBeLessThan(token.x);
  });

  it('places suffix types in separate grid columns (right to left)', () => {
    const ctx = new RecordingContext();
    const doc = singleTokenDoc([
      { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ぶ' },
      { type: 'kutoten', position: { blockId: 'b1', after: 't1' }, value: '。' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: 'レ' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);
    const result = layout(tree, ctx);

    const token = result.columns[0]!.tokens[0]!;
    const okuriX = token.slots.okuri!.x;
    const kutotenX = token.slots.kutoten!.x;
    const kaeriX = token.slots.kaeri!.x;

    // Grid columns (right to left): okuri(row1) > kutoten(row2) > base > kaeri(row3)
    expect(okuriX).toBeGreaterThan(token.x);
    expect(kutotenX).toBeGreaterThan(token.x);
    expect(kaeriX).toBeLessThan(token.x);

    // okuri > kutoten > kaeri with rubyFontSize spacing
    expect(okuriX).toBeGreaterThan(kutotenX);
    expect(kutotenX).toBeGreaterThan(kaeriX);

    const rubyFontSize = Math.round(DEFAULT_FONT_SIZE * DEFAULT_RUBY_RATIO);
    expect(okuriX - kutotenX).toBe(rubyFontSize);
    expect(kutotenX - kaeriX).toBe(rubyFontSize);
  });

  it('places soegana and okuri in same column (right side)', () => {
    const ctx = new RecordingContext();
    const doc = singleTokenDoc([
      { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'び' },
      { type: 'soegana', anchor: { from: 't1', to: 't1' }, value: 'て' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);
    const result = layout(tree, ctx);

    const token = result.columns[0]!.tokens[0]!;
    // okuri and soegana share the same x (rightmost column)
    expect(token.slots.okuri!.x).toBe(token.slots.soegana!.x);
    // Both are on right side of base
    expect(token.slots.okuri!.x).toBeGreaterThan(token.x);
    // soegana is below okuri (different y)
    expect(token.slots.soegana!.y).toBeGreaterThan(token.slots.okuri!.y);
  });

  it('uses grid model width max(4R, 2R+F) when suffix exists', () => {
    const ctx = new RecordingContext();
    const docPlain = singleTokenDoc();
    const treePlain = buildRenderTree(docPlain, PROFILES.full);
    const resultPlain = layout(treePlain, ctx);

    const ctxMarked = new RecordingContext();
    const docMarked = singleTokenDoc([
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: 'レ' },
    ]);
    const treeMarked = buildRenderTree(docMarked, PROFILES.full);
    const resultMarked = layout(treeMarked, ctxMarked);

    const rubyFontSize = Math.round(DEFAULT_FONT_SIZE * DEFAULT_RUBY_RATIO);
    // Plain: columnWidth = fontSize = 24
    // Marked: columnWidth = max(4*12, 2*12+24) = max(48, 48) = 48
    // Difference = gridWidth - fontSize
    const gridWidth = Math.max(4 * rubyFontSize, 2 * rubyFontSize + DEFAULT_FONT_SIZE);
    expect(resultMarked.width - resultPlain.width).toBe(gridWidth - DEFAULT_FONT_SIZE);
  });

  it('applies custom padding', () => {
    const ctx = new RecordingContext();
    const tree = buildRenderTree(singleTokenDoc(), PROFILES.full);
    const result = layout(tree, ctx, {
      padding: { top: 20, right: 30, bottom: 20, left: 30 },
    });

    const token = result.columns[0]!.tokens[0]!;
    // x offset includes left padding
    expect(token.x).toBe(30 + DEFAULT_FONT_SIZE / 2);
    // y offset includes top padding
    expect(token.y).toBe(20 + DEFAULT_FONT_SIZE / 2);

    // Document dimensions include both paddings
    const column = result.columns[0]!;
    expect(result.width).toBe(30 + column.width + 30);
    expect(result.height).toBe(20 + column.height + 20);
  });

  it('scales with custom fontSize', () => {
    const ctx = new RecordingContext();
    const tree = buildRenderTree(singleTokenDoc(), PROFILES.full);
    const result = layout(tree, ctx, { fontSize: 32 });

    const token = result.columns[0]!.tokens[0]!;
    // With fontSize=32: baseCenterX = 0 + 32/2 = 16
    expect(token.x).toBe(DEFAULT_PADDING + 32 / 2);
  });

  it('computes correct document dimensions', () => {
    const ctx = new RecordingContext();
    const tree = buildRenderTree(threeTokenDoc(), PROFILES.full);
    const result = layout(tree, ctx);

    const cellAdvance = DEFAULT_FONT_SIZE * DEFAULT_LINE_HEIGHT;
    const expectedHeight = DEFAULT_PADDING * 2 + 3 * cellAdvance;

    expect(result.height).toBe(expectedHeight);
    expect(result.width).toBeGreaterThan(0);
    expect(result.columns).toHaveLength(1);
  });

  it('returns empty layout for empty document', () => {
    const ctx = new RecordingContext();
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [],
      blocks: [],
      marks: [],
      readings: [],
    };
    const tree = buildRenderTree(doc, PROFILES.full);
    const result = layout(tree, ctx);

    expect(result.columns).toHaveLength(0);
    expect(result.width).toBe(DEFAULT_PADDING * 2);
    expect(result.height).toBe(DEFAULT_PADDING * 2);
  });

  it('places emphasis on right side (suffix mode, no ruby)', () => {
    const ctx = new RecordingContext();
    const doc = singleTokenDoc([
      { type: 'emphasis', anchor: { from: 't1', to: 't1' } },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: 'レ' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);
    const result = layout(tree, ctx);

    const token = result.columns[0]!.tokens[0]!;
    expect(token.slots.emphasis).toBeDefined();
    // emphasis is in rightmost column (same as ruby/okuri)
    expect(token.slots.emphasis!.x).toBeGreaterThan(token.x);
    const rubyFontSize = Math.round(DEFAULT_FONT_SIZE * DEFAULT_RUBY_RATIO);
    expect(token.slots.emphasis!.fontSize).toBe(rubyFontSize);
  });

  it('places emphasis to right of ruby when both present (suffix mode)', () => {
    const ctx = new RecordingContext();
    const doc = singleTokenDoc([
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まな' },
      { type: 'emphasis', anchor: { from: 't1', to: 't1' } },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: 'レ' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);
    const result = layout(tree, ctx);

    const token = result.columns[0]!.tokens[0]!;
    expect(token.slots.ruby).toBeDefined();
    expect(token.slots.emphasis).toBeDefined();
    // emphasis x = ruby x + rubyFontSize
    const rubyFontSize = Math.round(DEFAULT_FONT_SIZE * DEFAULT_RUBY_RATIO);
    expect(token.slots.emphasis!.x).toBe(token.slots.ruby!.x + rubyFontSize);
  });

  it('places emphasis on right side (no suffix mode)', () => {
    const ctx = new RecordingContext();
    const doc = singleTokenDoc([{ type: 'emphasis', anchor: { from: 't1', to: 't1' } }]);
    const tree = buildRenderTree(doc, PROFILES.full);
    const result = layout(tree, ctx);

    const token = result.columns[0]!.tokens[0]!;
    expect(token.slots.emphasis).toBeDefined();
    expect(token.slots.emphasis!.x).toBeGreaterThan(token.x);
  });

  it('places emphasis right of ruby (no suffix mode)', () => {
    const ctx = new RecordingContext();
    const doc = singleTokenDoc([
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まな' },
      { type: 'emphasis', anchor: { from: 't1', to: 't1' } },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);
    const result = layout(tree, ctx);

    const token = result.columns[0]!.tokens[0]!;
    expect(token.slots.ruby).toBeDefined();
    expect(token.slots.emphasis).toBeDefined();
    const rubyFontSize = Math.round(DEFAULT_FONT_SIZE * DEFAULT_RUBY_RATIO);
    expect(token.slots.emphasis!.x).toBe(token.slots.ruby!.x + rubyFontSize);
  });

  it('places saidoku col4 on left side', () => {
    const ctx = new RecordingContext();
    const doc = singleTokenDoc([
      {
        type: 'saidoku',
        anchor: { from: 't1', to: 't1' },
        forms: [
          { n: 1, yomi: 'まさ', okuri: 'に' },
          { n: 2, yomi: 'はた' },
        ],
      },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);
    const result = layout(tree, ctx);

    const token = result.columns[0]!.tokens[0]!;
    // saidoku triggers hasSuffix via saidokuUnder
    expect(token.slots.ruby).toBeDefined();
    expect(token.slots.okuri).toBeDefined();
    expect(token.slots.saidokuUnder).toBeDefined();
    // saidoku col4 is on the left side (leftmost column)
    expect(token.slots.saidokuUnder!.x).toBeLessThan(token.x);
    // saidokuUnder is to the left of kaeri column
    const rubyFontSize = Math.round(DEFAULT_FONT_SIZE * DEFAULT_RUBY_RATIO);
    const gridWidth = Math.max(4 * rubyFontSize, 2 * rubyFontSize + DEFAULT_FONT_SIZE);
    const col4X = DEFAULT_PADDING + gridWidth - rubyFontSize * 3.5;
    expect(token.slots.saidokuUnder!.x).toBe(col4X);
  });
});
