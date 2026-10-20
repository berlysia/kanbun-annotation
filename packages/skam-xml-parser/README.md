# @kanbun-skam/skam-xml-parser

**SKAM-ML/XML** から **SKAM JSON** へのパーサー。

人間が編集しやすい XML 形式のマークアップを、プログラムで処理しやすい SKAM JSON に変換。

## インストール

```bash
npm install @kanbun-skam/skam-xml-parser
# or
pnpm add @kanbun-skam/skam-xml-parser
```

## 使い方

<!-- doctest -->

```typescript
import { parse } from '@kanbun-skam/skam-xml-parser';

const xml = `
<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      <skam:kun yomi="まな" okuri="びて">學</skam:kun><skam:okimoji>而</skam:okimoji>時<skam:kaeri kind="re"/><skam:kun soe="を">之</skam:kun><skam:kun okuri="ふ">習</skam:kun>
    </skam:block>
  </skam:body>
  <skam:readings>
    <skam:reading kind="kakikudashi">学びて時に之を習ふ</skam:reading>
  </skam:readings>
</skam:doc>
`;

const doc = parse(xml);
// doc: SKAMDocument
```

### `<script>` から SKAM-ML を取り出す (`@experimental`)

HTML に `<script type="application/vnd.berlysia.skam+xml">` で埋め込んだ SKAM-ML は、`extractXmlFromScriptElement` で取り出せる。メディアタイプは `SKAM_XML_MEDIA_TYPE` (SKAM-ML 仕様 §3.3 で確定)。最初に見つかった要素の中身を trim して返し、無いか空なら `null` を返す。

<!-- doctest:typecheck -->

```typescript
import { extractXmlFromScriptElement, parse } from '@kanbun-skam/skam-xml-parser';

declare const lesson: { querySelector(selector: string): { textContent: string | null } | null };

const xml = extractXmlFromScriptElement(lesson); // HTMLElement や Document も渡せる
if (xml !== null) {
  const doc = parse(xml);
}
```

- 第三者が書ける領域 (コメント欄など) があるページでは、`document` でなく、教材を置いた信頼できる要素を渡す。`document` を渡すと、ページ全体で最初に見つかった `<script>` を取る。
- 取り出した文字列は、必ず `parse` に通してから使う。
- Web Component (`@kanbun-skam/skam-web-component`) からも同じ関数を import できる。

## SKAM-ML 構文

### ルート要素

<!-- doctest:skip 子要素を省略記号で示した構造の例 -->

```xml
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>...</skam:body>
  <skam:readings>...</skam:readings>
  <skam:notes>...</skam:notes>
</skam:doc>
```

### 本文 (`<skam:body>`)

<!-- doctest:xml body -->

```xml
<skam:body>
  <skam:block>學而時習之</skam:block>
  <skam:block>不亦説乎</skam:block>
</skam:body>
```

### 訓読注記（インライン）

<!-- doctest:xml block -->

```xml
<skam:block>
  <!-- 訓（読み仮名+送り仮名） -->
  <skam:kun yomi="まな" okuri="びて">學</skam:kun>

  <!-- 読み仮名のみ -->
  <skam:yomigana value="がく">學</skam:yomigana>

  <!-- 送り仮名のみ -->
  <skam:kun okuri="びて">學</skam:kun>

  <!-- 添え仮名（助詞など） -->
  <skam:kun soe="を">之</skam:kun>

  <!-- 置字（読まない文字） -->
  <skam:okimoji>而</skam:okimoji>

  <!-- 返り点 -->
  <skam:kaeri kind="re"/>      <!-- レ点 -->
  <skam:kaeri kind="ichi"/>    <!-- 一 -->
  <skam:kaeri kind="ni"/>      <!-- 二 -->
  <skam:kaeri kind="san"/>     <!-- 三 -->
  <skam:kaeri kind="jo"/>      <!-- 上 -->
  <skam:kaeri kind="chu"/>     <!-- 中 -->
  <skam:kaeri kind="ge"/>      <!-- 下 -->
  <skam:kaeri kind="ko"/>      <!-- 甲 -->
  <skam:kaeri kind="otsu"/>    <!-- 乙 -->

  <!-- 句読点 -->
  <skam:kutoten value="。" kind="ku"/>
  <skam:kutoten value="、" kind="ten"/>
</skam:block>
```

### 再読文字

<!-- doctest:xml block -->

```xml
<skam:saidoku>
  <skam:base>將</skam:base>
  <skam:kunform n="1" yomi="まさ" okuri="に"/>
  <skam:kunform n="2" okuri="す"/>
</skam:saidoku>
```

