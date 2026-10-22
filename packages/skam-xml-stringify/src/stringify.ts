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
  Block,
  Reading,
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
import {
  isAnchorBasedMark,
  KAERI,
  tokenizePlainText,
  SKAM_ML_CONTENT_MODEL,
  SKAM_ML_NESTING_ORDER,
  SKAM_ML_MAX_RANGE_DEPTH,
  isHandId,
  findIdFormIssues,
  findXmlUnwritableChars,
} from '@kanbun-skam/skam';
import {
  extensionRegistry,
  isExtensionName,
  resolveExtensions,
  type SKAMExtensionDefinition,
  type XmlElementMarks,
} from '@kanbun-skam/skam/extensions';
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
  /**
   * 既定の束 (`@kanbun-skam/skam/extensions`) に足す拡張の定義。名前が束と重なれば TypeError。
   * 宣言のある文書の拡張の値は、定義の `writeXmlAttributes` で拡張の名前空間の属性に書く。
   * 書き方を知らない拡張の値は書けないので、`UNKNOWN_EXTENSION` の損失になる
   */
  extensions?: readonly SKAMExtensionDefinition[];
}

/** 宣言のある文書の拡張の出力 (宣言が無い文書では空) */
interface ExtensionOutput {
  /** 宣言した拡張のうち、書き方 (`writeXmlAttributes`) と名前空間の URI を持つもの。宣言の順 */
  writers: ReadonlyMap<string, SKAMExtensionDefinition>;
  /** 属性として書いた (注記, 拡張の名前)。書けなかった ext の値を損失にするために控える */
  consumed: Map<Mark, Set<string>>;
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
  extension: ExtensionOutput;
  /** 手書きの id を持つ ref 注記の id。`highlight.ref` がこの中の値を指すときだけ `ref` 属性に書く */
  handRefIds: ReadonlySet<string>;
  /** 次の空要素の対に付ける番号 (`r1`、`r2`、…)。文書の中で通して数える */
  nextPairNumber: number;
}

const UNPLACED = Number.MAX_SAFE_INTEGER;

// Token の直後に置く位置の注記 (kaeri / kutoten / ref / br)
interface TokenAnnotation {
  /** 直後に配置する返り点 */
  kaeriAfter?: KaeriMark[];
  /** 直後に配置する句読点 */
  kutotenAfter?: KutotenMark[];
  /** 直後に配置する ref（空要素） */
  refAfter?: RefMark[];
  /** 直後に配置する改行（空要素） */
  linebreakAfter?: LinebreakMark[];
}

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

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 本文の文字を書く。CR は parser (XML の改行の正規化) が LF に変えてしまうので、文字参照 `&#13;` にする。
 * LF と TAB は本文ではそのまま残る
 */
function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/\r/g, '&#13;');
}

/** 属性値を書く。XML の属性値の正規化で TAB・LF・CR は空白に変わるので、文字参照にする */
function escapeXml(text: string): string {
  return escapeText(text).replace(/\t/g, '&#9;').replace(/\n/g, '&#10;');
}

/** 手書きの id だけを `xml:id` に書く。自動の id (`#` を含む) は parser が位置から計算するので書かない */
function idAttribute(id: string | undefined): string {
  return id !== undefined && isHandId(id) ? ` xml:id="${escapeXml(id)}"` : '';
}

function indentStr(level: number, size: number): string {
  return ' '.repeat(level * size);
}

/** 拡張が返す属性名 (local name) として許す形。名前空間の接頭辞は拡張の名前 */
const EXTENSION_ATTRIBUTE_NAME = /^[A-Za-z_][A-Za-z0-9._-]*$/;

/**
 * 要素に付ける拡張の名前空間の属性を書く。宣言した拡張のうち、この要素の注記に値を持つものだけを呼ぶ。
 * 値は escape する。属性名は拡張の定義が返すので、XML の名前として安全な形かを確かめる
 */
function extensionAttributes(
  ctx: StringifyContext,
  element: string,
  marks: XmlElementMarks['marks'],
  namespaced = true
): string {
  let xml = '';
  for (const [name, definition] of namespaced ? ctx.extension.writers : []) {
    const carriers = marks.filter(({ mark }) => hasOwnExtension(mark, name));
    if (carriers.length === 0) continue;
    const written = definition.writeXmlAttributes!({ element, marks });
    for (const [key, value] of written) {
      if (!EXTENSION_ATTRIBUTE_NAME.test(key)) {
        throw new TypeError(`Extension "${name}" returned an invalid attribute name`);
      }
      xml += ` ${name}:${key}="${escapeXml(value)}"`;
    }
    for (const { mark } of carriers) {
      const names = ctx.extension.consumed.get(mark) ?? new Set<string>();
      names.add(name);
      ctx.extension.consumed.set(mark, names);
    }
  }
  for (const { part, mark } of marks) xml += markFreeDataAttributes(ctx, mark, part);
  return xml;
}

/**
 * 名前空間の属性に書けなかった ext の値、custom、placementHint の属性。
 * `skam:kun` は 1 つの要素に最大 3 つの注記が付くので、読み仮名は接頭辞なし、送り仮名は `okuri-`、添え仮名は `soe-` で書く。
 * JSON の値を持つ属性 (ext、custom) は `skam:` 名前空間、placement-hint は SKAM の要素自身の属性なので接頭辞なし
 */
