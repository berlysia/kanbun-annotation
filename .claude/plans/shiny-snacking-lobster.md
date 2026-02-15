# Canvas Renderer 再設計計画

## Context

Canvas Renderer の内部モデルが HTML Renderer の設計から学べていない。具体的には:

1. **TokenSlots がフラットなスロットバッグ**: Mark の構造情報を string に潰し、layout パスで関係性を再推論
2. **range mark 処理がコピペ**: yomigana/okurigana/soegana で同一パターンを3回重複
3. **layoutSingleToken が 154 行の条件分岐**: hasSuffix のグローバルフラグで全分岐が二重化
4. **~280 行の重複コード**: 両レンダラーで同一ロジック（resolveRefValues, convertKaeriToUnicode 等）

**設計コンセプトの転換**: 「eager に値に潰して後段で再推論」→「構造を保持し、レイアウト判断を Pass 1 で完結させる」

## フェーズ構成

各フェーズは独立コミット可能。テストは全フェーズで既存の 160+ テストが通り続ける（リファクタリングのみ）。

---

### Phase 0: 共有ユーティリティの抽出

**目的**: 両レンダラーの重複コードを `@kanbun/skam/rendering` サブパスに集約

**重複確認済み**: 全関数をソースレベルで比較し、ロジックの同一性を確認。
唯一の差異は `resolveEmphasisCharacter` の引数（Canvas: `style?: string`, HTML: `style: string`）→ 共有版は `style?: string` で統一。

| 関数                                     | Canvas 場所        | HTML 場所        |
| ---------------------------------------- | ------------------ | ---------------- |
| `convertKaeriToUnicode`                  | helpers.ts:20      | renderer.ts:567  |
| `resolveEmphasisCharacter`               | helpers.ts:35      | renderer.ts:587  |
| `formatRefIndex`                         | helpers.ts:68      | renderer.ts:634  |
| `resolveRefValues`                       | helpers.ts:112     | renderer.ts:671  |
| `getRangeMarkGroups`                     | render-tree.ts:286 | renderer.ts:526  |
| `getTatetenGroups`                       | render-tree.ts:244 | renderer.ts:492  |
| `getHighlightGroups`                     | render-tree.ts:265 | renderer.ts:759  |
| `getMarksForToken` (= resolveTokenMarks) | render-tree.ts:54  | renderer.ts:427  |
| `groupTokensByBlock`                     | render-tree.ts:210 | renderer.ts:1277 |
| 定数 (KAERI_UNICODE, IROHA_SEQUENCE 等)  | constants.ts       | renderer.ts 内   |

**新規ファイル構成**:

```
packages/skam/src/rendering/
  index.ts              - re-exports
  constants.ts          - KAERI_UNICODE, IROHA_SEQUENCE, etc.
  kaeri.ts              - convertKaeriToUnicode
  emphasis.ts           - resolveEmphasisCharacter
  ref.ts                - formatRefIndex, resolveRefValues
  mark-groups.ts        - getRangeMarkGroups, getTatetenGroups, getHighlightGroups
  mark-lookup.ts        - getMarksForToken (renderer-specific anchor endpoint matching)
  block-utils.ts        - groupTokensByBlock
  types.ts              - RangeMarkGroup 型
```

**設定変更**:

- `packages/skam/tsup.config.ts`: entry に `'src/rendering/index.ts'` 追加
- `packages/skam/package.json`: exports に `"./rendering"` 追加

**既存ファイル変更**:

- `packages/skam-canvas-renderer/src/helpers.ts` → `splitKaeriForTateten` のみ残す。KAERI_UNICODE は `@kanbun/skam/rendering` からインポート
- `packages/skam-canvas-renderer/src/constants.ts` → 削除（`@kanbun/skam/rendering/constants` に移動済み）
- `packages/skam-canvas-renderer/src/render-tree.ts` → `@kanbun/skam/rendering` からインポート
- `packages/skam-html-renderer/src/renderer.ts` → `@kanbun/skam/rendering` からインポート、~280行削除

**テスト**: canvas `helpers.test.ts` のテストを `@kanbun/skam` 側に移動、re-export確認テスト残す

---

### Phase 1: Pass 1 出力の構造エンリッチ

**目的**: layout パスが re-infer する必要をなくす

**変更: `hasSuffix` を CanvasRenderTree に追加**

```typescript
export interface CanvasRenderTree {
  blocks: CanvasBlockNode[];
  hasSuffix: boolean; // NEW: Pass 1 で計算済み
}
```

- `buildRenderTree()` で全トークンスロットをスキャンして計算
- `layoutVertical()` から `collectAllTokens()` + スキャンループ（lines 62-97, 286-314）を削除

**対象ファイル**:

- `packages/skam-canvas-renderer/src/types.ts` - 型追加
- `packages/skam-canvas-renderer/src/render-tree.ts` - hasSuffix 計算
- `packages/skam-canvas-renderer/src/layout-vertical.ts` - `tree.hasSuffix` 参照に切替

---

### Phase 2: range mark 処理の統一

**目的**: 3つの同一パターンループを1つの汎用関数に統合

**現状** (render-tree.ts:442-526): yomigana/okurigana/soegana で同一構造のループが3回

**新設計**:

```typescript
type RangeConcentration = 'first' | 'last';

interface RangeSlotConfig {
  type: 'yomigana' | 'okurigana' | 'soegana';
  slotName: 'ruby' | 'okuri' | 'soegana';
  concentration: RangeConcentration;
  setSpan: boolean; // yomigana のみ true (rubySpan を設定)
}

const RANGE_CONFIGS: RangeSlotConfig[] = [
  { type: 'yomigana', slotName: 'ruby', concentration: 'first', setSpan: true },
  { type: 'okurigana', slotName: 'okuri', concentration: 'last', setSpan: false },
  { type: 'soegana', slotName: 'soegana', concentration: 'last', setSpan: false },
];
```