### その他の注記

<!-- doctest:xml block -->

```xml
<!-- たて点（熟語境界） -->
<skam:tateten>國家</skam:tateten>

<!-- 傍点 -->
<skam:span type="emphasis" kind="dot">學而時</skam:span>

<!-- ヲコト点 -->
<skam:okototen grid="5x5" x="4" y="4" shape="dot" sound="り">國</skam:okototen>
```

### 注釈 (`<skam:notes>`)

<!-- doctest:xml -->

```xml
<skam:doc xmlns:skam="urn:skam:1">
  <skam:body>
    <skam:block>學而時習之<skam:ref xml:id="n1"/></skam:block>
  </skam:body>
  <skam:notes>
    <skam:note ref="n1">「之」は目的語として読む。</skam:note>
  </skam:notes>
</skam:doc>
```

### 読み層 (`<skam:readings>`)

<!-- doctest:skip doc の子要素だけの断片 -->

```xml
<skam:readings>
  <skam:reading kind="kundoku">学びて時に之を習ふ</skam:reading>
  <skam:reading kind="kakikudashi">学びて時にこれを習ふ</skam:reading>
  <skam:reading kind="yomiage">まなびて ときに これを ならう</skam:reading>
</skam:readings>
```

## 往復変換と ID

XML には token と mark の ID を書かない。`parse` はこれらの ID を毎回生成し直すので、JSON → XML → JSON と往復すると、token と mark の ID は元の値と一致しない。token や mark の ID を使った外部の参照は、往復で失われる。block と ref の `xml:id` は XML に書かれ、`parse` はそれを読む（`xml:id` がなければ生成する）。

決定的な出力が要るとき（スナップショットテストなど）は、`idGenerator: createSequentialIdGenerator()` を渡す。`createSequentialIdGenerator` は `@kanbun-skam/skam` から import する。

## IVS と結合文字

`parse` は本文を code point ごとに別の token にする。異体字セレクタ（IVS）や結合文字は、基底文字とは別の token になる。注記を付けるときは、基底文字の token を anchor にする。

## 0.1.x の parser との互換性

0.1.x の parser は、0.2.0 の `stringify` が出力する XML の一部を、エラーにせず黙って読み落とす。読み落とすのは次の 3 つの形で、0.1.x の parser はこれらの要素を `textContent` だけで読み、中の `skam:kun` の属性（yomi / okuri / soe）や入れ子の要素の注記を捨てる。

- `skam:yomigana` の中の `skam:kun`
- 字を包む要素（`skam:okimoji` / `skam:joji` / `skam:okototen`）の中の `skam:kun`
- 字を包む要素の入れ子

  0.2.0 以降の出力は、0.2.0 以降の parser で読むこと（SKAM-ML-draft の変更履歴「互換性の注意」を参照）。

## 位置情報

Node 版の `SKAMXMLParseError` は `line` / `column` を持つ。要素の処理中に投げる例外は、すべてその要素の位置を持つ（文書が空のときの `Empty document` だけは位置を持たない）。

`validate: true`（既定）で検証が失敗したときは、`SKAMValidationError.errors` の各エラーに、元の要素の `line` / `column` が付く。付くのは、`path` が `tokens[i]` / `marks[i]` / `blocks[i]` で始まるエラーだけで、`readings` や文書全体を指すエラーには付かない。1 つの要素から展開された複数の mark は、どれも元の要素の位置を持つ。`trackPositions` の値とは関係なく付く。`@kanbun-skam/skam` の `validateSKAMDocument` を直接呼んだときは付かない。

ブラウザ版（`browser` 条件で解決される DOMParser 実装）も、要素の処理中の誤り、検証の誤り、警告（`onWarning`）に、Node 版と同じ位置を付ける。位置は要素の開始タグの `<` で、行と列は 1 始まり、列は UTF-16 単位で数える。ブラウザの DOM は位置を持たないので、誤りが起きたときに元の文字列の開始タグと文書の要素を順に対応させて求める。数か要素名の並びが合わないときは、位置を付けない。

XML の構文の誤り（タグの食い違いなど）では、ブラウザ版は Chromium と Firefox が報告する位置を読む。値の意味はブラウザごとに違い（Chromium は誤りを見つけた直後、Firefox は誤りの字句の付近）、Node 版の値とも一致しない。誤りの付近を探す手がかりとして使い、値の比較やスナップショットには使わない。報告の形を読めないブラウザ（WebKit は未確認）では、構文の誤りに位置を付けない。

0.2.0 のブラウザ版は、どちらの位置も持たなかった。

## 実験的な API

