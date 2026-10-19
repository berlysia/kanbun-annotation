---
status: Complete
---

# ADR-032: `pnpm run release` が止まったときの 3 つの表示と、進み方の表示

実装計画: `git show 9b74cf3bd925f359c04f266fb9ba776c8396342f:docs/plans/plan-release-stop-report.md`
手順: [releasing.md](../releasing.md)
一部を変える: [ADR-031](adr-031-release-command-to-the-end.md) の K15 の停止の表示と、脅威と統制の `inherit` の例外

この ADR の K1〜K7 と I1〜I6 は、この ADR の中の番号である。ADR-031 の決定を指すときは「ADR-031 K15」のように書く。

## コンテキスト

0.2.0 の公開で `pnpm run release` は 2 回、F2 (npm-stage の job の失敗) で止まった。
どちらも表示は `[F2] The npm-stage job failed` と `next:` の 1 文だけだった。
原因 (`OIDC token exchange error - package not found`) は、利用者が Actions の画面で job の log を開くまで見えなかった。
入口の `git ls-remote failed` は git の stderr を捨てていた。
前半の子 (`pnpm verify` など) の失敗は `exited with 1` だけだった。
進んでいるときも、子のコマンドの出力が流れるだけで、どの段にいて、何を待っているかが分からなかった。

オーダーは、止まったときに入口・前半・後半のどこでも次の 3 つを毎回出すことである。

1. エラーの内容: 失敗したコマンドと、stderr または job の log の該当行
2. 推定される原因: 候補ごとの確かめ方つき
3. 対処の例: 実行できるコマンドか、見る画面

あわせて、各段で何を確かめ、どの値で通り、いま何を待っているかを出す。
守ることは 4 つである。
tag を打たず、stage も publish もしない。
判定は純粋関数に集め、外部コマンドは `deps` で注入する。
表示は出力関数 1 つを通る。
外部のエラー文は、表示の前に無害化する。

範囲の外に置いたものは 2 つある。
approve が毎回 2FA を求めるかは、確かめられていないので手順書に断定して書かない。
「48 時間以内に最初のリリースをする」は書かない (trusted publisher の期限は最初の 1 回の使用までなので)。

### 確かめた事実 (2026-10-19)

範囲を付けて書く。「実物」は手元で実行または読み取りをして確かめたもの、「ソース」はコードを読んだだけのもの、「計測」は実リポジトリに書かないコピーでの実験である。

- **0.2.0 の 2 つの run の log (実物)**: `gh run view <run> --log-failed` で取った。行の形は `<job 表示名>\t<step 名>\t<ISO 時刻> <内容>` で、最初の行の内容の先頭に BOM が付き、`##[group]` などの workflow command と ANSI の色が混ざる。
  - run 39196389682 (verbose なし、61 行): `npm error code E401` と、認証できない旨の `npm error` の数行、`##[error]Process completed with exit code 1.` だけ。`package not found` は出ていない。
  - run 39198354458 (verbose あり、83 行): `npm http fetch POST 404 .../oidc/token/exchange/package/...`、`npm verbose oidc ... OIDC token exchange error - package not found`、`npm verbose stack` が 6 行、`npm error code ENEEDAUTH`、`##[error]...`。
  - 結論: trust の期限切れは、verbose なら `package not found` で、verbose でなければ E401 / ENEEDAUTH だけで現れる。2 つの log は fixture として `scripts/lib/fixtures/` に写した。写す前に、URL の userinfo、`_authToken`、`Bearer`、`/login/cli/`、`eyJ`、`ghp_` 系、`TOKEN` / `SECRET` / `PASSWORD` の `KEY=value` を grep と全行の目視で調べ、秘密は無かった。
