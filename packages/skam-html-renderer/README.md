# @kanbun-skam/skam-html-renderer

**SKAM ドキュメント**から**静的 HTML** を生成するレンダラー。

縦書き・横書き・縦中横対応、返り点・送り仮名・ルビ等の訓点レンダリングを提供。

## インストール

```bash
npm install @kanbun-skam/skam-html-renderer
# or
pnpm add @kanbun-skam/skam-html-renderer
```

## 使い方

### DOM に描く (`mount`、`@experimental`)

ページの要素に描くときは `mount` を使う。`mount` は次をまとめて行う。

- `render` の `css` を、その要素が属する document の `head`（shadow root の中なら、その shadow root）に 1 回だけ入れる。同じ CSS の `<style data-skam-css>` が既にあれば入れない。html-renderer のコピーがページに 2 つあっても同じ。
- `html` を要素に入れる。
- `calibrateGridBaseline` を、すぐに 1 回、`document.fonts.ready` の後にもう 1 回呼ぶ。2 回目の完了は `fontsCalibrated` で分かる。待たなくてもよい。この Promise は reject しない（2 回目の補正に失敗したときは `console.warn` を出して解決する）。

<!-- doctest:typecheck -->

```typescript
import { mount } from '@kanbun-skam/skam-html-renderer';
import type { SKAMDocument } from '@kanbun-skam/skam';

declare const doc: SKAMDocument;

const container = document.getElementById('kanbun')!;
const { fontsCalibrated } = mount(container, doc, { writingMode: 'vertical' });
await fontsCalibrated; // フォントの読み込み後の補正まで待つ場合
```

- `mount` の入力は `SKAMDocument` で、SKAM-ML の文字列から描くときは先に `@kanbun-skam/skam-xml-parser` の `parse` を呼ぶ。
- 要素は document に接続しておく。接続されていない要素には `TypeError` を投げ、DOM を変えない。オプションの誤り（`SKAMRenderProfileError` など）も、DOM を変えずに投げる。
- `mount` は Web フォント（Noto Serif JP など）を読み込まない。フォントはページの側で読み込む。Web Component が足している CSS 変数の上書きも行わない。
- 出題のように注記を隠すときは、`readingLayerSource: 'display'` を指定する（下の「出題に使うとき」）。既定の `'readings'` は `render` と同じで、隠した注記も読み層に出す。
- 入れた `<style>` を後から外す手段は無い。オプションが違えば CSS も違うので、`<style>` が増える。

#### CSP と Trusted Types

- `style-src` に nonce を使うページでは、`nonce` を渡すと、新しく入れる `<style>` に付く。nonce が一致しない既存の `<style>` は使い回さない。ただし描画の HTML は、ヲコト点の位置と傍点の形をインラインの `style` 属性で出す。nonce は `<style>` 要素にしか効かないので、これらの属性を許すには `style-src-attr` が要る（許さないと、ヲコト点と傍点の表示が崩れる）。
- `require-trusted-types-for 'script'` のページでは、`innerHTML` に文字列を入れると例外になる。ページが許した名前の policy を作り、`trustedTypesPolicy` に渡す。渡さないと `TypeError` を投げ、そのとき CSS は入ったまま残る。

<!-- doctest:typecheck -->

```typescript
import { mount } from '@kanbun-skam/skam-html-renderer';
import type { SKAMDocument } from '@kanbun-skam/skam';

declare const doc: SKAMDocument;
declare const container: HTMLElement;
declare const trustedTypes: {
  createPolicy(
    name: string,
    rules: { createHTML(input: string): string }
  ): {
    createHTML(input: string): unknown;
  };
};

// CSP: require-trusted-types-for 'script'; trusted-types skam-kanbun
// mount 専用の policy。モジュールの外 (window など) に出さない
const policy = trustedTypes.createPolicy('skam-kanbun', { createHTML: (html) => html });
mount(container, doc, { trustedTypesPolicy: policy });
```

