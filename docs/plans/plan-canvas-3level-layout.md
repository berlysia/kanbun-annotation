# Canvas Renderer 3レベルレイアウト判定モデル

## 概要

Canvas renderer のレイアウトフラグをドキュメント全体の OR 集約から、3 レベル（ドキュメント / ブロック / トークン・グループ）の独立判定に改修する。ADR-016（uniform/adaptive 列幅モード）と ADR-017（グループ・トークン単位レイアウト）を同時に実装する。

関連 ADR: [ADR-016](../decisions/adr-016-canvas-column-sizing-mode.md), [ADR-017](../decisions/adr-017-canvas-group-level-layout.md)

## 前提知識

Canvas renderer は 3-Pass パイプライン:

- Pass 1 (render-tree.ts): SKAMDocument → CanvasRenderTree（スロット解決、グルーピング、フラグ計算）
- Pass 2 (layout-vertical.ts): CanvasRenderTree → DocumentLayout（座標計算）
- Pass 3 (draw.ts): DocumentLayout → Canvas API（描画）

現状の問題: Pass 1 でドキュメント全体 OR 集約されたフラグが Pass 2 の列幅・スロット位置を一律に決定し、ブロック間・トークン間の差異が無視される。

## 実装計画

詳細な実装手順は `.claude/plans/wild-drifting-locket.md` を参照。

### Step 0: ADR-017 作成

### Step 1: BlockLayoutFlags を CanvasBlockNode に追加（types.ts, render-tree.ts）

### Step 2: computeColumnDimensions 抽出 + emphasisX per-token 化（layout-vertical.ts）

### Step 3: columnSizing オプション追加（types.ts, layout.ts）

### Step 4: adaptive モード実装（layout-vertical.ts）

### Step 5: 総合テスト + Playground 確認

## リスクと軽減策

| リスク                       | 影響度 | 軽減策                                     |
| ---------------------------- | ------ | ------------------------------------------ |
| emphasis 位置リグレッション  | 中     | テスト期待値の意図的更新 + playground 目視 |
| adaptive X 累積の off-by-one | 高     | 1 ブロック uniform/adaptive 同一結果テスト |
| uniform 後方互換性           | 高     | uniform パスは既存ロジック完全保持         |

## 検証方法

- `pnpm test` 全パス
- `pnpm typecheck` パス
- `pnpm playground:dev` で視覚的確認（emphasis/highlight 共存、multi-block、adaptive）

<!-- validated -->
