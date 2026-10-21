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

## 複数の字の kaeri

1 つの kaeri の `value` に複数の字を書く形（`㆒㆑`）は非推奨で、0.4.0 で誤りになる。0.3 では `valid: true` の結果の `warnings` に `KAERI_MULTI_CHARACTER` の警告が入る。正の書き方は、同じ位置に 1 字ずつの kaeri を並べること。`splitMultiCharacterKaeri(doc)` は、文書の複数の字の kaeri を 1 字ずつの注記に分けた新しい文書を返す。

## ブロック先頭の返り点

返り点（kaeri）はブロックの先頭に置けない。検証エラーと parser のエラーは、同じ案内文 `BLOCK_START_KAERI_HINT`（本パッケージが export する）を使う。同じ位置の複数の kaeri は正しい書き方として許す（`marks[]` の順につないだ値と同じ意味）。

## 表示設定

`@kanbun-skam/skam/rendering` は、表示設定（どの注記を出すか）の `RENDER_PROFILES`、`resolveRenderProfile`、キー名の一覧 `RENDER_PROFILE_KEYS`、誤りのクラス `SKAMRenderProfileError` を export する。html-renderer と canvas-renderer も同じものを再 export する。13 個のキー名は 0.x の間も改名・削除しない（[ADR-033](https://github.com/berlysia/kanbun-annotation/blob/master/docs/decisions/adr-033-render-profile-keys-and-errors.md)）。キー名の表と、誤りの `kind` / `key` の読み方は、`@kanbun-skam/skam-html-renderer` の README の「表示プロファイル」にある。

## 読み上げ用テキスト (`@experimental`)

`@kanbun-skam/skam/rendering` の次の API は、AIR（`buildAnnotationIR` が `profile` で絞った「画面に見えるもの」）から、読み上げ用の構造と文字列を作る。どれも `@experimental` で、読み上げの言葉は 0.x のマイナーリリースで変わりうる。

- `describeAnnotationIR(air)`: ブロック → 単位 → 注記の構造を返す。言語に依存しない。注記の `kind` は 0.x のマイナーで増えうる。
- `formatAccessibleText(blocks, labels?)`: 構造を日本語の文章にする。**HTML のエスケープをしない**ので、HTML に入れるときは呼び出し側でエスケープする。`labels` で `kind` ごとに言葉を上書きできる（own property だけを引く）。空文字・例外・string 以外を返した注記は出ない。すべての注記が出ず、本文も無いと空文字を返す。
- `DEFAULT_ACCESSIBLE_LABELS`: 既定の言葉。

<!-- doctest:typecheck -->

```typescript
import {
  buildAnnotationIR,
  describeAnnotationIR,
  formatAccessibleText,
  RENDER_PROFILES,
} from '@kanbun-skam/skam/rendering';
import type { SKAMDocument } from '@kanbun-skam/skam';

declare const doc: SKAMDocument;

const air = buildAnnotationIR(doc, RENDER_PROFILES.learningBasic);
const text = formatAccessibleText(describeAnnotationIR(air));
// 例: 學。而、置き字。時。習、レ点。之。
```

既知の制約:

- 読みの範囲が竪点のグループからはみ出す文書（#16）では、範囲の読みが先頭の字の読み仮名として出る。
- 再読文字は `slots.saidokuUnder` か `slots.saidokuOkuri2` があるときだけ再読文字として読む。2 回目の読みが無い再読文字は、1 回目の読みが読み仮名・送り仮名として出る。

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

## 0.1 からの移行

0.1.x から上げるときにやることは [移行の文書](https://github.com/berlysia/kanbun-annotation/blob/master/docs/migration-0.1-to-0.2.md) にまとめてある。

## 関連パッケージ

- [@kanbun-skam/skam-xml-parser](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-xml-parser) - SKAM-ML/XML パーサー
- [@kanbun-skam/skam-html-renderer](https://github.com/berlysia/kanbun-annotation/tree/master/packages/skam-html-renderer) - HTML レンダラー

## 仕様書

- [SKAM v0.1 仕様](https://github.com/berlysia/kanbun-annotation/blob/master/SKAM-draft.md)
- [SKAM-ML v0.1 仕様](https://github.com/berlysia/kanbun-annotation/blob/master/SKAM-ML-draft.md)

## ライセンス

MIT
