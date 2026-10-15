# リリース手順

公開 6 パッケージ (`@kanbun-skam/skam`、`skam-canvas-renderer`、`skam-html-renderer`、`skam-xml-parser`、`skam-xml-stringify`、`skam-web-component`) の公開は、`v*` tag の push から始まる。`release.yml` が 6 つの tarball を検査して stage し、メンテナが 2FA で approve すると公開される。判断の背景は [ADR-029](decisions/adr-029-staged-release-flow.md) にある。

この文書の手順のうち、npm の stage の画面出力 (`npm stage list` / `view` / `download` の書式) は、手元で実行して確かめていない (`npm trust list --json` の出力は 2026-10-15 の移行で確かめた)。コマンドと引数は `npm help trust` / `npm help stage` (npm 12.2.0) に載っているものだけを書いた。出力の書式が違った場合は、その場で読み替えず、期待値との差を ADR-029 の「最初のリリースで確かめること」の「結果」の欄に書く。

## 手元の前提

- npm 11.15.0 以上 (`npm trust` と `npm stage` の前提。`npm --version` で確かめる)。
- `gh` でログイン済み (`gh auth status`)。リポジトリの admin 権限がある。
- npm にログイン済み (`npm whoami`)。アカウントで 2FA が有効。
- master のクリーンな作業ツリー (リリース時)。

## 一度だけの移行

`release.yml` を含む PR の merge より前に、次の 1〜5 を順序どおり行う。各手順の直後の読み戻しが期待どおりになるまで、次に進まない。**5 つの読み戻しがすべて期待どおりになるまで、PR を merge しない。**

旧経路の workflow (`publish.yml`) は plan-1 で撤去済みで、`NPM_TOKEN` もない。旧 `publish.yml` 用の trust は npm 側に残っていたので、手順 3a で消す。リハーサルはしないので、shiori の手順にある「旧 trust を残してリハーサルし、最後に revoke する」順序は採らない。

### 1. environment `npm` を作り、deployment を tag `v*` に限る

required reviewer は付けない。承認は npm 側の 2FA で行う。

```bash
gh api -X PUT repos/berlysia/kanbun-annotation/environments/npm \
  -F 'deployment_branch_policy[protected_branches]=false' \
  -F 'deployment_branch_policy[custom_branch_policies]=true'
gh api -X POST repos/berlysia/kanbun-annotation/environments/npm/deployment-branch-policies \
  -f name='v*' -f type=tag
```

読み戻し:

```bash
gh api repos/berlysia/kanbun-annotation/environments/npm/deployment-branch-policies \
  --jq '.branch_policies[] | {name, type}'
```

期待: `{"name":"v*","type":"tag"}` の 1 件だけ。

### 2. tag ruleset を作る

`refs/tags/v*` の作成・更新・削除を admin だけに限る。`actor_id: 5` はリポジトリの admin ロール。

```bash
echo '{"name":"release tags","target":"tag","enforcement":"active","conditions":{"ref_name":{"include":["refs/tags/v*"],"exclude":[]}},"rules":[{"type":"creation"},{"type":"update"},{"type":"deletion"}],"bypass_actors":[{"actor_id":5,"actor_type":"RepositoryRole","bypass_mode":"always"}]}' \
  | gh api -X POST repos/berlysia/kanbun-annotation/rulesets --input -
```

読み戻し:

```bash
gh api repos/berlysia/kanbun-annotation/rulesets --jq '.[] | {name, target, enforcement}'
```

期待: `{"name":"release tags","target":"tag","enforcement":"active"}` の 1 件。作業前の調査 (2026-10-15) では、このリポジトリの rulesets は空だった。

### 3. 6 パッケージに trusted publisher を設定する

npm はパッケージごとの設定である。1 つのパッケージに複数の trust が並びうる (2026-10-15 の移行では、旧 `publish.yml` の trust と新しい `release.yml` の trust が 6 つとも並んでいた)。パッケージが npm に存在している必要があるが、6 つとも 0.1.0 が公開済みである。`--allow-stage-publish` だけを許可し、`--allow-publish` は付けない。`npm trust github` / `list` / `revoke` はどれも 2FA を求める (`list` のような読み取りでも)。最初の 1 回で認証の画面が開くので、「次の 5 分間は 2FA を省略する」を選ぶと、続くコマンドを入力なしで流せる。

読み手がそのまま実行と照合できるように、1 行ずつ並べる。

