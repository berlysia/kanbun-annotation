/**
 * HTML属性 → RenderOptions 変換ユーティリティ
 */

import {
  PROFILES,
  assertHideQuizOption,
  resolveRenderProfile,
  validateRenderOptions,
} from '@kanbun-skam/skam-html-renderer';
import type {
  HideQuizOption,
  RenderOptions,
  RenderProfile,
  CopyableElement,
} from '@kanbun-skam/skam-html-renderer';

const VALID_WRITING_MODES = ['vertical', 'horizontal'] as const;
const VALID_COPYABLE_ELEMENTS = ['ruby', 'okurigana', 'soegana', 'kaeriten', 'okototen'] as const;

export function parseWritingMode(value: string | null): 'vertical' | 'horizontal' {
  if (value != null && (VALID_WRITING_MODES as readonly string[]).includes(value)) {
    return value as 'vertical' | 'horizontal';
  }
  return 'vertical';
}

const MAX_ECHO = 64;

/**
 * profile 属性を解決する。プリセット名か JSON を受け付け、不正なら TypeError を投げる。
 * 属性が無い (null) ときは呼ばない。空文字・null・配列・数値は不正で、full には落とさない。
 */
export function resolveProfileAttribute(value: string): RenderProfile {
  if (Object.hasOwn(PROFILES, value)) {
    return resolveRenderProfile({ base: value });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new TypeError(
      `profile must be a preset name or a JSON object (got ${JSON.stringify(value.slice(0, MAX_ECHO))})`
    );
  }
  return resolveRenderProfile(parsed);
}

export function parseBooleanAttr(value: string | null): boolean {
  // HTML boolean attribute: present = true, absent (null) = false
  return value !== null;
}

export function parseCopyable(value: string | null): CopyableElement[] | 'all' | undefined {
  if (value == null) return undefined;
  if (value === 'all') return 'all';

  const elements = value
    .split(/\s+/)
    .filter((v): v is CopyableElement =>
      (VALID_COPYABLE_ELEMENTS as readonly string[]).includes(v)
    );
  return elements.length > 0 ? elements : undefined;
}

function findUnknownCopyable(value: string | null): string | undefined {
  if (value == null || value === 'all') return undefined;
  return value
    .split(/\s+/)
    .find((v) => v !== '' && !(VALID_COPYABLE_ELEMENTS as readonly string[]).includes(v));
}

export interface AttributeValues {
  'writing-mode': string | null;
  profile: string | null;
  inline: string | null;
  'include-reading-layer': string | null;
  copyable: string | null;
  'class-prefix': string | null;
  /** 任意。省略は null と同じ (export 済みの型なので既存の利用者を壊さない) */
  'display-lang'?: string | null;
  /**
   * 任意。省略は null と同じ (readings)。`readings` / `display` 以外は不正で、描画しない。
   *
   * @experimental
   */
  'reading-layer-source'?: string | null;
  /**
   * 任意。省略は null と同じ (隠さない)。空の値はすべて隠し、それ以外は JSON (名前の配列) として読む。
   * 不正な値は描画しない。
   *
   * @experimental
   */
  'hide-quiz'?: string | null;
}

export interface InvalidAttribute {
  attribute: string;
  error: TypeError;
}

export interface BuiltRenderOptions {
  options: RenderOptions;
  /** 検証を通らず既定値に戻した属性 (描画は続ける)。writing-mode → copyable → class-prefix → display-lang の固定順 */
  invalid: InvalidAttribute[];
  /**
   * 注記を隠すための属性で、不正なもの。既定値に戻すと隠すつもりの注記が見える側に倒れるので、
   * 描画しない (fail closed)。profile → include-reading-layer → reading-layer-source → hide-quiz の固定順。
   */
  blocked: InvalidAttribute[];
}

/** html-renderer の検証規則をそのまま使い、1 つの属性だけを検査する */
function checkAttribute(attribute: string, probe: RenderOptions): InvalidAttribute | undefined {
  try {
    validateRenderOptions(probe);
    return undefined;
  } catch (error) {
    return { attribute, error: toTypeError(error) };
  }
}

function toTypeError(error: unknown): TypeError {
  return error instanceof TypeError ? error : new TypeError(String(error));
}

/** 属性が真偽値の書き方か。"true" / "false" / 空文字 (属性の存在) だけを受け付ける */
function parseReadingLayerFlag(value: string): boolean {
  if (value === '' || value === 'true') return true;
  if (value === 'false') return false;
  throw new TypeError(
    `include-reading-layer must be "true", "false" or empty (got ${JSON.stringify(value.slice(0, MAX_ECHO))})`
  );
}

