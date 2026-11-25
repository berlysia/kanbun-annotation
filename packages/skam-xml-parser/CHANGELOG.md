# @kanbun-skam/skam-xml-parser

## 0.3.0

### Minor Changes

- a005f7b: Split ids into hand-written ids and automatic ids (SKAM-draft §3.1). A hand-written id is an XML NCName and survives round trips, so other documents can point at it. An automatic id contains `#` and follows the position: `b#2` for a block, `b#2#5` (block id, then the 1-based place in the block) for a token, `m#3` for a mark.

  - `skam`: new `isHandId`, `isAutoId`, `findIdFormIssues`, `findXmlUnwritableChars`, `renumberAutoIds` and `convertHandIdsToAuto` (experimental), and `SKAM_ML_CONTENT_MODEL` / `SKAM_ML_NESTING_ORDER`, which the parser and the stringifier now share.
  - `skam`: two new validation warnings (the document stays valid; both become errors in 0.4.0). `ID_FORM`: an id that is neither an NCName nor the automatic id of its position, a mark id that is neither an NCName nor `m#<n>`, a `highlight.ref` that does not name an existing ref mark with a hand-written id, or a hand-written id on the second or later of the yomigana, okurigana and soegana on the same anchor. `XML_UNWRITABLE_CHAR`: a character XML 1.0 cannot carry (U+0000–U+001F except tab, LF and CR, U+FFFE, U+FFFF, lone surrogates) in token text, reading text, mark strings or `placementHint`. If you treat warnings as errors, these documents now fail.
  - `skam`: new lint code `HIGHLIGHT_REF_UNLINKED`: a highlight without `ref` whose range has exactly one ref mark after its characters. Before this release the parser linked such a highlight to that ref.
  - `skam` (breaking): `generateMarkId(doc)` returns the smallest unused `m#<n>` instead of `m-<8 hex>`, and `addMark` and `splitMultiCharacterKaeri` (without `idGenerator`) use it. `generateId(doc, prefix)` and the id generators are unchanged.
  - `skam-xml-parser` (breaking): ids are no longer random. Blocks without `xml:id` get `b#<n>`, tokens `<block id>#<n>`, marks without `xml:id` `m#<n>` in output order. Every mark element can carry `xml:id`; the `xml:id` of `skam:kun` goes to the first mark it creates (yomigana, okurigana, soegana). An `xml:id` (or `id`) that is not an NCName, such as `1a` or `b#1`, is a `SKAMXMLParseError`.
  - `skam-xml-parser` (breaking): the `idGenerator` option is removed. Remove it from your `parse` calls; ids are now deterministic.
  - `skam-xml-parser` (breaking): a highlight links to a ref only through its `ref` attribute. A highlight without `ref` no longer links to the single `skam:ref` inside it; give the ref an `xml:id` and write `ref="<id>"` on the highlight. A `ref` attribute may point to a ref later in the document; pointing to a missing ref or to an element that is not a ref is a `SKAMXMLParseError`.
  - `skam-xml-stringify`: writes only hand-written ids as `xml:id` (blocks and all mark elements). The `xml:id` of `skam:kun` is the id of the first mark written inside it. New loss codes `ID_FORM` and `XML_UNWRITABLE_CHAR`.
  - Documents created with random ids (for example JSON saved from an earlier parser) keep those ids as hand-written ids. Before writing such a document to SKAM-ML, pass it through `convertHandIdsToAuto(doc, keep)`, keeping only the ids that other documents point at; ids of refs that highlights point at are always kept. `renumberAutoIds` and `convertHandIdsToAuto` do not look inside `ext` or `custom`.

- f1bd8d3: Keep the language of the base text in the document (`lang`) and use it for the display layer (ADR-041).

  - `skam`: documents have an optional top-level `lang`, a language tag such as `ja`, `lzh` or `zh-Hant`. The validator reports a non-string `lang` as `INVALID_TYPE` and a malformed one as `INVALID_VALUE` (path `lang`), and keeps a valid one in the returned document. `isLanguageTag(value)` is a new type guard for the accepted form; it does not check registered subtags.
  - `skam-xml-parser`: the root `xml:lang` becomes `lang` (an empty value means no `lang`). Parse results of documents whose root has `xml:lang` now contain `lang`, so tests that compare whole parse results need updating. `xml:lang` on other elements is still ignored.
  - `skam-xml-stringify`: writes `lang` as the escaped root `xml:lang` when it is a string.
  - `skam-html-renderer`: the display layer's `lang` is `displayLang`, then the document's `lang`, then `ja`. The container stays `lang="ja"`. The reading layer gets the document's `lang` only when it falls back to the base text. A document `lang` that does not match `isLanguageTag` is ignored. The `displayLang` error message changed.
  - `skam-web-component`: no code change; without `display-lang`, the display layer now follows the document's `lang`.
  - 0.2.x readers drop `lang` without an error.

