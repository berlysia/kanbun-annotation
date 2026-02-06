# SKAM Web Component (`<skam-renderer>`) 実装計画

## 概要

SKAM の HTML レンダリングパイプラインを Web Component（Custom Element + Shadow DOM）としてラップし、宣言的・プログラマティック両方の利用を可能にする。

関連 ADR: [ADR-009](../decisions/adr-009-web-component.md)

## 前提知識

### レンダリングパイプライン

- `parse(xml)` → `SKAMDocument`（`@kanbun/skam-xml-parser`、browser exports condition あり）
- `render(doc, options)` → `{ html, css }`（`@kanbun/skam-html-renderer`）
- `generateCSS(options)` → `string`（`useLayer: false` 対応済み）
- `attachInteractiveHandlers(container, callbacks)` → cleanup fn

### 既存パッケージパターン

- tsup（ESM only, dts: true）、vitest + happy-dom、tsconfig は `tsconfig.base.json` を extends
- CSS は `@layer` + CSS Variables（`:where()` で特異性最小化）

### 設計方針

**XML 埋め込み**: `<script type="text/skam-ml">` で HTML パーサーの干渉を回避。制約: XML 内に `</script>` リテラル不可。

**Shadow DOM と CSS**: `generateCSS({ useLayer: false })` で Shadow DOM 内 `<style>` に注入。CSS Variables は貫通するため外部カスタマイズ可能。

**属性 → RenderOptions マッピング**:

| HTML 属性               | JS プロパティ         | 型                                                     | デフォルト          |
| ----------------------- | --------------------- | ------------------------------------------------------ | ------------------- |
| `writing-mode`          | `writingMode`         | `'vertical' \| 'horizontal'`                           | `'vertical'`        |
| `profile`               | `profile`             | プリセット名 or JSON string / `Partial<RenderProfile>` | `undefined`（full） |
| `inline`                | `inline`              | boolean attr                                           | `false`             |
| `interactive`           | `interactive`         | boolean attr                                           | `false`             |
| `include-reading-layer` | `includeReadingLayer` | boolean attr                                           | `true`              |
| `copyable`              | `copyable`            | space-separated string / `CopyableElement[] \| 'all'`  | `undefined`         |
| `class-prefix`          | `classPrefix`         | string                                                 | `'skam'`            |

## 実装計画

### Step 1: パッケージスキャフォールド

**新規作成**: `packages/skam-web-component/`

- `package.json` — `@kanbun/skam-web-component`、依存: `@kanbun/skam-xml-parser` + `@kanbun/skam-html-renderer`
- `tsconfig.json` — `tsconfig.base.json` extends、`lib: ["ESNext", "DOM"]`
- `tsup.config.ts` — ESM only, dts: true
- `vitest.config.ts` — happy-dom 環境

**既存ファイル変更**:

- `/tsconfig.json` — references に追加
- `/knip.config.ts` — workspace 追加

Step 1 完了後に happy-dom の API サポート検証テスト（`customElements`, `attachShadow`, `MutationObserver`, `requestAnimationFrame`）を実行する。

### Step 2: 属性マッピングユーティリティ (`src/attribute-map.ts`)

HTML 属性文字列 → RenderOptions の変換ロジック:

- `parseWritingMode(value)` — `'vertical' | 'horizontal'` のバリデーション
- `parseProfile(value)` — プリセット名 → PROFILES lookup、JSON 文字列 → `JSON.parse`
- `parseBooleanAttr(value)` — `null` → `false`、存在 → `true`
- `parseCopyable(value)` — `'all'` or space-separated → `CopyableElement[]`
- `buildRenderOptions(attrs)` — 全属性をまとめて RenderOptions に変換

テスト: `src/__tests__/attribute-map.test.ts`

### Step 3: XML 取得ロジック (`src/xml-extraction.ts`)

優先順位:

1. `xmlContent` プロパティ（プログラマティック設定値）— 空文字列 `""` も「設定済み」とみなし、フォールバックしない
2. `<script type="text/skam-ml">` 子要素の `textContent` — 複数存在する場合は最初の要素を使用
3. Light DOM の `textContent`（フォールバック）

`xmlContent` が一度も設定されていない（`undefined`）場合のみ 2→3 にフォールバックする。

テスト: `src/__tests__/xml-extraction.test.ts`

### Step 4: Custom Element 本体 (`src/skam-renderer.ts`)

```
class SkamRendererElement extends HTMLElement
```

**Shadow DOM 構造**:

```
#shadow-root (open)
  <style id="main-css">   ← generateCSS() 出力
  <style id="error-css">  ← エラー表示用固定スタイル
  <div id="content">      ← render() の HTML 出力先
```

**ライフサイクル**:

- `constructor()`: Shadow DOM 作成、`<style>` + `<div>` 配置
- `connectedCallback()`: MutationObserver 開始、初回レンダリングをスケジュール（再接続時も正しく動作）
- `disconnectedCallback()`: MutationObserver 切断、interactive cleanup、スケジュール済み RAF をキャンセル
- `attributeChangedCallback()`: `#scheduleRender()` 呼び出し

**レンダリングフロー**:

1. `#scheduleRender()` — `requestAnimationFrame` でバッチ化（複数属性変更を 1 フレームにまとめる）。RAF ID を保持し、disconnect 時にキャンセル可能にする
2. `#performRender()`:
   - `#extractXml()` で XML テキスト取得
   - XML が空なら Shadow DOM のコンテンツをクリアして終了
   - try-catch で `parse()` と `render()` の両方をラップ
   - `parse(xml)` で SKAMDocument に変換
   - `buildRenderOptions()` で属性から RenderOptions 構築
   - `render(doc, { ...options, useLayer: false })` で HTML + CSS 生成
   - Shadow DOM 内の `<style>` と `<div>` を更新
   - `interactive` が true なら前回の cleanup を実行後、`attachInteractiveHandlers()` を Shadow DOM 内コンテナに適用
   - エラー時は `#handleError()` に委譲
3. `#handleError(error)`:
   - コンテンツ `<div>` をクリアし、エラーメッセージ表示（`role="alert"`）
   - `CustomEvent('skam-error', { detail, bubbles: true, composed: true })` を dispatch

**MutationObserver**: Light DOM（`this`）を監視。設定: `{ childList: true, subtree: true, characterData: true }`。`<script type="text/skam-ml">` の追加・削除・テキスト変更を検知 → `#scheduleRender()`

**イベント**:

- `skam-error` — パース/レンダリングエラー時（`composed: true` で Shadow DOM 外へ伝播）
- `skam-render` — レンダリング成功時（`detail: { document: SKAMDocument }`）

テスト: `src/__tests__/skam-renderer.test.ts`

### Step 5: エントリポイント (`src/index.ts`)

- `SkamRendererElement` クラスと型をエクスポート
- import 時に自動登録（`customElements.define('skam-renderer', ...)`）。SSR 環境（`customElements` 不在）ではスキップ
- グローバル型拡張（`HTMLElementTagNameMap`）を `types.ts` に定義

### Step 6: 統合確認

- `pnpm build` — 全パッケージビルド成功
- `pnpm test` — 全テスト通過
- `pnpm typecheck` — 型チェック通過

## 対象ファイル一覧

### 新規作成

- `packages/skam-web-component/package.json`
- `packages/skam-web-component/tsconfig.json`
- `packages/skam-web-component/tsup.config.ts`
- `packages/skam-web-component/vitest.config.ts`
- `packages/skam-web-component/src/index.ts`
- `packages/skam-web-component/src/skam-renderer.ts`
- `packages/skam-web-component/src/attribute-map.ts`
- `packages/skam-web-component/src/xml-extraction.ts`
- `packages/skam-web-component/src/types.ts`
- `packages/skam-web-component/src/__tests__/skam-renderer.test.ts`
- `packages/skam-web-component/src/__tests__/attribute-map.test.ts`
- `packages/skam-web-component/src/__tests__/xml-extraction.test.ts`

### 既存変更

- `/tsconfig.json` — references 追加
- `/knip.config.ts` — workspace 追加

### 参照する既存コード（再利用）

- `packages/skam-html-renderer/src/renderer.ts` — `render()`, `renderHTML()`, `generateCSS()`, `RenderOptions`, `RenderProfile`, `PROFILES`
- `packages/skam-html-renderer/src/interactive.ts` — `attachInteractiveHandlers()`
- `packages/skam-xml-parser/src/index.ts` — `parse()`, `SKAMXMLParseError`

## リスクと軽減策

| リスク                                                                            | 影響度 | 軽減策                                                                                                    |
| --------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| happy-dom の Custom Elements / Shadow DOM / MutationObserver / RAF サポート不完全 | 高     | Step 1 完了後に API サポート検証テストを実行。不足があればテスト戦略を調整（polyfill or mock）            |
| `<script type="text/skam-ml">` がバンドラーに拾われる                             | 低     | `type="text/skam-ml"` は JS と認識されないため影響なし                                                    |
| XML 内に `</script>` リテラルが含まれると HTML パーサーが破壊                     | 低     | SKAM-ML に script 要素は存在しないため実用上問題なし。制約としてドキュメントに明記                        |
| interactive ハンドラが Shadow DOM 内で動作しない                                  | 低     | `attachInteractiveHandlers` はコンテナ内のイベントデリゲーションのみ。Shadow DOM 内で完結するため問題なし |
| xml-parser の browser condition が tsup でバンドル時に解決されない                | 中     | 依存を external にし、利用者のバンドラーに condition resolution を委ねる（既存パッケージと同じ方式）      |

## 検証方法

1. **ユニットテスト** (vitest + happy-dom):
   - **API サポート検証**: `customElements`, `attachShadow`, `MutationObserver`, `requestAnimationFrame` が happy-dom で利用可能か確認（Step 1 直後に実施）
   - 属性マッピングの正確性（各型変換、無効値のフォールバック）
   - XML 取得の優先順位（xmlContent > script > textContent）、複数 script 要素、空文字列の扱い
   - レンダリング結果の Shadow DOM 内存在確認
   - 属性変更による再レンダリング
   - エラーイベントの dispatch（parse エラー・render エラー両方）
   - MutationObserver による子要素変更検知
   - **テスト技法**: RAF バッチ化のテストには `vi.useFakeTimers()` + `vi.advanceTimersToNextFrame()` を使用。MutationObserver は `await vi.waitFor()` で非同期検知を待機

2. **ビルド検証**:
   - `pnpm build` 全パッケージ成功
   - `pnpm typecheck` 型エラーなし
   - `pnpm test` 全テスト通過

3. **ブラウザ手動検証**（実装後、Playground または standalone HTML で）:
   - `<script type="text/skam-ml">` 方式の宣言的利用
   - JS からの `xmlContent` プロパティ設定
   - `writing-mode` / `profile` 属性の動的変更
   - CSS Variables によるスタイルカスタマイズ
   - エラー時のイベント受信

<!-- validated -->
