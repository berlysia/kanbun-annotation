<!--
SPDX-License-Identifier: CC-BY-4.0
Copyright (c) 2024-present berlysia

This specification is licensed under the Creative Commons Attribution 4.0
International License. To view a copy of this license, visit
https://creativecommons.org/licenses/by/4.0/
-->

# SKAM-ML/XML

## Stand-off Kanbun Annotation Model – Markup Language (XML)

### Specification v0.1

> **Status:** この仕様は v0.1.0 リリースに対応する安定版です。
> ファイル名の "draft" は歴史的な経緯によるもので、仕様の安定性には影響しません。

---

## 1. 位置づけ

SKAM-ML/XML は、**人間が編集しやすいソース表現**であり、
機械処理の正規形は **SKAM（JSON）** である。

- SKAM-ML/XML →（compile）→ SKAM JSON →（render）→ HTML/CSS/SVG 等
- SKAM-ML/XML 自体は **表示言語ではない**

---

## 2. 設計原則（再定義）

1. **HTML依存を持たない**
2. 本文構造は **SKAM語彙のみ**で表す
3. 訓（読み＋送り仮名）は **`skam:kun`** で、再読文字は **`skam:saidoku`** で表す
4. 注記は **本文近傍に書けるが、正規化時に stand-off 化される**
5. token / mark / reading の対応は **コンパイル時に確定**する

---

## 3. 名前空間とルート

### 3.1 名前空間

```xml
xmlns:skam="urn:skam:1"
```

拡張（§10）は、それぞれ自分の名前空間を持つ。名前空間の URI は識別子で、取りに行かない（MUST NOT）。接頭辞は拡張の名前にすることを勧めるが、parser は URI で照合するので、接頭辞は自由に決めてよい。

### 3.2 ルート要素

```xml
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  …
</skam:doc>
```

- ルートの `xml:lang` は、JSON の文書の `lang`（本文の言語）と往復する（任意）。値の形は SKAM-draft §3 の `lang` と同じ。
- 空の値（`xml:lang=""`）は、言語の情報が無いことを表す。JSON では `lang` を持たない文書になる。
- ルート以外の要素の `xml:lang` は読まない。
- 文書の `ext` と `custom` は、ルートの `skam:ext` と `skam:custom` に書く（§10.3）。

### 3.3 埋め込み時のメディアタイプ（規範）

SKAM-ML を HTML の `<script>` 要素に埋め込むときの `type` は、次の文字列とする。

```html
<script type="application/vnd.berlysia.skam+xml">
  <skam:doc xmlns:skam="urn:skam:1">…</skam:doc>
</script>
```

- 登録されていないベンダー型には `vnd.` のツリーを使う（RFC 6838 §3.2）。`x-` の接頭辞は RFC 6648 で非推奨とされているので使わない。
- XML を基にした型には `+xml` の接尾辞を付ける（RFC 7303）。
- この型は IANA に登録していない。
- SKAM-ML の版は名前空間（§3.1 の `urn:skam:1`）で表す。メディアタイプのパラメータでは表さない。
- この文字列は教材の HTML などに書かれるので、仕様の約束とする。実装の都合では変えない。
- `<skam-renderer>`（Web Component）は、この型の `<script>` だけを読む。`application/xml` など、ほかの型の `<script>` は読まない。

---

## 4. 文書構造

- SKAM-ML 文書に `<!` で始まる宣言（`<!DOCTYPE>`、`<!ENTITY>`、`<!ELEMENT>` 等）を含めてはならない（MUST NOT）。コメント（`<!-- -->`）と CDATA セクションは使用できる

### 4.1 トップレベル構成

| 要素            | 必須 | 説明                                   |
| --------------- | ---- | -------------------------------------- |
| `skam:meta`     | 任意 | トークナイズ等の指示と、使う拡張の宣言 |
| `skam:body`     | 必須 | 本文                                   |
| `skam:readings` | 任意 | 読み層                                 |
| `skam:notes`    | 任意 | 注釈本文                               |

```xml
<skam:doc xmlns:skam="urn:skam:1">
  <skam:meta tokenization="char"/>
  <skam:body>…</skam:body>
  <skam:readings>…</skam:readings>
  <skam:notes>…</skam:notes>
</skam:doc>
```

### 4.1.1 `skam:meta` の内容（規範）

`skam:meta` は、属性 `tokenization` と、子の要素 `skam:extension` を持てる。

```xml
<skam:meta tokenization="char">
  <skam:extension name="edu" uri="urn:skam:edu:1" required="true"/>
</skam:meta>
```

`skam:extension` は使う拡張ごとに 1 つ置き、SKAM JSON の `extensions` と `extensionsRequired` に対応する。

| 属性       | 必須 | 説明                                                              |
| ---------- | ---- | ----------------------------------------------------------------- |
| `name`     | 必須 | 拡張の名前（小文字の英数字で、先頭は英字。`xml` で始まらない）    |
| `uri`      | 必須 | 拡張の名前空間の URI                                              |
| `required` | 任意 | 知らなければ読んではいけない拡張のときだけ `true`。ほかの値は誤り |

- `skam:extension` が 1 つも無ければ、宣言の無い文書として読む（SKAM-draft §11.2）
- `name` と `uri` が登録簿（SKAM-draft 付録 F）や parser に渡された定義と合わない（同じ名前で違う URI、同じ URI で違う名前）、または同じ名前を 2 度宣言したら誤り
- `required="true"` の拡張を parser が知らなければ誤り（MUST）
- 名前空間の宣言（`xmlns:edu="urn:skam:edu:1"`）はルートに置く

### 4.2 Derivations（導出情報）について

SKAM-ML/XML では `derivations`（読み順等の導出情報）を**直接記述しない**。
返り点等から計算される読み順などの導出情報は、**コンパイル時に SKAM JSON 側で生成**される。

詳細は SKAM 仕様の「7. Derivations」を参照。

---

## 5. 本文構造（HTML非依存）

### 5.1 `skam:body`

本文全体を包む。

### 5.2 `skam:block`

段落・文ブロックの最小単位。SKAM JSON の `Block` オブジェクトに対応する。

