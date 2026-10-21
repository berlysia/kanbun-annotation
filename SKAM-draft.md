<!--
SPDX-License-Identifier: CC-BY-4.0
Copyright (c) 2024-present berlysia

This specification is licensed under the Creative Commons Attribution 4.0
International License. To view a copy of this license, visit
https://creativecommons.org/licenses/by/4.0/
-->

# Stand-off Kanbun Annotation Model（SKAM）

## Specification v0.1

> **Status:** この仕様は v0.1.0 リリースに対応する安定版です。
> ファイル名の "draft" は歴史的な経緯によるもので、仕様の安定性には影響しません。

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
  "lang": "lzh",
  "tokens": [],
  "blocks": [],
  "marks": [],
  "readings": [],
  "extensions": [],
  "extensionsRequired": [],
  "ext": {},
  "custom": {}
}
```

- `lang` は本文（白文）の言語（任意）。値は BCP 47 の言語タグの形で、英字 2〜8 字に、`-` で区切った英数字 1〜8 字の部分を続ける（例 `ja`、`lzh`、`zh-Hant`）。登録されたサブタグかは確かめない。描画は、表示層の言語の既定に使う
- `tokens` は本文 token のマスター定義（順序は blocks が規定する）
- `blocks` はブロック構造（必須、原文順）
- `extensions` は文書が使う拡張の名前の配列、`extensionsRequired` は知らなければ読んではいけない拡張の名前の配列（どちらも任意。§11.2）
- `ext` は拡張の値の置き場（任意。§11.2）
- `custom` は SKAM が解釈しない自由なデータの置き場（任意。§11.3）

---

## 4. Blocks（ブロック）

### 4.1 定義

論理的なブロック（段落・文単位）。tokens の部分集合を順序付きで保持する。

```json
{
  "id": "b1",
  "tokenIds": ["t1", "t2", "t3"]
}
```

### 4.2 規則

- `id` は**必須**であり、文書全体（blocks・tokens・marks）で一意でなければならない（MUST）
- `tokenIds` は順序付きの token ID 配列。ブロック内の原文順を表す
- 全 token は**ちょうど1つの block**に属しなければならない（MUST）
- 1つの token が複数の block に属してはならない
- `blocks` 配列の順序は原文順を表す
- `ext`（拡張の値、§11.2）と `custom`（自由なデータ、§11.3）は任意

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
  "text": "学"
}
```

### 5.2 規則

- `id` は**必須**であり、文書全体（blocks・tokens・marks）で一意でなければならない（MUST）
- `text` は UTF-8 文字列。空文字列にしてはならない（MUST）
- token 分割規則（1字/熟語等）は SKAM 仕様外とする
  - **推奨：字単位**（訓点・返り点の指示と一致するため）
  - この仕様の「字」は、Unicode の拡張書記素クラスタ（extended grapheme cluster）1 つを指す。異体字セレクタ（IVS の U+E0100〜U+E01EF、SVS の U+FE00〜U+FE0F）や結合文字は、基底の字と同じ 1 字になる
  - SKAM-ML（SKAM-ML-draft §6.1）は token を 1 字ずつ作るので、2 字以上の token は XML に書くと往復で分かれる
