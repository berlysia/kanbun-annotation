---
'@kanbun-skam/skam-xml-parser': patch
---

Generated ids no longer collide with explicit ids.

- `parse` collects the explicit ids (`xml:id`, or `id`) of `skam:block`, `skam:ref` and `skam:br` under `skam:body` before reading the body. When the id generator returns one of them, the parser discards the value and calls the generator again, for every generator including `createSequentialIdGenerator` and your own. Before this, `createSequentialIdGenerator` could produce `b2` for an unnamed block while another block had `xml:id="b2"`, and the document failed with `DUPLICATE_ID`.
- Your generator may now be called more than once per generated id. If it keeps returning explicit ids for more than (number of explicit ids + 1) calls in a row, `parse` throws `SKAMXMLParseError`; the message does not contain the id.
- Explicit ids inside subtrees the parser does not read are avoided too, so sequential ids can skip a number there.
