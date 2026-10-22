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
}

const UNPLACED = Number.MAX_SAFE_INTEGER;

// Token に付随する mark 情報（単一トークン用）
interface TokenAnnotation {
  /** 読み仮名 */
  yomi?: string;
  /** 送り仮名 */
  okuri?: string;
  /** 添え仮名 */
  soe?: string;
  /** yomi / okuri / soe の元の注記 (拡張の属性を書くため) */
  yomiMark?: YomiganaMark;
  okuriMark?: OkuriganaMark;
  soeMark?: SoeganaMark;
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
  token: Token;
  /** 字を `<skam:t>` で書く (decideTokenElements が決める)。false なら平文で書く */
  asElement: boolean;
}

interface ElementNode {
  type: 'element';
  mark: Mark | KunRangeSyntheticMark;
  children: ContentNode[];
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
      else {
        annotation.yomi = (mark as YomiganaMark).value;
        annotation.yomiMark = mark as YomiganaMark;
      }
      break;
    case 'okurigana':
      if (annotation.okuri !== undefined) reportConflictingMark(ctx, mark);
      else {
        annotation.okuri = (mark as OkuriganaMark).value;
        annotation.okuriMark = mark as OkuriganaMark;
      }
      break;
    case 'soegana':
      if (annotation.soe !== undefined) reportConflictingMark(ctx, mark);
      else {
        annotation.soe = (mark as SoeganaMark).value;
        annotation.soeMark = mark as SoeganaMark;
      }
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
      token,
      asElement: false,
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

  decideTokenElements(result);
  return result;
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

/** 字が平文のまま書かれる (kun や包む要素の中に入らない) */
function isBareTextNode(node: TextNode): boolean {
  const { annotation } = node;
  return !(annotation.yomi || annotation.okuri || annotation.soe) && !annotation.wrappers?.length;
}

function hasTrailingMarks(annotation: TokenAnnotation): boolean {
  return Boolean(
    annotation.kaeriAfter ||
    annotation.kutotenAfter ||
    annotation.refAfter ||
    annotation.linebreakAfter
  );
}

/**
 * 木の兄弟の並びごとに、`<skam:t>` で書く字を決める (`asElement`)。
 * 平文のまま隣り合う字は 1 つのテキストノードになり、parser が 1 回の `tokenizePlainText` で分ける。
 * 要素の開閉タグ、位置の注記の要素、`<skam:t>`、kun と包む要素の中の字はテキストノードを区切るので、
 * 並びは兄弟のうち平文の字が続く範囲になる。手書きの id、ext、custom を持つ字は常に `<skam:t>` で書く
 */
function decideTokenElements(nodes: ContentNode[]): void {
  let run: TextNode[] = [];
  const flush = (): void => {
    const needed = findTextsNeedingElement(run.map((node) => node.text));
    run.forEach((node, i) => {
      if (needed.has(i)) node.asElement = true;
    });
    run = [];
  };
  for (const node of nodes) {
    if (node.type === 'element') {
      flush();
      decideTokenElements(node.children);
    } else if (tokenElementAttributes(node.token) !== '') {
      flush();
      node.asElement = true;
    } else if (!isBareTextNode(node)) {
      flush();
      node.asElement = !isReadBackAs([node.text]);
    } else {
      run.push(node);
      if (hasTrailingMarks(node.annotation)) flush();
    }
  }
  flush();
}

// ============================================================================
// XML Generation
// ============================================================================

const KUN_PART_OF_TYPE: ReadonlyMap<string, 'yomi' | 'okuri' | 'soe'> = new Map([
  ['yomigana', 'yomi'],
  ['okurigana', 'okuri'],
  ['soegana', 'soe'],
]);

/** 単字の `skam:kun` が作る注記と、その部分 */
function kunParts(annotation: TokenAnnotation): XmlElementMarks['marks'] {
  const parts: { part: 'yomi' | 'okuri' | 'soe'; mark: Mark }[] = [];
  if (annotation.yomiMark) parts.push({ part: 'yomi', mark: annotation.yomiMark });
  if (annotation.okuriMark) parts.push({ part: 'okuri', mark: annotation.okuriMark });
  if (annotation.soeMark) parts.push({ part: 'soe', mark: annotation.soeMark });
  return parts;
}

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
 * 単一トークンのベース XML を生成（テキスト + kun 属性のみ、trailing marks なし）
 */
function tokenBaseToXml(node: TextNode, ctx: StringifyContext): string {
  const { annotation } = node;
  // 平文で読み戻せない字 (decideTokenElements) は `<skam:t>` で書く。内容は書記素に分けず、空白も捨てない
  const text = node.asElement
    ? `<skam:t${tokenElementAttributes(node.token)}>${escapeText(node.text)}</skam:t>`
    : escapeText(node.text);
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

    const parts = kunParts(annotation);
    const extension =
      kunIdAttribute(parts.map(({ mark }) => mark)) + extensionAttributes(ctx, 'skam:kun', parts);
    return `<skam:kun ${attrs.join(' ')}${extension}>${text}</skam:kun>`;
  }

