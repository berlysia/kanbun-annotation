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

<!-- doctest:typecheck -->

```typescript
import { SkamRendererElement } from '@kanbun-skam/skam-web-component';

customElements.define('skam-renderer', SkamRendererElement);
```

### プログラマティックに XML を設定

<!-- doctest:typecheck -->

```typescript
import { SkamRendererElement } from '@kanbun-skam/skam-web-component';

declare const xmlString: string;

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
| `reading-layer-source`  | `readings` \| `display`                             | `readings` | 読み層の出どころ (`@experimental`)                |
| `copyable`              | `all` \| スペース区切りの要素名                     | (なし)     | コピー可能な注記要素                              |
| `class-prefix`          | 文字列                                              | `skam`     | CSS クラス名の接頭辞                              |
| `display-lang`          | BCP 47 言語タグ                                     | (なし)     | 表示層 `.skam-display` の `lang`                  |
| `auto-font`             | (boolean)                                           | false      | Google Fonts 自動読み込み（Noto Serif JP, serif） |

`auto-font` を有効にすると、Google Fonts から **Noto Serif JP** を読み込み、`--{class-prefix}-font-family` と `--{class-prefix}-font-family-ruby` を自動設定する。無効時はフォントを継承する。

`profile` は、プリセット名か JSON で書く。JSON には 2 つの形がある。

- 部分指定（例: `{"okurigana":false}`）: **書かなかったキーは full（表示）になる**。
- `{ "base": "learningBasic", "overrides": { "okurigana": true } }`: プリセットから出発して一部を変える。注記を隠す用途ではこちらを使う。

未知のキー、真偽値でない値、空文字、JSON の `null` / 配列 / 数値は不正で、**描画しない**（下の `skam-error`、`recoverable: false`）。`include-reading-layer` も `true` / `false` / 空文字以外は描画しない。`profile` 属性を外すと、full で描画する。

`reading-layer-source` (`@experimental`) は、読み層の出どころを選ぶ。`readings`（既定）は作者が書いた読みを、`display` は `profile` で画面に見えている注記だけを言葉にする。`readings` と白文は参照しない。`readings` / `display` 以外は不正で、描画しない。**`reading-layer-source=""` は不正（描画しない）だが、`include-reading-layer=""` は真偽値の属性として true になる。**

読み上げの言葉を変える `accessibleLabels` (`@experimental`) は関数を含むので、属性ではなくプロパティで渡す。

```js
const el = document.querySelector('skam-renderer');
el.accessibleLabels = { kaeri: () => '返り点' };
```

- ラベルは `reading-layer-source="display"` のときだけ効く。
- 不正な値 (関数でない値、未知のキー、プレーンでないオブジェクトなど) は、ラベルなしで描画し、`recoverable: true` の `skam-error` で通知する。
- 変えるときは新しいオブジェクトを代入する。同じオブジェクトの中身を書き換えて再代入しても、再描画しない。
- ラベルの関数が例外を投げたり、空文字や文字列でない値を返したりしたときは、その注記だけが出ない。通知はない。

### 出題に使うとき

教材の出題画面のように注記の一部を隠すときは、次の 4 点に従う。

1. `profile` は `{ "base": ..., "overrides": ... }` の形で書き、**必ず** `reading-layer-source="display"` と併用する。部分指定はキーを書き忘れると full 側に倒れる。
2. 既定の `readings` は、隠した注記を読み下しとして読み上げる。
3. `profile` 属性を外すと、full で描かれる。属性を動的に付け外しする画面では、外した瞬間に答えが見える。
4. 保証するのは画面と読み層だけである。HTML ソースや `<script>` 内の SKAM-ML からは元の注記を取れる。答えを本当に隠したいなら、配る前に SKAM-ML から注記を除く。

```html
<skam-renderer
  profile='{"base":"learningHint","overrides":{"okurigana":false}}'
  reading-layer-source="display"
>
  <script type="application/vnd.berlysia.skam+xml">
    ...
  </script>
