---
status: Accepted
plan: plan-kaeri-re-anchor-convention.md
---

# ADR-004: 返り点（kaeri）を position-based mark に変更

## コンテキスト

### 問題

SKAM データモデルにおいて、返り点（`type: 'kaeri'`）は anchor-based mark として定義されている。しかし、返り点はトークンに付随する属性ではなく、トークン間の「位置」に置かれる読み順指示であり、anchor-based 配置は意味論的に不適切である。

### 背景

漢文の返り点は「読み順を変更する指示」をトークン間に配置するもの:

- **レ点**: 直前のトークンに戻って読む指示（2トークン間の境界に配置）
- **一二点・上下点・甲乙点**: 離れたトークン間の読み順を指示（対応する位置に配置）
- **複合返り点**（一レ、二レ等）: 上記の組み合わせ

いずれも本質的に「位置指示」であり、特定トークンの属性ではない。

### 現行の問題点

anchor-based 配置では:

1. **レ点のアンカー位置が曖昧**: 上のトークン vs 下のトークン、どちらにアンカーすべきか仕様内で不整合
2. **複合返り点の表現が不自然**: `anchor: { from: "t4", to: "t4" }` で単一トークンにアンカーするが、実際は位置指示
3. **range 形式も破綻**: 複合返り点（一レ等）を `anchor: { from, to }` の range で表現しようとすると、意味的に不整合

### position-based 配置なら

1. **意味的に正確**: 返り点はトークン間の位置に配置される → `position: { blockId, after }` が自然
2. **配置の曖昧さが解消**: `after` で直前トークンを指定すれば一意
3. **既存の position-based marks（kutoten, ref）と整合**: 同じくトークン間に配置される marks との一貫性

## 検討した選択肢

### A) anchor のアンカー先を下のトークンに統一（当初案）

- `anchor: { from: "下token", to: "下token" }` で統一
- **却下理由**: XML の視覚的慣例（レ点は下のトークンの後に書く）と JSON のアンカー先が一致するが、根本的に「トークン属性ではない」問題が残る

### B) anchor の range 形式で表現

- `anchor: { from: "上token", to: "下token" }` で対象ペアを明示
- **却下理由**: 複合返り点（一レ等）ではペアが重複・入れ子になり、range の意味が破綻する

### C) レ点のみ position-based に変更

- レ点だけ PositionedMark にし、一二点等は AnchoredMark のまま
- **却下理由**: 同じ `type: 'kaeri'` 内で配置方式が混在し、型定義・処理ロジックが複雑化

### D) 全 kaeri を position-based に変更（採用）

- 全ての返り点を `position: { blockId, after }` で配置
- **利点**: 意味的に正確、一貫性あり、kutoten/ref と同じ配置方式

## 決定

**全ての kaeri marks を anchor-based から position-based に変更する。**

### 変更前

```json
{
  "type": "kaeri",
  "anchor": { "from": "t5", "to": "t5" },
  "value": "レ"
}
```

### 変更後

```json
{
  "type": "kaeri",
  "position": { "blockId": "b1", "after": "t5" },
  "value": "レ"
}
```

### XML 表現は変更しない

SKAM-ML（XML マークアップ）での `<skam:kaeri kind="re"/>` の配置位置は変わらない。パーサーが XML 位置情報から `position` フィールドを生成する。

### 配置ルール

- `after`: 返り点が配置されるトークンの ID（そのトークンの直後に配置）
- ブロック先頭に返り点を配置する場合は `after` を省略

## 影響範囲

### 変更対象

| ファイル/領域                           | 変更内容                                              |
| --------------------------------------- | ----------------------------------------------------- |
| `SKAM-draft.md`                         | Mark Types テーブル (kaeri: A→P)、kaeri JSON 定義、例 |
| `SKAM-ML-draft.md`                      | Section 7.2 正規化ルール                              |
| `packages/skam/src/index.ts`            | KaeriMark: AnchoredMark → PositionedMark              |
| `packages/skam/src/validator.ts`        | kaeri の検証ロジック                                  |
| `packages/skam-xml-parser/`             | kaeri の anchor 生成 → position 生成                  |
| `packages/skam-xml-parser/` (stringify) | kaeri の position → XML 配置                          |
| 全テストファイル                        | kaeri の anchor → position                            |

### positive

- 返り点の意味論（位置指示）とデータモデル（position-based）が一致
- kutoten, ref との配置方式の一貫性
- アンカー位置の曖昧さ（上 vs 下）が解消

### negative

- 破壊的変更: 既存の kaeri データは全て移行が必要
- position-based marks が 2種 → 3種に増加（kutoten, ref, kaeri）
- 返り点に関する操作ユーティリティの更新

### 設計原則

marks 層は配置情報のみを保持する。読み順の意味解釈（返り点から読み順を導出する処理）は `derivations[]` 層で行う。

## 検証で判明した問題

Plan 検証（logic-validator）により、ADR と対応 Plan の間に重大な乖離が発見された。

### 1. ADR と Plan の決定内容が根本的に乖離

- **ADR の決定**: 全 kaeri marks を anchor-based から position-based に変更
- **Plan の実施内容**: レ点のアンカー先トークンを上→下に変更（anchor-based のまま維持）

Plan は ADR が採用した選択肢 D（position-based 移行）ではなく、却下された選択肢 A（アンカー先を下に統一）を実装する内容になっている。

### 2. 影響範囲テーブルとの矛盾

ADR の影響範囲テーブルが要求する変更（型定義・バリデーター・パーサー・stringify のコード変更）に対し、Plan は「変更しない」と明記している。

### 3. ファイル名の不整合

ADR ファイル名 `adr-004-kaeri-re-anchor-convention.md`（レ点アンカー慣例）と ADR タイトル「position-based mark に変更」が乖離。ADR が当初は選択肢 A で作成され、後から選択肢 D に変更された可能性がある。

### 対応方針（要決定）

以下のいずれかを選択する必要がある:

- **Option A**: Plan を ADR の決定（position-based 移行）に合わせて再作成
- **Option B**: ADR を Plan の内容（アンカー先変更のみ）に差し戻す（ただし却下理由との矛盾を解消する必要あり）
- **Option C**: 段階的実装を明示（現 Plan を Phase 1、position-based 移行を Phase 2 として再定義）
