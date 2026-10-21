/**
 * SKAM-ML/XML Stringify
 *
 * SKAMDocument → SKAM-ML/XML 変換
 *
 * 対応するmark種別（v0.1）:
 * - kaeri（返り点）
 * - okurigana（送り仮名）
 * - yomigana（読み仮名）
 * - soegana（添え仮名）
 * - kutoten（句読点）
 * - linebreak（改行）
 * - okimoji（置字）
 * - joji（助字）
 * - okototen（ヲコト点）
 * - saidoku（再読文字）
 * - emphasis（傍点）
 * - tateten（たて点）
 * - highlight（傍線）
 * - ref（参照）
 */

import type {
  SKAMDocument,
  Token,
  Mark,
  Position,
  KaeriMark,
  OkuriganaMark,
  YomiganaMark,
  SoeganaMark,
  KutotenMark,
  LinebreakMark,
  OkimojiMark,
  JojiMark,
  OkototenMark,
  SaidokuMark,
  EmphasisMark,
  HighlightMark,
  RefMark,
  TatetenMark,
} from '@kanbun-skam/skam';
import { isAnchorBasedMark, KAERI } from '@kanbun-skam/skam';
import {
  LossCollector,
  SKAMXMLStringifyError,
  type LossSortKey,
  type StringifyLoss,
} from './losses.js';

// ============================================================================
// Constants
// ============================================================================

const SKAM_NS = 'urn:skam:1';

/**
 * SKAM-ML-draft §7.0 の内容モデル表のうち、子に制約がある行を字句どおりに転記したもの。
 * キーのない親 (block / span / tateten) は子の制約なし。saidoku は base/kunform の構造として個別に検査する。
 * キー base は「saidoku の中の skam:base」を表す。
 * @experimental 仕様の改訂に合わせて変わる。0.x の間は minor で変わりうる。同じ fixed group の同じ版どうしでのみ一致を保証する。
 */
export const SKAM_ML_CONTENT_MODEL: Readonly<
  Record<
    'yomigana' | 'okimoji' | 'joji' | 'okototen' | 'base' | 'kun' | 'soegana',
    readonly string[]
  >
> = {
  yomigana: ['#text', 'kun'],
  okimoji: ['#text', 'kun', 'okimoji', 'joji', 'okototen'],
  joji: ['#text', 'kun', 'okimoji', 'joji', 'okototen'],
  okototen: ['#text', 'kun', 'okimoji', 'joji', 'okototen'],
  base: ['#text', 'kun', 'okimoji', 'joji', 'okototen'],
  kun: ['#text'],
  soegana: ['#text'],
};

/** @experimental SKAM-ML-draft §7.0 の入れ子順 (外側から)。同じ範囲の要素どうしの並びを決める */
export const SKAM_ML_NESTING_ORDER = [
  'span',
  'tateten',
  'saidoku',
  'okimoji',
  'joji',
  'okototen',
  'yomigana',
  'kun',
] as const;

type ContentModelKey = keyof typeof SKAM_ML_CONTENT_MODEL;

/** 入れ子順の順位。span / tateten は同順位 (0) */
function nestingRank(name: string): number {
  if (name === 'tateten') return 0;
  const index = (SKAM_ML_NESTING_ORDER as readonly string[]).indexOf(name);
  return index === -1 ? SKAM_ML_NESTING_ORDER.length : index;
}

/** Mark または合成マークの type を、入れ子順の要素名へ対応づける */
function nestingNameOf(type: string): string {
  switch (type) {
    case '__kun_range':
      return 'kun';
    case '__yomigana_range':
      return 'yomigana';
    case 'emphasis':
    case 'highlight':
      return 'span';
    default:
      return type;
  }
}

// 返り点の value → kind 逆マッピング
const KAERI_KIND_MAP: Record<string, string> = {
  [KAERI.RE]: 're',
  [KAERI.ICHI]: 'ichi',
  [KAERI.NI]: 'ni',
  [KAERI.SAN]: 'san',
  [KAERI.SHI]: 'shi',
  [KAERI.JO]: 'jo',
  [KAERI.CHU]: 'chu',
  [KAERI.GE]: 'ge',
  [KAERI.KO]: 'ko',
  [KAERI.OTSU]: 'otsu',
  [KAERI.HEI]: 'hei',
  [KAERI.TEI]: 'tei',
  [KAERI.TEN]: 'ten',
  [KAERI.CHI]: 'chi',
  [KAERI.JIN]: 'jin',
};

// ============================================================================
// Types
// ============================================================================

export interface StringifyOptions {
  /** Indentation size (default: 2) */
  indent?: number;
  /** Include XML declaration (default: true) */
  xmlDeclaration?: boolean;
  /**
   * Drop what SKAM-ML cannot represent instead of throwing (default: false).
   * With `lossy: true` the return value is the XML only; `onLoss` is the sole way to learn what was dropped.
   */
  lossy?: boolean;
  /** Called synchronously, once per loss in document order, only when `lossy` is true. Exceptions propagate. */
  onLoss?: (loss: StringifyLoss) => void;
}

/** Per-call state threaded through the conversion so losses are recorded where output is dropped */
interface StringifyContext {
  collector: LossCollector;
  /** Mark → index in doc.marks (for JSON Pointer paths) */
  markIndexMap: Map<Mark, number>;
  /** Token ID → block index and index within that block (for sort keys) */
  tokenPosition: Map<string, { blockIndex: number; tokenIndex: number }>;
  /** Block ID → block index (for position marks at a block start) */
  blockIndexById: Map<string, number>;
}

const UNPLACED = Number.MAX_SAFE_INTEGER;

/** SKAM-ML §6.2 が無視する空白 (U+0009 / U+000A / U+0020) と U+000D だけからなる文字列 */
const IGNORED_WHITESPACE_ONLY = /^[\t\n\r ]+$/;
function isIgnoredWhitespaceText(text: string): boolean {
  return IGNORED_WHITESPACE_ONLY.test(text);
}

// Token に付随する mark 情報（単一トークン用）
interface TokenAnnotation {
  /** 読み仮名 */
  yomi?: string;
  /** 送り仮名 */
  okuri?: string;
  /** 添え仮名 */
  soe?: string;
  /** 直後に配置する返り点 */
  kaeriAfter?: KaeriMark[];
  /** 直後に配置する句読点 */
  kutotenAfter?: KutotenMark[];
  /** 直後に配置する ref（空要素） */
  refAfter?: RefMark[];
  /** 直後に配置する改行（空要素） */
  linebreakAfter?: LinebreakMark[];
  /** 包囲要素（単一トークン用） */
  wrappers?: SingleTokenWrapper[];
}

