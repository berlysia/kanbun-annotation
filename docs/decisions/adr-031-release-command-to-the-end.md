---
status: Accepted
plan: plan-release-automation.md
---

# ADR-031: `pnpm run release` で公開の最後まで進める

実装計画: [Plan](../plans/plan-release-automation.md)
手順: [releasing.md](../releasing.md)
置き換え: [ADR-029](adr-029-staged-release-flow.md) の K1、K8 (受入基準の確かめ方と真正性の錨)、K12 を、この ADR が置き換える

この ADR の K1〜K18 は、この ADR の中の番号である。ADR-029 の決定を指すときは「ADR-029 K1」のように書く。

## コンテキスト

ADR-029 の `pnpm run release` は、tag の push で終わる。その後は、releasing.md を読みながら、人が次を行っていた。trust ×6 の目視、0.2.0 のときだけ `check-version-bump.mjs`、Actions の画面での待機、`npm stage list` / `view` / `download` と Step Summary の目視の照合、stage id を写しながらの 6 回の approve、E409 の手での再試行、approve の後の `npm view` の目視、失敗したときの F1〜F4 の選択。中断すると、どこまで進んだかを人が調べ直す。prerelease を作る手順はなく、1 パッケージだけの changeset で出す版は、CHANGELOG の検査で必ず止まる。

オーダーは 4 つである。(1) 人が手で行う操作をすべてコマンドに入れる。(2) approve の前後の確認を自動で判定する。(3) 途中で止まっても、再実行で続きから進む。(4) changesets の pre mode を検証して、beta / rc を同じコマンドから出せるようにする。この作業では tag を打たず、stage も publish もしない。0.2.0 の公開はこの作業の後に行い、pre mode を経ずに stable で出す。

### 確かめた事実 (2026-10-15)

範囲を付けて書く。「実物」は手元で実行または読み取りをして確かめたもの、「ソース」はコードを読んだだけで実行していないもの、「scratch」は実リポジトリに書かないコピーでの実験である。

