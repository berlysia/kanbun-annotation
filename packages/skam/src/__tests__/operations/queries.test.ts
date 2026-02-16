import { describe, it, expect } from 'vitest';
import {
  getMarksForToken,
  getMarksForRange,
  getMarksExactRange,
  getAnchoredMarksExactRange,
  getPositionedMarksInRange,
  getMarkById,
  getBlockForToken,
} from '../../operations/index.js';
import { createTestDocument, createMultiBlockDocument } from './helpers.js';

// ============================================================================
// 6. getMarksForToken
// ============================================================================

describe('getMarksForToken', () => {
  it('6.1: 特定のtokenに関連するマークを取得する', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'kaeri', id: 'm2', position: { blockId: 'b1', after: 't2' }, value: '㆑' },
      { type: 'yomigana', id: 'm3', anchor: { from: 't3', to: 't3' }, value: 'まなぶ' },
    ]);

    const result = getMarksForToken(doc, 't2');
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('m2');
  });

  it('6.2: 範囲を跨ぐマークも取得する', () => {
    const doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't3' }, value: 'しいわく' },
      { type: 'kaeri', id: 'm2', position: { blockId: 'b1', after: 't2' }, value: '㆑' },
    ]);

    const result = getMarksForToken(doc, 't2');
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.id)).toContain('m1');
    expect(result.map((m) => m.id)).toContain('m2');
  });

  it('6.3: 存在しないtokenIdの場合は空配列を返す', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
    ]);
    expect(getMarksForToken(doc, 't999')).toHaveLength(0);
  });

  it('6.4: マークがない場合は空配列を返す', () => {
    const doc = createTestDocument([]);
    expect(getMarksForToken(doc, 't1')).toHaveLength(0);
  });

  it('6.5: 無効なanchorのマークは除外する', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'okurigana', id: 'm2', anchor: { from: 'invalid', to: 'invalid' }, value: 'ク' },
    ]);

    const result = getMarksForToken(doc, 't1');
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('m1');
  });

  it('6.6: yomigana+ref混在で両方取得する', () => {
    const doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't3', to: 't3' }, value: 'まな' },
      {
        type: 'ref',
        id: 'ref-1',
        position: { blockId: 'b1', after: 't3' },
        format: 'iroha-katakana',
      },
    ]);

    const result = getMarksForToken(doc, 't3');
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.type)).toContain('yomigana');
    expect(result.map((m) => m.type)).toContain('ref');
  });

  it('6.7: kutoten がマッチする', () => {
    const doc = createTestDocument([
      { type: 'kutoten', id: 'm1', position: { blockId: 'b1', after: 't2' }, value: '。' },
    ]);

    const result = getMarksForToken(doc, 't2');
    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('kutoten');
  });

  it('6.8: kutoten after未定義の場合はマッチしない', () => {
    const doc = createTestDocument([
      { type: 'kutoten', id: 'm1', position: { blockId: 'b1' }, value: '。' },
    ]);
    expect(getMarksForToken(doc, 't1')).toHaveLength(0);
  });

  it('6.9: value無しマーク（okimoji）がマッチする', () => {
    const doc = createTestDocument([
      { type: 'okimoji', id: 'm1', anchor: { from: 't1', to: 't1' } },
    ]);

    const result = getMarksForToken(doc, 't1');
    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('okimoji');
  });

  it('6.10: forms有りマーク（saidoku）がマッチする', () => {
    const doc = createTestDocument([
      {
        type: 'saidoku',
        id: 'm1',
        anchor: { from: 't1', to: 't1' },
        forms: [{ yomi: 'まさに' }, { yomi: 'べし' }],
      },
    ]);

    const result = getMarksForToken(doc, 't1');
    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('saidoku');
  });

  it('6.11: 複数ブロック: b1のトークンに関連するマークのみ取得', () => {
    const doc = createMultiBlockDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'okurigana', id: 'm2', anchor: { from: 't4', to: 't4' }, value: 'テ' },
    ]);

    const result = getMarksForToken(doc, 't1');
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('m1');
  });

  it('6.12: 複数ブロック: b2のトークンに関連するマークのみ取得', () => {
    const doc = createMultiBlockDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'okurigana', id: 'm2', anchor: { from: 't4', to: 't4' }, value: 'テ' },
    ]);

    const result = getMarksForToken(doc, 't4');
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('m2');
  });

  it('6.13: 複数ブロック: 同一ブロック内の範囲マークがマッチする', () => {
    const doc = createMultiBlockDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't4', to: 't6' }, value: 'ときなら' },
    ]);

    const result = getMarksForToken(doc, 't5');
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('m1');
  });
});

