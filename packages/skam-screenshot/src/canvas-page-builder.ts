import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import type { SKAMDocument } from '@kanbun-skam/skam';
import { resolveEmphasisCharacter } from '@kanbun-skam/skam/rendering';
import type { CanvasRenderOptions } from '@kanbun-skam/skam-canvas-renderer';

const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700&display=swap';

const PADDING = 32;

let bundleCache: string | undefined;

async function loadBundle(): Promise<string> {
  if (bundleCache) return bundleCache;
  const require = createRequire(import.meta.url);
  const bundlePath = require.resolve('@kanbun-skam/skam-canvas-renderer/browser-bundle');
  bundleCache = await readFile(bundlePath, 'utf-8');
  return bundleCache;
}

/**
 * Makes JSON safe to embed in a <script type="application/json"> element.
 * Every "<" becomes a unicode escape, so neither "</script" nor "<!--" can appear;
 * JSON.parse restores the original string because "<" only occurs inside string values.
 */
function escapeJsonForScript(json: string): string {
  return json.replace(/</g, '\\u003c');
}

/** collectFontSampleText が読む mark の形 (型を問わず来うる値を unknown で受ける) */
interface SampleMark {
  type?: string;
  value?: string;
  label?: string;
  content?: string;
  style?: unknown;
  forms?: { yomi?: string; okuri?: string }[];
}

/**
 * Collects every character the Canvas renderer draws, so the font subsets covering
 * them can be loaded before rendering. Runs in Node; the page reads the result from JSON.
 */
export function collectFontSampleText(doc: SKAMDocument): string {
  const parts: string[] = doc.tokens.map((t) => t.text);
  const marks = (doc.marks ?? []) as unknown as SampleMark[];
  for (const m of marks) {
    if (m.value) parts.push(m.value);
    if (m.label) parts.push(m.label);
    if (m.content) parts.push(m.content);
    for (const f of m.forms ?? []) {
      if (f.yomi) parts.push(f.yomi);
      if (f.okuri) parts.push(f.okuri);
    }
    if (m.type === 'emphasis') parts.push(resolveEmphasisCharacter(m.style));
  }
  return parts.join('');
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
  const fontSampleJson = escapeJsonForScript(JSON.stringify(collectFontSampleText(doc)));

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
<script type="application/json" id="skam-font-sample">${fontSampleJson}</script>
<script>
(async function() {
  try {
    var CR = SKAMCanvasRenderer;
    var doc = JSON.parse(document.getElementById('skam-doc').textContent);

    // Collect ALL rendered characters for font loading.
    // Google Fonts serves Noto Serif JP as unicode-range subsets; fonts.load()
    // only downloads subsets matching the given text, so the sample text must
    // include every character the renderer draws.
    var sampleText = JSON.parse(document.getElementById('skam-font-sample').textContent);

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
