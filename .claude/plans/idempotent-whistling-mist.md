# 計画: ADR-016 作成（Canvas レンダラー列幅モード）

## Context

Canvas レンダラーのレイアウトフラグ（`hasRightColumn` 等）がドキュメント全体で OR 集約されている問題を調査し、uniform / adaptive 2 モードに分離する方針を策定した。この決定を ADR として記録する。

## 作業内容

`docs/decisions/adr-016-canvas-column-sizing-mode.md` を作成する（status: Accepted）。

### ADR 内容

- **コンテキスト**: 現行の列幅計算がドキュメント全体フラグに依存し、1 トークンの注記が全列に影響する問題
- **検討した選択肢**: (A) 全ブロック共通 (uniform) のみ、(B) ブロック単位 (adaptive) のみ、(C) 2 モード併存
- **決定**: Option C — `columnSizing: 'uniform' | 'adaptive'` オプション導入
- **設計要点**:
  - Pass 1 で `CanvasBlockNode` にブロック単位 `BlockLayoutFlags` を追加
  - Pass 2 で `computeColumnDimensions()` ヘルパー抽出、モードに応じた列幅計算
  - adaptive では `maxRubyWidth` もブロック単位
  - デフォルト `'uniform'` で後方互換

### ADR に含める内容のソース

このセッションで策定した設計内容（現計画ファイルの調査結果）を ADR フォーマットに整理する。

## 検証

```bash
pnpm typecheck  # ADR は md なので不要だが念のため
```

<!-- validated -->
