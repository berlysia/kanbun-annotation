# Plan: Canvas Renderer `layout-vertical` 再構成

関連: `packages/skam-canvas-renderer/src/layout-vertical.ts`, `packages/skam-canvas-renderer/src/types.ts`

## 背景

`layout-vertical.ts` は機能追加を積み重ねた結果、以下が同時に存在して見通しが落ちている:

- ツリー走査と座標計算が密結合
- `token` / `tateten-group` / `highlight-group` で近い処理が分散
- `uniform` / `adaptive` の分岐が寸法計算と配置計算に跨っている
- ブロック分析（flags, maxRubyWidth）を複数箇所で再計算している

`rangeRubyAlignment: 'distribute' | 'center'` を含む現行の `range ruby overflow` 仕様は、
本 Plan では変更対象にせず、責務分割リファクタリングの中で互換維持する。

## 現状の具体的な重複ポイント

1. Y 進行ロジックの重複

- `layoutBlockChild()` と `layoutTatetenChildren()` と `highlight-group` 内で、
  `tokenX/tokenY` 計算、`layoutSingleToken()` 呼び出し、`computeTokenContentHeight()`、`yOffset` 更新が繰り返し。

2. 右列有無判定の局所再走査

- `highlight-group` ごとに `groupHasRightColumn` を都度ネスト走査。
- 同種の判定が Pass 1 由来の flags と別系統で存在。

3. 寸法情報の再計測

- `maxRubyWidth` を document/block で複数ループ計測。
- `collectAllTokens()` / `collectBlockTokens()` と組み合わせて同じ情報を再取得。

4. 処理段の境界が曖昧

- 「分析」「列寸法決定」「子要素配置」「ハイライト線配置」が単一関数に同居。

## 目標

1. `layoutVertical()` を「分析 -> 列計画 -> 配置」の3段に分離する。
2. child 種別差分を局所化し、共通の Y 進行・token 配置ルーチンを1つにする。
3. `uniform` / `adaptive` の差を列寸法決定レイヤに閉じ込める。
4. 既存の視覚仕様（座標互換）を維持したまま内部構造だけを改善する。

## 成果物

- `layout-vertical` の責務分割後実装（analysis / column planning / placement）
- 回帰テストの補強（`highlight + emphasis`, `tateten in highlight-group`, `range ruby + emphasis`）
- ADR-018 の受け入れ条件を満たす実装証跡（テスト結果 + コード構造）

## 非目標

- 見た目仕様の変更（grid 算式や slot 位置ルール、`rangeRubyAlignment` 挙動の見直し）
- Pass 1 / Pass 3 の責務変更
- 横書き対応

## 提案アーキテクチャ

### 1. Analysis レイヤ

`layout-vertical.analysis.ts`（新規）に以下を集約:

- `analyzeDocument(tree, measurer, options): DocumentAnalysis`
- 返却値:
  - `blocks[i].tokens`
  - `blocks[i].maxRubyWidth`
  - `blocks[i].flags`（既存利用）
  - `document.maxRubyWidth`
  - `document.flags`

ポイント:

- token 収集と ruby 幅計測を1回で完了。
- `collectAllTokens()` / `collectBlockTokens()` の責務を置換。

### 2. Column Planning レイヤ

`layout-vertical.columns.ts`（新規）:

- `planColumns(analysis, options): ColumnPlan[]`
- `ColumnPlan`:
  - `blockIndex`
  - `x`
  - `dimensions` (`columnWidth`, `baseCenterX`, `extraRightWidth`, `fullColumnWidth`)
  - `flags`（effective flags）
  - `grid`（`computeGridColumns` の結果）

ポイント:

- `uniform` / `adaptive` 分岐をここだけで吸収。
- `layoutVertical()` は `ColumnPlan` を順に処理するだけにする。

### 3. Placement レイヤ

`layout-vertical.placement.ts`（新規）:

- `placeBlock(block, plan, options): ColumnLayout`
- 内部で共通化:
  - `placeToken(node, yOffset, lctx) -> { child, advance }`
  - `placeTatetenGroup(group, yOffset, lctx) -> { children, advance }`
  - `placeHighlightGroup(group, yOffset, context) -> { children, highlightLine, advance }`

ポイント:

- `tokenX/tokenY` 計算、`computeTokenContentHeight()`、`yOffset` 加算の重複を1経路化。
- `highlight-group` 判定に使う `groupHasRightColumn` は group 単位の補助関数へ隔離。

## 段階的移行手順

### Step 1: 読み取り専用の分析構造を追加

