/**
 * アキ組み（字間スペーシング）の共有型定義とユーティリティ。
 * HTML レンダラー（CSS letter-spacing）と Canvas レンダラー（ピクセル計算）の両方で使用。
 */

/** アキ組みプリセット名 */
export type SpacingPreset = 'solid' | 'quarter' | 'half';

/**
 * アキ組み指定
 *
 * - 'solid': ベタ組み（アキなし）
 * - 'quarter': 四分アキ（0.25em）
 * - 'half': 二分アキ（0.5em）
 * - number: 任意の em 値（0以上、負の値は0にクランプ）
 */
export type Spacing = SpacingPreset | number;

/** プリセットの em 値マッピング */
const SPACING_EM: Record<SpacingPreset, number> = {
  solid: 0,
  quarter: 0.25,
  half: 0.5,
};

/**
 * Spacing 指定を em 値に解決する。
 * 負の数値は 0 にクランプされる。
 */
export function resolveSpacingEm(spacing: Spacing | undefined): number {
  if (spacing === undefined) return 0;
  return typeof spacing === 'number' ? Math.max(0, spacing) : SPACING_EM[spacing];
}