// 単一トークンを包む要素
type SingleTokenWrapper =
  | { type: 'okimoji'; mark: OkimojiMark }
  | { type: 'joji'; mark: JojiMark }
  | { type: 'okototen'; mark: OkototenMark }
  | { type: 'saidoku'; mark: SaidokuMark };

// 複数トークンにまたがるkun属性をまとめた合成マーク（stringify内部用）
interface KunRangeSyntheticMark {
  /**
   * `__yomigana_range`: 読みだけを持つ範囲の内側に kun (単字または範囲) がある場合の `<skam:yomigana>` ラッパー。
   * kun は kun を子に持てない (§7.0) ので、別の要素で出力する
   */
  type: '__kun_range' | '__yomigana_range';
  yomi?: string;
  okuri?: string;
  soe?: string;
  anchor: { from: string; to: string };
  /** 合成元の mark。欠落を元の mark ごとに報告するために保持する */
  sources: Mark[];
}

// 範囲マーク情報
// mark は SKAM Mark または stringify 内部の合成マーク
interface RangeMark {
  mark: Mark | KunRangeSyntheticMark;
  startIndex: number;
  endIndex: number;
}

// コンテンツノード（木構造用）
type ContentNode = TextNode | ElementNode;

interface TextNode {
  type: 'text';
  tokenId: string;
  text: string;
  annotation: TokenAnnotation;
}

interface ElementNode {
  type: 'element';
  mark: Mark | KunRangeSyntheticMark;
  children: ContentNode[];
}

// ============================================================================
// Helper Functions
// ============================================================================

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function indentStr(level: number, size: number): string {
  return ' '.repeat(level * size);
}

/**
 * 返り点の value を kind に変換
 */
function kaeriValueToKind(value: string): string {
  // 複合返り点（例: 一レ → ichi-re）への対応
  // まずは単純なマッピングを試す
  const kind = KAERI_KIND_MAP[value];
  if (kind) {
    return kind;
  }

  // 複合返り点の場合、各文字を変換して連結
  const parts: string[] = [];
  for (const char of value) {
    const k = KAERI_KIND_MAP[char];
    if (k) {
      parts.push(k);
    }
  }

  if (parts.length > 0) {
    return parts.join('-');
  }

  // 不明な場合はそのまま返す
  return value;
}

// ============================================================================
// Annotation Collection
// ============================================================================

/** Get the token ID that a position-based mark should be attached to (for 'after' position) */
function getPositionAfterTokenId(position: Position): string | undefined {
  if ('after' in position && position.after) {
    return position.after;
  }
  return undefined;
}

/** ブロック先頭に置く position mark。kaeri は先頭に置けない (K3) ので持たない */
interface BlockStartMarks {
  kutotenAfter?: KutotenMark[];
  refAfter?: RefMark[];
}

/** Position-based mark (kaeri/kutoten/ref/linebreak) を annotation またはブロック先頭に追加 */
function applyPositionBasedMark(
  mark: Mark,
  annotations: Map<string, TokenAnnotation>,
  blockStart: Map<string, BlockStartMarks>,
  ctx: StringifyContext
): void {
  const positionMark = mark as KaeriMark | KutotenMark | RefMark | LinebreakMark;
  const tokenId = getPositionAfterTokenId(positionMark.position);

  if (!tokenId) {
    applyBlockStartMark(positionMark, blockStart, ctx);
    return;
  }

  const annotation = annotations.get(tokenId);
  if (!annotation) {
    addMarkLoss(ctx, mark, {
      category: 'unrepresentable',
      code: 'DANGLING_REFERENCE',
      message: `Mark refers to token "${tokenId}", which does not exist`,
    });
    return;
  }

  if (mark.type === 'kaeri') {
    if (!annotation.kaeriAfter) annotation.kaeriAfter = [];
    annotation.kaeriAfter.push(mark as KaeriMark);
  } else if (mark.type === 'kutoten') {
    if (!annotation.kutotenAfter) annotation.kutotenAfter = [];
    annotation.kutotenAfter.push(mark as KutotenMark);
  } else if (mark.type === 'ref') {
    if (!annotation.refAfter) annotation.refAfter = [];
    annotation.refAfter.push(mark as RefMark);
  } else if (mark.type === 'linebreak') {
    if (!annotation.linebreakAfter) annotation.linebreakAfter = [];
    annotation.linebreakAfter.push(mark as LinebreakMark);
  }
}

function applyBlockStartMark(
  mark: KaeriMark | KutotenMark | RefMark | LinebreakMark,
  blockStart: Map<string, BlockStartMarks>,
  ctx: StringifyContext
): void {
  if (mark.type === 'kaeri') {
    addMarkLoss(ctx, mark, {
      category: 'unrepresentable',
      code: 'BLOCK_START_KAERI',
      message: 'A kaeri cannot be placed at the start of a block; it needs a preceding token',
    });
    return;
  }
  if (mark.type === 'linebreak') {
    addMarkLoss(ctx, mark, {
      category: 'unrepresentable',
      code: 'BLOCK_START_LINEBREAK',
      message: 'A linebreak cannot be placed at the start of a block; it needs a preceding token',
    });
    return;
  }
  if (!ctx.blockIndexById.has(mark.position.blockId)) {
    addMarkLoss(ctx, mark, {
      category: 'unrepresentable',
      code: 'DANGLING_REFERENCE',
      message: `Mark refers to block "${mark.position.blockId}", which does not exist`,
    });
    return;
  }
  const entry = blockStart.get(mark.position.blockId) ?? {};
  if (mark.type === 'kutoten') (entry.kutotenAfter ??= []).push(mark);
  else (entry.refAfter ??= []).push(mark);
  blockStart.set(mark.position.blockId, entry);
}

function reportConflictingMark(ctx: StringifyContext, mark: Mark): void {
  addMarkLoss(ctx, mark, {
    category: 'unrepresentable',
    code: 'CONFLICTING_MARKS',
    message: `Another ${mark.type} mark is already attached to the same anchor`,
  });
}

const WRAPPER_TYPES: ReadonlySet<string> = new Set(['okimoji', 'joji', 'okototen', 'saidoku']);
/** 同じ anchor に重ねられない包む要素 (SKAM-draft §6.1)。okototen は重ねて付けてよい */
const UNIQUE_WRAPPER_TYPES: ReadonlySet<string> = new Set(['okimoji', 'joji', 'saidoku']);

/** 単字の包む要素を追加する。入れ子順 (外側から) に並べ、同じ種類は 2 件目以降を落とす */
function addSingleTokenWrapper(
  annotation: TokenAnnotation,
  mark: OkimojiMark | JojiMark | OkototenMark | SaidokuMark,
  ctx: StringifyContext
): void {
  const wrappers = (annotation.wrappers ??= []);
  if (UNIQUE_WRAPPER_TYPES.has(mark.type) && wrappers.some((w) => w.type === mark.type)) {
    reportConflictingMark(ctx, mark);
    return;
  }
  wrappers.push({ type: mark.type, mark } as SingleTokenWrapper);
  wrappers.sort((a, b) => nestingRank(a.type) - nestingRank(b.type));
}