```xml
<skam:body>
  <skam:block xml:id="b1">學而時習之</skam:block>
</skam:body>
```

#### 属性

| 属性          | 必須 | 説明                                                      |
| ------------- | ---- | --------------------------------------------------------- |
| `xml:id`      | 任意 | ブロックの手書きの id（§7.1.1）。省略時は自動の id になる |
| `skam:ext`    | 任意 | ブロックの `ext`（§10.3）                                 |
| `skam:custom` | 任意 | ブロックの `custom`（§10.3）                              |

- 改行・段落の意味は **構造情報としてのみ**扱う
- 見た目の段落とは無関係
- パーサーは各 `skam:block` から `Block` オブジェクト `{ id, tokenIds }` を生成する

---

## 6. Tokenization（非規範）

- 既定：`tokenization="char"`
- `skam:block` 内のテキストから token 列を生成
- 平文の文字は 1 字ずつの token になる。1 字ずつに分けると元に戻らない token（2 字以上、空白、前の字と結合する字）と、id・`ext`・`custom` を持つ token は、`skam:t` で明示する（§7.14）

### 6.1 Tokenization アルゴリズム（char mode）

1. `skam:body` 内の全 `skam:block` を文書順で走査
2. 各 `skam:block` 内の全子ノードを深さ優先走査
3. テキストノードごとに、拡張書記素クラスタ（Unicode の extended grapheme cluster）単位で分割する。テキストノードをまたいだクラスタは作らない（要素の境界で切れる）
4. 要素の内容も含めて、文書順序で token 列を構築。`skam:t` の内容は分けずに 1 つの token にする
5. token index は `skam:body` 全体で通し番号（0-based）
   - `skam:block` の境界で index はリセット**されない**

- 異体字セレクタ（IVS の U+E0100〜U+E01EF、SVS の U+FE00〜U+FE0F）や結合文字は、基底の字と同じ token になる。基底の字と同じテキストノードに書く。要素の境界の後ろに単独で書いた選択子や結合文字は、それだけで 1 token になる
- 書記素クラスタの分け方は、処理系が持つ Unicode の版で変わりうる（絵文字の並びなど）。CJK の字、IVS、SVS、結合文字の組は版で変わらない。処理系をまたいで同じ token の列が要る文書は、この範囲の字で書く

### 6.2 空白・改行の扱い

- 改行（U+000A）、タブ（U+0009）、半角スペース（U+0020）、キャリッジリターン（U+000D）の連続は tokenization 時に**無視される**。書記素クラスタの先頭にあるこれらの字は取り除き、残りが無ければそのクラスタは token にしない
  - U+000D は XML の改行正規化により通常は U+000A に置き換わるため、`&#13;` と書いた場合にのみ残る
- `skam:t` の内容の空白は無視しない（§7.14）
- 意図的な空白が必要な場合は全角スペース（U+3000）か `skam:t` を使用

### 6.3 例

```xml
<skam:body>
  <skam:block><skam:kun>學</skam:kun>而</skam:block>
  <skam:block>時習之</skam:block>
</skam:body>
```

→ blocks: `b#1`、`b#2`。tokens: `[{id:"b#1#1", text:"學"}, {id:"b#1#2", text:"而"}, {id:"b#2#1", text:"時"}, {id:"b#2#2", text:"習"}, {id:"b#2#3", text:"之"}]`

---

## 7. 注記要素（本文内）

### 7.0 内容モデル（規範）

各要素が子に持てるものの正本である。§7.3 以降の各節は、この表を参照する。

| 親要素                                                                   | 子に持てるもの                                                                      |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `skam:block`、`skam:span`、`skam:tateten`                                | テキスト、`skam:t`、§7 のすべての注記要素、位置マーク（kaeri / kutoten / ref / br） |
| `skam:yomigana`                                                          | テキスト、`skam:t`、`skam:kun`                                                      |
| `skam:okimoji`、`skam:joji`、`skam:okototen`、`skam:base`（saidokuの中） | テキスト、`skam:t`、`skam:kun`、`skam:okimoji`、`skam:joji`、`skam:okototen`        |
| `skam:kun`、`skam:soegana`                                               | テキスト、`skam:t`                                                                  |
| `skam:t`                                                                 | テキストのみ                                                                        |
| `skam:saidoku`                                                           | `skam:base`、`skam:kunform`                                                         |

- **位置マーク**: kaeri / kutoten / ref / br は、`skam:block` / `skam:span` / `skam:tateten` の子にだけ置ける。
- **入れ子の意味**: 内側の要素の範囲は、外側の範囲に含まれる。
- **範囲が同じ要素どうしの入れ子順**: 外側から次の順に並べる。
  1. `skam:span` / `skam:tateten`
  2. `skam:saidoku`
  3. `skam:okimoji`
  4. `skam:joji`
  5. `skam:okototen`
  6. `skam:yomigana`
  7. `skam:kun`
- `skam:yomigana` と、字を包む要素（`skam:okimoji` / `skam:joji` / `skam:okototen` / `skam:base`）とは、互いを入れ子にできない。
- **共通の属性**: すべての注記の要素は `skam:ext`、`skam:custom`、`placement-hint` を持てる（§10.3。`skam:kun` は部分ごとの名前）。
- **parser の扱い**: 表にない既知の子要素は誤りである。未知の `skam:*` は無視し、通知してよい（§10）。

### 7.1 アンカー規則（規範）

注記要素は SKAM JSON の Mark に変換される際、**anchor** または **position** で参照先を指定する。

#### anchor ベース（トークンに紐づく Mark）

| 要素種別 | アンカー            |
| -------- | ------------------- |
| 空要素   | 直前 token          |
| 包囲要素 | 含まれる token 範囲 |

#### position ベース（トークン間に存在する Mark）

以下の要素は anchor ではなく **position** で配置位置を指定する：

| 要素           | position の決定方法                                                      |
| -------------- | ------------------------------------------------------------------------ |
| `skam:kutoten` | 直前 token の後（`{ blockId, after: tokenId }`）、先頭なら `{ blockId }` |
| `skam:ref`     | 直前 token の後（`{ blockId, after: tokenId }`）、先頭なら `{ blockId }` |
| `skam:br`      | 直前 token の後（`{ blockId, after: tokenId }`）、先頭なら `{ blockId }` |