- 017ee19: Add an explicit line break inside a block (ADR-039).

  - New position mark `linebreak` (`LinebreakMark`, no value) after a token. SKAM-ML writes it as the empty element `<skam:br/>`.
  - The validator reports `INVALID_LINEBREAK` for a line break at the block start, at the block end, inside an unbreakable unit (a tateten group, or a multi-token yomigana / okurigana / soegana / saidoku / okimoji / joji), or a second one at the same position. `getLinebreakPlacementIssues(doc)` returns the same judgment; renderers ignore those line breaks.
  - Rendering: the HTML renderer writes `<br class="<prefix>-linebreak">`, the canvas renderer starts a new column in the same block, and the accessible text inserts one space. AIR marks the unit before the break with `lineBreakAfter: true`. The render profile has a new `linebreak` key, `true` in every preset.
  - `BLOCK_START_KAERI_HINT` now points to `<skam:br/>` for breaking a line.
  - Adding `linebreak` to `MarkType`, `Mark`, `ValidationErrorKind`, `RenderProfile` and `AIRRenderProfile` can break exhaustive switches and profile objects that list every key.

- 9ba6f66: Add an extension mechanism and the learning extension `edu` with quiz marks (ADR-040).

  - Documents may declare `extensions` (used) and `extensionsRequired` (must be understood). In a declared document, extension values live under `ext.<name>`; an undeclared name in `ext`, an unknown required extension, or a required extension that is used but not listed is `INVALID_EXTENSION`. Documents without `extensions` read `ext` as free data, as before. `custom` holds free application data.
  - Extension definitions (`SKAMExtensionDefinition`) carry validation, SKAM-ML attribute mapping and render hooks. `@kanbun-skam/skam/extensions` exports the bundle of spec-defined extensions, the registry table and types; `@kanbun-skam/skam/extensions/edu` exports the learning extension. Validators, parsers, stringifiers and renderers take extra definitions via `extensions`.
  - SKAM-ML declares extensions with `<skam:extension name uri required/>` inside `skam:meta` and writes extension values as attributes in the extension's namespace (`edu:quiz`, and `edu:yomi-quiz` / `edu:okuri-quiz` / `edu:soe-quiz` on `skam:kun`). A required extension that the parser does not know is a parse error. Values of unknown extensions are the stringify loss `UNKNOWN_EXTENSION`.
  - `ext` and `custom` are limited in depth, keys, array length and total size; `__proto__`, `constructor` and `prototype` keys are rejected.
  - Quiz marks: `ext.edu.quiz` on kaeri, okurigana, soegana, yomigana, saidoku, kutoten, tateten, okototen, okimoji and joji. The renderers' `hideQuiz` (`true` or a list of names) keeps the space and does not draw the answer; the HTML output replaces the text with blanks and marks it `aria-hidden`. The web component has a `hide-quiz` attribute. Hiding is display control, not secrecy: the document still contains the answers.
  - 0.2.x readers ignore the declarations and extension values, so they show the answers even for a required extension.

- c1196a0: Tokenize and count characters by extended grapheme cluster (ADR-042). This needs `Intl.Segmenter` (Node 16+, Chrome 87+, Safari 14.1+, Firefox 125+).

  - `skam`: new `splitGraphemes(text)`, which splits a string into extended grapheme clusters with `Intl.Segmenter`. Importing works without `Intl.Segmenter`; calling it throws `TypeError`.
  - `skam-xml-parser` (breaking): each grapheme cluster becomes one token, so an ideographic variation selector (U+E0100–U+E01EF), a standardized variation selector (U+FE00–U+FE0F) or a combining mark stays in the token of its base character. Documents with such characters parse to fewer tokens, with different generated ids and indexes. Clusters do not cross element boundaries; a selector or combining mark at the start of a text node is a token of its own. Leading ignored whitespace is removed from a cluster, and a cluster of ignored whitespace only (such as `\r\n`) is not a token. A cluster's position is that of its first code point.
  - `skam-xml-stringify` (breaking): a token whose `text` has two or more grapheme clusters is the new loss `MULTI_GRAPHEME_TOKEN`, an error unless `lossy: true`, because reading the XML back would split it. Whitespace-only tokens are still reported only as `ASCII_WHITESPACE_TOKEN`. `StringifyLossCode` has a new value, which can break exhaustive switches.
  - `skam-html-renderer`: emphasis marks and the blanks for hidden quiz marks are counted per grapheme cluster.
  - `skam-canvas-renderer`: characters are drawn and ruby lengths counted per grapheme cluster, so a variation selector is no longer drawn on its own.
  - `skam-web-component`: parses with the new tokenizer.
  - Grapheme segmentation depends on the Unicode version of the runtime (for example emoji ZWJ sequences). CJK characters, variation selectors and combining marks do not change between versions.

