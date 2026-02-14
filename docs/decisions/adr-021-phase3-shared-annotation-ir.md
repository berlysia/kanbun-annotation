# ADR-021: Phase3 共通 Annotation IR（HTML/Canvas 内部モデル統合）

## ステータス

Proposed

関連 ADR: [ADR-018](adr-018-canvas-layout-vertical-refactor-architecture.md), [ADR-019](adr-019-html-renderer-colocation-and-named-grid-areas.md), [ADR-020](adr-020-html-renderer-phase2-stabilization-and-guardrails.md)

## コンテキスト

### Phase2 完了評価（2026-02-14 時点）

`ADR-020` の完了判定を現行コードで再実行し、次を確認した。

- 依存逆流チェック: `build-render-tree.ts` / `render-tree.ts` / `token-renderer.ts` から `renderer.ts` import は 0 件
- `tateten-sep` 命名行: `sep-spacer-start`, `sep-tateten-start`, `sep-kaeri-start`, `sep-end` が配置定義に存在
- 依存方向機械検証: `pnpm --filter @kanbun/skam-html-renderer run check:deps` 成功
- CI 連携: `.github/workflows/ci.yml` に `check:deps` 実行が存在
- 回帰安全性:
  - `pnpm --filter @kanbun/skam-html-renderer test:run` 成功（431 tests passed）
  - `pnpm typecheck` 成功

Phase2 は完了と判定できる。

### Phase3 に進む理由

Phase2 までで構造安定化は達成したが、次の根本課題は残る。

1. Pass1 相当の意味解決が HTML/Canvas で二重実装されている
2. 内部表現が分岐しており、同じ仕様変更で2系統の修正が必要
3. 仕様差分ではなく実装差分による振る舞い乖離を検出しにくい

実際に両実装は同じ基礎ユーティリティ（`getRangeMarkGroups`, `getTatetenGroups`, `getHighlightGroups`, `groupTokensByBlock`, `getMarksForToken`）を使いつつ、解決後モデルを別に組み立てている。  
この「共有ロジック + 分岐モデル」の構造が、Phase3 の統合対象である。

## 用語定義

- AIR: Annotation Intermediate Representation（マーク解決後の共通内部表現）
- Resolver 層: `SKAMDocument + profile -> AIR` を一意に行う層
- Adapter 層: AIR を各 renderer の描画入力へ変換する層
- 同値テスト: 同一入力に対し、AIR の意味情報が一致することを検証するテスト

## 前提（固定）

- SKAM 入力仕様（`skam@0.1`）は Phase3 で変更しない
- 公開 API 契約は ADR-019/020 の Accepted 状態を維持する
- Phase3 で統合対象とするのは Pass1 相当の意味解決のみで、描画アルゴリズム（HTML Pass2 / Canvas Pass2-3）は対象外

## 検討した選択肢

### Option A: 現状維持（個別モデル継続）

- 利点: 追加移行コストがない
- 欠点: 二重実装が残り、仕様追加のたびに乖離リスクが増える

### Option B: 共通 AIR + renderer Adapter へ再編（段階移行）

- 利点: 意味解決を1箇所に集約できる
- 利点: HTML/Canvas の差分を「表現差」に限定できる
- 利点: 仕様回帰をクロスレンダラーで検証しやすい
- 欠点: 移行中は AIR と既存モデルの併存期間が発生する

### Option C: レンダラー全面統合（単一実装）

- 利点: 長期的には最小重複
- 欠点: 変更面が大きく、Phase3 での安全移行には不向き

## 判断軸（重み付き）

| 判断軸           | 重み | 客観判定基準                                                      |
| ---------------- | ---- | ----------------------------------------------------------------- |
| 意味整合性       | 30   | 主要 mark 解決ロジックが Resolver に単一化される                  |
| 変更局所性       | 25   | renderer 個別実装から mark 解決ユーティリティ直接呼び出しが消える |
| 回帰検出力       | 20   | 固定4ケースの同値テストが自動実行される                           |
| 移行安全性       | 15   | 段階ごとにコマンドで合否判定できる                                |
| 実装コスト妥当性 | 10   | 公開 API 無変更で typecheck/test が通る                           |

### 選択肢スコア（1-5）

計算式: `総合点(0-100) = Σ(重み * 評点 / 5)`

| Option | 意味整合性 30 | 変更局所性 25 | 回帰検出力 20 | 移行安全性 15 | 実装コスト妥当性 10 | 総合点 |
| ------ | ------------- | ------------- | ------------- | ------------- | ------------------- | ------ |
| A      | 1             | 2             | 2             | 5             | 5                   | 44     |
| B      | 5             | 5             | 5             | 4             | 4                   | 94     |
| C      | 5             | 4             | 4             | 1             | 1                   | 71     |

判定ルール:

- 総合点 90 点以上を採択目安とする
- 必須ゲート: 「意味整合性」「移行安全性」を満たさない案は不採択

`Option B` を採択する。

### 採点ルーブリック（1/3/5）

| 判断軸           | 1点                                           | 3点                                | 5点                                |
| ---------------- | --------------------------------------------- | ---------------------------------- | ---------------------------------- |
| 意味整合性       | Resolver と renderer 双方に重複実装が残る     | 一部統合だが例外経路が残る         | 主要 mark 解決が Resolver 単一実装 |
| 変更局所性       | renderer で `getRangeMarkGroups` 等を直接呼ぶ | 片側 renderer のみ直接呼び出し残存 | 両 renderer で直接呼び出し 0       |
| 回帰検出力       | 同値テストなし                                | ケース不足または手動のみ           | 固定4ケースを CI で自動実行        |
| 移行安全性       | 一括移行で中間判定不可                        | 段階移行だがゲート不足             | 各段に実行コマンドと合格条件あり   |
| 実装コスト妥当性 | API 変更が必要                                | API 互換は維持だが回帰多数         | API 互換維持で test/typecheck 通過 |