- **道具ごとの失敗の出力先 (計測)**: `pnpm verify` の中の道具に、失敗する入力を 1 つずつ与えた。vitest の失敗の中身は stderr、tsc は stdout だけ、prettier の `[warn] <file>` は stderr、oxlint の診断は stdout、失敗する script の `ELIFECYCLE` は stderr。stderr だけを受けると、test と format の失敗は中身が残り、typecheck と lint の失敗は残らない。
- **pnpm 10.27.0 と turbo での typecheck の失敗 (計測)**: リポジトリを scratchpad に clone し、型エラーを 1 つ足した。`pnpm typecheck` は exit 2 で、段の見出し (`> kanbun-annotation@0.1.0 typecheck`) と ` ELIFECYCLE  Command failed with exit code 2.` が stdout に出る。stderr には turbo の 4 行 (`<pkg>:typecheck: ERROR: command finished with error: ... exited (2)` など) だけが出る。pnpm 12.12.1 の計測では stderr に `$ <script の本文>` が出たが、pnpm 10 では出ない。stderr から失敗した段を割り出す作り方は、このリポジトリでは成り立たない。
- **release.yml の job の依存 (ソース)**: `npm-stage` と `github-release` は、どちらも `needs: validate`。validate が失敗すると残りの 2 つは skipped になる。
- **実装の前の確認 (利用者の端末)**: 2 つを利用者が実行した。(1) `bash -c 'npm trust list @kanbun-skam/skam 2> >(cat >&2)'` は、認証の案内、2FA、一覧、exit 0 の 4 つとも通った。(2) `bash -c 'pnpm verify 2> >(cat >&2)'` は、色と進み方の表示が読めた。崩れた道具は無かった。限界: これは bash の process substitution で「stderr が TTY でない」条件を近似したもので、Node の `inherit-keep-stderr` そのものではない。stderr に出た行の写しは受け取っていない。
- **手元の端末での見え方 (利用者の端末)**: 2026-10-19 に、出すもののない状態 (v0.2.0 が公開済みで changeset が無い) で `pnpm run release` を 1 回実行した。入口の行 14 (`release stopped: nothing to release (no pending changeset; v0.2.0 published 6/6)`) で止まり、`error:` / `possible causes:` / `try:` の 3 つが読める形で出た。判定だけの停止なので、`error:` の下は理由の 1 行になる。`entry:` の行 (止まる経路では出さない)、`stage N/11:` の行、子の stderr との並び (R9) は、この経路では出ないので未確認。次のリリースで見る。

## 検討した選択肢

### 差分最小案

止まる箇所ごとに、理由の文字列へ stderr の末尾と「原因はたぶん〜」の文を足す。型は変えず、`job-failed` の箇所だけ log を取って理由に連結する。進み方は、主な箇所に `log(...)` を散らす。

問題は 3 つある。
原因の候補と対処が自由な文に埋まり、「どの停止にどの候補が出るか」を表としてテストで固定できない。
同じ文面 (E401) が段 1 (未ログイン) と段 8 (trust の期限切れ) で別の原因を指すので、文字列を足していく形では、この区別が箇所ごとの if に散る。
外部の文が理由の途中に補間され、利用者向けの行 (`try:` など) と区別できない。

### 白紙設計案

停止を「観測 (どこで、どのコマンドが、何を出したか)」と「診断 (原因の候補、確かめ方、対処)」に分ける。停止はすべて 1 つの値に変換してから表示する。診断は観測を入力に取る純粋関数 1 つ (規則の表) が決め、整形も純粋関数 1 つにする。子のコマンドの stderr は受けて、無害化しながら画面に流し、末尾を保持する。

起源: ADR-031 K15 が「止まるときの分類は純粋関数 1 つに集める」を後半だけで実現している。この原則を入口と前半に広げ、分類 (route) の隣に診断を並べると、この形になる。原因の候補は今後も増える (0.2.0 だけで 4 つ)。規則を表の行として足せば、テストは「観測 → 候補」の対応表で固定できる。

### 採用案と理由

白紙設計案を採る。差分最小に寄せるのは 1 点だけで、後半の route の分類 (`classifyStop`、ADR-031 K15) を変えない。

- 全組み合わせのテストがあり (`release-after-push-check.test.ts`)、`RELEASING_SECTIONS` は deepEqual で固定されている。
- 診断はその隣に足し、route の表には触れない。
- 代わりに、後半の kind の知識が 2 つの表 (route と既定の候補) に分かれる。型 (`Record<StopObservation['kind'], ...>`) と網羅テストで、片方の更新漏れを抑える。この分裂を受け入れる。

