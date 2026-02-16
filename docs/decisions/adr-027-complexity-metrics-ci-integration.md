---
status: Accepted
---

# ADR-027: Complexity Metrics CI 統合

## コンテキスト

[構造解析レポート（2026-02-16）](../structure-analysis-2026-02-16.md)で、プロジェクト全体の品質は優秀（総合 1.9/5）だが、一部の関数が高複雑度（CC 28〜48）を維持していることが判明した。現在、複雑度メトリクスの継続的な監視は行われておらず、リファクタリング（ADR-024〜026）の効果測定や今後の複雑度劣化の早期検出ができない。

### 現在の CI 構成

- `pnpm typecheck` — 型チェック
- `pnpm test` — テスト実行
- `pnpm lint` — oxlint によるリント
- `check:deps` — 依存方向検証（ADR-020 で導入）
- 複雑度メトリクスの測定・閾値チェックは **未導入**

### 目的

1. **リファクタリング効果の定量測定**: ADR-024〜026 の前後で CC/MI を比較
2. **複雑度劣化の早期検出**: 新規コードの CC が閾値を超えた場合に CI で警告
3. **品質ダッシュボード**: 保守性指標の可視化（PR コメント等）

## 検討した選択肢

### Option A: oxlint の complexity ルール活用

- oxlint の `eslint/complexity` ルール（max CC 閾値）を有効化
- 利点: 既存ツールチェインに統合。追加依存なし
- 欠点: 関数単位の CC のみ。MI やファイル単位メトリクスは取得不可。既存の高 CC 関数を一括で無視設定する必要がある

### Option B: 専用メトリクスツール導入

- `typhonjs-escomplex` / `ts-complex` / `plato-ts` 等の専用ツールを devDependencies に追加
- 利点: CC, MI, LoC, Halstead メトリクスを包括的に取得可能
- 欠点: 追加依存。メンテナンス状況の確認が必要

### Option C: カスタムスクリプト

- TypeScript AST を直接走査して CC を計算するスクリプトを自作
- 利点: プロジェクト固有の要件に完全対応
- 欠点: 開発・メンテナンスコスト

## 決定

**Option A を最優先で導入し、Option B を段階的に追加する。**

### Phase 1: oxlint complexity ルール（P0 と同時に導入）

```jsonc
// oxlint の設定に追加
{
  "rules": {
    "eslint/complexity": ["warn", { "max": 20 }],
  },
}
```

- 閾値 20 で **warn**（CI は fail させない）
- 既存の高 CC 関数は ADR-024〜026 で段階的に削減するため、`// oxlint-ignore` ではなく warn レベルで許容
- ADR-024〜026 完了後に閾値を 15 に引き下げ、error レベルに変更

### Phase 2: メトリクスレポート（P2）

- 専用ツールで詳細メトリクス（CC, MI, Halstead）を PR コメントに出力
- ツール選定は Phase 1 運用後に決定
- GitHub Actions の `pull_request` トリガーで実行

### 閾値設計

| フェーズ             | CC 閾値 | レベル | 対象         |
| -------------------- | :-----: | ------ | ------------ |
| Phase 1（P0 並行）   |   20    | warn   | 全パッケージ |
| Phase 1（P0 完了後） |   15    | error  | 全パッケージ |
| Phase 2              |   12    | error  | 全パッケージ |

## 受け入れ条件

### Phase 1

- oxlint の `eslint/complexity` ルールが設定に追加されている
- `pnpm lint` で高 CC 関数に対して warning が出力される
- CI パイプラインで lint が実行されている（既存）

### Phase 2（将来）

- PR コメントに CC/MI メトリクスが自動出力される
- 閾値超過時にレビュー必須マークが付与される

## 影響

### ポジティブ

- 複雑度の継続的監視が可能になる
- リファクタリング効果を定量的に確認できる
- 新規コードの複雑度劣化を早期に検出できる

### ネガティブ

- Phase 1: 既存の高 CC 関数で warn が大量に出る移行期間がある
- Phase 2: CI 実行時間が若干増加する

## 参考

- [構造解析レポート 2026-02-16](../structure-analysis-2026-02-16.md)
- [ADR-024](adr-024-validator-complexity-reduction.md)
- [ADR-025](adr-025-xml-serialization-complexity-reduction.md)
- [ADR-026](adr-026-renderer-layout-complexity-reduction.md)
