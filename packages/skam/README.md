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
| M01 | `@kanbun/*` として配布していた。リポジトリ内の 0.1.1 で改名したが、0.1.1 は npm に公開していない (2026-10-15 時点)。                                                                                                   | `@kanbun-skam/*` で配布する。0.2.0 から npm では `@kanbun-skam/*` の名前だけを使う。                                                                                                                                                                                                                                                                                                                                                           | `package.json` の依存と import の指定子を `@kanbun-skam/*` に置き換える。                                                                                                                     |
| M07 | 空の token `text`、空の `saidoku.forms`、ブロック・token・mark にまたがる ID の重複、グリッドの外の okototen の座標、書式に合わない `emphasis.style`、型の違う `id` / `ext` / `placementHint` / `forms[].n` を通した。 | これらを拒否する。parser は既定で検証するので、XML からの文書にも同じ検査が及ぶ。                                                                                                                                                                                                                                                                                                                                                              | 保存済みの JSON を `validateSKAMDocument` で一括検査し、エラーの `kind` ごとに直す (`INVALID_VALUE`、`DUPLICATE_ID`、`INVALID_TYPE` など)。parser では `{ validate: false }` で検査を外せる。 |
| M08 | yomigana、okurigana、soegana、okimoji、joji、saidoku を同じ anchor に重ねても通った。                                                                                                                                  | `MARK_CONFLICT` で拒否する。okototen、emphasis、highlight、tateten は重ねてよい (SKAM-draft §6.1)。                                                                                                                                                                                                                                                                                                                                            | `validateSKAMDocument` の `MARK_CONFLICT` の位置を探し、重複の片方を消すか、別の anchor に移す。parser では `{ validate: false }` で検査を外せる。                                            |
| M09 | ブロック先頭の kaeri を通した。                                                                                                                                                                                        | `skam` の validator が `BLOCK_START_KAERI` (検証エラーの `kind`) で拒否する。`skam-xml-stringify` の欠落の `code` の `BLOCK_START_KAERI` とは別の型である。案内文は `BLOCK_START_KAERI_HINT`。                                                                                                                                                                                                                                                 | 返り点を前のブロックの最後の字の後に置くか、ブロックをまとめる。                                                                                                                              |
| M23 | なし。                                                                                                                                                                                                                 | `skam`: `isValidEmphasisStyle`、`BLOCK_START_KAERI_HINT`、`HIGHLIGHT_STYLES`、`isValidHighlightStyle`、`resolveOkototenCell`。`skam-xml-parser`: `SKAM_ML_CONTENT_MODEL` (`@experimental`)、`ParseWarning` / `onWarning`。`skam-xml-stringify`: `SKAM_ML_CONTENT_MODEL`、`SKAM_ML_NESTING_ORDER` (どちらも `@experimental`)、`SKAMXMLStringifyError` / `StringifyLoss`。`skam-html-renderer`: `validateRenderOptions` / `validateCSSOptions`。 | 対応は要らない。`@experimental` の API は、0.x の間はマイナーリリースで値が変わりうる。                                                                                                       |
| M24 | 条件オブジェクトで `import` が `types` より前にあった。`skam-web-component` の `./auto` には `types` がなかった。                                                                                                      | `types` を先頭にする。`./auto` に `types` を足す。サブパスと実体は変わらない。                                                                                                                                                                                                                                                                                                                                                                 | 対応は要らない (非破壊の変更)。                                                                                                                                                               |

全体の移行表 (対象パッケージ、依存の更新を含む): https://github.com/berlysia/kanbun-annotation/blob/master/docs/migration-0.1-to-0.2.md

## 関連パッケージ

- [@kanbun-skam/skam-xml-parser](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-xml-parser) - SKAM-ML/XML パーサー
- [@kanbun-skam/skam-html-renderer](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-html-renderer) - HTML レンダラー

## 仕様書

- [SKAM v0.1 仕様](https://github.com/berlysia/kanbun-annotation/blob/master/SKAM-draft.md)
- [SKAM-ML v0.1 仕様](https://github.com/berlysia/kanbun-annotation/blob/master/SKAM-ML-draft.md)

## ライセンス

MIT