```bash
npm trust github @kanbun-skam/skam --file release.yml --repo berlysia/kanbun-annotation --env npm --allow-stage-publish
npm trust github @kanbun-skam/skam-canvas-renderer --file release.yml --repo berlysia/kanbun-annotation --env npm --allow-stage-publish
npm trust github @kanbun-skam/skam-html-renderer --file release.yml --repo berlysia/kanbun-annotation --env npm --allow-stage-publish
npm trust github @kanbun-skam/skam-xml-parser --file release.yml --repo berlysia/kanbun-annotation --env npm --allow-stage-publish
npm trust github @kanbun-skam/skam-xml-stringify --file release.yml --repo berlysia/kanbun-annotation --env npm --allow-stage-publish
npm trust github @kanbun-skam/skam-web-component --file release.yml --repo berlysia/kanbun-annotation --env npm --allow-stage-publish
```

読み戻し:

```bash
for p in skam skam-canvas-renderer skam-html-renderer skam-xml-parser skam-xml-stringify skam-web-component; do echo "== $p"; npm trust list "@kanbun-skam/$p" --json; done
```

期待: 6 つとも、次の 1 件だけを返す。

```json
{
  "type": "github",
  "file": "release.yml",
  "repository": "berlysia/kanbun-annotation",
  "environment": "npm",
  "permissions": ["createStagedPackage"]
}
```

`file` が `release.yml` 以外の trust、`environment` のない trust、`permissions` に `createPackage` を含む trust が残っていれば、手順 3a で消す。間違えて設定したものも同じく消して、設定し直す。5 つだけ設定済みの状態で tag を打つと、5 つだけが stage される (ADR-029 の R1)。6 つそろうまで merge しない。

### 3a. 旧経路の trust を消す

旧 `publish.yml` 用の trust (`createPackage` を持ち、environment の縛りがない) は、承認を経ずに直接公開できる経路である。workflow のファイルを消しても、書き込み権限者が `publish.yml` という名前の workflow をどのブランチにでも置けば使える。手順 5 の Publishing access の設定は token を止める設定で、OIDC による公開は止めない。手順 3 の読み戻しで見つけた id を使って、6 つとも消す。

```bash
npm trust revoke @kanbun-skam/<name> --id <手順 3 の出力の id>
```

消した後に手順 3 の読み戻しを再実行し、6 つとも `release.yml` の 1 件だけになっていることを確かめる。2026-10-15 の移行では、6 パッケージの `publish.yml` の trust をこの手順で消した。

### 4. 残っている token がないことを確かめる

```bash
gh secret list; gh secret list --env npm; gh secret list --env github-pages; gh secret list --app dependabot
```

フラグを変数に入れてループで回すと、zsh は変数を空白で分割しないので `--env npm` が 1 つの引数になって失敗する。上のように 1 つずつ書く。

期待: `NPM_TOKEN` がどこにもない (4 つとも `no secrets found`、または `NPM_TOKEN` 以外だけ)。2026-10-15 の移行では 4 つとも `no secrets found` だった。リポジトリの所有者は個人なので、organization の secret はない。

npm 側は、npmjs.com の「Access Tokens」画面で、これらのパッケージに publish できる granular token がないことを目で確かめる。あれば削除する。

### 5. Publishing access を 6 つとも 2FA 必須・bypass 2FA token 禁止にする

npmjs.com の各パッケージの Settings → Publishing access (`https://www.npmjs.com/package/@kanbun-skam/<name>/access`) で、6 つとも "Require two-factor authentication and disallow bypass 2fa tokens (recommended)" を選ぶ。npm の docs と以前の画面では "Require two-factor authentication and disallow tokens" と書かれていた選択肢である。手元から 2FA を使った publish はこの設定でも可能で、OIDC が使えないときの最後の手段になる (後述「最後の手段」)。

この設定が止めるのは token による公開で、trusted publishing (OIDC) による stage は止めない。npm はこの設定を trusted publishing と組み合わせて勧めている。この組み合わせで stage が通ることは、0.2.0 の最初の run で確かめる。

読み戻し: 6 つの Settings 画面で、上の選択肢が選ばれている。CLI の `npm access set mfa=none|publish|automation` は、どの値がこの選択肢に当たるかが docs で確かめられなかったので使わない。2026-10-15 の移行の時点で、6 つともすでにこの選択肢になっていた。

### 移行の完了条件

手順 1〜5 (3a を含む) の読み戻しがすべて期待どおり。1 つでも外れたら、PR を merge しない。

merge から最初の tag (v0.2.0) までの間に、`v*` tag を打たない。0.1.0 に遡って tag は付けない (0.1.0 は workflow の外から公開されたもので、対応する commit を特定していない)。

## 毎回のリリース

