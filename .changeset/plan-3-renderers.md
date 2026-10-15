---
'@kanbun-skam/skam': minor
'@kanbun-skam/skam-xml-parser': patch
'@kanbun-skam/skam-html-renderer': minor
'@kanbun-skam/skam-canvas-renderer': minor
'@kanbun-skam/skam-web-component': minor
---

Make the renderers safe against hostile documents and options, fix the reading layer, draw okototen on canvas, and make the web component SSR-safe.

Breaking changes: invalid render options now throw `TypeError`, the reading layer falls back to plain text and no longer carries an `aria-label`, refs are numbered in source order, the canvas `writingMode` type is narrowed and the canvas size is set by autoSize, okototen is drawn on canvas, and the `skam-error` detail gains `recoverable` and `attribute`. The old behavior, the new behavior and the workaround of each change are in the migration table: https://github.com/berlysia/kanbun-annotation/blob/master/docs/migration-0.1-to-0.2.md

Fixes

- All document-derived and option-derived values are escaped or checked against an allowlist in the html-renderer output.
- `skam-web-component` can be imported during SSR.

Features

- `displayLang` option / `display-lang` attribute.
- Canvas renders okototen.
- `validateRenderOptions` / `validateCSSOptions` are exported.
- `skam`: new public API `HIGHLIGHT_STYLES`, `isValidHighlightStyle`, `resolveOkototenCell`, and an okototen slot in the annotation IR.
- `skam-xml-parser`: uses `isValidHighlightStyle`.
