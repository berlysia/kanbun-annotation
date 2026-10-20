/**
 * SKAM HTML Renderer - オプション検証
 *
 * 基盤層。公開 API の入口 (render / renderHTML / generateCSS / getDefaultStyles / calibrateGridBaseline) で
 * 呼び出し側が渡す値を検査する。値は属性・CSS・セレクタに補間されるため、許可する形に絞る。
 *
 * 違反は TypeError にする。メッセージにはオプション名と規則だけを含め、渡された値や許可される値の一覧は
 * 含めない (エラーメッセージが innerHTML に入れられても注入にならないように)。
 * 例外は profile の検査 (resolveRenderProfile)。未知のキー名と、64 文字に切り詰めた値をメッセージに含める。
 * 綴りを間違えたキー名を作者が直せるようにするためで、他のオプションとは別に決めている。
 */

import type { SpacingPreset } from '@kanbun-skam/skam/rendering';
import type { CopyableElement, RubyMethod } from './render-config.js';
import { resolveRenderProfile } from './render-config.js';
import { normalizeAccessibleLabels } from './reading-text.js';
import type { RenderOptions } from './renderer.js';
import type { StyleOptions } from './styles.js';

const CLASS_PREFIX = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const LAYER_NAME = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const DISPLAY_LANG = /^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/;

// Record にして、型に値が増えたときにコンパイルエラーで気づけるようにする
const COPYABLE_ELEMENTS: Record<CopyableElement, true> = {
  ruby: true,
  okurigana: true,
  soegana: true,
  kaeriten: true,
  okototen: true,
};
const SPACING_PRESETS: Record<SpacingPreset, true> = {
  solid: true,
  quarter: true,
  half: true,
  full: true,
};
const RUBY_METHODS: Record<RubyMethod, true> = { ruby: true, grid: true };

const has = (table: Record<string, true>, v: string): boolean => Object.hasOwn(table, v);

// 文字列のオプションは、照合の前に typeof で絞る。RegExp.test は値を文字列に変換して照合するため、
// toString を持つオブジェクトが検査時と使用時で別の値を返すと、検査をすり抜けうる。
function assertPattern(name: string, v: unknown, pattern: RegExp): void {
  if (typeof v !== 'string' || !pattern.test(v)) {
    throw new TypeError(`${name} must match ${pattern}`);
  }
}

export function assertClassPrefix(v: unknown): void {
  assertPattern('classPrefix', v, CLASS_PREFIX);
}

export function assertVariablePrefix(v: unknown): void {
  assertPattern('variablePrefix', v, CLASS_PREFIX);
}

export function assertLayerName(v: unknown): void {
  assertPattern('layerName', v, LAYER_NAME);
}

export function assertDisplayLang(v: unknown): void {
  assertPattern('displayLang', v, DISPLAY_LANG);
}

export function assertCopyable(v: unknown): void {
  if (v === 'all') return;
  if (!Array.isArray(v) || !v.every((e) => typeof e === 'string' && has(COPYABLE_ELEMENTS, e))) {
    throw new TypeError('copyable must be "all" or an array of known element names');
  }
}

export function assertSpacing(v: unknown): void {
  if (typeof v === 'string' && has(SPACING_PRESETS, v)) return;
  if (typeof v === 'number' && Number.isFinite(v)) return;
  throw new TypeError('spacing must be a known preset name or a finite number');
}

function assertWritingMode(v: unknown, allowBoth: boolean): void {
  if (v === 'vertical' || v === 'horizontal' || (allowBoth && v === 'both')) return;
  throw new TypeError('writingMode must be a known writing mode');
}

function assertRubyMethod(v: unknown, allowBoth: boolean): void {
  if ((typeof v === 'string' && has(RUBY_METHODS, v)) || (allowBoth && v === 'both')) return;
  throw new TypeError('rubyMethod must be a known ruby method');
}

/** 値が undefined のキーは「指定なし」として飛ばす (web-component が未設定の属性を undefined で渡しうる) */
function check<T>(v: T | undefined, assert: (v: unknown) => void): void {
  if (v !== undefined) assert(v);
}

