/**
 * SKAM HTML Renderer
 *
 * SKAMドキュメントから静的HTMLを生成する
 */

import type { SKAMDocument, Mark, RefMark, Reading } from '@kanbun-skam/skam';
import type { Spacing } from '@kanbun-skam/skam/rendering';
import { resolveRefValues } from '@kanbun-skam/skam/rendering';
import { getDefaultStyles } from './styles.js';
import type {
  RenderProfile,
  RenderProfileInput,
  RubyMethod,
  CopyableElement,
} from './render-config.js';
import { resolveRenderProfile } from './render-config.js';
import { escapeHtml, getSourceOrderedTokens, shouldApplyTateChuYoko } from './html-utils.js';
import { renderDisplayLayer } from './render-display-layer.js';
import { validateCSSOptions, validateRenderOptions } from './render-options.js';

export type {
  RenderProfile,
  RenderProfileInput,
  RenderProfileName,
  RubyMethod,
  CopyableElement,
} from './render-config.js';
export { PROFILES, resolveRenderProfile } from './render-config.js';
export { escapeHtml, generateEmphasisMarks, shouldApplyTateChuYoko } from './html-utils.js';
export { getBlockStartMarks } from './mark-utils.js';
export { renderToken, type TokenRenderContext } from './token-renderer.js';

export type { RangeMarkContext, RangeTokenInfo, TokenRenderResult } from './render-tree-types.js';

// ============================================================================
// Types (re-exported from render-config.ts)
// ============================================================================

/**
 * レンダリングオプション
 */
export interface RenderOptions {
  /**
   * 表示要素の制御プロファイル。部分指定は full に重なる（書かなかったキーは表示される）。
   * 注記を隠す用途では `{ base, overrides }` の形を使う。不正な値は TypeError。
   */
  profile?: RenderProfileInput;
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
  /**
   * Ruby要素のレンダリング方式（default: 'grid'）
   *
   * - 'ruby': HTML ruby要素を使用
   * - 'grid': inline-grid で代替レンダリング
   */
  rubyMethod?: RubyMethod;
  /**
   * 字間スペーシング（アキ組み）
   *
   * - 'solid': ベタ組み（アキなし、デフォルト）
   * - 'quarter': 四分アキ（0.25em）
   * - 'half': 二分アキ（0.5em）
   * - number: 任意の em 値（0以上）
   */
  spacing?: Spacing;
  /** 表示層の言語タグ (BCP 47) */
  displayLang?: string;
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
  /**
   * 表示要素の制御プロファイル。部分指定は full に重なる（書かなかったキーは表示される）。
   * 注記を隠す用途では `{ base, overrides }` の形を使う。不正な値は TypeError。
   */
  profile?: RenderProfileInput;
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
  /**
   * Ruby要素のレンダリング方式（default: 'grid'）
   */
  rubyMethod?: RubyMethod;
  /** 表示層の言語タグ (BCP 47) */
  displayLang?: string;
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
  /**
   * Ruby要素のレンダリング方式（default: 'grid'）
   *
   * - 'ruby': ruby要素用CSS
   * - 'grid': inline-grid用CSS
   * - 'both': 両方のCSSを出力
   */
  rubyMethod?: RubyMethod | 'both';
  /**
   * 字間スペーシング（アキ組み）
   *
   * - 'solid': ベタ組み（アキなし、デフォルト）
   * - 'quarter': 四分アキ（0.25em）
   * - 'half': 二分アキ（0.5em）
   * - number: 任意の em 値（0以上）
   */
  spacing?: Spacing;
}

// Presets: re-exported from render-config.ts

// ============================================================================
// Helper Functions
// ============================================================================

// escapeHtml, generateEmphasisMarks, shouldApplyTateChuYoko: moved to html-utils.ts
// getBlockStartMarks, isBlockStartPosition: moved to mark-utils.ts

// Token rendering: moved to token-renderer.ts

// ============================================================================
// Document Rendering
// ============================================================================

// Display layer orchestration: moved to render-display-layer.ts

/**
 * 読み層のHTMLを生成
 */
function renderReadingLayer(doc: SKAMDocument, prefix: string, inline: boolean): string {
  const usable = (kind: Reading['kind']): string | undefined => {
    const text = doc.readings.find((r) => r.kind === kind)?.text;
    return text !== undefined && text.trim() !== '' ? text : undefined;
  };

  // 読みがなければ白文 (原文順の本文) を読み上げ用に出す
  const text =
    usable('yomiage') ??
    usable('kakikudashi') ??
    getSourceOrderedTokens(doc)
      .map((t) => t.text)
      .join('');

  if (!text) {
    return '';
  }

  const tag = inline ? 'span' : 'div';
  return `<${tag} class="${prefix}-reading">${escapeHtml(text)}</${tag}>`;
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

// ============================================================================
// Main API
// ============================================================================

function renderDocumentHtml(
  doc: SKAMDocument,
  options: RenderHTMLOptions
): {
  html: string;
  prefix: string;
  writingMode: 'vertical' | 'horizontal';
  inline: boolean;
  rubyMethod: RubyMethod;
} {
  const profile: RenderProfile = resolveRenderProfile(options.profile);
  const writingMode = options.writingMode ?? 'vertical';
  const prefix = options.classPrefix ?? 'skam';
  const includeReadingLayer = options.includeReadingLayer ?? true;
  const inline = options.inline ?? false;
  const copyable = options.copyable;
  const interactive = options.interactive ?? false;
  const rubyMethod = options.rubyMethod ?? 'grid';
  const displayLang = options.displayLang ?? 'ja';

  // Display層
  const displayResult = renderDisplayLayer(doc, prefix, profile, inline, interactive, rubyMethod);
  const displayTag = inline ? 'span' : 'div';
  const displayHtml = `<${displayTag} class="${prefix}-display" lang="${displayLang}" aria-hidden="true">${displayResult.tokens}</${displayTag}>`;

  // 読み層
  const readingHtml = includeReadingLayer ? renderReadingLayer(doc, prefix, inline) : '';

  // refマークの値を事前計算（注釈出力用）
  const refValueMap = profile.ref
    ? resolveRefValues(getSourceOrderedTokens(doc), doc.marks)
    : new Map();

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
  return { html, prefix, writingMode, inline, rubyMethod };
}

/**
 * SKAMドキュメントをHTMLにレンダリング
 */
export function render(doc: SKAMDocument, options: RenderOptions = {}): RenderResult {
  validateRenderOptions(options);
  const { html, prefix, writingMode, inline, rubyMethod } = renderDocumentHtml(doc, options);

  // CSS
  const styleOptions: import('./styles.js').StyleOptions = {
    classPrefix: prefix,
    writingMode,
    inline,
    rubyMethod,
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
  if (options.spacing !== undefined) {
    styleOptions.spacing = options.spacing;
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
  validateRenderOptions(options);
  return renderDocumentHtml(doc, options).html;
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
  validateCSSOptions(options);
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
  if (options.rubyMethod !== undefined) {
    styleOptions.rubyMethod = options.rubyMethod;
  }
  if (options.spacing !== undefined) {
    styleOptions.spacing = options.spacing;
  }
  return getDefaultStyles(styleOptions);
}
