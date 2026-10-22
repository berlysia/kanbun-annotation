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
import {
  KAERI_MULTI_CHARACTER,
  LEGACY_EXT,
  LEGACY_EXT_REGISTERED_NAME,
  ID_FORM,
  XML_UNWRITABLE_CHAR,
  SAIDOKU_READING_OVERLAP,
  SAIDOKU_MULTI_TOKEN,
  READING_OVERLAP,
} from '@kanbun-skam/skam';
import { getLinebreakPlacementIssues } from '@kanbun-skam/skam';
```

`getLinebreakPlacementIssues(doc)` は、置けない場所にある `linebreak` を `marks[]` の添字をキーにして返す（`Map<number, LinebreakPlacementIssue>`）。理由は `'block-start'`、`'block-end'`、`'inside-unit'`、`'duplicate'` の 4 つで、1 つの `linebreak` に付くのは最初に当たる 1 つだけ。置ける `linebreak` は含まれない。validator はこの結果を `INVALID_LINEBREAK`（`path` は `marks[i].position`）にし、描画は同じ結果で置けない `linebreak` を無視する。

`valid: true` の結果は、警告があるときだけ `warnings?: ValidationWarning[]` を持つ（無いときはキーごと無い）。`ValidationWarning` は `kind`、`path`、`message` を持つ。`message` は固定の文で、入力由来の値を含まない。

- `KAERI_MULTI_CHARACTER`: 1 つの kaeri の `value` が複数の字。0.4.0 で同じコードの誤りになる。`path` は `marks[i].value`
- `LEGACY_EXT`: `extensions` を持たない文書の、オブジェクトの `ext`（文書、readings、ブロック、token、注記、derivations。空のオブジェクトも含む）。`ext` 1 つにつき 1 件。0.4.0 で同じコードの誤りになる。`path` は `marks[i].ext` など
- `LEGACY_EXT_REGISTERED_NAME`: `LEGACY_EXT` のうち、`ext` のキーが登録済みの拡張の名前と同じもの。宣言の書き忘れの疑い。`path` は `marks[i].ext.edu` など。0.4.0 では無くなる（`LEGACY_EXT` の誤りが同じ所を指す）
- `ID_FORM`: id の形が SKAM-draft §3.1 に合わない。手書きの id（NCName）でも位置に合う自動の id でもないブロック・字・注記の id、手書きの id の ref を指さない `highlight.ref`、同じ anchor の読み仮名・送り仮名・添え仮名の 2 つ目以降の手書きの id。0.4.0 で同じコードの誤りになる。`path` は `blocks[i].id`、`tokens[i].id`、`marks[i].id`、`marks[i].ref`
- `XML_UNWRITABLE_CHAR`: 字の text、reading の text、注記の文字列、placementHint に、XML 1.0 で書けない文字がある（SKAM-draft §3.2）。1 つの欄につき 1 件。0.4.0 で同じコードの誤りになる。`path` は `tokens[i].text` など
- `SAIDOKU_READING_OVERLAP`: yomigana か okurigana の範囲が再読文字の字を含み、`anchor` が再読文字と完全には同じでない（完全に同じ組は `MARK_CONFLICT`）。再読文字は読みと送り仮名を `forms` に持つ。0.4.0 で同じコードの誤りになる。`path` は `marks[i]`
- `SAIDOKU_MULTI_TOKEN`: 再読文字の `anchor` が 2 字以上（SKAM-draft §6.7 の「1 つの文字を複数回読む」に合わない）。0.4.0 で同じコードの誤りになる。`path` は `marks[i]`
- `READING_OVERLAP`: 同じ種類の読み（yomigana どうし、okurigana どうし、soegana どうし）が、別の `anchor` で 1 字でも同じ字を含む（完全に同じ `anchor` の組は `MARK_CONFLICT`）。描画は `marks[]` で先にある読みを描き、字を共有する後の読みは描かない。0.4.0 で同じコードの誤りになる。`path` は `marks[i]`
- `ValidationWarningKind` に値を足すのは minor の変更

### 未完成の検査

```typescript
import { lintSKAMDocument } from '@kanbun-skam/skam';
import type { LintDiagnostic, LintCode } from '@kanbun-skam/skam';
```

`lintSKAMDocument(doc)` は、構造として正しい文書のうち、作業が終わっていないように見える内容を `LintDiagnostic[]`（`{ code, path, message }`）で返す。診断はどれも誤りではない。中で検証しないので、`validateSKAMDocument` か `parse` を通した文書を渡す。検証を通っていない文書でも例外は出さないが、診断が正しいとは限らない。結果は `marks[]` の添字の順で、`message` は固定の文、`path` は添字だけを含む（入力の値を含まない）。

| コード                   | 指摘する内容                                     | `path`              |
| ------------------------ | ------------------------------------------------ | ------------------- |
| `SAIDOKU_SINGLE_READING` | 再読文字の `forms` が 1 つ                       | `marks[i].forms`    |
| `SAIDOKU_EMPTY_FORM`     | 再読文字の `forms` の要素に読みも送り仮名も無い  | `marks[i].forms[j]` |
| `EMPTY_KANA`             | 読み仮名、送り仮名、添え仮名が空か空白だけ       | `marks[i].value`    |
| `TATETEN_SINGLE_TOKEN`   | 竪点が 1 字                                      | `marks[i].anchor`   |
| `KAERI_UNCLOSED`         | 閉じていない返り点（SKAM-draft §14.1）           | `marks[i]`          |
| `HIGHLIGHT_REF_MISSING`  | 傍線の `ref` が ref 注記の `id` に当たらない     | `marks[i].ref`      |
| `HIGHLIGHT_REF_UNLINKED` | `ref` の無い傍線の範囲に ref 注記がちょうど 1 つ | `marks[i]`          |

コードは同じ名前の定数でも export する。`LintCode` に値を足すのは minor の変更。`validateSKAMDocument` の `warnings`（後の版で誤りになる書き方の知らせ）とは別のもので、診断はどの版でも誤りにならない。

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

`splitGraphemes(text)` は、文字列を拡張書記素クラスタ（`Intl.Segmenter` の `granularity: 'grapheme'`）の配列に分ける。parser の token、stringify が平文で書くか `<skam:t>` で書くかの判定、html と canvas の字数は、この分け方を使う。`Intl.Segmenter` の無い実行環境では、呼ぶと `TypeError`（読み込むだけなら誤りにならない）。

```typescript
import { tokenizePlainText } from '@kanbun-skam/skam';
```

`tokenizePlainText(text)` は、SKAM-ML の平文のテキストノード 1 つを token の並び（`{ text, start, end }[]`）にする。書記素に分け、各書記素の先頭の ASCII 空白（U+0009、U+000A、U+000D、U+0020）を取り除き、空になった書記素は捨てる。`start` と `end` は、取り除く前の書記素の元の文字列の中の UTF-16 の位置。parser と stringify が同じ規則で判定するための定義で、`<skam:t>` の中の文字はこの関数を通さない（そのまま 1 つの token になる）。`@experimental`。

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
import {
  isHandId,
  isAutoId,
  findXmlUnwritableChars,
  findIdFormIssues,
  renumberAutoIds,
  convertHandIdsToAuto,
} from '@kanbun-skam/skam';
```

