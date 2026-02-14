/**
 * Shared test document fixtures for ADR-021/022 fixed representative cases.
 * Used by both cross-renderer-equivalence (semantic) and visual-regression tests.
 */

import type { SKAMDocument } from '@kanbun/skam';

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
    { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: 'レ' },
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
    { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '一レ' },
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
    { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: 'レ' },
  ],
  readings: [],
};

/** All fixtures keyed by case_id (for iteration) */
export const FIXTURES = {
  'ruby-range-core': FIXTURE_RANGE_RUBY,
  'tateten-kaeri-split': FIXTURE_TATETEN_KAERI,
  'highlight-ref-label': FIXTURE_HIGHLIGHT_REF,
  'saidoku-two-stage': FIXTURE_SAIDOKU,
} as const;
