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
import { KAERI_MULTI_CHARACTER, LEGACY_EXT, LEGACY_EXT_REGISTERED_NAME } from '@kanbun-skam/skam';
import { getLinebreakPlacementIssues } from '@kanbun-skam/skam';
```

`getLinebreakPlacementIssues(doc)` は、置けない場所にある `linebreak` を `marks[]` の添字をキーにして返す（`Map<number, LinebreakPlacementIssue>`）。理由は `'block-start'`、`'block-end'`、`'inside-unit'`、`'duplicate'` の 4 つで、1 つの `linebreak` に付くのは最初に当たる 1 つだけ。置ける `linebreak` は含まれない。validator はこの結果を `INVALID_LINEBREAK`（`path` は `marks[i].position`）にし、描画は同じ結果で置けない `linebreak` を無視する。

`valid: true` の結果は、警告があるときだけ `warnings?: ValidationWarning[]` を持つ（無いときはキーごと無い）。`ValidationWarning` は `kind`、`path`、`message` を持つ。`message` は固定の文で、入力由来の値を含まない。

- `KAERI_MULTI_CHARACTER`: 1 つの kaeri の `value` が複数の字。0.4.0 で同じコードの誤りになる。`path` は `marks[i].value`
- `LEGACY_EXT`: `extensions` を持たない文書の、オブジェクトの `ext`（文書、readings、ブロック、token、注記、derivations。空のオブジェクトも含む）。`ext` 1 つにつき 1 件。0.4.0 で同じコードの誤りになる。`path` は `marks[i].ext` など
- `LEGACY_EXT_REGISTERED_NAME`: `LEGACY_EXT` のうち、`ext` のキーが登録済みの拡張の名前と同じもの。宣言の書き忘れの疑い。`path` は `marks[i].ext.edu` など。0.4.0 では無くなる（`LEGACY_EXT` の誤りが同じ所を指す）
- `ValidationWarningKind` に値を足すのは minor の変更

### JSON Schema

```typescript
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const skamSchema = require('@kanbun-skam/skam/schema/skam.schema.json');
const eduSchema = require('@kanbun-skam/skam/schema/ext-edu.schema.json');
```

文書の JSON Schema（2020-12）。`$id` は `urn:kanbun-skam:schema:skam-0.1` と `urn:kanbun-skam:schema:ext-edu-1` で、取りに行かない。検証器に 2 つを登録してから `skam.schema.json` で検証する（例: Ajv の `Ajv2020` に `addSchema(eduSchema)` してから `compile(skamSchema)`）。正は `validateSKAMDocument` で、schema は構造の規則だけを写し、それより緩い（SKAM-draft §11.4）。信頼できない入力は `validateSKAMDocument` に通す。

### 書記素

```typescript
import { splitGraphemes } from '@kanbun-skam/skam';
```

`splitGraphemes(text)` は、文字列を拡張書記素クラスタ（`Intl.Segmenter` の `granularity: 'grapheme'`）の配列に分ける。parser の token、stringify の `MULTI_GRAPHEME_TOKEN`、html と canvas の字数は、この分け方を使う。`Intl.Segmenter` の無い実行環境では、呼ぶと `TypeError`（読み込むだけなら誤りにならない）。

### 言語タグ

```typescript
import { isLanguageTag } from '@kanbun-skam/skam';
```

`isLanguageTag(value)` は、`value` が文字列で、英字 2〜8 字に `-` で区切った英数字 1〜8 字の部分が続く形（例 `ja`、`lzh`、`zh-Hant`）なら true を返す型ガード。登録されたサブタグかは確かめない。validator は文書の `lang` をこの形で検査し（文字列でなければ `INVALID_TYPE`、形に合わなければ `INVALID_VALUE`、`path` は `lang`）、html の描画は文書の `lang` と `displayLang` をこの形に合うときだけ属性に出す。

### 拡張

```typescript
import type { SKAMDocument, ValidateOptions } from '@kanbun-skam/skam';
import { validateSKAMDocument } from '@kanbun-skam/skam';

