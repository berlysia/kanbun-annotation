<!-- validated -->

# 改行位置制御 - Phase 1: HTML レンダラー + 共通ロジック

## 概要

漢文の組版規則に従った改行位置制御を HTML レンダラーに実装する。不可分単位（漢字トークン + 付随マーク、tateten グループ、position ベースマーク吸着）を `white-space: nowrap` で保護し、不可分単位間に `<wbr>` を挿入して改行許可位置を明示する。共通の改行判定ロジックは `@kanbun-skam/skam/rendering` に配置する。

関連 ADR: [ADR-014](../decisions/adr-014-line-break-control.md)

## 前提知識

### 現在のレンダラーパイプライン

HTML レンダラーは 2-pass アーキテクチャ:

1. **Pass 1** (`build-render-tree.ts`): `SKAMDocument` の block ごとに `BlockRenderTree` を構築
   - `buildFlatTokenList()` でフラットな `FlatTokenEntry[]` を作成
   - `groupIntoTree()` で tateten/highlight グループにまとめて `RenderNode[]` を生成
   - 結果は `BlockRenderTree = { blockId, blockStartHtml, items: RenderNode[] }`

2. **Pass 2** (`render-tree.ts`): `BlockRenderTree` を走査して HTML 文字列を生成
   - `renderBlockTree()` が `renderNode()` を各ノードに dispatch
   - `renderNode()` は `TokenItem | TatetenGroupNode | HighlightGroupNode` に応じて HTML を出力
   - `renderDisplayLayer()` (renderer.ts) がブロックごとに `<div class="skam-block">` で囲む

### Render tree のノード型 (render-tree-types.ts)

```
RenderNode = TokenItem | TatetenGroupNode | HighlightGroupNode

TokenItem: { type: 'token', token, rangeCtx? }
TatetenGroupNode: { type: 'tateten-group', tateten, items: TokenItem[], rangeCtx? }
HighlightGroupNode: { type: 'highlight-group', highlight, refHtml, items: (TokenItem | TatetenGroupNode)[] }
```

### CSS (styles.ts)

- `.skam-token`: 現在はほぼ空（`position: relative` と `display: inline-block` がコメントアウト）
- `.skam-tateten-group`: `display: inline`
- `.skam-block`: `display: block`
- `.skam-highlight`: `position: relative` + padding
- `.skam-highlight-content`: 縦書き時 `display: inline-block`（傍線描画のため）

### 共通 rendering (`@kanbun-skam/skam/rendering`)

- `mark-groups.ts`: `getTatetenGroups()`, `getHighlightGroups()`, `getRangeMarkGroups()`
- `mark-lookup.ts`: `getMarksForToken()` - token ごとのマーク検索
- `block-utils.ts`: `groupTokensByBlock()` - ブロックごとのトークングルーピング
- `index.ts`: 上記すべてを re-export

### ADR-014 の改行モデル要約

**不可分単位**:

1. トークン + anchor ベース付随マーク（okurigana, soegana, yomigana, saidoku, okimoji, joji）
2. okototen, emphasis, highlight は不可分単位に関与しない
3. kutoten/ref は直前トークンに吸着。ブロック先頭ならブロック先頭の不可分単位に含む
4. tateten グループ全体が 1 つの不可分単位
5. kaeri は `after` で指定されたトークンの不可分単位に吸着

**改行許可位置**: 不可分単位間のみ。ブロック先頭では改行しない。

### highlight の扱い

ADR の決定: 「okototen, emphasis, highlight はトークン境界で分割されても問題がない」。
ユーザーの設計判断: highlight グループ内での改行を許可する。

`HighlightGroupNode` の `items` 間にも `<wbr>` を挿入する。ただし、縦書き時の `.skam-highlight-content` が `display: inline-block` であるため、内部の `<wbr>` が機能しない。これを `display: inline` に変更する必要がある。

傍線の描画方式ごとの影響:

- **solid**: `box-shadow` で実装 → `display: inline` でも折り返しに追従する
- **dotted/dashed/wavy**: `background-image` で実装 → `display: inline` でも折り返しに追従する
- **double**: 現在は `::before`/`::after` + `position: absolute` で実装 → `display: inline` では機能しないため、`background-image` 方式に変更する

## 実装計画

### Step 1: 共通ユーティリティ `canBreakBefore` を `@kanbun-skam/skam/rendering` に追加

**対象ファイル**:

- `packages/skam/src/rendering/line-break.ts` (新規)
- `packages/skam/src/rendering/index.ts` (export 追加)

**内容**:

`line-break.ts` に改行判定関数を定義する。

```typescript
/**
 * ブロック内のトップレベルノード列に対して、index 番目のノードの直前で改行可能かを判定する。
 *
 * 現在の render tree では、ノードが既に不可分単位単位で構築されているため、
 * 判定はノードの位置（index）のみで行う。ノード種別による区別は不要。
 *
 * ルール:
 * - index === 0: ブロック先頭なので改行不可
 * - hasBlockStartContent && index === 1: blockStartHtml（ブロック先頭の kutoten/ref）が
 *   最初の不可分単位に吸着するため改行不可
 * - それ以外: 改行可能
 */
export function canBreakBefore(index: number, hasBlockStartContent: boolean): boolean;
```

判定ロジック:

- `index === 0` → `false`（ブロック先頭改行禁止）
- `hasBlockStartContent && index === 1` → `false`（blockStartHtml はブロック先頭の不可分単位に吸着）
- それ以外 → `true`

`blockStartHtml` は `buildBlockStartHtml()` で生成され、空文字列か kutoten/ref の HTML スパンのみを返す。空白文字は含まない。`length > 0` での判定で正確。

`index.ts` に `canBreakBefore` を export に追加する。

### Step 2: HTML レンダラーの render-tree.ts に `<wbr>` 挿入を実装

**対象ファイル**:

- `packages/skam-html-renderer/src/render-tree.ts`

**内容**:

`renderBlockTree()` 関数を変更して、各ノード間に `<wbr>` を条件付きで挿入する。

現在の実装:

```typescript
export function renderBlockTree(tree: BlockRenderTree, ctx: RenderTreeContext): string {
  const parts = [tree.blockStartHtml];
  for (const node of tree.items) {
    parts.push(renderNode(node, ctx));
  }
  return parts.join('');
}
```

変更後:

```typescript
import { canBreakBefore } from '@kanbun-skam/skam/rendering';

export function renderBlockTree(tree: BlockRenderTree, ctx: RenderTreeContext): string {
  const hasBlockStartContent = tree.blockStartHtml.length > 0;
  const parts = [tree.blockStartHtml];

  for (let i = 0; i < tree.items.length; i++) {
    const node = tree.items[i]!;
    if (canBreakBefore(i, hasBlockStartContent)) {
      parts.push('<wbr>');
    }
    parts.push(renderNode(node, ctx));
  }
  return parts.join('');
}
```

**highlight グループ内の改行**: `renderHighlightGroupNode()` 内でも、子ノード間に `<wbr>` を挿入する。highlight 内の先頭（index === 0）では改行しない。

```typescript
function renderHighlightGroupNode(node: HighlightGroupNode, ctx: RenderTreeContext): string {
  const { prefix } = ctx;
  const style = node.highlight.style ?? 'solid';
  const styleClass = ` ${prefix}-highlight--${style}`;

  const contentParts: string[] = [];

  for (let i = 0; i < node.items.length; i++) {
    const child = node.items[i]!;
    // highlight グループ内: 先頭以外では改行可能
    if (i > 0) {
      contentParts.push('<wbr>');
    }
    if (child.type === 'token') {
      const result = callRenderToken(child, ctx);
      contentParts.push(result.html);
    } else {
      contentParts.push(renderTatetenGroup(child, ctx));
    }
  }

  return `<span class="${prefix}-highlight${styleClass}" data-style="${style}"><span class="${prefix}-highlight-content">${node.refHtml}${contentParts.join('')}</span></span>`;
}
```

