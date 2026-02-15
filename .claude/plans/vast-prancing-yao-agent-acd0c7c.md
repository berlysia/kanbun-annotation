# Logic Validation Report: Playground スマートフォン対応計画

## 検証対象

計画ファイル: `/Users/berlysia/workspace/kanbun-annotation/.claude/plans/vast-prancing-yao.md`

## 検証結果サマリー

**全体評価**: 中程度の問題あり（🟡）

実装の大枠は論理的に成立しているが、以下の重要な課題を解決してから実装に進むべき：

1. **Phase 4（ボトムシート）のDOM配置方針に技術的矛盾** — 要修正
2. **Phase 3（タッチイベント）のスクロール競合処理に仕様の曖昧さ** — 明確化必要
3. **Phase 5（2タップ範囲選択）のステートマシンに状態遷移の漏れ** — 補完必要

## 詳細検証

### 1. Phase 間の依存関係 ✅

**検証内容**: Phase 1→5 の依存関係グラフが正しいか

**結果**: 論理的に正しい

```
Phase 1 (タブ切替) ← 独立
Phase 2 (設定モーダル) ← 独立
Phase 3 (タッチイベント) ← Phase 4, 5 の前提
Phase 4 (ボトムシート) ← Phase 3 に依存
Phase 5 (2タップ範囲選択) ← Phase 3, 4 に依存
```

- Phase 1/2 は UI レイアウトのみで他に影響しない
- Phase 3 のタッチイベント通知は Phase 4/5 で使用されるため順序は正しい
- Phase 5 は Phase 4 のボトムシート表示機能を前提とするため順序は正しい

### 2. CSS-only アプローチの技術的成立性

#### 2.1 Phase 2: 設定パネルモーダル化 ✅

**方針**: `<details id="settings-panel">` を SP 時に `position: fixed; inset: 0` でフルスクリーンオーバーレイ

**検証結果**: 技術的に成立

- `<details>` は既存要素で、`[open]` 状態を CSS で検知可能
- `position: fixed` は包含ブロックから切り離されるため、親要素のフレックスレイアウトから独立可能
- バックドロップは JS で動的生成する方針も明記されており、DOM 構造変更なしで実現可能

#### 2.2 Phase 4: ボトムシート（マーク編集） 🔴

**方針（計画書より）**:

> `#selection-panel` 自体を SP で CSS `position: fixed; bottom: 0` のボトムシートとして表示。DOM 移動は不要。

**検証結果**: **技術的矛盾あり — 修正必要**

**現状の DOM 構造**（`index.html:247-249`）:

```html
<div class="preview-main">
  <!-- flex container -->
  <div class="preview-content" id="render-output"></div>
  <aside class="selection-panel" id="selection-panel">...</aside>
</div>
```

**現状の CSS**（`styles.css:577-604`）:

```css
.preview-main {
  flex: 1;
  display: flex; /* フレックスコンテナ */
  overflow: hidden;
}

.selection-panel {
  width: 200px;
  flex-shrink: 0; /* フレックスアイテム */
  border-left: 1px solid var(--editor-border);
  /* ... */
}
```

**問題点**:

1. **`position: fixed` はフレックスレイアウトから完全に切り離される**
   - `selection-panel` に `position: fixed` を適用すると、`.preview-main` のフレックスレイアウトから除外される
   - **PC 側で問題**: `.preview-main` は 2 カラムレイアウト（`preview-content` + `selection-panel`）を前提としているが、`selection-panel` が fixed になると `preview-content` が `preview-main` 全幅を占有してしまう

2. **`max-width: 768px` メディアクエリだけでは不十分**
   - SP 時のみ `position: fixed` を適用しても、PC でウィンドウサイズを縮小すると意図しない挙動になる可能性
   - 現状、`styles.css:1404-1413` で既に SP 時の `selection-panel` スタイルが定義されているが、これは `position: static`（デフォルト）を前提としている

**推奨修正案**:

**Option A**: SP 時は `.preview-main` のフレックスレイアウトを変更

```css
@media (max-width: 768px) {
  .preview-main {
    display: block; /* flex を解除 */
    position: relative;
  }

  .selection-panel {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    /* ... */
  }

  .preview-content {
    /* selection-panel の高さ分だけ padding-bottom を確保 */
    padding-bottom: 60vh; /* または動的に計算 */
  }
}
```

**Option B**: SP 時に `.preview-main` 外に DOM を移動（JS で実装）