position は `{ blockId, after: tokenId }` または `{ blockId }`（ブロック先頭）の形式。`blockId` は常に必須で、要素が属する `skam:block` の ID が設定される。

#### 7.1.1 id（規範）

- `skam:block` と、すべての注記の要素（包囲要素と空要素）は `xml:id` を持てる。値は手書きの id（SKAM-draft §3.1）で、XML の NCName でなければならない。NCName でない値は誤り。`xml:id` が無ければ `id` 属性を読む（両方あれば `xml:id`）。文書の中で同じ値が 2 つあれば誤り
- token の手書きの id は `skam:t` の `xml:id` に書く（§7.14）
- `xml:id` の無いブロックの id は `b#<文書の中のブロックの 1 始まりの順>`、token の id は `<ブロックの id>#<ブロックの中の 1 始まりの順>`、注記の id は `m#<出力の marks 配列の 1 始まりの順>` になる（自動の id）
- 自動の id は書かない。書けば NCName でないので誤りになる
- `skam:kun` の `xml:id` は、その要素から作る最初の注記（読み仮名、送り仮名、添え仮名の順）の id になる。残りの注記は自動の id になる

---

### 7.2 `skam:kaeri`（返り点）

```xml
<skam:block>
  學而時習<skam:kaeri kind="re"/>之
</skam:block>
```

#### 属性

- `kind`（必須）
  - `re`, `ichi`, `ni`, `jo`, `chu`, `ge`, `ko`, `otsu`, …

#### kind と value の対応

| kind   | SKAM JSON value |
| ------ | --------------- |
| `re`   | レ              |
| `ichi` | 一              |
| `ni`   | 二              |
| `san`  | 三              |
| `shi`  | 四              |
| `jo`   | 上              |
| `chu`  | 中              |
| `ge`   | 下              |
| `ten`  | 天              |
| `chi`  | 地              |
| `jin`  | 人              |
| `ko`   | 甲              |
| `otsu` | 乙              |
| `hei`  | 丙              |
| `tei`  | 丁              |

`skam:kaeri` は、その返り点が付く字（後で読む字）の直後に書く。レ点は返って読む先の上の字の直後に書く（`時習<skam:kaeri kind="re"/>之`。下の字「之」の後ろではない）。竪点でつないだ語に付く返り点は、語の中の字と字の間に書く（`<skam:tateten>所<skam:kaeri kind="ni"/>以</skam:tateten>`）。

複合返り点（例: 一レ）は、同じ位置に `skam:kaeri` を 1 字ずつ並べて書く（`<skam:kaeri kind="ichi"/><skam:kaeri kind="re"/>`）。同じ位置の複数の `skam:kaeri` は、文書の順につないだ 1 つの注記と同じ意味を持ち、順は意味を持つ。

`kind="ichi-re"` のようにハイフンで連結した `kind` は、0.3 では読めるが非推奨で、0.4.0 で誤りになる。parser は 1 つの注記（値 `㆒㆑`）として読み、警告（`KAERI_MULTI_CHARACTER`）を出す。

#### 内容モデル

- `skam:kaeri` は同じブロック内で直前に token がなければならない（MUST）。ブロック先頭の `skam:kaeri` は誤りである

#### 正規化

- `marks.type = "kaeri"`
- `marks.value = kind に対応する記号`（上記対応表参照。連結した `kind` は各記号をつないだ値になる）
- `position = { blockId: 現在のブロック, after: 直前token }`

---

### 7.3 `skam:kun`（訓）

漢字の読み仮名・送り仮名・添え仮名を表す語形要素。baseは内容、読み・送り・添えは属性。

```xml
<skam:block>
  <skam:kun yomi="まな" okuri="びて">學</skam:kun>而
  <skam:kun okuri="に">時</skam:kun>
  <skam:kun okuri="ふ">習</skam:kun>
  <skam:kun soe="を">之</skam:kun>
</skam:block>
```

#### 属性

| 属性    | 必須 | 説明                         |
| ------- | ---- | ---------------------------- |
| `yomi`  | 任意 | 読み仮名（漢字の読み）       |
| `okuri` | 任意 | 送り仮名（活用語尾）         |
| `soe`   | 任意 | 添え仮名（テニヲハ等の助詞） |

※ 全て省略可。少なくとも一方を指定することを推奨。

部分ごとの `ext`、`custom`、`placementHint`（§10.3）は、属性名で部分を分ける。対応する部分の属性が無いのに付けると誤り（`okuri` が無い `okuri-placement-hint` など）。

| 部分                     | 属性                                                          |
| ------------------------ | ------------------------------------------------------------- |
| `yomi` が作る yomigana   | `skam:ext`、`skam:custom`、`placement-hint`                   |
| `okuri` が作る okurigana | `skam:okuri-ext`、`skam:okuri-custom`、`okuri-placement-hint` |
| `soe` が作る soegana     | `skam:soe-ext`、`skam:soe-custom`、`soe-placement-hint`       |

#### 正規化

SKAM-ML/XML の `skam:kun` は、JSON 側では `yomigana`、`okurigana`、`soegana` に分離される。

- `yomi` 属性がある場合: `marks.type = "yomigana"`, `value = yomi属性`
- `okuri` 属性がある場合: `marks.type = "okurigana"`, `value = okuri属性`
- `soe` 属性がある場合: `marks.type = "soegana"`, `value = soe属性`
- 複数ある場合: 複数の mark が生成される（同一 anchor を共有）
  - ※ 生成順序は SKAM 仕様 6.1節「同一 anchor を持つ marks の順序」を参照

#### 内容モデル

§7.0 を参照。

---

### 7.4 `skam:yomigana`（読み仮名）

漢字の読み（ルビ）を単独で表す。`skam:kun` と異なり、送り仮名を含まない純粋な読み仮名のみを記述する場合に使用。

```xml
<skam:block>
  <skam:yomigana value="がく">學</skam:yomigana>而時習之
</skam:block>
```

#### 属性

| 属性    | 必須 | 説明             |
| ------- | ---- | ---------------- |
| `value` | 必須 | 読み仮名テキスト |

#### 内容モデル

