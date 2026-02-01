了解。では **HTML互換は Ruby の意味互換のみに限定**し、
**本文構造は純粋な SKAM 語彙で完結する XML**として、
**SKAM-ML/XML v0.1 を再構成**する。

以下は **差分ではなく、読めばそのまま使える再構成版仕様案**。

---

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

---

## 7. 注記要素（本文内）

### 7.1 アンカー規則（規範）

| 要素種別 | アンカー            |
| -------- | ------------------- |
| 空要素   | 直前 token          |
| 包囲要素 | 含まれる token 範囲 |

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

#### 正規化

- `marks.type = "kaeri"`
- `marks.kind = kind`
- `anchor = 直前token`

---

### 7.3 `skam:kun`（訓）

漢字の読み仮名・送り仮名・添え仮名を表す語形要素。baseは内容、読み・送り・添えは属性。

```xml
<skam:block>
  <skam:kun reading="まな" okuri="びて">學</skam:kun>而
  <skam:kun okuri="に">時</skam:kun>
  <skam:kun okuri="ふ">習</skam:kun>
  <skam:kun soe="を">之</skam:kun>
</skam:block>
```

#### 属性

| 属性      | 必須 | 説明                         |
| --------- | ---- | ---------------------------- |
| `reading` | 任意 | 読み仮名（漢字の読み）       |
| `okuri`   | 任意 | 送り仮名（活用語尾）         |
| `soe`     | 任意 | 添え仮名（テニヲハ等の助詞） |

※ 全て省略可。少なくとも一方を指定することを推奨。

#### 正規化

SKAM-ML/XML の `skam:kun` は、JSON 側では `yomigana`、`okurigana`、`soegana` に分離される。

- `reading` 属性がある場合: `marks.type = "yomigana"`, `value = reading属性`
- `okuri` 属性がある場合: `marks.type = "okurigana"`, `value = okuri属性`
- `soe` 属性がある場合: `marks.type = "soegana"`, `value = soe属性`
- 複数ある場合: 複数の mark が生成される（同一 anchor を共有）

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

句読点を表す。

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
- `anchor = 直前token`
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

#### グリッド座標

5×5または7×7のグリッドで位置を指定。NINJAL系の方眼分割と対応。

```
  0 1 2 3 4
0 ┌─┬─┬─┬─┐
1 ├─┼─┼─┼─┤
2 ├─┼─┼─┼─┤  (5×5 グリッド)
3 ├─┼─┼─┼─┤
4 └─┴─┴─┴─┘
```

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

```xml
<skam:block>
  <skam:span type="emphasis" kind="dot">學而時</skam:span>習之
</skam:block>
```

#### 属性

- `type`（必須）
- `kind`（任意）

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
    <skam:kunform n="1" reading="まさ" okuri="に"/>
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

| 属性      | 必須 | 説明                     |
| --------- | ---- | ------------------------ |
| `n`       | 任意 | 読み順（省略時は出現順） |
| `reading` | 任意 | 読み仮名                 |
| `okuri`   | 任意 | 送り仮名                 |

※ `kunform` は `kun` の1回分に相当する。

#### 主な再読文字

| 文字   | 1回目 (reading + okuri) | 2回目 (okuri) | 意味                 |
| ------ | ----------------------- | ------------- | -------------------- |
| 將・且 | まさ＋に                | す            | 今にも〜しようとする |
| 未     | いま＋だ                | ず            | まだ〜ない           |
| 當・応 | まさ＋に                | し            | 〜すべきである       |
| 須     | すべから＋く            | し            | 〜すべきである       |
| 宜     | よろ＋しく              | し            | 〜するのがよい       |
| 猶     | な＋ほ                  | ごとし        | ちょうど〜のようだ   |
| 盍     | なん＋ぞ                | ざる          | どうして〜しないのか |

#### 正規化

- `marks.type = "saidoku"`
- `anchor = base内のtoken`
- `forms[]` 配列に各 `kunform` を保持

---

### 7.13 `skam:underline`（傍線）

教育用途や試験問題等で傍線部を指示するために使用する。

```xml
<skam:block>
  <skam:underline style="solid" group="a">學而時習</skam:underline>之
</skam:block>
```

#### 属性

| 属性    | 必須 | 説明                                               |
| ------- | ---- | -------------------------------------------------- |
| `style` | 任意 | 傍線スタイル（solid, dotted, dashed, wavy, double） |
| `group` | 任意 | ラベルとの関連付けグループID                       |

#### style 一覧

| style    | 説明     |
| -------- | -------- |
| `solid`  | 実線     |
| `dotted` | 点線     |
| `dashed` | 破線     |
| `wavy`   | 波線     |
| `double` | 二重線   |

#### 正規化

- `marks.type = "underline"`
- `anchor = 内容のtoken範囲`
- `style`, `group` を保持

---

### 7.14 `skam:label`（番号振り）

傍線部の識別や問題番号の付与等に使用する。空要素として直前tokenに付与する。

