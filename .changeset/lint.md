---
'@kanbun-skam/skam': minor
---

Add `lintSKAMDocument` for documents that are valid but look unfinished (ADR-044).

- `lintSKAMDocument(doc)` returns `LintDiagnostic[]` (`{ code, path, message }`) in `marks[]` order. Codes: `SAIDOKU_SINGLE_READING` (a saidoku with one form), `SAIDOKU_EMPTY_FORM` (a form with neither `yomi` nor `okuri`), `EMPTY_KANA` (empty or blank yomigana, okurigana or soegana), `TATETEN_SINGLE_TOKEN` (a tateten over one character), `KAERI_UNCLOSED` (kaeri that do not close within the block, see SKAM-draft §14.1) and `HIGHLIGHT_REF_MISSING` (a highlight `ref` that matches no ref mark id). The codes are also exported as constants, and more may be added in minor releases.
- Diagnostics are not errors. The function does not validate; pass a document that went through `validateSKAMDocument` or `parse`. It does not throw on other input, but its diagnostics are then not meaningful. Messages and paths never contain input values.
- `validateSKAMDocument` and the parser are unchanged.