§7.0 を参照。

```xml
<skam:yomigana value="がく"><skam:kun okuri="ぶ">學</skam:kun>而</skam:yomigana>
```

#### 正規化

- `marks.type = "yomigana"`
- `anchor = 内容のtoken範囲`
- `value = value属性`

---

### 7.5 `skam:kutoten`（句読点）

句読点を表す。**position ベース**でトークン間の位置に配置される。

```xml
<skam:block>
  學而時習之<skam:kutoten value="。"/>
</skam:block>
```

#### 属性

| 属性    | 必須 | 説明                                            |
| ------- | ---- | ----------------------------------------------- |
| `value` | 必須 | 句読点記号（「。」「、」「・」等）              |
| `kind`  | 任意 | 分類（ku/ten/other）。省略時はvalueから推論可能 |

#### 正規化

- `marks.type = "kutoten"`
- `position = { blockId: ブロックID, after: 直前token }`（先頭の場合は `{ blockId: ブロックID }`）
- `value = value属性`
- `kind` があれば保持、なければパーサーが推論してもよい

---

### 7.5.1 `skam:br`（改行）

行を改める。**position ベース**でトークン間の位置に配置される。内容を持たない空要素で、子要素もテキストも持てない。

```xml
<skam:block>
  春眠不覺曉<skam:br/>處處聞啼鳥
</skam:block>
```

#### 属性

| 属性     | 必須 | 説明                                           |
| -------- | ---- | ---------------------------------------------- |
| `xml:id` | 任意 | mark の `id`。文書全体で一意でなければならない |

知らない属性は読み飛ばす。

#### 正規化

- `marks.type = "linebreak"`
- `position = { blockId: ブロックID, after: 直前token }`（先頭の場合は `{ blockId: ブロックID }`）
- 直前 token は、同じブロックの中で、`skam:br` の文書順で直前にある token である。`skam:tateten` や `skam:span` の先頭に置かれた `skam:br` も、その要素より前の token の後ろになる
- `skam:tateten` の最後の子の `skam:br` と、`skam:tateten` の直後の `skam:br` は、同じ注記になる。stringify は、竪点のグループの最後の字の後ろの改行を、`</skam:tateten>` の後ろに書く（kaeri / kutoten / ref の後ろ）

置けない場所（ブロックの先頭、ブロックの最後の字の後ろ、不可分単位の中、同じ位置の 2 つ目）は SKAM-draft §6.2 の `linebreak` の書き方に従い、検証が `INVALID_LINEBREAK` にする。

---

### 7.6 `skam:okototen`（ヲコト点）

漢字の字画の隅や内部に打点される訓点記号。グリッド座標で位置を指定する。

```xml
<skam:block>
  <skam:okototen grid="5x5" x="4" y="4" shape="dot" sound="り">學</skam:okototen>而時習之
</skam:block>
```

#### 属性

| 属性    | 必須 | 説明                             |
| ------- | ---- | -------------------------------- |
| `grid`  | 必須 | グリッドサイズ（"5x5", "7x7"等） |
| `x`     | 必須 | X座標（0-based、左上が原点）     |
| `y`     | 必須 | Y座標（0-based、左上が原点）     |
| `shape` | 必須 | 点の形状（dot, circle, line 等） |
| `sound` | 任意 | 対応する音節                     |
| `color` | 任意 | 朱点・墨点等の区別               |

※ グリッド座標の詳細は SKAM 仕様 6.6節を参照。

#### 内容モデル

§7.0 を参照。

#### 正規化

- `marks.type = "okototen"`
- `anchor = 内容のtoken範囲`
- `position = { system: "glyph-grid", grid, x, y }`
- `shape`, `sound`, `color` を保持

---

### 7.7 `skam:soegana`（添え仮名）

訓読時に補う助詞（テニヲハ）。

**推奨**: `skam:kun` の `soe` 属性を使用する。

```xml
<!-- 推奨: kun の soe 属性 -->
<skam:kun soe="を">之</skam:kun>

<!-- 代替: 単独の soegana 要素（将来のネスト構造用に予約） -->
<skam:soegana value="を">之</skam:soegana>
```

#### 属性（単独要素の場合）

- `value`（必須）: 添え仮名テキスト（を、に、は 等）

上記の例では「之」に添え仮名「を」が付属し、「之を」と読む。

#### 競合時の扱い

同一 token に `skam:kun` の `soe` 属性と単独の `skam:soegana` 要素が重複する場合:

- パーサーは警告を出してもよい
- `skam:kun` の `soe` 属性を**優先**する

---

### 7.8 `skam:okimoji`（置字）

原文にあるが訓読時に読まない漢字をマーク。

```xml
<skam:block>
  學<skam:okimoji>而</skam:okimoji>時習之
</skam:block>
```

#### 内容モデル

§7.0 を参照。

---

### 7.9 `skam:joji`（助字）

文法的機能を持つ漢字の分類ラベル。

```xml
<skam:block>
  學而時習<skam:joji>之</skam:joji>
</skam:block>
```

#### 内容モデル

§7.0 を参照。

---

### 7.10 `skam:span`（範囲注記）

傍点・圏点（emphasis）や傍線（highlight）など、後世に付加される視覚的注記を表す汎用要素。

※ 漢文原典にはこれらの注記は存在しない。教育・注釈目的で後世に付加される記述である。

```xml
<!-- 傍点 -->
<skam:block>
  <skam:span type="emphasis" style="dot">學而時</skam:span>習之
</skam:block>

<!-- 傍線（教育用途） -->
<skam:block>
  <skam:span type="highlight" style="solid" ref="ref-1">學而時習</skam:span>之
</skam:block>
```

#### 内容モデル

§7.0 の表のとおり（子に制約なし）。

#### 属性

| 属性    | 必須 | 説明                                        |
| ------- | ---- | ------------------------------------------- |
| `type`  | 必須 | 注記の種類（`emphasis` または `highlight`） |
| `style` | 任意 | スタイル（type により有効な値が異なる）     |
| `ref`   | 任意 | 参照するrefマークのID（highlight 用）       |

#### type と style の組み合わせ

**`type="emphasis"`（傍点・圏点）** — CSS `text-emphasis-style` 準拠:

- `dot` - 小さい点（• filled / ◦ open）
- `circle` - 丸（● filled / ○ open）
- `double-circle` - 二重丸（◉ filled / ◎ open）
- `triangle` - 三角（▲ filled / △ open）
- `sesame` - ゴマ点（﹅ filled / ﹆ open）
- カスタム文字列（任意の1文字、例: `★`, `◆`）
  - 1 code point で、Unicode の一般カテゴリが L / N / S / P のものに限る
  - そのうえで `\` `"` `'` `;` `{` `}` `<` `>` `&` は使えない
  - 制御文字、零幅文字、bidi 制御、結合文字は CSS の値を壊すので使えない

※ `filled`/`open` 修飾子で塗りつぶし/中空を指定可能。省略時は `filled`。
※ デフォルト値（style省略時）: `filled dot`

**`type="highlight"`（傍線）** — CSS `text-decoration-style` 準拠:

- `solid` - 実線（省略時のデフォルト）
- `dotted` - 点線
- `dashed` - 破線
- `wavy` - 波線
- `double` - 二重線

#### 正規化

- `type="emphasis"`: `marks.type = "emphasis"`, `style` を保持
- `type="highlight"`: `marks.type = "highlight"`, `style`, `ref` を保持
- `anchor = 内容のtoken範囲`
- `ref` 属性は `type="highlight"` の場合のみ有効。`type="emphasis"` では無視される。
- highlight と ref は `ref` 属性の名前でだけ結ぶ。`ref` 属性は、文書の中のどこにある `skam:ref` の `xml:id` でも指せる（後ろにあってもよく、別のブロックの highlight と共有してもよい）。指す `skam:ref` が無い、または `skam:ref` でない要素の `xml:id` なら誤り
- `ref` 属性の無い highlight（空の `ref=""` も同じ）は、要素の中に `skam:ref` があっても、それと結ばない。傍線のラベルにする ref には `xml:id` を付け、highlight に `ref` を書く

---

### 7.11 `skam:tateten`（たて点）

熟語境界を示す縦線。複数の漢字が一語として読まれることを示す。

```xml
<skam:block>
  <skam:tateten>國家</skam:tateten>之大事
</skam:block>
```

#### アンカー規則

- 包囲要素として熟語範囲を囲む
- アンカーは含まれる token 範囲

#### 正規化

- `marks.type = "tateten"`
- `anchor = 内容のtoken範囲`

#### 備考

- 熟語の読みは別途 `skam:yomigana` を同じ範囲に付与することで対応可能
- `emphasis` とは異なり、「強調」ではなく「構文境界」を示す

---

### 7.12 `skam:saidoku`（再読文字）

1つの文字を複数回読む再読文字を表現する。baseを1回だけ持ち、回ごとの語形を `skam:kunform` で表す。

```xml
<skam:block>
  <skam:saidoku>
    <skam:base>將</skam:base>
    <skam:kunform n="1" yomi="まさ" okuri="に"/>
    <skam:kunform n="2" okuri="す"/>
  </skam:saidoku>
  死
</skam:block>
```

※「將死」→「まさに死なんとす」

#### 子要素

| 要素           | 必須 | 説明                    |
| -------------- | ---- | ----------------------- |
| `skam:base`    | 必須 | 再読文字本体（1回のみ） |
| `skam:kunform` | 必須 | 各回の語形（1つ以上）   |

#### `skam:kunform` の属性

| 属性    | 必須 | 説明                     |
| ------- | ---- | ------------------------ |
| `n`     | 任意 | 読み順（省略時は出現順） |
| `yomi`  | 任意 | 読み仮名                 |
| `okuri` | 任意 | 送り仮名                 |

※ `kunform` は `kun` の1回分に相当する。

※ `skam:base` の内容モデルは §7.0 を参照。

※ 主な再読文字の一覧は SKAM 仕様 6.7節を参照。

#### 正規化

- `marks.type = "saidoku"`
- `anchor = base内のtoken`
- `forms[]` 配列に各 `kunform` を保持

---

### 7.13 `skam:ref`（参照識別子・注釈）

傍線部の識別子、問題番号、注釈等に使用する。**position ベース**でトークン間の位置に配置される。

空要素または内容を持つ要素として使用。内容を持つ場合は **分離定義として解体**される。

```xml
<!-- 自動番号（format指定） -->
<skam:block>
  <skam:span type="highlight" style="solid" ref="ref-1">學而時習</skam:span>
  <skam:ref xml:id="ref-1" format="iroha-katakana"/>之
</skam:block>

<!-- 明示ラベル -->
<skam:block>
  學而時習<skam:ref label="(※)"/>之
</skam:block>

<!-- 注釈（子要素として） - 分離定義に解体される -->
<skam:block>
  學而時習之<skam:ref format="numeric-bracket">「之」は目的語として読む。</skam:ref>
</skam:block>

<!-- 注釈のみ（番号なし） -->
<skam:block>
  學而時習之<skam:ref>補足説明テキスト</skam:ref>
</skam:block>

<!-- 分離定義（長い注釈用） -->
<skam:block>
  學而時習之<skam:ref xml:id="n1" format="numeric-bracket"/>
</skam:block>
<!-- skam:notes 内で skam:note が ref="n1" で参照 -->
```

#### 属性

| 属性     | 必須                            | 説明                                           |
| -------- | ------------------------------- | ---------------------------------------------- |
| `xml:id` | 分離定義時は必須                | 一意識別子。skam:note から参照される場合に必要 |
| `label`  | label/format/内容のいずれか必須 | 表示ラベル（明示値、formatと排他）             |
| `format` | label/format/内容のいずれか必須 | 自動番号フォーマット（labelと排他）            |

※ `label` と `format` は排他（併用禁止）
※ format の値一覧は SKAM 仕様 6.11節を参照。

#### 正規化

- `marks.type = "ref"`
- `position = { blockId: ブロックID, after: 直前token }`（先頭の場合は `{ blockId: ブロックID }`）
- **空要素**: position のみ生成
- **内容あり要素**: 内容を `content` フィールドに設定（内包テキストはトークン化しない）
- `label`, `format`, `content` を保持
- 分離定義: `skam:note` から content を解決

