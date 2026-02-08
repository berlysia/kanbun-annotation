/**
 * 傍点スタイル解決
 */

/**
 * CSS text-emphasis-style 値から対応する Unicode 傍点文字を解決。
 * EmphasisMark.style（省略時は 'filled dot'）を受け取る。
 */
export function resolveEmphasisCharacter(style?: string): string {
  if (!style) return '\u2022'; // default: filled dot
  const s = style.trim().toLowerCase();
  const open = s.includes('open');

  if (s.includes('sesame')) return open ? '\uFE46' : '\uFE45';
  if (s.includes('double-circle')) return open ? '\u25CE' : '\u25C9';
  if (s.includes('circle')) return open ? '\u25CB' : '\u25CF';
  if (s.includes('triangle')) return open ? '\u25B3' : '\u25B2';
  // 'dot' or default
  return open ? '\u25E6' : '\u2022';
}
