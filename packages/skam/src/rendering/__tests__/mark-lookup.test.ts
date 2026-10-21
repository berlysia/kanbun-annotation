import { describe, it, expect } from 'vitest';
import type { Block, Mark, Token } from '../../index.js';
import { isPositionBasedMark } from '../../index.js';
import { groupTokensByBlock } from '../block-utils.js';
import { createMarkLookup, getMarksForToken } from '../mark-lookup.js';

// ============================================================================
// oracle: 索引導入前の getMarksForToken の実装そのまま
// ============================================================================

// oxlint-disable-next-line eslint/complexity
function oracleGetMarksForToken(
  tokenId: string,
  marks: Mark[],
  allTokens: Token[]
): Map<Mark['type'], Mark[]> {
  const result = new Map<Mark['type'], Mark[]>();

  const startMarkTypes = new Set(['yomigana']);
  const endMarkTypes = new Set(['okurigana', 'soegana']);

  for (const mark of marks) {
    if (isPositionBasedMark(mark)) {
      if ('after' in mark.position && mark.position.after === tokenId) {
        const existing = result.get(mark.type) ?? [];
        existing.push(mark);
        result.set(mark.type, existing);
      }
      continue;
    }

    if (startMarkTypes.has(mark.type)) {
      if (mark.anchor.from === tokenId) {
        const existing = result.get(mark.type) ?? [];
        existing.push(mark);
        result.set(mark.type, existing);
      }
    } else if (endMarkTypes.has(mark.type)) {
      if (mark.anchor.to === tokenId) {
        const existing = result.get(mark.type) ?? [];
        existing.push(mark);
        result.set(mark.type, existing);
      }
    } else {
      let matched = mark.anchor.from === tokenId || mark.anchor.to === tokenId;
      if (!matched && mark.anchor.from !== mark.anchor.to) {
        const fromIdx = allTokens.findIndex((t) => t.id === mark.anchor.from);
        const toIdx = allTokens.findIndex((t) => t.id === mark.anchor.to);
        const tokenIdx = allTokens.findIndex((t) => t.id === tokenId);
        if (fromIdx !== -1 && toIdx !== -1 && tokenIdx !== -1) {
          matched = tokenIdx > fromIdx && tokenIdx < toIdx;
        }
      }
      if (matched) {
        const existing = result.get(mark.type) ?? [];
        existing.push(mark);
        result.set(mark.type, existing);
      }
    }
  }

  return result;
}

// ============================================================================
// ヘルパー
// ============================================================================

function tok(id: string): Token {
  return { id, text: id };
}

function toks(...ids: string[]): Token[] {
  return ids.map(tok);
}

function anchored(type: string, from: string, to: string): Mark {
  return { type, anchor: { from, to } } as unknown as Mark;
}

function positioned(type: 'kaeri' | 'kutoten' | 'ref', after: string): Mark {
  return { type, position: { blockId: 'b', after }, value: 'x' } as unknown as Mark;
}

/** 戻り値を「鍵の順序つきの [type, 注記の配列]」に直して比較しやすくする */
function entriesOf(map: ReadonlyMap<string, readonly Mark[]>): [string, readonly Mark[]][] {
  return [...map.entries()];
}

function expectSameResult(
  actual: ReadonlyMap<string, readonly Mark[]>,
  expected: ReadonlyMap<string, readonly Mark[]>
): void {
  const a = entriesOf(actual);
  const e = entriesOf(expected);
  expect(a.map(([k]) => k)).toEqual(e.map(([k]) => k));
  for (const [i, [, list]] of a.entries()) {
    const expectedList = e[i]![1];
    expect(list).toHaveLength(expectedList.length);
    for (const [j, mark] of list.entries()) {
      expect(mark).toBe(expectedList[j]);
    }
  }
}

function typesAt(
  lookup: ReturnType<typeof createMarkLookup>,
  id: string,
  type: string
): readonly Mark[] {
  return lookup(id).get(type as Mark['type']) ?? [];
}

// mulberry32: 固定種の PRNG
function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ANCHOR_TYPES = [
  'yomigana',
  'okurigana',
  'soegana',
  'emphasis',
  'highlight',
  'tateten',
  'saidoku',
  'okototen',
  'okimoji',
  'joji',
];
const POSITION_TYPES = ['kaeri', 'kutoten', 'ref'] as const;

interface RandomDoc {
  tokens: Token[];
  blocks: Block[];
  marks: Mark[];
}

