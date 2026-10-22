/**
 * buildAnnotationIR: Resolver 層
 *
 * SKAMDocument + AIRRenderProfile -> AIRDocument
 *
 * 全マーク解決を一箇所に集約し、HTML/Canvas 両レンダラーで共有する。
 * 各レンダラーは AIRDocument を受け取り、Adapter 層で自身の描画入力に変換する。
 *
 * ブロックの木は、次の 3 段で組む。
 * 1. 字ごとの注記 (`slots`) を決める (`resolveTokenSlots`)。
 * 2. 範囲の注記 (ruby、竪点、傍線) を区間にし、部分交差するものを断片に分けて置く (`placeIntervals`)。
 *    置いた区間の集まりは、どの 2 つも包含か離れている (入れ子)。
 * 3. 区間を包含で入れ子にして、字と竪点の区切りを置く (`buildBlockTree`)。
 */

import type {
  SKAMDocument,
  Token,
  Mark,
  KaeriMark,
  YomiganaMark,
  OkuriganaMark,
  SoeganaMark,
  KutotenMark,
  EmphasisMark,
  SaidokuMark,
  OkototenMark,
  HighlightMark,
  TatetenMark,
  RefMark,
} from '../index.js';

import {
  getJoinedPositions,
  getLinebreakPlacementIssues,
  selectDrawnReadings,
  type DrawnReading,
} from '../line-units.js';
import { SKAM_ML_MAX_RANGE_DEPTH } from '../skam-ml-content-model.js';
import { isValidEmphasisStyle } from '../validator.js';
import type { HiddenParts } from '../extensions/types.js';

import type {
  AIRRenderProfile,
  AIRDocument,
  AIRBlock,
  AIRBlockChild,
  AIRTokenNode,
  AIRTokenSlots,
  AIRRubyGroupNode,
  AIRTatetenGroupNode,
  AIRTatetenSeparator,
  AIRHighlightGroupNode,
  AIRBlockStartRef,
  AIRBlockStartKutoten,
  AIRHiddenSlot,
} from './air-types.js';

import { createMarkLookup, type MarkLookup, type TokenMarks } from './mark-lookup.js';
import { groupTokensByBlock } from './block-utils.js';
import { getBlockStartMarks } from './block-start.js';
import { splitKaeriForTateten, joinKaeriValues } from './kaeri.js';
import { resolveEmphasisCharacter } from './emphasis.js';
import { resolveRefValues } from './ref.js';
import { resolveOkototenCell } from './okototen.js';
import {
  createHiding,
  visibleTokenMarks,
  type Hiding,
  type RenderExtensionOptions,
} from './hiding.js';

// ============================================================================
// 描画の上限
// ============================================================================

/**
 * 1 ブロックに置く竪点と傍線の数の上限 (合わせて)。古事記の全巻 370 ブロックで最大 18 個なので、
 * 実際の文書には届かない。1 つの注記を置くごとに既に置いた断片を走査するので、計算量をここで抑える。
 */
const MAX_PLACED_ANNOTATIONS = 1024;

/** 1 つの注記の断片の数の上限。切り点が 8 個を超えて断片が 9 個になる注記は描かない */
const MAX_FRAGMENTS = 8;

/** 傍点の style が検証を通らないときの値 */
const DEFAULT_EMPHASIS_STYLE = 'filled dot';

/** 不可分単位を作る注記の種類。profile で描かない種類は、不可分単位にも数えない */
const UNIT_MARK_TYPES: ReadonlySet<Mark['type']> = new Set([
  'yomigana',
  'okurigana',
  'soegana',
  'tateten',
  'saidoku',
  'okimoji',
  'joji',
]);

// ============================================================================
// Token slot 解決
// ============================================================================

/**
 * 字の slots と隠す slot を決める。
 *
 * `tokenMarks` は、その字の slot に置く読みだけを yomigana / okurigana / soegana に持つ
 * (`slotMarksOf`)。範囲の読みは ruby のグループに描くので、字の slot の読みにも隠す slot にも入らない。
 */
