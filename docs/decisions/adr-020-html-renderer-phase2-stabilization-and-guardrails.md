# ADR-020: HTML Renderer Phase2 安定化（`tateten-sep` 名前参照化と依存制約の機械検証）

## ステータス

Accepted

関連 ADR: [ADR-019](adr-019-html-renderer-colocation-and-named-grid-areas.md), [ADR-013](adr-013-baseline-compatibility-check.md)

## コンテキスト

### Phase1 完了評価（2026-02-14 時点）

`ADR-019` の受け入れ条件に対して、次を確認した。

- 構造分離到達:
  - `render-config.ts`, `html-utils.ts`, `mark-utils.ts`
  - `token-renderer.ts`, `render-display-layer.ts`
- 逆依存除去:
  - `build-render-tree.ts` / `render-tree.ts` から `renderer.ts` import が 0 件
- テスト import 整合:
  - `src/__tests__` から `../renderer.js` import が 0 件
- CSS 名前参照化（Phase1 対象 6 コンテナ）:
  - `suffix-row`, `ruby-grid`, `ruby-grid--emphasis`, `ruby-grid--emphasis-no-ruby`, `saidoku-grid`, `saidoku-grid--emphasis`
- 回帰安全性:
  - `pnpm --filter @kanbun/skam-html-renderer test:run` 成功（423 tests passed）
  - `pnpm --filter @kanbun/skam-html-renderer typecheck` 成功

この結果から、Phase1 は「構造再編の主目標」を達成済みと判定できる。

### Phase2 の課題定義

Phase1 完了後も、次の3点が「壊れやすさ」として残る。

1. `tateten-sep` が数値 index 依存の重ね配置を維持している
2. `shared -> display -> api` の依存方向制約が CI で強制されていない
3. CSS テストが slot 意味論を十分に固定していない

この3点は Option C（全面再設計）を待たずに閉じるべき「運用負債」である。

## 用語定義

- slot 意味論: grid の行・列番号ではなく、意味名（`base`, `ruby`, `kaeri` 等）で配置意図を表す方式
- 依存方向制約: `shared -> display -> api` の単方向 import 規律
- 必須ゲート: 未達時に Phase2 完了判定を不可とする最小条件

## 検討した選択肢

### Option A: Phase1 で停止

- 利点: 追加コストなし
- 欠点: 破壊点（`tateten-sep` 数値依存、依存規律の運用依存）が残る

### Option B: Phase2 安定化を先行

- 利点: 公開仕様を維持したまま壊れやすさを下げられる
- 利点: Option C の前に土台品質を固定できる
- 欠点: 追加実装と検証が必要

### Option C: Option C（全面再設計）へ即時移行

- 利点: 理想形へ早く近づける
- 欠点: 変更面が広く、原因分離と回帰判定の再現性が落ちる

## 判断軸（重み付き）

| 判断軸           | 重み | 合格判定の客観基準                       |
| ---------------- | ---- | ---------------------------------------- |
| 壊れにくさ       | 30   | `tateten-sep` が意味名ベースで配置される |
| 規律の自動化     | 25   | 依存方向違反を CI が機械的に失敗させる   |
| 判定再現性       | 20   | 実行コマンドと期待結果が文書化される     |
| 互換安全性       | 15   | 既存 API と表示仕様の回帰がない          |
| 実行コスト妥当性 | 10   | 変更範囲が Phase2 スコープ内に閉じる     |

### 選択肢スコア（1-5）

計算式:

`総合点(0-100) = Σ(重み * 評点 / 5)`

| Option | 壊れにくさ 30 | 規律の自動化 25 | 判定再現性 20 | 互換安全性 15 | 実行コスト妥当性 10 | 総合点 |
| ------ | ------------- | --------------- | ------------- | ------------- | ------------------- | ------ |
| A      | 1             | 1               | 2             | 5             | 5                   | 44     |
| B      | 5             | 5               | 5             | 4             | 4                   | 95     |
| C      | 4             | 4               | 2             | 2             | 1                   | 60     |

判定ルール:

- 総合点 90 点以上を採択目安とする
- かつ「規律の自動化」「互換安全性」は必須ゲート（未達なら不採択）

`Option B` のみが閾値と必須ゲートを同時に満たす。

## 決定

**Option B（Phase2 安定化）を採用する。**

### Phase2 スコープ

