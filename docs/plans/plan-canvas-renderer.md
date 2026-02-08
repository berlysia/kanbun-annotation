# Plan: @kanbun/skam-canvas-renderer

<!-- validated -->

関連 ADR: [ADR-012](../decisions/adr-012-canvas-renderer.md)

## Context

既存の `@kanbun/skam-html-renderer` は HTML+CSS による漢文レンダリングを提供するが、以下の用途には不向き:

- **画像エクスポート**: PNG/JPEG として共有・印刷・教材生成
- **高パフォーマンス表示**: DOM操作なしの高速描画
- **カスタム描画制御**: HTML/CSSでは困難な精密座標制御

Canvas API を使った独立パッケージとして `@kanbun/skam-canvas-renderer` を新設する。

**対象環境**: ブラウザ + Node.js (node-canvas)
**インタラクティブ機能**: 不要（静的描画のみ）
**既存 HTML renderer との関係**: 完全独立（コード共有なし）

---

## Architecture

### 3-Pass レンダリングパイプライン

```
SKAMDocument + CanvasRenderOptions
       |
  Pass 1: Resolve & Group (render-tree.ts)
       - @kanbun/skam ユーティリティで mark をトークンに解決
       - tateten/highlight/range mark のグルーピング
       -> CanvasRenderTree
       |
  Pass 2: Measure & Layout (layout.ts)
       - ctx.measureText() でテキスト計測
       - 縦書き: 列レイアウト / 横書き: 行レイアウト
       - 各要素に絶対座標 (x, y) を割り当て
       -> DocumentLayout
       |
  Pass 3: Draw (draw.ts)
       - DocumentLayout を走査して canvas draw calls を発行
       - 描画順: 背景 -> highlight線 -> base text -> annotations
       -> 描画済み Canvas
```

### 物理レイアウトモデル（縦書き）

漢文の標準レイアウト。各文字スロット:

```
[saidoku2] [kaeri] [kutoten] [okuri/soegana]  BASE  [ruby/yomigana] [emphasis]
 LEFT <--                                    CENTER                --> RIGHT
```

- 右: ruby (読み仮名)、emphasis (傍点)
- 中央: 本文文字
- 左: suffix 領域 (送り仮名、句読点、返り点、再読第2形)

列は右→左へ配置。列内は上→下。

**根拠**: HTML renderer の `styles.ts` で確認済み:

- `ruby-position: over` → 縦書きでは右側
- `text-emphasis-position: right` → 右側
- suffix-row grid: okuri(row1) → kutoten(row2) → kaeri(row3) → saidoku2(row4)、縦書きでは左側に配置

### Canvas コンテキスト抽象化

`CanvasRenderingContext2D` のサブセットインターフェースを定義。ブラウザ Canvas、node-canvas、OffscreenCanvas すべてがネイティブ適合するため、アダプタ不要。

**注意**: `TextMetrics` は `width` のみ必須とし、`actualBoundingBoxAscent/Descent` は利用可能なら使用、なければ fontSize からフォールバック計算する設計にする（node-canvas の実装差に対応）。

```typescript
interface CanvasRenderingContext2DLike {
  font: string;
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  textBaseline: CanvasTextBaseline;
  textAlign: CanvasTextAlign;
  globalAlpha: number;
  fillText(text: string, x: number, y: number): void;
  strokeText(text: string, x: number, y: number): void;
  measureText(text: string): TextMetrics;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  stroke(): void;
  fill(): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  scale(x: number, y: number): void;
  setLineDash(segments: number[]): void;
  clearRect(x: number, y: number, w: number, h: number): void;
}
```

`node-canvas` はオプション依存。ユーザーが `createCanvas` ファクトリを提供する方式:

```typescript
import { renderToBuffer } from '@kanbun/skam-canvas-renderer';
import { createCanvas } from 'canvas';
const buffer = renderToBuffer(doc, { createCanvas, format: 'png' });
```

---

## Public API

