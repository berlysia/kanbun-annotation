import type { Browser, CompareHTMLOptions } from './types.js';

// PNG magic bytes: 89 50 4E 47
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

function detectFormat(buf: Buffer): 'png' | 'jpeg' {
  if (
    buf.length >= 4 &&
    buf[0] === PNG_MAGIC[0] &&
    buf[1] === PNG_MAGIC[1] &&
    buf[2] === PNG_MAGIC[2] &&
    buf[3] === PNG_MAGIC[3]
  ) {
    return 'png';
  }
  return 'jpeg';
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generates a comparison gallery HTML page from browser screenshots.
 * Screenshots are embedded as Base64 data URIs.
 */
export function generateCompareHTML(
  screenshots: Map<Browser, Buffer>,
  options: CompareHTMLOptions = {}
): string {
  const title = options.title ?? 'SKAM Screenshot Comparison';
  const timestamp = new Date().toISOString();

  const cards = Array.from(screenshots.entries())
    .map(([browser, buf]) => {
      const format = detectFormat(buf);
      const base64 = buf.toString('base64');
      const mime = format === 'png' ? 'image/png' : 'image/jpeg';

      return `    <div class="card">
      <h2>${escapeHTML(browser)}</h2>
      <img src="data:${mime};base64,${base64}" alt="${escapeHTML(browser)} screenshot">
    </div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHTML(title)}</title>
<style>
body {
  font-family: system-ui, sans-serif;
  margin: 0;
  padding: 24px;
  background: #f5f5f5;
}
h1 { margin: 0 0 8px; }
.meta { color: #666; font-size: 0.875rem; margin-bottom: 24px; }
.gallery {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}
.card {
  background: white;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
.card h2 {
  margin: 0 0 12px;
  font-size: 1rem;
  text-transform: capitalize;
}
.card img {
  max-width: 600px;
  height: auto;
  border: 1px solid #e0e0e0;
}
</style>
</head>
<body>
<h1>${escapeHTML(title)}</h1>
<div class="meta">Generated: ${escapeHTML(timestamp)}</div>
<div class="gallery">
${cards}
</div>
</body>
</html>`;
}
