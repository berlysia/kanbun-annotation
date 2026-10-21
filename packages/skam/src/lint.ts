/**
 * 未完成の検査 (lint)
 *
 * 構造は正しいが、作業が終わっていないように見える内容を知らせる。
 * `validateSKAMDocument` の誤りでも、移行の警告 (`ValidationWarning`) でもなく、どの版でも誤りにならない。
 *
 * `index.ts` から値を import すると `rendering/kaeri.ts` と同じ循環になるので、何も import せず、
 * 返り点の字は `KAERI` を使わず直に書く (`__tests__/lint.test.ts` が `KAERI` と突き合わせる)。
 */

/** 再読文字の `forms` が 1 つ。描画は普通の読み仮名と送り仮名になる */
export const SAIDOKU_SINGLE_READING = 'SAIDOKU_SINGLE_READING';
/** 再読文字の `forms` の要素に、読みも送り仮名も無い */
export const SAIDOKU_EMPTY_FORM = 'SAIDOKU_EMPTY_FORM';
/** 読み仮名、送り仮名、添え仮名の `value` が空か空白だけ */
export const EMPTY_KANA = 'EMPTY_KANA';
/** 竪点が 1 字 (`anchor.from === anchor.to`) */
export const TATETEN_SINGLE_TOKEN = 'TATETEN_SINGLE_TOKEN';
/** 閉じていない返り点 (一だけで二が無い、二だけで一が無い、など) */
export const KAERI_UNCLOSED = 'KAERI_UNCLOSED';
/** 傍線の `ref` が、どの ref 注記の `id` とも等しくない */
export const HIGHLIGHT_REF_MISSING = 'HIGHLIGHT_REF_MISSING';

/** 未完成の診断のコード。値を足すのは minor の変更として扱う */
export type LintCode =
  | typeof SAIDOKU_SINGLE_READING
  | typeof SAIDOKU_EMPTY_FORM
  | typeof EMPTY_KANA
  | typeof TATETEN_SINGLE_TOKEN
  | typeof KAERI_UNCLOSED
  | typeof HIGHLIGHT_REF_MISSING;

export interface LintDiagnostic {
  code: LintCode;
  /** 診断が指す場所。`marks[]` の添字だけで、入力由来の文字列を含まない */
  path: string;
  /** 固定の文。入力由来の値を含まないので、表示するときの escape は要らない */
  message: string;
}

const MESSAGES: Record<LintCode, string> = {
  SAIDOKU_SINGLE_READING:
    'A saidoku mark has only one reading; it is drawn as a plain yomigana and okurigana.',
  SAIDOKU_EMPTY_FORM: 'A saidoku form has neither yomi nor okuri.',
  EMPTY_KANA: 'A kana mark has an empty value.',
  TATETEN_SINGLE_TOKEN: 'A tateten mark covers a single token.',
  KAERI_UNCLOSED: 'A kaeri mark is not paired with the marks that close its series.',
  HIGHLIGHT_REF_MISSING: 'A highlight refers to a ref mark that does not exist.',
};

/**
 * 返り点の系列。先頭の字 (一、上、甲、天) が 1 つのまとまりを閉じる。
 * `closedForms` は閉じているまとまりを本文の順に並べた文字列。
 * 現代の訓読の教科書の慣行に基づく簡略な規則で、一次資料では確かめていない。
 *
 * 一二点が上下点の間に入る入れ子は系列ごとに独立に見るので指摘しない。交差も指摘しない
 */