前半の子の stderr も、白紙設計案どおり受ける。当初は `inherit` のまま残す案だった。しかしそれでは、最も止まりやすい `pnpm verify` で「stderr の該当行を出す」を満たせない。

## 決定

### 表示と診断

- **K1: 停止は 3 系統とも `StopReport` を通して、1 つの整形関数で表示する。** 欄は `headline`、`error`、`causes`、`remedies`、`section`、`notes`。表示の形は次のとおり。外部の行は必ず ` |` で始まる (I3)。

  ```
  <headline>
  error:
    $ <command> (exit <N>)
    | <line>
    raw output (unredacted, do not cat to a terminal): <path>
  possible causes:
    - <cause>
      check: <how to check>
  try:
    - <remedy>
  see docs/releasing.md: <section>
  note: <note>
  ```

  - `causes` と `remedies` は 1 件以上で、型 (`readonly [T, ...T[]]`) で表す。
  - `lines` が空なら `| (no error output)`、`exit` が `null` なら `(exit: signal or not started)` を出す。
  - コマンドが無い停止 (判定だけの停止) は `command` を `(no command)` にし、`$` の行を出さない。
  - 前半の `stop()` は、その場で表示するのをやめ、`FrontStop` (`stage`、`reason`、`error`、`recovery`) を `ReleaseOutcome` に載せて返す。表示は `reportOutcome` の 1 か所になる。`to undo:` は `try:` の先頭の行になる。
  - 取れた job の log は、gh が成功して返した中身なので、`$` の行に exit を出さない。読めなかったときは gh の失敗なので出す。

- **K2: 原因の候補は、純粋関数 `diagnose(site, error)` が規則の表で決める。** 表を上から評価し、当たったものを表の順に最大 3 件出す。どれにも当たらなければ、場所ごとの既定の候補を 1 件出す。
  - 規則が見るのは `error.matched` だけである。job の log では行頭が `npm error` / `npm ERR!` / `##[error]` / `npm verbose oidc` の行、手元の stderr では行頭が `npm error` / `npm ERR!` / `fatal:` / `error:` の行に絞る。外部の任意の行が規則を起動しないようにするためである。
  - 規則は 5 つで、この順に並ぶ。`trust-expired` (npm-stage の job の失敗で、E401 / ENEEDAUTH / `package not found` の行があるか、log を読めなかったとき)、`web-auth-timeout` (手元の npm の stderr に `/-/v1/done` と 404)、`npm-login` (手元の npm の E401 / ENEEDAUTH)、`git-remote` (`git ls-remote` / `git fetch` の失敗)、`output-shape` (出力の形が想定と違う停止)。
  - `trust-expired` の対処は revoke を含む。`check:` を先に出し、対処の文は「npmjs.com で期限切れと確かめたパッケージだけ」で始める。コマンドは表示するだけで、スクリプトは実行しない。
  - log を読めて、E401 / ENEEDAUTH / `package not found` のどれも無い npm-stage の失敗 (ネットワーク、registry の障害など) では `trust-expired` を出さない。
  - `npm-login` と `trust-expired` は、`source` (手元の stderr か job の log) と場所で分ける。後半の段 9〜10 の手元の `npm stage` の E401 は `trust-expired` に当たらない。
  - gh の認証の規則は、実物の出力を確かめていないので入れない。
  - 2FA の省略の期限切れは、既存の理由と次の手を、既定の候補と対処に写す。
