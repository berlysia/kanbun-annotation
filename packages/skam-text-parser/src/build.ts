import { KAERI } from '@kanbun-skam/skam';
import type { Block, Mark, SaidokuForm, SKAMDocument } from '@kanbun-skam/skam';
import type { ResolvedOptions } from './options.js';
import { scan, sourceBlocks } from './scan.js';
import type { Lexeme, SourceBlock } from './scan.js';
import { diagnostic } from './diagnostics.js';
import type { NotationDiagnostic, SourceRange, SourceMap } from './diagnostics.js';

interface LocatedMark {
  readonly mark: Mark;
  readonly range: SourceRange;
}
interface Attachment {
  readonly value: string;
  readonly range: SourceRange;
}
interface PendingToken {
  readonly id: string;
  yomi?: Attachment;
  okuri?: Attachment;
  soegana?: Attachment;
  saidoku?: { readonly form: SaidokuForm; readonly range: SourceRange };
  readonly kaeri: LocatedMark[];
}
interface BuildState {
  readonly document: SKAMDocument;
  readonly sourceMap: { tokens: SourceRange[]; marks: SourceRange[]; blocks: SourceRange[] };
  readonly diagnostics: NotationDiagnostic[];
  readonly starts: readonly number[];
}
interface BlockState {
  readonly build: BuildState;
  readonly block: Block;
  readonly source: SourceBlock;
  readonly options: ResolvedOptions;
  readonly items: readonly Lexeme[];
  pending?: PendingToken;
  lastId?: string;
  rangeStart?: { id?: string; start: number };
  tateten?: { from: string; to: string; start: number; end: number };
  join?: Lexeme;
  afterPunctuation: boolean;
}
interface PairValue {
  readonly inside: readonly Lexeme[];
  readonly range: SourceRange;
  readonly next: number;
}

