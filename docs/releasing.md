# リリース手順

公開 6 パッケージ (`@kanbun-skam/skam`、`skam-canvas-renderer`、`skam-html-renderer`、`skam-xml-parser`、`skam-xml-stringify`、`skam-web-component`) の公開は、`v*` tag の push から始まる。`release.yml` が 6 つの tarball を検査して stage し、メンテナが 2FA で approve すると公開される。判断の背景は [ADR-029](decisions/adr-029-staged-release-flow.md) にある。

この文書の手順のうち、npm の stage の画面出力 (`npm stage list` / `view` / `download` の書式) は、手元で実行して確かめていない (`npm trust list --json` の出力は確かめてある)。コマンドと引数は `npm help trust` / `npm help stage` (npm 12.2.0) に載っているものだけを書いた。出力の書式が違った場合は、その場で読み替えず、期待値との差を ADR-029 の「最初のリリースで確かめること」の「結果」の欄に書く。

## 手元の前提

- npm 12.2.0 以上 13 未満 (`npm trust` と `npm stage` の前提。`pnpm run release` が入口で `npm --version` を確かめる。上限の理由は「入口の確認」)。
- gh 2.45.0 以上で、ログイン済み (`gh auth status`)。リポジトリの admin 権限がある。
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

期待: `{"name":"release tags","target":"tag","enforcement":"active"}` の 1 件。

### 3. 6 パッケージに trusted publisher を設定する

npm はパッケージごとの設定である。1 つのパッケージに複数の trust が並びうる (別の workflow 用の古い trust が残っていることがある)。パッケージが npm に存在している必要があるが、6 つとも公開済みである。`--allow-stage-publish` だけを許可し、`--allow-publish` は付けない。`npm trust github` / `list` / `revoke` はどれも 2FA を求める (`list` のような読み取りでも)。最初の 1 回で認証の画面が開くので、「次の 5 分間は 2FA を省略する」を選ぶと、続くコマンドを入力なしで流せる。

読み手がそのまま実行と照合できるように、1 行ずつ並べる。`-y` は "Do you want to proceed? (y/N)" の確認を省く。

```bash
npm trust github @kanbun-skam/skam --file release.yml --repo berlysia/kanbun-annotation --env npm --allow-stage-publish -y
npm trust github @kanbun-skam/skam-canvas-renderer --file release.yml --repo berlysia/kanbun-annotation --env npm --allow-stage-publish -y
npm trust github @kanbun-skam/skam-html-renderer --file release.yml --repo berlysia/kanbun-annotation --env npm --allow-stage-publish -y
npm trust github @kanbun-skam/skam-xml-parser --file release.yml --repo berlysia/kanbun-annotation --env npm --allow-stage-publish -y
npm trust github @kanbun-skam/skam-xml-stringify --file release.yml --repo berlysia/kanbun-annotation --env npm --allow-stage-publish -y
npm trust github @kanbun-skam/skam-web-component --file release.yml --repo berlysia/kanbun-annotation --env npm --allow-stage-publish -y
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

消した後に手順 3 の読み戻しを再実行し、6 つとも `release.yml` の 1 件だけになっていることを確かめる。

### 4. 残っている token がないことを確かめる

```bash
gh secret list; gh secret list --env npm; gh secret list --env github-pages; gh secret list --app dependabot
```

フラグを変数に入れてループで回すと、zsh は変数を空白で分割しないので `--env npm` が 1 つの引数になって失敗する。上のように 1 つずつ書く。

期待: `NPM_TOKEN` がどこにもない (4 つとも `no secrets found`、または `NPM_TOKEN` 以外だけ)。リポジトリの所有者は個人なので、organization の secret はない。

npm 側は、npmjs.com の「Access Tokens」画面で、これらのパッケージに publish できる granular token がないことを目で確かめる。あれば削除する。

### 5. Publishing access を 6 つとも 2FA 必須・bypass 2FA token 禁止にする

npmjs.com の各パッケージの Settings → Publishing access (`https://www.npmjs.com/package/@kanbun-skam/<name>/access`) で、6 つとも "Require two-factor authentication and disallow bypass 2fa tokens (recommended)" を選ぶ。npm の docs と以前の画面では "Require two-factor authentication and disallow tokens" と書かれていた選択肢である。手元から 2FA を使った publish はこの設定でも可能で、OIDC が使えないときの最後の手段になる (後述「最後の手段」)。

この設定が止めるのは token による公開で、trusted publishing (OIDC) による stage は止めない。npm はこの設定を trusted publishing と組み合わせて勧めている。この組み合わせで stage が通ることは確かめてある。

読み戻し: 6 つの Settings 画面で、上の選択肢が選ばれている。CLI の `npm access set mfa=none|publish|automation` は、どの値がこの選択肢に当たるかが docs で確かめられなかったので使わない。

### 移行の完了条件

手順 1〜5 (3a を含む) の読み戻しがすべて期待どおり。1 つでも外れたら、PR を merge しない。

merge から最初の tag (v0.2.0) までの間に、`v*` tag を打たない。0.1.0 に遡って tag は付けない (0.1.0 は workflow の外から公開されたもので、対応する commit を特定していない)。

## 毎回のリリース

changeset を書いて commit し、`pnpm run release` を 1 回実行する。手で打つコマンドはこの 3 つだけである。