- **K3: エラーの欄の行は、純粋関数で決まった順に処理する。** 順序はテストで固定する。
  1. 1 行を 4096 コードポイントで切る (巨大な 1 行で正規表現が遅くならないように)。
  2. job の log なら、`<job>\t<step>\t<ISO 時刻> ` の接頭辞と BOM を除く。
  3. エスケープ列 (CSI、OSC、U+009B、終端の無い途中切れ) を丸ごと除く。
  4. 制御文字を除く (`sanitizeForTerminal`)。
  5. secret をマスクする。対象は URL の userinfo、`ghp_` などの token、`_authToken=` と `Authorization: Bearer` の値、名前に `TOKEN` / `SECRET` / `PASSWORD` を含む `KEY=value`、JWT の形、npm の web 認証の URL のクエリと `/login/cli/` の後の id である。
  6. 行を選ぶ。job の log では行頭の形 (K2) で選び、`npm verbose stack`、`env:` の段の行、`::add-mask::` の行は選ばない。選んだ行が無ければ log の最後の 12 行を取る。
  7. 最後の 12 行を取り、各行を 300 コードポイントで切る。
  - 理由の文 (`headline`) には stderr の行を入れない (I2)。`describeFailure` の理由は、コマンドの名前と exit code だけにする。
  - マスクは行ごとなので、複数行にまたがる秘密 (PEM の本文) は対象外である。
- **K4: 失敗した job の log を取る。取れなくても、id が不正でも、route は変えない。**
  - `judgeJobs` の `job-failed` に `jobId` を足す。validate の id の検査は残す。npm-stage の `databaseId` は新しく読み、正の安全な整数でなければ `undefined` にする。判定の種類は変わらない (I6)。
  - `jobId` があれば `gh run view <run> --log-failed --job <id>` を pipe で実行する。試行は 30 秒 × 3 回。
  - 取れなければ、`| could not read the job log` と run の URL を出し、`logUnreadable` で `trust-expired` を候補に出す。
  - `describeStop` の理由は、表の固定の断片、`post-check` の `check`、固定の一覧のパッケージ名だけにする。観測の `what` は理由から外し、`error.lines` の先頭に足す。
  - 段 11 の結果の一覧と `most serious: [route] <reason>` の行は、停止の `headline` ではないので I2 の対象外である。これらは出口の無害化 (I1) で守る。
  - 待機の行の `attempt n/m` の `n` は、終えた probe の回数である。行の直後に `n+1` 回目の probe が走る。
  - 同時に 2 つの job が失敗する組み合わせは `job-failed` にしない (いまの挙動のまま)。release.yml では npm-stage が `needs: validate` なので、validate が失敗すれば npm-stage は skipped になり、log を取る job は一意に決まる。
- **K5: 前半の子プロセスと対話の trust list の stderr を、`inherit-keep-stderr` で受ける。**
  - 対象は `changeset`、`prettier`、`check-version-bump`、`check-release`、`pnpm test:consumer`、`pnpm verify`、対話の `npm trust list`。stdin と stdout は TTY のまま、stderr はチャンクごとに無害化して流し、末尾 1 MiB を保持する。
  - 前半の deps は `Promise` を返す。`spawnChecked` は消え、構造テストの同期の spawn は `git` と `ghRelease` だけになる。
  - 戻し方: 子ごとの `stdio` は 1 か所で選べる。崩れた子だけを `inherit` に戻すときは、その子の行の 1 か所を変える。戻した子は `| (stderr was not captured; the output is shown above)` の 1 行を出す。
  - **`pnpm verify` は段ごとに流す** (利用者の選択)。pnpm 10.27.0 では stderr から失敗した段を割り出せないので、release が `package.json` の `scripts.verify` を `&&` で分け、`pnpm <名前>` を 1 つずつ流す。各部分が `pnpm <名前>` に厳密に一致し、その名前が `scripts` に実在するときだけ分ける。それ以外は `pnpm verify` を丸ごと流す。最初に失敗した段で止め、`try:` にその段を流し直すコマンドを出す。子の `npm_lifecycle_event` は `verify` ではなく各 script の名前になる。段の数だけ pnpm の起動が増える。
  - **出せる範囲**: stderr の該当行を出せるのは、stderr に中身がある失敗までである。tsc と oxlint の診断は stdout に出る。stdout を受けると子から見て端末でなくなり、色と進み方の表示が変わるので、受けない。そのため tsc と oxlint の失敗では、失敗した段のコマンド、exit code、turbo の失敗の行、流し直すコマンドを出す。
  - **`gh run watch` を `inherit` に残す。** 端末の画面を書き換えて run の進み方を描くので、stdout を TTY でなくすと表示が使えなくなる。失敗は後の `gh run view` の JSON で判定する (K4) ので、stderr を拾う利点がない。これで ADR-031 の「`inherit` で流す出力は無害化しない」の例外は `gh run watch` だけになる。