// 利用者の拡張の定義を足して検証する（名前が束と重なれば TypeError）
const result = validateSKAMDocument(input, { extensions: [myExtension] });
```

`SKAMDocument` は任意の `extensions`、`extensionsRequired`、`ext`、`custom` を持つ。`Token`、`Block`、`Reading`、`MarkBase` は `ext` と `custom` を持つ。宣言の誤りは `ValidationErrorKind` の `INVALID_EXTENSION`、`ext` と `custom` の上限の違反は `INVALID_VALUE`。`isSKAMDocument` と `assertSKAMDocument` も同じ第 2 引数を受け取る。

### @kanbun-skam/skam/extensions

拡張の束と型。

```typescript
import {
  defaultExtensions, // 仕様が定める拡張の定義（edu）
  extensionRegistry, // 登録簿の機械で読める表（名前、URI、必須かどうか）
  resolveExtensions, // 束に定義を足す。名前が重なれば TypeError
  isExtensionName, // 小文字の英数字で先頭が英字、xml で始まらない名前か
  assertHideQuizOption, // hideQuiz の形を検査して返す（不正は TypeError）
  isQuizHidden, // 注記が hideQuiz の隠す対象か
} from '@kanbun-skam/skam/extensions';
import type {
  SKAMExtensionDefinition,
  ExtensionOwner,
  XmlElementMarks,
  HiddenParts,
  ExtensionRegistryEntry,
  HideQuizOption,
  EduExtension,
  QuizMarkType,
} from '@kanbun-skam/skam/extensions';
```

`SKAMExtensionDefinition` は `name`、`uri`、`required` と、任意の hook（`validate`、`readXmlAttributes`、`writeXmlAttributes`、`hiddenParts`、`isHidden`、`assertOptions`）を持つ。`@kanbun-skam/skam/extensions/edu` は学習・教育用拡張の定義 `eduExtension` を単独で export する。

`HideQuizOption` は `true`（印の付いた注記をすべて隠す）か、問いの名前の配列（1〜64 字、100 個まで）。

### 返り点の変換

```typescript
import { splitMultiCharacterKaeri } from '@kanbun-skam/skam';

// 複数の字の kaeri を、同じ位置の 1 字ずつの注記に分けた新しい文書を返す
const migrated = splitMultiCharacterKaeri(doc, { idGenerator });
```

1 つ目の注記は元の `id` と `ext` を引き継ぎ、2 つ目以降は新しい `id` を持ち `ext` を持たない。冪等で、渡した文書は書き換えない。値に Kanbun の字以外を含む kaeri は変えない。0.4.0 の後も残る。

### `ext` の変換

```typescript
import { moveLegacyExtToCustom } from '@kanbun-skam/skam';

// 宣言の無い文書のすべての ext を custom に移した新しい文書と、登録済みの拡張の名前のキーの path を返す
const { document, registeredNameKeys } = moveLegacyExtToCustom(doc);
```

対象は文書、readings、ブロック、token、注記、derivations。`ext` の値は展開せずそのまま `custom` に置き、宣言は足さない。`registeredNameKeys` は、移した `ext` のうち登録済みの拡張の名前と同じキーの path（例 `marks[3].ext.edu`。値は入らない）で、拡張の値だったなら、移した後に `extensions` を宣言する。冪等で、渡した文書は書き換えない。

`TypeError` を投げる場合: 文書が `extensions` か `extensionsRequired` を持つ（空の配列も含む）、`ext` がオブジェクトでない、移す先の `custom` が既にある。メッセージには path が入り、値は入らない。

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
  // AIR Resolver（第 3 引数に拡張の定義と選択肢を渡すと、隠す所を AIR に印として付ける）
  buildAnnotationIR,
  // 拡張が決める隠す所の判定
  createHiding,
  visibleTokenMarks,
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
  AIRHiddenSlot,
  AIRTokenNode, // lineBreakAfter?: true, hiddenSlots?
  AIRTatetenSeparator, // kaeriHidden?: true
  AIRTatetenGroupNode, // lineBreakAfter?: true, hidden?: true
  Hiding,
  RenderExtensionOptions,
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

`buildAnnotationIR(doc, profile, { extensions, extensionOptions })` の `extensions` は判定に使う拡張の定義（束を含めて渡す。rendering は拡張を import しない）、`extensionOptions` は拡張の名前ごとの選択肢（例 `{ edu: { hideQuiz: true } }`）。選択肢は定義の `assertOptions` が入口で検査し、不正なら TypeError。文書が `extensions` に挙げた拡張の定義だけが判定に使われる。

`createMarkLookup(marks, tokenGroups)` は注記の索引を作り、字の id からその字に付く注記を種別ごとに引く関数を返す。`tokenGroups` は描く字の配列の列で、`groupTokensByBlock(blocks, tokens).map((g) => g.tokens)` を渡す。範囲の注記の間の字は、`tokens[]` の順序ではなくこの列の中の位置で決まる。`getMarksForToken(tokenId, marks, allTokens)` は呼ぶたびに索引を作るので、字ごとに引くときは `createMarkLookup` を使う。`@kanbun-skam/skam` の `getMarksForToken(doc, tokenId)` は、編集の操作のための別の関数である。

読み上げ用テキスト（`describeAnnotationIR` / `formatAccessibleText` / `DEFAULT_ACCESSIBLE_LABELS`）はすべて `@experimental`。AIR から「画面に見えている注記だけ」を言葉にする。`formatAccessibleText` は生のテキストを返し、HTML のエスケープをしない。読み上げの言葉は 0.x のマイナーで変わりうる。既知の制約として、竪点のグループからはみ出す読みの範囲（#16）は先頭の字の読み仮名として出る。2 回目の読みが無い再読文字は、1 回目の読みが読み仮名・送り仮名として出る。

## @kanbun-skam/skam-canvas-renderer

3-Pass パイプラインで SKAM ドキュメントを Canvas に描画。

```typescript
import { render, measure, PROFILES } from '@kanbun-skam/skam-canvas-renderer';

