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
  AIRHiddenSlot,
  AIRTokenNode,
  AIRTokenSlots,
  AIRTrailingMark,
  AIRHighlightGroupNode,
} from './air-types.js';
import { DEFAULT_ACCESSIBLE_LABELS, type AccessibleLabels } from './accessible-labels.js';

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
  /**
   * この単位の直後で行を改める (linebreak の注記)。付かないときはキーごと無い。
   * 文字列にするときは、ブロックの区切りと同じ半角空白を 1 つ入れる。
   */
  lineBreakAfter?: true;
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

/** 単位の並びの最後の単位に、行を改める印を付ける。単位が無ければ (範囲に畳まれた字など) 何もしない */
function withLineBreakAfter(units: AccessibleUnit[], lineBreakAfter: boolean): AccessibleUnit[] {
  const last = units[units.length - 1];
  if (!lineBreakAfter || !last) return units;
  return [...units.slice(0, -1), { ...last, lineBreakAfter: true }];
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
  node: AIRTokenNode,
  withSlotReadings: boolean,
  range: AIRRangeInfo | undefined
): AccessibleNote[] {
  const { slots } = node;
  const saidoku = isSaidoku(slots);
  const slotReadings = withSlotReadings && !saidoku;
  // 拡張 (出題の印) が隠す読みは、画面と同じく note にしない
  const pick = (
    rangePart: { value: string; hidden?: true } | undefined,
    useSlot: boolean,
    hiddenName: AIRHiddenSlot,
    slotValue: string | undefined
  ): string | undefined =>
    preferRange(
      rangePart?.value,
      useSlot && node.hiddenSlots?.includes(hiddenName) !== true,
      slotValue,
      rangePart?.hidden === true
    );
  const yomigana = pick(range?.yomigana, slotReadings, 'ruby', slots.ruby);
  const okurigana = pick(range?.okurigana, slotReadings, 'okuri', slots.okuri);
  const soegana = pick(range?.soegana, withSlotReadings, 'soegana', slots.soegana);

  const notes: AccessibleNote[] = [];
  if (yomigana) notes.push({ kind: 'yomigana', value: yomigana });
  if (okurigana) notes.push({ kind: 'okurigana', value: okurigana });
  if (soegana) notes.push({ kind: 'soegana', value: soegana });
  if (saidoku) {
    const shown = (slot: AIRHiddenSlot, value: string | undefined): string =>
      node.hiddenSlots?.includes(slot) ? '' : (value ?? '');
    const first = shown('ruby', slots.ruby) + shown('okuri', slots.okuri);
    const second =
      shown('saidokuUnder', slots.saidokuUnder) + shown('saidokuOkuri2', slots.saidokuOkuri2);
    if (first || second) notes.push({ kind: 'saidoku', first, second });
  }
  return notes;
}

/** 範囲の値があればそれを、無ければ（許されるとき）slot の値を使う */
function preferRange(
  rangeValue: string | undefined,
  useSlot: boolean,
  slotValue: string | undefined,
  rangeHidden: boolean
): string | undefined {
  if (rangeValue !== undefined) return rangeHidden ? undefined : rangeValue;
  return useSlot ? slotValue : undefined;
}

/** 読み以外の slot から作る note */
function markNotes(node: AIRTokenNode): AccessibleNote[] {
  const { slots } = node;
  const notes: AccessibleNote[] = [];
  if (slots.kaeri && !node.hiddenSlots?.includes('kaeri')) {
    notes.push({ kind: 'kaeri', value: slots.kaeri });
  }
  if (slots.kutoten && !node.hiddenSlots?.includes('kutoten')) {
    notes.push({ kind: 'kutoten', value: slots.kutoten });
  }
  if (slots.isOkimoji) notes.push({ kind: 'okimoji' });
  if (slots.isJoji) notes.push({ kind: 'joji' });
  if (slots.emphasis) notes.push({ kind: 'emphasis' });
  if (slots.okototen?.some((cell) => cell.hidden !== true)) notes.push({ kind: 'okototen' });
  if (slots.ref) notes.push({ kind: 'ref', label: slots.ref });
  return notes;
}

function describeSlots(
  node: AIRTokenNode,
  withSlotReadings: boolean,
  range?: AIRRangeInfo
): AccessibleNote[] {
  return [...readingNotes(node, withSlotReadings, range), ...markNotes(node)];
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
  const unit = describeTokenNodeUnit(node);
  return unit && node.lineBreakAfter ? { ...unit, lineBreakAfter: true } : unit;
}

function describeTokenNodeUnit(node: AIRTokenNode): AccessibleUnit | undefined {
  if (node.rangeConsumed) return undefined;
  const range = node.rangeInfo;
  const notes = describeSlots(node, true, range);
  if (!range) return makeUnit(node.token.text, notes);
  for (const mark of range.trailingMarks) {
    if (mark.hidden !== true) notes.push(trailingNote(mark));
  }
  return makeUnit(rangeText(range, node.token.text), notes);
}

/** 竪点の区切り。竪点を拡張 (出題の印) が隠すときは単位を出さない */
function describeSeparator(
  separator: AIRTatetenSeparator,
  hidden: boolean
): AccessibleUnit | undefined {
  if (hidden) return undefined;
  const note: AccessibleNote =
    separator.kaeri !== undefined && separator.kaeriHidden !== true
      ? { kind: 'tateten', kaeri: separator.kaeri }
      : { kind: 'tateten' };
  return makeUnit('', [note]);
}

