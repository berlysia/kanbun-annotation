# Canvas Renderer 縦書きレイアウト修正計画

## Context

Canvas renderer の縦書きレイアウトに5つの深刻なバグがある（詳細: `docs/plans/plan-canvas-renderer-layout-fixes.md`）。
根本原因は2つ: (A) グリッドモデルの誤り、(B) 単一カラムレイアウト。

### 現在のグリッド vs 修正後

```
現在:   [saidoku2(R)] [kaeri(R)] [BASE(F)] [kutoten(R)] [okuri/ruby(R)]
         gridWidth = 4R + F, baseCenterX = 2R + F/2

修正後: [saidoku2(R)] [kaeri(R)] [BASE(F)] [okuri/ruby(R)]
         gridWidth = 3R + F, baseCenterX = 2R + F/2
         kutoten は base の下方に配置（HTML suffix-row のインライン配置と同等）
```

ruby/okuri の距離: base 右端→ruby 中心 = R/2（現在は 1.5R → R 分改善）

### HTML suffix-row 構造の分析

HTML の `.suffix-row` は `display: inline-grid` で `grid-template-rows: R R R R`（4行）。
vertical-rl では `grid-template-rows` がブロック方向（横方向、右→左）に展開される:

```
suffix-row (vertical-rl でのブロック方向展開、右→左):
  row1 (rightmost): okuri/soegana  font-size: R      grid-row: 1
  row2:             kutoten        font-size: 継承(F)  grid-row: 2
  row3:             kaeri          font-size: R        grid-row: 3, align-self: end
  row4 (leftmost):  saidoku2       font-size: R        grid-row: 4
```

suffix-row は `inline` 要素のため、base 文字の**下方**（インライン方向）に配置される。
横方向の展開は base/ruby-grid と同一幅（ruby-ratio=0.5 で 4R = 2R+F = 2F）で整列。

**kutoten の位置導出**:

- suffix-row 右端は ruby/okuri 右端と一致 = columnX + columnWidth
- row 2 中心 = 右端 - 1.5R = rightColX - R
- つまり: `kutoten X = rightColX - rubyFontSize`

**kutoten のフォントサイズ**:

- HTML CSS で `.suffix-kutoten` には `font-size` 指定なし（親の fontSize を継承）
- Canvas でも `fontSize`（rubyFontSize ではない）を使用

**衝突検証** (R=12, F=24, cellAdvance=48):

- kaeri: X=columnX+1.5R=18, Y=tokenY+F-kaeri高さ (base Y レベル)
- kutoten: X=columnX+1.5R+F=42, Y=tokenY+F=24 (base 下方)
- X が 24px 離れており、Y も異なるため衝突なし ✓
- kutoten は cellAdvance 余白 (F\*(lineHeight-1)=24px) に収まる ✓

---

## 実装ステップ

### Step 1: kutoten を base 下方に移動 + グリッド幅修正

**対象**: `packages/skam-canvas-renderer/src/layout-vertical.ts`

#### 1a. gridWidth 計算の変更（L308-311）

```typescript
// Before
const gridWidth = 4 * rubyFontSize + fontSize;

// After
const gridWidth = 3 * rubyFontSize + fontSize;
```

baseCenterX は `2R + F/2` のまま変更なし（左側 saidoku2(R)+kaeri(R) は不変）。

#### 1b. rightColX は式自体の変更不要

```typescript
// 式は同じだが columnWidth が 3R+F になるため自動的に:
// rightColX = columnX + 3R + F - R/2 = columnX + 2.5R + F
// （変更前: columnX + 3.5R + F → R だけ base に近づく）
const rightColX = columnX + columnWidth - rubyFontSize / 2;
```

#### 1c. kutoten 配置の変更（layoutSingleToken L162-164）

```typescript
// Before: col2X (base の右側), full fontSize
if (slots.kutoten) {
  slotLayouts.kutoten = { text: slots.kutoten, x: col2X, y: tokenY, fontSize };
}

// After: suffix-row row2 相当の位置に配置
if (slots.kutoten) {
  // HTML suffix-row row2: base 下方、rightColX から R 左
  const kutotenX = rightColX - rubyFontSize;
  const kutotenY = tokenY + fontSize;
  slotLayouts.kutoten = {
    text: slots.kutoten,
    x: kutotenX,
    y: kutotenY,
    fontSize, // HTML 同様、親の fontSize を継承
  };
}
```

#### 1d. col2X 変数の削除

`col2X` 変数（L121）を削除。kutoten が rightColX ベースの計算に変わるため不要。

### Step 2: 複数ブロック → 複数カラム

**対象**: `packages/skam-canvas-renderer/src/layout-vertical.ts`

#### 2a. ブロック単位でカラムを作成

現在の `layoutVertical()` のメインループ（L336-447）を以下のように再構成:

```typescript
// ブロックごとにカラムを作成
const columns: ColumnLayout[] = [];
const numBlocks = tree.blocks.length;

for (let blockIdx = 0; blockIdx < tree.blocks.length; blockIdx++) {
  const block = tree.blocks[blockIdx]!;
  // 右→左配置: 最初のブロックが右端
  const blockColumnX =
    padding.left + (numBlocks - 1 - blockIdx) * (columnWidth + options.columnGap);

  // カラムごとに LayoutContext を作成（columnX が異なる）
  const blockLctx: LayoutContext = { ...lctx, columnX: blockColumnX };

  // カラム内のレイアウト
  const columnChildren: ColumnChild[] = [];
  const highlightLines: HighlightLineLayout[] = [];
  let yOffset = 0;
  const highlightLineX = blockColumnX - highlightGap;

  // layoutBlockChild, layoutTatetenChildren を blockLctx/blockColumnX で実行
  // （既存の関数を blockLctx を引数として受け取るように変更するか、
  //   ループ内でクロージャとして再定義する）

  for (const child of block.children) {
    layoutBlockChild(child); // blockLctx, columnChildren, highlightLines, yOffset を使用
  }

  columns.push({
    x: blockColumnX,
    y: columnY,
    width: columnWidth,
    height: yOffset,
    children: columnChildren,
    ...(highlightLines.length > 0 ? { highlightLines } : {}),
  });
}
```

**実装方針**: 現在の `layoutBlockChild` / `layoutTatetenChildren` はクロージャ変数（`columnX`, `columnChildren`, `highlightLines`, `yOffset`）に依存している。ブロックループ内にこれらの変数とクロージャを移動し、各ブロックで独立したスコープを持たせる。

#### 2b. ドキュメント寸法の計算変更

```typescript
const totalWidth = numBlocks * columnWidth + Math.max(0, numBlocks - 1) * options.columnGap;
const maxColumnHeight = Math.max(...columns.map((c) => c.height));

return {
  width: padding.left + totalWidth + padding.right,
  height: padding.top + maxColumnHeight + padding.bottom,
  columns,
};
```

### Step 3: ハイライト線の位置修正

Step 2 でカラムが分離されるため自動的に正しい位置になる:

- `highlightLineX = blockColumnX - highlightGap`
- カラムの左側（＝次のカラムとの間）に配置される

### Step 4: テストの更新

**対象**: `packages/skam-canvas-renderer/src/__tests__/layout-vertical.test.ts` (主要), `src/__tests__/integration.test.ts`, `src/__tests__/draw.test.ts`

#### 4a. gridWidth テスト修正

```typescript
// 'uses grid width 4R+F when suffix exists' → 3R+F に変更
const gridWidth = 3 * rubyFontSize + DEFAULT_FONT_SIZE;
```

#### 4b. kutoten 位置テスト修正

```typescript
// 'places kutoten right of base center (grid row2)' → 下方配置に変更
// kutoten は base の下方に配置、fontSize（rubyFontSize ではない）
expect(t3.slots.kutoten!.y).toBe(t3.y + DEFAULT_FONT_SIZE);
expect(t3.slots.kutoten!.fontSize).toBe(DEFAULT_FONT_SIZE);
// X = rightColX - rubyFontSize
```

#### 4c. suffix grid columns テスト修正

kutoten が右ゾーンから下方配置に変わるため、X の大小関係テストから kutoten を除外。

#### 4d. multi-block テスト追加

- 2ブロック → 2カラムの座標検証
- カラムの X 座標が右→左に配置されることを検証（block[0] が右端）
- カラム間の columnGap 検証
- 各カラムの highlightLineX が blockColumnX - highlightGap であることを検証

#### 4e. 既存テストの座標値更新

gridWidth 変更（4R+F → 3R+F）により rightColX が R だけ変わるため:

- ruby/okuri/soegana/emphasis の X 座標期待値を全て更新

---

## 変更ファイル一覧

| ファイル                                | 変更内容                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------ |
| `src/layout-vertical.ts`                | gridWidth 3R+F, kutoten 下方配置(fontSize), col2X 削除, multi-block 対応 |
| `src/__tests__/layout-vertical.test.ts` | 座標値更新, kutoten テスト修正, multi-block テスト追加                   |
| `src/__tests__/integration.test.ts`     | multi-block 統合テスト更新（もしあれば）                                 |
| `src/__tests__/draw.test.ts`            | kutoten 描画テスト更新（もしあれば）                                     |

---

## リスクと軽減策

| リスク                         | 影響度 | 軽減策                                                                  |
| ------------------------------ | ------ | ----------------------------------------------------------------------- |
| 既存テスト大量修正             | 中     | gridWidth 変更は rightColX 経由で自動反映、影響テストを特定して一括更新 |
| kutoten 下方配置で次セルと干渉 | 低     | cellAdvance 余白 24px に fontSize 24px が収まることを数値で確認済       |
| highlight 位置がまだずれる     | 低     | multi-block 実装後に視覚確認、微調整                                    |
| hasSuffix が全ブロック共通     | 低     | 全カラム同幅（視覚的統一性）。ブロック別判定は将来改善                  |

---

## 検証方法

1. `pnpm --filter @kanbun/skam-canvas-renderer test` — 全テストパス
2. `pnpm typecheck` — 型チェック成功
3. `pnpm build` — ビルド成功
4. Playground で HTML renderer 出力と Canvas 出力を目視比較:
   - ruby/okuri/soegana が base 直近に配置されていること
   - kutoten が base 下方に配置されていること（fontSize で描画）
   - kaeri が base 左側に適切に配置されていること
   - 複数ブロックが右→左のカラム配置になっていること
   - highlight 線がカラム間の正しい位置に表示されること

<!-- validated -->
