---
status: Accepted
plan: plan-cross-browser-screenshot.md
---

# ADR-011: クロスブラウザスクリーンショット撮影ツール (`skam-screenshot`)

## コンテキスト

SKAM HTML Renderer の出力がブラウザ間で意図通り表示されるかを確認する手段がない。漢文レンダリングは縦書き・ルビ・返り点など CSS の高度な機能に依存しており、ブラウザ間の描画差異が発生しやすい。

### 課題

- ブラウザ間の描画差異を手軽に確認する方法がない
- SKAM-ML/XML や SKAM JSON を入力として、ブラウザ別スクリーンショットを一括取得したい
- Mac では Chrome/Safari/Firefox、Windows/Linux では Chrome/Firefox で確認したい
- 撮影結果を目視で比較できるビューが欲しい

## 検討した選択肢

### Option A: 単一パッケージ `skam-screenshot`

入力の受付（JSON/XML）、HTML レンダリング、ブラウザ起動・撮影、比較ビュー生成をすべて 1 パッケージで行う。

- 利点: パッケージ数が増えない、依存関係がシンプル
- 欠点: 責務が多い（ただし現段階では過分割のほうがコストが高い）

### Option B: 撮影パッケージ + 画像比較パッケージの 2 分割

`skam-screenshot`（撮影）と `skam-visual-diff`（ピクセル差分）に分離。

- 利点: 責務が明確に分離
- 欠点:
  - 現段階で自動ピクセル差分は不要（YAGNI）
  - パッケージ分割のオーバーヘッド（依存管理、バージョニング）が機能の価値に見合わない
  - 撮影と比較ビュー生成は密結合（同じスクリーンショット出力を使う）ため、分割による再利用性向上は限定的

### Option C: Playwright Test のみで実現

Playwright Test のスナップショットテスト機能（`expect(page).toHaveScreenshot()`）を直接利用。

- 利点: Playwright 標準機能で完結
- 欠点:
  - `toHaveScreenshot()` は差分テストが前提で、「目視比較用ギャラリー」生成には向かない
  - 入力（XML/JSON）をテストケースとして記述する必要があり、ファイル指定の柔軟性が低い
  - CLI ツールとしての独立性がない（`pnpm test` 経由が必須）

## 決定

**Option A: 単一パッケージ `skam-screenshot`** を採用する。

目視比較が主目的のため、自動ピクセル差分は初期スコープ外とし、比較用 HTML ギャラリーを生成する方式とする。将来的に自動差分が必要になった場合は、同パッケージに機能追加するか別パッケージに分離する。

### パッケージ構成

`@kanbun/skam-screenshot` を `packages/skam-screenshot/` に配置。モノレポ内の private な開発ツールであり、npm publish は想定しない。

**依存関係** (すべて devDependencies):

- `@kanbun/skam` - 型定義
- `@kanbun/skam-xml-parser` - XML 入力のパース
- `@kanbun/skam-html-renderer` - HTML レンダリング
- `playwright` - ブラウザ自動操作

private パッケージのため devDependencies で十分。他パッケージの `pnpm install` に Playwright が波及しない。

### Playwright ブラウザバイナリ

Playwright はブラウザバイナリ（400〜700MB）の別途インストールが必要:

- **手動実行**: `npx playwright install chromium firefox`（webkit は Mac のみ追加）
- `postinstall` での自動実行は行わない（全開発者に強制しないため）
- 必要なブラウザのみ個別インストール可能
- ルートの `pnpm install` に影響を与えないよう配慮

### 入力

以下の 3 形式を受け付ける:

1. **SKAM-ML/XML ファイル** (`.xml`): `skam-xml-parser` でパース → `skam-html-renderer` でレンダリング
2. **SKAM JSON ファイル** (`.json`): `skam-html-renderer` でレンダリング
3. **事前レンダリング済み HTML+CSS**: プログラマティック API のみ（CLI では非対応）

### RenderOptions の指定

`skam-html-renderer` の `RenderOptions`（`rubyMethod`, `profile` 等）を透過的に指定可能とする:

- **CLI**: 主要オプションは個別フラグ（`--writing-mode`, `--ruby-method`）。全オプション一括は `--render-options '{"rubyMethod":"grid"}'` で JSON 文字列を受け付ける
- **プログラマティック API**: `renderOptions` フィールドで直接渡す

特に `rubyMethod: 'grid'` はブラウザ間差異が大きく、スクリーンショット確認の主要ユースケース。

### ブラウザ選択

Playwright の 3 エンジンを使用:

| エンジン   | 対応ブラウザ | プラットフォーム       |
| ---------- | ------------ | ---------------------- |
| `chromium` | Chrome       | 全 OS                  |
| `firefox`  | Firefox      | 全 OS                  |
| `webkit`   | Safari 相当  | Mac のみデフォルト有効 |

- デフォルト: OS を検知して利用可能なブラウザを自動選択
- `--browsers` オプションで明示指定可能

### 出力

```
{output-dir}/
├── chromium.png
├── firefox.png
├── webkit.png        # Mac のみ（デフォルト時）
└── compare.html      # 横並び比較ギャラリー
```