/** 単一トークンの anchor-based mark を annotation に追加 */
function applySingleTokenAnchorMark(
  mark: Mark,
  annotation: TokenAnnotation,
  ctx: StringifyContext
): void {
  switch (mark.type) {
    case 'yomigana':
      if (annotation.yomi !== undefined) reportConflictingMark(ctx, mark);
      else annotation.yomi = (mark as YomiganaMark).value;
      break;
    case 'okurigana':
      if (annotation.okuri !== undefined) reportConflictingMark(ctx, mark);
      else annotation.okuri = (mark as OkuriganaMark).value;
      break;
    case 'soegana':
      if (annotation.soe !== undefined) reportConflictingMark(ctx, mark);
      else annotation.soe = (mark as SoeganaMark).value;
      break;
    case 'okimoji':
    case 'joji':
    case 'okototen':
    case 'saidoku':
      addSingleTokenWrapper(annotation, mark, ctx);
      break;
  }
}

/**
 * Token ごとの annotation を収集（単一トークンマーク用）
 */
function collectTokenAnnotations(
  tokens: Token[],
  marks: Mark[],
  ctx: StringifyContext
): { annotations: Map<string, TokenAnnotation>; blockStart: Map<string, BlockStartMarks> } {
  const annotations = new Map<string, TokenAnnotation>();
  const blockStart = new Map<string, BlockStartMarks>();

  for (const token of tokens) {
    annotations.set(token.id, {});
  }

  for (const mark of marks) {
    if (!isAnchorBasedMark(mark)) {
      applyPositionBasedMark(mark, annotations, blockStart, ctx);
      continue;
    }

    // 複数 token にまたがる mark は別途処理
    if (mark.anchor.from !== mark.anchor.to) continue;
    // emphasis / tateten / highlight は単字でも範囲マークとして扱う (参照切れもそちらで報告する)
    if (mark.type === 'emphasis' || mark.type === 'tateten' || mark.type === 'highlight') continue;

    const annotation = annotations.get(mark.anchor.from);
    if (!annotation) {
      addMarkLoss(ctx, mark, {
        category: 'unrepresentable',
        code: 'DANGLING_REFERENCE',
        message: `Mark refers to token "${mark.anchor.from}", which does not exist`,
      });
      continue;
    }

    applySingleTokenAnchorMark(mark, annotation, ctx);
  }

  return { annotations, blockStart };
}

/**
 * 範囲マークを収集（包囲要素として出力すべきマーク用）
 *
 * emphasis, tateten, highlight は単一トークンでも包囲要素として出力する。
 * 複数トークンにまたがる kun 系マーク（yomigana, okurigana, soegana）は
 * 同一範囲のものを KunRangeSyntheticMark にマージして包囲要素として出力する。
 *
 * ref は position ベースなので範囲マークとしては扱わない。
 * （content がある場合は notes セクションに出力される）
 */
interface KunGroup {
  yomi?: string;
  okuri?: string;
  soe?: string;
  from: string;
  to: string;
  startIndex: number;
  endIndex: number;
  sources: Mark[];
}

/**
 * anchor の範囲を token の通し位置に解決する。
 * 参照切れとブロックをまたぐ範囲は出力できないので、欠落として記録して undefined を返す
 */
function resolveAnchorRange(
  mark: Mark & { anchor: { from: string; to: string } },
  tokenIndexMap: Map<string, number>,
  ctx: StringifyContext
): { startIndex: number; endIndex: number } | undefined {
  const startIndex = tokenIndexMap.get(mark.anchor.from);
  const endIndex = tokenIndexMap.get(mark.anchor.to);
  if (startIndex === undefined || endIndex === undefined) {
    addMarkLoss(ctx, mark, {
      category: 'unrepresentable',
      code: 'DANGLING_REFERENCE',
      message: `Mark anchor ${mark.anchor.from}..${mark.anchor.to} refers to a token that is not in any block`,
    });
    return undefined;
  }
  const fromBlock = ctx.tokenPosition.get(mark.anchor.from)?.blockIndex;
  const toBlock = ctx.tokenPosition.get(mark.anchor.to)?.blockIndex;
  if (fromBlock !== toBlock) {
    addMarkLoss(ctx, mark, {
      category: 'unrepresentable',
      code: 'CROSS_BLOCK_ANCHOR',
      message: `Mark anchor ${mark.anchor.from}..${mark.anchor.to} spans more than one block`,
    });
    return undefined;
  }
  return { startIndex, endIndex };
}

/** group の欄に mark の値を入れる。同じ種類が既にあれば false (呼び出し側が重複として報告する) */
function addToKunGroup(group: KunGroup, mark: Mark): boolean {
  if (group.sources.some((source) => source.type === mark.type)) return false;
  group.sources.push(mark);
  switch (mark.type) {
    case 'yomigana':
      group.yomi = (mark as YomiganaMark).value;
      break;
    case 'okurigana':
      group.okuri = (mark as OkuriganaMark).value;
      break;
    case 'soegana':
      group.soe = (mark as SoeganaMark).value;
      break;
  }
  return true;
}

function isYomiOnlyGroup(group: KunGroup): boolean {
  return Boolean(group.yomi) && !group.okuri && !group.soe;
}

function groupContains(outer: KunGroup, inner: KunGroup): boolean {
  return (
    inner !== outer && inner.startIndex >= outer.startIndex && inner.endIndex <= outer.endIndex
  );
}

function toSyntheticKunMark(group: KunGroup, upgrade: boolean): KunRangeSyntheticMark {
  const syntheticMark: KunRangeSyntheticMark = {
    type: upgrade ? '__yomigana_range' : '__kun_range',
    anchor: { from: group.from, to: group.to },
    sources: group.sources,
  };
  if (group.yomi) syntheticMark.yomi = group.yomi;
  if (group.okuri) syntheticMark.okuri = group.okuri;
  if (group.soe) syntheticMark.soe = group.soe;
  return syntheticMark;
}

