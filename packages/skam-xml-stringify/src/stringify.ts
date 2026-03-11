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
} from '@kanbun-skam/skam';
import { isAnchorBasedMark, KAERI } from '@kanbun-skam/skam';

// ============================================================================
// Constants
// ============================================================================

const SKAM_NS = 'urn:skam:1';

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

// 複数トークンにまたがるkun属性をまとめた合成マーク（stringify内部用）
interface KunRangeSyntheticMark {
  type: '__kun_range';
  yomi?: string;
  okuri?: string;
  soe?: string;
  anchor: { from: string; to: string };
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

/** Position-based mark (kaeri/kutoten/ref) を annotation に追加 */
function applyPositionBasedMark(mark: Mark, annotations: Map<string, TokenAnnotation>): void {
  const positionMark = mark as KaeriMark | KutotenMark | RefMark;
  const tokenId = getPositionAfterTokenId(positionMark.position);
  if (!tokenId) return;

  const annotation = annotations.get(tokenId);
  if (!annotation) return;

  if (mark.type === 'kaeri') {
    if (!annotation.kaeriAfter) annotation.kaeriAfter = [];
    annotation.kaeriAfter.push(mark as KaeriMark);
  } else if (mark.type === 'kutoten') {
    if (!annotation.kutotenAfter) annotation.kutotenAfter = [];
    annotation.kutotenAfter.push(mark as KutotenMark);
  } else if (mark.type === 'ref') {
    if (!annotation.refAfter) annotation.refAfter = [];
    annotation.refAfter.push(mark as RefMark);
  }
}

/** 単一トークンの anchor-based mark を annotation に追加 */
function applySingleTokenAnchorMark(mark: Mark, annotation: TokenAnnotation): void {
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
    case 'okimoji':
      if (!annotation.wrappers) annotation.wrappers = [];
      annotation.wrappers.push({ type: 'okimoji', mark: mark as OkimojiMark });
      break;
    case 'joji':
      if (!annotation.wrappers) annotation.wrappers = [];
      annotation.wrappers.push({ type: 'joji', mark: mark as JojiMark });
      break;
    case 'okototen':
      if (!annotation.wrappers) annotation.wrappers = [];
      annotation.wrappers.push({ type: 'okototen', mark: mark as OkototenMark });
      break;
    case 'saidoku':
      if (!annotation.wrappers) annotation.wrappers = [];
      annotation.wrappers.push({ type: 'saidoku', mark: mark as SaidokuMark });
      break;
  }
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

  for (const token of tokens) {
    annotations.set(token.id, {});
  }

  for (const mark of marks) {
    if (!isAnchorBasedMark(mark)) {
      applyPositionBasedMark(mark, annotations);
      continue;
    }

    // 複数 token にまたがる mark は別途処理
    if (mark.anchor.from !== mark.anchor.to) continue;

    const annotation = annotations.get(mark.anchor.from);
    if (!annotation) continue;

    applySingleTokenAnchorMark(mark, annotation);
  }

  return annotations;
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
}

/** 複数トークンにまたがる kun 系マークをグループ化して合成マークを生成 */
function collectKunRangeGroups(marks: Mark[], tokenIndexMap: Map<string, number>): RangeMark[] {
  const kunGroups = new Map<string, KunGroup>();

  for (const mark of marks) {
    if (mark.type !== 'yomigana' && mark.type !== 'okurigana' && mark.type !== 'soegana') continue;
    if (mark.anchor.from === mark.anchor.to) continue;

    const startIndex = tokenIndexMap.get(mark.anchor.from);
    const endIndex = tokenIndexMap.get(mark.anchor.to);
    if (startIndex === undefined || endIndex === undefined) continue;

    const key = `${mark.anchor.from}:${mark.anchor.to}`;
    let group = kunGroups.get(key);
    if (!group) {
      group = { from: mark.anchor.from, to: mark.anchor.to, startIndex, endIndex };
      kunGroups.set(key, group);
    }

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
  }

  const result: RangeMark[] = [];
  for (const group of kunGroups.values()) {
    const syntheticMark: KunRangeSyntheticMark = {
      type: '__kun_range',
      anchor: { from: group.from, to: group.to },
    };
    if (group.yomi) syntheticMark.yomi = group.yomi;
    if (group.okuri) syntheticMark.okuri = group.okuri;
    if (group.soe) syntheticMark.soe = group.soe;

    result.push({ mark: syntheticMark, startIndex: group.startIndex, endIndex: group.endIndex });
  }
  return result;
}

