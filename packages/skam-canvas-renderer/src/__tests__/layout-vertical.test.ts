import { describe, it, expect } from 'vitest';
import type { SKAMDocument, Mark } from '@kanbun/skam';
import { buildRenderTree } from '../render-tree.js';
import { layout } from '../layout.js';
import { PROFILES } from '../profiles.js';
import { RecordingContext } from './recording-context.js';
import type { ColumnChild, TokenLayout, TatetenSeparatorLayout } from '../types.js';

/** Narrow ColumnChild to TokenLayout for test assertions */
function asToken(child: ColumnChild): TokenLayout {
  if (child.type !== 'token') throw new Error(`Expected token, got ${child.type}`);
  return child;
}

/** Narrow ColumnChild to TatetenSeparatorLayout for test assertions */
function asSep(child: ColumnChild): TatetenSeparatorLayout {
  if (child.type !== 'tateten-separator')
    throw new Error(`Expected tateten-separator, got ${child.type}`);
  return child;
}

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
    expect(result.columns[0]!.children).toHaveLength(1);

    const token = asToken(result.columns[0]!.children[0]!);
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

    expect(result.columns[0]!.children).toHaveLength(3);

    const cellAdvance = DEFAULT_FONT_SIZE * DEFAULT_LINE_HEIGHT;
    const tokens = result.columns[0]!.children;

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

    const token = asToken(result.columns[0]!.children[0]!);
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

    const token = asToken(result.columns[0]!.children[0]!);
    expect(token.slots.okuri).toBeDefined();
    // okuri is in rightmost grid column (same as ruby)
    expect(token.slots.okuri!.x).toBeGreaterThan(token.x);
    expect(token.slots.okuri!.fontSize).toBe(Math.round(DEFAULT_FONT_SIZE * DEFAULT_RUBY_RATIO));
    // okuri starts at the bottom of the base character
    expect(token.slots.okuri!.y).toBe(token.y + DEFAULT_FONT_SIZE);
  });

  it('places soegana on right side (same column as okuri/ruby)', () => {
    const ctx = new RecordingContext();
    const doc = singleTokenDoc([
      { type: 'soegana', anchor: { from: 't1', to: 't1' }, value: 'は' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);
    const result = layout(tree, ctx);

    const token = asToken(result.columns[0]!.children[0]!);
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

    const t2 = asToken(result.columns[0]!.children[1]!);
    expect(t2.slots.kaeri).toBeDefined();
    expect(t2.slots.kaeri!.text).toBe('\u3191');
    expect(t2.slots.kaeri!.x).toBeLessThan(t2.x);
    // kaeri is bottom-aligned with base character
    const rubyFontSize = Math.round(DEFAULT_FONT_SIZE * DEFAULT_RUBY_RATIO);
    expect(t2.slots.kaeri!.y).toBe(t2.y + DEFAULT_FONT_SIZE - rubyFontSize);
  });

  it('places kutoten right of base center (grid row2)', () => {
    const ctx = new RecordingContext();
    const doc = threeTokenDoc([
      { type: 'kutoten', position: { blockId: 'b1', after: 't3' }, value: '。' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);
    const result = layout(tree, ctx);

    const t3 = asToken(result.columns[0]!.children[2]!);
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

    const rubyFontSize = Math.round(DEFAULT_FONT_SIZE * DEFAULT_RUBY_RATIO);
    const token = asToken(result.columns[0]!.children[0]!);
    expect(token.slots.ruby).toBeDefined();
    expect(token.slots.okuri).toBeDefined();
    expect(token.slots.kaeri).toBeDefined();
    // Ruby and okuri are on right (same column), kaeri is on left
    expect(token.slots.ruby!.x).toBeGreaterThan(token.x);
    expect(token.slots.okuri!.x).toBeGreaterThan(token.x);
    expect(token.slots.ruby!.x).toBe(token.slots.okuri!.x);
    expect(token.slots.kaeri!.x).toBeLessThan(token.x);
    // Y positions: ruby top-aligned, okuri below base (after ruby), kaeri bottom-aligned
    expect(token.slots.ruby!.y).toBe(token.y);
    // ruby has 2 chars (まな) = 2 * 12 = 24, which equals fontSize, so okuri starts at tokenY + fontSize
    expect(token.slots.okuri!.y).toBe(token.y + DEFAULT_FONT_SIZE);
    // kaeri "一レ" → 2 Unicode chars: height = 2 * rubyFontSize = fontSize, so bottom-aligned = tokenY
    expect(token.slots.kaeri!.y).toBe(token.y + DEFAULT_FONT_SIZE - 2 * rubyFontSize);
  });

  it('places suffix types with kutoten below base', () => {
    const ctx = new RecordingContext();
    const doc = singleTokenDoc([
      { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ぶ' },
      { type: 'kutoten', position: { blockId: 'b1', after: 't1' }, value: '。' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: 'レ' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);
    const result = layout(tree, ctx);

    const token = asToken(result.columns[0]!.children[0]!);
    const okuriX = token.slots.okuri!.x;
    const kutotenX = token.slots.kutoten!.x;
    const kutotenY = token.slots.kutoten!.y;
    const kaeriX = token.slots.kaeri!.x;

    const rubyFontSize = Math.round(DEFAULT_FONT_SIZE * DEFAULT_RUBY_RATIO);

    // okuri は base の右側、kaeri は base の左側
    expect(okuriX).toBeGreaterThan(token.x);
    expect(kaeriX).toBeLessThan(token.x);

    // kutoten は base の下方に配置
    expect(kutotenY).toBe(token.y + DEFAULT_FONT_SIZE);
    // kutoten のフォントサイズは fontSize（rubyFontSize ではない）
    expect(token.slots.kutoten!.fontSize).toBe(DEFAULT_FONT_SIZE);
    // kutoten X = rightColX - rubyFontSize
    const columnX = result.columns[0]!.x;
    const columnWidth = result.columns[0]!.width;
    const rightColX = columnX + columnWidth - rubyFontSize / 2;
    expect(kutotenX).toBe(rightColX - rubyFontSize);
  });

  it('places soegana and okuri in same column (right side)', () => {
    const ctx = new RecordingContext();
    const doc = singleTokenDoc([
      { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'び' },
      { type: 'soegana', anchor: { from: 't1', to: 't1' }, value: 'て' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);
    const result = layout(tree, ctx);

    const rubyFontSize = Math.round(DEFAULT_FONT_SIZE * DEFAULT_RUBY_RATIO);
    const token = asToken(result.columns[0]!.children[0]!);
    // okuri and soegana share the same x (rightmost column)
    expect(token.slots.okuri!.x).toBe(token.slots.soegana!.x);
    // Both are on right side of base
    expect(token.slots.okuri!.x).toBeGreaterThan(token.x);
    // okuri starts at bottom of base character
    expect(token.slots.okuri!.y).toBe(token.y + DEFAULT_FONT_SIZE);
    // soegana is below okuri
    expect(token.slots.soegana!.y).toBe(token.y + DEFAULT_FONT_SIZE + rubyFontSize);
  });

  it('uses grid width 3R+F when suffix exists', () => {
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
    // Marked: columnWidth = 3R + F = 3*12 + 24 = 60
    // Difference = gridWidth - fontSize
    const gridWidth = 3 * rubyFontSize + DEFAULT_FONT_SIZE;
    expect(resultMarked.width - resultPlain.width).toBe(gridWidth - DEFAULT_FONT_SIZE);
  });

  it('applies custom padding', () => {
    const ctx = new RecordingContext();
    const tree = buildRenderTree(singleTokenDoc(), PROFILES.full);
    const result = layout(tree, ctx, {
      padding: { top: 20, right: 30, bottom: 20, left: 30 },
    });

    const token = asToken(result.columns[0]!.children[0]!);
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

    const token = asToken(result.columns[0]!.children[0]!);
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

    const token = asToken(result.columns[0]!.children[0]!);
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

    const token = asToken(result.columns[0]!.children[0]!);
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

    const token = asToken(result.columns[0]!.children[0]!);
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

    const token = asToken(result.columns[0]!.children[0]!);
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

    const token = asToken(result.columns[0]!.children[0]!);
    // saidoku triggers hasSuffix via saidokuUnder
    expect(token.slots.ruby).toBeDefined();
    expect(token.slots.okuri).toBeDefined();
    expect(token.slots.saidokuUnder).toBeDefined();
    // saidoku col4 is on the left side (leftmost column)
    expect(token.slots.saidokuUnder!.x).toBeLessThan(token.x);
    // saidokuUnder is in the leftmost column (col4)
    const rubyFontSize = Math.round(DEFAULT_FONT_SIZE * DEFAULT_RUBY_RATIO);
    const col4X = DEFAULT_PADDING + rubyFontSize / 2;
    expect(token.slots.saidokuUnder!.x).toBe(col4X);
  });

  // tateten layout
  it('lays out tateten group with token + separator + token', () => {
    const ctx = new RecordingContext();
    const doc = threeTokenDoc([{ type: 'tateten', anchor: { from: 't1', to: 't2' } }]);
    const tree = buildRenderTree(doc, PROFILES.full);
    const result = layout(tree, ctx);

    const children = result.columns[0]!.children;
    // 2 tokens from group + 1 separator + 1 standalone token = 4 children
    expect(children).toHaveLength(4);

    const t1 = asToken(children[0]!);
    const sep = asSep(children[1]!);
    const t2 = asToken(children[2]!);
    const t3 = asToken(children[3]!);

    const cellAdvance = DEFAULT_FONT_SIZE * DEFAULT_LINE_HEIGHT;
    const rubyFontSize = Math.round(DEFAULT_FONT_SIZE * DEFAULT_RUBY_RATIO);
    const separatorAdvance = 2 * DEFAULT_RUBY_RATIO * DEFAULT_FONT_SIZE;

    // t1 at y = padding + fontSize/2
    expect(t1.baseChar).toBe('子');
    // separator after t1
    expect(sep.type).toBe('tateten-separator');
    expect(sep.fontSize).toBe(rubyFontSize);
    // t2 after separator
    expect(t2.baseChar).toBe('曰');
    // y increments: t1 → sep (cellAdvance), sep → t2 (separatorAdvance)
    expect(sep.y - t1.y).toBeCloseTo(cellAdvance - DEFAULT_FONT_SIZE / 2 + separatorAdvance / 2, 5);
    // t3 is standalone, after the group
    expect(t3.baseChar).toBe('學');
  });

  it('tateten separator has correct height contribution to column', () => {
    const ctx = new RecordingContext();
    const docPlain = threeTokenDoc();
    const treePlain = buildRenderTree(docPlain, PROFILES.full);
    const resultPlain = layout(treePlain, ctx);

    const ctxTateten = new RecordingContext();
    const docTateten = threeTokenDoc([{ type: 'tateten', anchor: { from: 't1', to: 't2' } }]);
    const treeTateten = buildRenderTree(docTateten, PROFILES.full);
    const resultTateten = layout(treeTateten, ctxTateten);

    const separatorAdvance = 2 * DEFAULT_RUBY_RATIO * DEFAULT_FONT_SIZE;

    // Tateten version is taller by one separator
    expect(resultTateten.height - resultPlain.height).toBe(separatorAdvance);
  });

  // rubySpan layout
  it('centers ruby across 2 cells when rubySpan=2 (suffix mode)', () => {
    const ctx = new RecordingContext();
    const doc = threeTokenDoc([
      // range yomigana spanning t1-t2
      { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'しいわ' },
      // suffix mark to trigger suffix mode
      { type: 'kaeri', position: { blockId: 'b1', after: 't3' }, value: 'レ' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);
    const result = layout(tree, ctx);

    const t1 = asToken(result.columns[0]!.children[0]!);
    const rubyFontSize = Math.round(DEFAULT_FONT_SIZE * DEFAULT_RUBY_RATIO);
    const cellAdvance = DEFAULT_FONT_SIZE * DEFAULT_LINE_HEIGHT;

    expect(t1.slots.ruby).toBeDefined();
    // rubySpan=2, so centered over 2 cells
    // spanHeight = 2 * cellAdvance = 96
    // rubyTextHeight = 3 chars * rubyFontSize = 36
    // rubyY = tokenY + (96 - 36) / 2 = tokenY + 30
    const spanHeight = 2 * cellAdvance;
    const rubyTextHeight = 3 * rubyFontSize;
    const expectedRubyY = t1.y + (spanHeight - rubyTextHeight) / 2;
    expect(t1.slots.ruby!.y).toBe(expectedRubyY);
  });

  it('centers ruby across 3 cells when rubySpan=3 (no suffix mode)', () => {
    const ctx = new RecordingContext();
    const doc = threeTokenDoc([
      { type: 'yomigana', anchor: { from: 't1', to: 't3' }, value: 'ろんご' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);
    const result = layout(tree, ctx);

    const t1 = asToken(result.columns[0]!.children[0]!);
    const rubyFontSize = Math.round(DEFAULT_FONT_SIZE * DEFAULT_RUBY_RATIO);
    const cellAdvance = DEFAULT_FONT_SIZE * DEFAULT_LINE_HEIGHT;

    expect(t1.slots.ruby).toBeDefined();
    const spanHeight = 3 * cellAdvance;
    const rubyTextHeight = 3 * rubyFontSize;
    const expectedRubyY = t1.y + (spanHeight - rubyTextHeight) / 2;
    expect(t1.slots.ruby!.y).toBe(expectedRubyY);
  });

  it('does not offset ruby for single-token yomigana (no rubySpan)', () => {
    const ctx = new RecordingContext();
    const doc = singleTokenDoc([
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まな' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: 'レ' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);
    const result = layout(tree, ctx);

    const token = asToken(result.columns[0]!.children[0]!);
    // Single token: ruby y = token y (no centering offset)
    expect(token.slots.ruby!.y).toBe(token.y);
  });

  // highlight layout
  it('generates highlightLines for highlight group', () => {
    const ctx = new RecordingContext();
    const doc = threeTokenDoc([
      { type: 'highlight', anchor: { from: 't1', to: 't2' }, style: 'solid' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);
    const result = layout(tree, ctx);

    const column = result.columns[0]!;
    expect(column.highlightLines).toBeDefined();
    expect(column.highlightLines).toHaveLength(1);
    const hl = column.highlightLines![0]!;
    expect(hl.style).toBe('solid');
    // yStart = columnY = padding
    expect(hl.yStart).toBe(DEFAULT_PADDING);
    // yEnd = columnY + 2 * cellAdvance (2 tokens)
    const cellAdvance = DEFAULT_FONT_SIZE * DEFAULT_LINE_HEIGHT;
    expect(hl.yEnd).toBe(DEFAULT_PADDING + 2 * cellAdvance);
  });

  it('does not generate highlightLines when no highlight groups', () => {
    const ctx = new RecordingContext();
    const tree = buildRenderTree(threeTokenDoc(), PROFILES.full);
    const result = layout(tree, ctx);

    expect(result.columns[0]!.highlightLines).toBeUndefined();
  });

  it('places kaeri on tateten separator', () => {
    const ctx = new RecordingContext();
    const doc = threeTokenDoc([
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '一レ' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);
    const result = layout(tree, ctx);

    const sep = asSep(result.columns[0]!.children[1]!);
    // separator should have kaeri slot with 一 (non-レ part)
    expect(sep.kaeri).toBeDefined();
    expect(sep.kaeri!.text).toBe('\u3192');
  });

  // ref layout
  it('places ref slot above the base character', () => {
    const ctx = new RecordingContext();
    const doc = threeTokenDoc([
      {
        type: 'ref',
        id: 'r1',
        position: { blockId: 'b1', after: 't2' },
        label: '※',
      },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);
    const result = layout(tree, ctx);

    const t2 = asToken(result.columns[0]!.children[1]!);
    const rubyFontSize = Math.round(DEFAULT_FONT_SIZE * DEFAULT_RUBY_RATIO);
    expect(t2.slots.ref).toBeDefined();
    expect(t2.slots.ref!.text).toBe('※');
    expect(t2.slots.ref!.fontSize).toBe(rubyFontSize);
    // ref y is above the token top: tokenY - 1 char * rubyFontSize
    expect(t2.slots.ref!.y).toBe(t2.y - rubyFontSize);
    // ref x is at token x (baseCenterX)
    expect(t2.slots.ref!.x).toBe(t2.x);
  });

  it('places highlight-ref refLayout above highlight group start', () => {
    const ctx = new RecordingContext();
    const doc = threeTokenDoc([
      { type: 'highlight', anchor: { from: 't1', to: 't2' }, style: 'solid', ref: 'r1' },
      {
        type: 'ref',
        id: 'r1',
        position: { blockId: 'b1', after: 't2' },
        label: '注',
      },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);
    const result = layout(tree, ctx);

    const column = result.columns[0]!;
    expect(column.highlightLines).toBeDefined();
    expect(column.highlightLines).toHaveLength(1);
    const hl = column.highlightLines![0]!;
    expect(hl.refLayout).toBeDefined();
    expect(hl.refLayout!.text).toBe('注');
    const rubyFontSize = Math.round(DEFAULT_FONT_SIZE * DEFAULT_RUBY_RATIO);
    expect(hl.refLayout!.fontSize).toBe(rubyFontSize);
    // refLayout y is above the highlight start: yStart - 1 char * rubyFontSize
    expect(hl.refLayout!.y).toBe(hl.yStart - rubyFontSize);
    expect(hl.refLayout!.x).toBe(hl.x);
  });

  it('highlight line has no refLayout when no refLabel', () => {
    const ctx = new RecordingContext();
    const doc = threeTokenDoc([
      { type: 'highlight', anchor: { from: 't1', to: 't2' }, style: 'solid' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);
    const result = layout(tree, ctx);

    const column = result.columns[0]!;
    expect(column.highlightLines).toBeDefined();
    expect(column.highlightLines![0]!.refLayout).toBeUndefined();
  });

  // multi-block (multi-column) layout
  describe('multi-block layout', () => {
    const DEFAULT_COLUMN_GAP = 16;

    function twoBlockDoc(marks: Mark[] = []): SKAMDocument {
      return {
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
        marks,
        readings: [],
      };
    }

    it('creates separate columns for each block', () => {
      const ctx = new RecordingContext();
      const tree = buildRenderTree(twoBlockDoc(), PROFILES.full);
      const result = layout(tree, ctx);

      expect(result.columns).toHaveLength(2);
      expect(result.columns[0]!.children).toHaveLength(2);
      expect(result.columns[1]!.children).toHaveLength(2);
    });

    it('arranges columns right-to-left (first block is rightmost)', () => {
      const ctx = new RecordingContext();
      const tree = buildRenderTree(twoBlockDoc(), PROFILES.full);
      const result = layout(tree, ctx);

      expect(result.columns[0]!.x).toBeGreaterThan(result.columns[1]!.x);
    });

    it('applies columnGap between columns', () => {
      const ctx = new RecordingContext();
      const tree = buildRenderTree(twoBlockDoc(), PROFILES.full);
      const result = layout(tree, ctx);

      const col0 = result.columns[0]!;
      const col1 = result.columns[1]!;
      // Gap = col0.x - (col1.x + col1.width)
      expect(col0.x - (col1.x + col1.width)).toBe(DEFAULT_COLUMN_GAP);
    });

    it('computes document width for multi-block', () => {
      const ctx = new RecordingContext();
      const tree = buildRenderTree(twoBlockDoc(), PROFILES.full);
      const result = layout(tree, ctx);

      const colWidth = result.columns[0]!.width;
      const expectedWidth = DEFAULT_PADDING + 2 * colWidth + DEFAULT_COLUMN_GAP + DEFAULT_PADDING;
      expect(result.width).toBe(expectedWidth);
    });

    it('columns have independent heights', () => {
      const ctx = new RecordingContext();
      const tree = buildRenderTree(twoBlockDoc(), PROFILES.full);
      const result = layout(tree, ctx);

      const cellAdvance = DEFAULT_FONT_SIZE * DEFAULT_LINE_HEIGHT;
      expect(result.columns[0]!.height).toBe(2 * cellAdvance);
      expect(result.columns[1]!.height).toBe(2 * cellAdvance);
    });

    it('places highlight lines relative to their column in multi-block', () => {
      const ctx = new RecordingContext();
      const doc = twoBlockDoc([
        { type: 'highlight', anchor: { from: 't1', to: 't2' }, style: 'solid' },
      ]);
      const tree = buildRenderTree(doc, PROFILES.full);
      const result = layout(tree, ctx);

      const col0 = result.columns[0]!;
      expect(col0.highlightLines).toBeDefined();
      expect(col0.highlightLines).toHaveLength(1);
      // highlight line X is relative to col0.x
      expect(col0.highlightLines![0]!.x).toBe(col0.x - 2);
    });
  });
});
