---
'@kanbun-skam/skam-html-renderer': minor
'@kanbun-skam/skam-web-component': minor
---

Read the display layer by default when a profile is given, so a quiz that hides annotations does not read the answer aloud.

- `skam-html-renderer` (breaking): when `profile` or `hideQuiz` is given and `readingLayerSource` is left out, `render`, `renderHTML` and `mount` use `readingLayerSource: 'display'`. Before this release only `hideQuiz` did. Without `profile` and `hideQuiz`, the default is still `'readings'`. To keep reading the author's readings with a profile, write `readingLayerSource: 'readings'`.
- `skam-web-component` (breaking): `<skam-renderer>` with a `profile` attribute and no `reading-layer-source` reads the display layer. Write `reading-layer-source="readings"` to keep the author's readings.
