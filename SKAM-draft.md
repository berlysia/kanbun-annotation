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
- 本文 token を **anchor 参照**する外付け情報
- 本文テキストを直接分断しない（stand-off）

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
  "marks": [],
  "readings": [],
  "ext": {}
}
```

- `ext` は拡張フィールド（任意）

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

- `id` は一意でなければならない
- `text` は UTF-8 文字列
- token 分割規則（1字/熟語等）は SKAM 仕様外とする
  - **推奨：字単位**（訓点・返り点の指示と一致するため）
- `ext` は拡張フィールド（任意、round-trip 保持推奨）

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

| フィールド      | 必須         | 説明                                                                  |
| --------------- | ------------ | --------------------------------------------------------------------- |
| `type`          | 必須         | 注記種別                                                              |
| `id`            | 任意（推奨） | 一意識別子。編集・差分・UI操作用。無ければ配列indexを一時IDとして扱う |
| `anchor`        | 必須         | 対象 token 範囲                                                       |
| `value`         | type依存     | 表示・意味の主データ                                                  |
| `placementHint` | 任意         | 表示上の弱いヒント（解釈不能でも問題としない）                        |
| `ext`           | 任意         | 拡張フィールド（round-trip 保持推奨）                                 |

---

### 5.2 type 一覧（v0.1）

| type        | 意味                     | value                                 |
| ----------- | ------------------------ | ------------------------------------- |
| `kaeri`     | 返り点                   | 必須（レ、一、二、上、下、甲、乙 等） |
| `okurigana` | 送り仮名                 | 必須（送り仮名テキスト）              |
| `yomigana`  | 読み仮名（ルビ）         | 必須（読み仮名テキスト）              |
| `okiji`     | 助字・テニヲハ           | 必須（助字テキスト）                  |
| `kutoten`   | 句読点                   | 必須（句読点記号）、kind任意          |
| `emphasis`  | 傍点・圏点               | 任意（傍点の種類）                    |
| `note`      | 注釈（割注・欄外注含む） | 必須（注釈テキスト）                  |
| `saidoku`   | 再読文字                 | 必須（forms配列）                     |
| `okototen`  | ヲコト点                 | position必須、shape必須               |
| `tateten`   | たて点（熟語境界）       | なし                                  |

※ `type` の追加は後方互換で許可される。

---

### 5.3 Anchor

```json
{
  "from": "t4",
  "to": "t6"
}
```

- `from` ≤ `to`（token 順）
- 単一 token の場合も省略しない

---

### 5.4 座標系（Coord）

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

### 5.5 再読文字（Saidoku）

1つの文字を複数回読む再読文字を表現する。

#### 構造

```json
{
  "type": "saidoku",
  "anchor": { "from": "t1", "to": "t1" },
  "forms": [
    { "n": 1, "reading": "まさ", "okuri": "に" },
    { "n": 2, "okuri": "す" }
  ]
}
```

#### forms 配列

| フィールド | 必須 | 説明                     |
| ---------- | ---- | ------------------------ |
| `n`        | 任意 | 読み順（省略時は配列順） |
| `reading`  | 任意 | 読み仮名                 |
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

### 5.6 ヲコト点（Okototen）

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

## 6. Derivations（導出情報）

### 6.1 目的

返り点等から計算される読み順などの導出情報を記録する。
計算結果を保存することで、表示・検索時の再計算を省略可能。

### 6.2 構造

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

### 6.3 kind 一覧（v0.1）

| kind           | 意味   | result          |
| -------------- | ------ | --------------- |
| `readingOrder` | 読み順 | token ID の配列 |

### 6.4 readingOrder の method

| method           | 説明                             |
| ---------------- | -------------------------------- |
| `kaeriten-stack` | 返り点に基づくスタック操作で導出 |
| `manual`         | 手動指定                         |

※ 具体的なアルゴリズムは実装依存。参考として以下の概要を示す。

#### kaeriten-stack アルゴリズム（参考・非規範）

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

## 7. Readings（読み層）

### 7.1 構造

```json
{
  "kind": "yomiage",
  "text": "学びて時に之を習ふ",
  "ext": {}
}
```

### 7.2 kind の例

- `kundoku`：訓読文
- `kakikudashi`：書き下し文
- `yomiage`：a11y 用読み上げ文

### 7.3 規則

- 読み層は表示層と独立
- HTML 側では `aria-hidden` 等で表示層と分離することを想定
- v0.1 では全文テキストのみ保持

### 7.4 将来の拡張（非規範）

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

## 8. 表示モデルとの関係（非規範）

SKAM 自体は表示方式を規定しないが、以下を想定する。

| 要素     | 初期想定          |
| -------- | ----------------- |
| 本文     | HTML span         |
| 送り仮名 | inline span       |
| 返り点   | ::after / overlay |
| 割注     | absolute          |
| 欄外注   | footnote          |

※ SVG / Canvas は後段で採用可能。

### 8.1 レンダリングプロファイル（非規範）

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

## 9. アクセシビリティ方針（非規範）

- 表示層：`aria-hidden="true"`
- 読み層：不可視 DOM として提供
- 読み順は `readings` により保証

---

## 10. 拡張性

### 10.1 未知フィールドの扱い

- 未知の `type` は無視してもよい
- 未知のフィールドは無視してもよい
- `placementHint` は解釈不能でも問題としない

### 10.2 ext コンテナ方式

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

- 既知フィールドは仕様で固定
- 拡張は全て `ext` 以下に格納
- **`ext` は保持して再出力してよい（round-trip 推奨）**

### 10.3 将来の互換性

- 将来、TEI への変換が可能な構造を維持する

---

## 11. バージョニング

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
  "marks": [
    {
      "type": "saidoku",
      "id": "m1",
      "anchor": { "from": "t1", "to": "t1" },
      "forms": [
        { "n": 1, "reading": "まさ", "okuri": "に" },
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
      "value": "なんと"
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
  "marks": [
    {
      "type": "kaeri",
      "id": "m1",
      "anchor": { "from": "t2", "to": "t2" },
      "value": "二"
    },
    {
      "type": "kaeri",
      "id": "m2",
      "anchor": { "from": "t4", "to": "t4" },
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