```bash
pnpm changeset
git add .changeset && git commit
pnpm run release
```

changeset の本文が、6 つのパッケージの CHANGELOG の本文になる。`pnpm run release` は、版上げから tag の push、Release workflow の待機、approve の前の確認、6 回の approve、approve の後の確認までを続けて行う (定義は [ADR-031](decisions/adr-031-release-command-to-the-end.md)、実装は `scripts/release.ts` と `scripts/release-after-push.ts`)。端末で実行する。stdin と stdout のどちらかが端末でないと、入口で止まる (approve が 2FA を求めるため)。

実行にかかる時間の大半は、段 1 の `pnpm verify` と、段 8 の workflow の完了待ちである。

### 入口の確認

段に入る前に、次を確かめる。外れたら何も変えずに止まる。

- `npm --version` が 12.2.0 以上 13 未満、`gh --version` が 2.45.0 以上。npm の上限は、`npm stage` の出力の形が major で変わりうるため。npm 13 が出たら、stage の出力の形を確かめ直してから上限を上げる。
- `npm config get registry` と `npm config get @kanbun-skam:registry` が `https://registry.npmjs.org/` (後者は未設定でもよい)。
- git の状態 (HEAD、origin と local の tag `vX.Y.Z`)、6 パッケージが npm に公開済みか、`changeset status`。これで、新しいリリースを始める (前半)、途中まで進んだリリースを続ける (後半)、完了済みの確認だけ行う、止まる、のどれかを決める。

`pnpm run release` は、`npm` と `gh` を呼ぶときに、registry と repo を引数で固定し、`npm_config_*` と `GH_HOST` などの環境変数を渡さない。

### 段の一覧

| 段  | 内容                     | 自動で確かめること                                                                                                                                                                                                                                                                                                                                                                              | 人が答えること                                                                |
| --- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | 前提の確認               | branch が master、作業ツリーが clean、`git fetch` 後に HEAD が `origin/master` と同じ。6 パッケージの trust が 1 件ずつ期待どおり。`changeset status` で出す版が決まる。`pnpm verify` が通り、作業ツリーが汚れていない                                                                                                                                                                          | trust の確認で 2FA (「次の 5 分間は 2FA を省略する」を選ぶ)                   |
| 2   | 版上げ                   | `changeset version`、ignore 済みパッケージの変更の復元、本文のない CHANGELOG の節の補完、変更が許可リストに収まること、prettier                                                                                                                                                                                                                                                                 | なし                                                                          |
| 3   | 公開前提の検査           | `check-release check --tag vX.Y.Z --registry`: 6 つの版が等しい、6 つの CHANGELOG の先頭が新しい版で本文がある、npm に未公開、stable なら現在の `latest` より新しい。tag が local にも origin にもない                                                                                                                                                                                          | なし                                                                          |
| 4   | 利用者テスト             | 新しい版の tarball を空のプロジェクトに入れて確かめる (`pnpm test:consumer`)                                                                                                                                                                                                                                                                                                                    | なし                                                                          |
| 5   | 確認                     | 版と変更ファイルの一覧を出す                                                                                                                                                                                                                                                                                                                                                                    | y/N。`y` で進み、`N` なら止まる                                               |
| 6   | 記録                     | `chore: release vX.Y.Z` の commit (許可リストのパスだけ) と、annotated tag `vX.Y.Z`                                                                                                                                                                                                                                                                                                             | なし                                                                          |
| 7   | 送信                     | `git push --atomic origin master vX.Y.Z`。拒否されたら origin は変わらない                                                                                                                                                                                                                                                                                                                      | なし                                                                          |
| 8   | run の待機               | tag の commit の `Release` run を `gh run list` で探し (10 秒おきに最大 3 分)、未完了なら `gh run watch` で待つ。3 つの job (`Validate and pack`、`Stage on npm`、`GitHub Release`) の結論を判定する                                                                                                                                                                                            | なし                                                                          |
| 9   | approve の前の判定       | validate の job の log の manifest を錨に、6 パッケージの stage の tarball (`npm stage list` / `npm stage download`) の sha512 と中身を照合する。artifact は取れれば追加で照合する。公開済みのパッケージは対象から外す                                                                                                                                                                          | なし                                                                          |
| 10  | trust の再確認と approve | trust の再確認の後、判定結果を表示する。stage の行の末尾には、stage list の actor、actorType、createdAt を出す (判定には使わない。無い値は `unknown`。外から来る文字列なので制御文字を除き、1 行に畳んで 80 字で切る)。manifest の順 (依存の根から) に、検証した stage id だけを approve する。各回の直前に、そのパッケージが stage のままか確かめ直す。E409 は 30 秒おきに最大 20 回再試行する | trust の確認で 2FA。y/N (approve の前)。approve で 2FA (パッケージごとに毎回) |
| 11  | approve の後の判定       | 6 つの `dist-tags`、`dist.integrity` (log の integrity と一致)、SLSA provenance の subject の sha512 (log の integrity と一致。`dist.attestations.url` の bundle を取得して照合する)、GitHub Release の有無。外れたら 30 秒おきに最大 5 分読み直す                                                                                                                                              | なし                                                                          |

y/N を聞くのは、段 5 (版と変更ファイル) と段 10 (approve の前) の 2 回だけである。approve を飛ばすフラグはない。