id は手書きの id（XML の NCName）と、`#` を含む自動の id に分かれる（SKAM-draft §3.1）。

- `generateMarkId(doc)` は、文書のどの id とも重ならない最小の `m#<正の整数>` を返す。`addMark` などが注記に付けるのはこの値。`generateId(doc, prefix)` は `{prefix}-{8 桁の 16 進}` を返す
- parser が手書きの id の無いブロックと字に付ける自動の id は、位置から決まる（ブロック `b#n`、字 `<ブロックの id>#n`）。注記には文書の順で `m#n` を付ける。自動の id は文書を直すと変わるので、外から指す箇所には手書きの id を付ける
- `createRandomIdGenerator` / `createSequentialIdGenerator` は `IdGenerator`（`generate(prefix)`）を返す。使う所は `splitMultiCharacterKaeri` の `idGenerator` 選択肢で、parser の選択肢ではない
- `renumberAutoIds(doc)` は、自動の形の id を今の位置の値（ブロック `b#n`、字 `<ブロックの id>#n`、注記 `m#n`）に付け直し、それを指す参照（`tokenIds`、anchor、position、`highlight.ref`、derivations の `result`）を一緒に付け替えた新しい文書を返す。`ext` と `custom` の中は見ない
- `convertHandIdsToAuto(doc, keep)` は、`keep` に無い手書きの id を自動の id に変える。乱数の id で作った文書を、外から指す id だけ残して XML に書くときに使う。自動の id にすると `ID_FORM` になる ref の id は残す
- `findIdFormIssues(doc)` は `ID_FORM` に当たる所の path を返す。`findXmlUnwritableChars(doc)` は `XML_UNWRITABLE_CHAR` に当たる所の path を返す（どちらも validator の警告と同じ）

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
  AIRTokenSlots,
  AIRHiddenSlot,
  AIRTokenNode, // lineBreakAfter?, joinedWithNext?, hiddenSlots?
  AIRRubyGroupNode, // 2 字以上の yomigana の範囲
  AIRTatetenSeparator, // kaeri?, kaeriHidden?, hidden?
  AIRTatetenGroupNode, // continuesBefore?, continuesAfter?, lineBreakAfter?, hidden?
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

