---
status: Complete
plan: plan-line-break-control.md
---

<!-- validated -->

# ADR-014: 改行位置制御

## コンテキスト

### 問題

現在の SKAM レンダラーでは改行位置の制御が実装されていない。

- **HTML レンダラー**: ブラウザのデフォルト折り返しに完全依存。CJK 文字列では各文字の前後で自由に改行されるため、漢字と送り仮名が分断される、句読点が行頭に来る、熟語（tateten グループ）が途中で分割される等の問題が発生する。
- **Canvas レンダラー**: 1 列レイアウト固定。`maxExtent` オプションの型定義は存在するが未実装。折り返し自体がない。

### 漢文の改行規則

漢文の組版には以下の改行規則がある:

1. **不可分単位**: 漢字トークンとその付随マーク（送り仮名・添え仮名・読み仮名・返り点）は分離不可
2. **position ベースマークの吸着**: 句読点（kutoten）および参照（ref）は直前のトークンに吸着し、分離不可
3. **改行可能位置**: 漢字の直上（縦書きでは列の上方向、つまりトークンの前）のみ
4. **熟語の保護**: tateten マークで結合された複数トークン（熟語）は分割不可
5. **不可分単位の境界に影響しないマーク**: okototen, emphasis, highlight はトークン範囲に対して適用される装飾・注記であり、トークン境界で分割されても視覚的・意味的に問題が生じないため、改行判定には関与しない

### 現状のレンダラー構造

両レンダラーとも render tree を構築し、そこからレイアウト・描画を行う:

- HTML: `build-render-tree.ts` → `render-tree.ts` → HTML 文字列
- Canvas: `render-tree.ts` → `layout-vertical.ts` → Canvas 描画

tateten グループは既に `TatetenGroupNode` / `CanvasTatetenGroupNode` としてグルーピング済み。

## 検討した選択肢

### Option A: CSS ベース（HTML のみ）

CSS の `word-break`, `line-break`, `overflow-wrap` 等で制御。

- 利点: 宣言的、ブラウザの組版エンジンに委任
- 欠点: CJK 縦書きでの CSS 改行制御はブラウザ間の差異が大きい。漢文固有の「漢字の直上のみ改行可」ルールを CSS だけで正確に表現するのは困難。Canvas レンダラーには適用不可

### Option B: 改行可能位置の明示マーキング

render tree の構築時に「ここで改行してよい」というマーカーを挿入。不可分単位は nowrap コンテナで保護。

- HTML: `<wbr>` 要素で改行許可位置を明示 + 不可分単位を `display: inline-block` または `white-space: nowrap` で保護
- Canvas: レイアウトアルゴリズムで改行許可位置を参照し、`maxExtent` 超過時に列を分割
- 利点: 両レンダラーで統一的なモデル。改行ルールをロジックで正確に制御可能
- 欠点: render tree に新しいノード種を追加する必要がある

### Option C: Block 分割による行制御

SKAM データモデルの block を「1 行分」として再定義し、データ層で行を制御。

- 利点: レンダラー側の変更が最小限
- 欠点: block の意味が「段落」から「行」に変質する。データ変換が必要で、元のテキスト構造が失われる。改行位置はビューポートサイズに依存するため、データモデルに焼き込むのは不適切

## 決定

**Option B: 改行可能位置の明示マーキング** を採用する。

### 改行モデル

#### 不可分単位（Line Break Unit）

以下を 1 つの不可分単位として扱い、内部での改行を禁止する:

1. **トークン単位**: 漢字トークン + anchor ベースの付随マーク（okurigana, soegana, yomigana, saidoku, okimoji, joji）。これらはトークンの読み・意味に直結し、分離すると情報が失われる
2. **不可分単位の構成に関与しないマーク**: okototen, emphasis, highlight はトークン範囲に適用される装飾であり、トークン境界で分割されても視覚的・意味的に問題が生じないため、不可分単位の構成には関与しない。tateten もマーク自体は装飾的性質を持つが、グループ化を引き起こすため別途処理される（項目4参照）
3. **Position ベースマークの吸着**: kutoten と ref は直前のトークン単位に吸着。ブロック先頭に配置される場合（`after` なし）は、ブロック先頭の不可分単位の一部として扱う（前ブロックには吸着しない）
4. **Tateten グループ**: tateten マークで結合された複数トークン（+ 各トークンの付随マーク + 吸着する kutoten/ref + グループ内の kaeri）は 1 つの不可分単位
5. **Kaeri の扱い**: kaeri は position ベースだが `after` で指定されたトークンの不可分単位に吸着する。tateten グループ内のトークンを `after` で指定する kaeri はグループ全体の不可分単位に含まれる（グループの途中で改行されることはない）。`after` なし（ブロック先頭）の kaeri はブロック先頭の不可分単位に含まれる

#### 改行許可位置

不可分単位と不可分単位の間にのみ改行を許可する。具体的には:

- 不可分単位の直前（縦書きでは上側、横書きでは左側）
- ブロック先頭では改行しない（ぶら下がり禁止）
- ブロック末尾の不可分単位の直後では改行しない（当然だが明記）

#### Render tree の変更

共通の render tree ユーティリティ（`@kanbun-skam/skam/rendering` または各レンダラー）に改行許可判定ロジックを追加:

```
canBreakBefore(node, index, siblings): boolean
```

##### HTML レンダラー

- 改行許可位置に `<wbr>` 要素を挿入
- 不可分単位を `white-space: nowrap` で保護（既存の `.skam-token` スタイルに追加）
- tateten グループ（`.skam-tateten-group`）にも `white-space: nowrap` を適用
- 縦書き（`writing-mode: vertical-rl`）・横書き両方で動作

##### Canvas レンダラー

- `maxExtent` オプションを実装（使用可能な列の高さ / 行の幅）
- レイアウト時に改行許可位置を判定し、`maxExtent` を超過する場合に列 / 行を分割
- 改行なし（`maxExtent` 未指定）の場合は現行動作を維持
- 縦書き・横書き両方で動作（横書きレイアウトは別途実装前提）

## 影響

### ポジティブ

- 漢文の組版規則に従った正しい改行が実現
- HTML / Canvas 両レンダラーで統一的な改行モデル
- 既存の tateten グループ化ロジックを活用可能
- `maxExtent` 未指定時は現行動作と完全互換

### ネガティブ

- render tree に改行関連のノード/マーカーが追加される
- Canvas レンダラーのレイアウトアルゴリズムが複雑化
- 句読点の吸着処理で render tree 構築ロジックの変更が必要

## 参考

- [SKAM-draft.md](../../SKAM-draft.md) - SKAM v0.1 仕様
- [ADR-007](adr-007-implement-group-tree-rendering.md) - グループツリーレンダリング実装
- [ADR-008](adr-008-aki-gumi-spacing.md) - アキ組スペーシング
- CSS Writing Modes Level 4 - `writing-mode: vertical-rl`
- CSS Text Level 3 - `word-break`, `line-break`, `overflow-wrap`
- JIS X 4051 - 日本語組版処理規格（行頭禁則・行末禁則）
