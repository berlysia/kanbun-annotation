/// <reference types="node" />
import { describe, it, expect, expectTypeOf } from 'vitest';
import type { SKAMDocument, Mark } from '../../index.js';
import { buildAnnotationIR } from '../build-annotation-ir.js';
import { RENDER_PROFILES, type RenderProfile } from '../render-profile.js';
import {
  describeAnnotationIR,
  formatAccessibleText,
  type AccessibleBlock,
} from '../accessible-text.js';
import { DEFAULT_ACCESSIBLE_LABELS, type AccessibleLabels } from '../accessible-labels.js';

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

  it('2 token にまたがる yomigana は字ごとの単位と、最後の字の後ろの読み仮名の単位になる', () => {
    const doc = createDoc([
      { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'がくじ' },
    ]);
    const us = units(doc, FULL);
    expect(us.map((u) => u.text)).toEqual(['學', '而', '', '時', '習', '之']);
    expect(us[0]!.notes).toEqual([]);
    expect(us[1]!.notes).toEqual([]);
    expect(us[2]!.notes).toEqual([{ kind: 'yomigana', value: 'がくじ' }]);
  });

  it('範囲の末尾に付いた返り点は、その字の単位の notes に入り、読み仮名はその後ろに読む', () => {
    const doc = createDoc([
      { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'がくじ' },
      { type: 'kaeri', position: { blockId: 'b1', after: 't2' }, value: '㆑' },
    ]);
    const us = units(doc, FULL);
    expect(us.map((u) => u.text)).toEqual(['學', '而', '', '時', '習', '之']);
    expect(us[1]!.notes).toEqual([{ kind: 'kaeri', value: '㆑' }]);
    expect(us[2]!.notes).toEqual([{ kind: 'yomigana', value: 'がくじ' }]);
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

  it('竪点のグループ全体にかかる読みは、字と区切りを順に読み、読み仮名を最後に読む', () => {
    const doc = createDoc([
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'yomigana', anchor: { from: 't1', to: 't2' }, value: 'がくじ' },
    ]);
    const us = units(doc, FULL);
    expect(us.map((u) => u.text)).toEqual(['學', '', '而', '', '時', '習', '之']);
    expect(us[1]!.notes).toEqual([{ kind: 'tateten' }]);
    expect(us[3]!.notes).toEqual([{ kind: 'yomigana', value: 'がくじ' }]);
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

  it('範囲が竪点のグループからはみ出すとき、範囲の読みは範囲の最後の字の後ろで読む', () => {
    const doc = createDoc([
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'yomigana', anchor: { from: 't1', to: 't3' }, value: 'がくじし' },
    ]);
    const us = units(doc, FULL);
    expect(us.map((u) => u.text)).toEqual(['學', '', '而', '時', '', '習', '之']);
    expect(us[0]!.notes).toEqual([]);
    expect(us[4]!.notes).toEqual([{ kind: 'yomigana', value: 'がくじし' }]);
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

// ============================================================================
// formatAccessibleText
// ============================================================================

function format(
  doc: SKAMDocument,
  profile: RenderProfile,
  labels?: Partial<AccessibleLabels>
): string {
  return formatAccessibleText(describe1(doc, profile), labels);
}

describe('formatAccessibleText', () => {
  it('學而時習之を full で言葉にする', () => {
    expect(format(createDoc(GAKUJI_MARKS), FULL)).toBe(
      '學、送り仮名 ビテ。而、置き字。時、送り仮名 ニ。習、送り仮名 フ、レ点。之、送り仮名 ヲ。'
    );
  });

  it('同じ文書を learningBasic で言葉にする', () => {
    expect(format(createDoc(GAKUJI_MARKS), BASIC)).toBe('學。而、置き字。時。習、レ点。之。');
  });

  it('空文字を返す label の note は出ない', () => {
    expect(format(createDoc(GAKUJI_MARKS), BASIC, { okimoji: () => '' })).toBe(
      '學。而。時。習、レ点。之。'
    );
  });

  it('例外を投げる label の note は出ず、例外は外に出ない', () => {
    const labels: Partial<AccessibleLabels> = {
      kaeri: () => {
        throw new Error('x');
      },
    };
    expect(format(createDoc(GAKUJI_MARKS), BASIC, labels)).toBe('學。而、置き字。時。習。之。');
  });

  it('string 以外を返す label の note は出ない', () => {
    const labels = { kaeri: () => 42 as unknown as string } satisfies Partial<AccessibleLabels>;
    expect(format(createDoc(GAKUJI_MARKS), BASIC, labels)).toBe('學。而、置き字。時。習。之。');
  });

  it('竪点の区切りは「竪点、一点」になる', () => {
    const doc = createDoc([
      { type: 'tateten', anchor: { from: 't1', to: 't2' } },
      { type: 'kaeri', position: { blockId: 'b1', after: 't1' }, value: '㆒' },
    ]);
    expect(format(doc, FULL)).toBe('學。竪点、一点。而。時。習。之。');
  });

  it('返り点の名前: 複数の字は読みをつなぎ、表に無い値は「返り点 {値}」にする', () => {
    const name = (value: string) => DEFAULT_ACCESSIBLE_LABELS.kaeri({ kind: 'kaeri', value });
    expect(name('㆑')).toBe('レ点');
    expect(name('㆒㆑')).toBe('一レ点');
    expect(name('㆖')).toBe('上点');
    expect(name('X')).toBe('返り点 X');
    expect(name('㆒X')).toBe('返り点 ㆒X');
  });

  it('返り点の表は U+3191〜U+319F を全部引ける', () => {
    const all = '㆑㆒㆓㆔㆕㆖㆗㆘㆙㆚㆛㆜㆝㆞㆟';
    for (const ch of all) {
      expect(DEFAULT_ACCESSIBLE_LABELS.kaeri({ kind: 'kaeri', value: ch })).not.toMatch(/^返り点/);
    }
  });

  it('再読文字は「再読文字 {1 回目} {2 回目}」になる', () => {
    const doc = createDoc([
      {
        type: 'saidoku',
        anchor: { from: 't3', to: 't3' },
        forms: [
          { yomi: 'いま', okuri: 'ダ' },
          { yomi: 'ず', okuri: '' },
        ],
      },
    ]);
    expect(format(doc, FULL)).toBe('學。而。時、再読文字 いまダ ず。習。之。');
  });

  it('再読文字の空の部分は空白ごと省く', () => {
    const label = DEFAULT_ACCESSIBLE_LABELS.saidoku;
    expect(label({ kind: 'saidoku', first: 'いま', second: '' })).toBe('再読文字 いま');
    expect(label({ kind: 'saidoku', first: '', second: 'ず' })).toBe('再読文字 ず');
  });

  it('ref と highlight', () => {
    const doc = createDoc([
      { type: 'highlight', id: 'hl1', anchor: { from: 't2', to: 't3' }, style: 'solid', ref: 'r1' },
      { type: 'ref', id: 'r1', position: { blockId: 'b1', after: 't3' }, format: 'numeric-paren' },
      { type: 'ref', id: 'r2', position: { blockId: 'b1', after: 't5' }, format: 'numeric-paren' },
    ]);
    expect(format(doc, FULL)).toBe('學。傍線 (1) 始め。而。時。傍線 終わり。習。之、注 (2)。');
  });

  it('ref のラベルが無い highlight は「傍線 始め」', () => {
    const doc = createDoc([
      { type: 'highlight', anchor: { from: 't2', to: 't3' }, style: 'solid' },
    ]);
    expect(format(doc, FULL)).toBe('學。傍線 始め。而。時。傍線 終わり。習。之。');
  });

  it('添え仮名・読み仮名・傍点・ヲコト点・助字・置き字・句読点の既定の言葉', () => {
    const d = DEFAULT_ACCESSIBLE_LABELS;
    expect(d.soegana({ kind: 'soegana', value: 'ノ' })).toBe('添え仮名 ノ');
    expect(d.yomigana({ kind: 'yomigana', value: 'がく' })).toBe('読み がく');
    expect(d.okurigana({ kind: 'okurigana', value: 'ビテ' })).toBe('送り仮名 ビテ');
    expect(d.emphasis({ kind: 'emphasis' })).toBe('傍点');
    expect(d.okototen({ kind: 'okototen' })).toBe('ヲコト点');
    expect(d.joji({ kind: 'joji' })).toBe('助字');
    expect(d.okimoji({ kind: 'okimoji' })).toBe('置き字');
    expect(d.kutoten({ kind: 'kutoten', value: '。' })).toBe('句点');
    expect(d.kutoten({ kind: 'kutoten', value: '、' })).toBe('読点');
    expect(d.kutoten({ kind: 'kutoten', value: '・' })).toBe('句読点 ・');
    expect(d.tateten({ kind: 'tateten' })).toBe('竪点');
    expect(d.tateten({ kind: 'tateten', kaeri: '㆒' })).toBe('竪点、一点');
    expect(d.ref({ kind: 'ref', label: '(1)' })).toBe('注 (1)');
    expect(d.highlightStart({ kind: 'highlightStart', label: '(1)' })).toBe('傍線 (1) 始め');
    expect(d.highlightEnd({ kind: 'highlightEnd' })).toBe('傍線 終わり');
  });

  it('ブロック先頭の ref は「注 (1)。」になる', () => {
    const doc = createDoc([
      { type: 'ref', id: 'r1', position: { blockId: 'b1' }, format: 'numeric-paren' },
    ]);
    expect(format(doc, FULL)).toBe('注 (1)。學。而。時。習。之。');
  });

  it('own でない kind の label は無視して既定の言葉を使う', () => {
    const labels = Object.create({ kaeri: () => 'X' }) as Partial<AccessibleLabels>;
    expect(format(createDoc(GAKUJI_MARKS), BASIC, labels)).toBe(
      '學。而、置き字。時。習、レ点。之。'
    );
  });

  it('label の中で note を書き換えようとしても、例外は外に出ず、他の出力も変わらない', () => {
    const air = buildAnnotationIR(createDoc(GAKUJI_MARKS), BASIC);
    const before = structuredClone(air);
    const blocks = describeAnnotationIR(air);
    const labels: Partial<AccessibleLabels> = {
      kaeri: (note) => {
        (note as { value: string }).value = 'x';
        return 'X';
      },
    };
    expect(formatAccessibleText(blocks, labels)).toBe('學。而、置き字。時。習。之。');
    expect(air).toEqual(before);
    // 書き換えようとした note は、渡す前に凍結されているので元の値のまま
    expect(formatAccessibleText(blocks)).toBe('學。而、置き字。時。習、レ点。之。');
  });

  it('凍結していない note を渡されても、label には凍結したコピーを渡す', () => {
    const blocks: AccessibleBlock[] = [
      { blockId: 'b1', units: [{ text: '習', notes: [{ kind: 'kaeri', value: '㆑' }] }] },
    ];
    let frozen = false;
    formatAccessibleText(blocks, {
      kaeri: (note) => {
        frozen = Object.isFrozen(note);
        return 'x';
      },
    });
    expect(frozen).toBe(true);
    expect(Object.isFrozen(blocks[0]!.units[0]!.notes[0])).toBe(false);
  });

  it('labels.okurigana の引数の型は kind で絞られる', () => {
    expectTypeOf<Parameters<AccessibleLabels['okurigana']>[0]>().toEqualTypeOf<{
      kind: 'okurigana';
      value: string;
    }>();
    expectTypeOf<Parameters<AccessibleLabels['okurigana']>[0]>().not.toBeNever();
  });

  it('2 ブロックの間は半角空白 1 つでつなぐ', () => {
    const doc: SKAMDocument = {
      ...createDoc(),
      blocks: [
        { id: 'b1', tokenIds: ['t1', 't2'] },
        { id: 'b2', tokenIds: ['t3', 't4', 't5'] },
      ],
    };
    expect(format(doc, FULL)).toBe('學。而。 時。習。之。');
  });

  it('すべての label が空文字を返し、本文の無い単位だけのブロックは空文字になる', () => {
    const blocks: AccessibleBlock[] = [
      { blockId: 'b1', units: [{ text: '', notes: [{ kind: 'kutoten', value: '。' }] }] },
    ];
    expect(formatAccessibleText(blocks, { kutoten: () => '' })).toBe('');
  });

  it('出る単位が無いブロックは、区切りの空白も出さない', () => {
    const blocks: AccessibleBlock[] = [
      { blockId: 'b1', units: [{ text: '', notes: [{ kind: 'kutoten', value: '。' }] }] },
      { blockId: 'b2', units: [{ text: '學', notes: [] }] },
    ];
    expect(formatAccessibleText(blocks, { kutoten: () => '' })).toBe('學。');
  });

  it('label が HTML を返しても、エスケープせずそのまま入る', () => {
    const out = format(createDoc(GAKUJI_MARKS), BASIC, { kaeri: () => '<img src=x onerror=1>' });
    expect(out).toContain('習、<img src=x onerror=1>。');
  });

  it('未知の kind の note は出さない', () => {
    const blocks = [
      { blockId: 'b1', units: [{ text: '學', notes: [{ kind: 'future' }] }] },
    ] as unknown as AccessibleBlock[];
    expect(formatAccessibleText(blocks)).toBe('學。');
  });
});
