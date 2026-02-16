# Logic Validation Report: ADR Execution Harness 計画

## 検証結果: **通過（軽微な改善提案あり）**

計画は全体的に論理的に一貫しており、実装可能です。ただし、いくつかの改善可能な点と潜在的なエッジケースが存在します。

---

## 1. frontmatter スキーマ設計の評価

### ✅ 良い点

- `status`, `deps`, `plan` の3フィールドで基本的なトラッキングは可能
- シンプルで機械処理しやすい

### ⚠️ 問題点とエッジケース

#### 1.1 ADR-015のようなサブステータスの扱いが不明確

**現状のADR-015**:

```
HTML レンダラー: **Done** (アプローチ 5 + no-ruby バリアント)
Canvas レンダラー: In Progress
```

**提案されたfrontmatter**:

```yaml
status: Accepted # または InProgress? Complete?
```

**問題**: frontmatter の `status` フィールドは単一値（Proposed/Accepted/InProgress/Complete）だが、ADR-015は実装が2つのレンダラーで進捗が異なる。計画では「frontmatter は全体ステータス、本文のセクションで管理」とあるが、**これが機械処理可能な形でないため、以下のツールで問題が発生**:

- **adr-status.ts**: 全体ステータス `InProgress` と表示するが、実際には半分完了している情報が失われる
- **adr-deps.ts**: ADR-015 が完全に完了していないため、依存している ADR が actionable にならない可能性（実際には HTML 部分だけなら進められる）

**推奨改善**:

- frontmatter に `substatus` フィールドを追加するか、本文のサブステータスを構造化コメント（`<!-- substatus: HTML=Done, Canvas=InProgress -->`）で記述し、パーサーが読み取れるようにする
- または、ADR-015 を ADR-015a (HTML) と ADR-015b (Canvas) に分割する方針を検討

**計画への影響**:

- マイグレーションスクリプトで ADR-015 のような複合ステータスを検出し、どちらの値を frontmatter に入れるかのルールが必要
- ツールが substatus を考慮しない場合、依存マップの精度が落ちる

---

#### 1.2 ステータス変換の曖昧さ

**現状のADR ステータス表現の実例**:

```
- "Accepted (実装完了)"
- "Accepted (Phase 1 完了 — Phase 2 以降は ADR-006 に移管)"
- "Complete（Phase A: テスト拡充、Phase B: ツリー再構築 — ADR-007 で実装完了）"
- "Accepted（検証完了・実装方針修正済み）"
```

**マイグレーションスクリプトの変換ロジック** (Step 3):

```
- `Complete` / `Done` を含む → `Complete`
- `In Progress` を含む → `InProgress`
- `Accepted` を含む → `Accepted`
- `Proposed` を含む → `Proposed`
```

**問題**:

- "Accepted (実装完了)" → `Accepted` に変換されるが、実際は `Complete` が正しい（"実装完了" の情報が失われる）
- "Complete（Phase A...）" → `Complete` に変換されるが、フェーズ情報の喪失
- 括弧内の qualifier 情報（"検証完了", "実装方針修正済み"）が全て失われる

**推奨改善**:

- マイグレーションスクリプトに優先順位をつける:
  ```typescript
  if (
    statusText.includes('Done') ||
    statusText.includes('実装完了') ||
    statusText.includes('Complete')
  ) {
    return 'Complete';
  } else if (statusText.includes('In Progress')) {
    return 'InProgress';
  } else if (statusText.includes('Accepted')) {
    return 'Accepted';
  } // ...
  ```
- または、`--dry-run` で全変換結果を表示し、手動レビューで調整する（計画に含まれているが、自動化の精度が低いと手動修正が大量発生）

---

#### 1.3 「実装計画」と「関連 ADR」リンクの frontmatter 移行

**計画の記述** (Step 3):

```
3. `実装計画:` 行から plan ファイル名を抽出
5. `## ステータス` セクション（次の `##` まで）を削除
```

**問題**:

- `実装計画: [Plan](../plans/plan-xxx.md)` は `## ステータス` セクション内にある（ADR-001, ADR-015 等で確認）
- `関連 ADR:` も `## ステータス` セクション直下にある（ADR-019 等で確認）
- **これらを frontmatter に移行せずにセクションごと削除すると、情報が完全に失われる**

**計画の Step 3 には以下がある**:

> 2. `関連 ADR:` 行から deps を抽出 (`ADR-(\d{3})` パターン)
> 3. `実装計画:` 行から plan ファイル名を抽出

**しかし、Step 3 の「本文側の変更」には明記されていない**:

> **本文側の変更:**
>
> - `## ステータス` セクション → 削除（frontmatter に移行）
> - `実装計画: [Plan](...)` → frontmatter の `plan` フィールドに移行
> - `関連 ADR: [...]` → frontmatter の `deps` に移行

**検証**: 計画は一応正しいが、**Step 3 の処理順序が不明確**。以下の順序を明確にすべき:

1. `## ステータス` セクションから status, 実装計画, 関連ADR を抽出
2. frontmatter を生成
3. `## ステータス` セクションを削除

---

## 2. マイグレーションの安全性

### ✅ 良い点

- `--dry-run` / `--write` の2段階実行は安全
- Step 3 の変換ロジックは基本的に正しい

### ⚠️ リスク

#### 2.1 情報損失リスク

**現状**:

- ADR-015: サブステータス（HTML/Canvas 個別進捗）
- ADR-006: "Complete（Phase A...）" のフェーズ詳細
- ADR-005: "Accepted (Phase 1 完了 — Phase 2 以降は ADR-006 に移管)" の移管情報
- ADR-008: "Accepted（検証完了・実装方針修正済み）" の補足情報

**frontmatter 移行後**:

- これらの qualifier 情報は本文に残らない限り失われる
- 計画では「本文のセクションで管理」とあるが、`## ステータス` セクションを削除するため、**削除前に重要情報を別セクションに移動する処理が必要**

**推奨改善**:

- マイグレーションスクリプトで、括弧内の qualifier を `## 備考` セクションに移動する
- または、frontmatter に `notes` フィールドを追加して補足情報を保持する

---

#### 2.2 「関連 ADR」の双方向リンク整合性

**ADR-019 の例**:

```
関連 ADR: [ADR-005](...), [ADR-006](...), [ADR-007](...), [ADR-014](...), [ADR-015](...)
```

**frontmatter 変換後**:

```yaml
deps: [5, 6, 7, 14, 15]
```

**問題**: 「deps は前提 ADR」という定義だが、実際の「関連 ADR」が常に「前提（依存）」を意味するとは限らない。

**実例確認が必要なケース**:

- ADR-019 → ADR-015 の参照: ADR-015 は emphasis/highlight のレイアウト順変更。ADR-019 は HTML renderer のコロケーション再編。**ADR-019 が ADR-015 に依存している（ADR-015 が前提）のか、単に関連しているだけなのか？**
- ADR-021 → ADR-022 の参照（双方向）: ADR-021 の「関連 ADR」に ADR-022 があり、ADR-022 の「関連 ADR」にも ADR-021 がある。これは**循環依存なのか、並列関係なのか？**

**推奨改善**:

- マイグレーション前に全ADRの「関連 ADR」を精査し、「前提（deps）」と「単なる関連（related）」を区別する
- または、frontmatter に `deps` と `related` の2フィールドを用意する

---

## 3. 依存方向の定義は正しいか？

### ✅ 計画の定義

> `deps: [5, 6, 7]` は「ADR-5, 6, 7 が前提」を意味する

### ⚠️ 実態との不一致の可能性

**ADR-021 と ADR-022 の相互参照**:

```
ADR-021: 関連 ADR: ADR-022
ADR-022: 関連 ADR: ADR-021
```

**これは**:

- 循環依存（どちらも実装できない）→ **バグ**
- または、並列関係（どちらも独立して実装可能）→ **deps ではなく related**

**adr-deps.ts の依存マップ出力時**:

- 循環依存を検出できるか？
- Mermaid グラフで循環を可視化できるか？

**推奨改善**:

- マイグレーション時に循環依存を検出し、警告を出す
- または、既存ADRの「関連 ADR」が本当に「前提」を意味するのか、ユーザーに確認を求める

---

## 4. Node.js ネイティブ TS 実行の制約

### ✅ 計画の実装方針

> Node 24 で `.ts` ファイルを `node scripts/xxx.ts` で直接実行する前提

### ✅ 制約への対応

**計画のコード例を確認**:

- `type AdrStatus = 'Proposed' | 'Accepted' | 'InProgress' | 'Complete';` → Union type（OK）
- `interface AdrFrontmatter` → OK
- `import type` の使用は言及なし（型定義ファイルなので問題ない）

**Node.js type-stripping の制約**:

- enum 不可 → 計画では Union type を使用（✅）
- import type 必須 → 計画に明記なし（実装時の注意事項として追加すべき）
- decorators, namespace, parameter properties 不可 → 計画に該当コードなし（✅）

**推奨改善**:

- 実装計画に「import type を使用すること」を明記する
- または、実装時のチェックリストに追加する

---

## 5. 実装順序の依存関係

### ✅ 計画の順序

```
1. types.ts + adr-parser.ts（コアライブラリ）
2. adr-migrate-fm.ts（マイグレーション。dry-run で確認後に実行）
3. 既存ADR 27件のマイグレーション実行 + TEMPLATE更新
4. adr-status.ts + package.json スクリプト追加
5. adr-deps.ts + package.json スクリプト追加
6. adr-session.md スキル作成
7. knip.config.ts 更新
```

### ✅ 依存関係

- 2 は 1 に依存 → ✅
- 4, 5, 6 は 1 に依存 → ✅
- 4, 5, 6 は 3（マイグレーション完了）に依存 → ✅（frontmatter が存在しないとパース失敗）

