# 二層テスト戦略と No Test-Gap 移行規約の実装

## 概要

ADR-022 で定義された semantic + visual の二層テスト戦略と No Test-Gap 移行規約を実装する。既存の cross-renderer-equivalence テストを semantic 層として認定し、Playwright VRT を visual 層として追加し、マトリクス整合性を CI ゲートで強制する。

関連 ADR: [ADR-022](../decisions/adr-022-semantic-and-visual-test-strategy-no-gap.md)

## 前提知識

- 既存の `packages/integration-tests/src/__tests__/cross-renderer-equivalence.test.ts` が固定4ケースの AIR レベル semantic 検証を提供
- `packages/skam-screenshot/` が Playwright ベースのスクリーンショットライブラリとして存在
- 固定4ケースの初期状態は `sem-ready`（semantic テスト既存のため）
- legacy snapshot は既存 toContain/toMatch テストをマトリクスに記録するのみ（コード変更なし）

## 実装計画

### Step 1: No Test-Gap マトリクスファイル作成

- `docs/testing/no-test-gap-matrix.md` を作成
- 固定4ケースを `sem-ready` 状態で初期化
- case_id とテスト名のマッピングセクションを冒頭に配置

### Step 2: Visual テスト (Playwright VRT) 実装

- `packages/integration-tests/` に Playwright VRT を実装
- skam-screenshot をライブラリとして呼び出し、4ケースのスクリーンショットを撮影・比較
- テストドキュメント定義を共有ヘルパーに抽出
- pixelmatch で threshold 付き画像比較
- 通常テスト (`test:run`) からは除外し、`test:visual` で独立実行

### Step 3: No Test-Gap CI ゲート実装

- 正規表現ベースの Markdown テーブルパーサーを作成
- 状態不変条件・固定4ケース存在・owner/日付形式を vitest テストで検証
- `test:run` で通常テストと一緒に実行

### Step 4: CI ワークフロー更新

- `.github/workflows/ci.yml` に `visual-test` ジョブを追加
- `test:semantic` / `test:visual` スクリプトを package.json に定義
- Playwright ブラウザインストールステップを含める

### Step 5: マトリクス状態更新 (sem-ready → dual)

- 4ケースの visual_test を yes、migration_state を dual に更新
- ADR-022 受け入れ条件の全達成を確認

## リスクと軽減策

| リスク                             | 影響度 | 軽減策                                                                                      |
| ---------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| VRT のフォント差異による flakiness | 中     | skam-screenshot のウェブフォント機構を活用、CI 環境のスクリーンショットをベースラインとする |
| Playwright CI 環境差異             | 中     | chromium のみに限定、`--with-deps` で依存もインストール                                     |
| マトリクス Markdown パースの脆さ   | 低     | パーサーのユニットテストで網羅、型安全な構造化データに変換                                  |

## 検証方法

ADR-022 完了判定コマンド 1-7 を全て実行し、合格を確認する。

<!-- validated -->