**applyRangeConcentration の動作**:

- `concentration: 'first'`: mark.value を先頭トークンの slotName に設定。setSpan=true なら rubySpan も設定。後続トークンの同スロットをクリア
- `concentration: 'last'`: mark.value を末尾トークンの slotName に設定。先行トークンの同スロットをクリア
- 3タイプの差異は全てこの config で表現可能（ソースコード比較で確認済み）

**対象ファイル**:

- `packages/skam-canvas-renderer/src/render-tree.ts` - 3ループを `applyRangeConcentration()` × 3 呼び出しに置換

---

### Phase 3: グリッドレイアウトの抽象化

**目的**: ad-hoc な X/Y 計算を事前計算済みグリッドモデルに置換

**新設計**:

```typescript
/** 事前計算済みグリッド列位置（絶対 X 座標） */
interface GridColumns {
  saidoku2X: number; // 再読2回目
  kaeriX: number; // 返り点
  baseX: number; // 基底文字中心
  suffixX: number; // okuri/soegana/ruby
  kutotenX: number; // 句読点（base 下方）
  emphasisBaseX: number; // 傍点（ruby なし時）
  emphasisWithRubyX: number; // 傍点（ruby あり時）
  refX: number; // ref（base と同じ）
}

/** 列ごとのレイアウトコンテキスト */
interface ColumnGridContext {
  columnX: number;
  columnY: number;
  grid: GridColumns;
  fontSize: number;
  rubyFontSize: number;
  cellAdvance: number;
}
```

**hasSuffix の分岐が消える理由**: `computeGridColumns()` が hasSuffix を吸収して適切な GridColumns を返す。`layoutSingleToken()` は GridColumns の値を使うだけ。

```typescript
function computeGridColumns(
  columnX: number,
  columnWidth: number,
  fontSize: number,
  rubyFontSize: number,
  slotGap: number,
  hasSuffix: boolean
): GridColumns {
  if (hasSuffix) {
    const rightColX = columnX + columnWidth - rubyFontSize / 2;
    const col3X = columnX + rubyFontSize + rubyFontSize / 2;
    const col4X = columnX + rubyFontSize / 2;
    return {
      saidoku2X: col4X,
      kaeriX: col3X,
      baseX: columnX + 2 * rubyFontSize + fontSize / 2,
      suffixX: rightColX,
      kutotenX: rightColX - rubyFontSize,
      emphasisBaseX: rightColX,
      emphasisWithRubyX: rightColX + rubyFontSize,
      refX: columnX + 2 * rubyFontSize + fontSize / 2,
    };
  } else {
    // hasSuffix=false の場合、kaeri/kutoten/saidoku のスロットは定義上存在しない
    // （これらが存在するなら hasSuffix=true になる）。
    // よって saidoku2X/kaeriX/kutotenX の値は参照されない。
    const baseX = columnX + fontSize / 2;
    return {
      saidoku2X: 0,
      kaeriX: 0,
      kutotenX: 0, // 未使用（安全）
      baseX,
      suffixX: baseX + slotGap, // ruby 位置
      emphasisBaseX: baseX + slotGap,
      emphasisWithRubyX: baseX + slotGap + rubyFontSize,
      refX: baseX,
    };
  }
}
```

**layoutSingleToken の簡素化** (154行 → ~80行):

条件分岐 `if (hasSuffix)` が消え、全スロットが `grid.xxxX` を参照するだけになる。

**対象ファイル**:

- `packages/skam-canvas-renderer/src/types.ts` - GridColumns, ColumnGridContext 型追加（内部型）
- `packages/skam-canvas-renderer/src/layout-vertical.ts` - `computeGridColumns()` 抽出、`layoutSingleToken()` 書き直し

---

## 検証方法

各フェーズ完了時:

```bash
pnpm test          # 全 160+ テスト通過
pnpm typecheck     # 型チェック通過
pnpm build         # ビルド成功
pnpm lint          # リント通過
```

Phase 0 追加確認:

```bash
pnpm --filter @kanbun/skam test  # 新規共有ユーティリティテスト
```

## リスク評価

| Phase | リスク   | 理由                                                                                 |
| ----- | -------- | ------------------------------------------------------------------------------------ |
| 0     | 低       | 純粋なコード移動、ロジック変更なし                                                   |
| 1     | 非常に低 | boolean フラグ1つの事前計算                                                          |
| 2     | 低       | 同一パターンの統合、テストが全ケースカバー                                           |
| 3     | 中       | 座標計算の書き直し。50+ のレイアウトテストが座標値を厳密に検証するため回帰検知は確実 |

## 主要ファイル一覧

- `packages/skam/src/rendering/` - 新規（Phase 0）
- `packages/skam/tsup.config.ts` - entry 追加（Phase 0）
- `packages/skam/package.json` - exports 追加（Phase 0）
- `packages/skam-canvas-renderer/src/types.ts` - 型拡張（Phase 1, 3）
- `packages/skam-canvas-renderer/src/render-tree.ts` - 構造エンリッチ + range統合（Phase 0, 1, 2）
- `packages/skam-canvas-renderer/src/layout-vertical.ts` - グリッド抽象化（Phase 1, 3）
- `packages/skam-canvas-renderer/src/helpers.ts` - 縮小（Phase 0）
- `packages/skam-canvas-renderer/src/constants.ts` - 削除（Phase 0）
- `packages/skam-html-renderer/src/renderer.ts` - 共有化による縮小（Phase 0）

<!-- validated -->
