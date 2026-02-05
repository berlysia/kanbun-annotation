# Stand-off Kanbun Annotation Model（SKAM）

## Specification Draft v0.1

---

## 1. 目的と設計方針

### 1.1 目的

SKAM は、漢文本文と訓点・注記・読みを**分離して保持**し、
表示（HTML/CSS/SVG 等）や読み上げ（a11y）を**後工程で生成**するための
**意味モデル（annotation model）**である。

### 1.2 非目的

- 表示レイアウトの完全再現を保証しない
- CSS のみで全ての漢文表現を解決しない
- 訓読文法そのものを規定しない

---

## 2. 基本概念

### 2.1 本文（Base Text）

- 漢字列を **線形な token 列**として表現する
- token は SKAM 内のすべての参照の基準単位である

### 2.2 注記（Annotation / Mark）

- 返り点・送り仮名・助字・強調・注釈等
- 本文テキストを直接分断しない（stand-off）

注記には2種類の参照方式がある：

- **anchor 参照**: 本文 token（群）に紐づく注記（読み仮名、送り仮名、返り点等）
- **position 参照**: token 間の位置に存在する注記（句読点、参照識別子等）

### 2.3 読み（Reading Layer）

- 書き下し文・読み上げ用文など
- 表示とは独立した層として保持する

---

## 3. データ形式

SKAM は JSON 形式で表現される。

```json
{
  "format": "skam@0.1",
  "tokens": [],
  "blocks": [],
  "marks": [],
  "readings": [],
  "ext": {}
}
```

- `tokens` は本文 token のマスター定義（順序は blocks が規定する）
- `blocks` はブロック構造（必須、原文順）
- `ext` は拡張フィールド（任意）

---

## 4. Blocks（ブロック）

### 4.1 定義

論理的なブロック（段落・文単位）。tokens の部分集合を順序付きで保持する。

```json
{
  "id": "b1",
  "tokenIds": ["t1", "t2", "t3"],
  "ext": {}
}
```

### 4.2 規則

- `id` は**必須**であり、一意でなければならない
- `tokenIds` は順序付きの token ID 配列。ブロック内の原文順を表す
- 全 token は**ちょうど1つの block**に属しなければならない（MUST）
- 1つの token が複数の block に属してはならない
- `blocks` 配列の順序は原文順を表す
- `ext` は拡張フィールド（任意、round-trip 保持推奨）

### 4.3 tokens 配列との関係

- `tokens` 配列は全 token のマスター定義であり、配列順序は意味を持たない
- token の原文順序は `blocks` 配列内の `tokenIds` の順序によって規定される
- `blocks[].tokenIds` に含まれない token ID が `tokens` 配列に存在してはならない（MUST NOT）

---

## 5. Tokens

### 5.1 定義

本文を構成する最小単位。

```json
{
  "id": "t1",
  "text": "学",
  "ext": {}
}
```

### 5.2 規則

- `id` は**必須**であり、一意でなければならない
- `text` は UTF-8 文字列
- token 分割規則（1字/熟語等）は SKAM 仕様外とする
  - **推奨：字単位**（訓点・返り点の指示と一致するため）
- `ext` は拡張フィールド（任意、round-trip 保持推奨）

### 5.3 参照エラー

anchor で存在しない `id` を参照した場合、パーサーはエラーとして扱うべきである（SHOULD）。

---

## 6. Marks（注記）

### 6.1 共通構造

注記には **anchor ベース**と **position ベース**の2種類がある。

#### anchor ベース（トークンに紐づく注記）

```json
{
  "type": "okurigana",
  "id": "m1",
  "anchor": { "from": "t3", "to": "t3" },
  "value": "ぶ",
  "placementHint": "right",
  "ext": {}
}
```

#### position ベース（トークン間に存在する注記）

```json
{
  "type": "kutoten",
  "id": "m1",
  "position": { "blockId": "b1", "after": "t3" },
  "value": "。",
  "ext": {}
}
```

#### フィールド