trust の確認は、最初に `npm trust list` を対話で 1 回実行し、続けて 6 パッケージ分を `--json` で取る。対話のときに「次の 5 分間は 2FA を省略する」を選ばないと、続く取得が `EOTP` で止まる (何も変えていないので、再実行すればよい)。

`npm stage approve` は、パッケージごとに毎回 2FA を求める (6 パッケージなら 6 回)。「次の 5 分間は 2FA を省略する」の選択肢は出ない。

完了すると `release completed` と表示して exit 0 で終わる。

### 段 2〜7 で止まったとき

前半の段が止まると、`release stopped at <段>: <理由>` の後に、次の「止まったとき」の形で表示される。戻すコマンドは、`try:` の先頭の行に出る。

段 2〜5 で止まったとき (段 5 で `N` を答えたときを含む) は、作業ツリーに版上げの変更が残る (pre mode の `.changeset/pre.json` の追加・変更・削除を含む)。表示されたコマンドで戻す。

```bash
git checkout -- . && git clean -fd .changeset packages
```

段 7 の push が拒否されたときは、local に commit と tag が残り、origin は変わらない。表示されたコマンドで local を戻す (自動では実行されない)。

```bash
git tag -d vX.Y.Z && git reset --hard origin/master
```

## 止まったとき

同じコマンド (`pnpm run release`) を再実行すると、続きから進む。進捗のファイルはなく、毎回 git、GitHub、npm の状態を読んで、どの段から再開するかを決める。tag を push した後に止まったときは、origin に tag があるので、再実行は後半 (段 8) から始まる。

入口、前半、後半のどこで止まっても、次の形で表示する。exit code は 1 である。

```
<見出しの行>
error:
  $ <失敗したコマンド> (exit <N>)
  | <stderr または job の log の該当行>
  raw output (escape sequences removed, known token shapes masked): <保存先>
possible causes:
  - <原因の候補>
    check: <確かめ方>
try:
  - <対処の例>
see docs/releasing.md: <この文書の見出し>
note: this may be an F3 situation (some packages are published)    (公開済みのパッケージがある可能性があるとき)
```

見出しの行は、入口なら `release stopped: <理由>`、前半なら `release stopped at <段>: <理由>`、後半なら `[<route>] <理由>` である。

- `error:` の `|` で始まる行は、外部 (npm、gh、git、job の log) の出力から、制御文字と token を除いて切り出したものである。コマンドが無い停止 (判定だけの停止) では、`$` の行を出さず、判定の理由を 1 行出す。
- `raw output` の保存物は、エスケープ列と制御文字を除き、既知の形の token を伏せてある。行をまたぐ秘密 (PEM) と、JSON でラベルと値が別の項目に分かれた秘密は伏せていない。ファイルは 0600、ディレクトリは 0700 である。ただし 0600 / 0700 は Linux のファイルシステムの上でだけ成り立つ (WSL の `/mnt/c` のような drvfs では chmod が効かない)。
- `possible causes:` は最大 3 件で、既知の原因を決まった優先度の順に並べる。既知の原因に当たらなければ、場所ごとの既定の候補が 1 件出る。
- `pnpm verify` は、前半の段 1 で段ごとに流れる。失敗した段は `pnpm <名前>` として表示されるので、同じコマンドを流し直すと、その段の出力だけを見られる。tsc と oxlint の診断は stdout に出るため `error:` には写らず、画面の上に残る。
- 手元の npm の認証 (`npm trust list` の対話、`npm stage approve`) で `npm error 404 ... /-/v1/done` が出たら、ブラウザの認証が時間内に終わらなかったということである。同じコマンドを再実行し、開いた画面で認証を最後まで終える。

後半の `[<route>]` の `route` の意味は次のとおり。

| route      | 意味                                                           | 進む先                                     |
| ---------- | -------------------------------------------------------------- | ------------------------------------------ |
| `F1`〜`F4` | 「失敗したとき」の対応する節                                   | `### F1:` 〜 `### F4:`                     |
| `rerun`    | 一時的な失敗か中断。何も壊れていない                           | 同じコマンドを再実行する                   |
| `manual`   | 自動の判定が形を読めなかった、または状態が自動では決められない | `## 手作業の手順` の、停止の場所に合う小節 |

`note: this may be an F3 situation` が付いたときは、公開済みのパッケージがあるかもしれない。`npm view <name> versions --json` を 6 つ実行して、公開済みの数を確かめてから、route の節に進む。

### 止まった理由と route

後半の停止の理由 (表示の先頭の英文の断片)、公開済みのパッケージが 0 件のときと 1 件以上のときの route、次の手を示す。公開済みの件数を読めなかったときは、route が分かれる行は `manual` になり、F3 の可能性が併記される。

