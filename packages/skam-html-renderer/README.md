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

### プロファイル指定

```typescript
import { render, PROFILES } from '@kanbun/skam-html-renderer';

// 縦書き（デフォルト）
const vertical = render(doc, { profile: PROFILES.vertical });

// 横書き
const horizontal = render(doc, { profile: PROFILES.horizontal });
```

### スタイルのカスタマイズ

```typescript
import { render, getDefaultStyles } from '@kanbun/skam-html-renderer';

const result = render(doc, {
  profile: PROFILES.vertical,
  styles: {
    fontSize: '1.2em',
    lineHeight: 2,
  },
});

// または、デフォルトスタイルを取得してカスタマイズ
const defaultStyles = getDefaultStyles();
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
