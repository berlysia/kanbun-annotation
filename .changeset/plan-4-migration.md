---
'@kanbun-skam/skam': minor
'@kanbun-skam/skam-xml-parser': minor
'@kanbun-skam/skam-xml-stringify': minor
'@kanbun-skam/skam-html-renderer': minor
'@kanbun-skam/skam-canvas-renderer': minor
'@kanbun-skam/skam-web-component': minor
---

Fix the six public packages to 0.2.0 and consolidate the 0.1 to 0.2 migration table.

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
- M26 (skam-xml-parser): `@xmldom/xmldom` を 0.8.15 に上げる

For the old behavior, the new behavior and the workaround of each row, see https://github.com/berlysia/kanbun-annotation/blob/master/docs/migration-0.1-to-0.2.md