/** 複数トークンにまたがる kun 系マークをグループ化して合成マークを生成 */
function collectKunRangeGroups(
  marks: Mark[],
  tokenIndexMap: Map<string, number>,
  ctx: StringifyContext
): RangeMark[] {
  const kunGroups = new Map<string, KunGroup>();
  // 単字の kun 系マークを持つ token の位置。読みだけの範囲は、内側に kun があれば <skam:yomigana> で出す
  const singleKunIndices: number[] = [];

  for (const mark of marks) {
    if (mark.type !== 'yomigana' && mark.type !== 'okurigana' && mark.type !== 'soegana') continue;
    if (mark.anchor.from === mark.anchor.to) {
      const index = tokenIndexMap.get(mark.anchor.from);
      if (index !== undefined) singleKunIndices.push(index);
      continue;
    }

    const range = resolveAnchorRange(mark, tokenIndexMap, ctx);
    if (!range) continue;

    const key = `${mark.anchor.from}:${mark.anchor.to}`;
    let group = kunGroups.get(key);
    if (!group) {
      group = { from: mark.anchor.from, to: mark.anchor.to, ...range, sources: [] };
      kunGroups.set(key, group);
    }
    if (!addToKunGroup(group, mark)) reportConflictingMark(ctx, mark);
  }

  const groups = [...kunGroups.values()];
  return groups.map((group) => {
    const hasInnerKun =
      singleKunIndices.some((i) => i >= group.startIndex && i <= group.endIndex) ||
      groups.some((other) => groupContains(group, other));
    return {
      mark: toSyntheticKunMark(group, hasInnerKun && isYomiOnlyGroup(group)),
      startIndex: group.startIndex,
      endIndex: group.endIndex,
    };
  });
}

/** 複数 token の包む要素 (okimoji / joji / okototen / saidoku) を範囲マークとして集める */
function collectWrapperRanges(
  marks: Mark[],
  tokenIndexMap: Map<string, number>,
  ctx: StringifyContext
): RangeMark[] {
  const result: RangeMark[] = [];
  const seen = new Set<string>();
  for (const mark of marks) {
    if (!WRAPPER_TYPES.has(mark.type) || !isAnchorBasedMark(mark)) continue;
    if (mark.anchor.from === mark.anchor.to) continue;
    const range = resolveAnchorRange(mark, tokenIndexMap, ctx);
    if (!range) continue;
    const key = `${mark.type}:${mark.anchor.from}:${mark.anchor.to}`;
    if (UNIQUE_WRAPPER_TYPES.has(mark.type) && seen.has(key)) {
      reportConflictingMark(ctx, mark);
      continue;
    }
    seen.add(key);
    result.push({ mark, ...range });
  }
  return result;
}

/** 並べ替え用の marks 添字。合成マークは元の mark のうち最小の添字を使う */
function rangeMarkIndex(rm: RangeMark, ctx: StringifyContext): number {
  const sources = 'sources' in rm.mark ? rm.mark.sources : [rm.mark];
  return Math.min(...sources.map((source) => ctx.markIndexMap.get(source) ?? UNPLACED));
}

function collectRangeMarks(
  marks: Mark[],
  tokenIndexMap: Map<string, number>,
  ctx: StringifyContext
): RangeMark[] {
  const rangeMarks: RangeMark[] = [];

  // emphasis, tateten, highlight は直接範囲マークとして追加
  for (const mark of marks) {
    if (mark.type !== 'emphasis' && mark.type !== 'tateten' && mark.type !== 'highlight') continue;
    const anchorMark = mark as EmphasisMark | TatetenMark | HighlightMark;
    const range = resolveAnchorRange(anchorMark, tokenIndexMap, ctx);
    if (!range) continue;
    rangeMarks.push({ mark, ...range });
  }

  rangeMarks.push(...collectWrapperRanges(marks, tokenIndexMap, ctx));
  // 複数トークン kun 系マークのグループ化
  rangeMarks.push(...collectKunRangeGroups(marks, tokenIndexMap, ctx));

  // ソート：開始位置昇順 → 終了位置降順 (外側が先) → 入れ子順 (§7.0) → marks の添字
  const rankOf = (rm: RangeMark) => nestingRank(nestingNameOf(rm.mark.type));
  rangeMarks.sort(
    (a, b) =>
      a.startIndex - b.startIndex ||
      b.endIndex - a.endIndex ||
      rankOf(a) - rankOf(b) ||
      rangeMarkIndex(a, ctx) - rangeMarkIndex(b, ctx)
  );

  return rangeMarks;
}

/** mark 起点の並べ替え鍵。anchor の開始 token か position.after の token で位置を決める */
function markSortKey(ctx: StringifyContext, mark: Mark): LossSortKey {
  const markIndex = ctx.markIndexMap.get(mark) ?? UNPLACED;
  let refTokenId: string | undefined;
  if (isAnchorBasedMark(mark)) {
    refTokenId = mark.anchor.from;
  } else {
    refTokenId = getPositionAfterTokenId(
      (mark as KaeriMark | KutotenMark | RefMark | LinebreakMark).position
    );
  }
  if (refTokenId === undefined) {
    // after のない position mark はブロック先頭 (t = -1)。blockId が解決できなければ末尾へ回す
    const blockId = isAnchorBasedMark(mark)
      ? undefined
      : (mark as KaeriMark | KutotenMark | RefMark | LinebreakMark).position.blockId;
    const blockIndex =
      (blockId === undefined ? undefined : ctx.blockIndexById.get(blockId)) ?? UNPLACED;
    return { blockIndex, tokenIndex: -1, markIndex, fieldOrder: 0 };
  }
  const pos = ctx.tokenPosition.get(refTokenId);
  if (!pos) return { blockIndex: UNPLACED, tokenIndex: UNPLACED, markIndex, fieldOrder: 0 };
  return { blockIndex: pos.blockIndex, tokenIndex: pos.tokenIndex, markIndex, fieldOrder: 0 };
}

/** mark 由来の欠落を記録する。`field` を渡すとその mark のフィールドを指す */
function addMarkLoss(
  ctx: StringifyContext,
  mark: Mark,
  loss: Pick<StringifyLoss, 'category' | 'code' | 'message'>,
  field?: string
): void {
  const index = ctx.markIndexMap.get(mark);
  const path = `/marks/${index ?? -1}${field ? `/${field}` : ''}`;
  const entry: StringifyLoss = { ...loss, path };
  if (mark.id) entry.markId = mark.id;
  ctx.collector.add(entry, markSortKey(ctx, mark));
}

function describeRangeMark(rm: RangeMark): string {
  return 'id' in rm.mark ? (rm.mark.id ?? rm.mark.type) : rm.mark.type;
}

/**
 * 部分重複するマークを検出してフィルタリング
 */
