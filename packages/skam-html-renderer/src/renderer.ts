/**
 * SKAM HTML Renderer
 *
 * SKAMドキュメントから静的HTMLを生成する
 */

import type {
  SKAMDocument,
  Token,
  Block,
  Mark,
  Position,
  KaeriMark,
  OkuriganaMark,
  YomiganaMark,
  OkimojiMark,
  JojiMark,
  SoeganaMark,
  KutotenMark,
  EmphasisMark,
  SaidokuMark,
  OkototenMark,
  TatetenMark,
  HighlightMark,
  RefMark,
  RefFormat,
  Reading,
} from '@kanbun/skam';
import { isPositionBasedMark } from '@kanbun/skam';
import { getDefaultStyles } from './styles.js';
import type { RangeMarkContext, RangeTokenInfo, TokenRenderResult } from './render-tree-types.js';
import { buildBlockRenderTree, type BuildTreeContext } from './build-render-tree.js';
import { renderBlockTree, type RenderTreeContext } from './render-tree.js';

export type { RangeMarkContext, RangeTokenInfo, TokenRenderResult } from './render-tree-types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * 表示要素の制御プロファイル
 */
export interface RenderProfile {
  yomigana: boolean;
  okurigana: boolean;
  kaeriten: boolean;
  kutoten: boolean;
  saidoku: boolean;
  okototen: boolean;
  tateten: boolean;
  emphasis: boolean;
  okimoji: boolean;
  joji: boolean;
  soegana: boolean;
  highlight: boolean;
  ref: boolean;
}

/**
 * コピー可能にする要素の種類
 */
export type CopyableElement = 'ruby' | 'okurigana' | 'soegana' | 'kaeriten' | 'okototen';

/**
 * レンダリングオプション
 */
export interface RenderOptions {
  /** 表示要素の制御プロファイル */
  profile?: Partial<RenderProfile>;
  /** 書字方向 */
  writingMode?: 'vertical' | 'horizontal';
  /** CSSクラス名プレフィックス */
  classPrefix?: string;
  /** a11y用読み層を含める */
  includeReadingLayer?: boolean;
  /** インラインモード（文中埋め込み・連続フロー用） */
  inline?: boolean;
  /** @layer でラップするか（default: true） */
  useLayer?: boolean;
  /** @layer のレイヤー名（default: 'skam-kanbun'） */
  layerName?: string;
  /** CSS Variables のプレフィックス（default: 'skam'） */
  variablePrefix?: string;
  /**
   * コピー可能にする要素（default: undefined = 本文のみ）
   *
   * - undefined: 本文のみコピー可能（デフォルト）
   * - 'all': 全ての要素をコピー可能
   * - CopyableElement[]: 指定した要素をコピー可能
   */
  copyable?: CopyableElement[] | 'all';
  /**
   * インタラクティブモード（default: false）
   *
   * trueの場合、data-token-id / data-token-from / data-token-to 属性を出力する
   */
  interactive?: boolean;
}

/**
 * レンダリング結果
 */
export interface RenderResult {
  html: string;
  css: string;
}

/**
 * HTMLのみ生成オプション
 */
export interface RenderHTMLOptions {
  /** 表示要素の制御プロファイル */
  profile?: Partial<RenderProfile>;
  /** 書字方向 */
  writingMode?: 'vertical' | 'horizontal';
  /** CSSクラス名プレフィックス */
  classPrefix?: string;
  /** a11y用読み層を含める */
  includeReadingLayer?: boolean;
  /** インラインモード（文中埋め込み・連続フロー用） */
  inline?: boolean;
  /**
   * コピー可能にする要素（default: undefined = 本文のみ）
   *
   * - undefined: 本文のみコピー可能（デフォルト）
   * - 'all': 全ての要素をコピー可能
   * - CopyableElement[]: 指定した要素をコピー可能
   */
  copyable?: CopyableElement[] | 'all';
  /**
   * インタラクティブモード（default: false）
   *
   * trueの場合、data-token-id / data-token-from / data-token-to 属性を出力する
   */
  interactive?: boolean;
}

/**
 * CSS生成オプション
 */
export interface CSSOptions {
  /** CSSクラス名プレフィックス */
  classPrefix?: string;
  /** 書字方向（'both' で縦横両対応CSS出力） */
  writingMode?: 'vertical' | 'horizontal' | 'both';
  /** インラインモード用スタイルを含める */
  inline?: boolean;
  /** @layer でラップするか（default: true） */
  useLayer?: boolean;
  /** @layer のレイヤー名（default: 'skam-kanbun'） */
  layerName?: string;
  /** CSS Variables のプレフィックス（default: 'skam'） */
  variablePrefix?: string;
}

// ============================================================================
// Presets
// ============================================================================

/** 全要素表示プロファイル */
const FULL_PROFILE: RenderProfile = {
  yomigana: true,
  okurigana: true,
  kaeriten: true,
  kutoten: true,
  saidoku: true,
  okototen: true,
  tateten: true,
  emphasis: true,
  okimoji: true,
  joji: true,
  soegana: true,
  highlight: true,
  ref: true,
};

/** 学習用基本プロファイル（返り点のみ） */
const LEARNING_BASIC_PROFILE: RenderProfile = {
  yomigana: false,
  okurigana: false,
  kaeriten: true,
  kutoten: true,
  saidoku: false,
  okototen: false,
  tateten: false,
  emphasis: false,
  okimoji: true,
  joji: true,
  soegana: false,
  highlight: true,
  ref: true,
};

/** 学習用ヒント付きプロファイル（返り点+送り仮名+再読文字） */
const LEARNING_HINT_PROFILE: RenderProfile = {
  yomigana: false,
  okurigana: true,
  kaeriten: true,
  kutoten: true,
  saidoku: true,
  okototen: false,
  tateten: false,
  emphasis: false,
  okimoji: true,
  joji: true,
  soegana: true,
  highlight: true,
  ref: true,
};

/**
 * プリセットプロファイル
 */
export const PROFILES = {
  full: FULL_PROFILE,
  learningBasic: LEARNING_BASIC_PROFILE,
  learningHint: LEARNING_HINT_PROFILE,
} as const;

// ============================================================================
// Unicode Constants
// ============================================================================

/**
 * イロハ順（カタカナ）
 */
const IROHA_SEQUENCE =
  'イロハニホヘトチリヌルヲワカヨタレソツネナラムウヰノオクヤマケフコエテアサキユメミシヱヒモセス';

