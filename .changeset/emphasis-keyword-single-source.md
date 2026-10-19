---
'@kanbun-skam/skam': patch
'@kanbun-skam/skam-html-renderer': patch
---

Keep the emphasis keyword check in one place and expose it as `isEmphasisKeyword`.

- `skam`: `@kanbun-skam/skam/rendering` now exports `isEmphasisKeyword(style)`, which is true only for the 15 emphasis keywords (`dot`, `filled circle`, `open sesame`, and so on). It is an additive API, shipped as a patch because the 0.x packages are released at the same version and `skam-html-renderer` depends on `skam` at an exact version.
- `skam`, `skam-html-renderer`: `isValidEmphasisStyle`, `resolveEmphasisCharacter`, and the HTML output are unchanged. The keyword list and its characters now come from a single table in `skam`.
