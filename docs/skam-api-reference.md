# SKAM API Reference

## @kanbun-skam/skam

### 型定義

```typescript
import type {
  SKAMDocument,
  Token,
  Block,
  Mark,
  PersistedMark,
  Reading,
  MarkType,
  MarkTypeMap,
  AnchoredMark,
  PositionedMark,
  AnchoredMarkType,
  PositionedMarkType,
  MarkInput,
  MarkUpdates,
  AddMarkResult,
} from '@kanbun-skam/skam';
```

### バリデーション

```typescript
import { validateSKAMDocument, isSKAMDocument, assertSKAMDocument } from '@kanbun-skam/skam';
```

### 返り点定数（Unicode Kanbun ブロック U+3191〜U+319F）

```typescript
import { KAERI } from '@kanbun-skam/skam';
// KAERI.RE, KAERI.ICHI, KAERI.NI, KAERI.SAN, KAERI.SHI,
// KAERI.JO, KAERI.CHU, KAERI.GE, KAERI.KO, KAERI.OTSU,
// KAERI.HEI, KAERI.TEI, KAERI.TEN, KAERI.CHI, KAERI.JIN
```

### ID 生成

```typescript
import { createRandomIdGenerator, createSequentialIdGenerator } from '@kanbun-skam/skam';
import { generateId, generateMarkId } from '@kanbun-skam/skam';
```

### CRUD 操作

```typescript
import { addMark, addMarkWithResult, updateMark, replaceMark, removeMark } from '@kanbun-skam/skam';

// 複合操作
import { removeHighlightWithRef } from '@kanbun-skam/skam';
```

### Token ユーティリティ

```typescript
import { buildTokenIndexMap, getTokenIndex, getTokenByIndex } from '@kanbun-skam/skam';
```

### Mark 検索・クエリ

```typescript
import {
  getMarkById,
  getBlockForToken,
  getMarksForToken,
  getMarksForRange,
  getMarksExactRange,
  getAnchoredMarksExactRange,
  getPositionedMarksInRange,
} from '@kanbun-skam/skam';
```

### Mark 表示ユーティリティ

```typescript
import {
  getAnchorText,
  getAnchorRangeLabel,
  getMarkSortIndex,
  sortMarksByPosition,
} from '@kanbun-skam/skam';
```

### Mark 型ガード

```typescript
import {
  isAnchorBasedMark,
  isPositionBasedMark,
  isMarkType,
  filterMarksByType,
  hasMarkValue,
  isExactAnchorMatch,
} from '@kanbun-skam/skam';
```

## @kanbun-skam/skam/rendering

Canvas/HTML 両レンダラーで共有するマーク解決・変換ユーティリティ。

```typescript
import {
  // 定数
  IROHA_SEQUENCE,
  IROHA_HIRAGANA_SEQUENCE,
  GOJUON_SEQUENCE,
  GOJUON_HIRAGANA_SEQUENCE,
  KANJI_NUMBERS,
  CIRCLED_NUMBERS,
  // 返り点
  splitKaeriForTateten,
  // 傍点
  resolveEmphasisCharacter,
  // Ref
  formatRefIndex,
  resolveRefValues,
  // マークグルーピング
  getTatetenGroups,
  getHighlightGroups,
  getRangeMarkGroups,
  // マーク検索
  getMarksForToken,
  // ブロック
  groupTokensByBlock,
  // Block-start marks
  getBlockStartMarks,
  // AIR Resolver
  buildAnnotationIR,
  // 改行制御
  canBreakBefore,
} from '@kanbun-skam/skam/rendering';
import type {
  RangeMarkGroup,
  AIRRenderProfile,
  AIRTrailingMark,
  AIRRangeInfo,
  AIRTokenSlots,
  AIRTokenNode,
  AIRTatetenSeparator,
  AIRTatetenGroupNode,
  AIRHighlightGroupNode,
  AIRBlockStartRef,
  AIRBlockStartKutoten,
  AIRBlock,
  AIRBlockChild,
  AIRDocument,
} from '@kanbun-skam/skam/rendering';
```

## @kanbun-skam/skam-canvas-renderer

3-Pass パイプラインで SKAM ドキュメントを Canvas に描画。

```typescript
import { render, measure, PROFILES } from '@kanbun-skam/skam-canvas-renderer';

// Canvas に描画
render(doc, canvas, { writingMode: 'vertical', fontSize: 24 });

// サイズ計測のみ
const { width, height } = measure(doc, ctx);

// プロファイル: PROFILES.full | PROFILES.learningBasic | PROFILES.learningHint
```

## @kanbun-skam/skam-xml-parser

```typescript
import { parse } from '@kanbun-skam/skam-xml-parser';

// XML → SKAM JSON
const doc = parse(xmlString);
```

## @kanbun-skam/skam-xml-stringify

```typescript
import { stringify } from '@kanbun-skam/skam-xml-stringify';

// SKAM JSON → XML
const xml = stringify(doc);
```

## @kanbun-skam/skam-html-renderer

```typescript
import {
  render,
  renderHTML,
  generateCSS,
  getDefaultStyles,
  PROFILES,
} from '@kanbun-skam/skam-html-renderer';

// SKAM → HTML + CSS（縦書きがデフォルト）
const { html, css } = render(doc);
// 横書き: render(doc, { writingMode: 'horizontal' })
// プロファイル: PROFILES.full | PROFILES.learningBasic | PROFILES.learningHint

// ブラウザ環境: インタラクティブイベントハンドラ
import { attachInteractiveHandlers } from '@kanbun-skam/skam-html-renderer';

// ブラウザ環境: inline-grid baseline 補正
import { calibrateGridBaseline } from '@kanbun-skam/skam-html-renderer';
```
