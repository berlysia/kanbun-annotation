---
status: Complete
plan: plan-implement-group-tree-rendering.md
---

# ADR-007: グループツリーレンダリングの実装

実装計画: [Plan](../plans/plan-implement-group-tree-rendering.md)

## コンテキスト

### 背景

ADR-006 Phase A（テストカバレッジ拡充）が完了し、13 件の複合マークテストケースが追加された。これにより `renderDisplayLayer` のステートマシン実装の振る舞いが包括的にテストで保証されている。

本 ADR は ADR-006 で提案された Phase B（グループツリーレンダリングへの再構築）を具体的な実装計画として独立した決定記録にする。

### 現行アーキテクチャの課題

`renderDisplayLayer` は逐次ステートマシンで、3 段のアキュムレータ（`groupTokens` → `highlightTokens` → `renderedTokens`）とフラッシュヘルパーで構成される。ADR-005 Phase 1 でフラッシュヘルパーは抽出されたが、以下の構造的課題が残る:

1. **8 箇所のフラッシュサイト**: 各サイトでの `toHighlightBuffer` / `resetGroup` パラメータの手動選択
2. **`processedTokenIds` とグループ判定の干渉**: 範囲仮名マークの複数トークンマージと、たて点/highlight グループ検出の相互作用リスク
3. **新マークタイプ追加の障壁**: 新グループ系マークタイプの追加時にステートマシン全体の理解が必要

### 移行基準の評価

ADR-006 で定義された Phase B 移行基準:

| 基準                         | 状態       | 根拠                                                                                       |
| ---------------------------- | ---------- | ------------------------------------------------------------------------------------------ |
| テストカバレッジ（10件以上） | **達成**   | 13 件の新規テストケース追加済み                                                            |
| 安定性（2週間バグなし）      | **評価中** | Phase A 完了後のバグ報告なし                                                               |
| 動機                         | **該当**   | コード保守性の課題: ステートマシンの暗黙的な依存連鎖は新規コントリビュータにとって理解困難 |

## 決定

ステートマシンを廃し、2 パスのツリーベースアーキテクチャに移行する。

### 設計: 2 パスアプローチ

#### Pass 1: レンダーツリー構築

トークンとマークから、ブロックごとにネストされたグループツリーを事前構築する。

```typescript
// --- 型定義 ---

type RenderNode = TokenItem | TatetenGroup | HighlightGroup;

interface BlockRenderTree {
  items: RenderNode[];
}

interface TokenItem {
  type: 'token';
  token: Token;
  rangeCtx?: RangeMarkContext;
  marks: Map<MarkType, Mark[]>;
}

interface TatetenGroup {
  type: 'tateten-group';
  tateten: TatetenMark;
  items: TokenItem[];
}

interface HighlightGroup {
  type: 'highlight-group';
  highlight: HighlightMark;
  items: (TokenItem | TatetenGroup)[];
}
```

`buildBlockRenderTree(block, tokens, marks, ctx)` の責務:

1. トークン列を走査し、範囲仮名マーク（yomigana/okurigana/soegana）によるトークンのマージで `TokenItem` を構築
2. たて点マークの anchor 範囲から `TatetenGroup` を構築し、該当する `TokenItem` をグループ化
3. highlight マークの anchor 範囲から `HighlightGroup` を構築し、`TokenItem` / `TatetenGroup` をグループ化
4. position-based marks（kutoten, kaeri, ref）を適切なツリー位置に配置
5. ネスト優先順位: `highlight > tateten > token`（ADR-002 準拠）

#### Pass 2: ツリーレンダリング

構築済みのツリーを再帰的に走査して HTML を生成する。

```typescript
function renderBlockTree(tree: BlockRenderTree, ctx: RenderContext): string {
  return tree.items.map((node) => renderNode(node, ctx)).join('');
}

function renderNode(node: RenderNode, ctx: RenderContext): string {
  switch (node.type) {
    case 'token':
      return renderTokenItem(node, ctx);
    case 'tateten-group':
      return renderTatetenGroupNode(node, ctx);
    case 'highlight-group':
      return renderHighlightGroupNode(node, ctx);
  }
}
```

### 実装戦略

