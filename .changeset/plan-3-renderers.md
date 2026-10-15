---
'@kanbun-skam/skam': minor
'@kanbun-skam/skam-xml-parser': patch
'@kanbun-skam/skam-html-renderer': minor
'@kanbun-skam/skam-canvas-renderer': minor
'@kanbun-skam/skam-web-component': minor
---

Make the renderers safe against hostile documents and options, fix the reading layer, draw okototen on canvas, and make the web component SSR-safe.

Breaking changes

- `skam-html-renderer`: `render` / `renderHTML` / `generateCSS` / `getDefaultStyles` / `calibrateGridBaseline`, and `skam-canvas-renderer`'s `render`, synchronously throw `TypeError` for invalid options.
- `skam-canvas-renderer`: the `writingMode` type is narrowed to `'vertical'`. The canvas size is now set by autoSize (default true). The `skam-screenshot` CLI now rejects `horizontal` for the canvas renderer.
- `skam-html-renderer`: the reading layer emits the plain text when a document has no readings, and no longer carries an `aria-label`. ref numbers follow source order. Output of emphasis custom characters is now a CSS string (`"\2605 "`); the display does not change but the output string does.
- `skam-canvas-renderer`: okototen outside the grid is not drawn, and the vertical position in a rectangular grid (such as `5x7`) is computed from the row count.
- `skam-web-component`: the `skam-error` detail gains `recoverable` and `attribute`. The same invalid value does not fire again on re-render.
- `playground`: the xml-editor escape writes `'` as `&#x27;`.

Fixes

- All document-derived and option-derived values are escaped or checked against an allowlist in the html-renderer output.
- `skam-web-component` can be imported during SSR.

Features

- `displayLang` option / `display-lang` attribute.
- Canvas renders okototen.
- `validateRenderOptions` / `validateCSSOptions` are exported.
- `skam`: new public API `HIGHLIGHT_STYLES`, `isValidHighlightStyle`, `resolveOkototenCell`, and an okototen slot in the annotation IR.
- `skam-xml-parser`: uses `isValidHighlightStyle`.

The migration table is consolidated in plan-4.
