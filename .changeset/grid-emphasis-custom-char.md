---
'@kanbun-skam/skam': patch
'@kanbun-skam/skam-html-renderer': patch
'@kanbun-skam/skam-canvas-renderer': patch
---

Draw custom emphasis characters in grid mode and on Canvas, and make the emphasis keyword lookup strict.

- `skam`, `skam-html-renderer`, `skam-canvas-renderer`: a one-character `style` of an emphasis mark (for example `★`) is now drawn in grid mode and on Canvas. It used to fall back to `•`. Ruby mode already drew it.
- `skam`: `resolveEmphasisCharacter` now accepts `unknown` and matches the 15 emphasis keywords exactly. A value with different case or surrounding spaces (`Circle`, ` circle`) and a bare `open` are no longer taken for a keyword, and become the default `•`. A value that `validateSKAMDocument` would reject also becomes `•`. For documents that pass the validator, the output only changes for custom characters.
- `skam-html-renderer`: `generateEmphasisMarks` now escapes HTML special characters in the emphasis character (`<` becomes `&lt;`).
- `skam-html-renderer`: removed the CSS for `.skam-suffix-kana`, an element the renderer never outputs.
