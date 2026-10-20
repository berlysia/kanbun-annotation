---
'@kanbun-skam/skam-xml-parser': patch
---

Report line and column in the browser build of the parser.

- `skam-xml-parser`: in the browser build, errors raised while processing an element, validation errors in `SKAMValidationError.errors`, and warnings passed to `onWarning` now carry the same `line` / `column` as the Node build: the `<` of the element's start tag, 1-based, with columns in UTF-16 units. The browser DOM has no positions, so they are computed from the source only when an error or warning needs one. Parses without errors cost the same as before. If the start tags in the source and the elements in the document do not line up by count and name, no position is attached.
- `skam-xml-parser`: XML syntax errors in the browser build now carry the `line` / `column` that Chromium (`error on line N at column M`) or Firefox (`Line Number N, Column M`) reports. These values differ between browsers and from the Node build; use them to look near the error, not for comparison. Other browsers' reports (WebKit is unverified) still give no position. The error message is unchanged.
- The keys are new in the browser build. Tests that compare `SKAMValidationError.errors` or warnings with `toEqual` see the extra `line` / `column`; drop them from the comparison or use `toMatchObject`.