function collectRangeMarks(marks: Mark[], tokenIndexMap: Map<string, number>): RangeMark[] {
  const rangeMarks: RangeMark[] = [];

  // emphasis, tateten, highlight は直接範囲マークとして追加
  for (const mark of marks) {
    if (mark.type !== 'emphasis' && mark.type !== 'tateten' && mark.type !== 'highlight') continue;
    const anchorMark = mark as EmphasisMark | TatetenMark | HighlightMark;
    const startIndex = tokenIndexMap.get(anchorMark.anchor.from);
    const endIndex = tokenIndexMap.get(anchorMark.anchor.to);
    if (startIndex === undefined || endIndex === undefined) continue;
    rangeMarks.push({ mark, startIndex, endIndex });
  }

  // 複数トークン kun 系マークのグループ化
  rangeMarks.push(...collectKunRangeGroups(marks, tokenIndexMap));

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
        const markLabel = 'id' in mark.mark ? (mark.mark.id ?? mark.mark.type) : mark.mark.type;
        const existLabel =
          'id' in existing.mark ? (existing.mark.id ?? existing.mark.type) : existing.mark.type;
        console.warn(`Skipping mark ${markLabel} due to partial overlap with ${existLabel}`);
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
 * trailing marks（kaeri/kutoten/ref）の XML を生成
 */
function tokenTrailingToXml(annotation: TokenAnnotation): string {
  const { kaeriAfter, kutotenAfter, refAfter } = annotation;
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
      xml += refMarkToXml(ref, true);
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
    case 'ref':
      return refMarkToXml(mark as RefMark, false);
    default:
      return childrenXml;
  }
}

/** trailing marks を一時的に保存・抑制する */
interface SavedTrailingMarks {
  kaeri?: KaeriMark[];
  kutoten?: KutotenMark[];
  ref?: RefMark[];
}

/**
 * 要素ノードの最終子テキストから trailing marks を退避し、
 * 子を再帰処理後、退避した marks の XML を返す
 */
function renderElementWithTrailing(node: ElementNode): {
  childrenXml: string;
  trailingXml: string;
} {
  const lastChild = node.children[node.children.length - 1];
  let saved: SavedTrailingMarks = {};

  // 最終直接子テキストの trailing marks を退避（range 要素の外に配置するため）
  if (lastChild?.type === 'text') {
    const ann = lastChild.annotation;
    saved = {
      ...(ann.kaeriAfter ? { kaeri: ann.kaeriAfter } : {}),
      ...(ann.kutotenAfter ? { kutoten: ann.kutotenAfter } : {}),
      ...(ann.refAfter ? { ref: ann.refAfter } : {}),
    };
    delete ann.kaeriAfter;
    delete ann.kutotenAfter;
    delete ann.refAfter;
  }

  const childrenXml = node.children.map(contentNodeToXml).join('');

  // アノテーションを復元
  if (lastChild?.type === 'text') {
    if (saved.kaeri) lastChild.annotation.kaeriAfter = saved.kaeri;
    if (saved.kutoten) lastChild.annotation.kutotenAfter = saved.kutoten;
    if (saved.ref) lastChild.annotation.refAfter = saved.ref;
  }

  // 退避した trailing marks の XML を生成（tokenTrailingToXml と同形式）
  const trailingAnnotation: TokenAnnotation = {
    ...(saved.kaeri ? { kaeriAfter: saved.kaeri } : {}),
    ...(saved.kutoten ? { kutotenAfter: saved.kutoten } : {}),
    ...(saved.ref ? { refAfter: saved.ref } : {}),
  };
  const trailingXml = tokenTrailingToXml(trailingAnnotation);

  return { childrenXml, trailingXml };
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

  // 要素ノード：trailing marks を range 要素の外に配置
  const { childrenXml, trailingXml } = renderElementWithTrailing(node);
  const elementXml = renderRangeElement(node.mark, childrenXml);
  return elementXml + trailingXml;
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
  const annotations = collectTokenAnnotations(doc.tokens, doc.marks, tokenIndexMap);

  // 範囲マークを収集
  const rangeMarks = collectRangeMarks(doc.marks, tokenIndexMap);

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
      blockToXml(block.id, blockTokens, annotations, rangeMarks, blockStartIndex, 2, indentSize)
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

  return lines.join('\n');
}
