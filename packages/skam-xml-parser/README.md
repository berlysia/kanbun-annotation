# @kanbun/skam-xml-parser

**SKAM-ML/XML** から **SKAM JSON** へのパーサー。

人間が編集しやすい XML 形式のマークアップを、プログラムで処理しやすい SKAM JSON に変換。

## インストール

```bash
npm install @kanbun/skam-xml-parser
# or
pnpm add @kanbun/skam-xml-parser
```

## 使い方

```typescript
import { parse } from '@kanbun/skam-xml-parser';

const xml = `
<skam xmlns="https://kanbun.example/ns/skam/0.1">
  <text>
    <c id="t1">学</c>
    <c id="t2">而</c>
    <c id="t3">時</c>
    <c id="t4">習</c>
    <c id="t5">之</c>
  </text>
  <marks>
    <okurigana for="t1">びて</okurigana>
    <okurigana for="t3">に</okurigana>
    <soegana for="t5">を</soegana>
    <okurigana for="t4">ふ</okurigana>
    <kaeri for="t5">レ</kaeri>
  </marks>
  <readings>
    <kakikudashi>学びて時に之を習ふ</kakikudashi>
  </readings>
</skam>
`;

const doc = parse(xml);
// doc: SKAMDocument
```

## SKAM-ML 構文

### ルート要素

```xml
<skam xmlns="https://kanbun.example/ns/skam/0.1">
  <text>...</text>
  <marks>...</marks>
  <readings>...</readings>
</skam>
```

### 本文 (`<text>`)

```xml
<text>
  <c id="t1">学</c>      <!-- 単一文字 -->
  <c id="t2">而</c>
</text>
```

### 注記 (`<marks>`)

```xml
<marks>
  <kaeri for="t1">レ</kaeri>
  <okurigana for="t1">びて</okurigana>
  <yomigana for="t1">がく</yomigana>
  <soegana for="t1">を</soegana>
  <okimoji for="t1" />
  <kutoten for="t1">。</kutoten>
</marks>
```

### 読み層 (`<readings>`)

```xml
<readings>
  <kakikudashi>書き下し文テキスト</kakikudashi>
  <yomiage>読み上げ用テキスト</yomiage>
</readings>
```

## エラーハンドリング

```typescript
import { parse, SKAMXMLParseError } from '@kanbun/skam-xml-parser';

try {
  const doc = parse(xmlString);
} catch (e) {
  if (e instanceof SKAMXMLParseError) {
    console.error('Parse error:', e.message);
  }
}
```

## 関連パッケージ

- [@kanbun/skam](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam) - 型定義・バリデーター
- [@kanbun/skam-html-renderer](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-html-renderer) - HTML レンダラー

## 仕様書

- [SKAM-ML v0.1 仕様](https://github.com/berlysia/kanbun-annotation/blob/master/SKAM-ML-draft.md)

## ライセンス

MIT