- 新規 `DocumentAnalysis` 型を `types.ts` に内部型として追加。
- 既存ロジックは変えず、`layoutVertical()` 冒頭で分析結果を作るだけにする。
- テスト: 既存 `layout-vertical.test.ts` を全通。
- 禁止事項:
  - 配置ロジック（`layoutSingleToken()` 呼び出し経路、`yOffset` 更新規則）を変更しない
  - `uniform/adaptive` 分岐の位置を変更しない
  - `rangeRubyAlignment` の仕様・算式・期待値を変更しない
- 完了ゲート:
  - 既存スナップショット/期待値に変更がない
  - 分析処理が `layoutVertical()` 本体から分離されている

### Step 2: Column Planning を抽出

- `blockDimsArray`, `blockColumnXs`, `totalWidth` 計算を `planColumns()` に移動。
- `layoutVertical()` から `uniform/adaptive` の分岐を除去。
- テスト: `layout-vertical.test.ts` の寸法系ケース（column width / document width）を重点確認。
- 禁止事項:
  - token/tateten/highlight の配置ロジックを変更しない
  - `layoutSingleToken()` と `computeTokenContentHeight()` の算式を変更しない
  - `rangeRubyAlignment` の分岐ロジックを変更しない
- 完了ゲート:
  - `columnSizing` 分岐が列計画側に集約されている
  - `uniform` と `adaptive` の既存テストが全パス

### Step 3: Placement の共通化

- `layoutTatetenChildren()` と `layoutBlockChild()` の token 配置重複を `placeToken()` に統合。
- `highlight-group` 内 token 処理も同じ `placeToken()` を利用。
- テスト: `tateten`, `highlight`, `range ruby`, `emphasis` の座標系ケースを重点確認。
- 禁止事項:
  - grid座標算式（`computeGridColumns`）を変更しない
  - `columnSizing` のモード判定に変更を加えない
  - `range ruby overflow` の仕様ロジックを変更しない
- 完了ゲート:
  - token 配置ロジックが単一経路で維持される
  - `yOffset` 更新規則が child 種別横断で一貫している

### Step 4: 追加ガードテスト

- リファクタ専用の回帰テストを追加:
  - multi-block + adaptive + highlight
  - tateten in highlight-group
  - range ruby と emphasis 共存
- 目的: 内部再構成後も座標互換を固定。
- 追加/確認対象テスト（具体）:
  - `packages/skam-canvas-renderer/src/__tests__/layout-vertical.test.ts`
    - `uses adaptive grid width based on hasSaidoku/hasRightColumn`（既存）
    - `creates separate columns for each block`（既存）
    - `computes document width for multi-block`（既存）
    - `moves highlight line closer when group tokens have no kana`（既存）
    - `emphasis in highlight-group uses hlEmphasisX (outside highlight line)`（既存）
    - `distributes excess evenly when range ruby overflows span (2 tokens)`（既存）
    - `centers block-level range ruby when rangeRubyAlignment is center`（既存）
  - `packages/skam-canvas-renderer/src/__tests__/integration.test.ts`
    - `multi-block + adaptive + highlight` を同時に通す統合ケースを**追加候補**として作成
    - `tateten in highlight-group` の統合ケースを**追加候補**として作成
    - `range ruby + emphasis` 共存ケースを**追加候補**として作成
- 完了ゲート:
  - 新規ケースが意図した退行を捕捉できる
  - 既存ケースとの重複が少なく、目的が明確

## 実施単位（推奨コミット）

1. `refactor(canvas): add vertical layout analysis model`
2. `refactor(canvas): extract column planning from layout-vertical`
3. `refactor(canvas): unify token placement paths`
4. `test(canvas): add regression cases for layout refactor`

## リスクと対策

- リスク: `highlight` の X 補正が微妙にずれる
- 対策: 既存ケースに加えて highlight 専用スナップショットテストを追加

- リスク: range ruby + emphasis の override 退行
- 対策: 既存 `rubySpan` ケースを拡張し、`emphasisOverrideX` の期待値固定

- リスク: 分割後の型増加で可読性が逆に低下
- 対策: 公開型と内部型を分離し、内部型には `/** internal */` コメントで用途を限定

## ロールバック方針

- 各 Step を独立コミットに分割し、退行時は直前 Step まで戻せる形にする
- 仕様変更を伴わないため、期待値更新で吸収せず実装を修正して互換を維持する

## 検証コマンド

- `pnpm --filter @kanbun/skam-canvas-renderer test`
- `pnpm typecheck`

## 完了条件

- `layoutVertical()` が「分析呼び出し -> 列計画呼び出し -> ブロック配置反復 -> 最終集約」の流れに限定されている
- `uniform/adaptive` 分岐が `planColumns()` 内に閉じる
- token 配置ロジックが単一経路化され、同等処理の重複が解消
- `rangeRubyAlignment` の既存ケース（`distribute` / `center`）が回帰しない
- `pnpm --filter @kanbun/skam-canvas-renderer test` 全パス
- `pnpm typecheck` 全パス
