# @kanbun-skam/skam

**SKAM (Stand-off Kanbun Annotation Model)** の型定義とバリデーター。

漢文本文と訓点・注記・読みを分離して保持する意味モデルの TypeScript 実装。

## インストール

```bash
npm install @kanbun-skam/skam
# or
pnpm add @kanbun-skam/skam
```

## 使い方

### 型定義

<!-- doctest -->

```typescript
import type { SKAMDocument, Token, Mark, Reading } from '@kanbun-skam/skam';

const doc: SKAMDocument = {
  format: 'skam@0.1',
  tokens: [
    { id: 't1', text: '学' },
    { id: 't2', text: '而' },
  ],
  blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
  marks: [{ type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'びて' }],
  readings: [{ kind: 'kakikudashi', text: '学びて' }],
};
```

### バリデーション

<!-- doctest:typecheck -->

```typescript
import { validateSKAMDocument, isSKAMDocument, assertSKAMDocument } from '@kanbun-skam/skam';
import type { SKAMDocument } from '@kanbun-skam/skam';

declare const input: unknown; // 検証したい外部からの入力

// 結果オブジェクトを返す
const result = validateSKAMDocument(input);
if (result.valid) {
  const doc: SKAMDocument = result.document;
} else {
  console.error(result.errors);
}

// 型ガード
if (isSKAMDocument(input)) {
  // input は SKAMDocument 型
}

// アサーション（無効な場合は例外をスロー）
assertSKAMDocument(input);
```

## 複数の字の kaeri

1 つの kaeri の `value` に複数の字を書く形（`㆒㆑`）は非推奨で、0.4.0 で誤りになる。0.3 では `valid: true` の結果の `warnings` に `KAERI_MULTI_CHARACTER` の警告が入る。正の書き方は、同じ位置に 1 字ずつの kaeri を並べること。`splitMultiCharacterKaeri(doc)` は、文書の複数の字の kaeri を 1 字ずつの注記に分けた新しい文書を返す。

## ブロック先頭の返り点

返り点（kaeri）はブロックの先頭に置けない。検証エラーと parser のエラーは、同じ案内文 `BLOCK_START_KAERI_HINT`（本パッケージが export する）を使う。同じ位置の複数の kaeri は正しい書き方として許す（`marks[]` の順につないだ値と同じ意味）。

## 改行

`linebreak` は、`position.after` の字の後ろで行を改める位置の注記で、SKAM-ML では `<skam:br/>` と書く。次の場所には置けず、検証は `INVALID_LINEBREAK` を返す。

- ブロックの先頭（`position.after` が無い）
- ブロックの最後の字の後ろ
- 不可分単位の中: たて点のグループの中と、`yomigana` / `okurigana` / `soegana` / `saidoku` / `okimoji` / `joji` の範囲の中（`highlight` / `emphasis` / `okototen` の範囲の中には置ける）
- 同じ位置の 2 つ目

`getLinebreakPlacementIssues(doc)` は、置けない場所にある `linebreak` を `marks[]` の添字ごとに返す（理由は `'block-start' | 'block-end' | 'inside-unit' | 'duplicate'`）。描画は同じ判定を使い、置けない `linebreak` を無視する。`@kanbun-skam/skam/rendering` の AIR では、行を改める単位のノード（`AIRTokenNode` / `AIRRubyGroupNode` / `AIRTatetenGroupNode`）に `lineBreakAfter: true` が付く（その字で終わるグループがあれば、最も外側の ruby か竪点のグループに付く）。表示設定のキー `linebreak` を `false` にすると、改行を描かない。

## 本文の言語（`lang`）

文書の最上位の任意の `lang` は、本文（白文）の言語を表す（例 `ja`、`lzh`、`zh-Hant`）。validator は形を `isLanguageTag` で検査する。SKAM-ML ではルートの `xml:lang` と往復する。html の描画は、`displayLang` を渡さなければ表示層の `lang` にこの値を使う。

## 未完成の検査

