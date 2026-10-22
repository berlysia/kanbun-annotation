---
'@kanbun-skam/skam': minor
'@kanbun-skam/skam-html-renderer': minor
'@kanbun-skam/skam-canvas-renderer': minor
---

Overlapping range annotations are drawn as their ranges, and every character is drawn exactly once.

- `skam`: new validation warning `READING_OVERLAP` (the document stays valid; it becomes an error in 0.4.0). It is reported for each yomigana, okurigana or soegana whose range shares a character with another annotation of the same type on a different anchor (the same anchor is still `MARK_CONFLICT`). To fix it, remove one of the readings or split the ranges so they no longer share a character. Readings of different types may share characters (a range yomigana with an okurigana on one of its characters).
- `skam` (breaking): the AIR (`@kanbun-skam/skam/rendering`) changes shape.
  - A yomigana over two or more characters is an `AIRRubyGroupNode` (`type: 'ruby-group'`, `yomigana`, `fromTokenId`, `toTokenId`, `span`, `children`). An okurigana or soegana range is put on the slot of its last character.
  - Tateten and highlight groups that cross another range are split into fragments with `continuesBefore` / `continuesAfter`. A highlight's `refLabel` is on its last fragment only. Groups may contain ruby groups, tateten separators and groups of the same type.
  - Each character node carries only its own annotations. New: `joinedWithNext` (no line break before the next character), `slots.saidoku` (all forms), `slots.emphasisStyle`, `slots.kutotenValues`, `slots.refLabels`, and `hidden` on tateten separators.
  - Removed: `AIRRangeInfo`, `AIRTrailingMark`, `AIRTokenNode.rangeInfo` / `rangeConsumed`, `AIRTatetenGroupNode.rangeInfo`. `AIRBlockChild` and the group `children` unions now include `AIRRubyGroupNode` and `AIRTatetenSeparator`, so exhaustive switches over them need new cases.
- `skam` (breaking): `getTatetenGroups` and `getHighlightGroups` return every group of a character (`Map<tokenId, Mark[]>`, in `marks` order). `getRangeMarkGroups` is unchanged.
- Rendering:
  - Ranges that cross each other are drawn as their ranges: a range reading inside a tateten that starts after the tateten's first character is drawn (it was dropped), an okurigana range crossing a yomigana range is drawn, overlapping tateten and highlight marks are all drawn, and okimoji, joji and emphasis marks stay on their own characters.
  - A non-レ kaeri on a one-character tateten is kept on the character (it was dropped), and two kaeri marks that wanted the same tateten separator are both drawn.
  - When readings of the same type overlap (`READING_OVERLAP`), the first one in `marks` is drawn and later ones that share a character are not. Several yomigana, okurigana or soegana on the same anchor (`MARK_CONFLICT`) are no longer concatenated; the first one is drawn.
  - Only the first emphasis mark of a character is drawn.
  - Limits for documents that do not pass validation: per block, up to 1,024 tateten and highlight marks, up to 8 fragments per mark and a range nesting depth of 56 are drawn; further marks are not drawn, and characters are always drawn.
- `skam-html-renderer`:
  - The renderer draws only from the AIR and no longer looks marks up again.
  - In ruby mode, the base text of a range reading is split into one `skam-base-seg` element per character.
  - The characters of an okurigana or soegana range are separate `skam-token` elements, so interactive mode gives each a `data-token-id` instead of `data-token-from` / `data-token-to`.
  - Line breaks follow the same indivisible units as the validator (`joinedWithNext`).
  - A highlight that contains a tateten with a reading gets the four-row grid like other blocks with readings.
- `skam-canvas-renderer`: draws the new AIR, including fragments that continue across crossing ranges. The unused internal `buildRenderTree` was removed.
