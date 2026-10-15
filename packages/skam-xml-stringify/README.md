# @kanbun-skam/skam-xml-stringify

**SKAM JSON** から **SKAM-ML/XML** へのシリアライザー。

プログラムで処理した SKAM JSON を、人間が編集しやすい XML 形式にシリアライズ。

## インストール

```bash
npm install @kanbun-skam/skam-xml-stringify
# or
pnpm add @kanbun-skam/skam-xml-stringify
```

## 使い方

### 基本的なシリアライズ

<!-- doctest -->

```typescript
import { stringify } from '@kanbun-skam/skam-xml-stringify';
import type { SKAMDocument } from '@kanbun-skam/skam';

const doc: SKAMDocument = {
  format: 'skam@0.1',
  tokens: [
    { id: 't1', text: '學' },
    { id: 't2', text: '而' },
  ],
  blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
  marks: [
    { type: 'okurigana', anchor: { from: 't1', to: 't1' }, value: 'びて' },
    { type: 'okimoji', anchor: { from: 't2', to: 't2' } },
  ],
  readings: [{ kind: 'kakikudashi', text: '学びて' }],
};

const xml = stringify(doc);
// <?xml version="1.0" encoding="UTF-8"?>
// <skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
//   <skam:body>
//     <skam:block>
//       <skam:kun okuri="びて">學</skam:kun><skam:okimoji>而</skam:okimoji>
//     </skam:block>
//   </skam:body>
//   <skam:readings>
//     <skam:reading kind="kakikudashi">学びて</skam:reading>
//   </skam:readings>
// </skam:doc>
```

### オプション

<!-- doctest:typecheck -->

```typescript
import { stringify } from '@kanbun-skam/skam-xml-stringify';
import type { SKAMDocument } from '@kanbun-skam/skam';

declare const doc: SKAMDocument;

// XML 宣言なし
const withoutDeclaration = stringify(doc, { xmlDeclaration: false });

// インデントサイズの変更（デフォルト: 2）
const indented = stringify(doc, { indent: 4 });
```

## 欠落契約

SKAM-ML で表現できない内容は、黙って捨てない。`stringify` は既定で `SKAMXMLStringifyError` を投げる。表現できなかった項目の一覧は、エラーの `losses` にある（文書の順に並ぶ）。

各 loss は `category`、`code`、`path`（JSON Pointer）、`message`（必要なら `markId`）を持つ。

### `lossy` と `onLoss`

- `lossy: false`（既定）: 欠落が 1 つでもあれば `SKAMXMLStringifyError` を投げる。
- `lossy: true`: 欠落を捨てて XML を返す。戻り値は XML 文字列だけで、何を捨てたかは `onLoss` でしか分からない。`onLoss` は欠落ごとに、文書の順に同期で呼ばれる。`onLoss` が例外を投げたら、そのまま伝わる。`lossy: false` のときは呼ばれない。

<!-- doctest -->

```typescript
import { stringify, type StringifyLoss } from '@kanbun-skam/skam-xml-stringify';
import type { SKAMDocument } from '@kanbun-skam/skam';

const doc: SKAMDocument = {
  format: 'skam@0.1',
  tokens: [{ id: 't1', text: '學' }],
  blocks: [{ id: 'b1', tokenIds: ['t1'] }],
  marks: [],
  readings: [],
  ext: { 'example.com': { note: 'SKAM-ML に書き場所がない' } },
};

const losses: StringifyLoss[] = [];
const xml = stringify(doc, { lossy: true, onLoss: (loss) => losses.push(loss) });

if (losses.length !== 1 || losses[0]?.code !== 'EXT') {
  throw new Error('expected one EXT loss');
}
console.log(xml, losses[0].path); // path: "/ext"
```

### 欠落の分類

- `unrepresentable`: 仕様上、SKAM-ML で表現できない（または表現しない）もの。
- `unsupported`: SKAM-ML v0.1 に書き方がまだないもの。仕様の改訂で書けるようになる可能性がある。

### `code` の一覧

型 `StringifyLossCode` が正本。コードは今後増えうるので、`switch` には `default` を置く。

