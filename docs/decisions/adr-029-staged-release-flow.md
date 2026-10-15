---
status: Accepted
plan: plan-staged-release-flow.md
---

# ADR-029: 公開 6 パッケージの tag 駆動 staged publishing

実装計画: [Plan](../plans/plan-staged-release-flow.md)
手順: [releasing.md](../releasing.md)

## コンテキスト

公開 6 パッケージ (`skam`、`skam-canvas-renderer`、`skam-html-renderer`、`skam-xml-parser`、`skam-xml-stringify`、`skam-web-component`) のリリースを、shiori と同じ流儀にそろえる。shiori は `v*` tag の push から、検査済みの tarball を特権のない job で作り、OIDC で stage し、メンテナが 2FA で承認する。

### 変更前の現状 (2026-10-15 に確かめた事実)

- 6 パッケージは changesets の `fixed` で版がそろっていて、どれも 0.1.1 (npm には 0.1.0 だけ)。private の 4 パッケージは `ignore`。
- 版上げは `workflow_dispatch` の release.yml (changesets/action が version PR を作る)、公開は別の `workflow_dispatch` の publish.yml (`changeset publish`、`NPM_TOKEN`)。公開する job の中で install と build をするので、検査を通った tarball との対応がない。
- リポジトリ単位の `gh secret list` は空で、environment は `github-pages` だけ。rulesets は空。`NPM_TOKEN` は存在しない可能性が高い。npm 側の trust は、調査の時点では確かめられなかった (`npm trust list` が未ログインで 401)。移行の作業で、旧 `publish.yml` 用の trust が 6 つとも残っていたと分かった (「移行で見つかったこと」)。0.1.0 の公開時刻は、残っている Publish run より前で、workflow の外から公開された可能性が高い (run のログは取得できず、推測)。
- 0.1.0 に provenance はない (`dist.attestations` が空)。git tag は 1 つもない。
- actions は tag 指定で、workflow の静的検査はない (zizmor 1.30.1 の手元の計測で 55 件)。
- 手順書も決定の記録もない。ADR-028 に「公開は人間が workflow を起動して行う。本 ADR の範囲外」とある。

### 根拠にした計測 (2026-10-15、手元)

- **zizmor 1.30.1 のベースライン**: 変更前の `.github/workflows` は `zizmor --offline` で 55 findings (12 suppressed)。主な内訳は `unpinned-uses` 38 件、`excessive-permissions` 2 件 (deploy-playground のトップレベル `pages: write` / `id-token: write`)、`artipacked` 3 件 (checkout)。plan-1 の後は 0 件。release.yml を足した後は `cache-poisoning` (setup-node の自動 cache) と `adhoc-packages` (`npm install -g npm@12.1.0`) が出て、前者は workflow で直し、後者だけを ignore した (K10)。offline と online (`GH_TOKEN` 付き) で結果は同じ。表示される suppressed は regular persona が隠す pedantic 以下の指摘で、ignore ではない。
- **`pnpm pack` の LICENSE**: パッケージ直下に LICENSE がなくても、root の `LICENSE` が tarball の `package/LICENSE` に入り、root とバイト一致する (K5)。
- **`pnpm pack` の内部依存**: `workspace:*` は、pack 時の `version` と**完全一致**の範囲 (`0.2.0` など。`^` も `~` も付かない) に書き換わる。書き換えには `pnpm install` 済みであることが要る (K3 の tarball の契約。`scripts/lib/test-workspace.ts` が fixture でオフライン install する理由)。
- **`npm view` の未公開の名前**: 存在しない名前に `npm view <name> versions dist-tags --json` を実行すると、`{"error":{"code":"E404",...}}` の JSON が **stdout** に出る (stderr を捨てても残る)。`parseNpmView` は stdout の JSON の `error.code` だけで「未公開」を判定し、JSON でない出力や E404 以外のコードは fail-closed にする (K2 e)。

### shiori の流儀

