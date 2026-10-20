---
'@kanbun-skam/skam-html-renderer': patch
---

Keep the reading layer hidden against page CSS, and separate blocks in its plain-text fallback.

- `skam-html-renderer`: the rule that visually hides `.skam-reading` now marks every declaration `!important` and adds `min-width: 0` and `min-height: 0`. With the default `@layer`, page CSS such as `.skam-reading { position: static; min-width: 10em }` no longer puts the reading text on screen. Previously any unlayered page rule won, because layered declarations lose to unlayered ones regardless of specificity. With `useLayer: false`, a page rule marked `!important` can still win. The selector is still wrapped in `:where()`.
- `skam-html-renderer`: when a document has no readings, the default `readingLayerSource: 'readings'` now puts one half-width space between blocks in the plain text, the same separator as `'display'`. For example, two blocks render as `學而時習之 不亦說乎` instead of `學而時習之不亦說乎`. Documents with `yomiage` or `kakikudashi` are unchanged. Snapshots of the reading layer of such documents need to be updated.
