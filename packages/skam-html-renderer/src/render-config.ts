/**
 * SKAM HTML Renderer - Configuration Types & Presets
 *
 * 基盤層: 他の内部モジュールから参照される型・定数。
 * renderer.ts (API層) を参照しない。
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Ruby要素のレンダリング方式
 *
 * - 'ruby': HTML ruby要素を使用
 * - 'grid': inline-grid で代替レンダリング（デフォルト）
 */
export type RubyMethod = 'ruby' | 'grid';

/**
 * コピー可能にする要素の種類
 */
export type CopyableElement = 'ruby' | 'okurigana' | 'soegana' | 'kaeriten' | 'okototen';

// ============================================================================
// Profiles (skam/rendering に一本化。ここは別名の再 export)
// ============================================================================

export {
  RENDER_PROFILES as PROFILES,
  RENDER_PROFILE_KEYS,
  SKAMRenderProfileError,
  resolveRenderProfile,
  type RenderProfile,
  type RenderProfileErrorKind,
  type RenderProfileInput,
  type RenderProfileKey,
  type RenderProfileName,
} from '@kanbun-skam/skam/rendering';