| 理由の断片                                                                                                    | 公開 0 | 公開 1 以上 | 次の手                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------- | ------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `No Release workflow run was found for the tag commit within the wait`                                        | F4     | manual      | 公開 0: workflow の起動条件を確かめる (F4)。公開 1 以上: 公開済みの一覧と stage list を手で確かめる                                                         |
| `The validate job failed`                                                                                     | F1     | manual      | 修正して `--tag-only` (F1)。原因が release.yml なら F4                                                                                                      |
| `The npm-stage job failed`                                                                                    | F2     | F3          | stage list を確かめ、あれば reject して F1 の 3〜4                                                                                                          |
| `Unexpected output shape`                                                                                     | manual | manual      | 保存した生の出力を読み、ADR-029 の「結果」に書き、`## 手作業の手順` で続ける                                                                                |
| `Staged content check failed`                                                                                 | F2     | F3          | F2: reject して F1 の 3〜4。F3: 未承認を reject、公開済みを deprecate、patch で出し直す                                                                     |
| `No package is staged`                                                                                        | F2     | manual      | reject するものはない。npm-stage の job の log を確かめ、F1 の 3〜4                                                                                         |
| `Published packages are not a prefix of the manifest order`                                                   | manual | F3          | 数分後に再実行 (registry の反映が遅れている可能性)。変わらなければ F3                                                                                       |
| `is published with an integrity that differs from the validated one`                                          | manual | F3          | F3                                                                                                                                                          |
| `Trusted publisher settings differ`                                                                           | manual | manual      | 表示された 6 つの出力を読み、「一度だけの移行」の手順 3 / 3a                                                                                                |
| `post-approve check (integrity) failed`                                                                       | manual | F3          | 公開物が検査済みのバイト列と違う。deprecate して patch で出し直す (F3)                                                                                      |
| `post-approve check (dist-tag) failed`                                                                        | manual | manual      | `npm dist-tag add` で直す                                                                                                                                   |
| `post-approve check (release) failed`                                                                         | manual | rerun       | github-release の job の re-run。tag を打ち直すことになったら先に Release を消す                                                                            |
| `post-approve check (attestation-missing) failed`                                                             | rerun  | rerun       | provenance がまだ registry に出ていない。数分待って同じコマンドを再実行する。変わらなければ、provenance なしで公開されたものとして ADR-029 の「結果」に書く |
| `post-approve check (attestation-digest) failed`                                                              | manual | manual      | provenance が validate の tarball と別の内容を指す。`attestations-<名前>.json` と `log-manifest.txt` を見比べる                                             |
| `post-approve check (shape) failed`                                                                           | manual | manual      | `### approve の後の確認` を手で行う                                                                                                                         |
| `npm stage approve failed`、`Interrupted`、`The workflow run was re-run during the check`、`A command failed` | rerun  | rerun       | 同じコマンドを再実行。`A command failed` が繰り返すときは出力を読む                                                                                         |
| `The npm 2FA skip expired (or was not chosen)`                                                                | rerun  | rerun       | 再実行し、対話の認証で「5 分間 2FA を省略」を選ぶ                                                                                                           |

`post-approve check` は段 11 だけで出て、外れをすべて集めて表示する (先頭に最も重い route を 1 つ、最後に ADR-029 の「結果」の欄に写せる形の一覧)。`npm stage approve failed` は、2FA のキャンセル、誤入力、E409 の使い切りで出る。stage は有効なままなので、再実行すれば続きから進む。

Ctrl-C は 1 回目で、待機と再試行の区切りで止まり (`Interrupted`、route は `rerun`)、2 回目で即座に終わる。

### 入口の停止

入口の判定で止まったときは `release stopped: <理由>` と表示し、何も変えずに exit 1 で終わる。理由の英文の断片と、次の手は次のとおり。

| 状態                                                                      | 理由の断片                                                                                             | 次の手                                                                                                       |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| 端末でない                                                                | `stdin and stdout must both be a terminal`                                                             | 端末で実行する                                                                                               |
| npm / gh の版、registry の設定                                            | `is older than`、`is 13 or newer`、`npm registry is`                                                   | 版を上げる、または設定を直す                                                                                 |
| 引数                                                                      | `unknown argument`、`cannot be combined`、`--pre needs a tag`                                          | 引数を直す。`--tag-only`、`--pre <tag>`、`--exit-pre` は同時に使えない                                       |
| 観測の失敗                                                                | `git ls-remote failed`、`npm view failed`                                                              | 原因 (ネットワーク、認証) を直して再実行                                                                     |
| 6 パッケージの版が一致しない                                              | `version ... differs from`                                                                             | 版を確かめる。手で `package.json` の版を上げない                                                             |
| tag が origin にあり、公開が未完了で、HEAD が tag の commit でない        | `is unfinished (published ...); run git switch --detach vX.Y.Z, then rerun without flags to finish it` | `git switch --detach vX.Y.Z` の後に、フラグなしで再実行                                                      |
| tag が origin にあり、公開が未完了で、フラグが付いている                  | `is unfinished (published ...); rerun without flags to finish it`                                      | フラグなしで再実行して、まず完了させる                                                                       |
| tag が local だけにあり、HEAD と同じ commit (段 7 の push が失敗した状態) | `exists at HEAD but not on origin (the push failed)`                                                   | `git tag -d vX.Y.Z && git reset --hard origin/master`。`--tag-only` で打ち直すなら、先に `git tag -d vX.Y.Z` |
| tag が local だけにあり、HEAD と違う commit                               | `a stale local tag`                                                                                    | `git tag -d vX.Y.Z` の後に再実行                                                                             |
| `--tag-only` で、tag がすでにあり、公開が完了している                     | `is already released`                                                                                  | 打ち直すなら、先に「失敗したとき」の F1 の手順で tag を消す                                                  |
| `--tag-only` で、一部が公開済み                                           | `is partly published`                                                                                  | F1 の打ち直しは公開 0 が前提。F3 の手順へ                                                                    |
| `changeset status` の失敗、不整合                                         | `changeset status failed`、`changeset status is inconsistent`                                          | 理由を読んで直す                                                                                             |
| 版上げ済みで tag がない                                                   | `the version is bumped to ... but there is no tag`                                                     | `pnpm run release -- --tag-only`                                                                             |
| pre mode 中で、消費済みの changeset しかない                              | `in pre mode with only consumed changesets`                                                            | 新しい changeset を足す、または `pnpm run release -- --exit-pre` で stable を出す                            |
| 出すものがない                                                            | `nothing to release (no pending changeset`                                                             | changeset を書く                                                                                             |
| 後半に入るとき、作業ツリーが clean でない                                 | `working tree is not clean`                                                                            | 変更を戻すか commit する                                                                                     |

