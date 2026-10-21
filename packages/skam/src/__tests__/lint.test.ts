import { describe, it, expect } from 'vitest';
import { validateSKAMDocument } from '../validator.js';
import {
  lintSKAMDocument,
  KAERI_SERIES,
  SAIDOKU_SINGLE_READING,
  SAIDOKU_EMPTY_FORM,
  EMPTY_KANA,
  TATETEN_SINGLE_TOKEN,
  KAERI_UNCLOSED,
  HIGHLIGHT_REF_MISSING,
} from '../lint.js';
import { KAERI } from '../index.js';
import { buildAnnotationIR } from '../rendering/build-annotation-ir.js';
import { RENDER_PROFILES } from '../rendering/render-profile.js';
import type { SKAMDocument, Mark } from '../index.js';

/** 正しい文書として扱う入力が validator を通ることを確かめてから返す */
function valid(doc: SKAMDocument): SKAMDocument {
  expect(validateSKAMDocument(doc).valid).toBe(true);
  return doc;
}

function docWithMarks(marks: Mark[], tokenCount = 3): SKAMDocument {
  const tokens = Array.from({ length: tokenCount }, (_, i) => ({ id: `t${i + 1}`, text: '字' }));
  return {
    format: 'skam@0.1',
    tokens,
    blocks: [{ id: 'b1', tokenIds: tokens.map((t) => t.id) }],
    marks,
    readings: [],
  };
}

const KANJI_TO_KAERI: Record<string, string> = {
  レ: KAERI.RE,
  一: KAERI.ICHI,
  二: KAERI.NI,
  三: KAERI.SAN,
  四: KAERI.SHI,
  上: KAERI.JO,
  中: KAERI.CHU,
  下: KAERI.GE,
  甲: KAERI.KO,
  乙: KAERI.OTSU,
  丙: KAERI.HEI,
  丁: KAERI.TEI,
  天: KAERI.TEN,
  地: KAERI.CHI,
  人: KAERI.JIN,
};

function toKaeriValue(kanji: string): string {
  return [...kanji].map((c) => KANJI_TO_KAERI[c]!).join('');
}

/**
 * 返り点の列から文書を作る。要素は本文の順の位置 1 つ分。
 * - 文字列: 1 つの注記 (2 字以上なら複数の字の注記)
 * - 配列: 同じ位置の注記を 1 字ずつ並べたもの
 * 位置ごとに別の字の後ろに置き、最後に返り点の無い字を 1 つ足す (レが最後の字に付かないように)
 */
function kaeriDoc(positions: (string | string[])[], tokenOffset = 0): SKAMDocument {
  const marks: Mark[] = [];
  positions.forEach((position, i) => {
    const values = typeof position === 'string' ? [position] : position;
    for (const value of values) {
      marks.push({
        type: 'kaeri',
        id: `m${marks.length}`,
        position: { blockId: 'b1', after: `t${i + 1 + tokenOffset}` },
        value: toKaeriValue(value),
      });
    }
  });
  return valid(docWithMarks(marks, positions.length + 1 + tokenOffset));
}

function codesOf(doc: unknown): string[] {
  return lintSKAMDocument(doc).map((d) => d.code);
}

