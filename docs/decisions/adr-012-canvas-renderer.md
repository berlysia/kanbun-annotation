---
status: Accepted
plan: plan-canvas-renderer.md
---

# ADR-012: Canvas Renderer パッケージの新設

## コンテキスト

既存の `@kanbun/skam-html-renderer` は HTML+CSS による漢文レンダリングを提供するが、以下の用途には対応できない:

- **画像エクスポート**: PNG/JPEG として共有・印刷・教材生成
- **高パフォーマンス表示**: 大量のトークン・マークがある文書を DOM 操作なしで高速描画
- **カスタム描画制御**: HTML/CSS では困難な精密座標制御（アニメーション、独自レイアウト等）

これらの用途に対応するため、Canvas API を使った新しいレンダラーが必要。

## 検討した選択肢

### Option A: HTML renderer の内部モジュールを共有

- 利点: render tree 構築ロジック (build-render-tree.ts) の重複を避けられる
- 欠点: HTML renderer の内部進化に密結合。Canvas 用にはレイアウト座標が必要だが HTML renderer の render tree は DOM 特有の構造（blockStartHtml 等）を含む。内部 API の公開は破壊的変更リスクを増やす

### Option B: 完全独立パッケージ（採用）

- 利点: 依存は `@kanbun/skam` 型のみ。Canvas に最適化したデータ構造を設計可能。HTML renderer の変更に影響されない
- 欠点: render tree 構築のセマンティクス（tateten/highlight グルーピング、range mark マージ等）を再実装する必要がある（約 200-300 行）

### Option C: HTML → Canvas 変換（html2canvas 的アプローチ）

- 利点: 既存の HTML renderer をそのまま活用
- 欠点: HTML renderer に依存。DOM 環境が必須（Node.js 単独で動作しない）。描画品質・パフォーマンスの制御が困難

## 決定

**Option B: 完全独立パッケージ** `@kanbun/skam-canvas-renderer` を新設する。

### アーキテクチャ

3-Pass レンダリングパイプライン:

1. **Pass 1 (Resolve & Group)**: `@kanbun/skam` ユーティリティで mark をトークンに解決し、tateten/highlight/range mark をグルーピング → CanvasRenderTree
2. **Pass 2 (Measure & Layout)**: `ctx.measureText()` でテキスト計測し、各要素に絶対座標を割り当て → DocumentLayout
3. **Pass 3 (Draw)**: DocumentLayout を走査して canvas draw calls を発行

### 対象環境

- ブラウザ Canvas API (`HTMLCanvasElement`, `OffscreenCanvas`)
- Node.js (`node-canvas`): ユーザーが `createCanvas` ファクトリを提供する方式（ハード依存なし）

### Canvas コンテキスト抽象化

`CanvasRenderingContext2DLike` インターフェースで最小限のサブセットを定義。3 環境すべてがネイティブ適合するためアダプタ不要。`TextMetrics` は `width` のみ必須とし、`actualBoundingBox*` は利用可能ならフォールバック。

### インタラクティブ機能

不要（静的描画のみ）。将来必要になれば別途検討。

## 影響

### ポジティブ

- 画像エクスポート（PNG/JPEG）が可能になる
- DOM 不要で Node.js 単独での描画が可能
- 精密な座標制御による高品質なレンダリング
- HTML renderer と独立して進化可能

### ネガティブ

- ~~render tree 構築ロジックの重複（約 200-300 行）~~ → `@kanbun/skam/rendering` サブパスに共有ユーティリティを集約して解消済み
- Canvas API にはネイティブの縦書きサポートがないため、1 文字ずつの描画が必要
- フォントメトリクスの環境差（ブラウザ vs node-canvas）への対応が必要
- 新パッケージのメンテナンスコスト

## 参考

- [ADR-005](adr-005-restructure-display-layer-rendering.md): Display 層レンダリング構造改善
- [ADR-006](adr-006-group-tree-rendering-restructure.md): グループツリーレンダリング再構築
- [ADR-007](adr-007-implement-group-tree-rendering.md): 2-pass tree architecture
- [ADR-011](adr-011-cross-browser-screenshot.md): Cross-browser screenshot tool
