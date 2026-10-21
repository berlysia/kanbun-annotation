---
'@kanbun-skam/skam': minor
---

Warn about free data in `ext` of documents without extension declarations, and add `moveLegacyExtToCustom` (ADR-040).

- In a document with neither `extensions` nor `extensionsRequired`, each object `ext` on the document, readings, blocks, tokens, marks or derivations adds a `LEGACY_EXT` warning to a valid result. If a key of that `ext` is the name of a registered extension (such as `edu`), a `LEGACY_EXT_REGISTERED_NAME` warning is added too, since the document may have forgotten to declare it. The document stays valid; `LEGACY_EXT` becomes an error in 0.4.0.
- `moveLegacyExtToCustom(doc)` returns `{ document, registeredNameKeys }`: a new document whose `ext` values are moved unchanged to `custom` on the same object, and the paths of keys that match registered extension names. It throws `TypeError` for a declared document, a non-object `ext`, or an object that already has `custom`.
- `derivations` now get the same checks on `ext` and `custom` as the other objects (input limits, forbidden keys, undeclared extension names). `ExtensionOwner` has a new `derivation` kind.
- `ValidationWarningKind` has two new members, which can break exhaustive switches.
