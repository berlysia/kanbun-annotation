# @kanbun-skam/skam-canvas-renderer

**SKAM ドキュメント**から **Canvas API** で描画するレンダラー。

画像エクスポートやサーバーサイドレンダリングに適した、3パスアーキテクチャの Canvas レンダラー。

## インストール

```bash
npm install @kanbun-skam/skam-canvas-renderer
# or
pnpm add @kanbun-skam/skam-canvas-renderer
```

## 使い方

### 基本的なレンダリング

<!-- doctest:typecheck -->

```typescript
import { render } from '@kanbun-skam/skam-canvas-renderer';
import type { SKAMDocument } from '@kanbun-skam/skam';

const doc: SKAMDocument = {
  format: 'skam@0.1',
  tokens: [
    { id: 't1', text: '學' },
    { id: 't2', text: '而' },
  ],
  blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
  marks: [{ type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'びて' }],
  readings: [],
};

const canvas = document.createElement('canvas');
render(doc, canvas, { fontSize: 24 });
```

### サイズ計測

<!-- doctest:typecheck -->

```typescript
import type { CanvasLike } from '@kanbun-skam/skam-canvas-renderer';
import { measure } from '@kanbun-skam/skam-canvas-renderer';
import type { SKAMDocument } from '@kanbun-skam/skam';

declare const doc: SKAMDocument;
declare const canvas: CanvasLike;

const ctx = canvas.getContext('2d')!;
const { width, height } = measure(doc, ctx, { fontSize: 24 });
canvas.width = width;
canvas.height = height;
```

### canvas のサイズ (`autoSize` / `pixelRatio` / `maxExtent`)

`render()` は、既定 (`autoSize: true`) で `canvas.width` / `canvas.height` を、計測した寸法 × `pixelRatio` に設定します。`autoSize: false` なら canvas のサイズには触れません。

- `maxExtent` は、デバイスピクセルで表した canvas の長い辺 (`canvas.width` / `canvas.height`) の上限です。内容がこれを超えるときだけ縮小して描きます。既定では上限を設けません
- `pixelRatio` と `maxExtent` は有限の正の数でなければならず、そうでなければ `TypeError` を投げます
- CSS 上の表示サイズ (`canvas.style`) は設定しません。表示サイズは利用者が決めてください
- ブラウザには canvas の大きさの上限 (1 辺およそ 16384〜32767 px) があり、超えると canvas が空白になります。長い文書では `maxExtent` で抑えてください
- 切り上げ (`ceil`) のため、canvas の大きさと描画の倍率は 1 デバイスピクセル未満ずれることがあります

### 表示プロファイル

`profile` には 2 つの形がある。

- **部分指定**: 13 個のキーの一部を書く。**書かなかったキーは full（表示）になる**。
- **`{ base, overrides? }`**: プリセットから出発し、`overrides` で一部を変える。この形は安定した契約で、注記を隠す用途ではこちらを使う。

未知のキー、真偽値でない値、`{ base, okurigana: false }` のような混在は、`render` / `measure` が `TypeError` を投げる。

<!-- doctest:typecheck -->

```typescript
import { render, PROFILES } from '@kanbun-skam/skam-canvas-renderer';
import type { CanvasLike } from '@kanbun-skam/skam-canvas-renderer';
import type { SKAMDocument } from '@kanbun-skam/skam';

declare const doc: SKAMDocument;
declare const canvas: CanvasLike;

// フルプロファイル（すべての要素を表示、デフォルト）
render(doc, canvas, { profile: PROFILES.full });

// 学習用基本プロファイル（返り点のみ）
render(doc, canvas, { profile: PROFILES.learningBasic });

// 学習用ヒント付きプロファイル（返り点+送り仮名）
render(doc, canvas, { profile: PROFILES.learningHint });

// プリセットから 1 項目だけ外す
render(doc, canvas, { profile: { base: 'learningHint', overrides: { saidoku: false } } });
```

`PROFILES` は凍結されている。書き換えず、`{ base, overrides }` を使う。

### フォントの読み込み

<!-- doctest:typecheck -->

```typescript
import { render, loadDefaultFont, DEFAULT_FONT_FAMILY } from '@kanbun-skam/skam-canvas-renderer';
import type { CanvasLike } from '@kanbun-skam/skam-canvas-renderer';
import type { SKAMDocument } from '@kanbun-skam/skam';

declare const doc: SKAMDocument;
declare const canvas: CanvasLike;

// デフォルトフォント（Noto Serif JP）を読み込み
await loadDefaultFont();
render(doc, canvas, { fontFamily: DEFAULT_FONT_FAMILY, fontSize: 24 });
```

### ブラウザバンドル

`<script>` タグで直接読み込み可能な IIFE バンドルも提供:

```html
<script src="node_modules/@kanbun-skam/skam-canvas-renderer/dist/index.iife.js"></script>
<script>
  const { render, measure, PROFILES } = SKAMCanvasRenderer;
</script>
```

## レンダリング対応