## 決定

**Phase3 は Option B（共通 AIR + Adapter）で実施する。**

### 目標アーキテクチャ（Phase3 完了時）

- 共通 Resolver 層（`@kanbun/skam/rendering`）:
  - `buildAnnotationIR(doc, profile)` を提供
  - range/tateten/highlight/block-start/ref 解決をここに集約
- HTML Adapter 層（`@kanbun/skam-html-renderer`）:
  - AIR -> HTML display tree
- Canvas Adapter 層（`@kanbun/skam-canvas-renderer`）:
  - AIR -> Canvas render tree/layout input
- 公開 API 層:
  - 既存 `render` / `renderHTML` / `generateCSS` / Canvas `render` / `measure` を維持

### 設計原則（不変条件）

1. 公開 API と表示仕様は変更しない
2. Phase2 で導入した依存方向制約・CI ガードは維持する
3. baseline 補正契約（`calibrateGridBaseline`）は維持する
4. 仕様差と実装差を分離し、意味解決は Resolver に一本化する

### AIR 同値性の定義（固定）

同値テストで一致させる対象:

1. ブロック順序と `blockId`
2. トークン順序と `token.id`
3. mark 解決結果（ruby/okuri/soegana/kaeri/kutoten/saidoku/ref/highlight/tateten）
4. range 集約境界（from/to, span, trailing mark 集約結果）

同値テストで比較対象外とする差分:

- HTML/CSS の class 名や DOM 断片
- Canvas の座標・寸法・描画順最適化
- renderer 固有のレイアウト補助値

## 実施プロトコル（順序固定）

1. Step 1: AIR 型定義と Resolver 実装
2. Step 2: Canvas Adapter 切り替え（既存レイアウト層を温存）
3. Step 3: HTML Adapter 切り替え（既存 Pass2 描画層を温存）
4. Step 4: 二重実装の削除と import 整理
5. Step 5: クロスレンダラー同値テスト追加
6. Step 6: 最終回帰実行

Step 2-3 は並行しない。片方を安定化してから次へ進む。

## 受け入れ条件

- AIR 構築が単一入口で提供され、HTML/Canvas 両方がそれを利用する
- `getRangeMarkGroups` / `getTatetenGroups` / `getHighlightGroups` / `groupTokensByBlock` の呼び出しが renderer 個別実装から消える
- HTML/Canvas それぞれの既存主要テストが回帰しない
- クロスレンダラー同値テスト（固定4ケース）が追加される
- `pnpm --filter @kanbun/skam-html-renderer test:run`
- `pnpm --filter @kanbun/skam-canvas-renderer test:run`
- `pnpm typecheck`

### 固定4ケース（同値テスト必須）

1. range ruby（複数トークン集約 + span）
2. tateten + kaeri（レ/非レ分割を含む）
3. highlight + ref（グループ参照ラベルを含む）
4. saidoku（二段読み + 第二送り）

## 完了判定手順（再現可能）

1. `rg -n "buildAnnotationIR" packages/skam-html-renderer/src packages/skam-canvas-renderer/src packages/skam/src/rendering`
   合格条件: `packages/skam/src/rendering` に実装があり、両 renderer で利用される

2. `rg -n "getRangeMarkGroups|getTatetenGroups|getHighlightGroups|groupTokensByBlock" packages/skam-html-renderer/src packages/skam-canvas-renderer/src -g '!**/__tests__/**'`
   合格条件: renderer 個別実装で上記呼び出し 0 件

3. `pnpm --filter @kanbun/skam-html-renderer test:run`
   合格条件: 失敗 0 件

4. `pnpm --filter @kanbun/skam-canvas-renderer test:run`
   合格条件: 失敗 0 件

5. `pnpm typecheck`
   合格条件: 失敗 0 件

6. `rg -n "range ruby|tateten\\+kaeri|highlight\\+ref|saidoku" packages -g "*cross-renderer*test.ts"`
   合格条件: 固定4ケースが test 名として確認できる

## 判定証跡テンプレート（PR 記載）

1. 実行コマンド一覧（1-6）
2. 各コマンドの結果（pass/fail）
3. 固定4ケースの同値テスト結果
4. 未達項目がある場合の理由と是正計画

## 反証条件（見直し条件）

次のいずれかが起きた場合、ADR-021 を再評価する。

- AIR 導入で既存表示互換を維持できないケースが継続的に発生する
- Resolver の抽象化コストが高く、変更局所性が改善しない
- クロスレンダラー同値テストが実運用で有効に機能しない

## 影響

### ポジティブ

- 仕様変更時の実装重複が減る
- HTML/Canvas 間の意味乖離を早期に検出できる
- Phase4 以降の IR 中心最適化へ進みやすくなる

### ネガティブ

- 移行期間は AIR と既存モデルの橋渡し実装が必要
- 初期はテストと型の更新量が増える

## 今回やらないこと（非目標）

- 公開 API の破壊的変更
- Canvas の Pass2/Pass3 レイアウト・描画アルゴリズム再設計
- HTML の CSS 仕様再定義
- `calibrateGridBaseline` 測定アルゴリズムの変更

## 参考

- `packages/skam-html-renderer/src/build-render-tree.ts`
- `packages/skam-canvas-renderer/src/render-tree.ts`
- `packages/skam/src/rendering/index.ts`
