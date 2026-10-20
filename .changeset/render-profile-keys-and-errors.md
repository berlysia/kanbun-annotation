---
'@kanbun-skam/skam': minor
---

Return render profile errors as `SKAMRenderProfileError`, export the key list, and promise the key names.

- `skam`: `@kanbun-skam/skam/rendering` exports `SKAMRenderProfileError`, `RENDER_PROFILE_KEYS`, and the types `RenderProfileErrorKind` / `RenderProfileKey`. `skam-html-renderer` and `skam-canvas-renderer` re-export them next to `resolveRenderProfile`.
- `skam`: `resolveRenderProfile` (and so `render`, `renderHTML`, the canvas renderer, and `<skam-renderer>`) now throws `SKAMRenderProfileError` for an invalid profile. It extends `TypeError`, and the messages are unchanged, so `instanceof TypeError` checks keep working; `error.constructor === TypeError` no longer holds. Read `kind` (`NOT_PLAIN_OBJECT`, `UNREADABLE_KEY`, `UNKNOWN_KEY`, `NOT_BOOLEAN`, `MIXED_BASE`, `UNKNOWN_BASE`), `where` (`'profile'` or `'profile.overrides'`) and `key` (first 64 characters) instead of parsing the message. The message text is not part of the contract. New `kind` and `where` values may be added in a minor release, so keep a default branch.
- `skam`: the 13 key names are a stable vocabulary and will not be renamed or removed in 0.x (ADR-033). Keys may be added in a minor release. The values of each key in the presets are not promised; to hide annotations for a quiz, list the keys in `overrides`.
- `skam`: `instanceof SKAMRenderProfileError` also holds for errors thrown by another copy of the class, such as the canvas `browser-bundle` (IIFE) used together with the ESM build, or an iframe. Across realms, `instanceof TypeError` is still false, and errors copied by `structuredClone` or `postMessage` are not recognized.
- `skam-web-component`: in `skam-error`, a `profile` attribute that is not a preset name and not JSON still gives a plain `TypeError`; a JSON profile that fails validation gives `SKAMRenderProfileError`.
