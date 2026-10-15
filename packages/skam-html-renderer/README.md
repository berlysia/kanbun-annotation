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

DOM に置くときは、次の 3 手順を踏む。

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

読み層 (支援技術向けの層) は、`readings` に読みがない場合、白文 (原文) になる。`includeReadingLayer: false` にすると、読み層を出さない。この場合、表示層が `aria-hidden` であるため、支援技術には何も読まれない。内容がない読み層は出力から省く。

`displayLang` は、表示層の `lang` だけを変える。

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

2 つの形は混ぜられない。未知のキー、真偽値でない値（`'false'` など）、`null`、`{ base, okurigana: false }` のような混在は `TypeError` になる（Web Component では描画しない）。

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

| ID  | 旧挙動                                                                                                                                                                                   | 新挙動                                                                                                                                                                                                                                                                                                                                                                                                                                         | 回避策                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M01 | npm には 0.1.0 から `@kanbun-skam/*` の名前で公開している (`@kanbun/*` は npm に公開していない)。リポジトリの CHANGELOG には、未公開の 0.1.1 として `@kanbun` からの改名が書かれていた。 | 名前は変わらない。CHANGELOG から未公開の 0.1.1 の節を消し、0.1.0 の次を 0.2.0 とした。                                                                                                                                                                                                                                                                                                                                                         | 不要。                                                                                                                                                     |
| M12 | 不正な値を黙って受け入れた (CSS や canvas の値として使われた)。                                                                                                                          | `render` / `renderHTML` / `generateCSS` / `getDefaultStyles` / `calibrateGridBaseline` (html) と `render` (canvas) が、不正なオプションで `TypeError` を投げる。html-renderer では、検査だけを `validateRenderOptions` / `validateCSSOptions` で単独でも呼べる。                                                                                                                                                                               | html-renderer では、呼び出す前にオプションを `validateRenderOptions` / `validateCSSOptions` で検査するか。どちらのパッケージでも、`TypeError` を捕捉する。 |
| M13 | `kaeri.value`、`emphasis.style`、`classPrefix` などをそのまま HTML / CSS に出力した。                                                                                                    | エスケープするか、許可リストに合うものだけを出力する。許可リストに合わない値は、`emphasis.style` では既定の `filled dot` に置き換え、オプションでは M12 の `TypeError` にする。                                                                                                                                                                                                                                                                | 出力文字列を比較・保存している場合は、0.2.0 の出力で取り直す。                                                                                             |
| M14 | 任意の 1 文字をそのまま出力した。                                                                                                                                                        | `"\2605 "` のような CSS の文字列で出力する。表示は変わらないが、出力の文字列は変わる。                                                                                                                                                                                                                                                                                                                                                         | 出力文字列を比較・保存している場合は、0.2.0 の出力で取り直す。                                                                                             |
| M15 | readings のない文書では本文が支援技術から見えなかった。読み層に `aria-label` を付けた。                                                                                                  | readings がない文書は、読み層に白文 (本文のテキスト) を出力する。読み層に `aria-label` は付けない。                                                                                                                                                                                                                                                                                                                                            | スナップショットや VRT を取り直す。`aria-label` に依存した検索や CSS があれば、読み層の要素の内容に切り替える。                                            |
| M16 | ref の番号が出現順と一致しない場合があった。                                                                                                                                             | ref の番号は本文の出現順 (注釈 IR と同じ) に振る。                                                                                                                                                                                                                                                                                                                                                                                             | スナップショットや VRT を取り直す。                                                                                                                        |
| M22 | 表示言語を指定する手段がなかった。                                                                                                                                                       | html-renderer に `displayLang` オプション、web-component に `display-lang` 属性を足す。                                                                                                                                                                                                                                                                                                                                                        | 対応は要らない (非破壊の追加)。                                                                                                                            |
| M23 | なし。                                                                                                                                                                                   | `skam`: `isValidEmphasisStyle`、`BLOCK_START_KAERI_HINT`、`HIGHLIGHT_STYLES`、`isValidHighlightStyle`、`resolveOkototenCell`。`skam-xml-parser`: `SKAM_ML_CONTENT_MODEL` (`@experimental`)、`ParseWarning` / `onWarning`。`skam-xml-stringify`: `SKAM_ML_CONTENT_MODEL`、`SKAM_ML_NESTING_ORDER` (どちらも `@experimental`)、`SKAMXMLStringifyError` / `StringifyLoss`。`skam-html-renderer`: `validateRenderOptions` / `validateCSSOptions`。 | 対応は要らない。`@experimental` の API は、0.x の間はマイナーリリースで値が変わりうる。                                                                    |
| M24 | 条件オブジェクトで `import` が `types` より前にあった。`skam-web-component` の `./auto` には `types` がなかった。                                                                        | `types` を先頭にする。`./auto` に `types` を足す。サブパスと実体は変わらない。                                                                                                                                                                                                                                                                                                                                                                 | 対応は要らない (非破壊の変更)。                                                                                                                            |

全体の移行表 (対象パッケージ、依存の更新を含む): https://github.com/berlysia/kanbun-annotation/blob/master/docs/migration-0.1-to-0.2.md

## 関連パッケージ

- [@kanbun-skam/skam](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam) - 型定義・バリデーター
- [@kanbun-skam/skam-xml-parser](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-xml-parser) - SKAM-ML/XML パーサー

## Playground

インタラクティブなデモ: [https://berlysia.github.io/kanbun-annotation/](https://berlysia.github.io/kanbun-annotation/)

## ライセンス

MIT
