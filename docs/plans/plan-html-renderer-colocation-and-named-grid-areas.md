# HTML Renderer コロケーション再編 + CSS Grid 名前参照化

## 概要

`@kanbun/skam-html-renderer` の内部を「単方向依存 + コロケーション」に再編し、`styles.ts` の grid 配置を数値 index 依存から名前参照に移行する。  
目的は、担当者が変わっても同じ判断・同じ実装結果に収束する状態を作ること。

関連 ADR: [ADR-019](../decisions/adr-019-html-renderer-colocation-and-named-grid-areas.md)

## 前提知識

### 現在の主要ファイル

- `packages/skam-html-renderer/src/renderer.ts`
- `packages/skam-html-renderer/src/build-render-tree.ts`
- `packages/skam-html-renderer/src/render-tree.ts`
- `packages/skam-html-renderer/src/render-tree-types.ts`
- `packages/skam-html-renderer/src/styles.ts`

### 互換要件

- 公開 API (`render`, `renderHTML`, `generateCSS`) を維持
- HTML 契約（主要 class/data 属性）を維持
- 既存見た目仕様（ADR-014/015）を維持

## 品質目標と判断軸（採点表）

| 軸                 | 配点 | 合格基準（機械判定可能）                                           |
| ------------------ | ---- | ------------------------------------------------------------------ |
| 単方向依存         | 30   | Pass 1 / Pass 2 が `renderer.ts` を import しない                  |
| コロケーション     | 20   | token 描画責務が API 層から分離され display 層に集約               |
| CSS 名前参照化     | 25   | 対象 grid が `grid-template-areas` または named lines で配置される |
| 回帰安全性         | 15   | パッケージテストと型チェックが通る                                 |
| 可読性・引き継ぎ性 | 10   | README/Plan に責務境界と命名規約を明記                             |

**完了判定**: 合計 90 点以上。  
**必須ゲート**: 「単方向依存」「回帰安全性」は 0 点なら即不合格。

## 実施プロトコル（順序固定）

1. Step 1 のベースライン取得前に実装変更をしない
2. Step 2-4 は依存方向の整理を先に完了し、Step 5 の CSS 移行に入る
3. Step 5 は対象 grid を 1 コンテナずつ移行して都度テストする
4. Step 6 で再発防止（検証ルールと文書化）を追加して完了

## 実装計画

### Step 1: ベースライン固定

対象:

- `packages/skam-html-renderer/src/__tests__/renderer.test.ts`
- `packages/skam-html-renderer/src/__tests__/build-render-tree.test.ts`
- `packages/skam-html-renderer/src/__tests__/ruby-grid.test.ts`
- `packages/skam-html-renderer/src/__tests__/line-break.test.ts`

作業:

- 現行テストを実行し、移行前ベースラインを記録
- CSS 文字列テストのうち「行番号そのもの」を見ている箇所を特定

検証コマンド:

- `pnpm --filter @kanbun/skam-html-renderer test`

完了条件:

- テストが全通過し、後続比較に使う基準が確定している

### Step 2: 共通基盤の分離（逆依存除去）

対象:

- `packages/skam-html-renderer/src/renderer.ts`
- `packages/skam-html-renderer/src/build-render-tree.ts`
- `packages/skam-html-renderer/src/render-tree.ts`
- 新規: `packages/skam-html-renderer/src/render-config.ts`
- 新規: `packages/skam-html-renderer/src/html-utils.ts`

作業:

- `RenderProfile`, `RubyMethod` を `render-config.ts` へ抽出
- `escapeHtml`, `shouldApplyTateChuYoko`, `generateEmphasisMarks` を `html-utils.ts` へ抽出
- Pass 1 / Pass 2 から `renderer.ts` への import を除去

検証コマンド:

- `rg -n "from './renderer\\.js'" packages/skam-html-renderer/src/build-render-tree.ts packages/skam-html-renderer/src/render-tree.ts`

完了条件:

- 上記 `rg` が 0 件
- 単体テストが通る

### Step 3: token 描画責務のコロケーション

対象:

- `packages/skam-html-renderer/src/renderer.ts`
- `packages/skam-html-renderer/src/render-tree.ts`
- 新規: `packages/skam-html-renderer/src/token-renderer.ts`

作業:

- `renderToken` とその下位ヘルパーを `token-renderer.ts` へ移動
- Pass 2 は `token-renderer.ts` を直接参照
- API 層（`renderer.ts`）から token 詳細描画実装を除去

検証コマンド:

- `rg -n "function renderToken|function renderTokenWithRuby|function renderSaidokuToken" packages/skam-html-renderer/src/renderer.ts`

完了条件:

- 上記 `rg` が 0 件
- `renderer.ts` が API 合成中心の構造になっている

### Step 4: display オーケストレーション分離

対象:

- `packages/skam-html-renderer/src/renderer.ts`
- 新規: `packages/skam-html-renderer/src/render-display-layer.ts`
- `packages/skam-html-renderer/src/build-render-tree.ts`
- `packages/skam-html-renderer/src/render-tree.ts`

作業:

- `renderDisplayLayer` を `render-display-layer.ts` に抽出
- group 解決と context 構築を API 層から分離
- `renderer.ts` は公開 API と option 正規化のみ担当

検証コマンド:

- `rg -n "function renderDisplayLayer" packages/skam-html-renderer/src`

完了条件:

- `renderer.ts` に display 内部実装が残らない
- import 方向が `shared -> display -> api` で一貫する

### Step 5: CSS Grid 名前参照化（対象固定）

対象:

- `packages/skam-html-renderer/src/styles.ts`

対象コンテナ（この順で移行）:

1. `suffix-row`
2. `ruby-grid`
3. `ruby-grid--emphasis`
4. `ruby-grid--emphasis-no-ruby`
5. `saidoku-grid`
6. `saidoku-grid--emphasis`

命名規約（固定）:

- `ruby`, `ruby-over`, `ruby-under`
- `base`
- `suffix`
- `emphasis`
- `okuri`, `kutoten`, `kaeri`, `saidoku`
- `baseline`（baseline 補正用途の予約スロット）

変換マッピング（固定）:

| コンテナ                      | 変換後の area 定義                                       |
| ----------------------------- | -------------------------------------------------------- |
| `suffix-row`                  | `"okuri" / "kutoten" / "kaeri" / "saidoku"`              |
| `ruby-grid`                   | `"ruby suffix" / "base ." / "baseline ."`                |
| `ruby-grid--emphasis`         | `"emphasis ." / "ruby suffix" / "base ." / "baseline ."` |
| `ruby-grid--emphasis-no-ruby` | `"emphasis ." / "base suffix" / "baseline ."`            |
| `saidoku-grid`                | `"ruby-over" / "base" / "ruby-under"`                    |
| `saidoku-grid--emphasis`      | `"emphasis" / "ruby-over" / "base" / "ruby-under"`       |

作業ルール:

- 1 コンテナ移行ごとにテスト実行して次へ進む
- 重なり配置が必要なケースは named lines を許可（意味名必須）
- `tateten-sep` の行跨ぎ重ね配置は本ステップの対象外（別途 Phase 2）

検証コマンド:

- `pnpm --filter @kanbun/skam-html-renderer test -- ruby-grid.test.ts line-break.test.ts`
- `rg -n "grid-row:\\s*[0-9]|grid-column:\\s*[0-9]" packages/skam-html-renderer/src/styles.ts`

完了条件:

- 対象コンテナの配置が名前参照中心
- 視覚仕様が回帰していない

### Step 6: 再発防止と文書化

対象:

- `packages/skam-html-renderer/src/__tests__/`（必要なら新規）
- `packages/skam-html-renderer/README.md`

作業:

- 依存逆流禁止の確認手順をテスト/チェックに組み込む
- 内部構造（shared/display/api）と命名規約を README に追記

検証コマンド:

- `pnpm --filter @kanbun/skam-html-renderer test`
- `pnpm typecheck`

完了条件:

- 手順書なしでも、README + Plan だけで同じ移行を再実行できる

## リスクと軽減策

| リスク                           | 影響度 | 軽減策                                                         |
| -------------------------------- | ------ | -------------------------------------------------------------- |
| 分離途中で import 循環が発生     | 高     | Step 2 完了時点で `rg` による逆依存検査を必須化                |
| 名前参照化で縦書き位置がずれる   | 高     | 1 コンテナずつ移行し、`ruby-grid.test.ts` と目視確認を都度実施 |
| CSS テストが実装詳細依存で壊れる | 中     | 行番号ではなく「slot 意味」のアサーションへ更新                |
| 差分が大きくレビュー不能になる   | 中     | Step ごとの分割コミットを前提に進行                            |