/**
 * イロハ順（ひらがな）
 */
const IROHA_HIRAGANA_SEQUENCE =
  'いろはにほへとちりぬるをわかよたれそつねならむうゐのおくやまけふこえてあさきゆめみしゑひもせす';

/**
 * 五十音順（カタカナ）
 */
const GOJUON_SEQUENCE =
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';

/**
 * 五十音順（ひらがな）
 */
const GOJUON_HIRAGANA_SEQUENCE =
  'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん';

/**
 * 漢数字
 */
const KANJI_NUMBERS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/**
 * 丸数字（①〜㊿）
 */
const CIRCLED_NUMBERS = [
  '①',
  '②',
  '③',
  '④',
  '⑤',
  '⑥',
  '⑦',
  '⑧',
  '⑨',
  '⑩',
  '⑪',
  '⑫',
  '⑬',
  '⑭',
  '⑮',
  '⑯',
  '⑰',
  '⑱',
  '⑲',
  '⑳',
  '㉑',
  '㉒',
  '㉓',
  '㉔',
  '㉕',
  '㉖',
  '㉗',
  '㉘',
  '㉙',
  '㉚',
  '㉛',
  '㉜',
  '㉝',
  '㉞',
  '㉟',
  '㊱',
  '㊲',
  '㊳',
  '㊴',
  '㊵',
  '㊶',
  '㊷',
  '㊸',
  '㊹',
  '㊺',
  '㊻',
  '㊼',
  '㊽',
  '㊾',
  '㊿',
];

/**
 * 返り点のUnicode対応表
 */