- 上の素通しの policy は、`render` の出力がエスケープ済みであることを前提にしている。同じ policy を他のコードが使えると、ページ全体の Trusted Types の保護が外れる。policy は mount 専用に作ってモジュールの中に閉じ、`default` の policy を素通しにせず、CSP の `trusted-types` には専用の名前だけを書く。
- サニタイズする policy（DOMPurify など）を使うときは、`ruby`、`data-*`、インラインの `style` 属性を落とさない設定にする。落とすと表示と補正が崩れる。その設定はこのライブラリでは保証しない。`createHTML` は文字列か TrustedHTML を返すこと。
- `<style>` の中身と補正は Trusted Types の対象ではない。

### `mount` を使わずに描く

`render` の戻り値を自分で置くときは、次の 3 手順を踏む。

1. `render` の `css` を、ページに 1 回だけ入れる。
2. `html` を挿入する。
3. フォントを読み込んだ後に `calibrateGridBaseline(container)` を呼ぶ。

### 基本的なレンダリング

<!-- doctest -->

```typescript
import { render } from '@kanbun-skam/skam-html-renderer';
import type { SKAMDocument } from '@kanbun-skam/skam';

const doc: SKAMDocument = {
  format: 'skam@0.1',
  tokens: [
    { id: 't1', text: '学' },
    { id: 't2', text: '而' },
  ],
  blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
  marks: [{ type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'びて' }],
  readings: [],
};

const result = render(doc);
// result.html: レンダリングされた HTML
// result.css: 適用すべき CSS
```

### Node / SSR での利用

`render()` は DOM に依存しない。`document` や `window` を使わず、文字列（`html` と `css`）を返すだけなので、Node.js やサーバーサイドレンダリング（SSR）でそのまま呼べる。

`attachInteractiveHandlers` など、DOM 要素を受け取る関数はブラウザ（または DOM 実装のある環境）でだけ使う。

### 検証とエスケープ

`render()` は文書を検証しない。意味の正しさは、利用者が `validateSKAMDocument` で確かめる。不正な文書の値は、エスケープするか、許可リストで既定値に置き換える。

不正なオプションは `TypeError` になる (`validateRenderOptions` / `validateCSSOptions`)。

### 読み層とアクセシビリティ

読み層 (支援技術向けの層) は、`readings` に読みがない場合、白文 (原文) になる。白文は、ブロックの間に半角空白を 1 つ入れる (`'display'` と同じ区切り)。`includeReadingLayer: false` にすると、読み層を出さない。この場合、表示層が `aria-hidden` であるため、支援技術には何も読まれない。内容がない読み層は出力から省く。

読み層を画面から隠す宣言は `!important` で出る。既定の `@layer` ありでは、ページの CSS が `.skam-reading` に `position` や `min-width` を書いても、読み層は画面に出ない。`useLayer: false` のときは、ページが `!important` で上書きすると負けうる。読み層は画面から隠すだけで、DOM には残る。答えを隠す用途は「出題に使うとき」の節に従う。

`displayLang` は、表示層の `lang` だけを変える。

`readingLayerSource` (`@experimental`) で、読み層の出どころを選べる。

- `'readings'` (既定): 作者が書いた読み (`yomiage` → `kakikudashi`)。無ければ白文。**`profile` で隠した注記も、読み下しとして読み上げる。**
- `'display'`: 表示層と同じ `profile` で解決した、画面に見えている注記だけを言葉にする。`readings` も白文も参照しない。

`'display'` の言葉は `accessibleLabels` (`@experimental`) で上書きできる。注記の種類ごとに `(note) => string` を渡す。空文字・例外・string 以外を返した注記は読み上げない。返した文字列は HTML エスケープされる。読み上げの言葉は 0.x のマイナーリリースで変わりうる。

<!-- doctest:typecheck -->