shiori の ADR-036 (staged npm publishing) は、tag push を起点に自動で stage し、旧来の publish workflow を消して経路を 1 本にする。検証済みの tarball を特権のない job で作り、OIDC token を持つ job では checkout も install も build もしない。tarball を指定した publish は lifecycle script を走らせない (ADR-036 が npm のソースで確認したと記載。この ADR では独自に確認していない)。npm 側は release workflow と environment に `--allow-stage-publish` だけを許可し、GitHub 側は environment の deployment を tag `v*` に限って tag の操作を ruleset で admin に限る。ただし shiori は単一パッケージで、changesets を使わない。

## 検討した選択肢

### 差分最小案

changesets/action の version PR は残し、publish.yml だけを「tarball を pack → `npm stage publish`」に書き換えて `NPM_TOKEN` を OIDC に替える。起点は `workflow_dispatch` のまま。actions の SHA 固定と zizmor は別の作業にする。

**却下の理由**: どの commit を公開したかが tag に残らない。version PR と publish の 2 回の手動起動が残る。publish する job が checkout + install + build をするなら、OIDC token と依存の lifecycle script が同じ job に同居する (ADR-036 が却下した形)。「shiori に合わせる」というオーダーの本義 (tag 駆動、tarball だけを扱う stage job、zizmor) を満たさない。

### 白紙設計案

ゼロから設計するなら、版の正本を tag に置き、changesets をやめる。6 パッケージの version を bumpp でそろえて上げ、CHANGELOG は root に 1 つ書く。

起源: shiori は単一パッケージで、CHANGELOG を人間が書き、bumpp が version を上げるだけで足りた。道具を 1 種類にそろえれば、両プロジェクトのリリース手順が同じになる。

**採らなかった理由 (kanbun 固有)**: (1) 未消費の changeset が 3 つ (plan-1 / plan-3 / plan-4 の changeset) あり、これが 0.2.0 の CHANGELOG の本文そのものである。changesets を捨てると、手で移す必要がある。(2) `check-version-bump.mjs` (0.2.0 の CHANGELOG に移行表の全 ID と URL が入ることの検査、ADR-028) は changesets を前提にしていて、作り直しになる。(3) ADR-028 は「changeset の本文が 6 つの CHANGELOG に同じ内容で入る」ことを前提に、移行表の配置を決めている。

白紙設計でも残るもの: 6 パッケージを 1 つの束として stage / approve するので、束の不変条件 (集合、順序、途中失敗) は、shiori にない新しい契約になる。採用案でも同じく必要なので、決定 K3 / K14 / K15 で扱う。

### 採用案

ハイブリッド。**起点・公開経路・CI の形は白紙案 (= shiori) に合わせ、版と CHANGELOG の生成だけ changesets を残す。** bumpp が担う役割 (検査 → 版上げ → 検査 → commit → tag → push を 1 コマンドで) は、`changeset version` を呼ぶ自前の `scripts/release.ts` が担う。

理由: 0.2.0 の CHANGELOG の本文は未消費の changeset にあり、`check-version-bump.mjs` がそれを前提に 6 つの CHANGELOG を検査する。changesets を残せば、この検査と ADR-028 の移行表の配置がそのまま有効である。起点を tag にする理由は ADR-036 と同じ (公開物 = 検査を通った tarball、OIDC token を持つ job で第三者コードを動かさない)。このリポジトリには戻る先の旧経路がなく (`NPM_TOKEN` も workflow もない。旧 trust は残っていたが、動く workflow がないので戻る先にならない)、併存期間を設ける理由もない。

利用者の決定 (2026-10-15): changesets を残す、リハーサルは含めない、GitHub Release は添付なしで作る、既存の CI は SHA 固定 + 権限 + pnpm の setup まで寄せる。

## 決定

手順の詳細は [releasing.md](../releasing.md) に任せ、ここには判断と理由だけを書く。

### K1: 版と CHANGELOG は changesets、起点は `pnpm run release`

changesets/action の version PR と `changeset publish` は撤去した。`pnpm run release` は `pnpm run verify` の後に `scripts/release.ts` を実行する。release.ts の流れは、前提の確認 → 版上げ (`changeset version` + prettier) → 公開前提の検査 → 新しい版の tarball での利用者テスト → 確認 (y/N) → commit と annotated tag → `git push --atomic origin master vX.Y.Z`。各段で止まったときに残る状態は決まっていて、段 1 は何も変えず、段 2〜5 は作業ツリーに版上げの変更が残り (戻すコマンドを表示)、段 7 は push が拒否されたら origin は変わらない (local を戻すコマンドを表示し、実行はしない)。前提の判定は純粋関数 (`scripts/lib/release-check.ts`) に置き、git 操作を含む流れは一時 git repo と bare remote でテストする。force-push と無人の merge はしない。

