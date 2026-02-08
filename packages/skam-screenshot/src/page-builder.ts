const PADDING = 32;

// Noto Serif JP — high-quality serif font for kanbun rendering
const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700&display=swap';

const FONT_STACK = `"Noto Serif JP", "Yu Mincho", "Hiragino Mincho ProN", serif`;

const CSS_RESET = `*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  padding: ${PADDING}px;
  font-size: 32px;
  font-family: ${FONT_STACK};
}
#skam-root {
  width: fit-content;
}`;

/**
 * Wraps renderer HTML and CSS output into a self-contained HTML page.
 * Loads Noto Serif JP from Google Fonts for quality CJK rendering.
 * Uses a #skam-root wrapper for content measurement during screenshot capture.
 */
export function buildHTMLPage(html: string, css: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${GOOGLE_FONTS_URL}">
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