describe('lintSKAMDocument', () => {
  it('診断の無い文書は空の配列', () => {
    const doc = valid({
      format: 'skam@0.1',
      tokens: [
        { id: 't1', text: '將' },
        { id: 't2', text: '死' },
        { id: 't3', text: '學' },
        { id: 't4', text: '而' },
        { id: 't5', text: '時' },
        { id: 't6', text: '習' },
      ],
      blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4', 't5', 't6'] }],
      marks: [
        {
          type: 'saidoku',
          id: 'm1',
          anchor: { from: 't1', to: 't1' },
          forms: [
            { yomi: 'まさ', okuri: 'ニ' },
            { yomi: 'ス', okuri: 'ベシ' },
          ],
        },
        { type: 'tateten', id: 'm2', anchor: { from: 't2', to: 't3' } },
        { type: 'ref', id: 'r1', position: { blockId: 'b1', after: 't6' }, label: 'A' },
        { type: 'highlight', id: 'm3', anchor: { from: 't4', to: 't4' }, ref: 'r1' },
        { type: 'highlight', id: 'm4', anchor: { from: 't4', to: 't4' } },
        { type: 'yomigana', id: 'm5', anchor: { from: 't3', to: 't3' }, value: 'ヲ' },
        { type: 'kaeri', id: 'k1', position: { blockId: 'b1', after: 't1' }, value: KAERI.NI },
        { type: 'kaeri', id: 'k2', position: { blockId: 'b1', after: 't2' }, value: KAERI.ICHI },
        { type: 'kaeri', id: 'k3', position: { blockId: 'b1', after: 't3' }, value: KAERI.GE },
        { type: 'kaeri', id: 'k4', position: { blockId: 'b1', after: 't4' }, value: KAERI.JO },
      ],
      readings: [],
    });
    expect(lintSKAMDocument(doc)).toEqual([]);
  });

  describe('再読文字', () => {
    it('読みが 1 つなら SAIDOKU_SINGLE_READING', () => {
      const doc = valid(
        docWithMarks([
          {
            type: 'saidoku',
            id: 'm1',
            anchor: { from: 't1', to: 't1' },
            forms: [{ yomi: 'まさ', okuri: 'ニ' }],
          },
        ])
      );
      expect(lintSKAMDocument(doc)).toEqual([
        expect.objectContaining({ code: SAIDOKU_SINGLE_READING, path: 'marks[0].forms' }),
      ]);
    });

    it('要素が空なら SAIDOKU_EMPTY_FORM (path は要素)', () => {
      const doc = valid(
        docWithMarks([
          {
            type: 'saidoku',
            id: 'm1',
            anchor: { from: 't1', to: 't1' },
            forms: [{ yomi: 'まさ' }, {}],
          },
        ])
      );
      expect(lintSKAMDocument(doc)).toEqual([
        expect.objectContaining({ code: SAIDOKU_EMPTY_FORM, path: 'marks[0].forms[1]' }),
      ]);
    });

    it('forms: [{}] は SAIDOKU_SINGLE_READING、SAIDOKU_EMPTY_FORM の順に 2 件', () => {
      const doc = valid(
        docWithMarks([{ type: 'saidoku', id: 'm1', anchor: { from: 't1', to: 't1' }, forms: [{}] }])
      );
      expect(lintSKAMDocument(doc).map((d) => [d.code, d.path])).toEqual([
        [SAIDOKU_SINGLE_READING, 'marks[0].forms'],
        [SAIDOKU_EMPTY_FORM, 'marks[0].forms[0]'],
      ]);
    });

    it('yomi と okuri が空白だけの要素も SAIDOKU_EMPTY_FORM', () => {
      const doc = valid(
        docWithMarks([
          {
            type: 'saidoku',
            id: 'm1',
            anchor: { from: 't1', to: 't1' },
            forms: [{ yomi: 'ス' }, { yomi: ' ', okuri: '　' }],
          },
        ])
      );
      expect(codesOf(doc)).toEqual([SAIDOKU_EMPTY_FORM]);
    });
  });

  describe('空の仮名', () => {
    it.each([
      ['yomigana', ''],
      ['okurigana', ' '],
      ['soegana', '　'],
    ] as const)('%s の value が %j なら EMPTY_KANA', (type, value) => {
      const doc = valid(
        docWithMarks([{ type, id: 'm1', anchor: { from: 't1', to: 't1' }, value } as Mark])
      );
      expect(lintSKAMDocument(doc)).toEqual([
        expect.objectContaining({ code: EMPTY_KANA, path: 'marks[0].value' }),
      ]);
    });

    it('value が ヲ なら診断なし', () => {
      const doc = valid(
        docWithMarks([
          { type: 'okurigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'ヲ' },
        ])
      );
      expect(lintSKAMDocument(doc)).toEqual([]);
    });
  });

  describe('竪点', () => {
    it('from === to なら TATETEN_SINGLE_TOKEN (path は anchor)', () => {
      const doc = valid(
        docWithMarks([{ type: 'tateten', id: 'm1', anchor: { from: 't1', to: 't1' } }])
      );
      expect(lintSKAMDocument(doc)).toEqual([
        expect.objectContaining({ code: TATETEN_SINGLE_TOKEN, path: 'marks[0].anchor' }),
      ]);
    });

    it('2 字なら診断なし', () => {
      const doc = valid(
        docWithMarks([{ type: 'tateten', id: 'm1', anchor: { from: 't1', to: 't2' } }])
      );
      expect(lintSKAMDocument(doc)).toEqual([]);
    });
  });

  describe('傍線の ref', () => {
    const ref: Mark = {
      type: 'ref',
      id: 'r1',
      position: { blockId: 'b1', after: 't3' },
      label: 'A',
    };

    it('参照先があれば診断なし', () => {
      const doc = valid(
        docWithMarks([
          ref,
          { type: 'highlight', id: 'h1', anchor: { from: 't1', to: 't1' }, ref: 'r1' },
        ])
      );
      expect(lintSKAMDocument(doc)).toEqual([]);
    });

    it('参照先が無ければ HIGHLIGHT_REF_MISSING (path は ref)', () => {
      const doc = valid(
        docWithMarks([
          ref,
          { type: 'highlight', id: 'h1', anchor: { from: 't1', to: 't1' }, ref: 'r2' },
        ])
      );
      expect(lintSKAMDocument(doc)).toEqual([
        expect.objectContaining({ code: HIGHLIGHT_REF_MISSING, path: 'marks[1].ref' }),
      ]);
    });

    it('ref の無い傍線は診断なし', () => {
      const doc = valid(
        docWithMarks([{ type: 'highlight', id: 'h1', anchor: { from: 't1', to: 't1' } }])
      );
      expect(lintSKAMDocument(doc)).toEqual([]);
    });
  });

  describe('返り点', () => {
    it.each([
      ['二一', ['二', '一']],
      ['三二一', ['三', '二', '一']],
      ['下上', ['下', '上']],
      ['下中上', ['下', '中', '上']],
      ['乙甲', ['乙', '甲']],
      ['人地天', ['人', '地', '天']],
      ['二一二一', ['二', '一', '二', '一']],
      ['下二一上', ['下', '二', '一', '上']],
      ['四三二一', ['四', '三', '二', '一']],
      ['丁丙乙甲', ['丁', '丙', '乙', '甲']],
    ])('閉じた連なり %s は診断なし', (_label, positions) => {
      expect(lintSKAMDocument(kaeriDoc(positions))).toEqual([]);
    });

    it('系列の交差 [二, 下, 一, 上] は指摘しない (限界)', () => {
      expect(lintSKAMDocument(kaeriDoc(['二', '下', '一', '上']))).toEqual([]);
    });

    it.each([
      ['一', ['一'], 1],
      ['二', ['二'], 1],
      ['三一', ['三', '一'], 2],
      ['一二', ['一', '二'], 2],
      ['上', ['上'], 1],
      ['中上', ['中', '上'], 2],
    ])('閉じていない連なり %s は %i 件', (_label, positions, count) => {
      const diagnostics = lintSKAMDocument(kaeriDoc(positions));
      expect(diagnostics).toHaveLength(count);
      expect(diagnostics.every((d) => d.code === KAERI_UNCLOSED)).toBe(true);
    });

    it('path は閉じていない注記全体 (marks[i])', () => {
      expect(lintSKAMDocument(kaeriDoc(['二', '一', '三'])).map((d) => d.path)).toEqual([
        'marks[2]',
      ]);
    });

    it('2 つのブロックに分けた [二] と [一] は 2 件 (ブロックをまたがない)', () => {
      const doc = valid({
        format: 'skam@0.1',
        tokens: [
          { id: 't1', text: '字' },
          { id: 't2', text: '字' },
          { id: 't3', text: '字' },
          { id: 't4', text: '字' },
        ],
        blocks: [
          { id: 'b1', tokenIds: ['t1', 't2'] },
          { id: 'b2', tokenIds: ['t3', 't4'] },
        ],
        marks: [
          { type: 'kaeri', id: 'k1', position: { blockId: 'b1', after: 't1' }, value: KAERI.NI },
          { type: 'kaeri', id: 'k2', position: { blockId: 'b2', after: 't3' }, value: KAERI.ICHI },
        ],
        readings: [],
      });
      expect(lintSKAMDocument(doc).map((d) => [d.code, d.path])).toEqual([
        [KAERI_UNCLOSED, 'marks[0]'],
        [KAERI_UNCLOSED, 'marks[1]'],
      ]);
    });

    describe('レ', () => {
      it('同じ位置の一とレ (一レ) を含む [二, 一レ] は診断なし', () => {
        expect(lintSKAMDocument(kaeriDoc(['二', ['一', 'レ']]))).toEqual([]);
      });

      it('前に二の無い一レは一が閉じていない (1 件)', () => {
        const diagnostics = lintSKAMDocument(kaeriDoc([['一', 'レ']]));
        expect(diagnostics.map((d) => [d.code, d.path])).toEqual([[KAERI_UNCLOSED, 'marks[0]']]);
      });

      it('ブロックの最後の字に付くレは閉じていない', () => {
        const doc = valid(
          docWithMarks([
            { type: 'kaeri', id: 'k1', position: { blockId: 'b1', after: 't3' }, value: KAERI.RE },
          ])
        );
        expect(lintSKAMDocument(doc).map((d) => [d.code, d.path])).toEqual([
          [KAERI_UNCLOSED, 'marks[0]'],
        ]);
      });

      it('ブロックの先頭の字に付き、後ろに字があるレは診断なし', () => {
        const doc = valid(
          docWithMarks([
            { type: 'kaeri', id: 'k1', position: { blockId: 'b1', after: 't1' }, value: KAERI.RE },
          ])
        );
        expect(lintSKAMDocument(doc)).toEqual([]);
      });
    });

    it('複数の字の注記 (非推奨) を含む [二, 一レ] は診断なし', () => {
      expect(lintSKAMDocument(kaeriDoc(['二', '一レ']))).toEqual([]);
    });

    it('複数の字の注記が閉じていないときも診断は注記ごとに 1 件', () => {
      // 三と一が同じ注記: [三, 一] が閉じていない。注記は 1 つなので 1 件
      expect(lintSKAMDocument(kaeriDoc(['三一']))).toHaveLength(1);
    });
  });

  describe('結果の順', () => {
    it('本文の順と marks[] の順が違うとき、診断は marks[] の添字の順', () => {
      // marks[] は後ろの字から書く。本文の順では t1=三 (marks[1])、t2=一 (marks[0]) の順に閉じていないと判る
      const doc = valid(
        docWithMarks([
          { type: 'kaeri', id: 'k2', position: { blockId: 'b1', after: 't2' }, value: KAERI.ICHI },
          { type: 'kaeri', id: 'k1', position: { blockId: 'b1', after: 't1' }, value: KAERI.SAN },
        ])
      );
      expect(lintSKAMDocument(doc).map((d) => d.path)).toEqual(['marks[0]', 'marks[1]']);
    });

    it('別の検査の診断も marks[] の添字の順にまとめる', () => {
      const doc = valid(
        docWithMarks([
          { type: 'kaeri', id: 'k1', position: { blockId: 'b1', after: 't1' }, value: KAERI.NI },
          { type: 'tateten', id: 'm2', anchor: { from: 't1', to: 't1' } },
          { type: 'yomigana', id: 'm3', anchor: { from: 't1', to: 't1' }, value: '' },
        ])
      );
      expect(lintSKAMDocument(doc).map((d) => [d.code, d.path])).toEqual([
        [KAERI_UNCLOSED, 'marks[0]'],
        [TATETEN_SINGLE_TOKEN, 'marks[1].anchor'],
        [EMPTY_KANA, 'marks[2].value'],
      ]);
    });
  });

  describe('message と path に入力の値を出さない', () => {
    const MARKER = 'MARKER_X';
    const anchor = { from: 't1', to: 't1' };
    const cases: [string, Mark[]][] = [
      [
        SAIDOKU_SINGLE_READING,
        [{ type: 'saidoku', id: MARKER, anchor, forms: [{ yomi: MARKER, okuri: MARKER }] }],
      ],
      [SAIDOKU_EMPTY_FORM, [{ type: 'saidoku', id: MARKER, anchor, forms: [{}, { yomi: ' ' }] }]],
      [EMPTY_KANA, [{ type: 'yomigana', id: MARKER, anchor, value: ' ' }]],
      [TATETEN_SINGLE_TOKEN, [{ type: 'tateten', id: MARKER, anchor }]],
      [
        KAERI_UNCLOSED,
        [{ type: 'kaeri', id: MARKER, position: { blockId: 'b1', after: 't1' }, value: KAERI.NI }],
      ],
      [HIGHLIGHT_REF_MISSING, [{ type: 'highlight', id: MARKER, anchor, ref: MARKER }]],
    ];

    it.each(cases)('%s', (code, marks) => {
      const diagnostics = lintSKAMDocument(valid(docWithMarks(marks)));
      expect(diagnostics.map((d) => d.code)).toContain(code);
      for (const d of diagnostics) {
        expect(d.message).not.toContain(MARKER);
        expect(d.path).not.toContain(MARKER);
        expect(d.path).toMatch(/^marks\[\d+\][\w.[\]]*$/);
      }
    });

    it('token の id と block の id に目印を入れても出ない', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: MARKER, text: '字' }],
        blocks: [{ id: `${MARKER}b`, tokenIds: [MARKER] }],
        marks: [
          {
            type: 'kaeri',
            id: 'k1',
            position: { blockId: `${MARKER}b`, after: MARKER },
            value: KAERI.NI,
          },
        ],
        readings: [],
      };
      const diagnostics = lintSKAMDocument(valid(doc));
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]!.message).not.toContain(MARKER);
      expect(diagnostics[0]!.path).not.toContain(MARKER);
    });
  });

  describe('例外を出さない', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['文字列', 'x'],
      ['空のオブジェクト', {}],
      ['marks が配列でない', { marks: 1, blocks: [], tokens: [] }],
      ['marks が null', { marks: null }],
      ['blocks が配列でない', { marks: [{ type: 'kaeri' }], blocks: 'x' }],
      ['tokenIds が配列でないブロック', { blocks: [{ id: 'b1', tokenIds: 1 }], marks: [] }],
      ['null の要素', { marks: [null, 1, 'x', []], blocks: [null, 1] }],
    ])('%s', (_label, doc) => {
      expect(() => lintSKAMDocument(doc)).not.toThrow();
      expect(lintSKAMDocument(doc)).toEqual([]);
    });

    it('形の合わない注記は読み飛ばし、診断を出さない', () => {
      const doc = {
        blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
        marks: [
          { type: 'unknown-type', id: 'x' },
          { type: 'kaeri', value: KAERI.NI },
          { type: 'kaeri', value: KAERI.NI, position: null },
          { type: 'kaeri', value: KAERI.NI, position: { blockId: 'b1', after: 'missing' } },
          { type: 'kaeri', value: KAERI.NI, position: { blockId: 'missing', after: 't1' } },
          { type: 'kaeri', value: 1, position: { blockId: 'b1', after: 't1' } },
          { type: 'tateten' },
          { type: 'tateten', anchor: 1 },
          { type: 'tateten', anchor: { from: 1, to: 1 } },
          { type: 'saidoku', anchor: { from: 't1', to: 't1' }, forms: 'x' },
          { type: 'saidoku', forms: [null, 1] },
          { type: 'yomigana', anchor: { from: 't1', to: 't1' }, value: 1 },
          { type: 'okurigana' },
          { type: 'highlight', ref: 1 },
          { type: 'highlight', ref: null },
        ],
      };
      expect(() => lintSKAMDocument(doc)).not.toThrow();
      expect(lintSKAMDocument(doc)).toEqual([]);
    });
  });

  describe('__proto__ と constructor の id', () => {
    it('ほかの文書と同じ診断になる', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [
          { id: '__proto__', text: '字' },
          { id: 'constructor', text: '字' },
          { id: 'toString', text: '字' },
        ],
        blocks: [{ id: '__proto__', tokenIds: ['__proto__', 'constructor', 'toString'] }],
        marks: [
          {
            type: 'ref',
            id: '__proto__',
            position: { blockId: '__proto__', after: 'toString' },
            label: 'A',
          },
          {
            type: 'highlight',
            id: 'h1',
            anchor: { from: '__proto__', to: '__proto__' },
            ref: '__proto__',
          },
          {
            type: 'highlight',
            id: 'h2',
            anchor: { from: '__proto__', to: '__proto__' },
            ref: 'constructor',
          },
          {
            type: 'kaeri',
            id: 'k1',
            position: { blockId: '__proto__', after: '__proto__' },
            value: KAERI.NI,
          },
          {
            type: 'kaeri',
            id: 'k2',
            position: { blockId: '__proto__', after: 'constructor' },
            value: KAERI.ICHI,
          },
          {
            type: 'kaeri',
            id: 'k3',
            position: { blockId: '__proto__', after: 'toString' },
            value: KAERI.SAN,
          },
        ],
        readings: [],
      };
      expect(lintSKAMDocument(doc).map((d) => [d.code, d.path])).toEqual([
        [HIGHLIGHT_REF_MISSING, 'marks[2].ref'],
        [KAERI_UNCLOSED, 'marks[5]'],
      ]);
    });
  });

  describe('規模', () => {
    it('注記 10 万個の文書が既定のテストの時間の中で終わる', () => {
      const tokenCount = 1000;
      const tokens = Array.from({ length: tokenCount }, (_, i) => ({ id: `t${i}`, text: '字' }));
      const marks: Mark[] = [];
      for (let i = 0; i < 100_000; i++) {
        const tokenId = `t${i % tokenCount}`;
        switch (i % 4) {
          case 0:
            marks.push({ type: 'yomigana', anchor: { from: tokenId, to: tokenId }, value: 'あ' });
            break;
          case 1:
            marks.push({
              type: 'kaeri',
              position: { blockId: 'b1', after: tokenId },
              value: i % 8 === 1 ? KAERI.NI : KAERI.ICHI,
            });
            break;
          case 2:
            marks.push({ type: 'highlight', anchor: { from: tokenId, to: tokenId }, ref: 'r' });
            break;
          default:
            marks.push({ type: 'tateten', anchor: { from: tokenId, to: tokenId } });
        }
      }
      const doc = {
        format: 'skam@0.1',
        tokens,
        blocks: [{ id: 'b1', tokenIds: tokens.map((t) => t.id) }],
        marks,
        readings: [],
      };
      const diagnostics = lintSKAMDocument(doc);
      // highlight 25000 + tateten 25000 は必ず出る
      expect(diagnostics.length).toBeGreaterThanOrEqual(50_000);
    });
  });

  describe('系列の表', () => {
    it('表の字がどれも KAERI の値のどれかと等しい', () => {
      const kaeriValues = new Set<string>(Object.values(KAERI));
      for (const series of KAERI_SERIES) {
        for (const form of series.closedForms) {
          for (const char of form) {
            expect(kaeriValues.has(char)).toBe(true);
          }
        }
      }
    });

    it('先頭の字は閉じた形の最後の字', () => {
      for (const series of KAERI_SERIES) {
        for (const form of series.closedForms) {
          expect(form.endsWith(series.head)).toBe(true);
        }
      }
    });
  });

  describe('1 字の竪点の描画 (ADR-044 に事実として書く)', () => {
    // 描画は直さない。レ以外の返り点が 1 字の竪点の字に付いたとき、AIR にその返り点が出るかを確かめる
    function airTextWithKaeri(value: string, withTateten: boolean): string {
      const marks: Mark[] = [
        { type: 'kaeri', id: 'k1', position: { blockId: 'b1', after: 't1' }, value },
      ];
      if (withTateten) {
        marks.unshift({ type: 'tateten', id: 'm1', anchor: { from: 't1', to: 't1' } });
      }
      return JSON.stringify(buildAnnotationIR(valid(docWithMarks(marks)), RENDER_PROFILES.full));
    }

    it('1 字の竪点が無ければ、二は AIR に出る (対照)', () => {
      expect(airTextWithKaeri(KAERI.NI, false)).toContain(KAERI.NI);
    });

    it('1 字の竪点の字に付いたレは AIR に出る', () => {
      expect(airTextWithKaeri(KAERI.RE, true)).toContain(KAERI.RE);
    });

    it('1 字の竪点の字に付いたレ以外 (二) は AIR に出ない', () => {
      // 区切りが 0 個のグループになり、非レ成分の置き場が無い。lint が TATETEN_SINGLE_TOKEN を出す根拠の 1 つ
      expect(airTextWithKaeri(KAERI.NI, true)).not.toContain(KAERI.NI);
    });
  });
});