1. tag を打つ前に、6 パッケージの trust が一度きりの設定のままであることを確かめる。「一度だけの移行」の手順 3 の読み戻し (`npm trust list` を 6 つ) を再実行し、期待と変わっていないことを確かめる。
2. `pnpm changeset` で changeset を書き、commit する。changeset の本文が、6 つのパッケージの CHANGELOG の本文になる。
3. master で `pnpm run release` を実行する。段は次のとおり (定義は ADR-029、実装は `scripts/release.ts`)。
   1. 前提の確認: branch が master、作業ツリーが clean、`git fetch` 後に HEAD が `origin/master` と同じ、未消費の changeset がある。外れたら何も変えずに止まる。
   2. 版上げ: `pnpm changeset version` と、変更したファイルへの prettier。
   3. 公開前提の検査 (`check-release check --registry`): 6 つの版が等しい、6 つの CHANGELOG の先頭が新しい版、npm に未公開、stable なら現在の `latest` より新しい。tag `vX.Y.Z` が local にも origin にもない。
   4. 利用者テスト: 新しい版の tarball を空のプロジェクトに入れて確かめる (`pnpm test:consumer`)。
   5. 確認: 版と変更ファイルの一覧が出る。`y` で進み、`N` なら止まる。
   6. 記録: `chore: release vX.Y.Z` の commit と、annotated tag `vX.Y.Z`。
   7. 送信: `git push --atomic origin master vX.Y.Z`。拒否されたら origin は変わらない。

   段 2〜5 で止まったとき (確認で `N` を答えたときを含む) は、作業ツリーに版上げの変更が残る。表示されたコマンドで戻す。

   ```bash
   git checkout -- . && git clean -fd .changeset packages
   ```

   段 7 の push が拒否されたときは、local に commit と tag が残り、origin は変わらない。表示されたコマンドで local を戻す (自動では実行されない)。

   ```bash
   git tag -d vX.Y.Z && git reset --hard origin/master
   ```

4. tag が push されると `Release` workflow が始まる。完了まで待つ (validate、npm-stage、github-release の 3 job)。
5. 0.2.0 に限り、手順 3 の前に次を実行する。移行表 ([移行表](migration-0.1-to-0.2.md)) の全 ID と URL が 6 つの CHANGELOG に入ることの検査で、0.2.0 専用である。

   ```bash
   node packages/integration-tests/scripts/check-version-bump.mjs
   ```

   ネットワークを使うことがあり、常設の検査には入れていない。0.2.0 の公開後に消す (`docs/plans/plan-staged-release-flow.md` の Followup)。

prerelease (`X.Y.Z-rc.N` など) は、tag に `-` を含めば release.yml が dist-tag `next` と GitHub の prerelease にする。ただし、prerelease の版を作る手順 (changesets の pre mode) は検証していないので、この文書には書かない。

## approve の前の確認

`npm stage publish` は 2FA を求めず、approve だけが 2FA を求める (`npm help stage`)。tag 起点で自動で stage されるので、これが人間による唯一の内容確認になる。次の 4 項目をすべて確かめ、1 つでも外れたら approve せず、「失敗したとき」に進む。

validate job の Step Summary (step id `summary`、`$GITHUB_STEP_SUMMARY` と log の両方に出る) に manifest がある。書式は次のとおり。

```
## Release manifest
- tag: vX.Y.Z
- version: X.Y.Z
- distTag: latest

| # | name | file | integrity |
| --- | --- | --- | --- |
| 1 | @kanbun-skam/skam | kanbun-skam-skam-X.Y.Z.tgz | sha512-... |
```

1. **6 つが stage されている**: `npm stage list` を 6 パッケージそれぞれに実行し、各パッケージに、この版が 1 件ずつある。

   ```bash
   npm stage list @kanbun-skam/skam
   npm stage list @kanbun-skam/skam-canvas-renderer
   npm stage list @kanbun-skam/skam-html-renderer
   npm stage list @kanbun-skam/skam-xml-parser
   npm stage list @kanbun-skam/skam-xml-stringify
   npm stage list @kanbun-skam/skam-web-component
   ```

2. **integrity が manifest と一致する**: `npm stage view <stage-id>` の integrity を、Step Summary の manifest の同じパッケージの `integrity` (`sha512-...`) と照合する。`npm stage view` の出力に integrity がなければ `--json` を付ける。それでも出なければ、手順 3 でダウンロードした tgz から計算して照合する。

   ```bash
   npm stage view <stage-id>
   echo "sha512-$(openssl dgst -sha512 -binary <ダウンロードした .tgz> | openssl base64 -A)"
   ```