const KAERI_UNICODE: Record<string, string> = {
  レ: '\u3191',
  一: '\u3192',
  二: '\u3193',
  三: '\u3194',
  四: '\u3195',
  上: '\u3196',
  中: '\u3197',
  下: '\u3198',
  甲: '\u3199',
  乙: '\u319A',
  丙: '\u319B',
  丁: '\u319C',
  天: '\u319D',
  地: '\u319E',
  人: '\u319F',
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * HTMLエスケープ
 * @internal
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/** Get the token ID that a position-based mark is attached to (after) */
function getPositionAfterTokenId(position: Position): string | undefined {
  if ('after' in position && position.after) {
    return position.after;
  }
  return undefined;
}

/** Check if a position-based mark is at block start (empty position) */
function isBlockStartPosition(position: Position): boolean {
  return !('after' in position) || position.after === undefined;
}

/**
 * Get block-start position marks for a given blockId
 * @internal
 */
export function getBlockStartMarks(
  blockId: string,
  marks: Mark[]
): { refs: RefMark[]; kutotenMarks: KutotenMark[] } {
  const refs: RefMark[] = [];
  const kutotenMarks: KutotenMark[] = [];

  for (const mark of marks) {
    if (!isPositionBasedMark(mark)) continue;
    if (!isBlockStartPosition(mark.position)) continue;

    // Check if this mark belongs to this block via position.blockId
    if (mark.position.blockId !== blockId) continue;

    if (mark.type === 'ref') {
      refs.push(mark);
    } else if (mark.type === 'kutoten') {
      kutotenMarks.push(mark);
    }
  }

  return { refs, kutotenMarks };
}

/**
 * Token IDから Markを取得
 *
 * 範囲マーク（複数トークンにまたがるマーク）の特別処理:
 * - yomigana: anchor.fromで返す（熟語全体にルビをかけるため）
 * - okurigana, soegana: anchor.toで返す（熟語の後に付くため）
 *
 * Position-basedマーク（kutoten, ref）の処理:
 * - position.afterで返す（トークンの後に配置）
 * @internal
 */
export function getMarksForToken(
  tokenId: string,
  marks: Mark[],
  tokens: Token[]
): Map<Mark['type'], Mark[]> {
  const result = new Map<Mark['type'], Mark[]>();

  // anchor.fromで返すマーク（先頭に付く）
  const startMarks = new Set(['yomigana']);
  // anchor.toで返すマーク（末尾に付く）
  const endMarks = new Set(['okurigana', 'soegana']);

  for (const mark of marks) {
    // Position-based marks (kaeri, kutoten, ref)
    if (isPositionBasedMark(mark)) {
      const afterTokenId = getPositionAfterTokenId(mark.position);
      if (afterTokenId === tokenId) {
        const existing = result.get(mark.type) ?? [];
        existing.push(mark);
        result.set(mark.type, existing);
      }
      continue;
    }

    // Anchor-based marks
    if (startMarks.has(mark.type)) {
      // 先頭マーク: anchor.fromでのみ返す
      if (mark.anchor.from === tokenId) {
        const existing = result.get(mark.type) ?? [];
        existing.push(mark);
        result.set(mark.type, existing);
      }
    } else if (endMarks.has(mark.type)) {
      // 末尾マーク: anchor.toでのみ返す
      if (mark.anchor.to === tokenId) {
        const existing = result.get(mark.type) ?? [];
        existing.push(mark);
        result.set(mark.type, existing);
      }
    } else {
      // 他のマーク: from/toの完全一致に加え、範囲内の中間トークンもマッチ
      let matched = mark.anchor.from === tokenId || mark.anchor.to === tokenId;
      if (!matched && mark.anchor.from !== mark.anchor.to) {
        const fromIdx = tokens.findIndex((t) => t.id === mark.anchor.from);
        const toIdx = tokens.findIndex((t) => t.id === mark.anchor.to);
        const tokenIdx = tokens.findIndex((t) => t.id === tokenId);
        if (fromIdx !== -1 && toIdx !== -1 && tokenIdx !== -1) {
          matched = tokenIdx > fromIdx && tokenIdx < toIdx;
        }
      }
      if (matched) {
        const existing = result.get(mark.type) ?? [];
        existing.push(mark);
        result.set(mark.type, existing);
      }
    }
  }

  return result;
}

/**
 * TatetenMarkの範囲に含まれるTokenを特定
 * @internal
 */
export function getTatetenGroups(tokens: Token[], marks: Mark[]): Map<string, TatetenMark> {
  const tatetenMarks = marks.filter((m): m is TatetenMark => m.type === 'tateten');
  const tokenIdToGroup = new Map<string, TatetenMark>();

  for (const tateten of tatetenMarks) {
    const fromIndex = tokens.findIndex((t) => t.id === tateten.anchor.from);
    const toIndex = tokens.findIndex((t) => t.id === tateten.anchor.to);

    if (fromIndex !== -1 && toIndex !== -1) {
      for (let i = fromIndex; i <= toIndex; i++) {
        const token = tokens[i];
        if (token) {
          tokenIdToGroup.set(token.id, tateten);
        }
      }
    }
  }

  return tokenIdToGroup;
}

/**
 * 範囲を持つマーク（yomigana, okurigana, soegana）のグループ情報
 * @internal
 */
export interface RangeMarkGroup {
  mark: YomiganaMark | OkuriganaMark | SoeganaMark;
  tokenIds: string[];
}

/**
 * 範囲マークのグループを取得（anchor.from !== anchor.to のマーク）
 * @internal
 */
export function getRangeMarkGroups(
  tokens: Token[],
  marks: Mark[],
  type: 'yomigana' | 'okurigana' | 'soegana'
): Map<string, RangeMarkGroup> {
  // Filter to anchor-based marks of the specified type
  const targetMarks = marks.filter(
    (m): m is YomiganaMark | OkuriganaMark | SoeganaMark =>
      m.type === type && !isPositionBasedMark(m) && m.anchor.from !== m.anchor.to
  );
  const tokenIdToGroup = new Map<string, RangeMarkGroup>();

  for (const mark of targetMarks) {
    const fromIndex = tokens.findIndex((t) => t.id === mark.anchor.from);
    const toIndex = tokens.findIndex((t) => t.id === mark.anchor.to);

    if (fromIndex !== -1 && toIndex !== -1) {
      const tokenIds: string[] = [];
      for (let i = fromIndex; i <= toIndex; i++) {
        const token = tokens[i];
        if (token) {
          tokenIds.push(token.id);
        }
      }
      const group: RangeMarkGroup = {
        mark: mark as YomiganaMark | OkuriganaMark | SoeganaMark,
        tokenIds,
      };
      for (const tokenId of tokenIds) {
        tokenIdToGroup.set(tokenId, group);
      }
    }
  }

  return tokenIdToGroup;
}

/**
 * 返り点記号をUnicodeに変換
 * 複合返り点（例: 一レ）は1文字ずつ変換して連結する
 */
function convertKaeriToUnicode(value: string): string {
  // 単一文字の場合はそのままマッピング
  if (value.length === 1) {
    return KAERI_UNICODE[value] ?? value;
  }

  // 複合返り点: 各文字を個別に変換
  let result = '';
  for (const char of value) {
    result += KAERI_UNICODE[char] ?? char;
  }
  return result;
}

/**
 * 縦中横を適用すべきかを判定
 *
 * 以下の条件で縦中横を適用:
 * - 半角括弧で囲まれた1文字（例: "(A)", "(1)", "[1]"）
 * - または2文字以下の半角文字
 *
 * 全角括弧で囲まれた全角文字（例: "（イ）"）は縦中横不要
 * @internal
 */
export function shouldApplyTateChuYoko(text: string): boolean {
  // 半角丸括弧または角括弧で囲まれた1文字の場合
  if (/^[([][A-Za-z0-9][)\]]$/.test(text)) {
    return true;
  }
  // 2文字以下の半角文字の場合（印字可能ASCII: 0x20-0x7E）
  if (/^[\x20-\x7E]{1,2}$/.test(text)) {
    return true;
  }
  return false;
}

/**
 * インデックスをフォーマットに従って文字列化
 */
function formatRefIndex(index: number, format: RefFormat): string {
  switch (format) {
    case 'alpha-upper':
      return `(${String.fromCharCode(65 + index)})`; // A=65
    case 'alpha-lower':
      return `(${String.fromCharCode(97 + index)})`; // a=97
    case 'numeric-paren':
      return `(${index + 1})`;
    case 'numeric-bracket':
      return `[${index + 1}]`;
    case 'numeric-circled':
      return CIRCLED_NUMBERS[index] ?? `(${index + 1})`;
    case 'iroha-katakana':
      return `（${IROHA_SEQUENCE[index] ?? String(index + 1)}）`;
    case 'iroha-hiragana':
      return `（${IROHA_HIRAGANA_SEQUENCE[index] ?? String(index + 1)}）`;
    case 'gojuon-katakana':
      return `（${GOJUON_SEQUENCE[index] ?? String(index + 1)}）`;
    case 'gojuon-hiragana':
      return `（${GOJUON_HIRAGANA_SEQUENCE[index] ?? String(index + 1)}）`;
    case 'kanji-numeric':
      return `（${KANJI_NUMBERS[index] ?? String(index + 1)}）`;
    default:
      return `(${index + 1})`;
  }
}

/**
 * ドキュメント内のRefMarkを解決してマップを生成
 *
 * 同一性判定:
 * - 同じ label 値を持つ ref は同一
 * - 同じ format + 同じ ext.value を持つ ref は同一
 *
 * 番号付けは文書内での登場順（anchor.fromのtoken位置）に基づく
 * @internal
 */
export function resolveRefValues(tokens: Token[], marks: Mark[]): Map<RefMark, string> {
  const refMarks = marks.filter((m): m is RefMark => m.type === 'ref');

  // token位置のインデックスマップを作成
  const tokenIndexMap = new Map<string, number>();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token) {
      tokenIndexMap.set(token.id, i);
    }
  }

  // position.afterのtoken位置でソート（文書内の登場順）
  const sortedRefMarks = [...refMarks].sort((a, b) => {
    const aTokenId = getPositionAfterTokenId(a.position);
    const bTokenId = getPositionAfterTokenId(b.position);
    const aIndex = aTokenId ? (tokenIndexMap.get(aTokenId) ?? Infinity) : Infinity;
    const bIndex = bTokenId ? (tokenIndexMap.get(bTokenId) ?? Infinity) : Infinity;
    return aIndex - bIndex;
  });

  const result = new Map<RefMark, string>();

  // label指定ありのrefをlabel値でグループ化
  const labelToIndex = new Map<string, number>();

  // format指定ありのrefをフォーマット別にグループ化（登場順を維持）
  const formatGroups = new Map<string, RefMark[]>();

  let nextLabelIndex = 0;

  for (const ref of sortedRefMarks) {
    if (ref.label) {
      // labelあり: 同一labelは同一インデックス
      let index = labelToIndex.get(ref.label);
      if (index === undefined) {
        index = nextLabelIndex++;
        labelToIndex.set(ref.label, index);
      }
      result.set(ref, ref.label);
    } else if (ref.format) {
      const group = formatGroups.get(ref.format) ?? [];
      group.push(ref);
      formatGroups.set(ref.format, group);
    } else if (ref.content && !ref.label && !ref.format) {
      // contentのみの場合: 暗黙的にnumeric-bracketフォーマットで番号を割り当て
      const group = formatGroups.get('numeric-bracket') ?? [];
      group.push(ref);
      formatGroups.set('numeric-bracket', group);
    }
  }

  // 各フォーマットグループ内でインデックスを割り当て（既に登場順でソート済み）
  for (const [format, refs] of formatGroups) {
    const valueToIndex = new Map<string, number>();
    let nextIndex = 0;

    for (const ref of refs) {
      let index: number;

      // ext.value を同一性判定に使用
      const extValue = ref.ext?.['value'] as string | undefined;

      if (extValue !== undefined) {
        // valueありの場合：同一valueは同一インデックス
        const existingIndex = valueToIndex.get(extValue);
        if (existingIndex !== undefined) {
          index = existingIndex;
        } else {
          index = nextIndex++;
          valueToIndex.set(extValue, index);
        }
      } else {
        // valueなしの場合：単純にインクリメント
        index = nextIndex++;
      }

      result.set(ref, formatRefIndex(index, format as RefFormat));
    }
  }

  return result;
}