### AIR の形

どの字も、ブロックの木に 1 回だけ現れる（`AIRTokenNode`）。字自身の注記は `slots`（`AIRTokenSlots`）に入り、範囲の注記は区間の入れ子の木で表す。`AIRBlock.children` と各グループの `children` は `AIRTokenNode`、`AIRRubyGroupNode`、`AIRTatetenGroupNode`、`AIRHighlightGroupNode`、`AIRTatetenSeparator` の和（グループごとに入れられる種類は型定義による）。

- `AIRTokenNode`
  - `lineBreakAfter?: true`: この字の直後で行を改める。その字で終わる ruby か竪点のグループがあれば、最も外側のグループのノードに付く（傍線のグループには付かない）
  - `joinedWithNext?: true`: 同じブロックの次の字との間で改行できない（同じ不可分単位に入る）
  - `slots`: `ruby`、`okuri`、`soegana`、`kaeri`、`kutoten`、`kutotenValues`（同じ位置の句読点を `marks[]` の順に 1 つずつ）、`isOkimoji`、`isJoji`、`emphasis`、`emphasisStyle`（傍点の style の検証済みの値）、`saidoku`（`forms` の配列）、`saidokuUnder`、`saidokuOkuri2`、`ref`、`refLabels`（同じ位置の ref のラベルを `marks[]` の順に 1 つずつ）、`okototen`
  - `hiddenSlots?`: 拡張（出題の印）が隠す slot の名前
- `AIRRubyGroupNode`（`type: 'ruby-group'`）: 2 字以上の yomigana の範囲。`yomigana: { value, hidden? }`、`fromTokenId`、`toTokenId`、`span`（範囲の字の数）、`children`、`lineBreakAfter?`。1 字の yomigana は字の `slots.ruby`、送り仮名と添え仮名の範囲は範囲の最後の字の `slots.okuri` / `slots.soegana` に入り、グループにならない。`READING_OVERLAP` の文書では、`marks[]` で先にある読みだけがグループになる
- `AIRTatetenGroupNode`: 竪点 1 つの範囲、または範囲を部分交差する注記で切った断片。`tatetenMark`、`children`、`continuesBefore?` / `continuesAfter?`（前後に同じ注記の断片がある）、`lineBreakAfter?`、`hidden?`
- `AIRTatetenSeparator`: 竪点の区切り。`kaeri?`（非レ返り点）、`kaeriHidden?`、`hidden?`（区切りを含む竪点がどれも隠されている）
- `AIRHighlightGroupNode`: 傍線 1 つの範囲、または断片。`highlightMark`、`highlightStyle`、`refLabel?`（断片に分かれたときは最後の断片だけ）、`lane?`（傍線の段。同じ字を共有する傍線は段が違い、段が大きいほど字から離して描く。1 以上のときだけ付き、断片はどれも同じ値）、`children`、`continuesBefore?` / `continuesAfter?`、`hasKana`、`hasEmphasis`

`getTatetenGroups(tokens, marks)` と `getHighlightGroups(tokens, marks)` は、範囲に含まれる字ごとに、その字を含むすべての竪点（傍線）を `Map<tokenId, TatetenMark[]>`（`Map<tokenId, HighlightMark[]>`）で返す。配列は `marks[]` の順で、同じ注記には同じオブジェクトが入る。`getRangeMarkGroups(tokens, marks, type)` は `anchor.from !== anchor.to` の yomigana・okurigana・soegana を字ごとに `RangeMarkGroup` で返す。

描画の上限は、1 ブロックの竪点と傍線の合計 1,024 個（竪点が先）、1 つの注記の断片 8 個、範囲の要素の深さ 56（ruby のグループも数える）。上限を超えた注記は描かず、字は必ず描く。

`createMarkLookup(marks, tokenGroups)` は注記の索引を作り、字の id からその字に付く注記を種別ごとに引く関数を返す。`tokenGroups` は描く字の配列の列で、`groupTokensByBlock(blocks, tokens).map((g) => g.tokens)` を渡す。範囲の注記の間の字は、`tokens[]` の順序ではなくこの列の中の位置で決まる。`getMarksForToken(tokenId, marks, allTokens)` は呼ぶたびに索引を作るので、字ごとに引くときは `createMarkLookup` を使う。`@kanbun-skam/skam` の `getMarksForToken(doc, tokenId)` は、編集の操作のための別の関数である。

