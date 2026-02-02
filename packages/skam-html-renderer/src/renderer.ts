/**
 * SKAM HTML Renderer
 *
 * SKAMドキュメントから静的HTMLを生成する
 */

import type {
  SKAMDocument,
  Token,
  Mark,
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
  RegionMark,
  RefMark,
  RefFormat,
  Reading,
} from '@kanbun/skam';
import { getDefaultStyles } from './styles.js';

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
  region: boolean;
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
  region: true,
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
  region: true,
  ref: true,
};

/** 学習用ヒント付きプロファイル（返り点+送り仮名） */
const LEARNING_HINT_PROFILE: RenderProfile = {
  yomigana: false,
  okurigana: true,
  kaeriten: true,
  kutoten: true,
  saidoku: false,
  okototen: false,
  tateten: false,
  emphasis: false,
  okimoji: true,
  joji: true,
  soegana: true,
  region: true,
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
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Token IDから Markを取得
 *
 * 範囲マーク（複数トークンにまたがるマーク）の特別処理:
 * - yomigana: anchor.fromで返す（熟語全体にルビをかけるため）
 * - okurigana, soegana: anchor.toで返す（熟語の後に付くため）
 */
function getMarksForToken(tokenId: string, marks: Mark[]): Map<Mark['type'], Mark[]> {
  const result = new Map<Mark['type'], Mark[]>();

  // anchor.fromで返すマーク（先頭に付く）
  const startMarks = new Set(['yomigana']);
  // anchor.toで返すマーク（末尾に付く）
  const endMarks = new Set(['okurigana', 'soegana']);

  for (const mark of marks) {
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
      // 他のマークは従来通り
      if (mark.anchor.from === tokenId || mark.anchor.to === tokenId) {
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
 */
function getTatetenGroups(tokens: Token[], marks: Mark[]): Map<string, TatetenMark> {
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
 */
interface RangeMarkGroup {
  mark: YomiganaMark | OkuriganaMark | SoeganaMark;
  tokenIds: string[];
}

/**
 * 範囲マークのグループを取得（anchor.from !== anchor.to のマーク）
 */
function getRangeMarkGroups(
  tokens: Token[],
  marks: Mark[],
  type: 'yomigana' | 'okurigana' | 'soegana'
): Map<string, RangeMarkGroup> {
  const targetMarks = marks.filter((m) => m.type === type && m.anchor.from !== m.anchor.to);
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
 */
function convertKaeriToUnicode(value: string): string {
  return KAERI_UNICODE[value] ?? value;
}

/**
 * 縦中横を適用すべきかを判定
 *
 * 以下の条件で縦中横を適用:
 * - 括弧で囲まれた1文字（例: "(A)", "(1)", "[1]"）
 * - または2文字以下の半角文字
 */
function shouldApplyTateChuYoko(text: string): boolean {
  // 丸括弧または角括弧で囲まれた1文字の場合
  if (/^[(\[][A-Za-z0-9][)\]]$/.test(text)) {
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
      return `(${IROHA_SEQUENCE[index] ?? String(index + 1)})`;
    case 'iroha-hiragana':
      return `(${IROHA_HIRAGANA_SEQUENCE[index] ?? String(index + 1)})`;
    case 'gojuon-katakana':
      return `(${GOJUON_SEQUENCE[index] ?? String(index + 1)})`;
    case 'gojuon-hiragana':
      return `(${GOJUON_HIRAGANA_SEQUENCE[index] ?? String(index + 1)})`;
    case 'kanji-numeric':
      return `(${KANJI_NUMBERS[index] ?? String(index + 1)})`;
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
 */
function resolveRefValues(marks: Mark[]): Map<RefMark, string> {
  const refMarks = marks.filter((m): m is RefMark => m.type === 'ref');
  const result = new Map<RefMark, string>();

  // label指定ありのrefをlabel値でグループ化
  const labelToIndex = new Map<string, number>();

  // format指定ありのrefをフォーマット別にグループ化
  const formatGroups = new Map<string, RefMark[]>();

  let nextLabelIndex = 0;

  for (const ref of refMarks) {
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

  // 各フォーマットグループ内でインデックスを割り当て
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
 * Region Markの範囲に含まれるTokenを特定
 */
function getRegionGroups(tokens: Token[], marks: Mark[]): Map<string, RegionMark> {
  const regionMarks = marks.filter((m): m is RegionMark => m.type === 'region');
  const tokenIdToGroup = new Map<string, RegionMark>();

  for (const region of regionMarks) {
    const fromIndex = tokens.findIndex((t) => t.id === region.anchor.from);
    const toIndex = tokens.findIndex((t) => t.id === region.anchor.to);

    if (fromIndex !== -1 && toIndex !== -1) {
      for (let i = fromIndex; i <= toIndex; i++) {
        const token = tokens[i];
        if (token) {
          tokenIdToGroup.set(token.id, region);
        }
      }
    }
  }

  return tokenIdToGroup;
}

// ============================================================================
// Token Rendering
// ============================================================================

interface TokenRenderContext {
  prefix: string;
  profile: RenderProfile;
  tokenMarks: Map<Mark['type'], Mark[]>;
}

/**
 * ルビ付きのToken HTMLを生成（読み仮名のみ、送り仮名・添え仮名は含まない）
 *
 * - 読み仮名(yomigana)はruby要素のrt内に配置（中央揃え）
 * - 送り仮名・添え仮名はrenderTokenで返り点と一緒にsuffix-lineコンテナにまとめる
 * - 熟語ルビ（範囲yomigana）の場合はbaseTextを使用
 */
function renderTokenWithRuby(token: Token, ctx: TokenRenderContext, baseText?: string): string {
  const { prefix, profile, tokenMarks } = ctx;

  // 読み仮名（ruby要素のrt内に配置、中央揃え）
  const yomiganaMarks = (tokenMarks.get('yomigana') ?? []) as YomiganaMark[];
  const yomigana =
    profile.yomigana && yomiganaMarks.length > 0
      ? yomiganaMarks.map((m) => escapeHtml(m.value)).join('')
      : '';

  // ルビ（読み仮名）が必要な場合はruby要素を使用
  // 熟語ルビの場合はbaseTextを使用
  const displayText = baseText ?? token.text;
  if (yomigana) {
    return `<ruby><rb class="${prefix}-base">${escapeHtml(displayText)}</rb><rt class="${prefix}-ruby">${yomigana}</rt></ruby>`;
  } else {
    return `<span class="${prefix}-base">${escapeHtml(displayText)}</span>`;
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
  const { prefix, profile } = ctx;

  if (!profile.saidoku) {
    return `<span class="${prefix}-base">${escapeHtml(token.text)}</span>`;
  }

  const forms = saidokuMark.forms;
  const firstForm = forms[0];
  const secondForm = forms[1];

  // 第1読み用のrt（読み仮名のみ、送り仮名は含めない）
  let firstRt = '';
  if (firstForm) {
    const n = firstForm.n ?? 1;
    const yomi = firstForm.yomi ? escapeHtml(firstForm.yomi) : '';
    firstRt = `<rt class="${prefix}-ruby" data-saidoku-n="${n}">${yomi}</rt>`;
  }

  // 内側ruby（第1読み）
  const innerRuby = `<ruby class="${prefix}-saidoku-inner"><rb class="${prefix}-base">${escapeHtml(token.text)}</rb>${firstRt}</ruby>`;

  // 第2読みがなければ内側rubyのみ返す
  if (!secondForm) {
    return innerRuby;
  }

  // 第2読み用のrt（読み仮名のみ、送り仮名は含めない）
  const n2 = secondForm.n ?? 2;
  const yomi2 = secondForm.yomi ? escapeHtml(secondForm.yomi) : '';
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
 * 範囲マークのコンテキスト（熟語ルビ等のベーステキスト・値）
 */
interface RangeMarkContext {
  /** 範囲yomiganaのベーステキスト（全トークンのテキストを結合） */
  yomiganaBaseText?: string;
  /** 範囲okuriganaのベーステキスト */
  okuriganaBaseText?: string;
  /** 範囲okuriganaの値 */
  okuriganaValue?: string;
  /** 範囲soeganaのベーステキスト */
  soeganaBaseText?: string;
  /** 範囲soeganaの値 */
  soeganaValue?: string;
  /** 範囲グループ内の後続トークンに付いている返り点 */
  trailingKaeriMarks?: KaeriMark[];
  /** 範囲グループ内の後続トークンに付いている句読点 */
  trailingKutotenMarks?: KutotenMark[];
  /** 範囲グループ内の後続トークンに付いているrefマーク */
  trailingRefMarks?: RefMark[];
}

/**
 * 単一TokenのHTMLを生成
 */
function renderToken(
  token: Token,
  marks: Mark[],
  ctx: Omit<TokenRenderContext, 'tokenMarks'>,
  rangeCtx?: RangeMarkContext,
  refValueMap?: Map<RefMark, string>,
  regionRefIds?: Set<string>
): string {
  const { prefix, profile } = ctx;
  const tokenMarks = getMarksForToken(token.id, marks);

  const fullCtx: TokenRenderContext = { ...ctx, tokenMarks };

  // 再読文字チェック
  const saidokuMarks = (tokenMarks.get('saidoku') ?? []) as SaidokuMark[];
  const saidokuMark = saidokuMarks[0];

  // 傍点チェック
  const emphasisMarks = (tokenMarks.get('emphasis') ?? []) as EmphasisMark[];
  const hasEmphasis = profile.emphasis && emphasisMarks.length > 0;

  // ヲコト点チェック
  const okototenMarks = (tokenMarks.get('okototen') ?? []) as OkototenMark[];
  const hasOkototen = profile.okototen && okototenMarks.length > 0;

  // 送り仮名（再読文字の場合はformsから取得）
  // 再読文字の場合: 第1読みは右側（通常の送り仮名位置）、第2読みは左側（返り点位置）
  let saidokuOkuri1 = ''; // 第1読みの送り仮名（右側）
  let saidokuOkuri2 = ''; // 第2読みの送り仮名（左側、返り点と同じ位置）
  let okurigana = '';
  if (profile.okurigana) {
    if (saidokuMark && profile.saidoku) {
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
  const kaeriMarks = (tokenMarks.get('kaeri') ?? []) as KaeriMark[];
  const allKaeriMarks = [...kaeriMarks, ...(rangeCtx?.trailingKaeriMarks ?? [])];
  const kaeriten =
    profile.kaeriten && allKaeriMarks.length > 0
      ? allKaeriMarks
          .map(
            (m) =>
              `<span class="${prefix}-kaeriten" aria-hidden="true">${convertKaeriToUnicode(m.value)}</span>`
          )
          .join('')
      : '';

  // suffix-row: 3列グリッドで送り仮名・返り点・再読2回目送り仮名を配置
  // col1(右): 送り仮名・添え仮名、再読1回目送り仮名
  // col2(中央): 返り点
  // col3(左): 再読2回目送り仮名
  const suffixRight = saidokuOkuri1 || okurigana + soegana; // 右列
  const suffixCenter = kaeriten; // 中央列
  const suffixLeft = saidokuOkuri2; // 左列

  const hasSuffix = suffixRight || suffixCenter || suffixLeft;
  const suffixRowHtml = hasSuffix
    ? `<span class="${prefix}-suffix-row">${
        suffixRight ? `<span class="${prefix}-suffix-right">${suffixRight}</span>` : ''
      }${suffixCenter ? `<span class="${prefix}-suffix-center">${suffixCenter}</span>` : ''}${
        suffixLeft ? `<span class="${prefix}-suffix-left">${suffixLeft}</span>` : ''
      }</span>`
    : '';

  // 句読点（現在のトークン + 範囲グループ後続トークンの句読点）
  const kutotenMarks = (tokenMarks.get('kutoten') ?? []) as KutotenMark[];
  const allKutotenMarks = [...kutotenMarks, ...(rangeCtx?.trailingKutotenMarks ?? [])];
  const kutoten =
    profile.kutoten && allKutotenMarks.length > 0
      ? allKutotenMarks
          .map((m) => `<span class="${prefix}-kutoten">${escapeHtml(m.value)}</span>`)
          .join('')
      : '';

  // 置字チェック
  const okimojiMarks = (tokenMarks.get('okimoji') ?? []) as OkimojiMark[];
  const isOkimoji = profile.okimoji && okimojiMarks.length > 0;

  // 助字チェック
  const jojiMarks = (tokenMarks.get('joji') ?? []) as JojiMark[];
  const isJoji = profile.joji && jojiMarks.length > 0;

  // Token本体のHTML
  let baseHtml: string;

  // 範囲グループのベーステキストを決定（優先順位: yomigana > okurigana > soegana）
  const rangeBaseText =
    rangeCtx?.yomiganaBaseText ?? rangeCtx?.okuriganaBaseText ?? rangeCtx?.soeganaBaseText;

  if (saidokuMark) {
    baseHtml = renderSaidokuToken(token, saidokuMark, fullCtx);
  } else {
    // 範囲グループがある場合は熟語全体のテキストを使用
    baseHtml = renderTokenWithRuby(token, fullCtx, rangeBaseText);
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
  if (hasEmphasis) {
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
        .filter((m) => !regionRefIds || !m.id || !regionRefIds.has(m.id))
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

  return `<span class="${classes.join(' ')}" data-token-id="${escapeHtml(token.id)}">${baseHtml}${okototenHtml}${suffixRowHtml}</span>${kutoten}${refHtml}`;
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
 * Tokenからブロック境界を検出してグループ化
 */
function groupTokensByBlock(tokens: Token[]): { blockId: string | null; tokens: Token[] }[] {
  const groups: { blockId: string | null; tokens: Token[] }[] = [];
  let currentBlockId: string | null = null;
  let currentGroup: Token[] = [];

  for (const token of tokens) {
    const blockId = (token.ext?.['blockId'] as string | undefined) ?? null;

    if (blockId !== currentBlockId) {
      if (currentGroup.length > 0) {
        groups.push({ blockId: currentBlockId, tokens: currentGroup });
      }
      currentBlockId = blockId;
      currentGroup = [token];
    } else {
      currentGroup.push(token);
    }
  }

  if (currentGroup.length > 0) {
    groups.push({ blockId: currentBlockId, tokens: currentGroup });
  }

  return groups;
}

/**
 * Display層のHTMLを生成
 */
function renderDisplayLayer(
  doc: SKAMDocument,
  prefix: string,
  profile: RenderProfile,
  inline: boolean
): { tokens: string; prefix: string } {
  const { tokens, marks } = doc;
  const ctx = { prefix, profile };

  // refマークの値を事前計算
  const refValueMap = profile.ref ? resolveRefValues(marks) : new Map();

  // たて点グループを特定
  const tatetenGroups = getTatetenGroups(tokens, marks);

  // 領域グループを特定
  const regionGroups = profile.region ? getRegionGroups(tokens, marks) : new Map();

  // regionから参照されているrefのIDを収集（renderToken内でスキップ用）
  const regionRefIds = new Set<string>();
  if (profile.region) {
    const regionMarks = marks.filter((m): m is RegionMark => m.type === 'region');
    for (const region of regionMarks) {
      if (region.ref) {
        regionRefIds.add(region.ref);
      }
    }
  }

  // 範囲yomiganaグループを特定（熟語ルビ対応）
  const yomiganaRangeGroups = profile.yomigana
    ? getRangeMarkGroups(tokens, marks, 'yomigana')
    : new Map();

  // 範囲okuriganaグループを特定
  const okuriganaRangeGroups = profile.okurigana
    ? getRangeMarkGroups(tokens, marks, 'okurigana')
    : new Map();

  // 範囲soeganaグループを特定
  const soeganaRangeGroups = profile.soegana
    ? getRangeMarkGroups(tokens, marks, 'soegana')
    : new Map();

  // regionのrefを解決して表示用テキストを取得するヘルパー
  const getRefTextForRegion = (region: RegionMark): string => {
    if (!profile.ref || !region.ref) return '';

    // region.ref は RefMark の id を参照
    const refMark = marks.find((m): m is RefMark => m.type === 'ref' && m.id === region.ref);
    if (refMark) {
      const refText = refValueMap.get(refMark) ?? '';
      if (refText) {
        const halfWidthClass = shouldApplyTateChuYoko(refText) ? ` ${prefix}-ref--half-width` : '';
        return `<span class="${prefix}-ref${halfWidthClass}">${escapeHtml(refText)}</span>`;
      }
    }
    return '';
  };

  // ブロックごとにトークンをグループ化
  const blockGroups = groupTokensByBlock(tokens);
  const blockTag = inline ? 'span' : 'div';

  // 各ブロックを個別にレンダリング
  const renderedBlocks: string[] = [];

  for (const blockGroup of blockGroups) {
    const blockTokens = blockGroup.tokens;
    const renderedTokens: string[] = [];
    let currentTatetenGroup: TatetenMark | undefined;
    let currentRegionGroup: RegionMark | undefined;
    let groupTokens: string[] = [];
    let regionTokens: string[] = [];

    // 処理済みトークンを追跡（範囲グループのスキップ用）
    const processedTokenIds = new Set<string>();

    for (let i = 0; i < blockTokens.length; i++) {
      const token = blockTokens[i]!;

      // 範囲グループで既に処理済みのトークンはスキップ
      if (processedTokenIds.has(token.id)) {
        continue;
      }

      const tokenGroup = tatetenGroups.get(token.id);
      const regionGroup = regionGroups.get(token.id);

      // 範囲グループのチェック
      const yomiganaGroup = yomiganaRangeGroups.get(token.id);
      const okuriganaGroup = okuriganaRangeGroups.get(token.id);
      const soeganaGroup = soeganaRangeGroups.get(token.id);
      let rangeCtx: RangeMarkContext | undefined;

      // 範囲yomiganaグループ: 熟語全体にルビをかける
      if (yomiganaGroup && yomiganaGroup.tokenIds[0] === token.id) {
        const baseText = yomiganaGroup.tokenIds
          .map((tid: string) => {
            const t = tokens.find((tok) => tok.id === tid);
            return t?.text ?? '';
          })
          .join('');
        rangeCtx = { ...rangeCtx, yomiganaBaseText: baseText };

        // グループ内の他のトークンを処理済みとしてマーク
        for (const tid of yomiganaGroup.tokenIds.slice(1)) {
          processedTokenIds.add(tid);
        }
      }

      // 範囲okuriganaグループ: 熟語全体の後に送り仮名を付ける
      if (okuriganaGroup && okuriganaGroup.tokenIds[0] === token.id) {
        const baseText = okuriganaGroup.tokenIds
          .map((tid: string) => {
            const t = tokens.find((tok) => tok.id === tid);
            return t?.text ?? '';
          })
          .join('');
        const okuriganaValue = (okuriganaGroup.mark as OkuriganaMark).value;
        rangeCtx = { ...rangeCtx, okuriganaBaseText: baseText, okuriganaValue };

        // グループ内の他のトークンを処理済みとしてマーク（yomiganaと重複しなければ）
        for (const tid of okuriganaGroup.tokenIds.slice(1)) {
          if (!processedTokenIds.has(tid)) {
            processedTokenIds.add(tid);
          }
        }
      }

      // 範囲soeganaグループ: 熟語全体の後に添え仮名を付ける
      if (soeganaGroup && soeganaGroup.tokenIds[0] === token.id) {
        const baseText = soeganaGroup.tokenIds
          .map((tid: string) => {
            const t = tokens.find((tok) => tok.id === tid);
            return t?.text ?? '';
          })
          .join('');
        const soeganaValue = (soeganaGroup.mark as SoeganaMark).value;
        rangeCtx = { ...rangeCtx, soeganaBaseText: baseText, soeganaValue };

        // グループ内の他のトークンを処理済みとしてマーク（他グループと重複しなければ）
        for (const tid of soeganaGroup.tokenIds.slice(1)) {
          if (!processedTokenIds.has(tid)) {
            processedTokenIds.add(tid);
          }
        }
      }

      // 範囲グループの後続トークンに付いているマーク（返り点、句読点、ref）を収集
      // rangeCtxに追加してrenderToken内でsuffix-row等にまとめて出力
      const allRangeTokenIds = new Set<string>();
      if (yomiganaGroup && yomiganaGroup.tokenIds[0] === token.id) {
        for (const tid of yomiganaGroup.tokenIds.slice(1)) {
          allRangeTokenIds.add(tid);
        }
      }
      if (okuriganaGroup && okuriganaGroup.tokenIds[0] === token.id) {
        for (const tid of okuriganaGroup.tokenIds.slice(1)) {
          allRangeTokenIds.add(tid);
        }
      }
      if (soeganaGroup && soeganaGroup.tokenIds[0] === token.id) {
        for (const tid of soeganaGroup.tokenIds.slice(1)) {
          allRangeTokenIds.add(tid);
        }
      }
      if (allRangeTokenIds.size > 0) {
        const trailingKaeriMarks: KaeriMark[] = [];
        const trailingKutotenMarks: KutotenMark[] = [];
        const trailingRefMarks: RefMark[] = [];
        for (const tid of allRangeTokenIds) {
          const trailingTokenMarks = getMarksForToken(tid, marks);
          if (profile.kaeriten) {
            const kaeri = trailingTokenMarks.get('kaeri') as KaeriMark[] | undefined;
            if (kaeri) trailingKaeriMarks.push(...kaeri);
          }
          if (profile.kutoten) {
            const kutoten = trailingTokenMarks.get('kutoten') as KutotenMark[] | undefined;
            if (kutoten) trailingKutotenMarks.push(...kutoten);
          }
          if (profile.ref) {
            const ref = trailingTokenMarks.get('ref') as RefMark[] | undefined;
            if (ref) trailingRefMarks.push(...ref);
          }
        }
        rangeCtx = {
          ...rangeCtx,
          trailingKaeriMarks,
          trailingKutotenMarks,
          trailingRefMarks,
        };
      }

      let tokenHtml = renderToken(token, marks, ctx, rangeCtx, refValueMap, regionRefIds);

      // region グループ処理
      if (profile.region && regionGroup) {
        if (currentRegionGroup !== regionGroup) {
          // 新しい region グループ開始（前のグループがあれば閉じる）
          if (currentRegionGroup && regionTokens.length > 0) {
            const style = currentRegionGroup.style ?? 'none';
            const refHtml = getRefTextForRegion(currentRegionGroup);
            const styleClass = style !== 'none' ? ` ${prefix}-region--${style}` : '';
            renderedTokens.push(
              `<span class="${prefix}-region${styleClass}" data-style="${style}">${regionTokens.join('')}${refHtml}</span>`
            );
            regionTokens = [];
          }
          currentRegionGroup = regionGroup;
        }
        // region グループ内のトークンを蓄積（たて点処理も考慮）
        if (profile.tateten && tokenGroup) {
          if (currentTatetenGroup !== tokenGroup) {
            if (currentTatetenGroup && groupTokens.length > 0) {
              regionTokens.push(
                `<span class="${prefix}-tateten-group">${groupTokens.join(`<span class="${prefix}-tateten-mark"></span>`)}</span>`
              );
              groupTokens = [];
            }
            currentTatetenGroup = tokenGroup;
          }
          groupTokens.push(tokenHtml);
        } else {
          if (currentTatetenGroup && groupTokens.length > 0) {
            regionTokens.push(
              `<span class="${prefix}-tateten-group">${groupTokens.join(`<span class="${prefix}-tateten-mark"></span>`)}</span>`
            );
            groupTokens = [];
            currentTatetenGroup = undefined;
          }
          regionTokens.push(tokenHtml);
        }
      } else {
        // region グループ外
        // 前の region グループを閉じる
        if (currentRegionGroup && regionTokens.length > 0) {
          // たて点グループも閉じる
          if (currentTatetenGroup && groupTokens.length > 0) {
            regionTokens.push(
              `<span class="${prefix}-tateten-group">${groupTokens.join(`<span class="${prefix}-tateten-mark"></span>`)}</span>`
            );
            groupTokens = [];
            currentTatetenGroup = undefined;
          }
          const style = currentRegionGroup.style ?? 'none';
          const refHtml = getRefTextForRegion(currentRegionGroup);
          const styleClass = style !== 'none' ? ` ${prefix}-region--${style}` : '';
          renderedTokens.push(
            `<span class="${prefix}-region${styleClass}" data-style="${style}">${regionTokens.join('')}${refHtml}</span>`
          );
          regionTokens = [];
          currentRegionGroup = undefined;
        }

        // たて点グループ処理
        if (profile.tateten && tokenGroup) {
          if (currentTatetenGroup !== tokenGroup) {
            if (currentTatetenGroup && groupTokens.length > 0) {
              renderedTokens.push(
                `<span class="${prefix}-tateten-group">${groupTokens.join(`<span class="${prefix}-tateten-mark"></span>`)}</span>`
              );
              groupTokens = [];
            }
            currentTatetenGroup = tokenGroup;
          }
          groupTokens.push(tokenHtml);
        } else {
          if (currentTatetenGroup && groupTokens.length > 0) {
            renderedTokens.push(
              `<span class="${prefix}-tateten-group">${groupTokens.join(`<span class="${prefix}-tateten-mark"></span>`)}</span>`
            );
            groupTokens = [];
            currentTatetenGroup = undefined;
          }
          renderedTokens.push(tokenHtml);
        }
      }
    }

    // 最後のグループを閉じる
    if (currentTatetenGroup && groupTokens.length > 0) {
      if (currentRegionGroup) {
        regionTokens.push(
          `<span class="${prefix}-tateten-group">${groupTokens.join(`<span class="${prefix}-tateten-mark"></span>`)}</span>`
        );
      } else {
        renderedTokens.push(
          `<span class="${prefix}-tateten-group">${groupTokens.join(`<span class="${prefix}-tateten-mark"></span>`)}</span>`
        );
      }
    }

    if (currentRegionGroup && regionTokens.length > 0) {
      const style = currentRegionGroup.style ?? 'none';
      const refHtml = getRefTextForRegion(currentRegionGroup);
      const styleClass = style !== 'none' ? ` ${prefix}-region--${style}` : '';
      renderedTokens.push(
        `<span class="${prefix}-region${styleClass}" data-style="${style}">${regionTokens.join('')}${refHtml}</span>`
      );
    }

    // ブロックをラップして追加
    const blockContent = renderedTokens.join('');
    if (blockGroup.blockId) {
      renderedBlocks.push(
        `<${blockTag} class="${prefix}-block" data-block-id="${escapeHtml(blockGroup.blockId)}">${blockContent}</${blockTag}>`
      );
    } else {
      // blockIdがない場合はそのまま追加
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

  // Display層
  const displayResult = renderDisplayLayer(doc, prefix, profile, inline);
  const displayTag = inline ? 'span' : 'div';
  const displayHtml = `<${displayTag} class="${prefix}-display" aria-hidden="true">${displayResult.tokens}</${displayTag}>`;

  // 読み層
  const readingHtml = includeReadingLayer ? renderReadingLayer(doc.readings, prefix, inline) : '';

  // refマークの値を事前計算（注釈出力用）
  const refValueMap = profile.ref ? resolveRefValues(doc.marks) : new Map();

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

  // Display層
  const displayResult = renderDisplayLayer(doc, prefix, profile, inline);
  const displayTag = inline ? 'span' : 'div';
  const displayHtml = `<${displayTag} class="${prefix}-display" aria-hidden="true">${displayResult.tokens}</${displayTag}>`;

  // 読み層
  const readingHtml = includeReadingLayer ? renderReadingLayer(doc.readings, prefix, inline) : '';

  // refマークの値を事前計算（注釈出力用）
  const refValueMap = profile.ref ? resolveRefValues(doc.marks) : new Map();

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
