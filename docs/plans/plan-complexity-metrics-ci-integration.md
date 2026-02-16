# Complexity Metrics CI 統合（Phase 1）

## 概要

oxlint の `eslint/complexity` ルールを warn レベル（max: 20）で導入し、`pnpm lint` で高複雑度関数を検出可能にする。

関連 ADR: [ADR-027](../decisions/adr-027-complexity-metrics-ci-integration.md)

## 前提知識

- 各パッケージの `lint` スクリプトは `oxlint src` を実行（turbo 経由）
- oxlint はカレントディレクトリから上位に `.oxlintrc.json` を探索する
- `skam-html-renderer` のみ `-c .oxlintrc.json` でローカル設定を明示指定

## 実装計画

### Step 1: ルート `.oxlintrc.json` の作成

プロジェクトルートに `.oxlintrc.json` を作成し、`eslint/complexity` ルールを追加する。

```json
{
  "rules": {
    "eslint/complexity": ["warn", { "max": 20 }]
  }
}
```

これにより `-c` オプションなしで `oxlint src` を実行する全パッケージに自動適用される。

### Step 2: `skam-html-renderer/.oxlintrc.json` への追加

`skam-html-renderer` は `-c .oxlintrc.json` でローカル設定を使用するため、ルートの設定は適用されない。ローカル設定に `eslint/complexity` ルールを追加する。

### Step 3: turbo.json の inputs 更新

lint タスクの inputs に `.oxlintrc.json` を追加し、設定変更時にキャッシュが無効化されるようにする。

### Step 4: 動作確認

`pnpm lint` を実行し、高 CC 関数に対して warning が出力されることを確認する。

### Step 5: ADR に Plan リンクを追加

ADR-027 に Plan への双方向リンクを追加する。

## リスクと軽減策

| リスク                                  | 影響度 | 軽減策                                            |
| --------------------------------------- | ------ | ------------------------------------------------- |
| warn 大量出力で他の lint 結果が見づらい | 低     | Phase 1 では warn のみ。ADR-024〜026 完了後に削減 |

## 検証方法

- `pnpm lint` が成功する（warn は CI fail にならない）
- `validateMark` 等の既知の高 CC 関数に対して warning が出力される

<!-- validated -->