| code                     | 分類              | 内容                                                                  |
| ------------------------ | ----------------- | --------------------------------------------------------------------- |
| `DERIVATIONS`            | `unrepresentable` | `derivations` は SKAM-ML に書けない（コンパイル時に生成される）       |
| `ASCII_WHITESPACE_TOKEN` | `unrepresentable` | SKAM-ML が無視する空白だけの token                                    |
| `BLOCK_START_KAERI`      | `unrepresentable` | ブロック先頭の返り点（直前の token がない）                           |
| `DANGLING_REFERENCE`     | `unrepresentable` | 存在しない token / block、またはどのブロックにも属さない token を指す |
| `CROSS_BLOCK_ANCHOR`     | `unrepresentable` | 複数のブロックにまたがる anchor                                       |
| `PARTIAL_OVERLAP`        | `unsupported`     | 範囲が部分的に重なり、入れ子にできない                                |
| `UNNESTABLE_OVERLAP`     | `unsupported`     | 内容モデル（SKAM-ML §7.0）上、入れ子にできない範囲                    |
| `CONFLICTING_MARKS`      | `unrepresentable` | 同じ anchor に同じ種類の注記が 2 つ以上ある                           |
| `EXT`                    | `unsupported`     | `ext` を書く場所がない                                                |
| `PLACEMENT_HINT`         | `unsupported`     | `placementHint` を書く場所がない                                      |

### 内容モデル表

`SKAM_ML_CONTENT_MODEL` は `@experimental`。仕様の改訂に合わせて変わりうる。同じ fixed group の同じ版どうしでだけ、内容の一致を保証する。

## 対応 Mark Types

全 13 種の SKAM v0.1 mark type をサポート:

| type        | 出力形式                                      |
| ----------- | --------------------------------------------- |
| `kaeri`     | `<skam:kaeri kind="re"/>`                     |
| `okurigana` | `<skam:kun okuri="...">` 属性                 |
| `yomigana`  | `<skam:kun yomi="...">` 属性                  |
| `soegana`   | `<skam:kun soe="...">` 属性                   |
| `okimoji`   | `<skam:okimoji>...</skam:okimoji>`            |
| `joji`      | `<skam:joji>...</skam:joji>`                  |
| `kutoten`   | `<skam:kutoten value="..." kind="..."/>`      |
| `saidoku`   | `<skam:saidoku>...</skam:saidoku>`            |
| `okototen`  | `<skam:okototen>...</skam:okototen>`          |
| `emphasis`  | `<skam:span type="emphasis">...</skam:span>`  |
| `tateten`   | `<skam:tateten>...</skam:tateten>`            |
| `highlight` | `<skam:span type="highlight">...</skam:span>` |
| `ref`       | `<skam:ref .../>`                             |

## 0.1 からの移行

0.1.x からの変更のうち、このパッケージに関わるものです。ID は全体の移行表と共通です。

