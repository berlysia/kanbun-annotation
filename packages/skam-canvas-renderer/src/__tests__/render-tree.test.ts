import { describe, it, expect } from 'vitest';
import type { SKAMDocument, Mark } from '@kanbun/skam';
import { buildRenderTree } from '../render-tree.js';
import { PROFILES } from '../profiles.js';

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
    expect(tree.blocks[0]!.tokens).toHaveLength(3);

    const [t1, t2, t3] = tree.blocks[0]!.tokens;
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

    expect(tree.blocks[0]!.tokens[2]!.slots.ruby).toBe('まな');
    expect(tree.blocks[0]!.tokens[0]!.slots.ruby).toBeUndefined();
    expect(tree.blocks[0]!.tokens[1]!.slots.ruby).toBeUndefined();
  });

  it('resolves okurigana into okuri slot', () => {
    const doc = threeTokenDoc([
      { type: 'okurigana', anchor: { from: 't3', to: 't3' }, value: 'ぶ' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);

    expect(tree.blocks[0]!.tokens[2]!.slots.okuri).toBe('ぶ');
  });

  it('resolves soegana into soegana slot', () => {
    const doc = threeTokenDoc([{ type: 'soegana', anchor: { from: 't1', to: 't1' }, value: 'は' }]);
    const tree = buildRenderTree(doc, PROFILES.full);

    expect(tree.blocks[0]!.tokens[0]!.slots.soegana).toBe('は');
  });

  it('resolves single kaeri into Unicode', () => {
    const doc = threeTokenDoc([
      { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: 'レ' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);

    expect(tree.blocks[0]!.tokens[1]!.slots.kaeri).toBe('\u3191');
  });

  it('resolves compound kaeri into Unicode', () => {
    const doc = threeTokenDoc([
      { type: 'kaeri', position: { blockId: 'b1', after: 't3' }, value: '一レ' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);

    expect(tree.blocks[0]!.tokens[2]!.slots.kaeri).toBe('\u3192\u3191');
  });

  it('resolves kutoten slot', () => {
    const doc = threeTokenDoc([
      { type: 'kutoten', position: { blockId: 'b1', after: 't3' }, value: '。' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);

    expect(tree.blocks[0]!.tokens[2]!.slots.kutoten).toBe('。');
  });

  it('resolves multiple marks on same token', () => {
    const doc = threeTokenDoc([
      { type: 'yomigana', anchor: { from: 't3', to: 't3' }, value: 'まな' },
      { type: 'okurigana', anchor: { from: 't3', to: 't3' }, value: 'ぶ' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't3' }, value: '一レ' },
    ]);
    const tree = buildRenderTree(doc, PROFILES.full);

    const t3 = tree.blocks[0]!.tokens[2]!;
    expect(t3.slots.ruby).toBe('まな');
    expect(t3.slots.okuri).toBe('ぶ');
    expect(t3.slots.kaeri).toBe('\u3192\u3191');
  });

  it('respects profile: kaeriten=false', () => {
    const doc = threeTokenDoc([
      { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: 'レ' },
    ]);
    const tree = buildRenderTree(doc, { ...PROFILES.full, kaeriten: false });

    expect(tree.blocks[0]!.tokens[1]!.slots.kaeri).toBeUndefined();
  });

  it('respects profile: yomigana=false', () => {
    const doc = threeTokenDoc([
      { type: 'yomigana', anchor: { from: 't3', to: 't3' }, value: 'まな' },
    ]);
    const tree = buildRenderTree(doc, { ...PROFILES.full, yomigana: false });

    expect(tree.blocks[0]!.tokens[2]!.slots.ruby).toBeUndefined();
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
    expect(tree.blocks[0]!.tokens).toHaveLength(2);
    expect(tree.blocks[1]!.blockId).toBe('b2');
    expect(tree.blocks[1]!.tokens).toHaveLength(2);
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
});