- ed0b578: Write each kaeri (返り点) as a mark with one character. Multi-character kaeri values are deprecated and become an error in 0.4.0 (ADR-038, `docs/migration-0.2-to-0.3.md`).

  - `validateSKAMDocument` adds an optional `warnings` array to a `valid: true` result. A kaeri value with two or more characters adds a `KAERI_MULTI_CHARACTER` warning. Without warnings the key is absent. `@kanbun-skam/skam` exports `KAERI_MULTI_CHARACTER`, `ValidationWarning` and `ValidationWarningKind`.
  - The parser still reads `<skam:kaeri kind="ichi-re"/>` as one mark and emits a `ParseWarning` with `code: 'KAERI_MULTI_CHARACTER'`, also with `validate: false`. It does not forward the validator's warnings.
  - `splitMultiCharacterKaeri(doc, { idGenerator? })` splits multi-character kaeri into one-character marks at the same position.
  - Rendering: kaeri marks at the same position render as one mark whose value joins them in `marks[]` order, in the HTML renderer, the canvas renderer, `buildAnnotationIR` and the accessible text. `@kanbun-skam/skam/rendering` exports `joinKaeriValues`. Fixes the second kaeri being dropped inside a tateten group.

- 9d65384: Add `mount()` for rendering into a light DOM container, and export the SKAM-ML `<script>` extraction from the parser.

  - `skam-html-renderer`: `mount(container, doc, options)` (experimental) renders a `SKAMDocument` into a connected element in one call. It inserts the CSS once per document (or shadow root) as `<style data-skam-css>`, even when two copies of the package are on the page, sets the HTML, and calls `calibrateGridBaseline` right away and again after `document.fonts.ready`. The returned `fontsCalibrated` promise resolves after the second calibration and never rejects; a failure there is reported with `console.warn`. It throws `TypeError` for a disconnected container and leaves the DOM untouched on invalid options.
  - `skam-html-renderer`: `mount` accepts `nonce` for the `<style>` it inserts. The rendered HTML still uses inline `style` attributes for okototen positions and emphasis shapes, so a nonce-only `style-src` needs `style-src-attr` as well.
  - `skam-html-renderer`: `mount` accepts `trustedTypesPolicy` for pages that require Trusted Types. Pass a policy created for this purpose and keep it private; a passthrough policy reachable by other code weakens the page's protection.
  - `skam-html-renderer`: `mount` chooses the reading layer source the same way as `render`: `'display'` when `profile` or `hideQuiz` is given, `'readings'` otherwise.
  - `skam-xml-parser`: exports `SKAM_XML_MEDIA_TYPE` and `extractXmlFromScriptElement` (experimental), so pages can read embedded SKAM-ML without the Web Component. `skam-web-component` re-exports the same values.

