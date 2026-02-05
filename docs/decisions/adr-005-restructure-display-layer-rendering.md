# ADR-005: Display 層レンダリングの構造改善

## ステータス

Proposed

## コンテキスト

### 問題

`@kanbun/skam-html-renderer` の `renderDisplayLayer` 関数（renderer.ts:~1195-1631）は、トークンを逐次処理するステートマシンにより HTML を生成している。このステートマシンはネストされた3つのアキュムレータを管理する:

1. `groupTokens[]` - たて点グループのアキュムレータ
2. `highlightTokens[]` - 傍線グループのアキュムレータ
3. `renderedTokens[]` - 最終出力

これらにはフラッシュの依存連鎖が存在する: `groupTokens` → `highlightTokens` → `renderedTokens`。ステートマシンは `currentTatetenGroup`、`currentHighlightGroup`、`processedTokenIds` を追跡し、各トークンの所属グループを逐次判定する。

### 直近のバグ（動機）

ADR-002 で修正したマルチトークン範囲レンダリングの12件のバグに加え、highlight グループのクローズ条件に関するバグを2件修正した:

- highlight グループの終了判定が `highlightTokens.length > 0` のみをチェックし、まだフラッシュされていない `groupTokens`（たて点グループ内のトークン）を見落としていた
- highlight グループの終了時に `groupTokens` をフラッシュせずに `highlightTokens` をフラッシュしていたため、たて点グループが不完全な状態で出力されていた

これらのバグは、フラッシュ依存連鎖が暗黙的であることに起因する。コード上には6箇所のたて点フラッシュサイトと3箇所の highlight フラッシュサイトが散在しており、各サイトで正しい順序のフラッシュを手動で保証する必要がある。

### 構造的課題

1. **`processedTokenIds` とステートマシンの干渉**: 範囲仮名マーク（yomigana/okurigana/soegana）が複数トークンをマージする際に `processedTokenIds` でスキップするが、このスキップがたて点/highlight のグループ判定と予期せぬ相互作用を引き起こす
2. **フラッシュの暗黙的依存**: `groupTokens` → `highlightTokens` → `renderedTokens` のフラッシュ順序が暗黙的で、各フラッシュサイトで手動保証が必要
3. **新マークタイプ追加の障壁**: 新しいグループ系マークタイプを追加する場合、既存のステートマシン全体を理解した上で全フラッシュサイトを正しく更新する必要がある
4. **テスト困難性**: グループ構造の構築とHTMLの生成が密結合しており、グループ化ロジック単体のテストが困難

## 検討した選択肢

### A) フラッシュヘルパーの抽出（中間ステップ）

現行のステートマシン構造を維持しつつ、フラッシュ操作をヘルパー関数に抽出する。

**具体的な変更**:

- `flushTatetenGroup(groupTokens, tatetenMark, ctx) → string` を抽出
- `flushHighlightGroup(highlightTokens, highlightMark, ctx) → string` を抽出
- 各フラッシュサイトでヘルパーを呼び出すよう統一
- フラッシュヘルパー内で依存連鎖（たて点 → highlight の順）を保証

**利点**:

- 変更量が少なく、リグレッションリスクが低い
- フラッシュ忘れ・順序ミスのバグが減少（ヘルパー内で順序保証）
- 既存テストが全てそのまま pass する可能性が高い
- 段階的に適用可能

**欠点**:

- ステートマシン自体は残るため、根本的な複雑性は解消されない
- `processedTokenIds` との相互作用問題は残る
- 新マークタイプ追加時の認知負荷は大きく変わらない

### B) グループ構造の事前計算 + ツリーレンダリング（完全な再構築）

2パスアプローチ: Phase 1 でグループツリーを構築し、Phase 2 でツリーを再帰的にレンダリングする。

**Phase 1: グループツリー構築**

トークンとマークからネストされたグループ構造を事前計算する:

```typescript
interface BlockRenderGroup {
  items: (TokenItem | TatetenGroup | HighlightGroup)[];
}

interface TatetenGroup {
  tateten: TatetenMark;
  items: TokenItem[];
}

interface HighlightGroup {
  highlight: HighlightMark;
  items: (TokenItem | TatetenGroup)[];
}

interface TokenItem {
  token: Token;
  rangeCtx?: RangeMarkContext; // マージされた範囲仮名情報
  marks: Map<string, Mark[]>;
}
```

**Phase 2: ツリーレンダリング**

構築済みのツリーを再帰的に走査して HTML を生成する。アキュムレータもステートマシンも不要。

**利点**:

- 関心の分離: グループ化ロジックと HTML 生成が独立
- フラッシュ依存バグが構造的に発生不可能（ツリー構造がネストを表現）
- グループ化ロジックを単体テスト可能
- 新しいグループ系マークタイプはツリーノード型の追加で対応（ステートマシン全体の理解は不要）
- `processedTokenIds` のスキップがツリー構築時に処理され、レンダリング時には影響しない

**欠点**:

- 約400行の大規模リファクタリング
- 新しいレンダリングバグを導入するリスクがある
- リファクタリング前に包括的なスナップショット/リグレッションテストが必要
- 2パス方式により中間ツリーのメモリ割り当てが微増する（実用上は無視可能）

## 決定

**選択肢 A（フラッシュヘルパー抽出）を中間ステップとして先に実装し、選択肢 B（グループ構造の事前計算）を将来のリファクタリングタスクとする。**

### 理由

1. **リスク管理**: 選択肢 B は大規模リファクタリングであり、十分なテストカバレッジが前提条件となる。現時点では highlight + たて点の複合ケースのテストが不足しており、先にテストを充実させる必要がある
2. **段階的改善**: 選択肢 A でフラッシュ操作を集約することで、現在の6+3箇所のフラッシュサイトにおけるバグリスクを即座に低減できる
3. **準備としての A**: フラッシュヘルパーの抽出過程でフラッシュ依存関係が明示化され、選択肢 B のツリー構造設計に必要な知見が得られる
4. **現行パッチの妥当性**: 直近の2件のバグ修正（`|| groupTokens.length > 0` の追加）は正しく機能しており、選択肢 A による構造化で十分に安定する

### 実装順序

1. **Phase 0（完了済み）**: 直近のバグ修正パッチ適用
2. **Phase 1**: 選択肢 A — フラッシュヘルパーの抽出と統一
3. **Phase 2（将来）**: テストカバレッジの拡充（highlight + たて点 + 範囲仮名の複合ケース）
4. **Phase 3（将来）**: 選択肢 B — グループツリーへの再構築

## 影響

### positive

- フラッシュ操作の集約により、フラッシュ順序バグの発生確率が低下
- 将来の完全再構築（選択肢 B）への移行パスが明確
- 段階的なアプローチにより、各ステップでのリグレッションリスクを最小化

### negative

- 選択肢 A は根本的な複雑性を解消しない（中間ステップに過ぎない）
- 選択肢 B の実装時期が未定のまま残る
- 2段階のリファクタリングにより、トータルの作業量は選択肢 B の直接実装より多くなる可能性がある

### 変更対象

- `packages/skam-html-renderer/src/renderer.ts` — 主要な変更対象
- `packages/skam-html-renderer/src/__tests__/` — テストカバレッジ拡充

## 参考

- ADR-002: マルチトークン範囲マークのレンダリング修正（先行する修正）
- `renderDisplayLayer` 関数: `packages/skam-html-renderer/src/renderer.ts` (~line 1195-1631)
- 既存テスト: `comprehensive-rendering.test.ts`, `renderer.test.ts`, `operation-rendering.test.ts`