function createRandomDoc(rng: () => number): RandomDoc {
  const int = (min: number, max: number): number => min + Math.floor(rng() * (max - min + 1));
  const blockCount = int(1, 3);
  const tokens: Token[] = [];
  const blocks: Block[] = [];
  let n = 0;
  for (let b = 0; b < blockCount; b++) {
    const ids: string[] = [];
    for (let i = int(1, 12); i > 0; i--) {
      const id = `t${++n}`;
      tokens.push(tok(id));
      ids.push(id);
    }
    blocks.push({ id: `b${b + 1}`, tokenIds: ids });
  }
  // tokens[] の順序に意味は無いので、並びも崩す
  if (rng() < 0.5) tokens.reverse();

  // tokens[] に無い id を block に入れる
  if (rng() < 0.2) blocks[0]!.tokenIds.splice(int(0, blocks[0]!.tokenIds.length), 0, 'ghost-b');
  // blocks が空の文書
  const emptyBlocks = rng() < 0.1;

  const pickId = (): string => {
    // 稀に tokens[] に無い id を anchor / position に入れる
    if (rng() < 0.05) return 'ghost-a';
    return tokens[int(0, tokens.length - 1)]!.id;
  };

  const marks: Mark[] = [];
  for (let i = int(0, 15); i > 0; i--) {
    if (rng() < 0.2) {
      marks.push(positioned(POSITION_TYPES[int(0, 2)]!, pickId()));
      continue;
    }
    const type = ANCHOR_TYPES[int(0, ANCHOR_TYPES.length - 1)]!;
    const from = pickId();
    if (rng() < 0.3) {
      marks.push(anchored(type, from, from));
      continue;
    }
    // 範囲の長さ 1〜5 を原文順で取る (block をまたぐ・逆向きも混ぜる)
    const order = blocks.flatMap((b) => b.tokenIds);
    const at = order.indexOf(from);
    let to: string;
    if (at === -1 || rng() < 0.15) {
      to = pickId();
    } else {
      const len = int(1, 5);
      const dir = rng() < 0.15 ? -1 : 1;
      to = order[Math.min(order.length - 1, Math.max(0, at + dir * len))] ?? from;
    }
    marks.push(anchored(type, from, to));
  }

  return { tokens, blocks: emptyBlocks ? [] : blocks, marks };
}

// ============================================================================
// createMarkLookup
// ============================================================================

