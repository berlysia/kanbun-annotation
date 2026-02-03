# SKAM-ML/XML

## Stand-off Kanbun Annotation Model – Markup Language (XML)

### Specification Draft v0.1

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

### 3.2 ルート要素

```xml
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  …
</skam:doc>
```

---

## 4. 文書構造

### 4.1 トップレベル構成

| 要素            | 必須 | 説明                 |
| --------------- | ---- | -------------------- |
| `skam:meta`     | 任意 | トークナイズ等の指示 |
| `skam:body`     | 必須 | 本文                 |
| `skam:readings` | 任意 | 読み層               |
| `skam:notes`    | 任意 | 注釈本文             |

```xml
<skam:doc xmlns:skam="urn:skam:1">
  <skam:meta tokenization="char"/>
  <skam:body>…</skam:body>
  <skam:readings>…</skam:readings>
  <skam:notes>…</skam:notes>
</skam:doc>
```

### 4.2 Derivations（導出情報）について

SKAM-ML/XML では `derivations`（読み順等の導出情報）を**直接記述しない**。
返り点等から計算される読み順などの導出情報は、**コンパイル時に SKAM JSON 側で生成**される。

詳細は SKAM 仕様の「6. Derivations」を参照。

---

## 5. 本文構造（HTML非依存）

### 5.1 `skam:body`

本文全体を包む。

### 5.2 `skam:block`

段落・文ブロックの最小単位。

```xml
<skam:body>
  <skam:block>學而時習之</skam:block>
</skam:body>
```

- 改行・段落の意味は **構造情報としてのみ**扱う
- 見た目の段落とは無関係

---

## 6. Tokenization（非規範）

- 既定：`tokenization="char"`
- `skam:block` 内のテキストから token 列を生成
- SKAM-ML/XML では token を明示しない
  → **token は常にコンパイル生成物**

### 6.1 Tokenization アルゴリズム（char mode）

1. `skam:body` 内の全 `skam:block` を文書順で走査
2. 各 `skam:block` 内の全子ノードを深さ優先走査
3. テキストノードを文字単位（Unicode コードポイント単位）で分割
4. 要素の内容も含めて、文書順序で token 列を構築
5. token index は `skam:body` 全体で通し番号（0-based）
   - `skam:block` の境界で index はリセット**されない**

### 6.2 空白・改行の扱い

- 改行（U+000A）、タブ（U+0009）、半角スペース（U+0020）の連続は tokenization 時に**無視される**
- 意図的な空白が必要な場合は全角スペース（U+3000）等を使用

### 6.3 例

```xml
<skam:body>
  <skam:block><skam:kun>學</skam:kun>而</skam:block>
  <skam:block>時習之</skam:block>
</skam:body>
```

→ tokens: `[{id:"t0", text:"學"}, {id:"t1", text:"而"}, {id:"t2", text:"時"}, {id:"t3", text:"習"}, {id:"t4", text:"之"}]`

---

## 7. 注記要素（本文内）

### 7.1 アンカー規則（規範）

注記要素は SKAM JSON の Mark に変換される際、**anchor** または **position** で参照先を指定する。

#### anchor ベース（トークンに紐づく Mark）

| 要素種別 | アンカー            |
| -------- | ------------------- |
| 空要素   | 直前 token          |
| 包囲要素 | 含まれる token 範囲 |

#### position ベース（トークン間に存在する Mark）

以下の要素は anchor ではなく **position** で配置位置を指定する：

| 要素           | position の決定方法                                  |
| -------------- | ---------------------------------------------------- |
| `skam:kutoten` | 直前 token の後（`{ after: tokenId }`）              |
| `skam:ref`     | 直前 token の後、または先頭の場合は最初の token の前 |

position は `{ before: tokenId }` または `{ after: tokenId }` の形式。

---

### 7.2 `skam:kaeri`（返り点）

