const CSS_RESET = `*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; padding: 16px; }`;

/**
 * Wraps renderer HTML and CSS output into a self-contained HTML page.
 */
export function buildHTMLPage(html: string, css: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
${CSS_RESET}
${css}
</style>
</head>
<body>
${html}
</body>
</html>`;
}