describe('createMarkLookup', () => {
  // 全パッケージを並列で流した負荷で既定の 5 秒を超えたので、長く待つ
  it(
    '固定種の乱数の 200 文書で、列を渡した従来の実装と鍵の順序・同一性・順序まで一致する',
    { timeout: 30_000 },
    () => {
      const rng = createRng(20261021);
      for (let d = 0; d < 200; d++) {
        const doc = createRandomDoc(rng);
        const groups = groupTokensByBlock(doc.blocks, doc.tokens);
        const lookup = createMarkLookup(
          doc.marks,
          groups.map((g) => g.tokens)
        );
        for (const group of groups) {
          for (const token of group.tokens) {
            expectSameResult(
              lookup(token.id),
              oracleGetMarksForToken(token.id, doc.marks, group.tokens)
            );
          }
        }
      }
    }
  );

  it('範囲の注記は from と to とその間の字に付く', () => {
    const emphasis = anchored('emphasis', 't2', 't4');
    const lookup = createMarkLookup([emphasis], [toks('t1', 't2', 't3', 't4', 't5')]);
    expect(typesAt(lookup, 't1', 'emphasis')).toEqual([]);
    expect(typesAt(lookup, 't2', 'emphasis')).toEqual([emphasis]);
    expect(typesAt(lookup, 't3', 'emphasis')).toEqual([emphasis]);
    expect(typesAt(lookup, 't4', 'emphasis')).toEqual([emphasis]);
    expect(typesAt(lookup, 't5', 'emphasis')).toEqual([]);
  });

  it('from が to より後ろの範囲は、両端だけに付き間の字には付かない', () => {
    const emphasis = anchored('emphasis', 't4', 't2');
    const lookup = createMarkLookup([emphasis], [toks('t1', 't2', 't3', 't4', 't5')]);
    expect(typesAt(lookup, 't4', 'emphasis')).toEqual([emphasis]);
    expect(typesAt(lookup, 't2', 'emphasis')).toEqual([emphasis]);
    expect(typesAt(lookup, 't3', 'emphasis')).toEqual([]);
  });

  it('列をまたぐ範囲は、両端だけに付き間の字には付かない', () => {
    const highlight = anchored('highlight', 't2', 't5');
    const lookup = createMarkLookup([highlight], [toks('t1', 't2', 't3'), toks('t4', 't5', 't6')]);
    expect(typesAt(lookup, 't2', 'highlight')).toEqual([highlight]);
    expect(typesAt(lookup, 't5', 'highlight')).toEqual([highlight]);
    expect(typesAt(lookup, 't3', 'highlight')).toEqual([]);
    expect(typesAt(lookup, 't4', 'highlight')).toEqual([]);
  });

  it('列の中で同じ id が 2 回ある字は、先頭の添字で判定する (従来の findIndex と同じ)', () => {
    const group = toks('t1', 't3', 't2', 't3', 't4');
    const emphasis = anchored('emphasis', 't2', 't4');
    const lookup = createMarkLookup([emphasis], [group]);
    expect(typesAt(lookup, 't3', 'emphasis')).toEqual([]);
    expectSameResult(lookup('t3'), oracleGetMarksForToken('t3', [emphasis], group));
  });

  it('同じ id が 2 つの列にある字は、最初の列の位置で判定する', () => {
    const emphasis = anchored('emphasis', 't4', 't5');
    const lookup = createMarkLookup([emphasis], [toks('t1', 't2', 't3'), toks('t4', 't3', 't5')]);
    // 従来の実装に 2 つ目の列を渡すと付くが、契約で最初の列の結果に決めた
    expect(typesAt(lookup, 't3', 'emphasis')).toEqual([]);
  });

  it('注記の無い字と、どの列にも無い id は空の Map を返す', () => {
    const lookup = createMarkLookup([anchored('emphasis', 't1', 't2')], [toks('t1', 't2', 't3')]);
    expect(lookup('t3').size).toBe(0);
    expect(lookup('nowhere').size).toBe(0);
  });

  it('anchor の端が列に無い id でも、その id の字には付く', () => {
    const emphasis = anchored('emphasis', 'ghost', 't2');
    const lookup = createMarkLookup([emphasis], [toks('t1', 't2')]);
    expect(typesAt(lookup, 'ghost', 'emphasis')).toEqual([emphasis]);
    expect(typesAt(lookup, 't2', 'emphasis')).toEqual([emphasis]);
    expect(typesAt(lookup, 't1', 'emphasis')).toEqual([]);
  });

  it('from と to が同じ id の注記は、その字に 1 回だけ入る', () => {
    const emphasis = anchored('emphasis', 't1', 't1');
    const lookup = createMarkLookup([emphasis], [toks('t1', 't1')]);
    expect(typesAt(lookup, 't1', 'emphasis')).toEqual([emphasis]);
  });

  it('id が __proto__ / constructor の字でも他の id と同じ結果で、Object.prototype を変えない', () => {
    const emphasis = anchored('emphasis', '__proto__', 'constructor');
    const group = toks('__proto__', 'toString', 'constructor');
    const lookup = createMarkLookup([emphasis], [group]);
    expect(typesAt(lookup, '__proto__', 'emphasis')).toEqual([emphasis]);
    expect(typesAt(lookup, 'toString', 'emphasis')).toEqual([emphasis]);
    expect(typesAt(lookup, 'constructor', 'emphasis')).toEqual([emphasis]);
    expect(lookup('hasOwnProperty').size).toBe(0);
    expect(Object.keys(Object.prototype)).toEqual([]);
    expect(({} as Record<string, unknown>)['emphasis']).toBeUndefined();
  });

  it('同じ字への注記は marks の順に並び、鍵の順序は最初に現れた順になる', () => {
    const y1 = anchored('yomigana', 't1', 't1');
    const e = anchored('emphasis', 't1', 't1');
    const y2 = anchored('yomigana', 't1', 't2');
    const lookup = createMarkLookup([y1, e, y2], [toks('t1', 't2')]);
    const map = lookup('t1');
    expect([...map.keys()]).toEqual(['yomigana', 'emphasis']);
    expect(map.get('yomigana')).toEqual([y1, y2]);
    expect(map.get('yomigana')?.[0]).toBe(y1);
  });

  it('yomigana は from、okurigana と soegana は to、position の注記は after に付く', () => {
    const y = anchored('yomigana', 't1', 't3');
    const o = anchored('okurigana', 't1', 't3');
    const s = anchored('soegana', 't1', 't3');
    const k = positioned('kaeri', 't2');
    const lookup = createMarkLookup([y, o, s, k], [toks('t1', 't2', 't3')]);
    expect([...lookup('t1').keys()]).toEqual(['yomigana']);
    expect([...lookup('t2').keys()]).toEqual(['kaeri']);
    expect([...lookup('t3').keys()]).toEqual(['okurigana', 'soegana']);
  });
});

// ============================================================================
// getMarksForToken (署名と結果は従来どおり)
// ============================================================================

describe('getMarksForToken', () => {
  it('tokens[] の順序の配列を渡しても従来の実装と同じ結果を返す', () => {
    const rng = createRng(7);
    for (let d = 0; d < 50; d++) {
      const doc = createRandomDoc(rng);
      for (const token of doc.tokens) {
        expectSameResult(
          getMarksForToken(token.id, doc.marks, doc.tokens),
          oracleGetMarksForToken(token.id, doc.marks, doc.tokens)
        );
      }
    }
  });

  it('返した Map と配列を書き換えても、次の呼び出しの結果は変わらない', () => {
    const emphasis = anchored('emphasis', 't1', 't2');
    const marks = [emphasis];
    const tokens = toks('t1', 't2');
    const first = getMarksForToken('t1', marks, tokens);
    first.get('emphasis')!.push(anchored('emphasis', 'x', 'y'));
    first.set('joji', []);
    const second = getMarksForToken('t1', marks, tokens);
    expect([...second.keys()]).toEqual(['emphasis']);
    expect(second.get('emphasis')).toEqual([emphasis]);
  });
});