```typescript
import { render } from '@kanbun-skam/skam-html-renderer';
import type { SKAMDocument } from '@kanbun-skam/skam';

declare const doc: SKAMDocument;

const { html } = render(doc, {
  profile: { base: 'learningBasic' },
  readingLayerSource: 'display',
  accessibleLabels: { kaeri: (note) => `返り点 ${note.value}` },
});
```

読み上げの構造と文字列は、`@kanbun-skam/skam/rendering` の `describeAnnotationIR` / `formatAccessibleText` (`@experimental`) でも作れる。

### 出題に使うとき

教材の出題画面のように注記の一部を隠すときは、次の 4 点に従う。

1. `profile` は `{ base, overrides }` の形で書き、**必ず** `readingLayerSource: 'display'` と併用する。部分指定はキーを書き忘れると full 側に倒れる。
2. 既定の `'readings'` は、隠した注記を読み下しとして読み上げる。
3. Web Component では、`profile` 属性を外すと full で描かれる。
4. 保証するのは画面と読み層だけである。HTML ソースや `<script>` 内の SKAM-ML からは元の注記を取れる。答えを本当に隠したいなら、配る前に SKAM-ML から注記を除く。

<!-- doctest:typecheck -->

```typescript
import { render } from '@kanbun-skam/skam-html-renderer';
import type { SKAMDocument } from '@kanbun-skam/skam';

declare const doc: SKAMDocument;

// 送り仮名を隠した出題
const quiz = render(doc, {
  profile: { base: 'learningHint', overrides: { okurigana: false } },
  readingLayerSource: 'display',
});
```

既知の制約: 読みの範囲が竪点のグループからはみ出す文書では、範囲の読みが先頭の字の読み仮名として読み上げられる。2 回目の読みが無い再読文字は、1 回目の読みが読み仮名・送り仮名として読み上げられる。

### 書字方向の指定

<!-- doctest:typecheck -->

```typescript
import { render } from '@kanbun-skam/skam-html-renderer';
import type { SKAMDocument } from '@kanbun-skam/skam';

declare const doc: SKAMDocument;

// 縦書き（デフォルト）
const vertical = render(doc, { writingMode: 'vertical' });

// 横書き
const horizontal = render(doc, { writingMode: 'horizontal' });
```

### 表示プロファイル

`profile` には 2 つの形がある。

- **部分指定**: 13 個のキーの一部を書く。**書かなかったキーは full（表示）になる**。キーの書き忘れは、隠すつもりの注記が見える側に倒れる。
- **`{ base, overrides? }`**: プリセット（`full` / `learningBasic` / `learningHint`）から出発し、`overrides` で一部を変える。この形は安定した契約で、注記を隠す用途ではこちらを使う。

2 つの形は混ぜられない。未知のキー、真偽値でない値（`'false'` など）、`null`、`{ base, okurigana: false }` のような混在は `SKAMRenderProfileError`（`TypeError` のサブクラス。下の「表示設定の誤り」）になる（Web Component では描画しない）。

<!-- doctest:typecheck -->

```typescript
import { render, PROFILES } from '@kanbun-skam/skam-html-renderer';
import type { SKAMDocument } from '@kanbun-skam/skam';

declare const doc: SKAMDocument;

// フルプロファイル（すべての要素を表示、デフォルト）
const full = render(doc, { profile: PROFILES.full });

// 学習用基本プロファイル（返り点のみ）
const basic = render(doc, { profile: PROFILES.learningBasic });

// 学習用ヒント付きプロファイル（返り点+送り仮名）
const hint = render(doc, { profile: PROFILES.learningHint });

// プリセットから 1 項目だけ外す
const noSaidoku = render(doc, {
  profile: { base: 'learningHint', overrides: { saidoku: false } },
});

// 部分指定: 書いていないキーは表示される
const partial = render(doc, { profile: { kaeriten: true, okurigana: false } });
```

`PROFILES` は凍結されている。書き換えず、`{ base, overrides }` を使う。

#### キー名

キーは次の 13 個で、`RENDER_PROFILE_KEYS`（凍結した配列）からも得られる。値が `false` のキーの注記は、画面にも `readingLayerSource: 'display'` の読み層にも出ない。

