# CLAUDE.md

## Project Overview

SKAM (Stand-off Kanbun Annotation Model) は漢文の訓点・注記・読みを本文と分離して保持する意味モデル。JSON 形式と XML マークアップ (SKAM-ML) を定義する。

## Commands

```bash
pnpm build / test / typecheck       # 全パッケージ
pnpm --filter <pkg> test -- <file>   # 単一テスト
pnpm format / lint / clean           # フォーマット (oxfmt)・リント (oxlint)・未使用コード検出 (knip)
pnpm playground:dev / playground:build / playground:preview
pnpm verify / release                # 検査一式 / リリース (手順: docs/releasing.md)
pnpm bench                           # 古事記の描画時間 (build 込み。初回は本文を取得する (要ネットワーク)。単体の --filter 実行は要 build。比較は bench の引数に --outputJson=<f> / --compare=<f>)
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
- `docs/decisions/` — ADR、`docs/plans/` — 実装中の計画と残件の一覧 (backlog.md)
- `docs/releasing.md` — リリース手順

### ADR-Plan ワークフロー

- 実装中の ADR と Plan は 1:1 で対応させ、双方向にリンクする（独立 Plan は許容）。ADR の frontmatter に `plan:` を書き、Plan 本文の `<!-- validated -->` で `pnpm adr:status` の phase が進む
- 命名: ADR 連動は `plan-{adr-slug}.md`、配置は `docs/plans/`
- ADR を Complete にする PR で Plan を消し、frontmatter の `plan:` を外し、本文の Plan への参照を `git show <SHA>:docs/plans/<名前>` の形にする。SHA は Plan を最後に含む master 上の commit の完全な値で、短縮しない。独立 Plan も完了したら消す
- Plan に残った作業は `docs/plans/backlog.md` に移す。ADR に残る当時の Followup の記述は書き換えず、「以後は docs/plans/backlog.md で追う。」と添える
- `docs/plans/` には TEMPLATE.md、backlog.md、実装中の Plan だけを置く

## TypeScript Configuration

- `noUncheckedIndexedAccess: true` — 配列アクセス時は `!` または型ガードが必要
- `exactOptionalPropertyTypes: true` — optional プロパティに `undefined` を明示的に代入不可
- `verbatimModuleSyntax: true` — 型インポートは `import type` を使用

## 実装時の注意

- CSSプロパティ使用前に適用対象の要素を確認する（MDN等で仕様確認）
- **ユーザーにデバッグさせない**: 不確かな実装を「確認してください」で済ませず事前に検証する
- **XML stringify 変更時は roundtrip テストで検証**（エッジケース詳細は [docs/skam-data-model.md](docs/skam-data-model.md) 参照）
