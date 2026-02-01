/**
 * SKAM-ML/XML Parser
 *
 * XML → SKAM JSON 変換
 */

import { DOMParser } from '@xmldom/xmldom';
import type {
  SKAMDocument,
  Token,
  Mark,
  Reading,
  KaeriMark,
  OkuriganaMark,
  YomiganaMark,
  OkimojiMark,
  JojiMark,
  SoeganaMark,
  KutotenMark,
  EmphasisMark,
  NoteMark,
  SaidokuMark,
  SaidokuForm,
  OkototenMark,
  TatetenMark,
  GlyphGridCoord,
  UnderlineMark,
  UnderlineStyle,
  LabelMark,
  LabelFormat,
} from '@kanbun/skam';

// ============================================================================
// Constants
// ============================================================================

const SKAM_NS = 'urn:skam:1';

const VALID_KAERI_KINDS = ['re', 'ichi', 'ni', 'san', 'jo', 'chu', 'ge', 'ko', 'otsu'] as const;
type KaeriKind = (typeof VALID_KAERI_KINDS)[number];

const KAERI_VALUE_MAP: Record<KaeriKind, string> = {
  re: 'レ',
  ichi: '一',
  ni: '二',
  san: '三',
  jo: '上',
  chu: '中',
  ge: '下',
  ko: '甲',
  otsu: '乙',
};

const VALID_UNDERLINE_STYLES = ['solid', 'dotted', 'dashed', 'wavy', 'double'] as const;
const VALID_LABEL_FORMATS = ['alpha-upper', 'alpha-lower', 'numeric', 'circled', 'iroha'] as const;

// ============================================================================
// Error Types
// ============================================================================

export class SKAMXMLParseError extends Error {
  constructor(
    message: string,
    public readonly line?: number,
    public readonly column?: number
  ) {
    super(message);
    this.name = 'SKAMXMLParseError';
  }
}

// ============================================================================
// Parser State
// ============================================================================

interface ParserState {
  tokens: Token[];
  marks: Mark[];
  readings: Reading[];
  notes: Map<string, string>;
  tokenIndex: number;
}

