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
  OkijiMark,
  KutotenMark,
  EmphasisMark,
  NoteMark,
  SaidokuMark,
  OkototenMark,
  TatetenMark,
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
  okiji: boolean;
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
  okiji: true,
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
  okiji: false,
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
  okiji: true,
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

// ============================================================================
// Token Rendering
// ============================================================================

interface TokenRenderContext {
  prefix: string;
  profile: RenderProfile;
  tokenMarks: Map<Mark['type'], Mark[]>;
}

/**
 * ルビ付きのToken HTMLを生成
 *
 * - 読み仮名(yomigana)と送り仮名(okurigana)はruby要素のrt内に配置
 * - 助字(okiji)はruby外に配置（本文の一部として表示）
 */
function renderTokenWithRuby(
  token: Token,
  ctx: TokenRenderContext
): { baseHtml: string; okiji: string } {
  const { prefix, profile, tokenMarks } = ctx;

  // 読み仮名（ruby要素のrt内に配置）
  const yomiganaMarks = (tokenMarks.get('yomigana') ?? []) as YomiganaMark[];
  const yomigana =
    profile.yomigana && yomiganaMarks.length > 0
      ? yomiganaMarks.map((m) => escapeHtml(m.value)).join('')
      : '';

  // 送り仮名（読み仮名と一緒にrt内に配置）
  const okuriganaMarks = (tokenMarks.get('okurigana') ?? []) as OkuriganaMark[];
  const okurigana =
    profile.okurigana && okuriganaMarks.length > 0
      ? `<span class="${prefix}-okuri">${okuriganaMarks.map((m) => escapeHtml(m.value)).join('')}</span>`
      : '';

  // 助字（ruby外に配置 - 本文の一部）
  const okijiMarks = (tokenMarks.get('okiji') ?? []) as OkijiMark[];
  const okiji =
    profile.okiji && okijiMarks.length > 0
      ? `<span class="${prefix}-okiji">${okijiMarks.map((m) => escapeHtml(m.value)).join('')}</span>`
      : '';

  // ルビ（読み仮名 or 送り仮名）が必要な場合はruby要素を使用
  let baseHtml: string;
  const rtContent = yomigana + okurigana;
  if (rtContent) {
    baseHtml = `<ruby><rb class="${prefix}-base">${escapeHtml(token.text)}</rb><rt class="${prefix}-ruby">${rtContent}</rt></ruby>`;
  } else {
    baseHtml = `<span class="${prefix}-base">${escapeHtml(token.text)}</span>`;
  }

  return { baseHtml, okiji };
}

/**
 * 再読文字のToken HTMLを生成
 *
 * 読み仮名と送り仮名はrt内に配置する。
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

  // 各formをrtとして生成（読み仮名 + 送り仮名）
  const rtElements = forms
    .map((form, index) => {
      const n = form.n ?? index + 1;
      const reading = form.reading ? escapeHtml(form.reading) : '';
      const okuri = form.okuri
        ? `<span class="${prefix}-okuri">${escapeHtml(form.okuri)}</span>`
        : '';
      const underClass = index > 0 ? ` ${prefix}-saidoku-under` : '';
      return `<rt class="${prefix}-ruby${underClass}" data-saidoku-n="${n}">${reading}${okuri}</rt>`;
    })
    .join('');

  return `<ruby><rb class="${prefix}-base">${escapeHtml(token.text)}</rb>${rtElements}</ruby>`;
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

  // 句読点
  const kutotenMarks = (tokenMarks.get('kutoten') ?? []) as KutotenMark[];
  const kutoten =
    profile.kutoten && kutotenMarks.length > 0
      ? kutotenMarks
          .map((m) => `<span class="${prefix}-kutoten">${escapeHtml(m.value)}</span>`)
          .join('')
      : '';

  // Token本体のHTML（助字のみruby外に配置）
  let baseHtml: string;
  let okiji = '';

  if (saidokuMark) {
    baseHtml = renderSaidokuToken(token, saidokuMark, fullCtx);
  } else {
    const result = renderTokenWithRuby(token, fullCtx);
    baseHtml = result.baseHtml;
    okiji = result.okiji;
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

  // 助字はトークンの外（返り点の後、句読点の前）に配置
  return `<span class="${classes.join(' ')}" data-token-id="${escapeHtml(token.id)}">${baseHtml}${okototenHtml}${kaeriten}</span>${okiji}${kutoten}`;
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

  // トークンをグループ化してレンダリング
  const renderedTokens: string[] = [];
  let currentTatetenGroup: TatetenMark | undefined;
  let groupTokens: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const tokenGroup = tatetenGroups.get(token.id);
    const tokenHtml = renderToken(token, marks, ctx);

    if (profile.tateten && tokenGroup) {
      // たて点グループ内
      if (currentTatetenGroup !== tokenGroup) {
        // 新しいグループ開始（前のグループがあれば閉じる）
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
      // たて点グループ外
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

  // 最後のグループを閉じる
  if (currentTatetenGroup && groupTokens.length > 0) {
    renderedTokens.push(
      `<span class="${prefix}-tateten-group">${groupTokens.join(`<span class="${prefix}-tateten-mark"></span>`)}</span>`
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