`--tag-only` は、失敗した run のあとに、同じ版の tag だけを修正後の commit に打つための経路である (K14 の F1)。

### K2: 1 つの `v*` tag で 6 パッケージを出す

`check-release check` の契約: (a) `.changeset/config.json` の `fixed` がちょうど 1 グループで、その名前の集合が非 private の workspace パッケージの集合と一致する。(b) 6 つの version が等しい。(c) `--tag` は `^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$` に一致し、`v${version}` と等しい。(d) 6 つの CHANGELOG の最初の `## ` 見出しが `## ${version}` と完全一致し、本文が空でない (prerelease でも免除しない)。(e) `--registry` では、6 つとも npm に未公開で、stable は現在の `latest` より semver で大きい。E404 だけを「未公開」とみなし、ネットワークや 5xx、JSON の解析失敗は fail-closed にする。

dist-tag は version に `-` を含めば `next`、そうでなければ `latest`。この判定は release-check だけが行い、manifest に書く。公開パッケージの一覧の正本は `.changeset/config.json` の `fixed[0]`。

### K3: release.yml は 3 job (validate / npm-stage / github-release) に、束の契約を足す

トップレベルは `permissions: {}`、`concurrency: { group: release, cancel-in-progress: false }`。tag は env 経由で渡し、run の中で `${{ }}` を展開しない。

- **validate** (`contents: read`): `pnpm run verify` → `check-release check --tag --registry` → `check-release pack` (6 つを pack し、pack 直後に sha512 を採って manifest を書く) → tarball のコピーでの利用者テスト → `verify-manifest` (再計算して一致を確かめる) → upload-artifact (`npm-tarball`、保持 7 日) → manifest を Step Summary と log に出す。
- **npm-stage** (environment `npm`、`contents: read` + `id-token: write`): download-artifact → `npm@12.1.0` を入れて版を確かめる → manifest と tgz の集合・sha512・tag を照合 → manifest の順に `npm stage publish`、1 つ失敗すれば止まる。checkout / install / build はしない。
- **github-release** (`contents: write`): checkout せず `gh release create --verify-tag --generate-notes`、tag に `-` を含めば `--prerelease`。npm-stage と並列 (A2)。

**manifest の契約 (利用者から見える形)**: `{ schemaVersion: 1, tag, version, distTag, packages: [{ name, file, integrity }] }`。`packages` は内部依存の DAG のトポロジカル順で、stage と approve の順序になる。現在の依存では `skam` → `skam-canvas-renderer` → `skam-html-renderer` → `skam-xml-parser` → `skam-xml-stringify` → `skam-web-component` (名前で層を分けた順)。

**tarball の契約**: tarball の package.json の `dependencies` / `peerDependencies` / `optionalDependencies` に `workspace:` が残っていれば失敗する。これらのフィールドにある `@kanbun-skam/*` の範囲は、`version` との**完全一致**でなければ失敗する。完全一致は、コアと各レンダラーの版がずれた組み合わせを利用者が入れないための契約で、pnpm が `workspace:*` を完全一致の版に書き換えることに依る (2026-10-15 に pack して確認)。`scripts` に `preinstall` / `install` / `postinstall` / `prepare` があれば失敗する。

### K4: 公開物と検査物を同一にする

利用者テストは、validate で pack した tarball のコピーに対して行う (`consumer/run.mjs --tarballs`)。pack 直後の sha512 を manifest に採り、利用者テストの後に再計算して一致を確かめるので、テストの `npm install` で動く第三者コードが tarball を書き換えれば validate が失敗する。ci.yml の consumer job は、従来どおり自前で pack する (公開物ではなく master の commit を検査する)。

### K5: LICENSE は検査で保証する (コピーしない)

`pnpm pack` は、パッケージ直下に LICENSE がなくても、root の `LICENSE` を tarball に入れる (2026-10-15 に確認。root の LICENSE とバイト一致)。consumer 検査に「各 tarball の `package/LICENSE` が root の LICENSE とバイト一致する」を足し、pnpm の挙動が変わったときに検出する。

