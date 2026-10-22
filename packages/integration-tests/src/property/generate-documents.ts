/**
 * 性質テストの文書の生成器。往復のテスト (`roundtrip-strict.test.ts`) と描画のテスト
 * (`overlapping-ranges-property.test.ts`) が共有する。
 *
 * 乱数は種を固定した `prng` から取る。`generateDocument` が `r()` を呼ぶ数と順は、往復のテストの
 * 結果 (どの種でどの文書になるか) に関わるので、変えない。
 */

/** 種を固定した乱数 (mulberry32)。0 以上 1 未満 */
export const prng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const ANCHORED = [
  'yomigana',
  'okurigana',
  'soegana',
  'okimoji',
  'joji',
  'okototen',
  'saidoku',
  'emphasis',
  'emphasis',
  'highlight',
  'tateten',
] as const;

export const randomMark = (r: () => number, n: number, idAt: (index: number) => string) => {
  const a = Math.floor(r() * n);
  const type = ANCHORED[Math.floor(r() * ANCHORED.length)]!;
  // saidoku は 1 字 (複数の字は警告になる)。ほかは 1〜3 字の範囲で、部分交差と包含が自然に起きる
  const b = type === 'saidoku' ? a : Math.min(n - 1, a + Math.floor(r() * 3));
  const anchor = { from: idAt(a), to: idAt(b) };
  switch (type) {
    case 'yomigana':
    case 'okurigana':
    case 'soegana':
      return { type, anchor, value: 'か' };
    case 'okototen':
      return {
        type,
        anchor,
        shape: 'dot',
        position: { system: 'glyph-grid', grid: '5x5', x: 1 + Math.floor(r() * 3), y: 2 },
      };
    case 'saidoku':
      return { type, anchor, forms: [{ yomi: 'まさ' }, { okuri: 'す' }] };
    default:
      return { type, anchor };
  }
};

// 注記の id は、なし / 自動の形 / 手書きの形をばらまく。kun にまとめて書く 3 種は、
// xml:id を 1 つしか書けないので手書きの id を付けない
const KUN_TYPES: ReadonlySet<string> = new Set(['yomigana', 'okurigana', 'soegana']);
export const withMarkId = <T extends { type: string }>(r: () => number, mark: T, k: number): T => {
  const roll = r();
  if (roll < 1 / 3) return mark;
  if (roll < 2 / 3) return { ...mark, id: `m#${k + 1}` };
  return KUN_TYPES.has(mark.type) ? mark : { ...mark, id: `n${k + 1}` };
};

// ext、custom、placementHint を持つ注記。kun にまとめて書く 3 種には付けない (部分ごとの名前で書くため、別の検査がある)
export const withFreeData = <T extends { type: string }>(r: () => number, mark: T): T => {
  if (KUN_TYPES.has(mark.type)) return mark;
  const roll = r();
  if (roll < 0.1) return { ...mark, custom: { c: [1, { d: 'x' }] } };
  if (roll < 0.15) return { ...mark, placementHint: 'left' };
  if (roll < 0.2) return { ...mark, ext: { zzz: { a: 1 } } };
  return mark;
};

export const randomPositionMark = (
  r: () => number,
  n: number,
  blockId: string,
  idAt: (index: number) => string
) => {
  const after = idAt(Math.floor(r() * n));
  return r() < 0.5
    ? { type: 'kutoten', kind: 'ten', value: '、', position: { blockId, after } }
    : { type: 'kaeri', value: '㆑', position: { blockId, after } };
};

/** 往復の生成器が字に使う本文 (空白、結合する字、2 書記素以上の字を含む) */
export const TEXTS = [
  '甲',
  '乙',
  '丙',
  '丁',
  '戊',
  '己',
  ' ',
  '學問',
  String.fromCodePoint(0x0301),
  ' 庚',
  '辛',
];

/**
 * 1 ブロックの文書を 1 つ作る。部分交差、包含、同じ範囲の同じ種類の注記、範囲の中の位置の注記、
 * 添え仮名と saidoku の組、2 書記素以上の字、空白の字、結合する字、手書きと自動の id、ext、custom、
 * placementHint を作る。validator を通るか、警告が出るかは確かめない (呼ぶ側が確かめる)。
 *
 * `n` は文書の通し番号で、手書きの字の id (`k${n}x${i}`) に入る。
 */