/**
 * Highlight Markの範囲に含まれるTokenを特定
 * @internal
 */
export function getHighlightGroups(tokens: Token[], marks: Mark[]): Map<string, HighlightMark> {
  const highlightMarks = marks.filter((m): m is HighlightMark => m.type === 'highlight');
  const tokenIdToGroup = new Map<string, HighlightMark>();

  for (const highlight of highlightMarks) {
    const fromIndex = tokens.findIndex((t) => t.id === highlight.anchor.from);
    const toIndex = tokens.findIndex((t) => t.id === highlight.anchor.to);

    if (fromIndex !== -1 && toIndex !== -1) {
      for (let i = fromIndex; i <= toIndex; i++) {
        const token = tokens[i];
        if (token) {
          tokenIdToGroup.set(token.id, highlight);
        }
      }
    }
  }

  return tokenIdToGroup;
}

// ============================================================================
// Token Rendering
// ============================================================================

/** @internal */
export interface TokenRenderContext {
  prefix: string;
  profile: RenderProfile;
  tokens: Token[];
  tokenMarks: Map<Mark['type'], Mark[]>;
  interactive: boolean;
}

/**
 * ルビ付きのToken HTMLを生成（読み仮名のみ、送り仮名・添え仮名は含まない）
 *
 * - 読み仮名(yomigana)はruby要素のrt内に配置（中央揃え）
 * - 送り仮名・添え仮名はrenderTokenで返り点と一緒にsuffix-lineコンテナにまとめる
 * - 熟語ルビ（範囲yomigana）の場合はbaseTextを使用
 */
function renderTokenWithRuby(
  token: Token,
  ctx: TokenRenderContext,
  baseText?: string,
  rangeInfo?: RangeTokenInfo,
  suppressYomigana?: boolean
): string {
  const { prefix, profile, tokenMarks, interactive } = ctx;

  // 読み仮名（ruby要素のrt内に配置、中央揃え）
  // suppressYomigana: tateten グループレベルで yomigana が処理される場合、個別トークンの ruby を抑制
  const yomiganaMarks = (tokenMarks.get('yomigana') ?? []) as YomiganaMark[];
  const yomigana =
    !suppressYomigana && profile.yomigana && yomiganaMarks.length > 0
      ? yomiganaMarks.map((m) => escapeHtml(m.value)).join('')
      : '';

  // data属性の構築（interactiveモードの場合のみ）
  // 熟語ルビ（範囲マーク）の場合はdata-token-from/toを使用、単一トークンの場合はdata-token-idを使用
  let dataAttrs = '';
  if (interactive) {
    dataAttrs = rangeInfo
      ? ` data-token-from="${escapeHtml(rangeInfo.from)}" data-token-to="${escapeHtml(rangeInfo.to)}"`
      : ` data-token-id="${escapeHtml(token.id)}"`;
  }

  // ルビ（読み仮名）が必要な場合はruby要素を使用
  // 熟語ルビの場合はbaseTextを使用
  const displayText = baseText ?? token.text;
  const baseContent = escapeHtml(displayText);
  if (yomigana) {
    return `<ruby><rb class="${prefix}-base"${dataAttrs}>${baseContent}</rb><rt class="${prefix}-ruby">${yomigana}</rt></ruby>`;
  } else {
    return `<span class="${prefix}-base"${dataAttrs}>${baseContent}</span>`;
  }
}

/**
 * 再読文字のToken HTMLを生成
 *
 * 入れ子ruby方式: 内側rubyで第1読み、外側rubyで第2読みを配置。
 * 送り仮名はkunと同様にsuffix領域に配置（ルビ内には含めない）。
 *
 * 構造:
 * <ruby class="outer">
 *   <ruby class="inner">將<rt>まさ</rt></ruby>
 *   <rt></rt>  <!-- 第2読みのyomiがあれば入る -->
 * </ruby>
 * + suffix（送り仮名）は呼び出し元で別途処理
 */
function renderSaidokuToken(
  token: Token,
  saidokuMark: SaidokuMark,
  ctx: TokenRenderContext
): string {
  const { prefix, profile, interactive } = ctx;

  // data-token-id属性（interactiveモードの場合のみ）
  const tokenIdAttr = interactive ? ` data-token-id="${escapeHtml(token.id)}"` : '';

  if (!profile.saidoku) {
    return `<span class="${prefix}-base"${tokenIdAttr}>${escapeHtml(token.text)}</span>`;
  }

  const forms = saidokuMark.forms;
  const firstForm = forms[0];
  const secondForm = forms[1];

  // 第1読み用のrt（読み仮名のみ、送り仮名は含めない）
  // 読み仮名の表示はprofile.yomiganaに従う
  let firstRt = '';
  if (firstForm) {
    const n = firstForm.n ?? 1;
    const yomi = profile.yomigana && firstForm.yomi ? escapeHtml(firstForm.yomi) : '';
    firstRt = `<rt class="${prefix}-ruby" data-saidoku-n="${n}">${yomi}</rt>`;
  }

  // 内側ruby（第1読み）- rb要素にdata-token-idを付与
  const innerRuby = `<ruby class="${prefix}-saidoku-inner"><rb class="${prefix}-base"${tokenIdAttr}>${escapeHtml(token.text)}</rb>${firstRt}</ruby>`;

  // 第2読みがなければ内側rubyのみ返す
  if (!secondForm) {
    return innerRuby;
  }

  // 第2読み用のrt（読み仮名のみ、送り仮名は含めない）
  // 読み仮名の表示はprofile.yomiganaに従う
  const n2 = secondForm.n ?? 2;
  const yomi2 = profile.yomigana && secondForm.yomi ? escapeHtml(secondForm.yomi) : '';
  const secondRt = `<rt class="${prefix}-ruby ${prefix}-saidoku-under" data-saidoku-n="${n2}">${yomi2}</rt>`;

  // 外側ruby（第2読み）で内側rubyを包む
  return `<ruby class="${prefix}-saidoku-outer">${innerRuby}${secondRt}</ruby>`;
}