```javascript
if (isSP()) {
  document.body.appendChild(selectionPanel);
} else {
  previewMain.appendChild(selectionPanel);
}
```

**Option C**: 2 つの selection-panel 要素を用意（PC 用 / SP 用）

```html
<!-- PC 用: .preview-main 内 -->
<aside class="selection-panel pc-only" id="selection-panel-pc">...</aside>

<!-- SP 用: body 直下 -->
<aside class="selection-panel sp-only" id="selection-panel-sp">...</aside>
```

**推奨**: Option A（CSS のみ）が計画の「DOM 移動なし」方針と一致する。ただし、`.preview-content` の padding 調整が必要。

**計画への修正提案**:

- Phase 4 の CSS 変更セクションに「`.preview-main` を SP 時に `display: block` に変更」を追加
- `.preview-content` に動的 padding-bottom を追加する手順を明記

### 3. タッチイベントとスクロールの競合処理 🟡

**方針（計画書 Phase 3）**:

```
touchstart → tokenId と座標を記録（passive: true、スクロール妨げない）
touchend   → 移動量 < 10px なら「タップ」と判定
             passive: false で preventDefault（ゴーストクリック防止）
```

**検証結果**: 仕様が曖昧 — 明確化が必要

**問題点**:

1. **passive: true と preventDefault の矛盾**
   - `touchstart` を `passive: true` で登録すると、`preventDefault()` が無効化される
   - 計画では `touchend` で `preventDefault()` を呼ぶとあるが、`touchstart` が passive の場合、ゴーストクリック（300ms 遅延クリック）を完全には防げない

2. **移動量の計算基準が不明確**
   - `touchstart` の座標を記録し、`touchend` で比較するとあるが、`touchmove` 中の最大移動量を計測するのか、start → end の直線距離を計測するのかが不明
   - スクロール中に指が横にずれる場合を考慮すると、「`touchmove` イベントの発火有無」で判定する方が堅牢

3. **スクロール中のタップ誤検出**
   - ユーザーがスクロールしようとして指を動かし始めた場合、`touchend` 時点で移動量が 10px 以下でもタップとして扱われる可能性
   - `touchmove` が一度でも発火したらタップをキャンセルするロジックが必要

**推奨修正案**:

```typescript
let touchStartPos: { x: number; y: number; tokenId: string | null } | null = null;
let touchMoved = false;

const handleTouchStart = (event: TouchEvent): void => {
  const touch = event.touches[0];
  if (!touch) return;

  const target = event.target as Element | null;
  const tokenId = getTokenIdFromElement(target, { x: touch.clientX, y: touch.clientY }, isVertical);

  touchStartPos = { x: touch.clientX, y: touch.clientY, tokenId };
  touchMoved = false;
};

const handleTouchMove = (_event: TouchEvent): void => {
  touchMoved = true; // スクロールとみなす
};

const handleTouchEnd = (event: TouchEvent): void => {
  if (!touchStartPos || touchMoved) {
    touchStartPos = null;
    return;
  }

  const touch = event.changedTouches[0];
  if (!touch) return;

  const dx = touch.clientX - touchStartPos.x;
  const dy = touch.clientY - touchStartPos.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance < 10) {
    // タップとして扱う
    event.preventDefault(); // ゴーストクリック防止

    if (touchStartPos.tokenId) {
      callbacks.onTokenClick?.(touchStartPos.tokenId, event);
    } else {
      callbacks.onEmptyClick?.(event);
    }
  }

  touchStartPos = null;
};

// イベント登録
container.addEventListener('touchstart', handleTouchStart, { passive: true });
container.addEventListener('touchmove', handleTouchMove, { passive: true });
container.addEventListener('touchend', handleTouchEnd, { passive: false }); // preventDefault のため
```

**計画への修正提案**:

- Phase 3 に `touchmove` リスナーを追加し、`touchMoved` フラグで誤検出を防ぐ仕様を明記
- cleanup 関数で `touchmove` リスナーも除去する手順を追加

### 4. 2タップ範囲選択のステートマシン 🟡

**方針（計画書 Phase 5）**:

```typescript
let spRangeState: 'idle' | 'first-selected' = 'idle';
let spFirstTokenId: string | null = null;
```

**検証結果**: エッジケースの処理に漏れあり — 補完が必要

**現状の状態遷移**（計画書より）:

```
idle → (1回目タップ) → first-selected (単一トークン選択)
first-selected → (2回目タップ・別トークン) → idle (範囲選択)
first-selected → (同トークン再タップ) → idle (単一選択維持)
first-selected → (空白タップ) → idle (選択クリア)
first-selected → (ボトムシート閉じ) → idle (状態リセット)
```

