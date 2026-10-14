/**
 * HTML属性 → RenderOptions 変換ユーティリティ
 */

import { PROFILES, validateRenderOptions } from '@kanbun-skam/skam-html-renderer';
import type {
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

export function parseProfile(value: string | null): Partial<RenderProfile> | undefined {
  if (value == null) return undefined;

  // Check preset names first
  const preset = (PROFILES as Record<string, RenderProfile>)[value];
  if (preset) return preset;

  // Try JSON parse
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Partial<RenderProfile>;
    }
  } catch {
    // Invalid JSON, ignore
  }

  return undefined;
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

export interface AttributeValues {
  'writing-mode': string | null;
  profile: string | null;
  inline: string | null;
  'include-reading-layer': string | null;
  copyable: string | null;
  'class-prefix': string | null;
  /** 任意。省略は null と同じ (export 済みの型なので既存の利用者を壊さない) */
  'display-lang'?: string | null;
}

export interface InvalidAttribute {
  attribute: string;
  error: TypeError;
}

export interface BuiltRenderOptions {
  options: RenderOptions;
  /** 検証を通らず既定値に戻した属性。class-prefix → display-lang の固定順 */
  invalid: InvalidAttribute[];
}

/** html-renderer の検証規則をそのまま使い、1 つの属性だけを検査する */
function checkAttribute(attribute: string, probe: RenderOptions): InvalidAttribute | undefined {
  try {
    validateRenderOptions(probe);
    return undefined;
  } catch (error) {
    return {
      attribute,
      error: error instanceof TypeError ? error : new TypeError(String(error)),
    };
  }
}

export function buildRenderOptions(attrs: AttributeValues): BuiltRenderOptions {
  const options: RenderOptions = {
    writingMode: parseWritingMode(attrs['writing-mode']),
    useLayer: false, // Shadow DOM doesn't need @layer
  };

  const profile = parseProfile(attrs.profile);
  if (profile) {
    options.profile = profile;
  }

  if (parseBooleanAttr(attrs.inline)) {
    options.inline = true;
  }

  // include-reading-layer defaults to true when absent
  if (attrs['include-reading-layer'] === null) {
    options.includeReadingLayer = true;
  } else {
    // Present but set to "false" explicitly
    options.includeReadingLayer = attrs['include-reading-layer'] !== 'false';
  }

  const copyable = parseCopyable(attrs.copyable);
  if (copyable) {
    options.copyable = copyable;
  }

  const invalid: InvalidAttribute[] = [];

  const classPrefix = attrs['class-prefix'];
  if (classPrefix != null) {
    const problem = checkAttribute('class-prefix', { classPrefix });
    if (problem) invalid.push(problem);
    else options.classPrefix = classPrefix;
  }

  const displayLang = attrs['display-lang'];
  if (displayLang != null) {
    const problem = checkAttribute('display-lang', { displayLang });
    if (problem) invalid.push(problem);
    else options.displayLang = displayLang;
  }

  return { options, invalid };
}