読み上げ用テキスト（`describeAnnotationIR` / `formatAccessibleText` / `DEFAULT_ACCESSIBLE_LABELS`）はすべて `@experimental`。AIR から「画面に見えている注記だけ」を言葉にする。`formatAccessibleText` は生のテキストを返し、HTML のエスケープをしない。読み上げの言葉は 0.x のマイナーで変わりうる。2 字以上の読みの範囲（`AIRRubyGroupNode`）は、範囲の最後の字の単位の後ろに、本文の無い単位で yomigana の注記として 1 つ出る（竪点や傍線の断片にまたがっても 1 回）。傍線の始まりと終わりも、断片に分かれても 1 回ずつ出る。2 回目の読みが無い再読文字は、1 回目の読みが読み仮名・送り仮名として出る。

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

本文は書記素クラスタ 1 つを 1 token にする（IVS、SVS、結合文字は基底の字と 1 token）。`Intl.Segmenter` が要る。`<skam:t>` の中の文字は書記素に分けず、空白も捨てずに 1 つの token にする。

手書きの id（`xml:id`）の無いブロックと字には位置から決まる自動の id（`b#1`、`b#1#2`）を、注記には文書の順で `m#1` の形の id を付ける。`parse` に id の生成器は渡さない。

入れ子にできない範囲は、`sID` / `eID` の空要素の対で書いた形を読む。ext、custom、placementHint は `skam:ext`、`skam:custom`、`placement-hint` 属性の JSON から読み、長さの上限と自由なデータの検査に通す。

ルートの `xml:lang` は文書の `lang` になる（空の値なら `lang` を持たない）。`validate: true` なら形の誤りは `SKAMValidationError`（`path` は `lang`、位置は付かない）。`validate: false` では値をそのまま入れるので、HTML に使うときは `isLanguageTag` を通す。

`skam:meta` の子の `skam:extension` は `extensions` と `extensionsRequired` になり、拡張の名前空間の属性（例 `edu:quiz`）は `ext.<拡張の名前>` になる。選択肢 `extensions` で、既定の束に利用者の拡張の定義を足せる。`uri` を省いた `skam:extension` は名前だけの宣言で、名前で拡張を決める（登録簿にも定義にも無い名前は知らない拡張で、値は `skam:ext` に書く）。知らない必須の拡張を宣言した文書は、`validate` の値にかかわらず誤り。

`onWarning` には、未知の要素（`UNKNOWN_ELEMENT`）のほかに、ハイフンで連結した `kind` の `skam:kaeri`（`KAERI_MULTI_CHARACTER`）の警告が届く。後者は `validate` の値に関係なく 1 要素につき 1 回出る。validator の `warnings` は `onWarning` に流れない。

## @kanbun-skam/skam-xml-stringify

```typescript
import { stringify } from '@kanbun-skam/skam-xml-stringify';

// SKAM JSON → XML
const xml = stringify(doc);
```

文書の `lang` が文字列なら、ルートに `xml:lang` を書く（値は escape する）。

宣言のある文書は、`skam:meta` に `skam:extension` を、ルートに拡張の名前空間を書き、拡張の値を定義の `writeXmlAttributes` で属性にする。選択肢 `extensions` で拡張の定義を足せる。登録簿にも定義にも無い拡張は `uri` を省いて宣言し、値は `skam:ext` 属性に JSON で書く。`UNKNOWN_EXTENSION` の損失になるのは、拡張の名前の形でない名前と、知らない必須の拡張の宣言だけ。

validator が誤りも警告も返さない文書は、損失なしで書け、`parse` で読み直すと同じ文書に戻る。平文で書くと同じ字の並びに戻らない字（2 書記素以上の字、空白だけの字、空白で始まる字）と、手書きの id・ext・custom を持つ字は `<skam:t>` で書く。入れ子にできない範囲は `sID` / `eID` の空要素の対で書く。ext・custom・placementHint は持ち主の要素の属性（`skam:ext`、`skam:custom`、`placement-hint`）に書く。`derivations` は書かない（損失 `DERIVATIONS`）。

`SKAM_ML_CONTENT_MODEL`（`@kanbun-skam/skam`）は、SKAM-ML-draft §7.0 の内容モデルの表。キーはテキストを持てる親要素（`block`、`span`、`tateten`、`yomigana`、`okimoji`、`joji`、`okototen`、`base`、`kun`、`soegana`、`t`）で、値は子に持てる要素の名前（テキストは `#text`）の配列。`yomigana`、`kun`、`base` は `saidoku` を子に持てない。`SKAM_ML_NESTING_ORDER` は範囲の要素の入れ子の順（外側から）。どちらも `@experimental` で、parser と stringify が同じ表を使う。

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
