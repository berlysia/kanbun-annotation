/**
 * SKAM HTML Renderer - オプション検証
 *
 * 基盤層。公開 API の入口 (render / renderHTML / generateCSS / getDefaultStyles / calibrateGridBaseline) で
 * 呼び出し側が渡す値を検査する。値は属性・CSS・セレクタに補間されるため、許可する形に絞る。
 *
 * 違反は TypeError にする。メッセージにはオプション名と規則だけを含め、渡された値や許可される値の一覧は
 * 含めない (エラーメッセージが innerHTML に入れられても注入にならないように)。
 */

import type { SpacingPreset } from '@kanbun-skam/skam/rendering';
import type { CopyableElement, RubyMethod } from './render-config.js';
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

/** render / renderHTML のオプションを検査する。render は CSS も作るので CSS 用のオプションも含む */
export function validateRenderOptions(o: RenderOptions): void {
  check(o.writingMode, (v) => assertWritingMode(v, false));
  check(o.classPrefix, assertClassPrefix);
  check(o.layerName, assertLayerName);
  check(o.variablePrefix, assertVariablePrefix);
  check(o.copyable, assertCopyable);
  check(o.rubyMethod, (v) => assertRubyMethod(v, false));
  check(o.spacing, assertSpacing);
  check(o.displayLang, assertDisplayLang);
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
