---
'@kanbun-skam/skam-html-renderer': minor
'@kanbun-skam/skam-xml-parser': minor
---

Add `mount()` for rendering into a light DOM container, and export the SKAM-ML `<script>` extraction from the parser.

- `skam-html-renderer`: `mount(container, doc, options)` (experimental) renders a `SKAMDocument` into a connected element in one call. It inserts the CSS once per document (or shadow root) as `<style data-skam-css>`, even when two copies of the package are on the page, sets the HTML, and calls `calibrateGridBaseline` right away and again after `document.fonts.ready`. The returned `fontsCalibrated` promise resolves after the second calibration and never rejects; a failure there is reported with `console.warn`. It throws `TypeError` for a disconnected container and leaves the DOM untouched on invalid options.
- `skam-html-renderer`: `mount` accepts `nonce` for the `<style>` it inserts. The rendered HTML still uses inline `style` attributes for okototen positions and emphasis shapes, so a nonce-only `style-src` needs `style-src-attr` as well.
- `skam-html-renderer`: `mount` accepts `trustedTypesPolicy` for pages that require Trusted Types. Pass a policy created for this purpose and keep it private; a passthrough policy reachable by other code weakens the page's protection.
- `skam-html-renderer`: like `render`, `mount` defaults to `readingLayerSource: 'readings'`, which reads hidden annotations. Use `'display'` when hiding annotations.
- `skam-xml-parser`: exports `SKAM_XML_MEDIA_TYPE` and `extractXmlFromScriptElement` (experimental), so pages can read embedded SKAM-ML without the Web Component. `skam-web-component` re-exports the same values.
