# Plan: ADR-015 Canvas レンダラー対応

## 関連 ADR

[ADR-015: 傍点・傍線レイアウト配置順序の変更](../decisions/adr-015-emphasis-highlight-layout-order.md)

## 目標

Canvas レンダラーで emphasis/highlight の描画が Canvas サイズ内に収まるようにし、emphasis+highlight 共存時の配置順を「本文 → ルビ → 傍線 → 傍点」にする。

## 現状の問題

### 問題: emphasis/highlight の描画座標が totalWidth に反映されていない

`layoutVertical` の `totalWidth` 計算は `numBlocks * columnWidth + gaps` のみを基準にしている。しかし emphasis ドットや highlight 線は `columnWidth` の外側に配置されるため、Canvas の `width` を超えてクリップされる。

#### ケースごとの分析

**Case A: hasSuffix=true**

- `emphasisBaseX = suffixX = columnX + saidokuWidth + fontSize + rubyFontSize/2`
- emphasis 右端 = `columnX + saidokuWidth + fontSize + rubyFontSize` = `columnX + columnWidth`
- → columnWidth 内に収まる ✅

**Case B: hasSuffix=false, maxRubyWidth > 0**

- `emphasisBaseX = columnX + fontSize + slotGap`
- `emphasisWithRubyX = emphasisBaseX + rubyFontSize`
- emphasis の描画はテキスト幅の半分が中心からはみ出す（textAlign: center）
- emphasisWithRuby 右端 ≈ `columnX + fontSize + slotGap + rubyFontSize + rubyFontSize/2`
- `columnWidth = fontSize + slotGap + maxRubyWidth` なので、`rubyFontSize + rubyFontSize/2 > maxRubyWidth` のとき超過
- → **超過する可能性あり** ⚠️

**Case C: hasSuffix=false, maxRubyWidth=0 (bare)**

- `emphasisBaseX = columnX + fontSize + slotGap`
- `columnWidth = fontSize`
- emphasis の中心が columnWidth の外側（+2px）
- → **確実に超過** ❌

**Case D: highlight-group 内 (ADR-015 変更済み)**

- `hlEmphasisX = highlightLineX + highlightGap = columnX + columnWidth + 2 * highlightGap`
- emphasis 右端 ≈ `columnX + columnWidth + 2 * highlightGap + rubyFontSize/2`
- → **大幅に超過** ❌

**Case E: highlight のみ (emphasis なし)**

- `highlightLineX = columnX + columnWidth + highlightGap`
- → **highlight 線自体が超過** ❌

## 解決方針

### アプローチ: extraRightWidth を導入

`columnWidth` は基本幅（base + suffix/ruby）を維持し、emphasis/highlight に必要な追加幅を `extraRightWidth` として分離管理する。

```
totalWidth = numBlocks * (columnWidth + extraRightWidth) + (numBlocks - 1) * columnGap
```

### extraRightWidth 計算

emphasis の描画位置から逆算:

```
hasHighlight && hasEmphasis:
  // emphasis 右端 = columnX + columnWidth + highlightGap + highlightGap + rubyFontSize/2
  // extraRightWidth = 2 * highlightGap + rubyFontSize/2
  extraRightWidth = 2 * highlightGap + Math.ceil(rubyFontSize / 2)

hasHighlight && !hasEmphasis:
  // highlight 線の右端（線自体の太さは無視）
  extraRightWidth = highlightGap

hasEmphasis && !hasHighlight:
  // emphasis 右端 = columnX + columnWidth + slotGap + rubyFontSize/2 (Case C)
  // Case A は収まるが、Case B/C は超過
  // 最大ケースに合わせて: slotGap + rubyFontSize/2
  extraRightWidth = slotGap + Math.ceil(rubyFontSize / 2)

else:
  extraRightWidth = 0
```

注: `highlightLineWidth`（stroke の太さ、1-2px）はレイアウト幅には無視可能。`highlightGap` だけで十分なスペースを確保。

## 実装タスク

### 1. types.ts

`CanvasRenderTree` に `hasEmphasis: boolean` と `hasHighlight: boolean` を追加。

### 2. render-tree.ts

`buildRenderTree` 内で全マークをスキャンし、`hasEmphasis` / `hasHighlight` フラグを設定。既存の `hasSuffix` / `hasSaidoku` / `hasRightColumn` と同じパターン。

### 3. layout-vertical.ts

1. `hasEmphasis` / `hasHighlight` を render tree から取得
2. `columnWidth` 計算後に `extraRightWidth` を計算
3. `blockColumnX` の計算を `columnWidth + extraRightWidth` ベースに変更:
   ```
   blockColumnX = padding.left + (numBlocks - 1 - blockIdx) * (columnWidth + extraRightWidth + columnGap)
   ```
4. `totalWidth` を更新:
   ```
   totalWidth = numBlocks * (columnWidth + extraRightWidth) + Math.max(0, numBlocks - 1) * columnGap
   ```
5. `highlightLineX` / emphasis 座標はそのまま（既に columnWidth 基準で計算済み）

### 4. テスト更新

- `layout-vertical.test.ts`: emphasis/highlight 付きドキュメントの幅計算テスト追加
- 既存テストのスナップショット/期待値更新

### 5. 視覚確認

スクリーンショットで全パターン確認:

- emphasis + highlight: 傍点が傍線の外側に描画
- emphasis のみ: 傍点が見える
- highlight のみ: 傍線が見える
- emphasis/highlight なし: 変化なし

## リスク

- 全ブロック統一の `extraRightWidth` は、emphasis/highlight が一部のブロックにしか存在しない場合に無駄なスペースを生む → 現行アーキテクチャの制約。許容範囲

<!-- validated -->