export function generateDocument(r: () => number, n: number) {
  const len = 2 + Math.floor(r() * 5);
  // ブロックの id は自動の形と手書きの形の両方。字の id も自動の形と手書きの形をばらまく
  const blockId = r() < 0.5 ? 'b#1' : 'p1';
  const texts: string[] = Array.from({ length: len }, () => TEXTS[Math.floor(r() * TEXTS.length)]!);
  const tokens = texts.map((text, i) => {
    const hand = r() < 0.15;
    const token: { id: string; text: string; ext?: object; custom?: object } = {
      id: hand ? `k${n}x${i}` : `${blockId}#${i + 1}`,
      text,
    };
    if (r() < 0.1) token.custom = { tc: i };
    if (r() < 0.05) token.ext = { zzz: { t: i } };
    return token;
  });
  const idAt = (index: number): string => tokens[index]!.id;
  const rawMarks = [
    ...Array.from({ length: 1 + Math.floor(r() * 5) }, () => randomMark(r, len, idAt)),
    ...Array.from({ length: Math.floor(r() * 3) }, () => randomPositionMark(r, len, blockId, idAt)),
  ];
  const marks = rawMarks.map((mark, k) => withFreeData(r, withMarkId(r, mark, k)));
  const usesExt = [...tokens, ...marks].some((x) => 'ext' in x);
  return {
    format: 'skam@0.1' as const,
    readings: [],
    tokens,
    blocks: [{ id: blockId, tokenIds: tokens.map((t) => t.id) }],
    marks,
    ...(usesExt ? { extensions: ['zzz'] } : {}),
  };
}

// ============================================================================
// 描画の性質テスト向け: ruby・竪点・傍線が交差する文書
// ============================================================================

/** 描画の生成器が字に使う本文 (漢字だけ。canvas の本文の fillText を、注記の fillText と見分けるため) */
export const RENDER_TEXTS = ['子', '曰', '學', '而', '時', '習', '之', '不', '亦', '説', '乎'];

export type GeneratedMark = Record<string, unknown> & { type: string };

interface GeneratedBlock {
  id: string;
  tokenIds: string[];
}

/** 範囲 [a, b] (両端を含む)。部分交差と包含が起きるよう、幅は 1〜5 字 */
function randomSpan(r: () => number, n: number): [number, number] {
  const a = Math.floor(r() * n);
  return [a, Math.min(n - 1, a + Math.floor(r() * 5))];
}

const YOMI_VALUES = ['あ', 'いう', 'えおか', 'きくけこ'];

/** 注記の種類と、乱数 (0 以上 1 未満) がその値より小さいときに選ぶ境界。ruby・竪点・傍線を多めにする */
const CROSSING_KINDS = [
  ['yomigana', 0.22],
  ['tateten', 0.42],
  ['highlight', 0.62],
  ['okurigana', 0.68],
  ['soegana', 0.72],
  ['okimoji-joji', 0.78],
  ['emphasis', 0.84],
  ['saidoku', 0.87],
  ['okototen', 0.9],
  ['kaeri', 0.94],
  ['kutoten', 0.97],
  ['linebreak', 1],
] as const;