/**
 * ヲコト点を生成
 */
function renderOkototen(okototenMark: OkototenMark, prefix: string): string {
  const { position, shape } = okototenMark;
  const gridSize = parseInt(position.grid.split('x')[0] ?? '5', 10);

  return `<span class="${prefix}-okototen" data-shape="${escapeHtml(shape)}" style="--okototen-x: ${position.x}; --okototen-y: ${position.y}; --okototen-grid: ${gridSize};"></span>`;
}

/**
 * 単一TokenのHTMLを生成
 *
 * @returns TokenRenderResult - html（token本体）とsuffixHtml（抽出されたsuffix-row）を分離して返す
 * @internal
 */
export function renderToken(
  token: Token,
  marks: Mark[],
  ctx: Omit<TokenRenderContext, 'tokenMarks'>,
  rangeCtx?: RangeMarkContext,
  refValueMap?: Map<RefMark, string>,
  highlightRefIds?: Set<string>,
  extractTatetenKaeri?: boolean,
  suppressYomigana?: boolean,
  extractSuffix?: boolean,
  suppressEmphasis?: boolean
): TokenRenderResult {
  const { prefix, profile } = ctx;
  const tokenMarks = getMarksForToken(token.id, marks, ctx.tokens);

  const fullCtx: TokenRenderContext = { ...ctx, tokenMarks };

  // 再読文字チェック
  const saidokuMarks = (tokenMarks.get('saidoku') ?? []) as SaidokuMark[];
  const saidokuMark = saidokuMarks[0];

  // 傍点チェック（trailing marks を合算）
  const emphasisMarks = (tokenMarks.get('emphasis') ?? []) as EmphasisMark[];
  const allEmphasisMarks = [...emphasisMarks, ...(rangeCtx?.trailingEmphasisMarks ?? [])];
  const hasEmphasis = profile.emphasis && allEmphasisMarks.length > 0;
  const resolvedEmphasisStyle = hasEmphasis
    ? (allEmphasisMarks[0]?.style ?? 'filled dot')
    : undefined;
  // suppressEmphasis: tateten+yomigana 時にグループレベルで emphasis を適用するため、個別トークンでは抑制
  const applyEmphasis = hasEmphasis && !suppressEmphasis;

  // ヲコト点チェック
  const okototenMarks = (tokenMarks.get('okototen') ?? []) as OkototenMark[];
  const hasOkototen = profile.okototen && okototenMarks.length > 0;

  // 送り仮名（再読文字の場合はformsから取得）
  // 再読文字の場合: 第1読みは右側（通常の送り仮名位置）、第2読みは左側（返り点位置）
  // 送り仮名の表示はprofile.okuriganaに従う（profile.saidokuとは独立）
  let saidokuOkuri1 = ''; // 第1読みの送り仮名（右側）
  let saidokuOkuri2 = ''; // 第2読みの送り仮名（左側、返り点と同じ位置）
  let okurigana = '';
  if (profile.okurigana) {
    if (saidokuMark) {
      // 再読文字の場合: formsから送り仮名を取得
      for (const form of saidokuMark.forms) {
        if (form.okuri) {
          const n = form.n ?? saidokuMark.forms.indexOf(form) + 1;
          const okuriHtml = `<span class="${prefix}-okuri" data-saidoku-n="${n}">${escapeHtml(form.okuri)}</span>`;
          if (n === 1) {
            saidokuOkuri1 = okuriHtml;
          } else {
            saidokuOkuri2 = okuriHtml;
          }
        }
      }
    } else {
      // 通常のToken: okuriganaMarksから取得、または範囲グループの値を使用
      const okuriganaMarks = (tokenMarks.get('okurigana') ?? []) as OkuriganaMark[];
      if (okuriganaMarks.length > 0) {
        okurigana = `<span class="${prefix}-okuri">${okuriganaMarks.map((m) => escapeHtml(m.value)).join('')}</span>`;
      } else if (rangeCtx?.okuriganaValue) {
        // 範囲okuriganaグループの値を使用
        okurigana = `<span class="${prefix}-okuri">${escapeHtml(rangeCtx.okuriganaValue)}</span>`;
      }
    }
  }

  // 添え仮名
  const soeganaMarks = (tokenMarks.get('soegana') ?? []) as SoeganaMark[];
  let soegana = '';
  if (profile.soegana) {
    if (soeganaMarks.length > 0) {
      soegana = `<span class="${prefix}-soegana">${soeganaMarks.map((m) => escapeHtml(m.value)).join('')}</span>`;
    } else if (rangeCtx?.soeganaValue) {
      // 範囲soeganaグループの値を使用
      soegana = `<span class="${prefix}-soegana">${escapeHtml(rangeCtx.soeganaValue)}</span>`;
    }
  }

  // 返り点（現在のトークン + 範囲グループ後続トークンの返り点）
  // extractTatetenKaeri=true の場合、非レ返り点を tatetenKaeriHtml に分離
  const kaeriMarks = (tokenMarks.get('kaeri') ?? []) as KaeriMark[];
  const allKaeriMarks = [...kaeriMarks, ...(rangeCtx?.trailingKaeriMarks ?? [])];

  // extractTatetenKaeri=true の場合、返り点を suffix（レ部分）と separator（非レ部分）に分離
  // 複合返り点（一レ等）は分割: レ→suffix、非レ→separator
  let kaeriten = '';
  let tatetenKaeriHtml = '';
  if (extractTatetenKaeri && profile.kaeriten) {
    const suffixParts: string[] = [];
    const separatorParts: string[] = [];
    for (const m of allKaeriMarks) {
      const hasRe = m.value.includes('レ');
      const nonRePart = m.value.replace(/レ/g, '');
      if (hasRe) {
        suffixParts.push(
          `<span class="${prefix}-kaeriten" aria-hidden="true">${convertKaeriToUnicode('レ')}</span>`
        );
      }
      if (nonRePart) {
        separatorParts.push(
          `<span class="${prefix}-kaeriten" aria-hidden="true">${convertKaeriToUnicode(nonRePart)}</span>`
        );
      }
    }
    kaeriten = suffixParts.join('');
    tatetenKaeriHtml = separatorParts.join('');
  } else if (profile.kaeriten && allKaeriMarks.length > 0) {
    kaeriten = allKaeriMarks
      .map(
        (m) =>
          `<span class="${prefix}-kaeriten" aria-hidden="true">${convertKaeriToUnicode(m.value)}</span>`
      )
      .join('');
  }

  // 句読点（現在のトークン + 範囲グループ後続トークンの句読点）
  const kutotenMarks = (tokenMarks.get('kutoten') ?? []) as KutotenMark[];
  const allKutotenMarks = [...kutotenMarks, ...(rangeCtx?.trailingKutotenMarks ?? [])];
  const kutoten =
    profile.kutoten && allKutotenMarks.length > 0
      ? allKutotenMarks
          .map((m) => `<span class="${prefix}-suffix-kutoten">${escapeHtml(m.value)}</span>`)
          .join('')
      : '';

  // suffix-row: 4行グリッドで送り仮名・句読点・返り点・再読2回目送り仮名を配置
  // row1(右): 送り仮名・添え仮名、再読1回目送り仮名
  // row2(右寄り): 句読点（行内サイズ、auto で不在時は潰れる）
  // row3(中央): 返り点
  // row4(左): 再読2回目送り仮名
  const suffixRight = (saidokuOkuri1 || okurigana) + soegana; // row1
  const suffixCenter = kaeriten; // row3
  const suffixLeft = saidokuOkuri2; // row4

  const hasSuffix = suffixRight || kutoten || suffixCenter || suffixLeft;
  let suffixRowHtml = '';
  let extractedSuffixHtml = '';
  if (hasSuffix) {
    // extractSuffix + interactive: suffix-row を ruby 外に抽出する際、クリックで token を特定できるよう data-suffix-for を付与
    const suffixForAttr =
      extractSuffix && ctx.interactive ? ` data-suffix-for="${escapeHtml(token.id)}"` : '';
    suffixRowHtml = `<span class="${prefix}-suffix-row"${suffixForAttr}>${
      suffixRight ? `<span class="${prefix}-suffix-okuri">${suffixRight}</span>` : ''
    }${kutoten}${
      suffixCenter ? `<span class="${prefix}-suffix-kaeri">${suffixCenter}</span>` : ''
    }${suffixLeft ? `<span class="${prefix}-suffix-saidoku">${suffixLeft}</span>` : ''}</span>`;
    if (extractSuffix) {
      extractedSuffixHtml = suffixRowHtml;
      suffixRowHtml = '';
    }
  }

  // 置字チェック（trailing marks を合算）
  const okimojiMarks = (tokenMarks.get('okimoji') ?? []) as OkimojiMark[];
  const isOkimoji =
    profile.okimoji &&
    (okimojiMarks.length > 0 || (rangeCtx?.trailingOkimojiMarks ?? []).length > 0);

  // 助字チェック（trailing marks を合算）
  const jojiMarks = (tokenMarks.get('joji') ?? []) as JojiMark[];
  const isJoji =
    profile.joji && (jojiMarks.length > 0 || (rangeCtx?.trailingJojiMarks ?? []).length > 0);

  // Token本体のHTML
  let baseHtml: string;

  // 範囲グループのベーステキストを決定（優先順位: yomigana > okurigana > soegana）
  const rangeBaseText =
    rangeCtx?.yomiganaBaseText ?? rangeCtx?.okuriganaBaseText ?? rangeCtx?.soeganaBaseText;

  if (saidokuMark) {
    baseHtml = renderSaidokuToken(token, saidokuMark, fullCtx);
  } else {
    // 範囲グループがある場合は熟語全体のテキストを使用し、範囲情報も渡す
    baseHtml = renderTokenWithRuby(
      token,
      fullCtx,
      rangeBaseText,
      rangeCtx?.rangeTokenInfo,
      suppressYomigana
    );
  }

  // ヲコト点追加
  let okototenHtml = '';
  if (hasOkototen) {
    okototenHtml = okototenMarks.map((m) => renderOkototen(m, prefix)).join('');
  }

  // クラス名構築
  const classes = [`${prefix}-token`];
  if (saidokuMark && profile.saidoku) {
    classes.push(`${prefix}-saidoku`);
  }
  if (hasOkototen) {
    classes.push(`${prefix}-has-okototen`);
  }
  if (applyEmphasis) {
    classes.push(`${prefix}-emphasis`);
  }
  if (isOkimoji) {
    classes.push(`${prefix}-okimoji`);
  }
  if (isJoji) {
    classes.push(`${prefix}-joji`);
  }

  // ref 参照（本文中のマーカー）
  // regionから参照されているrefはregion終端で出力するのでここではスキップ
  // 範囲グループ後続トークンのrefも含める
  let refHtml = '';
  if (profile.ref && refValueMap) {
    const refMarks = (tokenMarks.get('ref') ?? []) as RefMark[];
    const allRefMarks = [...refMarks, ...(rangeCtx?.trailingRefMarks ?? [])];
    if (allRefMarks.length > 0) {
      refHtml = allRefMarks
        .filter((m) => !highlightRefIds || !m.id || !highlightRefIds.has(m.id))
        .map((m) => {
          const refText = refValueMap.get(m) ?? '';
          if (refText) {
            const halfWidthClass = shouldApplyTateChuYoko(refText)
              ? ` ${prefix}-ref--half-width`
              : '';
            return `<sup class="${prefix}-ref${halfWidthClass}">${escapeHtml(refText)}</sup>`;
          } else if (m.content) {
            // contentのみの場合: 注釈アイコンを表示
            return `<sup class="${prefix}-ref ${prefix}-ref--content-only">*</sup>`;
          }
          return '';
        })
        .join('');
    }
  }

  // data-token-id属性（interactiveモードの場合のみ）
  const tokenIdAttr = ctx.interactive ? ` data-token-id="${escapeHtml(token.id)}"` : '';

  // 傍点スタイル（インラインスタイル、デフォルト: filled dot）
  let emphasisInlineStyle = '';
  if (applyEmphasis && resolvedEmphasisStyle) {
    emphasisInlineStyle = ` style="text-emphasis-style: ${escapeHtml(resolvedEmphasisStyle)};"`;
  }

  const result: TokenRenderResult = {
    html: `${refHtml}<span class="${classes.join(' ')}"${tokenIdAttr}${emphasisInlineStyle}>${baseHtml}${okototenHtml}${suffixRowHtml}</span>`,
    tatetenKaeriHtml,
    suffixHtml: extractedSuffixHtml,
  };
  if (resolvedEmphasisStyle) {
    result.emphasisStyle = resolvedEmphasisStyle;
  }
  return result;
}