| フィールド      | 必須                | 説明                                                                  |
| --------------- | ------------------- | --------------------------------------------------------------------- |
| `type`          | 必須                | 注記種別                                                              |
| `id`            | 任意（推奨）        | 一意識別子。編集・差分・UI操作用。無ければ配列indexを一時IDとして扱う |
| `anchor`        | anchor ベースのみ   | 対象 token 範囲                                                       |
| `position`      | position ベースのみ | 配置位置（トークン間）                                                |
| `value`         | type依存            | 表示・意味の主データ                                                  |
| `placementHint` | 任意                | 表示上の弱いヒント（解釈不能でも問題としない）                        |
| `ext`           | 任意                | 拡張フィールド（round-trip 保持推奨）                                 |

#### 同一 anchor を持つ marks の順序

同一の `anchor` を持つ複数の mark が存在する場合、`marks` 配列内の**出現順序**がレンダリング順序に影響する可能性がある。

推奨順序（同一 token に対して）:

1. `yomigana`（読み仮名）
2. `okurigana`（送り仮名）
3. `soegana`（添え仮名）
4. その他

※ 順序に依存しない実装を推奨するが、round-trip の安定性のため上記順序を推奨。

#### placementHint の値例

`placementHint` は実装依存の任意文字列である。以下は参考例：

- `right-bottom`: 右下（返り点の典型的位置）
- `right-top`: 右上（送り仮名の典型的位置）
- `left`: 左側
- `inline`: 行内

未知の値は無視してよい。

---

### 6.2 type 一覧（v0.1）

| type        | 意味                               | 参照方式     | value                                 |
| ----------- | ---------------------------------- | ------------ | ------------------------------------- |
| `kaeri`     | 返り点                             | **position** | 必須（レ、一、二、上、下、甲、乙 等） |
| `okurigana` | 送り仮名                           | anchor       | 必須（送り仮名テキスト）              |
| `yomigana`  | 読み仮名（ルビ）                   | anchor       | 必須（読み仮名テキスト）              |
| `soegana`   | 添え仮名（訓読時に補う助詞）       | anchor       | 必須（助詞テキスト）                  |
| `okimoji`   | 置字（訓読時に読まない漢字）       | anchor       | なし                                  |
| `joji`      | 助字（文法的機能を持つ漢字ラベル） | anchor       | なし                                  |
| `kutoten`   | 句読点                             | **position** | 必須（句読点記号）、kind任意          |
| `emphasis`  | 傍点・圏点（後世の記述）           | anchor       | style任意（傍点の種類）               |
| `saidoku`   | 再読文字                           | anchor       | 必須（forms配列）                     |
| `okototen`  | ヲコト点                           | anchor       | position必須、shape必須               |
| `tateten`   | たて点（熟語境界）                 | anchor       | なし                                  |
| `highlight` | 傍線・ハイライト（後世の記述）     | anchor       | style任意、ref任意                    |
| `ref`       | 参照識別子・注釈                   | **position** | label/format/contentのいずれか必須    |

※ `type` の追加は後方互換で許可される。
※ **position** 参照の Mark（kaeri, kutoten, ref）はトークン間の位置に存在し、anchor を持たない。

---

### 6.3 Anchor

```json
{
  "from": "t4",
  "to": "t6"
}
```

- `from` ≤ `to`（**blocks 内の tokenIds における出現順**）
- 単一 token の場合も省略しない
- `from` と `to` は inclusive（両端を含む）
- **anchor ベースの Mark のみ使用**（position ベースの Mark には使用しない）

---

### 6.4 Position（位置指定）

トークン間の位置を指定する。**position ベースの Mark（kutoten, ref）が使用**する。

#### 構造

```json
// トークンの後（最も一般的）
{ "blockId": "b1", "after": "t3" }

// ブロック先頭（afterを省略）
{ "blockId": "b1" }
```

#### フィールド

| フィールド | 必須 | 説明                                                 |
| ---------- | ---- | ---------------------------------------------------- |
| `blockId`  | 必須 | この mark が属する block の ID                       |
| `after`    | 任意 | 指定トークンの直後に配置。省略時はブロック先頭に配置 |

#### 規則

