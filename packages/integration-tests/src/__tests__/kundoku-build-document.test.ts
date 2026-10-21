/**
 * KanbunKundoku の当てはめ (buildKundokuSentence、buildKundokuDocumentFromJson)。ネットワークにも cache にも
 * 依存しない。文は実データの形 ([字, okurigana, particle, position, left, right] の行) で埋め込む。
 * 全 930 文の件数は bench の準備が検査する。
 */

import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateSKAMDocument, type Mark, type SKAMDocument } from '@kanbun-skam/skam';
import {
  buildKundokuDocument,
  buildKundokuDocumentFromJson,
  buildKundokuSentence,
  type KundokuSentenceResult,
} from '../kundoku/build-document.ts';
import { KUNDOKU_ANNOTATED, KUNDOKU_TWO_TYPES } from '../kundoku/source-pin.ts';

type Row = readonly [
  character: string,
  okurigana: string,
  particle: string,
  position: string,
  left: string,
  right: string,
];

function sentencePair(rows: readonly Row[]): {
  annotated: { characters: unknown[] };
  twoTypes: { characters: unknown[] };
} {
  return {
    annotated: {
      characters: rows.map(([character, okurigana, particle, position]) => ({
        character,
        okurigana,
        particle,
        position,
      })),
    },
    twoTypes: {
      characters: rows.map(([character, , , , left, right]) => ({ character, left, right })),
    },
  };
}

function build(rows: readonly Row[], index = 0): KundokuSentenceResult {
  const { annotated, twoTypes } = sentencePair(rows);
  return buildKundokuSentence(annotated as never, twoTypes as never, index);
}

const KAERI = {
  re: '㆑',
  ichi: '㆒',
  ni: '㆓',
  san: '㆔',
  jo: '㆖',
  ge: '㆘',
};

/** token ごとの注記を、字を鍵にして引く (本文に同じ字が 2 度出ない文だけで使う) */
function marksOf(result: KundokuSentenceResult): {
  kaeri: Map<string, string[]>;
  okurigana: Map<string, string>;
  soegana: Map<string, string>;
  kutoten: Map<string, string[]>;
  tateten: string[];
} {
  const text = new Map(result.tokens.map((token) => [token.id, token.text]));
  const textOf = (id: string): string => text.get(id) ?? '?';
  const out = {
    kaeri: new Map<string, string[]>(),
    okurigana: new Map<string, string>(),
    soegana: new Map<string, string>(),
    kutoten: new Map<string, string[]>(),
    tateten: [] as string[],
  };
  const push = (map: Map<string, string[]>, key: string, value: string): void => {
    map.set(key, [...(map.get(key) ?? []), value]);
  };
  for (const mark of result.marks as Mark[]) {
    if (mark.type === 'kaeri') push(out.kaeri, textOf(mark.position.after!), mark.value);
    else if (mark.type === 'kutoten') push(out.kutoten, textOf(mark.position.after!), mark.value);
    else if (mark.type === 'okurigana') out.okurigana.set(textOf(mark.anchor.from), mark.value);
    else if (mark.type === 'soegana') out.soegana.set(textOf(mark.anchor.from), mark.value);
    else if (mark.type === 'tateten') {
      out.tateten.push(textOf(mark.anchor.from) + textOf(mark.anchor.to));
    }
  }
  return out;
}

function asDocument(result: KundokuSentenceResult): SKAMDocument {
  return {
    format: 'skam@0.1',
    tokens: result.tokens,
    blocks: [result.block],
    marks: result.marks,
    readings: [],
  };
}

const S_TSUNE: readonly Row[] = [
  ['常', '', 'に', '', '', 'に'],
  ['恐', 'る', '', '', '', 'る'],
  ['秋', '', '', '', '', ''],
  ['節', '', '', '', '', ''],
  ['至', 'り', '', '', '', 'り'],
];

const S_KOU: readonly Row[] = [
  ['孝', '', '', '', '', 'は'],
  ['者', '', 'DBは', '', '', ''],
  ['所', '', '', '二-', '二-', ''],
  ['以', '', '', '', '', ''],
  ['事', 'うる', '', '一レ', '一レ', 'うる'],
  ['君', '', 'に', '', '', 'に'],
  ['也', '', 'Dなり', '', '', ''],
  ['。', '', '', '', '', ''],
];

const S_MI: readonly Row[] = [
  ['未', '', 'だSず', 'レ', 'レ', 'だ'],
  ['用', 'い', '', '二', '二', 'い'],
  ['兵', '', '', '', '', ''],
  ['之', '', 'Dの', '', '', ''],
  ['刃', '', 'を', '一', '一', 'を'],
  ['。', '', '', '', '', ''],
];

