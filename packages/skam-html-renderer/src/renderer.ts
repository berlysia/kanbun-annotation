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
  NoteMark,
  SaidokuMark,
  OkototenMark,
  TatetenMark,
  UnderlineMark,
  LabelMark,
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
  notes: boolean;
  okimoji: boolean;
  joji: boolean;
  soegana: boolean;
  underline: boolean;
  label: boolean;
}

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
}

/**
 * レンダリング結果
 */
export interface RenderResult {
  html: string;
  css: string;
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
  notes: true,
  okimoji: true,
  joji: true,
  soegana: true,
  underline: true,
  label: true,
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
  notes: false,
  okimoji: true,
  joji: true,
  soegana: false,
  underline: true,
  label: true,
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
  notes: false,
  okimoji: true,
  joji: true,
  soegana: true,
  underline: true,
  label: true,
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
const IROHA_SEQUENCE = 'イロハニホヘトチリヌルヲワカヨタレソツネナラムウヰノオクヤマケフコエテアサキユメミシヱヒモセス';

/**
 * イロハ順（ひらがな）
 */
const IROHA_HIRAGANA_SEQUENCE = 'いろはにほへとちりぬるをわかよたれそつねならむうゐのおくやまけふこえてあさきゆめみしゑひもせす';

/**
 * 五十音順（カタカナ）
 */
const GOJUON_SEQUENCE = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';

/**
 * 五十音順（ひらがな）
 */
const GOJUON_HIRAGANA_SEQUENCE = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん';

/**
 * 漢数字
 */
const KANJI_NUMBERS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/**
 * 丸数字（①〜㊿）
 */
const CIRCLED_NUMBERS = [
  '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩',
  '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳',
  '㉑', '㉒', '㉓', '㉔', '㉕', '㉖', '㉗', '㉘', '㉙', '㉚',
  '㉛', '㉜', '㉝', '㉞', '㉟', '㊱', '㊲', '㊳', '㊴', '㊵',
  '㊶', '㊷', '㊸', '㊹', '㊺', '㊻', '㊼', '㊽', '㊾', '㊿',
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
 */
function getMarksForToken(tokenId: string, marks: Mark[]): Map<Mark['type'], Mark[]> {
  const result = new Map<Mark['type'], Mark[]>();

  for (const mark of marks) {
    if (mark.anchor.from === tokenId || mark.anchor.to === tokenId) {
      const existing = result.get(mark.type) ?? [];
      existing.push(mark);
      result.set(mark.type, existing);
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
 * 返り点記号をUnicodeに変換
 */
function convertKaeriToUnicode(value: string): string {
  return KAERI_UNICODE[value] ?? value;
}

/**
 * 縦中横を適用すべきかを判定
 *
 * 以下の条件で縦中横を適用:
 * - 括弧で囲まれた1文字（例: "(A)", "(1)"）
 * - または2文字以下の半角文字
 */
function shouldApplyTateChuYoko(text: string): boolean {
  // 括弧で囲まれた1文字の場合
  if (/^\([A-Za-z0-9]\)$/.test(text)) {
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
function formatLabelIndex(index: number, format: LabelMark['format']): string {
  switch (format) {
    case 'alpha-upper':
      return `(${String.fromCharCode(65 + index)})`;  // A=65
    case 'alpha-lower':
      return `(${String.fromCharCode(97 + index)})`;  // a=97
    case 'numeric':
      return `(${index + 1})`;
    case 'circled':
      return CIRCLED_NUMBERS[index] ?? `(${index + 1})`;
    case 'iroha':
      return `(${IROHA_SEQUENCE[index] ?? String(index + 1)})`;
    case 'iroha-hiragana':
      return `(${IROHA_HIRAGANA_SEQUENCE[index] ?? String(index + 1)})`;
    case 'gojuon':
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
 * ドキュメント内のLabelMarkを解決してマップを生成
 */
function resolveLabelValues(marks: Mark[]): Map<LabelMark, string> {
  const labelMarks = marks.filter((m): m is LabelMark => m.type === 'label');
  const result = new Map<LabelMark, string>();

  // format指定ありのラベルをフォーマット別にグループ化
  const formatGroups = new Map<string, LabelMark[]>();

  for (const label of labelMarks) {
    if (label.format) {
      const group = formatGroups.get(label.format) ?? [];
      group.push(label);
      formatGroups.set(label.format, group);
    } else if (label.value) {
      // formatなしの場合はvalueをそのまま使用
      result.set(label, label.value);
    }
  }

  // 各フォーマットグループ内でインデックスを割り当て
  for (const [format, labels] of formatGroups) {
    const valueToIndex = new Map<string, number>();
    let nextIndex = 0;

    for (const label of labels) {
      let index: number;

      if (label.value !== undefined) {
        // valueありの場合：同一valueは同一インデックス
        const existingIndex = valueToIndex.get(label.value);
        if (existingIndex !== undefined) {
          index = existingIndex;
        } else {
          index = nextIndex++;
          valueToIndex.set(label.value, index);
        }
      } else {
        // valueなしの場合：単純にインクリメント
        index = nextIndex++;
      }

      result.set(label, formatLabelIndex(index, format as LabelMark['format']));
    }
  }

  return result;
}

/**
 * Underline Markの範囲に含まれるTokenを特定
 */
function getUnderlineGroups(tokens: Token[], marks: Mark[]): Map<string, UnderlineMark> {
  const underlineMarks = marks.filter((m): m is UnderlineMark => m.type === 'underline');
  const tokenIdToGroup = new Map<string, UnderlineMark>();

  for (const underline of underlineMarks) {
    const fromIndex = tokens.findIndex((t) => t.id === underline.anchor.from);
    const toIndex = tokens.findIndex((t) => t.id === underline.anchor.to);

    if (fromIndex !== -1 && toIndex !== -1) {
      for (let i = fromIndex; i <= toIndex; i++) {
        const token = tokens[i];
        if (token) {
          tokenIdToGroup.set(token.id, underline);
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
 */
function renderTokenWithRuby(token: Token, ctx: TokenRenderContext): string {
  const { prefix, profile, tokenMarks } = ctx;

  // 読み仮名（ruby要素のrt内に配置、中央揃え）
  const yomiganaMarks = (tokenMarks.get('yomigana') ?? []) as YomiganaMark[];
  const yomigana =
    profile.yomigana && yomiganaMarks.length > 0
      ? yomiganaMarks.map((m) => escapeHtml(m.value)).join('')
      : '';

  // ルビ（読み仮名）が必要な場合はruby要素を使用
  if (yomigana) {
    return `<ruby><rb class="${prefix}-base">${escapeHtml(token.text)}</rb><rt class="${prefix}-ruby">${yomigana}</rt></ruby>`;
  } else {
    return `<span class="${prefix}-base">${escapeHtml(token.text)}</span>`;
  }
}

/**
 * 再読文字のToken HTMLを生成
 *
 * 入れ子ruby方式: 内側rubyで第1読み、外側rubyで第2読みを配置。
 * <ruby><ruby>將<rt>まさに</rt></ruby><rt>す</rt></ruby>
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

  // 第1読み用のrt
  let firstRt = '';
  if (firstForm) {
    const n = firstForm.n ?? 1;
    const yomi = firstForm.yomi ? escapeHtml(firstForm.yomi) : '';
    const okuri = firstForm.okuri
      ? `<span class="${prefix}-okuri">${escapeHtml(firstForm.okuri)}</span>`
      : '';
    firstRt = `<rt class="${prefix}-ruby" data-saidoku-n="${n}">${yomi}${okuri}</rt>`;
  }

  // 内側ruby（第1読み）
  const innerRuby = `<ruby class="${prefix}-saidoku-inner"><rb class="${prefix}-base">${escapeHtml(token.text)}</rb>${firstRt}</ruby>`;

  // 第2読みがなければ内側rubyのみ返す
  if (!secondForm) {
    return innerRuby;
  }

  // 第2読み用のrt
  const n2 = secondForm.n ?? 2;
  const yomi2 = secondForm.yomi ? escapeHtml(secondForm.yomi) : '';
  const okuri2 = secondForm.okuri
    ? `<span class="${prefix}-okuri">${escapeHtml(secondForm.okuri)}</span>`
    : '';
  const secondRt = `<rt class="${prefix}-ruby ${prefix}-saidoku-under" data-saidoku-n="${n2}">${yomi2}${okuri2}</rt>`;

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
 */
function renderToken(
  token: Token,
  marks: Mark[],
  ctx: Omit<TokenRenderContext, 'tokenMarks'>
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

  // 送り仮名
  const okuriganaMarks = (tokenMarks.get('okurigana') ?? []) as OkuriganaMark[];
  const okurigana =
    profile.okurigana && okuriganaMarks.length > 0
      ? `<span class="${prefix}-okuri">${okuriganaMarks.map((m) => escapeHtml(m.value)).join('')}</span>`
      : '';

  // 添え仮名
  const soeganaMarks = (tokenMarks.get('soegana') ?? []) as SoeganaMark[];
  const soegana =
    profile.soegana && soeganaMarks.length > 0
      ? `<span class="${prefix}-soegana">${soeganaMarks.map((m) => escapeHtml(m.value)).join('')}</span>`
      : '';

  // 返り点
  const kaeriMarks = (tokenMarks.get('kaeri') ?? []) as KaeriMark[];
  const kaeriten =
    profile.kaeriten && kaeriMarks.length > 0
      ? kaeriMarks
          .map(
            (m) =>
              `<span class="${prefix}-kaeriten" aria-hidden="true">${convertKaeriToUnicode(m.value)}</span>`
          )
          .join('')
      : '';

  // suffix-row: 送り仮名・添え仮名（右）と返り点（左）を同じ行に配置するコンテナ
  const suffixKanaContent = okurigana + soegana;
  const hasBothSuffixes = suffixKanaContent && kaeriten;
  const suffixRow = hasBothSuffixes
    ? `<span class="${prefix}-suffix-row"><span class="${prefix}-suffix-left">${kaeriten}</span><span class="${prefix}-suffix-right">${suffixKanaContent}</span></span>`
    : suffixKanaContent
      ? `<span class="${prefix}-suffix-kana">${suffixKanaContent}</span>`
      : kaeriten
        ? `<span class="${prefix}-kaeriten-only">${kaeriten}</span>`
        : '';

  // 句読点
  const kutotenMarks = (tokenMarks.get('kutoten') ?? []) as KutotenMark[];
  const kutoten =
    profile.kutoten && kutotenMarks.length > 0
      ? kutotenMarks
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

  if (saidokuMark) {
    baseHtml = renderSaidokuToken(token, saidokuMark, fullCtx);
  } else {
    baseHtml = renderTokenWithRuby(token, fullCtx);
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

  return `<span class="${classes.join(' ')}" data-token-id="${escapeHtml(token.id)}">${baseHtml}${okototenHtml}${suffixRow}</span>${kutoten}`;
}

// ============================================================================
// Document Rendering
// ============================================================================

/**
 * 読み層のHTMLを生成
 */
function renderReadingLayer(readings: Reading[], prefix: string): string {
  const yomiage = readings.find((r) => r.kind === 'yomiage');
  const kakikudashi = readings.find((r) => r.kind === 'kakikudashi');

  const text = yomiage?.text ?? kakikudashi?.text ?? '';

  if (!text) {
    return '';
  }

  return `<div class="${prefix}-reading" aria-label="読み上げテキスト">${escapeHtml(text)}</div>`;
}

/**
 * 注釈のHTMLを生成
 */
function renderNotes(marks: Mark[], prefix: string, profile: RenderProfile): string {
  if (!profile.notes) {
    return '';
  }

  const noteMarks = marks.filter((m): m is NoteMark => m.type === 'note');

  if (noteMarks.length === 0) {
    return '';
  }

  const noteItems = noteMarks
    .map((note, index) => {
      const marker = index + 1;
      return `<div class="${prefix}-note-item"><span class="${prefix}-note-marker">${marker}</span>${escapeHtml(note.value)}</div>`;
    })
    .join('');

  return `<aside class="${prefix}-notes">${noteItems}</aside>`;
}

/**
 * Display層のHTMLを生成
 */
function renderDisplayLayer(doc: SKAMDocument, prefix: string, profile: RenderProfile): string {
  const { tokens, marks } = doc;
  const ctx = { prefix, profile };

  // たて点グループを特定
  const tatetenGroups = getTatetenGroups(tokens, marks);

  // 傍線グループを特定
  const underlineGroups = profile.underline ? getUnderlineGroups(tokens, marks) : new Map();

  // ラベル値を事前計算
  const labelValues = profile.label ? resolveLabelValues(marks) : new Map();

  // underlineグループ内に読み仮名があるかを判定するヘルパー
  const hasYomiganaInUnderline = (underline: UnderlineMark): boolean => {
    const fromIndex = tokens.findIndex((t) => t.id === underline.anchor.from);
    const toIndex = tokens.findIndex((t) => t.id === underline.anchor.to);

    if (fromIndex !== -1 && toIndex !== -1) {
      for (let j = fromIndex; j <= toIndex; j++) {
        const t = tokens[j];
        if (t) {
          const tMarks = getMarksForToken(t.id, marks);
          if ((tMarks.get('yomigana') ?? []).length > 0) {
            return true;
          }
        }
      }
    }
    return false;
  };

  // underlineグループ内のラベルを収集するヘルパー
  const collectLabelsForUnderline = (underline: UnderlineMark): string => {
    if (!profile.label) return '';

    const labelsInGroup: string[] = [];
    const fromIndex = tokens.findIndex((t) => t.id === underline.anchor.from);
    const toIndex = tokens.findIndex((t) => t.id === underline.anchor.to);

    if (fromIndex !== -1 && toIndex !== -1) {
      for (let j = fromIndex; j <= toIndex; j++) {
        const t = tokens[j];
        if (t) {
          const tMarks = getMarksForToken(t.id, marks);
          const tLabelMarks = (tMarks.get('label') ?? []) as LabelMark[];
          for (const m of tLabelMarks) {
            const labelText = labelValues.get(m) ?? m.value ?? '';
            const dataAttrs = m.format ? ` data-format="${m.format}"` : '';
            const halfWidthClass = shouldApplyTateChuYoko(labelText) ? ` ${prefix}-label--half-width` : '';
            labelsInGroup.push(
              `<span class="${prefix}-label${halfWidthClass}"${dataAttrs}>${escapeHtml(labelText)}</span>`
            );
          }
        }
      }
    }

    return labelsInGroup.join('');
  };

  // トークンをグループ化してレンダリング
  const renderedTokens: string[] = [];
  let currentTatetenGroup: TatetenMark | undefined;
  let currentUnderlineGroup: UnderlineMark | undefined;
  let groupTokens: string[] = [];
  let underlineTokens: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const tokenGroup = tatetenGroups.get(token.id);
    const underlineGroup = underlineGroups.get(token.id);
    let tokenHtml = renderToken(token, marks, ctx);

    // ラベルを追加（傍線グループ外のトークンに紐づくラベルのみ）
    if (profile.label && !underlineGroup) {
      const tokenMarks = getMarksForToken(token.id, marks);
      const tokenLabelMarks = (tokenMarks.get('label') ?? []) as LabelMark[];
      if (tokenLabelMarks.length > 0) {
        const labelHtml = tokenLabelMarks
          .map((m) => {
            const labelText = labelValues.get(m) ?? m.value ?? '';
            const dataAttrs = m.format ? ` data-format="${m.format}"` : '';
            const halfWidthClass = shouldApplyTateChuYoko(labelText) ? ` ${prefix}-label--half-width` : '';
            return `<span class="${prefix}-label${halfWidthClass}"${dataAttrs}>${escapeHtml(labelText)}</span>`;
          })
          .join('');
        tokenHtml += labelHtml;
      }
    }

    // 傍線グループ処理
    if (profile.underline && underlineGroup) {
      if (currentUnderlineGroup !== underlineGroup) {
        // 新しい傍線グループ開始（前のグループがあれば閉じる）
        if (currentUnderlineGroup && underlineTokens.length > 0) {
          const style = currentUnderlineGroup.style ?? 'solid';
          const labelsHtml = collectLabelsForUnderline(currentUnderlineGroup);
          const hasRuby = hasYomiganaInUnderline(currentUnderlineGroup);
          const rubyClass = hasRuby ? ` ${prefix}-underline--has-ruby` : '';
          renderedTokens.push(
            `<span class="${prefix}-underline${rubyClass}" data-style="${style}">${underlineTokens.join('')}${labelsHtml}</span>`
          );
          underlineTokens = [];
        }
        currentUnderlineGroup = underlineGroup;
      }
      // 傍線グループ内のトークンを蓄積（たて点処理も考慮）
      if (profile.tateten && tokenGroup) {
        if (currentTatetenGroup !== tokenGroup) {
          if (currentTatetenGroup && groupTokens.length > 0) {
            underlineTokens.push(
              `<span class="${prefix}-tateten-group">${groupTokens.join(`<span class="${prefix}-tateten-mark"></span>`)}</span>`
            );
            groupTokens = [];
          }
          currentTatetenGroup = tokenGroup;
        }
        groupTokens.push(tokenHtml);
      } else {
        if (currentTatetenGroup && groupTokens.length > 0) {
          underlineTokens.push(
            `<span class="${prefix}-tateten-group">${groupTokens.join(`<span class="${prefix}-tateten-mark"></span>`)}</span>`
          );
          groupTokens = [];
          currentTatetenGroup = undefined;
        }
        underlineTokens.push(tokenHtml);
      }
    } else {
      // 傍線グループ外
      // 前の傍線グループを閉じる
      if (currentUnderlineGroup && underlineTokens.length > 0) {
        // たて点グループも閉じる
        if (currentTatetenGroup && groupTokens.length > 0) {
          underlineTokens.push(
            `<span class="${prefix}-tateten-group">${groupTokens.join(`<span class="${prefix}-tateten-mark"></span>`)}</span>`
          );
          groupTokens = [];
          currentTatetenGroup = undefined;
        }
        const style = currentUnderlineGroup.style ?? 'solid';
        const labelsHtml = collectLabelsForUnderline(currentUnderlineGroup);
        const hasRuby = hasYomiganaInUnderline(currentUnderlineGroup);
        const rubyClass = hasRuby ? ` ${prefix}-underline--has-ruby` : '';
        renderedTokens.push(
          `<span class="${prefix}-underline${rubyClass}" data-style="${style}">${underlineTokens.join('')}${labelsHtml}</span>`
        );
        underlineTokens = [];
        currentUnderlineGroup = undefined;
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
    if (currentUnderlineGroup) {
      underlineTokens.push(
        `<span class="${prefix}-tateten-group">${groupTokens.join(`<span class="${prefix}-tateten-mark"></span>`)}</span>`
      );
    } else {
      renderedTokens.push(
        `<span class="${prefix}-tateten-group">${groupTokens.join(`<span class="${prefix}-tateten-mark"></span>`)}</span>`
      );
    }
  }

  if (currentUnderlineGroup && underlineTokens.length > 0) {
    const style = currentUnderlineGroup.style ?? 'solid';
    const labelsHtml = collectLabelsForUnderline(currentUnderlineGroup);
    const hasRuby = hasYomiganaInUnderline(currentUnderlineGroup);
    const rubyClass = hasRuby ? ` ${prefix}-underline--has-ruby` : '';
    renderedTokens.push(
      `<span class="${prefix}-underline${rubyClass}" data-style="${style}">${underlineTokens.join('')}${labelsHtml}</span>`
    );
  }

  return `<div class="${prefix}-display" aria-hidden="true">${renderedTokens.join('')}</div>`;
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

  // Display層
  const displayHtml = renderDisplayLayer(doc, prefix, profile);

  // 読み層
  const readingHtml = includeReadingLayer ? renderReadingLayer(doc.readings, prefix) : '';

  // 注釈
  const notesHtml = renderNotes(doc.marks, prefix, profile);

  // Document全体
  const html = `<div class="${prefix}-document" lang="ja" data-writing-mode="${writingMode}">${displayHtml}${readingHtml}${notesHtml}</div>`;

  // CSS
  const css = getDefaultStyles({ classPrefix: prefix, writingMode });

  return { html, css };
}
