# Plan: styles.ts マジックナンバーの変数化

## Context

`packages/skam-html-renderer/src/styles.ts` には多数のマジックナンバーが散在しており、特に直近の highlight padding 調整（`1ba0b86`, `660341d`）で仮名有無による分岐値が追加された。各値の意味的な関係が暗黙的で、変更時に見落としやすい。名前付きJS定数を導入して対応関係を明示する。

## 対象ファイル

- `packages/skam-html-renderer/src/styles.ts` （唯一の変更対象）

## 検証済みの事実

### Highlight HTML構造 (render-tree.ts L303, L334)

```html
<span class="highlight" data-style="solid" data-has-kana>
  <!-- display: inline-block, position: relative -->
  <span class="highlight-content">
    <!-- display: inline -->
    <span class="ref">①</span>
    <!-- position: absolute (基準: .highlight) -->
    {content tokens/tateten-groups}
  </span>
</span>
```

### Padding の重ね合わせ（縦書き）

`.highlight-content` が `display: inline` で `.highlight` が `display: inline-block` のため、padding は加算的に作用する:

```
text | .highlight-content padding-right | .highlight padding-right | next column
     | (傍線はここに描画)                 | (refラベル + 次列までの間隔)  |
     | ◄─── lineDistance ──────────────► | ◄──── columnGap ────────► |
```

- background-image（`background-position: right`）が `.highlight-content` の padding 領域右端に描画 → lineDistance の位置に傍線
- ref ラベルは `position: absolute` で `.highlight`（`position: relative`）基準に配置 → columnGap 領域に収まる

### 値の対応関係

| 役割                       | 仮名あり       | 仮名なし       | 差分   |
| -------------------------- | -------------- | -------------- | ------ |
| lineDistance (text → 傍線) | `0.5em` (L893) | `0.1em` (L902) | -0.4em |
| columnGap (傍線 → 次列)    | `1em` (L888)   | `0.6em` (L898) | -0.4em |

- `noKanaReduction = 0.4em` は lineDistance と columnGap の **両方** に同量適用される
- `0.4em = highlightLineDistance(0.5em) - highlightLineDistanceNoKana(0.1em)` ✓
- `0.4em = highlightColumnGap(1em) - (1em - 0.4em)` ✓

### emphasis+highlight 共存時の ::after 配置

`.highlight:has(.ruby-grid--emphasis)` の場合、`.highlight` は ruby-grid の外側にあり `padding-right: 1em` が維持される（L978-982 のリセットは `.ruby-grid > .highlight` にのみ適用）。

```css
right: calc(ruby-ratio * 1em + ${highlightOffset}) = calc(0.5em + 1em) = 1.5em
  /* padding-box右端から */ → 0.5em from content-box右端 = emphasis-row 内側辺に傍線配置;
```

注: L997-998 のコメント「= 1.25em」は誤り。実際は 1.5em（ruby-ratio=0.5時）。

### vertical-align 補正式を定数化しない理由

各グリッドバリアントで固有の補正式を持ち（Chromium baseline バグ対応）、部分的に定数を抽出しても式全体の理解が必要なため可読性は向上しない。既に `--grid-baseline-fix` と `--ruby-ratio` で適切にパラメータ化済み。

## Step 1: Highlight レイアウト定数の抽出

`generateWritingModeStyles` 関数冒頭にローカル定数として定義。

### 縦書き

```typescript
// Highlight layout (vertical): text → line → next column
//
// With kana:    |-- lineDistance (0.5em) --||---- columnGap (1em) ----|
// Without kana: |- lineDistNoKana (0.1em) ||-- columnGap-reduction --|
//               Both reduced by noKanaReduction (0.4em)
const highlightLineDistance = '0.5em';
const highlightLineDistanceNoKana = '0.1em';
const highlightColumnGap = '1em';
const noKanaReduction = '0.4em'; // = highlightLineDistance - highlightLineDistanceNoKana
```

**置換対応表:**

