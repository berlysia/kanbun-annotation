# Canvas Renderer 大改修: 3レベルレイアウト判定モデル

## Context

Canvas renderer のレイアウトフラグ（`hasSuffix`, `hasSaidoku`, `hasRightColumn`, `hasEmphasis`, `hasHighlight`）がドキュメント全体の OR 集約で計算されている。1 ブロックに仮名があるだけで全ブロックの列幅が拡張され、傍点・傍線の位置もドキュメント全体のフラグに依存している。

**目的**: 3 レベル（ドキュメント / ブロック / グループ・トークン）の独立したレイアウト判定を導入し、柔軟な列幅と正確なスロット位置を実現する。

## 関連 ADR

- ADR-016（Accepted, 未実装）: uniform/adaptive columnSizing モード
- ADR-017（新規作成）: グループ・トークン単位のスロット位置判定

## 3 レベルモデルの概要

| レベル            | 決定内容                                                                 | 使用場面                     |
| ----------------- | ------------------------------------------------------------------------ | ---------------------------- |
| ドキュメント      | 全ブロックの OR 集約フラグ → 統一 columnWidth                            | uniform モード（デフォルト） |
| ブロック          | ブロック固有フラグ → ブロック別 columnWidth + extraRightWidth            | adaptive モード              |
| トークン/グループ | ruby 有無で emphasisX を per-token 計算、グループ内仮名で highlight 調整 | 常時（両モード共通）         |

### emphasis 位置: per-token 計算（GridColumns から分離）

現状の `emphasisBaseX`/`emphasisWithRubyX` は GridColumns（ドキュメント or ブロック単位）に含まれている。
これを **GridColumns から除去し、`layoutSingleToken` で per-token 計算** に変更する。

```
ruby あり: emphasisX = grid.suffixX + rubyFontSize/2（ruby の右側）
ruby なし: emphasisX = tokenX + fontSize/2（ベース文字右端）
highlight 内: emphasisX = highlightLineX + highlightGap（hl線の外側）
```

理由: 同一ブロック内でも ruby ありトークンと ruby なしトークンで emphasis 位置が異なるべき。ブロック単位の GridColumns では ruby なしトークンの emphasis が不必要に右に配置される。

## 対象ファイル

- `packages/skam-canvas-renderer/src/types.ts` - 型追加
- `packages/skam-canvas-renderer/src/render-tree.ts` - ブロック別フラグ計算
- `packages/skam-canvas-renderer/src/layout-vertical.ts` - メイン改修
- `packages/skam-canvas-renderer/src/layout.ts` - columnSizing オプション追加
- `packages/skam-canvas-renderer/src/__tests__/render-tree.test.ts` - ブロックフラグテスト追加
- `packages/skam-canvas-renderer/src/__tests__/layout-vertical.test.ts` - adaptive + per-token テスト追加
- `docs/decisions/adr-017-canvas-group-level-layout.md` - 新規 ADR

**変更なし**: `draw.ts`, `draw-marks.ts`, `draw-text.ts`（座標を消費するだけ）

## 実装計画

### Step 0: ADR-017 作成

`docs/decisions/adr-017-canvas-group-level-layout.md` を作成。3 レベルモデルの設計決定を記録。ADR-016 に Plan リンクを追加。

### Step 1: BlockLayoutFlags を CanvasBlockNode に追加

**types.ts**:

```typescript
export interface BlockLayoutFlags {
  hasSuffix: boolean;
  hasSaidoku: boolean;
  hasRightColumn: boolean;
  hasEmphasis: boolean;
  hasHighlight: boolean;
}

export interface CanvasBlockNode {
  type: 'block';
  blockId: string;
  children: CanvasBlockChild[];
  flags: BlockLayoutFlags; // NEW
}
```

**render-tree.ts**:

- `blockGroups.map()` ループ内で各ブロックのフラグを計算（既存の `checkLayoutFlags`/`mergeTokenFlags` を再利用）
- `CanvasBlockNode` に `flags` を付与
- ドキュメント全体フラグ = 全ブロック `flags` の OR 集約（既存ループを置換）

**テスト検証**: 既存テストすべてパス + render-tree.test.ts にブロックフラグ検証テスト追加

### Step 2: computeColumnDimensions ヘルパー抽出 + emphasisX を GridColumns から分離