// ============================================================================
// Document Rendering
// ============================================================================

/**
 * 読み層のHTMLを生成
 */
function renderReadingLayer(readings: Reading[], prefix: string, inline: boolean): string {
  const yomiage = readings.find((r) => r.kind === 'yomiage');
  const kakikudashi = readings.find((r) => r.kind === 'kakikudashi');

  const text = yomiage?.text ?? kakikudashi?.text ?? '';

  if (!text) {
    return '';
  }

  const tag = inline ? 'span' : 'div';
  return `<${tag} class="${prefix}-reading" aria-label="読み上げテキスト">${escapeHtml(text)}</${tag}>`;
}

/**
 * 注釈のHTMLを生成（contentを持つrefマークから生成）
 */
function renderRefNotes(
  marks: Mark[],
  prefix: string,
  profile: RenderProfile,
  refValueMap: Map<RefMark, string>
): string {
  if (!profile.ref) {
    return '';
  }

  const refMarks = marks.filter((m): m is RefMark => m.type === 'ref' && m.content !== undefined);

  if (refMarks.length === 0) {
    return '';
  }

  const noteItems = refMarks
    .map((ref) => {
      const marker = refValueMap.get(ref) ?? '*';
      const halfWidthClass = shouldApplyTateChuYoko(marker)
        ? ` ${prefix}-note-marker--half-width`
        : '';
      return `<div class="${prefix}-note-item"><span class="${prefix}-note-marker${halfWidthClass}">${escapeHtml(marker)}</span>${escapeHtml(ref.content!)}</div>`;
    })
    .join('');

  return `<aside class="${prefix}-notes">${noteItems}</aside>`;
}

