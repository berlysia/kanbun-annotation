---
'@kanbun-skam/skam': minor
'@kanbun-skam/skam-xml-parser': minor
'@kanbun-skam/skam-xml-stringify': minor
---

Make the XML layer and the core validator strict, and stop dropping data silently.

Breaking changes: `stringify()` throws `SKAMXMLStringifyError` instead of dropping what SKAM-ML cannot represent, the parser is strict and validates by default, and the validator rejects more documents (including two marks of the same type on one anchor and a kaeri at the start of a block). The old behavior, the new behavior and the workaround of each change are in the migration table: https://github.com/berlysia/kanbun-annotation/blob/master/docs/migration-0.1-to-0.2.md

Features / Fixes

- SKAM-ML-draft section 7.0 is now the normative content model table. `SKAM_ML_CONTENT_MODEL` is exported from `skam-xml-parser` and `skam-xml-stringify` (`@experimental`; the value may change in a minor release while the version is 0.x).
- `skam-xml-parser` keeps a kun inside a character-wrapping element (okimoji / joji / okototen / saidoku base) and nested wrapping elements, which it used to drop silently, and accepts joji inside okimoji (a relaxation).
- `skam-xml-stringify` writes multi-character okimoji / joji / okototen / saidoku as wrapping elements, nests elements that share a range in the fixed order of section 7.0 (`SKAM_ML_NESTING_ORDER`, `@experimental`), and hoists a trailing position mark (kaeri / kutoten / ref) out of every range that ends on the same character.

Loss reporting

- `skam-xml-stringify` reports `UNNESTABLE_OVERLAP` when the content model forbids the nesting: a range kun inside a range kun, yomigana and a wrapping element on the same range, a position mark in the middle of a wrapping or kun range, and a saidoku inside a wrapping element. The outer range is dropped.
- New loss code `CONFLICTING_MARKS` (same-type marks on the same anchor in unvalidated input).

New APIs (additive)

- `SKAM_ML_CONTENT_MODEL` (parser and stringify, `@experimental`), `SKAM_ML_NESTING_ORDER` (stringify, `@experimental`), `isValidEmphasisStyle`, `BLOCK_START_KAERI_HINT`, `ParseWarning` / `onWarning`, `SKAMXMLStringifyError` / `StringifyLoss`.
