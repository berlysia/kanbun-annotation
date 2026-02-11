# Baseline Compatibility Report

Generated: 2026-02-11

## Summary

> **Baseline 2024** 以降のブラウザで完全動作（フォールバック込み）
>
> 一部未 Baseline 機能は体験が低下する場合があります

## HTML Renderer

### Baseline 2023

| Feature   | Status  | Fallback                                   |
| --------- | ------- | ------------------------------------------ |
| `outline` | ✅ safe | 選択ハイライトの装飾のみ（機能に影響なし） |

### Baseline 2024

| Feature         | Status      | Fallback                                       |
| --------------- | ----------- | ---------------------------------------------- |
| `ruby-align`    | ⚠️ degraded | フォールバックなし（ルビの中央揃えが効かない） |
| `ruby-position` | ⚠️ degraded | フォールバックなし（ルビの上下配置が効かない） |

### Not yet Baseline

| Feature             | Status      | Fallback                                           |
| ------------------- | ----------- | -------------------------------------------------- |
| `user-select`       | ✅ safe     | -webkit-user-select ベンダープレフィックス提供済み |
| `text-spacing-trim` | ⚠️ degraded | フォールバックなし（約物間隔の微調整のみ）         |

## Canvas Renderer

全機能 Baseline 対応済み — 非 Baseline 機能は検出されませんでした。

## Playground

> 参考情報: Playground 固有の機能はライブラリ利用者に影響しません

### Baseline 2023

| Feature   | Status  | Fallback                                                                                                                                                                     |
| --------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `outline` | ✅ safe | 選択ハイライトの装飾のみ（機能に影響なし）                                                                                                                                   |
| `has`     | ✅ safe | Renderer: @supports ガード済み。非対応時は ::before プレースホルダーが残るが auto sizing で幅 0 に解決（非 Chromium にはバグなし）。Playground: label のレイアウト微調整のみ |

### Not yet Baseline

| Feature                  | Status  | Fallback                                              |
| ------------------------ | ------- | ----------------------------------------------------- |
| `resize`                 | ✅ safe | playground UIの利便性のみ（レンダラー出力に影響なし） |
| `word-break: break-word` | ✅ safe | playground UIのみ（レンダラー出力に影響なし）         |
| `user-select`            | ✅ safe | -webkit-user-select ベンダープレフィックス提供済み    |
| `selection`              | ✅ safe | playground UIのみ（レンダラー出力に影響なし）         |
| `clip`                   | ✅ safe | playground UIのみ（レンダラー出力に影響なし）         |

## Yearly Check Summary

| Year | CSS Warnings | JS Warnings | Total |
| ---- | ------------ | ----------- | ----- |
| 2022 | 133          | 0           | 133   |
| 2023 | 128          | 0           | 128   |
| 2024 | 119          | 0           | 119   |
| 2025 | 119          | 0           | 119   |
| 2026 | 119          | 0           | 119   |
