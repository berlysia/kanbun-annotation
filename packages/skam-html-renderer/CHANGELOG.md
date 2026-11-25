# @kanbun-skam/skam-html-renderer

## 0.3.0

### Minor Changes

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

- daf455a: Overlapping range annotations are drawn as their ranges, and every character is drawn exactly once.

  - `skam`: new validation warning `READING_OVERLAP` (the document stays valid; it becomes an error in 0.4.0). It is reported for each yomigana, okurigana or soegana whose range shares a character with another annotation of the same type on a different anchor (the same anchor is still `MARK_CONFLICT`). To fix it, remove one of the readings or split the ranges so they no longer share a character. Readings of different types may share characters (a range yomigana with an okurigana on one of its characters).
  - `skam` (breaking): the AIR (`@kanbun-skam/skam/rendering`) changes shape.
    - A yomigana over two or more characters is an `AIRRubyGroupNode` (`type: 'ruby-group'`, `yomigana`, `fromTokenId`, `toTokenId`, `span`, `children`). An okurigana or soegana range is put on the slot of its last character.
    - Tateten and highlight groups that cross another range are split into fragments with `continuesBefore` / `continuesAfter`. A highlight's `refLabel` is on its last fragment only. Groups may contain ruby groups, tateten separators and groups of the same type.
    - Each character node carries only its own annotations. New: `joinedWithNext` (no line break before the next character), `slots.saidoku` (all forms), `slots.emphasisStyle`, `slots.kutotenValues`, `slots.refLabels`, and `hidden` on tateten separators.
    - Removed: `AIRRangeInfo`, `AIRTrailingMark`, `AIRTokenNode.rangeInfo` / `rangeConsumed`, `AIRTatetenGroupNode.rangeInfo`. `AIRBlockChild` and the group `children` unions now include `AIRRubyGroupNode` and `AIRTatetenSeparator`, so exhaustive switches over them need new cases.
  - `skam` (breaking): `getTatetenGroups` and `getHighlightGroups` return every group of a character (`Map<tokenId, Mark[]>`, in `marks` order). `getRangeMarkGroups` is unchanged.
  - Rendering:
    - Ranges that cross each other are drawn as their ranges: a range reading inside a tateten that starts after the tateten's first character is drawn (it was dropped), an okurigana range crossing a yomigana range is drawn, overlapping tateten and highlight marks are all drawn, and okimoji, joji and emphasis marks stay on their own characters.
    - A non-レ kaeri on a one-character tateten is kept on the character (it was dropped), and two kaeri marks that wanted the same tateten separator are both drawn.
    - When readings of the same type overlap (`READING_OVERLAP`), the first one in `marks` is drawn and later ones that share a character are not. Several yomigana, okurigana or soegana on the same anchor (`MARK_CONFLICT`) are no longer concatenated; the first one is drawn.
    - Highlights that share a character are drawn in separate lanes, each further from the characters (`AIRHighlightGroupNode.lane`, set from 1; all fragments of a highlight share its lane). Documents without such highlights render as before.
    - Only the first emphasis mark of a character is drawn.
    - Limits for documents that do not pass validation: per block, up to 1,024 tateten and highlight marks, up to 8 fragments per mark and a range nesting depth of 56 are drawn; further marks are not drawn, and characters are always drawn.
  - `skam-html-renderer`:
    - The renderer draws only from the AIR and no longer looks marks up again.
    - In ruby mode, the base text of a range reading is split into one `skam-base-seg` element per character.
    - The characters of an okurigana or soegana range are separate `skam-token` elements, so interactive mode gives each a `data-token-id` instead of `data-token-from` / `data-token-to`.
    - Line breaks follow the same indivisible units as the validator (`joinedWithNext`).
    - A highlight that contains a tateten with a reading gets the four-row grid like other blocks with readings.
  - `skam-canvas-renderer`: draws the new AIR, including fragments that continue across crossing ranges. The unused internal `buildRenderTree` was removed.