### K6: 検査の列を `pnpm run verify` に 1 本化する。VRT は入れない

`verify` は build / typecheck / typecheck:scripts / lint / format:check / test:run / test:scripts / clean (knip) / test:consumer。release script と validate が呼ぶ。ci.yml は並列のため job を分け、job の一覧が verify の段を覆うことを workflow 構造のテストで確かめる。VRT は Playwright のブラウザ取得が要るので、release 経路に入れない (A3)。

### K7: 移行順序

人間の作業 (environment と tag ruleset の作成、6 パッケージへの `npm trust github`、`NPM_TOKEN` の不在の確認、Publishing access の変更) を、release.yml を含む PR の merge より前に済ませ、読み戻しですべて確かめる。手順と期待値は releasing.md にある。shiori の「旧 trust を残してリハーサルし、最後に revoke する」順序は、リハーサルをしないので採らず、旧 trust は merge の前に revoke する。1 つのパッケージに trust は複数並びうる (当初は `npm help trust` から 1 件だけと読んだが、実際には旧と新の 2 件が並んだ) ので、読み戻しでは `release.yml` の 1 件だけが残っていることを確かめる。

### K8: リハーサルはしない。受入基準と中止条件を決めておく

最初の run が 0.2.0 の本番になる (利用者の決定)。未検証の部分を減らすため、tag を打つ前に、手元で verify と、新しい版での consumer 検査を通す。approve の前に確かめる項目と、approve の後に確かめる項目は、「最初のリリースで確かめること」にある。approve の前に 1 つでも外れたら approve せず、K14 の手順で戻る。

### K9: 既存 workflow を shiori に寄せる

ci.yml と deploy-playground.yml は、トップレベル `permissions: {}`、job ごとの最小権限、全 checkout に `persist-credentials: false`、actions は SHA + `# vX.Y.Z` にそろえた。**spec の想定と実装で違った点**: 当初は `pnpm/setup` v3 を使う想定だったが、`pnpm/setup` v3 は pnpm v11 以上を要求し、このリポジトリは `pnpm@10.27.0` なので使えなかった。spec の代替の分岐に従い、`pnpm/action-setup` v6.1.0 + `actions/setup-node` v7.0.0 (`node-version: lts/*`) を SHA で固定した (コミット `9d79e3d`、`fd8a8c1`)。pnpm の版は上げていない。pages 系の actions は configure-pages v6.0.0、upload-pages-artifact v5.0.0、deploy-pages v5.0.1。playground の dist にはドットファイルがなく、upload-pages-artifact v4 以降の隠しファイルの除外で落ちるものはない。configure-pages は必要な権限を記載していないので、build job は `contents: read` と `pages: read` にした。

### K10: zizmor と workflow 構造のテスト

zizmor 1.30.1 を、`.github/workflows/**` の変更で online audits 付きで実行する。手元の検査 (offline と online) の finding は、ベースライン 55 件から 0 件になった。`.github/zizmor.yml` の ignore は、workflow 側で直せない finding だけを、ルール id とファイル名の組で、理由のコメント付きで書く。現在の ignore は `adhoc-packages` × `release.yml` の 1 つで、理由は「staged publishing は npm 11.15.0 以上が要り、lts/\* 同梱の npm では保証されない。版を固定し、直後に `npm --version` で assert している」である。`cache-poisoning` は直せたので ignore せず、release.yml の 2 つの `actions/setup-node` に `package-manager-cache: false` を明示した。zizmor が見ない不変条件は `scripts/workflow-structure.test.ts` で検査する (検査の範囲は「spec からの訂正」)。zizmor は required check ではない (A5)。

### K11: 撤去したもの

`publish.yml`、旧 `release.yml`、`.npmrc` (`provenance=true` は `changeset publish` のためのもの)、root の `changeset:publish` script。手元から直接公開する経路を、リポジトリの設定として残さない。`check-version-bump.mjs` は、0.2.0 の公開前の検査として残し、公開後に消す。

### K12: prerelease は tag 側だけ対応する

