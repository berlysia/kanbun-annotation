# ADR-002: マルチトークン範囲マークのレンダリング修正

## ステータス

Proposed

## コンテキスト

`@kanbun/skam-html-renderer` の `comprehensive-rendering.test.ts` で12件のテストが失敗している。これらは `2811abc` コミットで追加された包括テストスイートで、マルチトークン範囲や複合マークのレンダリングに関する既知の実装ギャップを検出している。

### 問題の構造

12件の失敗は、`renderer.ts` 内の**2つの独立した根本原因**に起因する。

### Root Cause A: `getMarksForToken` が中間トークンをスキップ（4テスト）

`getMarksForToken(tokenId, marks)` 関数（renderer.ts:400-446）は、anchor ベースマークの判定において `mark.anchor.from === tokenId || mark.anchor.to === tokenId` のみをチェックしている。

このため、3トークン以上にまたがる範囲マーク `{from: 't1', to: 't3'}` において:

- `t1` (from): マッチする
- `t2` (中間): **マッチしない** ← バグ
- `t3` (to): マッチする

**影響を受けるマークタイプ**: `emphasis`, `okimoji`, `joji`, `kaeri`

**影響を受けないマークタイプ**: `tateten`, `highlight`（独立したグループハンドラ `getTatetenGroups`/`getHighlightGroups` が全トークンを正しくマッピングしている）

**失敗テスト**:

- "3-token range emphasis" — `text-emphasis-style` の出現回数が2（期待: 3以上）
- "3-token okimoji range" — `skam-okimoji` の出現回数が2（期待: 3以上）
- "3-token joji range" — `skam-joji` の出現回数が2（期待: 3以上）
- "3-token kaeri range" — `skam-kaeriten` の出現回数が2（期待: 3以上）

### Root Cause B: 範囲仮名マークのトークンマージが共存マークを破壊（8テスト）

範囲仮名マーク（yomigana/okurigana/soegana）が複数トークンにまたがる場合の処理（renderer.ts:1257-1401）:

1. 先頭トークンのみが `renderToken()` を呼び出す
2. 中間/末尾トークンは `processedTokenIds` に追加され、ループで**完全にスキップ**される
3. trailing marks として収集されるのは `kaeri`, `kutoten`, `ref` の3種のみ
4. `tateten`, `okimoji`, `joji`, `emphasis` のマークは**消失**する

これにより2種類の問題が発生する:

**B-1: 中間トークンの per-token マークが消失（4テスト）**

範囲 yomigana が `t1〜t3` にかかり、`t2` に okimoji が付いている場合:

- `t1` のみが renderToken() を呼ぶ → okimoji は `t2` 上にあるが、`t2` はスキップされる
- trailing marks 収集は kaeri/kutoten/ref のみ → okimoji は収集されない

失敗テスト:

- "range yomigana + okimoji on middle token"
- "range yomigana + joji on middle token"
- "range yomigana + emphasis on middle token"
- "range okurigana + okimoji on middle token"

**B-2: tateten セパレータが範囲仮名マージで消失（4テスト）**

tateten グループと範囲仮名が同じトークン範囲を共有する場合:

- 範囲仮名により複数トークンが1つの `<ruby>` 要素にマージされる
- tateten グループ処理時、`groupTokens` 配列に要素が1つしかない
- `groupTokens.join('<span class="skam-tateten-mark"></span>')` でセパレータが生成されない

失敗テスト:

- "tateten + yomigana: tateten-mark separator preserved"
- "tateten + okurigana: tateten-mark separator preserved"
- "3-token tateten + yomigana: all separators preserved"
- "tateten + soegana: tateten-mark separator preserved"

### 既存のマルチトークン範囲処理パターン

レンダラー内には、マルチトークン範囲を正しく処理しているパターンが既に存在する:

- `getTatetenGroups` (line 451-470): `tokens.findIndex` + `fromIndex..toIndex` ループで全トークンをマッピング
- `getHighlightGroups` (line 685-704): 同パターン
- `getRangeMarkGroups` (line 483-518): 同パターン

`getMarksForToken` のみがこのパターンを採用しておらず、一貫性に欠ける。

## 決定

### Fix A: `getMarksForToken` に中間トークン判定を追加

