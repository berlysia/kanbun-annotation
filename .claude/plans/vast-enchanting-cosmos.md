# Canvas Renderer レイアウト4件修正計画

## Context

コミット `7a69053` で 2-Row Grid Layout Model を実装した後、Playground での目視検証により 4 件のレイアウト問題が確認された（`.tmp/docs/canvas-layout-issues-2026-02-09.md`）。全て `layout-vertical.ts` の座標計算の問題であり、描画ロジック (`draw.ts`, `draw-marks.ts`) の変更は不要。

## 変更ファイル

- `packages/skam-canvas-renderer/src/layout-vertical.ts` — 4件の修正
- `packages/skam-canvas-renderer/src/__tests__/layout-vertical.test.ts` — アサーション更新・新規テスト追加

## 修正順序と詳細

### Step 1: Issue 3 — Highlight 左右反転 (Critical)

**問題:** `highlightLineX = blockColumnX - highlightGap` でカラム左側に配置。正しくは右側。

**修正箇所:** `layout-vertical.ts` L356

```typescript
// Before:
const highlightLineX = blockColumnX - highlightGap;

// After:
const highlightLineX = blockColumnX + columnWidth + highlightGap;
```

**テスト更新:**

| テスト (行)                                                                 | 変更内容                                                                    |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `generates highlightLines for highlight group` (L548-566)                   | `hl.x` のアサーション追加: `col.x + col.width + 2`                          |
| `places highlight-ref refLayout above highlight group start` (L616-641)     | `hl.refLayout!.x` = `hl.x` (暗黙的に右側に移動、追加のアサーション変更なし) |
| `places highlight lines relative to their column in multi-block` (L727-741) | L739: `col0.x - 2` → `col0.x + col0.width + 2`                              |

**draw-marks.ts への影響:** なし。`drawHighlightLine` は `layout.x` をそのまま使用するため、X 値が変わるだけで描画ロジックの変更は不要。

### Step 2: Issue 4 — Emphasis 上ズレ (Medium)

**問題:** `emphasis.y = tokenY` でベース文字上端揃え。正しくは上下中心揃え。

**修正箇所:** `layout-vertical.ts` L229

```typescript
// Before:
y: tokenY,

// After:
y: tokenY + (fontSize - rubyFontSize) / 2,
```

デフォルト値: `tokenY + (24 - 12) / 2 = tokenY + 6`

**テスト更新:** 既存テスト (L347-407) は emphasis の X 座標と fontSize のみアサートしており、Y 座標のアサーションがない。以下を追加:

```typescript
// emphasis Y はベース文字の上下中央
const expectedEmphasisY = token.y + (DEFAULT_FONT_SIZE - rubyFontSize) / 2;
expect(token.slots.emphasis!.y).toBe(expectedEmphasisY);
```

4つの emphasis テスト全てに Y 座標アサーションを追加。

### Step 3: Issue 2 — Tateten アキ広すぎ (Medium)

**問題:** tateten グループ内のトークンが `cellAdvance` (48px) で進行。熟語として `fontSize` (24px) で密着すべき。

**修正箇所:** `layout-vertical.ts` L365 (`layoutTatetenChildren` 内)

```typescript
// Before:
yOffset += cellAdvance;

// After:
yOffset += fontSize;
```

**レイアウト変化:**

| 要素              | Before           | After         |
| ----------------- | ---------------- | ------------- |
| Token1 advance    | 48 (cellAdvance) | 24 (fontSize) |
| Separator advance | 24               | 24 (変更なし) |
| Token2 advance    | 48 (cellAdvance) | 24 (fontSize) |
| 2文字熟語合計     | 120px            | 72px          |

**テスト更新:**

| テスト (行)                                        | 変更内容                                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `lays out tateten group` (L438-468)                | L465: `sep.y - t1.y` が `48` → `24` に変化。式: `fontSize - fontSize/2 + separatorAdvance/2 = 24`                  |
| `tateten separator height contribution` (L470-485) | L484: `resultTateten.height - resultPlain.height` が `24` → `-24` に。tateten 版が 24px 短くなる（熟語の密着効果） |

**Issue 1 との相互作用:** tateten 内トークンが ruby/okuri を持つ場合（稀だが理論上可能）、contentHeight による拡張が必要。Step 4 で `computeTokenContentHeight` を導入した際に、tateten 内でも `max(fontSize, contentHeight)` を使用する。

### Step 4: Issue 1 — Ruby overflow (High)

**問題:** `yOffset += cellAdvance` が固定で、ruby+okuri+soegana がセル高さを超えても次のトークンと重なる。

**修正方針:** 各トークンの実際のコンテンツ高さを計算し、`max(cellAdvance, contentHeight)` で進行する。

**Suffix row（kaeri/kutoten）の除外について:**

logic-validator の指摘により kutoten の延伸を検証した結果:

- kaeri: `fontSize/2 + fontSize + R = 12 + 24 + 12 = 48 = cellAdvance` → ちょうど収まる
- kutoten: `fontSize/2 + fontSize + fontSize = 12 + 24 + 24 = 60 > cellAdvance` → 12px 超過