/** includeReadingLayer は指定されていれば真偽値。'false' のような文字列は truthy として通ってしまうため */
function assertIncludeReadingLayer(v: unknown): void {
  if (typeof v !== 'boolean') {
    throw new TypeError('includeReadingLayer must be a boolean');
  }
}

function assertInlineStyles(v: unknown): void {
  if (typeof v !== 'boolean') {
    throw new TypeError('inlineStyles must be a boolean');
  }
}

function assertReadingLayerSource(v: unknown): void {
  if (v !== 'readings' && v !== 'display') {
    throw new TypeError('readingLayerSource must be a known reading layer source');
  }
}

const RENDER_OPTION_KEYS = [
  'profile',
  'writingMode',
  'classPrefix',
  'includeReadingLayer',
  'inline',
  'useLayer',
  'layerName',
  'variablePrefix',
  'copyable',
  'interactive',
  'rubyMethod',
  'spacing',
  'displayLang',
  'readingLayerSource',
  'accessibleLabels',
  'inlineStyles',
] as const satisfies readonly (keyof RenderOptions)[];

/**
 * 入口でオプションを 1 回だけ読む。getter を持つ object でも、検査した値と使う値が一致する。
 * undefined のキーは「指定なし」として落とす。
 */
function snapshotRenderOptions(o: RenderOptions): RenderOptions {
  const snapshot: Record<string, unknown> = {};
  for (const key of RENDER_OPTION_KEYS) {
    const value: unknown = o[key];
    if (value !== undefined) snapshot[key] = value;
  }
  return snapshot as RenderOptions;
}

/**
 * render / renderHTML の入口で使う、検証と正規化。
 *
 * 検査を通った値だけを持つ新しい options を返す。profile は解決済みの値、accessibleLabels は
 * 凍結したコピーに置き換える。描画はこの戻り値だけを使い、渡された object を読み直さない。
 * render は CSS も作るので CSS 用のオプションも検査する。
 */
export function normalizeRenderOptions(options: RenderOptions): RenderOptions {
  const o = snapshotRenderOptions(options);
  if (o.profile !== undefined) o.profile = resolveRenderProfile(o.profile);
  check(o.includeReadingLayer, assertIncludeReadingLayer);
  check(o.writingMode, (v) => assertWritingMode(v, false));
  check(o.classPrefix, assertClassPrefix);
  check(o.layerName, assertLayerName);
  check(o.variablePrefix, assertVariablePrefix);
  check(o.copyable, assertCopyable);
  check(o.rubyMethod, (v) => assertRubyMethod(v, false));
  check(o.spacing, assertSpacing);
  check(o.displayLang, assertDisplayLang);
  check(o.readingLayerSource, assertReadingLayerSource);
  check(o.inlineStyles, assertInlineStyles);
  const labels = normalizeAccessibleLabels(o.accessibleLabels);
  if (labels !== undefined) o.accessibleLabels = labels;
  return o;
}

/**
 * render / renderHTML のオプションを検査する。render は CSS も作るので CSS 用のオプションも含む。
 *
 * `render` は内部で同じ検証をするので、事前に呼ぶ必要はない。呼んだ場合、`accessibleLabels` の getter は
 * 2 回読まれる (この関数で 1 回、`render` で 1 回)。
 */
export function validateRenderOptions(o: RenderOptions): void {
  normalizeRenderOptions(o);
}

/** generateCSS / getDefaultStyles のオプションを検査する。writingMode / rubyMethod は 'both' も許す */
export function validateCSSOptions(o: StyleOptions): void {
  check(o.writingMode, (v) => assertWritingMode(v, true));
  check(o.classPrefix, assertClassPrefix);
  check(o.layerName, assertLayerName);
  check(o.variablePrefix, assertVariablePrefix);
  check(o.rubyMethod, (v) => assertRubyMethod(v, true));
  check(o.spacing, assertSpacing);
}