function createParserState(): ParserState {
  return {
    tokens: [],
    marks: [],
    readings: [],
    notes: new Map(),
    tokenIndex: 0,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

function getAttr(element: Element, name: string): string | null {
  return element.getAttribute(name);
}

function getRequiredAttr(element: Element, name: string, elementName: string): string {
  // Note: @xmldom/xmldom returns "" for missing attributes, not null
  // We need to check hasAttribute to properly detect missing attributes
  if (!element.hasAttribute(name)) {
    throw new SKAMXMLParseError(`Missing required attribute '${name}' on <${elementName}>`);
  }
  const value = element.getAttribute(name);
  if (value === null || value === '') {
    throw new SKAMXMLParseError(`Missing required attribute '${name}' on <${elementName}>`);
  }
  return value;
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1; // Node.ELEMENT_NODE
}

function isText(node: Node): node is Text {
  return node.nodeType === 3; // Node.TEXT_NODE
}

function getLocalName(element: Element): string {
  return element.localName ?? element.nodeName.split(':').pop() ?? '';
}

function generateTokenId(state: ParserState): string {
  return `t${++state.tokenIndex}`;
}

function generateMarkId(state: ParserState): string {
  return `m${state.marks.length + 1}`;
}

// ============================================================================
// Token Generation
// ============================================================================

function addTokensFromText(text: string, state: ParserState): string[] {
  const ids: string[] = [];
  // Split by grapheme clusters (simplified: by character)
  for (const char of text) {
    if (/\s/.test(char)) continue; // Skip whitespace
    const id = generateTokenId(state);
    state.tokens.push({ id, text: char });
    ids.push(id);
  }
  return ids;
}

function createAnchor(tokenIds: string[]): { from: string; to: string } {
  if (tokenIds.length === 0) {
    throw new SKAMXMLParseError('Cannot create anchor from empty token list');
  }
  return { from: tokenIds[0]!, to: tokenIds[tokenIds.length - 1]! };
}

// ============================================================================
// Mark Processors
// ============================================================================

function processKaeri(element: Element, state: ParserState, precedingTokenId: string | null): void {
  const kind = getRequiredAttr(element, 'kind', 'skam:kaeri');

  if (!VALID_KAERI_KINDS.includes(kind as KaeriKind)) {
    throw new SKAMXMLParseError(
      `Invalid kaeri kind '${kind}'. Valid kinds: ${VALID_KAERI_KINDS.join(', ')}`
    );
  }

  if (!precedingTokenId) {
    throw new SKAMXMLParseError('<skam:kaeri> requires a preceding token');
  }

  const mark: KaeriMark = {
    type: 'kaeri',
    id: generateMarkId(state),
    anchor: { from: precedingTokenId, to: precedingTokenId },
    value: KAERI_VALUE_MAP[kind as KaeriKind],
  };

  state.marks.push(mark);
}

function processKun(element: Element, state: ParserState): string[] {
  const reading = getAttr(element, 'reading');
  const okuri = getAttr(element, 'okuri');
  const soe = getAttr(element, 'soe');

  // Extract text content and generate tokens
  const textContent = element.textContent ?? '';
  const tokenIds = addTokensFromText(textContent, state);

  if (tokenIds.length === 0) {
    throw new SKAMXMLParseError('<skam:kun> must contain text');
  }

  const anchor = createAnchor(tokenIds);

  if (reading) {
    const yomiganaMark: YomiganaMark = {
      type: 'yomigana',
      id: generateMarkId(state),
      anchor,
      value: reading,
    };
    state.marks.push(yomiganaMark);
  }

  if (okuri) {
    const okuriganaMark: OkuriganaMark = {
      type: 'okurigana',
      id: generateMarkId(state),
      anchor,
      value: okuri,
    };
    state.marks.push(okuriganaMark);
  }

  if (soe) {
    const soeganaMark: SoeganaMark = {
      type: 'soegana',
      id: generateMarkId(state),
      anchor,
      value: soe,
    };
    state.marks.push(soeganaMark);
  }

  return tokenIds;
}

function processYomigana(element: Element, state: ParserState): string[] {
  const value = getRequiredAttr(element, 'value', 'skam:yomigana');

  const textContent = element.textContent ?? '';
  const tokenIds = addTokensFromText(textContent, state);

  if (tokenIds.length === 0) {
    throw new SKAMXMLParseError('<skam:yomigana> must contain text');
  }

  const mark: YomiganaMark = {
    type: 'yomigana',
    id: generateMarkId(state),
    anchor: createAnchor(tokenIds),
    value,
  };

  state.marks.push(mark);
  return tokenIds;
}

function processKutoten(
  element: Element,
  state: ParserState,
  precedingTokenId: string | null
): void {
  const value = getRequiredAttr(element, 'value', 'skam:kutoten');
  const kind = getAttr(element, 'kind') as 'ku' | 'ten' | 'other' | null;

  if (!precedingTokenId) {
    throw new SKAMXMLParseError('<skam:kutoten> requires a preceding token');
  }

  const mark: KutotenMark = {
    type: 'kutoten',
    id: generateMarkId(state),
    anchor: { from: precedingTokenId, to: precedingTokenId },
    value,
  };

  if (kind) {
    mark.kind = kind;
  }

  state.marks.push(mark);
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
    throw new SKAMXMLParseError(
      `Invalid grid format '${grid}'. Expected format: NxN (e.g., '5x5')`
    );
  }

  const x = parseInt(xStr, 10);
  const y = parseInt(yStr, 10);

  if (Number.isNaN(x) || Number.isNaN(y)) {
    throw new SKAMXMLParseError('x and y must be integers');
  }

  const textContent = element.textContent ?? '';
  const tokenIds = addTokensFromText(textContent, state);

  if (tokenIds.length === 0) {
    throw new SKAMXMLParseError('<skam:okototen> must contain text');
  }

  const position: GlyphGridCoord = {
    system: 'glyph-grid',
    grid,
    x,
    y,
  };

  const mark: OkototenMark = {
    type: 'okototen',
    id: generateMarkId(state),
    anchor: createAnchor(tokenIds),
    position,
    shape,
  };

  if (sound) {
    mark.sound = sound;
  }

  if (color) {
    mark.color = color;
  }

  state.marks.push(mark);
  return tokenIds;
}

function processOkimoji(element: Element, state: ParserState): string[] {
  const textContent = element.textContent ?? '';
  const tokenIds = addTokensFromText(textContent, state);

  if (tokenIds.length === 0) {
    throw new SKAMXMLParseError('<skam:okimoji> must contain text');
  }

  const mark: OkimojiMark = {
    type: 'okimoji',
    id: generateMarkId(state),
    anchor: createAnchor(tokenIds),
  };

  state.marks.push(mark);
  return tokenIds;
}

function processJoji(element: Element, state: ParserState): string[] {
  const textContent = element.textContent ?? '';
  const tokenIds = addTokensFromText(textContent, state);

  if (tokenIds.length === 0) {
    throw new SKAMXMLParseError('<skam:joji> must contain text');
  }

  const mark: JojiMark = {
    type: 'joji',
    id: generateMarkId(state),
    anchor: createAnchor(tokenIds),
  };

  state.marks.push(mark);
  return tokenIds;
}

function processSoegana(element: Element, state: ParserState): string[] {
  const value = getRequiredAttr(element, 'value', 'skam:soegana');

  // Extract text content (the wrapped character) and generate tokens
  const textContent = element.textContent ?? '';
  const tokenIds = addTokensFromText(textContent, state);

  if (tokenIds.length === 0) {
    throw new SKAMXMLParseError('<skam:soegana> must contain text (the character to annotate)');
  }

  const mark: SoeganaMark = {
    type: 'soegana',
    id: generateMarkId(state),
    anchor: createAnchor(tokenIds),
    value,
  };

  state.marks.push(mark);
  return tokenIds;
}

function processSpan(element: Element, state: ParserState): string[] {
  const type = getRequiredAttr(element, 'type', 'skam:span');
  const kind = getAttr(element, 'kind');

  // Process children to get tokens
  const tokenIds = processBlockChildren(element, state);

  if (tokenIds.length === 0) {
    throw new SKAMXMLParseError('<skam:span> must contain content');
  }

  if (type === 'emphasis') {
    const mark: EmphasisMark = {
      type: 'emphasis',
      id: generateMarkId(state),
      anchor: createAnchor(tokenIds),
    };

    if (kind) {
      mark.value = kind;
    }

    state.marks.push(mark);
  }

  return tokenIds;
}

function processTateten(element: Element, state: ParserState): string[] {
  const textContent = element.textContent ?? '';
  const tokenIds = addTokensFromText(textContent, state);

  if (tokenIds.length === 0) {
    throw new SKAMXMLParseError('<skam:tateten> must contain text');
  }

  const mark: TatetenMark = {
    type: 'tateten',
    id: generateMarkId(state),
    anchor: createAnchor(tokenIds),
  };

  state.marks.push(mark);
  return tokenIds;
}

function processSaidoku(element: Element, state: ParserState): string[] {
  let baseElement: Element | null = null;
  const kunforms: Element[] = [];

  // Find base and kunform elements
  for (let i = 0; i < element.childNodes.length; i++) {
    const child = element.childNodes[i];
    if (!child || !isElement(child)) continue;

    const localName = getLocalName(child);
    if (localName === 'base') {
      baseElement = child;
    } else if (localName === 'kunform') {
      kunforms.push(child);
    }
  }

  if (!baseElement) {
    throw new SKAMXMLParseError('<skam:saidoku> requires <skam:base> element');
  }

  if (kunforms.length === 0) {
    throw new SKAMXMLParseError('<skam:saidoku> requires at least one <skam:kunform> element');
  }

  // Generate tokens from base
  const baseText = baseElement.textContent ?? '';
  const tokenIds = addTokensFromText(baseText, state);

  if (tokenIds.length === 0) {
    throw new SKAMXMLParseError('<skam:base> must contain text');
  }

  // Build forms array
  const forms: SaidokuForm[] = kunforms.map((kunform) => {
    const form: SaidokuForm = {};
    const nAttr = getAttr(kunform, 'n');
    const reading = getAttr(kunform, 'reading');
    const okuri = getAttr(kunform, 'okuri');

    if (nAttr) {
      form.n = parseInt(nAttr, 10);
    }
    if (reading) {
      form.reading = reading;
    }
    if (okuri) {
      form.okuri = okuri;
    }

    return form;
  });

  const mark: SaidokuMark = {
    type: 'saidoku',
    id: generateMarkId(state),
    anchor: createAnchor(tokenIds),
    forms,
  };

  state.marks.push(mark);
  return tokenIds;
}

function processRef(element: Element, state: ParserState, precedingTokenId: string | null): void {
  const target = getRequiredAttr(element, 'target', 'skam:ref');

  if (!precedingTokenId) {
    throw new SKAMXMLParseError('<skam:ref> requires a preceding token');
  }

  // Remove leading # if present
  const noteId = target.startsWith('#') ? target.slice(1) : target;

  // Note content will be resolved later
  const mark: NoteMark = {
    type: 'note',
    id: generateMarkId(state),
    anchor: { from: precedingTokenId, to: precedingTokenId },
    value: '', // Will be filled in later
    ext: { refId: noteId },
  };

  state.marks.push(mark);
}

function processUnderline(element: Element, state: ParserState): string[] {
  const styleAttr = getAttr(element, 'style');
  const group = getAttr(element, 'group');

  // Process children to get tokens
  const tokenIds = processBlockChildren(element, state);

  if (tokenIds.length === 0) {
    throw new SKAMXMLParseError('<skam:underline> must contain content');
  }

  const mark: UnderlineMark = {
    type: 'underline',
    id: generateMarkId(state),
    anchor: createAnchor(tokenIds),
  };

  if (styleAttr) {
    if (!VALID_UNDERLINE_STYLES.includes(styleAttr as (typeof VALID_UNDERLINE_STYLES)[number])) {
      throw new SKAMXMLParseError(
        `Invalid underline style '${styleAttr}'. Valid styles: ${VALID_UNDERLINE_STYLES.join(', ')}`
      );
    }
    mark.style = styleAttr as UnderlineStyle;
  }

  if (group) {
    mark.group = group;
  }

  state.marks.push(mark);
  return tokenIds;
}

function processLabel(element: Element, state: ParserState, precedingTokenId: string | null): void {
  const value = getAttr(element, 'value');
  const formatAttr = getAttr(element, 'format');
  const group = getAttr(element, 'group');

  // Either value or format must be present
  if (!value && !formatAttr) {
    throw new SKAMXMLParseError('<skam:label> requires either value or format attribute');
  }

  if (!precedingTokenId) {
    throw new SKAMXMLParseError('<skam:label> requires a preceding token');
  }

  const mark: LabelMark = {
    type: 'label',
    id: generateMarkId(state),
    anchor: { from: precedingTokenId, to: precedingTokenId },
  };

  if (value) {
    mark.value = value;
  }

  if (formatAttr) {
    if (!VALID_LABEL_FORMATS.includes(formatAttr as (typeof VALID_LABEL_FORMATS)[number])) {
      throw new SKAMXMLParseError(
        `Invalid label format '${formatAttr}'. Valid formats: ${VALID_LABEL_FORMATS.join(', ')}`
      );
    }
    mark.format = formatAttr as LabelFormat;
  }

  if (group) {
    mark.group = group;
  }

  state.marks.push(mark);
}

// ============================================================================
// Block Processing
// ============================================================================

function processBlockChildren(element: Element, state: ParserState): string[] {
  const allTokenIds: string[] = [];
  let lastTokenId: string | null =
    state.tokens.length > 0 ? state.tokens[state.tokens.length - 1]!.id : null;

  for (let i = 0; i < element.childNodes.length; i++) {
    const child = element.childNodes[i];
    if (!child) continue;

    if (isText(child)) {
      const text = child.textContent ?? '';
      const ids = addTokensFromText(text, state);
      allTokenIds.push(...ids);
      if (ids.length > 0) {
        lastTokenId = ids[ids.length - 1]!;
      }
    } else if (isElement(child)) {
      const localName = getLocalName(child);

      switch (localName) {
        case 'kaeri':
          processKaeri(child, state, lastTokenId);
          break;
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
          processKutoten(child, state, lastTokenId);
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
          processRef(child, state, lastTokenId);
          break;
        case 'underline': {
          const ids = processUnderline(child, state);
          allTokenIds.push(...ids);
          if (ids.length > 0) lastTokenId = ids[ids.length - 1]!;
          break;
        }
        case 'label':
          processLabel(child, state, lastTokenId);
          break;
        default:
          // Unknown elements are ignored per spec
          break;
      }
    }
  }

  return allTokenIds;
}

function processBlock(element: Element, state: ParserState): void {
  const tokenIds = processBlockChildren(element, state);

  // Validate non-empty block
  if (tokenIds.length === 0) {
    throw new SKAMXMLParseError('<skam:block> must contain at least one token');
  }
}

// ============================================================================
// Document Structure Processing
// ============================================================================

function processBody(element: Element, state: ParserState): void {
  for (let i = 0; i < element.childNodes.length; i++) {
    const child = element.childNodes[i];
    if (!child) continue;

    if (isElement(child) && getLocalName(child) === 'block') {
      processBlock(child, state);
    }
  }
}

function processReadings(element: Element, state: ParserState): void {
  for (let i = 0; i < element.childNodes.length; i++) {
    const child = element.childNodes[i];
    if (!child) continue;

    if (isElement(child) && getLocalName(child) === 'reading') {
      const kind = getRequiredAttr(child, 'kind', 'skam:reading');
      const text = (child.textContent ?? '').trim();

      state.readings.push({
        kind: kind as 'kundoku' | 'kakikudashi' | 'yomiage',
        text,
      });
    }
  }
}

function processNotes(element: Element, state: ParserState): void {
  for (let i = 0; i < element.childNodes.length; i++) {
    const child = element.childNodes[i];
    if (!child) continue;

    if (isElement(child) && getLocalName(child) === 'note') {
      const id = getAttr(child, 'xml:id') ?? getAttr(child, 'id');
      if (id) {
        const text = (child.textContent ?? '').trim();
        state.notes.set(id, text);
      }
    }
  }
}

function resolveNoteReferences(state: ParserState): void {
  for (const mark of state.marks) {
    if (mark.type === 'note' && mark.ext?.['refId']) {
      const refId = mark.ext['refId'] as string;
      const noteText = state.notes.get(refId);
      if (noteText !== undefined) {
        (mark as NoteMark).value = noteText;
      }
      // Remove the temporary refId from ext
      delete mark.ext['refId'];
      if (Object.keys(mark.ext).length === 0) {
        delete mark.ext;
      }
    }
  }
}

// ============================================================================
// Main Parse Function
// ============================================================================

export interface ParseOptions {
  /** Validate the resulting document (default: true) */
  validate?: boolean;
}

/**
 * Parse SKAM-ML/XML string to SKAMDocument
 *
 * @param xml XML string
 * @param options Parse options
 * @returns SKAMDocument
 * @throws SKAMXMLParseError if parsing fails
 */
export function parse(xml: string, options: ParseOptions = {}): SKAMDocument {
  const { validate: _validate = true } = options;

  // Parse XML
  const errors: string[] = [];
  const parser = new DOMParser({
    errorHandler: {
      warning: () => {},
      error: (msg) => errors.push(msg),
      fatalError: (msg) => errors.push(msg),
    },
  });

  const doc = parser.parseFromString(xml, 'application/xml');

  if (errors.length > 0) {
    throw new SKAMXMLParseError(`XML parse error: ${errors[0]}`);
  }

  // Get root element
  const root = doc.documentElement;
  if (!root) {
    throw new SKAMXMLParseError('Empty document');
  }

  // Validate namespace
  const rootLocalName = getLocalName(root);
  const ns = root.namespaceURI ?? root.getAttribute('xmlns:skam');

  if (rootLocalName !== 'doc' || (ns !== SKAM_NS && !root.getAttribute('xmlns:skam'))) {
    throw new SKAMXMLParseError(
      `Invalid root element. Expected <skam:doc xmlns:skam="${SKAM_NS}"> but got <${root.tagName}>`
    );
  }

  // Initialize state
  const state = createParserState();

  // Find and process main sections
  let hasBody = false;

  for (let i = 0; i < root.childNodes.length; i++) {
    const child = root.childNodes[i];
    if (!child || !isElement(child)) continue;

    const localName = getLocalName(child);

    switch (localName) {
      case 'meta':
        // Currently we just ignore meta, tokenization is always 'char'
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
    throw new SKAMXMLParseError('Document must contain <skam:body>');
  }

  // Resolve note references
  resolveNoteReferences(state);

  // Build document
  const skamDoc: SKAMDocument = {
    format: 'skam@0.1',
    tokens: state.tokens,
    marks: state.marks,
    readings: state.readings,
  };

  return skamDoc;
}
