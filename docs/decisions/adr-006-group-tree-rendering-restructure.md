---
status: Complete
---

# ADR-006: Display 層グループツリーレンダリングへの再構築

## コンテキスト

### 背景

ADR-005 で display 層レンダリングの構造改善を段階的に進める方針を決定した。Phase 1（フラッシュヘルパーの抽出）は完了し、`flushTatetenGroup` と `flushHighlightGroup` が抽出された。

Phase 1 により、フラッシュ操作の依存連鎖（`groupTokens` → `highlightTokens` → `renderedTokens`）はヘルパー内で保証されるようになった。しかし、ステートマシン自体の構造的課題は残っている。

本 ADR は ADR-005 の Phase 2（テストカバレッジ拡充）と Phase 3（グループツリー再構築）を具体化する。

### 現状の課題

#### ステートマシンの残存する複雑性

Phase 1 で抽出されたヘルパーにより、フラッシュ順序バグのリスクは低減した。しかし `renderDisplayLayer` には依然として以下の課題がある:

1. **8 箇所のフラッシュサイト**: ヘルパー呼び出しは統一されたが、各サイトでの `toHighlightBuffer` / `resetGroup` パラメータの選択は手動判断が必要
2. **`processedTokenIds` とステートマシンの干渉**: 範囲仮名マークが複数トークンをマージする際のスキップが、たて点/highlight のグループ判定と予期せぬ相互作用を引き起こすリスクが残る
3. **新マークタイプ追加の障壁**: 新しいグループ系マークタイプの追加時に、ステートマシン全体の理解が依然として必要

#### テストカバレッジの不足

`highlight-tateten-kun.test.ts` が複合ケースの主要なテストファイルだが、以下のケースが未カバー:

- 範囲仮名 + たて点 + emphasis（二重装飾）
- 範囲仮名 + highlight + ref（参照解決の複合コンテキスト）
- 範囲仮名 + kutoten の配置（範囲グループ内の句読点）
- 範囲仮名 + okimoji/joji の保持（範囲内中間トークンのマーク）
- マルチブロック文書での複合ケース
- プロファイル × 複合ケースの相互作用
- インタラクティブモードでの複合ケース

## 決定

### フェーズ構成

ADR-005 の Phase 1 完了を踏まえ、以下の 2 フェーズで進める。

#### Phase A: テストカバレッジ拡充

グループツリー再構築の前提条件として、現行レンダラーの振る舞いを包括的にテストで保証する。

**必須テストケース**:

1. **三要素複合**: 範囲仮名(yomigana/okurigana/soegana) × たて点 × emphasis（各仮名タイプで 1 ケースずつ、計 3 件）
2. **highlight + ref 複合**: 範囲仮名 + highlight(ref 付き)（1 件）
3. **kutoten 配置**: 範囲仮名グループ隣接の kutoten 配置（1 件）
4. **okimoji/joji 複合**: 範囲内に okimoji/joji を含むケース（各 1 件、計 2 件）
5. **マルチブロック**: ブロック境界をまたぐ highlight グループ（1 件）
6. **プロファイル相互作用**: learningBasic プロファイルでの複合ケース（1 件）
7. **インタラクティブモード**: `data-token-from/to` 属性と複合グループの組み合わせ（1 件）
8. **四要素複合**: 範囲仮名 + たて点 + emphasis + highlight(ref 付き)（1 件）
9. **saidoku 複合**: saidoku + okurigana/yomigana（再読文字の各回読みと仮名の組み合わせ）（1 件）

**最低 11 件の新規テストケース** を追加する。

**テストの書き方**:

- 既存の `highlight-tateten-kun.test.ts` のパターンに従う
- スナップショットアサーションを使用し、HTML 出力の正確性を保証
- 各テストケースにはコメントで複合要素の組み合わせを明記

#### Phase B: グループツリーレンダリングへの再構築

ステートマシンを廃し、2パスアプローチでレンダリングする。

**Pass 1: グループツリー構築**

トークンとマークからネストされたグループ構造を事前計算する:

```typescript
type RenderNode = TokenItem | TatetenGroup | HighlightGroup;

interface BlockRenderTree {
  items: RenderNode[];
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

interface TokenItem {
  type: 'token';
  token: Token;
  rangeCtx?: RangeMarkContext;
  marks: Map<MarkType, Mark[]>;
}
```

**`buildBlockRenderTree` の責務**:

1. 範囲仮名マークによる TokenItem のマージ（現行の `processedTokenIds` 処理に相当）
2. たて点マークによる TatetenGroup の構築
3. highlight マークによる HighlightGroup の構築（たて点グループを内包する可能性あり）
4. position-based marks（kutoten, kaeri, ref）の適切な配置位置決定
5. ネスト優先順位: highlight > tateten > token（ADR-002 の規則に従う）

**Pass 2: ツリーレンダリング**

構築済みのツリーを再帰的に走査して HTML を生成する。`FlushState`・アキュムレータ・`processedTokenIds` によるスキップは不要になる。

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

**実装手順**:

1. `buildBlockRenderTree(block, tokens, marks, ctx)` 関数を新規作成
2. `renderBlockTree(tree, ctx)` 関数を新規作成
3. 既存の `renderDisplayLayer` 内に新旧実装の切り替えを導入し、テスト環境で新実装を検証
4. 全テスト pass を確認後、新実装をデフォルトに変更
5. 旧ステートマシンコードを削除

### Phase B への移行基準

以下の条件が**すべて**満たされた場合に Phase B を開始する:

1. **テストカバレッジ**: Phase A の必須テストケース（10 件以上）がすべて追加・pass している
2. **安定性**: Phase A 完了後、フラッシュ関連またはグループ関連のバグ報告がない状態が 2 週間以上続いている（ADR-005 の 1 ヶ月から短縮: Phase A で包括的テストカバレッジが確立されるため、安定性の早期確認が可能）
3. **動機**: 以下のいずれかに該当する
   - 新しいグループ系マークタイプの追加が具体的に計画されている
   - ステートマシンの複雑性が新たなバグの原因となった
   - コード保守性の課題（新規コントリビュータのオンボーディング困難、レビュー時間の増大等）が記録されている

## 影響

### positive

- Phase A のテスト拡充により、現行レンダラーの振る舞いが包括的に保証される
- Phase B によりフラッシュ依存バグが構造的に発生不可能になる
- グループ化ロジックを単体テスト可能になり、HTML 生成と分離される
- 新しいグループ系マークタイプはツリーノード型の追加で対応可能になる
- ツリー構造の可視化によりデバッグが容易になる
- グループ化と HTML 生成の分離により、新規コントリビュータにとってアーキテクチャが理解しやすい

### negative

- Phase A のテスト作成に工数が必要（ただしこれは将来のリファクタリングの安全性を保証する投資）
- Phase B は約 400 行の大規模リファクタリングであり、新しいレンダリングバグを導入するリスクがある
- 2パス方式により中間ツリーのメモリ割り当てが微増する（実用上は無視可能）
- Phase B 完了後、内部アーキテクチャドキュメントの更新が必要

### 変更対象

| パッケージ         | ファイル                                      | 変更内容                                                |
| ------------------ | --------------------------------------------- | ------------------------------------------------------- |
| skam-html-renderer | `src/renderer.ts`                             | Phase B: ステートマシン → ツリー構築 + 再帰レンダリング |
| skam-html-renderer | `src/types.ts` (新規)                         | Phase B: `RenderNode`, `BlockRenderTree` 等の型定義     |
| skam-html-renderer | `src/__tests__/compound-marks.test.ts` (新規) | Phase A: 複合マークの包括的テスト                       |
| skam-html-renderer | `src/__tests__/render-tree.test.ts` (新規)    | Phase B: ツリー構築ロジックの単体テスト                 |

## 参考

- ADR-005: Display 層レンダリングの構造改善（Phase 1 完了、本 ADR の前提）
- ADR-002: マルチトークン範囲マークのレンダリング修正
- `renderDisplayLayer` 関数: `packages/skam-html-renderer/src/renderer.ts`
- 既存複合テスト: `highlight-tateten-kun.test.ts`