/**
 * doc.blocks を使って Token をブロックごとにグループ化
 *
 * blocks が存在する場合は各 block の tokenIds から tokens を解決する。
 * blocks が空の場合は全 tokens を blockId=null の単一グループとして返す。
 * @internal
 */
export function groupTokensByBlock(
  blocks: Block[],
  tokens: Token[]
): { blockId: string; tokens: Token[] }[] {
  if (blocks.length === 0) {
    // blocks が空の場合は全 tokens を単一グループとして返す
    return tokens.length > 0 ? [{ blockId: '', tokens }] : [];
  }

  const tokenMap = new Map<string, Token>();
  for (const token of tokens) {
    tokenMap.set(token.id, token);
  }

  const groups: { blockId: string; tokens: Token[] }[] = [];

  for (const block of blocks) {
    const blockTokens: Token[] = [];
    for (const tokenId of block.tokenIds) {
      const token = tokenMap.get(tokenId);
      if (token) {
        blockTokens.push(token);
      }
    }
    if (blockTokens.length > 0) {
      groups.push({ blockId: block.id, tokens: blockTokens });
    }
  }

  return groups;
}

/**
 * Display層のHTMLを生成
 *
 * 2-pass アーキテクチャ:
 * Pass 1 (buildBlockRenderTree): tokens + marks → BlockRenderTree
 * Pass 2 (renderBlockTree): BlockRenderTree → HTML string
 */
function renderDisplayLayer(
  doc: SKAMDocument,
  prefix: string,
  profile: RenderProfile,
  inline: boolean,
  interactive: boolean
): { tokens: string; prefix: string } {
  const { tokens, marks } = doc;

  // Pre-computation
  const refValueMap = profile.ref ? resolveRefValues(tokens, marks) : new Map();
  const tatetenGroups = getTatetenGroups(tokens, marks);
  const highlightGroups = profile.highlight ? getHighlightGroups(tokens, marks) : new Map();

  const highlightRefIds = new Set<string>();
  if (profile.highlight) {
    const highlightMarks = marks.filter((m): m is HighlightMark => m.type === 'highlight');
    for (const highlight of highlightMarks) {
      if (highlight.ref) {
        highlightRefIds.add(highlight.ref);
      }
    }
  }

  const yomiganaRangeGroups = profile.yomigana
    ? getRangeMarkGroups(tokens, marks, 'yomigana')
    : new Map();
  const okuriganaRangeGroups = profile.okurigana
    ? getRangeMarkGroups(tokens, marks, 'okurigana')
    : new Map();
  const soeganaRangeGroups = profile.soegana
    ? getRangeMarkGroups(tokens, marks, 'soegana')
    : new Map();

  const buildCtx: BuildTreeContext = {
    prefix,
    profile,
    tokens,
    marks,
    refValueMap,
    highlightRefIds,
    tatetenGroups,
    highlightGroups,
    yomiganaRangeGroups,
    okuriganaRangeGroups,
    soeganaRangeGroups,
  };
  const renderCtx: RenderTreeContext = {
    prefix,
    profile,
    tokens,
    marks,
    interactive,
    refValueMap,
    highlightRefIds,
  };

  const blockGroups = groupTokensByBlock(doc.blocks ?? [], tokens);
  const blockTag = inline ? 'span' : 'div';
  const renderedBlocks: string[] = [];

  for (const blockGroup of blockGroups) {
    const tree = buildBlockRenderTree(blockGroup.blockId, blockGroup.tokens, buildCtx);
    const blockContent = renderBlockTree(tree, renderCtx);

    if (blockGroup.blockId) {
      renderedBlocks.push(
        `<${blockTag} class="${prefix}-block" data-block-id="${escapeHtml(blockGroup.blockId)}">${blockContent}</${blockTag}>`
      );
    } else {
      renderedBlocks.push(blockContent);
    }
  }

  return { tokens: renderedBlocks.join(''), prefix };
}

