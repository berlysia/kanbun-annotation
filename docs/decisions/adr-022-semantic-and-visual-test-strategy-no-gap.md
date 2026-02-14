# ADR-022: 意味スロット/見た目の二層テスト戦略と No Test-Gap 移行規約

## ステータス

Accepted

関連 ADR: [ADR-019](adr-019-html-renderer-colocation-and-named-grid-areas.md), [ADR-020](adr-020-html-renderer-phase2-stabilization-and-guardrails.md), [ADR-021](adr-021-phase3-shared-annotation-ir.md)

実装計画: [Plan](../plans/plan-semantic-and-visual-test-strategy-no-gap.md)

## コンテキスト

Phase3 では AIR（意味解決）の統合に合わせて、テストの主眼を文字列一致から意味同値へ移す必要がある。  
一方で、移行途中に HTML/CSS の legacy snapshot を先行削除すると、見た目回帰の検出が空白化する。

本 ADR は、この空白を発生させないために「意味」と「見た目」を明確に分離し、削除条件を機械判定できる形で固定する。

## 用語定義

- 意味テスト: AIR のスロット/境界/集約結果を検証するテスト
- 見た目テスト: DOM/CSS/描画結果の視覚契約を検証するテスト
- legacy snapshot: 既存の HTML/CSS 文字列スナップショット系テスト
- No Test-Gap: 任意のケースで有効な回帰検出手段が 0 になる期間を作らない原則

## 前提（固定）

- 本 ADR はテスト戦略と移行運用の規約のみを扱い、renderer の公開 API は変更しない
- semantic テストの意味同値定義は ADR-021 の AIR 定義に従う
- visual テストは意味同値の代替ではなく、視覚契約の検証に限定する

## 検討した選択肢

### Option A: 意味テストへ全面移行（見た目系を縮小）

- 利点: テスト保守コストが下がる
- 欠点: レイアウト/スタイル回帰の検出力が低下する

### Option B: 見た目系を維持（意味系は補助）

- 利点: 視覚回帰に強い
- 欠点: 仕様意図（意味スロット）の破壊を見逃しやすい

### Option C: 二層戦略（意味 + 見た目）+ No Test-Gap 移行ゲート

- 利点: 仕様意味と視覚結果を同時にカバーできる
- 利点: 移行中の検出空白を防止できる
- 欠点: 運用ルールと CI ゲート設計が必要

## 判断モデル（再現可能）

### 1. 必須ゲート

次のいずれかを満たさない案はスコア計算前に不採択とする。

1. 視覚保全: 固定代表ケース 4 件に visual テストが存在する
2. 空白防止: `legacy_snapshot = no` を CI が機械拒否できる

### 2. 重み付きスコア

計算式: `総合点(0-100) = Σ(重み * 評点 / 5)`

| 判断軸     | 重み | 採点入力（客観証跡）                      |
| ---------- | ---- | ----------------------------------------- |
| 意味保全   | 30   | 固定代表ケース 4 件の semantic テスト有無 |
| 視覚保全   | 30   | 固定代表ケース 4 件の visual テスト有無   |
| 空白防止   | 25   | No Test-Gap CI ゲート + 対応表整合性      |
| 運用再現性 | 15   | 状態遷移規約・証跡テンプレート・確認事項  |

### 3. 採点ルーブリック（1/3/5）

| 判断軸     | 1点                     | 3点                        | 5点                                                    |
| ---------- | ----------------------- | -------------------------- | ------------------------------------------------------ |
| 意味保全   | semantic が未整備       | 固定代表ケースの一部のみ   | 固定代表ケース 4 件すべてを semantic で実行            |
| 視覚保全   | visual が未整備         | 固定代表ケースの一部のみ   | 固定代表ケース 4 件すべてを visual で実行              |
| 空白防止   | snapshot を任意削除可能 | ルールはあるが CI 強制なし | No Test-Gap を CI で機械拒否                           |
| 運用再現性 | 手順・証跡が未固定      | 手順のみ固定               | ケースID・状態遷移・証跡テンプレート・確認事項まで固定 |

採点上の補則:

- 2点/4点は使わない（1/3/5 のみを採用）
- 意見ではなく証跡で採点する
- 採点時点の証跡は PR に添付する

### 4. 選択肢スコア

| Option | 意味保全 30 | 視覚保全 30 | 空白防止 25 | 運用再現性 15 | 総合点 |
| ------ | ----------- | ----------- | ----------- | ------------- | ------ |
| A      | 5           | 1           | 1           | 1             | 44     |
| B      | 3           | 5           | 1           | 3             | 62     |
| C      | 5           | 5           | 5           | 5             | 100    |

判定ルール:

- 採択目安は総合点 90 点以上
- 必須ゲートを満たさない案は総合点にかかわらず不採択

`Option C` を採択する。

## 決定

**二層戦略（意味 + 見た目）を採用し、No Test-Gap を移行規約として強制する。**

### テストレイヤ構成（固定）

1. `semantic` レイヤ: AIR スロット/境界/集約の同値性を検証
2. `visual` レイヤ: HTML/CSS/描画の視覚契約を検証
3. `legacy-snapshot` レイヤ（移行期間限定）: 既存ケースの保険として維持し、ケース単位で縮退

## 運用仕様（No Test-Gap）

### ケースID規約

- 形式: `{domain}-{slug}`
- 例: `ruby-range-basic`, `tateten-kaeri-split`, `highlight-ref-label`
- 禁止: `semantic-...` / `visual-...` のようなレイヤ名プレフィックス

`case_id` は「ケース（仕様シナリオ）」を識別する。  
レイヤ有無は列（`legacy_snapshot` / `semantic_test` / `visual_test`）で管理する。

### 移行対応表（単一の正本）

- 配置先: `docs/testing/no-test-gap-matrix.md`
- 1行1ケースで次を保持:
  - `case_id`
  - `legacy_snapshot` (`yes/no`)
  - `semantic_test` (`yes/no`)
  - `visual_test` (`yes/no`)
  - `migration_state` (`legacy-only` / `sem-ready` / `dual` / `migrated`)
  - `owner`
  - `last_verified_at` (`YYYY-MM-DD`)

### 状態不変条件（機械判定対象）

| migration_state | legacy_snapshot | semantic_test | visual_test |
| --------------- | --------------- | ------------- | ----------- |
| legacy-only     | yes             | no            | no          |
| sem-ready       | yes             | yes           | no          |
| dual            | yes             | yes           | yes         |
| migrated        | no              | yes           | yes         |

不変条件違反の行が 1 件でもある場合、CI は失敗とする。

### 許可される状態遷移

`legacy-only -> sem-ready -> dual -> migrated`

遷移規約:

1. スキップ遷移は禁止
2. 後退遷移は禁止
3. `legacy_snapshot` を `yes -> no` に変更できるのは `dual -> migrated` のときだけ

### No Test-Gap 判定式

- `migration_state = migrated` の許可条件: `semantic_test = yes AND visual_test = yes`
- `legacy_snapshot = no` の許可条件: `semantic_test = yes AND visual_test = yes`

## 移行プロトコル（ケース単位）

1. 対象 `case_id` を 1 件選び、対応表が `legacy-only` であることを確認
2. semantic テストを追加し、対応表を `sem-ready` に更新
3. visual テストを追加し、対応表を `dual` に更新
4. CI で `semantic/visual/legacy` を通す
5. legacy snapshot を削除し、対応表を `migrated` に更新
6. PR に判定証跡を添付してマージ申請

1 ケースでも手順 2-4 が未達なら手順 5 は実行不可。

## 受け入れ条件

- `semantic` と `visual` が CI 必須ジョブとして定義されている
- No Test-Gap ゲートが CI 必須ジョブとして定義されている
- `docs/testing/no-test-gap-matrix.md` が存在し、全行が状態不変条件を満たす
- 固定代表ケース 4 件が `dual` または `migrated` である

### 固定代表ケース（必須）

1. `ruby-range-core`（複数トークン集約 + span）
2. `tateten-kaeri-split`（レ/非レ分割）
3. `highlight-ref-label`（グループ参照ラベル）
4. `saidoku-two-stage`（二段読み + 第二送り）