#### 内容内包の解体

SKAM-ML で内容を持つ ref は、SKAM JSON では位置マーカー + content として表現される：

```xml
<!-- SKAM-ML -->
<skam:ref format="numeric-bracket">「之」は目的語として読む。</skam:ref>
```

```json
// SKAM JSON
{
  "type": "ref",
  "position": { "blockId": "b1", "after": "t5" },
  "format": "numeric-bracket",
  "content": "「之」は目的語として読む。"
}
```

内包テキストは**トークン化されない**（本文の一部ではない）。

---

### 7.14 `skam:t`（token）

token 1 つを明示する。内容の文字をそのまま 1 つの token の `text` にする。書記素に分けず、空白も捨てない。

```xml
<skam:block>
  <skam:t>學問</skam:t>而<skam:kaeri kind="re"/>時<skam:t xml:id="cite-1">習</skam:t>之
</skam:block>
```

→ token は `學問`、`而`、`時`、`習`（id `cite-1`）、`之`。

平文で書けない token と、平文では持てない情報を持つ token に使う。

- 2 字以上の token（`學問`）
- 空白の token、空白で始まる token（`<skam:t> </skam:t>`）
- 前の字と同じテキストノードに書くと結合する字（`e` の後ろの U+0301 を別の token にするとき）
- 手書きの id、`ext`、`custom` を持つ token

#### 属性

| 属性          | 必須 | 説明                                                    |
| ------------- | ---- | ------------------------------------------------------- |
| `xml:id`      | 任意 | token の手書きの id（§7.1.1）。省略時は自動の id になる |
| `skam:ext`    | 任意 | token の `ext`（§10.3）                                 |
| `skam:custom` | 任意 | token の `custom`（§10.3）                              |

#### 内容モデル

§7.0 を参照（テキストのみ）。内容が空、または子の要素がある（コメントは除く）と誤り。

#### 正規化

- `skam:t` 1 つが token 1 つになる。注記は作らない
- token の順は、平文の字と同じく文書の順。位置マーク（kaeri など）の直前の token には `skam:t` の token も数える

---

### 7.15 `skam:note`（注釈本文・分離定義）

長い注釈テキストを `skam:notes` セクションに分離して定義する。
`ref` 属性で対応する `skam:ref` 要素を参照する。

```xml
<!-- 本文中: ref が宣言（xml:id を持つ） -->
<skam:block>
  學而時習之<skam:ref xml:id="n1" format="numeric-bracket"/>
</skam:block>

<!-- skam:notes内: note が ref を参照 -->
<skam:notes>
  <skam:note ref="n1">長い注釈テキスト...</skam:note>
</skam:notes>
```

#### 属性

| 属性  | 必須 | 説明                            |
| ----- | ---- | ------------------------------- |
| `ref` | 必須 | 参照する skam:ref 要素の xml:id |

---

## 8. Readings（読み層）

```xml
<skam:readings>
  <skam:reading kind="yomiage">
    学びて時に之を習ふ
  </skam:reading>
</skam:readings>
```

- `kind` は必須
- 内容は全文テキスト。前後の空白は削る。`xml:space="preserve"` があれば削らない
- `skam:ext` と `skam:custom` は、その reading の `ext` と `custom`（§10.3）
- token/mark との対応付けは v0.1 では行わない

---

## 9. Notes（注釈本文・分離定義）

`skam:notes` セクションには `skam:note` 要素を配置する。
`skam:note` は `ref` 属性で本文中の `skam:ref` 要素を参照し、その注釈内容を提供する。

### 9.1 参照関係

```
skam:ref (xml:id を持つ宣言)
    ↑ ref 属性で参照
skam:note (content を提供)
```

- `skam:ref` が宣言側（`xml:id` を持つ）
- `skam:note` が `ref` 属性で `skam:ref` を参照

### 9.2 構造

```xml
<skam:notes>
  <skam:note ref="n1">
    「之」は目的語として読む。
  </skam:note>
  <skam:note ref="n2">
    この一節は『論語』学而篇の冒頭である。
  </skam:note>
</skam:notes>
```

### 9.3 本文からの参照

```xml
<skam:block>
  學而時習之<skam:ref xml:id="n1" format="numeric-bracket"/>
</skam:block>
```

※ `skam:ref` の `xml:id="n1"` を `skam:note` の `ref="n1"` が参照する。
※ `#` 接頭辞は不要（`ref="n1"` と記述、`ref="#n1"` ではない）。

---

## 10. 拡張性

- SKAM 以外の名前空間の要素は誤りである（MUST NOT）。パーサーはエラーとして扱う
- 未知の `skam:*` 要素・属性は **無視してよい**。無視した場合は、要素名と位置を利用者に通知してよい。`skam:ext` と `skam:custom` は既知の属性である（§10.3）
- round-trip を行う処理系は **保持して再出力してよい**
- 将来の拡張は **後方互換**で行う

### 10.1 拡張の名前空間の属性（規範）

拡張は、要素に自分の名前空間の属性を付けて値を書く。SKAM JSON の `ext.<拡張の名前>` に対応する。

- 知っている拡張（登録簿か、parser に渡された定義にある拡張）の名前空間の属性で、宣言（§4.1.1）が無いものは誤り
- 知っている拡張でも、定義が無く使うだけの拡張の属性は読み飛ばす
- 登録されていない名前空間の属性は、読み飛ばす（ほかの道具が付けた属性を含む文書を誤りにしない）
- 属性の読み方は拡張の定義が決める。誤りのメッセージに属性の値は含めない
- 出力する処理系は、使っている拡張を宣言して書く。宣言の無い文書には、`skam:extension` も拡張の名前空間の宣言も書かない

### 10.2 学習・教育用拡張（edu）の属性（規範）

名前空間 `urn:skam:edu:1`。値は問いの名前で、SKAM-draft §13 の `quiz` に対応する（1 字以上 64 字以下、制御文字を含まない）。空の値は誤り。

1 つの要素が 1 つの注記を作る要素は、属性 `edu:quiz` を使う。