const S_DOU: readonly Row[] = [
  ['導', 'く', 'に', 'レ', 'レ', 'くに'],
  ['之', '', 'を', '', '', 'を'],
  ['以', '', '', '二', '二', 'てして'],
  ['礼', '', '', '', '', ''],
  ['楽', '', 'を', '一', '一', 'を'],
  ['、', '', '', 'レ', 'レ', ''],
  ['而', '', 'DBてして', '', '', ''],
  ['民', '', '', '', '', ''],
  ['和', '', '', '', '', ''],
  ['睦', 'す', '', '', '', 'す'],
  ['。', '', '', '', '', ''],
];

// 文 148: 者 に 一、直後の 、 に 二。移すと 一 と 二 が並ぶので、移した 二 を捨てる
const S_148: readonly Row[] = [
  ['雖', '', 'も', 'レ', 'レ', 'も'],
  ['有', 'り', 'と', '二', '二', 'りと'],
  ['智', '', '', '', '', ''],
  ['者', '', '', '一', '一', ''],
  ['、', '', '', '二', '二', ''],
  ['不', '', 'Dず', 'レ', 'レ', ''],
  ['能', 'わ', '', 'レ', 'レ', 'わ'],
  ['善', 'く', 'する', '下', '下', 'くする'],
  ['其', 'の', '', '', '', 'の'],
  ['後', '', 'を', '上', '上', 'を'],
  ['矣', '', 'D', '一', '一', ''],
  ['。', '', '', '', '', ''],
];