- **画像形式**: PNG デフォルト、`--format` で JPEG/WebP も選択可能
- **compare.html**: ブラウザで開くと全画像を横並び表示。画像は Base64 埋め込みで単一ファイル完結

### viewport とキャプチャ方式

- **デフォルト viewport**: `{ width: 800, height: 1200 }`（縦書き漢文は高さ方向にオーバーフローしやすいため、縦長をデフォルトとする）
- **fullPage キャプチャ**: デフォルトで `fullPage: true`（Playwright の `page.screenshot({ fullPage: true })` 相当）。viewport 高さを超えるコンテンツも全体をキャプチャする
- **CLI**: `--viewport 1024x768` で指定可能、`--no-full-page` で viewport 内のみに制限
- viewport の width/height はページ座標（writing-mode は CSS 内部で処理されるため、CSS 上の block/inline 方向に影響しない）

### CLI

ルートの `package.json` にスクリプトを追加して利用:

```bash
# 基本
pnpm screenshot examples/sample.xml

# オプション指定
pnpm screenshot input.xml --browsers chromium,firefox --output ./shots/
pnpm screenshot input.json --format jpeg --writing-mode horizontal
pnpm screenshot input.xml --ruby-method grid
pnpm screenshot input.xml --render-options '{"rubyMethod":"grid","profile":"learningBasic"}'
```

パッケージ bin は初期段階では設けず、ルートスクリプト経由のみとする。公開が必要になった時点で追加。

### プログラマティック API

```typescript
import { capture, generateCompareHTML } from '@kanbun/skam-screenshot';

type Browser = 'chromium' | 'firefox' | 'webkit';

// スクリーンショット撮影
const result = await capture(doc, {
  browsers: ['chromium', 'firefox'],
  viewport: { width: 800, height: 1200 },
  fullPage: true,
  format: 'png',
  renderOptions: { writingMode: 'vertical', rubyMethod: 'grid' },
});
// result: Map<Browser, Buffer>

// 比較 HTML 生成（capture とは分離）
const html = generateCompareHTML(result, {
  title: 'sample.xml',
});
```

- `Browser` は独自のリテラル型（Playwright の `BrowserType` オブジェクトではない）
- `capture` はスクリーンショット撮影のみ、`generateCompareHTML` は比較ビュー生成のみ（CLI では両方を自動実行）
- 事前レンダリング済み HTML+CSS の入力: `captureHTML(html, css, options)` を別関数として提供

### エラーハンドリング

- **入力検証失敗**（XML パースエラー、JSON 検証エラー）: エラーメッセージを stderr に出力して終了（exit code 1）
- **ブラウザ起動失敗**（未インストール等）: 失敗したブラウザをスキップし、成功したブラウザのみ出力。stderr に警告を出力
- **部分成功**: compare.html に成功したブラウザのみ表示。全ブラウザ失敗の場合のみ exit code 1
- **Playwright 未インストール**: インストールコマンドを案内するエラーメッセージを表示

### compare.html の構成

- 各ブラウザの画像を横並び（flexbox）
- ブラウザ名ラベル付き
- 画像は Base64 data URI で埋め込み（外部ファイル参照不要）
- 撮影メタデータ（入力ファイル名、撮影日時、使用した RenderOptions）を表示
- 必要最小限の HTML/CSS のみ、フレームワーク不使用

### フォントに関する注意

漢文レンダリングではフォントが描画結果に大きく影響する。OS 間でデフォルトフォントが異なるため、ブラウザ間差異がフォント由来なのか CSS 実装由来なのかを判別しにくい。

- 初期段階: OS デフォルトフォントで撮影（フォント指定なし）
- 将来拡張: `--font-family` オプションや Web Font 注入による統一フォント指定を検討

## 影響

### ポジティブ

- ブラウザ間の描画差異を手軽に確認できるようになる
- SKAM-ML/XML を直接入力できるため、テストケースの作成が容易
- compare.html で目視比較が即座に可能
- 既存パッケージ（parser, renderer）を活用し、パイプラインが自然に接続される

### ネガティブ

- 新規パッケージの追加（メンテナンス対象の増加）
- Playwright のブラウザバイナリのインストールが必要（400〜700MB、手動実行）
- WebKit エンジンは Safari と完全一致ではない（実用上は十分に近い）
- フォント差異がブラウザ差異と混同される可能性がある

## 初期スコープ外（将来拡張）

- 自動ピクセル差分（pixelmatch 等による自動比較・CI 統合）
- compare.html の拡大・パン機能、オーバーレイ比較モード
- 複数入力のバッチ処理・ギャラリーインデックス
- `--font-family` オプションによる統一フォント指定
- Playground URL を入力として指定する `--url` オプション
- GitHub Actions でのブラウザバイナリキャッシュ戦略

## 参考

- [Playwright Browsers](https://playwright.dev/docs/browsers)
- [Playwright Screenshots](https://playwright.dev/docs/screenshots)
- ADR-009: Web Component - 同様にブラウザ環境を前提としたパッケージ設計
