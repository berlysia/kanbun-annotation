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

```typescript
import { stringify } from '@kanbun-skam/skam-xml-stringify';

// XML 宣言なし
const xml = stringify(doc, { xmlDeclaration: false });

// インデントサイズの変更（デフォルト: 2）
const xml = stringify(doc, { indent: 4 });
```

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

## 関連パッケージ

- [@kanbun-skam/skam](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam) - 型定義・バリデーター
- [@kanbun-skam/skam-xml-parser](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-xml-parser) - SKAM-ML/XML パーサー（逆方向の変換）
- [@kanbun-skam/skam-html-renderer](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-html-renderer) - HTML レンダラー

## 仕様書

- [SKAM-ML v0.1 仕様](https://github.com/berlysia/kanbun-annotation/blob/master/SKAM-ML-draft.md)

## ライセンス

MIT