const kaeriValues: Readonly<Record<string, string>> = {
  レ: KAERI.RE,
  れ: KAERI.RE,
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
const unicodeKaeri = new Set<string>(Object.values(KAERI));

export interface BuiltDocument {
  readonly document: SKAMDocument;
  readonly sourceMap: SourceMap;
  readonly diagnostics: readonly NotationDiagnostic[];
}

function error(state: BlockState, range: SourceRange, code: string, message: string): void {
  state.build.diagnostics.push(diagnostic(state.build.starts, range, code, message));
}

function emit(state: BlockState, mark: Mark, range: SourceRange): void {
  const { document, sourceMap } = state.build;
  document.marks.push({ ...mark, id: `m#${document.marks.length + 1}` });
  sourceMap.marks.push(range);
}

function flush(state: BlockState): void {
  const pending = state.pending;
  if (!pending) return;
  const anchor = { from: pending.id, to: pending.id };
  if (pending.saidoku) {
    const first: SaidokuForm = {};
    if (pending.yomi) first.yomi = pending.yomi.value;
    if (pending.okuri) first.okuri = pending.okuri.value;
    const start = Math.min(
      pending.yomi?.range.start ?? Infinity,
      pending.okuri?.range.start ?? Infinity,
      pending.saidoku.range.start
    );
    const end = Math.max(
      pending.yomi?.range.end ?? 0,
      pending.okuri?.range.end ?? 0,
      pending.saidoku.range.end
    );
    emit(state, { type: 'saidoku', anchor, forms: [first, pending.saidoku.form] }, { start, end });
  } else {
    if (pending.yomi)
      emit(state, { type: 'yomigana', anchor, value: pending.yomi.value }, pending.yomi.range);
    if (pending.okuri)
      emit(state, { type: 'okurigana', anchor, value: pending.okuri.value }, pending.okuri.range);
  }
  if (pending.soegana)
    emit(state, { type: 'soegana', anchor, value: pending.soegana.value }, pending.soegana.range);
  for (const entry of pending.kaeri) emit(state, entry.mark, entry.range);
  delete state.pending;
}

function finishTateten(state: BlockState): void {
  const tateten = state.tateten;
  if (tateten && tateten.from !== tateten.to)
    emit(state, { type: 'tateten', anchor: { from: tateten.from, to: tateten.to } }, tateten);
  delete state.tateten;
}

function addToken(state: BlockState, text: string, range: SourceRange): void {
  flush(state);
  const id = `${state.block.id}#${state.block.tokenIds.length + 1}`;
  state.build.document.tokens.push({ id, text });
  state.block.tokenIds.push(id);
  state.build.sourceMap.tokens.push(range);
  if (state.join) {
    if (state.tateten) {
      state.tateten.to = id;
      state.tateten.end = range.end;
    }
    delete state.join;
  } else finishTateten(state);
  state.lastId = id;
  state.pending = { id, kaeri: [] };
  state.afterPunctuation = false;
  if (state.rangeStart && !state.rangeStart.id) state.rangeStart.id = id;
}

function attach(
  state: BlockState,
  kind: 'yomi' | 'okuri' | 'soegana',
  value: string,
  range: SourceRange
): void {
  if (!value) error(state, range, 'EMPTY_VALUE', 'Attachment must not be empty');
  else if (!state.pending)
    error(state, range, 'ORPHAN_ATTACHMENT', 'Attachment must follow a body token');
  else if (state.pending[kind])
    error(state, range, 'DUPLICATE_ATTACHMENT', `Duplicate ${kind} attachment`);
  else state.pending[kind] = { value, range };
}

function readKana(
  items: readonly Lexeme[],
  index: number
): { value: string; end: number; next: number } {
  let value = '';
  let end = items[index - 1]?.end ?? 0;
  let next = index;
  while (items[next]?.type === 'kana') {
    const item = items[next++]!;
    value += item.value;
    end = item.end;
  }
  return { value, end, next: next - 1 };
}

function readPair(state: BlockState, index: number): PairValue {
  const opening = state.items[index]!;
  let nesting = 0;
  for (let j = index + 1; j < state.items.length; j++) {
    const item = state.items[j]!;
    if (item.type !== 'symbol') continue;
    if (item.value === opening.value) nesting++;
    if (item.value !== opening.syntax?.close) continue;
    if (nesting > 0) {
      nesting--;
      continue;
    }
    return {
      inside: state.items.slice(index + 1, j),
      range: { start: opening.start, end: item.end },
      next: j,
    };
  }
  const range = { start: opening.start, end: state.source.end };
  error(
    state,
    range,
    'UNCLOSED_SYMBOL',
    `Unclosed ${opening.value}; expected ${opening.syntax?.close ?? ''}`
  );
  return { inside: [], range, next: state.items.length };
}

function applyKaeri(state: BlockState, pair: PairValue): void {
  if (!pair.inside.length) error(state, pair.range, 'EMPTY_VALUE', 'Kaeri must not be empty');
  const pending = state.pending;
  if (!pending) error(state, pair.range, 'ORPHAN_ATTACHMENT', 'Kaeri must follow a body token');
  for (const item of pair.inside) {
    const value =
      kaeriValues[item.value] ?? (unicodeKaeri.has(item.value) ? item.value : undefined);
    if (!value) error(state, item, 'INVALID_KAERI', `Invalid kaeri ${item.value}`);
    else if (pending)
      pending.kaeri.push({
        mark: { type: 'kaeri', position: { blockId: state.block.id, after: pending.id }, value },
        range: pair.range,
      });
  }
}

function applyReading(state: BlockState, pair: PairValue): void {
  const value = pair.inside.map((item) => item.value).join('');
  if (pair.inside.some((item) => item.type !== 'kana'))
    error(state, pair.range, 'INVALID_VALUE', 'Reading must contain kana only');
  const range = state.rangeStart;
  if (!range) {
    attach(state, 'yomi', value, pair.range);
    return;
  }
  if (!value) error(state, pair.range, 'EMPTY_VALUE', 'Reading must not be empty');
  else if (!range.id || !state.lastId)
    error(state, pair.range, 'ORPHAN_ATTACHMENT', 'Reading range must contain body tokens');
  else
    emit(
      state,
      { type: 'yomigana', anchor: { from: range.id, to: state.lastId }, value },
      { start: range.start, end: pair.range.end }
    );
  delete state.rangeStart;
}

function saidokuForm(state: BlockState, pair: PairValue): SaidokuForm {
  const form: SaidokuForm = {};
  let content = pair.inside;
  const first = content[0];
  if (first?.syntax?.owner === 'yomigana' && first.syntax.role === 'open') {
    const close = content.findIndex(
      (item, index) => index > 0 && item.type === 'symbol' && item.value === first.syntax?.close
    );
    if (close < 0) {
      error(state, pair.range, 'UNCLOSED_SYMBOL', 'Unclosed saidoku reading');
      return form;
    }
    const reading = content.slice(1, close);
    if (reading.some((item) => item.type !== 'kana'))
      error(state, pair.range, 'INVALID_VALUE', 'Saidoku reading must contain kana only');
    form.yomi = reading.map((item) => item.value).join('');
    if (!form.yomi) error(state, pair.range, 'EMPTY_VALUE', 'Saidoku reading must not be empty');
    content = content.slice(close + 1);
  }
  if (content.length) {
    if (content.some((item) => item.type !== 'kana'))
      error(state, pair.range, 'INVALID_VALUE', 'Saidoku okuri must contain kana only');
    form.okuri = content.map((item) => item.value).join('');
  }
  if (!form.yomi && !form.okuri)
    error(state, pair.range, 'EMPTY_VALUE', 'Saidoku must not be empty');
  return form;
}

function applyPair(state: BlockState, index: number): number {
  const item = state.items[index]!;
  const pair = readPair(state, index);
  if (pair.next >= state.items.length) return pair.next;
  switch (item.syntax?.owner) {
    case 'kaeri':
      applyKaeri(state, pair);
      break;
    case 'yomigana':
      applyReading(state, pair);
      break;
    case 'saidoku': {
      const form = saidokuForm(state, pair);
      if (!state.pending)
        error(state, pair.range, 'ORPHAN_ATTACHMENT', 'Saidoku must follow a body token');
      else if (state.pending.saidoku)
        error(state, pair.range, 'DUPLICATE_ATTACHMENT', 'Duplicate saidoku attachment');
      else state.pending.saidoku = { form, range: pair.range };
      break;
    }
  }
  return pair.next;
}

function applyPunctuation(state: BlockState, item: Lexeme): void {
  flush(state);
  if (state.join) {
    error(state, state.join, 'ORPHAN_ATTACHMENT', 'Tateten must connect body tokens');
    delete state.join;
  }
  finishTateten(state);
  const position = { blockId: state.block.id, ...(state.lastId ? { after: state.lastId } : {}) };
  const kind = item.syntax?.kind;
  emit(state, { type: 'kutoten', position, value: item.value, ...(kind ? { kind } : {}) }, item);
  state.afterPunctuation = true;
}

function applyTateten(state: BlockState, item: Lexeme): void {
  if (!state.lastId || state.join || state.afterPunctuation) {
    error(state, item, 'ORPHAN_ATTACHMENT', 'Tateten must connect body tokens');
    return;
  }
  state.tateten ??= { from: state.lastId, to: state.lastId, start: item.start, end: item.end };
  state.join = item;
}

function applySymbol(state: BlockState, index: number): number {
  const item = state.items[index]!;
  const syntax = item.syntax!;
  if (syntax.role === 'close') {
    error(state, item, 'UNEXPECTED_CLOSE', `Unexpected closing symbol ${item.value}`);
    return index;
  }
  if (syntax.role === 'rangeStart') {
    flush(state);
    if (state.rangeStart) error(state, item, 'UNCLOSED_SYMBOL', 'A reading range is already open');
    state.rangeStart = { start: item.start };
    return index;
  }
  if (syntax.role === 'open') return applyPair(state, index);
  switch (syntax.owner) {
    case 'escape':
      error(state, item, 'UNCLOSED_SYMBOL', 'Escape must be followed by a grapheme');
      break;
    case 'reserved':
      error(
        state,
        item,
        'RESERVED_SYMBOL',
        `Quotation is not supported; use ＼${item.value} to write a body character`
      );
      break;
    case 'kutoten':
      applyPunctuation(state, item);
      break;
    case 'tateten':
      applyTateten(state, item);
      break;
    case 'soegana': {
      const kana = readKana(state.items, index + 1);
      attach(state, 'soegana', kana.value, { start: item.start, end: kana.end });
      return kana.next;
    }
  }
  return index;
}

function applyItem(state: BlockState, index: number): number {
  const item = state.items[index]!;
  if (item.type === 'newline') {
    if (state.options.features.linebreak) {
      flush(state);
      emit(
        state,
        {
          type: 'linebreak',
          position: { blockId: state.block.id, ...(state.lastId ? { after: state.lastId } : {}) },
        },
        item
      );
    }
    return index;
  }
  if (item.type === 'text' || (item.type === 'kana' && !state.options.features.okurigana)) {
    addToken(state, item.value, item);
    return index;
  }
  if (item.type === 'kana') {
    const kana = readKana(state.items, index);
    attach(state, 'okuri', kana.value, { start: item.start, end: kana.end });
    return kana.next;
  }
  return applySymbol(state, index);
}

function buildBlock(build: BuildState, source: SourceBlock, options: ResolvedOptions): void {
  const block: Block = { id: `b#${build.document.blocks.length + 1}`, tokenIds: [] };
  build.document.blocks.push(block);
  build.sourceMap.blocks.push(source);
  const state: BlockState = {
    build,
    block,
    source,
    options,
    items: scan(source, options),
    afterPunctuation: false,
  };
  for (let index = 0; index < state.items.length; index++) index = applyItem(state, index);
  flush(state);
  if (state.join)
    error(state, state.join, 'ORPHAN_ATTACHMENT', 'Tateten must be followed by a body token');
  finishTateten(state);
  if (state.rangeStart)
    error(
      state,
      { start: state.rangeStart.start, end: source.end },
      'UNCLOSED_SYMBOL',
      'Unclosed reading range'
    );
}

function orderMarks(state: BuildState): void {
  const indices = new Map(state.document.tokens.map((token, index) => [token.id, index]));
  const blockStarts = new Map<string, number>();
  let tokenCount = 0;
  for (const block of state.document.blocks) {
    blockStarts.set(block.id, tokenCount);
    tokenCount += block.tokenIds.length;
  }
  const ranks: Partial<Record<Mark['type'], number>> = {
    tateten: 0,
    saidoku: 1,
    yomigana: 2,
    okurigana: 3,
    soegana: 4,
  };
  const keyed = state.document.marks.map((mark, index) => {
    if ('anchor' in mark)
      return {
        mark,
        range: state.sourceMap.marks[index]!,
        start: (indices.get(mark.anchor.from) ?? 0) * 2,
        end: indices.get(mark.anchor.to) ?? 0,
        rank: ranks[mark.type] ?? 5,
        index,
      };
    const position = mark.position;
    const start =
      position.after === undefined
        ? (blockStarts.get(position.blockId) ?? 0) * 2 - 1
        : (indices.get(position.after) ?? 0) * 2 + 1;
    return { mark, range: state.sourceMap.marks[index]!, start, end: 0, rank: 0, index };
  });
  keyed.sort((a, b) => a.start - b.start || b.end - a.end || a.rank - b.rank || a.index - b.index);
  state.document.marks = keyed.map((entry, index) => ({ ...entry.mark, id: `m#${index + 1}` }));
  state.sourceMap.marks = keyed.map((entry) => entry.range);
}

export function build(
  source: string,
  options: ResolvedOptions,
  starts: readonly number[]
): BuiltDocument {
  const state: BuildState = {
    document: { format: 'skam@0.1', tokens: [], blocks: [], marks: [], readings: [] },
    sourceMap: { tokens: [], marks: [], blocks: [] },
    diagnostics: [],
    starts,
  };
  for (const block of sourceBlocks(source)) buildBlock(state, block, options);
  orderMarks(state);
  return { document: state.document, sourceMap: state.sourceMap, diagnostics: state.diagnostics };
}