- 604ad67: SKAM-ML can now write overlapping ranges, so documents without validation warnings round-trip without loss (SKAM-ML-draft §7.0, §7.16).

  - `skam-xml-parser` / `skam-xml-stringify`: ranges are written as nested elements, and a range that partially overlaps a nested one is written as a pair of empty elements, `<skam:span type="highlight" sID="r1"/>…<skam:span eID="r1"/>`. Any range element except `skam:saidoku` can be a pair. The parser rejects broken pairs with a positioned `SKAMXMLParseError`: an `sID` or `eID` that is not an NCName, a start or end without its partner, a reused `sID`, different element names, a pair across blocks, an element with both `sID` and `eID`, content other than white space and comments, attributes other than `eID` on the end element, and a pair with no token inside. Error messages do not contain the `sID` / `eID` values.
  - `skam-xml-parser` / `skam-xml-stringify`: the content model (§7.0) is relaxed. Every element that holds text can hold every range element, position marks (`kaeri`, `kutoten`, `ref`, `br`), `skam:t` and pair elements, except that `skam:yomigana`, `skam:kun` and `skam:base` cannot hold `skam:saidoku`. Same-range elements may be nested in any order; the stringifier writes the §7.0 order. `SKAM_ML_CONTENT_MODEL` now has a key for every parent element, and a known child that the table does not allow is a positioned error everywhere (including `skam:block`, where it used to be skipped with its text).
  - `skam-xml-parser` / `skam-xml-stringify`: open range elements in a block are limited to 56 (`skam:saidoku`, `skam:base`, `skam:t`, position marks and pairs do not count). The parser rejects deeper input; the stringifier writes ranges that would go deeper as pairs.
  - `skam-xml-parser`: marks are now listed in the order of their opening tags (the start element for pairs), so outer marks come before inner ones. In documents with nested marks, `marks[i]` indexes, validation error paths and automatic mark ids (`m#<n>`) change. A position mark's `after` is now the preceding token in the block at any nesting depth: `前<skam:span …><skam:kutoten value="。"/>學</skam:span>` gives the kutoten `after: 前` (it had no `after` before).
  - `skam-xml-parser` / `skam-xml-stringify`: `skam:extension` may omit `uri`. A declaration without `uri` names the extension: a name in the registry or in the passed definitions is that extension, other names are unknown extensions whose values are read from `skam:ext`. `uri=""` is an error. The stringifier omits `uri` only for extensions it does not know, so `UNKNOWN_EXTENSION` is reported only for invalid names and for unknown extensions declared as required.
  - `skam-xml-stringify`: two or more okototen on the same anchor are written instead of reported as `CONFLICTING_MARKS`. `PARTIAL_OVERLAP` is no longer reported, and `UNNESTABLE_OVERLAP` only for documents with the saidoku warnings below. The codes stay in `StringifyLossCode`.
  - `skam`: two new validation warnings (the document stays valid; both become errors in 0.4.0). `SAIDOKU_READING_OVERLAP`: a yomigana or okurigana range shares a token with a saidoku but is not on the same anchor (the same anchor is still `MARK_CONFLICT`). `SAIDOKU_MULTI_TOKEN`: a saidoku anchored to two or more tokens. To fix them, put the reading in the saidoku's `forms` and remove the yomigana / okurigana from its character, and anchor each saidoku to one character. Until then the stringifier reports the ranges it cannot nest as `UNNESTABLE_OVERLAP`.
  - Compatibility: 0.2.x parsers reject pairs and the relaxed nesting with an error; they do not drop marks silently. If a 0.2.x parser must read your output, check that the document needs neither (no partially overlapping ranges, no range elements inside `skam:yomigana` / `skam:kun`, no position marks inside range elements other than `skam:span` / `skam:tateten`).

- 2976d27: SKAM-ML can now carry tokens of any shape and the `ext`, `custom` and `placementHint` fields, so documents that pass validation round-trip without loss (SKAM-ML-draft §7.14, §10.3).

  - `skam`: new `tokenizePlainText(text)` (experimental). It splits the text of one text node into tokens by the parser's rule and returns each token's text with its start and end in the original string. The parser and the stringifier both use it. `SKAM_ML_CONTENT_MODEL` allows `t` inside the elements that hold text.
  - `skam-xml-parser`: reads `<skam:t>`. Its content becomes one token as written: it is not split into characters and its white space is kept. `xml:id` on `<skam:t>` is the token id. An empty `<skam:t>`, or one with child elements, is a `SKAMXMLParseError`.
  - `skam-xml-parser`: reads `skam:ext` and `skam:custom` (a JSON object) on the root, `skam:block`, `skam:t`, `skam:reading` and every mark element, and `placement-hint` on every mark element. On `skam:kun`, the okurigana and soegana use `skam:okuri-ext`, `skam:okuri-custom`, `okuri-placement-hint` and `skam:soe-ext`, `skam:soe-custom`, `soe-placement-hint`. These are `SKAMXMLParseError`: a value longer than 1,000,000 characters, JSON that does not parse, a value that is not an object, the same extension in a namespace attribute and in `skam:ext`, and an attribute of `skam:kun` without the part it belongs to (`skam:ext` without `yomi`, `okuri-placement-hint` without `okuri`).
  - `skam-xml-parser`: keeps the leading and trailing white space of a `skam:reading` that has `xml:space="preserve"`.
  - `skam-xml-stringify`: writes a token with `<skam:t>` when it has a hand-written id, `ext` or `custom`, or when plain text would not read back as the same tokens (two or more characters, white space, a token that combines with the one before it). Writes `ext` values without an attribute form, `custom` and `placementHint` as the attributes above, and `xml:space="preserve"` on a reading with leading or trailing white space. Tab, LF and CR in attribute values, and CR in text, are written as character references.
  - `skam-xml-stringify`: the loss codes `MULTI_GRAPHEME_TOKEN`, `ASCII_WHITESPACE_TOKEN`, `EXT` and `PLACEMENT_HINT` are no longer reported, and `UNKNOWN_EXTENSION` no longer covers extension values. Documents that threw with `lossy: false` because of them now stringify. `UNKNOWN_EXTENSION` remains for declaring an extension that is neither in the registry nor passed as a definition, because `skam:extension` needs its namespace URI. The codes stay in `StringifyLossCode`.
  - Older parsers drop `<skam:t>` and the text inside it with a warning, and ignore the new attributes. Read output of this version with this version's parser.

