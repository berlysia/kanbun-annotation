/**
 * 読み上げ用テキスト: AIR から言語に依存しない構造を作る。
 *
 * AIR は profile で絞った「画面に見えるもの」なので、この構造に入る値は
 * 画面に見えている注記だけになる。slots / rangeInfo / trailingMarks に無い値は出さない。
 */

import type {
  AIRBlock,
  AIRDocument,
  AIRRangeInfo,
  AIRTatetenGroupNode,
  AIRTatetenSeparator,
  AIRTokenNode,
  AIRTokenSlots,
  AIRTrailingMark,
  AIRHighlightGroupNode,
} from './air-types.js';

/**
 * 読み上げ用の注記。
 *
 * kind は 0.x の minor で増えうる。`switch` で網羅するときは、未知の kind を無視する分岐を置く。
 *
 * @experimental
 */
export type AccessibleNote =
  | { kind: 'yomigana'; value: string }
  | { kind: 'okurigana'; value: string }
  | { kind: 'soegana'; value: string }
  /** 再読文字。値の無い部分は空文字 */
  | { kind: 'saidoku'; first: string; second: string }
  | { kind: 'kaeri'; value: string }
  | { kind: 'kutoten'; value: string }
  | { kind: 'okimoji' }
  | { kind: 'joji' }
  | { kind: 'emphasis' }
  | { kind: 'okototen' }
  | { kind: 'ref'; label: string }
  | { kind: 'tateten'; kaeri?: string }
  | { kind: 'highlightStart'; label?: string }
  | { kind: 'highlightEnd' };

/**
 * 読み上げの 1 単位。`text` は本文の文字列で、本文の無い単位（竪点の区切り、
 * 傍線の始まりと終わり、ブロック先頭の句読点・ref）では空文字になる。
 *
 * @experimental
 */
export interface AccessibleUnit {
  text: string;
  notes: AccessibleNote[];
}

/**
 * 読み上げのブロック。
 *
 * @experimental
 */
export interface AccessibleBlock {
  blockId: string;
  units: AccessibleUnit[];
}

// ============================================================================
// note の順序（spec K2）
// ============================================================================

type OrderedKind = Exclude<AccessibleNote['kind'], 'tateten' | 'highlightStart' | 'highlightEnd'>;

const NOTE_ORDER: Readonly<Record<OrderedKind, number>> = {
  yomigana: 1,
  saidoku: 2,
  okurigana: 3,
  soegana: 4,
  kaeri: 5,
  kutoten: 6,
  okimoji: 7,
  joji: 8,
  emphasis: 9,
  okototen: 10,
  ref: 11,
};

function orderOf(note: AccessibleNote): number {
  return note.kind in NOTE_ORDER ? NOTE_ORDER[note.kind as OrderedKind] : 0;
}

function makeUnit(text: string, notes: AccessibleNote[]): AccessibleUnit {
  // Array.prototype.sort は安定なので、同じ kind の note は元の順序を保つ
  const sorted = [...notes].sort((a, b) => orderOf(a) - orderOf(b));
  return { text, notes: sorted.map((n) => Object.freeze(n)) };
}

// ============================================================================
// slots / rangeInfo から note を作る
// ============================================================================

function isSaidoku(slots: AIRTokenSlots): boolean {
  return slots.saidokuUnder !== undefined || slots.saidokuOkuri2 !== undefined;
}

/**
 * 読みに関わる note。
 *
 * 再読文字（2 回目の読みがある）のときは、ruby / okuri を `saidoku` の 1 回目として扱い、
 * yomigana / okurigana の note にしない。
 */