```typescript
// メイン描画
function render(doc: SKAMDocument, canvas: CanvasLike, options?: CanvasRenderOptions): void;

// サイズ計測（描画なし）
function measure(
  doc: SKAMDocument,
  ctx: CanvasRenderingContext2DLike,
  options?: MeasureOptions
): DocumentDimensions;

// ブラウザ用画像エクスポート
function renderToDataURL(
  doc: SKAMDocument,
  canvas: CanvasLike,
  options?: RenderToDataURLOptions
): string;

// Node.js用バッファエクスポート
function renderToBuffer(doc: SKAMDocument, options: RenderToBufferOptions): Buffer;

// プロファイル定数
const PROFILES: { full: RenderProfile; learningBasic: RenderProfile; learningHint: RenderProfile };
```

### CanvasRenderOptions

```typescript
interface CanvasRenderOptions {
  writingMode?: 'vertical' | 'horizontal'; // default: 'vertical'
  profile?: Partial<RenderProfile>;
  fontSize?: number; // default: 24
  fontFamily?: string; // default: 'serif'
  rubyRatio?: number; // default: 0.5
  lineHeight?: number; // default: 2.0 (em)
  columnGap?: number; // default: 16 (px)
  padding?: number | { top: number; right: number; bottom: number; left: number };
  backgroundColor?: string; // default: transparent
  textColor?: string; // default: '#000'
  pixelRatio?: number; // default: 1 (2 for Retina)
  autoSize?: boolean; // default: true
  maxExtent?: number; // max height (vertical) or width (horizontal) before wrapping
}
```

---

## File Structure

```
packages/skam-canvas-renderer/
  package.json
  tsconfig.json
  tsup.config.ts
  vitest.config.ts
  src/
    index.ts                # Public exports
    types.ts                # 全型定義
    canvas-context.ts       # CanvasLike, CanvasRenderingContext2DLike
    constants.ts            # Unicode定数 (kaeri, iroha, gojuon 等)
    helpers.ts              # ドメインヘルパー (kaeri変換, emphasis解決, ref書式)
    profiles.ts             # RenderProfile, PROFILES
    render-tree.ts          # Pass 1: SKAMDocument -> CanvasRenderTree
    measure.ts              # テキスト計測ユーティリティ (キャッシュ付き)
    layout.ts               # レイアウトオーケストレータ
    layout-vertical.ts      # 縦書き列レイアウト
    layout-horizontal.ts    # 横書き行レイアウト (Phase 4)
    draw.ts                 # Pass 3: DocumentLayout -> canvas draw calls
    draw-text.ts            # テキスト描画 (縦書き文字単位描画)
    draw-marks.ts           # マーク描画 (emphasis, highlight, okototen)
    renderer.ts             # オーケストレータ: measure -> layout -> draw
    __tests__/
      helpers.test.ts
      render-tree.test.ts
      measure.test.ts
      layout-vertical.test.ts
      draw.test.ts
      integration.test.ts
      recording-context.ts  # テスト用: draw call 記録コンテキスト
```

---

## Phased Implementation

### Phase 0.5: 環境検証 (Spike)

**目標**: node-canvas の TextMetrics 互換性とフォント登録手順を確認

**検証項目**:

1. node-canvas の `TextMetrics` が `actualBoundingBoxAscent/Descent` を実装しているか
2. `font` プロパティの CSS font 構文対応状況
3. `registerFont()` の使い方とCJKフォントの動作
4. ブラウザとnode-canvasでの `measureText()` 結果の差分計測

**判断**: 差分が許容範囲内か、Adapter パターンが必要かを判断

### Phase 1: Foundation + 縦書き基本 (MVP)

**目標**: 基本文字の縦書き描画 + 主要マーク5種

**対象マーク**: yomigana, okurigana, soegana, kaeri, kutoten

**成果物**:

1. パッケージ scaffold (package.json, tsconfig, tsup, vitest)
2. 型定義 + Canvas抽象化インターフェース
3. Unicode定数 + ドメインヘルパー
4. プロファイルシステム
5. Render tree 構築 (Pass 1)
6. テキスト計測 + 縦書きレイアウト (Pass 2)
7. Canvas描画 (Pass 3)
8. `render()`, `measure()` API
9. テスト（レイアウト座標検証 + RecordingContext draw call 検証）

**テスト戦略**:

- **Pass 2 (layout)**: `DocumentLayout` の座標値を直接テスト（モック measureText 使用）
- **Pass 3 (draw)**: RecordingContext で draw call シーケンスを記録・検証
- レイアウトテストとドローテストを明確に分離