`lintSKAMDocument(doc)` は、構造として正しい文書のうち、作業が終わっていないように見える内容（読みが 1 つの再読文字、空の仮名、1 字の竪点、閉じていない返り点、参照先の無い傍線の `ref`、`ref` で結ばれていない傍線の範囲にある ref）を、コード付きの診断（`{ code, path, message }`）の配列で返す。診断は誤りではない。`validateSKAMDocument` か `parse` を通した文書を渡す（中で検証しない。検証を通っていない文書でも例外は出さないが、診断が正しいとは限らない）。コードは今後増えることがある。`validateSKAMDocument` の `warnings` は、後の版で誤りになる書き方の知らせで、これとは別のもの。

## JSON Schema

文書の JSON Schema（2020-12）を `@kanbun-skam/skam/schema/skam.schema.json` と `@kanbun-skam/skam/schema/ext-edu.schema.json` で配る。`$id`（`urn:kanbun-skam:schema:skam-0.1`、`urn:kanbun-skam:schema:ext-edu-1`）は取りに行かない識別子なので、2 つを検証器に登録してから使い、未解決の `$ref` を取りに行く設定にしない。

- 正は `validateSKAMDocument`。schema は構造の規則だけを写し、それより緩い。id の参照、注記の衝突、改行の置き場、拡張の宣言と `ext` のキーの関係、`ext` と `custom` の入れ子の段数と値の総数は、validator だけが検査する
- schema だけの検証は、信頼できない入力の検査にならない（入れ子の段数の上限が効かず、深い入れ子は検証器のスタックと CPU を使いうる）。信頼できない入力は `validateSKAMDocument` に通す
- 未知の mark type は誤り。注記などの未知のフィールドと未知の最上位のキーは通る。validator は前者を残し、後者を返す文書から落とす
- `pattern` は Ajv（JavaScript の正規表現）で確かめている。ほかの言語の実装では判定が違いうる
- 同じ `$id` の schema は、パッケージの版が上がっても通す文書が増える向きにだけ変わる。新しい注記の種類を使う文書は、古い schema と古い validator の両方で誤りになる

## 拡張（`extensions`、`ext`、`custom`）

文書は、使う拡張を最上位の `extensions` に、知らなければ読んではいけない拡張を `extensionsRequired` に挙げる。拡張の値は `ext.<拡張の名前>` に置き、SKAM が解釈しない自由なデータは `custom` に置く。`extensions` を持つ文書（空の配列も含む）だけが宣言のある文書で、`ext` に `extensions` に無い名前があれば `INVALID_EXTENSION`、`extensionsRequired` に知らない名前があっても `INVALID_EXTENSION`。持たない文書の `ext` は、0.3 では自由なデータとして読み、`valid: true` の結果の `warnings` に `LEGACY_EXT` の警告が入る（0.4.0 で誤りになる）。`ext` のキーが登録済みの拡張の名前と同じなら `LEGACY_EXT_REGISTERED_NAME` も入る。`moveLegacyExtToCustom(doc)` は、宣言の無い文書のすべての `ext` を `custom` に移した新しい文書と、登録済みの拡張の名前のキーの path（`registeredNameKeys`）を返す。拡張の値だったなら、その値を `custom` から `ext` に戻し、`extensions` を宣言する。

`ext` と `custom` は信頼しない入力で、入れ子 32 段、キー 1,000 個、配列 10,000、文書全体の値 100,000 個を超えるか、`__proto__` / `constructor` / `prototype` のキーがあれば `INVALID_VALUE`。

拡張の束と型は `@kanbun-skam/skam/extensions`、学習・教育用拡張（`edu`、出題の印 `ext.edu.quiz`）の定義は `@kanbun-skam/skam/extensions/edu` から import する。`validateSKAMDocument(doc, { extensions: [...] })` で、利用者の拡張の定義を足せる。

出題の印は表示の制御で、秘匿ではない。答えは同じ文書に平文で残る。

## 表示設定

