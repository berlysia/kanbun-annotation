# Plan: check-deps.sh を oxlint no-restricted-imports に置き換え

<!-- validated -->

## Context

`packages/skam-html-renderer/check-deps.sh` はレイヤー依存方向（shared → display → api）を bash スクリプトで検査している。oxlint の `no-restricted-imports` ルール + `overrides` で同等のチェックを lint に統合し、スクリプトを廃止する。

## 変更内容

### 1. `packages/skam-html-renderer/.oxlintrc.json` を新規作成

overrides でレイヤーごとにインポート制限を設定：

- **Shared 層** (render-config, render-tree-types, html-utils, css-tag, mark-utils, styles)
  - Display 層・API 層からのインポートを禁止
  - 禁止パターン: `./build-render-tree.js`, `./render-tree.js`, `./token-renderer.js`, `./render-display-layer.js`, `./renderer.js`

- **Display 層** (build-render-tree, render-tree, token-renderer, render-display-layer)
  - API 層からのインポートを禁止
  - 禁止パターン: `./renderer.js`

`paths` オプションで個別モジュールを列挙し、`message` でレイヤー違反であることを明示。

### 2. `packages/skam-html-renderer/package.json` を修正

- `lint` スクリプトを `oxlint -c .oxlintrc.json src` に変更（設定ファイル指定を追加）
- `check:deps` スクリプトを削除

### 3. `packages/skam-html-renderer/check-deps.sh` を削除

## 対象ファイル

- 新規: `packages/skam-html-renderer/.oxlintrc.json`
- 編集: `packages/skam-html-renderer/package.json`
- 削除: `packages/skam-html-renderer/check-deps.sh`

## 検証

1. `pnpm --filter @kanbun/skam-html-renderer lint` が成功することを確認（現状で違反がないはず）
2. 意図的に違反するインポートを追加して検出されることを確認し、元に戻す
3. `pnpm lint` (全体) が成功することを確認
