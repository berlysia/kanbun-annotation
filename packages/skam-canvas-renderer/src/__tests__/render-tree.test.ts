import { describe, it, expect } from 'vitest';
import type { SKAMDocument, Mark } from '@kanbun/skam';
import { buildRenderTree } from '../render-tree.js';
import { PROFILES } from '../profiles.js';
import type {
  CanvasBlockChild,
  CanvasTokenNode,
  CanvasTatetenGroupNode,
  CanvasHighlightGroupNode,
  CanvasTatetenSeparator,
} from '../types.js';

/** Narrow CanvasBlockChild to CanvasTokenNode for test assertions */
function asTokenNode(child: CanvasBlockChild): CanvasTokenNode {
  if (child.type !== 'token') throw new Error(`Expected token, got ${child.type}`);
  return child;
}

/** Narrow CanvasBlockChild to CanvasTatetenGroupNode for test assertions */
function asTatetenGroup(child: CanvasBlockChild): CanvasTatetenGroupNode {
  if (child.type !== 'tateten-group') throw new Error(`Expected tateten-group, got ${child.type}`);
  return child;
}

/** Narrow tateten group child to CanvasTokenNode */
function asGroupToken(child: CanvasTokenNode | CanvasTatetenSeparator): CanvasTokenNode {
  if (child.type !== 'token') throw new Error(`Expected token in group, got ${child.type}`);
  return child;
}

