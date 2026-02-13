import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import type { SKAMDocument } from '@kanbun/skam';
import type { CanvasRenderOptions } from '@kanbun/skam-canvas-renderer';

const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700&display=swap';

const PADDING = 32;

let bundleCache: string | undefined;

async function loadBundle(): Promise<string> {
  if (bundleCache) return bundleCache;
  const require = createRequire(import.meta.url);
  const bundlePath = require.resolve('@kanbun/skam-canvas-renderer/browser-bundle');
  bundleCache = await readFile(bundlePath, 'utf-8');
  return bundleCache;
}

function escapeJsonForScript(json: string): string {
  return json.replace(/<\//g, '<\\/');
}

/**
 * Builds a self-contained HTML page that renders a SKAM document
 * using the Canvas renderer IIFE bundle inside a browser context.
 */
export async function buildCanvasPage(
  doc: SKAMDocument,
  options: CanvasRenderOptions = {}
): Promise<string> {
  const bundle = await loadBundle();
  const docJson = escapeJsonForScript(JSON.stringify(doc));
  const optionsJson = escapeJsonForScript(JSON.stringify(options));

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${GOOGLE_FONTS_URL}">
<style>
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { padding: ${PADDING}px; }
</style>
</head>
<body>
<canvas id="skam-canvas"></canvas>
<script>${bundle}</script>
<script type="application/json" id="skam-doc">${docJson}</script>
<script type="application/json" id="skam-options">${optionsJson}</script>
<script>
(async function() {
  try {
    var CR = SKAMCanvasRenderer;
    var doc = JSON.parse(document.getElementById('skam-doc').textContent);

    // Collect ALL rendered characters for font loading.
    // Google Fonts serves Noto Serif JP as unicode-range subsets; fonts.load()
    // only downloads subsets matching the given text. We must include:
    //   - token text (kanji)
    //   - mark values (okurigana/yomigana/soegana: hiragana/katakana,
    //     kaeri: レ一二三上下甲乙 etc, kutoten: 。、etc)
    //   - ref labels/content
    //   - saidoku forms (yomi/okuri)
    var parts = doc.tokens.map(function(t) { return t.text; });
    // Resolve emphasis style to actual rendered character for font loading.
    // resolveEmphasisCharacter() is inside the bundle but not exposed, so we
    // duplicate the minimal mapping here.
    var emphasisChars = {
      'sesame': '\uFE45', 'open sesame': '\uFE46',
      'dot': '\u2022', 'filled dot': '\u2022', 'open dot': '\u25E6',
      'circle': '\u25CF', 'filled circle': '\u25CF', 'open circle': '\u25CB',
      'double-circle': '\u25C9', 'filled double-circle': '\u25C9', 'open double-circle': '\u25CE',
      'triangle': '\u25B2', 'filled triangle': '\u25B2', 'open triangle': '\u25B3'
    };
    (doc.marks || []).forEach(function(m) {
      if (m.value) parts.push(m.value);
      if (m.label) parts.push(m.label);
      if (m.content) parts.push(m.content);
      if (m.forms) m.forms.forEach(function(f) {
        if (f.yomi) parts.push(f.yomi);
        if (f.okuri) parts.push(f.okuri);
      });
      // emphasis: resolve style to rendered character
      if (m.type === 'emphasis') {
        var ch = m.style ? emphasisChars[m.style.trim().toLowerCase()] : '\u2022';
        if (ch) parts.push(ch);
      }
    });
    var sampleText = parts.join('');

    // loadDefaultFont() injects the <link> if needed but its internal
    // fonts.load() uses space text, which may miss CJK subsets.
    // We follow up with an explicit load using document text.
    await CR.loadDefaultFont();
    await document.fonts.load('24px "Noto Serif JP"', sampleText);
    await document.fonts.ready;

    var options = JSON.parse(document.getElementById('skam-options').textContent);
    var canvas = document.getElementById('skam-canvas');
    var ctx = canvas.getContext('2d');
    var dims = CR.measure(doc, ctx, options);
    canvas.width = dims.width;
    canvas.height = dims.height;
    canvas.style.width = dims.width + 'px';
    canvas.style.height = dims.height + 'px';
    // Some browsers let CSS writing-mode affect Canvas 2D fillText() direction.
    // Force horizontal-tb so the renderer's own coordinate-based layout is not disrupted.
    canvas.style.writingMode = 'horizontal-tb';
    CR.render(doc, canvas, options);
    window.__skamCanvasReady = true;
    window.__skamCanvasDims = dims;
  } catch (e) {
    window.__skamCanvasError = e.message || String(e);
    window.__skamCanvasReady = true;
  }
})();
</script>
</body>
</html>`;
}

/** Body padding in px, exported for viewport fitting calculation */
export { PADDING as CANVAS_PADDING };
