# ADR-017: Canvas レンダラー グループ・トークン単位レイアウト判定

## ステータス

Accepted

実装計画: [Plan](../plans/plan-canvas-3level-layout.md)

## コンテキスト

ADR-016 では uniform/adaptive の列幅モード（ブロック単位フラグ）を導入した。しかし、ブロック単位のフラグ判定だけでは不十分なケースがある。

### 問題: ブロック内 OR 集約による emphasis/highlight 位置のずれ

adaptive モード（ADR-016）でブロック単位フラグを使っても、ブロック内では依然 OR 集約される。

```
Block A:
  t1: 漢字 + emphasis（ruby なし）
  t2: 漢字 + yomigana + emphasis（ruby あり）
```

Block A の `hasRightColumn = true`（t2 の yomigana により）。GridColumns の `emphasisBaseX` は右列（ruby 列）の中心に配置される。t1 は ruby がないにも関わらず、emphasis が ruby 列の位置に置かれ、ベース文字から不必要に離れる。

### 問題: highlight-group 内の emphasis 位置

ADR-015 で emphasis+highlight 共存時の配置順（本文→ルビ→傍線→傍点）を決定した。highlight-group 内の emphasis は highlight 線の外側に配置される。この位置は `hlGrid` というグリッドオーバーライドで実現しているが、`emphasisBaseX`/`emphasisWithRubyX` の両方を同じ値に上書きしており、highlight-group 内で ruby 有無による分岐が失われている。

## 検討した選択肢

### Option A: ブロック単位 GridColumns のみ（ADR-016 のみ実装）

- 利点: 実装が単純。ブロック間の列幅差は解消される
- 欠点: ブロック内の emphasis 位置ずれは解消されない。ruby なしトークンの emphasis が不必要に右に配置される

### Option B: emphasis/highlight をトークン・グループ単位で計算

- 利点: emphasis がコンテンツに密着して配置される。ruby なし → ベース右端、ruby あり → ruby 右側
- 欠点: 同一ブロック内で emphasis の X 座標が異なるため、視覚的に非統一になる場合がある。ただしこれは CSS text-emphasis の挙動と一致しており自然

### Option C: 全スロットをコンテキスト単位で計算

- 利点: 最大限の柔軟性。各スロットが実際のコンテンツに基づいて配置される
- 欠点: ruby/okuri/soegana の位置もトークン単位になるとブロック内で位置がばらつく。kaeri/kutoten はブロック内統一が望ましい

## 決定

**Option B** を採用する。emphasis/highlight の位置をトークン・グループ単位で計算し、構造的スロット（suffix, kaeri, kutoten, saidoku）はブロック単位の GridColumns を維持する。

### 3 レベルレイアウト判定モデル

| レベル            | 決定内容                                         | 対象                |
| ----------------- | ------------------------------------------------ | ------------------- |
| ドキュメント      | 全ブロック OR 集約フラグ → 統一 ColumnDimensions | uniform モード      |
| ブロック          | ブロック固有フラグ → ブロック別 ColumnDimensions | adaptive モード     |
| トークン/グループ | コンテンツに基づく動的位置                       | emphasis, highlight |

### emphasis 位置: GridColumns から分離

`emphasisBaseX`/`emphasisWithRubyX` を `GridColumns` インターフェースから除去し、`layoutSingleToken` 内で per-token 計算する。

```typescript
if (lctx.emphasisOverrideX !== undefined) {
  emphasisX = lctx.emphasisOverrideX; // highlight-group 内
} else if (slots.ruby) {
  emphasisX = grid.suffixX + rubyFontSize; // ruby の右側（rubyFontSize 分のオフセット）
} else {
  emphasisX = tokenX + fontSize / 2 + rubyFontSize / 2; // ベース文字右端の外側
}
```

### highlight 位置: グループ単位の仮名判定

既存の `groupHasRightColumn` ロジックを維持し、ADR-016 のブロック単位フラグと組み合わせる。

```typescript
const effectiveFlags = isAdaptive ? block.flags : documentFlags;
if (effectiveFlags.hasSuffix && effectiveFlags.hasRightColumn && !groupHasRightColumn) {
  rightAdjust = rubyFontSize;
}
```

### LayoutContext の拡張

highlight-group 内の emphasis 位置を `hlGrid` オーバーライドではなく `emphasisOverrideX` フィールドで制御する。

```typescript
interface LayoutContext {
  fontSize: number;
  rubyFontSize: number;
  cellAdvance: number;
  grid: GridColumns;
  emphasisOverrideX?: number; // highlight-group 内でのみ設定
}
```

## 影響

### ポジティブ

- emphasis がコンテンツに密着して配置される（ruby なしトークンはベース文字近く、ruby ありトークンは ruby の外側）
- highlight 位置がブロック単位フラグとグループ単位判定の組み合わせで正確になる
- `hlGrid` パターン（GridColumns 全体の上書き）が廃止され、`emphasisOverrideX` による局所的な制御に簡素化
- CSS text-emphasis の自然な挙動に近づく

### ネガティブ

- 同一ブロック内で emphasis の X 座標が異なるため、視覚的に非統一に見える場合がある
- 既存テストの emphasis 位置期待値の更新が必要（suffix+no-ruby ケース等）

## 参考

- [ADR-015: 傍点・傍線レイアウト配置順序の変更](adr-015-emphasis-highlight-layout-order.md) — emphasis+highlight 共存時の配置順
- [ADR-016: Canvas レンダラー列幅モード](adr-016-canvas-column-sizing-mode.md) — uniform/adaptive 列幅モード
- `packages/skam-canvas-renderer/src/layout-vertical.ts` — Pass 2: レイアウト計算
- `packages/skam-canvas-renderer/src/types.ts` — GridColumns, LayoutContext 型定義
