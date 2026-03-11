---
status: Complete
deps: [16, 17]
---

# ADR-018: Canvas `layout-vertical` の責務分割アーキテクチャ

## コンテキスト

`packages/skam-canvas-renderer/src/layout-vertical.ts` は、過去の機能追加（tateten, highlight, adaptive列幅, range ruby, emphasis共存対応）を吸収する中で、次の問題が顕在化している。

- 分析処理（token収集・maxRubyWidth計測）と座標配置が単一関数に同居
- `token` / `tateten-group` / `highlight-group` で Y 進行と token 配置ロジックが重複
- `uniform` / `adaptive` 分岐が寸法算出から配置まで浸透しており変更影響範囲が広い
- 局所最適の走査が増え、将来の仕様追加時に退行リスクが高い

結果として、レイアウト仕様の変更ではなく「構造変更」だけをしたい場面でも、広範囲に触る必要がある。

## 検討した選択肢

### Option A: 単一ファイル維持で関数抽出のみ

- 利点: 差分が小さい
- 欠点: 分析・列計画・配置の境界が曖昧なまま残る。中長期の保守性改善が限定的

### Option B: `layout-vertical` を3層へ分割（分析 / 列計画 / 配置）

- 利点: 責務が明確化し、`uniform/adaptive` 分岐を列計画層へ閉じ込められる
- 利点: token 配置経路を単一化し、重複と退行ポイントを削減できる
- 欠点: 新規ファイル・内部型が増え、初期移行コストがある

### Option C: Pass 2 全体を別パッケージ化

- 利点: 将来的な再利用性は高い
- 欠点: 現時点では過剰。API境界の変更と移行コストが大きい

## 意思決定基準

- 仕様互換: 既存の座標仕様（`rangeRubyAlignment` を含む）を変えないこと
- 変更局所性: 仕様追加時の変更範囲を局所化できること
- 検証容易性: 既存テストと回帰テストで判定可能であること
- 移行安全性: 段階移行で途中でも常にテスト可能であること

## 決定

**Option B** を採用する。Pass 2（縦書き）を以下の内部レイヤへ分割する。

1. Analysis レイヤ

- 文書・ブロック単位の前処理（token収集、maxRubyWidth、flags）を一度だけ実施

2. Column Planning レイヤ

- `computeColumnDimensions` と `blockColumnX` を統合管理
- `uniform` / `adaptive` 分岐をこの層に限定

3. Placement レイヤ

- child種別ごとの差分を局所化しつつ、共通の token 配置経路で `yOffset` を進行
- highlight 線と ref ラベルをグループ処理として閉じ込める

## 決定の詳細

### 1. `layoutVertical()` はオーケストレータに縮退

`layoutVertical()` は次の順序だけを担う:

- `analyzeDocument()`
- `planColumns()`
- `placeBlock()` の反復
- `DocumentLayout` の最終集約

### 2. 内部型を導入して意味境界を固定

- `DocumentAnalysis`
- `BlockAnalysis`
- `ColumnPlan`
- `PlacementContext`

これらは公開APIではなく Pass 2 内部型とする。

### 3. Analysis レイヤの責務境界

Analysis レイヤは **Pass 2 で新たに必要な計算のみ** を担う:

- token 収集（`collectAllTokens` / `collectBlockTokens` 相当）
- `maxRubyWidth` の計測（ドキュメント全体・ブロック単位）

`BlockLayoutFlags`（`hasSuffix`, `hasSaidoku`, `hasRightColumn`, `hasEmphasis`, `hasHighlight`, `hasRefLabel`）は **Pass 1 で計算済み**（`render-tree.ts` の `CanvasBlockNode.flags` および `CanvasRenderTree` トップレベルフラグ）であり、Analysis レイヤでは **参照保持のみ、再計算・再導出しない**。

```typescript
// DocumentAnalysis は Pass 1 の flags を参照保持する（再計算しない）
interface DocumentAnalysis {
  documentFlags: BlockLayoutFlags; // tree.{hasSuffix, ...} から構成（OR 集約済み）
  blocks: BlockAnalysis[];
}
interface BlockAnalysis {
  tokens: CanvasTokenNode[];
  maxRubyWidth: number;
  flags: BlockLayoutFlags; // block.flags をそのまま参照（再計算しない）
}
```

### 4. `emphasisOverrideX` の優先順位仕様

`emphasisOverrideX` は ADR-017 で導入された per-token/per-group emphasis 位置制御である。Placement レイヤでは以下の優先順位で設定される（上位が優先）:

1. **highlight-group 内**: `groupHighlightLineX + highlightGap / 2 + rubyFontSize / 2`（highlight 線の外側）
2. **tateten-group 内（ruby 有）**: `grid.suffixX + rubyFontSize`（ruby 列の右側に統一）
3. **range ruby の2文字目以降**: `grid.suffixX + rubyFontSize`（ruby 列分の空きを確保）
4. **上記いずれにも該当しない**: per-token 計算（`layoutSingleToken` 内、ruby 有無で分岐）

highlight-group 内の tateten-group では 1 が適用される（2 は `emphasisOverrideX === undefined` のときのみ設定されるため、highlight の設定が優先）。この優先順位はリファクタリングで変更しない。