| 形式                                  | 説明                     |
| ------------------------------------- | ------------------------ |
| `{ "blockId": id, "after": tokenId }` | 指定トークンの直後に配置 |
| `{ "blockId": id }`                   | ブロック先頭に配置       |

#### バリデーション

- `blockId` は必須であり、存在する block の ID を参照しなければならない（MUST）
- `after` を指定する場合、参照する token ID が存在しなければならない（MUST）
- `after` で参照する token は、`blockId` で指定された block に属していなければならない（MUST）
- `after` は省略可能。省略時はブロック先頭への配置を意味する

#### 用例

```json
// 句読点: 「之」の後に配置
{
  "type": "kutoten",
  "position": { "blockId": "b1", "after": "t5" },
  "value": "。"
}

// 参照識別子: 文頭に配置
{
  "type": "ref",
  "position": { "blockId": "b1" },
  "format": "alpha-upper"
}
```

---

### 6.5 座標系（Coord）

注記の位置を指定するための統一座標系。

#### 基本構造

```json
{
  "system": "glyph-grid",
  "grid": "5x5",
  "x": 2,
  "y": 3
}
```

#### system 一覧（v0.1）

| system       | 用途                           | 必須フィールド    |
| ------------ | ------------------------------ | ----------------- |
| `glyph-grid` | 字内グリッド座標（ヲコト点等） | grid, x, y        |
| `page`       | 版面座標（将来用）             | line, col（任意） |

※ 未知の system は無視してよい。

#### glyph-grid の規則

- `grid`: グリッドサイズ（"5x5", "7x7" 等）
- `x`, `y`: 0-based 整数（左上が原点）
- NINJAL系の方眼分割と対応

---

### 6.6 句読点（Kutoten）

句読点を表す。**position ベース**でトークン間の位置に配置される。

#### 構造

```json
{
  "type": "kutoten",
  "id": "m1",
  "position": { "blockId": "b1", "after": "t5" },
  "value": "。",
  "kind": "ku"
}
```

#### フィールド

| フィールド | 必須 | 説明                                   |
| ---------- | ---- | -------------------------------------- |
| `position` | 必須 | 配置位置（トークン間）                 |
| `value`    | 必須 | 句読点記号（。、、等）                 |
| `kind`     | 任意 | 分類（ku/ten/other）。省略時は推論可能 |

#### kind の値

| kind    | 説明   | 典型的な value |
| ------- | ------ | -------------- |
| `ku`    | 句点   | 。             |
| `ten`   | 読点   | 、             |
| `other` | その他 | ・ 等          |

---

### 6.7 再読文字（Saidoku）

1つの文字を複数回読む再読文字を表現する。

#### 構造

```json
{
  "type": "saidoku",
  "anchor": { "from": "t1", "to": "t1" },
  "forms": [
    { "n": 1, "yomi": "まさ", "okuri": "に" },
    { "n": 2, "okuri": "す" }
  ]
}
```

#### forms 配列

| フィールド | 必須 | 説明                     |
| ---------- | ---- | ------------------------ |
| `n`        | 任意 | 読み順（省略時は配列順） |
| `yomi`     | 任意 | 読み仮名                 |
| `okuri`    | 任意 | 送り仮名                 |

#### 主な再読文字

| 文字   | 1回目        | 2回目  | 意味                 |
| ------ | ------------ | ------ | -------------------- |
| 將・且 | まさ＋に     | す     | 今にも〜しようとする |
| 未     | いま＋だ     | ず     | まだ〜ない           |
| 當・応 | まさ＋に     | し     | 〜すべきである       |
| 須     | すべから＋く | し     | 〜すべきである       |
| 宜     | よろ＋しく   | し     | 〜するのがよい       |
| 猶     | な＋ほ       | ごとし | ちょうど〜のようだ   |
| 盍     | なん＋ぞ     | ざる   | どうして〜しないのか |

---

### 6.8 ヲコト点（Okototen）

漢字の字画の隅や内部に打点される訓点記号。

#### 構造

