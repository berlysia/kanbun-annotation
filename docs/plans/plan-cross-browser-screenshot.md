# skam-screenshot パッケージ実装計画

## 概要

`@kanbun/skam-screenshot` パッケージを新規作成し、SKAM HTML Renderer の出力を Playwright で複数ブラウザに撮影、比較ギャラリー HTML を生成する開発ツールを実装する。

関連 ADR: [ADR-011](../decisions/adr-011-cross-browser-screenshot.md)

## 設計判断（clarify 結果）

| 項目                  | 決定                                         | 理由                                                     |
| --------------------- | -------------------------------------------- | -------------------------------------------------------- |
| Playwright バージョン | 最新安定版（`pnpm add -D playwright`）       | private パッケージのため最新追従で問題なし               |
| CLI 実行方式          | `node --experimental-strip-types`            | ビルド不要で開発速度向上。失敗時は dist にフォールバック |
| ImageFormat           | `'png' \| 'jpeg'` のみ                       | Playwright の `page.screenshot()` が WebP 非サポート     |
| コミット戦略          | Step ごとにコミット                          | レビューしやすい粒度                                     |
| 検証深度              | Playwright chromium でスモークテストまで実施 | 実際の撮影動作を確認                                     |

## 前提知識

### 既存パッケージパターン

- ESM only (`"type": "module"`)、tsup ビルド、tsgo 型チェック、vitest テスト
- tsconfig.json は `../../tsconfig.base.json` を extends
- ルート tsconfig.json の `references` に全パッケージを列挙
- ルート knip.config.ts にワークスペースエントリ

### 利用する既存 API

- `parse(xml)` → `SKAMDocument` (`@kanbun/skam-xml-parser`)
- `render(doc, options?)` → `{ html, css }` (`@kanbun/skam-html-renderer`)
- `isSKAMDocument(input)` (`@kanbun/skam`)
- `RenderOptions` 型 (`@kanbun/skam-html-renderer`)

### CLI 実行方式

`node --experimental-strip-types` で TS を直接実行。プロジェクトの `verbatimModuleSyntax: true` と `.js` 拡張子 import パターンと互換。失敗時はビルド済み dist にフォールバック。

## ファイル構成

```
packages/skam-screenshot/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
└── src/
    ├── index.ts              # パッケージエントリ（public API re-export）
    ├── cli.ts                # CLI エントリ（node:util parseArgs）
    ├── types.ts              # 型定義（Browser, CaptureOptions 等）
    ├── platform.ts           # OS検知・ブラウザデフォルト
    ├── page-builder.ts       # HTML+CSS → self-contained HTML page
    ├── browser-manager.ts    # Playwright ブラウザ起動・撮影
    ├── capture.ts            # Public API (capture, captureHTML)
    ├── compare-html.ts       # 比較ギャラリー HTML 生成
    └── __tests__/
        ├── platform.test.ts
        ├── page-builder.test.ts
        └── compare-html.test.ts
```

**変更する既存ファイル**:

- `tsconfig.json` (ルート): references に追加
- `package.json` (ルート): `screenshot` スクリプト追加
- `knip.config.ts` (ルート): ワークスペースエントリ追加

## 実装計画

### Step 1: パッケージスキャフォールド + 型定義

