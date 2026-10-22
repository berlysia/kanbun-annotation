/**
 * 読み上げ用テキスト: AIR から言語に依存しない構造を作る。
 *
 * AIR は profile で絞った「画面に見えるもの」なので、この構造に入る値は
 * 画面に見えている注記だけになる。字の slots と、グループのノードに無い値は出さない。
 */

import type {
  AIRBlock,
  AIRBlockChild,
  AIRDocument,
  AIRRubyGroupNode,
  AIRTatetenGroupNode,
  AIRTatetenSeparator,
  AIRHiddenSlot,
  AIRTokenNode,
  AIRTokenSlots,
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

/** 単位の並びの最後の単位に、行を改める印を付ける。単位が無ければ何もしない */
function withLineBreakAfter(units: AccessibleUnit[], lineBreakAfter: boolean): AccessibleUnit[] {
  const last = units[units.length - 1];
  if (!lineBreakAfter || !last) return units;
  return [...units.slice(0, -1), { ...last, lineBreakAfter: true }];
}

// ============================================================================
// slots から note を作る
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
function readingNotes(node: AIRTokenNode): AccessibleNote[] {
  const { slots } = node;
  const saidoku = isSaidoku(slots);
  // 拡張 (出題の印) が隠す読みは、画面と同じく note にしない
  const pick = (
    useSlot: boolean,
    hiddenName: AIRHiddenSlot,
    slotValue: string | undefined
  ): string | undefined =>
    useSlot && node.hiddenSlots?.includes(hiddenName) !== true ? slotValue : undefined;
  const yomigana = pick(!saidoku, 'ruby', slots.ruby);
  const okurigana = pick(!saidoku, 'okuri', slots.okuri);
  const soegana = pick(true, 'soegana', slots.soegana);

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

function describeSlots(node: AIRTokenNode): AccessibleNote[] {
  return [...readingNotes(node), ...markNotes(node)];
}

// ============================================================================
// ノードから単位を作る
// ============================================================================

function describeTokenNode(node: AIRTokenNode): AccessibleUnit {
  const unit = makeUnit(node.token.text, describeSlots(node));
  return node.lineBreakAfter ? { ...unit, lineBreakAfter: true } : unit;
}

/** 竪点の区切り。含む竪点がどれも拡張 (出題の印) で隠されているときは単位を出さない */
function describeSeparator(separator: AIRTatetenSeparator): AccessibleUnit | undefined {
  if (separator.hidden === true) return undefined;
  const note: AccessibleNote =
    separator.kaeri !== undefined && separator.kaeriHidden !== true
      ? { kind: 'tateten', kaeri: separator.kaeri }
      : { kind: 'tateten' };
  return makeUnit('', [note]);
}

/** 傍線の id (注記) から、断片に分かれても 1 つの解決済みラベルを引く */
type HighlightLabels = ReadonlyMap<AIRHighlightGroupNode['highlightMark'], string>;

/**
 * ruby のグループ。字は 1 字ずつ単位にし、範囲の読み仮名は最後の字の後ろの、本文の無い単位で読む。
 * 読みを拡張 (出題の印) が隠すときは、その単位を出さない。
 */
function describeRubyGroup(group: AIRRubyGroupNode, labels: HighlightLabels): AccessibleUnit[] {
  const units = describeChildren(group.children, labels);
  if (group.yomigana.hidden !== true) {
    units.push(makeUnit('', [{ kind: 'yomigana', value: group.yomigana.value }]));
  }
  return withLineBreakAfter(units, group.lineBreakAfter === true);
}

function describeTatetenGroup(
  group: AIRTatetenGroupNode,
  labels: HighlightLabels
): AccessibleUnit[] {
  return withLineBreakAfter(
    describeChildren(group.children, labels),
    group.lineBreakAfter === true
  );
}

/**
 * 傍線のグループ。傍線の始まりは前に断片が無いグループで、終わりは後ろに断片が無いグループで読む
 * (断片に分かれた傍線も、始まりと終わりは 1 回ずつ)。ラベルは最後の断片に付くので、始まりでは
 * 同じ傍線の解決済みラベルを引く。
 */
function describeHighlightGroup(
  group: AIRHighlightGroupNode,
  labels: HighlightLabels
): AccessibleUnit[] {
  const out: AccessibleUnit[] = [];
  if (group.continuesBefore !== true) {
    const label = group.refLabel ?? labels.get(group.highlightMark);
    out.push(
      makeUnit('', [
        label !== undefined ? { kind: 'highlightStart', label } : { kind: 'highlightStart' },
      ])
    );
  }
  out.push(...describeChildren(group.children, labels));
  if (group.continuesAfter === true) return out;

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

function describeChildren(
  children: readonly AIRBlockChild[],
  labels: HighlightLabels
): AccessibleUnit[] {
  const units: AccessibleUnit[] = [];
  for (const child of children) {
    switch (child.type) {
      case 'token':
        units.push(describeTokenNode(child));
        break;
      case 'tateten-separator': {
        const separator = describeSeparator(child);
        if (separator) units.push(separator);
        break;
      }
      case 'ruby-group':
        units.push(...describeRubyGroup(child, labels));
        break;
      case 'tateten-group':
        units.push(...describeTatetenGroup(child, labels));
        break;
      case 'highlight-group':
        units.push(...describeHighlightGroup(child, labels));
        break;
    }
  }
  return units;
}

/** 傍線ごとの解決済みラベルを集める。ラベルは断片のうち最後の 1 つだけに付く */
function collectHighlightLabels(
  children: readonly AIRBlockChild[],
  labels: Map<AIRHighlightGroupNode['highlightMark'], string>
): void {
  for (const child of children) {
    if (child.type === 'highlight-group' && child.refLabel !== undefined) {
      labels.set(child.highlightMark, child.refLabel);
    }
    if ('children' in child) collectHighlightLabels(child.children, labels);
  }
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
  const labels = new Map<AIRHighlightGroupNode['highlightMark'], string>();
  collectHighlightLabels(block.children, labels);
  units.push(...describeChildren(block.children, labels));
  return { blockId: block.blockId, units };
}

/**
 * AIR から、読み上げ用の構造（ブロック → 単位 → 注記）を作る。
 *
 * - 単位の順序は AIR の走査順で、`blocks[].tokenIds` の連結順に一致する。
 * - 注記の順序は、本文の後に yomigana, saidoku, okurigana, soegana, kaeri, kutoten,
 *   okimoji, joji, emphasis, okototen, ref の順。
 * - 出すのは AIR の字の slots と、グループのノードにある値だけ。AIR は profile で絞り込み済みなので、
 *   画面に見えていない注記は出ない。
 * - 字は 1 字ずつ単位にし、その字自身の注記を notes に入れる。
 * - 再読文字は `slots.saidokuUnder` か `slots.saidokuOkuri2` があるときだけ `saidoku` の note にする。
 *   2 回目の読みが無い再読文字は、1 回目の読みが yomigana / okurigana として出る (R4)。
 * - 2 字以上の読みの範囲 (ruby のグループ) は、範囲の最後の字の単位の後ろに、本文の無い単位で
 *   yomigana の note を 1 つ出す。竪点や傍線の断片にまたがっても 1 回。
 * - 傍線の始まりと終わりは、断片に分かれても 1 回ずつ出す。
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
