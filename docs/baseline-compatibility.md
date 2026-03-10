# Baseline Compatibility Report

Generated: 2026-03-10

## Summary

| Renderer             | Baseline Year     | Notes                          |
| -------------------- | ----------------- | ------------------------------ |
| HTML Renderer (Grid) | **Baseline 2023** | 未 Baseline 機能で体験低下あり |
| HTML Renderer (Ruby) | **Baseline 2024** | 未 Baseline 機能で体験低下あり |
| Canvas Renderer      | ✅ all clear      | 非 Baseline 機能なし           |

> Playground: 1 件のフォールバック未定義機能があります（`baseline-overrides-playground.json` に追加してください）

## HTML Renderer (Grid)

### Baseline 2023

| Feature   | Status  | Fallback                                                                                           |
| --------- | ------- | -------------------------------------------------------------------------------------------------- |
| `outline` | ✅ safe | Baseline Widely available (2023)。基本機能は全ブラウザで長期サポート済み。選択ハイライト装飾で使用 |

### Not yet Baseline

| Feature             | Status      | Fallback                                                                                                                                           |
| ------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user-select`       | ✅ safe     | Safari が未だ unprefixed 未対応のため -webkit-user-select を併記済み。全使用箇所でプレフィックス付きプロパティを提供しており、全ブラウザで動作する |
| `text-spacing-trim` | ⚠️ degraded | Chromium 123+ のみ対応（Firefox・Safari 未実装）。非対応時は約物がデフォルト全角幅で表示される（フォントの halt/chws feature 未適用）              |

## HTML Renderer (Ruby)

### Baseline 2023

| Feature   | Status  | Fallback                                                                                           |
| --------- | ------- | -------------------------------------------------------------------------------------------------- |
| `outline` | ✅ safe | Baseline Widely available (2023)。基本機能は全ブラウザで長期サポート済み。選択ハイライト装飾で使用 |

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

| Feature     | Status     | Fallback                                                   |
| ----------- | ---------- | ---------------------------------------------------------- |
| `outline`   | ✅ safe    | 選択色のカスタマイズ。非対応時はブラウザデフォルト         |
| `color-mix` | ❓ unknown | -                                                          |
| `has`       | ✅ safe    | label のレイアウト微調整のみ。非対応時もレイアウト崩れなし |

### Not yet Baseline

| Feature                  | Status  | Fallback                                                                                                                                 |
| ------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `resize`                 | ✅ safe | iOS Safari 未対応（全バージョン）。Playground のテキストエリアに resize:none で使用しており、リサイズ無効化が効かなくても機能に影響なし  |
| `word-break: break-word` | ✅ safe | Playground UI のみ。非対応時はデフォルトの word-break で折り返し                                                                         |
| `user-select`            | ✅ safe | -webkit-user-select を併記済み。全ブラウザで動作する                                                                                     |
| `selection`              | ✅ safe | iOS Safari 未対応（全バージョン）。Playground のテキストエリア選択色のカスタマイズのみで、非対応時はブラウザデフォルトの選択色が使われる |

## Yearly Check Summary

| Year | CSS Warnings | JS Warnings | Total |
| ---- | ------------ | ----------- | ----- |
| 2022 | 134          | 0           | 134   |
| 2023 | 134          | 0           | 134   |
| 2024 | 125          | 0           | 125   |
| 2025 | 125          | 0           | 125   |
| 2026 | 125          | 0           | 125   |