- **K6: git と `npm view` の stderr を、入口と前半でも捨てない。`git ls-remote` の失敗を「tag が無い」と区別する。**
  - 入口の観測の `originTag` の error と `published` の error に `ErrorExcerpt` を足す。`published` は、失敗したパッケージの名前の一覧と、それぞれの理由を 1 つにまとめた `ErrorExcerpt` を持つ (6 つの結果を真偽値 1 つにまとめるのをやめる)。まとめるのは R の `observeEntry` で、RC は `ErrorExcerpt` を組み立てない。
  - `prepareAfterPush` は、ls-remote の失敗を `tag ... was not found on origin` にせず、ls-remote の失敗として止める。
  - 前半の `git fetch`、`git add`、`git status`、`tagState` の ls-remote、`git rev-parse --show-toplevel` の stderr も `error` に載せる。合意した範囲は ls-remote の stderr だったが、「どこで止まっても出す」ために前半の git の失敗も含める。
- **K7: 進み方の表示は、段の始め、通ったときの根拠、待機の 3 種類にする。**
  - 段の始めは `stage <N>/11: <確かめる内容>`、入口は `entry: ...`。段の名前と総数は SR の定数 (`STAGES`、`STAGE_COUNT`) が持つ。
  - 通ったときは `  ok: <根拠の値>`。根拠の値は、リポジトリの値か検証済みの値 (正規表現を通った版、整数の id、固定の一覧のパッケージ名) だけを使う。
  - 待機は、sleep の直前に毎回 `  waiting for <label>: <経過秒>s / <上限>` を出す。経過は、これから入る sleep が終わる時点の値である。`pollUntil` は `label` と表示の関数を受ける。
  - `gh run watch` は自分で進み方を出すので、前に出す 1 行に run の URL を足すだけにする。
  - 行の整形は純粋関数で、出すのは R の `log` と AP の `deps.output.emit` (出口は既存の 1 つのまま)。

### 不変条件

- **I1**: 画面への出力は `createOutput` の 1 つの出口を通り、無害化される。
- **I2**: 外部の文字列 (stderr、job の log、npm / gh の出力) は `error.lines` にだけ入る。`headline`、`causes`、`remedies`、`notes` に入れてよいのは、リポジトリの定数、固定の一覧のパッケージ名、正規表現を通った版と tag、整数の検査を通った id だけである。
- **I3**: `error.lines` の各行は改行を含まず、表示では必ず ` |` で始まる。外部の行が `try:` や `$ ` の行を装えない。
- **I4**: `error.lines` は K3 の順序を通った値だけである。
- **I5**: 停止を表す `Outcome` (`entry-stopped`、`front-stopped`、`after-push-stopped`、`post-check-failed`) は、`error:` / `possible causes:` / `try:` の 3 つの見出しを必ず出す。網羅テストで固定する。
- **I6**: route、`next`、`section`、`mayBeF3` と判定の種類は、この変更の前と同じ入力で同じ値を返す。理由 (`reason`) の文字列は K4 のとおり変わる。

### 構成

新しい純粋関数は `scripts/lib/release-stop-report.ts` (SR) に置く。SR が import できるのは `release-types.ts` と `release-check.ts` だけで、`release.ts` と `release-after-push.ts` が SR を import する。`release-after-push-check.ts` は SR を import せず、SR も借りない。制御文字の除去の規則は `release-check.ts` に移し、`release-after-push-check.ts` が re-export する。構造テストの import の向きの表、出口と spawn の検査の対象に SR を加えた。

### plan に無かった判断

実装の報告から集めた。いずれも決定の内容は変えていない。