// ============================================================================
// 7. getMarksForRange
// ============================================================================

describe('getMarksForRange', () => {
  it('7.1: 範囲と完全一致', () => {
    const doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't3' }, value: 'しいわく' },
    ]);
    expect(getMarksForRange(doc, 't1', 't3')).toHaveLength(1);
  });

  it('7.2: 範囲内に収まる', () => {
    const doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't2', to: 't2' }, value: 'いわく' },
    ]);
    expect(getMarksForRange(doc, 't1', 't3')).toHaveLength(1);
  });

  it('7.3: 部分重なり（左側）', () => {
    const doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't2' }, value: 'しいわく' },
    ]);
    expect(getMarksForRange(doc, 't2', 't3')).toHaveLength(1);
  });

  it('7.4: 部分重なり（右側）', () => {
    const doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't2', to: 't3' }, value: 'いわく' },
    ]);
    expect(getMarksForRange(doc, 't1', 't2')).toHaveLength(1);
  });

  it('7.5: superset', () => {
    const doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't3' }, value: 'しいわく' },
    ]);
    expect(getMarksForRange(doc, 't2', 't2')).toHaveLength(1);
  });

  it('7.6: 範囲外', () => {
    const doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'し' },
    ]);
    expect(getMarksForRange(doc, 't2', 't3')).toHaveLength(0);
  });

  it('7.7: 隣接非重複', () => {
    const doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'し' },
      { type: 'yomigana', id: 'm2', anchor: { from: 't3', to: 't3' }, value: 'まなぶ' },
    ]);
    expect(getMarksForRange(doc, 't2', 't2')).toHaveLength(0);
  });

  it('7.8: 複数マーク', () => {
    const doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'し' },
      { type: 'yomigana', id: 'm2', anchor: { from: 't2', to: 't3' }, value: 'いわく' },
      { type: 'kaeri', id: 'm3', position: { blockId: 'b1', after: 't2' }, value: '㆑' },
    ]);
    expect(getMarksForRange(doc, 't1', 't3')).toHaveLength(3);
  });

  it('7.9: kutoten範囲内', () => {
    const doc = createTestDocument([
      { type: 'kutoten', id: 'm1', position: { blockId: 'b1', after: 't2' }, value: '。' },
    ]);
    expect(getMarksForRange(doc, 't1', 't3')).toHaveLength(1);
  });

  it('7.10: kutoten範囲外', () => {
    const doc = createTestDocument([
      { type: 'kutoten', id: 'm1', position: { blockId: 'b1', after: 't3' }, value: '。' },
    ]);
    expect(getMarksForRange(doc, 't1', 't2')).toHaveLength(0);
  });

  it('7.11: 存在しないtokenId', () => {
    const doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'し' },
    ]);
    expect(getMarksForRange(doc, 't999', 't1')).toHaveLength(0);
  });

  it('7.12: 無効anchor除外', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'okurigana', id: 'm2', anchor: { from: 'invalid', to: 'invalid' }, value: 'ク' },
    ]);

    const result = getMarksForRange(doc, 't1', 't3');
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('m1');
  });

  it('7.13: 単一トークン範囲=getMarksForToken', () => {
    const doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't3' }, value: 'しいわく' },
      { type: 'kaeri', id: 'm2', position: { blockId: 'b1', after: 't2' }, value: '㆑' },
      { type: 'kutoten', id: 'm3', position: { blockId: 'b1', after: 't2' }, value: '。' },
    ]);

    const rangeResult = getMarksForRange(doc, 't2', 't2');
    const tokenResult = getMarksForToken(doc, 't2');
    expect(rangeResult.map((m) => m.id).sort()).toEqual(tokenResult.map((m) => m.id).sort());
  });

  it('7.14: 複数ブロック: b1範囲', () => {
    const doc = createMultiBlockDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'okurigana', id: 'm2', anchor: { from: 't4', to: 't4' }, value: 'テ' },
    ]);

    const result = getMarksForRange(doc, 't1', 't3');
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('m1');
  });

  it('7.15: 複数ブロック: b2範囲', () => {
    const doc = createMultiBlockDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'okurigana', id: 'm2', anchor: { from: 't4', to: 't4' }, value: 'テ' },
    ]);

    const result = getMarksForRange(doc, 't4', 't6');
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('m2');
  });

  it('7.16: 複数ブロック: ブロック跨ぎ', () => {
    const doc = createMultiBlockDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'okurigana', id: 'm2', anchor: { from: 't4', to: 't4' }, value: 'テ' },
    ]);
    expect(getMarksForRange(doc, 't1', 't6')).toHaveLength(2);
  });
});

