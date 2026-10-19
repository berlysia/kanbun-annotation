# @kanbun-skam/skam-canvas-renderer

## 0.2.0

### Minor Changes

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
