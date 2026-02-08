# Plan: Canvas Renderer Phase 2 — 残りの anchor-based マーク

<!-- validated -->

関連 ADR: [ADR-012](../decisions/adr-012-canvas-renderer.md)
関連 Plan: [Phase 1 Plan](plan-canvas-renderer.md)

## Context

Phase 1 完了済み（52テスト全パス）。5種マーク（yomigana, okurigana, soegana, kaeri, kutoten）の縦書き描画が動作中。

Phase 2 では残りの anchor-based マーク5種を追加する（okototen は除外）:

- **okimoji / joji**: フラグのみ（見た目変更なし）
- **emphasis**: 右側に傍点文字を描画
- **saidoku**: 二重ルビ（forms[0]→右、forms[1]→左 col4）
- **tateten**: トークングルーピング + U+3190 セパレータ

## 前提修正: resolveTokenMarks() のバグ修正

**問題**: 現在の `render-tree.ts` の `resolveTokenMarks()` else 分岐は `anchor.from === tokenId || anchor.to === tokenId` のみチェックし、**中間トークンをマッチしない**。HTML renderer の `getMarksForToken()` は from〜to 範囲内の全トークンにマッチする。

**影響**: emphasis, okimoji, joji, tateten, saidoku はすべて anchor 範囲の全トークンに適用される必要がある。

**修正**: Phase 2a の最初に else 分岐に中間トークンマッチングを追加。

---

## 実装サブフェーズ

- **Phase 2a**: resolveTokenMarks バグ修正 + okimoji / joji（フラグのみ）
- **Phase 2b**: emphasis + saidoku（スロット追加、ツリー構造維持）
- **Phase 2c**: tateten（ツリー構造変更、2コミット分割）

---

## Phase 2a: バグ修正 + okimoji / joji

### render-tree.ts — resolveTokenMarks() 中間トークンマッチ追加

```typescript
// else 分岐を修正（allTokens: Token[] を引数追加）:
} else {
  let matched = mark.anchor.from === tokenId || mark.anchor.to === tokenId;
  if (!matched && mark.anchor.from !== mark.anchor.to) {
    const fromIdx = allTokens.findIndex(t => t.id === mark.anchor.from);
    const toIdx = allTokens.findIndex(t => t.id === mark.anchor.to);
    const tokenIdx = allTokens.findIndex(t => t.id === tokenId);
    if (fromIdx !== -1 && toIdx !== -1 && tokenIdx !== -1) {
      matched = tokenIdx > fromIdx && tokenIdx < toIdx;
    }
  }
  if (matched) { /* 既存処理 */ }
}
```

### types.ts — TokenSlots フラグ追加

```typescript
isOkimoji?: boolean;
isJoji?: boolean;
```

### render-tree.ts — resolveSlots() フラグ解決

- `profile.okimoji && tokenMarks.has('okimoji')` → `slots.isOkimoji = true`
- `profile.joji && tokenMarks.has('joji')` → `slots.isJoji = true`

### テスト

- 中間トークンマッチの検証（3トークン範囲で全トークンにマッチ）
- okimoji/joji フラグ解決（単一トークン、範囲）

→ **Commit 1**

---

## Phase 2b: emphasis + saidoku

### 1. helpers.ts — resolveEmphasisCharacter()

HTML renderer から移植:

```
sesame:        filled → \uFE45, open → \uFE46
double-circle: filled → \u25C9, open → \u25CE
circle:        filled → \u25CF, open → \u25CB
triangle:      filled → \u25B2, open → \u25B3
dot:           filled → \u2022, open → \u25E6
default:       \u2022 (filled dot)
```

### 2. types.ts — スロット拡張

**TokenSlots 追加**:

```typescript
emphasis?: string;        // 解決済み傍点 Unicode 文字（1文字）
saidokuUnder?: string;    // forms[1].yomi（左側 col4）
saidokuOkuri2?: string;   // forms[1].okuri（左側 col4 下）
```

**設計判断**: saidoku forms[0] は既存 ruby/okuri スロットを再利用

- saidoku と yomigana は相互排他（HTML renderer で確認済み: saidoku 優先）
- forms[0].yomi → 既存 `ruby`、forms[0].okuri → 既存 `okuri`
- forms[1] のみ新スロット（2つで十分、4つは過剰）