```json
{
  "type": "okototen",
  "anchor": { "from": "t1", "to": "t1" },
  "position": {
    "system": "glyph-grid",
    "grid": "5x5",
    "x": 4,
    "y": 4
  },
  "shape": "dot",
  "sound": "り"
}
```

#### フィールド

| フィールド | 必須 | 説明                             |
| ---------- | ---- | -------------------------------- |
| `position` | 必須 | 字内座標（GlyphGridCoord）       |
| `shape`    | 必須 | 点の形状（dot, circle, line 等） |
| `sound`    | 任意 | 対応する音節                     |
| `color`    | 任意 | 朱点・墨点等の区別               |

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

---

### 6.9 傍点・圏点（Emphasis）

強調のために文字の傍らに付す記号。

※ 漢文原典には傍点・圏点は存在しない。後世の注釈・教育目的で付加される記述である。

#### 構造

```json
{
  "type": "emphasis",
  "anchor": { "from": "t1", "to": "t3" },
  "style": "dot"
}
```

#### フィールド

| フィールド | 必須 | 説明                                |
| ---------- | ---- | ----------------------------------- |
| `style`    | 任意 | 傍点スタイル。省略時は `filled dot` |

#### style 一覧

CSS `text-emphasis-style` に準拠。形状キーワードと修飾子（`filled`/`open`）の組み合わせ、またはカスタム文字列を指定可能。

**形状キーワード**（修飾子省略時は `filled`）:

| style           | 説明     | filled      | open        |
| --------------- | -------- | ----------- | ----------- |
| `dot`           | 小さい点 | • (U+2022)  | ◦ (U+25E6)  |
| `circle`        | 丸       | ● (U+25CF)  | ○ (U+25CB)  |
| `double-circle` | 二重丸   | ◉ (U+25C9)  | ◎ (U+25CE)  |
| `triangle`      | 三角     | ▲ (U+25B2)  | △ (U+25B3)  |
| `sesame`        | ゴマ点   | ﹅ (U+FE45) | ﹆ (U+FE46) |

**修飾子付きの例**: `filled sesame`, `open circle`, `open dot`

**カスタム文字列**: 任意の1文字（例: `★`, `○`, `◆`）も指定可能。

---

### 6.10 傍線・ハイライト（Highlight）

教育用途や試験問題等で傍線部を指示するために使用する。refを参照して識別子を表示できる。

※ 漢文原典には傍線は存在しない。後世の教育・注釈目的で付加される記述である。

#### 構造

```json
{
  "type": "highlight",
  "anchor": { "from": "t1", "to": "t3" },
  "style": "solid",
  "ref": "ref-1"
}
```

#### フィールド

| フィールド | 必須 | 説明                                                                  |
| ---------- | ---- | --------------------------------------------------------------------- |
| `style`    | 任意 | 傍線スタイル（solid, dotted, dashed, wavy, double）。省略時は `solid` |
| `ref`      | 任意 | 参照するrefマークのID                                                 |

#### style 一覧

CSS `text-decoration-style` に準拠。

| style    | 説明   |
| -------- | ------ |
| `solid`  | 実線   |
| `dotted` | 点線   |
| `dashed` | 破線   |
| `wavy`   | 波線   |
| `double` | 二重線 |

#### 備考

- `ref` 属性は highlight 専用。emphasis には適用されない。
- emphasis と highlight は共に「後世の記述」であり、SKAM-ML では `skam:span` 要素で統一的に表現する。

---

### 6.11 参照識別子・注釈（Ref）

傍線部の識別子、問題番号、注釈等に使用する統合型。
同じlabel値または同じformat+valueを持つrefは同一の参照として扱われる。

**position ベース**: ref は anchor ではなく **position** でトークン間の位置を指定する。

#### 構造

```json
{
  "type": "ref",
  "id": "n1",
  "position": { "blockId": "b1", "after": "t3" },
  "format": "numeric-bracket",
  "content": "「之」は目的語として読む。"
}
```

#### フィールド