</skam-renderer>
```

各属性の詳細（`copyable` の指定可能な値など）は [@kanbun-skam/skam-html-renderer の README](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-html-renderer#readme) を参照。

### イベント

| イベント      | detail                                                       | 説明               |
| ------------- | ------------------------------------------------------------ | ------------------ |
| `skam-render` | `{ document: SKAMDocument }`                                 | レンダリング成功時 |
| `skam-error`  | `{ error: Error, recoverable: boolean, attribute?: string }` | エラー発生時       |

`skam-error` には 2 種類ある。

- `recoverable: false`: 描画に失敗した。内容を消して `role="alert"` を表示する。`profile` / `include-reading-layer` / `reading-layer-source` が不正なときも、この形で発火する（`attribute` に属性名が入り、`detail` に属性の生の値は入らない。値は 64 文字に切り詰めて、メッセージに含まれる）。`profile` の誤りの `error` は 2 つの型に分かれる。プリセット名でも JSON でもない値（`profile="nope"`、`profile="{not json"`）は `TypeError` になる。JSON として読めた値の表示設定の誤り（`profile='{"okurigna":false}'`、`profile='{"base":"nope"}'`）は `SKAMRenderProfileError` で、`kind` と `key` を読める（クラスは `@kanbun-skam/skam-html-renderer` から import する。内容は html-renderer の README の「表示設定の誤り」）。同じ内容で同じエラーが続く間は 1 回だけ発火する。内容かエラーが変わる、描画が成功する、要素を外す、のいずれかで、次の失敗は再び発火する。属性が不正な間は、`<script>` の内容が変わっても空のままで、同じ属性の同じ値では再び発火しない。
- `recoverable: true`: `writing-mode` / `copyable` / `class-prefix` / `display-lang` の値が不正だったため、その属性だけ既定値に戻して描画を続けた（`copyable` は有効な要素名だけを使う）。不正な `accessibleLabels` (プロパティ) は、ラベルなしで描画を続ける。`attribute` に属性名が入る。`skam-render` より前に、`writing-mode` → `copyable` → `class-prefix` → `display-lang` → `accessibleLabels` の順で発火する。`class-prefix` / `display-lang` では、`error.message` に属性の値は含まれない。

回復可能なエラーは、同じ属性に同じ不正値が残っている間は再描画しても再び発火しない。値が変わったときだけ発火する。値が有効になった場合と、要素を DOM から外した場合は、記録が消える。ハンドラが属性を毎回違う不正値に書き換えると、エラー → 再描画 → エラーの連鎖は止まらない。これはハンドラ側の誤りとして扱う。

`skam-error` のハンドラの中で、同じ要素の内容を書き換えないこと。書き換えると、内容が変わるたびに通知と再描画が続く。

### SSR

`@kanbun-skam/skam-web-component` と `/auto` は、`HTMLElement` や `customElements` が無い環境でも import できる。`/auto` はその環境では何もしない。ただし `SkamRendererElement` をサーバー側で `new` することはできない (constructor が `document` を使うため)。

### CSS Variables によるカスタマイズ

Shadow DOM 内のスタイルはホスト要素の CSS Variables で制御可能。変数一覧は [skam-html-renderer の CSS Variables セクション](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-html-renderer#css-variables-によるカスタマイズ)を参照。変数名の接頭辞は `class-prefix` に従う。`class-prefix="foo"` なら `--foo-color-fg` のようになる。

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

2 の取り出しに使う `extractXmlFromScriptElement` と `SKAM_XML_MEDIA_TYPE` は、`@kanbun-skam/skam-xml-parser` のものを再 export している。Web Component を使わずに light DOM へ描くときは、parser から import し、`@kanbun-skam/skam-html-renderer` の `mount` で描ける。

### 描画の時機と補正

`<skam-renderer>` は、`@kanbun-skam/skam-html-renderer` の `mount` で shadow root に描く。

- 文書に接続した後に描く。接続する前に `xmlContent` や属性を設定しても、描画と `skam-render` は接続の後になる。
- グリッドの基線の補正は、描画の直後と `document.fonts.ready` の後の 2 回行う。`skam-render` は 1 回目の補正の後に発火する。
- 描画の CSS は shadow root の `<style data-skam-css>` に 1 つだけ置き、描くたびに入れ替える。

### Trusted Types

`require-trusted-types-for 'script'` の CSP のページでは、Trusted Types の policy を `trustedTypesPolicy` (`@experimental`) プロパティで渡す。属性では渡せない。

<!-- doctest:typecheck -->

```typescript
import type { SkamRendererElement } from '@kanbun-skam/skam-web-component';

declare const policy: { createHTML(input: string): unknown };

