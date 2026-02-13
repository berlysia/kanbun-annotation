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
    // tokenY = padding + 0 = 16 (トップギャップなし)
    expect(token.y).toBe(DEFAULT_PADDING);
    expect(token.baseChar).toBe('學');
  });

  it('lays out multiple tokens top-to-bottom', () => {
    const ctx = new RecordingContext();
    const tree = buildRenderTree(threeTokenDoc(), PROFILES.full);
    const result = layout(tree, ctx);

    expect(result.columns[0]!.children).toHaveLength(3);

    // cellAdvance = fontSize (lineHeight は列間に影響、文字間には影響しない)
    const cellAdvance = DEFAULT_FONT_SIZE;
    const tokens = result.columns[0]!.children;

    // All tokens share same x
    expect(tokens[0]!.x).toBe(tokens[1]!.x);
    expect(tokens[1]!.x).toBe(tokens[2]!.x);

    // y positions increment by cellAdvance (= fontSize)
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
    // kaeri is in suffix row (below base character)
    expect(t2.slots.kaeri!.y).toBe(t2.y + DEFAULT_FONT_SIZE);
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
    // Y positions: ruby top-aligned, okuri below base (after ruby), kaeri in suffix row
    expect(token.slots.ruby!.y).toBe(token.y);
    // ruby has 2 chars (まな) = 2 * 12 = 24, which equals fontSize, so okuri starts at tokenY + fontSize
    expect(token.slots.okuri!.y).toBe(token.y + DEFAULT_FONT_SIZE);
    // kaeri is in suffix row (below base character)
    expect(token.slots.kaeri!.y).toBe(token.y + DEFAULT_FONT_SIZE);
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

  it('uses adaptive grid width based on hasSaidoku/hasRightColumn', () => {
    const rubyFontSize = Math.round(DEFAULT_FONT_SIZE * DEFAULT_RUBY_RATIO);

    // Plain: columnWidth = F = 24
    const ctxPlain = new RecordingContext();
    const resultPlain = layout(buildRenderTree(singleTokenDoc(), PROFILES.full), ctxPlain);
    expect(resultPlain.columns[0]!.width).toBe(DEFAULT_FONT_SIZE);

    // kaeri only: hasSuffix=true, hasSaidoku=false, hasRightColumn=false → columnWidth = F
    const ctxKaeri = new RecordingContext();
    const docKaeri = singleTokenDoc([
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: 'レ' },
    ]);
    const resultKaeri = layout(buildRenderTree(docKaeri, PROFILES.full), ctxKaeri);
    expect(resultKaeri.columns[0]!.width).toBe(DEFAULT_FONT_SIZE);

    // okuri + kaeri: hasSuffix=true, hasSaidoku=false, hasRightColumn=true → columnWidth = F+R
    const ctxOkuriKaeri = new RecordingContext();
    const docOkuriKaeri = singleTokenDoc([
      { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ぶ' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: 'レ' },
    ]);
    const resultOkuriKaeri = layout(buildRenderTree(docOkuriKaeri, PROFILES.full), ctxOkuriKaeri);
    expect(resultOkuriKaeri.columns[0]!.width).toBe(DEFAULT_FONT_SIZE + rubyFontSize);

    // saidoku: hasSuffix=true, hasSaidoku=true, hasRightColumn=true → columnWidth = R+F+R
    const ctxSaidoku = new RecordingContext();
    const docSaidoku = singleTokenDoc([
      {
        type: 'saidoku',
        anchor: { from: 't1', to: 't1' },
        forms: [
          { n: 1, yomi: 'まさ', okuri: 'に' },
          { n: 2, yomi: 'はた' },
        ],
      },
    ]);
    const resultSaidoku = layout(buildRenderTree(docSaidoku, PROFILES.full), ctxSaidoku);
    expect(resultSaidoku.columns[0]!.width).toBe(rubyFontSize + DEFAULT_FONT_SIZE + rubyFontSize);
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
    // y offset includes top padding (トップギャップなし)
    expect(token.y).toBe(20);

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

    // cellAdvance = fontSize (lineHeight は列間に影響、文字間には影響しない)
    const cellAdvance = DEFAULT_FONT_SIZE;
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
    // emphasis Y is vertically centered on the base character
    expect(token.slots.emphasis!.y).toBe(token.y + (DEFAULT_FONT_SIZE - rubyFontSize) / 2);
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
    // per-token emphasis: ruby の右側 = suffixX + rubyFontSize/2
    const rubyFontSize = Math.round(DEFAULT_FONT_SIZE * DEFAULT_RUBY_RATIO);
    expect(token.slots.emphasis!.x).toBe(token.slots.ruby!.x + rubyFontSize);
    // emphasis Y is vertically centered on the base character
    expect(token.slots.emphasis!.y).toBe(token.y + (DEFAULT_FONT_SIZE - rubyFontSize) / 2);
  });

  it('places emphasis on right side (no suffix mode)', () => {
    const ctx = new RecordingContext();
    const doc = singleTokenDoc([{ type: 'emphasis', anchor: { from: 't1', to: 't1' } }]);
    const tree = buildRenderTree(doc, PROFILES.full);
    const result = layout(tree, ctx);

    const token = asToken(result.columns[0]!.children[0]!);
    expect(token.slots.emphasis).toBeDefined();
    expect(token.slots.emphasis!.x).toBeGreaterThan(token.x);
    const rubyFontSize = Math.round(DEFAULT_FONT_SIZE * DEFAULT_RUBY_RATIO);
    expect(token.slots.emphasis!.y).toBe(token.y + (DEFAULT_FONT_SIZE - rubyFontSize) / 2);
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
    // per-token emphasis: ruby の右側 = suffixX + rubyFontSize/2
    const rubyFontSize = Math.round(DEFAULT_FONT_SIZE * DEFAULT_RUBY_RATIO);
    expect(token.slots.emphasis!.x).toBe(token.slots.ruby!.x + rubyFontSize);
    expect(token.slots.emphasis!.y).toBe(token.y + (DEFAULT_FONT_SIZE - rubyFontSize) / 2);
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

    const rubyFontSize = Math.round(DEFAULT_FONT_SIZE * DEFAULT_RUBY_RATIO);
    const separatorAdvance = rubyFontSize;

    expect(t1.baseChar).toBe('子');
    // separator after t1
    expect(sep.type).toBe('tateten-separator');
    expect(sep.fontSize).toBe(rubyFontSize);
    // t2 after separator
    expect(t2.baseChar).toBe('曰');
    // y increments: t1 → sep (fontSize), sep → t2 (separatorAdvance)
    // sep.y = columnY + fontSize, t1.y = columnY
    // sep.y - t1.y = fontSize
    expect(sep.y - t1.y).toBeCloseTo(DEFAULT_FONT_SIZE, 5);
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

    const rubyFontSize = Math.round(DEFAULT_FONT_SIZE * DEFAULT_RUBY_RATIO);
    const separatorAdvance = rubyFontSize;

    // cellAdvance = fontSize (lineHeight は列間に影響、文字間には影響しない)
    const cellAdvance = DEFAULT_FONT_SIZE;
    // Tateten version: 2 tokens * fontSize + separator(24) + 1 standalone token * cellAdvance
    // Plain version: 3 tokens * cellAdvance
    expect(resultTateten.height - resultPlain.height).toBe(
      2 * DEFAULT_FONT_SIZE + separatorAdvance + cellAdvance - 3 * cellAdvance
    );
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
    // cellAdvance = fontSize (lineHeight は列間に影響、文字間には影響しない)
    const cellAdvance = DEFAULT_FONT_SIZE;

    expect(t1.slots.ruby).toBeDefined();
    // rubySpan=2, so centered over 2 cells
    // spanHeight = 2 * cellAdvance = 48
    // rubyTextHeight = 3 chars * rubyFontSize = 36
    // rubyY = tokenY + (48 - 36) / 2 = tokenY + 6
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
    // cellAdvance = fontSize (lineHeight は列間に影響、文字間には影響しない)
    const cellAdvance = DEFAULT_FONT_SIZE;

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
    // highlight line is on the right side of the column
    expect(hl.x).toBe(column.x + column.width + 2);
    // yStart = columnY = padding
    expect(hl.yStart).toBe(DEFAULT_PADDING);
    // yEnd = columnY + 2 * cellAdvance (2 tokens)
    // cellAdvance = fontSize (lineHeight は列間に影響、文字間には影響しない)
    const cellAdvance = DEFAULT_FONT_SIZE;
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
    // refLayout y is at the highlight start (line start = first character top)
    expect(hl.refLayout!.y).toBe(hl.yStart);
    expect(hl.refLayout!.x).toBe(hl.x + (rubyFontSize * 7) / 8);
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

  // highlight line X: グループ単位の hasRightColumn 判定
  it('moves highlight line closer when group tokens have no kana', () => {
    const ctx = new RecordingContext();
    const rubyFontSize = Math.round(DEFAULT_FONT_SIZE * DEFAULT_RUBY_RATIO);
    const highlightGap = 2;

    // t1-t2: highlight（仮名なし）, t3: yomigana + kaeri（hasRightColumn + hasSuffix を発火）
    const doc = threeTokenDoc([
      { type: 'highlight', anchor: { from: 't1', to: 't2' }, style: 'solid' },
      { type: 'yomigana', anchor: { from: 't3', to: 't3' }, value: 'まな' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't3' }, value: 'レ' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);
    const result = layout(tree, ctx);

    const column = result.columns[0]!;
    expect(column.highlightLines).toBeDefined();
    const hl = column.highlightLines![0]!;

    // グループ内に仮名がないので、rightColumnWidth 分だけ内側に寄る
    // column.width = saidokuWidth(0) + fontSize + rightColumnWidth(rubyFontSize)
    // groupHighlightLineX = column.x + column.width - rubyFontSize + highlightGap
    expect(hl.x).toBe(column.x + column.width - rubyFontSize + highlightGap);
  });

  it('keeps highlight line at normal position when group tokens have kana', () => {
    const ctx = new RecordingContext();
    const highlightGap = 2;

    // t1-t2: highlight + yomigana, t3: kaeri（hasSuffix を発火）
    const doc = threeTokenDoc([
      { type: 'highlight', anchor: { from: 't1', to: 't2' }, style: 'solid' },
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'し' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't3' }, value: 'レ' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);
    const result = layout(tree, ctx);

    const column = result.columns[0]!;
    expect(column.highlightLines).toBeDefined();
    const hl = column.highlightLines![0]!;

    // グループ内に仮名があるので、通常の位置
    expect(hl.x).toBe(column.x + column.width + highlightGap);
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

      // cellAdvance = fontSize (lineHeight は列間に影響、文字間には影響しない)
      const cellAdvance = DEFAULT_FONT_SIZE;
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
      // highlight line X is on the right side of col0
      expect(col0.highlightLines![0]!.x).toBe(col0.x + col0.width + 2);
    });
  });

  // extraRightWidth: emphasis/highlight の追加幅テスト
  describe('extraRightWidth for emphasis/highlight', () => {
    const rubyFontSize = Math.round(DEFAULT_FONT_SIZE * DEFAULT_RUBY_RATIO);
    const highlightGap = 2;

    it('includes extraRightWidth for emphasis-only document', () => {
      const ctx = new RecordingContext();
      const doc = singleTokenDoc([
        { type: 'emphasis', anchor: { from: 't1', to: 't1' }, style: 'sesame' },
      ]);
      const tree = buildRenderTree(doc, PROFILES.full);
      const result = layout(tree, ctx);

      const expectedExtra = rubyFontSize;
      // columnWidth = fontSize (bare), total = padding + (fontSize + extra) + padding
      expect(result.width).toBe(
        DEFAULT_PADDING + DEFAULT_FONT_SIZE + expectedExtra + DEFAULT_PADDING
      );
    });

    it('includes extraRightWidth for highlight-only document', () => {
      const ctx = new RecordingContext();
      const doc = singleTokenDoc([
        { type: 'highlight', anchor: { from: 't1', to: 't1' }, style: 'solid' },
      ]);
      const tree = buildRenderTree(doc, PROFILES.full);
      const result = layout(tree, ctx);

      const expectedExtra = highlightGap;
      expect(result.width).toBe(
        DEFAULT_PADDING + DEFAULT_FONT_SIZE + expectedExtra + DEFAULT_PADDING
      );
    });

    it('includes extraRightWidth for emphasis+highlight document', () => {
      const ctx = new RecordingContext();
      const doc = singleTokenDoc([
        { type: 'highlight', anchor: { from: 't1', to: 't1' }, style: 'solid' },
        { type: 'emphasis', anchor: { from: 't1', to: 't1' }, style: 'sesame' },
      ]);
      const tree = buildRenderTree(doc, PROFILES.full);
      const result = layout(tree, ctx);

      const expectedExtra = 2 * highlightGap + Math.ceil(rubyFontSize / 2);
      expect(result.width).toBe(
        DEFAULT_PADDING + DEFAULT_FONT_SIZE + expectedExtra + DEFAULT_PADDING
      );
    });

    it('no extraRightWidth for plain document', () => {
      const ctx = new RecordingContext();
      const tree = buildRenderTree(singleTokenDoc(), PROFILES.full);
      const result = layout(tree, ctx);

      expect(result.width).toBe(DEFAULT_PADDING + DEFAULT_FONT_SIZE + DEFAULT_PADDING);
    });

    it('includes extraRightWidth for highlight with refLabel', () => {
      const ctx = new RecordingContext();
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [
          { type: 'highlight', anchor: { from: 't1', to: 't1' }, style: 'solid', ref: 'r1' },
          { type: 'ref', id: 'r1', position: { blockId: 'b1', after: 't1' }, label: '注' },
        ],
        readings: [],
      };
      const tree = buildRenderTree(doc, PROFILES.full);
      const result = layout(tree, ctx);

      // label right edge = highlightGap + ceil((11/8) * rubyFontSize)
      const expectedExtra = highlightGap + Math.ceil((rubyFontSize * 11) / 8);
      expect(result.width).toBe(
        DEFAULT_PADDING + DEFAULT_FONT_SIZE + expectedExtra + DEFAULT_PADDING
      );
    });

    it('includes extraRightWidth for highlight+emphasis with refLabel', () => {
      const ctx = new RecordingContext();
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [
          { type: 'highlight', anchor: { from: 't1', to: 't1' }, style: 'solid', ref: 'r1' },
          { type: 'emphasis', anchor: { from: 't1', to: 't1' }, style: 'sesame' },
          { type: 'ref', id: 'r1', position: { blockId: 'b1', after: 't1' }, label: '注' },
        ],
        readings: [],
      };
      const tree = buildRenderTree(doc, PROFILES.full);
      const result = layout(tree, ctx);

      // label right edge > emphasis right edge, so label controls extraRightWidth
      const labelExtra = highlightGap + Math.ceil((rubyFontSize * 11) / 8);
      const emphasisExtra = 2 * highlightGap + Math.ceil(rubyFontSize / 2);
      const expectedExtra = Math.max(labelExtra, emphasisExtra);
      expect(result.width).toBe(
        DEFAULT_PADDING + DEFAULT_FONT_SIZE + expectedExtra + DEFAULT_PADDING
      );
    });

    it('emphasis in highlight-group uses hlEmphasisX (outside highlight line)', () => {
      const ctx = new RecordingContext();
      const doc = singleTokenDoc([
        { type: 'highlight', anchor: { from: 't1', to: 't1' }, style: 'solid' },
        { type: 'emphasis', anchor: { from: 't1', to: 't1' }, style: 'sesame' },
      ]);
      const tree = buildRenderTree(doc, PROFILES.full);
      const result = layout(tree, ctx);

      const token = asToken(result.columns[0]!.children[0]!);
      const column = result.columns[0]!;
      const highlightLineX = column.x + column.width + highlightGap;
      const expectedEmphasisX = highlightLineX + highlightGap / 2 + rubyFontSize / 2;
      expect(token.slots.emphasis).toBeDefined();
      expect(token.slots.emphasis!.x).toBe(expectedEmphasisX);
    });
  });

  // ruby overflow tests
  describe('ruby overflow', () => {
    it('expands cell when ruby+okuri overflow cellAdvance', () => {
      const ctx = new RecordingContext();
      const doc = threeTokenDoc([
        // ruby 4 chars on t1 → exceeds cellAdvance
        { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まなびや' },
        { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ぶ' },
        // trigger suffix mode
        { type: 'kaeri', position: { blockId: 'b1', after: 't3' }, value: 'レ' },
      ]);
      const tree = buildRenderTree(doc, PROFILES.full);
      const result = layout(tree, ctx);

      const rubyFontSize = Math.round(DEFAULT_FONT_SIZE * DEFAULT_RUBY_RATIO);
      // cellAdvance = fontSize (lineHeight は列間に影響、文字間には影響しない)
      const cellAdvance = DEFAULT_FONT_SIZE;

      const t1 = asToken(result.columns[0]!.children[0]!);
      const t2 = asToken(result.columns[0]!.children[1]!);

      // contentHeight = max(fontSize, 4*R) + 1*R
      //               = max(24, 48) + 12 = 60 > 24 = cellAdvance
      const contentHeight = Math.max(DEFAULT_FONT_SIZE, 4 * rubyFontSize) + rubyFontSize;
      expect(contentHeight).toBeGreaterThan(cellAdvance);

      // t2.y - t1.y should be contentHeight (not cellAdvance)
      expect(t2.y - t1.y).toBe(contentHeight);
    });

    it('does not expand cell when ruby fits within cellAdvance', () => {
      const ctx = new RecordingContext();
      const doc = threeTokenDoc([
        // ruby 2 chars on t1 → fits in cellAdvance
        { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まな' },
        // trigger suffix mode
        { type: 'kaeri', position: { blockId: 'b1', after: 't3' }, value: 'レ' },
      ]);
      const tree = buildRenderTree(doc, PROFILES.full);
      const result = layout(tree, ctx);

      // cellAdvance = fontSize (lineHeight は列間に影響、文字間には影響しない)
      const cellAdvance = DEFAULT_FONT_SIZE;

      const t1 = asToken(result.columns[0]!.children[0]!);
      const t2 = asToken(result.columns[0]!.children[1]!);

      // contentHeight = max(24, 24) = 24 = cellAdvance
      // Uses cellAdvance (= fontSize)
      expect(t2.y - t1.y).toBe(cellAdvance);
    });
  });
});

// ============================================================================
// adaptive モードテスト
// ============================================================================

function twoBlockDoc(marks: Mark[] = []): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '子' },
      { id: 't2', text: '曰' },
      { id: 't3', text: '學' },
      { id: 't4', text: '而' },
      { id: 't5', text: '時' },
      { id: 't6', text: '習' },
    ],
    blocks: [
      { id: 'b1', tokenIds: ['t1', 't2', 't3'] },
      { id: 'b2', tokenIds: ['t4', 't5', 't6'] },
    ],
    marks,
    readings: [],
  };
}

