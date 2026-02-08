const PADDING = 32;

const CSS_RESET = `*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  padding: ${PADDING}px;
  font-size: 32px;
}
#skam-root {
  width: fit-content;
}`;

/**
 * Wraps renderer HTML and CSS output into a self-contained HTML page.
 * Uses a #skam-root wrapper for content measurement during screenshot capture.
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
<div id="skam-root">${html}</div>
</body>
</html>`;
}

/** Body padding in px, exported for viewport fitting calculation */
export { PADDING };
