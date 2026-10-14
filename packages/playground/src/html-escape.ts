/**
 * Escapes text for interpolation into innerHTML.
 * Output matches the html-renderer's escaper (`'` becomes `&#x27;`) so the playground has a single convention.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