3. **中身が想定どおり**: `npm stage download <stage-id>` で tarball を落とし、ファイル一覧が `package.json` / `README.md` / `LICENSE` / `CHANGELOG.md` / `dist/` に収まることを確かめる (保存先は出力に従う。保存先と書式は未確認)。

   ```bash
   npm stage download <stage-id>
   tar tzf <ダウンロードした .tgz>
   ```

4. **approve 前は公開されていない**: `npm view <name> versions` にこの版が出ない。

   ```bash
   npm view @kanbun-skam/skam versions --json
   ```

Step Summary は validate job が書いたもので、tgz と manifest は同じ artifact (`npm-tarball`、保持 7 日) にある。この照合は、取得時の欠落と改変を検出するもので、真正性の最終確認は人間のこの照合である。

## approve

manifest の順 (依存の根から) に、6 回続けて approve する。現在の依存では、`skam` → `skam-canvas-renderer` → `skam-html-renderer` → `skam-xml-parser` → `skam-xml-stringify` → `skam-web-component` の順である。実際の順は、validate の Step Summary の manifest の `#` の並びに従う。`skam-web-component` を先に approve すると、依存先が未承認の間はインストールできない。

```bash
npm stage approve <stage-id>   # manifest の 1 番目
npm stage approve <stage-id>   # 2 番目
npm stage approve <stage-id>   # 3 番目
npm stage approve <stage-id>   # 4 番目
npm stage approve <stage-id>   # 5 番目
npm stage approve <stage-id>   # 6 番目
```

2FA を求められる。npmjs.com の画面からも approve できる。

stage の直後は、npm の自動レビュー (malware scan) が終わるまで approve できず、`E409 ... can't be approved yet because automated review hasn't finished` が返ることがある (shiori の手順書の記録)。数分待って同じコマンドを再実行する。

**approve の間の窓**: 6 回の approve の間は、`latest` が 0.1.0 と新しい版で混在する。0.x の caret は minor をまたがないので、既存の利用者の解決は変わらない。ただし、窓の間に `skam@latest` と `skam-html-renderer@latest` を別々に新規インストールした利用者は、新しいコアと古いレンダラーという、破壊的変更をまたぐ組み合わせを得る (各パッケージが自分の依存として入れる版は、完全一致なので正しい)。窓を短くするため、「approve の前の確認」をすべて済ませてから、6 回を続けて行う。

最後に、6 つの `latest` を読み戻す。

```bash
npm view @kanbun-skam/skam dist-tags.latest
npm view @kanbun-skam/skam-canvas-renderer dist-tags.latest
npm view @kanbun-skam/skam-html-renderer dist-tags.latest
npm view @kanbun-skam/skam-xml-parser dist-tags.latest
npm view @kanbun-skam/skam-xml-stringify dist-tags.latest
npm view @kanbun-skam/skam-web-component dist-tags.latest
```

期待: 6 つとも公開した版 (prerelease なら `dist-tags.next`)。

## approve の後の確認

失敗しても、公開は取り消さない。結果は ADR-029 の「最初のリリースで確かめること」の「結果」の欄に書く。

- `dist-tags`: `npm view <name> dist-tags` が 6 つとも期待どおり。
- `dist.integrity`: `npm view <name>@X.Y.Z dist.integrity` が、manifest の `integrity` と一致する。
- `dist.attestations`: `npm view <name>@X.Y.Z dist.attestations` の有無を、6 つとも確かめる。staged publishing と trusted publishing の組み合わせで provenance が付くかは、npm の docs に記載がなく、未確認である (ADR-029 の R3)。このリポジトリは public なので、確かめられる。0.1.0 には付いていない (2026-10-15 に確認)。
- GitHub Release: `gh release view vX.Y.Z` で存在を確かめる。

## 失敗したとき

版番号を守る (0.2.0 を欠番にしない) ことを優先し、npm に 1 つも公開されていない間は、同じ版で出し直す。

### 共通の最初の手順

`gh release view vX.Y.Z` で GitHub Release の有無を確かめる。`github-release` job は `validate` だけに依存して並列に走るので、validate が通った run では、Release が先にできている。同じ版で tag を打ち直す前に、Release を消す。tag は消さない (tag は次の手順で admin が消す)。

```bash
gh release view vX.Y.Z
gh release delete vX.Y.Z --yes
```

tag の削除は、ruleset の admin bypass で行う。

```bash
git push origin :refs/tags/vX.Y.Z
git tag -d vX.Y.Z
```

### F1: validate が失敗した (stage は 0、Release もない)