1. `tateten-sep` の配置を意味名参照へ移行
2. 依存方向制約を CI で機械検証
3. CSS slot 意味論テストを追加

### `tateten-sep` 命名規約（Phase2 で固定）

- 行名は `sep-spacer-start`, `sep-tateten-start`, `sep-kaeri-start`, `sep-end` を使用する
- `tateten-mark` と `kaeriten` の配置は上記行名参照で表現する
- `tateten-sep` ブロック内で `grid-row: <number>` 形式を新規導入しない

### 設計原則（不変条件）

1. 公開 API と表示仕様は変更しない
2. baseline 補正契約（`calibrateGridBaseline` と `--*-grid-baseline-fix`）は維持する
3. 「番号を消す」より「意味を固定する」を優先する
4. 完了判定は人の解釈でなくコマンド結果で行う

## 実施プロトコル（順序固定）

1. Step 1: ベースライン取得
2. Step 2: `tateten-sep` の意味名化
3. Step 3: 依存方向制約の CI 実装
4. Step 4: CSS 意味論テスト追加
5. Step 5: 回帰実行と完了判定

Step 2 を完了する前に Step 3-4 へ進まない。  
Step 3 または Step 4 が未達なら Step 5 で完了判定しない。

## 受け入れ条件

- `tateten-sep` が named lines または同等の名前参照で配置される
- `check:deps` スクリプトで `shared -> display -> api` 依存方向違反を検出できる
- CI が `check:deps` を実行し、違反時に失敗する
- 対象 7 コンテナの slot 対応を検証するテストが存在する
- `calibrateGridBaseline` 補正経路（変数設定/参照）が回帰しない
- `pnpm --filter @kanbun/skam-html-renderer test:run` と `pnpm typecheck` が成功する

## 完了判定手順（誰がやっても同じ判定にする）

次を上から順に実行し、1つでも未達なら「未完了」とする。

1. `rg -n "from './renderer\\.js'" packages/skam-html-renderer/src/build-render-tree.ts packages/skam-html-renderer/src/render-tree.ts packages/skam-html-renderer/src/token-renderer.ts`
   合格条件: 出力 0 件

2. `pnpm --filter @kanbun/skam-html-renderer test:run`
   合格条件: 失敗 0 件

3. `pnpm typecheck`
   合格条件: 失敗 0 件

4. `rg -n "sep-spacer-start|sep-tateten-start|sep-kaeri-start|sep-end" packages/skam-html-renderer/src/styles.ts`
   合格条件: 上記4つの行名が `tateten-sep` 配置定義に出現する

5. `pnpm --filter @kanbun/skam-html-renderer run check:deps`
   合格条件: 現行コードで成功する

6. `rg -n "check:deps|pnpm --filter @kanbun/skam-html-renderer run check:deps" .github/workflows`
   合格条件: CI ワークフローに `check:deps` 実行が存在する

## 反証条件（この決定を見直す条件）

次のいずれかが発生した場合は ADR-020 を再評価する。

- `tateten-sep` の意味名化で表示互換が維持できないケースが複数確認される
- 依存方向制約の CI 化で、正常系開発コストが恒常的に増大する
- CSS 意味論テストを導入しても回帰検出率が改善しない

## 影響

### ポジティブ

- 変更時の破壊点が減り、仕様変更と構造変更を切り分けやすくなる
- 依存規律を運用ではなく機械判定で維持できる
- レビュー担当者に依存しない完了判定が可能になる

### ネガティブ

- 初期導入で CI ルール整備とテスト保守コストが増える
- `tateten-sep` の移行は検証ケース追加を伴う

## 完了時点で残る作業（Phase3 以降）

- 内部 IR 中心への再設計（Option C 本体）
- HTML / Canvas 内部モデル統合
- テスト資産全体の意味論化（既存スナップショット依存の段階的削減）

## 今回やらないこと（非目標）

- 公開 API の破壊的変更
- 表示仕様（見た目）そのものの再定義
- `calibrateGridBaseline` 測定アルゴリズムの再設計
- HTML renderer 全面再実装

## 参考

- `packages/skam-html-renderer/src/styles.ts`
- `packages/skam-html-renderer/src/render-display-layer.ts`
- `packages/skam-html-renderer/src/token-renderer.ts`
- `packages/skam-html-renderer/src/calibrate.ts`
