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
  const { render, measure, PROFILES } = SkamCanvasRenderer;
</script>
```

## レンダリング対応

全 13 種の SKAM v0.1 mark type をサポート:

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
| `saidoku`   | ✅       |
| `tateten`   | ✅       |
| `highlight` | ✅       |
| `ref`       | ✅       |
| `okototen`  | ✅       |

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