release.yml は version に `-` を含めば `next` と `--prerelease` にする。release.ts は prerelease を作る手段を持たず、releasing.md にも手順を書かない。changesets の pre mode で `X.Y.Z-rc.N` を作れるかは、未検証である (後述の Followup)。

### K13: 記録

決定はこの ADR、手順は releasing.md、このリポジトリの ADR-Plan の 1:1 規約に従う plan は [plan-staged-release-flow.md](../plans/plan-staged-release-flow.md)。ADR-028 のうち 3 点を、この ADR が置き換える (本文は変えない)。「影響」の節にある。

### K14: 途中で失敗したときの戻り方

版番号を守る (0.2.0 を欠番にしない) ことを優先し、npm に 1 つも公開されていない間は、同じ版で出し直す。tag の削除は ruleset の admin bypass で行う。共通の最初の手順は、GitHub Release の確認と削除 (github-release は validate だけに依存して並列に走るので、validate が通った run では Release が先にできている)。場合分けは、F1 (validate の失敗: 修正して `--tag-only` で打ち直す)、F2 (stage の途中の失敗、または approve 前に問題が見つかった: reject して F1)、F3 (一部が approve 済み、または再 stage できない: 未承認を reject、公開済みを deprecate、patch の版で出し直す)、F4 (workflow の定義の修正: Release を消して tag を打ち直す)。失敗した job の re-run は、原因が一時的で stage が 0 件のときだけ使う。コマンドは releasing.md にある。

### K15: 部分承認の窓

approve は stage id ごと。manifest の順 (依存の根から) に、続けて 6 回 approve する。approve の間は `latest` が 0.1.0 と新しい版で混在する。0.x の caret は minor をまたがないので、既存の利用者の解決は変わらない。窓の間に `skam@latest` と `skam-html-renderer@latest` を別々に新規インストールした利用者は、破壊的変更をまたぐ組み合わせを得うる (内部依存は完全一致なので、各パッケージが自分の依存として入れる版は正しい)。窓を短くするため、approve の前の確認を済ませてから 6 回を続けて行う。

### K16: テストの置き場所

`scripts/lib/release-check.test.ts` (純粋関数)、`scripts/release.test.ts` (一時 git repo + bare remote)、`scripts/workflow-structure.test.ts`、リポジトリの現物に対する `check-release` のテスト。実行は root の `test:scripts` (`node --test`)。**spec の訂正**: リポジトリの現物に対する検査は、`check` ではなく `node scripts/check-release.ts list` を使う。`check` は版上げの前に失敗するのが正しい挙動のため (CHANGELOG の先頭が現在の版でない)。consumer の `--tarballs` と LICENSE の検査は `test:consumer` の実行で確かめる。

## spec からの訂正

実装の途中で、spec (K1〜K16 と plan の想定) から外れた点。決定の内容を変えたものはなく、spec が置いた前提が現物と合わなかったもの、または spec より細かく決めたものである。