**問題点**:

1. **ボトムシート内のボタン操作時の状態遷移が不明**
   - ユーザーが 1 回目のタップで選択後、ボトムシートで「仮名を追加」などの操作をした場合、`spRangeState` はどうなるべきか？
   - 「仮名追加 → 範囲モードリセット」なのか、「仮名追加 → 範囲モード継続（2回目タップで範囲選択可能）」なのか不明

2. **範囲選択後の状態が未定義**
   - 2 回目タップで範囲選択が成功した後、`spRangeState` は `'idle'` に戻るのか？
   - もし `'idle'` に戻るなら、3 回目のタップは「新しい単一選択」として扱われるべきだが、計画書に明記されていない

3. **タブ切り替え時の状態リセットが未定義**
   - エディタタブ ↔ プレビュータブを切り替えたとき、`spRangeState` と `spFirstTokenId` をリセットすべきか？
   - リセットしないと、ユーザーが混乱する可能性あり

**推奨修正案**:

```typescript
// 状態を 3 つに拡張
let spRangeState: 'idle' | 'first-selected' | 'range-selected' = 'idle';
let spFirstTokenId: string | null = null;
let spLastTokenId: string | null = null;

// 状態遷移ルール
/*
idle:
  - 1回目タップ → first-selected (単一選択)
  - 空白タップ → idle (変化なし)

first-selected:
  - 2回目タップ（別トークン） → range-selected (範囲選択)
  - 同トークン再タップ → idle (選択クリア)
  - ボトムシート内操作（仮名追加等） → idle (操作完了後リセット)
  - 空白タップ → idle (選択クリア)
  - ボトムシート閉じ → idle
  - タブ切り替え → idle

range-selected:
  - 新規タップ → first-selected (新しい単一選択)
  - 空白タップ → idle (選択クリア)
  - ボトムシート内操作 → idle (操作完了後リセット)
  - ボトムシート閉じ → idle
  - タブ切り替え → idle
*/
```

**計画への修正提案**:

- Phase 5 の状態定義を 3 状態（`'idle' | 'first-selected' | 'range-selected'`）に拡張
- ボトムシート内操作時、タブ切り替え時の状態遷移ルールを明記
- 状態遷移図を追加して視覚化

### 5. PC 側への影響 ✅

**方針**: `isSP()` ガード内にロジックを閉じ込める

**検証結果**: 論理的に正しい

- Phase 1（タブ切替）: `.sp-tab-bar` は PC で `display: none`、JS も `isSP()` でガード
- Phase 2（設定モーダル）: CSS は SP のメディアクエリ内、バックドロップも SP でのみ生成
- Phase 3（タッチイベント）: `attachInteractiveHandlers` は既存の `onTokenClick` / `onEmptyClick` を呼ぶだけで、PC のマウスイベントとは独立
- Phase 4（ボトムシート）: `position: fixed` は SP のメディアクエリ内
- Phase 5（2タップ範囲選択）: `isSP()` ガード内で完結

ただし、**Phase 3 の型変更（`onTokenClick` の event パラメータを optional 化）は破壊的変更ではないが、影響範囲の確認が必要**。

**現状の使用箇所**（`main.ts:1881-1884`）:

```typescript
onTokenClick: (tokenId) => {
  if (!currentDocument) return;
  updateSelectionPanel(tokenId, tokenId);
  setSelectionClasses(renderOutput, tokenId, tokenId);
},
```

- `event` パラメータを使用していないため、optional 化しても問題なし ✅

### 6. ボトムシートのDOM配置方針（詳細検証） 🔴

**計画書の主張**:

> `.preview-main` 内の子要素だが、`position: fixed` で切り離せるか

**技術的検証**:

1. **`position: fixed` の挙動**（CSS 仕様）:
   - 要素は通常のドキュメントフローから**完全に除去**される
   - 包含ブロックは**ビューポート**（`<html>`）になる（`transform` / `perspective` / `filter` がない場合）
   - フレックスコンテナの子要素としての扱いは**消失**する

2. **`.preview-main` のフレックスレイアウトへの影響**:

   ```css
   .preview-main {
     display: flex; /* 2カラム: preview-content | selection-panel */
   }
   ```

   - PC 側: `selection-panel` が `position: fixed` になると、フレックスアイテムが 1 つ（`preview-content` のみ）になる
   - 結果: `preview-content` が `.preview-main` の全幅を占有 → 意図しないレイアウト崩れ