- 純粋関数と型 (plan-1):
  - `ClassifiedStop.site` を必須にし、テストの literal を更新した。
  - token のマスクは、隣の英数字まで伏せすぎる。伏せすぎるほうを選んだ。
  - 除外する行 (`npm verbose stack`、`env:` の段、`::add-mask::`) は、手元の stderr にも適用する。
  - `excerptJobLog` は exit を `null` で返し、整形は log を読めたときの job-log の exit を出さない。
  - `STAGES` は 1〜11 を key にした `Record` にした。
  - trust の期限切れの診断は、選んだ行 (`matched`) に頼る。
  - 「5 つの規則すべてに当たる入力」のテストは作れない (git と npm の規則は排他)。順序は 3 つの規則で検査した。
  - `remedies` を返す関数は `NonEmpty` を返す。
  - 既定の候補は、job ごと、post-check の check ごとに分けた。入口の既定の文は releasing.md の表から書いた。
  - U+2028 などは `\u{}` の escape で書く。
  - trust-expired の対処の文は英語に直した (メインループの修正)。
- 結線 (plan-2):
  - 整形は、log を読めた job-log の exit だけを省く。
  - 段 1 の既定の対処に「5 分間 2FA を省略する」を選ぶことを書いた (廃止した `describeTrustStop` から移した)。
  - trust の形の不一致の案内は、定数の理由に残した。
  - `ReleaseLookup` の error に `status` と `stderr` を足した。
  - `ClassifiedStop.runUrl` を足した (note の行)。
  - `git add --` と `git checkout --` の対処のコマンドは、パスを省く。
  - `stop()` は 5 つの引数を取る。
  - 入口の行 9 は、子の stderr を使う。
  - `npm view` の失敗が複数あるときは、失敗したパッケージごとに `floor(12/件数)` 行を割り当てる。
  - pipe モードの stdout は、close の待ちが切れたら destroy する。
  - 段 11 の `npm view` の失敗に stderr を載せる。
  - staged-mismatch と post-check の理由は、名前があれば ` for <name>` を足す。
  - stderr の保持は、先頭でなく末尾の 1 MiB にした。
  - `exit` の後 5 秒で、`close` を待たずに終える。
  - `CommandResult.exceeded` の印を足した。
  - 空の stderr には、補足の行を付けない。
- 進み方 (plan-3):
  - 段 8 の始めは、検証した tag を表示する。
  - attempt は `attemptKey` から読む。
  - 段 9 の始めは `--check-only` でも出し、そのときは `ok:` を出さない。段 9 の `m` は `plan.states.length`。
  - 段 10 の始めは、段 10 が走るときだけ出す。y/N で `N` を答えたときは `ok:` を出さない。`p` は `names.length - approved`。
  - `planStage` の label は、最初に待つパッケージの名前を使う。
  - 段 7 の `pushed <tag>` は `ok: pushed <tag> at <12 桁の commit>` になった。
  - `entry:` の行は、続行するときだけ出す (入口の停止では、停止の見出しを先に出すため)。
  - 値が不明なときは `unknown` と出す。

## ADR-031 のうち、この ADR が変えるもの

- **ADR-031 K15 の停止の表示**: 後半の `[<route>] <理由>` / `next:` / `see docs/releasing.md:` の 3 行を、K1 の形に変える。入口と前半の停止も同じ形で出す。route、理由の断片の表、`next` の文、`section` は変えない (I6)。
- **ADR-031「脅威と統制」の `inherit` の例外**: 対話の `npm trust list` と前半の `spawnChecked` で実行するコマンドは、受けたそばから無害化して流す (K5)。例外は `gh run watch` だけになる。
- ADR-031 の本文は変えない。冒頭にこの ADR への注記を 1 行足した。

## 脅威と統制