**方針**: 関数シグネチャに `tokens: Token[]` を追加し、else-branch で `from !== to` の場合にトークンインデックスによる範囲判定を行う。

**理由**:

- 既存の `getTatetenGroups`/`getHighlightGroups` と同じパターンを採用することで一貫性を保つ
- `from === to` の場合は既存の高速等値チェックを維持し、パフォーマンスへの影響を最小化
- `findIndex` が `-1` を返す場合のガード条件を明示的に追加

**波及範囲**:

- `TokenRenderContext` インターフェースに `tokens` フィールド追加
- 呼び出し元2箇所（line 872, 1381）のシグネチャ更新
- ctx 構築箇所（line 1163）で `tokens` を追加

### Fix B1: trailing marks 収集の拡張

**方針**: 範囲仮名マークの trailing marks 収集（line 1376-1401）に `okimoji`, `joji`, `emphasis` を追加。`RangeMarkContext` に対応フィールドを追加し、`renderToken` 内で合算してクラス判定に使用。

**理由**:

- 既存の kaeri/kutoten/ref 収集パターンの自然な拡張
- CSS クラス（`skam-okimoji`, `skam-joji`）はマージされたトークン要素全体に適用すればよいため、個別トークンへの分離は不要
- emphasis のインラインスタイルも同様に、先頭マークの style 値を採用する既存ルールを踏襲

### Fix B2: 範囲仮名 + tateten 重複時のセパレータ保持

**方針**: `renderTokenWithRuby` に `tatetenTokenTexts?: string[]` パラメータを追加。tateten 重複が検出された場合、`<rb>` 内で個別トークンテキストを tateten-mark セパレータで結合して出力する。

出力例:

```html
<ruby>
  <rb class="skam-base">朝<span class="skam-tateten-mark"></span>聞</rb>
  <rt class="skam-ruby">ちょうもん</rt>
</ruby>
```

**理由**:

- `<rb>` は phrasing content を許容するため、内部に `<span>` を配置することは HTML 仕様上有効
- マージされたトークンは tateten group に1要素として入るため、外側の `join()` ではセパレータは生成されないが、`<rb>` 内部にセパレータが存在するためテスト要件を満たす
- 既存の passing test "tateten + yomigana on grouped tokens" は `toContain('skam-tateten-group')` と `toContain('ちょうもん')` を検証しており、本変更後も pass する

**検討した代替案**:

1. **CSS pseudo-element でセパレータを生成**: data 属性でトークン境界位置を持ち、CSS `::after` で描画 → テスト側が `toContain('skam-tateten-mark')` で検証しているため不適合
2. **トークンマージを行わず個別レンダリング**: ruby アノテーションの意味構造が崩れる → 不採用
3. **Post-processing で HTML にセパレータを注入**: 文字列操作でHTML構造を変更するのは脆い → 不採用

## 影響

### メリット

- `comprehensive-rendering.test.ts` の12件の失敗テストが全て pass する
- `getMarksForToken` が他のグループハンドラと同じパターンを使うことで一貫性が向上
- trailing marks 収集の拡張により、今後新しいマークタイプが追加された場合の対応パターンが明確

### リスク・注意点

- `<rb>` 内の `<span>` 要素は HTML 仕様上有効だが、一部のブラウザで ruby レイアウトに影響する可能性がある
  - 対策: Playground での視覚的検証を推奨（本修正のスコープ外）
- `getMarksForToken` に `tokens` パラメータを追加することで、関数の責務が微妙に拡大する
  - 対策: パラメータ追加は最小限に留め、範囲判定のロジックは `from !== to` の条件分岐内に限定

### 変更ファイル

- `packages/skam-html-renderer/src/renderer.ts` — 唯一の変更対象

## 参考

- 失敗テスト: `packages/skam-html-renderer/src/__tests__/comprehensive-rendering.test.ts`
- 関連テスト（リグレッションガード）: `packages/skam-html-renderer/src/__tests__/renderer.test.ts` (100テスト)
- 関連テスト: `packages/skam-html-renderer/src/__tests__/operation-rendering.test.ts` (40テスト)
- MEMORY.md の "Known Renderer Implementation Gaps" セクション
