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

```typescript
import { measure } from '@kanbun-skam/skam-canvas-renderer';

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

```typescript
import { render, PROFILES } from '@kanbun-skam/skam-canvas-renderer';

// フルプロファイル（すべての要素を表示、デフォルト）
render(doc, canvas, { profile: PROFILES.full });

// 学習用基本プロファイル（返り点のみ）
render(doc, canvas, { profile: PROFILES.learningBasic });

// 学習用ヒント付きプロファイル（返り点+送り仮名）
render(doc, canvas, { profile: PROFILES.learningHint });
```

### フォントの読み込み

```typescript
import { loadDefaultFont, DEFAULT_FONT_FAMILY } from '@kanbun-skam/skam-canvas-renderer';

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

## 関連パッケージ

- [@kanbun-skam/skam](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam) - 型定義・バリデーター
- [@kanbun-skam/skam-html-renderer](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-html-renderer) - HTML レンダラー
- [@kanbun-skam/skam-web-component](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-web-component) - Web Component ラッパー

## ライセンス

MIT
