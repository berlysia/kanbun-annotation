---
'@kanbun-skam/skam': minor
'@kanbun-skam/skam-html-renderer': minor
'@kanbun-skam/skam-web-component': minor
---

Add reading-layer text derived from what the display layer shows (experimental).

- `skam`: `describeAnnotationIR` builds a language-independent structure from an AIR, `formatAccessibleText` turns it into raw Japanese text, and `DEFAULT_ACCESSIBLE_LABELS` holds the default words. Types: `AccessibleNote`, `AccessibleUnit`, `AccessibleBlock`, `AccessibleLabels`. All of them are `@experimental`.
- `skam-html-renderer`: the `readingLayerSource: 'display'` option makes the reading layer say only the annotations the `profile` shows, and never `readings` or the plain text. The default `'readings'` is unchanged. `accessibleLabels` overrides the words per note kind. Invalid values throw `TypeError`.
- `skam-web-component`: the `reading-layer-source` attribute (`readings` or `display`). Other values are invalid and nothing is rendered, like `profile`.
- The reading words are experimental and may change in a minor release of 0.x. A hidden annotation is only kept out of the reading layer when `readingLayerSource: 'display'` is used; the HTML source and the embedded SKAM-ML still contain it.

Migration row: M37. See https://github.com/berlysia/kanbun-annotation/blob/master/docs/migration-0.1-to-0.2.md