## 検証方法

### 自動テスト

1. `pnpm --filter @kanbun/skam-html-renderer test`
2. `pnpm typecheck`

### 手動確認

1. `pnpm --filter @kanbun/playground dev`
2. 縦書き・横書きで確認:
   - ruby / saidoku / suffix-row の整列
   - highlight + emphasis 共存時の線位置
   - tateten + yomigana + suffix 抽出

### 最終受け入れチェック

- 単方向依存ゲートを満たす
- 対象 grid が名前参照化される
- 公開 API と表示仕様が回帰しない
- 品質目標の採点表で 90 点以上

## 受け入れ条件チェックリスト（実行用）

以下を上から順に確認し、1つでも未達なら「未完了」と判定する。

| #   | 条件                | 実行/確認方法                                                                                                                        | 合格条件                                                                 |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------- | --------- |
| 1   | 逆依存除去          | `rg -n "from './renderer\\.js'" packages/skam-html-renderer/src/build-render-tree.ts packages/skam-html-renderer/src/render-tree.ts` | 出力 0 件                                                                |
| 2   | token 責務分離      | `rg -n "function renderToken                                                                                                         | function renderTokenWithRuby                                             | function renderSaidokuToken" packages/skam-html-renderer/src/renderer.ts` | 出力 0 件 |
| 3   | display 分離        | `rg -n "function renderDisplayLayer" packages/skam-html-renderer/src`                                                                | `renderer.ts` 以外に実装が存在                                           |
| 4   | CSS 名前参照化      | `styles.ts` の対象6コンテナを確認                                                                                                    | 対象コンテナが `grid-template-areas` または named lines で配置           |
| 5   | 数値 index 依存削減 | `rg -n "grid-row:\\s\*[0-9]                                                                                                          | grid-column:\\s\*[0-9]" packages/skam-html-renderer/src/styles.ts`       | 対象6コンテナで数値依存が残っていない                                     |
| 6   | 自動テスト          | `pnpm --filter @kanbun/skam-html-renderer test`                                                                                      | 成功                                                                     |
| 7   | 型チェック          | `pnpm typecheck`                                                                                                                     | 成功                                                                     |
| 8   | 手動確認            | Playground で縦横確認                                                                                                                | 主要3観点（ruby/suffix, highlight+emphasis, tateten+yomigana）が回帰なし |
| 9   | 文書更新            | `README.md` 確認                                                                                                                     | shared/display/api と命名規約が記載されている                            |
| 10  | 最終採点            | 本 Plan の採点表                                                                                                                     | 90 点以上かつ必須ゲート達成                                              |

## PR記載テンプレート（確認漏れ防止）

PR には最低限、次を記載する。

1. 実行コマンド一覧
2. テスト/型チェック結果
3. 受け入れ条件チェックリストの達成状況（1-10）
4. 未確認項目がある場合の理由とフォロー計画

## 完了時点での残作業（Option C 向け）

本 Plan 完了時に、次の残件を「次フェーズ候補」として残す。  
完了報告では、各残件に対して「着手条件」と「担当フェーズ」を記録する。

| 残件                                           | 着手条件                                        | 想定フェーズ |
| ---------------------------------------------- | ----------------------------------------------- | ------------ |
| `tateten-sep` 等の重ね配置の全面名前参照化     | Step 5 完了後に視覚回帰テスト基盤が安定している | Phase 2      |
| import 逆依存禁止の CI 化（lint/ルール）       | Step 2-4 の構成が確定している                   | Phase 2      |
| 仕様テストの意味論化（過度な文字列一致の縮小） | 主要回帰ケースが固定済み                        | Phase 2      |
| 内部 IR/描画 API の再設計（Option C 本体）     | Option B の運用実績でボトルネックが明確         | Phase 3      |
| HTML / Canvas 内部モデル統合検討               | 各 renderer の責務境界が安定                    | Phase 3      |

## 今回やらないこと（スコープ境界）

以下は本 Plan の完了条件に含めない。

- 公開 API の互換を壊す変更
- マーク仕様や見た目仕様の再設計
- Option C の全面再実装
- Canvas renderer への波及改修
- パフォーマンス改善のみを目的にした内部置換