describe('buildKundokuSentence', () => {
  it('puts a particle on a character with no okurigana as soegana, and okurigana as okurigana', () => {
    const marks = marksOf(build(S_TSUNE));
    expect(marks.soegana).toEqual(new Map([['常', 'ニ']]));
    expect(marks.okurigana).toEqual(
      new Map([
        ['恐', 'ル'],
        ['至', 'リ'],
      ])
    );
    expect(marks.kaeri.size).toBe(0);
  });

  it('places 二- as a kaeri and a tateten over the character and the next one; 一レ as two marks in order', () => {
    const marks = marksOf(build(S_KOU));
    expect(marks.soegana).toEqual(
      new Map([
        ['孝', 'ハ'],
        ['君', 'ニ'],
      ])
    );
    expect(marks.kaeri.get('所')).toEqual([KAERI.ni]);
    expect(marks.tateten).toEqual(['所以']);
    expect(marks.kaeri.get('事')).toEqual([KAERI.ichi, KAERI.re]);
    expect(marks.okurigana).toEqual(new Map([['事', 'ウル']]));
    expect(marks.kutoten).toEqual(new Map([['也', ['。']]]));
    // D と B の字 (者、也) には何も付かない
    expect(marks.kaeri.has('者')).toBe(false);
    expect(marks.soegana.has('者')).toBe(false);
  });

  it('treats the S character as okurigana (the second reading is not in the data)', () => {
    const marks = marksOf(build(S_MI));
    expect(marks.kaeri.get('未')).toEqual([KAERI.re]);
    expect(marks.okurigana.get('未')).toBe('ダ');
    expect(marks.kaeri.get('用')).toEqual([KAERI.ni]);
    expect(marks.okurigana.get('用')).toBe('イ');
    expect(marks.kaeri.get('刃')).toEqual([KAERI.ichi]);
    expect(marks.soegana.get('刃')).toBe('ヲ');
    expect(marks.soegana.has('未')).toBe(false);
  });

  it('moves a kaeri on punctuation to the previous token, after the kaeri already there', () => {
    const result = build(S_DOU);
    const marks = marksOf(result);
    expect(marks.kaeri.get('楽')).toEqual([KAERI.ichi, KAERI.re]);
    expect([...marks.kutoten.keys()]).toEqual(['楽', '睦']);
    expect(marks.kutoten.get('楽')).toEqual(['、']);
    // 句読点の位置 (after が句読点の字) の返り点は無い: token は句読点を含まない
    expect(result.tokens.map((token) => token.text)).toEqual([...'導之以礼楽而民和睦']);
    expect(result.counts.movedPunctuationKaeri).toBe(1);
    expect(result.counts.kaeri).toBe(1 + 1 + 2 + 0);
  });

  it('treats a K character with no okurigana as okurigana', () => {
    const marks = marksOf(
      build([
        ['爾', '', '', '', '', ''],
        ['無', 'かれ', '', 'レ', 'レ', 'かれ'],
        ['不', '', 'DざKる', 'レ', 'レ', 'る'],
        ['信', 'ぜ', '', '', '', 'ぜ'],
      ])
    );
    expect(marks.okurigana.get('不')).toBe('ル');
    expect(marks.soegana.has('不')).toBe(false);
  });

  it('puts the part of the right kana after the okurigana as soegana', () => {
    const marks = marksOf(build([['善', 'く', 'する', '下', '下', 'くする']]));
    expect(marks.okurigana.get('善')).toBe('ク');
    expect(marks.soegana.get('善')).toBe('スル');
  });

  it('puts the right kana as okurigana when it does not start with the okurigana', () => {
    const result = build([['甲', 'ず', '', '', '', 'ひ']]);
    expect(marksOf(result).okurigana.get('甲')).toBe('ヒ');
  });

  it('strips 、 and ・ from the right kana and keeps characters that are not kana, like 〻', () => {
    const result = build([
      ['雖', '', 'も', '二', '二', 'も'],
      ['蔬', '', '', '', '', ''],
      ['食', '', '・', '', '', '・'],
      ['菜', '', '', '', '', ''],
      ['瓜', '', 'と', '一', '一', 'と'],
      ['益', '', '〻', '', '', '〻'],
      ['狎', 'れ', 'て', '', '', 'れ、て'],
    ]);
    const marks = marksOf(result);
    expect(marks.soegana.has('食')).toBe(false);
    expect(marks.okurigana.has('食')).toBe(false);
    expect(marks.soegana.get('益')).toBe('〻');
    expect(marks.okurigana.get('狎')).toBe('レ');
    expect(marks.soegana.get('狎')).toBe('テ');
    expect(result.counts.strippedRight).toBe(2);
  });

  it('places 上レ as two marks in order, and 三- as a kaeri with a tateten', () => {
    const marks = marksOf(
      build([
        ['甲', '', '', '上レ', '上レ', ''],
        ['乙', '', '', '三-', '三-', ''],
        ['丙', '', '', '', '', ''],
      ])
    );
    expect(marks.kaeri.get('甲')).toEqual([KAERI.jo, KAERI.re]);
    expect(marks.kaeri.get('乙')).toEqual([KAERI.san]);
    expect(marks.tateten).toEqual(['乙丙']);
  });

  it('drops a moved kaeri that would sit beside another non-レ kaeri (sentence 148), and counts it', () => {
    const result = build(S_148);
    const marks = marksOf(result);
    expect(marks.kaeri.get('者')).toEqual([KAERI.ichi]);
    expect(result.counts.droppedKaeri).toBe(1);
    expect(result.counts.movedPunctuationKaeri).toBe(0);
    expect(marks.kutoten.get('者')).toEqual(['、']);
  });

  it('drops punctuation at the start of a sentence', () => {
    const result = build([
      ['、', '', '', '', '', ''],
      ['甲', '', '', '', '', ''],
    ]);
    expect(result.marks.some((mark) => mark.type === 'kutoten')).toBe(false);
    expect(result.tokens).toHaveLength(1);
  });

  it('gives ids that stay unique across sentences', () => {
    const first = build(S_TSUNE, 0);
    const second = build(S_TSUNE, 1);
    expect(first.block.id).not.toBe(second.block.id);
    expect(first.tokens[0]!.id).not.toBe(second.tokens[0]!.id);
  });

  it.each([
    ['常恐秋節至', S_TSUNE],
    ['孝者所以事君也。', S_KOU],
    ['未用兵之刃。', S_MI],
    ['導之以礼楽、而民和睦。', S_DOU],
    ['雖有智者、不能善其後矣。', S_148],
  ])('builds a valid document for %s', (_sentence, rows) => {
    const result = validateSKAMDocument(asDocument(build(rows)));
    expect(result.valid).toBe(true);
  });

  it('throws with the reason for values outside the rules', () => {
    expect(() => build([['甲', '', '', '乙レ', '乙レ', '']])).toThrow(/unknown left value "乙レ"/);
    expect(() => build([['甲', '', '', '', '末', '']])).toThrow(/unknown left value "末"/);
    expect(() => build([['甲', '', '', '二-', '二-', '']])).toThrow(
      /tateten without a following character/
    );
    expect(() =>
      build([
        ['甲', '', '', '二-', '二-', ''],
        ['。', '', '', '', '', ''],
      ])
    ).toThrow(/tateten without a following character/);
    expect(() =>
      build([
        ['、', '', '', 'レ', 'レ', ''],
        ['甲', '', '', '', '', ''],
      ])
    ).toThrow(/punctuation at the start/);
    expect(() => build([['。', '', '', '', '', '']])).toThrow(/without a character/);
  });

  it('names the sentence index in the error', () => {
    expect(() => build([['甲', '', '', '乙レ', '乙レ', '']], 7)).toThrow(/^sentence 7:/);
  });
});

