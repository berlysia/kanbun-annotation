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
  OkimojiMark,
  JojiMark,
  OkototenMark,
  SaidokuMark,
  EmphasisMark,
  HighlightMark,
  RefMark,
  TatetenMark,
} from '@kanbun/skam';

// ============================================================================
// Constants
// ============================================================================

const SKAM_NS = 'urn:skam:1';

// 返り点の value → kind 逆マッピング
const KAERI_KIND_MAP: Record<string, string> = {
  レ: 're',
  一: 'ichi',
  二: 'ni',
  三: 'san',
  四: 'shi',
  上: 'jo',
  中: 'chu',
  下: 'ge',
  点: 'ten',
  甲: 'ko',
  乙: 'otsu',
  丙: 'hei',
  丁: 'tei',
};

// ============================================================================
// Types
// ============================================================================

export interface StringifyOptions {
  /** Indentation size (default: 2) */
  indent?: number;
  /** Include XML declaration (default: true) */
  xmlDeclaration?: boolean;
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
  /** 包囲要素（単一トークン用） */
  wrappers?: SingleTokenWrapper[];
}

// 単一トークンを包む要素
type SingleTokenWrapper =
  | { type: 'okimoji'; mark: OkimojiMark }
  | { type: 'joji'; mark: JojiMark }
  | { type: 'okototen'; mark: OkototenMark }
  | { type: 'saidoku'; mark: SaidokuMark };

// 範囲マーク情報
interface RangeMark {
  mark: Mark;
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
  mark: Mark;
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
 * Token のブロックID を取得
 */
function getBlockId(token: Token): string | undefined {
  return token.ext?.['blockId'] as string | undefined;
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
// Token Index Map
// ============================================================================

/**
 * トークンID → インデックスのマップを構築
 */
function buildTokenIndexMap(tokens: Token[]): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token) {
      map.set(token.id, i);
    }
  }
  return map;
}

// ============================================================================
// Annotation Collection
// ============================================================================

/** Type guard for anchor-based marks */
function isAnchorBasedMark(mark: Mark): mark is Exclude<Mark, KutotenMark | RefMark> {
  return mark.type !== 'kutoten' && mark.type !== 'ref';
}

/** Get the token ID that a position-based mark should be attached to (for 'after' position) */
function getPositionAfterTokenId(position: Position): string | undefined {
  if ('after' in position && position.after) {
    return position.after;
  }
  return undefined;
}

/**
 * Token ごとの annotation を収集（単一トークンマーク用）
 */
function collectTokenAnnotations(
  tokens: Token[],
  marks: Mark[],
  _tokenIndexMap: Map<string, number>
): Map<string, TokenAnnotation> {
  const annotations = new Map<string, TokenAnnotation>();

  // 各 token の annotation を初期化
  for (const token of tokens) {
    annotations.set(token.id, {});
  }

  // Mark を処理
  for (const mark of marks) {
    // Position-based marks (kutoten, ref) are handled separately
    if (!isAnchorBasedMark(mark)) {
      const positionMark = mark as KutotenMark | RefMark;
      const tokenId = getPositionAfterTokenId(positionMark.position);
      if (!tokenId) {
        // before-only position marks are not attached to a token annotation
        continue;
      }
      const annotation = annotations.get(tokenId);
      if (!annotation) {
        continue;
      }

      if (mark.type === 'kutoten') {
        if (!annotation.kutotenAfter) {
          annotation.kutotenAfter = [];
        }
        annotation.kutotenAfter.push(mark as KutotenMark);
      } else if (mark.type === 'ref') {
        if (!annotation.refAfter) {
          annotation.refAfter = [];
        }
        annotation.refAfter.push(mark as RefMark);
      }
      continue;
    }

    // Anchor-based marks: only process single-token marks
    if (mark.anchor.from !== mark.anchor.to) {
      // 複数 token にまたがる mark は別途処理
      continue;
    }

    const tokenId = mark.anchor.from;
    const annotation = annotations.get(tokenId);
    if (!annotation) {
      continue;
    }

    switch (mark.type) {
      case 'yomigana':
        annotation.yomi = (mark as YomiganaMark).value;
        break;
      case 'okurigana':
        annotation.okuri = (mark as OkuriganaMark).value;
        break;
      case 'soegana':
        annotation.soe = (mark as SoeganaMark).value;
        break;
      case 'kaeri':
        if (!annotation.kaeriAfter) {
          annotation.kaeriAfter = [];
        }
        annotation.kaeriAfter.push(mark as KaeriMark);
        break;
      case 'okimoji':
        if (!annotation.wrappers) {
          annotation.wrappers = [];
        }
        annotation.wrappers.push({ type: 'okimoji', mark: mark as OkimojiMark });
        break;
      case 'joji':
        if (!annotation.wrappers) {
          annotation.wrappers = [];
        }
        annotation.wrappers.push({ type: 'joji', mark: mark as JojiMark });
        break;
      case 'okototen':
        if (!annotation.wrappers) {
          annotation.wrappers = [];
        }
        annotation.wrappers.push({ type: 'okototen', mark: mark as OkototenMark });
        break;
      case 'saidoku':
        if (!annotation.wrappers) {
          annotation.wrappers = [];
        }
        annotation.wrappers.push({ type: 'saidoku', mark: mark as SaidokuMark });
        break;
    }
  }

  return annotations;
}

