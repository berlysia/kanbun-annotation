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
  LinebreakMark,
  LinebreakPlacementIssue,
  MarkInput,
  MarkUpdates,
  AddMarkResult,
} from '@kanbun-skam/skam';
```

### バリデーション

```typescript
import { validateSKAMDocument, isSKAMDocument, assertSKAMDocument } from '@kanbun-skam/skam';
import type { ValidationWarning, ValidationWarningKind } from '@kanbun-skam/skam';
import { KAERI_MULTI_CHARACTER } from '@kanbun-skam/skam';
import { getLinebreakPlacementIssues } from '@kanbun-skam/skam';
```

`getLinebreakPlacementIssues(doc)` は、置けない場所にある `linebreak` を `marks[]` の添字をキーにして返す（`Map<number, LinebreakPlacementIssue>`）。理由は `'block-start'`、`'block-end'`、`'inside-unit'`、`'duplicate'` の 4 つで、1 つの `linebreak` に付くのは最初に当たる 1 つだけ。置ける `linebreak` は含まれない。validator はこの結果を `INVALID_LINEBREAK`（`path` は `marks[i].position`）にし、描画は同じ結果で置けない `linebreak` を無視する。

`valid: true` の結果は、警告があるときだけ `warnings?: ValidationWarning[]` を持つ（無いときはキーごと無い）。`ValidationWarning` は `kind`、`path`、`message` を持つ。`message` は固定の文で、入力由来の値を含まない。

- `KAERI_MULTI_CHARACTER`: 1 つの kaeri の `value` が複数の字。0.4.0 で同じコードの誤りになる。`path` は `marks[i].value`
- `ValidationWarningKind` に値を足すのは minor の変更

### 返り点の変換

```typescript
import { splitMultiCharacterKaeri } from '@kanbun-skam/skam';

// 複数の字の kaeri を、同じ位置の 1 字ずつの注記に分けた新しい文書を返す
const migrated = splitMultiCharacterKaeri(doc, { idGenerator });
```

1 つ目の注記は元の `id` と `ext` を引き継ぎ、2 つ目以降は新しい `id` を持ち `ext` を持たない。冪等で、渡した文書は書き換えない。値に Kanbun の字以外を含む kaeri は変えない。0.4.0 の後も残る。

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
  joinKaeriValues, // 同じ位置の kaeri を marks[] の順につないだ値にする
  // 傍点
  resolveEmphasisCharacter,
  isEmphasisKeyword,
  // Ref
  formatRefIndex,
  resolveRefValues,
  // マークグルーピング
  getTatetenGroups,
  getHighlightGroups,
  getRangeMarkGroups,
  // マーク検索
  createMarkLookup,
  getMarksForToken,
  // ブロック
  groupTokensByBlock,
  // Block-start marks
  getBlockStartMarks,
  // 表示設定（検証つき）
  RENDER_PROFILES,
  resolveRenderProfile,
  // AIR Resolver
  buildAnnotationIR,
  // 読み上げ用テキスト（@experimental）
  describeAnnotationIR,
  formatAccessibleText,
  DEFAULT_ACCESSIBLE_LABELS,
  // 改行制御
  canBreakBefore,
} from '@kanbun-skam/skam/rendering';
import type {
  RangeMarkGroup,
  MarkLookup,
  TokenMarks,
  AIRRenderProfile,
  RenderProfile,
  RenderProfileInput,
  RenderProfileName,
  AIRTrailingMark,
  AIRRangeInfo,
  AIRTokenSlots,
  AIRTokenNode, // lineBreakAfter?: true
  AIRTatetenSeparator,
  AIRTatetenGroupNode, // lineBreakAfter?: true
  AIRHighlightGroupNode,
  AIRBlockStartRef,
  AIRBlockStartKutoten,
  AIRBlock,
  AIRBlockChild,
  AIRDocument,
  AccessibleNote, // @experimental
  AccessibleUnit, // @experimental
  AccessibleBlock, // @experimental
  AccessibleLabels, // @experimental
} from '@kanbun-skam/skam/rendering';
```

`createMarkLookup(marks, tokenGroups)` は注記の索引を作り、字の id からその字に付く注記を種別ごとに引く関数を返す。`tokenGroups` は描く字の配列の列で、`groupTokensByBlock(blocks, tokens).map((g) => g.tokens)` を渡す。範囲の注記の間の字は、`tokens[]` の順序ではなくこの列の中の位置で決まる。`getMarksForToken(tokenId, marks, allTokens)` は呼ぶたびに索引を作るので、字ごとに引くときは `createMarkLookup` を使う。`@kanbun-skam/skam` の `getMarksForToken(doc, tokenId)` は、編集の操作のための別の関数である。

読み上げ用テキスト（`describeAnnotationIR` / `formatAccessibleText` / `DEFAULT_ACCESSIBLE_LABELS`）はすべて `@experimental`。AIR から「画面に見えている注記だけ」を言葉にする。`formatAccessibleText` は生のテキストを返し、HTML のエスケープをしない。読み上げの言葉は 0.x のマイナーで変わりうる。既知の制約として、竪点のグループからはみ出す読みの範囲（#16）は先頭の字の読み仮名として出る。2 回目の読みが無い再読文字は、1 回目の読みが読み仮名・送り仮名として出る。

## @kanbun-skam/skam-canvas-renderer

3-Pass パイプラインで SKAM ドキュメントを Canvas に描画。

```typescript
import { render, measure, PROFILES } from '@kanbun-skam/skam-canvas-renderer';

// Canvas に描画
render(doc, canvas, { writingMode: 'vertical', fontSize: 24 });

// サイズ計測のみ
const { width, height } = measure(doc, ctx);

// プロファイル: PROFILES.full | PROFILES.learningBasic | PROFILES.learningHint
// 部分指定: { profile: { kaeriten: true } }（書かなかったキーは full になる）
// プリセットから外す: { profile: { base: 'learningHint', overrides: { saidoku: false } } }
// 不正な値（未知のキー、真偽値でない値、base と個別キーの混在）は TypeError
```

## @kanbun-skam/skam-xml-parser

```typescript
import { parse } from '@kanbun-skam/skam-xml-parser';

// XML → SKAM JSON
const doc = parse(xmlString);
```

`onWarning` には、未知の要素（`UNKNOWN_ELEMENT`）のほかに、ハイフンで連結した `kind` の `skam:kaeri`（`KAERI_MULTI_CHARACTER`）の警告が届く。後者は `validate` の値に関係なく 1 要素につき 1 回出る。validator の `warnings` は `onWarning` に流れない。

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
// 部分指定は full に重なる（書かなかったキーは表示される）。注記を隠す用途では
// { profile: { base: 'learningHint', overrides: { saidoku: false } } } の形を使う。
// 不正な値は TypeError（Web Component の profile 属性では描画しない）
// 読み層の出どころ（@experimental）: { readingLayerSource: 'readings' | 'display' }
//   'display' は profile で見えている注記だけを言葉にする（readings も白文も参照しない）。
//   言葉の上書き: { accessibleLabels: { kaeri: (note) => '...' } }
//   Web Component では `accessibleLabels` プロパティで渡す。
//   出題など注記を隠す用途では { base, overrides } の profile と 'display' を併用する

// ブラウザ環境: インタラクティブイベントハンドラ
import { attachInteractiveHandlers } from '@kanbun-skam/skam-html-renderer';

// ブラウザ環境: inline-grid baseline 補正
import { calibrateGridBaseline } from '@kanbun-skam/skam-html-renderer';
```
