import { describe, it, expect } from 'vitest';
import type { SKAMDocument, Mark, Token, HighlightMark, RefMark } from '@kanbun/skam';
import { buildBlockRenderTree } from '../build-render-tree.js';
import type { BuildTreeContext } from '../build-render-tree.js';
import {
  resolveRefValues,
  getTatetenGroups,
  getHighlightGroups,
  getRangeMarkGroups,
} from '@kanbun/skam/rendering';
import type { RenderProfile } from '../render-config.js';
import type { TokenItem, TatetenGroupNode, HighlightGroupNode } from '../render-tree-types.js';

// ============================================================================
// Helpers
// ============================================================================

const FULL_PROFILE: RenderProfile = {
  yomigana: true,
  okurigana: true,
  kaeriten: true,
  kutoten: true,
  saidoku: true,
  okototen: true,
  tateten: true,
  emphasis: true,
  okimoji: true,
  joji: true,
  soegana: true,
  highlight: true,
  ref: true,
};

function createBuildCtx(
  doc: SKAMDocument,
  profileOverrides: Partial<RenderProfile> = {}
): BuildTreeContext {
  const { tokens, marks } = doc;
  const profile = { ...FULL_PROFILE, ...profileOverrides };
  const refValueMap = profile.ref ? resolveRefValues(tokens, marks) : new Map<RefMark, string>();
  const tatetenGroups = getTatetenGroups(tokens, marks);
  const highlightGroups = profile.highlight
    ? getHighlightGroups(tokens, marks)
    : new Map<string, HighlightMark>();

  const highlightRefIds = new Set<string>();
  if (profile.highlight) {
    const highlightMarks = marks.filter((m): m is HighlightMark => m.type === 'highlight');
    for (const hl of highlightMarks) {
      if (hl.ref) highlightRefIds.add(hl.ref);
    }
  }

  const yomiganaRangeGroups = profile.yomigana
    ? getRangeMarkGroups(tokens, marks, 'yomigana')
    : new Map();
  const okuriganaRangeGroups = profile.okurigana
    ? getRangeMarkGroups(tokens, marks, 'okurigana')
    : new Map();
  const soeganaRangeGroups = profile.soegana
    ? getRangeMarkGroups(tokens, marks, 'soegana')
    : new Map();

  return {
    prefix: 'skam',
    profile,
    tokens,
    marks,
    refValueMap,
    highlightRefIds,
    tatetenGroups,
    highlightGroups,
    yomiganaRangeGroups,
    okuriganaRangeGroups,
    soeganaRangeGroups,
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

function blockTokens(doc: SKAMDocument): Token[] {
  const tokenMap = new Map(doc.tokens.map((t) => [t.id, t]));
  const block = doc.blocks[0]!;
  return block.tokenIds.map((id) => tokenMap.get(id)!);
}

// ============================================================================
// Tests
// ============================================================================

describe('buildBlockRenderTree', () => {
  describe('basic cases', () => {
    it('single token no marks → 1 TokenItem', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '子' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [],
        readings: [],
      };
      const ctx = createBuildCtx(doc);
      const tree = buildBlockRenderTree('b1', blockTokens(doc), ctx);

      expect(tree.blockId).toBe('b1');
      expect(tree.blockStartHtml).toBe('');
      expect(tree.items).toHaveLength(1);
      expect(tree.items[0]!.type).toBe('token');
    });

    it('multiple tokens no marks → flat TokenItem list', () => {
      const doc = threeTokenDoc();
      const ctx = createBuildCtx(doc);
      const tree = buildBlockRenderTree('b1', blockTokens(doc), ctx);

      expect(tree.items).toHaveLength(3);
      expect(tree.items.every((n) => n.type === 'token')).toBe(true);
      expect((tree.items[0] as TokenItem).token.text).toBe('子');
      expect((tree.items[1] as TokenItem).token.text).toBe('曰');
      expect((tree.items[2] as TokenItem).token.text).toBe('學');
    });

    it('empty block → empty items', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [],
        blocks: [{ id: 'b1', tokenIds: [] }],
        marks: [],
        readings: [],
      };
      const ctx = createBuildCtx(doc);
      const tree = buildBlockRenderTree('b1', [], ctx);

      expect(tree.blockId).toBe('b1');
      expect(tree.blockStartHtml).toBe('');
      expect(tree.items).toHaveLength(0);
    });
  });

  describe('range merge', () => {
    it('3-token yomigana range → 1 TokenItem with rangeCtx', () => {
      const doc = threeTokenDoc([
        { type: 'yomigana', anchor: { from: 't1', to: 't3' }, value: 'しのたまわく' },
      ]);
      const ctx = createBuildCtx(doc);
      const tree = buildBlockRenderTree('b1', blockTokens(doc), ctx);

      // Range merge: 3 tokens → 1 TokenItem
      expect(tree.items).toHaveLength(1);
      const item = tree.items[0] as TokenItem;
      expect(item.type).toBe('token');
      expect(item.token.id).toBe('t1');
      expect(item.rangeCtx).toBeDefined();
      expect(item.rangeCtx!.yomiganaBaseText).toBe('子曰學');
      expect(item.rangeCtx!.rangeTokenInfo).toEqual({ from: 't1', to: 't3' });
    });

    it('okurigana range collects value', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [
          { id: 't1', text: '相' },
          { id: 't2', text: '見' },
        ],
        blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
        marks: [{ type: 'okurigana', anchor: { from: 't1', to: 't2' }, value: 'る' }],
        readings: [],
      };
      const ctx = createBuildCtx(doc);
      const tree = buildBlockRenderTree('b1', blockTokens(doc), ctx);

      expect(tree.items).toHaveLength(1);
      const item = tree.items[0] as TokenItem;
      expect(item.rangeCtx).toBeDefined();
      expect(item.rangeCtx!.okuriganaBaseText).toBe('相見');
      expect(item.rangeCtx!.okuriganaValue).toBe('る');
    });

    it('trailing marks collected from merged tokens', () => {
      const doc = threeTokenDoc([
        { type: 'yomigana', anchor: { from: 't1', to: 't3' }, value: 'しのたまわく' },
        { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: 'レ' },
      ]);
      const ctx = createBuildCtx(doc);
      const tree = buildBlockRenderTree('b1', blockTokens(doc), ctx);

      expect(tree.items).toHaveLength(1);
      const item = tree.items[0] as TokenItem;
      expect(item.rangeCtx!.trailingKaeriMarks).toHaveLength(1);
      expect(item.rangeCtx!.trailingKaeriMarks![0]!.value).toBe('レ');
    });
  });

  describe('tateten groups', () => {
    it('2-token tateten → TatetenGroupNode', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [
          { id: 't1', text: '春' },
          { id: 't2', text: '風' },
          { id: 't3', text: '吹' },
        ],
        blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
        marks: [{ type: 'tateten', anchor: { from: 't1', to: 't2' } }],
        readings: [],
      };
      const ctx = createBuildCtx(doc);
      const tree = buildBlockRenderTree('b1', blockTokens(doc), ctx);

      expect(tree.items).toHaveLength(2);
      const group = tree.items[0] as TatetenGroupNode;
      expect(group.type).toBe('tateten-group');
      expect(group.items).toHaveLength(2);
      expect(group.items[0]!.token.text).toBe('春');
      expect(group.items[1]!.token.text).toBe('風');
      expect(tree.items[1]!.type).toBe('token');
    });

    it('profile.tateten=false → no TatetenGroupNode', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [
          { id: 't1', text: '春' },
          { id: 't2', text: '風' },
        ],
        blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
        marks: [{ type: 'tateten', anchor: { from: 't1', to: 't2' } }],
        readings: [],
      };
      const ctx = createBuildCtx(doc, { tateten: false });
      const tree = buildBlockRenderTree('b1', blockTokens(doc), ctx);

      expect(tree.items).toHaveLength(2);
      expect(tree.items.every((n) => n.type === 'token')).toBe(true);
    });
  });

  describe('highlight groups', () => {
    it('3-token highlight → HighlightGroupNode', () => {
      const doc = threeTokenDoc([
        { type: 'highlight', id: 'h1', anchor: { from: 't1', to: 't3' }, style: 'wavy' },
      ]);
      const ctx = createBuildCtx(doc);
      const tree = buildBlockRenderTree('b1', blockTokens(doc), ctx);

      expect(tree.items).toHaveLength(1);
      const group = tree.items[0] as HighlightGroupNode;
      expect(group.type).toBe('highlight-group');
      expect(group.highlight.style).toBe('wavy');
      expect(group.items).toHaveLength(3);
    });

    it('highlight with nested tateten', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [
          { id: 't1', text: '春' },
          { id: 't2', text: '風' },
          { id: 't3', text: '吹' },
        ],
        blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
        marks: [
          { type: 'highlight', id: 'h1', anchor: { from: 't1', to: 't3' } },
          { type: 'tateten', anchor: { from: 't1', to: 't2' } },
        ],
        readings: [],
      };
      const ctx = createBuildCtx(doc);
      const tree = buildBlockRenderTree('b1', blockTokens(doc), ctx);

      expect(tree.items).toHaveLength(1);
      const hlGroup = tree.items[0] as HighlightGroupNode;
      expect(hlGroup.type).toBe('highlight-group');
      // Should contain: TatetenGroupNode(t1, t2), TokenItem(t3)
      expect(hlGroup.items).toHaveLength(2);
      expect(hlGroup.items[0]!.type).toBe('tateten-group');
      expect(hlGroup.items[1]!.type).toBe('token');
    });

    it('profile.highlight=false → no HighlightGroupNode', () => {
      const doc = threeTokenDoc([
        { type: 'highlight', id: 'h1', anchor: { from: 't1', to: 't3' } },
      ]);
      const ctx = createBuildCtx(doc, { highlight: false });
      const tree = buildBlockRenderTree('b1', blockTokens(doc), ctx);

      expect(tree.items).toHaveLength(3);
      expect(tree.items.every((n) => n.type === 'token')).toBe(true);
    });

    it('highlight with ref → refHtml populated', () => {
      const doc = threeTokenDoc([
        { type: 'highlight', id: 'h1', anchor: { from: 't1', to: 't3' }, ref: 'r1' },
        { type: 'ref', id: 'r1', position: { blockId: 'b1', after: 't3' }, format: 'alpha-upper' },
      ]);
      const ctx = createBuildCtx(doc);
      const tree = buildBlockRenderTree('b1', blockTokens(doc), ctx);

      const hlGroup = tree.items[0] as HighlightGroupNode;
      expect(hlGroup.refHtml).toContain('(A)');
    });
  });

  describe('block start marks', () => {
    it('ref mark at block start → blockStartHtml contains ref span', () => {
      const doc = threeTokenDoc([
        { type: 'ref', id: 'r1', position: { blockId: 'b1' }, format: 'alpha-upper' },
      ]);
      const ctx = createBuildCtx(doc);
      const tree = buildBlockRenderTree('b1', blockTokens(doc), ctx);

      expect(tree.blockStartHtml).toContain('skam-ref');
      expect(tree.blockStartHtml).toContain('(A)');
    });

    it('kutoten at block start → blockStartHtml contains kutoten span', () => {
      const doc = threeTokenDoc([{ type: 'kutoten', position: { blockId: 'b1' }, value: '。' }]);
      const ctx = createBuildCtx(doc);
      const tree = buildBlockRenderTree('b1', blockTokens(doc), ctx);

      expect(tree.blockStartHtml).toContain('skam-suffix-kutoten');
      expect(tree.blockStartHtml).toContain('。');
    });
  });

  describe('compound cases', () => {
    it('range + tateten overlap: items kept separate, rangeCtx on group', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [
          { id: 't1', text: '春' },
          { id: 't2', text: '風' },
        ],
        blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
        marks: [
          { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'はるかぜ' },
          { type: 'tateten', anchor: { from: 't1', to: 't2' } },
        ],
        readings: [],
      };
      const ctx = createBuildCtx(doc);
      const tree = buildBlockRenderTree('b1', blockTokens(doc), ctx);

      // tateten + 読み重複時: 後続トークンは skip されず個別 items に残る
      expect(tree.items).toHaveLength(1);
      const node = tree.items[0]!;
      expect(node.type).toBe('tateten-group');
      if (node.type === 'tateten-group') {
        // items は個別トークン
        expect(node.items).toHaveLength(2);
        expect(node.items[0]!.token.text).toBe('春');
        expect(node.items[1]!.token.text).toBe('風');
        // rangeCtx はグループレベルに設定
        expect(node.rangeCtx).toBeDefined();
        expect(node.rangeCtx!.yomiganaBaseText).toBe('春風');
        expect(node.rangeCtx!.rangeTokenInfo).toEqual({ from: 't1', to: 't2' });
      }
    });

    it('consecutive highlight boundaries (A→B)', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [
          { id: 't1', text: '天' },
          { id: 't2', text: '地' },
          { id: 't3', text: '人' },
          { id: 't4', text: '仁' },
        ],
        blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4'] }],
        marks: [
          { type: 'highlight', id: 'h1', anchor: { from: 't1', to: 't2' } },
          { type: 'highlight', id: 'h2', anchor: { from: 't3', to: 't4' }, style: 'dashed' },
        ],
        readings: [],
      };
      const ctx = createBuildCtx(doc);
      const tokens = doc.blocks[0]!.tokenIds.map((id) => doc.tokens.find((t) => t.id === id)!);
      const tree = buildBlockRenderTree('b1', tokens, ctx);

      expect(tree.items).toHaveLength(2);
      expect(tree.items[0]!.type).toBe('highlight-group');
      expect(tree.items[1]!.type).toBe('highlight-group');
      expect((tree.items[0] as HighlightGroupNode).items).toHaveLength(2);
      expect((tree.items[1] as HighlightGroupNode).items).toHaveLength(2);
      expect((tree.items[1] as HighlightGroupNode).highlight.style).toBe('dashed');
    });
  });
});
