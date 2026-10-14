/**
 * 傍線スタイルの許可リスト。
 * validator・parser・renderer が同じ値を共有する。依存を持たない葉のファイルにして、import の循環を避ける。
 */
export const HIGHLIGHT_STYLES = ['solid', 'dotted', 'dashed', 'wavy', 'double'] as const;

/** 傍線スタイル（CSS text-decoration-style 準拠） */
export type HighlightStyle = (typeof HIGHLIGHT_STYLES)[number];

export function isValidHighlightStyle(v: unknown): v is HighlightStyle {
  return typeof v === 'string' && (HIGHLIGHT_STYLES as readonly string[]).includes(v);
}
