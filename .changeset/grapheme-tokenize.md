---
'@kanbun-skam/skam': minor
'@kanbun-skam/skam-xml-parser': minor
'@kanbun-skam/skam-xml-stringify': minor
'@kanbun-skam/skam-html-renderer': minor
'@kanbun-skam/skam-canvas-renderer': minor
'@kanbun-skam/skam-web-component': minor
---

Tokenize and count characters by extended grapheme cluster (ADR-042). This needs `Intl.Segmenter` (Node 16+, Chrome 87+, Safari 14.1+, Firefox 125+).

- `skam`: new `splitGraphemes(text)`, which splits a string into extended grapheme clusters with `Intl.Segmenter`. Importing works without `Intl.Segmenter`; calling it throws `TypeError`.
- `skam-xml-parser` (breaking): each grapheme cluster becomes one token, so an ideographic variation selector (U+E0100–U+E01EF), a standardized variation selector (U+FE00–U+FE0F) or a combining mark stays in the token of its base character. Documents with such characters parse to fewer tokens, with different generated ids and indexes. Clusters do not cross element boundaries; a selector or combining mark at the start of a text node is a token of its own. Leading ignored whitespace is removed from a cluster, and a cluster of ignored whitespace only (such as `\r\n`) is not a token. A cluster's position is that of its first code point.
- `skam-xml-stringify` (breaking): a token whose `text` has two or more grapheme clusters is the new loss `MULTI_GRAPHEME_TOKEN`, an error unless `lossy: true`, because reading the XML back would split it. Whitespace-only tokens are still reported only as `ASCII_WHITESPACE_TOKEN`. `StringifyLossCode` has a new value, which can break exhaustive switches.
- `skam-html-renderer`: emphasis marks and the blanks for hidden quiz marks are counted per grapheme cluster.
- `skam-canvas-renderer`: characters are drawn and ruby lengths counted per grapheme cluster, so a variation selector is no longer drawn on its own.
- `skam-web-component`: parses with the new tokenizer.
- Grapheme segmentation depends on the Unicode version of the runtime (for example emoji ZWJ sequences). CJK characters, variation selectors and combining marks do not change between versions.