### 待つ時間

待つ時間は `scripts/release-after-push.ts` の `WAIT` にまとめてある。

待っている間は、sleep の前に毎回 `waiting for <待つ対象>: <経過秒>s / <上限>` の行が出る。

| 待つ対象                                            | 間隔  | 上限                         |
| --------------------------------------------------- | ----- | ---------------------------- |
| tag の commit の run が現れるまで (段 8)            | 10 秒 | 3 分                         |
| validate の job の log を読めるまで (段 9)          | 30 秒 | 3 回                         |
| stage が見えるまで、approve 後の反映 (段 9、10、11) | 30 秒 | 5 分                         |
| E409 が解けるまで (段 10)                           | 30 秒 | 1 つの stage id につき 20 回 |

### 判定の根拠の保存先

判定の結果にかかわらず、生の出力を保存する。形を誤読して通っていないかを、後から人が確かめられるようにするためである。

- `.tmp/release/v<版>/<時刻>/` (1 回の実行につき 1 つのディレクトリ)
  - `run.json`: `gh run list` の出力。
  - `jobs.json`: `gh run view --json jobs,status,conclusion` の出力。3 つの job の結論はここにある。
  - `run-attempt.json`: `gh api` の `run_attempt`。
  - `log-manifest.txt`: validate の job の log のうち、manifest を出した step の行。
  - `stage-list-<名前>.json`、`view-<名前>.json`: パッケージごとの `npm stage list --json` と `npm view` の出力。
  - `attestations-<名前>.json`: 段 11 で取得した attestation の本文 (制御文字を除いて整形し直したもの。元のバイト列とは違う)。
  - `waits.json`: 待ちごとの対象、結果 (`done`、`exhausted`、`interrupted`、`halted`、`error`、途中なら `running`)、probe の回数、経過秒、間隔、上限。段 11 の待ちには、周ごとに残っていた観察 (`rounds`) も並ぶ。`WAIT` の定数を見直すときに読む。
- `.tmp/release/trust-<時刻>/`: `npm trust list --json` の 6 つの生の出力。

`.tmp/` は gitignore されているので、作業ツリーは汚れない。

## 手作業の手順

自動の判定が「形の不一致」で止まったときに使う。コマンドが期待と違う形の出力を返したとき (`[manual]` と表示されたとき) に、人の目視で同じ確認を行い、approve まで進める。出力の書式が期待と違った点は、ADR-029 の「最初のリリースで確かめること」の「結果」の欄に書く。

停止の場所に合う小節から始める。

| 止まった場所                                                                                               | 始める小節                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 段 1 または段 10 の trust の確認で、出力の形が読めない (`trust list output has an unexpected shape`)       | `### trust の確認`。保存した生の出力 (`.tmp/release/trust-<時刻>/`) を読む。中身が期待どおりなら、`pnpm run release` の判定 (`scripts/lib/release-check.ts` の `checkTrustList`) の側を、実物の形に合わせて直してから再実行する。迂回するフラグはない |
| 段 1 または段 10 の trust の中身が期待と違う (`trust does not match`、`Trusted publisher settings differ`) | 「一度だけの移行」の手順 3 / 3a。6 つの出力を読んでから、設定し直すか、旧 trust を消す                                                                                                                                                                |
| 段 8 の run の形が想定外 (job の数、結論が想定外)                                                          | Actions の画面と `jobs.json` で run を確かめる。validate と npm-stage が success なら `### approve の前の確認` から。そうでなければ「失敗したとき」の原因に合う節                                                                                     |
| 段 9 の形の不一致 (log の manifest、`npm stage list` の item、stage の `tag` が省かれている、tar の形)     | `### approve の前の確認` から                                                                                                                                                                                                                         |
| 公開済みの一覧が読めない (`published` が不明)                                                              | `### approve の前の確認` の 4 (`npm view <name> versions --json` を 6 つ)。公開済みがあれば F3 の可能性を考える                                                                                                                                       |
| 段 11 の形の不一致 (`post-approve check (shape)`)                                                          | `### approve の後の確認`                                                                                                                                                                                                                              |

内容の不一致 (`Staged content check failed` など) は、手作業ではなく F2 / F3 である。

### trust の確認

「一度だけの移行」の手順 3 の読み戻し (`npm trust list` を 6 つ) を再実行し、出力が手順 3 の期待と変わっていないことを確かめる。`npm trust list` は読み取りでも 2FA を求める。

