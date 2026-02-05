# ADR-001: オペレーション→レンダラー統合テストの導入

## ステータス

Proposed

## コンテキスト

SKAM プロジェクトには2つの独立したテスト層が存在する:

1. **モデルオペレーションテスト** (`@kanbun/skam`): CRUD操作（addMark, removeMark, updateMark, replaceMark）後のドキュメントモデルの妥当性を `assertValidDocument` で検証
2. **レンダラーテスト** (`@kanbun/skam-html-renderer`): 固定ドキュメントを入力としたHTML出力の正しさを検証

しかし、両者の間に**統合テスト層が欠落**している。具体的には:

- オペレーション適用後のドキュメントをレンダラーに渡した結果が、操作内容を正しく反映しているか
- 例: `addMark(doc, kaeriMark)` → `render(result)` で返り点要素が出力に含まれるか
- 例: `removeMark(doc, 'm1')` → `render(result)` で該当マーク要素が消えているか

Playground のシナリオテスト（`scenarios.test.ts`）はモデル層でのCRUD連鎖を検証しているが、レンダリング結果の検証は行っていない。ユーザーに見える最終出力の正しさを保証するには、この統合層が必要である。

## 決定

### テスト配置

**`@kanbun/skam-html-renderer` パッケージ内**に統合テストファイルを新設する。

理由:

- `@kanbun/skam-html-renderer` は既に `@kanbun/skam` を依存として持っている
- オペレーション関数を `devDependencies` 経由ではなく直接 import 可能
- レンダラーのテストインフラ（Vitest, happy-dom）をそのまま利用可能
- 新パッケージ作成の必要がない

### テスト戦略

**before/after パターン**: 各テストで操作前後のドキュメントを `render()` し、HTML出力の差分を検証する。

```
初期ドキュメント → render() → 操作前HTML
    ↓ 操作適用
操作後ドキュメント → render() → 操作後HTML
    ↓
操作前HTMLに含まれない要素が操作後HTMLに含まれる（add）
操作前HTMLに含まれる要素が操作後HTMLに含まれない（remove）
操作前HTMLの値が操作後HTMLで変更されている（update/replace）
```

### アサーション方式

HTML文字列に対する `toContain` / `not.toContain` を主に使用する。既存レンダラーテストと同じスタイルを踏襲。

検証対象:

- CSS クラス名の出現/消滅（`.skam-kaeriten`, `.skam-ruby`, `.skam-emphasis` 等）
- テキストコンテンツ（返り点Unicode文字、仮名文字列等）
- HTML構造要素（`<ruby>`, `<rt>`, `<sup>` 等）
- data 属性（`data-style`, `data-saidoku-n` 等）

### カバレッジ方針

全13種のMarkタイプに対し、最低限 add/remove の2操作を検証する。加えて、以下の複合シナリオを含む:

- updateMark による値変更
- replaceMark による型変更
- removeHighlightWithRef による連動削除
- 複数マークの共存と個別操作

### スナップショットテスト不採用

理由:

- 既存テストが `toContain` ベースで統一されている
- HTML出力のフォーマット変更に対して脆い
- 操作の「効果」を検証する目的にはピンポイントアサーションが適切

## 影響

### メリット

- オペレーション→レンダリングのパイプライン全体の正しさを保証
- レンダラーのリファクタリング時にオペレーション互換性を検出
- Playground の操作シナリオと対応するテストが存在することで回帰検出が可能

### リスク・注意点

- レンダラーの内部HTML構造に依存するテストは、レンダラーリファクタ時に壊れやすい
  - 対策: CSS クラスやテキストコンテンツレベルでの検証に留め、DOM構造の詳細に依存しない
- テスト数の増加によるCI時間への影響
  - 対策: 既存テストと同等の粒度を維持、不必要な冗長テストは避ける

## 参考

- 既存オペレーションテスト: `packages/skam/src/__tests__/operations/`
- 既存レンダラーテスト: `packages/skam-html-renderer/src/__tests__/renderer.test.ts`
- Playgroundシナリオ: `packages/skam/src/__tests__/operations/scenarios.test.ts`
