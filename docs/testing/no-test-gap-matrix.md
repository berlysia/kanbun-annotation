# No Test-Gap 移行対応表

運用規約: [ADR-022](../decisions/adr-022-semantic-and-visual-test-strategy-no-gap.md)

## Case ID マッピング

| case_id             | semantic テスト (cross-renderer-equivalence.test.ts の describe) | legacy テスト参照          |
| ------------------- | ---------------------------------------------------------------- | -------------------------- |
| ruby-range-core     | `cross-renderer equivalence: range ruby`                         | なし (migrated で削除済み) |
| tateten-kaeri-split | `cross-renderer equivalence: tateten+kaeri`                      | なし (migrated で削除済み) |
| highlight-ref-label | `cross-renderer equivalence: highlight+ref`                      | なし (migrated で削除済み) |
| saidoku-two-stage   | `cross-renderer equivalence: saidoku`                            | なし (migrated で削除済み) |

## 移行対応表

| case_id             | legacy_snapshot | semantic_test | visual_test | migration_state | owner    | last_verified_at |
| ------------------- | --------------- | ------------- | ----------- | --------------- | -------- | ---------------- |
| ruby-range-core     | no              | yes           | yes         | migrated        | berlysia | 2026-10-22       |
| tateten-kaeri-split | no              | yes           | yes         | migrated        | berlysia | 2026-10-22       |
| highlight-ref-label | no              | yes           | yes         | migrated        | berlysia | 2026-10-22       |
| saidoku-two-stage   | no              | yes           | yes         | migrated        | berlysia | 2026-10-22       |
