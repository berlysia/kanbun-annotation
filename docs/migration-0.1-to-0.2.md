# 0.1.x から上げるときにやること

SKAM の 6 つの公開パッケージ (`@kanbun-skam/skam`、`skam-xml-parser`、`skam-xml-stringify`、`skam-html-renderer`、`skam-canvas-renderer`、`skam-web-component`) を、0.1.x から 0.2.x に上げる人に向けた文書。公開されている 0.1.x は 0.1.0 だけで、どこから上げても手順は同じ。0.2.x の版の間の変更は、各パッケージの CHANGELOG にある。

各項目の ID (M02 など) は、CHANGELOG の ID と同じ。

## やること

### M02: 表現できない内容で例外を投げる (skam-xml-stringify)

- 対象: `stringify` に、SKAM-ML で表現できない内容 (`ext`、`derivations`、`placementHint`、部分交差する範囲、ASCII 空白だけの token、存在しない参照など) を含む文書を渡している。
- やること: `SKAMXMLStringifyError` を捕捉し、`losses` を読む。捨ててよい場合は `{ lossy: true }` を渡し、捨てた内容を `onLoss` で受ける。このとき戻り値は XML だけになる。

### M03: 出力する XML の形 (skam-xml-stringify)

- 対象: `stringify` の出力を diff している、または XML として保存している。
- やること: 今の版の出力で保存し直す。出力の形を固定したいときは、今の版の出力をスナップショットにする。

### M04: 入れ子にできない範囲を捨てる (skam-xml-stringify)

- 対象: 範囲 kun の入れ子、同じ範囲の yomigana と包む要素、範囲の途中の位置マーク、包む要素の中の saidoku などを含む文書を `stringify` に渡している。
- やること: 入力の文書を直す。捨ててよい場合は `{ lossy: true }` を渡し、`onLoss` で `code` (`UNNESTABLE_OVERLAP`、`CONFLICTING_MARKS`) を確かめる。

### M05: XML の構造と入力の制限を検査する (skam-xml-parser)

- 対象: `<!` で始まる宣言、深い入れ子、長い入力、SKAM の名前空間や内容モデルに合わない XML を `parse` に渡している。
- やること: XML を直す。構造の拒否は外せない。入れ子の深さと入力の長さは `maxDepth` (既定 64) と `maxInputLength` (既定 5,000,000) で変えられる。検証だけを外すには `{ validate: false }` を渡す。

### M06: ブロック先頭の返り点を XML の段階で拒否する (skam-xml-parser)

- 対象: SKAM-ML のブロックの先頭に `skam:kaeri` を置いている。
- やること: 返り点を前のブロックの最後の字の後に置くか、ブロックをまとめる。`{ validate: false }` でも通らない。

### M07: 文書の値の検査 (skam、skam-xml-parser)

- 対象: 空の token の `text`、空の `saidoku.forms`、ブロック・token・mark にまたがる ID の重複、グリッドの外の okototen の座標、書式に合わない `emphasis.style`、型の違う `id` / `ext` / `placementHint` / `forms[].n` を含む文書がある。
- やること: 保存済みの JSON を `validateSKAMDocument` で一括検査し、エラーの `kind` (`INVALID_VALUE`、`DUPLICATE_ID`、`INVALID_TYPE` など) ごとに直す。parser では `{ validate: false }` で検査を外せる。

### M08: 同じ anchor に重ねられない注記 (skam、skam-xml-parser、skam-xml-stringify)

- 対象: yomigana、okurigana、soegana、okimoji、joji、saidoku を同じ anchor に重ねている。
- やること: `validateSKAMDocument` の `MARK_CONFLICT` の位置を探し、重複の片方を消すか別の anchor に移す。okototen、emphasis、highlight、tateten は重ねてよい (SKAM-draft §6.1)。

### M09: ブロック先頭の返り点を検証で拒否する (skam、skam-xml-parser、skam-xml-stringify)

- 対象: JSON の文書で、ブロックの先頭の位置に kaeri を置いている。
- やること: 返り点を前のブロックの最後の字の後に置くか、ブロックをまとめる。検証エラーの `kind` は `BLOCK_START_KAERI`、案内文は `BLOCK_START_KAERI_HINT` にある。

### M10: 0.1.x の parser と混ぜて使う (skam-xml-parser、skam-xml-stringify)

- 対象: 0.2.x の `stringify` が出した XML を、0.1.x の parser で読んでいる。
- やること: 0.2.x の parser で読む。0.1.x の parser は、okimoji / joji / okototen / saidoku の基底の中の `kun` や、入れ子の包む要素の注記を、エラーにせずに読み落とす。

### M12: 不正なオプションで TypeError を投げる (skam-html-renderer、skam-canvas-renderer)

- 対象: `render` などに、許されない値のオプションを渡しうる。
- やること: `TypeError` を捕捉する。html-renderer では、`validateRenderOptions` / `validateCSSOptions` で先に検査できる。

### M13: 注記とオプションのエスケープ (skam-html-renderer)

