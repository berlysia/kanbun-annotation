---
'@kanbun-skam/skam': minor
'@kanbun-skam/skam-xml-parser': minor
'@kanbun-skam/skam-web-component': minor
---

Report where SKAM-ML errors are, fix the embedding media type, and widen the xmldom range.

- `skam-xml-parser`: every `SKAMXMLParseError` raised while handling an element now carries that element's `line` / `column` (Node build only). Only `Empty document` stays without a position (M35).
- `skam`, `skam-xml-parser`: `ValidationError` gets optional `line` / `column`. `parse()` fills them for errors whose `path` starts with `tokens[i]`, `marks[i]` or `blocks[i]`; `validateSKAMDocument` called directly does not. Code that compares errors with `toEqual` should use `toMatchObject` or drop the two keys (M36).
- `skam-web-component`: the embedding media type `application/vnd.berlysia.skam+xml` is now fixed by the spec (SKAM-ML-draft section 3.3). The string has been public since 0.1.0 and does not change.
- `skam-xml-parser`: `@xmldom/xmldom` is declared as `^0.8.15` (any 0.8.x from 0.8.15 on); the lockfile still resolves 0.8.15 (M26).

Migration rows: M26, M35, M36. See https://github.com/berlysia/kanbun-annotation/blob/master/docs/migration-0.1-to-0.2.md