- **setup は `pnpm/setup` ではなく `pnpm/action-setup` + `actions/setup-node`** (K9): `pnpm/setup` v3 は pnpm v11 以上を要求し、このリポジトリは `pnpm@10.27.0`。spec の代替の分岐に従った。release.yml の validate も同じ 2 つの `uses` (SHA まで同じ) で、`cache` を付けない。構造テストの (3f) が、この 2 つの `uses` を ci.yml の全 job と組で比べる。
- **pages 系 actions の版** (K9): configure-pages v6.0.0、upload-pages-artifact v5.0.0、deploy-pages v5.0.1。spec は版を決めておらず、plan-1 で現物を確かめて SHA 固定した。
- **現物の検査は `list`** (K16): `check-release` に、一覧の正本の一致 (K2 a) だけを行う `list` を足した。現物は 0.1.1 で CHANGELOG の先頭が `## 0.1.0` なので、版上げ前の `check` は失敗するのが正しい。
- **manifest の順は、層ごとのトポロジカル順**: 1 つずつ取る順ではなく、依存が済んだパッケージを 1 層として取り、層の中は名前順にした。層の境界が approve の区切りとして読めるようにするため (K3 の「名前で層を分けた順」)。
- **zizmor の ignore と workflow の修正**: ignore は `adhoc-packages` × `release.yml` の 1 つだけ。`cache-poisoning` は ignore せず workflow を直した (K10)。そのため (3f) は、validate の `with` が「ci.yml の `with` から `cache` を除き、`package-manager-cache: false` を足したもの」に等しいことを求める。spec の「`cache` の有無だけが違う」より 1 項目多い。
- **ci.yml への `typecheck:scripts` / `test:scripts` の追加は plan-4 に移した**: spec は plan-2 に置いていたが、`.github/workflows/` の変更を plan-4 にまとめるため。PR は 1 つなので、plan-2 から plan-4 の間に、CI が `test:scripts` を回さない commit があるだけである。
- **構造テストは K10 の 4 検査より広い**: K10 が挙げた 4 検査 (run への直接展開、トップレベルの権限、`id-token: write` と `environment: npm` の配置、npm-stage の照合の実行) に加えて、K3 / K12 の契約を検査する。具体的には、起動条件 (3a)、権限の配置 (3b の contents: write と validate の権限)、`needs` と `concurrency` (3c)、npm-stage の第三者コードの不在 (3d)、validate の工程の順 (3e)、setup の同一性 (3f)、`--verify-tag` と `--generate-notes` (3g)、stage の順序と失敗での停止と dist-tag (4b)、`--prerelease` の判定 (4c)、ci.yml が `verify` の各コマンドを覆うこと (5)、validate が `pnpm run verify` を呼ぶこと (6)。さらに、Step Summary の書式 (releasing.md が参照する) と、release.yml の `uses` が SHA 固定であることも検査する。レビューで、これらが「テストされていない契約」として指摘されたため。
- **manifest の読み手は 3 つ**: (1) validate の `verify-manifest` (`scripts/lib/release-check.ts` の `verifyManifest`。一覧の正本と照合する)、(2) npm-stage の `verify-artifact` (workflow に埋めた node。repo を持たないので同じ規則を再実装する)、(3) consumer の `loadTarballSet` (`packages/integration-tests/consumer/tarballs.mjs`)。(1) と (2) の規則が割れないよう、(4a) は `verifyManifest` と同じ拒否の集合 (schemaVersion、tag、distTag、file の形、integrity の形、packages が空、name と file の重複、tgz の過不足、1 バイトの改変) を `verify-artifact` に流す。
- **npm-stage は names を照合しない**: npm-stage は repo を持たないので、manifest の `name` が公開 6 パッケージであることは照合できない。その信頼の根は validate の `verify-manifest` で、upload された artifact を書き換えられれば、この信頼は崩れる (脅威と統制の「artifact の改ざん」の行、A1)。npm 側の trust がパッケージごとなので、6 つ以外の名前は npm が拒否する。
- **knip の ignore は要らなかった**: plan は `yaml` を knip の `ignoreDependencies` に入れる想定だったが、knip はテストからの import を検出し、ignore は冗長だと報告したので入れていない。

## 脅威と統制

| 脅威                                                                          | 統制                                                                                                                                                             | 残るもの                                                   |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| validate 内の依存 (install / consumer の npm install) が tarball を書き換える | pack 直後の sha512 を manifest に採り、consumer はコピーを使い、upload 前に再計算 (K3 / K4)。approve 前に `npm stage view` と照合 (K8)                           | pack より前に build 成果物を書き換えられること (A1)        |
| OIDC token のある job で第三者コードが動く                                    | npm-stage は checkout / install / build をせず、tarball 指定の publish は lifecycle script を走らせない (ADR-036 の記載)。構造テスト (K10)                       | npm 本体の取得 (`npm@12.1.0`、integrity は pin しない。A4) |
| 書き込み権限者が任意の commit に tag を打つ                                   | tag ruleset (admin のみ)、environment `npm` は tag `v*` のみ、npm の 2FA approve                                                                                 | admin の資格が盗まれた場合 (approve 前の確認で止める)      |
| 細工した tag 名による注入                                                     | tag の正規表現検査 (K2 c)、run へは env 経由 (K3)、構造テスト                                                                                                    | なし                                                       |
| 6 つの集合の取り違え (欠け、private の混入)                                   | 一覧の検査 (K2 a)、manifest と tgz の集合の一致を validate と npm-stage の両方で検査、trust はパッケージごと (未設定の名前は npm が拒否)                         | なし                                                       |
| upload から download の間の artifact の改ざん                                 | npm-stage の照合は取得時の欠落・破損を検出するだけで、tgz と manifest は同じ artifact にあるので、両方を書き換えられれば通る。真正性の最終確認は K8 の人間の照合 | Step Summary 自体は validate の job が書く                 |
| 古い版での `latest` の巻き戻し、同じ版の二重公開                              | registry の検査 (K2 e、release.ts と validate)、`concurrency`                                                                                                    | なし                                                       |
| action の供給網                                                               | SHA 固定 + zizmor (online audits)、Renovate の digest 更新は人間が merge                                                                                         | zizmor が required check でないこと (A5)                   |
| 残っている token による直接公開                                               | `NPM_TOKEN` の不在の確認、2FA 必須・token 禁止 (K7)                                                                                                              | 2FA を使う手元からの publish (メンテナ本人の操作)          |
| 残っている旧 trust による OIDC の直接公開                                     | 旧 `publish.yml` の trust の revoke と、`release.yml` の 1 件だけが残る読み戻し (releasing.md の手順 3a)、リリースのたびの `npm trust list` の再確認             | なし                                                       |

