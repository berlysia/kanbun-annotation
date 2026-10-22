/// <reference types="node" />
import { describe, it, expect, vi } from 'vitest';
import { stringify, SKAMXMLStringifyError, type StringifyLoss } from '../index.js';
import type { SKAMDocument } from '@kanbun-skam/skam';

const doc = (over: Partial<SKAMDocument> = {}): SKAMDocument => ({
  format: 'skam@0.1',
  readings: [],
  tokens: [
    { id: 't1', text: '甲' },
    { id: 't2', text: '乙' },
    { id: 't3', text: '丙' },
  ],
  blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3'] }],
  marks: [],
  ...over,
});
const partial = doc({
  marks: [
    { id: 'e1', type: 'emphasis', anchor: { from: 't1', to: 't2' } },
    { id: 'h1', type: 'highlight', anchor: { from: 't2', to: 't3' } },
  ],
});
const lossesOf = (d: SKAMDocument) => {
  try {
    stringify(d);
    return [];
  } catch (e) {
    return [...(e as SKAMXMLStringifyError).losses];
  }
};

describe('stringify loss contract (K1)', () => {
  it('throws SKAMXMLStringifyError with all losses by default', () => {
    expect(lossesOf(partial)).toEqual([
      expect.objectContaining({
        category: 'unsupported',
        code: 'PARTIAL_OVERLAP',
        path: '/marks/1',
        markId: 'h1',
      }),
    ]);
  });
  it('lossy:true returns XML and calls onLoss in order', () => {
    const seen: StringifyLoss[] = [];
    const xml = stringify(partial, { lossy: true, onLoss: (l) => seen.push(l) });
    expect(xml).toContain('<skam:span type="emphasis" xml:id="e1">');
    expect(seen.map((l) => l.code)).toEqual(['PARTIAL_OVERLAP']);
  });
  it('does not call onLoss when lossy is false', () => {
    const seen: StringifyLoss[] = [];
    expect(() => stringify(partial, { onLoss: (l) => seen.push(l) })).toThrow(
      SKAMXMLStringifyError
    );
    expect(seen).toEqual([]);
  });
  it('propagates exceptions from onLoss and returns no XML', () => {
    expect(() =>
      stringify(partial, {
        lossy: true,
        onLoss: () => {
          throw new Error('stop');
        },
      })
    ).toThrow('stop');
  });
  it('orders document-level losses first, then by block, token, mark index', () => {
    const d = doc({
      ext: { a: 1 },
      derivations: [{ kind: 'readingOrder', method: 'kaeriten-stack', order: ['t1'] }] as never,
      tokens: [
        { id: 't1', text: '甲' },
        { id: 't2', text: '乙', ext: { b: 1 } },
        { id: 't3', text: '丙' },
      ],
      marks: [
        { id: 'h1', type: 'highlight', anchor: { from: 't2', to: 't3' } },
        { id: 'e1', type: 'emphasis', anchor: { from: 't1', to: 't2' } },
      ],
    });
    // collectRangeMarks は開始位置の昇順に並べるので、e1 (t1–t2) が残り、h1 (marks[0], t2–t3) が部分交差で落ちる。
    // h1 の鍵は {0,1,0,0}、tokens/1/ext の鍵は {0,1,-1,0} なので、token の ext が先に来る。
    expect(lossesOf(d).map((l) => l.path)).toEqual([
      '/ext',
      '/derivations',
      '/tokens/1/ext',
      '/marks/0',
    ]);
  });
  it('is deterministic across calls', () => {
    expect(lossesOf(partial)).toEqual(lossesOf(partial));
  });
  it('no longer calls console.warn', () => {
    const spy = vi.spyOn(console, 'warn');
    stringify(partial, { lossy: true });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

const lossCodes = (d: SKAMDocument) => {
  const out: string[] = [];
  stringify(d, { lossy: true, onLoss: (l) => out.push(`${l.category}:${l.code}@${l.path}`) });
  return out;
};

describe('each loss code is produced (K1)', () => {
  it('ASCII_WHITESPACE_TOKEN', () =>
    expect(
      lossCodes(
        doc({
          tokens: [
            { id: 't1', text: ' ' },
            { id: 't2', text: '乙' },
            { id: 't3', text: '丙' },
          ],
        })
      )
    ).toContain('unrepresentable:ASCII_WHITESPACE_TOKEN@/tokens/0'));
  it('U+3000 token is not a loss', () =>
    expect(
      lossCodes(
        doc({
          tokens: [
            { id: 't1', text: '　' },
            { id: 't2', text: '乙' },
            { id: 't3', text: '丙' },
          ],
        })
      )
    ).toEqual([]));
  it('BLOCK_START_KAERI (unvalidated input)', () =>
    expect(
      lossCodes(doc({ marks: [{ type: 'kaeri', value: '㆑', position: { blockId: 'b1' } }] }))
    ).toContain('unrepresentable:BLOCK_START_KAERI@/marks/0'));
  it('DANGLING_REFERENCE (unvalidated input)', () =>
    expect(
      lossCodes(
        doc({
          marks: [{ type: 'kutoten', value: '。', position: { blockId: 'b1', after: 'tX' } }],
        })
      )
    ).toContain('unrepresentable:DANGLING_REFERENCE@/marks/0'));
  it('CROSS_BLOCK_ANCHOR (unvalidated input)', () =>
    expect(
      lossCodes(
        doc({
          blocks: [
            { id: 'b1', tokenIds: ['t1'] },
            { id: 'b2', tokenIds: ['t2', 't3'] },
          ],
          marks: [{ type: 'emphasis', anchor: { from: 't1', to: 't2' } }],
        })
      )
    ).toContain('unrepresentable:CROSS_BLOCK_ANCHOR@/marks/0'));
  it('PLACEMENT_HINT', () =>
    expect(
      lossCodes(
        doc({
          marks: [{ type: 'okimoji', anchor: { from: 't1', to: 't1' }, placementHint: 'inline' }],
        })
      )
    ).toContain('unsupported:PLACEMENT_HINT@/marks/0/placementHint'));
  it('UNNESTABLE_OVERLAP: range group with okuri containing an inner single-token kun', () =>
    expect(
      lossCodes(
        doc({
          marks: [
            { type: 'okurigana', anchor: { from: 't1', to: 't2' }, value: 'て' },
            { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'び' },
          ],
        })
      ).filter((c) => c.startsWith('unsupported:UNNESTABLE_OVERLAP'))
    ).toHaveLength(1));
});

describe('implementation gaps fixed (K1) — output shape', () => {
  it('emits block-start kutoten and ref before the first token', () => {
    const xml = stringify(
      doc({
        marks: [
          { type: 'kutoten', kind: 'ku', value: '。', position: { blockId: 'b1' } },
          { id: 'r1', type: 'ref', format: 'numeric-bracket', position: { blockId: 'b1' } },
        ],
      })
    );
    expect(xml).toMatch(/<skam:block xml:id="b1"><skam:kutoten[^>]*\/><skam:ref[^>]*\/>甲/);
  });
  it('uses the yomigana wrapper only when a yomi-only range contains an inner kun', () => {
    expect(
      stringify(
        doc({
          marks: [
            { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'x' },
            { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'y' },
          ],
        })
      )
    ).toContain('<skam:yomigana value="x"><skam:kun okuri="y">甲</skam:kun>乙</skam:yomigana>');
    expect(
      stringify(
        doc({ marks: [{ type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'x' }] })
      )
    ).toContain('<skam:kun yomi="x">甲乙</skam:kun>');
  });
  it('emits a content-only ref inline', () => {
    expect(
      stringify(
        doc({
          marks: [
            {
              type: 'ref',
              format: 'numeric-bracket',
              content: '注',
              position: { blockId: 'b1', after: 't1' },
            },
          ],
        })
      )
    ).toContain('甲<skam:ref format="numeric-bracket">注</skam:ref>乙');
  });
  it('emits an empty block', () => {
    expect(
      stringify(
        doc({
          blocks: [
            { id: 'b1', tokenIds: ['t1', 't2', 't3'] },
            { id: 'b2', tokenIds: [] },
          ],
        })
      )
    ).toContain('<skam:block xml:id="b2"/>');
  });
  it('emits meta in the spec form', () => {
    expect(stringify(doc())).toContain('<skam:meta tokenization="char"/>');
  });
});

describe('content model in stringify (K2b)', () => {
  const oto = {
    type: 'okototen',
    anchor: { from: 't1', to: 't1' },
    shape: 'dot',
    position: { system: 'glyph-grid', grid: '5x5', x: 1, y: 1 },
  } as const;
  it('emits multi-token okimoji / okototen / joji / saidoku as wrapping elements', () => {
    expect(
      stringify(doc({ marks: [{ type: 'okimoji', anchor: { from: 't1', to: 't2' } }] }))
    ).toContain('<skam:okimoji>甲乙</skam:okimoji>丙');
    expect(stringify(doc({ marks: [{ ...oto, anchor: { from: 't1', to: 't2' } }] }))).toMatch(
      /<skam:okototen [^>]*>甲乙<\/skam:okototen>/
    );
    expect(
      stringify(doc({ marks: [{ type: 'joji', anchor: { from: 't2', to: 't3' } }] }))
    ).toContain('甲<skam:joji>乙丙</skam:joji>');
    expect(
      stringify(
        doc({
          marks: [{ type: 'saidoku', anchor: { from: 't1', to: 't2' }, forms: [{ yomi: 'a' }] }],
        })
      )
    ).toContain('<skam:saidoku><skam:base>甲乙</skam:base>');
  });
  it('keeps saidoku outermost when several wrappers share a token', () => {
    const xml = stringify(
      doc({
        marks: [
          { type: 'okimoji', anchor: { from: 't1', to: 't1' } },
          { type: 'saidoku', anchor: { from: 't1', to: 't1' }, forms: [{ yomi: 'a' }] },
        ],
      })
    );
    expect(xml).toContain('<skam:saidoku><skam:base><skam:okimoji>甲</skam:okimoji></skam:base>');
  });
  it('nests same-range marks in the table order (okimoji outside kun) without loss', () => {
    expect(
      stringify(
        doc({
          marks: [
            { type: 'okurigana', anchor: { from: 't1', to: 't2' }, value: 'て' },
            { type: 'okimoji', anchor: { from: 't1', to: 't2' } },
          ],
        })
      )
    ).toContain('<skam:okimoji><skam:kun okuri="て">甲乙</skam:kun></skam:okimoji>');
  });
  it('reports UNNESTABLE_OVERLAP (outer dropped) for table violations', () => {
    const cases: unknown[][] = [
      [{ type: 'okurigana', anchor: { from: 't1', to: 't2' }, value: 'て' }, { ...oto }], // kun の範囲 > 包む要素
      [
        { type: 'okurigana', anchor: { from: 't1', to: 't3' }, value: 'a' },
        { type: 'okurigana', anchor: { from: 't1', to: 't2' }, value: 'b' },
      ], // kun の範囲 > kun の範囲
      [
        { type: 'okimoji', anchor: { from: 't1', to: 't3' } },
        { type: 'emphasis', anchor: { from: 't1', to: 't2' } },
      ], // 包む要素 > span
      [
        { type: 'okimoji', anchor: { from: 't1', to: 't2' } },
        { type: 'saidoku', anchor: { from: 't1', to: 't1' }, forms: [{ yomi: 'a' }] },
      ], // 包む要素 > saidoku
    ];
    for (const marks of cases) {
      expect(lossCodes(doc({ marks: marks as never }))).toEqual([
        'unsupported:UNNESTABLE_OVERLAP@/marks/0',
      ]);
    }
  });
  it('allows kun inside a multi-token saidoku base without loss', () => {
    expect(
      lossCodes(
        doc({
          marks: [
            { type: 'saidoku', anchor: { from: 't1', to: 't2' }, forms: [{ yomi: 'a' }] },
            { type: 'soegana', anchor: { from: 't1', to: 't1' }, value: 'ヲ' },
          ],
        })
      )
    ).toEqual([]);
  });
  it('reports UNNESTABLE_OVERLAP for yomigana and a wrapper on the same range', () => {
    expect(
      lossCodes(
        doc({
          marks: [
            { type: 'okimoji', anchor: { from: 't1', to: 't2' } },
            { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'x' },
            { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'y' },
          ],
        })
      )
    ).toEqual(['unsupported:UNNESTABLE_OVERLAP@/marks/0']);
  });
  it('reports UNNESTABLE_OVERLAP when a position mark sits inside a wrapper or kun range', () => {
    expect(
      lossCodes(
        doc({
          marks: [
            { type: 'okimoji', anchor: { from: 't1', to: 't2' } },
            { type: 'kutoten', kind: 'ten', value: '、', position: { blockId: 'b1', after: 't1' } },
          ],
        })
      )
    ).toEqual(['unsupported:UNNESTABLE_OVERLAP@/marks/0']);
    expect(
      lossCodes(
        doc({
          marks: [
            { type: 'okurigana', anchor: { from: 't1', to: 't2' }, value: 'て' },
            { type: 'kaeri', value: '㆑', position: { blockId: 'b1', after: 't1' } },
          ],
        })
      )
    ).toEqual(['unsupported:UNNESTABLE_OVERLAP@/marks/0']);
  });
  it('hoists a trailing position mark out of every range that ends on the same token', () => {
    expect(
      stringify(
        doc({
          marks: [
            { type: 'okimoji', anchor: { from: 't1', to: 't2' } },
            { ...oto, anchor: { from: 't1', to: 't2' } },
            { type: 'kutoten', kind: 'ku', value: '。', position: { blockId: 'b1', after: 't2' } },
          ],
        })
      )
    ).toMatch(/<\/skam:okototen><\/skam:okimoji><skam:kutoten[^>]*\/>丙/);
  });
  it('upgrades a yomi-only range containing an inner range kun to <skam:yomigana> without loss', () => {
    const d: SKAMDocument = {
      ...doc(),
      tokens: [
        { id: 't1', text: '甲' },
        { id: 't2', text: '乙' },
        { id: 't3', text: '丙' },
        { id: 't4', text: '丁' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4'] }],
      marks: [
        { type: 'yomigana', anchor: { from: 't1', to: 't4' }, value: 'x' },
        { type: 'okurigana', anchor: { from: 't3', to: 't4' }, value: 'y' },
      ],
    };
    expect(lossCodes(d)).toEqual([]);
    expect(stringify(d)).toContain(
      '<skam:yomigana value="x">甲乙<skam:kun okuri="y">丙丁</skam:kun></skam:yomigana>'
    );
  });
  it('reports CONFLICTING_MARKS for duplicate same-type multi-token wrappers on the same range', () => {
    expect(
      lossCodes(
        doc({
          marks: [
            { type: 'okimoji', anchor: { from: 't1', to: 't2' } },
            { type: 'okimoji', anchor: { from: 't1', to: 't2' } },
          ],
        })
      )
    ).toEqual(['unrepresentable:CONFLICTING_MARKS@/marks/1']);
  });
  it('reports CONFLICTING_MARKS for duplicate same-type marks on one anchor (unvalidated input)', () => {
    for (const marks of [
      [
        { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'a' },
        { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 'b' },
      ],
      [
        { type: 'okurigana', anchor: { from: 't1', to: 't2' }, value: 'a' },
        { type: 'okurigana', anchor: { from: 't1', to: 't2' }, value: 'b' },
      ],
      [
        { type: 'okimoji', anchor: { from: 't1', to: 't1' } },
        { type: 'okimoji', anchor: { from: 't1', to: 't1' } },
      ],
    ]) {
      expect(lossCodes(doc({ marks: marks as never }))).toEqual([
        'unrepresentable:CONFLICTING_MARKS@/marks/1',
      ]);
    }
  });
  it('nests okototen marks on the same anchor without loss (SKAM-draft §6.1 allows stacking)', () => {
    const second = { ...oto, position: { system: 'glyph-grid', grid: '5x5', x: 2, y: 3 } } as const;
    for (const anchor of [
      { from: 't1', to: 't1' },
      { from: 't1', to: 't2' },
    ]) {
      const d = doc({
        marks: [
          { ...oto, anchor },
          { ...second, anchor },
        ],
      });
      expect(lossCodes(d)).toEqual([]);
      expect(stringify(d)).toMatch(/<skam:okototen [^>]*x="1"[^>]*><skam:okototen [^>]*x="2"/);
    }
  });
});

describe('ID_FORM と XML_UNWRITABLE_CHAR', () => {
  const autoDoc = (over: Partial<SKAMDocument> = {}): SKAMDocument =>
    doc({
      tokens: [
        { id: 'b#1#1', text: '甲' },
        { id: 'b#1#2', text: '乙' },
        { id: 'b#1#3', text: '丙' },
      ],
      blocks: [{ id: 'b#1', tokenIds: ['b#1#1', 'b#1#2', 'b#1#3'] }],
      ...over,
    });

  it('字の text の U+0001 は XML_UNWRITABLE_CHAR', () => {
    const d = autoDoc();
    d.tokens[0]!.text = '\u0001';
    expect(lossCodes(d)).toEqual(['unrepresentable:XML_UNWRITABLE_CHAR@/tokens/0/text']);
  });

  it('yomigana の value の U+FFFF は XML_UNWRITABLE_CHAR', () => {
    const d = autoDoc({
      marks: [
        {
          id: 'm#1',
          type: 'yomigana',
          anchor: { from: 'b#1#1', to: 'b#1#1' },
          value: String.fromCharCode(0xffff),
        },
      ],
    });
    expect(lossCodes(d)).toEqual(['unrepresentable:XML_UNWRITABLE_CHAR@/marks/0/value']);
  });

  it('注記の id が NCName でなければ ID_FORM', () => {
    const d = autoDoc({
      marks: [{ id: '1a', type: 'tateten', anchor: { from: 'b#1#1', to: 'b#1#2' } }],
    });
    expect(lossCodes(d)).toEqual(['unrepresentable:ID_FORM@/marks/0/id']);
  });

  it('2 番目のブロックの id が b#1 なら ID_FORM', () => {
    const d = autoDoc({
      blocks: [
        { id: 'b#1', tokenIds: ['b#1#1'] },
        { id: 'b#1', tokenIds: ['b#1#2', 'b#1#3'] },
      ],
    });
    expect(lossCodes(d)).toContain('unrepresentable:ID_FORM@/blocks/1/id');
  });

  it('空文字の highlight.ref は ID_FORM', () => {
    const d = autoDoc({
      marks: [{ id: 'm#1', type: 'highlight', anchor: { from: 'b#1#1', to: 'b#1#2' }, ref: '' }],
    });
    expect(lossCodes(d)).toEqual(['unrepresentable:ID_FORM@/marks/0/ref']);
  });

  it('どの ref も指さない手書きの形の highlight.ref は ID_FORM', () => {
    const d = autoDoc({
      marks: [
        { id: 'm#1', type: 'highlight', anchor: { from: 'b#1#1', to: 'b#1#2' }, ref: 'nowhere' },
      ],
    });
    expect(lossCodes(d)).toEqual(['unrepresentable:ID_FORM@/marks/0/ref']);
  });

  it('手書きの id の ref を指す highlight は損失なし (範囲の外でもよい)', () => {
    const d = autoDoc({
      marks: [
        { id: 'm#1', type: 'highlight', anchor: { from: 'b#1#1', to: 'b#1#2' }, ref: 'r1' },
        { id: 'r1', type: 'ref', position: { blockId: 'b#1', after: 'b#1#3' }, label: 'a' },
      ],
    });
    expect(lossCodes(d)).toEqual([]);
  });

  it('同じ字の okurigana o1 と soegana s1 (yomigana なし) は soegana が ID_FORM', () => {
    const d = autoDoc({
      marks: [
        { id: 'o1', type: 'okurigana', anchor: { from: 'b#1#1', to: 'b#1#1' }, value: 'a' },
        { id: 's1', type: 'soegana', anchor: { from: 'b#1#1', to: 'b#1#1' }, value: 'b' },
      ],
    });
    expect(lossCodes(d)).toEqual(['unrepresentable:ID_FORM@/marks/1/id']);
    expect(stringify(d, { lossy: true })).toContain('xml:id="o1"');
  });

  it('範囲の外の自動の id の ref を指す highlight は ID_FORM', () => {
    const d = autoDoc({
      marks: [
        { id: 'm#1', type: 'highlight', anchor: { from: 'b#1#1', to: 'b#1#2' }, ref: 'm#2' },
        { id: 'm#2', type: 'ref', position: { blockId: 'b#1', after: 'b#1#3' }, label: 'a' },
      ],
    });
    expect(lossCodes(d)).toEqual(['unrepresentable:ID_FORM@/marks/0/ref']);
  });

  it('kun にまとめる注記の 2 つ目以降の手書きの id は書けない', () => {
    const d = autoDoc({
      marks: [
        { id: 'y', type: 'yomigana', anchor: { from: 'b#1#1', to: 'b#1#1' }, value: 'a' },
        { id: 'o', type: 'okurigana', anchor: { from: 'b#1#1', to: 'b#1#1' }, value: 'b' },
      ],
    });
    expect(lossCodes(d)).toEqual(['unrepresentable:ID_FORM@/marks/1/id']);
    expect(stringify(d, { lossy: true })).toContain('xml:id="y"');
  });
});
