---
status: Complete
plan: plan-web-component.md
---

# ADR-009: SKAM Web Component (`<skam-renderer>`)

## コンテキスト

SKAM の HTML レンダリングパイプライン（`parse` → `render`）を利用するには、現状 JavaScript で各パッケージを import し、手動で DOM に挿入する必要がある。フレームワーク非依存で、HTML に埋め込むだけで漢文の訓点レンダリングを表示できる宣言的なインターフェースが求められている。

### 課題

- 利用者は 3 パッケージ（skam-xml-parser, skam-html-renderer, skam）の API を理解する必要がある
- CSS の注入やスタイルスコーピングを利用者側で管理する必要がある
- SKAM-ML/XML を HTML 内に埋め込む際、HTML パーサーが名前空間付き要素（`<skam:doc>`）を破壊する

## 検討した選択肢

### Option A: Web Component (Custom Element + Shadow DOM)

- 利点: フレームワーク非依存、Shadow DOM でスタイルカプセル化、宣言的 + プログラマティック両対応
- 欠点: Shadow DOM 内の CSS Variables 以外のスタイルカスタマイズが制限される

### Option B: Lit Element

- 利点: テンプレートやリアクティブプロパティなど開発者体験が良い
- 欠点: ランタイム依存が増える、既存パッケージは依存最小方針

### Option C: フレームワーク固有コンポーネント (React/Vue)

- 利点: 各フレームワークのエコシステムに適合
- 欠点: フレームワーク依存、複数のラッパーが必要

## 決定

**Option A: Web Component (Custom Element + Shadow DOM)** を採用する。

### XML 埋め込み方式

`<script type="application/vnd.berlysia.skam+xml">` を使用する。`<script>` の non-JavaScript type はブラウザが raw text として保持するため、XML 名前空間構文が破壊されない。

```html
<skam-renderer writing-mode="vertical">
  <script type="application/vnd.berlysia.skam+xml">
    <skam:doc xmlns:skam="urn:skam">
      子曰<skam:yomigana value="いは">く</skam:yomigana>學而時習之
    </skam:doc>
  </script>
</skam-renderer>
```

制約: XML 内に `</script>` リテラルを含めることはできない（SKAM-ML にはそのような要素がないため実用上問題なし）。

### スタイルカプセル化

- Shadow DOM（open mode）で CSS をカプセル化
- `generateCSS({ useLayer: false })` で `@layer` なしの CSS を Shadow DOM 内の `<style>` に注入
- CSS Variables（`--skam-*`）は Shadow DOM を貫通するため外部からカスタマイズ可能

### パッケージ構成

`@kanbun-skam/skam-web-component` を新規パッケージとして `packages/skam-web-component/` に配置。`@kanbun-skam/skam-xml-parser` と `@kanbun-skam/skam-html-renderer` に依存する。

### 属性設計

HTML 属性（kebab-case）と JS プロパティ（camelCase）の両方で RenderOptions を制御可能。`profile` はプリセット名文字列または JSON を受け取る。Boolean 属性は HTML 標準（存在で true）に準拠。

## 影響

### ポジティブ

- HTML に `<skam-renderer>` を書くだけで漢文レンダリングが表示される
- フレームワーク非依存で、React/Vue/Svelte/vanilla いずれからも利用可能
- Shadow DOM により外部 CSS との干渉を回避
- CSS Variables による柔軟なスタイルカスタマイズ

### ネガティブ

- 新規パッケージの追加によりメンテナンス対象が増加
- Shadow DOM 内のスタイル変更が CSS Variables に限定される
- happy-dom のテスト環境で Custom Elements / Shadow DOM の一部機能がサポートされない可能性

## 参考

- [Web Components MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_components)
- [Using shadow DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM)
- SKAM-ML 仕様: `SKAM-ML-draft.md`