function filterPartialOverlaps(rangeMarks: RangeMark[], ctx: StringifyContext): RangeMark[] {
  const valid: RangeMark[] = [];

  for (const mark of rangeMarks) {
    let hasPartialOverlap = false;

    for (const existing of valid) {
      // 部分重複の検出：
      // mark が existing の途中で開始し、existing より後で終了
      // または mark が existing より前で開始し、existing の途中で終了
      const markStart = mark.startIndex;
      const markEnd = mark.endIndex;
      const existStart = existing.startIndex;
      const existEnd = existing.endIndex;

      // 完全に含まれる or 完全に含む は OK
      const contained = markStart >= existStart && markEnd <= existEnd;
      const contains = markStart <= existStart && markEnd >= existEnd;
      const disjoint = markEnd < existStart || markStart > existEnd;

      if (!contained && !contains && !disjoint) {
        // 部分重複
        hasPartialOverlap = true;
        const message = `Mark ${describeRangeMark(mark)} partially overlaps ${describeRangeMark(existing)}; SKAM-ML ranges must nest`;
        if ('sources' in mark.mark) {
          for (const source of mark.mark.sources) {
            addMarkLoss(ctx, source, {
              category: 'unsupported',
              code: 'UNNESTABLE_OVERLAP',
              message,
            });
          }
        } else {
          addMarkLoss(ctx, mark.mark as Mark, {
            category: 'unsupported',
            code: 'PARTIAL_OVERLAP',
            message,
          });
        }
        break;
      }
    }

    if (!hasPartialOverlap) {
      valid.push(mark);
    }
  }

  return valid;
}

/** 合成マークは元の mark ごとに、そうでなければ mark 自身を返す */
function sourcesOf(mark: Mark | KunRangeSyntheticMark): Mark[] {
  return 'sources' in mark ? mark.sources : [mark];
}

/** 範囲マークが表 (§7.0) の中で親になるときのキー。span / tateten は制約がないので undefined */
function contentModelKeyOf(mark: Mark | KunRangeSyntheticMark): ContentModelKey | undefined {
  switch (mark.type) {
    case '__yomigana_range':
      return 'yomigana';
    case '__kun_range':
      return 'kun';
    case 'okimoji':
    case 'joji':
    case 'okototen':
      return mark.type;
    case 'saidoku':
      return 'base';
    default:
      return undefined;
  }
}

/** 範囲マークが子になるときの要素名 */
function childNameOfRange(mark: Mark | KunRangeSyntheticMark): string {
  return nestingNameOf(mark.type);
}

/** token の単字の注記が、親から見て子になる要素名。最後の token でなければ位置マークも子になる */
function childNamesOfAnnotation(annotation: TokenAnnotation, isFinalToken: boolean): string[] {
  const names: string[] = [];
  if (annotation.yomi || annotation.okuri || annotation.soe) names.push('kun');
  for (const wrapper of annotation.wrappers ?? []) names.push(wrapper.type);
  const hasPosition =
    annotation.kaeriAfter ||
    annotation.kutotenAfter ||
    annotation.refAfter ||
    annotation.linebreakAfter;
  if (hasPosition && !isFinalToken) names.push('position');
  return names;
}

/** outer の内側にある子孫のうち、表で許されていないものの名前を返す */
function findDisallowedDescendant(
  outer: RangeMark,
  key: ContentModelKey,
  inner: RangeMark[],
  annotations: Map<string, TokenAnnotation>,
  blockTokens: Token[],
  blockStartIndex: number
): string | undefined {
  const allowed = SKAM_ML_CONTENT_MODEL[key];
  for (const candidate of inner) {
    if (candidate.startIndex < outer.startIndex || candidate.endIndex > outer.endIndex) continue;
    const name = childNameOfRange(candidate.mark);
    if (!allowed.includes(name)) return name;
  }
  for (let index = outer.startIndex; index <= outer.endIndex; index++) {
    const token = blockTokens[index - blockStartIndex];
    const annotation = token ? annotations.get(token.id) : undefined;
    if (!annotation) continue;
    const names = childNamesOfAnnotation(annotation, index === outer.endIndex);
    const disallowed = names.find((name) => !allowed.includes(name));
    if (disallowed) return disallowed;
  }
  return undefined;
}

/**
 * §7.0 の表で許されていない親子関係を見つけ、外側の範囲を出力から除く。
 * 内側から順に調べるので、先に落ちた内側の範囲は外側の判定に使わない。
 * 外側を落としても、その子孫と外側の外側との関係は、すでに調べた組のままである
 */
function dropUnnestableRanges(
  rangeMarks: RangeMark[],
  annotations: Map<string, TokenAnnotation>,
  blockTokens: Token[],
  blockStartIndex: number,
  ctx: StringifyContext
): RangeMark[] {
  const dropped = new Set<RangeMark>();
  for (let i = rangeMarks.length - 1; i >= 0; i--) {
    const outer = rangeMarks[i];
    const key = outer && contentModelKeyOf(outer.mark);
    if (!outer || !key) continue;
    const inner = rangeMarks.slice(i + 1).filter((rm) => !dropped.has(rm));
    const name = findDisallowedDescendant(
      outer,
      key,
      inner,
      annotations,
      blockTokens,
      blockStartIndex
    );
    if (name === undefined) continue;
    dropped.add(outer);
    for (const source of sourcesOf(outer.mark)) {
      addMarkLoss(ctx, source, {
        category: 'unsupported',
        code: 'UNNESTABLE_OVERLAP',
        message: `${describeRangeMark(outer)} cannot contain ${name} (SKAM-ML §7.0)`,
      });
    }
  }
  return rangeMarks.filter((rm) => !dropped.has(rm));
}

// ============================================================================
// Content Tree Building
// ============================================================================

/**
 * コンテンツの木構造を構築
 */
function buildContentTree(
  blockTokens: Token[],
  annotations: Map<string, TokenAnnotation>,
  allRangeMarks: RangeMark[],
  blockStartIndex: number,
  blockEndIndex: number,
  ctx: StringifyContext
): ContentNode[] {
  // このブロックに関係する範囲マークをフィルタ
  const blockRangeMarks = allRangeMarks.filter(
    (rm) => rm.startIndex >= blockStartIndex && rm.endIndex <= blockEndIndex
  );

  // 部分重複をフィルタリング
  const validRangeMarks = dropUnnestableRanges(
    filterPartialOverlaps(blockRangeMarks, ctx),
    annotations,
    blockTokens,
    blockStartIndex,
    ctx
  );

  const result: ContentNode[] = [];
  const activeRanges: {
    mark: Mark | KunRangeSyntheticMark;
    endIndex: number;
    children: ContentNode[];
  }[] = [];

  for (let i = 0; i < blockTokens.length; i++) {
    const token = blockTokens[i];
    if (!token) continue;

    const globalIndex = blockStartIndex + i;

    // この位置で開始する範囲マークを処理
    for (const rangeMark of validRangeMarks) {
      if (rangeMark.startIndex === globalIndex) {
        activeRanges.push({
          mark: rangeMark.mark,
          endIndex: rangeMark.endIndex,
          children: [],
        });
      }
    }

    // トークンノードを作成
    const tokenNode: TextNode = {
      type: 'text',
      tokenId: token.id,
      text: token.text,
      annotation: annotations.get(token.id) ?? {},
    };

    // 最も内側のアクティブ範囲に追加
    if (activeRanges.length > 0) {
      const innermost = activeRanges[activeRanges.length - 1];
      if (innermost) {
        innermost.children.push(tokenNode);
      }
    } else {
      result.push(tokenNode);
    }

    // この位置で終了する範囲マークを処理（内側から）
    while (
      activeRanges.length > 0 &&
      activeRanges[activeRanges.length - 1]?.endIndex === globalIndex
    ) {
      const completed = activeRanges.pop();
      if (!completed) break;

      const elementNode: ElementNode = {
        type: 'element',
        mark: completed.mark,
        children: completed.children,
      };

      if (activeRanges.length > 0) {
        const parent = activeRanges[activeRanges.length - 1];
        if (parent) {
          parent.children.push(elementNode);
        }
      } else {
        result.push(elementNode);
      }
    }
  }

  return result;
}

