# Plan: Canvas Renderer 2-Row Grid Layout Fix

関連 ADR: [ADR-012](../../docs/decisions/adr-012-canvas-renderer.md)

## Requirements

| ID  | 要件                                                                        | 対応状況      | 対応 Step                |
| --- | --------------------------------------------------------------------------- | ------------- | ------------------------ |
| R1  | base 1文字あたり 2行（base row + suffix row）× n列グリッド                  | ✅ 対応       | Step 3a, 3d              |
| R2  | kaeri は base カラムの**左半分**に配置（suffix row）                        | ✅ 対応       | Step 3b                  |
| R3  | kutoten は base カラムの**右半分**に配置（suffix row）                      | ✅ 対応       | Step 3b                  |
| R4  | saidoku は独立カラム、存在時のみ割り当て                                    | ✅ 対応       | Step 1, 2, 3a            |
| R5  | `[]` 列はその文字/熟語単位で空なら詰めてよい                                | ✅ 対応       | Step 3a (hasRightColumn) |
| R6  | `()` 列（emphasis/highlight）は範囲全体で一貫させる                         | ⏳ スコープ外 | Future Enhancement       |
| R7  | **base の中心に行全体を揃える**（base center が全要素のアライメント基準軸） | ✅ 対応       | Step 3a, 3b              |
| R8  | 複数文字 kun（yomigana range）や tateten は例外として管理                   | ✅ 既存動作   | —                        |

## Context

`layout-vertical.ts` 冒頭のコメントが間違っており、レンダリング結果に誤りが生じている。

**現在の（誤った）モデル**: 1行4列

```
[saidoku2(R)] [kaeri(R)] [base(F)] [okuri/soegana/ruby(R)]
gridWidth = 3R + F,  baseCenterX = 2R + F/2
```

- kaeri に専用カラムを割り当て、base の左側に配置（間違い）
- gridWidth が不必要に広い（F=24, R=12 のとき gridWidth=60）
- baseCenterX が実際の base 中心からずれている

**正しいモデル**: 2行 × n列グリッド

```
Base row:    [saidoku yomi(R?)] [base(1/2)] [base(2/2)] [yomigana(R?)] (emphasis)(highlight)(hl ref)
Suffix row:  [saidoku okuri(R?)] [kaeri]    [kutoten]   [okuri/soegana(R?)] (empty)(highlight)(empty)
```

- kaeri は base カラムの**左半分**（suffix row）に配置 (R2)
- kutoten は base カラムの**右半分**（suffix row）に配置 (R3)
- `[]` 列：その文字/熟語単位で空なら詰めてよい (R5)
- `()` 列：emphasis/highlight は範囲全体で一貫させる (R6)
- **base の中心が全要素のアライメント基準軸** (R7)：baseCenterX を基準に左右対称に配置

## Changes

### Step 1: `types.ts` — CanvasRenderTree 拡張

`hasSaidoku` と `hasRightColumn` フラグを追加。

```typescript
export interface CanvasRenderTree {
  blocks: CanvasBlockNode[];
  hasSuffix: boolean;
  /** saidokuUnder or saidokuOkuri2 が存在 → 左列(R)を割り当て */
  hasSaidoku: boolean;
  /** ruby, okuri, soegana が存在 → 右列(R)を割り当て */
  hasRightColumn: boolean;
}
```

### Step 2: `render-tree.ts` — 新フラグ計算

既存の `hasSuffix` ループを拡張し、`hasSaidoku`/`hasRightColumn` を同時計算。

既存パターン（`checkHasSuffix` → tokenNode 再帰探索）を再利用し、1パスで3フラグを計算する。

### Step 3: `layout-vertical.ts` — グリッド幅・位置の修正

#### 3a. gridWidth / baseCenterX 計算 (R1, R4, R5, R7)

**前提 (R7)**: baseCenterX が全要素のアライメント基準軸。全スロット位置は baseCenterX からの相対オフセットで定義する。

```typescript
if (hasSuffix) {
  const saidokuWidth = hasSaidoku ? rubyFontSize : 0;
  const rightColumnWidth = hasRightColumn ? rubyFontSize : 0;
  columnWidth = saidokuWidth + fontSize + rightColumnWidth;
  baseCenterX = saidokuWidth + fontSize / 2; // R7: base 中心がアライメント軸
}
// !hasSuffix パスは既存のまま（compact layout、baseCenterX = F/2）
```

| hasSaidoku | hasRightColumn | gridWidth | baseCenterX | 例 (F=24,R=12) |
| ---------- | -------------- | --------- | ----------- | -------------- |
| true       | true           | R+F+R     | R+F/2       | 48             |
| true       | false          | R+F       | R+F/2       | 36             |
| false      | true           | F+R       | F/2         | 36             |
| false      | false          | F         | F/2         | 24             |

（旧: 常に 3R+F=60）

#### 3b. computeGridColumns 修正 (R2, R3, R7)

`hasSaidoku` パラメータ追加。hasSuffix=true 時の新しい位置計算。
**全位置は baseCenterX からの対称配置** (R7):

```
saidokuWidth = hasSaidoku ? R : 0
baseLeft = columnX + saidokuWidth            ← base カラム左端

// base 中心基準の対称配置 (R7)
kaeriX    = baseLeft + F/4                    ← baseCenterX - F/4 (R2: base 左半分中心)
kutotenX  = baseLeft + 3F/4                   ← baseCenterX + F/4 (R3: base 右半分中心)

// 左右列
saidoku2X = columnX + R/2                     ← baseCenterX - F/2 - R/2 (左列中心)
suffixX   = baseLeft + F + R/2                ← baseCenterX + F/2 + R/2 (右列中心)

// emphasis は suffixX 基準
emphasisBaseX     = suffixX
emphasisWithRubyX = suffixX + R
```