  return text;
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

/**
 * 単一トークンの XML を生成（wrapper なし、annotation のみ）
 */
function tokenContentToXml(node: TextNode, ctx: StringifyContext): string {
  return tokenBaseToXml(node, ctx) + tokenTrailingToXml(node.annotation, ctx);
}

/** 字を包む要素の開始タグと終了タグ。単字 (applyWrappers) と範囲 (renderRangeElement) で共有する */
function wrapperTags(
  mark: OkimojiMark | JojiMark | OkototenMark | SaidokuMark,
  ctx: StringifyContext
): {
  open: string;
  close: string;
} {
  const extension =
    idAttribute(mark.id) + extensionAttributes(ctx, `skam:${mark.type}`, [{ part: 'self', mark }]);
  switch (mark.type) {
    case 'okimoji':
      return { open: `<skam:okimoji${extension}>`, close: '</skam:okimoji>' };
    case 'joji':
      return { open: `<skam:joji${extension}>`, close: '</skam:joji>' };
    case 'okototen': {
      let attrs = `grid="${escapeXml(mark.position.grid)}" x="${mark.position.x}" y="${mark.position.y}" shape="${escapeXml(mark.shape)}"`;
      if (mark.sound) attrs += ` sound="${escapeXml(mark.sound)}"`;
      if (mark.color) attrs += ` color="${escapeXml(mark.color)}"`;
      return { open: `<skam:okototen ${attrs}${extension}>`, close: '</skam:okototen>' };
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
        open: `<skam:saidoku${extension}><skam:base>`,
        close: `</skam:base>${formsXml}</skam:saidoku>`,
      };
    }
  }
}

