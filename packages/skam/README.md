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

## ブロック先頭の返り点

返り点（kaeri）はブロックの先頭に置けない。検証エラーと parser のエラーは、同じ案内文 `BLOCK_START_KAERI_HINT`（本パッケージが export する）を使う。同じ位置に重複した kaeri は検査しない。

## 表示設定

`@kanbun-skam/skam/rendering` は、表示設定（どの注記を出すか）の `RENDER_PROFILES`、`resolveRenderProfile`、キー名の一覧 `RENDER_PROFILE_KEYS`、誤りのクラス `SKAMRenderProfileError` を export する。html-renderer と canvas-renderer も同じものを再 export する。13 個のキー名は 0.x の間も改名・削除しない（[ADR-033](https://github.com/berlysia/kanbun-annotation/blob/master/docs/decisions/adr-033-render-profile-keys-and-errors.md)）。キー名の表と、誤りの `kind` / `key` の読み方は、`@kanbun-skam/skam-html-renderer` の README の「表示プロファイル」にある。

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

既知の制約:

- 読みの範囲が竪点のグループからはみ出す文書（#16）では、範囲の読みが先頭の字の読み仮名として出る。
- 再読文字は `slots.saidokuUnder` か `slots.saidokuOkuri2` があるときだけ再読文字として読む。2 回目の読みが無い再読文字は、1 回目の読みが読み仮名・送り仮名として出る。

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

## Reading Kinds

| kind          | 説明               |
| ------------- | ------------------ |
| `kundoku`     | 訓読文             |
| `kakikudashi` | 書き下し文         |
| `yomiage`     | 読み上げ用テキスト |

## 0.1 からの移行

0.1.x からの変更のうち、このパッケージに関わるものです。ID は全体の移行表と共通です。

| ID  | 旧挙動                                                                                                                                                                                                                 | 新挙動                                                                                                                                                                                                                                                                                                                                                                                                                                         | 回避策                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M01 | npm には 0.1.0 から `@kanbun-skam/*` の名前で公開している (`@kanbun/*` は npm に公開していない)。リポジトリの CHANGELOG には、未公開の 0.1.1 として `@kanbun` からの改名が書かれていた。                               | 名前は変わらない。CHANGELOG から未公開の 0.1.1 の節を消し、0.1.0 の次を 0.2.0 とした。                                                                                                                                                                                                                                                                                                                                                         | 不要。                                                                                                                                                                                        |
| M07 | 空の token `text`、空の `saidoku.forms`、ブロック・token・mark にまたがる ID の重複、グリッドの外の okototen の座標、書式に合わない `emphasis.style`、型の違う `id` / `ext` / `placementHint` / `forms[].n` を通した。 | これらを拒否する。parser は既定で検証するので、XML からの文書にも同じ検査が及ぶ。                                                                                                                                                                                                                                                                                                                                                              | 保存済みの JSON を `validateSKAMDocument` で一括検査し、エラーの `kind` ごとに直す (`INVALID_VALUE`、`DUPLICATE_ID`、`INVALID_TYPE` など)。parser では `{ validate: false }` で検査を外せる。 |
| M08 | yomigana、okurigana、soegana、okimoji、joji、saidoku を同じ anchor に重ねても通った。                                                                                                                                  | `MARK_CONFLICT` で拒否する。okototen、emphasis、highlight、tateten は重ねてよい (SKAM-draft §6.1)。                                                                                                                                                                                                                                                                                                                                            | `validateSKAMDocument` の `MARK_CONFLICT` の位置を探し、重複の片方を消すか、別の anchor に移す。parser では `{ validate: false }` で検査を外せる。                                            |
| M09 | ブロック先頭の kaeri を通した。                                                                                                                                                                                        | `skam` の validator が `BLOCK_START_KAERI` (検証エラーの `kind`) で拒否する。`skam-xml-stringify` の欠落の `code` の `BLOCK_START_KAERI` とは別の型である。案内文は `BLOCK_START_KAERI_HINT`。                                                                                                                                                                                                                                                 | 返り点を前のブロックの最後の字の後に置くか、ブロックをまとめる。                                                                                                                              |
| M23 | なし。                                                                                                                                                                                                                 | `skam`: `isValidEmphasisStyle`、`BLOCK_START_KAERI_HINT`、`HIGHLIGHT_STYLES`、`isValidHighlightStyle`、`resolveOkototenCell`。`skam-xml-parser`: `SKAM_ML_CONTENT_MODEL` (`@experimental`)、`ParseWarning` / `onWarning`。`skam-xml-stringify`: `SKAM_ML_CONTENT_MODEL`、`SKAM_ML_NESTING_ORDER` (どちらも `@experimental`)、`SKAMXMLStringifyError` / `StringifyLoss`。`skam-html-renderer`: `validateRenderOptions` / `validateCSSOptions`。 | 対応は要らない。`@experimental` の API は、0.x の間はマイナーリリースで値が変わりうる。                                                                                                       |
| M24 | 条件オブジェクトで `import` が `types` より前にあった。`skam-web-component` の `./auto` には `types` がなかった。                                                                                                      | `types` を先頭にする。`./auto` に `types` を足す。サブパスと実体は変わらない。                                                                                                                                                                                                                                                                                                                                                                 | 対応は要らない (非破壊の変更)。                                                                                                                                                               |
| M27 | なし。                                                                                                                                                                                                                 | `skam` / `skam-html-renderer` / `skam-canvas-renderer`: `RENDER_PROFILES` (html と canvas では `PROFILES` の別名のまま)、`resolveRenderProfile`、`RenderProfileInput`、`RenderProfileName` (`RenderProfile` の型も skam から再 export する)。`skam-web-component`: `extractXmlFromScriptElement` (`@experimental`)。                                                                                                                           | 対応は要らない (非破壊の追加)。`@experimental` の API は、0.x の間はマイナーリリースで値が変わりうる。                                                                                        |
| M34 | `buildAnnotationIR` の範囲 (`rangeInfo`) の `trailingMarks` に、`profile.okimoji` / `profile.joji` が false でも置き字・助字が入った。HTML の表示は、後段が profile を再判定するので変わらなかった。                   | `profile.okimoji` / `profile.joji` が true のときだけ、`trailingMarks` に入る。HTML と canvas の出力は変わらない。                                                                                                                                                                                                                                                                                                                             | AIR を直接使っている場合は、隠した置き字・助字が `trailingMarks` に無いことを前提にする。                                                                                                     |
| M36 | `SKAMValidationError.errors` の各要素は `kind` / `path` / `message` (と `expected` / `actual`) だけで、元の SKAM-ML の位置を示さなかった。                                                                             | `ValidationError` に任意の `line` / `column` を足した。Node 版の `parse()` (`validate: true`) が投げる `SKAMValidationError` で、`path` が `tokens[i]` / `marks[i]` / `blocks[i]` で始まるエラーに付く。`validateSKAMDocument` を直接呼んだときと、ブラウザ版では付かない (キーごと無い)。                                                                                                                                                     | 型は非破壊。parser 経由の検証エラーにはキーが増えるので、エラーを `toEqual` で比べている利用側のテストは差が出る。比較から `line` / `column` を外すか、`toMatchObject` を使う。               |
| M37 | なし。                                                                                                                                                                                                                 | `skam`: `describeAnnotationIR`、`formatAccessibleText`、`DEFAULT_ACCESSIBLE_LABELS`、型 `AccessibleNote` / `AccessibleUnit` / `AccessibleBlock` / `AccessibleLabels` (すべて `@experimental`)。`skam-html-renderer`: `readingLayerSource` / `accessibleLabels` オプションと `AccessibleLabels` 型 (`@experimental`)。`skam-web-component`: `reading-layer-source` 属性 (`@experimental`)。                                                     | 対応は要らない (追加。既定の挙動は変わらない)。`@experimental` の API は、0.x の間はマイナーリリースで値が変わりうる。読み上げの言葉も 0.x のマイナーで変わりうる。                           |

全体の移行表 (対象パッケージ、依存の更新を含む): https://github.com/berlysia/kanbun-annotation/blob/master/docs/migration-0.1-to-0.2.md

## 関連パッケージ

- [@kanbun-skam/skam-xml-parser](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-xml-parser) - SKAM-ML/XML パーサー
- [@kanbun-skam/skam-html-renderer](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-html-renderer) - HTML レンダラー

## 仕様書

- [SKAM v0.1 仕様](https://github.com/berlysia/kanbun-annotation/blob/master/SKAM-draft.md)
- [SKAM-ML v0.1 仕様](https://github.com/berlysia/kanbun-annotation/blob/master/SKAM-ML-draft.md)

## ライセンス

MIT
