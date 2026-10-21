---
'@kanbun-skam/skam': minor
'@kanbun-skam/skam-xml-parser': minor
'@kanbun-skam/skam-xml-stringify': minor
'@kanbun-skam/skam-html-renderer': minor
'@kanbun-skam/skam-canvas-renderer': minor
---

Add an explicit line break inside a block (ADR-039).

- New position mark `linebreak` (`LinebreakMark`, no value) after a token. SKAM-ML writes it as the empty element `<skam:br/>`.
- The validator reports `INVALID_LINEBREAK` for a line break at the block start, at the block end, inside an unbreakable unit (a tateten group, or a multi-token yomigana / okurigana / soegana / saidoku / okimoji / joji), or a second one at the same position. `getLinebreakPlacementIssues(doc)` returns the same judgment; renderers ignore those line breaks.
- Rendering: the HTML renderer writes `<br class="<prefix>-linebreak">`, the canvas renderer starts a new column in the same block, and the accessible text inserts one space. AIR marks the unit before the break with `lineBreakAfter: true`. The render profile has a new `linebreak` key, `true` in every preset.
- `BLOCK_START_KAERI_HINT` now points to `<skam:br/>` for breaking a line.
- Adding `linebreak` to `MarkType`, `Mark`, `ValidationErrorKind`, `RenderProfile` and `AIRRenderProfile` can break exhaustive switches and profile objects that list every key.
