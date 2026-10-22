---
status: Complete
---

# ADR-040: 拡張の仕組みと、学習・教育用拡張の出題の印

この ADR は 2 つの PR で実装した。1 つ目で拡張の仕組みと学習・教育用拡張を入れ、2 つ目で宣言の無い文書の `ext` の自由なデータを `custom` に移す警告と変換の関数を入れた。

## コンテキスト

外部の利用者のフィードバック (ADR-030 の #14) は、出題のために特定の注記だけを隠したいと求めた。描画の profile は注記の種類ごとにしか隠せない。注記の `ext` は SKAM が中身を解釈しない自由なデータの置き場で、SKAM-ML に書けず、往復で失われる。

出題の印は、SKAM の本体 (core) ではなく学習・教育用の拡張として扱いたいという要求があった。拡張の置き場、宣言、名前、古い reader の扱いを決めるため、ほかの仕様の拡張の仕組みを調べた (glTF、JSON Schema、Office Open XML の Markup Compatibility、HL7 FHIR、RFC 6648、RFC 6709、RFC 8701、W3C TAG、TEI、IIIF、Web Annotation)。原文と抜き書きは、調べた人の手元の `.tmp/docs/research/extension-mechanisms/` にある (リポジトリには入れていない)。観察した事実:

- glTF は仕様の拡張 (`extensions`) と利用者のデータ (`extras`) を分け、使う拡張 (`extensionsUsed`) と必須の拡張 (`extensionsRequired`) を宣言させる。
- `extras` の中では利用者どうしの値がぶつかるという議論がある。JSON Schema は、未知のキーワードを許すと後から仕様が足したキーワードとぶつかるとして、未知のキーワードを禁じた。
- JSON Schema の `$vocabulary`、Markup Compatibility の `mc:MustUnderstand`、FHIR の `modifierExtension` は、知らなければ処理を止める拡張と、無視してよい拡張を分ける。
- RFC 6648 は、`X-` の接頭辞が標準でないものの標準の空間への漏れ出しを招いたとして廃止した。

## 利用者の決定 (2026-10-21)

1. 出題の印は、SKAM-ML の本体ではなく学習・教育用拡張として、仕様の中で別に管理する。
2. 拡張は SKAM-ML では別の名前空間で表す。
3. JSON では、拡張の値を `ext` の下の拡張の名前のまとまりに置く。今の `ext` の自由なデータは `custom` に移す。0.3 では警告にして変換の関数を配り、0.4.0 で誤りにする。
4. 文書は使う拡張を宣言する。拡張を使う文書の `format` は変えない。
5. 宣言は使う拡張と必須の拡張に分ける。必須かどうかは拡張の仕様が決め、文書は宣言で表す。
6. `ext` には SKAM の仕様の外の組織が定めた拡張も置ける。名前に接頭辞は使わない。
7. 出題の印は問いの名前を持つ。描画は名前を選んで隠すか、すべて隠す。隠した注記は占める場所を残して描かない。印を付けられるのは訓点と読みの注記 (kaeri、okurigana、soegana、yomigana、saidoku、kutoten、tateten、okototen、okimoji、joji)。

## 決定

### 拡張の置き場と宣言

- 文書の最上位の任意の `extensions` (使う拡張の名前の配列) と `extensionsRequired` (必須の拡張の名前の配列。`extensions` の部分集合)。
- `extensions` を持つ文書 (空の配列を含む) を宣言のある文書として読む。持たない文書は、`ext` を今までどおり自由なデータとして読む。同じ入力を 2 通りに読まないよう、宣言の有無だけで決める。
- 宣言のある文書: 拡張の値は `ext.<名前>` に置く。`ext` に宣言に無い名前があれば誤り。`extensionsRequired` に知らない名前があれば誤りで、読まない。使うだけの知らない拡張の値は無視する。拡張を知る validator は、必須の拡張の値を使うのに `extensionsRequired` に挙げていない文書を誤りにする。
- 誤りの種類は `INVALID_EXTENSION`。
- 自由なデータは `custom` に置く。

### 名前と登録

- 名前は小文字の英数字で、先頭は英字、`xml` で始まらない (SKAM-ML の名前空間の接頭辞に使うため)。接頭辞を付けない。SKAM の仕様が定める拡張も、仕様の外の拡張も、登録簿に PR で先着順に登録する。登録済みの名前は別の意味に使わない。登録は名前の衝突を避けるためで、拡張の中身の安全を保証しない。
- 機械で読める表は `@kanbun-skam/skam/extensions` の `extensionRegistry`、人が読む一覧は SKAM-draft の付録。

### 拡張の定義と依存の向き

- 拡張の型、検査、SKAM-ML の属性との対応、描画の判定は、拡張ごとの「拡張の定義」(`SKAMExtensionDefinition`: `validate`、`readXmlAttributes`、`writeXmlAttributes`、`hiddenParts`、`isHidden`、`assertOptions`) に置き、サブパス (`@kanbun-skam/skam/extensions/edu`) で公開する。
- 拡張の定義は core から型だけを import する。SKAM の仕様が定める拡張を束ねる `@kanbun-skam/skam/extensions` だけが個々の拡張を import する。validator、parser、stringify、renderer は束を既定に使い、利用者は仕様の外の拡張の定義を `extensions` の選択肢で足す。束と名前が重なれば `TypeError`。rendering は拡張を import せず、渡された定義の判定を呼ぶ。この向きは import を調べるテストで守る。
- 「知っている拡張」は定義のある拡張。登録簿にあっても定義の無い拡張は知らない拡張として扱う。

### SKAM-ML

- 宣言は `skam:meta` の子の `<skam:extension name="…" uri="…" required="true"/>`。名前空間はルートで宣言する。
- 定義のある拡張の名前空間の属性を、定義の対応で読み書きする。宣言の無い拡張の名前空間の属性は誤り。登録されていない名前空間の属性は読み飛ばす (ほかの道具が付けた属性を含む文書を誤りにしない)。必須の拡張を知らなければ、`validate` の値にかかわらず parse の誤り。
- 名前空間の URI は識別子で、取りに行かない。
- 書けない拡張の値と、名前空間の URI が分からない拡張の宣言は損失 `UNKNOWN_EXTENSION`。`custom` と宣言の無い文書の `ext` は損失 `EXT`。
  - ADR-047 で改めた: 書き方の定義の無い拡張の値、`custom`、宣言の無い文書の `ext` は `skam:ext` / `skam:custom` 属性で書け、URI の分からない拡張は `uri` を省いて宣言するので、`EXT` と `UNKNOWN_EXTENSION` は妥当な文書では出ない。
- 空の宣言 (`extensions: []`) は SKAM-ML に書く要素が無く、往復で宣言の無い文書に戻る。空の宣言のある文書は `ext` を持てないので、読み方は変わらない。

### 入力の上限

`ext` と `custom` の入れ子は 32 段、1 つのオブジェクトのキーは 1,000 個、配列の長さは 10,000、文書全体の値の数は 100,000 まで。キー `__proto__`、`constructor`、`prototype` は誤り。検査は反復で行い、上限で止める。名前は `Object.hasOwn` で引く。

### 学習・教育用拡張 (`edu`)

- 名前 `edu`、名前空間の URI `urn:skam:edu:1`、必須。
- 注記の `ext.edu.quiz` (1〜64 字、制御文字を含まない)。訓点と読みの 10 種の注記にだけ置ける。
- SKAM-ML の属性は `edu:quiz`。`skam:kun` は読み仮名、送り仮名、添え仮名を 1 つの要素で持つので、部分ごとに `edu:yomi-quiz`、`edu:okuri-quiz`、`edu:soe-quiz`。
- 描画の選択肢 `hideQuiz` (`true` か名前の配列)。同じ所に描く注記のどれか 1 つでも隠すなら、その所ごと隠す。html は隠す注記の中身を 1 字ずつ空白 (全角の字は U+3000、それ以外は U+00A0) に置き換え、class `${prefix}-quiz-hidden` と `aria-hidden="true"` を付ける。ヲコト点は要素を出さない。置き字と助字は注記が無いものとして描く。canvas は配置を保って描かない。`hideQuiz` を渡して `readingLayerSource` を書かなければ、読み上げ層は `'display'`。web component は `hide-quiz` 属性で、不正な値なら描画しない。
- 出題の印は表示の制御で、秘匿ではない。宣言の無い文書の `ext.edu` は旧来の自由なデータとして読み、隠さない。

### 宣言の無い文書の `ext`

- 宣言の無い文書は、`extensions` も `extensionsRequired` も持たない文書。`extensionsRequired` だけを持つ文書は `INVALID_EXTENSION`。
- 対象は、文書、readings、ブロック、token、注記、derivations のうち、`ext` がオブジェクト (配列でない) のもの。空のオブジェクトも対象。オブジェクトでない `ext` は型の誤りで、警告しない。derivations の `ext` と `custom` も、入力の上限と宣言のある文書の `ext` のキーの検査を受ける。
- 0.3 では読めるが、`ext` 1 つにつき警告 `LEGACY_EXT` を出す。`ext` のキーが登録簿の名前と同じなら、宣言の書き忘れの疑いとして `LEGACY_EXT_REGISTERED_NAME` も出す。0.4.0 では `LEGACY_EXT` を同じ名前の誤りにし、`LEGACY_EXT_REGISTERED_NAME` は無くす (同じ所を `LEGACY_EXT` の誤りが指すため)。
- 登録済みの名前は `extensionRegistry` の名前の集合で引く。core は個々の拡張の定義を import しない。
- 変換の関数 `moveLegacyExtToCustom(doc)` は、対象のすべての `ext` を同じオブジェクトの `custom` に移し、`{ document, registeredNameKeys }` を返す。`ext` の値はキーを展開せずにそのまま置き、宣言は足さない。宣言のある文書、オブジェクトでない `ext`、移す先の `custom` が既にあるときは `TypeError` (誤りの文には path だけを入れ、値は入れない)。文書は書き換えず、2 回かけても結果は同じ。`registeredNameKeys` は登録済みの名前と同じキーの path で、呼ぶ側が拡張の値だったかを確かめるためのもの。
- SKAM-draft の ref の節にあった、`ext` の中の値で ref の同一を決める例と規則は、実装に無かったので消した。

### `format`

`format` は `skam@0.1` のまま。拡張の必須は core の要素ではなく文書の宣言で表す。

## 受け入れた限界

- 0.2.x の reader は拡張の宣言を知らず、必須の拡張でも止まらない。公開済みの 0.2.0 (skam、skam-xml-parser、skam-xml-stringify、skam-html-renderer) で 2026-10-21 に確かめた: parser は `skam:meta` の `skam:extension` と `edu:okuri-quiz`、`edu:quiz` の属性を、`validate: true` でも `false` でも誤りにも警告にもせずに捨てる。validator は最上位の `extensions` と `extensionsRequired` を落とし、注記の `ext.edu` を残して `valid: true`。stringify (`lossy: true`) は `ext` を損失 `EXT` にし、宣言の損失は出さない。html の描画は答えをそのまま描く。canvas、web component、`lossy` なしの stringify は確かめていない。
- `custom` は SKAM-ML に書けず、往復で残らない (損失 `EXT`)。
  - ADR-047 で改めた: `custom` は `skam:custom` 属性で書け、往復で残る。
- 答えは同じ文書に平文である。文書と、`'readings'` を明示した読み上げ層には答えが残る。答えの字数は空白の数から分かる。空白の幅は元の字に近いだけで、半角の字や結合文字では違いうる。

## 却下した案

- **出題の印を core の注記の属性にする**: 利用者の決定 1。
- **拡張を使う文書の `format` を変える**: 0.2.x の reader が誤りにできるが、`format` の値に拡張の組み合わせが入り、`format` を構文の系統の名前とする位置づけ (ADR-038) が崩れる。
- **名前に接頭辞を付ける**: RFC 6648 と同じく、標準でないものが標準の空間に漏れ出す。
- **CSS の `visibility` だけで隠す**: CSS が読み込まれないと見え、HTML のソースに答えが残る。
- **隠す注記を出力から消す**: 場所が詰まり、利用者の決定 7 に反する。
- **AIR に隠すための新しいノードを足す**: highlight のグループの分け方と子の型を崩す。