// ============================================================================
// 10. getMarkById
// ============================================================================

describe('getMarkById', () => {
  it('10.1: 存在するIDでマークを取得する', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'kaeri', id: 'm2', position: { blockId: 'b1', after: 't2' }, value: '㆑' },
    ]);

    const result = getMarkById(doc, 'm1');
    expect(result).toBeDefined();
    expect(result?.type).toBe('okurigana');
    expect(result?.id).toBe('m1');
  });

  it('10.2: 存在しないIDで undefined', () => {
    const doc = createTestDocument([
      { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ク' },
    ]);
    expect(getMarkById(doc, 'm999')).toBeUndefined();
  });

  it('10.3: 空のマーク配列で undefined', () => {
    const doc = createTestDocument([]);
    expect(getMarkById(doc, 'm1')).toBeUndefined();
  });

  it('10.4: position-based マークを取得', () => {
    const doc = createTestDocument([
      { type: 'kutoten', id: 'm1', position: { blockId: 'b1', after: 't2' }, value: '。' },
    ]);

    const result = getMarkById(doc, 'm1');
    expect(result).toBeDefined();
    expect(result?.type).toBe('kutoten');
  });

  it('10.5: idなしマーク混在でもIDで正しく取得', () => {
    const doc = createTestDocument([
      { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ク' },
      { type: 'kaeri', id: 'm2', position: { blockId: 'b1', after: 't2' }, value: '㆑' },
    ]);

    const result = getMarkById(doc, 'm2');
    expect(result).toBeDefined();
    expect(result?.type).toBe('kaeri');
  });

  it('10.6: type パラメータで型を指定して取得', () => {
    const doc = createTestDocument([
      { type: 'kaeri', id: 'mk1', position: { blockId: 'b1', after: 't1' }, value: '㆑' },
    ]);

    const result = getMarkById(doc, 'mk1', 'kaeri');
    expect(result).toBeDefined();
    expect(result?.value).toBe('㆑');
  });

  it('10.7: type が一致しない場合 undefined を返す', () => {
    const doc = createTestDocument([
      { type: 'kaeri', id: 'mk1', position: { blockId: 'b1', after: 't1' }, value: '㆑' },
    ]);

    const result = getMarkById(doc, 'mk1', 'kutoten');
    expect(result).toBeUndefined();
  });
});

// ============================================================================
// 11. getBlockForToken
// ============================================================================