**新規ファイル**: `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `src/types.ts`

package.json のポイント:

- `"private": true`（publish しない）
- 全依存を devDependencies（`@kanbun/skam`, `@kanbun/skam-xml-parser`, `@kanbun/skam-html-renderer`, `playwright`）
  - private パッケージのため devDependencies で問題なし（他パッケージの install に波及しない）
- 標準 scripts（build, typecheck, lint, test, test:run）

types.ts で定義する型:

- `Browser = 'chromium' | 'firefox' | 'webkit'`
- `ImageFormat = 'png' | 'jpeg'`（WebP は Playwright の `page.screenshot()` が `type: 'png' | 'jpeg'` のみサポートのため初期スコープ外。ADR-011「初期スコープ外」セクションに WebP 記載済み）
- `Viewport`, `CaptureOptions`, `CaptureHTMLOptions`, `CompareHTMLOptions`

**既存ファイル変更**:

- ルート `tsconfig.json`: `{ "path": "packages/skam-screenshot" }` を references に追加
- ルート `package.json`: `"screenshot": "node --experimental-strip-types packages/skam-screenshot/src/cli.ts"` を scripts に追加
- ルート `knip.config.ts`: エントリ追加（`src/index.ts`, `src/cli.ts`）

**事前検証（Step 1 完了時に実施）**:

```bash
# --experimental-strip-types + .js import パターンの動作確認
node --experimental-strip-types packages/skam-screenshot/src/types.ts
```

失敗時のフォールバック: `"screenshot": "pnpm --filter @kanbun/skam-screenshot build && node packages/skam-screenshot/dist/cli.js"`

### Step 2: プラットフォームユーティリティ + HTML ページビルダー

**`src/platform.ts`**:

- `getDefaultBrowsers()`: `process.platform === 'darwin'` → 3ブラウザ、それ以外 → chromium + firefox
- `parseBrowserList(input)`: CLI カンマ区切り入力のパース・バリデーション

**`src/page-builder.ts`**:

- `buildHTMLPage(html, css)`: renderer 出力を `<!DOCTYPE html>` で包む self-contained HTML
- UTF-8 charset、minimal CSS reset（`box-sizing: border-box`, `body { padding: 16px }`）

**ユニットテスト**: `platform.test.ts`, `page-builder.test.ts`（Playwright 不要）

### Step 3: ブラウザマネージャ

**`src/browser-manager.ts`**:

- `captureScreenshots(tasks)`: 複数ブラウザで並列撮影
- Playwright を dynamic import（未インストール時に明確なエラーメッセージ）
- `Promise.allSettled` で各ブラウザ独立実行、1つの失敗が他に影響しない
- `page.setContent(html, { waitUntil: 'networkidle' })` で HTML をロード
- 成功/失敗を判別する型ガード `isSuccess()`, `isFailure()`

### Step 4: Public API + 比較 HTML 生成

**`src/capture.ts`**:

- `capture(doc, options?)` → `Map<Browser, Buffer>`: SKAMDocument → render → captureHTML
- `captureHTML(html, css, options?)` → `Map<Browser, Buffer>`: 事前レンダリング済み入力用
- 失敗ブラウザは stderr に警告、Map から省略

**`src/compare-html.ts`**:

- `generateCompareHTML(screenshots, options?)` → `string`
- Base64 data URI 埋め込み、flexbox 横並び、メタデータ表示
- PNG magic bytes でフォーマット判定
- HTML エスケープ（XSS 対策）

**`src/index.ts`**: re-export（capture, captureHTML, generateCompareHTML, getDefaultBrowsers, 型）

**ユニットテスト**: `compare-html.test.ts`（Playwright 不要、mock Buffer で検証）

### Step 5: CLI

**`src/cli.ts`**:

- `node:util parseArgs` で引数パース（外部依存なし）
- オプション: `--output`, `--browsers`, `--format`, `--writing-mode`, `--ruby-method`, `--render-options`（JSON文字列）, `--viewport`, `--no-full-page`, `--help`
- ファイル拡張子で入力形式判定（`.xml` → parse+render、`.json` → validate+render）
- 出力: `{output-dir}/{browser}.{ext}` + `compare.html`
- 全出力は stderr（Unix 慣習: stdout はデータ用）
- 全ブラウザ失敗時のみ exit code 1

### Step 6: 検証

- `pnpm --filter @kanbun/skam-screenshot test:run`（ユニットテスト）
- `pnpm --filter @kanbun/skam-screenshot typecheck`
- `pnpm --filter @kanbun/skam-screenshot build`
- `pnpm --filter @kanbun/skam-screenshot lint`
- `pnpm build && pnpm typecheck`（モノレポ全体）
- CLI スモークテスト: `pnpm screenshot packages/skam-xml-parser/src/__tests__/fixtures/valid/kaeri-basic.xml --browsers chromium`

## リスクと軽減策

| リスク                                                        | 影響度 | 軽減策                                                                                            |
| ------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| `--experimental-strip-types` が `.js` import パターンと非互換 | High   | Step 1 完了時に最小 TS ファイルで検証。失敗時は `pnpm build && node dist/cli.js` にフォールバック |
| Playwright ブラウザ未インストール                             | Medium | dynamic import + 明確なインストール手順をエラーメッセージに含める                                 |
| WebP 非サポート                                               | Low    | ADR の ImageFormat 定義から WebP を除外し `'png' \| 'jpeg'` のみ。CLI で webp 指定時はエラー      |
| `page.setContent()` とファイルロードの描画差異                | Low    | self-contained HTML（外部リソースなし）のため同等。`waitUntil: 'networkidle'` で安定化            |

## コミット計画

| コミット | Step   | メッセージ                                                          |
| -------- | ------ | ------------------------------------------------------------------- |
| 1        | Step 1 | `feat(skam-screenshot): scaffold package with types`                |
| 2        | Step 2 | `feat(skam-screenshot): add platform utils and page builder`        |
| 3        | Step 3 | `feat(skam-screenshot): add browser manager for screenshot capture` |
| 4        | Step 4 | `feat(skam-screenshot): add capture API and compare HTML generator` |
| 5        | Step 5 | `feat(skam-screenshot): add CLI entry point`                        |
| 6        | Step 6 | 修正内容に応じたメッセージ（問題なければコミット不要）              |

## 検証方法

1. ユニットテスト: `pnpm --filter @kanbun/skam-screenshot test:run`（Playwright 不要の3ファイル）
2. ビルド検証: `pnpm build && pnpm typecheck`（モノレポ全体）
3. CLI スモークテスト（Playwright chromium 必要）:
   - `npx playwright install chromium`（packages/skam-screenshot ディレクトリで実行）
   - `pnpm screenshot packages/skam-xml-parser/src/__tests__/fixtures/valid/kaeri-basic.xml --browsers chromium`
   - 確認: `screenshots/chromium.png` が生成され、サイズが 0 でないこと
   - 確認: `screenshots/compare.html` が生成されること

<!-- validated -->
