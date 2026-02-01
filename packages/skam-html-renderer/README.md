# @kanbun/skam-html-renderer

**SKAM ドキュメント**から**静的 HTML** を生成するレンダラー。

縦書き・横書き・縦中横対応、返り点・送り仮名・ルビ等の訓点レンダリングを提供。

## インストール

```bash
npm install @kanbun/skam-html-renderer
# or
pnpm add @kanbun/skam-html-renderer
```

## 使い方

### 基本的なレンダリング

```typescript
import { render } from '@kanbun/skam-html-renderer';
import type { SKAMDocument } from '@kanbun/skam';

const doc: SKAMDocument = {
  format: 'skam@0.1',
  tokens: [
    { id: 't1', text: '学' },
    { id: 't2', text: '而' },
  ],
  marks: [{ type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'びて' }],
  readings: [],
};

const result = render(doc);
// result.html: レンダリングされた HTML
// result.css: 適用すべき CSS
```

### 書字方向の指定

```typescript
import { render } from '@kanbun/skam-html-renderer';

// 縦書き（デフォルト）
const vertical = render(doc, { writingMode: 'vertical' });

// 横書き
const horizontal = render(doc, { writingMode: 'horizontal' });
```

### 表示プロファイル

```typescript
import { render, PROFILES } from '@kanbun/skam-html-renderer';

// フルプロファイル（すべての要素を表示、デフォルト）
const full = render(doc, { profile: PROFILES.full });

// 学習用基本プロファイル（返り点のみ）
const basic = render(doc, { profile: PROFILES.learningBasic });

// 学習用ヒント付きプロファイル（返り点+送り仮名）
const hint = render(doc, { profile: PROFILES.learningHint });
```

### スタイルのカスタマイズ

```typescript
import { render, getDefaultStyles, generateCSS } from '@kanbun/skam-html-renderer';

// CSS 生成オプション
const css = generateCSS({
  writingMode: 'vertical',  // 'vertical' | 'horizontal' | 'both'
  inline: false,            // インラインモード
  useLayer: true,           // @layer でラップ（デフォルト: true）
  layerName: 'skam-kanbun', // レイヤー名（デフォルト: 'skam-kanbun'）
});

// レンダリングも同様のオプションに対応
const result = render(doc, { writingMode: 'vertical' });
```

### CSS Variables によるカスタマイズ

生成される CSS は CSS Variables を公開しており、ユーザー側で簡単にカスタマイズできます。

```css
/* ユーザー側でカスタマイズ */
.skam-document {
  --skam-color-fg: #333;
  --skam-color-kaeriten: #c00;
  --skam-color-ruby: #666;
  --skam-font-family: "游明朝", serif;
}
```

#### 公開 CSS Variables 一覧

| カテゴリ | 変数名 | デフォルト値 | 用途 |
|---------|--------|-------------|------|
| **色** | `--skam-color-fg` | `currentColor` | 前景色（テキスト、傍線等） |
| | `--skam-color-kaeriten` | `currentColor` | 返り点の色 |
| | `--skam-color-ruby` | `currentColor` | ルビ・送り仮名の色 |
| | `--skam-color-emphasis` | `currentColor` | 傍点の色 |
| **フォント** | `--skam-font-family` | `inherit` | 本文フォント |
| | `--skam-font-family-ruby` | `inherit` | ルビ・送り仮名フォント |
| **サイズ** | `--skam-glyph-size` | `1em` | 基準グリフサイズ |
| | `--skam-ruby-font-size` | `0.5em` | ルビ・送り仮名サイズ |
| **余白・間隔** | `--skam-line-height` | `2` | 行間 |
| | `--skam-letter-spacing` | `0` | 字間 |

### CSS @layer との統合

生成される CSS はデフォルトで `@layer skam-kanbun` でラップされます。
これにより、ユーザー側でカスケード順序を制御できます。

```css
/* ユーザー側でレイヤー順序を定義 */
@layer reset, base, skam-kanbun, app;

/* skam-kanbun レイヤーより後のレイヤーで上書き可能 */
@layer app {
  .skam-document {
    --skam-color-kaeriten: red;
  }
}
```

#### @layer を無効にする

```typescript
const css = generateCSS({ useLayer: false });
```

### リセット CSS との共存

本ライブラリは `:where()` セレクタで specificity を 0 に抑えているため、
一般的なリセット CSS と競合しにくい設計です。

#### sanitize.css との組み合わせ

```html
<link rel="stylesheet" href="sanitize.css" />
<style>
  @layer reset, skam-kanbun;
</style>
```

#### Tailwind CSS preflight との組み合わせ

```css
@layer base, skam-kanbun, components, utilities;
```

## レンダリング対応

| Mark Type   | 対応状況 |
| ----------- | -------- |
| `kaeri`     | ✅       |
| `okurigana` | ✅       |
| `yomigana`  | ✅       |
| `soegana`   | ✅       |
| `okimoji`   | ✅       |
| `joji`      | ✅       |
| `kutoten`   | ✅       |
| `emphasis`  | ✅       |
| `note`      | ✅       |
| `saidoku`   | ✅       |
| `tateten`   | ✅       |
| `underline` | ✅       |
| `label`     | ✅       |
| `okototen`  | 🚧       |

## 出力形式

```typescript
interface RenderResult {
  /** レンダリングされた HTML 文字列 */
  html: string;
  /** 適用すべき CSS 文字列 */
  css: string;
}
```

## 関連パッケージ

- [@kanbun/skam](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam) - 型定義・バリデーター
- [@kanbun/skam-xml-parser](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-xml-parser) - SKAM-ML/XML パーサー

## Playground

インタラクティブなデモ: [https://berlysia.github.io/kanbun-annotation/](https://berlysia.github.io/kanbun-annotation/)

## ライセンス

MIT
