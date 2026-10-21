/**
 * KanbunKundoku (shiryusann/KanbunKundoku、MIT) の `test` を SKAM の文書にする。規則と失うものは README.md。
 *
 * 元データ `annotated` (印つき) と、変換済みの `annotated_two_types` (返り点 left と右の仮名 right) を
 * 同じ添字で突き合わせる。1 文を 1 block にする。注記は配列を直接組む (CRUD の addMark は
 * 呼ぶたびに文書を作り直すので、数千件には使えない)。
 */

import { readVerifiedSource } from '@kanbun-skam/kojiki';
import type { Block, Mark, SKAMDocument, Token } from '@kanbun-skam/skam';
import { join } from 'node:path';
import {
  KUNDOKU_ANNOTATED,
  KUNDOKU_CACHE_DIR,
  KUNDOKU_TWO_TYPES,
  type KundokuExpectedCounts,
} from './source-pin.ts';

export interface KundokuAnnotatedCharacter {
  readonly character: string;
  readonly okurigana: string;
  readonly particle: string;
  readonly position: string;
}

export interface KundokuTwoTypesCharacter {
  readonly character: string;
  readonly right: string;
  readonly left: string;
}

export interface KundokuAnnotatedSentence {
  readonly characters: readonly KundokuAnnotatedCharacter[];
  /** 書き下し文。文書には使わない (見本の確認用) */
  readonly japanese_translation?: string;
}

export interface KundokuTwoTypesSentence {
  readonly characters: readonly KundokuTwoTypesCharacter[];
}

export type KundokuCounts = KundokuExpectedCounts;

export interface KundokuSentenceResult {
  readonly tokens: Token[];
  readonly block: Block;
  readonly marks: Mark[];
  readonly counts: KundokuCounts;
}

export interface KundokuDocumentResult {
  readonly document: SKAMDocument;
  readonly counts: KundokuCounts;
}

/** 入力の形や値が、当てはめの規則の外にある */
export class KundokuInputError extends Error {
  override readonly name = 'KundokuInputError';
}

/** 1 文の字数の上限。これを超える文は、データの読み間違いとして止める */
const MAX_SENTENCE_CHARACTERS = 200;

// 字は ㆒ のように U+3191 から U+319C の順に並ぶ (㆐ U+3190 は返り点でなく、㆑ が レ)
const KAERI_VALUES: Readonly<Record<string, string>> = {
  レ: '㆑',
  一: '㆒',
  二: '㆓',
  三: '㆔',
  四: '㆕',
  上: '㆖',
  中: '㆗',
  下: '㆘',
  甲: '㆙',
  乙: '㆚',
  丙: '㆛',
  丁: '㆜',
};
const KAERI_RE = KAERI_VALUES['レ']!;
// データにある複合は 一レ と 上レ だけ。ほかの組み合わせ (乙レ など) は、値を確かめてから足す
const COMPOUND_KAERI: ReadonlySet<string> = new Set(['一レ', '上レ']);
const TATETEN_SUFFIX = '-';

// 熟語を 1 字ずつ数える漢字。句読点ではない字はこれに当たる。当たらない字は句読点として扱う
const IDEOGRAPH = /^[㐀-䶿一-鿿豈-﫿\u{20000}-\u{323af}々]$/u;

/** 書き下し文の中黒と読点。訓点ではないので右の仮名から取り除く */
const NOT_KANA = /[・、]/gu;

function toKatakana(text: string): string {
  let result = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    result += cp >= 0x3041 && cp <= 0x3096 ? String.fromCodePoint(cp + 0x60) : ch;
  }
  return result;
}

function emptyCounts(): { -readonly [K in keyof KundokuCounts]: KundokuCounts[K] } {
  return {
    sentences: 0,
    tokens: 0,
    punctuation: 0,
    kaeri: 0,
    tateten: 0,
    okurigana: 0,
    soegana: 0,
    strippedRight: 0,
    movedPunctuationKaeri: 0,
    droppedKaeri: 0,
  };
}

function addCounts(total: ReturnType<typeof emptyCounts>, part: KundokuCounts): void {
  for (const key of Object.keys(total) as (keyof KundokuCounts)[]) total[key] += part[key];
}

function fail(sentenceIndex: number, reason: string): never {
  throw new KundokuInputError(`sentence ${sentenceIndex}: ${reason}`);
}

/** 返り点の欄 (`left`) を、並べる値と竪点の有無にする */
function parseLeft(left: string, sentenceIndex: number): { values: string[]; tateten: boolean } {
  const tateten = left.endsWith(TATETEN_SUFFIX);
  const body = tateten ? left.slice(0, -TATETEN_SUFFIX.length) : left;
  if (body === '') {
    if (tateten) fail(sentenceIndex, `unknown left value ${JSON.stringify(left)}`);
    return { values: [], tateten };
  }
  if (COMPOUND_KAERI.has(body)) {
    if (tateten) fail(sentenceIndex, `unknown left value ${JSON.stringify(left)}`);
    return { values: [...body].map((ch) => KAERI_VALUES[ch]!), tateten };
  }
  const value = KAERI_VALUES[body];
  if (value === undefined || (tateten && body === 'レ')) {
    fail(sentenceIndex, `unknown left value ${JSON.stringify(left)}`);
  }
  return { values: [value!], tateten };
}

