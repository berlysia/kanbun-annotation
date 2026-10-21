---
status: Complete
---

# ADR-043: JSON Schema の配布

## コンテキスト

ADR-028 は「JSON Schema を唯一の正にして型と validator を生成する」案を却下し、JSON Schema の配布と未知の mark type を保持する読み込みを意図して提供しなかった。TS 以外の利用者が文書を検証する手段は無かった。

validator は、構造の検査 (最上位のキー、token、ブロック、注記の型ごとの値、readings、derivations、拡張の名前、`ext` と `custom` の上限) を通ったときだけ、参照の検査 (id の一意、参照先、ブロックと token の整合、anchor の位置、注記の衝突、改行の置き場) を走らせる。未知の mark type は誤りにし、注記などの未知のフィールドは残し、未知の最上位キーは返す文書から落とす。SKAM-draft §11.1 は「未知の `type` は無視してもよい」「未知のフィールドは無視してもよい」と書いていた。

拡張の値の検査は宣言のある文書だけで行う。`extensions` を持たない文書の `ext` は自由なデータとして警告だけを出し (ADR-040)、学習・教育用拡張の検査は `extensions` に `edu` を挙げた文書でだけ走る。

## 決定

### 識別子と版

- JSON Schema 2020-12。`$id` は `urn:kanbun-skam:schema:skam-0.1` と、拡張の値の `urn:kanbun-skam:schema:ext-edu-1`。取りに行かない識別子。
- `$id` の版は `format` (`skam@0.1`) と拡張の名前空間の URI の版 (`urn:skam:edu:1`) に合わせ、それらを上げるときに上げる。
- 同じ `$id` の schema は、パッケージの minor と patch の間で通す文書が増える向きにだけ変わる。minor で注記の種類が増えれば `type` の `enum` に足す。validator が新しく誤りにする規則のうち schema で表せないものでは、schema を変えない。表せる規則を足して狭めるのは破壊的な変更として扱い、changeset にそう書く。

### 置き場と配り方

- `packages/skam/schema/skam.schema.json` と `packages/skam/schema/ext-edu.schema.json` を手で書き、`files` と、条件の無い `exports` の項目で配る。
- 利用者は 2 つを検証器に登録してから使う。未解決の `$ref` を取りに行く設定を使わない。

### validator との関係

- validator が正。schema は構造の規則を写す。validator が通す文書を schema が誤りにしないことと、列挙した構造の誤りを schema も誤りにすることを、integration-tests のテストで確かめる。
- schema に書かない規則 (validator だけが検査する): id の一意と参照、ブロックと token の整合、anchor の位置、注記の衝突、改行の置き場、ブロック先頭の返り点、拡張の宣言と `ext` のキーの関係、`ext` と `custom` の入れ子の段数と文書全体の値の数、`emphasis` の 1 字の文字の種類、ヲコト点の座標が grid の中にあること。
- schema は信頼できない入力の境界にならない。信頼できない入力は validator に通す。

### 未知のもの

- 未知の mark type は誤り。注記の種類は描画と意味を決める core の語彙で、知らない種類を通すと描画から注記が黙って欠ける。代わりに、新しい種類を使う文書を古い reader が読めない (前方互換を捨てる)。
- 注記、token、ブロック、readings、derivations、anchor、position の未知のフィールドと、未知の最上位キーは、schema でも誤りにしない。validator がこれらを誤りにしないので、閉じると schema だけが誤りを出す。フィールドは、知らなくても既知のフィールドの意味が変わらない。
- SKAM-draft §11.1 をこの挙動に合わせて書き直した。

### `ext` と `custom`

- 6 つの持ち主のどれにも置け、値はオブジェクト。値の全段に、禁止キー (`__proto__`、`constructor`、`prototype`)、オブジェクトのキー 1,000 個まで、配列の長さ 10,000 までを、再帰の定義で付ける。上限と禁止キーは宣言の有無によらない (validator と同じ)。

### 学習・教育用拡張の値

- `extensions` に `edu` を挙げた文書でだけ、置ける 10 種の注記の `ext.edu` を `ext-edu.schema.json` で検査し、ほかの注記と注記以外の持ち主の `ext.edu` を誤りにする。挙げない文書の `ext.edu` は検査しない (validator が警告だけで通すので)。
- 登録されていない名前の `ext` のキーは許す。
- 登録簿の名前ごとに、schema のファイル、`$id`、`$ref`、`exports` が揃っていることをテストで確かめる。拡張の定義の型 (`SKAMExtensionDefinition`) に schema は足さない。

### 正規表現

- `pattern` は `\d` や `\p{...}` を使わず、明示した文字の範囲で書く。長さに対して指数の時間になる入れ子の量指定子を使わない。

### 検証器

- テストは `ajv@8.17.1` (`Ajv2020`、strict) を integration-tests の devDependency に固定して使う。実行時の依存にはしない。

## 受け入れた限界

- schema は validator より緩い。一致は、テストに並べた文書の範囲でしか確かめていない。
- schema だけの検証は信頼の境界にならない。入れ子の段数の上限が効かず、深い入れ子は検証器のスタックと CPU を使いうる。
- 注記などの未知のフィールドは、`__proto__` という名前のキーも含めて schema を通り、validator もそのまま残す (`JSON.parse` の own のキーになるだけ)。
- `pattern` の判定は Ajv (JavaScript の正規表現) でしか確かめていない。ほかの言語の実装では違いうる。
- 未知の mark type を誤りにするので、新しい注記の種類を使う文書は、古い schema でも古い validator でも誤りになる。schema と validator は揃えて上げる。
- schema を狭める変更を破壊的な変更として扱う規則は、仕組みでは守られない。この ADR と README の規則として守る。

## 却下した案

- **schema から型と validator を生成する**: ADR-028 と同じ理由。TS 以外の利用者がいる証拠が無く、既存の validator のテストが多い。
- **型の定義から schema を生成する**: 型に無い値の規則 (返り点の字の範囲、言語タグの形、拡張の規則) を写せない。
- **未知の最上位キーを schema で閉じる**: validator が誤りにしないので、schema だけが誤りを出す。
- **edu の schema を宣言に関係なく当てる**: 宣言の無い文書で、validator が通す文書を schema が誤りにする。
- **未知の mark type を許す**: spec の決定 (K10)。上の「未知のもの」の理由。
