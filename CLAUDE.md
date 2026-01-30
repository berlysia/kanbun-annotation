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
```

## Architecture

### パッケージ構成 (pnpm workspace)

```
packages/
├── skam/          # @kanbun/skam - SKAM v0.1 型定義 (TypeScript)
└── skam-xml/      # @kanbun/skam-xml - SKAM-ML/XML パーサー (開発中)
```

### SKAM データモデル

```
SKAMDocument
├── tokens[]     本文の token 列（字単位推奨）
├── marks[]      注記（返り点・送り仮名等）
├── derivations[]  導出情報（読み順等、計算結果キャッシュ）
└── readings[]   読み層（書き下し文・読み上げ文）
```

**Stand-off 方式**: 全ての注記は `anchor: { from, to }` で token を参照。本文テキストを直接分断しない。

### Mark Types (v0.1)

| type | 用途 |
|------|------|
| `kaeri` | 返り点（レ、一二、上下、甲乙） |
| `okurigana` | 送り仮名 |
| `yomigana` | 読み仮名（ルビ） |
| `okiji` | 助字・テニヲハ |
| `kutoten` | 句読点 |
| `saidoku` | 再読文字（forms[] で複数回の読みを表現） |
| `okototen` | ヲコト点（glyph-grid 座標系で位置指定） |
| `tateten` | たて点（熟語境界） |
| `emphasis` | 傍点・圏点 |
| `note` | 注釈 |

### 仕様書

- `SKAM-draft.md` - SKAM v0.1 仕様（JSON 形式、正規表現）
- `SKAM-ML-draft.md` - SKAM-ML/XML 仕様（人間編集用マークアップ）

## TypeScript Configuration

- `noUncheckedIndexedAccess: true` - 配列アクセス時は `!` または型ガードが必要
- `exactOptionalPropertyTypes: true` - optional プロパティに `undefined` を明示的に代入不可
- `verbatimModuleSyntax: true` - 型インポートは `import type` を使用
