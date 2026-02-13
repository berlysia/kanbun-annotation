# ADR-016: Canvas レンダラー列幅モード（uniform / adaptive）

## ステータス

Accepted

実装計画: [Plan](../plans/plan-canvas-3level-layout.md)

## コンテキスト

Canvas レンダラーの Pass 2（layout-vertical.ts）では、レイアウトフラグ（`hasSuffix`, `hasSaidoku`, `hasRightColumn`, `hasEmphasis`, `hasHighlight`）がドキュメント全体で OR 集約されている。これにより、いずれか 1 ブロックに yomigana や okurigana を持つトークンがあるだけで `hasRightColumn = true` となり、全ブロックの列幅が拡張される。

### 問題の具体例

```
Block A: 漢字のみ（マークなし）
Block B: 漢字 + 送り仮名 + 返り点
```

現行の挙動では Block B の送り仮名により `hasRightColumn = true`, `hasSuffix = true` がドキュメント全体に適用され、Block A も Block B と同じ列幅（`saidokuWidth + fontSize + rightColumnWidth`）で描画される。Block A は本来 `fontSize` だけの列幅で十分だが、不要な余白が生じている。

### 影響箇所

- Pass 1（render-tree.ts）: フラグは `CanvasRenderTree` のトップレベルに格納
- Pass 2（layout-vertical.ts）: トップレベルフラグから単一の `columnWidth` を算出し、全ブロックに適用
- Pass 3（draw.ts）: 影響なし（座標を消費するだけ）

## 検討した選択肢

### Option A: 全ブロック共通（uniform）のみ — 現状維持

- 利点: 変更不要。全ブロックの列幅が揃い、視覚的に整列する
- 欠点: 1 トークンの注記が全列に影響し、余白が無駄になる

### Option B: ブロック単位（adaptive）のみ

- 利点: 各ブロックが必要最小限の列幅になり、レイアウトがコンパクト
- 欠点: 後方互換性を破壊する。ブロック間で列幅が異なり、整列感が失われるケースがある

### Option C: 2 モード併存

- 利点: `columnSizing: 'uniform' | 'adaptive'` オプションでユーザーが選択可能。デフォルト `'uniform'` で後方互換
- 欠点: 実装量が増える（両モードの分岐）。ただし `computeColumnDimensions()` ヘルパーへの抽出により分岐は局所的

## 決定

**Option C** を採用する。`columnSizing: 'uniform' | 'adaptive'` オプションを導入し、デフォルトは `'uniform'`（現行動作と同一）。

### Pass 1: ブロック単位フラグの追加

`CanvasBlockNode` に `BlockLayoutFlags` を追加する。

```typescript
export interface BlockLayoutFlags {
  hasSuffix: boolean;
  hasSaidoku: boolean;
  hasRightColumn: boolean;
  hasEmphasis: boolean;
  hasHighlight: boolean;
}

export interface CanvasBlockNode {
  type: 'block';
  blockId: string;
  children: CanvasBlockChild[];
  flags: BlockLayoutFlags; // NEW
}
```

各ブロックの `children` を走査してフラグを集約する。ドキュメント全体フラグは全ブロックの `flags` を OR 集約して導出（uniform モード用）。

### Pass 2: `computeColumnDimensions()` ヘルパーの抽出

現在 `layoutDocument()` 内にインラインで書かれている列幅計算ロジックを、独立したヘルパー関数に抽出する。

```typescript
interface ColumnDimensions {
  columnWidth: number;
  baseCenterX: number;
  extraRightWidth: number;
  fullColumnWidth: number; // columnWidth + extraRightWidth
}

function computeColumnDimensions(
  flags: BlockLayoutFlags,
  fontSize: number,
  rubyFontSize: number,
  maxRubyWidth: number,
  highlightGap: number
): ColumnDimensions;
```

### Pass 2: モード分岐

- **uniform モード**: 全ブロックの `flags` を OR 集約し、ドキュメント全体の `maxRubyWidth` で `computeColumnDimensions()` を 1 回呼び出す。全ブロックに同一の `ColumnDimensions` を適用
- **adaptive モード**: 各ブロックの `flags` とブロック単位の `maxRubyWidth` で `computeColumnDimensions()` をブロックごとに呼び出す。ブロックごとに異なる `ColumnDimensions` を使用

adaptive モードでは X 座標の累積計算が必要:

```typescript
// uniform: blockColumnX = padding.left + (numBlocks - 1 - i) * (dims.fullColumnWidth + gap)
// adaptive: ブロックごとの fullColumnWidth を右から左へ累積
const blockColumnXs: number[] = [];
let curX = padding.left;
for (let i = numBlocks - 1; i >= 0; i--) {
  blockColumnXs[i] = curX;
  curX += blockDimsArray[i].fullColumnWidth + gap;
}
```

### rightAdjust ロジックの対応

highlight グループの `rightAdjust` 計算では、uniform モードではドキュメント全体フラグ、adaptive モードではブロック単位フラグを参照する:

```typescript
const effectiveFlags = isAdaptive ? block.flags : documentFlags;
```

### オプションの追加

`CanvasRenderOptions` と `MeasureOptions` に `columnSizing` を追加。`resolveOptions()` でデフォルト `'uniform'` を設定。

## 影響

### ポジティブ

- 後方互換性を維持（デフォルト `'uniform'`）
- adaptive モードにより、マーク密度の異なるブロックが混在するドキュメントでよりコンパクトなレイアウトが可能
- `computeColumnDimensions()` の抽出により、列幅計算ロジックがテスト可能な独立関数になる
- Pass 3（draw.ts）は変更不要

### ネガティブ

- Pass 2 に uniform / adaptive の分岐が入る（ただし `computeColumnDimensions()` により局所的）
- adaptive モードではブロック間で列幅が異なるため、視覚的な整列感が失われる場合がある
- adaptive モードではブロック単位の `maxRubyWidth` 計算が追加コスト（軽微）

## 参考

- `packages/skam-canvas-renderer/src/render-tree.ts` — Pass 1: フラグ集約
- `packages/skam-canvas-renderer/src/layout-vertical.ts` — Pass 2: 列幅計算
- `packages/skam-canvas-renderer/src/draw.ts` — Pass 3: 描画
- [ADR-012: Canvas レンダラー](adr-012-canvas-renderer.md)