### Step 3: CSS 変更

**対象ファイル**:

- `packages/skam-html-renderer/src/styles.ts`

**3a: `.skam-token` に `white-space: nowrap` を追加**

不可分単位（トークン + suffix-row 内の送り仮名・返り点・句読点）の内部での改行を禁止する。

変更後:

```css
:where(.${prefix}-token) {
  /* 不可分単位: トークンとその付随マーク（suffix-row 内の送り仮名・返り点・句読点）の
   * 間での改行を禁止する。改行許可位置は <wbr> で明示的に指定する。
   * 子要素に継承されるが、suffix-row (display: inline-grid) は独立した
   * フォーマッティングコンテキストを生成するため、grid レイアウトに悪影響はない。 */
  white-space: nowrap;
}
```

**3b: `.skam-tateten-group` に `white-space: nowrap` を追加**

tateten グループ全体が 1 つの不可分単位であり、内部のトークン間での改行を禁止する。

変更後:

```css
:where(.${prefix}-tateten-group) {
  display: inline;
  /* 不可分単位: tateten グループ内のトークン間での改行を禁止する。 */
  white-space: nowrap;
}
```

**3c: `.skam-highlight-content` を `display: inline` に変更（縦書き）**

highlight グループ内での改行を許可するため、`display: inline-block` を `display: inline` に変更する。`inline-block` はブロックフォーマッティングコンテキストを生成し、内部の `<wbr>` が改行機会として機能しないため。

変更前:

```css
/* 縦書き */
:where(.${prefix}-highlight-content) {
  display: inline-block;
  position: relative;
}
```

変更後:

```css
/* 縦書き */
:where(.${prefix}-highlight-content) {
  display: inline;
}
```

**double スタイルの代替実装**: `display: inline` では `::before`/`::after` + `position: absolute` が機能しない。そこで double スタイルも `background-image` ベースに変更し、dotted/dashed と同じ方式に統一する。これにより全5スタイルが `display: inline` で改行可能になる。

```css
:where(.${prefix}-highlight-content) {
  display: inline;
}
```

double スタイルの変更:

```css
/* 変更前: ::before/::after + position: absolute */
/* 変更後: background-image で2本線を描画 */

/* 縦書き: 右側に2本縦線 */
:where(.${prefix}-highlight[data-style='double']) > :where(.${prefix}-highlight-content) {
  box-shadow: none;
  background-image: linear-gradient(
    to left,
    currentColor 1px,
    transparent 1px 2px,
    currentColor 2px 3px,
    transparent 3px
  );
  background-repeat: repeat;
  background-position: right;
}

/* 横書き: 下側に2本横線 */
:where(.${prefix}-highlight[data-style='double']) > :where(.${prefix}-highlight-content) {
  box-shadow: none;
  background-image: linear-gradient(
    to top,
    currentColor 1px,
    transparent 1px 2px,
    currentColor 2px 3px,
    transparent 3px
  );
  background-repeat: repeat;
  background-position: bottom;
}
```

double スタイルの `::before`/`::after` ルールは削除する。

### Step 4: テスト追加

**対象ファイル**:

- `packages/skam/src/rendering/__tests__/line-break.test.ts` (新規)
- `packages/skam-html-renderer/src/__tests__/line-break.test.ts` (新規)

**共通ユーティリティのテスト** (`packages/skam/src/rendering/__tests__/line-break.test.ts`):

```typescript
describe('canBreakBefore', () => {
  it('index === 0 → false（ブロック先頭改行禁止）', ...);
  it('index === 1, hasBlockStartContent=true → false（blockStart 吸着）', ...);
  it('index === 1, hasBlockStartContent=false → true', ...);
  it('index >= 2, hasBlockStartContent=true → true', ...);
  it('index >= 2, hasBlockStartContent=false → true', ...);
});
```

**HTML レンダラーのテスト** (`packages/skam-html-renderer/src/__tests__/line-break.test.ts`):