// oxlint-disable-next-line eslint/complexity
function resolveTokenSlots(
  tokenMarks: TokenMarks,
  profile: AIRRenderProfile,
  hiding: Hiding | undefined
): { slots: AIRTokenSlots; hiddenSlots: AIRHiddenSlot[] } {
  const slots: AIRTokenSlots = {};
  // 隠す判定は、画面に出す注記 (profile で有効なもの) だけを見る
  const hidden: HiddenParts | undefined = hiding?.parts(visibleTokenMarks(tokenMarks, profile));

  if (profile.yomigana) {
    const yomiganaMarks = (tokenMarks.get('yomigana') ?? []) as YomiganaMark[];
    if (yomiganaMarks.length > 0) {
      slots.ruby = yomiganaMarks[0]!.value;
    }
  }

  if (profile.okurigana) {
    const okuriganaMarks = (tokenMarks.get('okurigana') ?? []) as OkuriganaMark[];
    if (okuriganaMarks.length > 0) {
      slots.okuri = okuriganaMarks[0]!.value;
    }
  }

  if (profile.soegana) {
    const soeganaMarks = (tokenMarks.get('soegana') ?? []) as SoeganaMark[];
    if (soeganaMarks.length > 0) {
      slots.soegana = soeganaMarks[0]!.value;
    }
  }

  if (profile.kaeriten) {
    const kaeriMarks = (tokenMarks.get('kaeri') ?? []) as KaeriMark[];
    const joined = joinKaeriValues(kaeriMarks);
    if (joined) {
      slots.kaeri = joined;
    }
  }

  if (profile.kutoten) {
    const kutotenMarks = (tokenMarks.get('kutoten') ?? []) as KutotenMark[];
    if (kutotenMarks.length > 0) {
      slots.kutoten = kutotenMarks.map((m) => m.value).join('');
      slots.kutotenValues = kutotenMarks.map((m) => m.value);
    }
  }

  if (profile.okimoji && tokenMarks.has('okimoji') && !hidden?.omitOkimoji) {
    slots.isOkimoji = true;
  }

  if (profile.joji && tokenMarks.has('joji') && !hidden?.omitJoji) {
    slots.isJoji = true;
  }

  if (profile.emphasis) {
    const emphasisMarks = (tokenMarks.get('emphasis') ?? []) as EmphasisMark[];
    if (emphasisMarks.length > 0) {
      const style: unknown = emphasisMarks[0]!.style;
      slots.emphasis = resolveEmphasisCharacter(style);
      slots.emphasisStyle =
        typeof style === 'string' && isValidEmphasisStyle(style) ? style : DEFAULT_EMPHASIS_STYLE;
    }
  }

  if (profile.okototen) {
    const okototenMarks = (tokenMarks.get('okototen') ?? []) as OkototenMark[];
    const cells = okototenMarks.flatMap((m) => {
      const cell = resolveOkototenCell(m);
      if (!cell) return [];
      return [hiding?.isHidden(m) ? { ...cell, hidden: true as const } : cell];
    });
    if (cells.length > 0) {
      slots.okototen = cells;
    }
  }

  if (profile.saidoku) {
    const saidokuMarks = (tokenMarks.get('saidoku') ?? []) as SaidokuMark[];
    if (saidokuMarks.length > 0) {
      const mark = saidokuMarks[0]!;
      const form0 = mark.forms[0];
      const form1 = mark.forms[1];
      slots.saidoku = {
        forms: mark.forms.map((form, index) => ({
          n: Number.isSafeInteger(form.n) && form.n! > 0 ? form.n! : index + 1,
          ...(profile.yomigana && form.yomi ? { yomi: form.yomi } : {}),
          ...(profile.okurigana && form.okuri ? { okuri: form.okuri } : {}),
        })),
      };
      if (form0?.yomi) {
        slots.ruby = form0.yomi;
      }
      if (form0?.okuri) {
        slots.okuri = form0.okuri;
      }
      if (form1?.yomi) {
        slots.saidokuUnder = form1.yomi;
      }
      if (form1?.okuri) {
        slots.saidokuOkuri2 = form1.okuri;
      }
    }
  }

  return { slots, hiddenSlots: hidden?.slots ? [...hidden.slots] : [] };
}

const READING_TYPES: readonly Mark['type'][] = ['yomigana', 'okurigana', 'soegana'];

/**
 * 字に付く注記のうち、読みを「その字の slot に置く読み」だけにしたもの。
 * 引き当て (`createMarkLookup`) は yomigana を範囲の最初の字に、okurigana と soegana を最後の字に付け、
 * 描かない読み (重なる後の読み) も含む。ここでは、描く読みのうち slot に置くもの (1 字の yomigana、
 * 範囲の最後の字の okurigana と soegana) に差し替える。
 */