### 5. `effectiveMaxRubyWidth` の層割り当て

`effectiveMaxRubyWidth` は highlight の `rightAdjust` 計算で使用され、`uniform` / `adaptive` でデータソースが異なる:

- **uniform モード**: ドキュメント全体の `maxRubyWidth`
- **adaptive モード**: ブロック単位の `maxRubyWidth`

この値は Column Planning レイヤの `ColumnPlan` に含める:

```typescript
interface ColumnPlan {
  blockIndex: number;
  x: number;
  dimensions: ColumnDimensions;
  flags: BlockLayoutFlags; // effective flags（uniform: doc flags, adaptive: block flags）
  grid: GridColumns;
  effectiveMaxRubyWidth: number; // highlight rightAdjust 用
}
```

これにより Placement レイヤは `ColumnPlan` から直接取得でき、`uniform` / `adaptive` 分岐を意識しない。

### 6. 関数マッピング

現在の関数群と移行先レイヤの対応:

| 現在の関数                    | 移行先             | 備考                                 |
| ----------------------------- | ------------------ | ------------------------------------ |
| `collectAllTokens()`          | Analysis           | `analyzeDocument()` 内部             |
| `collectBlockTokens()`        | Analysis           | `analyzeDocument()` 内部             |
| `collectTokensFromChild()`    | Analysis           | 内部ヘルパー                         |
| `computeColumnDimensions()`   | Column Planning    | `planColumns()` 内部                 |
| `computeGridColumns()`        | Column Planning    | `ColumnPlan.grid` として結果を格納   |
| `layoutSingleToken()`         | Placement          | `placeToken()` として統合            |
| `computeTokenContentHeight()` | Placement          | `placeToken()` 内部で使用            |
| `layoutTatetenChildren()`     | Placement          | `placeTatetenGroup()` として統合     |
| `layoutBlockChild()`          | Placement          | `placeBlock()` 内部のディスパッチ    |
| `rubyFont()`                  | 共有ユーティリティ | 各レイヤから import 可能な位置に配置 |
| `measureTextWidth()`          | 共有ユーティリティ | 各レイヤから import 可能な位置に配置 |

共有ユーティリティは `layout-vertical.ts`（オーケストレーション）に残すか、必要に応じて `layout-helpers.ts` として分離する。

### 7. 互換性方針

- レイアウト仕様（既存の座標計算式）は変更しない
- 既存テストの期待値は原則据え置き
- 変更は「同等出力を維持する内部再構成」を目的とする

### 8. 設計上の不変条件

- `buildRenderTree()`（Pass 1）と `draw()`（Pass 3）の責務境界は変更しない
- 公開 API と公開型（`index.ts` 経由）は変更しない
- `columnSizing` の仕様（ADR-016）と `emphasis/highlight` の仕様（ADR-017）を維持する
- `rangeRubyAlignment` の仕様・算式・期待値を維持する
- `emphasisOverrideX` の優先順位（上記4.）を維持する

## 影響

### ポジティブ

- `layout-vertical.ts` の変更局所性が改善される
- 新規マーク対応時の影響分析がしやすくなる
- `uniform/adaptive` の振る舞い差分を1箇所で検証可能になる

### ネガティブ

- ファイル数と内部型が増える
- 移行途中は一時的に抽象化コストが発生する

## 実装・検証方針

- 実装は段階移行（分析抽出 -> 列計画抽出 -> 配置共通化）
- 各段で既存テストを全実行し、視覚仕様の互換を維持
- 回帰観点は `highlight + emphasis`, `tateten in highlight-group`, `range ruby + emphasis`

## 受け入れ条件

- `layoutVertical()` がオーケストレーション中心となり、分析・列計画・配置の主要責務が分離されている
- `uniform` / `adaptive` の主要分岐が列計画レイヤに集約され、配置レイヤに分散していない
- token 配置の Y 進行ロジック（`layoutSingleToken` 呼び出し + advance 計算）が単一経路化されている
- 既存の `packages/skam-canvas-renderer/src/__tests__/layout-vertical.test.ts` が全件パスする
- 回帰テストとして `highlight + emphasis`、`tateten in highlight-group`、`range ruby + emphasis` を含むケースが保持または追加されている
- `rangeRubyAlignment`（`distribute` / `center`）の既存ケースが回帰しない
- `pnpm --filter @kanbun-skam/skam-canvas-renderer test` と `pnpm typecheck` が成功する

## 実装前提

- 3レイヤは**複数ファイル分割**を採用する
  - `layout-vertical.analysis.ts`
  - `layout-vertical.columns.ts`
  - `layout-vertical.placement.ts`
  - `layout-vertical.ts` はオーケストレーションのみを保持

## 未決事項（残件）

- 分析結果キャッシュ（DocumentAnalysis の再利用）の扱い
- highlight まわりの group 走査最適化の扱い
- range ruby overflow 計算の重複排除: tateten 内と block-level で ~120 行の類似ロジック（`computeRangeRubyOverflow()` ヘルパー抽出の余地）

## 参考

- `packages/skam-canvas-renderer/src/layout-vertical.ts`
- `packages/skam-canvas-renderer/src/__tests__/layout-vertical.test.ts`
- `docs/plans/plan-canvas-layout-vertical-refactor.md`