**問題なし**。ただし、**Step 3 の実行が失敗した場合のロールバック手順が不明**。

**推奨改善**:

- マイグレーション前に `git stash` または別ブランチでの作業を推奨する記述を追加
- または、スクリプトに `--backup` フラグを追加し、変更前のファイルをバックアップする

---

## 6. 見落としている要件やエッジケース

### 6.1 TEMPLATE.md の更新でワークフローが壊れないか？

**計画のTEMPLATE更新** (Step 3):

```yaml
---
status: Proposed
---
# ADR-NNN: {タイトル}

## コンテキスト
...
```

**問題**:

- 現在のTEMPLATEには `## ステータス` セクションがある
- これを削除すると、**過去の慣習で `## ステータス` を手動で書いていた人が混乱する**
- または、既存のADR作成ワークフロー（コピペ）が壊れる

**推奨改善**:

- TEMPLATEのコメントに移行理由と新しい書き方を明記する
- または、CLAUDE.md / MEMORY.md に「frontmatter 導入後は `## ステータス` セクションを書かない」を追記する

---

### 6.2 セッション継続性の仕組みは十分か？

**adr-session スキルの機能** (Step 6):

```
**セッション終了リマインド:**
スキル内で「セッション終了時は `/session-memo` でメモを残すこと」をガイダンスに含める
```

**問題**:

- `/session-memo` は別スキルに依存している（計画に明記なし）
- `.tmp/session-memos/` のファイル命名規則や検索ロジックが不明
- ADR番号とメモファイルの紐付け方法が不明（ファイル名に ADR 番号を含める？タグ？）

**推奨改善**:

- session-memo の命名規則を決める（例: `.tmp/session-memos/adr-019-session-2026-02-16.md`）
- adr-session スキルで過去のメモを検索する際の検索パターンを明確にする

---

### 6.3 Planファイルが存在しない場合の挙動

**計画の型定義** (Step 1):

```typescript
interface AdrInfo {
  planExists: boolean; // plan ファイルが実在するか
  planValidated: boolean; // <!-- validated --> マーカーがあるか
}
```

**adr-status の出力例** (Step 4):

```
| Plan       | Phase          |
| ---------- | -------------- |
| exists     | implementation |
| -          | investigation  |
```

**問題**:

- `planValidated` は `planExists = true` の場合のみ有効だが、**Plan ファイルが存在しないのに frontmatter に `plan: plan-xxx.md` が記述されている場合の挙動が不明**
- adr-status で `-` と表示されるが、これは「Plan不要」なのか「Planが未作成」なのか区別できない

**推奨改善**:

- adr-status の出力を `missing` / `exists (not validated)` / `exists (validated)` の3状態に分ける
- または、Plan ファイルが存在しない場合に警告を出す

---

### 6.4 依存マップの actionable 判定の精度

**adr-deps の actionable 判定** (Step 5):

```
deps が全て Complete のADR（= 今すぐ着手可能）を一覧表示。
```

**問題**:

- ADR-015 のようなサブステータスがある場合、全体ステータスは `InProgress` だが HTML 部分は完了している
- この場合、HTML renderer に依存する ADR は actionable と判定されるべきだが、frontmatter の `status: InProgress` だけを見ると actionable にならない

**推奨改善**:

- サブステータスを考慮した actionable 判定ロジックを追加する
- または、ADR-015 を分割する方針を採用する

---

## 7. 総合評価

### ✅ 強み

- 全体的な設計は論理的で実装可能
- ツール群の役割分担が明確
- frontmatter による機械処理化は正しい方向性
- 段階的な実装順序が適切

### ⚠️ 改善推奨事項（優先度順）

1. **必須**: マイグレーションスクリプトのステータス変換ロジックを改善（"実装完了" → `Complete` への優先順位付け）
2. **必須**: `## ステータス` セクション削除前に、実装計画と関連ADRリンクを frontmatter に抽出する処理順序を明確化
3. **推奨**: ADR-015 のようなサブステータスの扱いを決定（frontmatter に substatus 追加 or ADR 分割）
4. **推奨**: 「関連 ADR」が「前提（deps）」なのか「単なる関連（related）」なのかを精査
5. **推奨**: マイグレーション失敗時のロールバック手順を追加
6. **任意**: session-memo の命名規則と検索ロジックを明確化
7. **任意**: Plan ファイルが存在しない場合の警告機能を追加

### 🎯 次のアクション

この検証結果をユーザーに共有し、以下を確認:

1. ADR-015 のようなサブステータスをどう扱うか（分割 or substatus フィールド追加）
2. 「関連 ADR」の全27件を精査し、deps と related を区別する必要があるか
3. マイグレーション前の手動レビュー範囲（ステータス変換の妥当性確認）

**結論**: 計画は実装可能だが、上記の改善を適用することで、より堅牢で保守性の高いツールになる。
