---
'@kanbun-skam/skam': minor
'@kanbun-skam/skam-xml-parser': minor
'@kanbun-skam/skam-html-renderer': minor
'@kanbun-skam/skam-canvas-renderer': minor
---

Write each kaeri (返り点) as a mark with one character. Multi-character kaeri values are deprecated and become an error in 0.4.0 (ADR-038, `docs/migration-0.2-to-0.3.md`).

- `validateSKAMDocument` adds an optional `warnings` array to a `valid: true` result. A kaeri value with two or more characters adds a `KAERI_MULTI_CHARACTER` warning. Without warnings the key is absent. `@kanbun-skam/skam` exports `KAERI_MULTI_CHARACTER`, `ValidationWarning` and `ValidationWarningKind`.
- The parser still reads `<skam:kaeri kind="ichi-re"/>` as one mark and emits a `ParseWarning` with `code: 'KAERI_MULTI_CHARACTER'`, also with `validate: false`. It does not forward the validator's warnings.
- `splitMultiCharacterKaeri(doc, { idGenerator? })` splits multi-character kaeri into one-character marks at the same position.
- Rendering: kaeri marks at the same position render as one mark whose value joins them in `marks[]` order, in the HTML renderer, the canvas renderer, `buildAnnotationIR` and the accessible text. `@kanbun-skam/skam/rendering` exports `joinKaeriValues`. Fixes the second kaeri being dropped inside a tateten group.