const el = document.querySelector('skam-renderer') as SkamRendererElement;
el.trustedTypesPolicy = policy;
```

- 要素は同じ policy を、SKAM-ML の parse と描画の両方に使う。`createHTML` は 1 回の描画につき、元の XML、描画の HTML の順で 2 回呼ばれる。XML はそのまま返す (書き換えると文書が壊れうる)。HTML 用のサニタイザ (DOMPurify など) をそのまま渡さない。
- 何を検査するかは利用者の責任で、素通しの policy は Trusted Types の強制を満たすだけである。描画の HTML の安全性は `render` のエスケープに依る。素通しの policy は、他のコードから使えない場所に置く。
- `createHTML` が例外を投げると、`recoverable: false` の `skam-error` になり、その例外のメッセージが alert と `error.message` に出る。メッセージに秘密を入れない。
- policy を渡さずに Trusted Types が必須のページで描くと、`recoverable: false` の `skam-error` になる。
- `null` は指定なしとして扱う。同じ policy を代入し直しても再描画しない。
- `customElements.define` の後に代入する。define の前に要素へ代入した値は使われない (`accessibleLabels` も同じ)。
- `style-src` に nonce だけを使う CSP のページでは、下の `nonce` 属性も書く。

### CSP の nonce

`style-src` に nonce を使う CSP のページでは、`nonce` 属性に、そのページの nonce と同じ値を書く。

```html
<skam-renderer nonce="（ページの nonce）">
  <script type="application/vnd.berlysia.skam+xml">
    ...
  </script>
</skam-renderer>
```

- 要素は、shadow root の `<style>` (描画の CSS、変数の上書き、フォント、エラーの表示) に nonce を付ける。ヲコト点の位置と傍点の形は、インラインの `style` 属性でなく CSSOM で設定するので、`style-src-attr` は要らない。
- `auto-font` の Google Fonts の `<link>` を新しく入れるときも、nonce を付ける。フォント本体を読むには、別に `font-src https://fonts.gstatic.com` が要る。nonce の無い link が既にあるときは、それを使い、止められたままになる。
- nonce は接続の前に書く。接続した後に変えても、それだけでは描き直さない (次に描くときに新しい値を使う)。
- CSP をヘッダで送るページでは、ブラウザが `nonce` 属性の値を空にして隠す。要素は `nonce` プロパティから値を読むので、隠されても動く。ただし `innerHTML` や `cloneNode` で要素を作り直すと値は引き継がれない。
- nonce はリクエストごとに変える値である。固定の値を書くと、CSP の保護にならない。

### Trusted Types

`<skam-renderer>` は shadow root の中で `innerHTML` に文字列を入れるので、`require-trusted-types-for 'script'` のページでは使えない。そうしたページでは、`@kanbun-skam/skam-html-renderer` の `mount` に `trustedTypesPolicy` を渡して描く。

## 0.1 からの移行

0.1.x からの変更のうち、このパッケージに関わるものです。ID は全体の移行表と共通です。

