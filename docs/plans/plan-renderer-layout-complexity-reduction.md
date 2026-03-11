# Renderer Layout 複雑度削減

## 概要

Canvas レンダラーの `placeBlock()` 関数（CC 48・605 行）を `BlockLayoutState` オブジェクト + モジュールレベル関数に分解し、CC ~12 に削減する。

関連 ADR: [ADR-026](../decisions/adr-026-renderer-layout-complexity-reduction.md)

## 前提知識

- ADR-018 で `layout-vertical.ts` は Analysis / Column Planning / Placement の 3 レイヤに分割済み
- `placeBlock()` は Placement レイヤの中核関数で、10+ のクロージャ変数と 2 つの内部クロージャ関数を持つ
- range ruby overflow の 2 段階検出（block レベル先読み + token 内 align）が主な複雑度要因

## 実装計画

### Step 1: BlockLayoutState の導入

range ruby 追跡状態を State オブジェクトに集約。`columnChildren` と `highlightLines` は関数の戻り値として扱う。

```typescript
interface BlockLayoutState {
  yOffset: number;
  rubySpanRemaining: number;
  blockRangeExtraPerToken: number;
  blockRangeSpanHeight: number | undefined;
  blockRangeRubyYOffset: number;
  blockRangeCenterBottomPad: number;
  blockRangeRubyEndY: number | undefined;
}
```

### Step 2: 内部クロージャ関数のモジュールレベル昇格

| 現在のクロージャ          | 昇格先                                              |
| ------------------------- | --------------------------------------------------- |
| `layoutTatetenChildren()` | `placeTatetenGroup(children, state, lctx, options)` |
| `layoutBlockChild()`      | `placeBlockChild(child, state, lctx, options)`      |

### Step 3: range ruby overflow 検出の分離

main loop の先読みロジックを `detectRangeRubyOverflow()` に抽出。

### Step 4: range ruby 消費ロジックの分離

`consumeRangeRuby(state, child)` に抽出。

### Step 5: placeBlock() の簡素化

State 初期化 + ループ（overflow 検出 → child 配置 → ruby 消費）+ 結果構築のみに縮退。

### Step 6: テスト追加

- 既存 `layout-vertical.test.ts` をリグレッションゲートとして維持
- 必須回帰ケース: range ruby overflow（center/distribute 両モード）、highlight + emphasis 共存、tateten in highlight-group、saidoku + suffix 延伸

## リスクと軽減策

| リスク                               | 影響度 | 軽減策                                             |
| ------------------------------------ | ------ | -------------------------------------------------- |
| State オブジェクトが内部実装と密結合 | 中     | State を unexported にし、内部実装の詳細として扱う |
| 関数間のデータフロー追跡が分散       | 中     | State の変更箇所を各関数のコメントで明示           |

## 検証方法

- `pnpm --filter @kanbun-skam/skam-canvas-renderer test` 成功
- `pnpm typecheck` 成功
- `pnpm lint` で `placeBlock` の complexity warning が消えることを確認
- ADR-018 の 3 レイヤ境界が維持されていることを確認

## 設計上の不変条件

- ADR-018 の Analysis / Column Planning / Placement レイヤ境界を維持
- `layoutSingleToken()` と `computeTokenContentHeight()` の責務は変更しない
- ADR-017 の `emphasisOverrideX` 優先順位を維持
- `rangeRubyAlignment` の仕様・算式・期待値を維持
- 公開 API（`render`, `measure`, `PROFILES`）は変更しない

<!-- validated -->
