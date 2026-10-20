---
'@kanbun-skam/skam-xml-parser': patch
---

Report empty input the same way in every build, and keep browser syntax error messages to the reason.

- Empty input and input made only of XML whitespace (space, tab, CR, LF) now throw `Empty document` without `line` / `column` in both builds.
  - Node build, `''`: before `XML parse error: invalid doc source`, now `Empty document` (the `XML parse error:` prefix is gone too). Whitespace-only input already gave `Empty document`.
  - Browser build, `''` and whitespace-only input: before a syntax error with a position, for example `XML parse error: This page contains the following errors:error on line 1 at column 1: Document is empty…` (Chromium) or `XML parse error: XML Parsing Error: no root element found…` (Firefox). Now `Empty document`.
- Browser build: syntax error messages are now `XML parse error: <reason>`, without Chromium's surrounding sentences or Firefox's copy of the source line, and the reason is cut at 500 characters. For example, Firefox's `XML parse error: XML Parsing Error: mismatched tag. Expected: </b>.\nLocation: about:blank\nLine Number 3, Column 8:  <b></c></a>\n-------^` becomes `XML parse error: mismatched tag. Expected: </b>.`. `line` / `column` are unchanged.
- Error message wording is not part of the compatibility promise. Use `instanceof` and `line` / `column` to tell errors apart. Messages can contain text from the input (such as element names), so do not insert them as HTML.
