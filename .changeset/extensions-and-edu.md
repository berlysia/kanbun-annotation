---
'@kanbun-skam/skam': minor
'@kanbun-skam/skam-xml-parser': minor
'@kanbun-skam/skam-xml-stringify': minor
'@kanbun-skam/skam-html-renderer': minor
'@kanbun-skam/skam-canvas-renderer': minor
'@kanbun-skam/skam-web-component': minor
---

Add an extension mechanism and the learning extension `edu` with quiz marks (ADR-040).

- Documents may declare `extensions` (used) and `extensionsRequired` (must be understood). In a declared document, extension values live under `ext.<name>`; an undeclared name in `ext`, an unknown required extension, or a required extension that is used but not listed is `INVALID_EXTENSION`. Documents without `extensions` read `ext` as free data, as before. `custom` holds free application data.
- Extension definitions (`SKAMExtensionDefinition`) carry validation, SKAM-ML attribute mapping and render hooks. `@kanbun-skam/skam/extensions` exports the bundle of spec-defined extensions, the registry table and types; `@kanbun-skam/skam/extensions/edu` exports the learning extension. Validators, parsers, stringifiers and renderers take extra definitions via `extensions`.
- SKAM-ML declares extensions with `<skam:extension name uri required/>` inside `skam:meta` and writes extension values as attributes in the extension's namespace (`edu:quiz`, and `edu:yomi-quiz` / `edu:okuri-quiz` / `edu:soe-quiz` on `skam:kun`). A required extension that the parser does not know is a parse error. Values of unknown extensions are the stringify loss `UNKNOWN_EXTENSION`.
- `ext` and `custom` are limited in depth, keys, array length and total size; `__proto__`, `constructor` and `prototype` keys are rejected.
- Quiz marks: `ext.edu.quiz` on kaeri, okurigana, soegana, yomigana, saidoku, kutoten, tateten, okototen, okimoji and joji. The renderers' `hideQuiz` (`true` or a list of names) keeps the space and does not draw the answer; the HTML output replaces the text with blanks and marks it `aria-hidden`. The web component has a `hide-quiz` attribute. Hiding is display control, not secrecy: the document still contains the answers.
- 0.2.x readers ignore the declarations and extension values, so they show the answers even for a required extension.
