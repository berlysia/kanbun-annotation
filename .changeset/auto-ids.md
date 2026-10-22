---
'@kanbun-skam/skam': minor
'@kanbun-skam/skam-xml-parser': minor
'@kanbun-skam/skam-xml-stringify': minor
---

Split ids into hand-written ids and automatic ids (SKAM-draft §3.1). A hand-written id is an XML NCName and survives round trips, so other documents can point at it. An automatic id contains `#` and follows the position: `b#2` for a block, `b#2#5` (block id, then the 1-based place in the block) for a token, `m#3` for a mark.

- `skam`: new `isHandId`, `isAutoId`, `findIdFormIssues`, `findXmlUnwritableChars`, `renumberAutoIds` and `convertHandIdsToAuto` (experimental), and `SKAM_ML_CONTENT_MODEL` / `SKAM_ML_NESTING_ORDER`, which the parser and the stringifier now share.
- `skam`: two new validation warnings (the document stays valid; both become errors in 0.4.0). `ID_FORM`: an id that is neither an NCName nor the automatic id of its position, a mark id that is neither an NCName nor `m#<n>`, a `highlight.ref` that does not name an existing ref mark with a hand-written id, or a hand-written id on the second or later of the yomigana, okurigana and soegana on the same anchor. `XML_UNWRITABLE_CHAR`: a character XML 1.0 cannot carry (U+0000–U+001F except tab, LF and CR, U+FFFE, U+FFFF, lone surrogates) in token text, reading text, mark strings or `placementHint`. If you treat warnings as errors, these documents now fail.
- `skam`: new lint code `HIGHLIGHT_REF_UNLINKED`: a highlight without `ref` whose range has exactly one ref mark after its characters. Before this release the parser linked such a highlight to that ref.
- `skam` (breaking): `generateMarkId(doc)` returns the smallest unused `m#<n>` instead of `m-<8 hex>`, and `addMark` and `splitMultiCharacterKaeri` (without `idGenerator`) use it. `generateId(doc, prefix)` and the id generators are unchanged.
- `skam-xml-parser` (breaking): ids are no longer random. Blocks without `xml:id` get `b#<n>`, tokens `<block id>#<n>`, marks without `xml:id` `m#<n>` in output order. Every mark element can carry `xml:id`; the `xml:id` of `skam:kun` goes to the first mark it creates (yomigana, okurigana, soegana). An `xml:id` (or `id`) that is not an NCName, such as `1a` or `b#1`, is a `SKAMXMLParseError`.
- `skam-xml-parser` (breaking): the `idGenerator` option is removed. Remove it from your `parse` calls; ids are now deterministic.
- `skam-xml-parser` (breaking): a highlight links to a ref only through its `ref` attribute. A highlight without `ref` no longer links to the single `skam:ref` inside it; give the ref an `xml:id` and write `ref="<id>"` on the highlight. A `ref` attribute may point to a ref later in the document; pointing to a missing ref or to an element that is not a ref is a `SKAMXMLParseError`.
- `skam-xml-stringify`: writes only hand-written ids as `xml:id` (blocks and all mark elements). The `xml:id` of `skam:kun` is the id of the first mark written inside it. New loss codes `ID_FORM` and `XML_UNWRITABLE_CHAR`.
- Documents created with random ids (for example JSON saved from an earlier parser) keep those ids as hand-written ids. Before writing such a document to SKAM-ML, pass it through `convertHandIdsToAuto(doc, keep)`, keeping only the ids that other documents point at; ids of refs that highlights point at are always kept. `renumberAutoIds` and `convertHandIdsToAuto` do not look inside `ext` or `custom`.
