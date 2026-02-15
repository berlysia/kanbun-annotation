# Plan: Range Ruby Align Options

## Context

Canvas renderer で複数文字にわたる読み仮名（range yomigana）の配置オプションを追加する。現在は center 固定。

**2つのオプションは別概念:**

- `rangeRubyAlignment: 'distribute' | 'center'` — overflow（ルビ > 漢字列）時の **漢字側** レイアウト（既存、変更なし）
- `rangeRubyAlign: 'center' | 'start' | 'end' | 'justify'` — non-overflow（漢字列 >= ルビ）時の **ルビ側** 配置（今回追加）

## Option Values

| `rangeRubyAlign` | 動作                                                                             |
| ---------------- | -------------------------------------------------------------------------------- |
| `'center'`       | ルビをスパン中央に配置                                                           |
| `'start'`        | ルビをスパン先頭（縦:上、横:左）に配置                                           |
| `'end'`          | ルビをスパン末尾（縦:下、横:右）に配置                                           |
| `'justify'`      | ルビ文字をスパン全体に均等配分（numChars <= 1 or overflow 時は center fallback） |

デフォルト: `'justify'`

## Implementation

### Step 1: types.ts

**File:** `packages/skam-canvas-renderer/src/types.ts`

- `CanvasRenderOptions`, `MeasureOptions` に追加: `rangeRubyAlign?: 'center' | 'start' | 'end' | 'justify'`
- `ResolvedOptions` に追加（non-optional）
- `SlotLayout` に `charAdvance?: number` 追加（justify 用）
- `TokenLayoutContext` に `rangeRubyAlign` 追加

### Step 2: layout.ts

**File:** `packages/skam-canvas-renderer/src/layout.ts`

`rangeRubyAlign: options?.rangeRubyAlign ?? 'justify'`

### Step 3: layout-vertical.placement.ts

**File:** `packages/skam-canvas-renderer/src/layout-vertical.placement.ts`

#### 3a. `blockLctx` に `rangeRubyAlign` 追加（line 266）

#### 3b. `layoutSingleToken` ruby Y 計算修正（line 55-66）

```typescript
if (slots.rubySpan && slots.rubySpan > 1) {
  const spanHeight = lctx.rangeRubySpanHeight ?? slots.rubySpan * cellAdvance;
  const numChars = [...slots.ruby].length;
  const rubyTextHeight = numChars * rubyFontSize;
  const yOff = lctx.rangeRubyYOffset ?? 0;
  const align = lctx.rangeRubyAlign ?? 'center';

  if (align === 'justify' && numChars > 1 && spanHeight > rubyTextHeight) {
    rubyY = tokenY + yOff;
    rubyCharAdvance = (spanHeight - rubyFontSize) / (numChars - 1);
  } else if (align === 'start') {
    rubyY = tokenY + yOff;
  } else if (align === 'end') {
    rubyY = tokenY + Math.max(0, spanHeight - rubyTextHeight) + yOff;
  } else {
    // center (default, also justify fallback)
    rubyY = tokenY + Math.max(0, (spanHeight - rubyTextHeight) / 2) + yOff;
  }
}
```

tateten グループ内も `layoutSingleToken` 経由なので自動適用。

### Step 4: draw-text.ts

**File:** `packages/skam-canvas-renderer/src/draw-text.ts`

`drawVerticalText` に `charAdvance?: number` パラメータ追加:

```typescript
currentY += charAdvance ?? fontSize;
```

### Step 5: draw.ts

**File:** `packages/skam-canvas-renderer/src/draw.ts`

`drawSlotIfPresent` で `slot.charAdvance` を `drawVerticalText` に渡す。

### Step 6: テスト

**File:** `packages/skam-canvas-renderer/src/__tests__/layout-vertical.test.ts`

各 align モードのテスト追加:

- `start`: `rubyY === tokenY`
- `end`: `rubyY === tokenY + spanHeight - rubyTextHeight`
- `justify`: `charAdvance === (spanHeight - rubyFontSize) / (numChars - 1)` + `rubyY === tokenY`
- `justify` fallback (ruby >= span): center と同じ
- `center`: 既存テスト（変更なし）

## Verification

1. `pnpm --filter @kanbun/skam-canvas-renderer test`
2. `pnpm typecheck`
3. Playground で目視確認

<!-- validated -->
