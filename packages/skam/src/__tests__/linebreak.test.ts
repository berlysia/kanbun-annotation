import { describe, it, expect } from 'vitest';
import { validateSKAMDocument } from '../validator.js';
import { getLinebreakPlacementIssues } from '../index.js';
import { getTatetenGroups, getHighlightGroups } from '../rendering/mark-groups.js';
import { selectDrawnReadings } from '../line-units.js';
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
      const a = groups.get(doc.tokens[i]!.id) ?? [];
      const b = groups.get(doc.tokens[i + 1]!.id) ?? [];
      if (a.some((mark) => b.includes(mark))) joined.push(i);
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
    ['グループが 1 字だけ重なる', [t('t1', 't2'), t('t2', 't3')]],
  ] as [string, Mark[]][])('%s', (_name, marks) => {
    const doc = createDoc(marks);
    // 末尾の字の後ろは block-end なので、inside-unit は 0..2 の範囲
    expect(insideUnitPositions(doc)).toEqual(tatetenJoinedPositions(doc));
  });

  it('重なる竪点 t1-t2 と t2-t3 は (t1,t2)、(t2,t3) が不可分', () => {
    const doc = createDoc([t('t1', 't2'), t('t2', 't3')]);
    expect(tatetenJoinedPositions(doc)).toEqual([0, 1]);
    expect(insideUnitPositions(doc)).toEqual([0, 1]);
  });
});

describe('getTatetenGroups と getHighlightGroups は字ごとに注記の配列を返す', () => {
  const tokens = createDoc([]).tokens;

  it('tateten t1-t2 と t2-t3 → t2 は 2 つ (marks[] の順)', () => {
    const a: Mark = { type: 'tateten', anchor: { from: 't1', to: 't2' } };
    const b: Mark = { type: 'tateten', anchor: { from: 't2', to: 't3' } };
    const groups = getTatetenGroups(tokens, [a, b]);
    expect(groups.get('t1')).toEqual([a]);
    expect(groups.get('t2')).toEqual([a, b]);
    expect(groups.get('t2')![0]).toBe(a);
    expect(groups.get('t3')).toEqual([b]);
    expect(groups.has('t4')).toBe(false);
  });

  it('highlight t1-t3 と t2-t4 → t2、t3 は 2 つ', () => {
    const a: Mark = { type: 'highlight', anchor: { from: 't1', to: 't3' } };
    const b: Mark = { type: 'highlight', anchor: { from: 't2', to: 't4' } };
    const groups = getHighlightGroups(tokens, [a, b]);
    expect(groups.get('t1')).toHaveLength(1);
    expect(groups.get('t2')).toHaveLength(2);
    expect(groups.get('t3')).toHaveLength(2);
    expect(groups.get('t4')).toHaveLength(1);
  });

  it('重なりの無い文書は各字の配列が 1 要素で、同じ注記を指す', () => {
    const a: Mark = { type: 'tateten', anchor: { from: 't1', to: 't2' } };
    const b: Mark = { type: 'tateten', anchor: { from: 't4', to: 't4' } };
    const groups = getTatetenGroups(tokens, [a, b]);
    expect(groups.get('t1')).toEqual([a]);
    expect(groups.get('t2')![0]).toBe(groups.get('t1')![0]);
    expect(groups.get('t4')).toEqual([b]);
    expect(groups.has('t3')).toBe(false);
  });

  it('範囲が逆、字が無い注記は割り当てない', () => {
    const reversed: Mark = { type: 'tateten', anchor: { from: 't3', to: 't1' } };
    const missing: Mark = { type: 'tateten', anchor: { from: 't1', to: 'x' } };
    expect(getTatetenGroups(tokens, [reversed, missing]).size).toBe(0);
  });
});