**ResolvedSlotLayouts 追加**:

```typescript
emphasis?: SlotLayout;      // 1トークン=1CJK文字=1傍点（単数で十分）
saidokuUnder?: SlotLayout;
saidokuOkuri2?: SlotLayout;
```

### 3. render-tree.ts — マーク解決

**emphasis**: anchor 範囲の全トークンに適用（Phase 2a のバグ修正済み else 分岐）。`resolveEmphasisCharacter(mark.style)` → `slots.emphasis`

**saidoku**: anchor.from トークンに紐付け（通常 from === to）

- `forms[0]?.yomi` → `slots.ruby`
- `forms[0]?.okuri` → `slots.okuri`
- `forms[1]?.yomi` → `slots.saidokuUnder`
- `forms[1]?.okuri` → `slots.saidokuOkuri2`
- forms が空/1要素: optional chaining で安全アクセス

### 4. layout-vertical.ts — レイアウト拡張

**emphasis**: 右側 ruby 列に配置

- suffix あり: `rightColX`。ruby 共存時は `rightColX + rubyFontSize`
- suffix なし: `tokenX + fontSize/2 + slotGap`。ruby 共存時は `+ rubyFontSize`
- 列幅への影響なし（emphasis は rubyFontSize、既存 gridWidth に収まる）

**saidoku col4**: x = `columnX + columnWidth - rubyFontSize * 3.5`

- 根拠: suffix-row 4列、各幅 R。右端から 0.5R, 1.5R, 2.5R, 3.5R が各列中心
- `saidokuUnder` → col4, y = tokenY, fontSize = rubyFontSize
- `saidokuOkuri2` → col4, saidokuUnder の下

**hasSuffix 判定**: `saidokuUnder || saidokuOkuri2` も追加

### 5. draw.ts — 描画拡張

- `slots.emphasis` → `drawChar()` で傍点文字描画
- `slots.saidokuUnder` / `slots.saidokuOkuri2` → `drawSlotIfPresent()`
- saidoku forms[0] は既存 ruby/okuri パスで自動処理

### テスト

- helpers.test.ts: resolveEmphasisCharacter 全パターン（10パターン + default + undefined）
- render-tree.test.ts: emphasis 全トークン適用、saidoku スロット、forms 境界ケース
- layout-vertical.test.ts: emphasis 座標（suffix あり/なし, ruby 共存）、saidoku col4
- draw.test.ts + integration.test.ts: emphasis/saidoku 描画

→ **Commit 2**

---

## Phase 2c: tateten（2コミット分割）

### Commit 3: tokens → children リネーム（ロジック変更なし）

構造変更をグルーピングロジックと分離し、問題切り分けを容易にする。

**types.ts**:

- `CanvasBlockNode.tokens` → `CanvasBlockNode.children` (型は `CanvasTokenNode[]` のまま)
- `ColumnLayout.tokens` → `ColumnLayout.children` (型は `TokenLayout[]` のまま)
- `TokenLayout` に `type: 'token'` 判別フィールド追加

**影響箇所** (grep 結果):

- `render-tree.ts:165` — 出力を children に
- `layout-vertical.ts:65` — `block.tokens` → `block.children`
- `draw.ts:29` — `column.tokens` → `column.children`
- テスト: `block.tokens` 25箇所、`column.tokens` 14箇所 → replace_all

### Commit 4: tateten グルーピングロジック

**helpers.ts** — splitKaeriForTateten():

```typescript
// 'レ' → { re: '\u3191', nonRe: '' }
// '一レ' → { re: '\u3191', nonRe: '\u3192' }
// '上' → { re: '', nonRe: '\u3196' }
```

**types.ts** — ユニオン型拡張:

```typescript
interface CanvasTatetenSeparator {
  type: 'tateten-separator';
  kaeri?: string;
}
interface CanvasTatetenGroupNode {
  type: 'tateten-group';
  children: (CanvasTokenNode | CanvasTatetenSeparator)[];
}
type CanvasBlockChild = CanvasTokenNode | CanvasTatetenGroupNode;
// CanvasBlockNode.children: CanvasTokenNode[] → CanvasBlockChild[]

interface TatetenSeparatorLayout {
  type: 'tateten-separator';
  x: number;
  y: number;
  fontSize: number;
  kaeri?: SlotLayout;
}
type ColumnChild = TokenLayout | TatetenSeparatorLayout;
// ColumnLayout.children: TokenLayout[] → ColumnChild[]
```

