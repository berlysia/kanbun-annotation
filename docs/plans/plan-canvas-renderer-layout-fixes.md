# Canvas Renderer 縦書きレイアウト修正

## 概要

Canvas renderer の縦書きレイアウトに複数の深刻なバグがあり、HTML renderer の出力と大きく乖離している。本ドキュメントでは問題を整理し、修正計画を策定する。

関連 ADR: [ADR-012](../decisions/adr-012-canvas-renderer.md)
関連 Plan: [Phase 1](plan-canvas-renderer.md) | [Phase 2](plan-canvas-renderer-phase2.md)

## 問題一覧

### Bug 1: 送り仮名・読み仮名・添え仮名がルビ1文字分離れている

**症状**: ruby/okuri/soegana が base 文字の右側に配置されるが、1R（rubyFontSize）分だけ余計に離れている。

**根本原因**: 現在のグリッドモデルが kutoten 列を base と ruby/okuri の間に配置している。

```
現在のグリッド（左→右）:
  [saidoku2(R)] [kaeri(R)] [BASE(F)] [kutoten(R)] [okuri/ruby(R)]
                                      ^^^^^^^^^^
                                      この R 幅が余計なギャップ
```

rightColX（ruby/okuri の X 座標）が base 右端から 1.5R 離れているが、正しくは R/2 であるべき。

**数値例** (F=24, R=12):

- 現在: base 右端→ruby 中心 = 1.5R + F/2 - F/2 = 1.5R = 18px
- 正解: R/2 = 6px
- 差分: 12px = 1R（ルビ1文字分）

### Bug 2: 句読点が本文に食い込んでいる

**症状**: kutoten（、。）が base 文字と重なって描画される。

**根本原因**: kutoten が full fontSize で描画され、col2X の位置では base 文字の右端と重なる。

```
kutoten center = 2R + F + R/2 = 54  (with R=12, F=24)
kutoten 左端 = 54 - F/2 = 42
base 右端    = 2R + F = 48
→ 6px の重なり
```

**追加問題**: HTML renderer では kutoten は suffix-row 内でインライン方向（縦書きでは下方向）に配置され、base とは異なる垂直位置にあるため重ならない。Canvas では同一 Y に描画するため必然的に重なる。

### Bug 3: 返り点の位置が左上にずれている

**症状**: kaeri（レ、一、二等）が正しい位置より左上に見える。

**原因分析**: グリッド全体の問題により、カラム幅が実際の内容より広く、base 文字と kaeri の間に不必要な空間が生じている。kutoten 列が右側にあることで、全体のバランスが崩れ、kaeri が相対的に左上に見える。

### Bug 4: ハイライト（傍線）が完全に壊れている

**症状**: wavy 線 + ref ラベルが正しい位置に表示されない。HTML renderer ではカラム間の左側に表示されるが、Canvas では単一カラムの左端に表示される。

**根本原因**: 全ブロックが単一カラムに押し込まれているため、ハイライト線の配置基準が成立しない。

### Bug 5: 複数ブロックが単一カラムになっている

**症状**: 複数ブロック（例: 「須知天下之大事」「學而不思則罔矣」）が縦一列に並ぶ。HTML renderer では各ブロックが別カラムとして右→左に配置される。

**根本原因**: `layoutVertical()` が全ブロックの children をフラットに展開して単一カラムに配置している。

```typescript
// 現在のコード (layout-vertical.ts:426-429)
for (const block of tree.blocks) {
  for (const child of block.children) {
    layoutBlockChild(child); // 全部同じカラムに追加
  }
}
```

## 根本原因の構造

5つのバグは独立ではなく、以下の2つの構造的問題に起因する:

### 構造問題 A: グリッドレイアウトモデルの誤り

HTML renderer の suffix-row は 4 行インライングリッドで、**インライン方向**（縦書きでは下方向）に配置される。各行はブロック方向（横方向）に展開:

```
HTML suffix-row（vertical-rl でのブロック方向展開）:
  row1(右寄り): okuri/soegana  ← base に最も近い（右側）
  row2:         kutoten        ← row1 と row3 の間
  row3:         kaeri          ← base に近い（左側）
  row4(左寄り): saidoku2       ← 最も遠い（左側）
```

重要: suffix-row のアイテムは base 文字とは**異なるインライン位置**（下方向）にあるため、横方向の重なりが許容される。

Canvas renderer は全要素を同一 Y 座標に描画するため、suffix-row モデルをそのまま適用できない。横方向に専用列を確保する必要がある。

### 構造問題 B: 単一カラムレイアウト

全ブロックを単一カラムに展開する設計が、Bug 4（ハイライト）と Bug 5（ブロック配置）の直接原因。

## HTML renderer との対応関係

| 要素          | HTML renderer での配置                  | 現在の Canvas                 | あるべき Canvas                         |
| ------------- | --------------------------------------- | ----------------------------- | --------------------------------------- |
| ruby/yomigana | ruby-position: over → 右側、base 直近   | 右側だが 1R 遠い              | 右側、base 直近（gap ≈ R/2）            |
| okuri/soegana | suffix-row row1 → 右側かつ下方          | ruby と同じ X（遠い）         | ruby と同じ X（近い）                   |
| kutoten       | suffix-row row2 → 下方に配置            | 右側に full fontSize で重なり | 下方オフセットまたは左側に rubyFontSize |
| kaeri         | suffix-row row3 → 左側、align-self: end | 左側、bottom-aligned          | 左側、bottom-aligned（位置調整）        |
| saidoku2      | suffix-row row4 → 左端                  | 左端                          | 左端（位置調整）                        |
| highlight     | カラム間の左側                          | 単一カラム左端                | カラム間の左側                          |
| blocks        | 各ブロック = 別カラム（右→左）          | 全て単一カラム                | 各ブロック = 別カラム                   |

## HTML suffix-row 構造の分析

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
- X が 24px 離れており、Y も異なるため衝突なし
- kutoten は cellAdvance 余白 (F\*(lineHeight-1)=24px) に収まる

## 実装計画

### グリッドモデルの修正

```
現在:   [saidoku2(R)] [kaeri(R)] [BASE(F)] [kutoten(R)] [okuri/ruby(R)]
         gridWidth = 4R + F

修正後: [saidoku2(R)] [kaeri(R)] [BASE(F)] [okuri/ruby(R)]
         gridWidth = 3R + F
         kutoten は base の下方に配置（suffix-row row2 相当）
```

### Step 1: kutoten を base 下方に移動 + グリッド幅修正

- `gridWidth = 4R + F` → `3R + F`（baseCenterX = 2R + F/2 は不変）
- kutoten 配置: `x = rightColX - rubyFontSize`, `y = tokenY + fontSize`, `fontSize = fontSize`
- `col2X` 変数を削除

### Step 2: 複数ブロック → 複数カラム

- ブロックごとに独立カラムを作成（右→左配置）
- `blockColumnX = padding.left + (numBlocks - 1 - blockIdx) * (columnWidth + columnGap)`
- LayoutContext をカラムごとに作成（columnX が異なる）
- ドキュメント寸法: `width = padding + N*columnWidth + (N-1)*columnGap`

### Step 3: ハイライト線の位置修正

- Step 2 でカラム分離されるため自動的に正しい位置になる
- `highlightLineX = blockColumnX - highlightGap`

### Step 4: テストの更新

- gridWidth テスト: 4R+F → 3R+F
- kutoten 位置テスト: 右側 → 下方配置、fontSize（rubyFontSize ではない）
- rightColX 依存テスト: 座標値更新（R だけ変化）
- multi-block テスト追加

**実装済み**: commit a7d7a40 にてグリッドモデル修正、kutoten 下方配置、複数ブロックカラム対応を完了。後続のリファクタリング（94a9f4b〜6698f21）で共有ユーティリティ抽出・hasSuffix 事前計算・GridColumns 抽象化を実施。