function readingNotes(
  slots: AIRTokenSlots,
  withSlotReadings: boolean,
  range: AIRRangeInfo | undefined
): AccessibleNote[] {
  const saidoku = isSaidoku(slots);
  const slotReadings = withSlotReadings && !saidoku;
  const yomigana = preferRange(range?.yomigana?.value, slotReadings, slots.ruby);
  const okurigana = preferRange(range?.okurigana?.value, slotReadings, slots.okuri);
  const soegana = preferRange(range?.soegana?.value, withSlotReadings, slots.soegana);

  const notes: AccessibleNote[] = [];
  if (yomigana) notes.push({ kind: 'yomigana', value: yomigana });
  if (okurigana) notes.push({ kind: 'okurigana', value: okurigana });
  if (soegana) notes.push({ kind: 'soegana', value: soegana });
  if (saidoku) {
    const first = (slots.ruby ?? '') + (slots.okuri ?? '');
    const second = (slots.saidokuUnder ?? '') + (slots.saidokuOkuri2 ?? '');
    if (first || second) notes.push({ kind: 'saidoku', first, second });
  }
  return notes;
}

/** 範囲の値があればそれを、無ければ（許されるとき）slot の値を使う */
function preferRange(
  rangeValue: string | undefined,
  useSlot: boolean,
  slotValue: string | undefined
): string | undefined {
  return rangeValue ?? (useSlot ? slotValue : undefined);
}

/** 読み以外の slot から作る note */
function markNotes(slots: AIRTokenSlots): AccessibleNote[] {
  const notes: AccessibleNote[] = [];
  if (slots.kaeri) notes.push({ kind: 'kaeri', value: slots.kaeri });
  if (slots.kutoten) notes.push({ kind: 'kutoten', value: slots.kutoten });
  if (slots.isOkimoji) notes.push({ kind: 'okimoji' });
  if (slots.isJoji) notes.push({ kind: 'joji' });
  if (slots.emphasis) notes.push({ kind: 'emphasis' });
  if (slots.okototen && slots.okototen.length > 0) notes.push({ kind: 'okototen' });
  if (slots.ref) notes.push({ kind: 'ref', label: slots.ref });
  return notes;
}

function describeSlots(
  slots: AIRTokenSlots,
  withSlotReadings: boolean,
  range?: AIRRangeInfo
): AccessibleNote[] {
  return [...readingNotes(slots, withSlotReadings, range), ...markNotes(slots)];
}

function trailingNote(mark: AIRTrailingMark): AccessibleNote {
  switch (mark.kind) {
    case 'kaeri':
      return { kind: 'kaeri', value: mark.resolved };
    case 'kutoten':
      return { kind: 'kutoten', value: mark.resolved };
    case 'ref':
      return { kind: 'ref', label: mark.resolved };
    case 'okimoji':
      return { kind: 'okimoji' };
    case 'joji':
      return { kind: 'joji' };
    case 'emphasis':
      return { kind: 'emphasis' };
  }
}

/** 範囲全体の基底文字列。AIR は少なくとも 1 つの範囲 mark の baseText を持つ */
function rangeText(range: AIRRangeInfo, fallback: string): string {
  return (
    range.yomigana?.baseText ?? range.okurigana?.baseText ?? range.soegana?.baseText ?? fallback
  );
}

// ============================================================================
// ノードから単位を作る
// ============================================================================

function describeTokenNode(node: AIRTokenNode): AccessibleUnit | undefined {
  if (node.rangeConsumed) return undefined;
  const range = node.rangeInfo;
  const notes = describeSlots(node.slots, true, range);
  if (!range) return makeUnit(node.token.text, notes);
  for (const mark of range.trailingMarks) notes.push(trailingNote(mark));
  return makeUnit(rangeText(range, node.token.text), notes);
}

function describeSeparator(separator: AIRTatetenSeparator): AccessibleUnit {
  const note: AccessibleNote =
    separator.kaeri !== undefined
      ? { kind: 'tateten', kaeri: separator.kaeri }
      : { kind: 'tateten' };
  return makeUnit('', [note]);
}

/**
 * 竪点のグループ。読みの範囲がグループの中に収まっているとき（`rangeInfo` がある）は、
 * 範囲全体を 1 単位にする。範囲の中の区切りは、その単位の後に続ける。
 */