| フィールド | 必須                               | 説明                                             |
| ---------- | ---------------------------------- | ------------------------------------------------ |
| `id`       | 分離定義時は必須                   | 一意識別子。note から参照される場合に必須        |
| `position` | 必須                               | 配置位置（blockId 必須、トークン間）             |
| `label`    | label/format/contentのいずれか必須 | 表示ラベル（明示値、formatと排他）               |
| `format`   | label/format/contentのいずれか必須 | 自動番号フォーマット（labelと排他）              |
| `content`  | label/format/contentのいずれか必須 | 注釈テキスト（インラインまたは分離定義から解決） |

※ `label` と `format` は排他（併用禁止）

#### 分離定義（note との連携）

長い注釈テキストは `note` として別の場所に定義し、ref から参照できる。

**参照関係**:

- `ref` が宣言側（`id` を持つ）
- `note` が `ref` 属性で ref を参照し、content を提供

```json
{
  "type": "ref",
  "id": "n1",
  "position": { "blockId": "b1", "after": "t3" },
  "format": "numeric-bracket",
  "ext": { "noteRef": "n1" }
}
```

パーサーは note の内容を解決し、`content` フィールドにマージする。

#### SKAM-ML からの変換

SKAM-ML/XML では `<skam:ref>` 要素が内容を持つ場合があるが、SKAM JSON では内容は **分離定義**として扱われる：

```xml
<!-- SKAM-ML: 内容を持つ ref -->
<skam:ref format="numeric-bracket">「之」は目的語として読む。</skam:ref>
```

```json
// SKAM JSON: position ベース + content
{
  "type": "ref",
  "position": { "blockId": "b1", "after": "t3" },
  "format": "numeric-bracket",
  "content": "「之」は目的語として読む。"
}
```

#### 同一性判定

- 同じ `label` 値を持つ ref は同一の参照
- 同じ `format` + 同じ `value`（ext内）を持つ ref は同一の参照
- 同一の参照は同じ番号/ラベルで表示される

#### format 一覧（RefFormat）

| format            | 例               | 説明                 |
| ----------------- | ---------------- | -------------------- |
| `alpha-upper`     | (A), (B), (C)    | 英大文字（括弧付き） |
| `alpha-lower`     | (a), (b), (c)    | 英小文字（括弧付き） |
| `numeric-paren`   | (1), (2), (3)    | 数字（丸括弧）       |
| `numeric-bracket` | [1], [2], [3]    | 数字（角括弧）       |
| `numeric-circled` | ①, ②, ③          | 丸数字               |
| `iroha-katakana`  | (イ), (ロ), (ハ) | いろは順カタカナ     |
| `iroha-hiragana`  | (い), (ろ), (は) | いろは順ひらがな     |
| `gojuon-katakana` | (ア), (イ), (ウ) | 五十音順カタカナ     |
| `gojuon-hiragana` | (あ), (い), (う) | 五十音順ひらがな     |
| `kanji-numeric`   | (一), (二), (三) | 漢数字（括弧付き）   |

---

## 7. Derivations（導出情報）

### 7.1 目的

返り点等から計算される読み順などの導出情報を記録する。
計算結果を保存することで、表示・検索時の再計算を省略可能。

### 7.2 規則

- `derivations` 配列は**任意**（省略可能）
- 同じ `kind` の derivation が複数存在する場合、**配列先頭を優先**
- 未知の `kind` は無視してよい
- 未知の `method` を持つ derivation は、`result` が有効であれば使用してよい

### 7.3 構造

```json
{
  "derivations": [
    {
      "kind": "readingOrder",
      "method": "kaeriten-stack",
      "result": ["t1", "t3", "t5", "t4", "t2"]
    }
  ]
}
```

### 7.4 kind 一覧（v0.1）

| kind           | 意味   | result          |
| -------------- | ------ | --------------- |
| `readingOrder` | 読み順 | token ID の配列 |

※ 再読文字の場合、同じ token ID が複数回出現することがある（例: `["t1", "t2", "t1"]`）

### 7.5 readingOrder の method

| method           | 説明                             |
| ---------------- | -------------------------------- |
| `kaeriten-stack` | 返り点に基づくスタック操作で導出 |
| `manual`         | 手動指定                         |

※ 具体的なアルゴリズムは実装依存。参考として以下の概要を示す。

