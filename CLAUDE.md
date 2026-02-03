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
├── skam/               # @kanbun/skam - SKAM v0.1 型定義・バリデーター
├── skam-xml-parser/    # @kanbun/skam-xml-parser - SKAM-ML/XML パーサー
├── skam-html-renderer/ # @kanbun/skam-html-renderer - HTML レンダラー
└── playground/         # @kanbun/playground - インタラクティブデモ (GitHub Pages)
```

### @kanbun/skam 主要 API

```typescript
// 型定義
import type { SKAMDocument, Token, Block, Mark, Reading } from '@kanbun/skam';

// バリデーション
import { validateSKAMDocument, isSKAMDocument, assertSKAMDocument } from '@kanbun/skam';

const result = validateSKAMDocument(input);
if (result.valid) {
  const doc: SKAMDocument = result.document;
}
```

### @kanbun/skam-xml-parser 主要 API

```typescript
import { parse } from '@kanbun/skam-xml-parser';

// XML → SKAM JSON
const doc = parse(xmlString);
```

### @kanbun/skam-html-renderer 主要 API

```typescript
import { render, getDefaultStyles, PROFILES } from '@kanbun/skam-html-renderer';

// SKAM → HTML（縦書きがデフォルト）
const { html, css } = render(doc);
// 横書き: render(doc, { writingMode: 'horizontal' })
// プロファイル: PROFILES.full | PROFILES.learningBasic | PROFILES.learningHint
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

**Stand-off 方式**: 全ての注記は `anchor: { from, to }` で token を参照。本文テキストを直接分断しない。

### Mark Types (v0.1)

| type        | 用途                                     |
| ----------- | ---------------------------------------- |
| `kaeri`     | 返り点（レ、一二、上下、甲乙）           |
| `okurigana` | 送り仮名                                 |
| `yomigana`  | 読み仮名（ルビ）                         |
| `soegana`   | 添え仮名（訓読時に補う助詞・テニヲハ）   |
| `okimoji`   | 置字（訓読時に読まない漢字をマーク）     |
| `joji`      | 助字（文法的機能を持つ漢字の分類ラベル） |
| `kutoten`   | 句読点                                   |
| `saidoku`   | 再読文字（forms[] で複数回の読みを表現） |
| `okototen`  | ヲコト点（glyph-grid 座標系で位置指定）  |
| `tateten`   | たて点（熟語境界）                       |
| `emphasis`  | 傍点・圏点                               |
| `note`      | 注釈                                     |

### 仕様書

- `SKAM-draft.md` - SKAM v0.1 仕様（JSON 形式、正規表現）
- `SKAM-ML-draft.md` - SKAM-ML/XML 仕様（人間編集用マークアップ）

## TypeScript Configuration

- `noUncheckedIndexedAccess: true` - 配列アクセス時は `!` または型ガードが必要
- `exactOptionalPropertyTypes: true` - optional プロパティに `undefined` を明示的に代入不可
- `verbatimModuleSyntax: true` - 型インポートは `import type` を使用

## 実装時の注意

- CSSプロパティを使用する前に、適用対象の要素を必ず確認する（MDN等で仕様確認）
- **ユーザーにデバッグさせない**: 不確かな実装を「確認してください」で済ませず、事前に仕様を調査・検証する
- 実装の詳細な注意事項はコード内コメントに記載する（styles.ts等）
