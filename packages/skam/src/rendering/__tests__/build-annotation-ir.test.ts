import { describe, it, expect } from 'vitest';
import type { SKAMDocument, Mark } from '../../index.js';
import { buildAnnotationIR } from '../build-annotation-ir.js';
import type { AIRRenderProfile, AIRTokenNode, AIRTatetenGroupNode } from '../air-types.js';

// ============================================================================
// テストヘルパー
// ============================================================================

const FULL_PROFILE: AIRRenderProfile = {
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

function createDoc(marks: Mark[] = []): SKAMDocument {
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

function createMultiBlockDoc(marks: Mark[] = []): SKAMDocument {
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

// ============================================================================
// 基本テスト
// ============================================================================

describe('buildAnnotationIR', () => {
  it('marks なしの基本ドキュメントを変換できる', () => {
    const doc = createDoc();
    const air = buildAnnotationIR(doc, FULL_PROFILE);

    expect(air.blocks).toHaveLength(1);
    expect(air.blocks[0]!.blockId).toBe('b1');
    expect(air.blocks[0]!.children).toHaveLength(3);

    const firstChild = air.blocks[0]!.children[0]!;
    expect(firstChild.type).toBe('token');
    if (firstChild.type === 'token') {
      expect(firstChild.token.text).toBe('子');
      expect(firstChild.slots).toEqual({});
    }
  });

  it('複数ブロックを正しく処理する', () => {
    const doc = createMultiBlockDoc();
    const air = buildAnnotationIR(doc, FULL_PROFILE);

    expect(air.blocks).toHaveLength(2);
    expect(air.blocks[0]!.blockId).toBe('b1');
    expect(air.blocks[1]!.blockId).toBe('b2');
  });

  // ============================================================================
  // 単一トークン mark 解決
  // ============================================================================

  it('yomigana を ruby スロットに解決する', () => {
    const doc = createDoc([{ type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'し' }]);
    const air = buildAnnotationIR(doc, FULL_PROFILE);
    const token = air.blocks[0]!.children[0] as AIRTokenNode;
    expect(token.slots.ruby).toBe('し');
  });

  it('okurigana を okuri スロットに解決する', () => {
    const doc = createDoc([{ type: 'okurigana', anchor: { from: 't3', to: 't3' }, value: 'ブ' }]);
    const air = buildAnnotationIR(doc, FULL_PROFILE);
    const token = air.blocks[0]!.children[2] as AIRTokenNode;
    expect(token.slots.okuri).toBe('ブ');
  });

  it('soegana を soegana スロットに解決する', () => {
    const doc = createDoc([{ type: 'soegana', anchor: { from: 't2', to: 't2' }, value: 'ノ' }]);
    const air = buildAnnotationIR(doc, FULL_PROFILE);
    const token = air.blocks[0]!.children[1] as AIRTokenNode;
    expect(token.slots.soegana).toBe('ノ');
  });

  it('kaeri を Unicode 変換済みで解決する', () => {
    const doc = createDoc([
      { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: '㆑' },
    ]);
    const air = buildAnnotationIR(doc, FULL_PROFILE);
    const token = air.blocks[0]!.children[1] as AIRTokenNode;
    expect(token.slots.kaeri).toBeTruthy();
    // レ → Unicode 変換済み
    expect(token.slots.kaeri).not.toBe('レ');
  });

  it('kutoten を value で解決する', () => {
    const doc = createDoc([
      { type: 'kutoten', position: { blockId: 'b1', after: 't3' }, value: '。' },
    ]);
    const air = buildAnnotationIR(doc, FULL_PROFILE);
    const token = air.blocks[0]!.children[2] as AIRTokenNode;
    expect(token.slots.kutoten).toBe('。');
  });

  it('okimoji を isOkimoji フラグで解決する', () => {
    const doc = createDoc([{ type: 'okimoji', anchor: { from: 't1', to: 't1' } }]);
    const air = buildAnnotationIR(doc, FULL_PROFILE);
    const token = air.blocks[0]!.children[0] as AIRTokenNode;
    expect(token.slots.isOkimoji).toBe(true);
  });

  it('emphasis を Unicode 傍点文字で解決する', () => {
    const doc = createDoc([
      { type: 'emphasis', anchor: { from: 't1', to: 't1' }, style: 'filled dot' },
    ]);
    const air = buildAnnotationIR(doc, FULL_PROFILE);
    const token = air.blocks[0]!.children[0] as AIRTokenNode;
    expect(token.slots.emphasis).toBe('\u2022');
  });

  // ============================================================================
  // Range ruby（複数トークン集約 + span）
  // ============================================================================

  it('range yomigana を先頭トークンの rangeInfo に集約する', () => {
    const doc = createDoc([
      { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'しいわく' },
    ]);
    const air = buildAnnotationIR(doc, FULL_PROFILE);

    // range の先頭トークンに rangeInfo が設定される
    const firstToken = air.blocks[0]!.children[0] as AIRTokenNode;
    expect(firstToken.rangeInfo).toBeDefined();
    expect(firstToken.rangeInfo!.yomigana).toEqual({
      baseText: '子曰',
      value: 'しいわく',
      span: 2,
    });
    expect(firstToken.rangeInfo!.fromTokenId).toBe('t1');
    expect(firstToken.rangeInfo!.toTokenId).toBe('t2');
    expect(firstToken.rangeInfo!.tokenIds).toEqual(['t1', 't2']);
  });

  // ============================================================================
  // okurigana/soegana range
  // ============================================================================

  it('range okurigana を先頭トークンの rangeInfo に集約する', () => {
    const doc = createDoc([{ type: 'okurigana', anchor: { from: 't1', to: 't2' }, value: 'ビ' }]);
    const air = buildAnnotationIR(doc, FULL_PROFILE);

    const firstToken = air.blocks[0]!.children[0] as AIRTokenNode;
    expect(firstToken.rangeInfo).toBeDefined();
    expect(firstToken.rangeInfo!.okurigana).toEqual({
      baseText: '子曰',
      value: 'ビ',
    });
  });

  // ============================================================================
  // Tateten グルーピング
  // ============================================================================

  it('tateten mark のトークンをグループ化する', () => {
    const doc = createDoc([{ type: 'tateten', anchor: { from: 't1', to: 't2' } }]);
    const air = buildAnnotationIR(doc, FULL_PROFILE);

    // t1, t2 が tateten-group、t3 が token
    expect(air.blocks[0]!.children).toHaveLength(2);
    const group = air.blocks[0]!.children[0] as AIRTatetenGroupNode;
    expect(group.type).toBe('tateten-group');
    // children: token, separator, token
    expect(group.children).toHaveLength(3);
    expect(group.children[0]!.type).toBe('token');
    expect(group.children[1]!.type).toBe('tateten-separator');
    expect(group.children[2]!.type).toBe('token');
  });

  it('tateten + kaeri でレ/非レ分割する', () => {
    const doc = createDoc([
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆒㆑' },
    ]);
    const air = buildAnnotationIR(doc, FULL_PROFILE);

    const group = air.blocks[0]!.children[0] as AIRTatetenGroupNode;
    // t1 にはレ成分が kaeri スロットに
    const firstToken = group.children[0] as AIRTokenNode;
    expect(firstToken.slots.kaeri).toBeTruthy();

    // separator には非レ成分（一）
    const sep = group.children[1]!;
    expect(sep.type).toBe('tateten-separator');
    if (sep.type === 'tateten-separator') {
      expect(sep.kaeri).toBeTruthy();
    }
  });

  // ============================================================================
  // Highlight グルーピング
  // ============================================================================

  it('highlight mark のトークンをグループ化する', () => {
    const doc = createDoc([
      { type: 'highlight', anchor: { from: 't1', to: 't2' }, style: 'solid' },
    ]);
    const air = buildAnnotationIR(doc, FULL_PROFILE);

    expect(air.blocks[0]!.children).toHaveLength(2);
    const hlGroup = air.blocks[0]!.children[0]!;
    expect(hlGroup.type).toBe('highlight-group');
    if (hlGroup.type === 'highlight-group') {
      expect(hlGroup.highlightStyle).toBe('solid');
      expect(hlGroup.children).toHaveLength(2);
    }
  });

  it('highlight + ref でラベルを解決する', () => {
    const doc = createDoc([
      {
        type: 'highlight',
        id: 'hl1',
        anchor: { from: 't1', to: 't2' },
        style: 'solid',
        ref: 'ref1',
      },
      {
        type: 'ref',
        id: 'ref1',
        position: { blockId: 'b1', after: 't2' },
        format: 'numeric-paren',
      },
    ]);
    const air = buildAnnotationIR(doc, FULL_PROFILE);

    const hlGroup = air.blocks[0]!.children[0]!;
    if (hlGroup.type === 'highlight-group') {
      expect(hlGroup.refLabel).toBe('(1)');
    }
  });

  // ============================================================================
  // Saidoku（二段読み + 第二送り）
  // ============================================================================

  it('saidoku を ruby/okuri + saidokuUnder/saidokuOkuri2 に解決する', () => {
    const doc = createDoc([
      {
        type: 'saidoku',
        anchor: { from: 't2', to: 't2' },
        forms: [
          { yomi: 'まさ', okuri: 'ニ' },
          { yomi: 'べし', okuri: '' },
        ],
      },
    ]);
    const air = buildAnnotationIR(doc, FULL_PROFILE);
    const token = air.blocks[0]!.children[1] as AIRTokenNode;
    expect(token.slots.ruby).toBe('まさ');
    expect(token.slots.okuri).toBe('ニ');
    expect(token.slots.saidokuUnder).toBe('べし');
    // form1.okuri が空文字列の場合は saidokuOkuri2 は設定されない（falsy）
    expect(token.slots.saidokuOkuri2).toBeUndefined();
  });

  // ============================================================================
  // Block-start marks
  // ============================================================================

  it('block-start ref を blockStartRefs に解決する', () => {
    const doc = createDoc([
      {
        type: 'ref',
        id: 'ref-bs1',
        position: { blockId: 'b1' },
        format: 'numeric-paren',
      },
    ]);
    const air = buildAnnotationIR(doc, FULL_PROFILE);

    expect(air.blocks[0]!.blockStartRefs).toHaveLength(1);
    expect(air.blocks[0]!.blockStartRefs[0]!.resolved).toBe('(1)');
    expect(air.blocks[0]!.blockStartRefs[0]!.refId).toBe('ref-bs1');
  });

  it('block-start kutoten を blockStartKutoten に解決する', () => {
    const doc = createDoc([{ type: 'kutoten', position: { blockId: 'b1' }, value: '。' }]);
    const air = buildAnnotationIR(doc, FULL_PROFILE);

    expect(air.blocks[0]!.blockStartKutoten).toHaveLength(1);
    expect(air.blocks[0]!.blockStartKutoten[0]!.value).toBe('。');
  });

  // ============================================================================
  // Trailing marks
  // ============================================================================

  it('range group の後続トークンから trailing marks を収集する', () => {
    const doc = createDoc([
      { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'しいわく' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: '㆑' },
    ]);
    const air = buildAnnotationIR(doc, FULL_PROFILE);

    const firstToken = air.blocks[0]!.children[0] as AIRTokenNode;
    expect(firstToken.rangeInfo).toBeDefined();
    expect(firstToken.rangeInfo!.trailingMarks).toHaveLength(1);
    expect(firstToken.rangeInfo!.trailingMarks[0]!.kind).toBe('kaeri');
    expect(firstToken.rangeInfo!.trailingMarks[0]!.sourceTokenId).toBe('t2');
  });

  // ============================================================================
  // Profile フィルタリング
  // ============================================================================

  it('profile で無効な mark は解決しない', () => {
    const doc = createDoc([
      { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'し' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: '㆑' },
    ]);
    const noYomiganaProfile: AIRRenderProfile = {
      ...FULL_PROFILE,
      yomigana: false,
      kaeriten: false,
    };
    const air = buildAnnotationIR(doc, noYomiganaProfile);

    const t1 = air.blocks[0]!.children[0] as AIRTokenNode;
    expect(t1.slots.ruby).toBeUndefined();

    const t2 = air.blocks[0]!.children[1] as AIRTokenNode;
    expect(t2.slots.kaeri).toBeUndefined();
  });
});
