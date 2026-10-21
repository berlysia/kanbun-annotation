import { describe, it, expect } from 'vitest';
import { validateSKAMDocument } from '../validator.js';
import { getLinebreakPlacementIssues } from '../index.js';
import { getTatetenGroups } from '../rendering/mark-groups.js';
import type { Mark, SKAMDocument } from '../index.js';

/** 學而時習 (t1〜t4) を 1 ブロックに置く */
function createDoc(marks: Mark[]): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: [
      { id: 't1', text: '學' },
      { id: 't2', text: '而' },
      { id: 't3', text: '時' },
      { id: 't4', text: '習' },
    ],
    blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4'] }],
    marks,
    readings: [],
  };
}

const br = (after?: string): Mark => ({
  type: 'linebreak',
  position: after === undefined ? { blockId: 'b1' } : { blockId: 'b1', after },
});

function linebreakErrorIndices(doc: SKAMDocument): number[] {
  const result = validateSKAMDocument(doc);
  if (result.valid) return [];
  return result.errors
    .filter((e) => e.kind === 'INVALID_LINEBREAK')
    .map((e) => Number(/^marks\[(\d+)\]/.exec(e.path)![1]));
}

describe('linebreak の検証', () => {
  it('字の後ろは有効', () => {
    expect(validateSKAMDocument(createDoc([br('t1')])).valid).toBe(true);
  });

  it('after が無い (block-start) は INVALID_LINEBREAK', () => {
    const doc = createDoc([br()]);
    const result = validateSKAMDocument(doc);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.map((e) => e.kind)).toEqual(['INVALID_LINEBREAK']);
      expect(result.errors[0]!.path).toBe('marks[0].position');
    }
    expect(getLinebreakPlacementIssues(doc).get(0)).toBe('block-start');
  });

  it('ブロック末尾の字の後ろ (block-end) は INVALID_LINEBREAK', () => {
    const doc = createDoc([br('t4')]);
    expect(linebreakErrorIndices(doc)).toEqual([0]);
    expect(getLinebreakPlacementIssues(doc).get(0)).toBe('block-end');
  });

  it('竪点のグループの中 (inside-unit) は誤り、グループの末尾の後ろは有効', () => {
    const tateten: Mark = { type: 'tateten', anchor: { from: 't1', to: 't2' } };
    const inside = createDoc([tateten, br('t1')]);
    expect(linebreakErrorIndices(inside)).toEqual([1]);
    expect(getLinebreakPlacementIssues(inside).get(1)).toBe('inside-unit');
    const after = createDoc([tateten, br('t2')]);
    expect(validateSKAMDocument(after).valid).toBe(true);
  });

  it.each(['yomigana', 'okurigana', 'soegana'] as const)(
    '%s が學〜而にかかるとき學の後ろは inside-unit',
    (type) => {
      const doc = createDoc([{ type, anchor: { from: 't1', to: 't2' }, value: 'x' }, br('t1')]);
      expect(linebreakErrorIndices(doc)).toEqual([1]);
      expect(getLinebreakPlacementIssues(doc).get(1)).toBe('inside-unit');
    }
  );

  it('saidoku が學〜而にかかるとき學の後ろは inside-unit', () => {
    const doc = createDoc([
      { type: 'saidoku', anchor: { from: 't1', to: 't2' }, forms: [{ yomi: 'x' }] },
      br('t1'),
    ]);
    expect(linebreakErrorIndices(doc)).toEqual([1]);
    expect(getLinebreakPlacementIssues(doc).get(1)).toBe('inside-unit');
  });

  it.each(['okimoji', 'joji'] as const)('%s が學〜而にかかるとき學の後ろは inside-unit', (type) => {
    const doc = createDoc([{ type, anchor: { from: 't1', to: 't2' } }, br('t1')]);
    expect(linebreakErrorIndices(doc)).toEqual([1]);
    expect(getLinebreakPlacementIssues(doc).get(1)).toBe('inside-unit');
  });

  it.each([
    ['highlight', { type: 'highlight', anchor: { from: 't1', to: 't2' } } satisfies Mark],
    [
      'emphasis',
      { type: 'emphasis', anchor: { from: 't1', to: 't2' }, style: 'dot' } satisfies Mark,
    ],
    [
      'okototen',
      {
        type: 'okototen',
        anchor: { from: 't1', to: 't2' },
        position: { system: 'glyph-grid', grid: '5x5', x: 4, y: 4 },
        shape: 'dot',
      } satisfies Mark,
    ],
  ])('%s の範囲の中でも學の後ろは有効', (_name, range) => {
    expect(validateSKAMDocument(createDoc([range, br('t1')])).valid).toBe(true);
  });

  it('同じ位置の 2 つ目は duplicate', () => {
    const doc = createDoc([br('t1'), br('t1')]);
    expect(linebreakErrorIndices(doc)).toEqual([1]);
    expect(getLinebreakPlacementIssues(doc).get(1)).toBe('duplicate');
    expect(getLinebreakPlacementIssues(doc).has(0)).toBe(false);
  });

  it('未知のフィールド (value) は誤りにしない', () => {
    const mark = { ...br('t1'), value: 'x' } as Mark;
    expect(validateSKAMDocument(createDoc([mark])).valid).toBe(true);
  });

  it('getLinebreakPlacementIssues の添字と validator の誤りの添字が一致する', () => {
    const tateten: Mark = { type: 'tateten', anchor: { from: 't1', to: 't2' } };
    const docs = [
      createDoc([br('t1'), br('t2'), br('t3'), br('t4'), br()]),
      createDoc([tateten, br('t1'), br('t2'), br('t2'), br('t4')]),
      createDoc([{ type: 'yomigana', anchor: { from: 't2', to: 't3' }, value: 'x' }, br('t2')]),
    ];
    for (const doc of docs) {
      const fromIssues = [...getLinebreakPlacementIssues(doc).keys()].sort((a, b) => a - b);
      expect(linebreakErrorIndices(doc)).toEqual(fromIssues);
    }
  });
});

