/**
 * SKAM HTML Renderer
 *
 * SKAMドキュメントから静的HTMLを生成する
 */

import type { SKAMDocument, Mark, RefMark, Reading } from '@kanbun-skam/skam';
import {
  resolveExtensions,
  type HideQuizOption,
  type SKAMExtensionDefinition,
} from '@kanbun-skam/skam/extensions';
import type {
  AccessibleLabels,
  RenderExtensionOptions,
  Spacing,
} from '@kanbun-skam/skam/rendering';
import { groupTokensByBlock, resolveRefValues } from '@kanbun-skam/skam/rendering';
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
import { validateCSSOptions, normalizeRenderOptions } from './render-options.js';
import { buildReadingText, renderReadingLayerElement } from './reading-text.js';

export type { RenderProfileInput, RubyMethod, CopyableElement } from './render-config.js';

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
  /**
   * 読み上げ層の出どころ（experimental）
   *
   * - 'readings'（既定）: 作者が書いた読み下し（`doc.readings`）。無ければ白文。表示設定で隠した注記も読み上げる
   * - 'display': 表示層と同じ profile で解決した、画面に見えている注記だけを言葉にする。
   *   `doc.readings` も白文も参照しない。注記を隠す用途（出題など）ではこちらを使う
   *
   * 不正な値は TypeError。
   *
   * @experimental
   */
  readingLayerSource?: 'readings' | 'display';
  /**
   * 読み上げの言葉の上書き（experimental）。`readingLayerSource: 'display'` のときだけ使う
   *
   * 注記の種類ごとの `(note) => string`。空文字・例外・string 以外を返した注記は読み上げない。
   * 返した文字列は HTML エスケープされる。キーは own property だけが有効で、未知のキーは TypeError。
   * 読み上げの言葉は 0.x の minor で変わりうる。
   *
   * @experimental
   */
  accessibleLabels?: Partial<AccessibleLabels>;
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
  /**
   * style 属性を出すか (default: true)
   *
   * false にすると HTML に style 属性を 1 つも出さず、ヲコト点の位置と傍点の形を data 属性で持つ。
   * 値は DOM に入れた後に `applyRenderedStyles` で CSSOM に設定する (呼ばないと崩れる)。
   * `style-src` が nonce だけのページで、インラインの style 属性が CSP に止められるときに使う。
   * `mount` は常に false で描く。真偽値でない値は TypeError。
   *
   * @experimental
   */
  inlineStyles?: boolean;
  /**
   * 出題の印 (学習・教育用拡張の `ext.edu.quiz`) の付いた注記を隠す (experimental)
   *
   * - `true`: 印の付いた注記をすべて隠す
   * - 名前の配列: 問いの名前がその中にある印の注記を隠す
   *
   * 隠した注記は占める場所を残し、中身を 1 字ずつ空白に置き換える (字数は空白の数から分かる)。
   * 文書が `extensions` に `edu` を挙げているときだけ効く。隠すのは表示の制御で、秘匿ではない:
   * 文書そのものと、`readingLayerSource: 'readings'` を明示した読み上げ層には答えが残る。
   * 渡して `readingLayerSource` を書かないときは、読み上げ層も `'display'` にする。
   * 不正な値は TypeError。
   *
   * @experimental
   */
  hideQuiz?: HideQuizOption;
  /** 既定の束 (`@kanbun-skam/skam/extensions`) に足す拡張の定義。名前が束と重なれば TypeError @experimental */
  extensions?: readonly SKAMExtensionDefinition[];
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
  /**
   * 読み上げ層の出どころ（experimental）
   *
   * - 'readings'（既定）: 作者が書いた読み下し（`doc.readings`）。無ければ白文。表示設定で隠した注記も読み上げる
   * - 'display': 表示層と同じ profile で解決した、画面に見えている注記だけを言葉にする。
   *   `doc.readings` も白文も参照しない。注記を隠す用途（出題など）ではこちらを使う
   *
   * 不正な値は TypeError。
   *
   * @experimental
   */
  readingLayerSource?: 'readings' | 'display';
  /**
   * 読み上げの言葉の上書き（experimental）。`readingLayerSource: 'display'` のときだけ使う
   *
   * 注記の種類ごとの `(note) => string`。空文字・例外・string 以外を返した注記は読み上げない。
   * 返した文字列は HTML エスケープされる。キーは own property だけが有効で、未知のキーは TypeError。
   * 読み上げの言葉は 0.x の minor で変わりうる。
   *
   * @experimental
   */
  accessibleLabels?: Partial<AccessibleLabels>;
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
  /** style 属性を出すか (default: true)。`RenderOptions.inlineStyles` を参照 @experimental */
  inlineStyles?: boolean;
  /**
   * 出題の印 (学習・教育用拡張の `ext.edu.quiz`) の付いた注記を隠す (experimental)
   *
   * - `true`: 印の付いた注記をすべて隠す
   * - 名前の配列: 問いの名前がその中にある印の注記を隠す
   *
   * 隠した注記は占める場所を残し、中身を 1 字ずつ空白に置き換える (字数は空白の数から分かる)。
   * 文書が `extensions` に `edu` を挙げているときだけ効く。隠すのは表示の制御で、秘匿ではない:
   * 文書そのものと、`readingLayerSource: 'readings'` を明示した読み上げ層には答えが残る。
   * 渡して `readingLayerSource` を書かないときは、読み上げ層も `'display'` にする。
   * 不正な値は TypeError。
   *
   * @experimental
   */
  hideQuiz?: HideQuizOption;
  /** 既定の束 (`@kanbun-skam/skam/extensions`) に足す拡張の定義。名前が束と重なれば TypeError @experimental */
  extensions?: readonly SKAMExtensionDefinition[];
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
// getBlockStartMarks: moved to @kanbun-skam/skam/rendering

