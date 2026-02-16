# ADR-004 Plan 検証結果: 不合格

## 検証日時

2026-02-16

## 検証方法

logic-validator agent による ADR-004 と対応 Plan の論理的整合性検証

## 検証対象ファイル

- ADR: `docs/decisions/adr-004-kaeri-re-anchor-convention.md`
- Plan: `docs/plans/plan-kaeri-re-anchor-convention.md`

---

## 致命的問題

### 1. ADR と Plan の決定内容が根本的に乖離

**ADR-004 の決定**: 全 kaeri marks を anchor-based から position-based に変更

```json
// 変更前
{ "type": "kaeri", "anchor": { "from": "t5", "to": "t5" }, "value": "レ" }
// 変更後
{ "type": "kaeri", "position": { "blockId": "b1", "after": "t5" }, "value": "レ" }
```

**Plan の実施内容**: レ点のアンカー先トークンを上→下に変更（anchor-based のまま）

```json
// Plan が実装するもの（anchor-based を維持）
{ "type": "kaeri", "anchor": { "from": "下token", "to": "下token" }, "value": "レ" }
```

### 2. ADR で却下済みの選択肢を Plan が実装

ADR-004 は選択肢 A「anchor のアンカー先を下のトークンに統一」を以下の理由で却下している:

> 根本的に「トークン属性ではない」問題が残る

しかし Plan はまさにこの却下された選択肢 A を実装する内容になっている。

### 3. 影響範囲テーブルと Plan の矛盾

ADR の影響範囲テーブルに含まれている変更:

| ADR が要求する変更 | Plan の対応 |
|---|---|
| `packages/skam/src/index.ts` — KaeriMark: AnchoredMark → PositionedMark | **「変更しない」と明記** |
| `packages/skam/src/validator.ts` — kaeri の検証ロジック | 言及なし |
| `packages/skam-xml-parser/` — anchor 生成 → position 生成 | **「変更しない」と明記** |
| `packages/skam-xml-stringify/` — position → XML 配置 | **「変更しない」と明記** |

---

## 重大な問題

### 4. 段階的実装の記述なし

Plan に「Phase 1」「Phase 2」等の段階的実装の記述がない。部分実装であるという説明もなく、ADR-004 の完全な実装計画として提示されている。

### 5. ファイル名からの推測

ADR ファイル名 `adr-004-kaeri-re-anchor-convention.md` は「レ点アンカー慣例」を示しており、ADR タイトル「position-based mark に変更」とは異なる。ADR が当初は選択肢 A で作成され、後から選択肢 D に変更された可能性がある。Plan はその変更に追随していない。

---

## 推奨対応

以下のいずれかを選択する必要がある:

### Option A: Plan を ADR の決定に合わせて再作成

position-based への変更を実装する計画に書き換える。型定義変更、パーサー/stringify コード変更を含める。

### Option B: ADR を Plan の内容に差し戻す

選択肢 A（アンカー先を下に統一）を採用する決定に変更する。ただし ADR 本文で選択肢 A を却下している論拠との矛盾を解消する必要がある。

### Option C: 段階的実装を明示

- 現 Plan を Phase 1（アンカー先変更、anchor-based 維持）として再定義
- Phase 2（position-based 移行）の計画を別途作成
- ADR に段階的実装の方針を追記
