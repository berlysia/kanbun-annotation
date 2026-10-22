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
      <skam:kun yomi="まな" okuri="びて">學</skam:kun><skam:okimoji>而</skam:okimoji>時<skam:kun okuri="ふ">習</skam:kun><skam:kaeri kind="re"/><skam:kun soe="を">之</skam:kun>
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

### Trusted Types が必須のページ (`@experimental`)

ブラウザ版の `parse` は `DOMParser.parseFromString` を使う。`require-trusted-types-for 'script'` のページでは、これに文字列を渡すと例外になる。`trustedTypesPolicy` に policy を渡すと、`parse` は事前の検査 (入力の長さと入れ子の深さ) の後に `createHTML(xml)` を 1 回呼び、その戻り値を `parseFromString` に渡す。

<!-- doctest:typecheck -->

```typescript
import { parse } from '@kanbun-skam/skam-xml-parser';

declare const xml: string;
declare const policy: { createHTML(input: string): unknown };

const doc = parse(xml, { trustedTypesPolicy: policy });
```

- `createHTML` は受け取った XML をそのまま返す。XML を書き換えると、入力の上限の検査と位置の計算が元の文字列とずれ、文書が壊れうる。HTML 用のサニタイザ (DOMPurify など) をそのまま渡さない。
- `application/xml` で読む文書ではスクリプトは動かないので、素通しの policy で足りる。policy は他のコードから使えない場所に置く。
- `createHTML` が投げた例外は、包まずにそのまま投げる。
- Node 版は xmldom で読むので、policy を受け取っても `createHTML` を呼ばない。
- `@kanbun-skam/skam-html-renderer` の `mount` に同じ policy を渡すと、`createHTML` は描画の HTML も受け取る。

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

### 拡張の宣言 (`<skam:meta>`)

使う拡張は `skam:meta` の子の `skam:extension` で宣言する。`required="true"` は、知らなければ読んではいけない拡張。拡張の値は、拡張の名前空間の属性で書く（学習・教育用拡張 `edu` の出題の印は `edu:quiz`、`skam:kun` の部分ごとには `edu:yomi-quiz` / `edu:okuri-quiz` / `edu:soe-quiz`）。

<!-- doctest:xml -->

```xml
<skam:doc xmlns:skam="urn:skam:1" xmlns:edu="urn:skam:edu:1">
  <skam:meta>
    <skam:extension name="edu" uri="urn:skam:edu:1" required="true"/>
  </skam:meta>
  <skam:body>
    <skam:block><skam:kun yomi="まな" okuri="ブ" edu:okuri-quiz="問1">學</skam:kun>而</skam:block>
  </skam:body>
</skam:doc>
```

JSON の `extensions` と `extensionsRequired`、注記の `ext.edu.quiz` になる。宣言の無い文書の `edu` の属性、`name` と `uri` が合わない宣言、知らない必須の拡張は誤り（`validate: false` でも）。登録されていない名前空間の属性は読み飛ばす。名前空間の URI は取りに行かない。選択肢 `extensions` で、既定の束に利用者の拡張の定義を足せる。

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

### 改行

`<skam:br/>` は、直前の字の後ろで行を改める。内容を持たない空要素で、子や文字を持つと誤りになる。`xml:id` を書くと、その値が mark の `id` になる。

<!-- doctest:xml block -->

```xml
春眠不覺曉<skam:br/>處處聞啼鳥
```

ブロックの先頭、ブロックの最後の字の後ろ、不可分単位の中（たて点のグループの中など）、同じ位置の 2 つ目に置いた `<skam:br/>` は、`validate: true`（既定）で `INVALID_LINEBREAK` の誤りになる。`validate: false` では読める（ブロック先頭の `<skam:br/>` は `after` の無い注記になる）。

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

ブロック、token、注記の ID は、手書きの ID と自動の ID に分かれる（SKAM-draft §3.1）。

- 手書きの ID は、要素の `xml:id`（無ければ `id` 属性）に書いた値で、XML の NCName に限る。`parse` はその値をそのまま使い、往復でも変わらない。ほかの文書から箇所を指すときは手書きの ID を使う
- `xml:id` の無いブロックは `b#1`、`b#2`…、token は `b#1#1`（ブロックの ID と、ブロックの中の順）、注記は `m#1`、`m#2`… になる。自動の ID は位置から決まるので、同じ XML からはいつも同じ値になる。本文を直すと変わる
- NCName でない `xml:id`（`1a`、`b#1` など）や、同じ値の `xml:id` が 2 つある XML は `SKAMXMLParseError` になる

## IVS と結合文字

`parse` は本文を拡張書記素クラスタ（Unicode の extended grapheme cluster）ごとに 1 つの token にする。異体字セレクタ（IVS・SVS）や結合文字は、基底文字と同じ token に入る。`<skam:p>葛&#xE0100;城</skam:p>` は `葛` + U+E0100 と `城` の 2 つの token になる。分割は `@kanbun-skam/skam` の `splitGraphemes` で、`Intl.Segmenter` が要る（無い実行環境では `TypeError`）。

- 分けるのはテキストノードごと。要素をまたぐクラスタは作らない。`<skam:kun ...>葛</skam:kun>&#xE0100;` の IVS は、要素の後ろで単独の token になる。テキストの先頭に結合文字や異体字セレクタだけが来た場合も同じ。
- 無視する空白（U+0009・U+000A・U+000D・U+0020）は、クラスタの先頭から取り除く。残りが空なら token にならない（`\r\n` など）。空白の後ろに結合文字が続くときは、結合文字だけが token になる。U+3000 は token になる。
- `trackPositions: true` の位置は、クラスタの先頭の字を指す。リテラルで書いたクラスタは終端までを含み、文字参照が混ざるときは先頭の字までを含む。
- 実行環境が持つ Unicode の版で、絵文字の ZWJ 列などの分かれ方が変わりうる。CJK の字、IVS、SVS、結合文字の組は版で変わらない。