3. **メディアクエリでの制御可能性**:
   - SP 時のみ `position: fixed` を適用すれば、PC 側は影響を受けない
   - **しかし、現状の計画書では `.preview-main` のフレックスレイアウトを解除する手順がない**

**結論**: 「DOM 移動なしで実現可能」という主張は**技術的に成立するが、計画書に記載されている手順では不完全**。

### 7. interactive.ts の型変更の影響範囲 ✅

**変更内容**（計画書 Phase 3）:

```typescript
// 変更前
onTokenClick?: (tokenId: string, event: MouseEvent) => void;

// 変更後
onTokenClick?: (tokenId: string, event?: MouseEvent) => void;
```

**影響範囲の検証**:

1. **`attachInteractiveHandlers` 内部**（`interactive.ts`）:
   - `callbacks.onTokenClick?.(tokenId, event)` を呼び出している箇所を確認
   - タッチイベントでは `MouseEvent` が存在しないため、`event` を渡さずに呼び出す必要がある

2. **playground 側**（`main.ts:1881-1884`）:
   - `event` パラメータを使用していない ✅
   - optional 化しても既存コードは動作する

3. **破壊的変更の有無**:
   - **破壊的変更ではない**（パラメータを optional にする変更は後方互換）
   - ただし、他のプロジェクトで `onTokenClick` を使用している場合、型エラーは発生しない

**結論**: 安全な変更 ✅

### 8. リスク評価

計画書に記載されたリスクと対策を検証:

| リスク                            | 対策                                                 | 検証結果                                         |
| --------------------------------- | ---------------------------------------------------- | ------------------------------------------------ |
| タッチのスクロール/タップ判定閾値 | 10px で開始、実機テストで調整                        | ✅ 妥当（ただし `touchmove` フラグ追加を推奨）   |
| iOS 仮想キーボード + ボトムシート | `visualViewport` API で検知、max-height 調整         | ✅ 正しい方針（実装詳細は Phase 4 で追加すべき） |
| interactive.ts 型変更の影響       | event パラメータを optional 化（破壊的変更なし）     | ✅ 検証済み                                      |
| main.ts 肥大化                    | Phase 完了後に SP 固有ロジックのモジュール分割を検討 | ✅ 妥当な対策                                    |

**追加すべきリスク**:

| リスク                                                        | 対策                                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| ボトムシートの backdrop と preview-content のスクロールの競合 | backdrop の `pointer-events: auto` と、その下の要素の `pointer-events: none` を適切に制御  |
| ボトムシート内のスクロールと外側のスクロールの競合            | ボトムシート内で `touchmove` の `stopPropagation()` を呼び、親要素へのスクロール伝播を防ぐ |
| タブ切り替え時の状態不整合                                    | タブ切り替え時に `spRangeState` をリセットする処理を追加                                   |

## 推奨アクション

### 実装前に修正すべき項目（必須）

1. **Phase 4 のボトムシート実装方針を修正**
   - `.preview-main` を SP 時に `display: block` に変更する手順を追加
   - `.preview-content` に動的 padding-bottom を追加する手順を追加
   - または Option B（DOM 移動）/ Option C（2 要素）への方針変更を検討

2. **Phase 3 のタッチイベント仕様を明確化**
   - `touchmove` リスナーを追加し、`touchMoved` フラグで誤検出を防ぐ
   - cleanup 関数に `touchmove` リスナー除去を追加

3. **Phase 5 の状態遷移ルールを補完**
   - 状態を 3 つに拡張（`'idle' | 'first-selected' | 'range-selected'`）
   - ボトムシート内操作時、タブ切り替え時の状態遷移を明記
   - 状態遷移図を追加

### 実装時に注意すべき項目（推奨）

1. iOS 仮想キーボード対応の実装詳細を Phase 4 に追加
2. ボトムシート backdrop のスクロール競合処理を明記
3. タブ切り替え時の状態リセット処理を Phase 5 に追加

## 結論

**実装に進む前に計画の修正が必要です。**

特に Phase 4（ボトムシート）の DOM 配置方針は、現状の記述では技術的に不完全です。上記の修正提案（Option A が推奨）を計画書に反映した上で、再度検証を行うことをお勧めします。

Phase 3（タッチイベント）と Phase 5（2タップ範囲選択）の仕様の曖昧さも、実装中の混乱を避けるため、事前に明確化しておくべきです。