| 要素            | 属性       | 印を付ける注記の種類 |
| --------------- | ---------- | -------------------- |
| `skam:kaeri`    | `edu:quiz` | `kaeri`              |
| `skam:kutoten`  | `edu:quiz` | `kutoten`            |
| `skam:okototen` | `edu:quiz` | `okototen`           |
| `skam:okimoji`  | `edu:quiz` | `okimoji`            |
| `skam:joji`     | `edu:quiz` | `joji`               |
| `skam:tateten`  | `edu:quiz` | `tateten`            |
| `skam:saidoku`  | `edu:quiz` | `saidoku`            |
| `skam:yomigana` | `edu:quiz` | `yomigana`           |
| `skam:soegana`  | `edu:quiz` | `soegana`            |

`skam:kun` は読み仮名、送り仮名、添え仮名を 1 つの要素で持つので、部分ごとの属性を使う。部分の属性は、その部分が作る注記（範囲の `skam:kun` なら範囲全体の注記 1 つ）の印になる。

| 属性             | 印を付ける注記             |
| ---------------- | -------------------------- |
| `edu:yomi-quiz`  | `yomi` が作る `yomigana`   |
| `edu:okuri-quiz` | `okuri` が作る `okurigana` |
| `edu:soe-quiz`   | `soe` が作る `soegana`     |

次は誤りとする。

- `skam:kun` の `edu:quiz`
- 対応する部分の属性が無いのに付いた部分の属性（`okuri` が無い `edu:okuri-quiz`）
- `skam:kunform`、`skam:span`、`skam:ref`、`skam:br` など、上の表に無い要素への `edu` の属性
- 宣言（§4.1.1）が無い文書の `edu` の属性

```xml
<skam:doc xmlns:skam="urn:skam:1" xmlns:edu="urn:skam:edu:1">
  <skam:meta><skam:extension name="edu" uri="urn:skam:edu:1" required="true"/></skam:meta>
  <skam:body>
    <skam:block><skam:kun yomi="まな" okuri="ブ" edu:okuri-quiz="問1">學</skam:kun>而</skam:block>
  </skam:body>
</skam:doc>
```

### 10.3 `ext`、`custom`、`placementHint` の属性（規範）

| 属性             | 値                  | SKAM JSON                 |
| ---------------- | ------------------- | ------------------------- |
| `skam:ext`       | JSON のオブジェクト | `ext`（キーは拡張の名前） |
| `skam:custom`    | JSON のオブジェクト | `custom`                  |
| `placement-hint` | 文字列              | 注記の `placementHint`    |

- 置ける要素: `skam:ext` と `skam:custom` は、ルート、`skam:block`、`skam:t`、`skam:reading`、すべての注記の要素。`placement-hint` は注記の要素だけ（ほかの要素では読まない）。`skam:kun` は部分ごとの名前を使う（§7.3）
- 属性名: JSON の値を持つ属性は `skam:` 名前空間、ほかは SKAM の属性（`yomi` など）と同じく接頭辞なし
- `skam:ext` は、属性での書き方（§10.1）を定めない拡張の値と、宣言の無い文書の `ext` を書く。属性での書き方を定める拡張の値はその属性で書く。同じ拡張の値を両方に書くと誤り
- 次は誤り: JSON として読めない値、オブジェクトでない値、1,000,000 文字を超える値
- 値の中身の上限と禁止のキー（`__proto__` など）は SKAM-draft §11.3 による
- derivations の `ext` と `custom` は書かない（§4.2）

属性値の TAB、LF、CR は文字参照（`&#9;`、`&#10;`、`&#13;`）で書く。生のまま書くと、XML の属性値の正規化で空白に変わる。本文の CR も `&#13;` で書く（§6.2）。JSON の文字列の中の U+FFFE と U+FFFF は、XML に書けないので JSON の `\u` のエスケープで書く。

```xml
<skam:doc xmlns:skam="urn:skam:1" skam:custom='{"source":"論語"}'>
  <skam:body>
    <skam:block><skam:okimoji placement-hint="left">而</skam:okimoji></skam:block>
  </skam:body>
</skam:doc>
```

---

## 11. 最小完全例

### 11.1 基本例（學而時習之）

```xml
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:meta tokenization="char"/>

  <skam:body>
    <skam:block>
      <skam:kun yomi="まな" okuri="びて">學</skam:kun>
      而
      <skam:kun okuri="に">時</skam:kun>
      <skam:kun okuri="ふ">習</skam:kun>
      <skam:kaeri kind="re"/>
      <skam:kun soe="を">之</skam:kun>
      <skam:ref xml:id="n1" format="numeric-bracket"/>
    </skam:block>
  </skam:body>

  <skam:readings>
    <skam:reading kind="yomiage">
      まなびて ときに これを ならふ
    </skam:reading>
  </skam:readings>

  <skam:notes>
    <skam:note ref="n1">「之」は目的語。</skam:note>
  </skam:notes>
</skam:doc>
```

### 11.2 再読文字の例（將死）

```xml
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      <skam:saidoku>
        <skam:base>將</skam:base>
        <skam:kunform n="1" yomi="まさ" okuri="に"/>
        <skam:kunform n="2" okuri="す"/>
      </skam:saidoku>
      <skam:kaeri kind="re"/>
      <skam:kun yomi="し" okuri="な">死</skam:kun>
    </skam:block>
  </skam:body>

  <skam:readings>
    <skam:reading kind="yomiage">まさに しなんとす</skam:reading>
  </skam:readings>
</skam:doc>
```

### 11.3 ヲコト点の例

```xml
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      <skam:okototen grid="5x5" x="4" y="4" shape="dot" sound="り">學</skam:okototen>而時習之
    </skam:block>
  </skam:body>
</skam:doc>
```

### 11.4 句読点の例

```xml
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      <skam:kun yomi="まな" okuri="びて">學</skam:kun>
      而時
      <skam:kun okuri="ふ">習</skam:kun>
      <skam:kaeri kind="re"/>
      <skam:kun soe="を">之</skam:kun>
      <skam:kutoten value="。"/>
    </skam:block>
  </skam:body>
</skam:doc>
```

### 11.5 傍線部と参照識別子の例

教育用途での傍線部指示の例（span type="highlight" + ref を使用）：

