import { describe, it, expect } from 'vitest';
import type { SKAMDocument, Mark } from '../../index.js';
import { buildAnnotationIR } from '../build-annotation-ir.js';
import { RENDER_PROFILES, type RenderProfile } from '../render-profile.js';
import { describeAnnotationIR, type AccessibleBlock } from '../accessible-text.js';

// ============================================================================
// テストヘルパー
// ============================================================================

const FULL = RENDER_PROFILES.full;
const BASIC = RENDER_PROFILES.learningBasic;

/** 學而時習之（t1〜t5）を 1 ブロックに置く */
function createDoc(marks: Mark[] = []): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '學' },
      { id: 't2', text: '而' },
      { id: 't3', text: '時' },
      { id: 't4', text: '習' },
      { id: 't5', text: '之' },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4', 't5'] }],
    marks,
    readings: [],
  };
}

const GAKUJI_MARKS: Mark[] = [
  { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'ビテ' },
  { type: 'okimoji', anchor: { from: 't2', to: 't2' } },
  { type: 'okurigana', anchor: { from: 't3', to: 't3' }, value: 'ニ' },
  { type: 'okurigana', anchor: { from: 't4', to: 't4' }, value: 'フ' },
  { type: 'kaeri', position: { blockId: 'b1', after: 't4' }, value: '㆑' },
  { type: 'okurigana', anchor: { from: 't5', to: 't5' }, value: 'ヲ' },
];

function describe1(doc: SKAMDocument, profile: RenderProfile): AccessibleBlock[] {
  return describeAnnotationIR(buildAnnotationIR(doc, profile));
}

function units(doc: SKAMDocument, profile: RenderProfile) {
  return describe1(doc, profile)[0]!.units;
}

// ============================================================================
// describeAnnotationIR
// ============================================================================