function slotMarksOf(base: TokenMarks, own: readonly Mark[] | undefined): TokenMarks {
  if (own === undefined && !READING_TYPES.some((type) => base.has(type))) return base;
  const view = new Map(base);
  for (const type of READING_TYPES) view.delete(type);
  for (const mark of own ?? []) view.set(mark.type, [mark]);
  return view;
}

// ============================================================================
// 区間の置き方 (2 段の 1 段目)
// ============================================================================

type IntervalKind = 'highlight' | 'tateten' | 'ruby';

/**
 * 範囲が同じ区間の入れ子の順 (外から)。傍線、竪点、ruby の順。
 * 同じ種類どうしは置いた順 (`seq`。marks[] の順) で外から。
 */
const KIND_RANK: Readonly<Record<IntervalKind, number>> = { highlight: 0, tateten: 1, ruby: 2 };

/** ブロックの字の並びでの位置 (両端を含む) を持つ、置いた区間 */
interface Interval {
  kind: IntervalKind;
  start: number;
  end: number;
  /** 置いた順。同じ注記の断片は同じ値 */
  seq: number;
  /** この区間から内側へたどる入れ子の最長の長さ (自分を含む) */
  height: number;
  /** 注記の断片の番号と数。ruby は 0 と 1 */
  fragmentIndex: number;
  fragmentCount: number;
  ruby?: DrawnReading;
  mark?: TatetenMark | HighlightMark;
}

interface RangeCandidate<M extends TatetenMark | HighlightMark> {
  mark: M;
  start: number;
  end: number;
}

interface Placement {
  /** 始まりの昇順。互いに重ならない */
  rubies: Interval[];
  fragments: Interval[];
  annotations: number;
  nextSeq: number;
  /** 置けた竪点の、元の範囲 */
  tatetenRanges: { start: number; end: number; hidden: boolean }[];
}

type Relation = 'outer' | 'inner' | 'apart' | 'crossing';

/**
 * p が f の外側か内側か。範囲が同じときは、種類 (傍線、竪点、ruby) と置いた順で外を決める。
 * 部分交差 (crossing) は、断片に分けた後は起きない。
 */
function relationOf(p: Interval, f: Interval): Relation {
  if (p.end < f.start || f.end < p.start) return 'apart';
  const pHoldsF = p.start <= f.start && f.end <= p.end;
  const fHoldsP = f.start <= p.start && p.end <= f.end;
  if (pHoldsF && fHoldsP) {
    const order = KIND_RANK[p.kind] - KIND_RANK[f.kind] || p.seq - f.seq;
    return order < 0 ? 'outer' : 'inner';
  }
  if (pHoldsF) return 'outer';
  if (fHoldsP) return 'inner';
  return 'crossing';
}

/** ruby (始まりの昇順で互いに重ならない) のうち、位置 position を含むもの */
function rubyContaining(rubies: readonly Interval[], position: number): Interval | undefined {
  let low = 0;
  let high = rubies.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (rubies[mid]!.start <= position) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  const candidate = found === -1 ? undefined : rubies[found];
  return candidate !== undefined && position <= candidate.end ? candidate : undefined;
}

