---
'@kanbun-skam/skam': minor
'@kanbun-skam/skam-xml-parser': minor
'@kanbun-skam/skam-xml-stringify': minor
'@kanbun-skam/skam-html-renderer': minor
'@kanbun-skam/skam-web-component': minor
---

Keep the language of the base text in the document (`lang`) and use it for the display layer (ADR-041).

- `skam`: documents have an optional top-level `lang`, a language tag such as `ja`, `lzh` or `zh-Hant`. The validator reports a non-string `lang` as `INVALID_TYPE` and a malformed one as `INVALID_VALUE` (path `lang`), and keeps a valid one in the returned document. `isLanguageTag(value)` is a new type guard for the accepted form; it does not check registered subtags.
- `skam-xml-parser`: the root `xml:lang` becomes `lang` (an empty value means no `lang`). Parse results of documents whose root has `xml:lang` now contain `lang`, so tests that compare whole parse results need updating. `xml:lang` on other elements is still ignored.
- `skam-xml-stringify`: writes `lang` as the escaped root `xml:lang` when it is a string.
- `skam-html-renderer`: the display layer's `lang` is `displayLang`, then the document's `lang`, then `ja`. The container stays `lang="ja"`. The reading layer gets the document's `lang` only when it falls back to the base text. A document `lang` that does not match `isLanguageTag` is ignored. The `displayLang` error message changed.
- `skam-web-component`: no code change; without `display-lang`, the display layer now follows the document's `lang`.
- 0.2.x readers drop `lang` without an error.