// ============================================================================
// XML Generation
// ============================================================================

/**
 * 単一トークンのベース XML を生成（テキスト + kun 属性のみ、trailing marks なし）
 */
function tokenBaseToXml(text: string, annotation: TokenAnnotation): string {
  // パーサーが無視する空白だけの token は出力しても読み戻せない (損失は recordFieldLosses で記録済み)
  if (isIgnoredWhitespaceText(text)) return '';
  const { yomi, okuri, soe } = annotation;
  const hasKunAttrs = yomi || okuri || soe;

  if (hasKunAttrs) {
    const attrs: string[] = [];
    if (yomi) {
      attrs.push(`yomi="${escapeXml(yomi)}"`);
    }
    if (okuri) {
      attrs.push(`okuri="${escapeXml(okuri)}"`);
    }
    if (soe) {
      attrs.push(`soe="${escapeXml(soe)}"`);
    }

    return `<skam:kun ${attrs.join(' ')}>${escapeXml(text)}</skam:kun>`;
  }

  return escapeXml(text);
}

/**
 * trailing marks（kaeri/kutoten/ref/linebreak）の XML を生成
 */
function tokenTrailingToXml(annotation: TokenAnnotation): string {
  const { kaeriAfter, kutotenAfter, refAfter, linebreakAfter } = annotation;
  let xml = '';

  if (kaeriAfter) {
    for (const kaeri of kaeriAfter) {
      const kind = kaeriValueToKind(kaeri.value);
      xml += `<skam:kaeri kind="${escapeXml(kind)}"/>`;
    }
  }

  if (kutotenAfter) {
    for (const kutoten of kutotenAfter) {
      let attrs = `value="${escapeXml(kutoten.value)}"`;
      if (kutoten.kind) {
        attrs += ` kind="${kutoten.kind}"`;
      }
      xml += `<skam:kutoten ${attrs}/>`;
    }
  }

  if (refAfter) {
    for (const ref of refAfter) {
      // id のない ref の content は notes に出せないので、インラインに出力する
      xml += refMarkToXml(ref, !(ref.content && !ref.id));
    }
  }

  // linebreak は未知のフィールドを書かない。位置の正しさは検査しない (validator の役目)
  if (linebreakAfter) {
    for (const linebreak of linebreakAfter) {
      xml += linebreak.id ? `<skam:br xml:id="${escapeXml(linebreak.id)}"/>` : '<skam:br/>';
    }
  }

  return xml;
}

/**
 * 単一トークンの XML を生成（wrapper なし、annotation のみ）
 */
function tokenContentToXml(text: string, annotation: TokenAnnotation): string {
  return tokenBaseToXml(text, annotation) + tokenTrailingToXml(annotation);
}

/** 字を包む要素の開始タグと終了タグ。単字 (applyWrappers) と範囲 (renderRangeElement) で共有する */
function wrapperTags(mark: OkimojiMark | JojiMark | OkototenMark | SaidokuMark): {
  open: string;
  close: string;
} {
  switch (mark.type) {
    case 'okimoji':
      return { open: '<skam:okimoji>', close: '</skam:okimoji>' };
    case 'joji':
      return { open: '<skam:joji>', close: '</skam:joji>' };
    case 'okototen': {
      let attrs = `grid="${escapeXml(mark.position.grid)}" x="${mark.position.x}" y="${mark.position.y}" shape="${escapeXml(mark.shape)}"`;
      if (mark.sound) attrs += ` sound="${escapeXml(mark.sound)}"`;
      if (mark.color) attrs += ` color="${escapeXml(mark.color)}"`;
      return { open: `<skam:okototen ${attrs}>`, close: '</skam:okototen>' };
    }
    case 'saidoku': {
      let formsXml = '';
      for (const form of mark.forms) {
        let formAttrs = '';
        if (form.n !== undefined) formAttrs += ` n="${form.n}"`;
        if (form.yomi) formAttrs += ` yomi="${escapeXml(form.yomi)}"`;
        if (form.okuri) formAttrs += ` okuri="${escapeXml(form.okuri)}"`;
        formsXml += `<skam:kunform${formAttrs}/>`;
      }
      return {
        open: '<skam:saidoku><skam:base>',
        close: `</skam:base>${formsXml}</skam:saidoku>`,
      };
    }
  }
}

/** 単字の包む要素を適用してトークン XML を生成。wrappers は入れ子順 (外側から) に並んでいる */
function applyWrappers(innerXml: string, wrappers: SingleTokenWrapper[] | undefined): string {
  let xml = innerXml;
  for (let i = (wrappers?.length ?? 0) - 1; i >= 0; i--) {
    const wrapper = wrappers?.[i];
    if (!wrapper) continue;
    const { open, close } = wrapperTags(wrapper.mark);
    xml = open + xml + close;
  }
  return xml;
}

/**
 * ref マークを XML に変換
 */
function refMarkToXml(ref: RefMark, isEmpty: boolean): string {
  let attrs = '';

  if (ref.id) {
    attrs += ` xml:id="${escapeXml(ref.id)}"`;
  }

  if (ref.label) {
    attrs += ` label="${escapeXml(ref.label)}"`;
  } else if (ref.format) {
    attrs += ` format="${escapeXml(ref.format)}"`;
  }

  if (isEmpty || !ref.content) {
    return `<skam:ref${attrs}/>`;
  } else {
    return `<skam:ref${attrs}>${escapeXml(ref.content)}</skam:ref>`;
  }
}

/**
 * 範囲マークの型に応じた XML 要素を生成
 */
