/**
 * 読み上げ層の文字列を作る純粋関数 (readingLayerSource: 'display')。
 *
 * 表示層と同じ解決済みの profile から AIR を作り直し、その AIR だけから文字列を導く。
 * doc.readings も白文も参照しない。
 */

import type { SKAMDocument } from '@kanbun-skam/skam';
import {
  DEFAULT_ACCESSIBLE_LABELS,
  buildAnnotationIR,
  describeAnnotationIR,
  formatAccessibleText,
  type AIRDocument,
  type AccessibleLabels,
  type RenderExtensionOptions,
  type RenderProfile,
} from '@kanbun-skam/skam/rendering';
import { escapeHtml } from './html-utils.js';

const LABEL_KINDS: ReadonlySet<string> = new Set(Object.keys(DEFAULT_ACCESSIBLE_LABELS));

function isPlainObject(value: object): boolean {
  if (Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * accessibleLabels を検証して、凍結したコピーに正規化する。
 *
 * 検証と正規化を兼ねる。render はこの戻り値だけを描画に使い、元の object を読み直さない
 * (検証した後に利用者が書き換えても、検証していない値を使わないため)。
 * 各キーは 1 回だけ読む。プロトタイプが null の凍結した object を返すので、継承したキーは引かれない。
 * エラーのメッセージに、渡された値は含めない。
 */
export function normalizeAccessibleLabels(
  value: unknown
): Readonly<Partial<AccessibleLabels>> | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || !isPlainObject(value)) {
    throw new TypeError('accessibleLabels must be a plain object');
  }
  const source = value as Record<string, unknown>;
  const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    if (!LABEL_KINDS.has(key)) {
      throw new TypeError('accessibleLabels must only have keys of known note kinds');
    }
    const label = source[key];
    if (typeof label !== 'function') {
      throw new TypeError('accessibleLabels values must be functions');
    }
    copy[key] = label;
  }
  return Object.freeze(copy) as Readonly<Partial<AccessibleLabels>>;
}

/** AIR から、生の読み上げテキストを作る (HTML のエスケープはしない) */
export function formatReadingText(
  air: AIRDocument,
  labels: Partial<AccessibleLabels> | undefined
): string {
  return formatAccessibleText(describeAnnotationIR(air), labels);
}

/** 文書と解決済みの profile から、生の読み上げテキストを作る */
export function buildReadingText(
  doc: SKAMDocument,
  profile: RenderProfile,
  labels: Partial<AccessibleLabels> | undefined,
  extensions?: RenderExtensionOptions
): string {
  return formatReadingText(buildAnnotationIR(doc, profile, extensions), labels);
}

/**
 * 読み上げ層の要素。文字列が空なら要素を出さない。文字列は escapeHtml を 1 回通す。
 * `lang` は呼び出し側が isLanguageTag に通した値だけを渡す (形を縛った値なので escape しない)
 */
export function renderReadingLayerElement(
  text: string,
  prefix: string,
  inline: boolean,
  lang?: string
): string {
  if (!text) return '';
  const tag = inline ? 'span' : 'div';
  const langAttr = lang === undefined ? '' : ` lang="${lang}"`;
  return `<${tag} class="${prefix}-reading"${langAttr}>${escapeHtml(text)}</${tag}>`;
}
