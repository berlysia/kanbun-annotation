<!-- validated -->

# HTML Renderer コロケーション再編 + CSS Grid 名前参照化

## 概要

`@kanbun-skam/skam-html-renderer` を「単方向依存 + 責務コロケーション」の構造へ再編し、`styles.ts` の grid 配置を数値 index 依存から名前参照へ移行する。  
公開 API と表示仕様は維持し、担当者が変わっても同じ判断に収束する実装手順を定義する。

関連 ADR: [ADR-019](../decisions/adr-019-html-renderer-colocation-and-named-grid-areas.md)

## 前提知識

### 現在の主要ファイル

- `packages/skam-html-renderer/src/renderer.ts`
- `packages/skam-html-renderer/src/build-render-tree.ts`
- `packages/skam-html-renderer/src/render-tree.ts`
- `packages/skam-html-renderer/src/render-tree-types.ts`
- `packages/skam-html-renderer/src/styles.ts`
- `packages/skam-html-renderer/src/calibrate.ts`

### 現在の課題

- API 層と内部描画ロジックが `renderer.ts` に混在
- Pass 1 / Pass 2 が `renderer.ts` を参照し、依存が逆流
- `build-render-tree.ts` が `getBlockStartMarks` を API 層経由で参照している
- CSS grid 配置が数値 index 中心で、構造変更時の耐破壊性が低い
- package 内テストの一部が `renderer.ts` の内部 helper に依存

### 互換要件

- 公開 API (`render`, `renderHTML`, `generateCSS`) は維持
- HTML 契約（主要 class/data 属性）は維持
- 既存見た目仕様（ADR-014/015）は維持
- baseline 補正契約（`calibrateGridBaseline` と `--*-grid-baseline-fix`）は維持

## ターゲットアーキテクチャ（Option B 完了時）

- API 層: `renderer.ts`
  - 公開 API、option 正規化、CSS 生成呼び出しのみ
- display オーケストレータ層: `render-display-layer.ts`
  - group 解決、Pass 1/Pass 2 呼び出し、block 単位合成
- display 実装層:
  - Pass 1: `build-render-tree.ts`
  - Pass 2: `render-tree.ts`
  - token 描画: `token-renderer.ts`
- 共通基盤層:
  - `render-config.ts`（`RenderProfile`, `RubyMethod`）
  - `html-utils.ts`（`escapeHtml` 等）
  - `mark-utils.ts`（`getBlockStartMarks` 等）

依存方向は `shared -> display -> api` の一方向に固定する。

## 品質目標と判断軸（採点表）

| 軸                 | 配点 | 合格基準（機械判定可能）                                     |
| ------------------ | ---- | ------------------------------------------------------------ |
| 単方向依存         | 30   | Pass 1 / Pass 2 が `renderer.ts` を import しない            |
| コロケーション     | 20   | token 描画責務が API 層から分離され display 層に集約         |
| CSS 名前参照化     | 25   | 対象 grid が `grid-template-areas` または named lines で配置 |
| 回帰安全性         | 15   | パッケージテストと型チェックが通る                           |
| 可読性・引き継ぎ性 | 10   | README/Plan に責務境界と命名規約を明記                       |

完了判定:

- 合計 90 点以上
- 必須ゲート: 「単方向依存」「回帰安全性」は未達なら不合格

## 実施プロトコル（順序固定）

1. Step 1 のベースライン取得前に実装変更しない
2. Step 2-4（依存方向整理）を完了してから Step 5（CSS 移行）へ進む
3. Step 5 は対象コンテナを 1 つずつ移行し、都度テストする
4. Step 6 で再発防止（チェックルールと文書）を確定して完了

## 実装計画

### Step 1: ベースライン固定

対象:

- `packages/skam-html-renderer/src/__tests__/renderer.test.ts`
- `packages/skam-html-renderer/src/__tests__/build-render-tree.test.ts`
- `packages/skam-html-renderer/src/__tests__/ruby-grid.test.ts`
- `packages/skam-html-renderer/src/__tests__/line-break.test.ts`

作業:

- 現行テストを実行し、移行前ベースラインを記録
- CSS テストのうち「行番号そのもの」に依存している箇所を抽出

確認コマンド:

- `pnpm --filter @kanbun-skam/skam-html-renderer test`

完了条件:

- テストが通過し、比較基準が確定している

### Step 2: 共通基盤分離と逆依存除去

対象:

- `packages/skam-html-renderer/src/renderer.ts`
- `packages/skam-html-renderer/src/build-render-tree.ts`
- `packages/skam-html-renderer/src/render-tree.ts`
- 新規: `packages/skam-html-renderer/src/render-config.ts`
- 新規: `packages/skam-html-renderer/src/html-utils.ts`
- 新規: `packages/skam-html-renderer/src/mark-utils.ts`