- 8df0c9c: Read the display layer by default when a profile is given, so a quiz that hides annotations does not read the answer aloud.

  - `skam-html-renderer` (breaking): when `profile` or `hideQuiz` is given and `readingLayerSource` is left out, `render`, `renderHTML` and `mount` use `readingLayerSource: 'display'`. Before this release only `hideQuiz` did. Without `profile` and `hideQuiz`, the default is still `'readings'`. To keep reading the author's readings with a profile, write `readingLayerSource: 'readings'`.
  - `skam-web-component` (breaking): `<skam-renderer>` with a `profile` attribute and no `reading-layer-source` reads the display layer. Write `reading-layer-source="readings"` to keep the author's readings.

- 0e41f9e: Render without inline `style` attributes for pages whose CSP uses a nonce-only `style-src`, and pass the nonce through the Web Component.

  - `skam-html-renderer`: new `inlineStyles` render option (experimental, default `true`). With `false`, okototen positions and emphasis shapes are emitted as `data-okototen-*` and `data-emphasis-style` attributes instead of `style` attributes. The default output is unchanged.
  - `skam-html-renderer`: new `applyRenderedStyles(root)` (experimental) sets those values through the CSSOM, which CSP does not block. It accepts only safe non-negative integers for positions and emphasis keywords or one character for shapes; other attribute values are ignored.
  - `skam-html-renderer`: `mount()` now always renders with `inlineStyles: false` and calls `applyRenderedStyles`, so it no longer needs `style-src-attr` on nonce-only CSP pages. `MountResult.html` (and the string given to a Trusted Types `createHTML`) is the data-attribute version; call `applyRenderedStyles` if you insert it elsewhere. `MountOptions` no longer accepts `inlineStyles`.
  - `skam-web-component`: `<skam-renderer nonce="…">` puts the nonce on its shadow-root `<style>` elements, passes it to `mount`, and adds it to the Google Fonts `<link>` that `auto-font` inserts. Set the nonce before the element is connected; changing it later does not re-render by itself.

### Patch Changes

- 76e914f: Keep the emphasis keyword check in one place and expose it as `isEmphasisKeyword`.

  - `skam`: `@kanbun-skam/skam/rendering` now exports `isEmphasisKeyword(style)`, which is true only for the 15 emphasis keywords (`dot`, `filled circle`, `open sesame`, and so on). It is an additive API, shipped as a patch because the 0.x packages are released at the same version and `skam-html-renderer` depends on `skam` at an exact version.
  - `skam`, `skam-html-renderer`: `isValidEmphasisStyle`, `resolveEmphasisCharacter`, and the HTML output are unchanged. The keyword list and its characters now come from a single table in `skam`.

- d1ce284: Draw custom emphasis characters in grid mode and on Canvas, and make the emphasis keyword lookup strict.

  - `skam`, `skam-html-renderer`, `skam-canvas-renderer`: a one-character `style` of an emphasis mark (for example `★`) is now drawn in grid mode and on Canvas. It used to fall back to `•`. Ruby mode already drew it.
  - `skam`: `resolveEmphasisCharacter` now accepts `unknown` and matches the 15 emphasis keywords exactly. A value with different case or surrounding spaces (`Circle`, ` circle`) and a bare `open` are no longer taken for a keyword, and become the default `•`. A value that `validateSKAMDocument` would reject also becomes `•`. For documents that pass the validator, the output only changes for custom characters.
  - `skam-html-renderer`: `generateEmphasisMarks` now escapes HTML special characters in the emphasis character (`<` becomes `&lt;`).
  - `skam-html-renderer`: removed the CSS for `.skam-suffix-kana`, an element the renderer never outputs.

- 5096a6d: Look up the marks of each token from an index built once per render.

  - `@kanbun-skam/skam/rendering` exports `createMarkLookup(marks, tokenGroups)` and the types `MarkLookup` and `TokenMarks`. Pass `groupTokensByBlock(blocks, tokens).map((g) => g.tokens)` as `tokenGroups`. The returned function gives the marks of a token by type in O(1).
  - `getMarksForToken(tokenId, marks, allTokens)` keeps its signature and results. It builds the index on every call, so use `createMarkLookup` to look up many tokens.
  - The HTML renderer, the canvas renderer and `buildAnnotationIR` build the index once per render. On a 2000-character document with highlights on 1 in 10 characters, the HTML `render()` took 2239 ms before and 12 ms after.
  - HTML renderer fix: the middle tokens of a range mark (emphasis, highlight, okimoji and others) were chosen by the order of `tokens[]`. They now follow the source order (`blocks[].tokenIds`), as the canvas renderer and `buildAnnotationIR` already did. Output changes only for documents whose `tokens[]` is not in source order.