**render-tree.ts** — グルーピング:

1. `getTatetenGroups(tokens, marks)`: anchor 範囲内の全トークンに同一 mark 参照を割当 → `Map<tokenId, TatetenMark>`
2. ブロック処理時に連続トークンを `===` 参照比較で収集 → `CanvasTatetenGroupNode`
3. N トークン → N-1 セパレータ挿入
4. kaeri: `splitKaeriForTateten()` でレ→トークン suffix、非レ→セパレータ
5. 最終トークンの非レ kaeri → 最後のセパレータ

**layout-vertical.ts**:

- per-token ロジックを `layoutSingleToken()` に抽出
- tateten グループ: トークン=cellAdvance、セパレータ=`2 * rubyRatio * fontSize`
  - 根拠: HTML CSS `.tateten-sep` の `grid-template-rows: repeat(4, rubyRatio*0.5em)` = 4 _ rubyRatio _ 0.5 _ fontSize = 2 _ rubyRatio \* fontSize
- tateten 内トークンの既存 ruby/okuri は個別に表示（グループ統合しない）

**draw.ts**:

- `child.type === 'tateten-separator'` → `drawChar(ctx, '\u3190', ...)` + kaeri 描画

### テスト

- helpers.test.ts: splitKaeriForTateten
- render-tree.test.ts: 2/3トークングループ、kaeri 分割、プロファイルフィルタ
- layout-vertical.test.ts: グループ縦座標、セパレータ高さ、列高さ
- draw.test.ts: U+3190 描画、セパレータ kaeri
- integration.test.ts: tateten end-to-end

→ **Commit 3** (リネーム) + **Commit 4** (ロジック)

---

## 実装順序まとめ

```
Commit 1: resolveTokenMarks修正 + okimoji/joji フラグ
Commit 2: emphasis + saidoku
Commit 3: tokens→children リネーム（ロジック変更なし）
Commit 4: tateten グルーピングロジック
→ Playground screenshot で視覚確認
```

## 検証

1. `pnpm --filter @kanbun/skam-canvas-renderer test` — 全テストパス
2. `pnpm typecheck` — 型チェック成功
3. `pnpm build` — 全パッケージビルド成功
4. Playground screenshot で視覚確認:
   - emphasis: 基本文字の右に傍点
   - saidoku: 右に第1読み、左に第2読み
   - tateten: トークン間にセパレータ

## 変更対象ファイル

| ファイル                  | Commit   | 変更内容                                           |
| ------------------------- | -------- | -------------------------------------------------- |
| `src/types.ts`            | 1,2,3,4  | TokenSlots拡張, リネーム, TatetenGroupNode         |
| `src/helpers.ts`          | 2,4      | resolveEmphasisCharacter, splitKaeriForTateten     |
| `src/render-tree.ts`      | 1,2,4    | バグ修正, スロット解決, グルーピング               |
| `src/layout-vertical.ts`  | 2,3,4    | emphasis/saidoku配置, リネーム, グループレイアウト |
| `src/draw.ts`             | 2,3,4    | 新スロット描画, リネーム, ColumnChild dispatch     |
| `src/__tests__/*.test.ts` | 全Commit | 新テスト + tokens→children 修正                    |

## 主要リスク

| リスク                                   | 対策                                |
| ---------------------------------------- | ----------------------------------- |
| resolveTokenMarks 修正が既存テストに影響 | Commit 1 で修正後すぐテスト実行     |
| tokens→children リネーム大量修正         | Commit 3 で分離、replace_all で一括 |
| emphasis + ruby 共存時の x 座標衝突      | emphasis を ruby 右にオフセット     |
| セパレータ高さの不一致                   | Playground screenshot で比較        |
| saidoku forms が空/1要素                 | optional chaining で安全アクセス    |
| tateten 内の既存 ruby/okuri              | 個別表示（グループ統合しない）      |