| 脅威                                                                             | 統制                                                                                                                                                                | 残るもの                                                                                                                   |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 外部の出力 (stderr、job の log) の制御文字、エスケープ列による端末の操作         | K3 の手順 3、4 で除く。表示の出口の無害化 (I1) は残す (多重防御)                                                                                                    | `inherit` に残した `gh run watch` の出力                                                                                   |
| 外部の出力に含まれる token、URL の認証情報の表示                                 | K3 の手順 5 のマスクを、行を切り詰める前に掛ける (I4)                                                                                                               | 行をまたぐ秘密 (PEM)。`raw output` の保存物はマスクしていない                                                              |
| 外部の行が `try:` や `$ ` の行を装う、規則を起動して revoke を含む対処を出させる | 外部の文字列は `error.lines` にだけ入れ、表示では各行に縦棒の接頭辞を付ける (I2、I3)。規則は `matched` の行頭の形だけを見る (K2)。revoke は表示するだけで実行しない | 行頭の形に合う偽の行が、`trust-expired` を候補に出させること。対処は「確かめたパッケージだけ」で始まり、利用者の確認を挟む |
| 巨大な出力による処理の遅れ                                                       | 1 行を 4096 コードポイントで切り、正規表現は入力の長さに対して線形にする。pipe の上限は 64 MiB。stderr の保持は 1 MiB                                               | なし                                                                                                                       |

## 受容するリスク

- **R1: npm や gh のエラー文が変わると、規則が当たらなくなる。** 当たらなくても、既定の候補と切り出した行は出る。規則のテストは、実物の log の行を fixture にする。
- **R2: job の log が大きいか、取れない。** 1 行を先に切り、表示は 12 行 × 300 コードポイントに抑える。取れなくても route は変えない (K4)。
- **R3: 対話の `npm trust list` を `inherit-keep-stderr` にすると、認証の画面の出し方が変わる。** 確認では通ったが、条件は近似である (確かめた事実)。壊れたら、その子の `stdio` を `inherit` に戻す (K5)。
- **R4: 前半の子の stderr が TTY でなくなり、表示が変わる。** `pnpm verify` の見え方は確認で読めた。崩れた子が出たら、その子だけ `inherit` に戻す。
- **R5: 前半の停止の表示を `runRelease` から `reportOutcome` に移すと、停止の文面を `logs` で見るテストが落ちる。** `ReleaseOutcome` の値と `reportOutcome` の出力で確かめる形にした。表示の順序は変わらない (y/N や trust の案内の後に出る)。
- **R6: 後半の kind の知識が 2 つの表に分かれる。** 型と網羅テストで抑える (採用案と理由)。
- **R7: `run` にタイムアウトが無いので、gh が応答しないと log の取得の試行が進まない。** Ctrl-C の 2 回目で終われる。
- **R8: `web-auth-timeout` と `npm-login` の fixture は、実物ではない。** 0.2.0 の対話の trust list は `inherit` で、stderr が保存されていない。npm の出力の形 (`npm error code E401` など) を写した文を使い、fixture にそう書いた。実物を得たら差し替える。
- **R9: 子の stderr の流れ (チャンクごと) と、進み方の行の並びが、画面で読みにくくなる。** 進み方の行は段の始めと終わりに出し、子の実行の途中には出さない。手元の端末で見た結果は、確かめた事実に書く。

## 提供しない体験

### trust の期限切れの事前検出

`npm trust list --json` の出力には期限切れの印がない (ADR-029「0.2.0 で見つかったこと」)。`checkTrustList` の入力に期限の情報がないので、判定できない。段 1 や段 10 で期限切れを見つけて止まることは提供しない。F2 で止まったときの原因の候補 (`trust-expired`) で知らせる。npm が期限を出力に含めたら検討する。

### 証拠の保存物の無害化とマスク

`.tmp/release/` に保存する生の出力 (`createEvidenceStore`、`saveRaw`) は、今回の変更では新しい保存物を作らず、無害化もマスクもしない。表示 (`error` の欄) だけを K3 で守る。そのため `raw output` の行に「unredacted, do not cat to a terminal」と出す。保存物の無害化、マスク、権限 0600 は提供しない。残件として `docs/plans/backlog.md` で追う。

### gh の認証失敗の規則

gh の認証失敗の規則は、実物の出力を確かめていないので入れない。

## Followup

以後は docs/plans/backlog.md で追う。

## 参考

- [ADR-029](adr-029-staged-release-flow.md): tag 駆動の staged publishing
- [ADR-031](adr-031-release-command-to-the-end.md): `pnpm run release` で公開の最後まで進める。この ADR が表示を変える
- [releasing.md](../releasing.md)
