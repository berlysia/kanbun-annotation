/**
 * SKAM-ML/XML Parser Core
 *
 * Document → SKAM JSON 変換（環境非依存の共通ロジック）
 */

import type {
  SKAMDocument,
  ValidationError,
  Token,
  Block,
  Mark,
  Reading,
  Position,
  KaeriMark,
  OkuriganaMark,
  YomiganaMark,
  OkimojiMark,
  JojiMark,
  SoeganaMark,
  KutotenMark,
  LinebreakMark,
  EmphasisMark,
  SaidokuMark,
  SaidokuForm,
  OkototenMark,
  TatetenMark,
  GlyphGridCoord,
  HighlightMark,
  RefMark,
  RefFormat,
} from '@kanbun-skam/skam';
import {
  KAERI,
  BLOCK_START_KAERI_HINT,
  KAERI_MULTI_CHARACTER,
  validateSKAMDocument,
  SKAMValidationError,
  HIGHLIGHT_STYLES,
  isValidHighlightStyle,
  tokenizePlainText,
  SKAM_ML_CONTENT_MODEL,
  isHandId,
} from '@kanbun-skam/skam';
import {
  extensionRegistry,
  isExtensionName,
  resolveExtensions,
  type SKAMExtensionDefinition,
} from '@kanbun-skam/skam/extensions';
import { SKAMXMLParseError, type PositionInfo } from './parse-error.js';
import {
  computeLfLineStarts,
  createElementPositionResolver,
  lineColumnAt,
  type ElementPositionResolver,
} from './position-index.js';
import { checkInputLimits, DEFAULT_INPUT_LIMITS } from './input-limits.js';

export { SKAMXMLParseError, type PositionInfo } from './parse-error.js';

// ============================================================================
// Constants
// ============================================================================

const SKAM_NS = 'urn:skam:1';

const VALID_KAERI_KINDS = [
  're',
  'ichi',
  'ni',
  'san',
  'shi',
  'jo',
  'chu',
  'ge',
  'ko',
  'otsu',
  'hei',
  'tei',
  'ten',
  'chi',
  'jin',
] as const;
type KaeriKind = (typeof VALID_KAERI_KINDS)[number];

const KAERI_VALUE_MAP: Record<KaeriKind, string> = {
  re: KAERI.RE,
  ichi: KAERI.ICHI,
  ni: KAERI.NI,
  san: KAERI.SAN,
  shi: KAERI.SHI,
  jo: KAERI.JO,
  chu: KAERI.CHU,
  ge: KAERI.GE,
  ko: KAERI.KO,
  otsu: KAERI.OTSU,
  hei: KAERI.HEI,
  tei: KAERI.TEI,
  ten: KAERI.TEN,
  chi: KAERI.CHI,
  jin: KAERI.JIN,
};

const VALID_REF_FORMATS = [
  'alpha-upper',
  'alpha-lower',
  'numeric-paren',
  'numeric-bracket',
  'numeric-circled',
  'iroha-katakana',
  'iroha-hiragana',
  'gojuon-katakana',
  'gojuon-hiragana',
  'kanji-numeric',
] as const;

// ============================================================================
// Position Tracking Types
// ============================================================================

/**
 * Token position range in the source XML
 */
export interface TokenPosition {
  /** Start position (inclusive) */
  start: PositionInfo;
  /** End position (exclusive) */
  end: PositionInfo;
}

// ============================================================================
// Position Tracker
// ============================================================================

/**
 * Tracks positions in the source XML string.
 * Handles multi-byte characters (like kanji) correctly.
 */
class PositionTracker {
  private readonly source: string;
  private readonly lineStarts: number[];

  constructor(source: string) {
    this.source = source;
    // trackPositions has always counted only `\n` as a line break; its output must not change
    this.lineStarts = computeLfLineStarts(source);
  }

  /**
   * Convert character offset to PositionInfo
   */
  offsetToPosition(offset: number): PositionInfo {
    return { ...lineColumnAt(this.lineStarts, offset), offset };
  }

  /**
   * Find position of text starting from a given offset
   */
  findText(text: string, startOffset: number): number {
    return this.source.indexOf(text, startOffset);
  }

  /**
   * Get byte offset for a character offset (handles multi-byte UTF-8)
   */
  getByteOffset(charOffset: number): number {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(this.source.slice(0, charOffset));
    return bytes.length;
  }

  getSource(): string {
    return this.source;
  }
}

// ============================================================================
// Parser State
// ============================================================================

interface ParserState {
  tokens: Token[];
  blocks: Block[];
  marks: Mark[];
  readings: Reading[];
  noteContents: Map<string, string>;
  /** highlight と ref の結びは、後ろの ref も指せるよう、本文を読み終えてから決める */
  pendingHighlights: PendingHighlight[];
  currentBlockId: string | null;
  /** state.tokens 内で現在のブロックが始まるインデックス (ブロック先頭の判定に使う) */
  currentBlockTokenStart: number;
  positionTracker: PositionTracker | null;
  /** Current search offset in the source for position tracking */
  currentSearchOffset: number;
  onWarning: ((warning: ParseWarning) => void) | undefined;
  /**
   * 作った token・mark・block のオブジェクトから、元の要素への対応。検証エラーに行と列を付けるときに
   * (attachPositions で) 位置を引く。位置は誤りが起きるまで計算しない
   */
  sourceElements: WeakMap<object, Element>;
}