作業:

- `RenderProfile`, `RubyMethod` を `render-config.ts` へ抽出
- `escapeHtml`, `shouldApplyTateChuYoko`, `generateEmphasisMarks` を `html-utils.ts` へ抽出
- `getBlockStartMarks` を `mark-utils.ts` へ抽出
- Pass 1 / Pass 2 から `renderer.ts` 参照を除去
- package 内テストの `../renderer.js` 依存を新責務境界へ合わせて更新

確認コマンド:

- `rg -n "from './renderer\\.js'" packages/skam-html-renderer/src/build-render-tree.ts packages/skam-html-renderer/src/render-tree.ts`
- `rg -n "from '../renderer\\.js'" packages/skam-html-renderer/src/__tests__`

完了条件:

- 1つ目 `rg`: 0 件
- 2つ目 `rg`: 内部 helper 目的の依存が残っていない
- テストが通る

### Step 3: token 描画責務のコロケーション

対象:

- `packages/skam-html-renderer/src/renderer.ts`
- `packages/skam-html-renderer/src/render-tree.ts`
- 新規: `packages/skam-html-renderer/src/token-renderer.ts`

作業:

- `renderToken` 系実装を `token-renderer.ts` へ移動
- Pass 2 は token 描画を `token-renderer.ts` から参照
- `renderer.ts` から token 詳細描画実装を除去

確認コマンド:

- `rg -n "function renderToken|function renderTokenWithRuby|function renderSaidokuToken" packages/skam-html-renderer/src/renderer.ts`

完了条件:

- 上記 `rg` が 0 件
- `renderer.ts` が API 合成中心になっている

### Step 4: display オーケストレーション分離

対象:

- `packages/skam-html-renderer/src/renderer.ts`
- 新規: `packages/skam-html-renderer/src/render-display-layer.ts`
- `packages/skam-html-renderer/src/build-render-tree.ts`
- `packages/skam-html-renderer/src/render-tree.ts`

作業:

- `renderDisplayLayer` を `render-display-layer.ts` に抽出
- group 解決、context 構築、Pass 実行を API 層から分離
- `renderer.ts` は公開 API と option 正規化のみ担当

確認コマンド:

- `rg -n "function renderDisplayLayer" packages/skam-html-renderer/src`

完了条件:

- display 実装が `renderer.ts` から分離されている
- import 方向が `shared -> display -> api` で一貫する

### Step 5: CSS Grid 名前参照化

対象:

- `packages/skam-html-renderer/src/styles.ts`

対象コンテナ（順序固定）:

1. `suffix-row`
2. `ruby-grid`
3. `ruby-grid--emphasis`
4. `ruby-grid--emphasis-no-ruby`
5. `saidoku-grid`
6. `saidoku-grid--emphasis`

命名規約:

- `ruby`, `ruby-over`, `ruby-under`
- `base`
- `suffix`
- `emphasis`
- `okuri`, `kutoten`, `kaeri`, `saidoku`
- `baseline`（baseline 補正用途）

作業:

- 各コンテナを `grid-template-areas` または named lines へ置換
- 1 コンテナごとにテストして次へ進む
- `--*-grid-baseline-fix` の参照経路を維持し、placeholder の baseline 役割を slot 名として表現
- `tateten-sep` の行跨ぎ重ね配置は本 Step の対象外（Phase 2）

確認コマンド:

- `pnpm --filter @kanbun-skam/skam-html-renderer test -- ruby-grid.test.ts line-break.test.ts`

完了条件:

- 対象 6 コンテナが名前参照中心で配置される
- `calibrateGridBaseline` 適用時/未適用時で baseline 補正が機能する
- 視覚仕様が回帰していない

### Step 6: 再発防止と文書化

対象:

- `packages/skam-html-renderer/src/__tests__/`（必要なら追加）
- `packages/skam-html-renderer/README.md`

作業:

- 逆依存禁止の確認手順を検証フローに固定
- shared/display/api 境界と命名規約を README に記載

確認コマンド:

- `pnpm --filter @kanbun-skam/skam-html-renderer test`
- `pnpm typecheck`

完了条件:

- README + Plan だけで再実行可能な手順になっている

## リスクと軽減策