- `ext`（拡張の値、§11.2）と `custom`（自由なデータ、§11.3）は任意

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
  "placementHint": "right"
}
```

#### position ベース（トークン間に存在する注記）

```json
{
  "type": "kutoten",
  "id": "m1",
  "position": { "blockId": "b1", "after": "t3" },
  "value": "。"
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
| `ext`           | 任意                | 拡張の値（§11.2。round-trip 保持推奨）                                |
| `custom`        | 任意                | SKAM が解釈しない自由なデータ（§11.3。round-trip 保持推奨）           |

`id` を指定する場合は、文書全体（blocks・tokens・marks）で一意でなければならない（MUST）。

#### 同一 anchor を持つ marks の順序

同一の `anchor` を持つ複数の mark が存在する場合、`marks` 配列内の**出現順序**がレンダリング順序に影響する可能性がある。

推奨順序（同一 token に対して）:

1. `yomigana`（読み仮名）
2. `okurigana`（送り仮名）
3. `soegana`（添え仮名）
4. その他

※ 順序に依存しない実装を推奨するが、round-trip の安定性のため上記順序を推奨。

#### 同じ種類の注記の重複

次の 6 種類は、同じ anchor（`from` と `to` が両方とも一致するもの）に同じ種類を 2 つ以上置いてはならない（MUST）。違反は `MARK_CONFLICT` とする。

- `yomigana` / `okurigana` / `soegana` / `okimoji` / `joji` / `saidoku`

`okototen` / `emphasis` / `highlight` / `tateten` は、重複してよい。

#### placementHint の値例

`placementHint` は実装依存の任意文字列である。以下は参考例：

- `right-bottom`: 右下（返り点の典型的位置）
- `right-top`: 右上（送り仮名の典型的位置）
- `left`: 左側
- `inline`: 行内

未知の値は無視してよい。

---

### 6.2 type 一覧（v0.1）

| type        | 意味                               | 参照方式     | value                                              |
| ----------- | ---------------------------------- | ------------ | -------------------------------------------------- |
| `kaeri`     | 返り点                             | **position** | 必須（Unicode Kanbun ブロック文字 U+3191〜U+319F） |
| `okurigana` | 送り仮名                           | anchor       | 必須（送り仮名テキスト）                           |
| `yomigana`  | 読み仮名（ルビ）                   | anchor       | 必須（読み仮名テキスト）                           |
| `soegana`   | 添え仮名（訓読時に補う助詞）       | anchor       | 必須（助詞テキスト）                               |
| `okimoji`   | 置字（訓読時に読まない漢字）       | anchor       | なし                                               |
| `joji`      | 助字（文法的機能を持つ漢字ラベル） | anchor       | なし                                               |
| `kutoten`   | 句読点                             | **position** | 必須（句読点記号）、kind任意                       |
| `emphasis`  | 傍点・圏点（後世の記述）           | anchor       | style任意（傍点の種類）                            |
| `saidoku`   | 再読文字                           | anchor       | 必須（forms配列）                                  |
| `okototen`  | ヲコト点                           | anchor       | position必須、shape必須                            |
| `tateten`   | たて点（熟語境界）                 | anchor       | なし                                               |
| `highlight` | 傍線・ハイライト（後世の記述）     | anchor       | style任意、ref任意                                 |
| `ref`       | 参照識別子・注釈                   | **position** | label/format/contentのいずれか必須                 |
| `linebreak` | 改行                               | **position** | なし                                               |

※ `type` の追加は後方互換で許可される。
※ **position** 参照の Mark（kaeri, kutoten, ref, linebreak）はトークン間の位置に存在し、anchor を持たない。

#### kaeri の書き方

- 1 つの kaeri は 1 字（一、二、レ など）を表す。一レ点のような組み合わせは、同じ `position` に 1 字ずつの kaeri を並べて書く。
- 同じ位置の複数の kaeri は、`marks[]` の順に値をつないだ 1 つの注記と同じ意味を持つ。順は意味を持つ（`㆒`、`㆑` と `㆑`、`㆒` は別の表示になる）。
- 1 つの kaeri の `value` に複数の字を書く形（`㆒㆑`）は、0.3 では読めるが非推奨で、0.4.0 で誤りになる。検証は警告（`KAERI_MULTI_CHARACTER`）を返す。

#### linebreak の書き方

- `linebreak` は `position.after` の字の直後で行を改める。`value` は持たない。ブロックを分けずに、ブロックの中で行を改めるために使う。
- 描画は、自動の折り返しの位置を変えず、`linebreak` のある所で必ず行を改める。読み上げのテキストは、ブロックの区切りと同じ半角空白を 1 つ入れる。
- 次の場所には置けない（MUST NOT）。違反は `INVALID_LINEBREAK` とする。
  - ブロックの先頭（`position.after` が無い）
  - ブロックの最後の字の後ろ
  - 不可分単位の中: 次の 2 つの範囲の、隣り合う 2 字の間
    - `tateten` の範囲（たて点のグループ）
    - `yomigana` / `okurigana` / `soegana` / `saidoku` / `okimoji` / `joji` の範囲（`anchor.from` から `anchor.to`）
  - 同じ `position`（`blockId` と `after` が両方とも一致するもの）に既に `linebreak` がある場合の 2 つ目以降
- `highlight` / `emphasis` / `okototen` の範囲の中には置ける。不可分単位の最後の字の後ろ（たて点のグループの最後の字の後ろなど）にも置ける。

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

トークン間の位置を指定する。**position ベースの Mark（kaeri, kutoten, ref, linebreak）が使用**する。

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
- `after` は省略可能。省略時はブロック先頭への配置を意味する。ただし **kaeri の position には `after` が必須**であり、ブロック先頭に返り点を置いてはならない（MUST NOT）。kutoten と ref は従来どおりブロック先頭に置いてよい。linebreak の position も `after` が必須で、ブロック先頭に置けない（§6.2）。Position 型そのものは変えない

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

`forms` は 1 つ以上の要素を持たなければならない（MUST）。

| フィールド | 必須 | 説明                     |
| ---------- | ---- | ------------------------ |
| `n`        | 任意 | 読み順（省略時は配列順） |
| `yomi`     | 任意 | 読み仮名                 |
| `okuri`    | 任意 | 送り仮名                 |

#### 制約

- saidoku は `forms[].yomi` で読み仮名を、`forms[].okuri` で送り仮名を内包する
- 同一 anchor に `yomigana` を併用できない（`MARK_CONFLICT`）
- 同一 anchor に `okurigana` を併用できない（`MARK_CONFLICT`）
- `soegana` は性質が異なるため共存可能

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
同じlabel値を持つrefは同一の参照として扱われる。

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
  "format": "numeric-bracket"
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
  "text": "学びて時に之を習ふ"
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
- `ext`（拡張の値、§11.2）と `custom`（自由なデータ、§11.3）は任意

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

### 11.2 core と拡張

SKAM の仕様が定める注記の種類とフィールド（core）は閉じた語彙とする。core の外の値は、**拡張**として `ext` の下の拡張の名前のまとまりに置く。

拡張は次の 3 つを持つ。

- **名前**: 小文字の英数字で、先頭は英字（例 `edu`）。`xml` で始まる名前は使わない（SKAM-ML で名前空間の接頭辞に使うため）。接頭辞（`x-` など）は付けない。
- **名前空間の URI**: SKAM-ML で拡張の属性を書く名前空間（例 `urn:skam:edu:1`）。識別子であり、取りに行かない（MUST NOT）。
- **必須かどうか**: 拡張の仕様が決める。必須の拡張の値を使う文書は、その拡張を `extensionsRequired` に挙げなければならない（MUST）。

#### 置き場

拡張の値は `ext.<拡張の名前>` に置く。`ext` は文書、readings、ブロック、token、注記、derivations のどれにも置ける。

```json
{
  "type": "okurigana",
  "anchor": { "from": "t3", "to": "t3" },
  "value": "ブ",
  "ext": { "edu": { "quiz": "問1" } }
}
```

#### 宣言

文書の最上位に、使う拡張を宣言する。

```json
{
  "format": "skam@0.1",
  "extensions": ["edu"],
  "extensionsRequired": ["edu"]
}
```

- `extensions`: 文書が値を使う拡張の名前の配列。名前の重なりは誤り
- `extensionsRequired`: 知らなければ読んではいけない拡張の名前の配列。`extensions` の部分集合でなければならない

誤りは `INVALID_EXTENSION` とする。

#### 宣言のある文書と無い文書

文書が `extensions` を持つ（空の配列も含む）なら、宣言のある文書として次の規則で読む。持たないなら、`ext` 全体を旧来の自由なデータ（§11.3）として読む。同じ入力を 2 通りに読まないため、宣言の有無だけで決める。

#### 宣言のある文書の規則

- `extensionsRequired` に、reader が知らない名前があれば誤りとし、読まない（MUST）
- `ext` に、`extensions` に無い名前のキーがあれば誤りとする
- `extensions` にだけある知らない拡張の値は、検査せず無視して読む
- 拡張を知る reader は、その拡張の仕様が必須と定める拡張の値を使うのに `extensionsRequired` に挙げていない文書を誤りとする

「知っている拡張」は、reader が拡張の定義を持つ拡張をいう。登録簿（付録 F）にあっても定義が無い拡張は、知らない拡張として扱う。

#### 拡張の値は信頼しない入力

- 拡張の値は信頼しない入力として扱う。描画は、拡張の定義が描画を定めない限り、拡張の値を出力しない
- 出力する拡張は、値の型の検査と escape を拡張の定義の中で行う
- 登録は名前の衝突を避けるためで、拡張の中身の安全を保証しない
- `ext` と `custom` の中身には上限がある（§11.3）

#### SKAM-ML

拡張は、自分の名前空間の属性で書く。宣言は `skam:meta` の子の `skam:extension` で書き、JSON の宣言と往復する（SKAM-ML-draft §4.3、§10）。

#### 宣言の無い文書の `ext`

`extensions` を持たない文書の `ext` は、0.3 では自由なデータとして読み、検証は警告を返す。0.4.0 で誤りになる。

- 対象は文書、readings、ブロック、token、注記、derivations の、オブジェクトの `ext`（空のオブジェクトも含む）。`ext` 1 つにつき `LEGACY_EXT` を 1 件返す
- `ext` のキーが登録簿（Appendix F）の拡張の名前と同じなら、宣言の書き忘れの疑いとして `LEGACY_EXT_REGISTERED_NAME` も返す。0.4.0 では `LEGACY_EXT` の誤りが同じ所を指すので、このコードは無くす
- 自由なデータは `custom` に置く。`moveLegacyExtToCustom(doc)`（`@kanbun-skam/skam`）が、宣言の無い文書のすべての `ext` を `custom` に移す

### 11.3 custom（自由なデータ）

SKAM が解釈しない自由なデータは `custom` に置く。文書、readings、ブロック、token、注記、derivations のどれにも置ける。

```json
{
  "type": "kaeri",
  "position": { "blockId": "b1", "after": "t7" },
  "value": "\u3191",
  "custom": {
    "skam-editor": { "color": "red" },
    "mytool": { "confidence": 0.7 }
  }
}
```

- 既知フィールドは仕様で固定
- **`custom` は保持して再出力してよい（round-trip 推奨）**
- SKAM-ML には書けない。SKAM-ML への変換では失われる

#### `ext` と `custom` の上限

宣言の有無にかかわらず、すべての `ext` と `custom` に次の上限がある。超えたら `INVALID_VALUE` とする。

| 項目                                  | 上限                                               |
| ------------------------------------- | -------------------------------------------------- |
| オブジェクトと配列の入れ子            | 32 段（`ext` または `custom` の値を 1 段）         |
| 1 つのオブジェクトのキー              | 1,000 個                                           |
| 配列の長さ                            | 10,000                                             |
| 文書全体の `ext` と `custom` の値の数 | 100,000                                            |
| キー                                  | `__proto__`、`constructor`、`prototype` は使えない |

文字列の長さと SKAM-ML の大きさは、実装の入力の上限に任せる。

### 11.4 将来の互換性

- 将来、TEI への変換が可能な構造を維持する

---

## 12. バージョニング

- `format` フィールドで明示
- 破壊的変更はメジャーバージョンを上げる

### 12.1 format の位置づけ

- `skam@0.1` は構文の系統の名前で、実装の版ではない。0.x の間は、実装の minor で注記の種類や属性を足す
- 新しい注記の種類や属性を使う文書は、古い reader が誤りにしたり、属性を無視したりすることがある
- format を上げる条件は、必須の要素を足すとき、または既存の要素や値の意味を変えるとき

---

## 13. 学習・教育用拡張（edu）

出題の印を注記に付ける、SKAM の仕様が定める拡張。

| 項目           | 値               |
| -------------- | ---------------- |
| 名前           | `edu`            |
| 名前空間の URI | `urn:skam:edu:1` |
| 必須かどうか   | 必須             |

値を使う文書は、`extensions` と `extensionsRequired` の両方に `edu` を挙げなければならない（MUST）。`edu` を知らない reader が、答えとなる注記をそのまま表示してしまうのを避けるため。

### 13.1 出題の印

注記の `ext.edu` に、問いの名前 `quiz` を置く。

```json
{
  "type": "okurigana",
  "anchor": { "from": "t1", "to": "t1" },
  "value": "ブ",
  "ext": { "edu": { "quiz": "問1" } }
}
```

- `ext.edu` は注記だけに置ける。文書、readings、ブロック、token の `ext.edu` は誤り
- 印を付けられる注記は、`kaeri`、`okurigana`、`soegana`、`yomigana`、`saidoku`、`kutoten`、`tateten`、`okototen`、`okimoji`、`joji` の 10 種。ほかの種類の `ext.edu` は誤り
- `ext.edu` に置けるキーは `quiz` だけで、`quiz` は必須
- `quiz` は 1 字以上 64 字以下（code point）の文字列で、制御文字（U+0000〜U+001F、U+007F〜U+009F）を含まない。SKAM-ML の属性の値の正規化で値が変わらないようにするため
- 同じ名前の `quiz` を複数の注記に付けると、1 つの問いにまとめて答えを隠せる

### 13.2 描画の制御

描画は、印の付いた注記を隠せる。選択肢 `hideQuiz` は、`true`（印の付いた注記をすべて隠す）か、問いの名前の配列（名前がその中にある印の注記を隠す）。

- 隠した注記は、占める場所を残して描かない
- 同じ字の同じ種類の注記のどれか 1 つでも隠すなら、その所の注記ごと隠す
- 再読文字は、描く（1 つ目の）`saidoku` が隠すものなら、読みと送り仮名をすべて隠す。その字の `yomigana` と `okurigana` の印は効かない
- 宣言の無い文書の `ext.edu` は旧来の自由なデータとして読むので、描画は隠さない
- 既定では隠さない

**隠すのは表示の制御で、秘匿ではない。** 答えは同じ文書に平文で残る。答えを渡したくない相手には、隠した描画の出力だけを渡す。HTML の出力では、隠した注記の中身を 1 字ずつ空白に置き換えるので、答えは出力に残らないが、字数は空白の数から分かる。

SKAM-ML の属性は SKAM-ML-draft §10.2 を参照。

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
      "value": "\u3191"
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

「不可不學」（学ばざるべからず）の例。末尾の一レ点は、同じ位置に 1 字ずつの kaeri（一、レ）を並べて書く：

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
      "value": "\u3193"
    },
    {
      "type": "kaeri",
      "id": "m2",
      "position": { "blockId": "b1", "after": "t4" },
      "value": "\u3192"
    },
    {
      "type": "kaeri",
      "id": "m3",
      "position": { "blockId": "b1", "after": "t4" },
      "value": "\u3191"
    },
    {
      "type": "okurigana",
      "id": "m4",
      "anchor": { "from": "t4", "to": "t4" },
      "value": "ば"
    },
    {
      "type": "okurigana",
      "id": "m5",
      "anchor": { "from": "t3", "to": "t3" },
      "value": "ざる"
    },
    {
      "type": "okurigana",
      "id": "m6",
      "anchor": { "from": "t2", "to": "t2" },
      "value": "から"
    },
    {
      "type": "okurigana",
      "id": "m7",
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
      "value": "\u3191"
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

---

## Appendix F: 拡張の登録簿

拡張の名前と名前空間の URI は、この付録の登録簿で管理する。機械で読める同じ表を `@kanbun-skam/skam` が持つ（`@kanbun-skam/skam/extensions` の `extensionRegistry`）。

| 名前  | 名前空間の URI   | 必須 | 管理者 | 仕様 |
| ----- | ---------------- | ---- | ------ | ---- |
| `edu` | `urn:skam:edu:1` | 必須 | SKAM   | §13  |

登録の手順:

- 登録は、この付録と `extensionRegistry` に行を足す PR で行う。先着順とする
- SKAM の仕様が定める拡張と、仕様の外の組織が定める拡張の、両方を登録できる
- 登録済みの名前は、SKAM の仕様も含めて、ほかの意味に使わない（MUST NOT）
- 登録は名前の衝突を避けるためで、拡張の中身の安全を保証しない

---

## 変更履歴

### v0.1 改訂（2026-10）

- ID は文書全体（blocks・tokens・marks）で一意でなければならない（§4.2 / §5.2 / §6.1）
- token の `text` は空にしてはならない（§5.2）
- saidoku の `forms` は 1 つ以上なければならない（§6.7）
- §6.1: 同じ anchor に同じ種類の注記（yomigana / okurigana / soegana / okimoji / joji / saidoku）を 2 つ以上置くことを禁じた（`MARK_CONFLICT`）
- 互換性の注意: 0.1.x の SKAM-ML parser は、字を包む要素の中の kun と、入れ子になった包む要素を黙って捨てる。内容モデルは SKAM-ML-draft §7.0 で定めた
- §3 / §11: 拡張の仕組みを足した。文書の `extensions` と `extensionsRequired`、`ext.<拡張の名前>`、自由なデータの `custom`、`ext` と `custom` の上限、拡張の登録簿（付録 F）
- §13: 学習・教育用拡張 `edu`（出題の印 `ext.edu.quiz`）を足した
- kaeri の position には `after` が必須とした。ブロック先頭への kaeri は不正（`BLOCK_START_KAERI`）。kutoten と ref は従来どおり先頭に置ける。Position 型は変えない（§6.4）