注記を付けるときは、クラスタの token を anchor にする。

## 0.1.x の parser との互換性

0.1.x の parser は、0.2.0 の `stringify` が出力する XML の一部を、エラーにせず黙って読み落とす。読み落とすのは次の 3 つの形で、0.1.x の parser はこれらの要素を `textContent` だけで読み、中の `skam:kun` の属性（yomi / okuri / soe）や入れ子の要素の注記を捨てる。

- `skam:yomigana` の中の `skam:kun`
- 字を包む要素（`skam:okimoji` / `skam:joji` / `skam:okototen`）の中の `skam:kun`
- 字を包む要素の入れ子

  0.2.0 以降の出力は、0.2.0 以降の parser で読むこと（SKAM-ML-draft の変更履歴「互換性の注意」を参照）。

## 位置情報

Node 版の `SKAMXMLParseError` は `line` / `column` を持つ。要素の処理中に投げる例外は、すべてその要素の位置を持つ（入力が空、または XML の空白（U+0020、U+0009、U+000D、U+000A）だけのときの `Empty document` だけは位置を持たない。この判定は Node 版でもブラウザ版でも同じで、`''` と空白だけの入力は、どちらでも `Empty document` になる）。

`validate: true`（既定）で検証が失敗したときは、`SKAMValidationError.errors` の各エラーに、元の要素の `line` / `column` が付く。付くのは、`path` が `tokens[i]` / `marks[i]` / `blocks[i]` で始まるエラーだけで、`readings` や文書全体を指すエラーには付かない。1 つの要素から展開された複数の mark は、どれも元の要素の位置を持つ。`trackPositions` の値とは関係なく付く。`@kanbun-skam/skam` の `validateSKAMDocument` を直接呼んだときは付かない。

ブラウザ版（`browser` 条件で解決される DOMParser 実装）も、要素の処理中の誤り、検証の誤り、警告（`onWarning`）に、Node 版と同じ位置を付ける。位置は要素の開始タグの `<` で、行と列は 1 始まり、列は UTF-16 単位で数える。ブラウザの DOM は位置を持たないので、誤りが起きたときに元の文字列の開始タグと文書の要素を順に対応させて求める。数か要素名の並びが合わないときは、位置を付けない。

XML の構文の誤り（タグの食い違いなど）では、ブラウザ版は Chromium と Firefox が報告する位置を読む。値の意味はブラウザごとに違い（Chromium は誤りを見つけた直後、Firefox は誤りの字句の付近）、Node 版の値とも一致しない。誤りの付近を探す手がかりとして使い、値の比較やスナップショットには使わない。報告の形を読めないブラウザ（WebKit は未確認）では、構文の誤りに位置を付けない。

ブラウザ版の構文の誤りのメッセージは `XML parse error: <理由>` の形になる。理由はブラウザが報告する文から取り出した 1 行で、本文はブラウザごとに違い、500 字（UTF-16 の単位）を超えると切って `…` を足す。ブラウザが文に添える補足や、Firefox が写す元の行は含まない。制御文字は取り除く。報告の形を読めないブラウザでは、文全体（同じ規則で整えたもの）が理由になる。

## 実験的な API

`SKAM_ML_CONTENT_MODEL` は `@experimental`。仕様の改訂に合わせて変わりうる。同じ fixed group の同じ版どうしでだけ、内容の一致を保証する。

ブロック先頭の返り点（`skam:kaeri`）は誤りとして扱う。同じ位置の複数の kaeri は正しい書き方として許す。

ハイフンで連結した `kind`（`ichi-re`）は 0.3 では読めるが非推奨で、0.4.0 で誤りになる。1 つの注記として読み、`onWarning` に `code: 'KAERI_MULTI_CHARACTER'` の警告を出す（`validate: false` でも出る）。正の書き方は、同じ位置に `<skam:kaeri kind="ichi"/><skam:kaeri kind="re"/>` と並べること。エラーの案内文は `@kanbun-skam/skam` の `BLOCK_START_KAERI_HINT` にある。

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

メッセージの文言は互換の対象外。判別には `instanceof` と `line` / `column` を使う。`error.message` は入力から来た文字列（要素名など）を含むので、`innerHTML` に入れない。

`instanceof SKAMXMLParseError` は、依存の重複や iframe でも真になる。クラスに `Symbol.for('@kanbun-skam/skam-xml-parser/SKAMXMLParseError')` の目印を持たせ、それで判別している。依存の重複はテストで確かめた。iframe（別の realm）は、`Symbol.for` のレジストリが realm の間で共有されることに基づく（ADR-033 KD10 で `node:vm` により確かめた）。ただし、目印を入れた版より前のコピーと混在すると、両方向で偽になる。別の realm の誤りは `instanceof Error` が偽になる。`structuredClone` や `postMessage` で複製した誤りは偽になる。目印を手で付けた object も真になるので、`instanceof` は型の判別であって、中身が安全だという保証ではない（`message` や `SKAMValidationError` の `errors` は利用者の入力を含む）。

## 0.1 からの移行

0.1.x から上げるときにやることは [移行の文書](https://github.com/berlysia/kanbun-annotation/blob/master/docs/migration-0.1-to-0.2.md) にまとめてある。

## 関連パッケージ

- [@kanbun-skam/skam](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam) - 型定義・バリデーター
- [@kanbun-skam/skam-html-renderer](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-html-renderer) - HTML レンダラー

## 仕様書

- [SKAM-ML v0.1 仕様](https://github.com/berlysia/kanbun-annotation/blob/master/SKAM-ML-draft.md)

## ライセンス

MIT