#### 7.6 kaeriten-stack アルゴリズム（参考・非規範）

返り点を「スタックへのpush/pop操作」として解釈し、読み順を導出する。

1. 左から順に token を走査
2. 返り点がなければ、その token を出力
3. 返り点があれば:
   - レ点: 次の token と入れ替え
   - 一二点/上下点: 対応する点までスタックに保持し、後で出力

#### 例：「學而時習之」（レ点が「之」に付く）

原順: t1(學) t2(而) t3(時) t4(習) t5(之)
返り点: t5 にレ点
読み順: t1 → t2 → t3 → t5 → t4

---

## 8. Readings（読み層）

### 8.1 構造

```json
{
  "kind": "yomiage",
  "text": "学びて時に之を習ふ",
  "ext": {}
}
```

### 8.2 kind の例

- `kundoku`：訓読文
- `kakikudashi`：書き下し文
- `yomiage`：a11y 用読み上げ文

### 8.3 規則

- 読み層は表示層と独立
- HTML 側では `aria-hidden` 等で表示層と分離することを想定
- v0.1 では全文テキストのみ保持

### 8.4 将来の拡張（非規範）

#### alignment（対応情報）

reading の substring と token 範囲の対応を記録する拡張。

```json
{
  "kind": "kakikudashi",
  "text": "学びて時に之を習ふ",
  "align": [
    { "span": [0, 2], "anchor": { "from": "t1", "to": "t1" } },
    { "span": [2, 4], "anchor": { "from": "t2", "to": "t3" } }
  ]
}
```

- `span` は reading.text の **Unicode コードポイント位置**（UTF-16 禁止）
- ハイライト同期、読みと原文の対応表示、クリックで原文ジャンプ等に利用

#### 生成規則

返り点等から読みを再生成する規則は `readings` 内ではなく、
別セクション（`derivations` / `transform` 等）で管理することを想定。

---

## 9. 表示モデルとの関係（非規範）

SKAM 自体は表示方式を規定しないが、以下を想定する。

| 要素     | 初期想定          |
| -------- | ----------------- |
| 本文     | HTML span         |
| 送り仮名 | inline span       |
| 返り点   | ::after / overlay |
| 割注     | absolute          |
| 欄外注   | footnote          |

※ SVG / Canvas は後段で採用可能。

### 9.1 レンダリングプロファイル（非規範）

SKAM データは常に完全な情報を保持し、用途に応じた情報の出し分けは**レンダリング段階**で制御する。

#### 設計原則

- **単一の正典**: 完全な SKAM データを一つ持ち、用途に応じて「見せ方」を変える
- **情報の保全**: マークアップ段階で情報を省略しない
- **後工程での制御**: パーサー/レンダラーがプロファイルに応じて出力を調整する

#### プロファイル例

| プロファイル     | 読み仮名 | 送り仮名 | 返り点 | 読み順 | 用途                               |
| ---------------- | -------- | -------- | ------ | ------ | ---------------------------------- |
| `full`           | ○        | ○        | ○      | ○      | 完全表示・アクセシビリティ         |
| `learning-basic` | ×        | ×        | ○      | ×      | 学習（返り点のみ表示）             |
| `learning-hint`  | ×        | ○        | ○      | ×      | 学習（送り仮名をヒントとして表示） |
| `print`          | ○        | ○        | ○      | ×      | 印刷用（読み順は非表示）           |

#### 実装指針

- レンダラーは `--profile=<name>` 等のオプションでプロファイルを受け取る
- プロファイル定義は SKAM 仕様外（実装依存）
- 未知のプロファイルは `full` として扱うことを推奨

---

## 10. アクセシビリティ方針（非規範）

- 表示層：`aria-hidden="true"`
- 読み層：不可視 DOM として提供
- 読み順は `readings` により保証

---

## 11. 拡張性

### 11.1 未知フィールドの扱い

- 未知の `type` は無視してもよい
- 未知のフィールドは無視してもよい
- `placementHint` は解釈不能でも問題としない

### 11.2 ext コンテナ方式