kutoten は **現行コードで既に 12px 超過** しているが、句読点は小さいグリフのため視覚的問題は発生していない（issue document にも未記載）。
contentHeight に含めると全 kutoten トークンが不要に 12px 拡張されるため、**suffix row は contentHeight から除外** する。
overflow の原因は右列（ruby+okuri+soegana）と左列（saidoku）の積み上げ高さであり、これらのみを対象とする。

**新規ヘルパー関数:**

```typescript
/**
 * トークンの垂直コンテンツ高さを計算。
 * セル開始位置（tokenY - fontSize/2）からコンテンツ最下端までの距離。
 *
 * Suffix row（kaeri/kutoten）は除外:
 * - kaeri は cellAdvance にちょうど収まる
 * - kutoten は現行コードで既に 12px 超過しているが視覚的問題なし
 * - overflow の原因は右列/左列の積み上げ高さのみ
 */
function computeTokenContentHeight(
  slots: TokenSlots,
  fontSize: number,
  rubyFontSize: number
): number {
  const R = rubyFontSize;

  // rubySpan > 1 の場合、ruby は複数セルに分散 → 単一セルの高さに含めない
  const rubyChars =
    slots.rubySpan && slots.rubySpan > 1 ? 0 : slots.ruby ? [...slots.ruby].length : 0;
  const okuriChars = slots.okuri ? [...slots.okuri].length : 0;
  const soeganaChars = slots.soegana ? [...slots.soegana].length : 0;
  const saidokuUnderChars = slots.saidokuUnder ? [...slots.saidokuUnder].length : 0;
  const saidokuOkuri2Chars = slots.saidokuOkuri2 ? [...slots.saidokuOkuri2].length : 0;

  // tokenY からの最大延伸量
  let maxExtent = fontSize; // ベース文字高さ

  // 右列: ruby → okuri → soegana（縦に積み上げ）
  const rightExtent = Math.max(fontSize, rubyChars * R) + okuriChars * R + soeganaChars * R;
  maxExtent = Math.max(maxExtent, rightExtent);

  // 左列: saidokuUnder → saidokuOkuri2
  if (saidokuUnderChars > 0 || saidokuOkuri2Chars > 0) {
    const leftExtent = Math.max(fontSize, saidokuUnderChars * R) + saidokuOkuri2Chars * R;
    maxExtent = Math.max(maxExtent, leftExtent);
  }

  // セル開始位置からの全高 = top gap (fontSize/2) + tokenY からの延伸量
  return fontSize / 2 + maxExtent;
}
```

**修正箇所:** 3か所の `yOffset += cellAdvance` を可変化

1. `layoutBlockChild` 内の通常トークン (L397):

   ```typescript
   const contentHeight = computeTokenContentHeight(child.slots, fontSize, rubyFontSize);
   yOffset += Math.max(cellAdvance, contentHeight);
   ```

2. `layoutBlockChild` 内の highlight-group トークン (L408):

   ```typescript
   const contentHeight = computeTokenContentHeight(highlightChild.slots, fontSize, rubyFontSize);
   yOffset += Math.max(cellAdvance, contentHeight);
   ```

3. `layoutTatetenChildren` 内のトークン (L365, Step 3 で `fontSize` に変更済み):
   ```typescript
   const contentHeight = computeTokenContentHeight(groupChild.slots, fontSize, rubyFontSize);
   yOffset += Math.max(fontSize, contentHeight);
   ```

**`TokenSlots` 型インポート:** `computeTokenContentHeight` は `TokenSlots` を引数に取るため、`types.ts` から `TokenSlots` をインポートに追加する。

**テスト更新:**

| テスト (行)                                       | 変更内容                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `lays out multiple tokens top-to-bottom` (L69-86) | マークなしトークンは `contentHeight = 12 + 24 = 36 < 48 = cellAdvance` なので変更なし |
| `computes correct document dimensions` (L317-328) | 同上、変更なし                                                                        |

**新規テスト追加:**

```typescript
it('expands cell when ruby+okuri overflow cellAdvance', () => {
  // ruby 4文字 + okuri 1文字 → contentHeight = 12 + max(24, 48) + 12 = 72 > 48
  // 次のトークンの y は cellAdvance ではなく contentHeight 分ずれる
});

it('does not expand cell when ruby fits within cellAdvance', () => {
  // ruby 2文字 → contentHeight = 12 + max(24, 24) + 0 = 36 < 48
  // 通常の cellAdvance を使用
});
```

## 検証

### 自動テスト

```bash
pnpm --filter @kanbun/skam-canvas-renderer test
```

### 型チェック

```bash
pnpm typecheck
```

### 目視確認（オプション）

```bash
pnpm playground:dev
```

- sample=16（全要素総合）: ruby overflow、tateten アキの確認
- sample=11/12（傍線）: highlight 右側配置の確認
- sample=8（傍点）: emphasis 上下中央配置の確認

## コミット戦略

1件のコミットにまとめる:

```
fix(skam-canvas-renderer): fix highlight/emphasis/tateten/ruby-overflow layout issues
```

4件とも `layout-vertical.ts` の座標計算修正であり、密接に関連するため。

<!-- validated -->