- 対象: 描画の HTML / CSS の文字列を比較・保存している。
- やること: 今の版の出力で取り直す。許可リストに合わない `emphasis.style` は `filled dot` になる。

### M14: 傍点の 1 文字の出し方 (skam-html-renderer)

- 対象: 任意の 1 文字の傍点を使い、描画の文字列を比較・保存している。
- やること: 今の版の出力で取り直す。傍点は `"\2605 "` のような CSS の文字列で出る。表示は同じ。

### M15: 読み層の出力 (skam-html-renderer、skam-web-component)

- 対象: スナップショットや VRT を取っている。または、読み層の `aria-label` を検索や CSS に使っている。
- やること: スナップショットや VRT を取り直す。読み層に `aria-label` は付かないので、読み層の要素の内容を使う。readings の無い文書は、読み層に本文のテキストが出る。

### M16: ref の番号の振り方 (skam-html-renderer)

- 対象: ref を含む文書のスナップショットや VRT を取っている。
- やること: 取り直す。ref の番号は本文の出現順に振られる。

### M17: canvas は縦書きだけ (skam-canvas-renderer)

- 対象: canvas-renderer に `writingMode: 'horizontal'` を渡している。
- やること: 縦書きだけを指定する。横書きが要る場合は html-renderer を使う。

### M18: canvas の大きさの自動設定 (skam-canvas-renderer)

- 対象: canvas の `width` / `height` を自分で管理している。
- やること: `autoSize: false` を渡す。既定では、計測した寸法 × `pixelRatio` に設定する。長い文書は `maxExtent` で長い辺の上限を決める。

### M19: canvas が okototen を描く (skam-canvas-renderer)

- 対象: okototen を含む文書の canvas のスナップショットや VRT を取っている。
- やること: 取り直す。

### M20: skam-error の detail (skam-web-component)

- 対象: `skam-error` を購読している。
- やること: `detail.recoverable` で扱いを分ける。回復できるエラーでは `detail.attribute` に属性名が入る。

### M26: xmldom の版を固定している (skam-xml-parser)

- 対象: lockfile や overrides で `@xmldom/xmldom` の版を固定している。
- やること: 下の「依存」の節のとおり、0.8.15 以上の 0.8 系に上げる。

### M28: html-renderer の profile の検査 (skam-html-renderer)

- 対象: `render` / `renderHTML` の `profile` に、真偽値でない値、値が `undefined` のキー、綴りの違うキーを書いている。
- やること: 真偽値で書き、値の無いキーは省く。注記を隠す用途では `{ base, overrides }` の形を使う。`TypeError` を捕捉する。

### M29: canvas-renderer の profile の検査 (skam-canvas-renderer)

- 対象: `render` / `measure` の `profile` に、真偽値でない値、値が `undefined` のキー、綴りの違うキーを書いている。
- やること: 真偽値で書き、値の無いキーは省く。`TypeError` を捕捉する。

### M30: includeReadingLayer は真偽値だけ (skam-html-renderer)

- 対象: `includeReadingLayer` に真偽値でない値 (`'false'` など) を渡している。
- やること: `true` / `false` で渡す。

### M31: profile 属性が不正なら描かない (skam-web-component)

- 対象: `profile` 属性や `include-reading-layer` 属性を書いている。
- やること: `profile` はプリセット名か、検証を通る JSON で書く。`include-reading-layer` は `true` / `false` / 空文字にする。不正な値のときは描画せず、`recoverable: false` の `skam-error` が出るので、購読して扱う。

### M32: 既定値に戻した属性を通知する (skam-web-component)

- 対象: `skam-error` を購読している。
- やること: `recoverable: true` の通知 (`writing-mode`、`copyable`、`class-prefix`、`display-lang` の値が不正で、既定値で描いた) を、`attribute` で見分けて扱う。描画は続く。

### M33: PROFILES は書き換えられない (skam-html-renderer、skam-canvas-renderer)

- 対象: `PROFILES` やその中身を書き換えている。
- やること: 書き換えない。変えたいときは `{ base, overrides }` を使うか、`{ ...PROFILES.full, okurigana: false }` のようにコピーする。

### M34: AIR の trailingMarks (skam)

- 対象: `buildAnnotationIR` の結果を直接使っている。
- やること: `profile.okimoji` / `profile.joji` が false のとき、置き字・助字が `trailingMarks` に無いことを前提にする。

### M36: 検証エラーの位置 (skam、skam-xml-parser)

- 対象: parser が投げる `SKAMValidationError` の `errors` を、テストで `toEqual` で比べている。
- やること: 比較から `line` / `column` を外すか、`toMatchObject` を使う。

## 対応の要らない変更

M01、M11、M21、M22、M23、M24、M25、M27、M35、M37 は、上げるだけでよい。

## 依存

`@xmldom/xmldom` を自分で固定している場合は、`^0.8.15` (0.8.15 以上の 0.8 系) にする。0.8.15 未満の版には既知の advisory がある。一覧は GitHub Advisory Database で `@xmldom/xmldom` を引くと見られる。