拡張データは `ext` フィールドに格納する。

```json
{
  "type": "kaeri",
  "position": { "blockId": "b1", "after": "t7" },
  "value": "レ",
  "ext": {
    "skam-editor": { "color": "red" },
    "mytool": { "confidence": 0.7 }
  }
}
```

- 既知フィールドは仕様で固定
- 拡張は全て `ext` 以下に格納
- **`ext` は保持して再出力してよい（round-trip 推奨）**

### 11.3 将来の互換性

- 将来、TEI への変換が可能な構造を維持する

---

## 12. バージョニング

- `format` フィールドで明示
- 破壊的変更はメジャーバージョンを上げる

---

## Appendix A: 完全な例

「学而時習之」の例：

```json
{
  "format": "skam@0.1",
  "tokens": [
    { "id": "t1", "text": "学" },
    { "id": "t2", "text": "而" },
    { "id": "t3", "text": "時" },
    { "id": "t4", "text": "習" },
    { "id": "t5", "text": "之" }
  ],
  "blocks": [{ "id": "b1", "tokenIds": ["t1", "t2", "t3", "t4", "t5"] }],
  "marks": [
    {
      "type": "okurigana",
      "id": "m1",
      "anchor": { "from": "t1", "to": "t1" },
      "value": "びて"
    },
    {
      "type": "okurigana",
      "id": "m2",
      "anchor": { "from": "t3", "to": "t3" },
      "value": "に"
    },
    {
      "type": "soegana",
      "id": "m3",
      "anchor": { "from": "t5", "to": "t5" },
      "value": "を"
    },
    {
      "type": "okurigana",
      "id": "m4",
      "anchor": { "from": "t4", "to": "t4" },
      "value": "ふ"
    },
    {
      "type": "kaeri",
      "id": "m5",
      "position": { "blockId": "b1", "after": "t5" },
      "value": "レ"
    }
  ],
  "readings": [
    {
      "kind": "kakikudashi",
      "text": "学びて時に之を習ふ"
    },
    {
      "kind": "yomiage",
      "text": "まなびてときにこれをならう"
    }
  ]
}
```

---

## Appendix B: 再読文字の例

「將死」（まさに死なんとす）の例：

```json
{
  "format": "skam@0.1",
  "tokens": [
    { "id": "t1", "text": "將" },
    { "id": "t2", "text": "死" }
  ],
  "blocks": [{ "id": "b1", "tokenIds": ["t1", "t2"] }],
  "marks": [
    {
      "type": "saidoku",
      "id": "m1",
      "anchor": { "from": "t1", "to": "t1" },
      "forms": [
        { "n": 1, "yomi": "まさ", "okuri": "に" },
        { "n": 2, "okuri": "す" }
      ]
    },
    {
      "type": "yomigana",
      "id": "m2",
      "anchor": { "from": "t2", "to": "t2" },
      "value": "し"
    },
    {
      "type": "okurigana",
      "id": "m3",
      "anchor": { "from": "t2", "to": "t2" },
      "value": "な"
    }
  ],
  "derivations": [
    {
      "kind": "readingOrder",
      "method": "manual",
      "result": ["t1", "t2", "t1"]
    }
  ],
  "readings": [
    {
      "kind": "kakikudashi",
      "text": "まさに死なんとす"
    }
  ]
}
```

---

## Appendix C: ヲコト点の例

5×5グリッドでのヲコト点の例：

```json
{
  "format": "skam@0.1",
  "tokens": [{ "id": "t1", "text": "國" }],
  "blocks": [{ "id": "b1", "tokenIds": ["t1"] }],
  "marks": [
    {
      "type": "okototen",
      "id": "m1",
      "anchor": { "from": "t1", "to": "t1" },
      "position": {
        "system": "glyph-grid",
        "grid": "5x5",
        "x": 4,
        "y": 4
      },
      "shape": "dot",
      "sound": "り"
    }
  ],
  "readings": []
}
```

---

## Appendix D: 複合返り点の例

「不可不學」（学ばざるべからず）の例：