- caa7477: Render `<skam-renderer>` through the html-renderer's `mount()`, fix `class-prefix`, and support Trusted Types from parsing to rendering.

  - `skam-web-component`: `<skam-renderer>` now calibrates the grid baseline right after rendering and again after `document.fonts.ready`, like `mount()`. Fonts loaded by `auto-font` are now taken into account.
  - `skam-web-component`: with a `class-prefix` other than `skam`, the CSS variables are now `--{class-prefix}-*`, as the README described. Before, the rendered CSS used `--skam-*` while the element set `--{class-prefix}-*`, so baseline calibration, variable overrides on the host and `auto-font` had no effect with a custom prefix. Without `class-prefix`, the output is unchanged.
  - `skam-web-component`: new `trustedTypesPolicy` property (experimental) for pages that require Trusted Types. The element passes it to both `parse` and `mount`, so `createHTML` receives the SKAM-ML source and then the rendered HTML. Return the XML unchanged; do not pass an HTML sanitizer as is. If `createHTML` throws, the element reports a non-recoverable `skam-error` with that error's message.
  - `skam-web-component`: the element no longer renders while it is disconnected. Content set before the element is attached is rendered once it is connected, and `skam-render` fires then.
  - `skam-web-component`: the shadow root keeps exactly one `<style data-skam-css>` for the rendered CSS, replaced on every render.
  - `skam-xml-parser`: new `trustedTypesPolicy` parse option (experimental). The browser build passes `createHTML(xml)` to `DOMParser.parseFromString`, which Trusted Types otherwise blocks. It is called once, after the input-limit checks, and its errors propagate unchanged. Limits and positions are computed on the original string, so the policy must return the XML unchanged. The Node build ignores the option.

### Patch Changes

- b610edd: Report line and column in the browser build of the parser.

  - `skam-xml-parser`: in the browser build, errors raised while processing an element, validation errors in `SKAMValidationError.errors`, and warnings passed to `onWarning` now carry the same `line` / `column` as the Node build: the `<` of the element's start tag, 1-based, with columns in UTF-16 units. The browser DOM has no positions, so they are computed from the source only when an error or warning needs one. Parses without errors cost the same as before. If the start tags in the source and the elements in the document do not line up by count and name, no position is attached.
  - `skam-xml-parser`: XML syntax errors in the browser build now carry the `line` / `column` that Chromium (`error on line N at column M`) or Firefox (`Line Number N, Column M`) reports. These values differ between browsers and from the Node build; use them to look near the error, not for comparison. Other browsers' reports (WebKit is unverified) still give no position. The error message is unchanged.
  - The keys are new in the browser build. Tests that compare `SKAMValidationError.errors` or warnings with `toEqual` see the extra `line` / `column`; drop them from the comparison or use `toMatchObject`.

- ff1f4ea: Recognize the SKAM error classes across copies, and drop the location fragment from the Node parser's error message.

  - `skam`, `skam-xml-parser`, `skam-xml-stringify`: `instanceof SKAMValidationError`, `instanceof SKAMXMLParseError` and `instanceof SKAMXMLStringifyError` now also hold for errors thrown by another copy of the class, such as a duplicated dependency, the canvas `browser-bundle` (IIFE) used together with the ESM build, or an iframe. The classes carry the same kind of `Symbol.for` brand as `SKAMRenderProfileError`. A copy from an earlier version has no brand, so mixing it with this version is still false in both directions. Across realms, `instanceof Error` is still false, and errors copied by `structuredClone` or `postMessage` are not recognized. No export or type is added.
  - `skam-xml-parser`: in the Node build, `parse('')` threw `XML parse error: invalid doc source\n@#[line:0,col:undefined]`. It now throws `XML parse error: invalid doc source`, with no `line` / `column`. The xmldom location fragment is removed from every message, and `line` / `column` are attached only when both are integers of 1 or more. Other messages and positions are unchanged.