| キー        | 隠す・出す注記     |
| ----------- | ------------------ |
| `yomigana`  | 読み仮名（ルビ）   |
| `okurigana` | 送り仮名           |
| `kaeriten`  | 返り点             |
| `kutoten`   | 句読点             |
| `saidoku`   | 再読文字           |
| `okototen`  | ヲコト点           |
| `tateten`   | たて点（熟語境界） |
| `emphasis`  | 傍点・圏点         |
| `okimoji`   | 置字               |
| `joji`      | 助字               |
| `soegana`   | 添え仮名           |
| `highlight` | 傍線               |
| `ref`       | 参照識別子・注釈   |

キー名は、作者が教材に書いて使えるよう、0.x の間も改名・削除しない。互換の方針（改名するときの移行期間、キーを足すとき）は [ADR-033](https://github.com/berlysia/kanbun-annotation/blob/master/docs/decisions/adr-033-render-profile-keys-and-errors.md) にある。

- キーは minor で増えうる。増えたキーは、部分指定では表示される側に倒れる。
- プリセット（`full` / `learningBasic` / `learningHint`）の各キーの値は約束しない。minor で変わりうり、変えるときは changeset に書く。
- 出題に使うときは、`base` だけに頼らず、隠すキーを `overrides` で明示する。
- 型 `RenderProfile` は、キーが増えると広がる。13 個の値を自前でそろえて作らず、`resolveRenderProfile` の戻り値か `PROFILES` から得る。

#### 表示設定の誤り

`render` / `renderHTML`（と `resolveRenderProfile`）は、表示設定の誤りに `SKAMRenderProfileError` を投げる。`TypeError` を継承しているので、`instanceof TypeError` で受けているコードはそのまま動く。誤りの種類は `kind`、誤りのあるオブジェクトは `where`（`'profile'` か `'profile.overrides'`）、該当のキーは `key`（先頭 64 字）で読める。

| `kind`             | 場合                                               | `key`              |
| ------------------ | -------------------------------------------------- | ------------------ |
| `NOT_PLAIN_OBJECT` | `profile` や `overrides` が plain object でない    | 無い               |
| `UNREADABLE_KEY`   | キーの読み出しで例外が出た（`cause` に元の例外）   | そのキー           |
| `UNKNOWN_KEY`      | 未知のキー                                         | そのキー           |
| `NOT_BOOLEAN`      | 真偽値でない値                                     | そのキー           |
| `MIXED_BASE`       | `base` と、`base` / `overrides` 以外のキーを混ぜた | 混ざった最初のキー |
| `UNKNOWN_BASE`     | `base` が既知のプリセット名でない                  | `base`             |

- 契約は `kind` / `where` / `key` で、`message` の文言は minor で変わりうる。作者向けの文は `kind` と `key` から作る。
- `kind` と `where` の値は minor で増えうる。`kind` で分岐するときは、知らない値のための default 節を持つ。
- `key` と `message` は利用者の入力を含む。HTML に出すときはエスケープする（下の例は `textContent` を使う）。`cause` は表示や送信に使わない。
- canvas-renderer の IIFE 版（`browser-bundle`）と併用したり、iframe の中の誤りを受けたりしても、`instanceof SKAMRenderProfileError` は真になる。クラスに `Symbol.for('@kanbun-skam/skam/SKAMRenderProfileError')` の目印を持たせ、それで判別している。ただし、別の realm（iframe）の誤りは `instanceof TypeError` が偽になる。`structuredClone` や `postMessage` で複製した誤りは偽になる。目印を手で付けた object も真になるので、`instanceof` は型の判別であって、中身が安全だという保証ではない。

<!-- doctest:typecheck -->

```typescript
import { render, SKAMRenderProfileError } from '@kanbun-skam/skam-html-renderer';
import type { SKAMDocument } from '@kanbun-skam/skam';

declare const doc: SKAMDocument;
declare const authorProfile: unknown; // 作者が教材に書いた表示設定
declare const messageArea: HTMLElement;

function describeProfileError(error: SKAMRenderProfileError): string {
  switch (error.kind) {
    case 'UNKNOWN_KEY':
      return `「${error.key ?? ''}」は表示設定のキーではありません`;
    case 'NOT_BOOLEAN':
      return `「${error.key ?? ''}」には true か false を書いてください`;
    case 'UNKNOWN_BASE':
      return 'base には full / learningBasic / learningHint のどれかを書いてください';
    default:
      // 知らない kind (minor で増えうる) も受ける
      return '表示設定に誤りがあります';
  }
}

try {
  render(doc, { profile: authorProfile as never });
} catch (error) {
  if (error instanceof SKAMRenderProfileError) {
    messageArea.textContent = describeProfileError(error);
  } else {
    throw error;
  }
}
```

### スタイルのカスタマイズ

<!-- doctest:typecheck -->

```typescript
import { render, getDefaultStyles, generateCSS } from '@kanbun-skam/skam-html-renderer';
import type { SKAMDocument } from '@kanbun-skam/skam';

declare const doc: SKAMDocument;

// CSS 生成オプション
const css = generateCSS({
  writingMode: 'vertical', // 'vertical' | 'horizontal' | 'both'
  inline: false, // インラインモード
  useLayer: true, // @layer でラップ（デフォルト: true）
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
  --skam-font-family: '游明朝', serif;
}
```

#### 公開 CSS Variables 一覧

| カテゴリ       | 変数名                    | デフォルト値   | 用途                       |
| -------------- | ------------------------- | -------------- | -------------------------- |
| **色**         | `--skam-color-fg`         | `currentColor` | 前景色（テキスト、傍線等） |
|                | `--skam-color-kaeriten`   | `currentColor` | 返り点の色                 |
|                | `--skam-color-ruby`       | `currentColor` | ルビ・送り仮名の色         |
|                | `--skam-color-emphasis`   | `currentColor` | 傍点の色                   |
| **フォント**   | `--skam-font-family`      | `inherit`      | 本文フォント               |
|                | `--skam-font-family-ruby` | `inherit`      | ルビ・送り仮名フォント     |
| **サイズ**     | `--skam-glyph-size`       | `1em`          | 基準グリフサイズ           |
|                | `--skam-ruby-font-size`   | `0.5em`        | ルビ・送り仮名サイズ       |
| **余白・間隔** | `--skam-line-height`      | `2`            | 行間                       |
|                | `--skam-letter-spacing`   | `0`            | 字間                       |

### コピー可能範囲の制御

デフォルトでは、テキスト選択・コピー時に**本文のみ**がコピーされ、返り点・送り仮名・ルビなどの注記はコピーされません。

#### API での指定

<!-- doctest:typecheck -->

```typescript
import { render } from '@kanbun-skam/skam-html-renderer';
import type { SKAMDocument } from '@kanbun-skam/skam';

declare const doc: SKAMDocument;

// デフォルト: 本文のみコピー可能
const bodyOnly = render(doc);

// 読み仮名もコピー可能
const withRuby = render(doc, { copyable: ['ruby'] });

// 複数指定
const withRubyAndOkurigana = render(doc, { copyable: ['ruby', 'okurigana'] });

// 全てコピー可能
const everything = render(doc, { copyable: 'all' });
```

#### 生成される HTML

```html
<!-- デフォルト: 本文のみコピー可能 -->
<div class="skam-document">...</div>

<!-- 読み仮名もコピー可能 -->
<div class="skam-document" data-copyable="ruby">...</div>

<!-- 複数指定（スペース区切り） -->
<div class="skam-document" data-copyable="ruby okurigana">...</div>

<!-- 全てコピー可能 -->
<div class="skam-document" data-copyable="all">...</div>
```

#### 指定可能な値

| 値          | 対象             |
| ----------- | ---------------- |
| `ruby`      | 読み仮名（ルビ） |
| `okurigana` | 送り仮名         |
| `soegana`   | 添え仮名         |
| `kaeriten`  | 返り点           |
| `okototen`  | ヲコト点         |
| `all`       | 全ての注記要素   |

**Note:** `data-copyable` 属性は CSS で制御されるため、HTML を直接編集して属性を変更することで、ビルド後でも動的に切り替えられます。

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

<!-- doctest -->

```typescript
import { generateCSS } from '@kanbun-skam/skam-html-renderer';

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

| Mark Type   | 対応状況                    |
| ----------- | --------------------------- |
| `kaeri`     | ✅                          |
| `okurigana` | ✅                          |
| `yomigana`  | ✅                          |
| `soegana`   | ✅                          |
| `okimoji`   | 分類のみ (既定の見た目なし) |
| `joji`      | 分類のみ (既定の見た目なし) |
| `kutoten`   | ✅                          |
| `emphasis`  | ✅                          |
| `saidoku`   | ✅                          |
| `tateten`   | ✅                          |
| `highlight` | ✅                          |
| `ref`       | ✅                          |
| `okototen`  | ✅                          |

okototen は格子の外 (座標が範囲外) の場合は描画しない。

## 出力形式

<!-- doctest:skip 型の一覧 -->

```typescript
interface RenderResult {
  /** レンダリングされた HTML 文字列 */
  html: string;
  /** 適用すべき CSS 文字列 */
  css: string;
}
```

## 内部アーキテクチャ

### モジュール構成と依存方向

依存方向は `shared → display → API` の一方向に固定されています。

```
API層 (renderer.ts)
  ├── 公開 API (render, renderHTML, generateCSS)
  ├── option 正規化
  └── CSS 生成呼び出し (styles.ts)
       │
       ▼
display オーケストレータ層 (render-display-layer.ts)
  ├── group 解決 (tateten/highlight/range marks)
  ├── Pass 1/Pass 2 呼び出し
  └── block 単位合成
       │
       ▼
display 実装層
  ├── Pass 1: build-render-tree.ts (tokens+marks → BlockRenderTree)
  ├── Pass 2: render-tree.ts (BlockRenderTree → HTML string)
  └── token-renderer.ts (個別トークンの HTML 生成)
       │
       ▼
共通基盤層
  ├── render-config.ts (RenderProfile, RubyMethod, PROFILES)
  ├── html-utils.ts (escapeHtml, shouldApplyTateChuYoko 等)
  ├── mark-utils.ts (getBlockStartMarks 等)
  └── render-tree-types.ts (IR 型定義)
```

### CSS Grid 命名規約

`styles.ts` のグリッドコンテナは `grid-template-areas` で名前付き配置を使用しています。

| 領域名       | 用途                          |
| ------------ | ----------------------------- |
| `ruby`       | ルビ注記（読み仮名）          |
| `ruby-over`  | 再読文字の上側ルビ            |
| `ruby-under` | 再読文字の下側ルビ            |
| `base`       | 本文文字                      |
| `suffix`     | suffix-row（改行排除用）      |
| `emphasis`   | 傍点行                        |
| `okuri`      | 送り仮名（suffix-row 内）     |
| `kutoten`    | 句読点（suffix-row 内）       |
| `kaeri`      | 返り点（suffix-row 内）       |
| `saidoku`    | 再読送り仮名（suffix-row 内） |

### baseline 補正契約

`calibrate.ts` が Chromium の inline-grid baseline バグを実測検出し、
`--{prefix}-grid-baseline-fix: 1` を設定します。
各グリッドコンテナの `vertical-align` がこの変数を参照して補正値を算出します。

## 0.1 からの移行

0.1.x からの変更のうち、このパッケージに関わるものです。ID は全体の移行表と共通です。

| ID  | 旧挙動                                                                                                                                                                                                                    | 新挙動                                                                                                                                                                                                                                                                                                                                                                                                                                         | 回避策                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M01 | npm には 0.1.0 から `@kanbun-skam/*` の名前で公開している (`@kanbun/*` は npm に公開していない)。リポジトリの CHANGELOG には、未公開の 0.1.1 として `@kanbun` からの改名が書かれていた。                                  | 名前は変わらない。CHANGELOG から未公開の 0.1.1 の節を消し、0.1.0 の次を 0.2.0 とした。                                                                                                                                                                                                                                                                                                                                                         | 不要。                                                                                                                                                              |
| M12 | 不正な値を黙って受け入れた (CSS や canvas の値として使われた)。                                                                                                                                                           | `render` / `renderHTML` / `generateCSS` / `getDefaultStyles` / `calibrateGridBaseline` (html) と `render` (canvas) が、不正なオプションで `TypeError` を投げる。html-renderer では、検査だけを `validateRenderOptions` / `validateCSSOptions` で単独でも呼べる。                                                                                                                                                                               | html-renderer では、呼び出す前にオプションを `validateRenderOptions` / `validateCSSOptions` で検査するか。どちらのパッケージでも、`TypeError` を捕捉する。          |
| M13 | `kaeri.value`、`emphasis.style`、`classPrefix` などをそのまま HTML / CSS に出力した。                                                                                                                                     | エスケープするか、許可リストに合うものだけを出力する。許可リストに合わない値は、`emphasis.style` では既定の `filled dot` に置き換え、オプションでは M12 の `TypeError` にする。                                                                                                                                                                                                                                                                | 出力文字列を比較・保存している場合は、0.2.0 の出力で取り直す。                                                                                                      |
| M14 | 任意の 1 文字をそのまま出力した。                                                                                                                                                                                         | `"\2605 "` のような CSS の文字列で出力する。表示は変わらないが、出力の文字列は変わる。                                                                                                                                                                                                                                                                                                                                                         | 出力文字列を比較・保存している場合は、0.2.0 の出力で取り直す。                                                                                                      |
| M15 | readings のない文書では本文が支援技術から見えなかった。読み層に `aria-label` を付けた。                                                                                                                                   | readings がない文書は、読み層に白文 (本文のテキスト) を出力する。読み層に `aria-label` は付けない。                                                                                                                                                                                                                                                                                                                                            | スナップショットや VRT を取り直す。`aria-label` に依存した検索や CSS があれば、読み層の要素の内容に切り替える。                                                     |
| M16 | ref の番号が出現順と一致しない場合があった。                                                                                                                                                                              | ref の番号は本文の出現順 (注釈 IR と同じ) に振る。                                                                                                                                                                                                                                                                                                                                                                                             | スナップショットや VRT を取り直す。                                                                                                                                 |
| M22 | 表示言語を指定する手段がなかった。                                                                                                                                                                                        | html-renderer に `displayLang` オプション、web-component に `display-lang` 属性を足す。                                                                                                                                                                                                                                                                                                                                                        | 対応は要らない (非破壊の追加)。                                                                                                                                     |
| M23 | なし。                                                                                                                                                                                                                    | `skam`: `isValidEmphasisStyle`、`BLOCK_START_KAERI_HINT`、`HIGHLIGHT_STYLES`、`isValidHighlightStyle`、`resolveOkototenCell`。`skam-xml-parser`: `SKAM_ML_CONTENT_MODEL` (`@experimental`)、`ParseWarning` / `onWarning`。`skam-xml-stringify`: `SKAM_ML_CONTENT_MODEL`、`SKAM_ML_NESTING_ORDER` (どちらも `@experimental`)、`SKAMXMLStringifyError` / `StringifyLoss`。`skam-html-renderer`: `validateRenderOptions` / `validateCSSOptions`。 | 対応は要らない。`@experimental` の API は、0.x の間はマイナーリリースで値が変わりうる。                                                                             |
| M24 | 条件オブジェクトで `import` が `types` より前にあった。`skam-web-component` の `./auto` には `types` がなかった。                                                                                                         | `types` を先頭にする。`./auto` に `types` を足す。サブパスと実体は変わらない。                                                                                                                                                                                                                                                                                                                                                                 | 対応は要らない (非破壊の変更)。                                                                                                                                     |
| M27 | なし。                                                                                                                                                                                                                    | `skam` / `skam-html-renderer` / `skam-canvas-renderer`: `RENDER_PROFILES` (html と canvas では `PROFILES` の別名のまま)、`resolveRenderProfile`、`RenderProfileInput`、`RenderProfileName` (`RenderProfile` の型も skam から再 export する)。`skam-web-component`: `extractXmlFromScriptElement` (`@experimental`)。                                                                                                                           | 対応は要らない (非破壊の追加)。`@experimental` の API は、0.x の間はマイナーリリースで値が変わりうる。                                                              |
| M28 | `render` / `renderHTML` の `profile` の未知のキー (綴り違い)、真偽値でない値 (`'false'` など)、`undefined` の値を黙って受け入れた。部分指定は full に重ねたので、綴り違いのキーを無視して、隠すつもりの注記が表示された。 | `render` / `renderHTML` / `validateRenderOptions` が、`profile` の未知のキー、真偽値でない値、`undefined` の値、`null`、`base` と個別キーの混在で `TypeError` を投げる。`{ base, overrides }` の形を足す。部分指定が full に重なることは変わらない。                                                                                                                                                                                           | 真偽値で書く。値が未定義のキーは書かずに省く。注記を隠す用途では `{ base, overrides }` の形を使う。`TypeError` を捕捉する。                                         |
| M30 | `includeReadingLayer` に真偽値でない値を渡しても通った。`'false'` は truthy として扱われ、読み層が出た。                                                                                                                  | `render` / `renderHTML` / `validateRenderOptions` が、`includeReadingLayer` が指定されていて真偽値でないとき `TypeError` を投げる。                                                                                                                                                                                                                                                                                                            | `true` / `false` で渡す。                                                                                                                                           |
| M33 | `PROFILES` とその中身は書き換えられた。`RenderProfile` は html と canvas の別々の interface だった。                                                                                                                      | `PROFILES` は `RENDER_PROFILES` の別名で、深く凍結される (書き換えは、strict mode で `TypeError`)。型は readonly になる。`RenderProfile` は `@kanbun-skam/skam/rendering` の `AIRRenderProfile` の別名で、名前での import は変わらない。                                                                                                                                                                                                       | `PROFILES` を書き換えない。変えたいときは `{ base, overrides }` を使うか、`{ ...PROFILES.full, okurigana: false }` のようにコピーする。                             |
| M37 | なし。                                                                                                                                                                                                                    | `skam`: `describeAnnotationIR`、`formatAccessibleText`、`DEFAULT_ACCESSIBLE_LABELS`、型 `AccessibleNote` / `AccessibleUnit` / `AccessibleBlock` / `AccessibleLabels` (すべて `@experimental`)。`skam-html-renderer`: `readingLayerSource` / `accessibleLabels` オプションと `AccessibleLabels` 型 (`@experimental`)。`skam-web-component`: `reading-layer-source` 属性 (`@experimental`)。                                                     | 対応は要らない (追加。既定の挙動は変わらない)。`@experimental` の API は、0.x の間はマイナーリリースで値が変わりうる。読み上げの言葉も 0.x のマイナーで変わりうる。 |

全体の移行表 (対象パッケージ、依存の更新を含む): https://github.com/berlysia/kanbun-annotation/blob/master/docs/migration-0.1-to-0.2.md

## 関連パッケージ

- [@kanbun-skam/skam](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam) - 型定義・バリデーター
- [@kanbun-skam/skam-xml-parser](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-xml-parser) - SKAM-ML/XML パーサー

## Playground

インタラクティブなデモ: [https://berlysia.github.io/kanbun-annotation/](https://berlysia.github.io/kanbun-annotation/)

## ライセンス

MIT