**対称性の検証** (R7): baseCenterX = saidokuWidth + F/2 を基準とした各要素のオフセット:

- saidoku2X: -F/2 - R/2（左列）
- kaeriX: -F/4（base 左半分）
- kutotenX: +F/4（base 右半分）
- suffixX: +F/2 + R/2（右列）
- R = F/2 のとき saidoku↔suffix が対称（|-F/2-R/2| = |+F/2+R/2|）

#### 3c. kaeri Y位置修正

```typescript
// 旧: base 内 bottom-aligned（base と重なる）
y: tokenY + fontSize - kaeriChars * rubyFontSize;

// 新: suffix row 先頭（base の直下）
y: tokenY + fontSize;
```

#### 3d. コメント更新

冒頭コメントを2行×n列モデルに書き換え。

### Step 4: テスト更新 (`layout-vertical.test.ts`)

| テスト                                        | 変更内容                                                                      |
| --------------------------------------------- | ----------------------------------------------------------------------------- |
| "uses grid width 3R+F when suffix exists"     | kaeri のみ → gridWidth=F（plain と同じ）。新テストで R+F+R / F+R ケースを追加 |
| "places kaeri on left side"                   | kaeri.y を `tokenY+F-R` → `tokenY+F` に変更                                   |
| "handles multiple marks"                      | kaeri.y を bottom-aligned → suffix row に変更                                 |
| "places suffix types with kutoten below base" | kutoten X を `rightColX-R` → `columnX+3F/4` に変更                            |
| "places saidoku col4 on left side"            | saidoku2X=padding+R/2 は変更なし、baseCenterX 変更による tokenX 検証調整      |

### Step 5: MEMORY.md 更新

Canvas renderer layout zones セクションを新モデルに更新。

## Files to Modify

- `packages/skam-canvas-renderer/src/types.ts` — CanvasRenderTree 型拡張
- `packages/skam-canvas-renderer/src/render-tree.ts` — hasSaidoku/hasRightColumn 計算
- `packages/skam-canvas-renderer/src/layout-vertical.ts` — グリッド計算・コメント修正（主要変更）
- `packages/skam-canvas-renderer/src/__tests__/layout-vertical.test.ts` — テスト期待値更新
- `MEMORY.md` — レイアウトゾーン説明更新

**変更不要**: `draw.ts`, `draw-text.ts`, `draw-marks.ts`, `helpers.ts`（SlotLayout 座標を直接使用するため）

## Verification

1. `pnpm --filter @kanbun/skam-canvas-renderer test` — 全テスト通過
2. `pnpm typecheck` — 型チェック通過
3. `pnpm playground:dev` で Playground を起動し、Canvas レンダリング結果を目視確認:
   - R2: kaeri が base カラム左半分に配置されること
   - R3: kutoten が base カラム右半分に配置されること
   - R4: saidoku がある場合のみ左列が存在すること
   - R5: カラム幅が旧モデルより狭くなっていること
   - R7: 全ての要素が base 中心を軸に揃っていること

## Validator Concerns (Addressed)

### emphasis が gridWidth 外に配置される問題

**結論: 既存動作であり新規問題ではない。**

- 現行 `!hasSuffix` パス: `emphasisBaseX = columnX + F + slotGap` → gridWidth=F を超過（+2px）
- 現行 `hasSuffix` パス: `emphasisWithRubyX = columnX + columnWidth + R/2` → gridWidth を R/2 超過
- 新モデルでも同様: emphasis は常に gridWidth 外に配置され、columnGap で吸収される
- これは既存の設計判断であり、今回の変更で悪化しない

### kutoten 描画サイズ

**確認済み**: `layout-vertical.ts:199` で `fontSize`（親フォント）を使用。rubyFontSize ではない。
kutoten は base カラム右半分（3F/4 中心）に配置され、F サイズの文字が描画される。右方向への overflow は右列または columnGap で吸収。HTML レンダラーも同様に grid cell からの overflow を許容している。

### kaeri 複数文字の Y 方向

kaeri 2文字（高さ 2R=F）が suffix row に配置される場合、lineHeight=2 のとき cellAdvance=2F。
suffix row 開始が tokenY+F、次トークン開始が tokenY+cellAdvance+F/2=tokenY+2.5F。
kaeri 端が tokenY+F+2R=tokenY+2F。十分なスペースがある。

### gridWidth の境界条件

| hasSuffix | hasSaidoku | hasRightCol | 内容例        | gridWidth | 備考                                 |
| --------- | ---------- | ----------- | ------------- | --------- | ------------------------------------ |
| true      | false      | false       | kaeri のみ    | F         | base 内に収まる。plain と同幅        |
| true      | false      | false       | kutoten のみ  | F         | 同上。kutoten は overflow            |
| true      | false      | true        | okuri+kaeri   | F+R       | 右列追加                             |
| true      | true       | true        | saidoku+ruby  | R+F+R     | 両列追加                             |
| false     | false      | false       | emphasis のみ | F         | emphasis は gridWidth 外（既存動作） |

## Future Enhancement (out of scope)

- emphasis/highlight の範囲一貫性：現在は per-token で `emphasisBaseX` / `emphasisWithRubyX` を選択。範囲内で最も広い要件に合わせる処理は今回のスコープ外。

<!-- validated -->
