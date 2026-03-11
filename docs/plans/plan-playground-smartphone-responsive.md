# Playground スマートフォン対応

## 概要

Playground の SP 対応として、タブ切替レイアウト、設定モーダル、タッチイベント、ボトムシート、2 タップ範囲選択を実装する。

関連 ADR: [ADR-023](../decisions/adr-023-playground-smartphone-responsive.md)

## 前提知識

- Playground は `packages/playground/` にあり、Vite で開発
- `main.ts` がメインロジック、`styles.css` がスタイル、`index.html` が HTML
- `interactive.ts` は `@kanbun-skam/skam-html-renderer` に属し、マウスイベントでトークン選択を処理
- 768px ブレークポイントで既存のレスポンシブ対応あり（縦スタックのみ）
- `parseAndRender()` がエディタの XML をパース→レンダリング
- `updateSelectionPanel()` / `clearSelectionPanel()` が選択パネルの状態管理

## 実装計画

### Phase 1: SP タブ切替レイアウト

**対象ファイル**: `index.html`, `styles.css`, `main.ts`

1. `index.html`: `.editor-container` 内先頭にタブバー追加
2. `styles.css`: タブバーの表示制御、ペイン切替、ディバイダー非表示
3. `main.ts`: タブクリックイベント、プレビュータブ時の自動レンダリング

### Phase 2: 設定パネル SP モーダル化

**対象ファイル**: `styles.css`, `main.ts`

1. `styles.css`: SP 時の固定位置オーバーレイ
2. `main.ts`: バックドロップ生成、クリックで閉じる

### Phase 3: タッチイベント対応

**対象ファイル**: `interactive.ts`

1. `InteractiveCallbacks.onTokenClick` の event パラメータを optional 化
2. touchstart/touchmove/touchend リスナー追加
3. タップ判定（移動量 < 10px、touchMoved フラグ）
4. cleanup 関数でタッチリスナーも除去

### Phase 4: ボトムシート

**対象ファイル**: `index.html`, `styles.css`, `main.ts`

1. `index.html`: ハンドルバー要素追加
2. `styles.css`: SP 時の固定位置、スライドアニメーション
3. `main.ts`: ボトムシート開閉制御、backdrop、スワイプで閉じる

### Phase 5: 2 タップ範囲選択

**対象ファイル**: `main.ts`

1. SP 状態管理: `spRangeState`, `spFirstTokenId`
2. 状態遷移ロジック（idle → first-selected → range-selected）
3. ヒント表示、タブ切替時のリセット

## リスクと軽減策

| リスク                            | 影響度 | 軽減策                                           |
| --------------------------------- | ------ | ------------------------------------------------ |
| タッチのスクロール/タップ判定閾値 | 中     | 10px で開始、実機テストで調整                    |
| 仮想キーボード + ボトムシート     | 低     | `max-height: 50vh` で保守的に設定                |
| interactive.ts 型変更の影響       | 低     | event パラメータを optional 化（破壊的変更なし） |
| main.ts 肥大化                    | 中     | Phase 完了後にモジュール分割を検討               |

## 検証方法

1. 各 Phase 後にビルド (`pnpm build`) + 型チェック (`pnpm typecheck`)
2. 既存の Playwright E2E テスト (`pnpm --filter @kanbun-skam/playground test:e2e`) がパス
3. interactive.ts 変更後、HTML レンダラーのテスト (`pnpm --filter @kanbun-skam/skam-html-renderer test`) がパス
4. Chrome DevTools のデバイスエミュレーションで SP 動作確認

<!-- validated -->
