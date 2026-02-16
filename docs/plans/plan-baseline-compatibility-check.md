# Web Platform Baseline 互換性チェックの導入

## 概要

Web Platform Baseline に基づく CSS/JS 互換性チェック環境を構築する。プライベートパッケージ `@kanbun/baseline-check` として実装。

関連 ADR: [ADR-013](../decisions/adr-013-baseline-compatibility-check.md)

## 前提知識

- Stylelint + `stylelint-plugin-use-baseline` で CSS プロパティの Baseline 準拠をチェック
- ESLint + `eslint-plugin-baseline-js` で JS API の Baseline 準拠をチェック
- renderer 生成 CSS は extract スクリプトで抽出してから lint

## 実装計画

### Step 1: baseline-check パッケージの作成

`packages/baseline-check` に private パッケージを作成。stylelint、eslint、抽出スクリプトを含む。

### Step 2: CSS 抽出スクリプト

`scripts/extract-css.ts` で renderer の `generateCSS()` を呼び出し、生成 CSS を `extracted/css/` に出力。

### Step 3: Stylelint 設定

`stylelint.config.js` で `stylelint-plugin-use-baseline` を有効化し、widely available 基準で warning を出力。

### Step 4: ESLint JS Baseline 設定

`eslint-js.config.js` で `eslint-plugin-baseline-js` を有効化。

### Step 5: チェックコマンドの統合

`pnpm check` で CSS + JS の両方をチェック。`pnpm report` でレポート生成。

## リスクと軽減策

| リスク                | 影響度 | 軽減策                             |
| --------------------- | ------ | ---------------------------------- |
| pre-v1 ツールへの依存 | 低     | 比較用であり、代替ツールも設定済み |

## 検証方法

- `pnpm --filter @kanbun/baseline-check check` が実行でき、Baseline 違反が報告される
- override 設定で既知の違反を管理できる

## 注記

本 Plan は既存実装の追認文書。実装は ADR 受理前に完了済み。

<!-- validated -->
