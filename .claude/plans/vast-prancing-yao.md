# Playground スマートフォン対応

<!-- validated -->

## Context

Playground は現在 768px ブレークポイントで縦スタックに切り替えるだけの最低限のレスポンシブ対応。SP では 2 ペイン同時表示は画面が狭すぎ、選択パネルも実用的でない。「閲覧・軽い編集・ウォークスルー」レベルの SP 体験を実現する。

## 合意済み要件

| 項目            | 方針                                                    |
| --------------- | ------------------------------------------------------- |
| SP ユースケース | 閲覧・軽い編集・ウォークスルー                          |
| レイアウト      | SP: エディタ/プレビュー タブ切替、PC: 現状 2 ペイン維持 |
| 設定パネル      | SP: モーダル、PC: 現状のインライン                      |
| エディタ        | カスタム textarea 継続（変更なし）                      |
| マーク編集      | タップ選択 + ボトムシート                               |

## 変更対象ファイル

- `packages/playground/index.html` — タブバー、ボトムシート用 DOM 追加
- `packages/playground/src/styles.css` — タブ切替、設定モーダル、ボトムシート CSS
- `packages/playground/src/main.ts` — タブ切替 JS、ボトムシート制御、2 タップ範囲選択
- `packages/skam-html-renderer/src/interactive.ts` — タッチイベント対応

## Phase 1: SP タブ切替レイアウト

### HTML 変更

`.editor-container` 内先頭にタブバーを追加:

```html
<div class="sp-tab-bar" role="tablist" aria-label="エディタ/プレビュー切り替え">
  <button role="tab" class="sp-tab active" data-tab="editor" aria-selected="true">編集</button>
  <button role="tab" class="sp-tab" data-tab="preview" aria-selected="false">プレビュー</button>
</div>
```

### CSS 変更

- `.sp-tab-bar`: PC では `display: none`、SP (`max-width: 768px`) で `display: flex`
- `.editor-container[data-active-tab="editor"] .preview-pane` → `display: none`
- `.editor-container[data-active-tab="preview"] .xml-pane` → `display: none`
- `.divider`: SP で `display: none`
- アクティブペインは `flex: 1`

### JS 変更 (main.ts)

- `isSP()`: `window.matchMedia('(max-width: 768px)').matches`
- タブクリック → `editorContainer.dataset.activeTab` 切替
- プレビュータブ切替時に `parseAndRender()` 自動実行
- SP 初期表示はエディタタブ

## Phase 2: 設定パネル SP モーダル化

### 方針

既存の `<details#settings-panel>` を CSS で SP 時にフルスクリーンモーダル化。DOM 構造は変更しない。

### CSS 変更

SP 時に `.settings-panel[open]` を `position: fixed; inset: 0; z-index: 100` でオーバーレイ表示。`summary` はスティッキーヘッダー化。

### JS 変更

- バックドロップ要素を動的生成（SP で settings open 時のみ表示）
- バックドロップタップで `settingsPanel.open = false`

## Phase 3: タッチイベント対応 (interactive.ts)

### 方針

`attachInteractiveHandlers` にタッチイベントを追加。スクロールとの競合を避けるため、タップのみ対応（ドラッグ範囲選択は SP では不要）。

### 実装

```
touchstart → tokenId と座標を記録、touchMoved = false（passive: true、スクロール妨げない）
touchmove  → touchMoved = true（スクロール検出フラグ）
touchend   → !touchMoved かつ移動量 < 10px なら「タップ」と判定:
             - トークン上: onTokenClick(tokenId) 呼び出し
             - トークン外: onEmptyClick() 呼び出し
             passive: false で preventDefault（ゴーストクリック防止）
```

`touchmove` リスナーにより、スクロール操作がタップとして誤検出されることを防止。

### 型変更

`onTokenClick` の第2引数を optional に: `(tokenId: string, event?: MouseEvent) => void`
playground 側では event パラメータを使っていないので影響なし。

### cleanup

touchstart / touchmove / touchend リスナーすべてを cleanup 関数で除去。

## Phase 4: ボトムシート（マーク編集）

### 方針

`#selection-panel` 自体を SP で CSS `position: fixed; bottom: 0` のボトムシートとして表示。DOM 移動は不要。

### HTML 追加

ボトムシートのハンドルバーと backdrop を追加:

```html
<!-- selection-panel 内先頭に -->
<div class="bottom-sheet-handle"><span class="bottom-sheet-handle-bar"></span></div>
```

backdrop は JS で動的生成。

### CSS 変更

SP 時:

- `.preview-main` → `display: block`（flex 解除で selection-panel を通常フローから切り離す）
- `.selection-panel` → `position: fixed; bottom: 0; left: 0; right: 0; max-height: 50vh; padding-bottom: env(safe-area-inset-bottom, 0); border-radius: 12px 12px 0 0; transform: translateY(100%); transition: transform 0.3s; z-index: 200; overflow-y: auto`
- `.selection-panel.open` → `transform: translateY(0)`
- `.bottom-sheet-handle` → PC では `display: none`
- `.preview-content` → `width: 100%`（flex 解除後も全幅確保）

### JS 変更 (main.ts)

- `updateSelectionPanel()` 内で `isSP()` なら `selectionPanel.classList.add('open')` + backdrop 表示
- `clearSelectionPanel()` で `selectionPanel.classList.remove('open')` + backdrop 非表示
- backdrop タップで選択クリア + ボトムシート閉じ
- ハンドル下スワイプで閉じ（touchstart/touchmove/touchend で Y 移動量 > 100px 判定）

## Phase 5: 2 タップ範囲選択

### 方針

interactive.ts ではなく playground 側 (main.ts) で実装。interactive.ts は単純なタップ通知のみ。

### 状態

```typescript
let spRangeState: 'idle' | 'first-selected' | 'range-selected' = 'idle';
let spFirstTokenId: string | null = null;
```

### 状態遷移

| 現在の状態       | イベント                | 次の状態         | アクション                  |
| ---------------- | ----------------------- | ---------------- | --------------------------- |
| `idle`           | トークンタップ          | `first-selected` | 単一選択 + ボトムシート表示 |
| `first-selected` | 別トークンタップ        | `range-selected` | 範囲選択 + ボトムシート更新 |
| `first-selected` | 同トークン再タップ      | `idle`           | 選択維持（範囲モード解除）  |
| `first-selected` | 空白タップ / シート閉じ | `idle`           | 選択クリア                  |
| `first-selected` | マーク操作実行          | `idle`           | 操作適用後リセット          |
| `range-selected` | トークンタップ          | `first-selected` | 新たに単一選択              |
| `range-selected` | 空白タップ / シート閉じ | `idle`           | 選択クリア                  |
| `range-selected` | マーク操作実行          | `idle`           | 操作適用後リセット          |
| `*`              | タブ切替                | `idle`           | 選択クリア                  |

### フロー

1. 1 回目タップ → `first-selected`、単一トークン選択 + ボトムシート表示
2. ボトムシート内にヒント表示:「もう一文字タップで範囲選択」
3. 2 回目タップ（別トークン）→ `range-selected`、`updateSelectionPanel(spFirstTokenId, tokenId)` で範囲選択
4. 同じトークン再タップ → `idle`（単一選択維持、範囲モード解除）
5. 空白タップ / ボトムシート閉じ / タブ切替 → `idle`

### PC への影響

`isSP()` ガード内に全ロジックを閉じ込め、PC の挙動には一切影響しない。

## 実装順序と依存関係

```
Phase 1 (タブ切替) ← 独立
Phase 2 (設定モーダル) ← 独立
Phase 3 (タッチイベント) ← Phase 4, 5 の前提
Phase 4 (ボトムシート) ← Phase 3 に依存
Phase 5 (2タップ範囲選択) ← Phase 3, 4 に依存
```

Phase 1 と 2 は並行可能。Phase 3 → 4 → 5 は順序依存。

## 検証方法

1. 各 Phase 後にビルド (`pnpm build`) + 型チェック (`pnpm typecheck`)
2. Chrome DevTools のデバイスエミュレーション (iPhone SE, iPhone 14 Pro) で動作確認
3. PC ブラウザで既存動作が壊れていないことを確認
4. 既存の Playwright E2E テスト (`pnpm --filter @kanbun/playground test:e2e`) がパス
5. interactive.ts の変更後、HTML レンダラーのテスト (`pnpm --filter @kanbun/skam-html-renderer test`) がパス

## リスク

| リスク                            | 対策                                                                                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| タッチのスクロール/タップ判定閾値 | 10px で開始、実機テストで調整                                                                                                                              |
| 仮想キーボード + ボトムシート     | `max-height: 50vh` で保守的に設定。Android はビューポートリサイズで自然に対応、iOS は `env(safe-area-inset-bottom)` で下端余白確保。動的な高さ調整はしない |
| interactive.ts 型変更の影響       | event パラメータを optional 化（破壊的変更なし）                                                                                                           |
| main.ts 肥大化                    | Phase 完了後に SP 固有ロジックのモジュール分割を検討                                                                                                       |