describe('getBlockForToken', () => {
  it('11.1: 単一ブロックでトークンのブロックを取得', () => {
    const doc = createTestDocument([]);
    expect(getBlockForToken(doc, 't1')?.id).toBe('b1');
  });

  it('11.2: 存在しないtokenIdで undefined', () => {
    const doc = createTestDocument([]);
    expect(getBlockForToken(doc, 't999')).toBeUndefined();
  });

  it('11.3: 複数ブロック: b1のトークン', () => {
    const doc = createMultiBlockDocument([]);
    expect(getBlockForToken(doc, 't2')?.id).toBe('b1');
  });

  it('11.4: 複数ブロック: b2のトークン', () => {
    const doc = createMultiBlockDocument([]);
    expect(getBlockForToken(doc, 't5')?.id).toBe('b2');
  });
});

// ============================================================================
// 15. getMarksExactRange
// ============================================================================

describe('getMarksExactRange', () => {
  it('15.1: 完全一致', () => {
    const doc = createTestDocument([
      { type: 'tateten', id: 'm1', anchor: { from: 't1', to: 't2' } },
    ]);
    expect(getMarksExactRange(doc, 't1', 't2')).toHaveLength(1);
  });

  it('15.2: 部分一致は除外', () => {
    const doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't3' }, value: 'しいわく' },
    ]);
    expect(getMarksExactRange(doc, 't1', 't2')).toHaveLength(0);
  });

  it('15.3: superset は除外', () => {
    const doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't3' }, value: 'しいわく' },
    ]);
    expect(getMarksExactRange(doc, 't2', 't2')).toHaveLength(0);
  });

  it('15.4: subset は除外', () => {
    const doc = createTestDocument([
      { type: 'yomigana', id: 'm1', anchor: { from: 't2', to: 't2' }, value: 'いわく' },
    ]);
    expect(getMarksExactRange(doc, 't1', 't3')).toHaveLength(0);
  });

  it('15.5: type フィルタ: マッチ', () => {
    const doc = createTestDocument([
      { type: 'tateten', id: 'm1', anchor: { from: 't1', to: 't2' } },
      { type: 'kaeri', id: 'm2', position: { blockId: 'b1', after: 't1' }, value: '㆒' },
    ]);

    const result = getMarksExactRange(doc, 't1', 't2', 'tateten');
    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('tateten');
  });

  it('15.6: type フィルタ: 不一致', () => {
    const doc = createTestDocument([
      { type: 'tateten', id: 'm1', anchor: { from: 't1', to: 't2' } },
    ]);
    expect(getMarksExactRange(doc, 't1', 't2', 'kaeri')).toHaveLength(0);
  });

  it('15.7: type フィルタなしで全マッチ', () => {
    const doc = createTestDocument([
      { type: 'tateten', id: 'm1', anchor: { from: 't1', to: 't2' } },
      { type: 'kaeri', id: 'm2', position: { blockId: 'b1', after: 't1' }, value: '㆒' },
    ]);
    // tateten (anchor t1-t2 exact) + kaeri (position after t1, within range 0-1)
    expect(getMarksExactRange(doc, 't1', 't2')).toHaveLength(2);
  });

  it('15.8: position-based も含む（after が範囲内）', () => {
    const doc = createTestDocument([
      { type: 'kutoten', id: 'm1', position: { blockId: 'b1', after: 't1' }, value: '。' },
    ]);
    expect(getMarksExactRange(doc, 't1', 't1')).toHaveLength(1);
  });

  it('15.9: 存在しないtokenId', () => {
    const doc = createTestDocument([
      { type: 'tateten', id: 'm1', anchor: { from: 't1', to: 't2' } },
    ]);
    expect(getMarksExactRange(doc, 't999', 't2')).toHaveLength(0);
  });

  it('15.10: 複数ブロック', () => {
    const doc = createMultiBlockDocument([
      { type: 'tateten', id: 'm1', anchor: { from: 't4', to: 't5' } },
    ]);
    expect(getMarksExactRange(doc, 't4', 't5')).toHaveLength(1);
  });

  it('15.11: 単一トークン完全一致 (position-based kaeri)', () => {
    const doc = createTestDocument([
      { type: 'kaeri', id: 'm1', position: { blockId: 'b1', after: 't2' }, value: '㆑' },
    ]);

    const result = getMarksExactRange(doc, 't2', 't2', 'kaeri');
    expect(result).toHaveLength(1);
  });
});

