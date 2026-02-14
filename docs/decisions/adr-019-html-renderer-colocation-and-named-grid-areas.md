# ADR-019: HTML Renderer のコロケーション再編と CSS Grid 名前参照化

## ステータス

Accepted

実装計画: [Plan](../plans/plan-html-renderer-colocation-and-named-grid-areas.md)

関連 ADR: [ADR-005](adr-005-restructure-display-layer-rendering.md), [ADR-006](adr-006-group-tree-rendering-restructure.md), [ADR-007](adr-007-implement-group-tree-rendering.md), [ADR-014](adr-014-line-break-control.md), [ADR-015](adr-015-emphasis-highlight-layout-order.md)

## コンテキスト

`@kanbun/skam-html-renderer` は 2-pass 構成（Pass 1: `build-render-tree.ts`, Pass 2: `render-tree.ts`）へ移行済みだが、次の構造課題が残っている。

- `renderer.ts` に API、補助関数、token 描画、display オーケストレーションが同居
- Pass 1 / Pass 2 が `renderer.ts` を参照し、依存が「下位 -> 上位」に逆流
- `styles.ts` の grid 配置が数値 index（`grid-row: 1..N`, `grid-column: 1..N`）中心で、行追加・並び替え時に壊れやすい
- `calibrateGridBaseline` と `--*-grid-baseline-fix` による baseline 補正契約が inline-grid 群の前提になっており、grid 移行でこの経路を壊せない
- 同リポジトリの Canvas renderer は `renderer -> layout(オーケストレータ) -> analysis/columns/placement` の責務分離へ移行済みであり、HTML renderer だけが責務分割規律の例外になっている

問題の本質は「仕様の複雑さ」ではなく「構造と表現の曖昧さ」である。  
同じ修正でも、担当者によって変更点と判断がぶれやすく、再現性が低い。

## 用語定義

- 基盤層: 型・純粋ヘルパー（HTML エスケープ等）。他層を参照しない
- display 層: render tree 構築/描画と token 描画
- API 層: `render`/`renderHTML`/`generateCSS` の公開入口
- 名前参照: `grid-template-areas` または named lines による意味名指定
- 数値 index 参照: `grid-row: 1/2/...` `grid-column: 1/2/...` の行番号依存指定

## 検討した選択肢

### Option A: 現構成維持 + 局所抽出

- 利点: 差分が小さい
- 欠点: 逆依存と責務混在が残り、再現性改善が限定的

### Option B: レイヤ再編 + 名前参照へ段階移行

- 利点: 依存方向を固定できる
- 利点: 「関心が近い実装」を物理的に近づけられる
- 利点: CSS 配置を意味名で説明でき、判断軸を共有できる
- 利点: Canvas renderer の既存パターンと整合し、パッケージ横断で理解負荷を下げられる
- 欠点: 初期の移行差分は増える

### Option C: renderer 全面再実装

- 利点: 理想形を一気に導入できる
- 欠点: 退行リスクと検証コストが過大

## 判断軸（重み付き）

| 判断軸       | 重み | 判定方法（客観）                                 |
| ------------ | ---- | ------------------------------------------------ |
| 単方向依存   | 30   | Pass 1 / Pass 2 が API 層を import しない        |
| 変更局所性   | 20   | token/display/API の修正が責務単位で分離される   |
| CSS 耐破壊性 | 20   | 対象 grid が意味名ベースで配置される             |
| 再現可能性   | 20   | 手順と合否条件が文書化され、担当者差を抑制できる |
| 移行安全性   | 10   | 段階移行し、各段でテスト可能                     |

### 選択肢スコア（1-5）

| Option | 単方向依存 30 | 変更局所性 20 | CSS 耐破壊性 20 | 再現可能性 20 | 移行安全性 10 | 合計 |
| ------ | ------------- | ------------- | --------------- | ------------- | ------------- | ---- |
| A      | 2             | 2             | 1               | 2             | 5             | 210  |
| B      | 5             | 4             | 5               | 5             | 4             | 470  |
| C      | 4             | 5             | 5               | 3             | 1             | 390  |

`Option B` が最も高い。特に本件の主目的（再現可能性と判断軸共有）に対して優位。

## 決定

**Option B を採用する。**

1. 依存方向を `基盤 -> display -> API` に固定する
2. display 構築/描画と token 描画をコロケーションする
3. CSS 配置を数値 index 中心から名前参照中心へ移行する
4. 段階移行で毎段テストし、公開 API と表示仕様を維持する

### 目標アーキテクチャ（Option B 完了時）

- API 層: `renderer.ts`（公開 API と option 正規化）
- display オーケストレータ層: `render-display-layer.ts`（group 解決、Pass 1/Pass 2 呼び出し）
- display 実装層:
  - Pass 1: `build-render-tree.ts`
  - Pass 2: `render-tree.ts`
  - token 描画: `token-renderer.ts`
- 共通基盤層:
  - `render-config.ts`（`RenderProfile`, `RubyMethod`）
  - `html-utils.ts`（`escapeHtml` 等の純粋関数）
  - `mark-utils.ts`（`getBlockStartMarks` など mark 解決の純粋関数）

この構成は Canvas renderer の「公開 API -> オーケストレータ -> 下位レイヤ」という責務分割に合わせる。

## 設計原則（不変条件）

1. 公開 API シグネチャは変更しない
2. HTML 契約（主要 class/data 属性）は維持する
3. Pass 1 / Pass 2 から API 層へ逆参照しない
4. grid 配置の意味は「行番号」ではなく「slot 名」で表現する
5. 例外（行跨ぎ・重ね配置）が必要な場合も named lines で意味名を付与する
6. baseline 補正契約（`calibrateGridBaseline` + `--*-grid-baseline-fix`）を維持する
7. 1 ステップごとに自動テストで回帰確認する