```xml
<skam:block>
  學而<skam:kaeri kind="re"/>時習之
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
| `ten`  | 点              |
| `ko`   | 甲              |
| `otsu` | 乙              |
| `hei`  | 丙              |
| `tei`  | 丁              |

複合返り点（例: 一レ）は `kind="ichi-re"` のように連結表記する。

#### 正規化

- `marks.type = "kaeri"`
- `marks.value = kind に対応する記号`（上記対応表参照）
- `anchor = 直前token`

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

#### 正規化

SKAM-ML/XML の `skam:kun` は、JSON 側では `yomigana`、`okurigana`、`soegana` に分離される。

- `yomi` 属性がある場合: `marks.type = "yomigana"`, `value = yomi属性`
- `okuri` 属性がある場合: `marks.type = "okurigana"`, `value = okuri属性`
- `soe` 属性がある場合: `marks.type = "soegana"`, `value = soe属性`
- 複数ある場合: 複数の mark が生成される（同一 anchor を共有）
  - ※ 生成順序は SKAM 仕様 5.1節「同一 anchor を持つ marks の順序」を参照

#### 内容モデル

- テキストノードのみ（漢字1文字を推奨）
- 他の `skam:*` 要素を子として含まない
- 他の `skam:*` 要素（`underline`, `span` 等）の子要素として使用可能

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
- `position = { after: 直前token }` （先頭の場合は `{ before: 最初のtoken }`）
- `value = value属性`
- `kind` があれば保持、なければパーサーが推論してもよい

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

※ グリッド座標の詳細は SKAM 仕様 5.6節を参照。

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

---

### 7.9 `skam:joji`（助字）

文法的機能を持つ漢字の分類ラベル。

```xml
<skam:block>
  學而時習<skam:joji>之</skam:joji>
</skam:block>
```

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

※ 主な再読文字の一覧は SKAM 仕様 5.5節を参照。

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
※ format の値一覧は SKAM 仕様 5.11節を参照。

#### 正規化

- `marks.type = "ref"`
- `position = { after: 直前token }` （先頭の場合は `{ before: 最初のtoken }`）
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
  "position": { "after": "t5" },
  "format": "numeric-bracket",
  "content": "「之」は目的語として読む。"
}
```

内包テキストは**トークン化されない**（本文の一部ではない）。

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
- 内容は全文テキスト
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

- 未知の `skam:*` 要素・属性は **無視してよい**
- round-trip を行う処理系は **保持して再出力してよい**
- 将来の拡張は **後方互換**で行う

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
      <skam:kun soe="を">之</skam:kun>
      <skam:kaeri kind="re"/>
      <skam:kun okuri="ふ">習</skam:kun>
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
      <skam:kun yomi="し" okuri="な">死</skam:kun>
      <skam:kaeri kind="re"/>
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
      <skam:kun okuri="に">之</skam:kun>
      <skam:kaeri kind="re"/>
      <skam:kun okuri="ふ">習</skam:kun>
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
      </skam:span>
      <skam:ref format="iroha-katakana"/>
      <skam:kun soe="を">之</skam:kun>
      <skam:kaeri kind="re"/>
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
      <skam:kun soe="を">之</skam:kun>
      <skam:kaeri kind="re"/>
      <skam:kun okuri="ふ">習</skam:kun>
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

| SKAM-ML/XML 要素               | SKAM JSON marks.type |
| ------------------------------ | -------------------- |
| `skam:kaeri`                   | `kaeri`              |
| `skam:kun` (yomi属性)          | `yomigana`           |
| `skam:kun` (okuri属性)         | `okurigana`          |
| `skam:kun` (soe属性)           | `soegana`            |
| `skam:yomigana`                | `yomigana`           |
| `skam:kutoten`                 | `kutoten`            |
| `skam:okototen`                | `okototen`           |
| `skam:soegana`                 | `soegana`            |
| `skam:okimoji`                 | `okimoji`            |
| `skam:joji`                    | `joji`               |
| `skam:span` (type="emphasis")  | `emphasis`           |
| `skam:span` (type="highlight") | `highlight`          |
| `skam:ref`                     | `ref`                |
| `skam:saidoku`                 | `saidoku`            |
| `skam:tateten`                 | `tateten`            |

※ `derivations`（読み順等）はコンパイル時に生成される。