// Token rendering: moved to token-renderer.ts

// ============================================================================
// Document Rendering
// ============================================================================

// Display layer orchestration: moved to render-display-layer.ts

/**
 * 作者が書いた読み (yomiage → kakikudashi)。無ければ白文 (原文順の本文)。
 * 白文はブロックごとに連結し、空でないブロックを半角空白で区切る ('display' の区切りと同じ)
 */
function getReadingsText(doc: SKAMDocument): string {
  const usable = (kind: Reading['kind']): string | undefined => {
    const text = doc.readings.find((r) => r.kind === kind)?.text;
    return text !== undefined && text.trim() !== '' ? text : undefined;
  };

  return (
    usable('yomiage') ??
    usable('kakikudashi') ??
    groupTokensByBlock(doc.blocks, doc.tokens)
      .map((group) => group.tokens.map((t) => t.text).join(''))
      .filter((blockText) => blockText !== '')
      .join(' ')
  );
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

/** 拡張が決める「隠す所」の判定に渡すもの。hideQuiz は学習・教育用拡張 (edu) の選択肢 */
function extensionRenderOptions(options: RenderHTMLOptions): RenderExtensionOptions {
  return {
    extensions: [...resolveExtensions(options.extensions).values()],
    ...(options.hideQuiz !== undefined
      ? { extensionOptions: { edu: { hideQuiz: options.hideQuiz } } }
      : {}),
  };
}

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

  const extensionRender = extensionRenderOptions(options);

  // Display層
  const displayResult = renderDisplayLayer(
    doc,
    prefix,
    profile,
    inline,
    interactive,
    rubyMethod,
    options.inlineStyles ?? true,
    extensionRender
  );
  const displayTag = inline ? 'span' : 'div';
  const displayHtml = `<${displayTag} class="${prefix}-display" lang="${displayLang}" aria-hidden="true">${displayResult.tokens}</${displayTag}>`;

  // 読み層。'display' は表示層と同じ profile から作り、doc.readings も白文も参照しない
  // hideQuiz を渡して読み上げ層の出どころを書かないときは、答えを含む readings ではなく表示層から作る
  const readingSource =
    options.readingLayerSource ?? (options.hideQuiz !== undefined ? 'display' : 'readings');
  const readingText =
    readingSource === 'display'
      ? buildReadingText(doc, profile, options.accessibleLabels, extensionRender)
      : getReadingsText(doc);
  const readingHtml = includeReadingLayer
    ? renderReadingLayerElement(readingText, prefix, inline)
    : '';

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
export function render(doc: SKAMDocument, rawOptions: RenderOptions = {}): RenderResult {
  // 入口でオプションを 1 回だけ読み、検査した値だけを以降に使う
  const options = normalizeRenderOptions(rawOptions);
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
export function renderHTML(doc: SKAMDocument, rawOptions: RenderHTMLOptions = {}): string {
  return renderDocumentHtml(doc, normalizeRenderOptions(rawOptions)).html;
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