/** Narrow tateten group child to CanvasTatetenSeparator */
function asSeparator(child: CanvasTokenNode | CanvasTatetenSeparator): CanvasTatetenSeparator {
  if (child.type !== 'tateten-separator')
    throw new Error(`Expected tateten-separator in group, got ${child.type}`);
  return child;
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

describe('buildRenderTree', () => {
  it('builds tree with plain text (no marks)', () => {
    const tree = buildRenderTree(threeTokenDoc(), PROFILES.full);

    expect(tree.blocks).toHaveLength(1);
    expect(tree.blocks[0]!.blockId).toBe('b1');
    expect(tree.blocks[0]!.children).toHaveLength(3);

    const [t1, t2, t3] = tree.blocks[0]!.children.map((c) => asTokenNode(c));
    expect(t1!.token.text).toBe('子');
    expect(t2!.token.text).toBe('曰');
    expect(t3!.token.text).toBe('學');

    // All slots should be empty
    expect(t1!.slots).toEqual({});
    expect(t2!.slots).toEqual({});
    expect(t3!.slots).toEqual({});
  });

  it('resolves yomigana into ruby slot', () => {
    const doc = threeTokenDoc([
      { type: 'yomigana', anchor: { from: 't3', to: 't3' }, value: 'まな' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);

    expect(asTokenNode(tree.blocks[0]!.children[2]!).slots.ruby).toBe('まな');
    expect(asTokenNode(tree.blocks[0]!.children[0]!).slots.ruby).toBeUndefined();
    expect(asTokenNode(tree.blocks[0]!.children[1]!).slots.ruby).toBeUndefined();
  });

  it('resolves okurigana into okuri slot', () => {
    const doc = threeTokenDoc([
      { type: 'okurigana', anchor: { from: 't3', to: 't3' }, value: 'ぶ' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);

    expect(asTokenNode(tree.blocks[0]!.children[2]!).slots.okuri).toBe('ぶ');
  });

  it('resolves soegana into soegana slot', () => {
    const doc = threeTokenDoc([{ type: 'soegana', anchor: { from: 't1', to: 't1' }, value: 'は' }]);
    const tree = buildRenderTree(doc, PROFILES.full);

    expect(asTokenNode(tree.blocks[0]!.children[0]!).slots.soegana).toBe('は');
  });

  it('resolves single kaeri into Unicode', () => {
    const doc = threeTokenDoc([
      { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: 'レ' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);

    expect(asTokenNode(tree.blocks[0]!.children[1]!).slots.kaeri).toBe('\u3191');
  });

  it('resolves compound kaeri into Unicode', () => {
    const doc = threeTokenDoc([
      { type: 'kaeri', position: { blockId: 'b1', after: 't3' }, value: '一レ' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);

    expect(asTokenNode(tree.blocks[0]!.children[2]!).slots.kaeri).toBe('\u3192\u3191');
  });

  it('resolves kutoten slot', () => {
    const doc = threeTokenDoc([
      { type: 'kutoten', position: { blockId: 'b1', after: 't3' }, value: '。' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);

    expect(asTokenNode(tree.blocks[0]!.children[2]!).slots.kutoten).toBe('。');
  });

  it('resolves multiple marks on same token', () => {
    const doc = threeTokenDoc([
      { type: 'yomigana', anchor: { from: 't3', to: 't3' }, value: 'まな' },
      { type: 'okurigana', anchor: { from: 't3', to: 't3' }, value: 'ぶ' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't3' }, value: '一レ' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);

    const t3 = asTokenNode(tree.blocks[0]!.children[2]!);
    expect(t3.slots.ruby).toBe('まな');
    expect(t3.slots.okuri).toBe('ぶ');
    expect(t3.slots.kaeri).toBe('\u3192\u3191');
  });

  it('respects profile: kaeriten=false', () => {
    const doc = threeTokenDoc([
      { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: 'レ' },
    ]);
    const tree = buildRenderTree(doc, { ...PROFILES.full, kaeriten: false });

    expect(asTokenNode(tree.blocks[0]!.children[1]!).slots.kaeri).toBeUndefined();
  });

  it('respects profile: yomigana=false', () => {
    const doc = threeTokenDoc([
      { type: 'yomigana', anchor: { from: 't3', to: 't3' }, value: 'まな' },
    ]);
    const tree = buildRenderTree(doc, { ...PROFILES.full, yomigana: false });

    expect(asTokenNode(tree.blocks[0]!.children[2]!).slots.ruby).toBeUndefined();
  });

  it('handles multiple blocks', () => {
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
    const tree = buildRenderTree(doc, PROFILES.full);

    expect(tree.blocks).toHaveLength(2);
    expect(tree.blocks[0]!.blockId).toBe('b1');
    expect(tree.blocks[0]!.children).toHaveLength(2);
    expect(tree.blocks[1]!.blockId).toBe('b2');
    expect(tree.blocks[1]!.children).toHaveLength(2);
  });

  it('handles empty document', () => {
    const doc: SKAMDocument = {
      format: 'skam@0.1',
      tokens: [],
      blocks: [],
      marks: [],
      readings: [],
    };
    const tree = buildRenderTree(doc, PROFILES.full);

    expect(tree.blocks).toHaveLength(0);
  });

  it('matches intermediate tokens in anchor range', () => {
    // Use okimoji with a 3-token range to verify intermediate matching
    const doc = threeTokenDoc([{ type: 'okimoji', anchor: { from: 't1', to: 't3' } }]);
    const tree = buildRenderTree(doc, PROFILES.full);

    const tokens = tree.blocks[0]!.children.map((c) => asTokenNode(c));
    // All three tokens should match (from, intermediate, to)
    expect(tokens[0]!.slots.isOkimoji).toBe(true);
    expect(tokens[1]!.slots.isOkimoji).toBe(true);
    expect(tokens[2]!.slots.isOkimoji).toBe(true);
  });

  it('resolves okimoji flag for single token', () => {
    const doc = threeTokenDoc([{ type: 'okimoji', anchor: { from: 't2', to: 't2' } }]);
    const tree = buildRenderTree(doc, PROFILES.full);

    expect(asTokenNode(tree.blocks[0]!.children[1]!).slots.isOkimoji).toBe(true);
    expect(asTokenNode(tree.blocks[0]!.children[0]!).slots.isOkimoji).toBeUndefined();
    expect(asTokenNode(tree.blocks[0]!.children[2]!).slots.isOkimoji).toBeUndefined();
  });

  it('resolves joji flag for single token', () => {
    const doc = threeTokenDoc([{ type: 'joji', anchor: { from: 't1', to: 't1' } }]);
    const tree = buildRenderTree(doc, PROFILES.full);

    expect(asTokenNode(tree.blocks[0]!.children[0]!).slots.isJoji).toBe(true);
    expect(asTokenNode(tree.blocks[0]!.children[1]!).slots.isJoji).toBeUndefined();
  });

  it('resolves okimoji flag for token range', () => {
    const doc = threeTokenDoc([{ type: 'okimoji', anchor: { from: 't1', to: 't3' } }]);
    const tree = buildRenderTree(doc, PROFILES.full);

    const tokens = tree.blocks[0]!.children.map((c) => asTokenNode(c));
    expect(tokens[0]!.slots.isOkimoji).toBe(true);
    expect(tokens[1]!.slots.isOkimoji).toBe(true);
    expect(tokens[2]!.slots.isOkimoji).toBe(true);
  });

  it('respects profile: okimoji=false', () => {
    const doc = threeTokenDoc([{ type: 'okimoji', anchor: { from: 't2', to: 't2' } }]);
    const tree = buildRenderTree(doc, { ...PROFILES.full, okimoji: false });

    expect(asTokenNode(tree.blocks[0]!.children[1]!).slots.isOkimoji).toBeUndefined();
  });

  it('respects profile: joji=false', () => {
    const doc = threeTokenDoc([{ type: 'joji', anchor: { from: 't1', to: 't1' } }]);
    const tree = buildRenderTree(doc, { ...PROFILES.full, joji: false });

    expect(asTokenNode(tree.blocks[0]!.children[0]!).slots.isJoji).toBeUndefined();
  });

  it('resolves emphasis for all tokens in range', () => {
    const doc = threeTokenDoc([
      { type: 'emphasis', anchor: { from: 't1', to: 't3' }, style: 'sesame' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);

    const tokens = tree.blocks[0]!.children.map((c) => asTokenNode(c));
    expect(tokens[0]!.slots.emphasis).toBe('\uFE45');
    expect(tokens[1]!.slots.emphasis).toBe('\uFE45');
    expect(tokens[2]!.slots.emphasis).toBe('\uFE45');
  });

  it('resolves emphasis with default style (undefined)', () => {
    const doc = threeTokenDoc([{ type: 'emphasis', anchor: { from: 't2', to: 't2' } }]);
    const tree = buildRenderTree(doc, PROFILES.full);

    expect(asTokenNode(tree.blocks[0]!.children[1]!).slots.emphasis).toBe('\u2022');
  });

  it('respects profile: emphasis=false', () => {
    const doc = threeTokenDoc([
      { type: 'emphasis', anchor: { from: 't1', to: 't1' }, style: 'dot' },
    ]);
    const tree = buildRenderTree(doc, { ...PROFILES.full, emphasis: false });

    expect(asTokenNode(tree.blocks[0]!.children[0]!).slots.emphasis).toBeUndefined();
  });

  it('resolves saidoku forms into slots', () => {
    const doc = threeTokenDoc([
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

    const t1 = asTokenNode(tree.blocks[0]!.children[0]!);
    expect(t1.slots.ruby).toBe('まさ');
    expect(t1.slots.okuri).toBe('に');
    expect(t1.slots.saidokuUnder).toBe('はた');
    expect(t1.slots.saidokuOkuri2).toBeUndefined();
  });

  it('resolves saidoku with both form okuri', () => {
    const doc = threeTokenDoc([
      {
        type: 'saidoku',
        anchor: { from: 't2', to: 't2' },
        forms: [
          { n: 1, yomi: 'まさ', okuri: 'に' },
          { n: 2, yomi: 'はた', okuri: 'す' },
        ],
      },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);

    const t2 = asTokenNode(tree.blocks[0]!.children[1]!);
    expect(t2.slots.ruby).toBe('まさ');
    expect(t2.slots.okuri).toBe('に');
    expect(t2.slots.saidokuUnder).toBe('はた');
    expect(t2.slots.saidokuOkuri2).toBe('す');
  });

  it('resolves saidoku with single form', () => {
    const doc = threeTokenDoc([
      {
        type: 'saidoku',
        anchor: { from: 't1', to: 't1' },
        forms: [{ n: 1, yomi: 'まさ' }],
      },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);

    const t1 = asTokenNode(tree.blocks[0]!.children[0]!);
    expect(t1.slots.ruby).toBe('まさ');
    expect(t1.slots.saidokuUnder).toBeUndefined();
    expect(t1.slots.saidokuOkuri2).toBeUndefined();
  });

  it('resolves saidoku with empty forms', () => {
    const doc = threeTokenDoc([
      {
        type: 'saidoku',
        anchor: { from: 't1', to: 't1' },
        forms: [],
      },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);

    const t1 = asTokenNode(tree.blocks[0]!.children[0]!);
    expect(t1.slots.ruby).toBeUndefined();
    expect(t1.slots.saidokuUnder).toBeUndefined();
  });

  it('respects profile: saidoku=false', () => {
    const doc = threeTokenDoc([
      {
        type: 'saidoku',
        anchor: { from: 't1', to: 't1' },
        forms: [
          { n: 1, yomi: 'まさ' },
          { n: 2, yomi: 'はた' },
        ],
      },
    ]);
    const tree = buildRenderTree(doc, { ...PROFILES.full, saidoku: false });

    const t1 = asTokenNode(tree.blocks[0]!.children[0]!);
    expect(t1.slots.ruby).toBeUndefined();
    expect(t1.slots.saidokuUnder).toBeUndefined();
  });

  // tateten grouping
  it('groups 2 tokens with tateten mark', () => {
    const doc = threeTokenDoc([{ type: 'tateten', anchor: { from: 't1', to: 't2' } }]);
    const tree = buildRenderTree(doc, PROFILES.full);

    // t1, t2 are grouped; t3 remains standalone
    expect(tree.blocks[0]!.children).toHaveLength(2);
    const group = asTatetenGroup(tree.blocks[0]!.children[0]!);
    expect(group.children).toHaveLength(3); // token, sep, token
    expect(asGroupToken(group.children[0]!).token.text).toBe('子');
    expect(group.children[1]!.type).toBe('tateten-separator');
    expect(asGroupToken(group.children[2]!).token.text).toBe('曰');

    // t3 is standalone
    expect(asTokenNode(tree.blocks[0]!.children[1]!).token.text).toBe('學');
  });

  it('groups 3 tokens with tateten mark', () => {
    const doc = threeTokenDoc([{ type: 'tateten', anchor: { from: 't1', to: 't3' } }]);
    const tree = buildRenderTree(doc, PROFILES.full);

    expect(tree.blocks[0]!.children).toHaveLength(1);
    const group = asTatetenGroup(tree.blocks[0]!.children[0]!);
    // 3 tokens + 2 separators = 5 children
    expect(group.children).toHaveLength(5);
    expect(asGroupToken(group.children[0]!).token.text).toBe('子');
    expect(group.children[1]!.type).toBe('tateten-separator');
    expect(asGroupToken(group.children[2]!).token.text).toBe('曰');
    expect(group.children[3]!.type).toBe('tateten-separator');
    expect(asGroupToken(group.children[4]!).token.text).toBe('學');
  });

  it('splits kaeri in tateten group: レ→token, non-レ→separator', () => {
    const doc = threeTokenDoc([
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '一レ' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);

    const group = asTatetenGroup(tree.blocks[0]!.children[0]!);
    // t1 gets レ component only
    expect(asGroupToken(group.children[0]!).slots.kaeri).toBe('\u3191');
    // separator gets 一 component
    expect(asSeparator(group.children[1]!).kaeri).toBe('\u3192');
  });

  it('puts non-レ only kaeri on separator, removes from token', () => {
    const doc = threeTokenDoc([
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '上' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);

    const group = asTatetenGroup(tree.blocks[0]!.children[0]!);
    // t1 has no kaeri (レ part is empty)
    expect(asGroupToken(group.children[0]!).slots.kaeri).toBeUndefined();
    // separator gets 上
    expect(asSeparator(group.children[1]!).kaeri).toBe('\u3196');
  });

  it('puts last token non-レ kaeri on last separator', () => {
    const doc = threeTokenDoc([
      { type: 'tateten', anchor: { from: 't1', to: 't3' } },
      { type: 'kaeri', position: { blockId: 'b1', after: 't3' }, value: '一' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);

    const group = asTatetenGroup(tree.blocks[0]!.children[0]!);
    // last token (t3) has no kaeri (レ part is empty)
    expect(asGroupToken(group.children[4]!).slots.kaeri).toBeUndefined();
    // last separator gets 一
    expect(asSeparator(group.children[3]!).kaeri).toBe('\u3192');
  });

  it('respects profile: tateten=false', () => {
    const doc = threeTokenDoc([{ type: 'tateten', anchor: { from: 't1', to: 't2' } }]);
    const tree = buildRenderTree(doc, { ...PROFILES.full, tateten: false });

    // No grouping: all children are tokens
    expect(tree.blocks[0]!.children).toHaveLength(3);
    expect(tree.blocks[0]!.children[0]!.type).toBe('token');
    expect(tree.blocks[0]!.children[1]!.type).toBe('token');
    expect(tree.blocks[0]!.children[2]!.type).toBe('token');
  });

  // range yomigana
  it('resolves range yomigana with rubySpan on first token', () => {
    const doc = threeTokenDoc([
      { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'しいわ' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);

    const t1 = asTokenNode(tree.blocks[0]!.children[0]!);
    const t2 = asTokenNode(tree.blocks[0]!.children[1]!);
    const t3 = asTokenNode(tree.blocks[0]!.children[2]!);
    // First token: ruby set with rubySpan
    expect(t1.slots.ruby).toBe('しいわ');
    expect(t1.slots.rubySpan).toBe(2);
    // Second token: ruby cleared
    expect(t2.slots.ruby).toBeUndefined();
    expect(t2.slots.rubySpan).toBeUndefined();
    // Third token: unrelated
    expect(t3.slots.ruby).toBeUndefined();
  });

  it('resolves range yomigana spanning 3 tokens', () => {
    const doc = threeTokenDoc([
      { type: 'yomigana', anchor: { from: 't1', to: 't3' }, value: 'ろんご' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);

    const t1 = asTokenNode(tree.blocks[0]!.children[0]!);
    const t2 = asTokenNode(tree.blocks[0]!.children[1]!);
    const t3 = asTokenNode(tree.blocks[0]!.children[2]!);
    expect(t1.slots.ruby).toBe('ろんご');
    expect(t1.slots.rubySpan).toBe(3);
    expect(t2.slots.ruby).toBeUndefined();
    expect(t3.slots.ruby).toBeUndefined();
  });

  // range okurigana
  it('resolves range okurigana on last token only', () => {
    const doc = threeTokenDoc([
      { type: 'okurigana', anchor: { from: 't1', to: 't2' }, value: 'ぶ' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);

    const t1 = asTokenNode(tree.blocks[0]!.children[0]!);
    const t2 = asTokenNode(tree.blocks[0]!.children[1]!);
    // First token: okuri cleared
    expect(t1.slots.okuri).toBeUndefined();
    // Last token: okuri set
    expect(t2.slots.okuri).toBe('ぶ');
  });

  // range soegana
  it('resolves range soegana on last token only', () => {
    const doc = threeTokenDoc([{ type: 'soegana', anchor: { from: 't1', to: 't2' }, value: 'は' }]);
    const tree = buildRenderTree(doc, PROFILES.full);

    const t1 = asTokenNode(tree.blocks[0]!.children[0]!);
    const t2 = asTokenNode(tree.blocks[0]!.children[1]!);
    expect(t1.slots.soegana).toBeUndefined();
    expect(t2.slots.soegana).toBe('は');
  });

  it('does not set rubySpan for single-token yomigana', () => {
    const doc = threeTokenDoc([
      { type: 'yomigana', anchor: { from: 't3', to: 't3' }, value: 'まな' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);

    const t3 = asTokenNode(tree.blocks[0]!.children[2]!);
    expect(t3.slots.ruby).toBe('まな');
    expect(t3.slots.rubySpan).toBeUndefined();
  });

  it('preserves token slots within tateten group', () => {
    const doc = threeTokenDoc([
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'し' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);

    const group = asTatetenGroup(tree.blocks[0]!.children[0]!);
    expect(asGroupToken(group.children[0]!).slots.ruby).toBe('し');
  });

  // highlight grouping
  it('groups 2 tokens with highlight mark', () => {
    const doc = threeTokenDoc([
      { type: 'highlight', anchor: { from: 't1', to: 't2' }, style: 'solid' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);

    // t1, t2 grouped into highlight-group; t3 standalone
    expect(tree.blocks[0]!.children).toHaveLength(2);
    const hlGroup = tree.blocks[0]!.children[0]! as CanvasHighlightGroupNode;
    expect(hlGroup.type).toBe('highlight-group');
    expect(hlGroup.highlightStyle).toBe('solid');
    expect(hlGroup.children).toHaveLength(2);
    expect(hlGroup.children[0]!.type).toBe('token');
    expect(hlGroup.children[1]!.type).toBe('token');
    expect(tree.blocks[0]!.children[1]!.type).toBe('token');
  });

  it('groups 3 tokens with highlight mark', () => {
    const doc = threeTokenDoc([{ type: 'highlight', anchor: { from: 't1', to: 't3' } }]);
    const tree = buildRenderTree(doc, PROFILES.full);

    expect(tree.blocks[0]!.children).toHaveLength(1);
    const hlGroup = tree.blocks[0]!.children[0]! as CanvasHighlightGroupNode;
    expect(hlGroup.type).toBe('highlight-group');
    expect(hlGroup.highlightStyle).toBe('solid'); // default
    expect(hlGroup.children).toHaveLength(3);
  });

  it('highlight group contains tateten group (nested)', () => {
    const doc = threeTokenDoc([
      { type: 'highlight', anchor: { from: 't1', to: 't3' } },
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);

    // highlight wraps tateten-group + standalone t3
    expect(tree.blocks[0]!.children).toHaveLength(1);
    const hlGroup = tree.blocks[0]!.children[0]! as CanvasHighlightGroupNode;
    expect(hlGroup.type).toBe('highlight-group');
    expect(hlGroup.children).toHaveLength(2);
    expect(hlGroup.children[0]!.type).toBe('tateten-group');
    expect(hlGroup.children[1]!.type).toBe('token');
  });

  it('passes highlight style and ref', () => {
    const doc = threeTokenDoc([
      { type: 'highlight', anchor: { from: 't1', to: 't1' }, style: 'wavy', ref: 'r1' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);

    const hlGroup = tree.blocks[0]!.children[0]! as CanvasHighlightGroupNode;
    expect(hlGroup.highlightStyle).toBe('wavy');
    expect(hlGroup.highlightRef).toBe('r1');
  });

  it('respects profile: highlight=false', () => {
    const doc = threeTokenDoc([{ type: 'highlight', anchor: { from: 't1', to: 't2' } }]);
    const tree = buildRenderTree(doc, { ...PROFILES.full, highlight: false });

    // No grouping: all children are tokens
    expect(tree.blocks[0]!.children).toHaveLength(3);
    expect(tree.blocks[0]!.children[0]!.type).toBe('token');
    expect(tree.blocks[0]!.children[1]!.type).toBe('token');
    expect(tree.blocks[0]!.children[2]!.type).toBe('token');
  });
});