| ID  | 旧挙動                                                                                                                                                                                                | 新挙動                                                                                                                                                                                                                                                                                                                                                                                                                                         | 回避策                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M01 | `@kanbun/*` として配布していた。リポジトリ内の 0.1.1 で改名したが、0.1.1 は npm に公開していない (2026-10-15 時点)。                                                                                  | `@kanbun-skam/*` で配布する。0.2.0 から npm では `@kanbun-skam/*` の名前だけを使う。                                                                                                                                                                                                                                                                                                                                                           | `package.json` の依存と import の指定子を `@kanbun-skam/*` に置き換える。                                                                                   |
| M02 | `ext`、`derivations`、`placementHint`、部分交差する範囲、ASCII 空白だけの token、存在しない参照などを `console.warn` を出して黙って捨てた。                                                           | 欠落があると `SKAMXMLStringifyError` (`losses` を持つ) を投げる。`console.warn` は使わない。`lossy: true` を指定した場合も、捨てたものは `onLoss` に通知する。                                                                                                                                                                                                                                                                                 | 従来どおり捨てたいときは `{ lossy: true }` を渡し、`onLoss` で捨てた内容を読む。`lossy: true` のときの戻り値は XML だけになる。                             |
| M03 | meta の形が今とは違った。ブロック先頭の kutoten / ref、content だけの ref、空のブロック、kun を含む範囲 yomigana は出力しなかった。複数 token の okimoji / joji / okototen / saidoku は黙って捨てた。 | meta は `<skam:meta tokenization="char"/>` と書く。上に挙げたものを出力する。範囲 yomigana と単字 kun が重なるときだけ `yomigana` の中に `kun` を入れる。複数 token の okimoji / joji / okototen / saidoku は包む要素として出力する。                                                                                                                                                                                                          | XML を diff する、または XML として保存している場合は、0.2.0 の出力で保存し直す。出力の形を固定する必要があるときは、0.2.0 の出力をスナップショットにする。 |
| M04 | 範囲 kun の入れ子、同じ範囲の yomigana と包む要素、範囲の途中の位置マーク、包む要素の中の saidoku などを、そのまま出力した。parser に拒否される XML を出すことがあった。                              | `UNNESTABLE_OVERLAP` として扱い、外側の範囲を捨てる。同じ anchor の同種の注記 (検証を通さなかった入力) は `CONFLICTING_MARKS` として扱う。既定では例外を投げ、`lossy: true` では `onLoss` に通知する。                                                                                                                                                                                                                                         | 入力の文書を直す。捨てることを許す場合は `{ lossy: true }` を渡し、`onLoss` で `code` を確かめる。                                                          |
| M08 | yomigana、okurigana、soegana、okimoji、joji、saidoku を同じ anchor に重ねても通った。                                                                                                                 | `MARK_CONFLICT` で拒否する。okototen、emphasis、highlight、tateten は重ねてよい (SKAM-draft §6.1)。                                                                                                                                                                                                                                                                                                                                            | `validateSKAMDocument` の `MARK_CONFLICT` の位置を探し、重複の片方を消すか、別の anchor に移す。parser では `{ validate: false }` で検査を外せる。          |
| M09 | ブロック先頭の kaeri を通した。                                                                                                                                                                       | `skam` の validator が `BLOCK_START_KAERI` (検証エラーの `kind`) で拒否する。`skam-xml-stringify` の欠落の `code` の `BLOCK_START_KAERI` とは別の型である。案内文は `BLOCK_START_KAERI_HINT`。                                                                                                                                                                                                                                                 | 返り点を前のブロックの最後の字の後に置くか、ブロックをまとめる。                                                                                            |
| M10 | okimoji / joji / okototen / saidoku の基底の中の `kun` と、入れ子の包む要素の注記を、エラーにせず黙って捨てた。okimoji の中の joji を許さない方針だった。                                             | これらを保持する。okimoji の中の joji は受理する (制限の緩和)。                                                                                                                                                                                                                                                                                                                                                                                | 対応は要らない。注意: 0.1.x の parser は、0.2.0 の `stringify` の出力の一部を黙って読み落とす。0.2.0 の出力は、0.2.0 以降の parser で読む。                 |
| M23 | なし。                                                                                                                                                                                                | `skam`: `isValidEmphasisStyle`、`BLOCK_START_KAERI_HINT`、`HIGHLIGHT_STYLES`、`isValidHighlightStyle`、`resolveOkototenCell`。`skam-xml-parser`: `SKAM_ML_CONTENT_MODEL` (`@experimental`)、`ParseWarning` / `onWarning`。`skam-xml-stringify`: `SKAM_ML_CONTENT_MODEL`、`SKAM_ML_NESTING_ORDER` (どちらも `@experimental`)、`SKAMXMLStringifyError` / `StringifyLoss`。`skam-html-renderer`: `validateRenderOptions` / `validateCSSOptions`。 | 対応は要らない。`@experimental` の API は、0.x の間はマイナーリリースで値が変わりうる。                                                                     |
| M24 | 条件オブジェクトで `import` が `types` より前にあった。`skam-web-component` の `./auto` には `types` がなかった。                                                                                     | `types` を先頭にする。`./auto` に `types` を足す。サブパスと実体は変わらない。                                                                                                                                                                                                                                                                                                                                                                 | 対応は要らない (非破壊の変更)。                                                                                                                             |

全体の移行表 (対象パッケージ、依存の更新を含む): https://github.com/berlysia/kanbun-annotation/blob/master/docs/migration-0.1-to-0.2.md

## 関連パッケージ

- [@kanbun-skam/skam](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam) - 型定義・バリデーター
- [@kanbun-skam/skam-xml-parser](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-xml-parser) - SKAM-ML/XML パーサー（逆方向の変換）
- [@kanbun-skam/skam-html-renderer](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-html-renderer) - HTML レンダラー

## 仕様書

- [SKAM-ML v0.1 仕様](https://github.com/berlysia/kanbun-annotation/blob/master/SKAM-ML-draft.md)

## ライセンス

MIT
