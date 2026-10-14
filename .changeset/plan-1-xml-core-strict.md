---
'@kanbun-skam/skam': minor
'@kanbun-skam/skam-xml-parser': minor
'@kanbun-skam/skam-xml-stringify': minor
---

Make the XML layer and the core validator strict, and stop dropping data silently.

Breaking changes

- `skam-xml-stringify`: `stringify()` throws `SKAMXMLStringifyError` (with `losses`) when the document has anything SKAM-ML cannot represent (`ext`, `derivations`, `placementHint`, partially overlapping ranges, ASCII-whitespace-only tokens, dangling references, ...). `console.warn` is no longer used. The meta element is now written as `<skam:meta tokenization="char"/>`, and block-start kutoten / ref, content-only refs, empty blocks and yomigana ranges containing a kun are now written instead of being dropped.
- `skam-xml-parser`: the parser rejects `<!` declarations, deeper nesting than `maxDepth` (default 64) and input longer than `maxInputLength` (default 5,000,000), promotes xmldom warnings to errors with line/column, enforces the SKAM namespace and the content model, keeps U+3000 as a token, tokenizes CDATA, accepts empty blocks, and validates the result by default (`validate: false` opts out). `SKAMValidationError` is re-exported.
- `skam`: the validator now rejects empty token `text`, empty `saidoku.forms`, IDs shared across blocks / tokens / marks, out-of-grid okototen coordinates, invalid emphasis styles and wrongly typed `id` / `ext` / `placementHint` / `forms[].n`. A kaeri at the start of a block is reported as `BLOCK_START_KAERI` (see `BLOCK_START_KAERI_HINT`).
- `skam`: the validator rejects two marks of the same type on the same anchor (`MARK_CONFLICT`) for yomigana, okurigana, soegana, okimoji, joji and saidoku. Documents that were valid under 0.1.0 can become invalid. okototen, emphasis, highlight and tateten may still be stacked (SKAM-draft section 6.1).

Features / Fixes

- SKAM-ML-draft section 7.0 is now the normative content model table. `SKAM_ML_CONTENT_MODEL` is exported from `skam-xml-parser` and `skam-xml-stringify` (`@experimental`; the value may change in a minor release while the version is 0.x).
- `skam-xml-parser` keeps a kun inside a character-wrapping element (okimoji / joji / okototen / saidoku base) and nested wrapping elements, which it used to drop silently, and accepts joji inside okimoji (a relaxation).
- `skam-xml-stringify` writes multi-character okimoji / joji / okototen / saidoku as wrapping elements, nests elements that share a range in the fixed order of section 7.0 (`SKAM_ML_NESTING_ORDER`, `@experimental`), and hoists a trailing position mark (kaeri / kutoten / ref) out of every range that ends on the same character.

Loss reporting

- `skam-xml-stringify` reports `UNNESTABLE_OVERLAP` when the content model forbids the nesting: a range kun inside a range kun, yomigana and a wrapping element on the same range, a position mark in the middle of a wrapping or kun range, and a saidoku inside a wrapping element. The outer range is dropped.
- New loss code `CONFLICTING_MARKS` (same-type marks on the same anchor in unvalidated input).

Compatibility

- A 0.1.x parser silently drops a kun inside a wrapping element. Read output of the new stringify with a parser from this release or later.

New APIs (additive)

- `SKAM_ML_CONTENT_MODEL` (parser and stringify, `@experimental`), `SKAM_ML_NESTING_ORDER` (stringify, `@experimental`), `isValidEmphasisStyle`, `BLOCK_START_KAERI_HINT`, `ParseWarning` / `onWarning`, `SKAMXMLStringifyError` / `StringifyLoss`.

Migration

- To keep the old stringify behavior of dropping what cannot be written, pass `{ lossy: true }` and read what was dropped through `onLoss`. With `lossy: true` the return value is the XML only.
- To skip validation after parsing, pass `{ validate: false }`.
- A kaeri at the start of a block in XML is rejected even with `validate: false`, because it cannot be mapped to a valid document. Fix the XML: put the kaeri after the last character of the previous block, or merge the blocks.
- `BLOCK_START_KAERI` is a validation error kind in `skam` and a stringify loss code in `skam-xml-stringify`; they are separate types.

Release note: this changeset alone is not a release. The packages are published by a manual workflow after plan-3 sets up the fixed group of six packages and the migration table, so master is not a release candidate while only plan-1 is merged.