縦書き専用です (`writingMode` は `'vertical'` のみ)。SKAM v0.1 の全 13 種の mark type を扱います:

| Mark Type   | 対応状況                          |
| ----------- | --------------------------------- |
| `kaeri`     | ✅                                |
| `okurigana` | ✅                                |
| `yomigana`  | ✅                                |
| `soegana`   | ✅                                |
| `okimoji`   | 分類のみ (既定の見た目なし)       |
| `joji`      | 分類のみ (既定の見た目なし)       |
| `kutoten`   | ✅                                |
| `emphasis`  | ✅                                |
| `saidoku`   | ✅                                |
| `tateten`   | ✅                                |
| `highlight` | ✅                                |
| `ref`       | ✅                                |
| `okototen`  | ✅ (不正な格子座標の点は描かない) |

## 内部アーキテクチャ

3パスパイプラインで描画:

1. **Pass 1** (render-tree): `SKAMDocument` → `CanvasRenderTree` (マーク解決・スロット割り当て)
2. **Pass 2** (layout): `CanvasRenderTree` → `DocumentLayout` (座標計算)
3. **Pass 3** (draw): `DocumentLayout` → Canvas API 描画

## 0.1 からの移行

0.1.x からの変更のうち、このパッケージに関わるものです。ID は全体の移行表と共通です。

| ID  | 旧挙動                                                                                                                                                                                                  | 新挙動                                                                                                                                                                                                                                                           | 回避策                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M01 | npm には 0.1.0 から `@kanbun-skam/*` の名前で公開している (`@kanbun/*` は npm に公開していない)。リポジトリの CHANGELOG には、未公開の 0.1.1 として `@kanbun` からの改名が書かれていた。                | 名前は変わらない。CHANGELOG から未公開の 0.1.1 の節を消し、0.1.0 の次を 0.2.0 とした。                                                                                                                                                                           | 不要。                                                                                                                                                     |
| M12 | 不正な値を黙って受け入れた (CSS や canvas の値として使われた)。                                                                                                                                         | `render` / `renderHTML` / `generateCSS` / `getDefaultStyles` / `calibrateGridBaseline` (html) と `render` (canvas) が、不正なオプションで `TypeError` を投げる。html-renderer では、検査だけを `validateRenderOptions` / `validateCSSOptions` で単独でも呼べる。 | html-renderer では、呼び出す前にオプションを `validateRenderOptions` / `validateCSSOptions` で検査するか。どちらのパッケージでも、`TypeError` を捕捉する。 |
| M17 | `writingMode` に `'horizontal'` を型の上で指定できた。                                                                                                                                                  | 型は `'vertical'` だけになる。`skam-screenshot` の CLI も、canvas の経路で `horizontal` を拒否する。                                                                                                                                                             | 縦書きだけを指定する。横書きが要る場合は html-renderer を使う。                                                                                            |
| M18 | canvas の大きさを自動では設定しなかった。                                                                                                                                                               | 既定 (`autoSize: true`) で、`canvas.width` / `canvas.height` を、計測した寸法 × `pixelRatio` に設定する。`maxExtent` は、デバイスピクセルで表した長い辺の上限で、内容が超えるときだけ縮小する。                                                                  | 大きさを自分で管理する場合は `autoSize: false` を渡す。長い文書は `maxExtent` で抑える。                                                                   |
| M19 | okototen を描かなかった。                                                                                                                                                                               | okototen を描画する。グリッドの外の okototen は描かない。長方形のグリッド (`5x7` など) での縦の位置は、行数から計算する。                                                                                                                                        | 見た目が変わるので、スナップショットや VRT を取り直す。                                                                                                    |
| M24 | 条件オブジェクトで `import` が `types` より前にあった。`skam-web-component` の `./auto` には `types` がなかった。                                                                                       | `types` を先頭にする。`./auto` に `types` を足す。サブパスと実体は変わらない。                                                                                                                                                                                   | 対応は要らない (非破壊の変更)。                                                                                                                            |
| M25 | `CanvasRenderingContext2DLike` の `fillStyle` / `strokeStyle` が `string` だったため、実際の canvas と context を `render` / `measure` に渡すと型検査が通らず、`as unknown as` などのキャストが要った。 | getter を `unknown`、setter を `string` に分けた。実際の `HTMLCanvasElement` と `CanvasRenderingContext2D` を、キャストなしで渡せる。                                                                                                                            | 渡すためのキャストを外してよい。残しても動く (非破壊の変更)。                                                                                              |

全体の移行表 (対象パッケージ、依存の更新を含む): https://github.com/berlysia/kanbun-annotation/blob/master/docs/migration-0.1-to-0.2.md

## 関連パッケージ

- [@kanbun-skam/skam](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam) - 型定義・バリデーター
- [@kanbun-skam/skam-html-renderer](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-html-renderer) - HTML レンダラー
- [@kanbun-skam/skam-web-component](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-web-component) - Web Component ラッパー

## ライセンス

MIT
