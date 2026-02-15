# ADR-023: Playground スマートフォン対応

## ステータス

Accepted

実装計画: [Plan](../plans/plan-playground-smartphone-responsive.md)

## コンテキスト

Playground は現在 768px ブレークポイントで縦スタックに切り替えるだけの最低限のレスポンシブ対応。SP では 2 ペイン同時表示は画面が狭すぎ、選択パネルも実用的でない。「閲覧・軽い編集・ウォークスルー」レベルの SP 体験を実現する必要がある。

### 現状の問題

- SP で 2 ペイン（エディタ + プレビュー）が縦に積まれ、どちらも狭くて使いにくい
- 選択パネルが SP では操作しにくい
- タッチ操作（タップ選択）に未対応
- 設定パネルが SP で開くとレイアウトを圧迫する

## 決定

以下の 5 フェーズで SP 対応を実装する。

### Phase 1: SP タブ切替レイアウト

SP (`max-width: 768px`) ではエディタとプレビューをタブ切替で排他表示する。PC では現状の 2 ペイン維持。

- `.editor-container` 内にタブバー（`role="tablist"`）を追加
- CSS で `data-active-tab` 属性によるペイン表示切替
- プレビュータブ切替時に `parseAndRender()` 自動実行

### Phase 2: 設定パネル SP モーダル化

既存の `<details#settings-panel>` を CSS で SP 時にフルスクリーンモーダル化。DOM 構造は変更しない。

- SP 時に `position: fixed; inset: 0` でオーバーレイ表示
- バックドロップ要素を動的生成し、タップで閉じる

### Phase 3: タッチイベント対応 (interactive.ts)

`attachInteractiveHandlers` にタッチイベントを追加。スクロールとの競合を避けるため、タップのみ対応。

- `touchstart` で座標記録、`touchmove` でスクロール検出、`touchend` でタップ判定
- 移動量 < 10px を「タップ」と判定
- `onTokenClick` の第2引数を optional 化（破壊的変更なし）

### Phase 4: ボトムシート（マーク編集）

`#selection-panel` を SP で CSS `position: fixed; bottom: 0` のボトムシートとして表示。

- ハンドルバー追加、backdrop を動的生成
- `transform: translateY` でスライドイン/アウト
- `env(safe-area-inset-bottom)` で iPhone のノッチ対応

### Phase 5: 2 タップ範囲選択

playground 側 (main.ts) で SP 向けの 2 タップ範囲選択を実装。

- 状態: `idle` → `first-selected` → `range-selected`
- 1 回目タップで単一選択 + ボトムシート表示、2 回目タップで範囲選択
- `isSP()` ガード内に全ロジックを閉じ込め、PC への影響なし

### 実装順序と依存関係

- Phase 1, 2: 独立（並行可能）
- Phase 3 → 4 → 5: 順序依存

## 影響

### ポジティブ

- SP で Playground が実用的に利用可能になる
- タッチ操作でのトークン選択・マーク編集が可能になる
- PC の既存動作には影響しない（`isSP()` ガード）

### ネガティブ

- main.ts が肥大化する（Phase 完了後のモジュール分割を検討）
- タッチ判定の閾値（10px）は実機テストで調整が必要
- ボトムシートと仮想キーボードの共存は `max-height: 50vh` で保守的に対応

## 参考

- [Plan: Playground スマートフォン対応](../plans/plan-playground-smartphone-responsive.md)