npm-stage は repo を持たないので、manifest の `name` が公開 6 パッケージであることは照合しない。その信頼の根は、validate の `verify-manifest` (一覧の正本と照合する) である。

## 影響

### ポジティブ

- 公開物が、検査を通った tarball と同一になる。どの commit を公開したかが tag に残る。
- OIDC token のある job で、第三者コードが動かない。`NPM_TOKEN` は使わない。
- 全 workflow の actions が SHA で固定され、zizmor と構造テストが特権の配置を検査する。
- 失敗時の戻り方が、場合分けして手順になっている。

### ネガティブ・受容するリスク

- **A1**: validate 内で、pack より前に build 成果物を依存が書き換える経路は検出しない (ADR-036 と同じ)。approve 前の確認で緩和する。
- **A2**: github-release は npm-stage と並列なので、stage の失敗中や approve 前でも、GitHub Release が先に出る。6 パッケージで approve の窓が長くなる分、shiori より起きやすい。Release の本文は自動生成のままにし、npm の状態とは独立した記録として扱う。最初の tag なので、v0.2.0 の自動ノートは全履歴を対象にする。
- **A3**: VRT は release 経路で走らない。release commit の差分は版のメタデータだけで描画に影響しないが、強制はしない。tag の commit が master の祖先であることも検査しない (書き込み権限者は release.yml ごと改変でき、tag ruleset が代わりに止める)。
- **A4**: `npm install -g npm@12.1.0` の integrity は pin しない (ADR-036 と同じ)。
- **A5**: zizmor と CI は required check ではない。master に branch protection がないため。release.ts が master に直接 push するのは、この前提に依る。protection を足すと release.ts の push が拒否される。
- **A6**: K14 の F3 で版を飛ばした場合、0.2.0 専用の `check-version-bump.mjs` は使えなくなる。approve 前の確認が止めるので、F3 に落ちる確率は低い。
- 0.2.0 の最初の run まで、workflow の結線 (artifact、manifest の照合、OIDC) は実行されない (R8)。構造テストと zizmor で形を、手元の verify と `check-release pack` / `verify-manifest` の実行で script を確かめ、残りは受入基準で approve の前に止める。

### ADR-028 のうち、この ADR が置き換える 3 点

- 「公開 (publish) は人間が workflow を起動して行う」(K9 の末尾): 公開は、`v*` tag の push から始まる release.yml で行う。起動と approve は人間が行う。
- 「`package.json` の version は、release workflow を実行するまで 0.1.1 のままである」(既知の制約): 版を上げるのは `pnpm run release` (内部で `changeset version`) で、この workflow はない。手で上げてはいけない点は変わらない。
- 「LICENSE ファイルが各パッケージにない。公開される tarball に含まれない」: **誤認だった。** `pnpm pack` は root の LICENSE を tarball に入れる (K5)。

### 作業の外に置いたもの (提供しない体験)