- **現状 (実物)**: master は `895ba19` (PR #11)。公開 6 パッケージの版は 0.1.1 で、npm には 0.1.0 だけがある。`release.yml` は一度も実行されていない (`gh run list --workflow=release.yml` が空)。PR #11 の 3 つの changeset は、6 パッケージの一部 (3〜4 つ) にしか名前を書いていない。
- **npm 12.2.0 の `stage` / `trust` (ソース)**: `lib/commands/stage/*.js`、`lib/utils/{auth,key-values,tar,validate-uuid}.js`、`lib/commands/trust/list.js` を読んだ。`stage list --json` は `res.items` の配列をそのまま出す。`stage download` は cwd に `<scope-name>-<version>-<stageId>.tgz` を書く。`stage approve` / `reject` / `trust list` は `otplease` を通り、stdin と stdout の両方が TTY でなければ、認証の対話に入らず error を投げる。stage id は UUID の正規表現で検証される。item の実際の形 (registry が返すもの) は実行していない。
- **`trust list --json` のパイプ (利用者の確認)**: 対話で 2FA を 5 分省略した直後なら、`npm trust list @kanbun-skam/skam --json | cat` は通った。
- **gh 2.45.0 の `--json` (実物)**: `gh run list` / `gh run view --json` で、使えるフィールドを確かめた。`attempt` はない。run の attempt は `gh api repos/berlysia/kanbun-annotation/actions/runs/<id>` の `run_attempt` で取る。
- **`npm view` の JSON (実物)**: 公開済みの `@kanbun-skam/skam@0.1.0` で確かめた。複数フィールドを指定すると、要素 1 つの配列で、`dist.integrity` はドット付きの 1 つのキーになる。`dist.attestations` は、ないときキーごと省かれる。`npm view <name> versions --json` は、1 版だけでも配列を返す。
- **job の log の行の形 (実物)**: ci.yml の run `38719023343` で確かめた。`<job 名>\t<step 名>\t<時刻> <内容>`。各 step の最初の行には BOM が付く。`run:` の step は、スクリプトの本文を log にそのまま出す。release.yml の `summary` step は、manifest の表を `$GITHUB_STEP_SUMMARY` と stdout (job の log) の両方に出す。
- **tarball の形 (実物)**: `pnpm pack` した 0.1.1 と、公開済みの 0.1.0 の tgz を読んだ。gzip の member は 1 つ、tar のエントリはすべて通常ファイル、magic は `ustar\0` + `00`、size は 8 進、終端は 0 のブロック 2 つ。Node の `zlib.gunzipSync` は複数の member を黙って連結する (手元の実験)。
- **pre mode (scratch)**: `@changesets/cli` 2.29.8、HEAD のコピー。実リポジトリには書いていない。beta → rc で番号を引き継ぎ `rc.2` になる。stable の CHANGELOG に beta の節が残る。changeset に名前のないパッケージには、本文のない見出しができる。`pre exit` の後の `version` が、`ignore` 済みで内部依存のない private パッケージを上げる。`release.ts` を通した確認は、実際の `changeset` を一時 repo で動かすテスト (K18) であり、本物のリポジトリでの実行ではない。
- **空の CHANGELOG 見出しの原因 (scratch)**: pre mode ではなく、`fixed` グループの性質である。pre mode なしの stable でも、1 パッケージだけの patch で同じ見出しができた。
- **`pre exit` の不具合の原因 (ソース、scratch)**: `@changesets/assemble-release-plan@6.0.9` の pre exit の処理。`preVersions` が ignore 済みのパッケージを飛ばして作られるので、`preVersions.get(name)` が `undefined` になり、既存の release がないパッケージに patch を足す。

### 未確認の事項

0.2.0 の最初の run まで確かめられない。外れたときは、推測で読み替えずに止まり、releasing.md の手作業の手順で続ける (K11、K15)。0.2.0 で確かめた結果は、ADR-029 の「結果」の欄に書く。

- registry の `stage list` の item の形。特に、stable の stage で `tag` が省かれるか (R1)。
- E409 (`automated review hasn't finished`) の実際の stderr (shiori の手順書の記録のみ)。
- reject の後の、同じ版の再 stage (ADR-029 R1)。
- staged + trusted publishing での provenance (ADR-029 R3)。
- tag の push の run の `headBranch`。tag 名が入るかは見ていない。表示にとどめている。
- `npm trust list --json` の実物。移行のときに保存していない。期待値は releasing.md の整形した例しかない。
- `dist.attestations` がある場合の形。ないときの形は確かめた。
- 承認済みの stage が `stage list` に残るか。
- approve の後の `npm view` の反映の遅延の長さ。
- `release.yml` が一度も実行されていないこと。OIDC、artifact の受け渡し、`npm stage publish` の結線は未実行である。
- `npm stage` が scope の registry 設定を参照するか。validate を re-run したときに artifact が同名で衝突するか。job の log の保持期間 (R7)。stage の `actor` / `createdAt` の形。

## 検討した選択肢

### 差分最小案

release.ts は push までのままにし、後半を別コマンド (`pnpm run release:approve`) にする。`npm stage list` の結果を表にして、approve のコマンドを順に実行するだけにする。判定は人の目視のまま。pre mode は releasing.md に手順として書くだけで、release.ts は触らない。

### 中間案

前半はそのままにして、後半を「引数で tag を受け取り、段を順に実行するだけ」の薄いスクリプトで足す。

### 白紙設計案

ゼロから設計するなら、リリースを「観測できる外部状態から次の操作を決める reconciler」として作る。状態は git (tag)、GitHub (run の結論、artifact、log)、npm (stage の一覧、公開済みの版) にすでにあり、それを読めば「どこまで進んだか」は決まる。手元に進捗のファイルを持たない。各段は「観測 → 純粋関数で判定 → 1 つの操作」で、判定の外れは失敗の分類 (F1〜F4、再実行、手作業) に写す。2FA の要る操作だけ、人の対話を挟む。

起源: releasing.md の F1〜F4 は、すでに「外部の状態 (stage が何件か、公開済みが何件か) で分岐する」形で書かれている。手順を機械にするなら、その分岐の条件を観測で判定するのが最短である。進捗のファイルは、外部の状態と食い違う第 2 の真実になる。

### 採用案と理由

白紙設計案を採る。

- 差分最小案は、オーダーの (1) と (2) を満たさない。判定が人の目視のままで、前半と後半の間でどこまで進んだかを人が判断する。
- 中間案は、どこまで進んだかを人が判断して引数を選ぶことになり、オーダーの (3) を満たさない。
- 中断する地点 (push の直後、workflow の実行中、approve の途中) は、どれも外部の状態で区別できる (K1、K3)。
- 進捗のファイルを持つと、ファイルと外部が食い違うとき (手で 1 つ approve した、artifact が期限切れ) の回復手順が要る。
- 既存の release.ts の deps の注入とテストの形 (一時 repo + bare remote) を、後半にもそのまま使える。

前半 (段 1〜7) は既存の release.ts を拡張する。段の定義と、止まったときに残る状態 (ADR-029 K1) は変えない。

## 決定

手順の詳細は [releasing.md](../releasing.md) にある。ここには判断と理由だけを書く。

### 入口と前半

- **K1: 再開は外部状態から判定し、進捗のファイルを持たない。** 後半の各段は、毎回 git / gh / npm を読み直して判定する。却下: 進捗のファイル (`.tmp/release-state.json` など)。外部と食い違ったときの回復手順が要る。
- **K2: フラグは排他で、先頭の `--` の有無の両方を受け付ける。** `--pre <tag>` (`tag` は `^[a-z]+$`)、`--exit-pre`、`--tag-only` のうち 2 つ以上、値のない `--pre`、未知のフラグ、位置引数はエラー (exit 1、何も変えない)。approve を飛ばすフラグ (`--yes` など) は作らない。
- **K3: 入口の判定表 (`decideEntry`、純粋関数)。** HEAD の SHA、HEAD の 6 つの版、origin の tag の commit (`git ls-remote`)、local の tag の commit、6 パッケージが npm に公開済みか、pre mode か、を入力にする。上の行から順に、最初に当たる行を使う。未完了のリリースの上に新しいリリースを積まない (フラグ付き、または master が進んだ後の再実行は止める)。`changeset status` は、tag の状態で決まらないときにだけ実行する (status の失敗が後半の再開を止めないため)。後半は origin の tag の commit を使い、local の tag は見ない。行の一覧と停止の文言は releasing.md の「入口の停止」にある。
- **K4: `pnpm verify` は前半の段 1 の最後で実行する。** `package.json` の `release` を `node scripts/release.ts` に変える。後半から再開するときは、HEAD が検査済みの tag の commit なので、verify を繰り返さない。`--tag-only` で verify を省かないのは、F1 の打ち直しの対象が「修正後の未検査の commit」だから。
- **K5: trust の再確認は、段 1 の最初と、段 10 の approve の前に行う。** 対話 1 回 (`npm trust list` を TTY のまま。先に「5 分間は 2FA を省略する」を選ぶよう表示) の後、6 つの `npm trust list <name> --json` をパイプで取る。JSON が期待の形でなければ**形の不一致** (route は手作業。revoke に誘導しない)。形が合って、全エントリが `type: github`、`file: release.yml`、`repository: berlysia/kanbun-annotation`、`environment: npm`、`permissions: ["createStagedPackage"]` ちょうどの 1 件でなければ**中身の不一致** (6 つの出力を表示し、「一度だけの移行」の手順 3 / 3a を案内する。revoke は自動で行わない)。生の出力は、判定の結果にかかわらず `.tmp/release/trust-<時刻>/` に保存する。段 10 でも行うのは、後半の再開が数日後になりうるため。
- **K6: 出す版は `changeset status --output` で決める。** 公開 6 パッケージがすべて `type !== none` で `newVersion` が等しいことを求め、その値を版とする。`git ls-files .changeset/*.md` の判定は、pre mode で誤る (消費済みの md が残る) のでやめる。
- **K7: 版上げの後に、ignore 済みパッケージの変更を戻し、変更を許可リストで検査し、許可したパスだけを commit する。** 許可リストは「6 公開パッケージの `package.json` と `CHANGELOG.md`、`.changeset/*.md` の削除、`.changeset/pre.json` の追加・変更・削除」。段 6 は `git add -A` をやめる。理由: `pre exit` の後の `version` が、ignore 済みの baseline-check を上げる changesets の不具合。却下: 検出して止める。`pre exit` のたびに起きるので、1 コマンドで進める目的に反する。
- **K8: prerelease は `--pre <tag>` と `--exit-pre` で出す。0.2.0 は pre mode を経ずに出す。** changesets の挙動 (beta → rc で番号を引き継ぐ、stable の CHANGELOG に beta の節が残る) は直さず、releasing.md に書く。`check-version-bump.mjs` は、出す版が 0.2.0 のときだけ段 1 で実行する。pre mode から 0.2.0 を出す場合は、スクリプトが scratch で prerelease の版を作るので成り立たず、段 1 または段 2 で止める。0.2.0 の公開の後に、スクリプトとこの分岐を消す。
- **K9: 本文のない CHANGELOG の節に、定型の 1 行を入れる。** `- Version bump only. Released together with the other @kanbun-skam packages at the same version.`。`checkChangelog` (本文が空なら失敗、ADR-029 K2 d) は変えない。理由: このリポジトリの changeset は 6 つの一部にしか名前を書かない。補完しないと、1 パッケージの patch と 2 回目以降の prerelease が必ず段 3 で止まる。却下: `checkChangelog` を緩める (本文のない版を出さない、という ADR-029 の理由を崩す)。却下: 「changeset は 6 つ全部に書く」規約 (既存の changeset が守っておらず、関係のない変更が CHANGELOG に並ぶ)。

### 後半

- **K10: workflow の run は origin の tag の commit で探し、最新の attempt で判定する。** `gh run list --commit <tag の commit>` から、`headSha` が一致し `workflowName` が `Release` の run を選ぶ。なければ 10 秒おきに最大 3 分待つ。同じ commit に複数あれば `databaseId` の最大を使う。re-run の検出は、`gh api` の `run_attempt` と、job の `databaseId` の集合を、段 9 の判定の前後で比べる。job は表示名 (`Validate and pack` / `Stage on npm` / `GitHub Release`) で識別し、結論の組み合わせ (`judgeJobs`) を表で決める。想定外の結論 (cancelled、timed_out、null、job の数が 3 でない) は形の不一致として手作業に回す。cancelled を手作業に回すのは、手動の取り消しは人が理由を知っているから。
- **K11: approve の前の判定。信頼の錨は validate の job の log。** ADR-029 で人が行っていた「`npm stage view` の値を Step Summary と照合する」を、同じ独立性で機械に置き換える。Step Summary と同じ表は、validate の job の log にも出る。log は runner が書き、書かれた後に編集できない (削除はできるが、その場合は取得に失敗して止まる)。これを前提にすると、log は validate の job の外 (npm-stage の job の第三者コード、artifact の受け渡しの経路) からの改ざんに対して、独立した錨になる。判定 (`judgeStaged`、純粋) は次のとおり。
  1. log の manifest を、job 名と step 名 (`Print the release manifest`) と、内容が `## Release manifest` ちょうどの行で特定して読む (step のスクリプトの本文も log に出るため)。表の行は 6 行、`#` は 1〜6、`integrity` は `sha512-` + base64。
  2. 手元の正本 (tag、版、dist-tag、名前の集合と順序) との一致。
  3. artifact (取れれば追加で照合。取れなければ省略して進む。artifact は錨にしない)。
  4. `npm stage list <name> --json` の item の形と、`packageName` / `version` で絞った 1 件、UUID の id、`tag` が dist-tag と一致 (省かれていれば形の不一致。推測で `latest` とみなさない)。
  5. `npm stage download` の tarball の sha512 が、log の integrity と一致。
  6. tarball の中身 (gzip の member が 1 つ、tar を自前で読む、通常ファイルとディレクトリだけ、パスは `package/` の下、ファイルは `package.json` / `README.md` / `LICENSE` / `CHANGELOG.md` / `dist/**` に収まる、`package.json` を既存の `checkPackedPackageJson` に通す)。
  7. `npm view <name> versions --json` に、この版がない。

  結果は `ok` / `shape-unknown` / `mismatch` で返す。形の不一致は F に入れない (K15)。判定の根拠 (log の manifest、stage list、run と job の JSON) は、結果にかかわらず `.tmp/release/v<版>/<時刻>/` に保存する。

- **K12: 公開済みの集合は、公開物そのものと stage の一覧で判定する。** パッケージごとの状態は `published` / `published-wrong` / `staged` / `staged-ambiguous` / `missing`。「両方にある」場合は `npm view <name>@V dist.integrity` が log の integrity と一致するかで決めるので、承認済みの stage が list に残っても詰まらない。`missing` は approve の直後の反映の遅れでも起きるので、30 秒おきに最大 5 分読み直す。計画 (`planApprove`、純粋) は、公開済みが manifest の順の先頭からの連続であることを求め、残りを approve する。
- **K13: approve は、表示と y/N の後に、検証した id で、TTY のまま行う。** 段 10 で trust を再確認し、run の URL、版、dist-tag、manifest の順の各行 (名前、stage id、integrity の先頭 16 文字と末尾 8 文字、log と stage の tarball の一致) を表示して y/N を聞く。`N` (または EOF) は exit 0 で、再実行で同じ位置に戻る。`y` なら、段 9 で検証した id をそのまま使い、各回の直前に `staged` のままであることを確かめ直す。失敗したら、まず Ctrl-C を見て、次にそのパッケージの状態を読み直す。`published` なら成功として扱う。`staged` のままで stderr に `E409` があれば、30 秒待って再実行する (1 つの id につき最大 20 回)。それ以外の失敗 (2FA のキャンセルを含む) は `approve-failed` で、route は再実行。
- **K14: approve の後の判定。** 6 つについて `npm view <name>@V dist-tags dist.integrity dist.attestations --json` を読み、`dist-tags[dist-tag] === V` と、`dist.integrity` が log の integrity と一致することを判定する (反映の遅れに備え、外れたら最大 5 分読み直す)。`dist.attestations` は有無を表示するだけ。`gh release view` の有無も判定する。外れても公開は取り消さない。外れはすべて集めて、個別に分類して表示する (K15 の「1 回の停止で観測は 1 つ」の例外)。最後に、ADR-029 の「結果」の欄に写せる形で一覧を出す。
- **K15: 止まるときの分類は純粋関数 1 つに集める。** `classifyStop` が、観測 (判別 union) と、公開済みの集合 (0 件、1 件以上、不明) から、route (`F1`〜`F4`、`rerun`、`manual`)、理由、次の手、releasing.md の節を決める。公開済みの集合が不明なら、route が分かれる行は `manual` にして F3 の可能性を併記する。観測と表の行の対応は、すべての組み合わせをテストで固定する。節の見出しは定数で持ち、構造テストで releasing.md に実在することを確かめる。tag の削除、reject、deprecate は自動で実行しない。
- **K16: 外部コマンドは、実行時の設定から切り離して呼ぶ。** `gh` には常に `--repo github.com/berlysia/kanbun-annotation` (`gh api` は path と `--hostname` で固定)、`npm` には常に `--registry` と `--@kanbun-skam:registry` (scope の registry 設定は `--registry` より優先されるため) を付ける。子プロセスの環境変数から、`GH_HOST` / `GH_REPO` / `GH_ENTERPRISE_TOKEN` と、`npm_config_` で始まるもの (大文字小文字を問わない) を除く。すべて引数配列で呼び、shell を経由しない。入口で `npm --version` と `gh --version` を解析し、npm が 12.2.0 以上 13 未満、gh が 2.45.0 以上であることを確かめる。npm の上限は、`npm stage` が新しいコマンドで、major が変わると出力の形が変わりうるため。続けて `npm config get registry` と `@kanbun-skam:registry` の実効値を確かめる。

### 記録とテスト

- **K17: 記録は ADR-031 を新しく書き、ADR-029 は冒頭の注記以外を変えない。** ADR-029 は 0.2.0 の後に「結果」の欄を埋める生きた記録で、決定の差し替えを追記すると、どれが現行か読みにくくなる。却下: ADR-029 への追記。
- **K18: pre mode の検証は、実際の changesets を一時 repo で動かすテストに残す。** リポジトリの `node_modules/.bin/changeset` を、fixture の workspace (公開パッケージと、ignore 済みの private 2 つ。うち 1 つは内部依存なし) で動かす。(a) release.ts の段 1〜2 を実際の changeset で通す (通常、`--pre beta`、beta → `--pre rc`、`--exit-pre`、1 パッケージだけの changeset)。(b) changesets 自体の不具合の再現。(b) は不具合が直ると落ち、K7 の復元を消す合図になる。

## ADR-029 のうち、この ADR が置き換えるもの

ADR-029 の本文は変えない。ADR-029 の冒頭に、この ADR への注記を 1 行足した。

- **ADR-029 K1** (`release.ts` は検査から tag の push まで、`pnpm run verify` の後に実行する): `pnpm run release` は公開の最後まで進める。`pnpm verify` は前半の段 1 で実行する (K4)。
- **ADR-029 K8 のうち、受入基準の確かめ方**: 人の目視を、自動の判定 (K11) に置き換える。人の目視の手順は、形の不一致で止まったときのために、releasing.md の「手作業の手順」に残す。
- **ADR-029 K8 のうち、真正性の錨**: Step Summary の目視を、validate の job の log の機械的な照合 (K11) に置き換える。
- **ADR-029 K12** (prerelease は tag 側だけ対応する): `--pre` / `--exit-pre` で prerelease を作る (K8)。dist-tag と GitHub の prerelease の扱い (tag に `-` を含めば `next` と `--prerelease`) は、ADR-029 のまま。

## 脅威と統制

| 脅威                                                                                      | 統制                                                                                                                                                      | 残るもの                                                                                          |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| npm-stage の job の第三者コード、または artifact の受け渡しの経路での、tarball の差し替え | stage の tarball のバイト列を、validate の job の log の integrity と照合する (K11)。artifact は錨にしない                                                | log と artifact の両方を書き換えられる者 (log が書かれた後に編集できない、という前提が崩れたとき) |
| validate の job そのものの乗っ取り                                                        | 中身の自前検査 (K11 の 6) が、検査そのものの書き換えを拾う場合がある                                                                                      | tarball と log の表を両方そろえて書ける。ADR-029 A1 と同じ                                        |
| validate の job の中で、検査を無効にして細工した tarball を作る                           | 手元の信頼できる環境で、同じバイト列を検査し直す (K11 の 6。lifecycle script の不在、パスの検査、上限)                                                    | 検査が見ない種類の細工                                                                            |
| 外部の値 (log、`npm stage list`、`npm view`) による引数への注入、端末への制御文字         | stage id は UUID の正規表現、tag と版は正規表現で検査する。表示の出口を 1 つにして、制御文字 (C0、C1、ESC、Cf) を除く。構造テストで出口以外の出力を禁じる | `inherit` で流す出力 (下)                                                                         |
| 同じ stage の二重 approve、別の id の approve                                             | 検証した id だけを使い、各回の直前に `staged` のままか確かめ直す (K13)                                                                                    | stage の中身が id に対して不変であることは前提 (R10)                                              |
| 手元の設定による接続先の取り違え (`GH_HOST`、scope の registry)                           | 接続先を引数で固定し、環境変数を除く。実効値も確かめる (K16)                                                                                              | 除外が列挙であること (下)                                                                         |
| 旧 trust、余分な trust による直接公開                                                     | 段 1 と段 10 で、trust が 1 件であることを確かめる (K5)                                                                                                   | なし                                                                                              |

- **環境変数の除外は列挙である。** 除くのは `GH_HOST` / `GH_REPO` / `GH_ENTERPRISE_TOKEN` と `npm_config_*` だけで、`GH_CONFIG_DIR`、`NODE_OPTIONS`、proxy や CA の変数は子プロセスに渡る。実行者はメンテナ本人で、手元の環境変数は信頼できる前提である。
- **`inherit` で流す出力は無害化しない。** `gh run watch` の表示、対話の `npm trust list`、`npm stage approve` の stdout、前半の `spawnChecked` で実行するコマンド (`changeset`、`prettier`、`check-release`、`pnpm test:consumer`、`pnpm verify`) の出力である。npm と、リポジトリが管理する workflow とスクリプト由来の値なので、受け入れる。approve の stderr は、受けたそばから無害化して画面に流す。
- **stage の来歴 (誰が、いつ stage したか) は判定しない (R9)。**
- **stage の中身が id に対して不変であることは前提 (R10)。**

## spec からの訂正

実装の途中で、spec から外れた点。決定の内容を変えたものはなく、spec が置いた前提が現物と合わなかったもの、または spec より細かく決めたものである。

1. **K18 の fixture の公開パッケージは 6 つでなく 2 つ。** `fixed` グループの挙動 (名前のないパッケージの空の見出し) は 2 つで再現でき、速い。
2. **実装の順は plan-1 → plan-3 → plan-2 → plan-4 → plan-5。** plan-2 (前半の結線) が、plan-3 の表示の無害化を使う。
3. **K16 の版と registry の確認は、入口で 1 回、観測の前に行う。** 前半と後半の両方に効かせるため。
4. **後半のコマンドごとの引数の組み立ては `release-after-push-check.ts` に置いた。** spec の Architecture は `release-check.ts` と書いていた。`gh run ...` や `npm stage ...` の引数は後半だけが使うので、後半の純粋関数のモジュールに置いた。`release-check.ts` には、共通の `buildGhArgs` / `buildNpmArgs` が残っている。
5. **`createRunner` の `pipe` は、stdout / stderr を 64 MiB で打ち切る。** spec にない。上限のない出力でメモリを使い切らないため。超えたら `command-failed` で、子プロセスを止める。
6. **`scripts/tsconfig.json` の `include` に新しいファイルを足した。** `include` はファイルを列挙していて、足さないと型検査の対象にならなかった。
7. **`parseNpmViewVersions` を `release-check.ts` に足し、`parseReleaseArgs` を消した。** `npm view <name> versions --json` は配列を返し、既存の `parseNpmView` はそれを拒否した。`parseReleaseArgs` は `parseReleaseFlags` に置き換わった。
8. **後半の公開パッケージの名前は、private でない workspace のパッケージと `orderByDependencies` から出す。** `resolvePublicPackages` は使わない。固定グループ (`fixed`) とこの集合は等しい。段 3 と CI がそれを検査する。
9. **`readVersion` が返す `WorkspacePackage` の依存の欄が空だったので、`orderByDependencies` が順序を決められなかった。** 依存の欄を読むようにした。
10. **`checkOnly` (完了済みの再実行) でも、log の manifest を読む。** approve の後の integrity の確認 (K14) が、log の manifest の integrity を要る。
11. **`inherit` で流す出力 (`gh run watch`、対話の trust list、approve の stdout、前半の `spawnChecked` のコマンド: `changeset`、`prettier`、`check-release`、`pnpm test:consumer`、`pnpm verify`) は無害化しない。** 受け入れる例外である (「脅威と統制」)。
12. **release.yml の manifest の出力は、`- distTag:` の行と表の見出しの間に空行が 1 つある。** log の解析は、空行をちょうど 1 つ許す。
13. **実物の `pnpm pack` の tar のヘッダは、checksum を `NNNNNN \0` の形で書く。** 両方の並び (`NNNNNN\0 ` と `NNNNNN \0`) を受け付ける。

## Followup

次の作業は、この ADR の範囲外とする。

1. 0.2.0 の実測で、K11 / K12 / K15 の判定と、待機の定数 (`scripts/release-after-push.ts` の `WAIT`) を見直す。
2. release.yml の summary step で、tgz から sha512 を再計算して log に出す。log の integrity を、manifest の写しではなく、独立に計算した値にする。release.yml はこの作業の範囲の外。
3. stage の来歴 (`actor`、`createdAt`) の表示 (R9)。形を 0.2.0 で確かめてから、y/N の表示に出すことを検討する。
4. `dist.attestations` があれば検証する。

## 受容するリスク

- **R1: npm stage と log の実際の形が、ソースから読んだ形と違う。** K11 で形を検査し、違えば生の出力を保存して手作業に回す (F に入れない)。integrity と中身は、tarball のバイト列から自前で計算するので、形に依存しない。特に、stable の stage で `tag` が省かれていると、0.2.0 は段 9 で手作業に落ちる可能性が高い。推測で `latest` とみなすより、prerelease を `latest` に載せる事故を避けるほうを取る。
- **R2: E409 の文言、承認済みの stage が list に残るか、approve の後の反映の遅れの長さが未観察。** E409 は code の文字列だけで判定し、approve の失敗では必ず状態の読み直しを先に行う。食い違いは最大 5 分待って「再実行」で止まる。二重 approve は、approve の直前の確かめ直しと、失敗後の読み直しで避ける。
- **R3: 後半の結線は、0.2.0 まで一度も本物で動かない** (ADR-029 R8 と同じ)。偽の gh / npm でテストし、外れたときの止まり方をテストで確かめる。最初の 0.2.0 では、y/N で `N` を答えれば approve の手前で止まるので、判定の結果だけを確かめてから進める。
- **R4: 2FA の省略が 5 分で切れる、または選ばれない。** trust の確認は 7 回の呼び出しを続けて行うだけで、EOTP は「再実行」で止まり、何も変えていない。approve は各回が TTY で 2FA を求めるので、省略がなくても進める。E409 の再試行で 2FA が繰り返されうる。
- **R5: 1 回の実行が長くなる** (verify と workflow の待機)。どの段で Ctrl-C しても、K3 で再実行から続けられる。
- **R6: changesets の不具合 (K7) の回避が、changesets の更新で不要になる、または挙動が変わる。** K18 (b) が落ちて知らせる。`@changesets/cli` は exact で固定している。
- **R7: job の log が取れない** (保持期間、権限)。形の不一致として手作業に回す。log の保持期間は repo の設定に依り、artifact の 7 日より短くはならない (GitHub の既定) が、未確認。
- **R8: 自動判定が人の照合を置き換えることで、表示を読まずに y を押す。** 判定が外れたら y/N に進まない。y/N の前に、log と stage の tarball の一致の結果と integrity の一部を表示する。錨 (log) と照合先 (stage、artifact) は別の経路。判定の根拠は常に `.tmp/release/v<版>/` に保存する。
- **R9: stage の来歴 (誰が、いつ stage したか) を判定しない。** バイト列が log の integrity と一致すれば完全性は担保されるので、来歴は帰属と監査の面だけに効く。`actor` / `createdAt` は形が未観察なので判定にしない。
- **R10: stage の中身が id に対して不変であることは前提。** 検証した id だけを approve する (K13)。中身を差し替えるには reject と再 stage が要り、その場合は id が変わって approve が失敗するはず (未観察)。再開時の公開済みの分は、`dist.integrity` の照合で確かめる。

## 作業の外に置いたもの (提供しない体験)

- 失敗時の復旧操作の自動実行 (tag の削除、reject、deprecate、`--tag-only` の打ち直し)。どれも取り消せない操作で、どれを実行するかは失敗の原因を人が見て決める。止まるときは、該当する節 (F1〜F4) を案内する。0.2.0 以降で同じ失敗が繰り返されたら検討する。
- approve の手前で止まる専用のフラグ (`--check-only` など)。段 10 の y/N で `N` を答えれば、判定の結果を表示した後、approve せずに止まる (exit 0)。y/N の前に trust の再確認があるので、判定だけを確かめたいときも 2FA を 1 回通す。

## 参考

- [ADR-029](adr-029-staged-release-flow.md): tag 駆動の staged publishing。この ADR が一部を置き換える
- [releasing.md](../releasing.md)
- [npm: staged publishing](https://docs.npmjs.com/staged-publishing)