function renderRangeElement(mark: Mark | KunRangeSyntheticMark, childrenXml: string): string {
  switch (mark.type) {
    case '__kun_range': {
      const kun = mark as KunRangeSyntheticMark;
      const attrs: string[] = [];
      if (kun.yomi) attrs.push(`yomi="${escapeXml(kun.yomi)}"`);
      if (kun.okuri) attrs.push(`okuri="${escapeXml(kun.okuri)}"`);
      if (kun.soe) attrs.push(`soe="${escapeXml(kun.soe)}"`);
      return `<skam:kun ${attrs.join(' ')}>${childrenXml}</skam:kun>`;
    }
    case '__yomigana_range': {
      const yomigana = mark as KunRangeSyntheticMark;
      return `<skam:yomigana value="${escapeXml(yomigana.yomi ?? '')}">${childrenXml}</skam:yomigana>`;
    }
    case 'emphasis': {
      const emp = mark as EmphasisMark;
      let attrs = 'type="emphasis"';
      if (emp.style) {
        attrs += ` style="${escapeXml(emp.style)}"`;
      }
      return `<skam:span ${attrs}>${childrenXml}</skam:span>`;
    }
    case 'tateten':
      return `<skam:tateten>${childrenXml}</skam:tateten>`;
    case 'highlight': {
      const hl = mark as HighlightMark;
      let attrs = 'type="highlight"';
      if (hl.style) {
        attrs += ` style="${hl.style}"`;
      }
      if (hl.ref) {
        attrs += ` ref="${escapeXml(hl.ref)}"`;
      }
      return `<skam:span ${attrs}>${childrenXml}</skam:span>`;
    }
    case 'okimoji':
    case 'joji':
    case 'okototen':
    case 'saidoku': {
      const { open, close } = wrapperTags(
        mark as OkimojiMark | JojiMark | OkototenMark | SaidokuMark
      );
      return open + childrenXml + close;
    }
    case 'ref':
      return refMarkToXml(mark as RefMark, false);
    default:
      return childrenXml;
  }
}

/** 範囲の連鎖 (最後の子をたどった先) の最後の字。位置マークはこの字の後ろにある */
function findTrailingLeaf(node: ElementNode): TextNode | undefined {
  let current: ContentNode | undefined = node;
  while (current?.type === 'element') current = current.children[current.children.length - 1];
  return current;
}

/** annotation から後置の位置マークを取り外して返す */
function takeTrailing(annotation: TokenAnnotation): TokenAnnotation {
  const taken: TokenAnnotation = {};
  if (annotation.kaeriAfter) taken.kaeriAfter = annotation.kaeriAfter;
  if (annotation.kutotenAfter) taken.kutotenAfter = annotation.kutotenAfter;
  if (annotation.refAfter) taken.refAfter = annotation.refAfter;
  if (annotation.linebreakAfter) taken.linebreakAfter = annotation.linebreakAfter;
  delete annotation.kaeriAfter;
  delete annotation.kutotenAfter;
  delete annotation.refAfter;
  delete annotation.linebreakAfter;
  return taken;
}

/**
 * コンテンツノードを XML に変換
 */
function contentNodeToXml(node: ContentNode): string {
  if (node.type === 'text') {
    // wrapper がある場合、trailing marks を wrapper の外に配置
    if (node.annotation.wrappers?.length) {
      const baseXml = tokenBaseToXml(node.text, node.annotation);
      const trailingXml = tokenTrailingToXml(node.annotation);
      return applyWrappers(baseXml, node.annotation.wrappers) + trailingXml;
    }
    const innerXml = tokenContentToXml(node.text, node.annotation);
    return applyWrappers(innerXml, node.annotation.wrappers);
  }

  // 要素ノード：最後の字の位置マークを、同じ字で終わる範囲の連鎖のうち最も外側の後ろへ出す (§7.0)
  const leaf = findTrailingLeaf(node);
  const trailing = leaf ? takeTrailing(leaf.annotation) : {};
  const elementXml = renderRangeElement(node.mark, node.children.map(contentNodeToXml).join(''));
  if (leaf) Object.assign(leaf.annotation, trailing);
  return elementXml + tokenTrailingToXml(trailing);
}

/**
 * ブロックの XML を生成
 */
function blockToXml(
  blockId: string,
  blockTokens: Token[],
  annotations: Map<string, TokenAnnotation>,
  rangeMarks: RangeMark[],
  blockStartIndex: number,
  indentLevel: number,
  indentSize: number,
  ctx: StringifyContext,
  startMarks: BlockStartMarks | undefined
): string {
  const ind = indentStr(indentLevel, indentSize);

  // 木構造を構築
  const contentTree = buildContentTree(
    blockTokens,
    annotations,
    rangeMarks,
    blockStartIndex,
    blockStartIndex + blockTokens.length - 1,
    ctx
  );

  // XML に変換
  // ブロック先頭の句読点・ref (§7.1: position に blockId だけを指定したもの) を本文の前に置く
  const content =
    (startMarks ? tokenTrailingToXml(startMarks) : '') + contentTree.map(contentNodeToXml).join('');

  if (content === '') {
    return `${ind}<skam:block xml:id="${escapeXml(blockId)}"/>`;
  }
  return `${ind}<skam:block xml:id="${escapeXml(blockId)}">${content}</skam:block>`;
}

/**
 * 分離定義の注釈（skam:notes）を生成
 */
function stringifyNotes(marks: Mark[], indentSize: number): string[] {
  // content を持つ ref マークを収集
  const notesRefs = marks.filter(
    (m) => m.type === 'ref' && (m as RefMark).content && (m as RefMark).id
  ) as RefMark[];

  if (notesRefs.length === 0) {
    return [];
  }

  const lines: string[] = [];
  lines.push(`${indentStr(1, indentSize)}<skam:notes>`);

  for (const ref of notesRefs) {
    if (ref.content && ref.id) {
      lines.push(
        `${indentStr(2, indentSize)}<skam:note ref="${escapeXml(ref.id)}">${escapeXml(ref.content)}</skam:note>`
      );
    }
  }

  lines.push(`${indentStr(1, indentSize)}</skam:notes>`);
  return lines;
}

// ============================================================================
// Loss Recording
// ============================================================================

function createContext(doc: SKAMDocument): StringifyContext {
  const markIndexMap = new Map<Mark, number>();
  doc.marks.forEach((mark, i) => markIndexMap.set(mark, i));

  const tokenPosition = new Map<string, { blockIndex: number; tokenIndex: number }>();
  doc.blocks.forEach((block, blockIndex) => {
    block.tokenIds.forEach((id, tokenIndex) => tokenPosition.set(id, { blockIndex, tokenIndex }));
  });

  const blockIndexById = new Map(doc.blocks.map((block, i) => [block.id, i] as const));

  return { collector: new LossCollector(), markIndexMap, tokenPosition, blockIndexById };
}

