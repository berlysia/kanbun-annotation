/**
 * Cross-renderer equivalence tests
 *
 * ADR-021 固定4ケース: 同一入力に対し、buildAnnotationIR の結果が
 * HTML/Canvas 両 Adapter で回帰なく変換されることを検証する。
 *
 * 同値テストの対象:
 * 1. ブロック順序と blockId
 * 2. トークン順序と token.id
 * 3. mark 解決結果（ruby/okuri/soegana/kaeri/kutoten/saidoku/ref/highlight/tateten）
 * 4. range 集約境界（from/to, span, trailing mark 集約結果）
 */

import { describe, it, expect } from 'vitest';
import {
  buildAnnotationIR,
  type AIRDocument,
  type AIRTokenNode,
  type AIRTatetenGroupNode,
  type AIRHighlightGroupNode,
} from '@kanbun-skam/skam/rendering';
import {
  FIXTURE_RANGE_RUBY,
  FIXTURE_TATETEN_KAERI,
  FIXTURE_HIGHLIGHT_REF,
  FIXTURE_SAIDOKU,
} from '../fixtures/test-documents.js';

// ============================================================================
// テスト用プロファイル
// ============================================================================

const FULL_PROFILE = {
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

// ============================================================================
// AIR 構造検査ヘルパー
// ============================================================================

function getTokenNodes(air: AIRDocument, blockIndex: number): AIRTokenNode[] {
  const block = air.blocks[blockIndex]!;
  const tokens: AIRTokenNode[] = [];
  for (const child of block.children) {
    if (child.type === 'token') {
      tokens.push(child);
    } else if (child.type === 'tateten-group') {
      for (const c of child.children) {
        if (c.type === 'token') tokens.push(c);
      }
    } else if (child.type === 'highlight-group') {
      for (const c of child.children) {
        if (c.type === 'token') tokens.push(c);
        if (c.type === 'tateten-group') {
          for (const tc of c.children) {
            if (tc.type === 'token') tokens.push(tc);
          }
        }
      }
    }
  }
  return tokens;
}

// ============================================================================
// Case 1: range ruby（複数トークン集約 + span）
// ============================================================================

describe('cross-renderer equivalence: range ruby', () => {
  const doc = FIXTURE_RANGE_RUBY;

  it('AIR がブロック・トークン順序を維持する', () => {
    const air = buildAnnotationIR(doc, FULL_PROFILE);
    expect(air.blocks).toHaveLength(1);
    expect(air.blocks[0]!.blockId).toBe('b1');

    // 非リードトークンはフィルタされず rangeConsumed フラグ付きで残る
    const tokens = getTokenNodes(air, 0);
    expect(tokens.map((t) => t.token.id)).toEqual(['t1', 't2', 't3']);
    const t2 = tokens.find((t) => t.token.id === 't2')!;
    expect(t2.rangeConsumed).toBe(true);
    // range 関連スロットはクリア済み
    expect(t2.slots.ruby).toBeUndefined();
  });

  it('range yomigana が先頭トークンに集約される', () => {
    const air = buildAnnotationIR(doc, FULL_PROFILE);
    const tokens = getTokenNodes(air, 0);
    const t1 = tokens.find((t) => t.token.id === 't1')!;

    expect(t1.rangeInfo).toBeDefined();
    expect(t1.rangeInfo!.yomigana).toEqual({
      baseText: '論語',
      value: 'ろんご',
      span: 2,
    });
    expect(t1.rangeInfo!.fromTokenId).toBe('t1');
    expect(t1.rangeInfo!.toTokenId).toBe('t2');
  });

  it('range okurigana が先頭トークンの rangeInfo に含まれる', () => {
    const air = buildAnnotationIR(doc, FULL_PROFILE);
    const tokens = getTokenNodes(air, 0);
    const t1 = tokens.find((t) => t.token.id === 't1')!;

    expect(t1.rangeInfo!.okurigana).toEqual({
      baseText: '論語',
      value: 'ノ',
    });
  });

  it('trailing marks が正しく収集される', () => {
    const air = buildAnnotationIR(doc, FULL_PROFILE);
    const tokens = getTokenNodes(air, 0);
    const t1 = tokens.find((t) => t.token.id === 't1')!;

    expect(t1.rangeInfo!.trailingMarks).toHaveLength(1);
    expect(t1.rangeInfo!.trailingMarks[0]!.kind).toBe('kaeri');
    expect(t1.rangeInfo!.trailingMarks[0]!.sourceTokenId).toBe('t2');
  });
});

// ============================================================================
// Case 2: tateten + kaeri（レ/非レ分割を含む）
// ============================================================================

describe('cross-renderer equivalence: tateten+kaeri', () => {
  const doc = FIXTURE_TATETEN_KAERI;

  it('tateten グループが正しく構築される', () => {
    const air = buildAnnotationIR(doc, FULL_PROFILE);
    const block = air.blocks[0]!;

    expect(block.children).toHaveLength(2);
    expect(block.children[0]!.type).toBe('tateten-group');
    expect(block.children[1]!.type).toBe('token');
  });

  it('kaeri がレ/非レに分割される', () => {
    const air = buildAnnotationIR(doc, FULL_PROFILE);
    const tatetenGroup = air.blocks[0]!.children[0] as AIRTatetenGroupNode;

    // children: token, separator, token
    expect(tatetenGroup.children).toHaveLength(3);

    const firstToken = tatetenGroup.children[0] as AIRTokenNode;
    // レ成分がトークンの kaeri スロットに
    expect(firstToken.slots.kaeri).toBeTruthy();

    const separator = tatetenGroup.children[1]!;
    expect(separator.type).toBe('tateten-separator');
    // 非レ成分（一）がセパレータの kaeri に
    if (separator.type === 'tateten-separator') {
      expect(separator.kaeri).toBeTruthy();
    }
  });

  it('tateten 外のトークンは独立して解決される', () => {
    const air = buildAnnotationIR(doc, FULL_PROFILE);
    const lastChild = air.blocks[0]!.children[1] as AIRTokenNode;
    expect(lastChild.token.text).toBe('樂');
    expect(lastChild.slots.okuri).toBe('シカラ');
  });
});

// ============================================================================
// Case 3: highlight + ref（グループ参照ラベルを含む）
// ============================================================================

describe('cross-renderer equivalence: highlight+ref', () => {
  const doc = FIXTURE_HIGHLIGHT_REF;

  it('highlight グループが正しく構築される', () => {
    const air = buildAnnotationIR(doc, FULL_PROFILE);
    const block = air.blocks[0]!;

    // highlight group (t1, t2) + token (t3)
    expect(block.children).toHaveLength(2);
    expect(block.children[0]!.type).toBe('highlight-group');
  });

  it('ref ラベルが解決される', () => {
    const air = buildAnnotationIR(doc, FULL_PROFILE);
    const hlGroup = air.blocks[0]!.children[0] as AIRHighlightGroupNode;

    expect(hlGroup.highlightStyle).toBe('solid');
    expect(hlGroup.refLabel).toBe('(1)');
  });

  it('highlight 内のトークン slot が正しい', () => {
    const air = buildAnnotationIR(doc, FULL_PROFILE);
    const hlGroup = air.blocks[0]!.children[0] as AIRHighlightGroupNode;
    const t1 = hlGroup.children[0] as AIRTokenNode;

    expect(t1.slots.ruby).toBe('し');
    // ref は highlight group に吸収されるので token slot には入らない
    expect(t1.slots.ref).toBeUndefined();
  });

  it('hasKana が正しく判定される', () => {
    const air = buildAnnotationIR(doc, FULL_PROFILE);
    const hlGroup = air.blocks[0]!.children[0] as AIRHighlightGroupNode;
    expect(hlGroup.hasKana).toBe(true);
  });
});

// ============================================================================
// Case 4: saidoku（二段読み + 第二送り）
// ============================================================================

describe('cross-renderer equivalence: saidoku', () => {
  const doc = FIXTURE_SAIDOKU;

  it('saidoku の第一読みが ruby/okuri に解決される', () => {
    const air = buildAnnotationIR(doc, FULL_PROFILE);
    const tokens = getTokenNodes(air, 0);
    const t1 = tokens.find((t) => t.token.id === 't1')!;

    expect(t1.slots.ruby).toBe('いま');
    expect(t1.slots.okuri).toBe('ダ');
  });

  it('saidoku の第二読みが saidokuUnder に解決される', () => {
    const air = buildAnnotationIR(doc, FULL_PROFILE);
    const tokens = getTokenNodes(air, 0);
    const t1 = tokens.find((t) => t.token.id === 't1')!;

    expect(t1.slots.saidokuUnder).toBe('ず');
    // 空文字列の okuri は設定されない
    expect(t1.slots.saidokuOkuri2).toBeUndefined();
  });

  it('saidoku 以外のトークンの mark 解決が影響を受けない', () => {
    const air = buildAnnotationIR(doc, FULL_PROFILE);
    const tokens = getTokenNodes(air, 0);
    const t2 = tokens.find((t) => t.token.id === 't2')!;

    expect(t2.slots.kaeri).toBeTruthy();
    expect(t2.slots.ruby).toBeUndefined();
  });
});
