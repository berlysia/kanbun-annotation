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

- `style-src` に nonce を使うページでは、`nonce` を渡すと、新しく入れる `<style>` に付く。nonce が一致しない既存の `<style>` は使い回さない。`mount` はヲコト点の位置と傍点の形を、インラインの `style` 属性でなく CSSOM で設定するので、`style-src-attr` は要らない。
- そのため `mount` が返す `html` は、`style` 属性の代わりに data 属性を持つ。この HTML を別の場所に入れたときは、下の `applyRenderedStyles` を呼ぶ。

#### `render` の文字列を CSP のページで使う (`@experimental`)

`render` は既定では、ヲコト点の位置と傍点の形をインラインの `style` 属性で出す。`style-src` に nonce だけを使うページでは、これが止められる。`inlineStyles: false` を渡すと、`style` 属性の代わりに data 属性を出す。DOM に入れた後に `applyRenderedStyles` を呼ぶと、CSSOM で値を設定する。CSSOM での設定は CSP に止められない。

<!-- doctest:typecheck -->

```typescript
import { applyRenderedStyles, render } from '@kanbun-skam/skam-html-renderer';
import type { SKAMDocument } from '@kanbun-skam/skam';

declare const doc: SKAMDocument;
declare const container: HTMLElement;

const { html } = render(doc, { inlineStyles: false });
container.innerHTML = html;
applyRenderedStyles(container);
```

- `applyRenderedStyles` を呼ばないと、ヲコト点と傍点の表示が崩れる。
- 設定するのは、ヲコト点の位置の CSS 変数 4 つと `text-emphasis-style` だけである。値は整数か、傍点のキーワードか 1 字に限り、それ以外の data 属性の値は無視する。
- CSS (`render` の `css`) は、nonce つきの `<style>` に入れる。
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
- 同じページのブラウザで SKAM-ML を `parse` するときは、`@kanbun-skam/skam-xml-parser` の `parse` にも `trustedTypesPolicy` を渡す。ブラウザ版の `parse` が使う `DOMParser.parseFromString` も、Trusted Types の対象である。同じ policy を使うと、`createHTML` は元の XML と描画の HTML の両方を受け取るので、XML はそのまま返す。

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

表示層の `lang` は、`displayLang`、文書の `lang`、`ja` の順に選ぶ。コンテナの `lang` は常に `ja` で、`displayLang` も文書の `lang` も変えない。`displayLang` は言語タグの形 (`ja`、`zh-Hant` など) でなければ `TypeError` になる。文書の `lang` は本文 (白文) の言語なので、読み層が白文に戻ったとき (`readingLayerSource` が `'readings'` で、`yomiage` も `kakikudashi` も無いとき) だけ、読み層にも付く。書き下し・`yomiage`・`'display'` の読み上げは日本語の言葉を含むので、`lang` を付けない。形が言語タグに合わない文書の `lang` は、無いものとして扱う。

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

#### 出題の印で隠す (`hideQuiz`、`@experimental`)

学習・教育用拡張（`edu`）の出題の印（注記の `ext.edu.quiz`）が付いた注記は、`hideQuiz` で隠せる。`true` は印の付いた注記をすべて、名前の配列は名前がその中にある印の注記を隠す。文書が `extensions` に `edu` を挙げているときだけ効く。

<!-- doctest:typecheck -->

```typescript
import { render } from '@kanbun-skam/skam-html-renderer';
import type { SKAMDocument } from '@kanbun-skam/skam';

declare const doc: SKAMDocument;

// 印の付いた注記をすべて隠す / 問い「問1」の注記だけ隠す
const all = render(doc, { hideQuiz: true });
const one = render(doc, { hideQuiz: ['問1'] });
```

- 隠した注記は場所を残し、中身を 1 字ずつ空白に置き換える（全角の字は U+3000、半角は U+00A0）。要素には class `{prefix}-quiz-hidden` と `aria-hidden="true"` が付く。ヲコト点は要素を出さず、置字と助字は注記が無いものとして描く。**字数は空白の数から分かる**
- `hideQuiz` を渡して `readingLayerSource` を書かないときは、読み上げ層を `'display'` にする
- **文書そのものには答えが残る。** `readingLayerSource: 'readings'` を明示した読み上げ層（`doc.readings`）にも残る。答えを渡したくない相手には、隠した描画の出力だけを渡し、文書は渡さない
- 不正な値は `TypeError`。`assertHideQuizOption` と型 `HideQuizOption` を再公開する

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

- **部分指定**: 14 個のキーの一部を書く。**書かなかったキーは full（表示）になる**。キーの書き忘れは、隠すつもりの注記が見える側に倒れる。
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

キーは次の 14 個で、`RENDER_PROFILE_KEYS`（凍結した配列）からも得られる。値が `false` のキーの注記は、画面にも `readingLayerSource: 'display'` の読み層にも出ない。

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
| `linebreak` | 改行               |

キー名は、作者が教材に書いて使えるよう、0.x の間も改名・削除しない。互換の方針（改名するときの移行期間、キーを足すとき）は [ADR-033](https://github.com/berlysia/kanbun-annotation/blob/master/docs/decisions/adr-033-render-profile-keys-and-errors.md) にある。

- キーは minor で増えうる。増えたキーは、部分指定では表示される側に倒れる。
- プリセット（`full` / `learningBasic` / `learningHint`）の各キーの値は約束しない。minor で変わりうり、変えるときは changeset に書く。
- 出題に使うときは、`base` だけに頼らず、隠すキーを `overrides` で明示する。
- 型 `RenderProfile` は、キーが増えると広がる。14 個の値を自前でそろえて作らず、`resolveRenderProfile` の戻り値か `PROFILES` から得る。

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

| Mark Type   | 対応状況                           |
| ----------- | ---------------------------------- |
| `kaeri`     | ✅                                 |
| `okurigana` | ✅                                 |
| `yomigana`  | ✅                                 |
| `soegana`   | ✅                                 |
| `okimoji`   | 分類のみ (既定の見た目なし)        |
| `joji`      | 分類のみ (既定の見た目なし)        |
| `kutoten`   | ✅                                 |
| `emphasis`  | ✅                                 |
| `saidoku`   | ✅                                 |
| `tateten`   | ✅                                 |
| `highlight` | ✅                                 |
| `ref`       | ✅                                 |
| `linebreak` | ✅ (`<br class="skam-linebreak">`) |
| `okototen`  | ✅                                 |

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

0.1.x から上げるときにやることは [移行の文書](https://github.com/berlysia/kanbun-annotation/blob/master/docs/migration-0.1-to-0.2.md) にまとめてある。

## 関連パッケージ

- [@kanbun-skam/skam](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam) - 型定義・バリデーター
- [@kanbun-skam/skam-xml-parser](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-xml-parser) - SKAM-ML/XML パーサー

## Playground

インタラクティブなデモ: [https://berlysia.github.io/kanbun-annotation/](https://berlysia.github.io/kanbun-annotation/)

## ライセンス

MIT