```bash
for p in skam skam-canvas-renderer skam-html-renderer skam-xml-parser skam-xml-stringify skam-web-component; do echo "== $p"; npm trust list "@kanbun-skam/$p" --json; done
```

### Release manifest の書式

validate の job は、manifest の表を Step Summary (`$GITHUB_STEP_SUMMARY`) と job の log の両方に出す (step id `summary`、step 名 `Print the release manifest`)。書式は次のとおり。

```
## Release manifest
- tag: vX.Y.Z
- version: X.Y.Z
- distTag: latest

| # | name | file | integrity |
| --- | --- | --- | --- |
| 1 | @kanbun-skam/skam | kanbun-skam-skam-X.Y.Z.tgz | sha512-... |
```

表の integrity は、summary の step が `npm-tarball/` の tgz から sha512 を計算した値で、manifest の `integrity` を写したものではない。manifest の値と違っても summary の step は止まらない。同じ job の verify-manifest が先に止めるためである。manifest や tgz に不備があれば、summary の step は何も出さずに失敗する。

log は書かれた後に編集できず、artifact の保存領域とは別にある。`pnpm run release` は、この log の表を錨にしている。手で読むときは、Step Summary でも log でもよい。log は次のコマンドで取る。

```bash
gh run view <run-id> --log --job <validate の job の id>
```

### approve の前の確認

`npm stage publish` は 2FA を求めず、approve だけが 2FA を求める (`npm help stage`)。tag 起点で自動で stage されるので、approve の前の確認が、公開物を決める唯一の確認になる。次の 4 項目をすべて確かめ、1 つでも外れたら approve せず、「失敗したとき」に進む。

1. **6 つが stage されている**: `npm stage list` を 6 パッケージそれぞれに実行し、各パッケージに、この版が 1 件ずつある。

   ```bash
   npm stage list @kanbun-skam/skam
   npm stage list @kanbun-skam/skam-canvas-renderer
   npm stage list @kanbun-skam/skam-html-renderer
   npm stage list @kanbun-skam/skam-xml-parser
   npm stage list @kanbun-skam/skam-xml-stringify
   npm stage list @kanbun-skam/skam-web-component
   ```

2. **integrity が log の表と一致する**: `npm stage view <stage-id>` の integrity を、Step Summary か log の表の同じパッケージの integrity (`sha512-...`。summary の step が tgz から計算した値) と照合する。`npm stage view` の出力に integrity がなければ `--json` を付ける。それでも出なければ、手順 3 でダウンロードした tgz から計算して照合する。

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

この照合は、取得時の欠落と改変を検出するものである。照合の錨は validate の job の log (または Step Summary) で、tgz と manifest が入った artifact は錨にしない (artifact は validate の job の外から書き換えられうるため)。

### approve

manifest の順 (依存の根から) に、6 回続けて approve する。現在の依存では、`skam` → `skam-canvas-renderer` → `skam-html-renderer` → `skam-xml-parser` → `skam-xml-stringify` → `skam-web-component` の順である。実際の順は、manifest の `#` の並びに従う。`skam-web-component` を先に approve すると、依存先が未承認の間はインストールできない。

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

### approve の後の確認

失敗しても、公開は取り消さない。結果は ADR-029 の「最初のリリースで確かめること」の「結果」の欄に書く。`pnpm run release` は、段 11 でこの 4 項目を判定し、`post-approve results (for the Results section of ADR-029):` に続けて結果を表示する。

- `dist-tags`: `npm view <name> dist-tags` が 6 つとも期待どおり。
- `dist.integrity`: `npm view <name>@X.Y.Z dist.integrity` が、log の表の integrity (summary の step が tgz から計算した値。manifest の `integrity` との一致は verify-manifest が済ませている) と一致する。
- provenance: 6 つとも、`npm view <name>@X.Y.Z dist.attestations` に url と、`provenance.predicateType` が `https://slsa.dev/provenance/v1` であることを確かめる。url (`https://registry.npmjs.org/-/npm/v1/attestations/` の下だけ) の bundle を取得し、`predicateType` が SLSA v1 の要素の `bundle.dsseEnvelope.payload` を base64 から復号して、`subject[0].digest.sha512` (16 進) が log の表の integrity と一致することを確かめる。手で確かめるときは、`curl -s <url>` の本文から同じ値を読み、`dist.integrity` の base64 を 16 進に直して比べる。
  - 無いとき (`attestation-missing`): 30 秒おきに最大 5 分読み直しても現れなければ止まる。数分待って再実行する。6 つとも公開済みなら段 10 は通り、段 11 だけをやり直す。
  - digest が違うとき (`attestation-digest`): provenance が、検査済みの tarball と別の内容を指している。公開物の integrity は上の確認で一致を見ているので、tarball は検査済みのもの。
  - 取得できない、本文が読めない、url が registry の下でないとき: 形の不一致 (shape) として止まる。
  - 確かめないこと: bundle の署名と、署名した workflow (出所)。digest が一致しても、registry か通信の途中が同じ digest の偽の bundle を返した場合は区別できない。このリポジトリの staged publishing と trusted publishing では、predicateType が SLSA v1 の provenance の attestation が付く。
- GitHub Release: `gh release view vX.Y.Z` で存在を確かめる。

