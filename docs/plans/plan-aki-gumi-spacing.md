# アキ組み（字間スペーシング）の導入

## 概要

HTML レンダラーに CSS `letter-spacing` ベースのアキ組み機能を追加する。ベタ組み・四分アキ・二分アキのプリセットと任意の em 値指定を API で提供。

関連 ADR: [ADR-008](../decisions/adr-008-aki-gumi-spacing.md)

## 前提知識

- token は `display: inline-block` で inline flow に配置
- `letter-spacing` は atomic inline（inline-block / inline-grid）間にアキを挿入する
- ただし `letter-spacing` は継承されるため、suffix-row 等に `letter-spacing: 0` リセットが必要（検証済み）
- tateten-sep の前後に `margin-inline` で `-アキ/2` の補正が必要（検証済み）

## 実装計画

### Step 1: 型定義の追加

`render-config.ts` の `RenderOptions` と `StyleOptions` に `spacing` オプションを追加。

```typescript
spacing?: 'solid' | 'quarter' | 'half' | number;
```

`SPACING_PRESETS` 定数マップを追加:

```typescript
const SPACING_PRESETS = { solid: '0em', quarter: '0.25em', half: '0.5em' };
```

### Step 2: CSS 生成の更新

`generateCSS()` で `spacing` オプションを `--skam-letter-spacing` CSS Variable にマッピング。
デフォルト値を `0` → `0em` に変更（calc() 互換性のため）。

### Step 3: letter-spacing 継承リセットの追加

`styles.ts` に以下のリセットルールを追加:

```css
:where(.skam-suffix-row) {
  letter-spacing: 0;
}
:where(.skam-tateten-sep) {
  letter-spacing: 0;
}
```

### Step 4: tateten-sep の負マージン補正

`styles.ts` に tateten-sep の margin-inline 補正を追加:

```css
:where(.skam-tateten-sep) {
  margin-inline-start: calc(-0.5 * var(--skam-letter-spacing));
  margin-inline-end: calc(-0.5 * var(--skam-letter-spacing));
}
```

### Step 5: テストの追加

- `spacing` オプション各プリセットで `render()` が正しい CSS Variable 値を出力するテスト
- 負の数値入力が 0 にクランプされるテスト

## リスクと軽減策

| リスク                                   | 影響度 | 軽減策                                     |
| ---------------------------------------- | ------ | ------------------------------------------ |
| highlight 傍線がアキ部分をカバーしない   | 低     | 既知の制約として文書化。別 ADR で対応      |
| suffix-kana に letter-spacing が二重適用 | 低     | 将来の構造変更で対応                       |
| 行末の余分なアキ                         | 低     | 縦書きでは視覚的に目立ちにくい（検証済み） |

## 検証方法

- `pnpm test` — 全テスト通過
- Playground でベタ/四分/二分アキを切り替えて視覚確認
- tateten-sep 前後のスペーシングが均等であることを確認

<!-- validated -->
