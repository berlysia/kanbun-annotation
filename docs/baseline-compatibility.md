# Baseline Compatibility Report

Generated: 2026-11-25

## Summary

| Renderer             | Baseline Year     | Notes                                                                                          |
| -------------------- | ----------------- | ---------------------------------------------------------------------------------------------- |
| HTML Renderer (Grid) | **Baseline 2024** | 対応ブラウザで追加の体験向上あり、代替の無い必須の機能あり                                     |
| HTML Renderer (Ruby) | **Baseline 2024** | 対応ブラウザで追加の体験向上あり、一部ブラウザで cosmetic な劣化あり、代替の無い必須の機能あり |
| Canvas Renderer      | **Baseline 2024** | 代替の無い必須の機能あり                                                                       |

## HTML Renderer (Grid)

### Baseline 2024

| Feature          | Status      | Fallback                                                                                                                                                                                                                      |
| ---------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Intl.Segmenter` | 🔒 required | 代替なし。無い環境では、token に分ける最初の呼び出し (parse、tokenize など) が TypeError になる。書記素クラスタで分けるのに使い、環境ごとに token の数が変わるより失敗させる (packages/skam/src/graphemes.ts)。0.3.0 から必要 |

### Limited Availability

| Feature             | Status      | Fallback                                                                                                                                                        |
| ------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user-select`       | ✅ safe     | -webkit-user-select を全箇所で併記済み。Safari 3.1+ (2008)、Chrome 4+ (2010)、Firefox 2+ (-moz-, 2006) から対応しており、実質 2008 年以降の全ブラウザで動作する |
| `text-spacing-trim` | 💡 enhanced | Chromium 123+ で約物の字間が自動調整される（halt/chws feature 適用）。非対応ブラウザではデフォルトの全角幅で表示され、機能的な問題はない                        |

## HTML Renderer (Ruby)

### Baseline 2024

| Feature          | Status      | Fallback                                                                                                                                                                                                                                                                     |
| ---------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ruby-align`     | 💡 enhanced | Baseline Newly available (2024-12)。対応ブラウザ（Safari 18.2+/Chrome 128+/Firefox 38+）でルビが中央揃えになる。非対応ブラウザではブラウザデフォルトの配置で表示され、機能的な問題はない                                                                                     |
| `ruby-position`  | ⚠️ degraded | Baseline Newly available (2024-12)。使用値 over/under は Safari 18.2+/Chrome 84+/Firefox 38+ で対応。rubyMethod=ruby で再読文字（saidoku）を描画する場合、Safari 18.1 以前では under が効かず上下ルビが同一位置に重なる。rubyMethod=grid は ruby-position に依存せず影響なし |
| `Intl.Segmenter` | 🔒 required | 代替なし。無い環境では、token に分ける最初の呼び出し (parse、tokenize など) が TypeError になる。書記素クラスタで分けるのに使い、環境ごとに token の数が変わるより失敗させる (packages/skam/src/graphemes.ts)。0.3.0 から必要                                                |

### Limited Availability

| Feature             | Status      | Fallback                                                                                                                                                        |
| ------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user-select`       | ✅ safe     | -webkit-user-select を全箇所で併記済み。Safari 3.1+ (2008)、Chrome 4+ (2010)、Firefox 2+ (-moz-, 2006) から対応しており、実質 2008 年以降の全ブラウザで動作する |
| `text-spacing-trim` | 💡 enhanced | Chromium 123+ で約物の字間が自動調整される（halt/chws feature 適用）。非対応ブラウザではデフォルトの全角幅で表示され、機能的な問題はない                        |

## Canvas Renderer

### Baseline 2024

| Feature          | Status      | Fallback                                                                                                                                                                                                                      |
| ---------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Intl.Segmenter` | 🔒 required | 代替なし。無い環境では、token に分ける最初の呼び出し (parse、tokenize など) が TypeError になる。書記素クラスタで分けるのに使い、環境ごとに token の数が変わるより失敗させる (packages/skam/src/graphemes.ts)。0.3.0 から必要 |

## Playground

> 参考情報: Playground 固有の機能はライブラリ利用者に影響しません

### Baseline 2023

| Feature     | Status  | Fallback                                                                                          |
| ----------- | ------- | ------------------------------------------------------------------------------------------------- |
| `outline`   | ✅ safe | 選択色のカスタマイズ。非対応時はブラウザデフォルト                                                |
| `color-mix` | ✅ safe | inline-demo の border 色の半透明化のみ。非対応時は border 宣言が無視され、border なしで表示される |
| `has`       | ✅ safe | label のレイアウト微調整のみ。非対応時もレイアウト崩れなし                                        |

### Limited Availability

| Feature                  | Status  | Fallback                                                                                                                                 |
| ------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `resize`                 | ✅ safe | iOS Safari 未対応（全バージョン）。Playground のテキストエリアに resize:none で使用しており、リサイズ無効化が効かなくても機能に影響なし  |
| `word-break: break-word` | ✅ safe | Playground UI のみ。非対応時はデフォルトの word-break で折り返し                                                                         |
| `user-select`            | ✅ safe | -webkit-user-select を併記済み。全ブラウザで動作する                                                                                     |
| `selection`              | ✅ safe | iOS Safari 未対応（全バージョン）。Playground のテキストエリア選択色のカスタマイズのみで、非対応時はブラウザデフォルトの選択色が使われる |

## Yearly Check Summary

| Year | CSS Warnings | JS Warnings | Total |
| ---- | ------------ | ----------- | ----- |
| 2022 | 122          | 1           | 123   |
| 2023 | 122          | 1           | 123   |
| 2024 | 113          | 0           | 113   |
| 2025 | 113          | 0           | 113   |
| 2026 | 113          | 0           | 113   |