## prerelease

prerelease (`X.Y.Z-beta.N`、`X.Y.Z-rc.N` など) は、changesets の pre mode で作り、`pnpm run release` のフラグで出す。tag に `-` を含めば、release.yml が dist-tag `next` と GitHub の prerelease にする。

```bash
pnpm run release -- --pre beta   # pre mode に入り (または tag を切り替え)、prerelease を出す
pnpm run release -- --pre rc     # beta から rc に切り替えて出す
pnpm run release -- --exit-pre   # pre mode を抜けて、stable を出す
```

どのフラグも、出す変更の changeset (`pnpm changeset`) を commit してから実行する。フラグは同時に使えない。先頭の `--` は付けても付けなくてもよい。

- `--pre <tag>`: pre mode でなければ `changeset pre enter <tag>`。別の tag の pre mode なら `pre exit` の後に `pre enter <tag>`。同じ tag の pre mode なら何もしない。その後は通常のリリースと同じ。
- フラグなしで pre mode 中に実行すると、今の tag の次の prerelease を出す。新しい changeset が要る。なければ入口で止まる (`in pre mode with only consumed changesets`)。
- `--exit-pre`: pre mode でなければ段 1 で止まる。pre mode なら `changeset pre exit` の後に `version` で stable の版にする。

### 検証で分かった挙動

scratch のコピー (`@changesets/cli` 2.29.8) で観察した。`pnpm run release` (`release.ts`) を通した確認は、`scripts/release.test.ts` の実際の `changeset` を使うテストである。

- beta から rc に切り替えると、番号を引き継ぐ。beta.1 の次の rc は `rc.0` でなく `rc.2` になる。
- pre mode では、`changeset version` の後も changeset の md が消えずに残り、`.changeset/pre.json` の `changesets` に名前が入る。残った md は、次の `changeset status` では未消費と数えない。
- `--exit-pre` の stable の CHANGELOG には、先頭に `## X.Y.Z` が足され、prerelease の節がその下に残る (畳まれない)。
- changeset に名前のないパッケージの CHANGELOG には、本文のない見出し (`## X.Y.Z-beta.1` など) ができる。これは pre mode でなく、`fixed` グループの性質である。stable の patch でも起きる。`checkChangelog` は本文のない節を失敗にするので、`pnpm run release` が段 2 で次の 1 行を補う。

  ```
  - Version bump only. Released together with the other @kanbun-skam packages at the same version.
  ```

- `--exit-pre` の後の `changeset version` は、`ignore` に載った private パッケージのうち、内部依存を持たないもの (`baseline-check`) の版を上げ、空の CHANGELOG.md を作る。`@changesets/assemble-release-plan` 6.0.9 の不具合である。`pnpm run release` は、`ignore` 済みパッケージの変更を戻し (`restored <path> (ignored by changesets)` と表示する)、その後の変更が「6 公開パッケージの `package.json` と `CHANGELOG.md`、`.changeset/*.md` の削除、`.changeset/pre.json`」に収まらなければ段 2 で止める。release commit は、この許可リストのパスだけを add する。`scripts/release.test.ts` の「changesets bug (K7)」のテストが、不具合が直ったときに落ちて知らせる。
- dist-tag は `next` になる。pre.json の tag 名 (`beta`、`rc`) は、dist-tag に影響しない。

## 失敗したとき

版番号を守る (0.2.0 を欠番にしない) ことを優先し、npm に 1 つも公開されていない間は、同じ版で出し直す。`pnpm run release` が `[F1]` から `[F4]` を表示して、この節を案内したときは、案内された節の手順に従う。自分で原因を見て選ぶときも、手順は同じである。

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

`pnpm run release` が `[F1]` と表示してこの節を案内したとき。

1. master で修正を commit して push する。
2. 6 つとも未公開であることを確かめる (`npm view <name> versions --json` を 6 つ)。
3. admin が tag を消す (上の「tag の削除」)。
4. 同じ版の tag を、修正後の commit に打つ。

   ```bash
   pnpm run release -- --tag-only
   ```

   `--tag-only` は、段 1 の trust の再確認と `pnpm verify` を行い、HEAD の 6 つの version が等しいこと、tag が local にも origin にもないこと、GitHub Release がないことを確かめ、版上げを飛ばして tag だけを push する。前提が外れたら何も変えずに止まる。push が拒否されたら、local の tag を消すコマンド (`git tag -d vX.Y.Z`) が表示される。tag を push できたら、そのまま後半 (段 8〜11) に進む。

### F2: npm-stage が途中で失敗した、または stage 済みで approve 前に問題が見つかった

`pnpm run release` が `[F2]` と表示してこの節を案内したとき。表示された理由 (どのパッケージの何が外れたか) を先に読む。

npm-stage の job の log に `package not found`、`E401`、`ENEEDAUTH` があるときは、trusted publisher の設定が期限切れか削除されている (0.2.0 の 2 回の失敗は、どちらもこれだった)。`E401` と `ENEEDAUTH` だけで、`package not found` が出ないこともある。npmjs.com の各パッケージの Settings → Trusted publishing に「This trusted publisher configuration has expired」が出ていないかを確かめる。出ていたパッケージは、`npm trust list <name> --json` で id を見て `npm trust revoke <name> --id <id>` で消し、「一度だけの移行」の手順 3 のコマンドで作り直す。その後、次の手順 1 から続ける。