// ============================================================================
// Main API
// ============================================================================

/**
 * SKAMドキュメントをHTMLにレンダリング
 */
export function render(doc: SKAMDocument, options: RenderOptions = {}): RenderResult {
  const profile: RenderProfile = { ...FULL_PROFILE, ...options.profile };
  const writingMode = options.writingMode ?? 'vertical';
  const prefix = options.classPrefix ?? 'skam';
  const includeReadingLayer = options.includeReadingLayer ?? true;
  const inline = options.inline ?? false;
  const copyable = options.copyable;
  const interactive = options.interactive ?? false;

  // Display層
  const displayResult = renderDisplayLayer(doc, prefix, profile, inline, interactive);
  const displayTag = inline ? 'span' : 'div';
  const displayHtml = `<${displayTag} class="${prefix}-display" aria-hidden="true">${displayResult.tokens}</${displayTag}>`;

  // 読み層
  const readingHtml = includeReadingLayer ? renderReadingLayer(doc.readings, prefix, inline) : '';

  // refマークの値を事前計算（注釈出力用）
  const refValueMap = profile.ref ? resolveRefValues(doc.tokens, doc.marks) : new Map();

  // 注釈（インラインモードでは出力しない）
  const notesHtml = inline ? '' : renderRefNotes(doc.marks, prefix, profile, refValueMap);

  // data-copyable 属性
  const copyableAttr = copyable
    ? ` data-copyable="${copyable === 'all' ? 'all' : copyable.join(' ')}"`
    : '';

  // Document全体
  const containerTag = inline ? 'span' : 'div';
  const inlineClass = inline ? ` ${prefix}-document--inline` : '';
  const html = `<${containerTag} class="${prefix}-document${inlineClass}" lang="ja" data-writing-mode="${writingMode}"${copyableAttr}>${displayHtml}${readingHtml}${notesHtml}</${containerTag}>`;

  // CSS
  const styleOptions: import('./styles.js').StyleOptions = {
    classPrefix: prefix,
    writingMode,
    inline,
  };
  if (options.useLayer !== undefined) {
    styleOptions.useLayer = options.useLayer;
  }
  if (options.layerName !== undefined) {
    styleOptions.layerName = options.layerName;
  }
  if (options.variablePrefix !== undefined) {
    styleOptions.variablePrefix = options.variablePrefix;
  }
  const css = getDefaultStyles(styleOptions);

  return { html, css };
}

/**
 * SKAMドキュメントをHTMLのみにレンダリング（CSSなし）
 *
 * 複数文書をレンダリングする場合、CSSは generateCSS() で1回だけ生成し、
 * 各文書は renderHTML() でHTMLのみを生成することで効率化できる。
 *
 * @example
 * ```typescript
 * // 静的CSS（縦横両対応）を事前生成
 * const css = generateCSS({ writingMode: 'both' });
 *
 * // 各文書はHTMLのみ生成
 * const html1 = renderHTML(doc1, { writingMode: 'vertical' });
 * const html2 = renderHTML(doc2, { writingMode: 'horizontal' });
 * ```
 */
export function renderHTML(doc: SKAMDocument, options: RenderHTMLOptions = {}): string {
  const profile: RenderProfile = { ...FULL_PROFILE, ...options.profile };
  const writingMode = options.writingMode ?? 'vertical';
  const prefix = options.classPrefix ?? 'skam';
  const includeReadingLayer = options.includeReadingLayer ?? true;
  const inline = options.inline ?? false;
  const copyable = options.copyable;
  const interactive = options.interactive ?? false;

  // Display層
  const displayResult = renderDisplayLayer(doc, prefix, profile, inline, interactive);
  const displayTag = inline ? 'span' : 'div';
  const displayHtml = `<${displayTag} class="${prefix}-display" aria-hidden="true">${displayResult.tokens}</${displayTag}>`;

  // 読み層
  const readingHtml = includeReadingLayer ? renderReadingLayer(doc.readings, prefix, inline) : '';

  // refマークの値を事前計算（注釈出力用）
  const refValueMap = profile.ref ? resolveRefValues(doc.tokens, doc.marks) : new Map();

  // 注釈（インラインモードでは出力しない）
  const notesHtml = inline ? '' : renderRefNotes(doc.marks, prefix, profile, refValueMap);

  // data-copyable 属性
  const copyableAttr = copyable
    ? ` data-copyable="${copyable === 'all' ? 'all' : copyable.join(' ')}"`
    : '';

  // Document全体
  const containerTag = inline ? 'span' : 'div';
  const inlineClass = inline ? ` ${prefix}-document--inline` : '';
  const html = `<${containerTag} class="${prefix}-document${inlineClass}" lang="ja" data-writing-mode="${writingMode}"${copyableAttr}>${displayHtml}${readingHtml}${notesHtml}</${containerTag}>`;

  return html;
}

/**
 * CSSのみを生成
 *
 * 複数文書をレンダリングする場合や、CSSを静的ファイルとして出力する場合に使用。
 * writingMode: 'both' を指定すると、縦書き・横書き両対応のCSSを生成する。
 *
 * @example
 * ```typescript
 * // 縦横両対応CSS
 * const cssAll = generateCSS({ writingMode: 'both' });
 *
 * // 縦書きのみ
 * const cssVertical = generateCSS({ writingMode: 'vertical' });
 *
 * // ファイル出力
 * fs.writeFileSync('skam.css', generateCSS({ writingMode: 'both' }));
 * ```
 */
export function generateCSS(options: CSSOptions = {}): string {
  const styleOptions: import('./styles.js').StyleOptions = {};
  if (options.classPrefix !== undefined) {
    styleOptions.classPrefix = options.classPrefix;
  }
  if (options.writingMode !== undefined) {
    styleOptions.writingMode = options.writingMode;
  }
  if (options.inline !== undefined) {
    styleOptions.inline = options.inline;
  }
  if (options.useLayer !== undefined) {
    styleOptions.useLayer = options.useLayer;
  }
  if (options.layerName !== undefined) {
    styleOptions.layerName = options.layerName;
  }
  if (options.variablePrefix !== undefined) {
    styleOptions.variablePrefix = options.variablePrefix;
  }
  return getDefaultStyles(styleOptions);
}
