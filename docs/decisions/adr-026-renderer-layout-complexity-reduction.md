---
status: Complete
deps: [18]
plan: plan-renderer-layout-complexity-reduction.md
---

# ADR-026: Renderer Layout 複雑度削減

実装計画: [Plan](../plans/plan-renderer-layout-complexity-reduction.md)

## コンテキスト

### ADR-018 との関係

ADR-018 により `layout-vertical.ts` は Analysis / Column Planning / Placement の 3 レイヤに分割済み。しかし Placement レイヤの `placeBlock()` は CC 48・605 行のまま残っており、3 層分割の恩恵を活かしきれていない。本 ADR は ADR-018 の Placement レイヤ内部をさらに精緻化するものである。

### placeBlock() の現状（CC 48, 605 行）

`packages/skam-canvas-renderer/src/layout-vertical.placement.ts` の `placeBlock()` は以下の特徴を持つ:

1. **10+ のクロージャ変数**: `yOffset`, `columnChildren`, `highlightLines`, `rubySpanRemaining`, `blockRangeExtraPerToken`, `blockRangeSpanHeight`, `blockRangeRubyYOffset`, `blockRangeCenterBottomPad`, `blockRangeRubyEndY` 等
2. **内部クロージャ関数 2 個**: `layoutTatetenChildren()` (113 行), `layoutBlockChild()` (83 行)
3. **yOffset の暗黙的共有**: 内部関数がクロージャ経由で `yOffset` を直接変更
4. **range ruby overflow の 2 段階検出**: block レベル先読み + token 内 align 処理

### 複雑度の主要因

| 要因                                               | CC 寄与 | 行数 |
| -------------------------------------------------- | :-----: | :--: |
| range ruby overflow 検出 + パラメータ計算          |   ~12   | ~80  |
| highlight-group の rightAdjust + emphasis override |   ~8    | ~60  |
| child type ディスパッチ（token/tateten/highlight） |   ~6    | ~30  |
| range ruby 消費・リセット                          |   ~5    | ~30  |
| center/distribute モード分岐                       |   ~4    | ~20  |
| その他（初期化、emphasis override 分岐等）         |   ~13   | ~385 |

## 検討した選択肢

### Option A: BlockLayoutState + モジュール関数

- 可変状態を `BlockLayoutState` オブジェクトに集約し、内部クロージャ関数をモジュールレベル関数に昇格
- 利点: テスト可能性向上、状態の明示化、P1 の Context 集約とも整合
- 利点: 関数型スタイル（このコードベースの主流）と親和性が高い
- 欠点: State オブジェクトの設計が必要

### Option B: Strategy パターン（child type ごと）

- `TokenLayoutStrategy`, `TatetenLayoutStrategy`, `HighlightLayoutStrategy` クラスに分離
- 利点: OOP 的に明確な責務分離
- 欠点: コードベースは関数型スタイルが主流で異質

### Option C: 段階的抽出のみ

- range ruby overflow 計算と highlight 配置のみを別関数に抽出
- 利点: 最小変更
- 欠点: CC 目標 12 に届かない可能性（内部クロージャと yOffset 共有が残る）

## 決定

**Option A（BlockLayoutState + モジュール関数）** を採用する。

### P0: placeBlock() の分解

#### 1. BlockLayoutState の導入

range ruby 追跡状態を集約する。`columnChildren` と `highlightLines` は各関数の戻り値として扱う。

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

**`columnChildren` と `highlightLines` を除外する理由**:

- これらは「蓄積結果」であり「追跡状態」ではない
- 各関数が戻り値で追加要素を返し、呼び出し元で concat する方が関数の入出力が明確
- State オブジェクトの肥大化を防ぐ

#### 2. モジュールレベル関数への昇格

| 現在                                 | 変更後                                                     | 役割                    |
| ------------------------------------ | ---------------------------------------------------------- | ----------------------- |
| クロージャ `layoutTatetenChildren()` | `placeTatetenGroup(children, state, lctx, options)`        | tateten グループ内配置  |
| クロージャ `layoutBlockChild()`      | `placeBlockChild(child, state, lctx, options)`             | child type ディスパッチ |
| main loop の range ruby 先読み       | `detectRangeRubyOverflow(block, childIdx, state, options)` | overflow パラメータ計算 |
| main loop の range ruby 消費         | `consumeRangeRuby(state, child)`                           | 消費カウンタ更新        |