function createParserState(
  source?: string,
  onWarning?: (warning: ParseWarning) => void
): ParserState {
  return {
    tokens: [],
    blocks: [],
    marks: [],
    readings: [],
    noteContents: new Map(),
    pendingHighlights: [],
    currentBlockId: null,
    currentBlockTokenStart: 0,
    positionTracker: source ? new PositionTracker(source) : null,
    currentSearchOffset: 0,
    onWarning,
    sourceElements: new WeakMap(),
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

function getAttr(element: Element, name: string): string | null {
  return element.getAttribute(name);
}

/**
 * 手書きの id (`xml:id`、無ければ `id`。空の値は無いもの)。無ければ null。
 * 値は NCName でなければならない (`#` を含む自動の id の形は手書きできない)。
 * 読む所は、ブロックとすべての注記の要素
 */
function readHandId(element: Element): string | null {
  const id = getAttr(element, 'xml:id') || getAttr(element, 'id') || null;
  if (id !== null && !isHandId(id)) {
    throw parseErrorAt(
      element,
      `Invalid id '${id}': xml:id must be an XML NCName (no ':', no '#', no whitespace, not starting with a digit)`
    );
  }
  return id;
}

/** 手書きの id が無い注記の id。本文を読み終えた後に `m#<marks[] の順>` を付ける */
const PENDING_MARK_ID = '';

function readMarkId(element: Element): string {
  return readHandId(element) ?? PENDING_MARK_ID;
}

function getRequiredAttr(element: Element, name: string, elementName: string): string {
  // Note: @xmldom/xmldom returns "" for missing attributes, not null
  // We need to check hasAttribute to properly detect missing attributes
  if (!element.hasAttribute(name)) {
    throw parseErrorAt(element, `Missing required attribute '${name}' on <${elementName}>`);
  }
  const value = element.getAttribute(name);
  if (value === null || value === '') {
    throw parseErrorAt(element, `Missing required attribute '${name}' on <${elementName}>`);
  }
  return value;
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1; // Node.ELEMENT_NODE
}

// CDATA は XML 上ただの文字データなので、TEXT_NODE と同じに扱う
function isText(node: Node): node is Text {
  return node.nodeType === 3 || node.nodeType === 4; // TEXT_NODE | CDATA_SECTION_NODE
}

function getLocalName(element: Element): string {
  return element.localName ?? element.nodeName.split(':').pop() ?? '';
}

/** SKAM-ML 仕様が定義する要素名。これ以外の skam:* は将来の拡張とみなして無視し、onWarning で通知する */
const KNOWN_SKAM_ELEMENTS: ReadonlySet<string> = new Set([
  'doc',
  'meta',
  'body',
  'block',
  't',
  'readings',
  'reading',
  'notes',
  'note',
  'kaeri',
  'kun',
  'yomigana',
  'kutoten',
  'br',
  'okototen',
  'soegana',
  'okimoji',
  'joji',
  'span',
  'tateten',
  'saidoku',
  'base',
  'kunform',
  'ref',
  'extension',
]);

// ============================================================================
// Extensions
// ============================================================================

/** 名前空間の URI から引く、知っている拡張 (登録簿か、渡された定義にある拡張) */
interface KnownExtension {
  name: string;
  /** 定義が無い (登録簿にだけある) 拡張は属性を読み飛ばす */
  definition: SKAMExtensionDefinition | undefined;
}

interface ExtensionTable {
  definitions: ReadonlyMap<string, SKAMExtensionDefinition>;
  byUri: ReadonlyMap<string, KnownExtension>;
  /** 名前から、登録簿か定義が持つ URI を引く */
  uriByName: ReadonlyMap<string, string>;
}

function buildExtensionTable(
  extra: readonly SKAMExtensionDefinition[] | undefined
): ExtensionTable {
  const definitions = resolveExtensions(extra);
  const byUri = new Map<string, KnownExtension>();
  const uriByName = new Map<string, string>();
  for (const entry of extensionRegistry) {
    byUri.set(entry.uri, { name: entry.name, definition: definitions.get(entry.name) });
    uriByName.set(entry.name, entry.uri);
  }
  for (const definition of definitions.values()) {
    byUri.set(definition.uri, { name: definition.name, definition });
    uriByName.set(definition.name, definition.uri);
  }
  return { definitions, byUri, uriByName };
}

interface ExtensionDeclaration {
  used: string[];
  required: string[];
}

/** `skam:meta` の子の `skam:extension` を読む。1 つも無ければ宣言の無い文書 (undefined) */
function readExtensionDeclarations(
  metas: Element[],
  table: ExtensionTable
): ExtensionDeclaration | undefined {
  const declaration: ExtensionDeclaration = { used: [], required: [] };
  let found = false;
  for (const meta of metas) {
    for (const child of childElements(meta)) {
      if (getLocalName(child) !== 'extension') continue;
      found = true;
      const name = child.getAttribute('name');
      const uri = child.getAttribute('uri');
      const required = child.getAttribute('required');
      if (!name || !isExtensionName(name)) {
        throw parseErrorAt(
          child,
          '<skam:extension> requires a name of lowercase letters and digits, starting with a letter'
        );
      }
      if (!uri) throw parseErrorAt(child, '<skam:extension> requires a uri');
      if (required !== null && required !== '' && required !== 'true') {
        throw parseErrorAt(child, '<skam:extension> required must be "true" when present');
      }
      if (declaration.used.includes(name)) {
        throw parseErrorAt(child, `Extension "${name}" is declared more than once`);
      }
      const known = table.uriByName.get(name);
      if (known !== undefined && known !== uri) {
        throw parseErrorAt(child, `Extension "${name}" is declared with a uri that does not match`);
      }
      const owner = table.byUri.get(uri);
      if (owner !== undefined && owner.name !== name) {
        throw parseErrorAt(
          child,
          `The uri of extension "${owner.name}" is declared under another name`
        );
      }
      declaration.used.push(name);
      if (required === 'true') {
        // 必須の拡張は、知らなければ読まない (validate の有無にかかわらず)
        if (!table.definitions.has(name)) {
          throw parseErrorAt(child, `Required extension "${name}" is not known`);
        }
        declaration.required.push(name);
      }
    }
  }
  return found ? declaration : undefined;
}

const XMLNS_NAMESPACE = 'http://www.w3.org/2000/xmlns/';

/** `skam:kun` が 1 つの要素で作る 3 つの注記の部分 */
const KUN_PART_BY_TYPE: Readonly<Record<string, 'yomi' | 'okuri' | 'soe'>> = {
  yomigana: 'yomi',
  okurigana: 'okuri',
  soegana: 'soe',
};

/** `skam:ext` / `skam:custom` の 1 つの属性の値の長さの上限 (UTF-16 の単位)。入力全体の上限 (5,000,000) の 2 割 */
const MAX_FREE_DATA_ATTRIBUTE_LENGTH = 1_000_000;

/** ext / custom / placementHint を受ける持ち主。文書、ブロック、字、reading、注記のどれか */
interface FreeDataTarget {
  ext?: Record<string, unknown>;
  custom?: Record<string, unknown>;
}

/** 要素の属性から読んだ ext / custom / placementHint */
interface FreeData {
  ext?: Record<string, unknown>;
  custom?: Record<string, unknown>;
  placementHint?: string;
}

/**
 * 持ち主の要素に付く属性の名前。`skam:kun` は 1 つの要素に最大 3 つの注記が付くので、
 * 読み仮名は接頭辞なし、送り仮名は `okuri-`、添え仮名は `soe-` の名前で分ける。
 * JSON の値を持つ属性 (ext、custom) は `skam:` 名前空間、placement-hint は SKAM の要素自身の属性なので接頭辞なし
 */
const FREE_DATA_ATTRIBUTE_NAMES = {
  self: { ext: 'ext', custom: 'custom', hint: 'placement-hint' },
  okuri: { ext: 'okuri-ext', custom: 'okuri-custom', hint: 'okuri-placement-hint' },
  soe: { ext: 'soe-ext', custom: 'soe-custom', hint: 'soe-placement-hint' },
} as const;

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * JSON の値を持つ属性を読む。長さの上限を超える、JSON として読めない (構文の誤り、深さによる RangeError など)、
 * オブジェクトでないときは位置つきの誤り。メッセージに属性の値は含めない。
 * 値の深さ・キーの数・`__proto__` などの禁止は、parse の最後に validateSKAMDocument が検査する
 */
function readJsonObjectAttribute(
  element: Element,
  localName: string
): Record<string, unknown> | undefined {
  if (!element.hasAttributeNS(SKAM_NS, localName)) return undefined;
  const value = element.getAttributeNS(SKAM_NS, localName) ?? '';
  if (value.length > MAX_FREE_DATA_ATTRIBUTE_LENGTH) {
    throw parseErrorAt(
      element,
      `skam:${localName} is longer than ${MAX_FREE_DATA_ATTRIBUTE_LENGTH} characters`
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw parseErrorAt(element, `skam:${localName} must be a JSON object`);
  }
  if (!isJsonObject(parsed)) {
    throw parseErrorAt(element, `skam:${localName} must be a JSON object`);
  }
  return parsed;
}

function readFreeData(
  element: Element,
  names: (typeof FREE_DATA_ATTRIBUTE_NAMES)[keyof typeof FREE_DATA_ATTRIBUTE_NAMES]
): FreeData | undefined {
  const data: FreeData = {};
  const ext = readJsonObjectAttribute(element, names.ext);
  if (ext) data.ext = ext;
  const custom = readJsonObjectAttribute(element, names.custom);
  if (custom) data.custom = custom;
  if (element.hasAttribute(names.hint)) data.placementHint = element.getAttribute(names.hint) ?? '';
  return Object.keys(data).length > 0 ? data : undefined;
}

/**
 * ext の値を 1 つ足す。`Object.assign` やスプレッドで複製すると、`__proto__` のキーで setter が動いて
 * 持ち主の prototype を書き換えてしまうので、`defineProperty` で自分のキーとして足す。
 * 名前空間の属性と `skam:ext` の両方に同じ拡張の名前があれば位置つきの誤り (メッセージに値は含めない)
 */
function addExtValue(element: Element, target: FreeDataTarget, name: string, value: unknown): void {
  const ext = (target.ext ??= {});
  if (Object.hasOwn(ext, name)) {
    throw parseErrorAt(
      element,
      `The value of extension "${name}" is given twice (as a namespaced attribute and in skam:ext)`
    );
  }
  Object.defineProperty(ext, name, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function applyFreeData(
  element: Element,
  target: FreeDataTarget & { placementHint?: string },
  data: FreeData,
  isMark: boolean
): void {
  // custom は属性が 1 つだけなので、JSON.parse が作ったオブジェクトをそのまま持ち主にする
  if (data.custom) target.custom = data.custom;
  if (data.ext) {
    for (const [name, value] of Object.entries(data.ext)) addExtValue(element, target, name, value);
  }
  // placement-hint は注記のフィールド。注記でない持ち主 (文書、ブロック、字、reading) では読まない
  if (isMark && data.placementHint !== undefined) target.placementHint = data.placementHint;
}

/**
 * 拡張の名前空間の属性を、要素が作った注記の `ext.<拡張の名前>` にし、
 * `skam:ext` / `skam:custom` / `placement-hint` を、要素の持ち主 (文書、ブロック、字、reading、注記) に付ける。
 * 注記ができた後に文書全体を一度走査するので、要素ごとの処理には手を入れない。
 * 知っている拡張 (登録簿か渡された定義) の名前空間で宣言の無い属性は誤り。
 * 定義の無い拡張の属性と、登録されていない名前空間の属性は読み飛ばす。
 */
function applyExtensionAttributes(
  root: Element,
  skamDoc: SKAMDocument,
  state: ParserState,
  table: ExtensionTable,
  declared: ReadonlySet<string>
): void {
  const marksByElement = new Map<Element, Mark[]>();
  for (const mark of state.marks) {
    const element = state.sourceElements.get(mark);
    if (!element) continue;
    const list = marksByElement.get(element);
    if (list) list.push(mark);
    else marksByElement.set(element, [mark]);
  }
  // 注記以外の持ち主。字は `<skam:t>` が作ったものだけ (平文の字の持ち主は包む要素で、その要素の持ち主ではない)
  const plainOwners = new Map<Element, FreeDataTarget>([[root, skamDoc]]);
  for (const block of state.blocks) {
    const element = state.sourceElements.get(block);
    if (element) plainOwners.set(element, block);
  }
  for (const reading of state.readings) {
    const element = state.sourceElements.get(reading);
    if (element) plainOwners.set(element, reading);
  }
  for (const token of state.tokens) {
    const element = state.sourceElements.get(token);
    if (element && getLocalName(element) === 't') plainOwners.set(element, token);
  }

  const visit = (element: Element): void => {
    const attributesByExtension = new Map<string, Map<string, string>>();
    for (const attr of Array.from(element.attributes)) {
      const uri = attr.namespaceURI;
      if (!uri || uri === XMLNS_NAMESPACE) continue;
      const known = table.byUri.get(uri);
      if (!known) continue;
      if (!declared.has(known.name)) {
        throw parseErrorAt(
          element,
          `An attribute of extension "${known.name}" requires <skam:extension name="${known.name}"> in <skam:meta>`
        );
      }
      if (!known.definition?.readXmlAttributes) continue;
      let attributes = attributesByExtension.get(known.name);
      if (!attributes) {
        attributes = new Map();
        attributesByExtension.set(known.name, attributes);
      }
      attributes.set(attr.localName ?? attr.name, attr.value);
    }

    const localName = getLocalName(element);
    const elementMarks = marksByElement.get(element) ?? [];
    const partOf = (mark: Mark): 'self' | 'yomi' | 'okuri' | 'soe' | undefined =>
      localName === 'kun' ? KUN_PART_BY_TYPE[mark.type] : 'self';

    for (const [name, attributes] of attributesByExtension) {
      const definition = table.definitions.get(name)!;
      const marks = elementMarks.flatMap((mark) => {
        const part = partOf(mark);
        return part === undefined ? [] : [{ part, mark }];
      });
      const result = definition.readXmlAttributes!(attributes, {
        element: `skam:${localName}`,
        marks,
      });
      if ('error' in result) throw parseErrorAt(element, result.error);
      for (const { mark, value } of result.values) {
        addExtValue(element, mark, name, value);
      }
    }

    applyFreeAttributes(element, localName, elementMarks, plainOwners.get(element));

    for (const child of Array.from(element.childNodes)) {
      if (!isElement(child) || child.namespaceURI !== SKAM_NS) continue;
      // 未知の skam:* は部分木ごと読み飛ばす (要素の処理と同じ)
      if (KNOWN_SKAM_ELEMENTS.has(getLocalName(child))) visit(child);
    }
  };
  visit(root);
}

/**
 * 1 つの要素の `skam:ext` / `skam:custom` / `placement-hint` を持ち主に付ける。
 * `skam:kun` は読み仮名が接頭辞なし、送り仮名が `okuri-`、添え仮名が `soe-` で、対応する注記が無ければ位置つきの誤り
 * (`edu:okuri-quiz` と同じ扱い)。持ち主の無い要素 (skam:body、skam:meta など) の属性は読まない
 */
function applyFreeAttributes(
  element: Element,
  localName: string,
  marks: readonly Mark[],
  owner: FreeDataTarget | undefined
): void {
  if (localName !== 'kun' && marks.length === 0 && owner === undefined) return;
  if (localName === 'kun') {
    const partNames = [
      ['yomigana', FREE_DATA_ATTRIBUTE_NAMES.self],
      ['okurigana', FREE_DATA_ATTRIBUTE_NAMES.okuri],
      ['soegana', FREE_DATA_ATTRIBUTE_NAMES.soe],
    ] as const;
    for (const [type, names] of partNames) {
      const data = readFreeData(element, names);
      if (!data) continue;
      const mark = marks.find((candidate) => candidate.type === type);
      if (!mark) {
        throw parseErrorAt(
          element,
          `The attributes ${names.ext}, ${names.custom} and ${names.hint} of <skam:kun> need the ${type} they belong to`
        );
      }
      applyFreeData(element, mark, data, true);
    }
    return;
  }

  // kun 以外では okuri-* / soe-* に付ける先が無い
  for (const names of [FREE_DATA_ATTRIBUTE_NAMES.okuri, FREE_DATA_ATTRIBUTE_NAMES.soe]) {
    if (readFreeData(element, names)) {
      throw parseErrorAt(
        element,
        `<skam:${localName}> does not take ${names.ext}, ${names.custom} or ${names.hint}`
      );
    }
  }
  const data = readFreeData(element, FREE_DATA_ATTRIBUTE_NAMES.self);
  if (!data) return;
  for (const mark of marks) applyFreeData(element, mark, data, true);
  if (owner) applyFreeData(element, owner, data, false);
}

interface SourcePosition {
  line?: number;
  column?: number;
}

/**
 * 文書ごとの、要素から位置を引く関数。parseFromDocument が parse の間だけ登録する。
 * parseErrorAt など約 35 か所の呼び出しの引数を増やさずに、DOM が位置を持たないときの経路を通すために、
 * 文書 (node.ownerDocument) をキーにしている。
 */
const positionResolvers = new WeakMap<Document, ElementPositionResolver>();

/**
 * 要素の開始タグの行・列。xmldom が要素に付ける非標準の lineNumber / columnNumber があればそれを返し (Node 版)、
 * 無ければ (ブラウザの DOM) 登録された resolver が源の走査から求める。開始タグと要素の対応が取れないときは位置を持たない
 */
function nodePosition(node: Node): SourcePosition {
  const { lineNumber, columnNumber } = node as { lineNumber?: unknown; columnNumber?: unknown };
  const position: SourcePosition = {};
  if (typeof lineNumber === 'number') position.line = lineNumber;
  if (typeof columnNumber === 'number') position.column = columnNumber;
  if (position.line !== undefined || position.column !== undefined) return position;
  if (!isElement(node) || !node.ownerDocument) return position;
  const found = positionResolvers.get(node.ownerDocument)?.(node);
  if (found) {
    position.line = found.line;
    position.column = found.column;
  }
  return position;
}

/** mark を state に積み、元の要素を控える。1 つの要素から複数の mark を作る場合も、どれも同じ要素を指す */
function pushMark(state: ParserState, mark: Mark, element: Element): void {
  state.sourceElements.set(mark, element);
  state.marks.push(mark);
}

function parseErrorAt(node: Node, message: string): SKAMXMLParseError {
  const { line, column } = nodePosition(node);
  return new SKAMXMLParseError(message, line, column);
}

/** SKAM 以外の名前空間の要素は、内容モデルのどこに現れても受け付けない */
function assertSkamNamespace(element: Element): void {
  if (element.namespaceURI !== SKAM_NS) {
    throw parseErrorAt(
      element,
      `Element <${element.nodeName}> in namespace "${element.namespaceURI ?? ''}" is not allowed`
    );
  }
}

/** 子要素の走査はここに集める。要素を返す前に必ず名前空間を検査する */
function childElements(element: Element): Element[] {
  const result: Element[] = [];
  for (const child of Array.from(element.childNodes)) {
    if (isElement(child)) {
      assertSkamNamespace(child);
      result.push(child);
    }
  }
  return result;
}

/** kaeri の複数の字の書き方を知らせる。validator の `warnings` は流さず、ここで 1 件だけ出す (`validate: false` でも出る) */
function warnKaeriMultiCharacter(state: ParserState, element: Element): void {
  if (!state.onWarning) return;
  state.onWarning({
    code: KAERI_MULTI_CHARACTER,
    name: 'skam:kaeri',
    message:
      'A kaeri with several characters (e.g. kind="ichi-re") becomes an error in 0.4.0. Write one <skam:kaeri> per character at the same position.',
    ...nodePosition(element),
  });
}

function warn(state: ParserState, element: Element): void {
  if (!state.onWarning) return;
  const name = getLocalName(element);
  const warning: ParseWarning = {
    code: 'UNKNOWN_ELEMENT',
    name,
    message: `Unknown element <skam:${name}> was ignored`,
    ...nodePosition(element),
  };
  state.onWarning(warning);
}

/** 表に載る親要素の子を読む。返す token は文書順 */
function processConstrainedContent(
  element: Element,
  state: ParserState,
  owner: keyof typeof SKAM_ML_CONTENT_MODEL
): string[] {
  const allowed = SKAM_ML_CONTENT_MODEL[owner];
  const tokenIds: string[] = [];
  for (const child of Array.from(element.childNodes)) {
    if (isText(child)) {
      tokenIds.push(...addTokensFromText(child.textContent ?? '', state, element));
      continue;
    }
    if (!isElement(child)) continue;
    assertSkamNamespace(child);
    const name = getLocalName(child);
    if (!KNOWN_SKAM_ELEMENTS.has(name)) {
      warn(state, child);
      continue;
    }
    if (!allowed.includes(name)) {
      throw parseErrorAt(child, `<skam:${owner}> must not contain <skam:${name}>`);
    }
    if (name === 't') tokenIds.push(...processToken(child, state));
    else if (name === 'kun') tokenIds.push(...processKun(child, state));
    else if (name === 'okimoji') tokenIds.push(...processOkimoji(child, state));
    else if (name === 'joji') tokenIds.push(...processJoji(child, state));
    else if (name === 'okototen') tokenIds.push(...processOkototen(child, state));
  }
  return tokenIds;
}

/** 字の id は `<そのブロックの id>#<ブロックの中の 1 始まりの順>` */
function generateTokenId(state: ParserState): string {
  const order = state.tokens.length - state.currentBlockTokenStart + 1;
  return `${state.currentBlockId!}#${order}`;
}

// ============================================================================
// Token Generation
// ============================================================================

/**
 * token を 1 つ作って state に積む。位置 (trackPositions) は text の先頭の code point で探す。
 * クラスタ全体で探すと、`葛&#xE0100;` のようにリテラルと文字参照が混ざるときにソースの中で見つからない
 */
function pushToken(
  state: ParserState,
  text: string,
  owner: Element,
  handId: string | null
): string {
  const id = handId ?? generateTokenId(state);
  const token: Token = { id, text };
  const tracker = state.positionTracker;

  // Add position info if tracking is enabled
  if (tracker) {
    const leadLength = String.fromCodePoint(text.codePointAt(0)!).length;
    const charPos = tracker.findText(text.slice(0, leadLength), state.currentSearchOffset);
    if (charPos !== -1) {
      // リテラルで書かれたクラスタはソースに全体が並ぶので終端まで含める。文字参照が混ざるときは先頭の code point まで
      const spanLength = tracker.getSource().startsWith(text, charPos) ? text.length : leadLength;
      const startPos = tracker.offsetToPosition(charPos);
      const endPos = tracker.offsetToPosition(charPos + spanLength);

      // Convert to byte offsets for the offset field
      const startByteOffset = tracker.getByteOffset(charPos);
      const endByteOffset = tracker.getByteOffset(charPos + spanLength);

      const position: TokenPosition = {
        start: { ...startPos, offset: startByteOffset },
        end: { ...endPos, offset: endByteOffset },
      };

      token.ext = { ...token.ext, position };
      state.currentSearchOffset = charPos + spanLength;
    }
  }

  state.sourceElements.set(token, owner);
  state.tokens.push(token);
  return id;
}

/**
 * 平文のテキストノードを token にする。分け方は core の `tokenizePlainText` (stringify も同じ関数で判定する)。
 * テキストノードごとに分ける。ノードをまたぐクラスタを作ると、要素の外の字が要素の中の token に入り、
 * stringify で元の形に戻らない
 */
function addTokensFromText(text: string, state: ParserState, owner: Element): string[] {
  return tokenizePlainText(text).map((piece) => pushToken(state, piece.text, owner, null));
}

/**
 * `<skam:t>`: 内容の文字をそのまま 1 つの token の text にする。書記素に分けず、空白も捨てない。
 * 字の id は手書きの id (`xml:id`、無ければ `id`)。無ければ平文の字と同じ自動の id
 */
function processToken(element: Element, state: ParserState): string[] {
  let text = '';
  for (const child of Array.from(element.childNodes)) {
    if (isText(child)) {
      text += child.textContent ?? '';
    } else if (isElement(child)) {
      throw parseErrorAt(child, `<skam:t> must not contain <${child.nodeName}>`);
    }
  }
  if (text === '') throw parseErrorAt(element, '<skam:t> must contain text');
  return [pushToken(state, text, element, readHandId(element))];
}

/**
 * kun と soegana の中身を読む。平文のテキスト (間に未知の要素やコメントがあってもつなげて 1 つのテキストとして分ける) と
 * `<skam:t>` を文書順に token にする。ほかの既知の要素は内容モデル違反、未知の skam:* は部分木ごと無視して通知する。
 */
function readTextAndTokens(element: Element, state: ParserState, owner: string): string[] {
  const tokenIds: string[] = [];
  let pending = '';
  const flush = (): void => {
    if (pending === '') return;
    tokenIds.push(...addTokensFromText(pending, state, element));
    pending = '';
  };
  for (const child of Array.from(element.childNodes)) {
    if (isText(child)) {
      pending += child.textContent ?? '';
    } else if (isElement(child)) {
      assertSkamNamespace(child);
      const name = getLocalName(child);
      if (name === 't') {
        flush();
        tokenIds.push(...processToken(child, state));
      } else if (KNOWN_SKAM_ELEMENTS.has(name)) {
        throw parseErrorAt(child, `<skam:${owner}> must not contain <skam:${name}>`);
      } else {
        warn(state, child);
      }
    }
  }
  flush();
  return tokenIds;
}

function createAnchor(tokenIds: string[], element: Element): { from: string; to: string } {
  if (tokenIds.length === 0) {
    throw parseErrorAt(element, 'Cannot create anchor from empty token list');
  }
  return { from: tokenIds[0]!, to: tokenIds[tokenIds.length - 1]! };
}

// ============================================================================
// Mark Processors
// ============================================================================

function parseKaeriKind(kind: string, element: Element): string {
  // 単一返り点
  if (VALID_KAERI_KINDS.includes(kind as KaeriKind)) {
    return KAERI_VALUE_MAP[kind as KaeriKind];
  }

  // 複合返り点（例: ichi-re → 一レ）
  const parts = kind.split('-');
  if (parts.length > 1 && parts.every((p) => VALID_KAERI_KINDS.includes(p as KaeriKind))) {
    return parts.map((p) => KAERI_VALUE_MAP[p as KaeriKind]).join('');
  }

  throw parseErrorAt(
    element,
    `Invalid kaeri kind '${kind}'. Valid kinds: ${VALID_KAERI_KINDS.join(', ')} (compound: e.g. ichi-re)`
  );
}

function processKaeri(element: Element, state: ParserState, precedingTokenId: string | null): void {
  const kind = getRequiredAttr(element, 'kind', 'skam:kaeri');
  const value = parseKaeriKind(kind, element);
  // shiori: KAERI:multi-character-parser
  if (value.length > 1) warnKaeriMultiCharacter(state, element);

  if (!precedingTokenId) {
    throw parseErrorAt(
      element,
      `<skam:kaeri> must follow a token in the same block. ${BLOCK_START_KAERI_HINT}`
    );
  }

  const mark: KaeriMark = {
    type: 'kaeri',
    id: readMarkId(element),
    position: { blockId: state.currentBlockId!, after: precedingTokenId },
    value,
  };

  pushMark(state, mark, element);
}

function processKun(element: Element, state: ParserState): string[] {
  const yomi = getAttr(element, 'yomi');
  const okuri = getAttr(element, 'okuri');
  const soe = getAttr(element, 'soe');

  // Extract text content (and <skam:t>) and generate tokens
  const tokenIds = readTextAndTokens(element, state, 'kun');

  if (tokenIds.length === 0) {
    throw parseErrorAt(element, '<skam:kun> must contain text');
  }

  const anchor = createAnchor(tokenIds, element);

  // 1 つの要素から最大 3 つの注記を作る。xml:id は最初に作る注記 (yomigana、okurigana、soegana の順) に付ける
  let kunId = readMarkId(element);
  const takeKunId = (): string => {
    const id = kunId;
    kunId = PENDING_MARK_ID;
    return id;
  };

  if (yomi) {
    const yomiganaMark: YomiganaMark = {
      type: 'yomigana',
      id: takeKunId(),
      anchor,
      value: yomi,
    };
    pushMark(state, yomiganaMark, element);
  }

  if (okuri) {
    const okuriganaMark: OkuriganaMark = {
      type: 'okurigana',
      id: takeKunId(),
      anchor,
      value: okuri,
    };
    pushMark(state, okuriganaMark, element);
  }

  if (soe) {
    const soeganaMark: SoeganaMark = {
      type: 'soegana',
      id: takeKunId(),
      anchor,
      value: soe,
    };
    pushMark(state, soeganaMark, element);
  }

  return tokenIds;
}

function processYomigana(element: Element, state: ParserState): string[] {
  const value = getRequiredAttr(element, 'value', 'skam:yomigana');

  // yomigana は kun を内包できる (内側の範囲 ⊆ 外側の範囲)。表は §7.0
  const tokenIds = processConstrainedContent(element, state, 'yomigana');

  if (tokenIds.length === 0) {
    throw parseErrorAt(element, '<skam:yomigana> must contain text');
  }

  const mark: YomiganaMark = {
    type: 'yomigana',
    id: readMarkId(element),
    anchor: createAnchor(tokenIds, element),
    value,
  };

  pushMark(state, mark, element);
  return tokenIds;
}

function processKutoten(
  element: Element,
  state: ParserState,
  precedingTokenId: string | null
): void {
  const value = getRequiredAttr(element, 'value', 'skam:kutoten');
  const kind = getAttr(element, 'kind') as 'ku' | 'ten' | 'other' | null;

  // Position includes blockId and optional after
  // - { blockId, after: tokenId } - after the specified token
  // - { blockId } - at block start (no preceding token)
  const position: Position = precedingTokenId
    ? { blockId: state.currentBlockId!, after: precedingTokenId }
    : { blockId: state.currentBlockId! };

  const mark: KutotenMark = {
    type: 'kutoten',
    id: readMarkId(element),
    position,
    value,
  };

  if (kind) {
    mark.kind = kind;
  }

  pushMark(state, mark, element);
}

/**
 * skam:br は内容を持たない空の要素で、直前の字の後ろの linebreak になる。
 * kaeri と同じく、読んだ時点の直前の字 (同じブロックの中) に付ける。
 * kutoten のようにブロックの終わりまで待つと、入れ子の要素 (tateten、span) の先頭に置かれた br が
 * ブロック先頭の位置になってしまう。
 * 置けない場所 (先頭、末尾、不可分単位の中) は validator が報告する。ここでは位置を読むだけ
 */
function processLinebreak(
  element: Element,
  state: ParserState,
  precedingTokenId: string | null
): void {
  for (const child of Array.from(element.childNodes)) {
    if (isElement(child) || (isText(child) && !/^[\t\n\r ]*$/.test(child.textContent ?? ''))) {
      throw parseErrorAt(element, '<skam:br> must be empty');
    }
  }
  const position: Position = precedingTokenId
    ? { blockId: state.currentBlockId!, after: precedingTokenId }
    : { blockId: state.currentBlockId! };
  const mark: LinebreakMark = {
    type: 'linebreak',
    id: readMarkId(element),
    position,
  };
  pushMark(state, mark, element);
}

function processOkototen(element: Element, state: ParserState): string[] {
  const grid = getRequiredAttr(element, 'grid', 'skam:okototen');
  const xStr = getRequiredAttr(element, 'x', 'skam:okototen');
  const yStr = getRequiredAttr(element, 'y', 'skam:okototen');
  const shape = getRequiredAttr(element, 'shape', 'skam:okototen');
  const sound = getAttr(element, 'sound');
  const color = getAttr(element, 'color');

  // Validate grid format
  if (!/^\d+x\d+$/.test(grid)) {
    throw parseErrorAt(
      element,
      `Invalid grid format '${grid}'. Expected format: NxN (e.g., '5x5')`
    );
  }

  const x = parseInt(xStr, 10);
  const y = parseInt(yStr, 10);

  if (Number.isNaN(x) || Number.isNaN(y)) {
    throw parseErrorAt(element, 'x and y must be integers');
  }

  const tokenIds = processConstrainedContent(element, state, 'okototen');

  if (tokenIds.length === 0) {
    throw parseErrorAt(element, '<skam:okototen> must contain text');
  }

  const position: GlyphGridCoord = {
    system: 'glyph-grid',
    grid,
    x,
    y,
  };

  const mark: OkototenMark = {
    type: 'okototen',
    id: readMarkId(element),
    anchor: createAnchor(tokenIds, element),
    position,
    shape,
  };

  if (sound) {
    mark.sound = sound;
  }

  if (color) {
    mark.color = color;
  }

  pushMark(state, mark, element);
  return tokenIds;
}

function processOkimoji(element: Element, state: ParserState): string[] {
  const tokenIds = processConstrainedContent(element, state, 'okimoji');

  if (tokenIds.length === 0) {
    throw parseErrorAt(element, '<skam:okimoji> must contain text');
  }

  const mark: OkimojiMark = {
    type: 'okimoji',
    id: readMarkId(element),
    anchor: createAnchor(tokenIds, element),
  };

  pushMark(state, mark, element);
  return tokenIds;
}

function processJoji(element: Element, state: ParserState): string[] {
  const tokenIds = processConstrainedContent(element, state, 'joji');

  if (tokenIds.length === 0) {
    throw parseErrorAt(element, '<skam:joji> must contain text');
  }

  const mark: JojiMark = {
    type: 'joji',
    id: readMarkId(element),
    anchor: createAnchor(tokenIds, element),
  };

  pushMark(state, mark, element);
  return tokenIds;
}

function processSoegana(element: Element, state: ParserState): string[] {
  const value = getRequiredAttr(element, 'value', 'skam:soegana');

  // Extract text content (the wrapped character, and <skam:t>) and generate tokens
  const tokenIds = readTextAndTokens(element, state, 'soegana');

  if (tokenIds.length === 0) {
    throw parseErrorAt(element, '<skam:soegana> must contain text (the character to annotate)');
  }

  const mark: SoeganaMark = {
    type: 'soegana',
    id: readMarkId(element),
    anchor: createAnchor(tokenIds, element),
    value,
  };

  pushMark(state, mark, element);
  return tokenIds;
}

function processSpan(element: Element, state: ParserState): string[] {
  const type = getRequiredAttr(element, 'type', 'skam:span');
  const styleAttr = getAttr(element, 'style');

  // Process children to get tokens
  const tokenIds = processBlockChildren(element, state);

  if (tokenIds.length === 0) {
    throw parseErrorAt(element, '<skam:span> must contain content');
  }

  if (type === 'emphasis') {
    const mark: EmphasisMark = {
      type: 'emphasis',
      id: readMarkId(element),
      anchor: createAnchor(tokenIds, element),
    };

    // style は CSS text-emphasis-style の値（任意の文字列も可）
    if (styleAttr) {
      mark.style = styleAttr;
    }

    pushMark(state, mark, element);
  } else if (type === 'highlight') {
    const mark: HighlightMark = {
      type: 'highlight',
      id: readMarkId(element),
      anchor: createAnchor(tokenIds, element),
    };

    if (styleAttr) {
      if (!isValidHighlightStyle(styleAttr)) {
        throw parseErrorAt(
          element,
          `Invalid highlight style '${styleAttr}'. Valid styles: ${HIGHLIGHT_STYLES.join(', ')}`
        );
      }
      mark.style = styleAttr;
    }

    // ref との結びは `ref` 属性だけで決める。後ろの ref も指せるよう本文を読み終えてから解決する
    // (resolveHighlightRefs)。空の値は属性なしと同じ
    const refAttribute = getAttr(element, 'ref') ?? '';
    if (refAttribute !== '') state.pendingHighlights.push({ mark, element, refAttribute });

    pushMark(state, mark, element);
  }

  return tokenIds;
}

function processTateten(element: Element, state: ParserState): string[] {
  // Process children recursively to handle inner elements like <skam:kaeri>
  const tokenIds = processBlockChildren(element, state);

  if (tokenIds.length === 0) {
    throw parseErrorAt(element, '<skam:tateten> must contain text');
  }

  const mark: TatetenMark = {
    type: 'tateten',
    id: readMarkId(element),
    anchor: createAnchor(tokenIds, element),
  };

  pushMark(state, mark, element);
  return tokenIds;
}

function processSaidoku(element: Element, state: ParserState): string[] {
  let baseElement: Element | null = null;
  const kunforms: Element[] = [];

  // Find base and kunform elements
  for (const child of childElements(element)) {
    const localName = getLocalName(child);
    if (localName === 'base') {
      baseElement = child;
    } else if (localName === 'kunform') {
      kunforms.push(child);
    }
  }

  if (!baseElement) {
    throw parseErrorAt(element, '<skam:saidoku> requires <skam:base> element');
  }

  if (kunforms.length === 0) {
    throw parseErrorAt(element, '<skam:saidoku> requires at least one <skam:kunform> element');
  }

  // Generate tokens from base
  const tokenIds = processConstrainedContent(baseElement, state, 'base');

  if (tokenIds.length === 0) {
    throw parseErrorAt(baseElement, '<skam:base> must contain text');
  }

  // Build forms array
  const forms: SaidokuForm[] = kunforms.map((kunform) => {
    const form: SaidokuForm = {};
    const nAttr = getAttr(kunform, 'n');
    const yomi = getAttr(kunform, 'yomi');
    const okuri = getAttr(kunform, 'okuri');

    if (nAttr) {
      form.n = parseInt(nAttr, 10);
    }
    if (yomi) {
      form.yomi = yomi;
    }
    if (okuri) {
      form.okuri = okuri;
    }

    return form;
  });

  const mark: SaidokuMark = {
    type: 'saidoku',
    id: readMarkId(element),
    anchor: createAnchor(tokenIds, element),
    forms,
  };

  pushMark(state, mark, element);
  return tokenIds;
}

/**
 * Process skam:ref element (position-based mark)
 *
 * Supports:
 * - Empty element with format/label for auto-numbering
 * - Element with content for inline annotation (content stored in content field, not tokenized)
 * - xml:id for separated note content (note references this ref)
 *
 * Position-based: ref does not create tokens, just marks a position between tokens
 */
// oxlint-disable-next-line eslint/complexity
function processRef(element: Element, state: ParserState, precedingTokenId: string | null): void {
  const labelAttr = getAttr(element, 'label');
  const formatAttr = getAttr(element, 'format');
  // xml:id attribute takes precedence for explicit id assignment
  const xmlIdAttr = readHandId(element);

  // Check for text content - this becomes the content field, not tokens
  let content: string | undefined;
  const textContent = (element.textContent ?? '').trim();

  // If element has text content but no child elements, it's inline content
  const hasChildElements = childElements(element).length > 0;

  if (textContent && !hasChildElements) {
    content = textContent;
  }

  // Validate: label and format are mutually exclusive
  if (labelAttr && formatAttr) {
    throw parseErrorAt(
      element,
      '<skam:ref> cannot have both label and format (mutually exclusive)'
    );
  }

  // Validate: at least one of label, format, content, or xml:id (for separated definition) must be present
  if (!labelAttr && !formatAttr && !content && !xmlIdAttr) {
    throw parseErrorAt(
      element,
      '<skam:ref> requires at least one of: label, format, content, or xml:id'
    );
  }

  // Validate format value
  if (formatAttr && !VALID_REF_FORMATS.includes(formatAttr as (typeof VALID_REF_FORMATS)[number])) {
    throw parseErrorAt(
      element,
      `Invalid ref format '${formatAttr}'. Valid formats: ${VALID_REF_FORMATS.join(', ')}`
    );
  }

  // Position includes blockId and optional after
  // - { blockId, after: tokenId } - after the specified token
  // - { blockId } - at block start (no preceding token)
  const position: Position = precedingTokenId
    ? { blockId: state.currentBlockId!, after: precedingTokenId }
    : { blockId: state.currentBlockId! };

  const mark: RefMark = {
    type: 'ref',
    id: xmlIdAttr ?? PENDING_MARK_ID,
    position,
  };

  if (labelAttr) {
    mark.label = labelAttr;
  }

  if (formatAttr) {
    mark.format = formatAttr as RefFormat;
  }

  if (content) {
    mark.content = content;
  }

  // Note: separated note content is resolved in processNotes()
  // The note element references this ref via its 'ref' attribute

  pushMark(state, mark, element);
}

// ============================================================================
// Block Processing
// ============================================================================

/**
 * Pending position-based mark that needs position assignment after tokens are known
 */
interface PendingPositionMark {
  element: Element;
  type: 'kutoten' | 'ref';
  /** Token index before this mark (-1 if at beginning) */
  precedingTokenIndex: number;
}

// oxlint-disable-next-line eslint/complexity
function processBlockChildren(element: Element, state: ParserState): string[] {
  const allTokenIds: string[] = [];
  const pendingPositionMarks: PendingPositionMark[] = [];
  // 直前の token はブロックをまたいで引き継がない (ブロック先頭の返り点が前ブロックの末尾に付くのを防ぐ)
  let lastTokenId: string | null =
    state.tokens.length > state.currentBlockTokenStart
      ? state.tokens[state.tokens.length - 1]!.id
      : null;

  for (let i = 0; i < element.childNodes.length; i++) {
    const child = element.childNodes[i];
    if (!child) continue;

    if (isText(child)) {
      const text = child.textContent ?? '';
      const ids = addTokensFromText(text, state, element);
      allTokenIds.push(...ids);
      if (ids.length > 0) {
        lastTokenId = ids[ids.length - 1]!;
      }
    } else if (isElement(child)) {
      assertSkamNamespace(child);
      const localName = getLocalName(child);

      switch (localName) {
        case 'kaeri':
          processKaeri(child, state, lastTokenId);
          break;
        case 't': {
          const ids = processToken(child, state);
          allTokenIds.push(...ids);
          lastTokenId = ids[ids.length - 1]!;
          break;
        }
        case 'kun': {
          const ids = processKun(child, state);
          allTokenIds.push(...ids);
          if (ids.length > 0) lastTokenId = ids[ids.length - 1]!;
          break;
        }
        case 'yomigana': {
          const ids = processYomigana(child, state);
          allTokenIds.push(...ids);
          if (ids.length > 0) lastTokenId = ids[ids.length - 1]!;
          break;
        }
        case 'kutoten':
          // Defer to ensure precedingTokenIndex is within current block
          pendingPositionMarks.push({
            element: child,
            type: 'kutoten',
            precedingTokenIndex: allTokenIds.length - 1,
          });
          break;
        case 'br':
          processLinebreak(child, state, lastTokenId);
          break;
        case 'okototen': {
          const ids = processOkototen(child, state);
          allTokenIds.push(...ids);
          if (ids.length > 0) lastTokenId = ids[ids.length - 1]!;
          break;
        }
        case 'okimoji': {
          const ids = processOkimoji(child, state);
          allTokenIds.push(...ids);
          if (ids.length > 0) lastTokenId = ids[ids.length - 1]!;
          break;
        }
        case 'joji': {
          const ids = processJoji(child, state);
          allTokenIds.push(...ids);
          if (ids.length > 0) lastTokenId = ids[ids.length - 1]!;
          break;
        }
        case 'soegana': {
          const ids = processSoegana(child, state);
          allTokenIds.push(...ids);
          if (ids.length > 0) lastTokenId = ids[ids.length - 1]!;
          break;
        }
        case 'span': {
          const ids = processSpan(child, state);
          allTokenIds.push(...ids);
          if (ids.length > 0) lastTokenId = ids[ids.length - 1]!;
          break;
        }
        case 'tateten': {
          const ids = processTateten(child, state);
          allTokenIds.push(...ids);
          if (ids.length > 0) lastTokenId = ids[ids.length - 1]!;
          break;
        }
        case 'saidoku': {
          const ids = processSaidoku(child, state);
          allTokenIds.push(...ids);
          if (ids.length > 0) lastTokenId = ids[ids.length - 1]!;
          break;
        }
        case 'ref':
          // Defer to ensure precedingTokenIndex is within current block
          pendingPositionMarks.push({
            element: child,
            type: 'ref',
            precedingTokenIndex: allTokenIds.length - 1,
          });
          break;
        default:
          // 未知の skam:* は部分木ごと無視する (将来の拡張との前方互換)。既知だが置き場所の違う要素は黙って無視する
          if (!KNOWN_SKAM_ELEMENTS.has(localName)) warn(state, child);
          break;
      }
    }
  }

  // Process pending position-based marks now that we have all token IDs
  for (const pending of pendingPositionMarks) {
    const precedingTokenId =
      pending.precedingTokenIndex >= 0 ? (allTokenIds[pending.precedingTokenIndex] ?? null) : null;

    if (pending.type === 'kutoten') {
      processKutoten(pending.element, state, precedingTokenId);
    } else {
      processRef(pending.element, state, precedingTokenId);
    }
  }

  return allTokenIds;
}

function processBlock(element: Element, state: ParserState): void {
  // Read xml:id attribute, or auto-generate block ID
  const blockId = readHandId(element) ?? `b#${state.blocks.length + 1}`;

  // Set current block ID for marks (kutoten/ref position) created within this block
  state.currentBlockId = blockId;
  state.currentBlockTokenStart = state.tokens.length;

  const tokenIds = processBlockChildren(element, state);

  // Clear current block ID
  state.currentBlockId = null;

  // Build Block object and add to state
  const block: Block = { id: blockId, tokenIds };
  state.sourceElements.set(block, element);
  state.blocks.push(block);
}

// ============================================================================
// Document Structure Processing
// ============================================================================

function processBody(element: Element, state: ParserState): void {
  for (const child of childElements(element)) {
    if (getLocalName(child) === 'block') {
      processBlock(child, state);
    }
  }
}

function processReadings(element: Element, state: ParserState): void {
  for (const child of childElements(element)) {
    if (getLocalName(child) === 'reading') {
      const kind = getRequiredAttr(child, 'kind', 'skam:reading');
      // xml:space="preserve" は前後の空白を残す。stringify は前後に空白がある text にこの印を書く
      const raw = child.textContent ?? '';
      const text = child.getAttribute('xml:space') === 'preserve' ? raw : raw.trim();

      const reading: Reading = {
        kind: kind as 'kundoku' | 'kakikudashi' | 'yomiage',
        text,
      };
      state.sourceElements.set(reading, child);
      state.readings.push(reading);
    }
  }
}

function processNotes(element: Element, state: ParserState): void {
  for (const child of childElements(element)) {
    // skam:note element with ref attribute referencing a skam:ref element
    if (getLocalName(child) === 'note') {
      // Note: @xmldom/xmldom returns "" for missing attributes, not null
      // Use || instead of ?? to handle empty string fallback
      // New design: note has 'ref' attribute that references skam:ref's xml:id
      const refAttr = getAttr(child, 'ref');
      if (refAttr) {
        const text = (child.textContent ?? '').trim();
        state.noteContents.set(refAttr, text);
      }
    }
  }
}

/** highlight の要素のうち、ref との結びを本文を読み終えてから決めるもの */
interface PendingHighlight {
  mark: HighlightMark;
  element: Element;
  /** 空でない `ref` 属性の値 */
  refAttribute: string;
}

function assignAutoMarkIds(state: ParserState): void {
  state.marks.forEach((mark, index) => {
    if (mark.id === PENDING_MARK_ID) mark.id = `m#${index + 1}`;
  });
}

/**
 * 空でない `ref` 属性を持つ highlight に highlight.ref を付ける。
 * 本文を読み終えてから、skam:ref 要素の手書きの id を Map で引く (後ろの ref も指せる。
 * `__proto__` などの名前で誤って結ばない)。見つからない、または ref でない要素の id なら位置つきの誤り。
 * `ref` 属性の無い highlight は、中に ref があっても何とも結ばない
 */
function resolveHighlightRefs(state: ParserState): void {
  const handRefIds = new Map<string, true>();
  for (const mark of state.marks) {
    if (mark.type === 'ref' && isHandId(mark.id ?? '')) handRefIds.set(mark.id!, true);
  }
  for (const { mark, element, refAttribute } of state.pendingHighlights) {
    if (!handRefIds.has(refAttribute)) {
      throw parseErrorAt(
        element,
        `<skam:span type="highlight" ref="${refAttribute}"> references a ref that does not exist. ` +
          `Add xml:id="${refAttribute}" to a <skam:ref> element.`
      );
    }
    mark.ref = refAttribute;
  }
}

function resolveContentReferences(state: ParserState): void {
  // New design: note's ref attribute references skam:ref's id
  // Find ref marks and resolve their content from noteContents
  for (const mark of state.marks) {
    if (mark.type === 'ref' && mark.id) {
      const noteText = state.noteContents.get(mark.id);
      if (noteText !== undefined) {
        (mark as RefMark).content = noteText;
      }
    }
  }
}

const ERROR_PATH_ROOT = /^(tokens|marks|blocks)\[(\d+)\]/;

/**
 * 検証エラーの path が指す token・mark・block を作った要素の行と列を、エラーに足す。
 * 表はオブジェクトの同一性で引く (id は重複や自動採番で当てにならない)。
 * validateSKAMDocument は渡された object を複製しないので、skamDoc の配列の要素がそのまま表のキーになる。
 * 引けない path (readings、文書全体など) と、開始タグと要素の対応が取れず位置を求められないときは、元のエラーを返す。
 */
function attachPositions(
  errors: ValidationError[],
  skamDoc: SKAMDocument,
  sourceElements: WeakMap<object, Element>
): ValidationError[] {
  return errors.map((error) => {
    const match = ERROR_PATH_ROOT.exec(error.path);
    if (!match) return error;
    const collection = match[1] as 'tokens' | 'marks' | 'blocks';
    const target = skamDoc[collection][Number(match[2])];
    const element = target === undefined ? undefined : sourceElements.get(target);
    if (!element) return error;
    const position = nodePosition(element);
    if (position.line === undefined && position.column === undefined) return error;
    const located: ValidationError = { ...error };
    if (position.line !== undefined) located.line = position.line;
    if (position.column !== undefined) located.column = position.column;
    return located;
  });
}

// ============================================================================
// Main Parse Function (from Document)
// ============================================================================

export interface ParseOptions {
  /** Validate the resulting document (default: true) */
  validate?: boolean;
  /** Enable position tracking in token.ext (default: false) */
  trackPositions?: boolean;
  /** Maximum input length in UTF-16 code units (default: 5,000,000) */
  maxInputLength?: number;
  /** Maximum element nesting depth (default: 64) */
  maxDepth?: number;
  /** Receives non-fatal diagnostics (e.g. unknown skam:* elements). Omit to drop them */
  onWarning?: (warning: ParseWarning) => void;
  /**
   * 既定の束 (`@kanbun-skam/skam/extensions`) に足す拡張の定義。名前が束と重なれば TypeError。
   * 定義の無い拡張の属性は読み飛ばし、知らない必須の拡張を宣言した文書は誤りにする
   */
  extensions?: readonly SKAMExtensionDefinition[];
  /**
   * Trusted Types が必須のページで、ブラウザ版が `DOMParser.parseFromString` に渡す XML を
   * 包むための policy。`createHTML` は事前走査の後に、parse 1 回につき 1 回、元の XML で呼ばれる。
   * Node 版 (xmldom) は Trusted Types と関係が無いので、受け取っても使わない (呼ばない)。
   *
   * `createHTML` は XML をそのまま返すこと。入力の上限と位置は元の文字列に対して扱うので、
   * XML を書き換える policy (HTML 用の sanitizer など) では上限が効かず、位置がずれ、文書が壊れうる。
   * `createHTML` が投げた例外は包まずにそのまま投げる。
   *
   * @experimental
   */
  trustedTypesPolicy?: { createHTML(input: string): unknown };
}

export interface ParseWarning {
  /** `'UNKNOWN_ELEMENT'` または `KAERI_MULTI_CHARACTER` (`@kanbun-skam/skam` の定数と同じ値) */
  code: 'UNKNOWN_ELEMENT' | (string & {});
  /** 入力 XML に由来する要素名。エスケープしていないので、HTML に出すときは利用者側でエスケープすること */
  name: string;
  /** 要素の開始タグの位置。開始タグと要素の対応が取れないときは undefined */
  line?: number;
  column?: number;
  message: string;
}

/**
 * Pre-scan the source, then parse it with the environment-specific XML parser.
 * Both entry points (Node / browser) go through here so the pre-scan cannot be skipped by one of them.
 */
export function parseWith(
  parseXML: (xml: string) => Document,
  xml: string,
  options: ParseOptions = {}
): SKAMDocument {
  checkInputLimits(xml, {
    maxInputLength: options.maxInputLength ?? DEFAULT_INPUT_LIMITS.maxInputLength,
    maxDepth: options.maxDepth ?? DEFAULT_INPUT_LIMITS.maxDepth,
  });
  // Empty input is decided here so both builds report the same error without reaching the XML parser
  // (xmldom and the browsers each word it differently, and a Trusted Types policy is not called for it).
  // Only the four XML whitespace characters count: U+3000 is body text in SKAM.
  if (/^[ \t\r\n]*$/.test(xml)) throw new SKAMXMLParseError('Empty document');
  return parseFromDocument(parseXML(xml), options, xml);
}

/**
 * Parse SKAM-ML Document to SKAMDocument
 *
 * @param doc Parsed XML Document
 * @param options Parse options
 * @param source Original XML source string (required for position tracking)
 * @returns SKAMDocument
 * @throws SKAMXMLParseError if parsing fails
 */
export function parseFromDocument(
  doc: Document,
  options: ParseOptions = {},
  source?: string
): SKAMDocument {
  if (source === undefined) return parseDocument(doc, options, source);

  // 位置の索引は、位置が要るとき (誤り・警告) の最初の 1 回だけ作る。誤りの無い parse では作らない。
  // 登録は parse の間だけで、位置は例外を投げる前 (この内側) に引き切る。
  // 同じ文書の入れ子の parse で外側の登録を失わないよう、前の値を控えて戻す
  let resolve: ElementPositionResolver | undefined;
  const previous = positionResolvers.get(doc);
  positionResolvers.set(doc, (element) => {
    resolve ??= createElementPositionResolver(doc, source);
    return resolve(element);
  });
  try {
    return parseDocument(doc, options, source);
  } finally {
    if (previous) {
      positionResolvers.set(doc, previous);
    } else {
      positionResolvers.delete(doc);
    }
  }
}

/**
 * ルートの xml:lang。空の値は XML で「言語の情報が無い」の意味なので、無いものとして扱う。
 * 値の形はここでは見ない (validate: true なら validator が、false なら描画の側が見る)
 */
function readRootLang(root: Element): string | undefined {
  const lang = root.getAttribute('xml:lang');
  return lang === null || lang === '' ? undefined : lang;
}

function parseDocument(
  doc: Document,
  options: ParseOptions,
  source: string | undefined
): SKAMDocument {
  const { validate = true, trackPositions = false, onWarning } = options;
  const table = buildExtensionTable(options.extensions);

  // Get root element
  const root = doc.documentElement;
  if (!root) {
    throw new SKAMXMLParseError('Empty document');
  }

  // Validate namespace
  const rootLocalName = getLocalName(root);

  if (rootLocalName !== 'doc' || root.namespaceURI !== SKAM_NS) {
    throw parseErrorAt(
      root,
      `Invalid root element. Expected <skam:doc xmlns:skam="${SKAM_NS}"> but got <${root.tagName}>`
    );
  }

  // Initialize state (with source for position tracking if enabled)
  const state = createParserState(trackPositions ? source : undefined, onWarning);

  // Find and process main sections
  let hasBody = false;
  const metas: Element[] = [];

  for (const child of childElements(root)) {
    const localName = getLocalName(child);

    switch (localName) {
      case 'meta':
        // tokenization は常に 'char' なので読まない。skam:extension は本文を読んだ後に宣言として読む
        metas.push(child);
        break;
      case 'body':
        hasBody = true;
        processBody(child, state);
        break;
      case 'readings':
        processReadings(child, state);
        break;
      case 'notes':
        processNotes(child, state);
        break;
    }
  }

  if (!hasBody) {
    throw parseErrorAt(root, 'Document must contain <skam:body>');
  }

  // Resolve content references for ref marks
  resolveContentReferences(state);

  // 手書きの id が無い注記に `m#<marks[] の順>` を付け、highlight と ref を結ぶ
  assignAutoMarkIds(state);
  resolveHighlightRefs(state);

  const declaration = readExtensionDeclarations(metas, table);

  // Build document
  const skamDoc: SKAMDocument = {
    format: 'skam@0.1',
    tokens: state.tokens,
    blocks: state.blocks,
    marks: state.marks,
    readings: state.readings,
  };
  const lang = readRootLang(root);
  if (lang !== undefined) skamDoc.lang = lang;
  if (declaration) {
    skamDoc.extensions = declaration.used;
    if (declaration.required.length > 0) skamDoc.extensionsRequired = declaration.required;
  }

  applyExtensionAttributes(root, skamDoc, state, table, new Set(declaration?.used));

  if (validate) {
    const result = validateSKAMDocument(
      skamDoc,
      options.extensions ? { extensions: options.extensions } : {}
    );
    if (!result.valid) {
      throw new SKAMValidationError(attachPositions(result.errors, skamDoc, state.sourceElements));
    }
  }

  return skamDoc;
}