// Canvas に描画
render(doc, canvas, { writingMode: 'vertical', fontSize: 24 });

// 出題の印（学習・教育用拡張の ext.edu.quiz）の付いた注記を隠す（@experimental）。
// 隠した注記の場所は残り、他の字の座標は変わらない。不正な値は TypeError
render(doc, canvas, { hideQuiz: true }); // または名前の配列 { hideQuiz: ['問1'] }

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

本文は書記素クラスタ 1 つを 1 token にする（IVS、SVS、結合文字は基底の字と 1 token）。`Intl.Segmenter` が要る。

ルートの `xml:lang` は文書の `lang` になる（空の値なら `lang` を持たない）。`validate: true` なら形の誤りは `SKAMValidationError`（`path` は `lang`、位置は付かない）。`validate: false` では値をそのまま入れるので、HTML に使うときは `isLanguageTag` を通す。

`skam:meta` の子の `skam:extension` は `extensions` と `extensionsRequired` になり、拡張の名前空間の属性（例 `edu:quiz`）は `ext.<拡張の名前>` になる。選択肢 `extensions` で、既定の束に利用者の拡張の定義を足せる。知らない必須の拡張を宣言した文書は、`validate` の値にかかわらず誤り。

`onWarning` には、未知の要素（`UNKNOWN_ELEMENT`）のほかに、ハイフンで連結した `kind` の `skam:kaeri`（`KAERI_MULTI_CHARACTER`）の警告が届く。後者は `validate` の値に関係なく 1 要素につき 1 回出る。validator の `warnings` は `onWarning` に流れない。

## @kanbun-skam/skam-xml-stringify

```typescript
import { stringify } from '@kanbun-skam/skam-xml-stringify';

// SKAM JSON → XML
const xml = stringify(doc);
```

文書の `lang` が文字列なら、ルートに `xml:lang` を書く（値は escape する）。

宣言のある文書は、`skam:meta` に `skam:extension` を、ルートに拡張の名前空間を書き、拡張の値を定義の `writeXmlAttributes` で属性にする。選択肢 `extensions` で拡張の定義を足せる。書き方を知らない拡張の値は欠落 `UNKNOWN_EXTENSION` になる。2 つ以上の書記素の token は欠落 `MULTI_GRAPHEME_TOKEN` になる。

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
// 出題の印を隠す（@experimental）: { hideQuiz: true | ['問1'] }
//   印の付いた注記の中身を 1 字ずつ空白に置き換え、class と aria-hidden を付ける。
//   hideQuiz を渡して readingLayerSource を書かないときは、読み層も 'display' になる
// 表示層の lang: displayLang → 文書の lang → 'ja' の順（形に合わない値は使わない）。コンテナは 'ja'。
//   読み層は、readings の経路で白文に戻ったときだけ文書の lang を持つ
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
