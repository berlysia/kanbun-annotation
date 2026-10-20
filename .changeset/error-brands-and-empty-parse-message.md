---
'@kanbun-skam/skam': patch
'@kanbun-skam/skam-xml-parser': patch
'@kanbun-skam/skam-xml-stringify': patch
---

Recognize the SKAM error classes across copies, and drop the location fragment from the Node parser's error message.

- `skam`, `skam-xml-parser`, `skam-xml-stringify`: `instanceof SKAMValidationError`, `instanceof SKAMXMLParseError` and `instanceof SKAMXMLStringifyError` now also hold for errors thrown by another copy of the class, such as a duplicated dependency, the canvas `browser-bundle` (IIFE) used together with the ESM build, or an iframe. The classes carry the same kind of `Symbol.for` brand as `SKAMRenderProfileError`. A copy from an earlier version has no brand, so mixing it with this version is still false in both directions. Across realms, `instanceof Error` is still false, and errors copied by `structuredClone` or `postMessage` are not recognized. No export or type is added.
- `skam-xml-parser`: in the Node build, `parse('')` threw `XML parse error: invalid doc source\n@#[line:0,col:undefined]`. It now throws `XML parse error: invalid doc source`, with no `line` / `column`. The xmldom location fragment is removed from every message, and `line` / `column` are attached only when both are integers of 1 or more. Other messages and positions are unchanged.