`@kanbun-skam/skam/rendering` は、表示設定（どの注記を出すか）の `RENDER_PROFILES`、`resolveRenderProfile`、キー名の一覧 `RENDER_PROFILE_KEYS`、誤りのクラス `SKAMRenderProfileError` を export する。html-renderer と canvas-renderer も同じものを再 export する。14 個のキー名は 0.x の間も改名・削除しない（[ADR-033](https://github.com/berlysia/kanbun-annotation/blob/master/docs/decisions/adr-033-render-profile-keys-and-errors.md)）。キー名の表と、誤りの `kind` / `key` の読み方は、`@kanbun-skam/skam-html-renderer` の README の「表示プロファイル」にある。

## 読み上げ用テキスト (`@experimental`)

`@kanbun-skam/skam/rendering` の次の API は、AIR（`buildAnnotationIR` が `profile` で絞った「画面に見えるもの」）から、読み上げ用の構造と文字列を作る。どれも `@experimental` で、読み上げの言葉は 0.x のマイナーリリースで変わりうる。

- `describeAnnotationIR(air)`: ブロック → 単位 → 注記の構造を返す。言語に依存しない。注記の `kind` は 0.x のマイナーで増えうる。
- `formatAccessibleText(blocks, labels?)`: 構造を日本語の文章にする。**HTML のエスケープをしない**ので、HTML に入れるときは呼び出し側でエスケープする。`labels` で `kind` ごとに言葉を上書きできる（own property だけを引く）。空文字・例外・string 以外を返した注記は出ない。すべての注記が出ず、本文も無いと空文字を返す。
- `DEFAULT_ACCESSIBLE_LABELS`: 既定の言葉。

<!-- doctest:typecheck -->

```typescript
import {
  buildAnnotationIR,
  describeAnnotationIR,
  formatAccessibleText,
  RENDER_PROFILES,
} from '@kanbun-skam/skam/rendering';
import type { SKAMDocument } from '@kanbun-skam/skam';

declare const doc: SKAMDocument;

const air = buildAnnotationIR(doc, RENDER_PROFILES.learningBasic);
const text = formatAccessibleText(describeAnnotationIR(air));
// 例: 學。而、置き字。時。習、レ点。之。
```

2 字以上の読みの範囲（`AIRRubyGroupNode`）は、範囲の最後の字の単位の後ろに、本文の無い単位で読み仮名の注記として 1 つ出る。傍線の始まりと終わりは、竪点や傍線の断片に分かれても 1 回ずつ出る。

既知の制約: 再読文字は `slots.saidokuUnder` か `slots.saidokuOkuri2` があるときだけ再読文字として読む。2 回目の読みが無い再読文字は、1 回目の読みが読み仮名・送り仮名として出る。

## Mark Types

| type        | 説明                     |
| ----------- | ------------------------ |
| `kaeri`     | 返り点                   |
| `okurigana` | 送り仮名                 |
| `yomigana`  | 読み仮名（ルビ）         |
| `soegana`   | 添え仮名（助詞補完）     |
| `okimoji`   | 置字（訓読時に読まない） |
| `joji`      | 助字（文法ラベル）       |
| `kutoten`   | 句読点                   |
| `emphasis`  | 傍点・圏点               |
| `saidoku`   | 再読文字                 |
| `okototen`  | ヲコト点                 |
| `tateten`   | たて点（熟語境界）       |
| `highlight` | 傍線（ref を参照可）     |
| `ref`       | 参照識別子・注釈         |
| `linebreak` | 改行                     |

## Reading Kinds

| kind          | 説明               |
| ------------- | ------------------ |
| `kundoku`     | 訓読文             |
| `kakikudashi` | 書き下し文         |
| `yomiage`     | 読み上げ用テキスト |

## 0.1 からの移行

0.1.x から上げるときにやることは [移行の文書](https://github.com/berlysia/kanbun-annotation/blob/master/docs/migration-0.1-to-0.2.md) にまとめてある。

## 関連パッケージ

- [@kanbun-skam/skam-xml-parser](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-xml-parser) - SKAM-ML/XML パーサー
- [@kanbun-skam/skam-html-renderer](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-html-renderer) - HTML レンダラー

## 仕様書

- [SKAM v0.1 仕様](https://github.com/berlysia/kanbun-annotation/blob/master/SKAM-draft.md)
- [SKAM-ML v0.1 仕様](https://github.com/berlysia/kanbun-annotation/blob/master/SKAM-ML-draft.md)

## ライセンス

MIT
