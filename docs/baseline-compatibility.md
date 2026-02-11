# Baseline Compatibility Report

Generated: 2026-02-11

## Summary

> **Baseline 2024** 以降のブラウザで完全動作（フォールバック込み）
>
> 一部未 Baseline 機能は体験が低下する場合があります

## HTML Renderer

### Baseline 2023

| Feature   | Status  | Fallback                                                                                                                                                                          |
| --------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `outline` | ✅ safe | Baseline Widely available (2023)。基本機能は全ブラウザで長期サポート済み（Chrome 94+ で border-radius 追従が追加された点が 2023 判定の理由）。Renderer の選択ハイライト装飾で使用 |

### Baseline 2024

| Feature         | Status      | Fallback                                                                                                                                                                                                                                                                     |
| --------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ruby-align`    | ⚠️ degraded | Baseline Newly available (2024-12)。使用値 center は Safari 18.2+/Chrome 128+/Firefox 38+ で対応。Safari 18.1 以前で center が効かずルビがデフォルト配置になる                                                                                                               |
| `ruby-position` | ⚠️ degraded | Baseline Newly available (2024-12)。使用値 over/under は Safari 18.2+/Chrome 84+/Firefox 38+ で対応。rubyMethod=ruby で再読文字（saidoku）を描画する場合、Safari 18.1 以前では under が効かず上下ルビが同一位置に重なる。rubyMethod=grid は ruby-position に依存せず影響なし |

### Not yet Baseline

| Feature             | Status      | Fallback                                                                                                                                           |
| ------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user-select`       | ✅ safe     | Safari が未だ unprefixed 未対応のため -webkit-user-select を併記済み。全使用箇所でプレフィックス付きプロパティを提供しており、全ブラウザで動作する |
| `text-spacing-trim` | ⚠️ degraded | Chromium 123+ のみ対応（Firefox・Safari 未実装）。非対応時は約物がデフォルト全角幅で表示される（フォントの halt/chws feature 未適用）              |

## Canvas Renderer

全機能 Baseline 対応済み — 非 Baseline 機能は検出されませんでした。

## Playground

> 参考情報: Playground 固有の機能はライブラリ利用者に影響しません

### Baseline 2023

| Feature   | Status  | Fallback                                                                                                                                                                          |
| --------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `outline` | ✅ safe | Baseline Widely available (2023)。基本機能は全ブラウザで長期サポート済み（Chrome 94+ で border-radius 追従が追加された点が 2023 判定の理由）。Renderer の選択ハイライト装飾で使用 |
| `has`     | ✅ safe | Renderer: @supports ガード済み。非対応時は ::before プレースホルダーが残るが auto sizing で幅 0 に解決（非 Chromium にはバグなし）。Playground: label のレイアウト微調整のみ      |

### Not yet Baseline

| Feature                  | Status  | Fallback                                                                                                                                                                         |
| ------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resize`                 | ✅ safe | iOS Safari 未対応（全バージョン）。Playground のテキストエリアに resize:none で使用しており、リサイズ無効化が効かなくても機能に影響なし                                          |
| `word-break: break-word` | ✅ safe | Playground UI のみ。非対応時はデフォルトの word-break で折り返し                                                                                                                 |
| `user-select`            | ✅ safe | Safari が未だ unprefixed 未対応のため -webkit-user-select を併記済み。全使用箇所でプレフィックス付きプロパティを提供しており、全ブラウザで動作する                               |
| `selection`              | ✅ safe | iOS Safari 未対応（全バージョン）。Playground のテキストエリア選択色のカスタマイズのみで、非対応時はブラウザデフォルトの選択色が使われる                                         |
| `clip`                   | ✅ safe | 非推奨プロパティだが全ブラウザで実質的にサポート済み（IE 4+, Chrome 1+, Firefox 1+, Safari 3.1+, iOS Safari 1+）。Playground のアクセシビリティ用 visually-hidden パターンで使用 |

## Yearly Check Summary

| Year | CSS Warnings | JS Warnings | Total |
| ---- | ------------ | ----------- | ----- |
| 2022 | 133          | 0           | 133   |
| 2023 | 128          | 0           | 128   |
| 2024 | 119          | 0           | 119   |
| 2025 | 119          | 0           | 119   |
| 2026 | 119          | 0           | 119   |
