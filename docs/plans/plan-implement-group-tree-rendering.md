# グループツリーレンダリングの実装

## 概要

HTML レンダラーの `renderDisplayLayer` を逐次ステートマシンから 2 パスのツリーベースアーキテクチャに移行する。

関連 ADR: [ADR-007](../decisions/adr-007-implement-group-tree-rendering.md)

## 前提知識

- ADR-006 Phase A（13 件のテストケース）が回帰テストゲートとして利用可能
- 既存ヘルパー（`getTatetenGroups`, `getHighlightGroups`, `getRangeMarkGroups`）はツリー構築で再利用
- ネスト優先順位: `highlight > tateten > token`（ADR-002 準拠）
- Canvas レンダラーの render-tree.ts が先行パターン

## 実装計画

### Step 1: 型定義の作成

`render-tree-types.ts` に `RenderNode`, `BlockRenderTree`, `TokenItem`, `TatetenGroup`, `HighlightGroup` を定義。

### Step 2: ツリー構築ロジックの実装

`build-render-tree.ts` に `buildBlockRenderTree()` を実装。

1. トークン列を走査し、範囲仮名マークでマージした `TokenItem` を構築
2. たて点マークの anchor 範囲から `TatetenGroup` を構築
3. highlight マークの anchor 範囲から `HighlightGroup` を構築
4. position-based marks（kutoten, kaeri, ref）を適切なツリー位置に配置

### Step 3: ツリー構築の単体テスト

`build-render-tree.test.ts` でグループ化パターンの検証。

### Step 4: ツリーレンダリングの実装

`render-tree.ts` に `renderBlockTree()` / `renderNode()` を実装。既存の `renderToken()`, `renderTokenWithRuby()`, `renderSaidokuToken()` を活用。

### Step 5: 統合と差し替え

`renderer.ts` の `renderDisplayLayer` を新実装に差し替え。

### Step 6: 旧コードの削除

`FlushState`, `flushTatetenGroup`, `flushHighlightGroup`, 3 段アキュムレータを削除。

## リスクと軽減策

| リスク                          | 影響度 | 軽減策                                        |
| ------------------------------- | ------ | --------------------------------------------- |
| HTML 出力の差異                 | 中     | Phase A の 13 テストケース + 既存テストで検証 |
| position-based marks の配置ミス | 中     | ツリー構築の単体テストで配置を直接検証        |

## 検証方法

- 全既存テスト（compound-marks.test.ts 含む）が変更なしで pass
- `FlushState` 関連コードが完全に削除されている
- `pnpm --filter @kanbun/skam-html-renderer test` 成功
- `pnpm typecheck` 成功

<!-- validated -->