| ID  | 旧挙動                                                                                                                                                                                                       | 新挙動                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 回避策                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M01 | npm には 0.1.0 から `@kanbun-skam/*` の名前で公開している (`@kanbun/*` は npm に公開していない)。リポジトリの CHANGELOG には、未公開の 0.1.1 として `@kanbun` からの改名が書かれていた。                     | 名前は変わらない。CHANGELOG から未公開の 0.1.1 の節を消し、0.1.0 の次を 0.2.0 とした。                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 不要。                                                                                                                                                                |
| M15 | readings のない文書では本文が支援技術から見えなかった。読み層に `aria-label` を付けた。                                                                                                                      | readings がない文書は、読み層に白文 (本文のテキスト) を出力する。読み層に `aria-label` は付けない。                                                                                                                                                                                                                                                                                                                                                                                                                                                        | スナップショットや VRT を取り直す。`aria-label` に依存した検索や CSS があれば、読み層の要素の内容に切り替える。                                                       |
| M20 | `detail` は従来の項目だけだった。                                                                                                                                                                            | `detail` に `recoverable` と `attribute` が加わる。回復可能なエラーは、同じ不正な値で再描画しても発火しない。                                                                                                                                                                                                                                                                                                                                                                                                                                              | `skam-error` のハンドラで `recoverable` を見て扱いを分ける。                                                                                                          |
| M21 | DOM のない環境で import すると失敗した。                                                                                                                                                                     | SSR 中に import できる。要素の登録はブラウザで行う。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 対応は要らない (非破壊の修正)。                                                                                                                                       |
| M22 | 表示言語を指定する手段がなかった。                                                                                                                                                                           | html-renderer に `displayLang` オプション、web-component に `display-lang` 属性を足す。                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 対応は要らない (非破壊の追加)。                                                                                                                                       |
| M24 | 条件オブジェクトで `import` が `types` より前にあった。`skam-web-component` の `./auto` には `types` がなかった。                                                                                            | `types` を先頭にする。`./auto` に `types` を足す。サブパスと実体は変わらない。                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 対応は要らない (非破壊の変更)。                                                                                                                                       |
| M27 | なし。                                                                                                                                                                                                       | `skam` / `skam-html-renderer` / `skam-canvas-renderer`: `RENDER_PROFILES` (html と canvas では `PROFILES` の別名のまま)、`resolveRenderProfile`、`RenderProfileInput`、`RenderProfileName` (`RenderProfile` の型も skam から再 export する)。`skam-web-component`: `extractXmlFromScriptElement` (`@experimental`)。                                                                                                                                                                                                                                       | 対応は要らない (非破壊の追加)。`@experimental` の API は、0.x の間はマイナーリリースで値が変わりうる。                                                                |
| M31 | `profile` 属性が不正な値 (JSON として読めない値、未知のプリセット名、JSON の `null` / 配列 / 数値、空文字) なら、黙って full で描いた。`include-reading-layer` は `"false"` 以外をすべて true として扱った。 | `profile` が不正な値 (未知のキー、真偽値でない値、`undefined` の値、`base` と個別キーの混在、own property の `__proto__`、プリセット名でも JSON でもない値、JSON の `null` / 配列 / 数値、空文字) なら、描画しない。内容を空にして `role="alert"` の要素にメッセージを出し、`skam-error` を `recoverable: false` で発火する。`include-reading-layer` が `"true"` / `"false"` / 空文字以外のときも同じ。不正な間は `<script>` の内容が変わっても空のまま。`detail` には属性の生の値を入れない。同じ属性の同じ値では再発火しない。属性を外すと full で描く。 | `profile` はプリセット名か、検証を通る JSON で書く。`include-reading-layer` は `true` / `false` / 空文字にする。`skam-error` を購読して `recoverable: false` を扱う。 |
| M32 | `writing-mode` が `vertical` / `horizontal` 以外、`copyable` が未知の要素名を含むとき、黙って既定値 (縦書き、有効な要素名だけ) で描いた。                                                                    | 描画は変わらない。`skam-error` を `recoverable: true`、`attribute` 付きで発火する (同じ値では再発火しない)。`skam-render` より前に、`writing-mode` → `copyable` → `class-prefix` → `display-lang` の順で発火する。                                                                                                                                                                                                                                                                                                                                         | 対応は要らない。`skam-error` を購読している場合は、`recoverable` と `attribute` で扱いを分ける。                                                                      |
| M37 | なし。                                                                                                                                                                                                       | `skam`: `describeAnnotationIR`、`formatAccessibleText`、`DEFAULT_ACCESSIBLE_LABELS`、型 `AccessibleNote` / `AccessibleUnit` / `AccessibleBlock` / `AccessibleLabels` (すべて `@experimental`)。`skam-html-renderer`: `readingLayerSource` / `accessibleLabels` オプションと `AccessibleLabels` 型 (`@experimental`)。`skam-web-component`: `reading-layer-source` 属性 (`@experimental`)。                                                                                                                                                                 | 対応は要らない (追加。既定の挙動は変わらない)。`@experimental` の API は、0.x の間はマイナーリリースで値が変わりうる。読み上げの言葉も 0.x のマイナーで変わりうる。   |

全体の移行表 (対象パッケージ、依存の更新を含む): https://github.com/berlysia/kanbun-annotation/blob/master/docs/migration-0.1-to-0.2.md

## 関連パッケージ

- [@kanbun-skam/skam](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam) - 型定義・バリデーター
- [@kanbun-skam/skam-xml-parser](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-xml-parser) - SKAM-ML/XML パーサー
- [@kanbun-skam/skam-html-renderer](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-html-renderer) - HTML レンダラー

## ライセンス

MIT