```xml
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      <skam:span type="highlight" style="solid" ref="ref-1">
        <skam:kun yomi="まな" okuri="びて">學</skam:kun>
        而
        <skam:kun okuri="に">時</skam:kun>
        <skam:kun okuri="ふ">習</skam:kun>
        <skam:kaeri kind="re"/>
      </skam:span>
      <skam:ref xml:id="ref-1" format="iroha-katakana"/>
      <skam:kun soe="を">之</skam:kun>
    </skam:block>
  </skam:body>
</skam:doc>
```

### 11.6 注釈の例

```xml
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      <skam:kun yomi="まな" okuri="びて">學</skam:kun>
      而
      <skam:kun okuri="に">時</skam:kun>
      <skam:kun okuri="ふ">習</skam:kun>
      <skam:kaeri kind="re"/>
      <skam:kun soe="を">之</skam:kun>
      <skam:ref xml:id="n1" format="numeric-bracket"/>
    </skam:block>
  </skam:body>

  <skam:notes>
    <skam:note ref="n1">「之」は目的語として読む。</skam:note>
  </skam:notes>
</skam:doc>
```

---

## 要点

SKAM-ML/XMLはHTMLに依存しない純XML語彙とし、本文構造は`skam:block`等で完結させる。訓（読み＋送り仮名）は`skam:kun`で表し、再読文字は`skam:saidoku`+`skam:kunform`で複数回の語形を表現する。返り点等は本文近傍に記述し、コンパイルでstand-offなSKAM(JSON)へ正規化する。

### SKAM-ML/XML → SKAM JSON の主な変換対応

| SKAM-ML/XML 要素                      | SKAM JSON marks.type                    |
| ------------------------------------- | --------------------------------------- |
| `skam:kaeri`                          | `kaeri`                                 |
| `skam:kun` (yomi属性)                 | `yomigana`                              |
| `skam:kun` (okuri属性)                | `okurigana`                             |
| `skam:kun` (soe属性)                  | `soegana`                               |
| `skam:yomigana`                       | `yomigana`                              |
| `skam:kutoten`                        | `kutoten`                               |
| `skam:okototen`                       | `okototen`                              |
| `skam:soegana`                        | `soegana`                               |
| `skam:okimoji`                        | `okimoji`                               |
| `skam:joji`                           | `joji`                                  |
| `skam:span` (type="emphasis")         | `emphasis`                              |
| `skam:span` (type="highlight")        | `highlight`                             |
| `skam:ref`                            | `ref`                                   |
| `skam:br`                             | `linebreak`                             |
| `skam:saidoku`                        | `saidoku`                               |
| `skam:tateten`                        | `tateten`                               |
| `skam:extension`（`skam:meta` の子）  | `extensions` と `extensionsRequired`    |
| 拡張の名前空間の属性（例 `edu:quiz`） | `ext.<拡張の名前>`（例 `ext.edu.quiz`） |

- `skam:t` は注記ではなく token 1 つになる（§7.14）。
- `skam:ext`、`skam:custom`、`placement-hint` は、持ち主の `ext`、`custom`、`placementHint` になる（§10.3）。
- `derivations`（読み順等）はコンパイル時に生成される。

---

## 変更履歴

### v0.1 改訂（2026-10）

- §3.3: 埋め込み時のメディアタイプ `application/vnd.berlysia.skam+xml` を規範として新設した（0.1.0 から公開されている文字列を確定した）
- §4: `<!` で始まる宣言を使わないこととした
- §6.2: 無視する空白に U+000D を加えた。U+3000 は無視されず token になる
- §7.2: ブロック先頭の `skam:kaeri` を誤りとした
- §7.3 / §7.4 / §7.10: `skam:yomigana` と `skam:span` はテキストと `skam:kun` を子に持てることを明記した。`skam:kun` の中に既知の要素があれば誤り（`skam:span` については、下の §7.10 の項目で訂正した）
- §7.10: カスタム傍点の 1 文字に許す文字クラスを定めた
- §10: SKAM 以外の名前空間の要素を誤りとした。未知の `skam:*` は無視し、通知してよい
- §7.0: 内容モデル表（規範）を新設した。字を包む要素（`skam:okimoji` / `skam:joji` / `skam:okototen` / `skam:base`）は `skam:kun` と、入れ子の包む要素を子に持てる。範囲が同じ要素どうしの入れ子順を定めた
- §7.10: `skam:span` の内容モデルの誤記を訂正した（§7.0 のとおり、子に制約なし）。§7.3 / §7.4 / §7.6 / §7.8 / §7.9 / §7.12 の内容モデルの記述は §7.0 への参照に置き換えた（§7.6 / §7.8 / §7.9 / §7.10 には「内容モデル」の節を新設した）
- SKAM-draft §6.1: 同じ anchor に同じ種類の注記を 2 つ以上置くことを禁じた（yomigana / okurigana / soegana / okimoji / joji / saidoku）
- §4.1.1 / §10.1 / §10.2: 拡張の宣言 `skam:extension`、拡張の名前空間の属性、学習・教育用拡張 `edu` の属性と対応表を足した。`skam:meta` に子の要素を許した
- 互換性の注意: 0.1.x の parser は、字を包む要素の中の `skam:kun` と、入れ子になった包む要素を黙って捨てる。この改訂以降の出力は、改訂以降の parser で読むこと
- §7.1.1: id の規則を新設した。すべての注記の要素が `xml:id` を持て、値は NCName に限る。省略したときの id は位置から決まる自動の id（`b#1`、`b#1#1`、`m#1`）になる
- §7.10: highlight と ref は `ref` 属性でだけ結ぶ。`ref` 属性の無い highlight は、中の `skam:ref` と結ばなくなった。`ref` 属性は後ろの ref も指せる
- §7.14: token を明示する `skam:t` を新設した。§6 と §7.0 を合わせて直した
- §10.3: `skam:ext`、`skam:custom`、`placement-hint` を新設した（§3.2、§5.2、§7.3、§8 も）。`skam:reading` の `xml:space="preserve"` を読む。属性値の TAB、LF、CR は文字参照で書く
- 互換性の注意: この改訂より前の parser は、`skam:t` を未知の要素として中の字ごと捨て、新しい属性を無視する
