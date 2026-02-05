# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SKAM (Stand-off Kanbun Annotation Model) は漢文の訓点・注記・読みを本文と分離して保持する意味モデル。JSON 形式の正規表現と、人間編集用の XML マークアップ (SKAM-ML) を定義する。

## Commands

```bash
# 全パッケージのビルド・テスト・型チェック
pnpm build
pnpm test
pnpm typecheck

# 単一テストファイルの実行
pnpm --filter @kanbun/skam test -- examples.test.ts

# フォーマット・リント
pnpm format
pnpm lint

# 未使用コード検出
pnpm clean

# Playground
pnpm playground:dev      # 開発サーバー起動
pnpm playground:build    # プロダクションビルド
pnpm playground:preview  # ビルド結果のプレビュー
```

## Architecture

### パッケージ構成 (pnpm workspace)

```
packages/
├── skam/               # @kanbun/skam - SKAM v0.1 型定義・バリデーター・操作
├── skam-xml-parser/    # @kanbun/skam-xml-parser - SKAM-ML/XML パーサー
├── skam-xml-stringify/ # @kanbun/skam-xml-stringify - SKAM JSON → SKAM-ML/XML シリアライザー
├── skam-html-renderer/ # @kanbun/skam-html-renderer - HTML レンダラー
├── integration-tests/  # @kanbun/integration-tests - パッケージ間統合テスト（parse/stringify roundtrip 等）
└── playground/         # @kanbun/playground - インタラクティブデモ (GitHub Pages)
```

### @kanbun/skam 主要 API

```typescript
// 型定義
import type {
  SKAMDocument,
  Token,
  Block,
  Mark,
  PersistedMark,
  Reading,
  MarkType,
  MarkTypeMap,
  AnchoredMark,
  PositionedMark,
  AnchoredMarkType,
  PositionedMarkType,
} from '@kanbun/skam';

// バリデーション
import { validateSKAMDocument, isSKAMDocument, assertSKAMDocument } from '@kanbun/skam';

// ID 生成
import { createRandomIdGenerator, createSequentialIdGenerator } from '@kanbun/skam';

// CRUD 操作
import { addMark, updateMark, replaceMark, removeMark } from '@kanbun/skam';

// クエリ・ユーティリティ
import {
  getMarkById,
  getMarksForToken,
  getMarksForRange,
  getMarksExactRange,
  getAnchoredMarksExactRange,
  getPositionedMarksInRange,
  buildTokenIndexMap,
  getTokenIndex,
  getTokenByIndex,
  isAnchorBasedMark,
  isPositionBasedMark,
  isMarkType,
  filterMarksByType,
} from '@kanbun/skam';
```

### @kanbun/skam-xml-parser 主要 API

```typescript
import { parse } from '@kanbun/skam-xml-parser';

// XML → SKAM JSON
const doc = parse(xmlString);
```

### @kanbun/skam-xml-stringify 主要 API

```typescript
import { stringify } from '@kanbun/skam-xml-stringify';

// SKAM JSON → XML
const xml = stringify(doc);
```

### @kanbun/skam-html-renderer 主要 API

```typescript
import {
  render,
  renderHTML,
  generateCSS,
  getDefaultStyles,
  PROFILES,
} from '@kanbun/skam-html-renderer';

// SKAM → HTML + CSS（縦書きがデフォルト）
const { html, css } = render(doc);
// 横書き: render(doc, { writingMode: 'horizontal' })
// プロファイル: PROFILES.full | PROFILES.learningBasic | PROFILES.learningHint

// ブラウザ環境: インタラクティブイベントハンドラ
import { attachInteractiveHandlers } from '@kanbun/skam-html-renderer';
```

### SKAM データモデル

```
SKAMDocument
├── tokens[]     本文 token のマスター定義
├── blocks[]     ブロック構造（原文順、tokenIds で token を参照）
├── marks[]      注記（返り点・送り仮名等）
├── derivations[]  導出情報（読み順等、計算結果キャッシュ）
└── readings[]   読み層（書き下し文・読み上げ文）
```

**Stand-off 方式**: 注記は本文テキストを直接分断しない。配置方式は 2 種:

- **anchor ベース** (10 種): `anchor: { from, to }` で token 範囲を参照
- **position ベース** (kaeri, kutoten, ref): `position: { blockId, after? }` で token 間位置を参照

### Mark Types (v0.1)

| type        | 配置 | 用途                                     |
| ----------- | ---- | ---------------------------------------- |
| `kaeri`     | P    | 返り点（レ、一二、上下、甲乙）           |
| `okurigana` | A    | 送り仮名                                 |
| `yomigana`  | A    | 読み仮名（ルビ）                         |
| `soegana`   | A    | 添え仮名（訓読時に補う助詞・テニヲハ）   |
| `okimoji`   | A    | 置字（訓読時に読まない漢字をマーク）     |
| `joji`      | A    | 助字（文法的機能を持つ漢字の分類ラベル） |
| `kutoten`   | P    | 句読点                                   |
| `saidoku`   | A    | 再読文字（forms[] で複数回の読みを表現） |
| `okototen`  | A    | ヲコト点（glyph-grid 座標系で位置指定）  |
| `tateten`   | A    | たて点（熟語境界）                       |
| `emphasis`  | A    | 傍点・圏点                               |
| `highlight` | A    | 傍線（ref を参照可）                     |
| `ref`       | P    | 参照識別子・注釈（highlight と連動）     |

`A = anchor: { from, to }、P = position: { blockId, after? }`

### ドメインモデルの構造規約

#### トークン順序

- `tokens[]` 配列の順序は**無意味**（マスター定義のみ）
- **原文順序は `blocks[].tokenIds` の連結順**で規定
- ユーティリティ: `buildTokenIndexMap(doc)` でグローバル位置マップを取得

#### Mark 配置方式

anchor ベースと position ベースは共通基底 `MarkBase` から対等に分岐。

- `MarkBase`: 共通フィールド（type, id?, placementHint?, ext?）
- anchor ベース (10 種): `AnchoredMark extends MarkBase` を extends。`anchor: { from, to }` で token 範囲に付随
- position ベース (kaeri, kutoten, ref): `PositionedMark extends MarkBase` を extends。`position: { blockId, after? }` で token 間に配置

型ガード: `isAnchorBasedMark(mark)` / `isPositionBasedMark(mark)` で判定可能

#### イミュータブル操作

全 CRUD 操作は新しいドキュメントオブジェクトを返す。元のドキュメントは変更しない。

#### テストヘルパー (`__tests__/operations/helpers.ts`)

- `createTestDocument(marks)`: 3 token (子/曰/學, t1-t3) / 1 block (b1)
- `createMultiBlockDocument(marks)`: 6 token (t1-t6) / 2 block (b1, b2)
- `assertValidDocument(doc)`: バリデーター呼び出しラッパー

### 仕様書・設計文書

- `SKAM-draft.md` - SKAM v0.1 仕様（JSON 形式、正規表現）
- `SKAM-ML-draft.md` - SKAM-ML/XML 仕様（人間編集用マークアップ）
- `docs/decisions/` - Architecture Decision Records

## TypeScript Configuration

- `noUncheckedIndexedAccess: true` - 配列アクセス時は `!` または型ガードが必要
- `exactOptionalPropertyTypes: true` - optional プロパティに `undefined` を明示的に代入不可
- `verbatimModuleSyntax: true` - 型インポートは `import type` を使用

## 実装時の注意

- CSSプロパティを使用する前に、適用対象の要素を必ず確認する（MDN等で仕様確認）
- **ユーザーにデバッグさせない**: 不確かな実装を「確認してください」で済ませず、事前に仕様を調査・検証する
- 実装の詳細な注意事項はコード内コメントに記載する（styles.ts等）
- **XML stringify のエッジケース**（変更時は roundtrip テストで検証すること）:
  - saidoku + trailing marks: kaeri/kutoten/ref は `</skam:saidoku>` の外に配置
  - multi-token range: 最終トークンの trailing marks は range 要素外に配置
  - 複合返り点: `一レ` → `ichi-re` 変換（`kaeriValueToKind` 関数）
  - readings: `doc.readings` を `<skam:readings>` 要素に出力