- prerelease を作るコマンド。changesets の pre mode で `X.Y.Z-rc.N` を作れる見込みはあるが、未検証なので手順に書いていない。tag 側 (`next` と `--prerelease`) は対応している。
- rc によるリハーサル。stage は approve まで公開されず、`npm stage reject` で取り消せる。最初の run を受入基準で確かめる。

## 最初のリリースで確かめること

0.2.0 の公開作業で、次を確かめる。手順は [releasing.md](../releasing.md) の「最初のリリース (0.2.0) で確かめること」。

### approve の前 (外れたら approve しない)

- 6 つとも stage されている。各 stage の integrity が manifest と一致する。
- `npm stage download` の中身が `package.json` / `README.md` / `LICENSE` / `CHANGELOG.md` / `dist/` に収まる。
- approve 前は `npm view <name> versions` に新しい版が出ない。
- リリースのたびに、tag を打つ前に `npm trust list` を 6 つ確かめる。
- `pnpm run release` の前に、`check-version-bump.mjs` が通っている (0.2.0 のみ)。

### 未確認の事項

- **R1: 同じ版の二重 stage、reject 後の再 stage の挙動。** `npm help stage` は、stage 済みの版が公開済みの版と同じ semver の一意性を共有すると書くが、reject した版を同じ版で stage し直せるかは書いていない。F2 は「再 stage できなければ F3」と分岐を持つ。
- **R3: staged + trusted publishing で provenance が付くか。** npm の docs に記載がない。このリポジトリは public なので、approve の後に `npm view @kanbun-skam/<name>@X.Y.Z dist.attestations` で確かめる。付かなくても公開の正否には影響しない。
- 手順書に書いた `npm stage list` / `view` / `download` の出力の書式。コマンドと引数は `npm help` (npm 12.2.0) で確かめたが、出力は実行していない (`npm trust list --json` の出力は移行で確かめた)。

### 移行で見つかったこと (2026-10-15)

- environment `npm` (tag `v*` のみ、required reviewer なし) と tag ruleset `release tags` (active) を作り、読み戻しで確かめた。repo / environment / dependabot の secret は 4 つとも空だった。
- 6 パッケージとも、新しい trust (`release.yml`、environment `npm`、`createStagedPackage` のみ) に加えて、**旧 `publish.yml` 用の trust (`createPackage` と `createStagedPackage`、environment なし) が残っていた。** 承認を経ずに直接公開できる経路で、`publish.yml` の workflow を消しても、書き込み権限者が同じ名前の workflow を置けば使える。Publishing access の設定 (2FA 必須・token 禁止) は OIDC を止めない。6 つとも `npm trust revoke` で消し、読み戻しで `release.yml` の 1 件だけになったことを確かめた。
- Publishing access は、移行の時点で 6 つともすでに "Require two-factor authentication and disallow bypass 2fa tokens (recommended)" になっていた。npm の docs の "Require two-factor authentication and disallow tokens" と同じ選択肢で、画面の文言が変わっている。
- `npm trust list` は読み取りでも 2FA を求める (自動の実行では `EOTP` で止まる)。読み戻しはメンテナが手元で行う。
- `pnpm/action-setup` と `actions/setup-node` の `lts/*` (Node 24 系) での CI の結果は、PR の CI で確かめる。

### 結果 (0.2.0 の公開の後に追記する)

| 項目                                   | 結果   |
| -------------------------------------- | ------ |
| R1: reject 後の再 stage                | 未実施 |
| R3: `dist.attestations`                | 未実施 |
| `npm stage list` / `view` の出力の書式 | 未実施 |
| `npm stage download` の保存先と書式    | 未実施 |
| approve の窓の長さ                     | 未実施 |
| 受入基準で外れた項目                   | 未実施 |

## 参考

- [ADR-028](adr-028-practical-readiness.md)
- shiori の ADR-036 (staged npm publishing): tag push を起点に自動で stage し、検証済みの tarball を特権のない job で作り、npm 側は `--allow-stage-publish` だけを許可する。他のリポジトリの文書なので、名前と要旨だけで参照する。
- [releasing.md](../releasing.md)
- [npm: staged publishing](https://docs.npmjs.com/staged-publishing)
- [npm: trusted publishing](https://docs.npmjs.com/trusted-publishers)
- [npm trust のコマンド](https://docs.npmjs.com/cli/v11/commands/npm-trust)