## 判断軸と検証手段の対応

| 判断軸     | 検証手段                                         | 合格条件           |
| ---------- | ------------------------------------------------ | ------------------ |
| 意味保全   | 対応表で固定代表 4 件の `semantic_test` を確認   | 4/4 が `yes`       |
| 視覚保全   | 対応表で固定代表 4 件の `visual_test` を確認     | 4/4 が `yes`       |
| 空白防止   | CI 定義 + 対応表整合性チェック                   | 失敗時にマージ不可 |
| 運用再現性 | 状態遷移・証跡テンプレート・確認事項を PR で確認 | 未記載項目 0 件    |

## 完了判定手順（再現可能）

1. `rg -n "semantic|test:semantic" packages -g "package.json"`  
   合格条件: semantic 実行系が定義されている
2. `rg -n "visual|test:visual" packages -g "package.json"`  
   合格条件: visual 実行系が定義されている
3. `rg -n "no-test-gap|migration-gate|snapshot-gate" .github/workflows packages -g "*.{yml,yaml,sh,ts,js,json}"`  
   合格条件: No Test-Gap ゲート実装が存在する
4. `test -f docs/testing/no-test-gap-matrix.md`  
   合格条件: 対応表ファイルが存在する
5. `pnpm --filter @kanbun/skam-html-renderer test:run`  
   合格条件: 失敗 0 件
6. `pnpm --filter @kanbun/skam-canvas-renderer test:run`  
   合格条件: 失敗 0 件
7. `pnpm typecheck`  
   合格条件: 失敗 0 件

## レビュー確認事項（PR 必須）

1. 対象 `case_id` は 1 PR で 1 件か
2. `migration_state` が許可遷移のみで更新されているか
3. `legacy_snapshot` の `yes -> no` は `dual -> migrated` か
4. 固定代表ケースの `semantic_test` が 4/4 `yes` か
5. 固定代表ケースの `visual_test` が 4/4 `yes` か
6. `owner` が空でないか
7. `last_verified_at` が `YYYY-MM-DD` か
8. 完了判定コマンド 1-7 の結果を添付したか
9. 例外規約を使う場合、期限と解除条件を明記したか

## 判定証跡テンプレート（PR 記載）

1. 置換対象 `case_id`
2. 変更前状態 / 変更後状態
3. 追加した semantic テスト
4. 追加した visual テスト
5. 削除した legacy snapshot
6. 対応表更新内容
7. 完了判定コマンド（1-7）と結果
8. 例外適用の有無（有の場合は期限と解除条件）

## 例外規約（限定）

次をすべて満たす場合のみ、legacy snapshot 維持を一時延長できる。

1. visual テスト基盤側の技術的制約で代替不能
2. 期限付き（具体的な日付を PR に明記）
3. 解除条件（どの状態になったら例外解除か）を明記
4. 代替計画（semantic + visual をいつ揃えるか）を明記

## 完了時点で残る作業（理想形への差分）

本 ADR の完了は「No Test-Gap 運用の成立」であり、「legacy snapshot の全面廃止」ではない。  
理想形（legacy 0）までの残作業は次の通り。

1. 対応表の `legacy-only` / `sem-ready` / `dual` 行を `migrated` へ段階的に移行
2. 固定代表ケース以外の高リスクケースを優先順付きで移行計画化
3. visual テスト基盤の更新頻度と flakiness を定量監視し、運用基準を確立

## 今回やらないこと（非目標）

- visual テスト基盤の全面刷新
- renderer 公開 API の変更
- 判定精度向上を超えたパフォーマンス最適化

## 反証条件（見直し条件）

次のいずれかが発生した場合、ADR-022 を再評価する。

- semantic + visual の二層維持が継続困難な運用コストになる
- No Test-Gap ゲートが実運用で形骸化する
- 視覚回帰の検出率が改善しない

## 参考

- `packages/skam-html-renderer/src/__tests__/css-slot-semantics.test.ts`
- `packages/skam/src/rendering/__tests__/build-annotation-ir.test.ts`
- `packages/skam-canvas-renderer/src/__tests__/integration.test.ts`