1. master で修正を commit して push する。
2. 6 つとも未公開であることを確かめる (`npm view <name> versions --json` を 6 つ)。
3. admin が tag を消す (上の「tag の削除」)。
4. 同じ版の tag を、修正後の commit に打つ。

   ```bash
   pnpm run release -- --tag-only
   ```

   `--tag-only` は、HEAD の 6 つの version が等しいこと、tag が local にも origin にもないこと、GitHub Release がないことを確かめ、版上げを飛ばして tag だけを push する。前提が外れたら何も変えずに止まる。push が拒否されたら、local の tag を消すコマンド (`git tag -d vX.Y.Z`) が表示される。

### F2: npm-stage が途中で失敗した、または stage 済みで approve 前に問題が見つかった

1. `npm stage list <name>` で stage 済みのものを探し、`npm stage reject <stage-id>` で取り消す (2FA を求められる)。
2. 共通の最初の手順で Release を消す。
3. F1 の手順 3〜4 と同じ。

reject 後に、同じ版を stage し直せるかは未確認である。`npm help stage` には、stage 済みの版は公開済みの版と同じ semver の一意性を共有する、とある (reject した版が再び stage できるかは書かれていない)。stage し直せなかったら F3 に進む。

### F3: 6 つのうち一部が approve 済み (公開済み)、または同じ版を stage し直せない

1. 未承認の stage をすべて `npm stage reject <stage-id>` する。
2. 公開済みのものに、理由を添えて deprecate する。

   ```bash
   npm deprecate @kanbun-skam/<name>@X.Y.Z "<理由>; use X.Y.(Z+1)"
   ```

3. 6 つすべてに patch の changeset を足し (changesets の `fixed` により、1 つ足せば 6 つの版が上がる)、X.Y.(Z+1) を、通常の手順で出す。
4. X.Y.Z の GitHub Release は残し、本文に欠番の旨を書く。

0.2.0 で F3 になった場合、0.2.0 専用の `check-version-bump.mjs` は版を 0.2.0 に固定しているので、0.2.1 では使えない。移行表 (`docs/migration-0.1-to-0.2.md`) は 0.1 → 0.2 系の表として有効なまま。このずれは ADR-029 の A6 として受容している。

### F4: workflow の定義を直す必要がある

tag の commit の `release.yml` が使われるので、re-run では直らない。共通の最初の手順で Release を消し、F1 と同じく、修正後の commit に tag を打ち直す。

### re-run を使ってよいとき

失敗した job の re-run (artifact の保持は 7 日) は、原因が一時的で、stage が 0 件のときだけ使う。stage が 1 件でも済んでいたら、F2 に進む。

### その他

- 誤って stage した: `npm stage reject <stage-id>`。
- 公開後に誤りが見つかった: `npm deprecate <name>@X.Y.Z "<理由>"`。

## 最初のリリース (0.2.0) で確かめること

0.2.0 の最初の run が本番であり、リハーサルはしない。次の受入基準を、approve の前に確かめ、1 つでも外れたら approve せず「失敗したとき」に進む。

- npm-stage が 6 つとも stage した (`npm stage list` で 6 パッケージに 0.2.0 が 1 件ずつ)。
- 各 stage の integrity が、Step Summary の manifest と一致する (`npm stage view`)。
- `npm stage download` の中身のファイル一覧が、`package.json` / `README.md` / `LICENSE` / `CHANGELOG.md` / `dist/` に収まる。
- approve 前は、`npm view <name> versions` に 0.2.0 が出ない。
- リリースのたびの、`npm trust list` の再確認 (6 つ) が期待どおり。
- `pnpm run release` の前に、`check-version-bump.mjs` が通っている。

approve の後に確かめること (「approve の後の確認」) の結果と、手順書の出力の書式が期待と違った点は、ADR-029 の「最初のリリースで確かめること」の「結果」の欄に書く。

## 最後の手段

OIDC が使えないとき (trust の設定が壊れた、OIDC の障害など) は、メンテナが 2FA を使って手元から publish できる。「一度だけの移行」の手順 5 の設定 (2FA 必須・bypass 2FA token 禁止) でも、2FA を使った publish は可能である。ただし、推奨しない。検査済みの tarball と、公開物の対応が切れるためである (validate の manifest と integrity による照合が効かなくなる)。やむを得ず行ったら、公開した版の `dist.integrity` を、手元の tarball から計算した値と照合し、経緯を ADR-029 に追記する。

## 制約

- master に branch protection を足すと、`release.ts` の push (`git push --atomic origin master vX.Y.Z`) が拒否される (ADR-029 の A5)。足すときは、リリースの経路を設計し直す。
- `v*` tag は、`pnpm run release` (または F1 の `--tag-only`) 以外で打たない。tag を打つと、`release.yml` が起動する。
- environment `npm` の deployment は tag `v*` に限られているので、branch からは起動できない。