/**
 * 範囲マークを収集（包囲要素として出力すべきマーク用）
 *
 * emphasis, tateten, highlight は単一トークンでも包囲要素として出力する。
 *
 * ref は position ベースなので範囲マークとしては扱わない。
 * （content がある場合は notes セクションに出力される）
 */
function collectRangeMarks(marks: Mark[], tokenIndexMap: Map<string, number>): RangeMark[] {
  const rangeMarks: RangeMark[] = [];

  for (const mark of marks) {
    // 包囲要素として出力すべきマークタイプ（anchor ベースのみ）
    // ref は position ベースなので除外
    if (mark.type !== 'emphasis' && mark.type !== 'tateten' && mark.type !== 'highlight') {
      continue;
    }

    // These marks are anchor-based
    const anchorMark = mark as EmphasisMark | TatetenMark | HighlightMark;

    const startIndex = tokenIndexMap.get(anchorMark.anchor.from);
    const endIndex = tokenIndexMap.get(anchorMark.anchor.to);

    if (startIndex === undefined || endIndex === undefined) {
      continue;
    }

    rangeMarks.push({
      mark,
      startIndex,
      endIndex,
    });
  }

  // ソート：開始位置昇順、同一開始なら終了位置降順（外側が先）
  rangeMarks.sort((a, b) => {
    if (a.startIndex !== b.startIndex) {
      return a.startIndex - b.startIndex;
    }
    return b.endIndex - a.endIndex;
  });

  return rangeMarks;
}

/**
 * 部分重複するマークを検出してフィルタリング
 */