## 反証条件（この決定を見直す条件）

次のいずれかを満たした場合、ADR を再評価する。

- 名前参照化によって既存表示仕様を維持できないケースが複数発生する
- 依存方向固定により、公開 API の互換維持よりも大きなコストが継続的に発生する
- テスト容易性・変更局所性が実測で改善しない

## 影響

### ポジティブ

- 判断軸を共有しやすく、実装者間で同じ結論に収束しやすい
- 変更範囲が責務境界に沿って限定される
- CSS の意味が読みやすく、行追加・順序変更で壊れにくい

### ネガティブ

- 移行初期はファイル移動・import 更新の差分が増える
- CSS 文字列アサーションの一部を更新する必要がある

## 受け入れ条件

- `build-render-tree.ts` / `render-tree.ts` が `renderer.ts` を import していない
- package 内テストの import 先が新責務境界に整合している（旧 `renderer.ts` 依存を内部 helper 目的で残さない）
- 公開 API テストが回帰していない
- 対象 grid（`suffix-row`, `ruby-grid`, `ruby-grid--emphasis`, `ruby-grid--emphasis-no-ruby`, `saidoku-grid`, `saidoku-grid--emphasis`）が名前参照中心で配置されている
- `calibrateGridBaseline` の補正経路（`--*-grid-baseline-fix` 参照）が維持されている
- `pnpm --filter @kanbun/skam-html-renderer test` と `pnpm typecheck` が成功する

## 確認事項（判定証跡）

受け入れ判定は、以下の証跡が揃っていることを前提とする。

| 観点               | 確認方法                                                                                                                             | 証跡                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| 逆依存なし         | `rg -n "from './renderer\\.js'" packages/skam-html-renderer/src/build-render-tree.ts packages/skam-html-renderer/src/render-tree.ts` | 出力 0 件                                                  |
| テスト import 整合 | `rg -n "from '../renderer\\.js'" packages/skam-html-renderer/src/__tests__`                                                          | `renderer.ts` 由来の内部 helper 依存が解消されている diff  |
| API 互換           | 既存 API テスト実行                                                                                                                  | `@kanbun/skam-html-renderer` のテストログ                  |
| CSS 名前参照化     | `styles.ts` の対象コンテナ定義確認                                                                                                   | `grid-template-areas` または named lines が確認できる diff |
| baseline 補正契約  | `styles.ts` と `calibrate.ts` を確認                                                                                                 | `--*-grid-baseline-fix` の参照と設定が維持される diff      |
| 型整合             | `pnpm typecheck`                                                                                                                     | typecheck 成功ログ                                         |
| 仕様回帰なし       | 主要レンダリングテスト + 手動確認                                                                                                    | テスト成功ログ + Playground 確認メモ                       |

確認結果は PR 説明に最低限「実行コマンド」「結果」「未確認項目の有無」を記録する。

## 完了時点で残る作業（Option C への橋渡し）

本 ADR の完了は「Option B の到達点」であり、Option C（理想形）に向けて次の残件を意図的に残す。

| 残作業                                                          | 今回残す理由                                    | Option C での到達目標                            | 状況                                     |
| --------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------ | ---------------------------------------- |
| `tateten-sep` 等の複雑な重ね配置領域の全面名前参照化            | 表示回帰リスクが高く、段階分離が必要            | grid 全体で数値 index 依存を原則撤廃             | **ADR-020 で解決** (named lines 化)      |
| renderer 内部 API の再設計（より純粋な IR 中心設計）            | 公開 API 互換を優先し、内部互換層を維持するため | 入出力契約を明確化した内部 IR と純粋描画層へ統合 | 未着手                                   |
| import 方向制約の自動検証（CI ルール化）                        | まずは手順・チェックリストで運用するため        | lint/CI で逆依存を機械的に失敗させる             | **ADR-020 で解決** (check:deps CI)       |
| HTML/CSS 仕様テストの意味論ベース化（スナップショット依存削減） | 既存テスト資産を維持しつつ移行するため          | 「構造と意味」を検証する安定テストへ移行         | **ADR-020 で部分解決** (slot テスト追加) |
| HTML renderer / Canvas renderer の内部モデル統合検討            | スコープ拡大を避けるため                        | 表現層差分を吸収できる共有モデルを定義           | 未着手                                   |

これらは「未実施」ではなく「今回スコープ外」として管理する。ADR-020 で解決済みの項目は Phase3 (Option C) で再検討の必要はない。

## 今回やらないこと（明示的非目標）

次は本 ADR の受け入れ完了条件を満たしても実施しない。

- 公開 API の破壊的変更
- マーク解決ロジックや表示仕様（見た目）の再定義
- HTML renderer 全面再実装（Option C の一括実施）
- Canvas renderer 側のアーキテクチャ変更
- `calibrateGridBaseline` 検知アルゴリズムの再設計
- パフォーマンス最適化を主目的とした内部アルゴリズム変更

## 参考

- 実装計画: [plan-html-renderer-colocation-and-named-grid-areas.md](../plans/plan-html-renderer-colocation-and-named-grid-areas.md)
- `packages/skam-html-renderer/src/renderer.ts`
- `packages/skam-html-renderer/src/build-render-tree.ts`
- `packages/skam-html-renderer/src/render-tree.ts`
- `packages/skam-html-renderer/src/styles.ts`