describe('describeAnnotationIR', () => {
  it('學而時習之を full で 5 単位にし、note は K2 の順に並ぶ', () => {
    const us = units(createDoc(GAKUJI_MARKS), FULL);
    expect(us.map((u) => u.text)).toEqual(['學', '而', '時', '習', '之']);
    expect(us[3]!.notes).toEqual([
      { kind: 'okurigana', value: 'フ' },
      { kind: 'kaeri', value: '㆑' },
    ]);
    expect(us[1]!.notes).toEqual([{ kind: 'okimoji' }]);
  });

  it('同じ文書を learningBasic にすると okurigana の note が 0 件', () => {
    const us = units(createDoc(GAKUJI_MARKS), BASIC);
    const all = us.flatMap((u) => u.notes);
    expect(all.filter((n) => n.kind === 'okurigana')).toHaveLength(0);
    expect(us[3]!.notes).toEqual([{ kind: 'kaeri', value: '㆑' }]);
  });

  it('2 token にまたがる yomigana は 1 単位で、2 字目は単位を作らない', () => {
    const doc = createDoc([
      { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'がくじ' },
    ]);
    const us = units(doc, FULL);
    expect(us).toHaveLength(4);
    expect(us[0]!.text).toBe('學而');
    expect(us[0]!.notes).toEqual([{ kind: 'yomigana', value: 'がくじ' }]);
    expect(us[1]!.text).toBe('時');
  });

  it('範囲の末尾に付いた返り点は、範囲の単位の notes に入る', () => {
    const doc = createDoc([
      { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'がくじ' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: '㆑' },
    ]);
    const us = units(doc, FULL);
    expect(us[0]!.notes).toEqual([
      { kind: 'yomigana', value: 'がくじ' },
      { kind: 'kaeri', value: '㆑' },
    ]);
  });

  it('竪点の区切りは、tateten の note だけを持つ本文の無い単位になる', () => {
    const doc = createDoc([
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆒' },
    ]);
    const us = units(doc, FULL);
    expect(us.map((u) => u.text)).toEqual(['學', '', '而', '時', '習', '之']);
    expect(us[1]!.notes).toEqual([{ kind: 'tateten', kaeri: '㆒' }]);
    expect(us[0]!.notes.some((n) => n.kind === 'kaeri')).toBe(false);
    expect(us[2]!.notes.some((n) => n.kind === 'kaeri')).toBe(false);
  });

  it('返り点の無い竪点の区切りは kaeri を持たない', () => {
    const doc = createDoc([{ type: 'tateten', anchor: { from: 't1', to: 't2' } }]);
    const us = units(doc, FULL);
    expect(us[1]!.notes).toEqual([{ kind: 'tateten' }]);
  });

  it('竪点のグループ全体にかかる読みは、グループの範囲を 1 単位にする', () => {
    const doc = createDoc([
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'がくじ' },
    ]);
    const us = units(doc, FULL);
    expect(us[0]!.text).toBe('學而');
    expect(us[0]!.notes).toEqual([{ kind: 'yomigana', value: 'がくじ' }]);
    expect(us[1]!.notes).toEqual([{ kind: 'tateten' }]);
    expect(us[2]!.text).toBe('時');
  });

  describe('再読文字', () => {
    const saidokuMark: Mark = {
      type: 'saidoku',
      anchor: { from: 't3', to: 't3' },
      forms: [
        { yomi: 'いま', okuri: 'ダ' },
        { yomi: 'ず', okuri: '' },
      ],
    };

    it('saidoku: true で saidoku の note が 1 件になり、yomigana の note は無い', () => {
      const us = units(createDoc([saidokuMark]), FULL);
      expect(us[2]!.notes).toEqual([{ kind: 'saidoku', first: 'いまダ', second: 'ず' }]);
    });

    it('yomigana: false でも saidoku の note は出て、yomigana の note は無い', () => {
      const us = units(createDoc([saidokuMark]), { ...FULL, yomigana: false });
      expect(us[2]!.notes).toEqual([{ kind: 'saidoku', first: 'いまダ', second: 'ず' }]);
    });

    it('okurigana: false でも 1 回目の送り仮名は saidoku.first に入る', () => {
      const us = units(createDoc([saidokuMark]), { ...FULL, okurigana: false });
      expect(us[2]!.notes).toEqual([{ kind: 'saidoku', first: 'いまダ', second: 'ず' }]);
    });

    it('2 回目の読みが空でも 2 回目の送り仮名があれば second に入る', () => {
      const doc = createDoc([
        {
          type: 'saidoku',
          anchor: { from: 't3', to: 't3' },
          forms: [
            { yomi: 'いま', okuri: '' },
            { yomi: '', okuri: 'ズ' },
          ],
        },
      ]);
      expect(units(doc, FULL)[2]!.notes).toEqual([
        { kind: 'saidoku', first: 'いま', second: 'ズ' },
      ]);
    });

    it('saidoku: false なら saidoku の note は無く、yomigana の mark は yomigana として出る', () => {
      const doc = createDoc([
        saidokuMark,
        { type: 'yomigana', anchor: { from: 't3', to: 't3' }, value: 'じ' },
      ]);
      const us = units(doc, { ...FULL, saidoku: false });
      expect(us[2]!.notes).toEqual([{ kind: 'yomigana', value: 'じ' }]);
    });

    it('2 回目の読みが無い再読文字は、1 回目の読みが yomigana / okurigana として出る (R4)', () => {
      const doc = createDoc([
        {
          type: 'saidoku',
          anchor: { from: 't3', to: 't3' },
          forms: [{ yomi: 'いま', okuri: 'ダ' }],
        },
      ]);
      const notes = units(doc, FULL)[2]!.notes;
      expect(notes.some((n) => n.kind === 'saidoku')).toBe(false);
      expect(notes).toEqual([
        { kind: 'yomigana', value: 'いま' },
        { kind: 'okurigana', value: 'ダ' },
      ]);
    });
  });

  it('ref 付き highlight は、始まりと終わりの単位が本文の単位を挟む', () => {
    const doc = createDoc([
      { type: 'highlight', id: 'hl1', anchor: { from: 't2', to: 't3' }, style: 'solid', ref: 'r1' },
      { type: 'ref', id: 'r1', position: { blockId: 'b1', after: 't3' }, format: 'numeric-paren' },
    ]);
    const us = units(doc, FULL);
    expect(us.map((u) => u.text)).toEqual(['學', '', '而', '時', '', '習', '之']);
    expect(us[1]!.notes).toEqual([{ kind: 'highlightStart', label: '(1)' }]);
    expect(us[4]!.notes).toEqual([{ kind: 'highlightEnd' }]);
  });

  it('ref の無い highlight の始まりは label を持たない', () => {
    const doc = createDoc([
      { type: 'highlight', anchor: { from: 't2', to: 't3' }, style: 'solid' },
    ]);
    const us = units(doc, FULL);
    expect(us[1]!.notes).toEqual([{ kind: 'highlightStart' }]);
  });

  it('ブロック先頭の句点は、kutoten の note だけを持つ本文の無い単位になる', () => {
    const doc = createDoc([{ type: 'kutoten', position: { blockId: 'b1' }, value: '。' }]);
    const us = units(doc, FULL);
    expect(us[0]).toEqual({ text: '', notes: [{ kind: 'kutoten', value: '。' }] });
    expect(us[1]!.text).toBe('學');
  });

  it('ブロック先頭の ref は、ref の note だけを持つ本文の無い単位になる', () => {
    const doc = createDoc([
      { type: 'ref', id: 'r1', position: { blockId: 'b1' }, format: 'numeric-paren' },
    ]);
    const us = units(doc, FULL);
    expect(us[0]).toEqual({ text: '', notes: [{ kind: 'ref', label: '(1)' }] });
  });

  it('単位の順序は blocks[].tokenIds の連結順で、tokens[] の順に依らない', () => {
    const doc = createDoc(GAKUJI_MARKS);
    const reversed: SKAMDocument = { ...doc, tokens: [...doc.tokens].reverse() };
    expect(describe1(reversed, FULL)).toEqual(describe1(doc, FULL));
  });

  it('範囲が竪点のグループからはみ出すとき、範囲の読みは先頭の字の yomigana として出る (#16)', () => {
    const doc = createDoc([
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'yomigana', anchor: { from: 't1', to: 't3' }, value: 'がくじし' },
    ]);
    const us = units(doc, FULL);
    expect(us[0]!.text).toBe('學');
    expect(us[0]!.notes).toEqual([{ kind: 'yomigana', value: 'がくじし' }]);
  });

  it('複数のブロックを blocks[] に分ける', () => {
    const doc: SKAMDocument = {
      ...createDoc(),
      blocks: [
        { id: 'b1', tokenIds: ['t1', 't2'] },
        { id: 'b2', tokenIds: ['t3', 't4', 't5'] },
      ],
    };
    const blocks = describe1(doc, FULL);
    expect(blocks.map((b) => b.blockId)).toEqual(['b1', 'b2']);
    expect(blocks[1]!.units.map((u) => u.text)).toEqual(['時', '習', '之']);
  });

  it('呼び出しの前後で AIR は変わらず、返す note は凍結されている', () => {
    const air = buildAnnotationIR(createDoc(GAKUJI_MARKS), FULL);
    const before = structuredClone(air);
    const blocks = describeAnnotationIR(air);
    expect(air).toEqual(before);
    for (const b of blocks) {
      for (const u of b.units) {
        for (const n of u.notes) expect(Object.isFrozen(n)).toBe(true);
      }
    }
  });
});