/**
 * 竪点のグループ。読みの範囲がグループの中に収まっているとき（`rangeInfo` がある）は、
 * 範囲全体を 1 単位にする。範囲の中の区切りは、その単位の後に続ける。
 */
function describeTatetenGroup(group: AIRTatetenGroupNode): AccessibleUnit[] {
  return withLineBreakAfter(describeTatetenGroupUnits(group), group.lineBreakAfter === true);
}

function describeTatetenGroupUnits(group: AIRTatetenGroupNode): AccessibleUnit[] {
  const range = group.rangeInfo;
  const out: AccessibleUnit[] = [];
  const hidden = group.hidden === true;

  if (!range) {
    for (const child of group.children) {
      if (child.type === 'tateten-separator') {
        const separator = describeSeparator(child, hidden);
        if (separator) out.push(separator);
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
      const separator = describeSeparator(child, hidden);
      if (separator) (merging ? deferred : out).push(separator);
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
      mergedNotes.push(...describeSlots(child, true, range));
    } else {
      mergedNotes.push(...describeSlots(child, false));
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
  // 最後の子の後ろの改行は、傍線の終わりの後ろに置く (html は span を閉じた後に改行する)
  const last = out[out.length - 1];
  const breakAtEnd = last !== undefined && out.length > 1 && last.lineBreakAfter === true;
  if (breakAtEnd) {
    const { lineBreakAfter: _removed, ...rest } = last;
    out[out.length - 1] = rest;
  }
  const end = makeUnit('', [{ kind: 'highlightEnd' }]);
  out.push(breakAtEnd ? { ...end, lineBreakAfter: true } : end);
  return out;
}

function describeBlock(block: AIRBlock): AccessibleBlock {
  const units: AccessibleUnit[] = [];
  for (const kutoten of block.blockStartKutoten) {
    if (kutoten.hidden === true) continue;
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

// ============================================================================
// 文字列化
// ============================================================================

/** label を引く。labels の own property だけを見て、無ければ既定の言葉を使う */
function pickLabel(
  kind: string,
  labels: Partial<AccessibleLabels> | undefined
): ((note: AccessibleNote) => unknown) | undefined {
  const own: unknown =
    labels !== undefined && Object.hasOwn(labels, kind)
      ? (labels as Record<string, unknown>)[kind]
      : undefined;
  const picked =
    typeof own === 'function' ? own : (DEFAULT_ACCESSIBLE_LABELS as Record<string, unknown>)[kind];
  return typeof picked === 'function' ? (picked as (note: AccessibleNote) => unknown) : undefined;
}

/**
 * note を言葉にする。空文字・例外・string 以外は、その note を出さない（undefined）。
 * label には凍結したコピーを渡し、AIR や呼び出し側の note を書き換えさせない。
 */
function labelNote(
  note: AccessibleNote,
  labels: Partial<AccessibleLabels> | undefined
): string | undefined {
  const label = pickLabel(note.kind, labels);
  if (label === undefined) return undefined;
  try {
    const result = label(Object.freeze({ ...note }));
    return typeof result === 'string' && result !== '' ? result : undefined;
  } catch {
    return undefined;
  }
}

function formatUnit(
  unit: AccessibleUnit,
  labels: Partial<AccessibleLabels> | undefined
): string | undefined {
  const parts: string[] = unit.text === '' ? [] : [unit.text];
  for (const note of unit.notes) {
    const word = labelNote(note, labels);
    if (word !== undefined) parts.push(word);
  }
  return parts.length === 0 ? undefined : `${parts.join('、')}。`;
}

/**
 * 読み上げ用の構造を、日本語の文章にする。
 *
 * - 単位の中は本文と注記の言葉を「、」でつなぎ、単位の終わりに「。」を置く。ブロックの間は半角空白 1 つ。
 *   `lineBreakAfter` の単位の後ろにも、同じ半角空白を 1 つ入れる。
 * - `labels` で kind ごとに言葉を上書きできる（own property だけを見る）。
 *   空文字・例外・string 以外を返した注記は出さない。例外は外に出ない。
 * - 本文が空で、出す注記も無い単位は出さない。すべての単位が出ないブロックは、区切りの空白も出さない。
 * - すべての注記が出ず、本文も無いと、空文字を返す。読み上げ層は出なくなる (R8)。
 * - 戻り値は生のテキストで、HTML のエスケープをしていない。HTML に入れるときは呼び出し側でエスケープする。
 * - 読み上げの言葉は 0.x の minor で変わりうる。
 *
 * @experimental
 */
export function formatAccessibleText(
  blocks: AccessibleBlock[],
  labels?: Partial<AccessibleLabels>
): string {
  const blockTexts: string[] = [];
  for (const block of blocks) {
    let text = '';
    // 改行の空白は、次に出す単位の前に入れる。ブロックの末尾には改行を置けないので、末尾の空白にはならない
    let pendingBreak = false;
    for (const unit of block.units) {
      const formatted = formatUnit(unit, labels);
      if (formatted !== undefined) {
        if (pendingBreak && text !== '') text += ' ';
        pendingBreak = false;
        text += formatted;
      }
      if (unit.lineBreakAfter) pendingBreak = true;
    }
    if (text !== '') blockTexts.push(text);
  }
  return blockTexts.join(' ');
}