```json
{
  "format": "skam@0.1",
  "tokens": [
    { "id": "t1", "text": "不" },
    { "id": "t2", "text": "可" },
    { "id": "t3", "text": "不" },
    { "id": "t4", "text": "學" }
  ],
  "blocks": [{ "id": "b1", "tokenIds": ["t1", "t2", "t3", "t4"] }],
  "marks": [
    {
      "type": "kaeri",
      "id": "m1",
      "position": { "blockId": "b1", "after": "t2" },
      "value": "二"
    },
    {
      "type": "kaeri",
      "id": "m2",
      "position": { "blockId": "b1", "after": "t4" },
      "value": "一レ"
    },
    {
      "type": "okurigana",
      "id": "m3",
      "anchor": { "from": "t4", "to": "t4" },
      "value": "ば"
    },
    {
      "type": "okurigana",
      "id": "m4",
      "anchor": { "from": "t3", "to": "t3" },
      "value": "ざる"
    },
    {
      "type": "okurigana",
      "id": "m5",
      "anchor": { "from": "t2", "to": "t2" },
      "value": "から"
    },
    {
      "type": "okurigana",
      "id": "m6",
      "anchor": { "from": "t1", "to": "t1" },
      "value": "ず"
    }
  ],
  "derivations": [
    {
      "kind": "readingOrder",
      "method": "kaeriten-stack",
      "result": ["t4", "t3", "t2", "t1"]
    }
  ],
  "readings": [
    {
      "kind": "kakikudashi",
      "text": "学ばざるべからず"
    }
  ]
}
```

---

## Appendix E: 傍線部と参照識別子の例

教育用途での傍線部指示の例（highlight + ref を使用）：

```json
{
  "format": "skam@0.1",
  "tokens": [
    { "id": "t1", "text": "学" },
    { "id": "t2", "text": "而" },
    { "id": "t3", "text": "時" },
    { "id": "t4", "text": "習" },
    { "id": "t5", "text": "之" }
  ],
  "blocks": [{ "id": "b1", "tokenIds": ["t1", "t2", "t3", "t4", "t5"] }],
  "marks": [
    {
      "type": "ref",
      "id": "ref-1",
      "position": { "blockId": "b1", "after": "t4" },
      "format": "iroha-katakana"
    },
    {
      "type": "highlight",
      "id": "highlight-1",
      "anchor": { "from": "t1", "to": "t4" },
      "style": "solid",
      "ref": "ref-1"
    },
    {
      "type": "okurigana",
      "id": "m3",
      "anchor": { "from": "t1", "to": "t1" },
      "value": "びて"
    },
    {
      "type": "okurigana",
      "id": "m4",
      "anchor": { "from": "t3", "to": "t3" },
      "value": "に"
    },
    {
      "type": "soegana",
      "id": "m5",
      "anchor": { "from": "t5", "to": "t5" },
      "value": "を"
    },
    {
      "type": "okurigana",
      "id": "m6",
      "anchor": { "from": "t4", "to": "t4" },
      "value": "ふ"
    },
    {
      "type": "kaeri",
      "id": "m7",
      "position": { "blockId": "b1", "after": "t5" },
      "value": "レ"
    }
  ],
  "readings": [
    {
      "kind": "kakikudashi",
      "text": "学びて時に之を習ふ"
    }
  ]
}
```

### 注釈の例

```json
{
  "type": "ref",
  "id": "ref-note-1",
  "position": { "blockId": "b1", "after": "t5" },
  "format": "numeric-bracket",
  "content": "「之」は目的語として読む。"
}
```

### 同一参照の複数配置

同じ `format` と `value`（ext内）を持つ ref は同一番号で表示される：

```json
{
  "marks": [
    {
      "type": "ref",
      "id": "ref-a1",
      "position": { "blockId": "b1", "after": "t1" },
      "format": "iroha-katakana",
      "ext": { "value": "a" }
    },
    {
      "type": "ref",
      "id": "ref-a2",
      "position": { "blockId": "b1", "after": "t5" },
      "format": "iroha-katakana",
      "ext": { "value": "a" }
    }
  ]
}
```

※ 両方とも「(イ)」と表示される
