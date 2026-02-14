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
 * - 'ruby': HTML ruby要素を使用（デフォルト）
 * - 'grid': inline-grid で代替レンダリング
 */
export type RubyMethod = 'ruby' | 'grid';

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
  okimoji: boolean;
  joji: boolean;
  soegana: boolean;
  highlight: boolean;
  ref: boolean;
}

/**
 * コピー可能にする要素の種類
 */
export type CopyableElement = 'ruby' | 'okurigana' | 'soegana' | 'kaeriten' | 'okototen';

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
  okimoji: true,
  joji: true,
  soegana: true,
  highlight: true,
  ref: true,
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
  okimoji: true,
  joji: true,
  soegana: false,
  highlight: true,
  ref: true,
};

/** 学習用ヒント付きプロファイル（返り点+送り仮名+再読文字） */
const LEARNING_HINT_PROFILE: RenderProfile = {
  yomigana: false,
  okurigana: true,
  kaeriten: true,
  kutoten: true,
  saidoku: true,
  okototen: false,
  tateten: false,
  emphasis: false,
  okimoji: true,
  joji: true,
  soegana: true,
  highlight: true,
  ref: true,
};

/**
 * プリセットプロファイル
 */
export const PROFILES = {
  full: FULL_PROFILE,
  learningBasic: LEARNING_BASIC_PROFILE,
  learningHint: LEARNING_HINT_PROFILE,
} as const;