/** ruby のうち、始まりが position 以上である最初の添字 */
function firstRubyStartingAtOrAfter(rubies: readonly Interval[], position: number): number {
  let low = 0;
  let high = rubies.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (rubies[mid]!.start < position) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * [start, end] を、置いた区間のうち部分交差するものの境界で切る点 (断片の最後の位置) を返す。
 * 切り点が MAX_FRAGMENTS 個になる (断片が 9 個になる) ときは undefined。
 *
 * 部分交差する区間は、新しい区間の端を含む。ruby は互いに重ならないので、両端を含む ruby だけを見る。
 * 竪点と傍線の断片は、置いた分を順に見る (切り点が上限に達したら見るのをやめる)。
 */
function collectCuts(placement: Placement, start: number, end: number): number[] | undefined {
  const cuts = new Set<number>();
  const visit = (p: Interval): void => {
    if (p.start < start && start <= p.end && p.end < end) cuts.add(p.end);
    else if (start < p.start && p.start <= end && end < p.end) cuts.add(p.start - 1);
  };
  for (const position of [start, end]) {
    const ruby = rubyContaining(placement.rubies, position);
    if (ruby) visit(ruby);
  }
  for (const p of placement.fragments) {
    if (cuts.size >= MAX_FRAGMENTS) return undefined;
    visit(p);
  }
  if (cuts.size >= MAX_FRAGMENTS) return undefined;
  return [...cuts].sort((a, b) => a - b);
}

/** 断片 f を含む区間 (外側) と、f の内側の入れ子の最長の長さ */
function measureNesting(placement: Placement, f: Interval): { outers: Interval[]; inner: number } {
  const outers: Interval[] = [];
  let inner = 0;
  const visit = (p: Interval): void => {
    const relation = relationOf(p, f);
    if (relation === 'outer') outers.push(p);
    else if (relation === 'inner') inner = Math.max(inner, p.height);
  };
  const enclosing = rubyContaining(placement.rubies, f.start);
  if (enclosing) visit(enclosing);
  for (
    let i = firstRubyStartingAtOrAfter(placement.rubies, f.start);
    i < placement.rubies.length;
    i++
  ) {
    const ruby = placement.rubies[i]!;
    if (ruby.start > f.end) break;
    if (ruby !== enclosing) visit(ruby);
  }
  for (const p of placement.fragments) visit(p);
  return { outers, inner };
}

/** 外側から内側の順 (範囲の広い順。範囲が同じときは種類と置いた順) */
function compareOuterFirst(a: Interval, b: Interval): number {
  return (
    b.end - b.start - (a.end - a.start) || KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.seq - b.seq
  );
}

/**
 * 竪点か傍線 1 つを置く。置けなければ (上限、断片の数、入れ子の深さ) false。置かなかった注記は、
 * ほかの注記の切り点にならない (切るのは新しく置く側だけ)。
 *
 * 入れ子の深さは、新しい断片を通る入れ子の最長の長さ (外側の区間の数 + 1 + 内側の最長) が
 * SKAM_ML_MAX_RANGE_DEPTH (ruby のグループも数える) 以下であること。内側の最長まで数えるのは、
 * 竪点を先に置いた後で、それを含む傍線を置くことがあるため。
 */
function placeAnnotation(
  placement: Placement,
  kind: 'tateten' | 'highlight',
  candidate: RangeCandidate<TatetenMark | HighlightMark>
): Interval[] | undefined {
  if (placement.annotations >= MAX_PLACED_ANNOTATIONS) return undefined;
  const cuts = collectCuts(placement, candidate.start, candidate.end);
  if (!cuts) return undefined;

  const seq = placement.nextSeq;
  const fragments: Interval[] = [];
  let from = candidate.start;
  for (const last of [...cuts, candidate.end]) {
    fragments.push({
      kind,
      start: from,
      end: last,
      seq,
      height: 1,
      fragmentIndex: fragments.length,
      fragmentCount: cuts.length + 1,
      mark: candidate.mark,
    });
    from = last + 1;
  }

  const measured = fragments.map((f) => measureNesting(placement, f));
  if (measured.some(({ outers, inner }) => outers.length + 1 + inner > SKAM_ML_MAX_RANGE_DEPTH)) {
    return undefined;
  }

  fragments.forEach((fragment, i) => {
    const { outers, inner } = measured[i]!;
    fragment.height = 1 + inner;
    outers.sort(compareOuterFirst);
    outers.forEach((outer, j) => {
      outer.height = Math.max(outer.height, outers.length - j + fragment.height);
    });
    placement.fragments.push(fragment);
  });
  placement.annotations++;
  placement.nextSeq++;
  return fragments;
}

/** ブロックの字の並びに収まる、始まりが終わりより後でない範囲の注記。置く順 (始まりの昇順、終わりの降順、marks[] の順) */
function collectRangeCandidates<M extends TatetenMark | HighlightMark>(
  marks: readonly Mark[],
  type: M['type'],
  positions: ReadonlyMap<string, number>
): RangeCandidate<M>[] {
  const found: (RangeCandidate<M> & { order: number })[] = [];
  marks.forEach((mark, order) => {
    if (mark.type !== type) return;
    const range = (mark as M).anchor;
    const start = positions.get(range.from);
    const end = positions.get(range.to);
    if (start === undefined || end === undefined || start > end) return;
    found.push({ mark: mark as M, start, end, order });
  });
  found.sort((a, b) => a.start - b.start || b.end - a.end || a.order - b.order);
  return found;
}

/**
 * ブロックの範囲の注記を区間にして置く。ruby (2 字以上の yomigana)、竪点、傍線の順に置く。
 * 竪点と傍線は、合わせて MAX_PLACED_ANNOTATIONS 個までで、竪点が先。
 */
function placeIntervals(
  marks: readonly Mark[],
  positions: ReadonlyMap<string, number>,
  rubyReadings: readonly DrawnReading[],
  profile: AIRRenderProfile,
  hiding: Hiding | undefined
): { intervals: Interval[]; tatetenRanges: Placement['tatetenRanges'] } {
  const placement: Placement = {
    rubies: rubyReadings.map((reading, seq) => ({
      kind: 'ruby',
      start: reading.from,
      end: reading.to,
      seq,
      height: 1,
      fragmentIndex: 0,
      fragmentCount: 1,
      ruby: reading,
    })),
    fragments: [],
    annotations: 0,
    nextSeq: rubyReadings.length,
    tatetenRanges: [],
  };
  placement.rubies.sort((a, b) => a.start - b.start);

  if (profile.tateten) {
    for (const candidate of collectRangeCandidates<TatetenMark>(marks, 'tateten', positions)) {
      if (placeAnnotation(placement, 'tateten', candidate)) {
        placement.tatetenRanges.push({
          start: candidate.start,
          end: candidate.end,
          hidden: hiding?.isHidden(candidate.mark) === true,
        });
      }
    }
  }
  if (profile.highlight) {
    for (const candidate of collectRangeCandidates<HighlightMark>(marks, 'highlight', positions)) {
      placeAnnotation(placement, 'highlight', candidate);
    }
  }
  return {
    intervals: [...placement.rubies, ...placement.fragments],
    tatetenRanges: placement.tatetenRanges,
  };
}

// ============================================================================
// ブロックの木 (2 段の 2 段目)
// ============================================================================

type TreeChild =
  | AIRTokenNode
  | AIRTatetenSeparator
  | AIRRubyGroupNode
  | AIRTatetenGroupNode
  | AIRHighlightGroupNode;

interface OpenInterval {
  interval: Interval;
  node: AIRRubyGroupNode | AIRTatetenGroupNode | AIRHighlightGroupNode;
  children: TreeChild[];
}

interface TreeContext {
  tokenNodes: AIRTokenNode[];
  /** 字の後ろで行を改める字の id (置ける linebreak のもの) */
  lineBreakAfter: ReadonlySet<string> | undefined;
  hiding: Hiding | undefined;
  /** 傍線の id → 解決済みラベル */
  refLabelOf: (mark: HighlightMark) => string | undefined;
}

/** 外から (始まりの昇順、終わりの降順、傍線・竪点・ruby の順、置いた順) */
function compareTreeOrder(a: Interval, b: Interval): number {
  return (
    a.start - b.start || b.end - a.end || KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.seq - b.seq
  );
}

function openNode(interval: Interval, context: TreeContext): OpenInterval {
  const continuity = {
    ...(interval.fragmentIndex > 0 ? { continuesBefore: true as const } : {}),
    ...(interval.fragmentIndex < interval.fragmentCount - 1
      ? { continuesAfter: true as const }
      : {}),
  };
  if (interval.kind === 'ruby') {
    const { mark, from, to } = interval.ruby!;
    const reading = mark as YomiganaMark;
    const node: AIRRubyGroupNode = {
      type: 'ruby-group',
      yomigana: {
        value: reading.value,
        ...(context.hiding?.isHidden(reading) ? { hidden: true as const } : {}),
      },
      fromTokenId: context.tokenNodes[from]!.token.id,
      toTokenId: context.tokenNodes[to]!.token.id,
      span: to - from + 1,
      children: [],
    };
    return { interval, node, children: node.children };
  }
  if (interval.kind === 'tateten') {
    const tatetenMark = interval.mark as TatetenMark;
    const node: AIRTatetenGroupNode = {
      type: 'tateten-group',
      tatetenMark,
      children: [],
      ...continuity,
      ...(context.hiding?.isHidden(tatetenMark) ? { hidden: true as const } : {}),
    };
    return { interval, node, children: node.children };
  }
  const highlightMark = interval.mark as HighlightMark;
  const refLabel =
    interval.fragmentIndex === interval.fragmentCount - 1
      ? context.refLabelOf(highlightMark)
      : undefined;
  const node: AIRHighlightGroupNode = {
    type: 'highlight-group',
    highlightMark,
    highlightStyle: highlightMark.style ?? 'solid',
    ...(refLabel !== undefined ? { refLabel } : {}),
    children: [],
    ...continuity,
    hasKana: false,
    hasEmphasis: false,
  };
  return { interval, node, children: node.children };
}

/**
 * 区間を包含で入れ子にして、字と竪点の区切りを置く。
 *
 * 字の順に歩き、字の前で始まる区間を外から開き、字を最も内側の区間に入れ、字の後ろで終わる区間を閉じる。
 * 隣り合う 2 字の間に、置いた竪点が両方を含むなら区切りを 1 つ置く。置き場は、閉じた後の最も内側の
 * 区間 (2 字をともに含む最も内側のノード) の子で、竪点が何本重なっても 1 つ。
 */
function buildBlockTree(
  intervals: readonly Interval[],
  tatetenRanges: Placement['tatetenRanges'],
  context: TreeContext
): { children: AIRBlockChild[]; separators: (AIRTatetenSeparator | undefined)[] } {
  const { tokenNodes } = context;
  const size = tokenNodes.length;
  const startsAt: Interval[][] = Array.from({ length: size }, () => []);
  for (const interval of [...intervals].sort(compareTreeOrder))
    startsAt[interval.start]!.push(interval);

  // 字 i と i+1 の間を含む竪点の数と、隠していない竪点の数
  const covering = Array.from({ length: size }, () => 0);
  const visible = Array.from({ length: size }, () => 0);
  for (const range of tatetenRanges) {
    for (let gap = range.start; gap < range.end; gap++) {
      covering[gap]!++;
      if (!range.hidden) visible[gap]!++;
    }
  }

  const root: TreeChild[] = [];
  const open: OpenInterval[] = [];
  const separators: (AIRTatetenSeparator | undefined)[] = Array.from(
    { length: size },
    () => undefined
  );
  const container = (): TreeChild[] => open[open.length - 1]?.children ?? root;

  tokenNodes.forEach((tokenNode, i) => {
    for (const interval of startsAt[i]!) {
      const opened = openNode(interval, context);
      container().push(opened.node);
      open.push(opened);
    }
    container().push(tokenNode);

    // 字 i で終わる区間を閉じる。改行は、ruby か竪点のうち最も外側の閉じたものに付ける。
    // 傍線は付ける先にしない (傍線の最後の字の後ろの改行は、傍線の中の字かグループに付く)
    let outermost: AIRRubyGroupNode | AIRTatetenGroupNode | undefined;
    while (open.length > 0 && open[open.length - 1]!.interval.end <= i) {
      const closed = open.pop()!;
      if (closed.node.type !== 'highlight-group') outermost = closed.node;
    }
    if (context.lineBreakAfter?.has(tokenNode.token.id))
      (outermost ?? tokenNode).lineBreakAfter = true;

    if (i + 1 < size && covering[i]! > 0) {
      const separator: AIRTatetenSeparator = {
        type: 'tateten-separator',
        ...(visible[i] === 0 ? { hidden: true as const } : {}),
      };
      separators[i] = separator;
      container().push(separator);
    }
  });

  return { children: root as AIRBlockChild[], separators };
}

/**
 * 竪点の区切りに移す返り点 (レ以外) を決める。
 * その字の直後の区切りがあればそこに、無ければその字の直前の区切り (その字を最後の字とする竪点の区切り) に置く。
 * 区切りが無い (1 字の竪点) か、区切りが先に別の字の返り点で埋まっているときは、字の slot に残す。
 * レ点は字の slot に残す。
 */
function moveKaeriToSeparators(
  tokenNodes: readonly AIRTokenNode[],
  separators: readonly (AIRTatetenSeparator | undefined)[],
  lookupMarks: MarkLookup,
  hiding: Hiding | undefined
): void {
  tokenNodes.forEach((tokenNode, i) => {
    const value = tokenNode.slots.kaeri;
    if (!value) return;
    const { re, nonRe } = splitKaeriForTateten(value);
    if (!nonRe) return;
    const separator = separators[i] ?? (i > 0 ? separators[i - 1] : undefined);
    if (!separator || separator.kaeri !== undefined) return;

    separator.kaeri = nonRe;
    // 同じ位置の kaeri のどれかを隠すなら、区切りの kaeri も隠す
    const kaeriMarks = lookupMarks(tokenNode.token.id).get('kaeri') ?? [];
    if (kaeriMarks.some((m) => hiding?.isHidden(m))) separator.kaeriHidden = true;
    if (re) {
      tokenNode.slots = { ...tokenNode.slots, kaeri: re };
    } else {
      const { kaeri: _removed, ...restSlots } = tokenNode.slots;
      tokenNode.slots = restSlots;
    }
  });
}

/** 傍線の断片ごとに、中にかなと傍点があるかを決める。断片の中の字の slot と ruby のグループから決める */
function resolveHighlightFlags(children: readonly TreeChild[]): {
  kana: boolean;
  emphasis: boolean;
} {
  let kana = false;
  let emphasis = false;
  for (const child of children) {
    if (child.type === 'tateten-separator') continue;
    if (child.type === 'token') {
      kana ||= !!(child.slots.ruby || child.slots.okuri || child.slots.soegana);
      emphasis ||= !!child.slots.emphasis;
      continue;
    }
    const inner = resolveHighlightFlags(child.children);
    kana ||= inner.kana || child.type === 'ruby-group';
    emphasis ||= inner.emphasis;
    if (child.type === 'highlight-group') {
      child.hasKana = inner.kana;
      child.hasEmphasis = inner.emphasis;
    }
  }
  return { kana, emphasis };
}

// ============================================================================
// Block-start marks 解決
// ============================================================================

function resolveBlockStartMarks(
  blockId: string,
  marks: Mark[],
  profile: AIRRenderProfile,
  refValueMap: Map<RefMark, string>,
  highlightRefIds: Set<string>,
  hiding: Hiding | undefined
): { blockStartRefs: AIRBlockStartRef[]; blockStartKutoten: AIRBlockStartKutoten[] } {
  const blockStartMarks = getBlockStartMarks(blockId, marks);
  const blockStartRefs: AIRBlockStartRef[] = [];
  const blockStartKutoten: AIRBlockStartKutoten[] = [];

  if (blockStartMarks.refs.length > 0 && profile.ref) {
    for (const refMark of blockStartMarks.refs) {
      if (highlightRefIds.has(refMark.id ?? '')) continue;
      const refText = refValueMap.get(refMark) ?? '';
      if (refText) {
        blockStartRefs.push({
          ...(refMark.id ? { refId: refMark.id } : {}),
          resolved: refText,
        });
      }
    }
  }

  if (blockStartMarks.kutotenMarks.length > 0 && profile.kutoten) {
    for (const kutotenMark of blockStartMarks.kutotenMarks) {
      blockStartKutoten.push({
        value: kutotenMark.value,
        ...(hiding?.isHidden(kutotenMark) ? { hidden: true as const } : {}),
      });
    }
  }

  return { blockStartRefs, blockStartKutoten };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * SKAMDocument + Profile -> AIRDocument
 *
 * 全マーク解決を一箇所に集約する Resolver 層のエントリーポイント。
 */
export function buildAnnotationIR(
  doc: SKAMDocument,
  profile: AIRRenderProfile,
  options?: RenderExtensionOptions
): AIRDocument {
  const { tokens, marks, blocks } = doc;
  const hiding = createHiding(doc, options);

  const blockGroups = groupTokensByBlock(blocks ?? [], tokens);

  // ref 解決
  const allTokensOrdered = blockGroups.flatMap((g) => g.tokens);
  // 字ごとの注記の引き当ては、描画する字の列から作った索引 1 つで済ませる
  const lookupMarks = createMarkLookup(
    marks,
    blockGroups.map((g) => g.tokens)
  );
  const refValueMap = profile.ref
    ? resolveRefValues(allTokensOrdered, marks)
    : new Map<RefMark, string>();

  // ref mark を ID で引けるマップ
  const refMarkById = new Map<string, RefMark>();
  for (const refMark of refValueMap.keys()) {
    if (refMark.id) {
      refMarkById.set(refMark.id, refMark);
    }
  }

  // highlight が参照する ref mark ID
  const highlightRefIds = new Set<string>();
  if (profile.highlight) {
    for (const mark of marks) {
      if (mark.type === 'highlight' && (mark as HighlightMark).ref) {
        highlightRefIds.add((mark as HighlightMark).ref!);
      }
    }
  }

  const refMarks = profile.ref ? marks.filter((m): m is RefMark => m.type === 'ref') : [];

  const refLabelOf = (mark: HighlightMark): string | undefined => {
    if (!profile.ref || !mark.ref) return undefined;
    const refMark = refMarkById.get(mark.ref);
    return refMark ? refValueMap.get(refMark) : undefined;
  };

  // 改行は置ける場所のものだけを使う。置けない場所の linebreak は描画では無視する
  const lineBreakAfterByBlock = profile.linebreak
    ? collectLineBreakAfter(doc)
    : new Map<string, Set<string>>();

  // 不可分単位は、画面に出す種類の注記だけで決める
  const unitMarks = marks.filter(
    (mark) => !UNIT_MARK_TYPES.has(mark.type) || profile[mark.type as keyof AIRRenderProfile]
  );

  const airBlocks: AIRBlock[] = blockGroups.map((group) => {
    const positions = buildPositionMap(group.tokens);
    const joined = getJoinedPositions(unitMarks, positions, group.tokens.length);

    // 描く読みを選ぶ。2 字以上の yomigana は ruby のグループ、それ以外は字の slot に置く
    const rubyReadings: DrawnReading[] = [];
    const slotMarks = new Map<number, Mark[]>();
    for (const reading of selectDrawnReadings(marks, positions)) {
      const { mark } = reading;
      if (!profile[mark.type as 'yomigana' | 'okurigana' | 'soegana']) continue;
      if (mark.type === 'yomigana' && reading.from < reading.to) {
        rubyReadings.push(reading);
        continue;
      }
      // yomigana は 1 字なので、okurigana と soegana は範囲の最後の字に置く
      const slotPosition = mark.type === 'yomigana' ? reading.from : reading.to;
      const list = slotMarks.get(slotPosition);
      if (list) list.push(mark);
      else slotMarks.set(slotPosition, [mark]);
    }

    const tokenNodes: AIRTokenNode[] = group.tokens.map((token, position) => {
      const tokenMarks = slotMarksOf(lookupMarks(token.id), slotMarks.get(position));
      const { slots, hiddenSlots } = resolveTokenSlots(tokenMarks, profile, hiding);
      const node: AIRTokenNode = { type: 'token' as const, token, slots };
      if (hiddenSlots.length > 0) node.hiddenSlots = hiddenSlots;
      if (joined[position]) node.joinedWithNext = true;
      return node;
    });

    // ref 解決: position-based ref marks をトークンスロットに配置
    if (profile.ref) {
      for (const tokenNode of tokenNodes) {
        const tokenId = tokenNode.token.id;
        for (const ref of refMarks) {
          if (ref.position.blockId !== group.blockId) continue;
          if (ref.position.after !== tokenId) continue;
          if (ref.id && highlightRefIds.has(ref.id)) continue;
          const label = refValueMap.get(ref);
          if (label) {
            tokenNode.slots = {
              ...tokenNode.slots,
              ref: label,
              refLabels: [...(tokenNode.slots.refLabels ?? []), label],
            };
          }
        }
      }
    }

    const { intervals, tatetenRanges } = placeIntervals(
      marks,
      positions,
      rubyReadings,
      profile,
      hiding
    );
    const { children, separators } = buildBlockTree(intervals, tatetenRanges, {
      tokenNodes,
      lineBreakAfter: lineBreakAfterByBlock.get(group.blockId),
      hiding,
      refLabelOf,
    });
    if (profile.kaeriten) moveKaeriToSeparators(tokenNodes, separators, lookupMarks, hiding);
    resolveHighlightFlags(children);

    // Block-start marks 解決
    const { blockStartRefs, blockStartKutoten } = resolveBlockStartMarks(
      group.blockId,
      marks,
      profile,
      refValueMap,
      highlightRefIds,
      hiding
    );

    return {
      blockId: group.blockId,
      children,
      blockStartRefs,
      blockStartKutoten,
    };
  });

  return { blocks: airBlocks };
}

// ============================================================================
// ヘルパー
// ============================================================================

/** 字の id から、ブロックの字の並びでの位置を引く表。同じ id が複数あるときは最初の位置を使う */
function buildPositionMap(tokens: readonly Token[]): Map<string, number> {
  const positions = new Map<string, number>();
  tokens.forEach((token, index) => {
    if (!positions.has(token.id)) positions.set(token.id, index);
  });
  return positions;
}

/** 置ける linebreak の、ブロックごとの「この字の後ろで改める」字の id の集合 */
function collectLineBreakAfter(doc: SKAMDocument): Map<string, Set<string>> {
  const issues = getLinebreakPlacementIssues(doc);
  const result = new Map<string, Set<string>>();
  doc.marks.forEach((mark, index) => {
    if (mark.type !== 'linebreak' || issues.has(index)) return;
    const { blockId, after } = mark.position;
    if (after === undefined) return;
    let ids = result.get(blockId);
    if (!ids) {
      ids = new Set();
      result.set(blockId, ids);
    }
    ids.add(after);
  });
  return result;
}