const FREE_DATA_ATTRIBUTE_NAMES = {
  self: { ext: 'skam:ext', custom: 'skam:custom', hint: 'placement-hint' },
  yomi: { ext: 'skam:ext', custom: 'skam:custom', hint: 'placement-hint' },
  okuri: { ext: 'skam:okuri-ext', custom: 'skam:okuri-custom', hint: 'okuri-placement-hint' },
  soe: { ext: 'skam:soe-ext', custom: 'skam:soe-custom', hint: 'soe-placement-hint' },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * JSON の値を属性に書く。`JSON.stringify` は U+FFFE と U+FFFF を `\u` にしないので、JSON として同じ値の
 * 6 文字の列 (バックスラッシュ、`u`、16 進の 4 桁 `fffe` / `ffff`) に置き換える。
 * U+0000〜U+001F と対の無いサロゲートは `JSON.stringify` が `\u` で書くので、属性に生の制御文字は入らない
 */
function jsonAttribute(name: string, value: unknown): string {
  const json = JSON.stringify(value)
    .replace(new RegExp('\\uFFFE', 'g'), '\\ufffe')
    .replace(new RegExp('\\uFFFF', 'g'), '\\uffff');
  return ` ${name}="${escapeXml(json)}"`;
}

/**
 * ext のうち属性として書くキーのオブジェクト。`__proto__` のキーでも持ち主の prototype を書き換えないよう、
 * `defineProperty` で自分のキーとして足す。値が undefined のキーは JSON に出ないので数えない
 */
function extToWrite(
  ext: unknown,
  written: ReadonlySet<string> | undefined
): Record<string, unknown> | undefined {
  if (!isRecord(ext)) return undefined;
  const rest: Record<string, unknown> = {};
  let found = false;
  for (const [key, value] of Object.entries(ext)) {
    if (value === undefined || written?.has(key)) continue;
    Object.defineProperty(rest, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    found = true;
  }
  return found ? rest : undefined;
}

function markFreeDataAttributes(
  ctx: StringifyContext,
  mark: Mark,
  part: 'self' | 'yomi' | 'okuri' | 'soe'
): string {
  const names = FREE_DATA_ATTRIBUTE_NAMES[part];
  let xml = '';
  const consumed = ctx.extension.consumed.get(mark);
  const ext = extToWrite(mark.ext, consumed);
  if (ext) {
    xml += jsonAttribute(names.ext, ext);
    const written = consumed ?? new Set<string>();
    for (const key of Object.keys(ext)) written.add(key);
    ctx.extension.consumed.set(mark, written);
  }
  if (isRecord(mark.custom) && hasKeys(mark.custom)) {
    xml += jsonAttribute(names.custom, mark.custom);
  }
  if (typeof mark.placementHint === 'string') {
    xml += ` ${names.hint}="${escapeXml(mark.placementHint)}"`;
  }
  return xml;
}

/** 注記でない持ち主 (文書、ブロック、字、reading) の `skam:ext` / `skam:custom` */
function ownerDataAttributes(owner: {
  ext?: Record<string, unknown>;
  custom?: Record<string, unknown>;
}): string {
  let xml = '';
  const ext = extToWrite(owner.ext, undefined);
  if (ext) xml += jsonAttribute(FREE_DATA_ATTRIBUTE_NAMES.self.ext, ext);
  if (isRecord(owner.custom) && hasKeys(owner.custom)) {
    xml += jsonAttribute(FREE_DATA_ATTRIBUTE_NAMES.self.custom, owner.custom);
  }
  return xml;
}

/** `<skam:t>` の属性。空なら、字は平文で書ける */
function tokenElementAttributes(token: Token): string {
  return idAttribute(token.id) + ownerDataAttributes(token);
}

function hasOwnExtension(mark: Mark, name: string): boolean {
  return mark.ext !== undefined && Object.hasOwn(mark.ext, name) && mark.ext[name] !== undefined;
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

/**
 * Token ごとの位置の注記 (kaeri / kutoten / ref / br) を収集する。
 * anchor を持つ注記はすべて範囲の要素として collectRangeMarks が集める (単字の注記も範囲の要素の 1 つ)
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
    }
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

function toSyntheticKunMark(group: KunGroup): KunRangeSyntheticMark {
  const syntheticMark: KunRangeSyntheticMark = {
    type: '__kun_range',
    anchor: { from: group.from, to: group.to },
    sources: group.sources,
  };
  if (group.yomi) syntheticMark.yomi = group.yomi;
  if (group.okuri) syntheticMark.okuri = group.okuri;
  if (group.soe) syntheticMark.soe = group.soe;
  return syntheticMark;
}

/** 範囲の token の通し位置の昇順に並べたときの、前から見て最初の別の anchor の位置 */
function firstOfOtherAnchor(rangeMarks: readonly RangeMark[], position: number): number {
  const self = rangeMarks[position]!;
  let next = position + 1;
  while (
    next < rangeMarks.length &&
    rangeMarks[next]!.startIndex === self.startIndex &&
    rangeMarks[next]!.endIndex === self.endIndex
  ) {
    next++;
  }
  return next;
}

/** 複数トークンにまたがる kun 系マークをグループ化して合成マークを生成 (単字の kun 系マークも 1 つのまとまりにする) */
function collectKunRangeGroups(
  marks: Mark[],
  tokenIndexMap: Map<string, number>,
  ctx: StringifyContext
): RangeMark[] {
  const kunGroups = new Map<string, KunGroup>();

  for (const mark of marks) {
    if (mark.type !== 'yomigana' && mark.type !== 'okurigana' && mark.type !== 'soegana') continue;

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

  return [...kunGroups.values()].map((group) => ({
    mark: toSyntheticKunMark(group),
    startIndex: group.startIndex,
    endIndex: group.endIndex,
  }));
}

/** 包む要素 (okimoji / joji / okototen / saidoku) を範囲マークとして集める (単字のものも含む) */
function collectWrapperRanges(
  marks: Mark[],
  tokenIndexMap: Map<string, number>,
  ctx: StringifyContext
): RangeMark[] {
  const result: RangeMark[] = [];
  const seen = new Set<string>();
  for (const mark of marks) {
    if (!WRAPPER_TYPES.has(mark.type) || !isAnchorBasedMark(mark)) continue;
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

/** 同じ順位の span の種類の並び。tateten、emphasis、highlight の順 */
function spanKindRank(type: string): number {
  if (type === 'emphasis') return 1;
  if (type === 'highlight') return 2;
  return 0;
}

/**
 * anchor を持つ注記をすべて範囲マークとして集め、(始まりの位置の昇順、終わりの位置の降順、§7.0 の入れ子順、
 * tateten・emphasis・highlight の順、marks の添字) に並べる。単字の注記も範囲の要素の 1 つとして扱う。
 * 読みだけの範囲の内側に別の範囲があれば、`<skam:yomigana>` で書く合成マークにする
 */
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
  rangeMarks.push(...collectKunRangeGroups(marks, tokenIndexMap, ctx));

  // 並べ替えの鍵は 1 回ずつ計算する (比較のたびに添字を求めない)
  const keyed = rangeMarks.map((rm) => ({
    rm,
    rank: nestingRank(nestingNameOf(rm.mark.type)),
    span: spanKindRank(rm.mark.type),
    index: rangeMarkIndex(rm, ctx),
  }));
  keyed.sort(
    (x, y) =>
      x.rm.startIndex - y.rm.startIndex ||
      y.rm.endIndex - x.rm.endIndex ||
      x.rank - y.rank ||
      x.span - y.span ||
      x.index - y.index
  );
  const sorted = keyed.map((entry) => entry.rm);

  // 読みだけの範囲の内側に、別の anchor の範囲があるか。後ろから見た終わりの位置の最小で、並べ替えの線形の走査で決める
  const minEndFrom: number[] = Array.from({ length: sorted.length + 1 }, () => Infinity);
  for (let k = sorted.length - 1; k >= 0; k--) {
    minEndFrom[k] = Math.min(minEndFrom[k + 1]!, sorted[k]!.endIndex);
  }
  sorted.forEach((rm, position) => {
    if (rm.mark.type !== '__kun_range' || rm.startIndex === rm.endIndex) return;
    const kun = rm.mark as KunRangeSyntheticMark;
    if (!isYomiOnlyKun(kun)) return;
    if (minEndFrom[firstOfOtherAnchor(sorted, position)]! <= rm.endIndex) {
      kun.type = '__yomigana_range';
    }
  });
  return sorted;
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

/** 合成マークは元の mark ごとに、そうでなければ mark 自身を返す */
function sourcesOf(mark: Mark | KunRangeSyntheticMark): Mark[] {
  return 'sources' in mark ? mark.sources : [mark];
}

/** 範囲マークが表 (§7.0) の中で親になるときのキー */
function contentModelKeyOf(mark: Mark | KunRangeSyntheticMark): ContentModelKey {
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
    case 'tateten':
      return 'tateten';
    default:
      return 'span';
  }
}

/** 範囲マークが子になるときの要素名 */
function childNameOfRange(mark: Mark | KunRangeSyntheticMark): string {
  return nestingNameOf(mark.type);
}

function isYomiOnlyKun(kun: KunRangeSyntheticMark): boolean {
  return Boolean(kun.yomi) && !kun.okuri && !kun.soe;
}

function isSoeOnlyKun(kun: KunRangeSyntheticMark): boolean {
  return Boolean(kun.soe) && !kun.yomi && !kun.okuri;
}

/** 同じ anchor の同じ種類の範囲マークのまとまり。入れ子にするか対にするかは、まとまりごとに決める */
interface RangeGroup {
  units: RangeMark[];
  /** mark の type。yomigana・okurigana・soegana のまとまり (合成マーク) は 'kun' */
  type: string;
  startIndex: number;
  endIndex: number;
  /** 入れ子にしたときに足す範囲の要素の段数。kun のまとまりは 1 段、saidoku は 0 段 */
  depth: number;
}

function groupRangeMarks(units: readonly RangeMark[]): RangeGroup[] {
  const groups: RangeGroup[] = [];
  for (const unit of units) {
    const type = 'sources' in unit.mark ? 'kun' : unit.mark.type;
    const last = groups[groups.length - 1];
    if (
      last &&
      last.type === type &&
      last.startIndex === unit.startIndex &&
      last.endIndex === unit.endIndex
    ) {
      last.units.push(unit);
      if (type !== 'kun' && type !== 'saidoku') last.depth += 1;
      continue;
    }
    groups.push({
      units: [unit],
      type,
      startIndex: unit.startIndex,
      endIndex: unit.endIndex,
      depth: type === 'saidoku' ? 0 : 1,
    });
  }
  return groups;
}

/** 昇順の配列で、value 以上の最初の位置 */
function lowerBound(sorted: readonly number[], value: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (sorted[middle]! < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** 開いている入れ子の範囲 (スタックの要素) */
interface OpenRange {
  endIndex: number;
  /** この範囲を含む、開いている範囲の要素の段数 */
  depth: number;
  key: ContentModelKey;
}

interface RangeForms {
  /** 入れ子の要素で書く範囲マーク。並べ替えの順 */
  nested: RangeMark[];
  /** 空要素の対で書く範囲マーク。並べ替えの順 */
  paired: RangeMark[];
}

function reportUnwritableRange(ctx: StringifyContext, unit: RangeMark, message: string): void {
  for (const source of sourcesOf(unit.mark)) {
    addMarkLoss(ctx, source, { category: 'unsupported', code: 'UNNESTABLE_OVERLAP', message });
  }
}

/**
 * ブロックの範囲マークを、入れ子の要素で書くものと空要素の対で書くものに分ける (K4)。
 * 並べ替えの順に、同じ anchor の同じ種類のまとまりを単位として、開いている入れ子の範囲のスタックの
 * 一番内側に含まれるか離れていて、入れ子にしたときの範囲の深さが上限以内なら入れ子、そうでなければ対にする。
 * 計算量は、並べ替えの n log n と、スタックとの比較 n。
 * 先に対と決めるのは、再読文字の字を含む添え仮名だけのまとまり。saidoku は対にしない:
 * 入れ子にできないのは、再読文字と読みが重なる文書か、複数の字の saidoku だけで、そのときは損失にする
 */
// oxlint-disable-next-line eslint/complexity
function chooseRangeForms(units: readonly RangeMark[], ctx: StringifyContext): RangeForms {
  const nested: RangeMark[] = [];
  const paired: RangeMark[] = [];
  const saidokuAt = units
    .filter((unit) => unit.mark.type === 'saidoku' && unit.startIndex === unit.endIndex)
    .map((unit) => unit.startIndex);
  const hasSaidokuIn = (from: number, to: number): boolean => {
    const position = lowerBound(saidokuAt, from);
    return position < saidokuAt.length && saidokuAt[position]! <= to;
  };

  const stack: OpenRange[] = [];
  for (const group of groupRangeMarks(units)) {
    while (stack.length > 0 && stack[stack.length - 1]!.endIndex < group.startIndex) stack.pop();
    const top = stack[stack.length - 1];
    const contained = top === undefined || group.endIndex <= top.endIndex;
    const first = group.units[0]!;

    if (group.type === 'saidoku') {
      if (
        !contained ||
        (top !== undefined && !SKAM_ML_CONTENT_MODEL[top.key].includes('saidoku'))
      ) {
        for (const unit of group.units) {
          reportUnwritableRange(
            ctx,
            unit,
            `${describeRangeMark(unit)} cannot be nested in the range that encloses it (SKAM-ML §7.0)`
          );
        }
        continue;
      }
      nested.push(...group.units);
      stack.push({ endIndex: group.endIndex, depth: top?.depth ?? 0, key: 'base' });
      continue;
    }

    if (
      group.type === 'kun' &&
      group.endIndex > group.startIndex &&
      hasSaidokuIn(group.startIndex, group.endIndex)
    ) {
      if (isSoeOnlyKun(first.mark as KunRangeSyntheticMark)) {
        // kun の要素は saidoku を子に持てないので、入れ子の範囲の集まりに入れずに対で書く
        paired.push(...group.units);
      } else {
        for (const unit of group.units) {
          reportUnwritableRange(
            ctx,
            unit,
            `${describeRangeMark(unit)} contains a saidoku, which a reading cannot contain (SKAM-ML §7.0)`
          );
        }
      }
      continue;
    }

    const depth = (top?.depth ?? 0) + group.depth;
    const allowed =
      top === undefined || SKAM_ML_CONTENT_MODEL[top.key].includes(childNameOfRange(first.mark));
    if (!contained || !allowed || depth > SKAM_ML_MAX_RANGE_DEPTH) {
      paired.push(...group.units);
      continue;
    }
    nested.push(...group.units);
    stack.push({ endIndex: group.endIndex, depth, key: contentModelKeyOf(first.mark) });
  }
  return { nested, paired };
}

// ============================================================================
// Which tokens need <skam:t>
// ============================================================================

/**
 * 平文で続けて書いた字の並び (同じテキストノードになる) が、parser の `tokenizePlainText` で
 * 元の text の並びに戻るか
 */
function isReadBackAs(texts: readonly string[]): boolean {
  const pieces = tokenizePlainText(texts.join(''));
  return pieces.length === texts.length && pieces.every((piece, i) => piece.text === texts[i]);
}

/**
 * 同じテキストノードに平文で続けて書く字の並びのうち、`<skam:t>` で書く字の添字。
 * 1 字で戻らない字 (2 書記素以上、空白だけ、空白で始まる) と、前の字と結合する字 (結合する組は後ろの字) を
 * 左から順に選ぶ。`<skam:t>` は要素なのでテキストノードを区切り、その次の字から並びが新しくなる。
 * 選んだ後に並びごとに全体を確かめ、前の字との組だけでは見つからない結合 (まれ) は 1 字ずつ伸ばして探す
 */
function findTextsNeedingElement(texts: readonly string[]): Set<number> {
  const needed = new Set<number>();
  let runStart = 0;
  texts.forEach((text, i) => {
    const unreadable =
      !isReadBackAs([text]) || (i > runStart && !isReadBackAs([texts[i - 1]!, text]));
    if (unreadable) {
      needed.add(i);
      runStart = i + 1;
    }
  });

  let start = 0;
  for (let end = 0; end <= texts.length; end++) {
    if (end < texts.length && !needed.has(end)) continue;
    if (end > start && !isReadBackAs(texts.slice(start, end))) {
      let from = start;
      for (let j = start + 1; j < end; j++) {
        if (!isReadBackAs(texts.slice(from, j + 1))) {
          needed.add(j);
          from = j + 1;
        }
      }
    }
    start = end + 1;
  }
  return needed;
}

/**
 * 字ごとに、`<skam:t>` で書くかを決める。boundaries[i] は i 番目の字の前に出す要素 (開閉のタグ、対の要素、
 * 位置の注記) で、空でなければテキストノードを区切る。平文のまま隣り合う字 (間が空の字) は 1 つのテキストノードになり、
 * parser が 1 回の `tokenizePlainText` で分ける。手書きの id、ext、custom を持つ字は常に `<skam:t>` で書く
 */
function decideTokenElements(tokens: readonly Token[], boundaries: readonly string[]): boolean[] {
  const asElement: boolean[] = tokens.map(() => false);
  let run: number[] = [];
  const flush = (): void => {
    const needed = findTextsNeedingElement(run.map((index) => tokens[index]!.text));
    run.forEach((index, order) => {
      if (needed.has(order)) asElement[index] = true;
    });
    run = [];
  };
  tokens.forEach((token, index) => {
    if (boundaries[index] !== '') flush();
    if (tokenElementAttributes(token) !== '') {
      flush();
      asElement[index] = true;
    } else {
      run.push(index);
    }
  });
  flush();
  return asElement;
}

// ============================================================================
// XML Generation
// ============================================================================

const KUN_PART_OF_TYPE: ReadonlyMap<string, 'yomi' | 'okuri' | 'soe'> = new Map([
  ['yomigana', 'yomi'],
  ['okurigana', 'okuri'],
  ['soegana', 'soe'],
]);

const KUN_ID_ORDER: ReadonlyMap<string, number> = new Map([
  ['yomigana', 0],
  ['okurigana', 1],
  ['soegana', 2],
]);

/**
 * `<skam:kun>` は yomigana / okurigana / soegana を 1 つの要素にまとめて書くので、`xml:id` は 1 つしか書けない。
 * parser は `xml:id` を yomigana、okurigana、soegana の順で最初に作る注記に付けるので、書くのも同じ順で最初の注記の id。
 * 2 つ目以降の手書きの id は `ID_FORM` の損失 (`findIdFormIssues`) で報告するので、ここでは書かない
 */
function kunIdAttribute(sources: readonly Mark[]): string {
  const ordered = [...sources].sort(
    (a, b) => (KUN_ID_ORDER.get(a.type) ?? 0) - (KUN_ID_ORDER.get(b.type) ?? 0)
  );
  return idAttribute(ordered[0]?.id);
}

/**
 * trailing marks（kaeri/kutoten/ref/linebreak）の XML を生成
 */
function tokenTrailingToXml(annotation: TokenAnnotation, ctx: StringifyContext): string {
  const { kaeriAfter, kutotenAfter, refAfter, linebreakAfter } = annotation;
  let xml = '';

  if (kaeriAfter) {
    for (const kaeri of kaeriAfter) {
      const kind = kaeriValueToKind(kaeri.value);
      const extension = extensionAttributes(ctx, 'skam:kaeri', [{ part: 'self', mark: kaeri }]);
      xml += `<skam:kaeri kind="${escapeXml(kind)}"${idAttribute(kaeri.id)}${extension}/>`;
    }
  }

  if (kutotenAfter) {
    for (const kutoten of kutotenAfter) {
      let attrs = `value="${escapeXml(kutoten.value)}"`;
      if (kutoten.kind) {
        attrs += ` kind="${kutoten.kind}"`;
      }
      attrs += idAttribute(kutoten.id);
      attrs += extensionAttributes(ctx, 'skam:kutoten', [{ part: 'self', mark: kutoten }]);
      xml += `<skam:kutoten ${attrs}/>`;
    }
  }

  if (refAfter) {
    for (const ref of refAfter) {
      // id のない ref の content は notes に出せないので、インラインに出力する
      xml += refMarkToXml(ref, !(ref.content && !isHandId(ref.id ?? '')), ctx);
    }
  }

  // linebreak は未知のフィールドを書かない。位置の正しさは検査しない (validator の役目)
  if (linebreakAfter) {
    for (const linebreak of linebreakAfter) {
      const attrs = extensionAttributes(ctx, 'skam:br', [{ part: 'self', mark: linebreak }], false);
      xml += `<skam:br${idAttribute(linebreak.id)}${attrs}/>`;
    }
  }

  return xml;
}

/** 字を包む要素 (okimoji / joji / okototen / saidoku) の開始タグの属性 (先頭に空白を含む) */
function wrapperAttributes(
  mark: OkimojiMark | JojiMark | OkototenMark | SaidokuMark,
  ctx: StringifyContext
): string {
  const extension =
    idAttribute(mark.id) + extensionAttributes(ctx, `skam:${mark.type}`, [{ part: 'self', mark }]);
  if (mark.type === 'okototen') {
    let attrs = `grid="${escapeXml(mark.position.grid)}" x="${mark.position.x}" y="${mark.position.y}" shape="${escapeXml(mark.shape)}"`;
    if (mark.sound) attrs += ` sound="${escapeXml(mark.sound)}"`;
    if (mark.color) attrs += ` color="${escapeXml(mark.color)}"`;
    return ` ${attrs}${extension}`;
  }
  return extension;
}

/**
 * ref マークを XML に変換
 */
function refMarkToXml(ref: RefMark, isEmpty: boolean, ctx: StringifyContext): string {
  let attrs = idAttribute(ref.id);

  if (ref.label) {
    attrs += ` label="${escapeXml(ref.label)}"`;
  } else if (ref.format) {
    attrs += ` format="${escapeXml(ref.format)}"`;
  }
  attrs += extensionAttributes(ctx, 'skam:ref', [{ part: 'self', mark: ref }], false);

  if (isEmpty || !ref.content) {
    return `<skam:ref${attrs}/>`;
  } else {
    return `<skam:ref${attrs}>${escapeText(ref.content)}</skam:ref>`;
  }
}

/**
 * highlight の要素の属性。parser は `ref` 属性だけで ref と結ぶので、`highlight.ref` がある highlight にだけ書く。
 * 手書きの id の ref を指さない `highlight.ref` は書けない (ID_FORM の損失)
 */
function highlightAttributes(hl: HighlightMark, ctx: StringifyContext): string {
  let attrs = 'type="highlight"';
  if (hl.style) {
    attrs += ` style="${hl.style}"`;
  }
  attrs += idAttribute(hl.id);
  if (hl.ref !== undefined && ctx.handRefIds.has(hl.ref)) {
    attrs += ` ref="${escapeXml(hl.ref)}"`;
  }
  // 拡張の名前空間の属性は parser が span の上で受けないので、ext は skam:ext に書く
  attrs += extensionAttributes(ctx, 'skam:span', [{ part: 'self', mark: hl }], false);
  return attrs;
}

/** 範囲の要素の名前と属性 (先頭に空白を含む)。入れ子の形と対の始まりの要素で同じ */
function rangeTag(
  mark: Mark | KunRangeSyntheticMark,
  ctx: StringifyContext,
  asPair: boolean
): { name: string; attrs: string } {
  switch (mark.type) {
    case '__kun_range':
    case '__yomigana_range': {
      const kun = mark as KunRangeSyntheticMark;
      if (mark.type === '__yomigana_range' && !asPair) {
        const source = kun.sources.find((candidate) => candidate.type === 'yomigana');
        const extension = source
          ? idAttribute(source.id) +
            extensionAttributes(ctx, 'skam:yomigana', [{ part: 'self', mark: source }])
          : '';
        return { name: 'yomigana', attrs: ` value="${escapeXml(kun.yomi ?? '')}"${extension}` };
      }
      const attrs: string[] = [];
      if (kun.yomi) attrs.push(`yomi="${escapeXml(kun.yomi)}"`);
      if (kun.okuri) attrs.push(`okuri="${escapeXml(kun.okuri)}"`);
      if (kun.soe) attrs.push(`soe="${escapeXml(kun.soe)}"`);
      const parts = kun.sources.flatMap((source) => {
        const part = KUN_PART_OF_TYPE.get(source.type);
        return part === undefined ? [] : [{ part, mark: source }];
      });
      const extension = kunIdAttribute(kun.sources) + extensionAttributes(ctx, 'skam:kun', parts);
      return { name: 'kun', attrs: ` ${attrs.join(' ')}${extension}` };
    }
    case 'emphasis': {
      const emp = mark as EmphasisMark;
      let attrs = ' type="emphasis"';
      if (emp.style) {
        attrs += ` style="${escapeXml(emp.style)}"`;
      }
      attrs += idAttribute(emp.id);
      attrs += extensionAttributes(ctx, 'skam:span', [{ part: 'self', mark: emp }], false);
      return { name: 'span', attrs };
    }
    case 'tateten': {
      const extension =
        idAttribute(mark.id) +
        extensionAttributes(ctx, 'skam:tateten', [{ part: 'self', mark: mark as TatetenMark }]);
      return { name: 'tateten', attrs: extension };
    }
    case 'highlight':
      return { name: 'span', attrs: ` ${highlightAttributes(mark as HighlightMark, ctx)}` };
    default:
      return {
        name: mark.type,
        attrs: wrapperAttributes(mark as OkimojiMark | JojiMark | OkototenMark, ctx),
      };
  }
}

/** 入れ子の形の開始タグと終了タグ */
function nestedTags(
  mark: Mark | KunRangeSyntheticMark,
  ctx: StringifyContext
): { open: string; close: string } {
  if (mark.type === 'saidoku') {
    const saidoku = mark as SaidokuMark;
    let formsXml = '';
    for (const form of saidoku.forms) {
      let formAttrs = '';
      if (form.n !== undefined) formAttrs += ` n="${form.n}"`;
      if (form.yomi) formAttrs += ` yomi="${escapeXml(form.yomi)}"`;
      if (form.okuri) formAttrs += ` okuri="${escapeXml(form.okuri)}"`;
      formsXml += `<skam:kunform${formAttrs}/>`;
    }
    return {
      open: `<skam:saidoku${wrapperAttributes(saidoku, ctx)}><skam:base>`,
      close: `</skam:base>${formsXml}</skam:saidoku>`,
    };
  }
  const { name, attrs } = rangeTag(mark, ctx, false);
  return { open: `<skam:${name}${attrs}>`, close: `</skam:${name}>` };
}

/** 空要素の対の始まりの要素と終わりの要素。始まりの要素は入れ子の形と同じ属性に sID を足し、終わりの要素は eID だけ */
function pairTags(
  mark: Mark | KunRangeSyntheticMark,
  id: string,
  ctx: StringifyContext
): { start: string; end: string } {
  const { name, attrs } = rangeTag(mark, ctx, true);
  return { start: `<skam:${name}${attrs} sID="${id}"/>`, end: `<skam:${name} eID="${id}"/>` };
}

/**
 * ブロックごとの範囲マークを取り出す関数。範囲マークは始まりの位置の昇順に並んでいるので、
 * ブロックの順に前から 1 回ずつ走査する (ブロックごとに全体を絞り込まない)
 */
function rangeMarksTaker(
  rangeMarks: readonly RangeMark[]
): (startIndex: number, endIndex: number) => RangeMark[] {
  let cursor = 0;
  return (startIndex, endIndex) => {
    while (cursor < rangeMarks.length && rangeMarks[cursor]!.startIndex < startIndex) cursor++;
    const taken: RangeMark[] = [];
    while (cursor < rangeMarks.length && rangeMarks[cursor]!.startIndex <= endIndex) {
      const unit = rangeMarks[cursor]!;
      if (unit.endIndex <= endIndex) taken.push(unit);
      cursor++;
    }
    return taken;
  };
}

function pushTo(map: Map<number, string[]>, key: number, value: string): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * ブロックの XML を生成
 *
 * 字と字の間に出すものの順は、閉じるタグ、終わりの要素 (r の降順)、位置の注記、始まりの要素 (r の昇順)、開くタグ。
 * ブロックの先頭は、位置の注記、始まりの要素、開くタグ
 */
function blockToXml(
  block: Block,
  blockTokens: Token[],
  annotations: Map<string, TokenAnnotation>,
  blockRangeMarks: RangeMark[],
  blockStartIndex: number,
  indentLevel: number,
  indentSize: number,
  ctx: StringifyContext,
  startMarks: BlockStartMarks | undefined
): string {
  const ind = indentStr(indentLevel, indentSize);
  const count = blockTokens.length;

  const forms = chooseRangeForms(blockRangeMarks, ctx);
  const openAt = new Map<number, string[]>();
  const closeAt = new Map<number, string[]>();
  const pairStartAt = new Map<number, string[]>();
  const pairEndAt = new Map<number, string[]>();
  const local = (unit: RangeMark): { from: number; to: number } | undefined => {
    const from = unit.startIndex - blockStartIndex;
    const to = unit.endIndex - blockStartIndex;
    return from >= 0 && to < count ? { from, to } : undefined;
  };
  for (const unit of forms.nested) {
    const at = local(unit);
    if (!at) continue;
    const { open, close } = nestedTags(unit.mark, ctx);
    pushTo(openAt, at.from, open);
    pushTo(closeAt, at.to, close);
  }
  // 対の番号は、始まりの要素の文書の順
  for (const unit of forms.paired) {
    const at = local(unit);
    if (!at) continue;
    const { start, end } = pairTags(unit.mark, `r${ctx.nextPairNumber++}`, ctx);
    pushTo(pairStartAt, at.from, start);
    pushTo(pairEndAt, at.to, end);
  }

  const reversed = (map: Map<number, string[]>, key: number): string =>
    (map.get(key) ?? []).slice().reverse().join('');
  const joined = (map: Map<number, string[]>, key: number): string => (map.get(key) ?? []).join('');
  const trailingOf = (index: number): string => {
    const token = blockTokens[index];
    const annotation = token ? annotations.get(token.id) : undefined;
    return annotation ? tokenTrailingToXml(annotation, ctx) : '';
  };

  // boundaries[i] は i 番目の字の前、boundaries[count] は最後の字の後ろに出すもの
  const boundaries: string[] = [];
  for (let index = 0; index <= count; index++) {
    let text = '';
    if (index === 0) {
      if (startMarks) text += tokenTrailingToXml(startMarks, ctx);
    } else {
      text += reversed(closeAt, index - 1) + reversed(pairEndAt, index - 1) + trailingOf(index - 1);
    }
    if (index < count) text += joined(pairStartAt, index) + joined(openAt, index);
    boundaries.push(text);
  }

  const asElement = decideTokenElements(blockTokens, boundaries);
  let content = '';
  blockTokens.forEach((token, index) => {
    content += boundaries[index]!;
    content += asElement[index]
      ? `<skam:t${tokenElementAttributes(token)}>${escapeText(token.text)}</skam:t>`
      : escapeText(token.text);
  });
  content += boundaries[count]!;

  const attrs = idAttribute(block.id) + ownerDataAttributes(block);
  if (content === '') {
    return `${ind}<skam:block${attrs}/>`;
  }
  return `${ind}<skam:block${attrs}>${content}</skam:block>`;
}

function readingToXml(reading: Reading, indentSize: number): string {
  // parser は xml:space="preserve" が無いと前後の空白を削るので、空白がある text にはこの印を書く
  const space = reading.text === reading.text.trim() ? '' : ' xml:space="preserve"';
  const attrs = ` kind="${escapeXml(reading.kind)}"${space}${ownerDataAttributes(reading)}`;
  return `${indentStr(2, indentSize)}<skam:reading${attrs}>${escapeText(reading.text)}</skam:reading>`;
}

/**
 * 分離定義の注釈（skam:notes）を生成
 */
function stringifyNotes(marks: Mark[], indentSize: number): string[] {
  // content を持つ ref マークを収集
  const notesRefs = marks.filter(
    (m) => m.type === 'ref' && (m as RefMark).content && isHandId((m as RefMark).id ?? '')
  ) as RefMark[];

  if (notesRefs.length === 0) {
    return [];
  }

  const lines: string[] = [];
  lines.push(`${indentStr(1, indentSize)}<skam:notes>`);

  for (const ref of notesRefs) {
    if (ref.content && ref.id && isHandId(ref.id)) {
      lines.push(
        `${indentStr(2, indentSize)}<skam:note ref="${escapeXml(ref.id)}">${escapeText(ref.content)}</skam:note>`
      );
    }
  }

  lines.push(`${indentStr(1, indentSize)}</skam:notes>`);
  return lines;
}

// ============================================================================
// Loss Recording
// ============================================================================

/** 宣言した拡張の名前 (文字列だけ、宣言の順) */
function declaredExtensionNames(doc: SKAMDocument): string[] {
  return Array.isArray(doc.extensions) ? doc.extensions.filter(isExtensionName) : [];
}

/** 宣言した拡張の名前空間の URI。定義か登録簿に無ければ undefined (書き方も名前空間も分からない) */
function extensionUri(
  name: string,
  definitions: ReadonlyMap<string, SKAMExtensionDefinition>
): string | undefined {
  return definitions.get(name)?.uri ?? extensionRegistry.find((entry) => entry.name === name)?.uri;
}

function createContext(
  doc: SKAMDocument,
  definitions: ReadonlyMap<string, SKAMExtensionDefinition>
): StringifyContext {
  const markIndexMap = new Map<Mark, number>();
  doc.marks.forEach((mark, i) => markIndexMap.set(mark, i));

  const tokenPosition = new Map<string, { blockIndex: number; tokenIndex: number }>();
  doc.blocks.forEach((block, blockIndex) => {
    block.tokenIds.forEach((id, tokenIndex) => tokenPosition.set(id, { blockIndex, tokenIndex }));
  });

  const blockIndexById = new Map(doc.blocks.map((block, i) => [block.id, i] as const));

  const writers = new Map<string, SKAMExtensionDefinition>();
  for (const name of declaredExtensionNames(doc)) {
    const definition = definitions.get(name);
    if (definition?.writeXmlAttributes) writers.set(name, definition);
  }

  const handRefIds = new Set<string>();
  for (const mark of doc.marks) {
    if (mark.type === 'ref' && mark.id !== undefined && isHandId(mark.id)) handRefIds.add(mark.id);
  }

  return {
    collector: new LossCollector(),
    markIndexMap,
    tokenPosition,
    blockIndexById,
    extension: { writers, consumed: new Map() },
    handRefIds,
    nextPairNumber: 1,
  };
}

function hasKeys(value: Record<string, unknown> | undefined): value is Record<string, unknown> {
  return value !== undefined && Object.keys(value).length > 0;
}

/**
 * XML に書き場所のない derivations の欠落を記録する (SKAM-ML-draft §4.2)。
 * ext / custom / placementHint は持ち主の要素の属性に書くので、ここでは扱わない
 */
function recordDerivationsLoss(doc: SKAMDocument, ctx: StringifyContext): void {
  if (!doc.derivations || doc.derivations.length === 0) return;
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

/**
 * validator の警告の path (`tokens[0].text`) を JSON Pointer (`/tokens/0/text`) にして、損失として記録する。
 * 警告と同じ所を指すので、判定は `findIdFormIssues` と `findXmlUnwritableChars` の結果だけを使う
 */
function recordPathLoss(
  doc: SKAMDocument,
  ctx: StringifyContext,
  warningPath: string,
  loss: Pick<StringifyLoss, 'category' | 'code' | 'message'>
): void {
  const head = /^(blocks|tokens|marks|readings)\[(\d+)\]/.exec(warningPath);
  const path = warningPath.replace(/\[(\d+)\]/g, '/$1').replace(/\./g, '/');
  const entry: StringifyLoss = { ...loss, path: path.startsWith('/') ? path : `/${path}` };
  const index = head ? Number(head[2]) : -1;
  let key: LossSortKey = {
    blockIndex: UNPLACED,
    tokenIndex: UNPLACED,
    markIndex: index,
    fieldOrder: 0,
  };
  if (head?.[1] === 'blocks') {
    key = { blockIndex: index, tokenIndex: -1, markIndex: -1, fieldOrder: 0 };
  } else if (head?.[1] === 'tokens') {
    const pos = ctx.tokenPosition.get(doc.tokens[index]?.id ?? '');
    key = {
      blockIndex: pos?.blockIndex ?? UNPLACED,
      tokenIndex: pos?.tokenIndex ?? UNPLACED,
      markIndex: -1,
      fieldOrder: 0,
    };
  } else if (head?.[1] === 'marks') {
    const mark = doc.marks[index];
    if (mark) {
      key = markSortKey(ctx, mark);
      if (mark.id) entry.markId = mark.id;
    }
  }
  ctx.collector.add(entry, key);
}

/** id の形が合わない所 (`ID_FORM`) と、XML に書けない文字 (`XML_UNWRITABLE_CHAR`) を損失にする */
function recordIdAndCharLosses(doc: SKAMDocument, ctx: StringifyContext): void {
  for (const issue of findIdFormIssues(doc)) {
    recordPathLoss(doc, ctx, issue.path, {
      category: 'unrepresentable',
      code: 'ID_FORM',
      message:
        'This id or reference cannot be written to SKAM-ML: an id is neither an XML NCName nor the automatic form for its position, a highlight ref does not point to a ref mark with a hand-written id, or a hand-written id is on the second or later of the yomigana, okurigana and soegana marks on one anchor',
    });
  }
  for (const issue of findXmlUnwritableChars(doc)) {
    recordPathLoss(doc, ctx, issue.path, {
      category: 'unrepresentable',
      code: 'XML_UNWRITABLE_CHAR',
      message: 'This string contains a character that XML 1.0 cannot represent',
    });
  }
}

interface ExtensionDeclaration {
  name: string;
  /** 登録簿にも定義にも無い拡張は、`uri` を省いて名前だけで宣言する */
  uri: string | undefined;
  required: boolean;
}

/**
 * 宣言のある文書は、拡張を名前で宣言する。名前空間の URI が分かる拡張には `uri` を書き、
 * 登録簿にも定義にも無い拡張は `uri` を省く (値は `skam:ext` に書く)。名前が拡張の名前の形でない拡張は、
 * 宣言も値も書けないので損失にする。名前だけの宣言の `required` は parser が読めないので書かず、損失にする
 */
function collectDeclarations(
  doc: SKAMDocument,
  definitions: ReadonlyMap<string, SKAMExtensionDefinition>,
  ctx: StringifyContext
): ExtensionDeclaration[] {
  const declarations: ExtensionDeclaration[] = [];
  const names: unknown[] = Array.isArray(doc.extensions) ? doc.extensions : [];
  names.forEach((name, index) => {
    const addLoss = (message: string): void =>
      ctx.collector.add(
        {
          category: 'unsupported',
          code: 'UNKNOWN_EXTENSION',
          path: `/extensions/${index}`,
          message,
        },
        { blockIndex: -1, tokenIndex: -1, markIndex: -1, fieldOrder: 2 }
      );
    if (!isExtensionName(name)) {
      addLoss('An extension whose name is invalid cannot be declared in SKAM-ML');
      return;
    }
    const uri = extensionUri(name, definitions);
    const required = Array.isArray(doc.extensionsRequired) && doc.extensionsRequired.includes(name);
    if (uri === undefined && required) {
      addLoss(
        'A required extension that is not known cannot be declared in SKAM-ML (a reader that does not know it must refuse the document)'
      );
    }
    declarations.push({ name, uri, required: required && uri !== undefined });
  });
  return declarations;
}

function metaLines(declarations: ExtensionDeclaration[], indentSize: number): string[] {
  if (declarations.length === 0)
    return [`${indentStr(1, indentSize)}<skam:meta tokenization="char"/>`];
  return [
    `${indentStr(1, indentSize)}<skam:meta tokenization="char">`,
    ...declarations.map(
      ({ name, uri, required }) =>
        `${indentStr(2, indentSize)}<skam:extension name="${escapeXml(name)}"${uri === undefined ? '' : ` uri="${escapeXml(uri)}"`}${required ? ' required="true"' : ''}/>`
    ),
    `${indentStr(1, indentSize)}</skam:meta>`,
  ];
}

// ============================================================================
// Main Stringify Function
// ============================================================================

/** stringify は validator を通らない JSON も受けるので、文字列だけを escape して書く */
function langAttribute(doc: SKAMDocument): string {
  return typeof doc.lang === 'string' ? ` xml:lang="${escapeXml(doc.lang)}"` : '';
}

/**
 * SKAMDocument を SKAM-ML/XML 文字列に変換
 *
 * @param doc SKAMDocument
 * @param options Stringify options
 * @returns XML string
 */
export function stringify(doc: SKAMDocument, options: StringifyOptions = {}): string {
  const { indent: indentSize = 2, xmlDeclaration = true, lossy = false, onLoss } = options;

  const definitions = resolveExtensions(options.extensions);
  const ctx = createContext(doc, definitions);
  recordDerivationsLoss(doc, ctx);
  recordIdAndCharLosses(doc, ctx);

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

  // 範囲マークを収集 (始まりの位置の昇順)
  const takeBlockRangeMarks = rangeMarksTaker(collectRangeMarks(doc.marks, tokenIndexMap, ctx));

  // XML を構築
  const lines: string[] = [];

  // XML 宣言
  if (xmlDeclaration) {
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  }

  const declarations = collectDeclarations(doc, definitions, ctx);

  // ルート要素開始
  const namespaces = declarations
    .flatMap(({ name, uri }) => (uri === undefined ? [] : [` xmlns:${name}="${escapeXml(uri)}"`]))
    .join('');
  lines.push(
    `<skam:doc xmlns:skam="${SKAM_NS}"${namespaces}${langAttribute(doc)}${ownerDataAttributes(doc)}>`
  );

  // meta 要素（常に char tokenization）
  lines.push(...metaLines(declarations, indentSize));

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

    const blockRangeMarks = takeBlockRangeMarks(
      blockStartIndex,
      blockStartIndex + blockTokens.length - 1
    );

    lines.push(
      blockToXml(
        block,
        blockTokens,
        annotations,
        blockRangeMarks,
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
    for (const reading of doc.readings) lines.push(readingToXml(reading, indentSize));
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
