# No Test-Gap 移行対応表

運用規約: [ADR-022](../decisions/adr-022-semantic-and-visual-test-strategy-no-gap.md)

## Case ID マッピング

| case_id             | semantic テスト (cross-renderer-equivalence.test.ts の describe) | legacy テスト参照                                                 |
| ------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| ruby-range-core     | `cross-renderer equivalence: range ruby`                         | `legacy-detector.test.ts` の `[legacy][case:ruby-range-core]`     |
| tateten-kaeri-split | `cross-renderer equivalence: tateten+kaeri`                      | `legacy-detector.test.ts` の `[legacy][case:tateten-kaeri-split]` |
| highlight-ref-label | `cross-renderer equivalence: highlight+ref`                      | `legacy-detector.test.ts` の `[legacy][case:highlight-ref-label]` |
| saidoku-two-stage   | `cross-renderer equivalence: saidoku`                            | `legacy-detector.test.ts` の `[legacy][case:saidoku-two-stage]`   |

## 移行対応表

| case_id             | legacy_snapshot | semantic_test | visual_test | migration_state | owner    | last_verified_at |
| ------------------- | --------------- | ------------- | ----------- | --------------- | -------- | ---------------- |
| ruby-range-core     | yes             | yes           | yes         | dual            | berlysia | 2026-02-15       |
| tateten-kaeri-split | yes             | yes           | yes         | dual            | berlysia | 2026-02-15       |
| highlight-ref-label | yes             | yes           | yes         | dual            | berlysia | 2026-02-15       |
| saidoku-two-stage   | yes             | yes           | yes         | dual            | berlysia | 2026-02-15       |