describe('buildKundokuDocumentFromJson', () => {
  const pair = sentencePair(S_TSUNE);

  it('builds one block per sentence and sums the counts', () => {
    const { document, counts } = buildKundokuDocumentFromJson(
      [pair.annotated, pair.annotated],
      [pair.twoTypes, pair.twoTypes]
    );
    expect(document.blocks).toHaveLength(2);
    expect(counts.sentences).toBe(2);
    expect(counts.tokens).toBe(10);
    expect(counts.okurigana).toBe(4);
    expect(counts.soegana).toBe(2);
    expect(validateSKAMDocument(document).valid).toBe(true);
  });

  it('throws when the files do not line up or are not the expected shape', () => {
    expect(() => buildKundokuDocumentFromJson([pair.annotated], [])).toThrow(
      /sentence counts differ/
    );
    expect(() => buildKundokuDocumentFromJson({}, [])).toThrow(/annotated: not an array/);
    expect(() => buildKundokuDocumentFromJson([], 'x')).toThrow(
      /annotated_two_types: not an array/
    );
    expect(() => buildKundokuDocumentFromJson([{ characters: 'x' }], [pair.twoTypes])).toThrow(
      /sentence 0: annotated characters is not an array/
    );
    const other = sentencePair([
      ['常', '', 'に', '', '', 'に'],
      ['怖', 'る', '', '', '', 'る'],
      ['秋', '', '', '', '', ''],
      ['節', '', '', '', '', ''],
      ['至', 'り', '', '', '', 'り'],
    ]);
    expect(() => buildKundokuDocumentFromJson([pair.annotated], [other.twoTypes])).toThrow(
      /sentence 0: character 1 differs/
    );
    expect(() =>
      buildKundokuDocumentFromJson(
        [pair.annotated],
        [{ characters: pair.twoTypes.characters.slice(1) }]
      )
    ).toThrow(/character counts differ/);
    expect(() =>
      buildKundokuDocumentFromJson(
        [{ characters: [{ character: '甲', okurigana: 1, particle: '', position: '' }] }],
        [{ characters: [{ character: '甲', left: '', right: '' }] }]
      )
    ).toThrow(/okurigana is not a string/);
    expect(() =>
      buildKundokuDocumentFromJson(
        [{ characters: [{ character: '甲乙', okurigana: '', particle: '', position: '' }] }],
        [{ characters: [{ character: '甲乙', left: '', right: '' }] }]
      )
    ).toThrow(/not a single code point/);
  });

  it('accepts a character outside the BMP as one token', () => {
    const { document } = buildKundokuDocumentFromJson(
      [sentencePair([['\u{20000}', '', '', '', '', '']]).annotated],
      [sentencePair([['\u{20000}', '', '', '', '', '']]).twoTypes]
    );
    expect(document.tokens[0]!.text).toBe('\u{20000}');
  });

  it('throws on a sentence longer than 200 characters', () => {
    const rows: Row[] = Array.from({ length: 201 }, () => ['甲', '', '', '', '', '']);
    const { annotated, twoTypes } = sentencePair(rows);
    expect(() => buildKundokuDocumentFromJson([annotated], [twoTypes])).toThrow(/exceed 200/);
  });
});

describe('buildKundokuDocument', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('throws when a cache file does not match its sha256, without trusting the cli check', () => {
    dir = mkdtempSync(join(tmpdir(), 'kundoku-cache-'));
    writeFileSync(join(dir, KUNDOKU_ANNOTATED.cacheName), '[]');
    writeFileSync(join(dir, KUNDOKU_TWO_TYPES.cacheName), '[]');
    expect(() => buildKundokuDocument(dir)).toThrow(/sha256 mismatch/);
  });

  it('throws when a cache file is missing', () => {
    dir = mkdtempSync(join(tmpdir(), 'kundoku-cache-'));
    mkdirSync(join(dir!, 'empty'));
    expect(() => buildKundokuDocument(join(dir!, 'empty'))).toThrow(/not found/);
  });
});