- a3a8f13: Report empty input the same way in every build, and keep browser syntax error messages to the reason.

  - Empty input and input made only of XML whitespace (space, tab, CR, LF) now throw `Empty document` without `line` / `column` in both builds.
    - Node build, `''`: before `XML parse error: invalid doc source`, now `Empty document` (the `XML parse error:` prefix is gone too). Whitespace-only input already gave `Empty document`.
    - Browser build, `''` and whitespace-only input: before a syntax error with a position, for example `XML parse error: This page contains the following errors:error on line 1 at column 1: Document is empty…` (Chromium) or `XML parse error: XML Parsing Error: no root element found…` (Firefox). Now `Empty document`.
  - Browser build: syntax error messages are now `XML parse error: <reason>`, without Chromium's surrounding sentences or Firefox's copy of the source line, and the reason is cut at 500 characters. For example, Firefox's `XML parse error: XML Parsing Error: mismatched tag. Expected: </b>.\nLocation: about:blank\nLine Number 3, Column 8:  <b></c></a>\n-------^` becomes `XML parse error: mismatched tag. Expected: </b>.`. `line` / `column` are unchanged.
  - Error message wording is not part of the compatibility promise. Use `instanceof` and `line` / `column` to tell errors apart. Messages can contain text from the input (such as element names), so do not insert them as HTML.

- ad3d600: Generated ids no longer collide with explicit ids.

  - `parse` collects the explicit ids (`xml:id`, or `id`) of `skam:block`, `skam:ref` and `skam:br` under `skam:body` before reading the body. When the id generator returns one of them, the parser discards the value and calls the generator again, for every generator including `createSequentialIdGenerator` and your own. Before this, `createSequentialIdGenerator` could produce `b2` for an unnamed block while another block had `xml:id="b2"`, and the document failed with `DUPLICATE_ID`.
  - Your generator may now be called more than once per generated id. If it keeps returning explicit ids for more than (number of explicit ids + 1) calls in a row, `parse` throws `SKAMXMLParseError`; the message does not contain the id.
  - Explicit ids inside subtrees the parser does not read are avoided too, so sequential ids can skip a number there.

- Updated dependencies [a005f7b]
- Updated dependencies [f1bd8d3]
- Updated dependencies [76e914f]
- Updated dependencies [ff1f4ea]
- Updated dependencies [017ee19]
- Updated dependencies [9ba6f66]
- Updated dependencies [c1196a0]
- Updated dependencies [d1ce284]
- Updated dependencies [e689a67]
- Updated dependencies [ed0b578]
- Updated dependencies [74b8b89]
- Updated dependencies [c2d7649]
- Updated dependencies [5096a6d]
- Updated dependencies [daf455a]
- Updated dependencies [604ad67]
- Updated dependencies [8736e77]
- Updated dependencies [2976d27]
  - @kanbun-skam/skam@0.3.0

## 0.2.0

### Minor Changes

- 76f5648: Report where SKAM-ML errors are, fix the embedding media type, and widen the xmldom range.

  - `skam-xml-parser`: every `SKAMXMLParseError` raised while handling an element now carries that element's `line` / `column` (Node build only). Only `Empty document` stays without a position (M35).
  - `skam`, `skam-xml-parser`: `ValidationError` gets optional `line` / `column`. `parse()` fills them for errors whose `path` starts with `tokens[i]`, `marks[i]` or `blocks[i]`; `validateSKAMDocument` called directly does not. Code that compares errors with `toEqual` should use `toMatchObject` or drop the two keys (M36).
  - `skam-web-component`: the embedding media type `application/vnd.berlysia.skam+xml` is now fixed by the spec (SKAM-ML-draft section 3.3). The string has been public since 0.1.0 and does not change.
  - `skam-xml-parser`: `@xmldom/xmldom` is declared as `^0.8.15` (any 0.8.x from 0.8.15 on); the lockfile still resolves 0.8.15 (M26).

  Migration rows: M26, M35, M36. See https://github.com/berlysia/kanbun-annotation/blob/master/docs/migration-0.1-to-0.2.md