function hasKeys(value: Record<string, unknown> | undefined): value is Record<string, unknown> {
  return value !== undefined && Object.keys(value).length > 0;
}

/**
 * XML に書き場所のないフィールド (ext / derivations / placementHint) の欠落を記録する。
 * これらは変換経路のどこにも出力されないので、ここで一括して積む
 */
function recordFieldLosses(doc: SKAMDocument, ctx: StringifyContext): void {
  const extLoss = (path: string): StringifyLoss => ({
    category: 'unsupported',
    code: 'EXT',
    path,
    message: `SKAM-ML has no notation for ext (${path})`,
  });

  if (hasKeys(doc.ext)) {
    ctx.collector.add(extLoss('/ext'), {
      blockIndex: -1,
      tokenIndex: -1,
      markIndex: -1,
      fieldOrder: 0,
    });
  }
  if (doc.derivations && doc.derivations.length > 0) {
    ctx.collector.add(
      {
        category: 'unrepresentable',
        code: 'DERIVATIONS',
        path: '/derivations',
        message: 'SKAM-ML does not describe derivations (SKAM-ML §4.2)',
      },
      { blockIndex: -1, tokenIndex: -1, markIndex: -1, fieldOrder: 1 }
    );
  }
  doc.readings.forEach((reading, i) => {
    if (hasKeys(reading.ext)) {
      ctx.collector.add(extLoss(`/readings/${i}/ext`), {
        blockIndex: UNPLACED,
        tokenIndex: UNPLACED,
        markIndex: i,
        fieldOrder: 0,
      });
    }
  });
  doc.blocks.forEach((block, blockIndex) => {
    if (hasKeys(block.ext)) {
      ctx.collector.add(extLoss(`/blocks/${blockIndex}/ext`), {
        blockIndex,
        tokenIndex: -1,
        markIndex: -1,
        fieldOrder: 0,
      });
    }
  });
  doc.tokens.forEach((token, i) => {
    const pos = ctx.tokenPosition.get(token.id);
    const key: LossSortKey = {
      blockIndex: pos?.blockIndex ?? UNPLACED,
      tokenIndex: pos?.tokenIndex ?? UNPLACED,
      markIndex: -1,
      fieldOrder: 0,
    };
    if (isIgnoredWhitespaceText(token.text)) {
      ctx.collector.add(
        {
          category: 'unrepresentable',
          code: 'ASCII_WHITESPACE_TOKEN',
          path: `/tokens/${i}`,
          message: `Token ${JSON.stringify(token.text)} consists only of whitespace that SKAM-ML ignores`,
        },
        key
      );
    }
    if (hasKeys(token.ext)) ctx.collector.add(extLoss(`/tokens/${i}/ext`), key);
  });
  for (const mark of doc.marks) {
    if (hasKeys(mark.ext)) {
      addMarkLoss(
        ctx,
        mark,
        { category: 'unsupported', code: 'EXT', message: 'SKAM-ML has no notation for ext' },
        'ext'
      );
    }
    if (mark.placementHint !== undefined) {
      addMarkLoss(
        ctx,
        mark,
        {
          category: 'unsupported',
          code: 'PLACEMENT_HINT',
          message: 'SKAM-ML has no notation for placementHint',
        },
        'placementHint'
      );
    }
  }
}

// ============================================================================
// Main Stringify Function
// ============================================================================

/**
 * SKAMDocument を SKAM-ML/XML 文字列に変換
 *
 * @param doc SKAMDocument
 * @param options Stringify options
 * @returns XML string
 */
export function stringify(doc: SKAMDocument, options: StringifyOptions = {}): string {
  const { indent: indentSize = 2, xmlDeclaration = true, lossy = false, onLoss } = options;

  const ctx = createContext(doc);
  recordFieldLosses(doc, ctx);

  // トークンID → Token のマップを構築
  const tokenMap = new Map<string, Token>();
  for (const token of doc.tokens) {
    tokenMap.set(token.id, token);
  }

  // blocks の tokenIds の順序に基づいてトークンインデックスマップを構築
  // blocks の出現順で通しインデックスを付与する
  const tokenIndexMap = new Map<string, number>();
  let globalIndex = 0;
  for (const block of doc.blocks) {
    for (const tokenId of block.tokenIds) {
      tokenIndexMap.set(tokenId, globalIndex);
      globalIndex++;
    }
  }

  // Annotation を収集
  const { annotations, blockStart } = collectTokenAnnotations(doc.tokens, doc.marks, ctx);

  // 範囲マークを収集
  const rangeMarks = collectRangeMarks(doc.marks, tokenIndexMap, ctx);

  // XML を構築
  const lines: string[] = [];

  // XML 宣言
  if (xmlDeclaration) {
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  }

  // ルート要素開始
  lines.push(`<skam:doc xmlns:skam="${SKAM_NS}">`);

  // meta 要素（常に char tokenization）
  lines.push(`${indentStr(1, indentSize)}<skam:meta tokenization="char"/>`);

  // body 要素
  lines.push(`${indentStr(1, indentSize)}<skam:body>`);

  // doc.blocks を直接イテレートしてブロックを出力
  let blockStartIndex = 0;
  for (const block of doc.blocks) {
    const blockTokens: Token[] = [];
    for (const tokenId of block.tokenIds) {
      const token = tokenMap.get(tokenId);
      if (token) {
        blockTokens.push(token);
      }
    }

    lines.push(
      blockToXml(
        block.id,
        blockTokens,
        annotations,
        rangeMarks,
        blockStartIndex,
        2,
        indentSize,
        ctx,
        blockStart.get(block.id)
      )
    );
    blockStartIndex += block.tokenIds.length;
  }

  lines.push(`${indentStr(1, indentSize)}</skam:body>`);

  // notes 要素（分離定義の注釈がある場合）
  const notesLines = stringifyNotes(doc.marks, indentSize);
  if (notesLines.length > 0) {
    lines.push('');
    lines.push(...notesLines);
  }

  // readings 要素
  if (doc.readings.length > 0) {
    lines.push('');
    lines.push(`${indentStr(1, indentSize)}<skam:readings>`);
    for (const reading of doc.readings) {
      lines.push(
        `${indentStr(2, indentSize)}<skam:reading kind="${escapeXml(reading.kind)}">${escapeXml(reading.text)}</skam:reading>`
      );
    }
    lines.push(`${indentStr(1, indentSize)}</skam:readings>`);
  }

  // ルート要素終了
  lines.push('</skam:doc>');

  const losses = ctx.collector.sorted();
  if (losses.length > 0) {
    if (!lossy) throw new SKAMXMLStringifyError(losses);
    if (onLoss) for (const loss of losses) onLoss(loss);
  }

  return lines.join('\n');
}