#### 3. placeBlock() のリファクタリング後の構造

```typescript
function placeBlock(block, plan, options): ColumnLayout {
  const state = createInitialState();
  const columnChildren: ColumnChild[] = [];
  const highlightLines: HighlightLineLayout[] = [];

  for (const child of block.children) {
    // range ruby overflow 検出
    if (shouldDetectOverflow(child)) {
      detectRangeRubyOverflow(block, childIdx, state, options);
    }
    // child 配置
    const result = placeBlockChild(child, state, lctx, options);
    columnChildren.push(...result.children);
    if (result.highlightLines) highlightLines.push(...result.highlightLines);
    // range ruby 消費
    consumeRangeRuby(state, child);
  }

  return { x, y, width, height: state.yOffset, children: columnChildren, highlightLines };
}
```

### P1 方向性（未確定）

P0 完了後の知見を元に以下を検討:

#### Range mark overlap resolver の抽出

HTML renderer (`buildFlatTokenList`, CC 32) と Canvas renderer の両方で range mark の重複解決が必要。`@kanbun/skam/rendering` に共通化する可能性を検討（ADR-021 の AIR 方向性と関連）。

#### Canvas renderer Layout Pipeline の Context 集約

P0 の `BlockLayoutState` を基盤に、`LayoutContext` の設計を見直す。現在は `LayoutContext` と `BlockLayoutState` が異なるレベルの状態を混在させているため、責務を明確に分離する。

### P2 方向性（未確定）

#### Render Strategy 階層化

書字方向（vertical/horizontal）× ルビ方式（range ruby alignment: center/distribute/justify 等）の組み合わせ爆発に対応する Strategy 階層の導入。ADR-021 の AIR 完成後に、レンダラー固有のレイアウト戦略として検討。

## 予想される効果

| メトリクス                      | 現状            | P0 後                                                 |
| ------------------------------- | --------------- | ----------------------------------------------------- |
| `placeBlock()` CC               | 48              | ~12（ループ + dispatch のみ）                         |
| 最大関数 CC（Placement レイヤ） | 48              | ~15（placeTatetenGroup が最大）                       |
| クロージャ変数数                | 10+             | 0（State オブジェクトに集約）                         |
| テスト粒度                      | placeBlock 全体 | 関数単位（overflow 検出、child 配置を個別テスト可能） |

## テスト戦略

- 既存の `layout-vertical.test.ts` をリグレッションゲートとして維持
- 抽出した関数にユニットテスト追加
- **必須回帰ケース**:
  - range ruby overflow（center/distribute 両モード）
  - highlight + emphasis 共存（emphasis override の優先順位）
  - tateten in highlight-group
  - saidoku + suffix 延伸

## 設計上の不変条件

- ADR-018 の 3 レイヤ境界は維持する
- `layoutSingleToken()` と `computeTokenContentHeight()` の責務は変更しない
- ADR-017 の `emphasisOverrideX` 優先順位を維持する
- `rangeRubyAlignment` の仕様・算式・期待値を維持する
- 公開 API（`render`, `measure`, `PROFILES`）は変更しない

## 受け入れ条件

- `placeBlock()` の CC が 15 以下に削減されている
- 可変状態が `BlockLayoutState` に集約されている
- 内部クロージャ関数がモジュールレベル関数に昇格している
- 既存テストが全件パスする
- `pnpm --filter @kanbun/skam-canvas-renderer test` 成功
- `pnpm typecheck` 成功

## 影響

### ポジティブ

- Placement レイヤの内部構造が ADR-018 の設計意図に沿って精緻化される
- range ruby overflow ロジックの個別テスト・デバッグが可能になる
- highlight 配置ロジックの独立性が向上する
- P1 の Context 集約の基盤となる

### ネガティブ

- `BlockLayoutState` の設計が placeBlock 内部実装と密結合になるリスク
- 関数間の State 受け渡しにより、データフローの追跡が分散する

## 参考

- `packages/skam-canvas-renderer/src/layout-vertical.placement.ts`
- `packages/skam-canvas-renderer/src/layout-vertical.ts`
- `packages/skam-canvas-renderer/src/__tests__/layout-vertical.test.ts`
- [ADR-018](adr-018-canvas-layout-vertical-refactor-architecture.md)
- [ADR-021](adr-021-phase3-shared-annotation-ir.md)
- [構造解析レポート 2026-02-16](../structure-analysis-2026-02-16.md)
