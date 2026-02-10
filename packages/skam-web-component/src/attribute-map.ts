/**
 * HTML属性 → RenderOptions 変換ユーティリティ
 */

import { PROFILES } from '@kanbun/skam-html-renderer';
import type { RenderOptions, RenderProfile, CopyableElement } from '@kanbun/skam-html-renderer';

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
  interactive: string | null;
  'include-reading-layer': string | null;
  copyable: string | null;
  'class-prefix': string | null;
}

export function buildRenderOptions(attrs: AttributeValues): RenderOptions {
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

  if (parseBooleanAttr(attrs.interactive)) {
    options.interactive = true;
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

  if (attrs['class-prefix'] != null) {
    options.classPrefix = attrs['class-prefix'];
  }

  return options;
}