| 行   | Before                                              | After                                                     |
| ---- | --------------------------------------------------- | --------------------------------------------------------- |
| 868  | `highlightOffset = '1em'`                           | 上記4定数に置換                                           |
| 888  | `padding-right: ${highlightOffset}`                 | `padding-right: ${highlightColumnGap}`                    |
| 893  | `padding-right: 0.5em`                              | `padding-right: ${highlightLineDistance}`                 |
| 898  | `calc(${highlightOffset} - 0.4em)`                  | `calc(${highlightColumnGap} - ${noKanaReduction})`        |
| 902  | `padding-right: 0.1em`                              | `padding-right: ${highlightLineDistanceNoKana}`           |
| 1022 | `calc(var(...) * 1em + ${highlightOffset})`         | `calc(${annotationRowH} + ${highlightColumnGap})`         |
| 1053 | `calc(var(...) * 1em + ${highlightOffset} - 1.5px)` | `calc(${annotationRowH} + ${highlightColumnGap} - 1.5px)` |
| 1063 | `calc(var(...) * 1em + ${highlightOffset} - 1px)`   | `calc(${annotationRowH} + ${highlightColumnGap} - 1px)`   |

`-1.5px`（wavy SVG幅 4px の中心補正）と `-1px`（double線幅 3px の中心補正）は線スタイル固有の描画補正のため定数化しない。

### 横書き

```typescript
const highlightRowGap = '0.5em';
```

| 行   | Before                  | After                                |
| ---- | ----------------------- | ------------------------------------ |
| 1091 | `padding-bottom: 0.5em` | `padding-bottom: ${highlightRowGap}` |

## Step 2: Grid テンプレート用ヘルパーの抽出

`calc(var(--${vp}-ruby-ratio) * 1em)` が 20箇所以上で繰り返されている。各関数の冒頭でローカル定数化。

```typescript
// generateCommonStyles 内:
const annotationRowH = `calc(var(--${vp}-ruby-ratio) * 1em)`;
const halfAnnotationRowH = `calc(var(--${vp}-ruby-ratio) * 0.5em)`;

// generateWritingModeStyles 内:
const annotationRowH = `calc(var(--${vp}-ruby-ratio) * 1em)`;
```

**置換箇所（generateCommonStyles）:**

- grid-template-rows: L152-154, L218-220, L300-302, L341-342, L374-375, L524, L700
- font-size: L274, L472, L553, L561, L570, L584, L668, L720
- emphasis-spacer inline-size (L289): `calc(1em / var(...))` → そのまま（`annotationRowH` では表現不可）

**置換箇所（generateWritingModeStyles）:**

- emphasis+highlight ::after right offset: L1022, L1053, L1063

vertical-align 補正式内の `ruby-ratio * 0.5em` や `0.5em` は式全体の文脈と不可分のためそのまま残す。

## Step 3: フォントサイズ・スペーシング定数の抽出

`generateCommonStyles` 関数冒頭にローカル定数として定義。

```typescript
// Font sizes
const okototenFontSize = '0.3em';
const refFontSize = '0.7em';
const notesFontSize = '0.9em';

// Notes spacing
const notesMarginTop = '1em';
const notesPaddingTop = '1em';
const noteItemSpacing = '0.5em';
const noteMarkerGap = '0.5em';

// Selection
const selectionOutlineWidth = '2px';
const selectionOutlineOffset = '-1px';
```

## Step 4: 重複 `.ref` ルールの統合

L727-732 と L789-792 に `.ref` の同一定義が重複。1つに統合する。

## 変更しないもの

- **線パターン定数** (dotted 2px/4px, dashed 4px/8px 等): 描画の物理仕様であり、layout と独立
- **vertical-align 補正式**: 式全体の文脈と不可分（上記「定数化しない理由」参照）
- **wavy/double 描画補正** (-1.5px, -1px): 線幅由来、隣接コメントで十分
- **CSS custom property デフォルト値** (`--ruby-ratio: 0.5` 等): すでに変数化済み
- **`1em`（glyph-size 意味）**: CSS の基本単位（例: `block-size: 1em`, `--glyph-size: 1em`）
- **visually-hidden パターン** (L445-452): CSS hack で一体のため
- **emphasis-spacer inline-size** (L289): `calc(1em / ruby-ratio)` は annotationRowH では表現不可

## 検証

```bash
pnpm --filter @kanbun/skam-html-renderer test
pnpm typecheck
pnpm format
```

テストはHTML構造を検証しておりCSS値リテラルをアサートしていないため、純粋な定数化で pass するはず。

副次的修正: L997-998 のコメント「= 1.25em」→「= 1.5em（ruby-ratio=0.5 時）」に訂正。

<!-- validated -->