`SKAM_ML_CONTENT_MODEL` は `@experimental`。仕様の改訂に合わせて変わりうる。同じ fixed group の同じ版どうしでだけ、内容の一致を保証する。

ブロック先頭の返り点（`skam:kaeri`）は誤りとして扱う。同じ位置に重複した kaeri は検査しない。エラーの案内文は `@kanbun-skam/skam` の `BLOCK_START_KAERI_HINT` にある。

## エラーハンドリング

<!-- doctest:typecheck -->

```typescript
import { parse, SKAMXMLParseError } from '@kanbun-skam/skam-xml-parser';

declare const xmlString: string;

try {
  const doc = parse(xmlString);
} catch (e) {
  if (e instanceof SKAMXMLParseError) {
    console.error('Parse error:', e.message);
  }
}
```

## 0.1 からの移行

0.1.x からの変更のうち、このパッケージに関わるものです。ID は全体の移行表と共通です。

| ID  | 旧挙動                                                                                                                                                                                                                 | 新挙動                                                                                                                                                                                                                                                                                                                                                                                                                                         | 回避策                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M01 | npm には 0.1.0 から `@kanbun-skam/*` の名前で公開している (`@kanbun/*` は npm に公開していない)。リポジトリの CHANGELOG には、未公開の 0.1.1 として `@kanbun` からの改名が書かれていた。                               | 名前は変わらない。CHANGELOG から未公開の 0.1.1 の節を消し、0.1.0 の次を 0.2.0 とした。                                                                                                                                                                                                                                                                                                                                                         | 不要。                                                                                                                                                                                        |
| M05 | `<!` で始まる宣言、深い入れ子、長い入力を受け付けた。xmldom の警告は無視した。名前空間と内容モデルを厳密には見なかった。パース後に検証しなかった。                                                                     | `<!` の宣言、`maxDepth` (既定 64) を超える入れ子、`maxInputLength` (既定 5,000,000) を超える入力を拒否する。xmldom の警告を行と列つきのエラーにする。SKAM の名前空間と内容モデルを検査する。U+3000 を token として残し、CDATA も token にする。結果を検証し、失敗は `SKAMValidationError` で投げる。                                                                                                                                           | 検証だけを外すには `{ validate: false }` を渡す。XML の構造の拒否は外せないので、XML を直す。入力の制限は `maxDepth` / `maxInputLength` で変えられる。                                        |
| M06 | ブロック先頭の kaeri を、そのまま JSON にした。                                                                                                                                                                        | parser が XML を読む段階で拒否する。JSON の文書に写せないため、`validate: false` でも通らない。                                                                                                                                                                                                                                                                                                                                                | XML を直す。kaeri を前のブロックの最後の字の後に置くか、ブロックをまとめる。                                                                                                                  |
| M07 | 空の token `text`、空の `saidoku.forms`、ブロック・token・mark にまたがる ID の重複、グリッドの外の okototen の座標、書式に合わない `emphasis.style`、型の違う `id` / `ext` / `placementHint` / `forms[].n` を通した。 | これらを拒否する。parser は既定で検証するので、XML からの文書にも同じ検査が及ぶ。                                                                                                                                                                                                                                                                                                                                                              | 保存済みの JSON を `validateSKAMDocument` で一括検査し、エラーの `kind` ごとに直す (`INVALID_VALUE`、`DUPLICATE_ID`、`INVALID_TYPE` など)。parser では `{ validate: false }` で検査を外せる。 |
| M08 | yomigana、okurigana、soegana、okimoji、joji、saidoku を同じ anchor に重ねても通った。                                                                                                                                  | `MARK_CONFLICT` で拒否する。okototen、emphasis、highlight、tateten は重ねてよい (SKAM-draft §6.1)。                                                                                                                                                                                                                                                                                                                                            | `validateSKAMDocument` の `MARK_CONFLICT` の位置を探し、重複の片方を消すか、別の anchor に移す。parser では `{ validate: false }` で検査を外せる。                                            |
| M09 | ブロック先頭の kaeri を通した。                                                                                                                                                                                        | `skam` の validator が `BLOCK_START_KAERI` (検証エラーの `kind`) で拒否する。`skam-xml-stringify` の欠落の `code` の `BLOCK_START_KAERI` とは別の型である。案内文は `BLOCK_START_KAERI_HINT`。                                                                                                                                                                                                                                                 | 返り点を前のブロックの最後の字の後に置くか、ブロックをまとめる。                                                                                                                              |
| M10 | okimoji / joji / okototen / saidoku の基底の中の `kun` と、入れ子の包む要素の注記を、エラーにせず黙って捨てた。okimoji の中の joji を許さない方針だった。                                                              | これらを保持する。okimoji の中の joji は受理する (制限の緩和)。                                                                                                                                                                                                                                                                                                                                                                                | 対応は要らない。注意: 0.1.x の parser は、0.2.0 の `stringify` の出力の一部を黙って読み落とす。0.2.0 の出力は、0.2.0 以降の parser で読む。                                                   |
| M11 | 空のブロックを拒否した。未知の `skam:*` 要素は黙って無視した。`SKAMValidationError` は `skam` からしか import できなかった。                                                                                           | 空のブロックを受理する。未知の `skam:*` 要素を `onWarning` (`ParseWarning`) に通知する。`SKAMValidationError` を再 export する。                                                                                                                                                                                                                                                                                                               | 対応は要らない (非破壊の追加と緩和)。                                                                                                                                                         |
| M23 | なし。                                                                                                                                                                                                                 | `skam`: `isValidEmphasisStyle`、`BLOCK_START_KAERI_HINT`、`HIGHLIGHT_STYLES`、`isValidHighlightStyle`、`resolveOkototenCell`。`skam-xml-parser`: `SKAM_ML_CONTENT_MODEL` (`@experimental`)、`ParseWarning` / `onWarning`。`skam-xml-stringify`: `SKAM_ML_CONTENT_MODEL`、`SKAM_ML_NESTING_ORDER` (どちらも `@experimental`)、`SKAMXMLStringifyError` / `StringifyLoss`。`skam-html-renderer`: `validateRenderOptions` / `validateCSSOptions`。 | 対応は要らない。`@experimental` の API は、0.x の間はマイナーリリースで値が変わりうる。                                                                                                       |
| M24 | 条件オブジェクトで `import` が `types` より前にあった。`skam-web-component` の `./auto` には `types` がなかった。                                                                                                      | `types` を先頭にする。`./auto` に `types` を足す。サブパスと実体は変わらない。                                                                                                                                                                                                                                                                                                                                                                 | 対応は要らない (非破壊の変更)。                                                                                                                                                               |
| M26 | 0.8.15 より前の版 (0.8.11 など) に解決された。0.8.11 には、15 件の advisory が関係する (2026-10-15 時点)。                                                                                                             | `^0.8.15` を指定する (0.8.15 以上の 0.8 系。lockfile は 0.8.15 に解決する)。0.8.15 に関係する advisory は 0 件である。advisory の ID は「依存の更新」の節に挙げる。                                                                                                                                                                                                                                                                            | 対応は要らない。利用側で xmldom の版を固定している場合は、0.8.15 以上の 0.8 系に上げる。                                                                                                      |
| M35 | `SKAMXMLParseError` のうち、ルート要素の違い、必須属性の欠落、未知の kind、空の内容、`<skam:body>` の欠落などは `line` / `column` を持たなかった。                                                                     | 要素の処理中に投げるすべての `SKAMXMLParseError` が、その要素の `line` / `column` を持つ (Node 版)。空文書の `Empty document` は位置を持たない。ブラウザ版は持たない。メッセージの文言は変わらない。                                                                                                                                                                                                                                           | 対応は要らない (非破壊の追加)。                                                                                                                                                               |
| M36 | `SKAMValidationError.errors` の各要素は `kind` / `path` / `message` (と `expected` / `actual`) だけで、元の SKAM-ML の位置を示さなかった。                                                                             | `ValidationError` に任意の `line` / `column` を足した。Node 版の `parse()` (`validate: true`) が投げる `SKAMValidationError` で、`path` が `tokens[i]` / `marks[i]` / `blocks[i]` で始まるエラーに付く。`validateSKAMDocument` を直接呼んだときと、ブラウザ版では付かない (キーごと無い)。                                                                                                                                                     | 型は非破壊。parser 経由の検証エラーにはキーが増えるので、エラーを `toEqual` で比べている利用側のテストは差が出る。比較から `line` / `column` を外すか、`toMatchObject` を使う。               |

全体の移行表 (対象パッケージ、依存の更新を含む): https://github.com/berlysia/kanbun-annotation/blob/master/docs/migration-0.1-to-0.2.md

## 関連パッケージ

- [@kanbun-skam/skam](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam) - 型定義・バリデーター
- [@kanbun-skam/skam-html-renderer](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-html-renderer) - HTML レンダラー

## 仕様書

- [SKAM-ML v0.1 仕様](https://github.com/berlysia/kanbun-annotation/blob/master/SKAM-ML-draft.md)

## ライセンス

MIT
