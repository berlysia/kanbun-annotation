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

## 関連パッケージ

- [@kanbun-skam/skam-xml-parser](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-xml-parser) - SKAM-ML/XML パーサー
- [@kanbun-skam/skam-html-renderer](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-html-renderer) - HTML レンダラー

## 仕様書

- [SKAM v0.1 仕様](https://github.com/berlysia/kanbun-annotation/blob/master/SKAM-draft.md)
- [SKAM-ML v0.1 仕様](https://github.com/berlysia/kanbun-annotation/blob/master/SKAM-ML-draft.md)

## ライセンス

MIT
