# 公開経路の tag 駆動 staged publishing

## 概要

公開 6 パッケージのリリースを、`v*` tag の push → 検査済み tarball の作成 → OIDC での `npm stage publish` → メンテナの 2FA による approve という経路に一本化する。あわせて、全 workflow の actions を SHA で固定し、zizmor と workflow 構造のテストで特権の配置を検査する。版と CHANGELOG の生成は changesets を残し、`pnpm run release` (`scripts/release.ts`) が検査から tag の push までを 1 コマンドで行う。この作業では tag を打たず、stage も publish もしない。0.2.0 の公開は、この作業の後に行う。

このファイルは、実装した内容の記録と、残った作業 (Followup) を持つ。plan-4 (公開経路) の内容は、plan-4 の実装が済むまでは予定である。

関連 ADR: [ADR-029](../decisions/adr-029-staged-release-flow.md)
手順: [releasing.md](../releasing.md)

## 前提知識

- 公開パッケージの一覧の正本は `.changeset/config.json` の `fixed[0]` (6 パッケージ)。`scripts/lib/release-check.ts` が読み、manifest に書き出す。
- 決定の内容と理由は ADR-029 にある。手順 (一度だけの移行、毎回のリリース、approve、失敗したとき) は releasing.md にある。
- 人間の作業 (environment `npm`、tag ruleset、6 パッケージへの `npm trust github`、`NPM_TOKEN` の不在の確認、Publishing access の変更) は、release.yml を含む PR の merge より前に行う。読み戻しがすべて期待どおりになるまで merge しない。
- `package.json` の version は、`pnpm run release` が `changeset version` で上げるまで 0.1.1 のままにする (手で上げない)。

## 実装計画

4 本の plan を、plan-1 → plan-2 → plan-3 → plan-4 の順に、1 つの PR に積む。

### plan-1: 既存 workflow の硬化、旧経路の撤去、zizmor

- ci.yml、deploy-playground.yml の SHA 固定、権限の最小化、setup の変更: `9d79e3d`、`fd8a8c1`
  - `pnpm/setup` v3 は pnpm v11 以上を要求し、このリポジトリは `pnpm@10.27.0` なので使えない。`pnpm/action-setup` v6.1.0 と `actions/setup-node` v7.0.0 (`node-version: lts/*`) を SHA で固定した。
- 旧 `publish.yml`、旧 `release.yml`、`.npmrc`、`changeset:publish` の撤去: `e18ed54`
- zizmor.yml と `.github/zizmor.yml` の追加: `c709e3c`
  - zizmor 1.30.1 の finding は、offline と online の両方で 0 件 (ベースラインは 55 件)。`.github/zizmor.yml` は `rules: {}`。

### plan-2: 検査とリリースの script

- 純粋関数の検査 (版・tag・CHANGELOG・registry の応答・dist-tag・DAG の順・tarball の package.json): `3f75111`
- `check-release` CLI (list / check / pack / verify-manifest): `57a2a65`
- `pnpm run release` の流れ (`scripts/release.ts`) と root の `verify` / `release` / `test:scripts`: `d17e931`
- consumer の `--tarballs`、一覧を changeset の config から読むこと、LICENSE の検査: `93be4cc`

### plan-3: 記録 (公開経路を入れる前)

- releasing.md: `c7749e1`
- ADR-029: `ba2d7e2`
- この plan、plan-practical-readiness の Followup、CLAUDE.md (このコミット)

### plan-4: 公開経路 (予定)

- 新しい release.yml (validate / npm-stage / github-release)
- `scripts/workflow-structure.test.ts` と `yaml` の devDependency
- `.github/zizmor.yml` の確定
- 手順書と実装の突き合わせ、ADR-029 への反映

## リスクと軽減策

リスクと受容したリスクは ADR-029 にある (R1〜R8、A1〜A6)。この plan の完了時点で、特に残るもの:

| リスク                                                             | 影響度 | 軽減策                                                                             |
| ------------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------- |
| workflow の結線 (artifact、manifest の照合、OIDC) は本番まで未実行 | 高     | 構造テストと zizmor、受入基準で approve の前に止める (releasing.md、ADR-029 の R8) |
| 同じ版の再 stage、provenance、npm の出力の書式が未確認             | 中     | 0.2.0 の公開作業で確かめ、ADR-029 の「結果」の欄に書く                             |
| 一度だけの移行 (人間の作業) の漏れ                                 | 高     | 読み戻しの期待値を releasing.md に置き、すべてそろうまで PR を merge しない        |

## 検証方法

plan-3 は文書だけの変更である。`pnpm exec prettier --check` で対象の文書、`pnpm adr:status` で ADR-029 の frontmatter と plan へのリンク、ADR と plan の双方向リンク、releasing.md のコマンドと引数を `npm help trust` / `npm help stage` (npm 12.2.0) と照合した。npm の trust と stage の出力の書式は、手元で実行していないので未確認。

## Followup

次の作業は、この plan の範囲外とする。片付いたら、この節から消す。

- 0.2.0 の公開 (releasing.md の手順。「最初のリリース (0.2.0) で確かめること」を実施し、結果を ADR-029 に書く)。
- 0.2.0 の公開後に、0.2.0 専用の `packages/integration-tests/scripts/check-version-bump.mjs` を消す。
- prerelease を作る手順 (changesets の pre mode) を検証して、releasing.md に足す。