#### ファイル構成

```
packages/skam-html-renderer/src/
├── render-tree-types.ts           # RenderNode 等の型定義
├── build-render-tree.ts           # Pass 1: ツリー構築ロジック
├── render-tree.ts                 # Pass 2: ツリー → HTML レンダリング
├── renderer.ts                    # 既存ファイル（renderDisplayLayer を新実装に差し替え）
└── __tests__/
    ├── build-render-tree.test.ts  # ツリー構築の単体テスト
    └── compound-marks.test.ts     # Phase A テスト（回帰テストとして活用）
```

#### 移行手順

1. **型定義の作成**: `render-tree-types.ts` に `RenderNode`, `BlockRenderTree` 等を定義
2. **ツリー構築の実装**: `build-render-tree.ts` に `buildBlockRenderTree` を実装
3. **ツリー構築の単体テスト**: `build-render-tree.test.ts` でツリー構造を検証
4. **ツリーレンダリングの実装**: `render-tree.ts` に `renderBlockTree` / `renderNode` を実装
5. **統合**: `renderer.ts` の `renderDisplayLayer` を新実装に差し替え
6. **回帰テスト**: 全既存テスト（compound-marks.test.ts 含む）が pass することを確認
7. **旧コード削除**: ステートマシン関連コード（`FlushState`, `flushTatetenGroup`, `flushHighlightGroup`, 3 段アキュムレータ）を削除

#### 現行ヘルパーの扱い

| 現行ヘルパー            | 扱い                                          |
| ----------------------- | --------------------------------------------- |
| `getTatetenGroups()`    | ツリー構築で再利用                            |
| `getHighlightGroups()`  | ツリー構築で再利用                            |
| `getRangeMarkGroups()`  | ツリー構築で再利用                            |
| `getMarksForToken()`    | `TokenItem.marks` 構築で再利用                |
| `flushTatetenGroup()`   | **削除** — ツリー構造がフラッシュを不要にする |
| `flushHighlightGroup()` | **削除** — 同上                               |
| `FlushState`            | **削除** — 同上                               |
| `renderToken()`         | そのまま維持（TokenItem レンダリングで使用）  |
| `renderTokenWithRuby()` | そのまま維持                                  |
| `renderSaidokuToken()`  | そのまま維持                                  |

### 受入基準

1. 全既存テスト（compound-marks.test.ts, highlight-tateten-kun.test.ts 等）が変更なしで pass
2. `buildBlockRenderTree` の単体テストが、主要なグループ化パターンをカバー
3. `FlushState`, `flushTatetenGroup`, `flushHighlightGroup` が完全に削除されている
4. `processedTokenIds` によるトークンスキップが不要になっている
5. HTML 出力が既存実装と同一（ホワイトスペースの差異は許容）

## 影響

### positive

- フラッシュ依存バグが構造的に発生不可能になる
- グループ化ロジック（`buildBlockRenderTree`）を単体テスト可能
- 新しいグループ系マークタイプは `RenderNode` にバリアント追加 + `renderNode` にケース追加で対応可能
- ツリー構造のログ出力によりデバッグが容易になる
- コード量は約 400 行のステートマシンが約 250 行のツリー構築 + レンダリングに縮小

### negative

- 約 400 行の大規模リファクタリングで一時的にレンダリングバグのリスクがある（Phase A テストで軽減）
- 中間ツリーのメモリ割り当てが微増する（実用上無視可能）

### リスクと軽減策

| リスク                          | 深刻度 | 軽減策                                                |
| ------------------------------- | ------ | ----------------------------------------------------- |
| HTML 出力の差異                 | 中     | Phase A の 13 テストケース + 既存テストで包括的に検証 |
| position-based marks の配置ミス | 中     | ツリー構築の単体テストで配置を直接検証                |
| エッジケースの見落とし          | 低     | 既存テスト + playground での目視確認                  |

## 参考

- ADR-005: Display 層レンダリングの構造改善（Phase 1: flush helper 抽出 完了）
- ADR-006: グループツリーレンダリングへの再構築（Phase A: テスト拡充 完了、Phase B: 本 ADR で具体化）
- ADR-002: マルチトークン範囲マークのレンダリング修正
