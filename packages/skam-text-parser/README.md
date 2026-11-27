# @kanbun-skam/skam-text-parser

手で打つ平文の簡易記法から **SKAM 文書（JSON）** を作る parser。記法は [docs/skam-text-notation.md](../../docs/skam-text-notation.md) にある。

private のパッケージで、npm には公開していない。

## 使い方

```typescript
import { parse } from '@kanbun-skam/skam-text-parser';

const result = parse('學（まな）びて而時に習ふ＜レ＞之を。');
if (result.ok) {
  console.log(result.document.marks);
} else {
  for (const d of result.diagnostics) console.log(`${d.line}:${d.column} ${d.code} ${d.message}`);
}
```

記号の差し替えと機能の切り替えは `createParser` の設定で行う。設定が矛盾していれば `NotationConfigError` を投げる。

```typescript
import { createParser } from '@kanbun-skam/skam-text-parser';

const parser = createParser({
  features: { soegana: false },
  symbols: { kaeri: [{ open: '［', close: '］' }] },
});
const result = parser.parse('習ふ［レ］之を。');
```
