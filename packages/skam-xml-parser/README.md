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

## IVS と結合文字

`parse` は本文を code point ごとに別の token にする。異体字セレクタ（IVS）や結合文字は、基底文字とは別の token になる。注記を付けるときは、基底文字の token を anchor にする。

## 0.1.x の parser との互換性

0.1.x の parser は、0.2.0 の `stringify` が出力する XML の一部を、エラーにせず黙って読み落とす。読み落とすのは次の 3 つの形で、0.1.x の parser はこれらの要素を `textContent` だけで読み、中の `skam:kun` の属性（yomi / okuri / soe）や入れ子の要素の注記を捨てる。

- `skam:yomigana` の中の `skam:kun`
- 字を包む要素（`skam:okimoji` / `skam:joji` / `skam:okototen`）の中の `skam:kun`
- 字を包む要素の入れ子

  0.2.0 以降の出力は、0.2.0 以降の parser で読むこと（SKAM-ML-draft の変更履歴「互換性の注意」を参照）。

## 位置情報

Node 版の `SKAMXMLParseError` は `line` / `column` を持つ。ブラウザ版（`browser` 条件で解決される DOMParser 実装）は、これらを持たない。

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

## 関連パッケージ

- [@kanbun-skam/skam](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam) - 型定義・バリデーター
- [@kanbun-skam/skam-html-renderer](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-html-renderer) - HTML レンダラー

## 仕様書

- [SKAM-ML v0.1 仕様](https://github.com/berlysia/kanbun-annotation/blob/master/SKAM-ML-draft.md)

## ライセンス

MIT
