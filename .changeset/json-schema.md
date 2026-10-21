---
'@kanbun-skam/skam': minor
---

Ship JSON Schemas (2020-12) for SKAM documents (ADR-043).

- `@kanbun-skam/skam/schema/skam.schema.json` (`$id` `urn:kanbun-skam:schema:skam-0.1`) and `@kanbun-skam/skam/schema/ext-edu.schema.json` (`$id` `urn:kanbun-skam:schema:ext-edu-1`). The ids are identifiers and are not fetched: register both schemas with your validator before compiling `skam.schema.json`.
- `validateSKAMDocument` stays the reference. The schemas copy the structural rules and are looser: id references, block and token consistency, anchor order, mark conflicts, line break placement, extension declarations versus `ext` keys, the nesting depth and total value count of `ext` and `custom`, and the character class of a one-character emphasis style are checked only by the validator. Passing the schema does not make untrusted input safe; run untrusted input through the validator.
- Unknown mark types are rejected. Unknown fields on marks and other objects, and unknown top-level keys, are accepted (the validator keeps the former and drops the latter).
- `ext.edu` is checked only in documents that list `edu` in `extensions`.
- The schema paths and ids are public. Within one `$id`, later releases only widen what the schema accepts; a narrowing change will be marked as breaking.
- SKAM-draft §11.1 now states that unknown mark types are errors and unknown fields are kept.