function describeTatetenGroup(group: AIRTatetenGroupNode): AccessibleUnit[] {
  const range = group.rangeInfo;
  const out: AccessibleUnit[] = [];

  if (!range) {
    for (const child of group.children) {
      if (child.type === 'tateten-separator') {
        out.push(describeSeparator(child));
        continue;
      }
      const unit = describeTokenNode(child);
      if (unit) out.push(unit);
    }
    return out;
  }

  const covered = new Set(range.tokenIds);
  const mergedNotes: AccessibleNote[] = [];
  const deferred: AccessibleUnit[] = [];
  let merging = false;

  for (const child of group.children) {
    if (child.type === 'tateten-separator') {
      (merging ? deferred : out).push(describeSeparator(child));
      continue;
    }
    const id = child.token.id;
    if (!covered.has(id)) {
      const unit = describeTokenNode(child);
      if (unit) out.push(unit);
      continue;
    }
    if (id === range.fromTokenId) {
      merging = true;
      mergedNotes.push(...describeSlots(child.slots, true, range));
    } else {
      mergedNotes.push(...describeSlots(child.slots, false));
    }
    if (id === range.toTokenId) {
      out.push(makeUnit(rangeText(range, ''), mergedNotes), ...deferred);
      merging = false;
    }
  }
  return out;
}

function describeHighlightGroup(group: AIRHighlightGroupNode): AccessibleUnit[] {
  const start: AccessibleNote =
    group.refLabel !== undefined
      ? { kind: 'highlightStart', label: group.refLabel }
      : { kind: 'highlightStart' };
  const out: AccessibleUnit[] = [makeUnit('', [start])];
  for (const child of group.children) {
    if (child.type === 'tateten-group') {
      out.push(...describeTatetenGroup(child));
    } else {
      const unit = describeTokenNode(child);
      if (unit) out.push(unit);
    }
  }
  out.push(makeUnit('', [{ kind: 'highlightEnd' }]));
  return out;
}

function describeBlock(block: AIRBlock): AccessibleBlock {
  const units: AccessibleUnit[] = [];
  for (const kutoten of block.blockStartKutoten) {
    units.push(makeUnit('', [{ kind: 'kutoten', value: kutoten.value }]));
  }
  for (const ref of block.blockStartRefs) {
    units.push(makeUnit('', [{ kind: 'ref', label: ref.resolved }]));
  }
  for (const child of block.children) {
    if (child.type === 'highlight-group') {
      units.push(...describeHighlightGroup(child));
    } else if (child.type === 'tateten-group') {
      units.push(...describeTatetenGroup(child));
    } else {
      const unit = describeTokenNode(child);
      if (unit) units.push(unit);
    }
  }
  return { blockId: block.blockId, units };
}

/**
 * AIR から、読み上げ用の構造（ブロック → 単位 → 注記）を作る。
 *
 * - 単位の順序は AIR の走査順で、`blocks[].tokenIds` の連結順に一致する。
 * - 注記の順序は、本文の後に yomigana, saidoku, okurigana, soegana, kaeri, kutoten,
 *   okimoji, joji, emphasis, okototen, ref の順。
 * - 出すのは AIR の slots / rangeInfo / trailingMarks にある値だけ。AIR は profile で絞り込み済みなので、
 *   画面に見えていない注記は出ない。
 * - 再読文字は `slots.saidokuUnder` か `slots.saidokuOkuri2` があるときだけ `saidoku` の note にする。
 *   2 回目の読みが無い再読文字は、1 回目の読みが yomigana / okurigana として出る (R4)。
 * - 竪点のグループからはみ出す読みの範囲は、先頭の字の yomigana として出る (#16)。
 * - 純粋関数。AIR を書き換えない。返す note は凍結している。
 *
 * @experimental
 */
export function describeAnnotationIR(air: AIRDocument): AccessibleBlock[] {
  return air.blocks.map(describeBlock);
}