describe('adaptive columnSizing', () => {
  it('single block: adaptive and uniform produce identical results', () => {
    const ctx = new RecordingContext();
    const doc = singleTokenDoc([
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'まな' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: 'レ' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);

    const uniformResult = layout(tree, ctx, { columnSizing: 'uniform' });
    const adaptiveResult = layout(tree, ctx, { columnSizing: 'adaptive' });

    expect(adaptiveResult.width).toBe(uniformResult.width);
    expect(adaptiveResult.height).toBe(uniformResult.height);
    expect(adaptiveResult.columns).toHaveLength(1);

    const uToken = asToken(uniformResult.columns[0]!.children[0]!);
    const aToken = asToken(adaptiveResult.columns[0]!.children[0]!);
    expect(aToken.x).toBe(uToken.x);
    expect(aToken.y).toBe(uToken.y);
  });

  it('Block A (no marks) is narrower than Block B (ruby+kaeri) in adaptive', () => {
    const ctx = new RecordingContext();
    const doc = twoBlockDoc([
      { type: 'yomigana', anchor: { from: 't4', to: 't4' }, value: 'しか' },
      { type: 'kaeri', position: { blockId: 'b2', after: 't5' }, value: 'レ' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);

    const adaptiveResult = layout(tree, ctx, { columnSizing: 'adaptive' });
    expect(adaptiveResult.columns).toHaveLength(2);

    // Block A (plain, col[0]=右端) の width < Block B (ruby+kaeri, col[1]=左端) の width
    const colA = adaptiveResult.columns[0]!;
    const colB = adaptiveResult.columns[1]!;
    expect(colA.width).toBeLessThan(colB.width);
    // Block A の width = fontSize のみ
    expect(colA.width).toBe(DEFAULT_FONT_SIZE);
  });

  it('uniform mode: both blocks have same width even with different marks', () => {
    const ctx = new RecordingContext();
    const doc = twoBlockDoc([
      { type: 'yomigana', anchor: { from: 't4', to: 't4' }, value: 'しか' },
      { type: 'kaeri', position: { blockId: 'b2', after: 't5' }, value: 'レ' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);

    const uniformResult = layout(tree, ctx, { columnSizing: 'uniform' });
    expect(uniformResult.columns).toHaveLength(2);

    const colA = uniformResult.columns[0]!;
    const colB = uniformResult.columns[1]!;
    // uniform: both blocks have same width
    expect(colA.width).toBe(colB.width);
  });

  it('adaptive: emphasis extraRightWidth differs per block', () => {
    const ctx = new RecordingContext();
    const doc = twoBlockDoc([
      // Block A: emphasis only
      { type: 'emphasis', anchor: { from: 't1', to: 't1' } },
      // Block B: plain
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);

    const adaptiveResult = layout(tree, ctx, { columnSizing: 'adaptive' });
    const uniformResult = layout(tree, ctx, { columnSizing: 'uniform' });

    // adaptive: Block A has extraRightWidth, Block B does not
    // so adaptive total width < uniform total width
    expect(adaptiveResult.width).toBeLessThan(uniformResult.width);
  });

  it('adaptive: total width is sum of per-block fullColumnWidths + gaps', () => {
    const ctx = new RecordingContext();
    const doc = twoBlockDoc([
      { type: 'yomigana', anchor: { from: 't4', to: 't4' }, value: 'しか' },
      { type: 'kaeri', position: { blockId: 'b2', after: 't5' }, value: 'レ' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);

    const adaptiveResult = layout(tree, ctx, { columnSizing: 'adaptive' });
    const uniformResult = layout(tree, ctx, { columnSizing: 'uniform' });

    // adaptive: Block A is narrower → total width is smaller than uniform
    expect(adaptiveResult.width).toBeLessThan(uniformResult.width);
  });
});