| リスク                                              | 影響度 | 軽減策                                                             |
| --------------------------------------------------- | ------ | ------------------------------------------------------------------ |
| 分離途中で import 循環が発生                        | 高     | Step 2 完了時点で `rg` による逆依存検査を必須化                    |
| 名前参照化で縦書き位置がずれる                      | 高     | 1 コンテナずつ移行し、`ruby-grid.test.ts` と目視確認を都度実施     |
| baseline 補正経路を壊して Chromium で縦位置が崩れる | 高     | `calibrate.ts` 連携（`--*-grid-baseline-fix`）を受け入れ条件に固定 |
| CSS テストが実装詳細依存で壊れる                    | 中     | 行番号依存ではなく「slot 意味」アサーションへ移行                  |
| 差分が大きくレビュー不能になる                      | 中     | Step ごとの分割コミット前提で進行                                  |

## 検証方法

### 自動テスト

1. `pnpm --filter @kanbun-skam/skam-html-renderer test`
2. `pnpm typecheck`

### 手動確認

1. `pnpm --filter @kanbun-skam/playground dev`
2. 縦書き・横書きで確認:
   - ruby / saidoku / suffix-row の整列
   - highlight + emphasis 共存時の線位置
   - tateten + yomigana + suffix 抽出
   - `calibrateGridBaseline` 実行有無で致命的な縦位置差分が出ない

## 受け入れ条件チェックリスト（実行用）

| #   | 条件                  | 実行/確認方法                                                                                                                                                                                                                                     | 合格条件                                                       |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | 逆依存除去            | `rg -n "from './renderer\\.js'" packages/skam-html-renderer/src/build-render-tree.ts packages/skam-html-renderer/src/render-tree.ts`                                                                                                              | 出力 0 件                                                      |
| 2   | テスト import 整合    | `rg -n "from '../renderer\\.js'" packages/skam-html-renderer/src/__tests__`                                                                                                                                                                       | 内部 helper 依存が残っていない                                 |
| 3   | token 責務分離        | `rg -n "function renderToken" packages/skam-html-renderer/src/renderer.ts && rg -n "function renderTokenWithRuby" packages/skam-html-renderer/src/renderer.ts && rg -n "function renderSaidokuToken" packages/skam-html-renderer/src/renderer.ts` | 出力 0 件                                                      |
| 4   | display 分離          | `rg -n "function renderDisplayLayer" packages/skam-html-renderer/src`                                                                                                                                                                             | display 実装が `renderer.ts` から分離されている                |
| 5   | CSS 名前参照化        | `styles.ts` の対象6コンテナを確認                                                                                                                                                                                                                 | 対象コンテナが `grid-template-areas` または named lines で配置 |
| 6   | API 回帰なし          | `pnpm --filter @kanbun-skam/skam-html-renderer test`                                                                                                                                                                                              | 成功                                                           |
| 7   | 型整合                | `pnpm typecheck`                                                                                                                                                                                                                                  | 成功                                                           |
| 8   | baseline 補正契約維持 | `styles.ts` + `calibrate.ts` を確認                                                                                                                                                                                                               | `--*-grid-baseline-fix` の設定/参照経路が維持される            |
| 9   | 手動確認              | Playground で縦横確認                                                                                                                                                                                                                             | 主要4観点で回帰なし                                            |
| 10  | 文書更新              | `README.md` 確認                                                                                                                                                                                                                                  | shared/display/api と命名規約が記載                            |
| 11  | 最終採点              | 本 Plan の採点表                                                                                                                                                                                                                                  | 90 点以上かつ必須ゲート達成                                    |

## PR記載テンプレート（確認漏れ防止）

1. 実行コマンド一覧
2. テスト/型チェック結果
3. チェックリスト達成状況（1-11）
4. 未確認項目がある場合の理由とフォロー計画

## 完了時点での残作業（Option C 向け）

| 残件                                           | 着手条件                          | 想定フェーズ |
| ---------------------------------------------- | --------------------------------- | ------------ |
| `tateten-sep` 等の重ね配置の全面名前参照化     | Step 5 完了後に視覚回帰基盤が安定 | Phase 2      |
| import 逆依存禁止の CI 化（lint/ルール）       | Step 2-4 の構成が確定             | Phase 2      |
| 仕様テストの意味論化（過度な文字列一致の縮小） | 主要回帰ケースが固定済み          | Phase 2      |
| 内部 IR/描画 API の再設計（Option C 本体）     | Option B 運用でボトルネックが明確 | Phase 3      |
| HTML / Canvas 内部モデル統合検討               | 各 renderer の責務境界が安定      | Phase 3      |

## 今回やらないこと（スコープ境界）

- 公開 API 互換を壊す変更
- マーク仕様や見た目仕様の再設計
- Option C の全面再実装
- Canvas renderer への波及改修
- パフォーマンス改善のみを目的とした内部置換