**layout-vertical.ts**: 2 つの変更を同時に行う（どちらも pure refactoring）。

**(a) computeColumnDimensions 抽出**:

```typescript
interface ColumnDimensions {
  columnWidth: number;
  baseCenterX: number;
  extraRightWidth: number;
  fullColumnWidth: number;
}

function computeColumnDimensions(
  flags: BlockLayoutFlags,
  fontSize: number,
  rubyFontSize: number,
  maxRubyWidth: number,
  highlightGap: number
): ColumnDimensions;
```

列幅計算ロジック（L356-388）をそのまま抽出。既存のドキュメントフラグを `BlockLayoutFlags` 形状で渡す。

**(b) emphasisBaseX/emphasisWithRubyX を GridColumns から除去**:

```typescript
// Before
interface GridColumns {
  suffixX: number;
  kaeriX: number;
  saidoku2X: number;
  kutotenX: number;
  emphasisBaseX: number; // REMOVE
  emphasisWithRubyX: number; // REMOVE
}

// After
interface GridColumns {
  suffixX: number;
  kaeriX: number;
  saidoku2X: number;
  kutotenX: number;
}
```

**layoutSingleToken** 内の emphasis 計算を変更:

```typescript
// Before:
const emphasisX = slots.ruby ? grid.emphasisWithRubyX : grid.emphasisBaseX;

// After:
const emphasisX = slots.ruby
  ? grid.suffixX + rubyFontSize / 2 // ruby の右側
  : tokenX + fontSize / 2; // ベース文字右端
```

**highlight-group 内**: `hlGrid` を廃止し、`LayoutContext` に `emphasisOverrideX` を追加:

```typescript
interface LayoutContext {
  fontSize: number;
  rubyFontSize: number;
  cellAdvance: number;
  grid: GridColumns;
  emphasisOverrideX?: number; // NEW: highlight-group 内でのみ設定
}
```

`layoutBlockChild` の highlight-group 分岐:

```typescript
// hlGrid を作らず、emphasisOverrideX を設定
const hlLctx: LayoutContext = {
  ...blockLctx,
  emphasisOverrideX: groupHighlightLineX + highlightGap,
};
```

`layoutSingleToken` 内:

```typescript
if (slots.emphasis) {
  let emphasisX: number;
  if (lctx.emphasisOverrideX !== undefined) {
    emphasisX = lctx.emphasisOverrideX;
  } else if (slots.ruby) {
    emphasisX = grid.suffixX + rubyFontSize / 2;
  } else {
    emphasisX = tokenX + fontSize / 2;
  }
  slotLayouts.emphasis = { text: slots.emphasis, x: emphasisX, ... };
}
```

**テスト影響**: emphasis 位置テスト（L349-416）の一部は期待値更新が必要:

- **suffix+no-ruby ケース**（L349-366）: emphasisX が `suffixX` → `tokenX + fontSize/2` に変更
- **suffix+ruby ケース**（L368-386）: emphasisX = `suffixX + R` → `suffixX + R/2` に変更
- **no-suffix ケース**（L388-416）: 大きな変更なし（現行 suffixBaseX ≒ tokenX + fontSize/2）
- **highlight+emphasis ケース**（L866-881）: emphasisOverrideX 経由、値は同じ

### Step 3: columnSizing オプション追加

**types.ts**: `CanvasRenderOptions`, `MeasureOptions` に `columnSizing?: 'uniform' | 'adaptive'` 追加。`ResolvedOptions` に `columnSizing: 'uniform' | 'adaptive'` 追加。

**layout.ts**: `resolveOptions()` でデフォルト `'uniform'` を設定。

**動作変更なし**（デフォルト uniform = 現行動作）。

### Step 4: adaptive モード実装

**layout-vertical.ts** に adaptive モードを追加。uniform モードは既存ロジックを完全に保持する明示的分岐。

**per-block token 収集**:

```typescript
function collectBlockTokens(block: CanvasBlockNode): CanvasTokenNode[];
// 既存の collectTokensFromChild を再利用
```

**レイアウト構造の変更**:

```typescript
const isAdaptive = options.columnSizing === 'adaptive';

// Dimensions 計算
let docDims: ColumnDimensions; // uniform 用
let blockDimsArray: ColumnDimensions[]; // adaptive 用

if (isAdaptive) {
  blockDimsArray = tree.blocks.map((block) => {
    const blockTokens = collectBlockTokens(block);
    let blockMaxRubyWidth = 0;
    for (const t of blockTokens) {
      const w = measureTextWidth(t.slots.ruby, rFont, measurer);
      if (w > blockMaxRubyWidth) blockMaxRubyWidth = w;
    }
    return computeColumnDimensions(
      block.flags,
      fontSize,
      rubyFontSize,
      blockMaxRubyWidth,
      highlightGap
    );
  });
  docDims = blockDimsArray[0]!; // fallback (not used in adaptive loop)
} else {
  // uniform: 現行動作と完全に同一
  const documentFlags: BlockLayoutFlags = {
    hasSuffix,
    hasSaidoku,
    hasRightColumn,
    hasEmphasis,
    hasHighlight,
  };
  docDims = computeColumnDimensions(
    documentFlags,
    fontSize,
    rubyFontSize,
    maxRubyWidth,
    highlightGap
  );
  blockDimsArray = tree.blocks.map(() => docDims);
}
```

**X 座標計算**:

```typescript
// uniform: 既存の等間隔計算
// adaptive: 右→左累積
const blockColumnXs: number[] = new Array(numBlocks);
if (isAdaptive) {
  let curX = padding.left;
  for (let i = numBlocks - 1; i >= 0; i--) {
    blockColumnXs[i] = curX;
    if (i > 0) curX += blockDimsArray[i]!.fullColumnWidth + options.columnGap;
  }
} else {
  for (let i = 0; i < numBlocks; i++) {
    blockColumnXs[i] =
      padding.left + (numBlocks - 1 - i) * (docDims.fullColumnWidth + options.columnGap);
  }
}
```

**totalWidth**: adaptive はブロック別 fullColumnWidth 合計 + gap。

**highlight rightAdjust**: effective flags をモードで切替:

```typescript
const effectiveFlags = isAdaptive ? block.flags : documentFlags;
const effectiveMaxRubyWidth = isAdaptive ? blockMaxRubyWidth : docMaxRubyWidth;
```

**テスト検証**: 既存テストパス（uniform デフォルト）+ adaptive テスト追加:

- 2 ブロック: Block A（マークなし）+ Block B（ruby+kaeri）→ Block A 列幅が狭い
- 2 ブロック: Block A（emphasis）+ Block B（なし）→ extraRightWidth が異なる
- 1 ブロック: adaptive/uniform で同一結果
- multi-block adaptive: highlight の rightAdjust がブロックフラグを使用

### Step 5: 総合テスト + Playground 確認

- `pnpm test` 全パス
- `pnpm typecheck` パス
- `pnpm lint` パス
- `pnpm playground:dev` で視覚的確認:
  - emphasis+highlight 共存
  - multi-block で Block ごとにマーク密度が異なるケース
  - saidoku + emphasis
  - adaptive モードでのコンパクトレイアウト
  - per-token emphasis: ruby ありトークンと ruby なしトークンの emphasis 位置差

## リスクと軽減策

| リスク                                            | 影響度 | 軽減策                                                                                   |
| ------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| `CanvasBlockNode.flags` 追加で既存コード破損      | 低     | `CanvasBlockNode` は `buildRenderTree` のみが生成                                        |
| adaptive X 累積計算の off-by-one                  | 高     | 1 ブロックで uniform/adaptive 同一結果テスト                                             |
| emphasis 位置リグレッション（Step 2b）            | 中     | テスト期待値の意図的更新 + playground 目視確認                                           |
| rightAdjust のモード分岐ミス                      | 中     | uniform では document flags、adaptive では block flags。明示テスト                       |
| emphasisOverrideX と per-token 計算の優先順位ミス | 中     | highlight+emphasis テスト（L866）が検証                                                  |
| uniform モードの後方互換性破壊                    | 高     | uniform パスは既存ロジック完全保持。Step 2b の emphasis 変更のみ影響（テスト更新で管理） |

## logic-validator 検証からの判断

- **emphasis per-token 計算**: 採用（GridColumns から分離、Step 2b で実装）
- **extraRightWidth ドキュメント単位**: 不採用（adaptive モードでは per-block が正しい。emphasis なしブロックに不要な余白を作らない）
- **uniform 条件分岐の明示化**: 採用（Step 4 で isAdaptive フラグによる明示分岐）

<!-- validated -->
