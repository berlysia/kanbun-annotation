# Fix: Multi-token ruby-grid の文字間にアキが適用されない (Issue #4)

## Context

commit 18fbcaa (#3 fix) で `.skam-ruby-grid > .skam-base` に `letter-spacing: 0` を追加し、
ルビの中央寄せずれを修正した。しかし multi-token range（例: `啼鳥` with yomigana `ていてう`）の
base text 文字間スペーシングが消えた。

**2 つの問題:**
1. Multi-token base text が plain text ("啼鳥") のため、`letter-spacing: 0` で文字間 spacing が全消失
2. Suffix-row の spacing モデルが加算式（suffix + LS）で、正しくは max(LS, suffix_content_size) であるべき

## 修正方針

### Issue A: Base text segmentation

Multi-token base text を個別 `<span class="skam-base-seg">` に分割し、CSS margin で inter-character spacing を確保。
`letter-spacing: 0` は維持してルビ中央寄せを保護。

```
Before: <span class="skam-base">啼鳥</span>
After:  <span class="skam-base"><span class="skam-base-seg">啼</span><span class="skam-base-seg">鳥</span></span>
```

CSS: `.skam-base-seg + .skam-base-seg { margin-inline-start: var(--LS) }`

### Issue B: Suffix-row max model

現在の suffix-row spacing:
```
margin-inline-start: -LS  (grid padding 領域に引き戻し)
margin-inline-end: +LS    (次トークンへの spacing)
→ 効果: [base][suffix_content][LS][next] = base + suffix + LS (加算)
```

修正後:
```
margin-inline-start: -LS  (維持)
margin-inline-end: 0      (撤去)
min-inline-size: var(--LS) (suffix が LS より短い場合も最低 LS 確保)
→ 効果: [base][max(suffix_content, LS)][next] = base + max(suffix, LS) (max)
```

**結果: base 間 advance = max(LS, suffix_content_size)** — tateten-sep と同等のモデル。

### Writing mode considerations

- `vertical-rl`: `min-inline-size` = `min-height`（物理的縦方向）。正しい方向。
- `horizontal-tb`: `min-inline-size` = `min-width`。同様に正しい。

## Steps

### 1. `RangeTokenInfo` に `tokenTexts` を追加
**File**: `packages/skam-html-renderer/src/render-tree-types.ts`

`tokenTexts?: string[]` を追加。multi-token range の個別 token テキスト。

### 2. AIR adapter で `tokenTexts` を設定
**File**: `packages/skam-html-renderer/src/air-adapter.ts`

- `convertRangeInfo` に `tokens: Token[]` パラメータを追加
- `rangeInfo.tokenIds` から各 token text を lookup → `tokenTexts` に設定（2+ tokens のみ）
- 呼び出し元 (`convertTokenNode`, `convertTatetenGroup`, `convertHighlightGroup`) から tokens 伝播

### 3. `renderTokenWithRuby` で base content をセグメント化
**File**: `packages/skam-html-renderer/src/token-renderer.ts`

- grid mode + yomigana 有りパス（line 88-101）:
  - `rangeInfo?.tokenTexts?.length > 1` → 各 text を `<span class="${prefix}-base-seg">${escapeHtml(text)}</span>` でラップ
  - 単一 token → 従来通り plain text

### 4. CSS 変更
**File**: `packages/skam-html-renderer/src/styles.ts`

**4a. Base segment spacing** (新規追加):
```css
:where(.${p}-base-seg) + :where(.${p}-base-seg) {
  margin-inline-start: var(--${vp}-letter-spacing);
}
```

**4b. Suffix-row max model** (既存変更):
```css
:where(.${p}-suffix-row) {
  /* 変更: margin-inline-end: var(--LS) → 0 */
  margin-inline-end: 0;
  /* 追加: suffix が LS より短い場合も最低 LS を確保 */
  min-inline-size: var(--${vp}-letter-spacing);
}
```

### 5. テスト (TDD: Red-Green-Refactor)
**File**: `packages/skam-html-renderer/src/__tests__/renderer.test.ts`

- Red: multi-token yomigana → `.skam-base-seg` が出力されるテスト
- Red: suffix-row CSS が `margin-inline-end: 0` + `min-inline-size` を含むテスト
- Green: ステップ 1-4 を適用
- Refactor: 全テスト regression 確認

## Verification

1. `pnpm --filter @kanbun/skam-html-renderer test` 全パス
2. `pnpm typecheck` 成功
3. Playground 目視確認（`pnpm --filter @kanbun/skam-html-renderer build` → リロード）:
   - 春曉 + 一字アキ: `啼鳥` の文字間に spacing 表示
   - 単一 token (`覺`/おぼ): ルビ中央寄せ維持
   - suffix-row: ヲ, ㆒ 等が適切に配置、次トークンとの間隔が max(LS, suffix)
   - 横書きモードでも同様に機能

## Scope exclusion

- emphasis-row の multi-token spacing は別途対応
- `ruby` method（非 grid）は `letter-spacing: 0` 適用外のため影響なし
- tateten group は既存 sep メカニズムで対応済み