function filterPartialOverlaps(rangeMarks: RangeMark[]): RangeMark[] {
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
        console.warn(
          `Skipping mark ${mark.mark.id ?? mark.mark.type} due to partial overlap with ${existing.mark.id ?? existing.mark.type}`
        );
        break;
      }
    }

    if (!hasPartialOverlap) {
      valid.push(mark);
    }
  }

  return valid;
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
  blockEndIndex: number
): ContentNode[] {
  // このブロックに関係する範囲マークをフィルタ
  const blockRangeMarks = allRangeMarks.filter(
    (rm) => rm.startIndex >= blockStartIndex && rm.endIndex <= blockEndIndex
  );

  // 部分重複をフィルタリング
  const validRangeMarks = filterPartialOverlaps(blockRangeMarks);

  const result: ContentNode[] = [];
  const activeRanges: { mark: Mark; endIndex: number; children: ContentNode[] }[] = [];

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
 * 単一トークンの XML を生成（wrapper なし、annotation のみ）
 */
function tokenContentToXml(text: string, annotation: TokenAnnotation): string {
  const { yomi, okuri, soe, kaeriAfter, kutotenAfter, refAfter } = annotation;
  const hasKunAttrs = yomi || okuri || soe;

  let xml = '';

  if (hasKunAttrs) {
    // skam:kun 要素で囲む
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

    xml += `<skam:kun ${attrs.join(' ')}>${escapeXml(text)}</skam:kun>`;
  } else {
    // プレーンテキスト
    xml += escapeXml(text);
  }

  // 返り点を追加
  if (kaeriAfter) {
    for (const kaeri of kaeriAfter) {
      const kind = kaeriValueToKind(kaeri.value);
      xml += `<skam:kaeri kind="${escapeXml(kind)}"/>`;
    }
  }

  // 句読点を追加
  if (kutotenAfter) {
    for (const kutoten of kutotenAfter) {
      let attrs = `value="${escapeXml(kutoten.value)}"`;
      if (kutoten.kind) {
        attrs += ` kind="${kutoten.kind}"`;
      }
      xml += `<skam:kutoten ${attrs}/>`;
    }
  }

  // 空要素 ref を追加
  if (refAfter) {
    for (const ref of refAfter) {
      xml += refMarkToXml(ref, true);
    }
  }

  return xml;
}

/**
 * wrapper を適用してトークン XML を生成
 */
function applyWrappers(innerXml: string, wrappers: SingleTokenWrapper[] | undefined): string {
  if (!wrappers || wrappers.length === 0) {
    return innerXml;
  }

  let xml = innerXml;

  // wrapper を外側から適用（配列の逆順）
  for (let i = wrappers.length - 1; i >= 0; i--) {
    const wrapper = wrappers[i];
    if (!wrapper) continue;

    switch (wrapper.type) {
      case 'okimoji':
        xml = `<skam:okimoji>${xml}</skam:okimoji>`;
        break;
      case 'joji':
        xml = `<skam:joji>${xml}</skam:joji>`;
        break;
      case 'okototen': {
        const oto = wrapper.mark;
        let attrs = `grid="${escapeXml(oto.position.grid)}" x="${oto.position.x}" y="${oto.position.y}" shape="${escapeXml(oto.shape)}"`;
        if (oto.sound) {
          attrs += ` sound="${escapeXml(oto.sound)}"`;
        }
        if (oto.color) {
          attrs += ` color="${escapeXml(oto.color)}"`;
        }
        xml = `<skam:okototen ${attrs}>${xml}</skam:okototen>`;
        break;
      }
      case 'saidoku': {
        const sai = wrapper.mark;
        let formsXml = '';
        for (const form of sai.forms) {
          let formAttrs = '';
          if (form.n !== undefined) {
            formAttrs += ` n="${form.n}"`;
          }
          if (form.yomi) {
            formAttrs += ` yomi="${escapeXml(form.yomi)}"`;
          }
          if (form.okuri) {
            formAttrs += ` okuri="${escapeXml(form.okuri)}"`;
          }
          formsXml += `<skam:kunform${formAttrs}/>`;
        }
        xml = `<skam:saidoku><skam:base>${xml}</skam:base>${formsXml}</skam:saidoku>`;
        break;
      }
    }
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
 * コンテンツノードを XML に変換
 */
function contentNodeToXml(node: ContentNode): string {
  if (node.type === 'text') {
    // テキストノード：annotation を適用
    const innerXml = tokenContentToXml(node.text, node.annotation);
    return applyWrappers(innerXml, node.annotation.wrappers);
  } else {
    // 要素ノード：子を再帰的に処理
    const childrenXml = node.children.map(contentNodeToXml).join('');

    switch (node.mark.type) {
      case 'emphasis': {
        const emp = node.mark as EmphasisMark;
        let attrs = 'type="emphasis"';
        if (emp.style) {
          attrs += ` style="${escapeXml(emp.style)}"`;
        }
        return `<skam:span ${attrs}>${childrenXml}</skam:span>`;
      }
      case 'tateten':
        return `<skam:tateten>${childrenXml}</skam:tateten>`;
      case 'highlight': {
        const hl = node.mark as HighlightMark;
        let attrs = 'type="highlight"';
        if (hl.style) {
          attrs += ` style="${hl.style}"`;
        }
        if (hl.ref) {
          attrs += ` ref="${escapeXml(hl.ref)}"`;
        }
        return `<skam:span ${attrs}>${childrenXml}</skam:span>`;
      }
      case 'ref': {
        const ref = node.mark as RefMark;
        return refMarkToXml(ref, false);
      }
      default:
        return childrenXml;
    }
  }
}

/**
 * ブロックの XML を生成
 */
function blockToXml(
  blockTokens: Token[],
  annotations: Map<string, TokenAnnotation>,
  rangeMarks: RangeMark[],
  blockStartIndex: number,
  indentLevel: number,
  indentSize: number
): string {
  const ind = indentStr(indentLevel, indentSize);

  // 木構造を構築
  const contentTree = buildContentTree(
    blockTokens,
    annotations,
    rangeMarks,
    blockStartIndex,
    blockStartIndex + blockTokens.length - 1
  );

  // XML に変換
  const content = contentTree.map(contentNodeToXml).join('');

  return `${ind}<skam:block>${content}</skam:block>`;
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
  const { indent: indentSize = 2, xmlDeclaration = true } = options;

  // トークンインデックスマップを構築
  const tokenIndexMap = buildTokenIndexMap(doc.tokens);

  // Annotation を収集
  const annotations = collectTokenAnnotations(doc.tokens, doc.marks, tokenIndexMap);

  // 範囲マークを収集
  const rangeMarks = collectRangeMarks(doc.marks, tokenIndexMap);

  // Token をブロックごとにグループ化
  interface BlockInfo {
    tokens: Token[];
    startIndex: number;
  }
  const blocks: BlockInfo[] = [];
  let currentBlock: Token[] = [];
  let currentBlockId: string | undefined;
  let currentBlockStartIndex = 0;

  for (let i = 0; i < doc.tokens.length; i++) {
    const token = doc.tokens[i];
    if (!token) continue;

    const blockId = getBlockId(token);

    if (blockId !== currentBlockId) {
      if (currentBlock.length > 0) {
        blocks.push({ tokens: currentBlock, startIndex: currentBlockStartIndex });
      }
      currentBlock = [];
      currentBlockId = blockId;
      currentBlockStartIndex = i;
    }

    currentBlock.push(token);
  }

  if (currentBlock.length > 0) {
    blocks.push({ tokens: currentBlock, startIndex: currentBlockStartIndex });
  }

  // XML を構築
  const lines: string[] = [];

  // XML 宣言
  if (xmlDeclaration) {
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  }

  // ルート要素開始
  lines.push(`<skam:doc xmlns:skam="${SKAM_NS}">`);

  // meta 要素（常に char tokenization）
  lines.push(`${indentStr(1, indentSize)}<skam:meta>`);
  lines.push(`${indentStr(2, indentSize)}<skam:tokenize strategy="char"/>`);
  lines.push(`${indentStr(1, indentSize)}</skam:meta>`);

  // body 要素
  lines.push(`${indentStr(1, indentSize)}<skam:body>`);

  for (const block of blocks) {
    lines.push(blockToXml(block.tokens, annotations, rangeMarks, block.startIndex, 2, indentSize));
  }

  lines.push(`${indentStr(1, indentSize)}</skam:body>`);

  // notes 要素（分離定義の注釈がある場合）
  const notesLines = stringifyNotes(doc.marks, indentSize);
  if (notesLines.length > 0) {
    lines.push('');
    lines.push(...notesLines);
  }

  // ルート要素終了
  lines.push('</skam:doc>');

  return lines.join('\n');
}