function assertSentencePair(
  a: KundokuAnnotatedSentence,
  t: KundokuTwoTypesSentence,
  sentenceIndex: number
): void {
  if (!Array.isArray(a.characters)) fail(sentenceIndex, 'annotated characters is not an array');
  if (!Array.isArray(t.characters)) fail(sentenceIndex, 'two_types characters is not an array');
  if (a.characters.length !== t.characters.length) {
    fail(
      sentenceIndex,
      `character counts differ (annotated ${a.characters.length}, two_types ${t.characters.length})`
    );
  }
  if (a.characters.length > MAX_SENTENCE_CHARACTERS) {
    fail(sentenceIndex, `${a.characters.length} characters exceed ${MAX_SENTENCE_CHARACTERS}`);
  }
  a.characters.forEach((ac, i) => {
    const tc = t.characters[i];
    for (const [file, record, fields] of [
      ['annotated', ac, ['character', 'okurigana', 'particle', 'position']],
      ['two_types', tc, ['character', 'right', 'left']],
    ] as const) {
      if (typeof record !== 'object' || record === null) {
        fail(sentenceIndex, `${file} character ${i} is not an object`);
      }
      for (const field of fields) {
        if (typeof (record as Record<string, unknown>)[field] !== 'string') {
          fail(sentenceIndex, `${file} character ${i}: ${field} is not a string`);
        }
      }
    }
    if ([...ac.character].length !== 1) {
      fail(sentenceIndex, `annotated character ${i} is not a single code point`);
    }
    if (ac.character !== tc!.character) {
      fail(
        sentenceIndex,
        `character ${i} differs (annotated ${ac.character}, two_types ${tc!.character})`
      );
    }
  });
}

/**
 * 1 文を 1 block にする。`a` は annotated、`t` は annotated_two_types の同じ添字の文。
 * token と block の id は文の添字から作るので、文書に並べても衝突しない。
 */
export function buildKundokuSentence(
  a: KundokuAnnotatedSentence,
  t: KundokuTwoTypesSentence,
  sentenceIndex: number = 0
): KundokuSentenceResult {
  assertSentencePair(a, t, sentenceIndex);
  const blockId = `b${sentenceIndex}`;
  const counts = emptyCounts();
  counts.sentences = 1;

  // 先に token の id を決める (竪点が次の字の id を要る)
  const tokenIdAt: (string | undefined)[] = [];
  let tokenNo = 0;
  for (const ac of a.characters) {
    if (IDEOGRAPH.test(ac.character)) {
      tokenIdAt.push(`t${sentenceIndex}-${tokenNo}`);
      tokenNo += 1;
    } else {
      tokenIdAt.push(undefined);
    }
  }

  const tokens: Token[] = [];
  const marks: Mark[] = [];
  // 位置ごとに、置いた返り点の値 (句読点から移す返り点の衝突の判定に使う)
  const kaeriAt = new Map<string, string[]>();
  let lastTokenId: string | undefined;

  const placeKaeri = (tokenId: string, values: readonly string[]): void => {
    const placed = kaeriAt.get(tokenId) ?? [];
    for (const value of values) {
      marks.push({ type: 'kaeri', position: { blockId, after: tokenId }, value });
      placed.push(value);
      counts.kaeri += 1;
    }
    kaeriAt.set(tokenId, placed);
  };

  a.characters.forEach((ac, i) => {
    const tc = t.characters[i]!;
    const tokenId = tokenIdAt[i];
    const { values, tateten } = parseLeft(tc.left, sentenceIndex);

    if (tokenId === undefined) {
      counts.punctuation += 1;
      if (lastTokenId === undefined) {
        if (values.length > 0) {
          fail(sentenceIndex, `character ${i}: a mark on punctuation at the start of the sentence`);
        }
        return; // 先頭の句読点は捨てる
      }
      if (tateten) fail(sentenceIndex, `character ${i}: tateten on punctuation`);
      if (values.length > 0) {
        const placed = kaeriAt.get(lastTokenId) ?? [];
        const clashes =
          values.some((value) => value !== KAERI_RE) && placed.some((value) => value !== KAERI_RE);
        if (clashes) {
          counts.droppedKaeri += values.length;
        } else {
          placeKaeri(lastTokenId, values);
          counts.movedPunctuationKaeri += values.length;
        }
      }
      marks.push({
        type: 'kutoten',
        position: { blockId, after: lastTokenId },
        value: ac.character,
      });
      return;
    }

    tokens.push({ id: tokenId, text: ac.character });
    counts.tokens += 1;
    lastTokenId = tokenId;

    if (tateten) {
      const nextId = tokenIdAt[i + 1];
      if (nextId === undefined) {
        fail(sentenceIndex, `character ${i}: tateten without a following character`);
      }
      marks.push({ type: 'tateten', anchor: { from: tokenId, to: nextId! } });
      counts.tateten += 1;
    }
    placeKaeri(tokenId, values);

    const stripped = tc.right.replace(NOT_KANA, '');
    counts.strippedRight += [...tc.right].length - [...stripped].length;
    if (stripped === '') return;
    const right = toKatakana(stripped);
    const okurigana = ac.okurigana;
    let okuri = '';
    let soe = '';
    if (ac.particle.includes('S')) {
      okuri = right;
    } else if (okurigana !== '' && stripped.startsWith(okurigana)) {
      okuri = toKatakana(okurigana);
      soe = toKatakana(stripped.slice(okurigana.length));
    } else if (okurigana === '' && ac.particle.includes('K')) {
      okuri = right;
    } else if (okurigana === '') {
      soe = right;
    } else {
      okuri = right;
    }
    if (okuri !== '') {
      marks.push({ type: 'okurigana', anchor: { from: tokenId, to: tokenId }, value: okuri });
      counts.okurigana += 1;
    }
    if (soe !== '') {
      marks.push({ type: 'soegana', anchor: { from: tokenId, to: tokenId }, value: soe });
      counts.soegana += 1;
    }
  });

  if (tokens.length === 0) fail(sentenceIndex, 'a sentence without a character');
  return {
    tokens,
    block: { id: blockId, tokenIds: tokens.map((token) => token.id) },
    marks,
    counts,
  };
}

