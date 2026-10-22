/**
 * Shared test document fixtures for ADR-021/022 fixed representative cases.
 * Used by both cross-renderer-equivalence (semantic) and visual-regression tests.
 */

import type { SKAMDocument } from '@kanbun-skam/skam';

/** Case 1: ruby-range-core — 複数トークン集約 + span */
export const FIXTURE_RANGE_RUBY: SKAMDocument = {
  format: 'skam@0.1',
  tokens: [
    { id: 't1', text: '論' },
    { id: 't2', text: '語' },
    { id: 't3', text: '曰' },
  ],
  blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
  marks: [
    { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'ろんご' },
    { type: 'okurigana', anchor: { from: 't1', to: 't2' }, value: 'ノ' },
    { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: '㆑' },
  ],
  readings: [],
};

/** Case 2: tateten-kaeri-split — レ/非レ分割 */
export const FIXTURE_TATETEN_KAERI: SKAMDocument = {
  format: 'skam@0.1',
  tokens: [
    { id: 't1', text: '不' },
    { id: 't2', text: '亦' },
    { id: 't3', text: '樂' },
  ],
  blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
  marks: [
    { type: 'tateten', anchor: { from: 't1', to: 't2' } },
    { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆒' },
    { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆑' },
    { type: 'okurigana', anchor: { from: 't3', to: 't3' }, value: 'シカラ' },
  ],
  readings: [],
};

/** Case 3: highlight-ref-label — グループ参照ラベル */
export const FIXTURE_HIGHLIGHT_REF: SKAMDocument = {
  format: 'skam@0.1',
  tokens: [
    { id: 't1', text: '子' },
    { id: 't2', text: '曰' },
    { id: 't3', text: '學' },
  ],
  blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
  marks: [
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
    { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'し' },
  ],
  readings: [],
};

/** Case 4: saidoku-two-stage — 二段読み + 第二送り */
export const FIXTURE_SAIDOKU: SKAMDocument = {
  format: 'skam@0.1',
  tokens: [
    { id: 't1', text: '未' },
    { id: 't2', text: '嘗' },
    { id: 't3', text: '有' },
  ],
  blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
  marks: [
    {
      type: 'saidoku',
      anchor: { from: 't1', to: 't1' },
      forms: [
        { yomi: 'いま', okuri: 'ダ' },
        { yomi: 'ず', okuri: '' },
      ],
    },
    { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: '㆑' },
  ],
  readings: [],
};

/** Case 5: emphasis-highlight — 傍点+傍線共存 + ref ラベル */
export const FIXTURE_EMPHASIS_HIGHLIGHT: SKAMDocument = {
  format: 'skam@0.1',
  tokens: [
    { id: 't1', text: '重' },
    { id: 't2', text: '要' },
    { id: 't3', text: '語' },
  ],
  blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
  marks: [
    { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'じゅうよう' },
    { type: 'emphasis', anchor: { from: 't1', to: 't2' }, style: 'filled dot' },
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
      format: 'alpha-upper',
    },
  ],
  readings: [],
};

/**
 * Case 6: ref-source-order — ref の番号は原文の順 (ADR-028 K6)。
 * highlight に参照されない ref は本文の sup と注釈欄が resolveRefValues の値を出す。
 * tokens[] の順 (t5, t2, t3, t4, t1) と marks[] の ref の順 (注C, 注A, 注B) は、
 * どちらも原文の順 (注A, 注B, 注C) と違う。
 */
export const FIXTURE_REF_SOURCE_ORDER: SKAMDocument = {
  format: 'skam@0.1',
  tokens: [
    { id: 't5', text: '語' },
    { id: 't2', text: '曰' },
    { id: 't3', text: '學' },
    { id: 't4', text: '而' },
    { id: 't1', text: '子' },
  ],
  blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4', 't5'] }],
  marks: [
    {
      type: 'ref',
      id: 'refC',
      position: { blockId: 'b1', after: 't5' },
      format: 'numeric-paren',
      content: '注C',
    },
    {
      type: 'ref',
      id: 'refA',
      position: { blockId: 'b1', after: 't1' },
      format: 'numeric-paren',
      content: '注A',
    },
    {
      type: 'ref',
      id: 'refB',
      position: { blockId: 'b1', after: 't3' },
      format: 'numeric-paren',
      content: '注B',
    },
  ],
  readings: [],
};

/**
 * highlight とアキ (spacing: 'half') の組。傍線がアキの部分で途切れないかを画素で見る
 * (visual-regression.spec.ts の highlight-spacing-*)。
 * 意味の比較 (cross-renderer-equivalence) と共有しないので FIXTURES には入れない。
 *
 * - block 1: 素の solid highlight (2〜6 字目)
 * - block 2: ルビつきの solid highlight と、傍点つきの solid highlight。間に素の字を挟む。
 *   ルビは 1 字にだけ付ける (2 字以上の範囲のルビが highlight の中で最後の字を
 *   重ねて描く既知の問題を、この検査に持ち込まないため)
 * - block 3: dotted / dashed / wavy / double。周期のある線なので画素の走査はせず、目で見る
 */
export const FIXTURE_HIGHLIGHT_SPACING: SKAMDocument = {
  format: 'skam@0.1',
  tokens: [
    ...[...'甲乙丙丁戊己庚'].map((text, i) => ({ id: `a${i + 1}`, text })),
    ...[...'壱弐参四五六七八九'].map((text, i) => ({ id: `b${i + 1}`, text })),
    ...[...'春夏秋冬天地人日月星火水木'].map((text, i) => ({ id: `c${i + 1}`, text })),
  ],
  blocks: [
    { id: 'blk1', tokenIds: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'] },
    { id: 'blk2', tokenIds: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9'] },
    {
      id: 'blk3',
      tokenIds: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11', 'c12', 'c13'],
    },
  ],
  marks: [
    { type: 'highlight', id: 'hl-plain', anchor: { from: 'a2', to: 'a6' }, style: 'solid' },
    { type: 'yomigana', anchor: { from: 'b2', to: 'b2' }, value: 'ろ' },
    { type: 'highlight', id: 'hl-ruby', anchor: { from: 'b2', to: 'b4' }, style: 'solid' },
    { type: 'emphasis', anchor: { from: 'b6', to: 'b8' }, style: 'filled dot' },
    { type: 'highlight', id: 'hl-emphasis', anchor: { from: 'b6', to: 'b8' }, style: 'solid' },
    { type: 'highlight', id: 'hl-dotted', anchor: { from: 'c2', to: 'c3' }, style: 'dotted' },
    { type: 'highlight', id: 'hl-dashed', anchor: { from: 'c5', to: 'c6' }, style: 'dashed' },
    { type: 'highlight', id: 'hl-wavy', anchor: { from: 'c8', to: 'c9' }, style: 'wavy' },
    { type: 'highlight', id: 'hl-double', anchor: { from: 'c11', to: 'c12' }, style: 'double' },
  ],
  readings: [],
};

/**
 * Case 7: overlap-crossing — ruby・竪点・傍線・置き字が交差し、傍線と竪点が断片をまたぐ文書。
 * 字は 子曰學而時習之説 の 8 字。竪点 t2-t5、ruby t3-t6 (送り仮名つき)、傍線 t1-t3 と t5-t7 が
 * 互いに部分交差し、而 (t4) は置き字。
 */
export const FIXTURE_OVERLAP_CROSSING: SKAMDocument = {
  format: 'skam@0.1',
  tokens: [...'子曰學而時習之説'].map((text, i) => ({ id: `t${i + 1}`, text })),
  blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'] }],
  marks: [
    { type: 'tateten', anchor: { from: 't2', to: 't5' } },
    { type: 'yomigana', anchor: { from: 't3', to: 't6' }, value: 'がくじしゅう' },
    { type: 'okurigana', anchor: { from: 't3', to: 't6' }, value: 'ヲ' },
    { type: 'highlight', anchor: { from: 't1', to: 't3' }, style: 'solid' },
    { type: 'highlight', anchor: { from: 't5', to: 't7' }, style: 'dashed' },
    { type: 'okimoji', anchor: { from: 't4', to: 't4' } },
  ],
  readings: [],
};

/**
 * Case 8: reading-chain-kaeri — 3 種類の読みの連鎖 (READING_OVERLAP の警告が出る文書) と、
 * 範囲の読みの中の返り点。字は 不亦樂乎有朋自遠 の 8 字。
 * yomigana は t1-t2、t2-t3、t3-t4 (先の 2 つ、t1-t2 と t3-t4 を描き、t2-t3 は描かない)、
 * okurigana は t4-t5、t5-t6、soegana は t6-t7、t7-t8。竪点 t1-t3 の区切りに返り点が入る。
 */
export const FIXTURE_READING_CHAIN: SKAMDocument = {
  format: 'skam@0.1',
  tokens: [...'不亦樂乎有朋自遠'].map((text, i) => ({ id: `t${i + 1}`, text })),
  blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'] }],
  marks: [
    { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'あい' },
    { type: 'yomigana', anchor: { from: 't2', to: 't3' }, value: 'かき' },
    { type: 'yomigana', anchor: { from: 't3', to: 't4' }, value: 'さし' },
    { type: 'okurigana', anchor: { from: 't4', to: 't5' }, value: 'ニ' },
    { type: 'okurigana', anchor: { from: 't5', to: 't6' }, value: 'ヲ' },
    { type: 'soegana', anchor: { from: 't6', to: 't7' }, value: 'ノ' },
    { type: 'soegana', anchor: { from: 't7', to: 't8' }, value: 'ハ' },
    { type: 'tateten', anchor: { from: 't1', to: 't3' } },
    { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆒' },
    { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: '㆑' },
  ],
  readings: [],
};

/** All fixtures keyed by case_id (for iteration) */
export const FIXTURES = {
  'ruby-range-core': FIXTURE_RANGE_RUBY,
  'tateten-kaeri-split': FIXTURE_TATETEN_KAERI,
  'highlight-ref-label': FIXTURE_HIGHLIGHT_REF,
  'saidoku-two-stage': FIXTURE_SAIDOKU,
  'emphasis-highlight': FIXTURE_EMPHASIS_HIGHLIGHT,
  'ref-source-order': FIXTURE_REF_SOURCE_ORDER,
  'overlap-crossing': FIXTURE_OVERLAP_CROSSING,
  'reading-chain-kaeri': FIXTURE_READING_CHAIN,
} as const;
