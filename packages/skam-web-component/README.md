# @kanbun/skam-web-component

**`<skam-renderer>`** カスタムエレメント。

SKAM-ML/XML を Shadow DOM 内で HTML レンダリングする Web Component。インポートするだけで自動登録。

## インストール

```bash
npm install @kanbun/skam-web-component
# or
pnpm add @kanbun/skam-web-component
```

## 使い方

### 基本的な使い方

```html
<script type="module">
  import '@kanbun/skam-web-component';
</script>

<skam-renderer>
  <script type="application/vnd.berlysia.skam+xml">
    <?xml version="1.0" encoding="UTF-8"?>
    <skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
      <skam:body>
        <skam:block>
          <skam:kun yomi="まな" okuri="びて">學</skam:kun><skam:okimoji>而</skam:okimoji>時<skam:kaeri kind="re"/><skam:kun soe="を">之</skam:kun><skam:kun okuri="ふ">習</skam:kun>
        </skam:block>
      </skam:body>
    </skam:doc>
  </script>
</skam-renderer>
```

### プログラマティックに XML を設定

```typescript
import { SkamRendererElement } from '@kanbun/skam-web-component';

const el = document.querySelector('skam-renderer') as SkamRendererElement;
el.xmlContent = xmlString;
```

### 属性

| 属性                    | 値                                                  | デフォルト | 説明                      |
| ----------------------- | --------------------------------------------------- | ---------- | ------------------------- |
| `writing-mode`          | `vertical` \| `horizontal`                          | `vertical` | 書字方向                  |
| `profile`               | `full` \| `learningBasic` \| `learningHint` \| JSON | `full`     | 表示プロファイル          |
| `inline`                | (boolean)                                           | false      | インラインモード          |
| `interactive`           | (boolean)                                           | false      | インタラクティブ操作      |
| `include-reading-layer` | `true` \| `false`                                   | `true`     | 読み層の表示              |
| `copyable`              | `all` \| スペース区切りの要素名                     | (なし)     | コピー可能な注記要素      |
| `class-prefix`          | 文字列                                              | `skam`     | CSS クラス名の接頭辞      |
| `auto-font`             | (boolean)                                           | false      | Google Fonts 自動読み込み |

### イベント

| イベント      | detail                       | 説明               |
| ------------- | ---------------------------- | ------------------ |
| `skam-render` | `{ document: SKAMDocument }` | レンダリング成功時 |
| `skam-error`  | `{ error: Error }`           | エラー発生時       |

### CSS Variables によるカスタマイズ

Shadow DOM 内のスタイルはホスト要素の CSS Variables で制御可能:

```css
skam-renderer {
  --skam-color-fg: #333;
  --skam-color-kaeriten: #c00;
  --skam-font-family: '游明朝', serif;
  --skam-glyph-size: 1.2em;
}
```

### XML ソースの優先順位

1. `xmlContent` プロパティ（プログラマティック設定）
2. `<script type="application/vnd.berlysia.skam+xml">` 子要素
3. Light DOM のテキストコンテンツ

## 関連パッケージ

- [@kanbun/skam](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam) - 型定義・バリデーター
- [@kanbun/skam-xml-parser](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-xml-parser) - SKAM-ML/XML パーサー
- [@kanbun/skam-html-renderer](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-html-renderer) - HTML レンダラー

## ライセンス

UNLICENSED
