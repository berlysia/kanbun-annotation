# @kanbun-skam/skam-web-component

**`<skam-renderer>`** カスタムエレメント。

SKAM-ML/XML を Shadow DOM 内で HTML レンダリングする Web Component。

## インストール

```bash
npm install @kanbun-skam/skam-web-component
# or
pnpm add @kanbun-skam/skam-web-component
```

## 使い方

### 自動登録（かんたん）

`/auto` エンドポイントをインポートすると `<skam-renderer>` が自動登録される。

```html
<script type="module">
  import '@kanbun-skam/skam-web-component/auto';
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

### 手動登録

メインエントリからは自動登録されない。利用側で `customElements.define()` を呼ぶ。

```typescript
import { SkamRendererElement } from '@kanbun-skam/skam-web-component';

customElements.define('skam-renderer', SkamRendererElement);
```

### プログラマティックに XML を設定

```typescript
import { SkamRendererElement } from '@kanbun-skam/skam-web-component';

const el = document.querySelector('skam-renderer') as SkamRendererElement;
el.xmlContent = xmlString;
```

### 属性

| 属性                    | 値                                                  | デフォルト | 説明                                              |
| ----------------------- | --------------------------------------------------- | ---------- | ------------------------------------------------- |
| `writing-mode`          | `vertical` \| `horizontal`                          | `vertical` | 書字方向                                          |
| `profile`               | `full` \| `learningBasic` \| `learningHint` \| JSON | `full`     | 表示プロファイル                                  |
| `inline`                | (boolean)                                           | false      | インラインモード                                  |
| `include-reading-layer` | `true` \| `false`                                   | `true`     | 読み層の表示                                      |
| `copyable`              | `all` \| スペース区切りの要素名                     | (なし)     | コピー可能な注記要素                              |
| `class-prefix`          | 文字列                                              | `skam`     | CSS クラス名の接頭辞                              |
| `display-lang`          | BCP 47 言語タグ                                     | (なし)     | 表示層 `.skam-display` の `lang`                  |
| `auto-font`             | (boolean)                                           | false      | Google Fonts 自動読み込み（Noto Serif JP, serif） |

`auto-font` を有効にすると、Google Fonts から **Noto Serif JP** を読み込み、`--{class-prefix}-font-family` と `--{class-prefix}-font-family-ruby` を自動設定する。無効時はフォントを継承する。

各属性の詳細（`profile` の種類、`copyable` の指定可能な値など）は [@kanbun-skam/skam-html-renderer の README](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-html-renderer#readme) を参照。

### イベント

| イベント      | detail                                                       | 説明               |
| ------------- | ------------------------------------------------------------ | ------------------ |
| `skam-render` | `{ document: SKAMDocument }`                                 | レンダリング成功時 |
| `skam-error`  | `{ error: Error, recoverable: boolean, attribute?: string }` | エラー発生時       |

`skam-error` には 2 種類ある。

- `recoverable: false`: 描画に失敗した。内容を消して `role="alert"` を表示する。再描画のたびに発火する。
- `recoverable: true`: `class-prefix` / `display-lang` の値が不正だったため、その属性だけ既定値に戻して描画を続けた。`attribute` に属性名が入る。`skam-render` より前に、`class-prefix` → `display-lang` の順で発火する。`error.message` に属性の値は含まれない。

回復可能なエラーは、同じ属性に同じ不正値が残っている間は再描画しても再び発火しない。値が変わったときだけ発火する。値が有効になった場合と、要素を DOM から外した場合は、記録が消える。ハンドラが属性を毎回違う不正値に書き換えると、エラー → 再描画 → エラーの連鎖は止まらない。これはハンドラ側の誤りとして扱う。

### SSR

`@kanbun-skam/skam-web-component` と `/auto` は、`HTMLElement` や `customElements` が無い環境でも import できる。`/auto` はその環境では何もしない。ただし `SkamRendererElement` をサーバー側で `new` することはできない (constructor が `document` を使うため)。

### CSS Variables によるカスタマイズ

Shadow DOM 内のスタイルはホスト要素の CSS Variables で制御可能。変数一覧は [skam-html-renderer の CSS Variables セクション](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-html-renderer#css-variables-によるカスタマイズ)を参照。

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

- [@kanbun-skam/skam](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam) - 型定義・バリデーター
- [@kanbun-skam/skam-xml-parser](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-xml-parser) - SKAM-ML/XML パーサー
- [@kanbun-skam/skam-html-renderer](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-html-renderer) - HTML レンダラー

## ライセンス

MIT
