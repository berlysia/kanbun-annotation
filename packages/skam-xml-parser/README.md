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

```xml
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>...</skam:body>
  <skam:readings>...</skam:readings>
  <skam:notes>...</skam:notes>
</skam:doc>
```

### 本文 (`<skam:body>`)

```xml
<skam:body>
  <skam:block>學而時習之</skam:block>
  <skam:block>不亦説乎</skam:block>
</skam:body>
```

### 訓読注記（インライン）

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

```xml
<skam:saidoku>
  <skam:base>將</skam:base>
  <skam:kunform n="1" yomi="まさ" okuri="に"/>
  <skam:kunform n="2" okuri="す"/>
</skam:saidoku>
```

### その他の注記

```xml
<!-- たて点（熟語境界） -->
<skam:tateten>國家</skam:tateten>

<!-- 傍点 -->
<skam:span type="emphasis" kind="dot">學而時</skam:span>

<!-- ヲコト点 -->
<skam:okototen grid="5x5" x="4" y="4" shape="dot" sound="り">國</skam:okototen>
```

### 注釈 (`<skam:notes>`)

```xml
<skam:body>
  <skam:block>學而時習之<skam:ref target="#n1"/></skam:block>
</skam:body>
<skam:notes>
  <skam:note xml:id="n1">「之」は目的語として読む。</skam:note>
</skam:notes>
```

### 読み層 (`<skam:readings>`)

```xml
<skam:readings>
  <skam:reading kind="kundoku">学びて時に之を習ふ</skam:reading>
  <skam:reading kind="kakikudashi">学びて時にこれを習ふ</skam:reading>
  <skam:reading kind="yomiage">まなびて ときに これを ならう</skam:reading>
</skam:readings>
```

## エラーハンドリング

```typescript
import { parse, SKAMXMLParseError } from '@kanbun-skam/skam-xml-parser';

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