### Phase 2: 残りの anchor-based マーク

**追加マーク**: okimoji, joji, emphasis, saidoku, tateten, okototen

**主要課題**:

- tateten グループ: 複合語レイアウト + セパレータ配置
- saidoku: 二重ルビ (右に第1読み、左に第2読み)
- emphasis: 文字ごとの傍点描画
- okototen: glyph-grid 座標系での点描画

### Phase 3: highlight, ref, range marks

**追加マーク**: highlight, ref + 複数トークン範囲マーク

**主要課題**:

- highlight線: 5種のスタイル (solid, dashed, dotted, wavy, double)
- wavy線: bezier curve 描画
- ref: 10種の番号書式
- 複合ルビ: 複数トークンにまたがる読み仮名

### Phase 4: 横書きモード

**追加ファイル**: `layout-horizontal.ts`

横書きは縦書きより単純:

- 左→右のテキストフロー
- ルビは上、suffix は下
- Canvas のネイティブテキスト描画を活用

### Phase 5: エクスポート + 仕上げ

- `renderToDataURL()`, `renderToBuffer()` 実装
- Block-start marks (ref/kutoten at block start)
- Reading layer (optional)
- Ref notes section

---

## Testing Strategy

| Layer            | 対象               | 手法                                                 |
| ---------------- | ------------------ | ---------------------------------------------------- |
| ドメインヘルパー | helpers.ts         | 純粋関数の入出力テスト                               |
| Render tree      | render-tree.ts     | ツリー構造の形状検証                                 |
| レイアウト       | layout-vertical.ts | モック measureText で座標検証                        |
| 描画             | draw.ts            | RecordingContext で draw call 記録・スナップショット |
| 統合             | 全パイプライン     | 代表的 SKAM ドキュメントでの end-to-end              |

**RecordingContext**: `measureText()` は CJK 文字に対して固定値を返し、テスト結果を決定論的にする。

**vitest 設定**: `environment: 'node'`（DOM不要、happy-dom不要）

---

## Key Risks & Mitigations

| リスク                                | 対策                                                                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| フォントメトリクスの環境差            | Phase 0.5 で計測。`measureText()` 相対で固定値仮定を避ける。`actualBoundingBox*` がない場合は fontSize フォールバック |
| 縦書きテキスト描画の複雑さ            | CJK文字は `fillText()` で1文字ずつ描画、ラテン文字のみ `rotate()`                                                     |
| ルビ配置の精度                        | `measureText()` で幅計算 → ベース文字中央にセンタリング                                                               |
| node-canvas 依存問題                  | ハード依存なし。ユーザーが `createCanvas` を提供。フォント登録 (`registerFont`) はドキュメントで案内                  |
| node-canvas の TextMetrics 互換性     | Phase 0.5 で検証。必要なら Adapter パターンで環境差を吸収                                                             |
| HTML renderer との render tree 乖離   | 同じ `@kanbun/skam` 型を消費。共通テストフィクスチャで検証                                                            |
| 長文での1文字ずつ描画のパフォーマンス | Phase 1 で100文字規模のベンチマーク実施。問題あればバッチ描画を検討                                                   |

---

## Reference Files

- `packages/skam-html-renderer/src/renderer.ts` - ドメインヘルパー参照 (kaeri unicode, emphasis解決, ref書式)
- `packages/skam-html-renderer/src/build-render-tree.ts` - render tree 構築ロジック参照
- `packages/skam-html-renderer/src/render-tree-types.ts` - render tree ノード型参照
- `packages/skam-html-renderer/src/styles.ts` - 物理レイアウトモデル参照 (suffix-row構造, 各マーク位置)
- `packages/skam/src/index.ts` - SKAM型定義 + ユーティリティ

---

## Verification

1. `pnpm build` - 全パッケージビルド成功
2. `pnpm --filter @kanbun/skam-canvas-renderer test` - テスト全パス
3. `pnpm typecheck` - 型チェック成功
4. RecordingContext テストで基本的な SKAM ドキュメント描画を検証
5. ブラウザで実際の Canvas に描画して視覚確認（playground 統合は将来）
