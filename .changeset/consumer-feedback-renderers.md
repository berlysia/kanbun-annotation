---
'@kanbun-skam/skam': minor
'@kanbun-skam/skam-html-renderer': minor
'@kanbun-skam/skam-canvas-renderer': minor
'@kanbun-skam/skam-web-component': minor
---

Validate render profiles strictly and keep hidden annotations hidden.

- `profile` is resolved and validated in one place (`resolveRenderProfile` in `@kanbun-skam/skam/rendering`). Unknown keys, non-boolean values and mixed `base` forms throw `TypeError` in the html and canvas renderers (M28, M29). `includeReadingLayer` must be a boolean (M30).
- The `{ base, overrides }` form of `profile` lets you start from a preset and change a few items. A partial profile still overlays full.
- `<skam-renderer>` does not render when `profile` or `include-reading-layer` is invalid, and emits a non-recoverable `skam-error` (M31). Invalid `writing-mode` and `copyable` are now reported with a recoverable `skam-error` (M32).
- `PROFILES` is frozen and its type is readonly (M33).
- `skam`: `buildAnnotationIR` no longer puts hidden okimoji and joji into a range's `trailingMarks` (M34).
- New API: `RENDER_PROFILES`, `resolveRenderProfile`, `RenderProfileInput`, `RenderProfileName`, and `extractXmlFromScriptElement` (experimental) (M27).

Migration rows: M27 to M34. See https://github.com/berlysia/kanbun-annotation/blob/master/docs/migration-0.1-to-0.2.md