function randomCrossingMark(r: () => number, block: GeneratedBlock): GeneratedMark {
  const size = block.tokenIds.length;
  const idAt = (i: number): string => block.tokenIds[i]!;
  const [a, b] = randomSpan(r, size);
  const anchor = { from: idAt(a), to: idAt(b) };
  const roll = r();
  const kind = CROSSING_KINDS.find(([, bound]) => roll < bound)![0];
  const position = (after: number) => ({ blockId: block.id, after: idAt(after) });
  switch (kind) {
    case 'yomigana': {
      // 2 字以上の範囲になるよう広げる
      const from = b > a ? a : Math.min(a, size - 2);
      const to = b > a ? b : from + 1;
      return {
        type: 'yomigana',
        anchor: { from: idAt(from), to: idAt(to) },
        value: YOMI_VALUES[Math.floor(r() * YOMI_VALUES.length)]!,
      };
    }
    case 'okurigana':
      return { type: 'okurigana', anchor, value: 'ニ' };
    case 'soegana':
      return { type: 'soegana', anchor, value: 'ヲ' };
    case 'okimoji-joji':
      return { type: r() < 0.5 ? 'okimoji' : 'joji', anchor };
    case 'saidoku':
      return {
        type: 'saidoku',
        anchor: { from: anchor.from, to: anchor.from },
        forms: [{ yomi: 'まさ' }, { okuri: 'す' }],
      };
    case 'okototen':
      return {
        type: 'okototen',
        anchor,
        shape: 'dot',
        position: { system: 'glyph-grid', grid: '5x5', x: 1, y: 2 },
      };
    case 'kaeri':
      return {
        type: 'kaeri',
        value: r() < 0.4 ? '㆑' : r() < 0.5 ? '一' : '二',
        position: position(Math.floor(r() * size)),
      };
    case 'kutoten':
      return {
        type: 'kutoten',
        kind: 'ten',
        value: '、',
        position: position(Math.floor(r() * size)),
      };
    case 'linebreak':
      return { type: 'linebreak', position: position(Math.floor(r() * (size - 1))) };
    default:
      return { type: kind, anchor };
  }
}

/** 注記の 1 つを、validator を通らない形 (逆向きの範囲、無い字、別のブロックをまたぐ範囲) にする */
function breakOneMark(r: () => number, marks: GeneratedMark[], blocks: GeneratedBlock[]): void {
  const first = blocks[0]!.tokenIds;
  const last = blocks[blocks.length - 1]!.tokenIds;
  const victim = marks.find((m) => 'anchor' in m);
  if (!victim) {
    marks.push({ type: 'tateten', anchor: { from: 'missing', to: first[0]! } });
    return;
  }
  const anchor = victim['anchor'] as { from: string; to: string };
  const how = Math.floor(r() * 4);
  if (how === 0) victim['anchor'] = { from: anchor.to, to: anchor.from };
  else if (how === 1) victim['anchor'] = { from: anchor.from, to: 'missing' };
  else if (how === 2) victim['anchor'] = { from: first[0]!, to: last[last.length - 1]! };
  else victim['anchor'] = { from: last[last.length - 1]!, to: first[0]! };
}

/**
 * ruby (2 字以上)・竪点・傍線を多めに、送り仮名・添え仮名・置き字・助字・傍点・返り点・
 * 句読点・再読文字・ヲコト点・改行・ref を混ぜた文書を作る。ブロックは 1〜2 つ。
 * 同じ種類の読みが重なる文書 (警告) も自然にできる。
 *
 * `breakage` が `broken` のとき、注記の 1 つを validator を通らない形にする。
 */
export function generateCrossingDocument(
  r: () => number,
  n: number,
  breakage: 'none' | 'broken' = 'none'
) {
  const blocks: GeneratedBlock[] = [];
  const tokens: { id: string; text: string }[] = [];
  const blockCount = r() < 0.2 ? 2 : 1;
  for (let b = 0; b < blockCount; b++) {
    const id = `b${b + 1}`;
    const len = 3 + Math.floor(r() * 6);
    const tokenIds = Array.from({ length: len }, (_, i) => `${id}t${i + 1}`);
    for (const tokenId of tokenIds) {
      tokens.push({ id: tokenId, text: RENDER_TEXTS[Math.floor(r() * RENDER_TEXTS.length)]! });
    }
    blocks.push({ id, tokenIds });
  }

  const marks: GeneratedMark[] = [];
  for (const block of blocks) {
    const count = 2 + Math.floor(r() * 7);
    for (let k = 0; k < count; k++) marks.push(randomCrossingMark(r, block));
  }
  if (breakage === 'broken') breakOneMark(r, marks, blocks);

  // 傍線が ref を指す
  const highlight = marks.find((m) => m.type === 'highlight');
  if (highlight && r() < 0.3) {
    const firstBlock = blocks[0]!;
    marks.push({
      id: `ref${n}`,
      type: 'ref',
      label: 'L',
      content: '注',
      position: { blockId: firstBlock.id, after: firstBlock.tokenIds[0]! },
    });
    highlight['ref'] = `ref${n}`;
  }

  return { format: 'skam@0.1' as const, readings: [], tokens, blocks, marks };
}
