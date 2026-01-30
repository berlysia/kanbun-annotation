# Stand-off Kanbun Annotation Model（SKAM）

## Specification Draft v0.1

---

## 1. 目的と設計方針

### 1.1 目的

SKAM は、漢文本文と訓点・注記・読みを**分離して保持**し、
表示（HTML/CSS/SVG 等）や読み上げ（a11y）を**後工程で生成**するための
**意味モデル（annotation model）**である。

### 1.2 非目的

* 表示レイアウトの完全再現を保証しない
* CSS のみで全ての漢文表現を解決しない
* 訓読文法そのものを規定しない

---

## 2. 基本概念

### 2.1 本文（Base Text）

* 漢字列を **線形な token 列**として表現する
* token は SKAM 内のすべての参照の基準単位である

### 2.2 注記（Annotation / Mark）

* 返り点・送り仮名・助字・強調・注釈等
* 本文 token を **anchor 参照**する外付け情報
* 本文テキストを直接分断しない（stand-off）

### 2.3 読み（Reading Layer）

* 書き下し文・読み上げ用文など
* 表示とは独立した層として保持する

---

## 3. データ形式

SKAM は JSON 形式で表現される。

```json
{
  "format": "skam@0.1",
  "tokens": [],
  "marks": [],
  "readings": [],
  "ext": {}
}
```

* `ext` は拡張フィールド（任意）

---

## 4. Tokens

### 4.1 定義

本文を構成する最小単位。

```json
{
  "id": "t1",
  "text": "学",
  "ext": {}
}
```

### 4.2 規則

* `id` は一意でなければならない
* `text` は UTF-8 文字列
* token 分割規則（1字/熟語等）は SKAM 仕様外とする
  * **推奨：字単位**（訓点・返り点の指示と一致するため）
* `ext` は拡張フィールド（任意、round-trip 保持推奨）

---

## 5. Marks（注記）

### 5.1 共通構造

```json
{
  "type": "kaeri",
  "id": "m1",
  "anchor": { "from": "t3", "to": "t3" },
  "value": "レ",
  "placementHint": "right-bottom",
  "ext": {}
}
```

#### フィールド

| フィールド | 必須 | 説明 |
|-----------|------|------|
| `type` | 必須 | 注記種別 |
| `id` | 任意（推奨） | 一意識別子。編集・差分・UI操作用。無ければ配列indexを一時IDとして扱う |
| `anchor` | 必須 | 対象 token 範囲 |
| `value` | type依存 | 表示・意味の主データ |
| `placementHint` | 任意 | 表示上の弱いヒント（解釈不能でも問題としない） |
| `ext` | 任意 | 拡張フィールド（round-trip 保持推奨） |

---

### 5.2 type 一覧（v0.1）

| type        | 意味             | value |
| ----------- | ---------------- | ----- |
| `kaeri`     | 返り点           | 必須（レ、一、二、上、下、甲、乙 等） |
| `okurigana` | 送り仮名         | 必須（送り仮名テキスト） |
| `okiji`     | 助字・テニヲハ   | 必須（助字テキスト） |
| `emphasis`  | 傍点・圏点       | 任意（傍点の種類） |
| `note`      | 注釈（割注・欄外注含む） | 必須（注釈テキスト） |

※ `type` の追加は後方互換で許可される。

---

### 5.3 Anchor

```json
{
  "from": "t4",
  "to": "t6"
}
```

* `from` ≤ `to`（token 順）
* 単一 token の場合も省略しない

---

## 6. Readings（読み層）

### 6.1 構造

```json
{
  "kind": "yomiage",
  "text": "学びて時に之を習ふ",
  "ext": {}
}
```

### 6.2 kind の例

* `kundoku`：訓読文
* `kakikudashi`：書き下し文
* `yomiage`：a11y 用読み上げ文

### 6.3 規則

* 読み層は表示層と独立
* HTML 側では `aria-hidden` 等で表示層と分離することを想定
* v0.1 では全文テキストのみ保持

### 6.4 将来の拡張（非規範）

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

* `span` は reading.text の **Unicode コードポイント位置**（UTF-16 禁止）
* ハイライト同期、読みと原文の対応表示、クリックで原文ジャンプ等に利用

#### 生成規則

返り点等から読みを再生成する規則は `readings` 内ではなく、
別セクション（`derivations` / `transform` 等）で管理することを想定。

---

## 7. 表示モデルとの関係（非規範）

SKAM 自体は表示方式を規定しないが、以下を想定する。

| 要素   | 初期想定              |
| ---- | ----------------- |
| 本文   | HTML span         |
| 送り仮名 | inline span       |
| 返り点  | ::after / overlay |
| 割注   | absolute          |
| 欄外注  | footnote          |

※ SVG / Canvas は後段で採用可能。

---

## 8. アクセシビリティ方針（非規範）

* 表示層：`aria-hidden="true"`
* 読み層：不可視 DOM として提供
* 読み順は `readings` により保証

---

## 9. 拡張性

### 9.1 未知フィールドの扱い

* 未知の `type` は無視してもよい
* 未知のフィールドは無視してもよい
* `placementHint` は解釈不能でも問題としない

### 9.2 ext コンテナ方式

拡張データは `ext` フィールドに格納する。

```json
{
  "type": "kaeri",
  "anchor": { "from": "t7", "to": "t7" },
  "value": "レ",
  "ext": {
    "skam-editor": { "color": "red" },
    "mytool": { "confidence": 0.7 }
  }
}
```

* 既知フィールドは仕様で固定
* 拡張は全て `ext` 以下に格納
* **`ext` は保持して再出力してよい（round-trip 推奨）**

### 9.3 将来の互換性

* 将来、TEI への変換が可能な構造を維持する

---

## 10. バージョニング

* `format` フィールドで明示
* 破壊的変更はメジャーバージョンを上げる

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
      "type": "okiji",
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
      "anchor": { "from": "t5", "to": "t5" },
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
