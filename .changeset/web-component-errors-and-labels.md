---
'@kanbun-skam/skam-web-component': minor
---

Add the `accessibleLabels` property to `<skam-renderer>` and report a fatal `skam-error` once per distinct error.

- `skam-web-component`: the `accessibleLabels` property overrides the reading-layer words (experimental). It only takes effect with `reading-layer-source="display"`. An invalid value renders without labels and emits a recoverable `skam-error` with `attribute: 'accessibleLabels'`. Assign a new object to change it; re-assigning the same object does not re-render.
- `skam-web-component`: a non-recoverable `skam-error` now fires once while the same content keeps failing with the same error. It fires again when the content or the error changes, after a successful render, or after the element is disconnected. Previously it fired on every re-render.