- f742409: Keep the reading layer hidden against page CSS, and separate blocks in its plain-text fallback.

  - `skam-html-renderer`: the rule that visually hides `.skam-reading` now marks every declaration `!important` and adds `min-width: 0` and `min-height: 0`. With the default `@layer`, page CSS such as `.skam-reading { position: static; min-width: 10em }` no longer puts the reading text on screen. Previously any unlayered page rule won, because layered declarations lose to unlayered ones regardless of specificity. With `useLayer: false`, a page rule marked `!important` can still win. The selector is still wrapped in `:where()`.
  - `skam-html-renderer`: when a document has no readings, the default `readingLayerSource: 'readings'` now puts one half-width space between blocks in the plain text, the same separator as `'display'`. For example, two blocks render as `學而時習之 不亦說乎` instead of `學而時習之不亦說乎`. Documents with `yomiage` or `kakikudashi` are unchanged. Snapshots of the reading layer of such documents need to be updated.

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

- 4865f7e: Add reading-layer text derived from what the display layer shows (experimental).

  - `skam`: `describeAnnotationIR` builds a language-independent structure from an AIR, `formatAccessibleText` turns it into raw Japanese text, and `DEFAULT_ACCESSIBLE_LABELS` holds the default words. Types: `AccessibleNote`, `AccessibleUnit`, `AccessibleBlock`, `AccessibleLabels`. All of them are `@experimental`.
  - `skam-html-renderer`: the `readingLayerSource: 'display'` option makes the reading layer say only the annotations the `profile` shows, and never `readings` or the plain text. The default `'readings'` is unchanged. `accessibleLabels` overrides the words per note kind. Invalid values throw `TypeError`.
  - `skam-web-component`: the `reading-layer-source` attribute (`readings` or `display`). Other values are invalid and nothing is rendered, like `profile`.
  - The reading words are experimental and may change in a minor release of 0.x. A hidden annotation is only kept out of the reading layer when `readingLayerSource: 'display'` is used; the HTML source and the embedded SKAM-ML still contain it.

  Migration row: M37. See https://github.com/berlysia/kanbun-annotation/blob/master/docs/migration-0.1-to-0.2.md

- 60ebfb0: Validate render profiles strictly and keep hidden annotations hidden.

  - `profile` is resolved and validated in one place (`resolveRenderProfile` in `@kanbun-skam/skam/rendering`). Unknown keys, non-boolean values and mixed `base` forms throw `TypeError` in the html and canvas renderers (M28, M29). `includeReadingLayer` must be a boolean (M30).
  - The `{ base, overrides }` form of `profile` lets you start from a preset and change a few items. A partial profile still overlays full.
  - `<skam-renderer>` does not render when `profile` or `include-reading-layer` is invalid, and emits a non-recoverable `skam-error` (M31). Invalid `writing-mode` and `copyable` are now reported with a recoverable `skam-error` (M32).
  - `PROFILES` is frozen and its type is readonly (M33).
  - `skam`: `buildAnnotationIR` no longer puts hidden okimoji and joji into a range's `trailingMarks` (M34).
  - New API: `RENDER_PROFILES`, `resolveRenderProfile`, `RenderProfileInput`, `RenderProfileName`, and `extractXmlFromScriptElement` (experimental) (M27).

  Migration rows: M27 to M34. See https://github.com/berlysia/kanbun-annotation/blob/master/docs/migration-0.1-to-0.2.md

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

- Updated dependencies [76f5648]
- Updated dependencies [4865f7e]
- Updated dependencies [60ebfb0]
- Updated dependencies [d475d08]
- Updated dependencies [d9ae91c]
- Updated dependencies [2809081]
  - @kanbun-skam/skam@0.2.0

## 0.1.0

Initial release.
