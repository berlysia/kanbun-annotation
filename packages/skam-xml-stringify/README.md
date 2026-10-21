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
  lang: 'ja',
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

文書の `lang` が文字列なら、ルートに `xml:lang` として書く（値は XML の属性値として escape する）。`lang` が無い文書は `xml:lang` を書かない。

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

### 拡張

宣言のある文書（`extensions` を持つ文書）は、`skam:meta` に `skam:extension` を、ルートに拡張の名前空間を書き、拡張の値を定義の `writeXmlAttributes` が返す属性にする（学習・教育用拡張 `edu` の出題の印は `edu:quiz` など）。選択肢 `extensions` で、既定の束に利用者の拡張の定義を足せる。拡張を使わない文書の出力は変わらない。

## 欠落契約

SKAM-ML で表現できない内容は、黙って捨てない。`stringify` は既定で `SKAMXMLStringifyError` を投げる。表現できなかった項目の一覧は、エラーの `losses` にある（文書の順に並ぶ）。

各 loss は `category`、`code`、`path`（JSON Pointer）、`message`（必要なら `markId`）を持つ。

`instanceof SKAMXMLStringifyError` は、依存の重複や iframe でも真になる。クラスに `Symbol.for('@kanbun-skam/skam-xml-stringify/SKAMXMLStringifyError')` の目印を持たせ、それで判別している。依存の重複はテストで確かめた。iframe（別の realm）は、`Symbol.for` のレジストリが realm の間で共有されることに基づく（ADR-033 KD10 で `node:vm` により確かめた）。ただし、目印を入れた版より前のコピーと混在すると、両方向で偽になる。別の realm の誤りは `instanceof Error` が偽になる。`structuredClone` や `postMessage` で複製した誤りは偽になる。目印を手で付けた object も真になるので、`instanceof` は型の判別であって、中身が安全だという保証ではない（`losses` や `message` は利用者の入力を含む）。

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

| code                     | 分類              | 内容                                                                               |
| ------------------------ | ----------------- | ---------------------------------------------------------------------------------- |
| `DERIVATIONS`            | `unrepresentable` | `derivations` は SKAM-ML に書けない（コンパイル時に生成される）                    |
| `ASCII_WHITESPACE_TOKEN` | `unrepresentable` | SKAM-ML が無視する空白だけの token                                                 |
| `MULTI_GRAPHEME_TOKEN`   | `unrepresentable` | 拡張書記素クラスタを 2 つ以上含む token（読み直すと複数の token に分かれる）       |
| `BLOCK_START_KAERI`      | `unrepresentable` | ブロック先頭の返り点（直前の token がない）                                        |
| `BLOCK_START_LINEBREAK`  | `unrepresentable` | ブロック先頭の改行（直前の token がない）                                          |
| `DANGLING_REFERENCE`     | `unrepresentable` | 存在しない token / block、またはどのブロックにも属さない token を指す              |
| `CROSS_BLOCK_ANCHOR`     | `unrepresentable` | 複数のブロックにまたがる anchor                                                    |
| `PARTIAL_OVERLAP`        | `unsupported`     | 範囲が部分的に重なり、入れ子にできない                                             |
| `UNNESTABLE_OVERLAP`     | `unsupported`     | 内容モデル（SKAM-ML §7.0）上、入れ子にできない範囲                                 |
| `CONFLICTING_MARKS`      | `unrepresentable` | 同じ anchor に同じ種類の注記が 2 つ以上ある                                        |
| `EXT`                    | `unsupported`     | `ext` と `custom` を書く場所がない（宣言のある文書で書く場所の無い拡張の値を含む） |
| `UNKNOWN_EXTENSION`      | `unsupported`     | 書き方を知らない拡張の値、または名前空間の URI が分からない拡張の宣言              |
| `PLACEMENT_HINT`         | `unsupported`     | `placementHint` を書く場所がない                                                   |

### token と書記素

1 つの token は拡張書記素クラスタ 1 つに限る。IVS・SVS・結合文字を基底文字と同じ token に持つのは損失ではない。`text: '学問'` のように 2 つ以上のクラスタを持つ token は `MULTI_GRAPHEME_TOKEN` になる（path は `/tokens/<添字>`、message に本文は入らない）。1 字ずつの token に分けるか、`lossy: true` で受け入れる。空白だけの token は `ASCII_WHITESPACE_TOKEN` だけを報告する。

次の 2 つは損失として報告しないが、読み直すと token が変わる。どちらも `parse` が作る token には現れず、手で書いた JSON にだけ現れる。

- 無視する空白で始まり、空白だけではない token（`' \u0301'`）: 先頭の空白が落ちる。
- 結合文字や選択子で始まる token が、前の token と同じテキストに書かれる（`['葛', '\u{E0100}']`）: 1 つの token にまとまる。

### 内容モデル表

`SKAM_ML_CONTENT_MODEL` は `@experimental`。仕様の改訂に合わせて変わりうる。同じ fixed group の同じ版どうしでだけ、内容の一致を保証する。

## 対応 Mark Types

全 14 種の SKAM v0.1 mark type をサポート:

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
| `linebreak` | `<skam:br/>`                                  |

## 0.1 からの移行

0.1.x から上げるときにやることは [移行の文書](https://github.com/berlysia/kanbun-annotation/blob/master/docs/migration-0.1-to-0.2.md) にまとめてある。

## 関連パッケージ

- [@kanbun-skam/skam](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam) - 型定義・バリデーター
- [@kanbun-skam/skam-xml-parser](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-xml-parser) - SKAM-ML/XML パーサー（逆方向の変換）
- [@kanbun-skam/skam-html-renderer](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-html-renderer) - HTML レンダラー

## 仕様書

- [SKAM-ML v0.1 仕様](https://github.com/berlysia/kanbun-annotation/blob/master/SKAM-ML-draft.md)

## ライセンス

MIT