/** reading-layer-source 属性を解決する。属性が無い (null) ときは呼ばない。空文字は不正 */
function parseReadingLayerSource(value: string): 'readings' | 'display' {
  if (value === 'readings' || value === 'display') return value;
  throw new TypeError('reading-layer-source must be "readings" or "display"');
}

/**
 * hide-quiz 属性を解決する。属性が無い (null) ときは呼ばない。
 * 空の値は「すべて隠す」(true)、それ以外は JSON として読み、html-renderer の検査に通す。
 * エラーのメッセージに属性の値は含めない
 */
function parseHideQuiz(value: string): HideQuizOption {
  if (value === '') return true;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new TypeError('hide-quiz must be empty or a JSON array of quiz names');
  }
  const checked = assertHideQuizOption(parsed);
  if (checked === undefined) {
    throw new TypeError('hide-quiz must be empty or a JSON array of quiz names');
  }
  return checked;
}

function applyHiddenAnnotationAttributes(
  attrs: AttributeValues,
  options: RenderOptions,
  blocked: InvalidAttribute[]
): void {
  if (attrs.profile !== null) {
    try {
      options.profile = resolveProfileAttribute(attrs.profile);
    } catch (error) {
      blocked.push({ attribute: 'profile', error: toTypeError(error) });
    }
  }

  const readingLayer = attrs['include-reading-layer'];
  if (readingLayer === null) {
    options.includeReadingLayer = true;
  } else {
    try {
      options.includeReadingLayer = parseReadingLayerFlag(readingLayer);
    } catch (error) {
      blocked.push({ attribute: 'include-reading-layer', error: toTypeError(error) });
    }
  }

  const readingLayerSource = attrs['reading-layer-source'] ?? null;
  if (readingLayerSource !== null) {
    try {
      options.readingLayerSource = parseReadingLayerSource(readingLayerSource);
    } catch (error) {
      blocked.push({ attribute: 'reading-layer-source', error: toTypeError(error) });
    }
  }

  const hideQuiz = attrs['hide-quiz'] ?? null;
  if (hideQuiz !== null) {
    try {
      options.hideQuiz = parseHideQuiz(hideQuiz);
    } catch (error) {
      blocked.push({ attribute: 'hide-quiz', error: toTypeError(error) });
    }
  }
}

function checkWritingModeAndCopyable(attrs: AttributeValues): InvalidAttribute[] {
  const invalid: InvalidAttribute[] = [];
  const writingMode = attrs['writing-mode'];
  if (writingMode !== null && !(VALID_WRITING_MODES as readonly string[]).includes(writingMode)) {
    invalid.push({
      attribute: 'writing-mode',
      error: new TypeError('writing-mode must be "vertical" or "horizontal"'),
    });
  }
  if (findUnknownCopyable(attrs.copyable) !== undefined) {
    invalid.push({
      attribute: 'copyable',
      error: new TypeError(
        'copyable must be "all" or a space-separated list of known element names'
      ),
    });
  }
  return invalid;
}

export function buildRenderOptions(attrs: AttributeValues): BuiltRenderOptions {
  const options: RenderOptions = {
    writingMode: parseWritingMode(attrs['writing-mode']),
    useLayer: false, // Shadow DOM doesn't need @layer
  };

  if (parseBooleanAttr(attrs.inline)) {
    options.inline = true;
  }

  const blocked: InvalidAttribute[] = [];
  applyHiddenAnnotationAttributes(attrs, options, blocked);

  const copyable = parseCopyable(attrs.copyable);
  if (copyable) {
    options.copyable = copyable;
  }

  const invalid = checkWritingModeAndCopyable(attrs);

  const classPrefix = attrs['class-prefix'];
  if (classPrefix != null) {
    const problem = checkAttribute('class-prefix', { classPrefix });
    if (problem) invalid.push(problem);
    else {
      // 変数名 (--{prefix}-*) もクラス名と同じ値に揃える。CLASS_PREFIX の検証は共通
      options.classPrefix = classPrefix;
      options.variablePrefix = classPrefix;
    }
  }

  const displayLang = attrs['display-lang'];
  if (displayLang != null) {
    const problem = checkAttribute('display-lang', { displayLang });
    if (problem) invalid.push(problem);
    else options.displayLang = displayLang;
  }

  return { options, invalid, blocked };
}