- d475d08: Make the XML layer and the core validator strict, and stop dropping data silently.

  Breaking changes: `stringify()` throws `SKAMXMLStringifyError` instead of dropping what SKAM-ML cannot represent, the parser is strict and validates by default, and the validator rejects more documents (including two marks of the same type on one anchor and a kaeri at the start of a block). The old behavior, the new behavior and the workaround of each change are in the migration table: https://github.com/berlysia/kanbun-annotation/blob/master/docs/migration-0.1-to-0.2.md

  Features / Fixes

  - SKAM-ML-draft section 7.0 is now the normative content model table. `SKAM_ML_CONTENT_MODEL` is exported from `skam-xml-parser` and `skam-xml-stringify` (`@experimental`; the value may change in a minor release while the version is 0.x).
  - `skam-xml-parser` keeps a kun inside a character-wrapping element (okimoji / joji / okototen / saidoku base) and nested wrapping elements, which it used to drop silently, and accepts joji inside okimoji (a relaxation).
  - `skam-xml-stringify` writes multi-character okimoji / joji / okototen / saidoku as wrapping elements, nests elements that share a range in the fixed order of section 7.0 (`SKAM_ML_NESTING_ORDER`, `@experimental`), and hoists a trailing position mark (kaeri / kutoten / ref) out of every range that ends on the same character.

  Loss reporting

  - `skam-xml-stringify` reports `UNNESTABLE_OVERLAP` when the content model forbids the nesting: a range kun inside a range kun, yomigana and a wrapping element on the same range, a position mark in the middle of a wrapping or kun range, and a saidoku inside a wrapping element. The outer range is dropped.
  - New loss code `CONFLICTING_MARKS` (same-type marks on the same anchor in unvalidated input).

  New APIs (additive)

  - `SKAM_ML_CONTENT_MODEL` (parser and stringify, `@experimental`), `SKAM_ML_NESTING_ORDER` (stringify, `@experimental`), `isValidEmphasisStyle`, `BLOCK_START_KAERI_HINT`, `ParseWarning` / `onWarning`, `SKAMXMLStringifyError` / `StringifyLoss`.

