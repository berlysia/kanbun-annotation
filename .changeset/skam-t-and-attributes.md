---
'@kanbun-skam/skam': minor
'@kanbun-skam/skam-xml-parser': minor
'@kanbun-skam/skam-xml-stringify': minor
---

SKAM-ML can now carry tokens of any shape and the `ext`, `custom` and `placementHint` fields, so documents that pass validation round-trip without loss (SKAM-ML-draft §7.14, §10.3).

- `skam`: new `tokenizePlainText(text)` (experimental). It splits the text of one text node into tokens by the parser's rule and returns each token's text with its start and end in the original string. The parser and the stringifier both use it. `SKAM_ML_CONTENT_MODEL` allows `t` inside the elements that hold text.
- `skam-xml-parser`: reads `<skam:t>`. Its content becomes one token as written: it is not split into characters and its white space is kept. `xml:id` on `<skam:t>` is the token id. An empty `<skam:t>`, or one with child elements, is a `SKAMXMLParseError`.
- `skam-xml-parser`: reads `skam:ext` and `skam:custom` (a JSON object) on the root, `skam:block`, `skam:t`, `skam:reading` and every mark element, and `placement-hint` on every mark element. On `skam:kun`, the okurigana and soegana use `skam:okuri-ext`, `skam:okuri-custom`, `okuri-placement-hint` and `skam:soe-ext`, `skam:soe-custom`, `soe-placement-hint`. These are `SKAMXMLParseError`: a value longer than 1,000,000 characters, JSON that does not parse, a value that is not an object, the same extension in a namespace attribute and in `skam:ext`, and an attribute of `skam:kun` without the part it belongs to (`skam:ext` without `yomi`, `okuri-placement-hint` without `okuri`).
- `skam-xml-parser`: keeps the leading and trailing white space of a `skam:reading` that has `xml:space="preserve"`.
- `skam-xml-stringify`: writes a token with `<skam:t>` when it has a hand-written id, `ext` or `custom`, or when plain text would not read back as the same tokens (two or more characters, white space, a token that combines with the one before it). Writes `ext` values without an attribute form, `custom` and `placementHint` as the attributes above, and `xml:space="preserve"` on a reading with leading or trailing white space. Tab, LF and CR in attribute values, and CR in text, are written as character references.
- `skam-xml-stringify`: the loss codes `MULTI_GRAPHEME_TOKEN`, `ASCII_WHITESPACE_TOKEN`, `EXT` and `PLACEMENT_HINT` are no longer reported, and `UNKNOWN_EXTENSION` no longer covers extension values. Documents that threw with `lossy: false` because of them now stringify. `UNKNOWN_EXTENSION` remains for declaring an extension that is neither in the registry nor passed as a definition, because `skam:extension` needs its namespace URI. The codes stay in `StringifyLossCode`.
- Older parsers drop `<skam:t>` and the text inside it with a warning, and ignore the new attributes. Read output of this version with this version's parser.