export const KAERI_SERIES: readonly { head: string; closedForms: readonly string[] }[] = [
  // 一系: ㆓㆒ ㆔㆓㆒ ㆕㆔㆓㆒
  { head: '㆒', closedForms: ['㆓㆒', '㆔㆓㆒', '㆕㆔㆓㆒'] },
  // 上系: ㆘㆖ ㆘㆗㆖
  { head: '㆖', closedForms: ['㆘㆖', '㆘㆗㆖'] },
  // 甲系: ㆚㆙ ㆛㆚㆙ ㆜㆛㆚㆙
  { head: '㆙', closedForms: ['㆚㆙', '㆛㆚㆙', '㆜㆛㆚㆙'] },
  // 天系: ㆞㆝ ㆟㆞㆝
  { head: '㆝', closedForms: ['㆞㆝', '㆟㆞㆝'] },
];

const RE = '㆑';

const SERIES_OF_CHAR: ReadonlyMap<string, number> = new Map(
  KAERI_SERIES.flatMap((series, index) =>
    [...new Set(series.closedForms.flatMap((form) => [...form]))].map(
      (char) => [char, index] as const
    )
  )
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isBlankString(value: unknown): boolean {
  return typeof value === 'string' && value.trim() === '';
}

/** 読みや送り仮名の値が「無い」か「空白だけ」か。文字列でない値は形の誤りなので、空とは見ない */
function isAbsentOrBlank(value: unknown): boolean {
  return value === undefined || isBlankString(value);
}

interface KaeriEntry {
  markIndex: number;
  /** ブロックの `tokenIds` の中の `position.after` の位置 */
  place: number;
  char: string;
}

interface Pending {
  chars: string;
  markIndexes: number[];
}

/**
 * 閉じていない返り点の注記の添字を集める。
 * ブロックごとに、返り点の字を本文の順に並べて系列ごとの状態を 1 回の走査で更新する
 */
function findUnclosedKaeri(
  marks: readonly unknown[],
  blocks: readonly unknown[]
): ReadonlySet<number> {
  // token から、属するブロックの id とブロックの中の位置への表。重複した id は先のものを使う
  const tokenPlaces = new Map<string, { blockId: string; place: number }>();
  const blockLengths = new Map<string, number>();
  for (const block of blocks) {
    if (!isRecord(block) || typeof block['id'] !== 'string' || !Array.isArray(block['tokenIds'])) {
      continue;
    }
    const blockId = block['id'];
    if (blockLengths.has(blockId)) continue;
    const tokenIds: unknown[] = block['tokenIds'];
    blockLengths.set(blockId, tokenIds.length);
    tokenIds.forEach((tokenId, place) => {
      if (typeof tokenId === 'string' && !tokenPlaces.has(tokenId)) {
        tokenPlaces.set(tokenId, { blockId, place });
      }
    });
  }

  const entriesByBlock = new Map<string, KaeriEntry[]>();
  marks.forEach((mark, markIndex) => {
    if (!isRecord(mark) || mark['type'] !== 'kaeri' || typeof mark['value'] !== 'string') return;
    const position = mark['position'];
    if (!isRecord(position)) return;
    const { blockId, after } = position;
    if (typeof blockId !== 'string' || typeof after !== 'string') return;
    const found = tokenPlaces.get(after);
    if (found === undefined || found.blockId !== blockId) return;
    let entries = entriesByBlock.get(blockId);
    if (entries === undefined) {
      entries = [];
      entriesByBlock.set(blockId, entries);
    }
    // 複数の字の注記は、字を 1 つずつ同じ位置に並べたものとして見る (ADR-038)
    for (const char of mark['value']) entries.push({ markIndex, place: found.place, char });
  });

  const unclosed = new Set<number>();
  for (const [blockId, entries] of entriesByBlock) {
    // 同じ位置は marks[] の順のまま (sort は安定)
    entries.sort((a, b) => a.place - b.place);
    const lastPlace = (blockLengths.get(blockId) ?? 0) - 1;
    const pending: Pending[] = KAERI_SERIES.map(() => ({ chars: '', markIndexes: [] }));
    for (const { markIndex, place, char } of entries) {
      if (char === RE) {
        // 返る先の字が無い
        if (place === lastPlace) unclosed.add(markIndex);
        continue;
      }
      const seriesIndex = SERIES_OF_CHAR.get(char);
      if (seriesIndex === undefined) continue;
      const series = KAERI_SERIES[seriesIndex]!;
      const group = pending[seriesIndex]!;
      group.chars += char;
      group.markIndexes.push(markIndex);
      if (char === series.head) {
        if (!series.closedForms.includes(group.chars)) {
          for (const index of group.markIndexes) unclosed.add(index);
        }
        group.chars = '';
        group.markIndexes = [];
      }
    }
    // ブロックの終わりまでに先頭の字が来なかった返り点
    for (const group of pending) {
      for (const index of group.markIndexes) unclosed.add(index);
    }
  }
  return unclosed;
}

/**
 * 構造は正しいが未完成に見える内容を知らせる。診断が無ければ空の配列。
 *
 * 検証はしない (`parse` や `validateSKAMDocument` の後に呼ぶ想定で、同じ検証を 2 回しないため)。
 * 検証を通っていない入力でも例外は出さず、形の合わない部分は読み飛ばす。ただしその場合、
 * 診断が正しいとは限らない。診断は `marks[]` の添字の順に並ぶ
 */
export function lintSKAMDocument(doc: unknown): LintDiagnostic[] {
  if (!isRecord(doc)) return [];
  const marks: readonly unknown[] = Array.isArray(doc['marks']) ? doc['marks'] : [];
  const blocks: readonly unknown[] = Array.isArray(doc['blocks']) ? doc['blocks'] : [];

  // ref 注記の id。素のオブジェクトを使うと `__proto__` などの id で引きが壊れる
  const refIds = new Set<string>();
  for (const mark of marks) {
    if (isRecord(mark) && mark['type'] === 'ref' && typeof mark['id'] === 'string') {
      refIds.add(mark['id']);
    }
  }

  const unclosedKaeri = findUnclosedKaeri(marks, blocks);

  const found: { markIndex: number; code: LintCode; path: string }[] = [];
  marks.forEach((mark, i) => {
    if (!isRecord(mark)) return;
    const add = (code: LintCode, path: string): void => {
      found.push({ markIndex: i, code, path });
    };
    switch (mark['type']) {
      case 'saidoku': {
        const forms = mark['forms'];
        if (!Array.isArray(forms)) break;
        if (forms.length === 1) add(SAIDOKU_SINGLE_READING, `marks[${i}].forms`);
        forms.forEach((form: unknown, j) => {
          if (isRecord(form) && isAbsentOrBlank(form['yomi']) && isAbsentOrBlank(form['okuri'])) {
            add(SAIDOKU_EMPTY_FORM, `marks[${i}].forms[${j}]`);
          }
        });
        break;
      }
      case 'yomigana':
      case 'okurigana':
      case 'soegana':
        if (isBlankString(mark['value'])) add(EMPTY_KANA, `marks[${i}].value`);
        break;
      case 'tateten': {
        const anchor = mark['anchor'];
        if (
          isRecord(anchor) &&
          typeof anchor['from'] === 'string' &&
          anchor['from'] === anchor['to']
        ) {
          add(TATETEN_SINGLE_TOKEN, `marks[${i}].anchor`);
        }
        break;
      }
      case 'kaeri':
        if (unclosedKaeri.has(i)) add(KAERI_UNCLOSED, `marks[${i}]`);
        break;
      case 'highlight': {
        const ref = mark['ref'];
        if (typeof ref === 'string' && !refIds.has(ref))
          add(HIGHLIGHT_REF_MISSING, `marks[${i}].ref`);
        break;
      }
    }
  });

  // found は marks[] の添字の順に積んでいる (返り点は本文の順に判定したが、結果の集合を添字で引くだけ)。
  // 同じ注記では、switch の中で積む順 (コードの表の順) になる
  return found.map(({ code, path }) => ({ code, path, message: MESSAGES[code] }));
}