- 2809081: Fix the six public packages to 0.2.0 and consolidate the 0.1 to 0.2 migration table.

  Every row of the migration table, with a one-line summary:

  - M01 (skam, skam-xml-parser, skam-xml-stringify, skam-html-renderer, skam-canvas-renderer, skam-web-component): CHANGELOG から未公開の 0.1.1 (scope の改名) の節を消した。npm の名前は 0.1.0 から `@kanbun-skam/*` のままで、対応は不要
  - M02 (skam-xml-stringify): `stringify()` が表現できないものがあると `SKAMXMLStringifyError` を投げる
  - M03 (skam-xml-stringify): `stringify()` の出力の形が変わる
  - M04 (skam-xml-stringify): 内容モデルに違反する重なりと、同じ種類の注記の重複が欠落として扱われる
  - M05 (skam-xml-parser): `parse()` が厳格になり、既定で検証する
  - M06 (skam-xml-parser): ブロック先頭の返り点を含む XML は `validate: false` でも拒否する
  - M07 (skam, skam-xml-parser): validator が不正な文書を拒否する範囲が広がる。0.1.0 で valid だった文書が不正になりうる
  - M08 (skam, skam-xml-parser, skam-xml-stringify): 同じ anchor に同じ種類の注記が 2 つあると `MARK_CONFLICT` で拒否する
  - M09 (skam, skam-xml-parser, skam-xml-stringify): JSON のブロック先頭の返り点は `BLOCK_START_KAERI` で拒否する
  - M10 (skam-xml-parser, skam-xml-stringify): 字を包む要素の中の `kun` と、入れ子の包む要素を保持する。okimoji の中の joji を受理する
  - M11 (skam-xml-parser): parser が空のブロックを受理し、`onWarning` と `SKAMValidationError` の再 export を足す
  - M12 (skam-html-renderer, skam-canvas-renderer): 描画のオプションが不正だと `TypeError` を同期的に投げる
  - M13 (skam-html-renderer): 文書由来・オプション由来の値を、エスケープするか許可リストで検査する
  - M14 (skam-html-renderer): emphasis の任意の 1 文字の出力が CSS の文字列になる
  - M15 (skam-html-renderer, skam-web-component): 読み層が白文にフォールバックし、`aria-label` を付けない
  - M16 (skam-html-renderer): ref の番号が本文の出現順になる
  - M17 (skam-canvas-renderer): canvas の `writingMode` の型を `'vertical'` に絞る
  - M18 (skam-canvas-renderer): canvas の大きさを `autoSize` で設定する。`maxExtent` はデバイスピクセルで表す
  - M19 (skam-canvas-renderer): canvas が okototen を描画する。グリッド外の okototen は描かない
  - M20 (skam-web-component): `skam-error` の detail が増え、同じ不正な値では再発火しない
  - M21 (skam-web-component): SSR 中に import できる
  - M22 (skam-html-renderer, skam-web-component): `displayLang` オプションと `display-lang` 属性を足す
  - M23 (skam, skam-xml-parser, skam-xml-stringify, skam-html-renderer): 公開 API を足す (いずれも非破壊の追加)
  - M24 (skam, skam-xml-parser, skam-xml-stringify, skam-html-renderer, skam-canvas-renderer, skam-web-component): exports の条件の順序を変え、`./auto` に `types` を足す
  - M25 (skam-canvas-renderer): 実際の `HTMLCanvasElement` と 2D context を、キャストなしで渡せる
  - M26 (skam-xml-parser): `@xmldom/xmldom` を 0.8.15 に上げ、指定を `^0.8.15` (0.8.15 以上の 0.8 系) にする
  - M27 (skam, skam-html-renderer, skam-canvas-renderer, skam-web-component): 公開 API を足す (`RENDER_PROFILES`、`resolveRenderProfile`、`RenderProfileInput`、`RenderProfileName`、`extractXmlFromScriptElement`。非破壊の追加)
  - M28 (skam-html-renderer): `render` / `renderHTML` / `validateRenderOptions` が不正な `profile` で `TypeError` を投げる
  - M29 (skam-canvas-renderer): `render` / `measure` が不正な `profile` で `TypeError` を投げる
  - M30 (skam-html-renderer): `includeReadingLayer` が真偽値でないと `TypeError` を投げる
  - M31 (skam-web-component): 不正な `profile` / `include-reading-layer` 属性は描画せず、`skam-error` を `recoverable: false` で発火する
  - M32 (skam-web-component): 不正な `writing-mode` / `copyable` 属性を `skam-error` (`recoverable: true`) で通知する。描画は変わらない
  - M33 (skam-html-renderer, skam-canvas-renderer): `PROFILES` を凍結し、型を readonly にする
  - M34 (skam): AIR の `trailingMarks` に、隠した置き字・助字が入らなくなる
  - M35 (skam-xml-parser): 要素の処理中に投げる `SKAMXMLParseError` が、その要素の `line` / `column` を持つ (Node 版)
  - M36 (skam, skam-xml-parser): `ValidationError` に任意の `line` / `column` を足し、parser 経由の検証エラーに元の要素の位置が付く (Node 版)
  - M37 (skam, skam-html-renderer, skam-web-component): 読み上げ用テキストの API (`describeAnnotationIR`、`formatAccessibleText`、`readingLayerSource`、`accessibleLabels`、`reading-layer-source` 属性) を足す (`@experimental`、非破壊の追加)

  For the old behavior, the new behavior and the workaround of each row, see https://github.com/berlysia/kanbun-annotation/blob/master/docs/migration-0.1-to-0.2.md

### Patch Changes

- d9ae91c: Make the renderers safe against hostile documents and options, fix the reading layer, draw okototen on canvas, and make the web component SSR-safe.

  Breaking changes: invalid render options now throw `TypeError`, the reading layer falls back to plain text and no longer carries an `aria-label`, refs are numbered in source order, the canvas `writingMode` type is narrowed and the canvas size is set by autoSize, okototen is drawn on canvas, and the `skam-error` detail gains `recoverable` and `attribute`. The old behavior, the new behavior and the workaround of each change are in the migration table: https://github.com/berlysia/kanbun-annotation/blob/master/docs/migration-0.1-to-0.2.md

  Fixes

  - All document-derived and option-derived values are escaped or checked against an allowlist in the html-renderer output.
  - `skam-web-component` can be imported during SSR.

  Features

  - `displayLang` option / `display-lang` attribute.
  - Canvas renders okototen.
  - `validateRenderOptions` / `validateCSSOptions` are exported.
  - `skam`: new public API `HIGHLIGHT_STYLES`, `isValidHighlightStyle`, `resolveOkototenCell`, and an okototen slot in the annotation IR.
  - `skam-xml-parser`: uses `isValidHighlightStyle`.

- Updated dependencies [76f5648]
- Updated dependencies [4865f7e]
- Updated dependencies [60ebfb0]
- Updated dependencies [d475d08]
- Updated dependencies [d9ae91c]
- Updated dependencies [2809081]
  - @kanbun-skam/skam@0.2.0

## 0.1.0

Initial release.
