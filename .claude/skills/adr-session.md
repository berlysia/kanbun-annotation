---
name: adr-session
description: Start or resume an ADR implementation session
trigger: /adr-session
---

# ADR Session

Start or resume a focused session for working on an ADR.

## Usage

- `/adr-session` — Show status overview and recommend next ADR
- `/adr-session NNN` — Start session for specific ADR (e.g., `/adr-session 019`)

## Workflow

### With ADR number specified

1. **Show status**: Run `node scripts/adr-status.ts`
2. **Read ADR**: Read `docs/decisions/adr-{NNN}-*.md` and summarize
3. **Check dependencies**: If `deps` in frontmatter, verify all are `Complete`. Warn if any are not
4. **Check phase** and provide guidance:
   - `investigation`: "調査セッション。コンテキストを理解し、必要ならADRのステータスをAcceptedに更新してください"
   - `planning`: "Plan作成セッション。Plan Modeを使用してください。テンプレート: docs/plans/TEMPLATE.md"
   - `validation`: "Plan検証セッション。logic-validatorで検証してください"
   - `implementation`: "実装セッション。Planに従って実装してください"
   - `done`: "このADRは完了済みです"
5. **Find related memos**: Search `.tmp/session-memos/` for files mentioning `ADR-{NNN}`
6. **Reminder**: "セッション終了時は `/session-memo` でメモを残してください"

### Without ADR number

1. **Show status**: Run `node scripts/adr-status.ts`
2. **Show actionable**: Run `node scripts/adr-status.ts --actionable`
3. **Recommend**: Suggest the ADR that:
   - Has the fewest unresolved dependencies
   - Is independent (no deps or all deps Complete)
   - Is closest to completion (implementation > validation > planning > investigation)
4. **Reminder**: "作業するADRを選んで `/adr-session NNN` で開始してください"