describe('getLinebreakPlacementIssues と getTatetenGroups の一致', () => {
  /** getTatetenGroups が同じグループに入れる隣の字の組の、前の字の添字 */
  function tatetenJoinedPositions(doc: SKAMDocument): number[] {
    const groups = getTatetenGroups(doc.tokens, doc.marks);
    const joined: number[] = [];
    for (let i = 0; i < doc.tokens.length - 1; i++) {
      const a = groups.get(doc.tokens[i]!.id);
      if (a && a === groups.get(doc.tokens[i + 1]!.id)) joined.push(i);
    }
    return joined;
  }

  /** 各字の後ろに linebreak を 1 つずつ置いたとき inside-unit になる字の添字 */
  function insideUnitPositions(doc: SKAMDocument): number[] {
    const tokenIds = doc.blocks[0]!.tokenIds;
    const probe: SKAMDocument = {
      ...doc,
      marks: [
        ...doc.marks,
        ...tokenIds.map((id): Mark => ({
          type: 'linebreak',
          position: { blockId: 'b1', after: id },
        })),
      ],
    };
    const issues = getLinebreakPlacementIssues(probe);
    const offset = doc.marks.length;
    const result: number[] = [];
    tokenIds.forEach((_id, i) => {
      if (issues.get(offset + i) === 'inside-unit') result.push(i);
    });
    return result;
  }

  const t = (from: string, to: string): Mark => ({ type: 'tateten', anchor: { from, to } });

  it.each([
    ['グループ 0 つ', []],
    ['グループ 1 つ (1 字)', [t('t2', 't2')]],
    ['グループ 1 つ (2 字)', [t('t1', 't2')]],
    ['グループ 1 つ (3 字)', [t('t1', 't3')]],
    ['グループ 2 つが隣り合う', [t('t1', 't2'), t('t3', 't4')]],
    ['グループが重なる', [t('t1', 't3'), t('t2', 't4')]],
  ] as [string, Mark[]][])('%s', (_name, marks) => {
    const doc = createDoc(marks);
    // 末尾の字の後ろは block-end なので、inside-unit は 0..2 の範囲
    expect(insideUnitPositions(doc)).toEqual(tatetenJoinedPositions(doc));
  });
});