既存のテストパターン（`build-render-tree.test.ts` のヘルパー構造）を参考に:

```typescript
describe('line break control in HTML output', () => {
  // <wbr> 挿入
  it('2トークン・マークなし → トークン間に <wbr> が挿入される', ...);
  it('ブロック先頭のトークン前には <wbr> なし', ...);
  it('tateten グループ内部には <wbr> なし', ...);
  it('tateten グループの前後に <wbr> あり', ...);
  it('highlight グループ内の子ノード間に <wbr> あり', ...);
  it('blockStartHtml（kutoten/ref）がある場合、最初のトークン前に <wbr> なし', ...);
  it('blockStartHtml + 次のトークンが不可分単位として結合されている', ...);

  // CSS
  it('white-space: nowrap が .skam-token に適用されている', ...);
  it('white-space: nowrap が .skam-tateten-group に適用されている', ...);
  it('highlight-content が全スタイルで display: inline', ...);
  it('highlight double が background-image で描画される', ...);
});
```

CSS テストは `getDefaultStyles()` / `generateCSS()` の出力文字列を検証する。HTML テストは `render()` / `renderHTML()` の出力に `<wbr>` が適切な位置に存在することを検証する。

### Step 5: ビルド・テスト・型チェックの確認

```bash
pnpm typecheck
pnpm test
pnpm build
```

全パッケージでエラーがないことを確認する。

## リスクと軽減策

| リスク                                                        | 影響度 | 軽減策                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `white-space: nowrap` がレイアウトを壊す                      | 高     | `.skam-token` は inline レベル要素であり、内部に block レベル要素はない。suffix-row（`display: inline-grid`）は独立したフォーマッティングコンテキストを生成するため、grid レイアウトに悪影響はない。Playground で目視確認                                                               |
| `<wbr>` が既存の HTML スナップショットテストを壊す            | 中     | 既存テストは主に render tree 構造をテストしており、HTML 文字列の完全一致テストは少ない。HTML 出力テストがある場合はスナップショットを更新する                                                                                                                                           |
| highlight-content の `display: inline` 変更で傍線描画が崩れる | 中     | solid は `box-shadow`、dotted/dashed/wavy/double は `background-image` で実装。いずれも `display: inline` で各行フラグメントに追従する。double は `::before`/`::after` から `background-image` に変更するため、描画の見た目が微妙に変わる可能性あり。Playground で全5スタイルを目視確認 |
| 縦書きでの `<wbr>` のブラウザ互換性                           | 低     | `<wbr>` は広くサポートされている。`writing-mode: vertical-rl` との組み合わせでのエッジケースは Playground で主要ブラウザ（Chrome, Firefox, Safari）で確認                                                                                                                               |
| Canvas レンダラーとの共通化が不十分                           | 低     | Phase 1 では `canBreakBefore()` のみを共通化。Canvas レンダラーの `maxExtent` 実装（Phase 2）では同じ関数を使用可能                                                                                                                                                                     |

## 検証方法

### 自動テスト

1. **共通ロジックの単体テスト**: `canBreakBefore()` の各条件分岐を網羅
2. **HTML 出力の統合テスト**: `render()` / `renderHTML()` の出力に `<wbr>` が正しい位置に存在するか検証
3. **CSS テスト**: `generateCSS()` の出力に `white-space: nowrap` と `display` の設定が含まれるか検証
4. **既存テストの回帰**: `pnpm test` で全パッケージのテストが通ることを確認

### 手動テスト (Playground)

1. `pnpm playground:dev` で開発サーバーを起動
2. ブラウザのビューポート幅を狭くして改行が発生する状態にする
3. 以下を確認:
   - 漢字と送り仮名が分離されないこと
   - tateten グループ（熟語）が途中で分割されないこと
   - 句読点が行頭に来ないこと（直前トークンに吸着）
   - highlight 内のトークン間で改行が発生すること（全5スタイル）
   - 既存の表示（改行が発生しない十分な幅）が変わらないこと
   - 縦書き・横書き両方で正しく動作すること