// ============================================================================
// 16. getAnchoredMarksExactRange
// ============================================================================

describe('getAnchoredMarksExactRange', () => {
  it('16.1: anchor ベースマークの完全一致を取得 (kaeri excluded as position-based)', () => {
    const doc = createTestDocument([
      { type: 'tateten', id: 'm1', anchor: { from: 't1', to: 't2' } },
      { type: 'kaeri', id: 'm2', position: { blockId: 'b1', after: 't1' }, value: '㆒' },
    ]);

    const result = getAnchoredMarksExactRange(doc, 't1', 't2');
    // Only tateten (anchor-based), kaeri is now position-based and excluded
    expect(result).toHaveLength(1);
    expect(result[0]?.anchor.from).toBe('t1');
  });

  it('16.2: position ベースマークは除外', () => {
    const doc = createTestDocument([
      { type: 'kutoten', id: 'm1', position: { blockId: 'b1', after: 't1' }, value: '。' },
    ]);

    expect(getAnchoredMarksExactRange(doc, 't1', 't1')).toHaveLength(0);
  });

  it('16.3: type パラメータで特定 type にナロー', () => {
    const doc = createTestDocument([
      { type: 'tateten', id: 'm1', anchor: { from: 't1', to: 't2' } },
      { type: 'yomigana', id: 'm2', anchor: { from: 't1', to: 't2' }, value: 'しいわく' },
    ]);

    const result = getAnchoredMarksExactRange(doc, 't1', 't2', 'yomigana');
    expect(result).toHaveLength(1);
    expect(result[0]?.value).toBe('しいわく');
  });
});

// ============================================================================
// 17. getPositionedMarksInRange
// ============================================================================

describe('getPositionedMarksInRange', () => {
  it('17.1: after が範囲内にある position ベースマークを取得', () => {
    const doc = createTestDocument([
      { type: 'kutoten', id: 'm1', position: { blockId: 'b1', after: 't2' }, value: '。' },
    ]);

    const result = getPositionedMarksInRange(doc, 't1', 't3');
    expect(result).toHaveLength(1);
    // 戻り値は position プロパティに安全にアクセス可能
    expect(result[0]?.position.blockId).toBe('b1');
  });

  it('17.2: after が範囲外のマークは除外', () => {
    const doc = createTestDocument([
      { type: 'kutoten', id: 'm1', position: { blockId: 'b1', after: 't3' }, value: '。' },
    ]);

    expect(getPositionedMarksInRange(doc, 't1', 't2')).toHaveLength(0);
  });

  it('17.3: after 未定義はマッチしない', () => {
    const doc = createTestDocument([
      { type: 'kutoten', id: 'm1', position: { blockId: 'b1' }, value: '。' },
    ]);

    expect(getPositionedMarksInRange(doc, 't1', 't3')).toHaveLength(0);
  });

  it('17.4: type パラメータで kutoten のみフィルタ', () => {
    const doc = createTestDocument([
      { type: 'kutoten', id: 'm1', position: { blockId: 'b1', after: 't1' }, value: '。' },
      {
        type: 'ref',
        id: 'm2',
        position: { blockId: 'b1', after: 't2' },
        format: 'iroha-katakana',
      },
    ]);

    const result = getPositionedMarksInRange(doc, 't1', 't3', 'kutoten');
    expect(result).toHaveLength(1);
    expect(result[0]?.value).toBe('。');
  });

  it('17.5: kaeri (position-based) は含まれる', () => {
    const doc = createTestDocument([
      { type: 'kaeri', id: 'm1', position: { blockId: 'b1', after: 't1' }, value: '㆑' },
    ]);

    expect(getPositionedMarksInRange(doc, 't1', 't3')).toHaveLength(1);
    expect(getPositionedMarksInRange(doc, 't1', 't3')[0]?.type).toBe('kaeri');
  });
});
