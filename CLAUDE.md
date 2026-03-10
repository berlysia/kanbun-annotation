# CLAUDE.md

## Project Overview

SKAM (Stand-off Kanbun Annotation Model) は漢文の訓点・注記・読みを本文と分離して保持する意味モデル。JSON 形式と XML マークアップ (SKAM-ML) を定義する。

## Commands

```bash
pnpm build / test / typecheck       # 全パッケージ
pnpm --filter <pkg> test -- <file>   # 単一テスト
pnpm format / lint / clean           # フォーマット・リント・未使用コード検出
pnpm playground:dev / playground:build / playground:preview
```

## Architecture

pnpm workspace モノレポ。API リファレンス: [docs/skam-api-reference.md](docs/skam-api-reference.md)

```
packages/
├── skam/                 # 型定義・バリデーター・CRUD操作 (サブパス: /rendering)
├── skam-xml-parser/      # SKAM-ML → JSON パーサー
├── skam-xml-stringify/   # JSON → SKAM-ML シリアライザー
├── skam-html-renderer/   # HTML レンダラー
├── skam-canvas-renderer/ # Canvas レンダラー（画像エクスポート用）
├── skam-web-component/   # Web Component ラッパー
├── skam-screenshot/      # スクリーンショットユーティリティ（private）
├── baseline-check/       # ベースライン互換性チェック（private）
├── integration-tests/    # パッケージ間統合テスト
└── playground/           # インタラクティブデモ (GitHub Pages)
```

### データモデル

詳細: [docs/skam-data-model.md](docs/skam-data-model.md)。不変条件:

- `tokens[]` の配列順序は無意味。**原文順序は `blocks[].tokenIds` の連結順**
- 全 CRUD 操作はイミュータブル（新しいドキュメントオブジェクトを返す）
- Mark 配置は anchor ベース（10種）と position ベース（kaeri, kutoten, ref）の2方式

### 仕様書・設計文書

- `SKAM-draft.md` / `SKAM-ML-draft.md` — 仕様書
- `docs/decisions/` — ADR、`docs/plans/` — 実装計画

### ADR-Plan ワークフロー

- ADR と Plan は 1:1 対応必須（独立 Plan は許容）
- 双方向リンク必須: Plan → ADR / ADR → Plan
- 命名: ADR 連動は `plan-{adr-slug}.md`、配置は `docs/plans/`

## TypeScript Configuration

- `noUncheckedIndexedAccess: true` — 配列アクセス時は `!` または型ガードが必要
- `exactOptionalPropertyTypes: true` — optional プロパティに `undefined` を明示的に代入不可
- `verbatimModuleSyntax: true` — 型インポートは `import type` を使用

## 実装時の注意

- CSSプロパティ使用前に適用対象の要素を確認する（MDN等で仕様確認）
- **ユーザーにデバッグさせない**: 不確かな実装を「確認してください」で済ませず事前に検証する
- **XML stringify 変更時は roundtrip テストで検証**（エッジケース詳細は [docs/skam-data-model.md](docs/skam-data-model.md) 参照）