1. `npm stage list <name>` で stage 済みのものを探し、`npm stage reject <stage-id>` で取り消す (2FA を求められる)。
2. 共通の最初の手順で Release を消す。
3. F1 の手順 3〜4 と同じ。

reject 後に、同じ版を stage し直せるかは未確認である。`npm help stage` には、stage 済みの版は公開済みの版と同じ semver の一意性を共有する、とある (reject した版が再び stage できるかは書かれていない)。stage し直せなかったら F3 に進む。

### F3: 6 つのうち一部が approve 済み (公開済み)、または同じ版を stage し直せない

`pnpm run release` が `[F3]` と表示してこの節を案内したとき。

1. 未承認の stage をすべて `npm stage reject <stage-id>` する。
2. 公開済みのものに、理由を添えて deprecate する。

   ```bash
   npm deprecate @kanbun-skam/<name>@X.Y.Z "<理由>; use X.Y.(Z+1)"
   ```

3. 6 つすべてに patch の changeset を足し (changesets の `fixed` により、1 つ足せば 6 つの版が上がる)、X.Y.(Z+1) を、通常の手順で出す。
4. X.Y.Z の GitHub Release は残し、本文に欠番の旨を書く。

### F4: workflow の定義を直す必要がある

`pnpm run release` が `[F4]` と表示してこの節を案内したとき (Release workflow の run が 3 分待っても現れなかったときを含む)。

tag の commit の `release.yml` が使われるので、re-run では直らない。共通の最初の手順で Release を消し、F1 と同じく、修正後の commit に tag を打ち直す。

### re-run を使ってよいとき

失敗した job の re-run (artifact の保持は 7 日) は、原因が一時的で、stage が 0 件のときだけ使う。stage が 1 件でも済んでいたら、F2 に進む。re-run の後に `pnpm run release` を再実行すると、run の試行が変わったことを検出して (`The workflow run was re-run during the check`)、一度止まる。そのまま再実行すればよい。

### その他

- 誤って stage した: `npm stage reject <stage-id>`。
- 公開後に誤りが見つかった: `npm deprecate <name>@X.Y.Z "<理由>"`。

## approve の前で一度止めて確かめる

release の script や npm の版を変えた後は、npm や log の出力の形が想定と違うことがある。`pnpm run release` は、形が違えば推測で読み替えずに止まる。approve の前に保存物を目で確かめたいときは、次の順で進める。リハーサルの環境は無く、この実行が本番である。

1. changeset を書いて commit し、`pnpm run release` を実行する。
2. 段 5 の y/N は `y`。
3. 段 10 の y/N (trust の再確認と、判定結果の表示の後) で `N` を答える。exit 0 で終わり、approve はされない。
4. `.tmp/release/v<版>/<時刻>/` の保存物から、次を確かめる。
   - `log-manifest.txt` の 6 つの integrity が、段 10 の表示の integrity (先頭 16 文字と末尾 8 文字) と一致する。
   - `jobs.json` の 3 つの job (`Validate and pack`、`Stage on npm`、`GitHub Release`) の結論が `success` である。

   ```bash
   cat .tmp/release/v<版>/<時刻>/log-manifest.txt
   jq '.jobs[] | {name, conclusion}' .tmp/release/v<版>/<時刻>/jobs.json
   ```

5. 確かめたら、`pnpm run release` を再実行する。tag が origin にあり HEAD と同じなので、前半は飛ばされて後半から始まる。trust の確認で 2FA がもう一度要る。段 10 の y/N に `y` を答える。

想定内の別の分岐がある。stable の stage で `tag` が省かれていると、段 9 で形の不一致として止まり、y/N は出ない (`[manual]`、`stage item for <名前> has no string tag`)。これは失敗ではない。推測で `latest` とみなして prerelease を `latest` に載せる事故を避けるため、止まるようにしてある (ADR-031 の R1)。`## 手作業の手順` の `### approve の前の確認` から進む。

approve の後に確かめること (「approve の後の確認」) の結果と、手順書の出力の書式が期待と違った点は、ADR-029 の「最初のリリースで確かめること」の「結果」の欄に書く。段 11 が表示する `post-approve results (for the Results section of ADR-029):` の行を写せる。

## 最後の手段

OIDC が使えないとき (trust の設定が壊れた、OIDC の障害など) は、メンテナが 2FA を使って手元から publish できる。「一度だけの移行」の手順 5 の設定 (2FA 必須・bypass 2FA token 禁止) でも、2FA を使った publish は可能である。ただし、推奨しない。検査済みの tarball と、公開物の対応が切れるためである (validate の manifest と integrity による照合が効かなくなる)。やむを得ず行ったら、公開した版の `dist.integrity` を、手元の tarball から計算した値と照合し、経緯を ADR-029 に追記する。

## 制約

- master に branch protection を足すと、`release.ts` の push (`git push --atomic origin master vX.Y.Z`) が拒否される (ADR-029 の A5)。足すときは、リリースの経路を設計し直す。
- `v*` tag は、`pnpm run release` (または F1 の `--tag-only`) 以外で打たない。tag を打つと、`release.yml` が起動する。
- environment `npm` の deployment は tag `v*` に限られているので、branch からは起動できない。