describe('selectDrawnReadings (描く読みの選び方)', () => {
  const indexOf = new Map([
    ['t1', 0],
    ['t2', 1],
    ['t3', 2],
    ['t4', 3],
    ['t5', 4],
    ['t6', 5],
  ]);
  type ReadingType = 'yomigana' | 'okurigana' | 'soegana';
  const reading = (type: ReadingType, value: string, from: string, to: string): Mark => ({
    type,
    anchor: { from, to },
    value,
  });
  const chosenValues = (marks: Mark[]): string[] =>
    selectDrawnReadings(marks, indexOf).map((r) => (r.mark as { value: string }).value);

  it('連鎖 A(t1-t2)、B(t2-t3)、C(t3-t4) は A と C を選び B を捨てる', () => {
    const marks = [
      reading('yomigana', 'A', 't1', 't2'),
      reading('yomigana', 'B', 't2', 't3'),
      reading('yomigana', 'C', 't3', 't4'),
    ];
    expect(chosenValues(marks)).toEqual(['A', 'C']);
  });

  it('marks[] の順が C、B、A なら C と A を選ぶ', () => {
    const marks = [
      reading('yomigana', 'C', 't3', 't4'),
      reading('yomigana', 'B', 't2', 't3'),
      reading('yomigana', 'A', 't1', 't2'),
    ];
    expect(chosenValues(marks)).toEqual(['C', 'A']);
  });

  it('範囲の添字を返す', () => {
    const [chosen] = selectDrawnReadings([reading('okurigana', 'A', 't2', 't4')], indexOf);
    expect(chosen).toMatchObject({ from: 1, to: 3 });
  });

  it('種類が違う読みは互いを捨てない', () => {
    const marks = [
      reading('yomigana', 'Y', 't1', 't2'),
      reading('okurigana', 'O', 't2', 't3'),
      reading('soegana', 'S', 't1', 't3'),
    ];
    expect(chosenValues(marks)).toEqual(['Y', 'O', 'S']);
  });

  it('anchor が同じ 2 つ目以降 (1 字の読みも) は捨てる', () => {
    const marks = [
      reading('yomigana', 'あ', 't1', 't2'),
      reading('yomigana', 'い', 't1', 't2'),
      reading('yomigana', 'う', 't3', 't3'),
      reading('yomigana', 'え', 't3', 't3'),
    ];
    expect(chosenValues(marks)).toEqual(['あ', 'う']);
  });

  it('範囲が逆、ブロックに無い字を指す読みは選ばない', () => {
    const marks = [
      reading('yomigana', 'rev', 't3', 't1'),
      reading('yomigana', 'none', 't1', 'x9'),
      reading('yomigana', 'ok', 't1', 't1'),
    ];
    expect(chosenValues(marks)).toEqual(['ok']);
  });

  it('ランダムな範囲の組 (200 組) で、総当たりの選び方と同じになる', () => {
    let seed = 7;
    const next = (bound: number): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return Math.floor(seed / 65536) % bound;
    };
    const types: ReadingType[] = ['yomigana', 'okurigana', 'soegana'];
    for (let round = 0; round < 200; round++) {
      const marks: Mark[] = [];
      const ranges: { type: ReadingType; from: number; to: number }[] = [];
      const count = 1 + next(8);
      for (let i = 0; i < count; i++) {
        const type = types[next(3)]!;
        const from = next(6);
        const to = from + next(6 - from);
        ranges.push({ type, from, to });
        marks.push(reading(type, String(i), `t${from + 1}`, `t${to + 1}`));
      }
      const expected: string[] = [];
      const taken: { type: ReadingType; from: number; to: number }[] = [];
      ranges.forEach((range, i) => {
        const clash = taken.some(
          (t) => t.type === range.type && t.from <= range.to && range.from <= t.to
        );
        if (!clash) {
          taken.push(range);
          expected.push(String(i));
        }
      });
      expect(chosenValues(marks)).toEqual(expected);
    }
  });
});

describe('不可分単位は選んだ読みだけから作る', () => {
  it('yomigana t1-t2 と、捨てる yomigana t2-t3 では、t2 と t3 の間の改行は無視されない', () => {
    const doc = createDoc([
      { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'a' },
      { type: 'yomigana', anchor: { from: 't2', to: 't3' }, value: 'b' },
      br('t1'),
      br('t2'),
    ]);
    const issues = getLinebreakPlacementIssues(doc);
    expect(issues.get(2)).toBe('inside-unit');
    expect(issues.has(3)).toBe(false);
  });

  it('捨てない読みの連鎖 A(t1-t2)、C(t3-t4) は t2 と t3 の間も可', () => {
    const doc = createDoc([
      { type: 'okurigana', anchor: { from: 't1', to: 't2' }, value: 'a' },
      { type: 'okurigana', anchor: { from: 't2', to: 't3' }, value: 'b' },
      { type: 'okurigana', anchor: { from: 't3', to: 't4' }, value: 'c' },
      br('t2'),
    ]);
    expect(getLinebreakPlacementIssues(doc).has(3)).toBe(false);
  });
});