function readSentences(label: string, value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new KundokuInputError(`${label}: not an array of sentences`);
  return value;
}

/** 2 つのファイルを読んだ JSON (未検査) から文書を組む。文書全体の検査はここ、1 文の検査は buildKundokuSentence */
export function buildKundokuDocumentFromJson(
  annotated: unknown,
  twoTypes: unknown
): KundokuDocumentResult {
  const as = readSentences('annotated', annotated);
  const ts = readSentences('annotated_two_types', twoTypes);
  if (as.length !== ts.length) {
    throw new KundokuInputError(
      `sentence counts differ (annotated ${as.length}, two_types ${ts.length})`
    );
  }
  const tokens: Token[] = [];
  const blocks: Block[] = [];
  const marks: Mark[] = [];
  const counts = emptyCounts();
  as.forEach((a, index) => {
    const t = ts[index];
    if (typeof a !== 'object' || a === null) fail(index, 'annotated sentence is not an object');
    if (typeof t !== 'object' || t === null) fail(index, 'two_types sentence is not an object');
    const sentence = buildKundokuSentence(
      a as KundokuAnnotatedSentence,
      t as KundokuTwoTypesSentence,
      index
    );
    tokens.push(...sentence.tokens);
    blocks.push(sentence.block);
    marks.push(...sentence.marks);
    addCounts(counts, sentence.counts);
  });
  return {
    document: { format: 'skam@0.1', tokens, blocks, marks, readings: [] },
    counts,
  };
}

/** cache の 1 ファイルを sha256 で照合して JSON として読む */
function readPinnedJson(cacheDir: string, file: { cacheName: string; sha256: string }): unknown {
  const path = join(cacheDir, file.cacheName);
  let text: string;
  try {
    text = readVerifiedSource(path, file.sha256);
  } catch (error) {
    throw new KundokuInputError(
      `${(error as Error).message} (run \`pnpm bench\`, or \`node src/kundoku/cli.ts\` in packages/integration-tests after a build)`,
      { cause: error }
    );
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new KundokuInputError(`${path}: not valid JSON`, { cause: error });
  }
}

/** cache の 2 ファイルを照合して読む (JSON は未検査。検査は buildKundokuDocumentFromJson と buildKundokuSentence) */
export function readKundokuJson(cacheDir: string = KUNDOKU_CACHE_DIR): {
  readonly annotated: unknown;
  readonly twoTypes: unknown;
} {
  return {
    annotated: readPinnedJson(cacheDir, KUNDOKU_ANNOTATED),
    twoTypes: readPinnedJson(cacheDir, KUNDOKU_TWO_TYPES),
  };
}

/** cache の 2 ファイルを照合して読み、test の全文を 1 文書にする */
export function buildKundokuDocument(cacheDir: string = KUNDOKU_CACHE_DIR): KundokuDocumentResult {
  const { annotated, twoTypes } = readKundokuJson(cacheDir);
  return buildKundokuDocumentFromJson(annotated, twoTypes);
}
