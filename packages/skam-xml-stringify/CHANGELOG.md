# @kanbun-skam/skam-xml-stringify

## 0.2.0

### Minor Changes

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

- Updated dependencies [76f5648]
- Updated dependencies [4865f7e]
- Updated dependencies [60ebfb0]
- Updated dependencies [d475d08]
- Updated dependencies [d9ae91c]
- Updated dependencies [2809081]
  - @kanbun-skam/skam@0.2.0

## 0.1.0

Initial release.