```xml
<skam:block>
  <skam:underline style="solid" group="a">學而時習</skam:underline>
  <skam:label format="iroha" group="a"/>之
</skam:block>
```

#### 属性

| 属性     | 必須 | 説明                                       |
| -------- | ---- | ------------------------------------------ |
| `value`  | 任意 | 識別用文字列（format指定時は自動生成可能） |
| `format` | 任意 | 番号フォーマット                           |
| `group`  | 任意 | アンダーラインとの関連付けグループID       |

#### format 一覧

| format            | 例               | 説明             |
| ----------------- | ---------------- | ---------------- |
| `alpha-upper`     | A, B, C, ...     | 英大文字         |
| `alpha-lower`     | a, b, c, ...     | 英小文字         |
| `numeric`         | 1, 2, 3, ...     | 数字             |
| `circled`         | ①, ②, ③, ...     | 丸数字           |
| `iroha`           | ア, イ, ウ, ...  | いろは順カタカナ |
| `iroha-hiragana`  | あ, い, う, ...  | いろは順ひらがな |
| `gojuon`          | ア, イ, ウ, ...  | 五十音順カタカナ |
| `gojuon-hiragana` | あ, い, う, ...  | 五十音順ひらがな |
| `kanji-numeric`   | 一, 二, 三, ...  | 漢数字           |

#### 正規化

- `marks.type = "label"`
- `anchor = 直前token`
- `value`, `format`, `group` を保持

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

## 9. Notes（注釈本文）

### 9.1 `skam:ref`（本文内）

```xml
<skam:block>
  學而時習之<skam:ref target="#n1"/>
</skam:block>
```

- 既定アンカー：直前token

### 9.2 `skam:note`

```xml
<skam:notes>
  <skam:note xml:id="n1">
    「之」は目的語として読む。
  </skam:note>
</skam:notes>
```

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
      <skam:kun reading="まな" okuri="びて">學</skam:kun>
      而時
      <skam:kun okuri="に">之</skam:kun>
      <skam:kaeri kind="re"/>
      <skam:kun okuri="ふ">習</skam:kun>
      <skam:ref target="#n1"/>
    </skam:block>
  </skam:body>

  <skam:readings>
    <skam:reading kind="yomiage">
      まなびて ときに これを ならふ
    </skam:reading>
  </skam:readings>

  <skam:notes>
    <skam:note xml:id="n1">「之」は目的語。</skam:note>
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
        <skam:kunform n="1" reading="まさ" okuri="に"/>
        <skam:kunform n="2" okuri="す"/>
      </skam:saidoku>
      <skam:kun reading="し" okuri="な">死</skam:kun>
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
      <skam:kun reading="まな" okuri="びて">學</skam:kun>
      而時
      <skam:kun okuri="に">之</skam:kun>
      <skam:kaeri kind="re"/>
      <skam:kun okuri="ふ">習</skam:kun>
      <skam:kutoten value="。"/>
    </skam:block>
  </skam:body>
</skam:doc>
```

### 11.5 傍線と番号振りの例

教育用途での傍線部指示の例：

```xml
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      <skam:underline style="solid" group="a">
        <skam:kun reading="まな" okuri="びて">學</skam:kun>
        而
        <skam:kun okuri="に">時</skam:kun>
        <skam:kun okuri="ふ">習</skam:kun>
      </skam:underline>
      <skam:label format="iroha" group="a"/>
      <skam:kun soe="を">之</skam:kun>
      <skam:kaeri kind="re"/>
    </skam:block>
  </skam:body>
</skam:doc>
```

---

## 要点

SKAM-ML/XMLはHTMLに依存しない純XML語彙とし、本文構造は`skam:block`等で完結させる。訓（読み＋送り仮名）は`skam:kun`で表し、再読文字は`skam:saidoku`+`skam:kunform`で複数回の語形を表現する。返り点等は本文近傍に記述し、コンパイルでstand-offなSKAM(JSON)へ正規化する。

### SKAM-ML/XML → SKAM JSON の主な変換対応

| SKAM-ML/XML 要素              | SKAM JSON marks.type |
| ----------------------------- | -------------------- |
| `skam:kaeri`                  | `kaeri`              |
| `skam:kun` (reading属性)      | `yomigana`           |
| `skam:kun` (okuri属性)        | `okurigana`          |
| `skam:yomigana`               | `yomigana`           |
| `skam:kutoten`                | `kutoten`            |
| `skam:okototen`               | `okototen`           |
| `skam:soegana`                | `soegana`            |
| `skam:okimoji`                | `okimoji`            |
| `skam:joji`                   | `joji`               |
| `skam:span` (type="emphasis") | `emphasis`           |
| `skam:ref` / `skam:note`      | `note`               |
| `skam:saidoku`                | `saidoku`            |
| `skam:tateten`                | `tateten`            |
| `skam:underline`              | `underline`          |
| `skam:label`                  | `label`              |

※ `derivations`（読み順等）はコンパイル時に生成される。