/** 単字の包む要素を適用してトークン XML を生成。wrappers は入れ子順 (外側から) に並んでいる */
function applyWrappers(
  innerXml: string,
  wrappers: SingleTokenWrapper[] | undefined,
  ctx: StringifyContext
): string {
  let xml = innerXml;
  for (let i = (wrappers?.length ?? 0) - 1; i >= 0; i--) {
    const wrapper = wrappers?.[i];
    if (!wrapper) continue;
    const { open, close } = wrapperTags(wrapper.mark, ctx);
    xml = open + xml + close;
  }
  return xml;
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

/**
 * 範囲マークの型に応じた XML 要素を生成
 */
function renderRangeElement(
  mark: Mark | KunRangeSyntheticMark,
  childrenXml: string,
  ctx: StringifyContext
): string {
  switch (mark.type) {
    case '__kun_range': {
      const kun = mark as KunRangeSyntheticMark;
      const attrs: string[] = [];
      if (kun.yomi) attrs.push(`yomi="${escapeXml(kun.yomi)}"`);
      if (kun.okuri) attrs.push(`okuri="${escapeXml(kun.okuri)}"`);
      if (kun.soe) attrs.push(`soe="${escapeXml(kun.soe)}"`);
      const parts = kun.sources.flatMap((source) => {
        const part = KUN_PART_OF_TYPE.get(source.type);
        return part === undefined ? [] : [{ part, mark: source }];
      });
      const extension = kunIdAttribute(kun.sources) + extensionAttributes(ctx, 'skam:kun', parts);
      return `<skam:kun ${attrs.join(' ')}${extension}>${childrenXml}</skam:kun>`;
    }
    case '__yomigana_range': {
      const yomigana = mark as KunRangeSyntheticMark;
      const source = yomigana.sources.find((candidate) => candidate.type === 'yomigana');
      const extension = source
        ? idAttribute(source.id) +
          extensionAttributes(ctx, 'skam:yomigana', [{ part: 'self', mark: source }])
        : '';
      return `<skam:yomigana value="${escapeXml(yomigana.yomi ?? '')}"${extension}>${childrenXml}</skam:yomigana>`;
    }
    case 'emphasis': {
      const emp = mark as EmphasisMark;
      let attrs = 'type="emphasis"';
      if (emp.style) {
        attrs += ` style="${escapeXml(emp.style)}"`;
      }
      attrs += idAttribute(emp.id);
      attrs += extensionAttributes(ctx, 'skam:span', [{ part: 'self', mark: emp }], false);
      return `<skam:span ${attrs}>${childrenXml}</skam:span>`;
    }
    case 'tateten': {
      const extension =
        idAttribute(mark.id) +
        extensionAttributes(ctx, 'skam:tateten', [{ part: 'self', mark: mark as TatetenMark }]);
      return `<skam:tateten${extension}>${childrenXml}</skam:tateten>`;
    }
    case 'highlight': {
      const attrs = highlightAttributes(mark as HighlightMark, ctx);
      return `<skam:span ${attrs}>${childrenXml}</skam:span>`;
    }
    case 'okimoji':
    case 'joji':
    case 'okototen':
    case 'saidoku': {
      const { open, close } = wrapperTags(
        mark as OkimojiMark | JojiMark | OkototenMark | SaidokuMark,
        ctx
      );
      return open + childrenXml + close;
    }
    case 'ref':
      return refMarkToXml(mark as RefMark, false, ctx);
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

/** annotation から後置の位置マークをすべて取り外して返す */
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

/** takeTrailing の前の後置の位置マークに戻す */
function restoreTrailing(annotation: TokenAnnotation, original: TokenAnnotation): void {
  delete annotation.kaeriAfter;
  delete annotation.kutotenAfter;
  delete annotation.refAfter;
  delete annotation.linebreakAfter;
  if (original.kaeriAfter) annotation.kaeriAfter = original.kaeriAfter;
  if (original.kutotenAfter) annotation.kutotenAfter = original.kutotenAfter;
  if (original.refAfter) annotation.refAfter = original.refAfter;
  if (original.linebreakAfter) annotation.linebreakAfter = original.linebreakAfter;
}

/**
 * コンテンツノードを XML に変換
 */
function contentNodeToXml(node: ContentNode, ctx: StringifyContext): string {
  if (node.type === 'text') {
    // wrapper がある場合、trailing marks を wrapper の外に配置
    if (node.annotation.wrappers?.length) {
      const baseXml = tokenBaseToXml(node, ctx);
      const trailingXml = tokenTrailingToXml(node.annotation, ctx);
      return applyWrappers(baseXml, node.annotation.wrappers, ctx) + trailingXml;
    }
    const innerXml = tokenContentToXml(node, ctx);
    return applyWrappers(innerXml, node.annotation.wrappers, ctx);
  }

  // 要素ノード：最後の字の位置マークを、同じ字で終わる範囲の連鎖のうち最も外側の後ろへ出す (§7.0)
  const leaf = findTrailingLeaf(node);
  const original = leaf ? { ...leaf.annotation } : undefined;
  const trailing = leaf ? takeTrailing(leaf.annotation) : {};
  const childrenXml = node.children.map((child) => contentNodeToXml(child, ctx)).join('');
  const elementXml = renderRangeElement(node.mark, childrenXml, ctx);
  if (leaf && original) restoreTrailing(leaf.annotation, original);
  return elementXml + tokenTrailingToXml(trailing, ctx);
}

/**
 * ブロックの XML を生成
 */
function blockToXml(
  block: Block,
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
    (startMarks ? tokenTrailingToXml(startMarks, ctx) : '') +
    contentTree.map((node) => contentNodeToXml(node, ctx)).join('');

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
  uri: string;
  required: boolean;
}

/**
 * 宣言のある文書は、名前空間の URI が分かる拡張だけを宣言する。
 * URI の無い拡張 (定義も登録簿も無い) と名前が不正な拡張は、宣言も値も書けないので損失にする
 */
function collectDeclarations(
  doc: SKAMDocument,
  definitions: ReadonlyMap<string, SKAMExtensionDefinition>,
  ctx: StringifyContext
): ExtensionDeclaration[] {
  const declarations: ExtensionDeclaration[] = [];
  const names: unknown[] = Array.isArray(doc.extensions) ? doc.extensions : [];
  names.forEach((name, index) => {
    const uri = isExtensionName(name) ? extensionUri(name, definitions) : undefined;
    if (!isExtensionName(name) || uri === undefined) {
      ctx.collector.add(
        {
          category: 'unsupported',
          code: 'UNKNOWN_EXTENSION',
          path: `/extensions/${index}`,
          message:
            'An extension that is not known, or whose name is invalid, cannot be declared in SKAM-ML (its namespace uri is needed)',
        },
        { blockIndex: -1, tokenIndex: -1, markIndex: -1, fieldOrder: 2 }
      );
      return;
    }
    const required = Array.isArray(doc.extensionsRequired) && doc.extensionsRequired.includes(name);
    declarations.push({ name, uri, required });
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
        `${indentStr(2, indentSize)}<skam:extension name="${escapeXml(name)}" uri="${escapeXml(uri)}"${required ? ' required="true"' : ''}/>`
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

  // 範囲マークを収集
  const rangeMarks = collectRangeMarks(doc.marks, tokenIndexMap, ctx);

  // XML を構築
  const lines: string[] = [];

  // XML 宣言
  if (xmlDeclaration) {
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  }

  const declarations = collectDeclarations(doc, definitions, ctx);

  // ルート要素開始
  const namespaces = declarations
    .map(({ name, uri }) => ` xmlns:${name}="${escapeXml(uri)}"`)
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

    lines.push(
      blockToXml(
        block,
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
