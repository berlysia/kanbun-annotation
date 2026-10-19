# `pnpm run release` で公開の最後まで進める

## 概要

`pnpm run release` を 1 回実行するだけで、版上げから tag の push、Release workflow の待機、approve の前の確認、依存の順での 6 回の approve、approve の後の確認までを、2FA の対話を挟みながら進められるようにする。確認は自動で判定し、外れたら approve せずに、理由と次の手 (releasing.md の F1〜F4、再実行、手作業) を出して止まる。途中で止まっても、同じコマンドを再実行すれば、git / GitHub / npm の状態から続きから進む。あわせて、changesets の pre mode を検証し、`--pre <tag>` / `--exit-pre` で beta / rc を出せるようにする。この作業では tag を打たず、stage も publish もしない。0.2.0 の公開は、この作業の後に行う。

このファイルは、実装した内容の記録と、残った作業 (Followup) を持つ。

関連 ADR: [ADR-031](../decisions/adr-031-release-command-to-the-end.md)
手順: [releasing.md](../releasing.md)

## 前提知識

- 決定の内容と理由は ADR-031 にある。置き換える ADR-029 の決定 (K1、K8 の一部、K12) も ADR-031 に列挙してある。手順 (止まったとき、手作業の手順、prerelease、失敗したとき) は releasing.md にある。
- 判定は純粋関数に集め (`scripts/lib/release-check.ts`、`scripts/lib/release-after-push-check.ts`)、外部コマンドの実行は `deps` として注入する。前半は `scripts/release.ts` の `runRelease`、後半は `scripts/release-after-push.ts` の `runAfterPush`。表示は出力関数 1 つを通る。
- 後半の信頼の錨は、validate の job の log の manifest である。artifact は取れれば追加で照合する。
- 後半の結線 (OIDC での stage、`npm stage` の出力、E409) は、0.2.0 で初めて本物につながる。出力の形が想定と違えば、推測で読み替えずに止まる。

## 実装計画

5 本の plan を、plan-1 → plan-3 → plan-2 → plan-4 → plan-5 の順に、1 つのブランチ (`feat/release-to-the-end`) に積んだ。plan-2 が plan-3 の表示の無害化を使うので、spec の想定 (plan-1 → plan-2 → plan-3) から入れ替えた。

### plan-1: 共有の型と、前半の純粋関数

- `scripts/lib/release-types.ts` の切り出しと、前半の純粋関数 (フラグ、入口の判定、`changeset status` の解析、許可リスト、ignore 済みパッケージの復元対象、CHANGELOG の補完、CLI の版の解析、trust の判定): `c46fcb6`

### plan-3: 後半の純粋関数

- run の選択、job の結論の表、log からの manifest の抽出、stage list の解析、tar と gzip の検査、`planApprove`、approve 後の判定、`classifyStop`、表示の無害化、後半のコマンドの引数の組み立て、一時ディレクトリの削除の判定: `e2888a5`
  - 実物の `pnpm pack` の tar のヘッダは checksum を `NNNNNN \0` の形で書くので、両方の並びを受け付ける。
  - `scripts/tsconfig.json` の `include` に新しいファイルを足した (plan の Files にない)。

### plan-2: 前半の結線と、実際の changeset のテスト

- `package.json` の `release` を `node scripts/release.ts` に変更、main (TTY、npm / gh の版、registry の確認、入口の判定)、前半 (trust、pre mode、ignore 済みパッケージの復元、CHANGELOG の補完、許可リスト)、実際の `changeset` を一時 repo で動かすテスト: `1399ed6`
  - 後半はこの時点では、手作業の案内で止まる stub。
  - `npm view <name> versions --json` は配列を返し、既存の `parseNpmView` が拒否したので、`parseNpmViewVersions` を足した。

### plan-4: 後半の結線

- `runAfterPush` (段 8〜11)、偽 deps のテスト、main の後半の呼び出しと Outcome の表示、構造テスト (import の向き、出力の出口、spawn の場所、job 名と step 名、`gh --json` のフィールド): `59add57`
  - 公開パッケージの名前は、private でない workspace のパッケージと `orderByDependencies` から出す。
  - `readVersion` が依存の欄を読んでいなかったので、`orderByDependencies` が順序を決められなかった。依存の欄を読むようにした。
  - `checkOnly` (完了済みの再実行) でも、log の manifest を読む。

### plan-5: 手順書と決定の記録

- releasing.md の書き換え (毎回のリリース、止まったとき、手作業の手順、prerelease、最初のリリース)、ADR-031、ADR-029 の冒頭の注記、この plan、`plan-staged-release-flow.md` の Followup、releasing.md の構造テスト: このコミット

spec からの訂正の一覧は、ADR-031 の「spec からの訂正」にある。

## リスクと軽減策

リスクと受容したリスクは ADR-031 にある (R1〜R10)。この plan の完了時点で、特に残るもの:

| リスク                                                                         | 影響度 | 軽減策                                                                                  |
| ------------------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------- |
| 後半の結線は 0.2.0 まで本物で動かない                                          | 高     | 偽の gh / npm でテストする。0.2.0 の最初の実行では、y/N で `N` を答えて判定だけ確かめる |
| stable の stage で `tag` が省かれると、0.2.0 は段 9 で手作業に落ちる           | 中     | 形の不一致として止まる。releasing.md の手作業の手順を残した (R1)                        |
| 待機の定数 (`WAIT`) が実測に合わない                                           | 低     | 0.2.0 の実測で見直す                                                                    |
| changesets の更新で、`pre exit` の不具合の回避が不要になる、または挙動が変わる | 低     | 一時 repo のテスト (K18 の b) が落ちて知らせる                                          |

## 検証方法

各 plan の完了時に、`pnpm test:scripts` と `pnpm typecheck:scripts` を通した。plan-5 は、`pnpm exec prettier --check` で対象の文書、`pnpm adr:status` で ADR-031 の frontmatter と plan へのリンク、ADR と plan の双方向リンク、releasing.md の構造テスト (見出し、手作業の節のコマンド、0.2.0 と prerelease の節の内容) を確かめた。plan-5 の完了条件は `pnpm verify` が exit 0 であること。

本物の GitHub と npm につなぐ後半 (段 8〜11) は、0.2.0 まで実行していない。

## Followup

次の作業は、この plan の範囲外とする。片付いたら、この節から消す。

- 0.2.0 の実測で、判定 (K11 / K12 / K15) と待機の定数を見直す。
- release.yml の summary step で、tgz から sha512 を再計算して log に出す。
- stage の来歴 (`actor`、`createdAt`) の表示。形を 0.2.0 で確かめてから検討する。
- `dist.attestations` があれば検証する。
- `skam-web-component` の `attribute-validation.test.ts` の `renders vertically and reports writing-mode once` (107 行目、再描画の後の `expect(errors).toHaveLength(1)`) が、2026-10-15 に `pnpm test` で 1 回だけ落ちた (別のテストが並行して走っていて CPU が混んでいた)。直後の単独の実行は 6 回とも pass。この作業は `packages/` を変えていない。負荷をかけて再現させ、2 件目の `skam-error` の detail を見て、再描画で同じ属性の通知を出さないという契約に対して、実装のタイミングの問題か、テストの待ち方 (`vi.waitFor` で render の数だけを待っている) の問題かを切り分ける。
- `pnpm run release` の進み方を画面に出す。いまは、止まったときの理由と y/N の質問のほかは、子のコマンドの出力が流れるだけで、どの段で何を確かめ、どんな値で通ったのか、いま何を待っているのかが分からない。各段の始めに段の番号と確かめる内容を、通ったときに根拠の値を 1 行で出す (例: trust が 6 つとも `release.yml` / env `npm` / `createStagedPackage` の 1 件、`changeset status` の版、選んだ run の id と attempt、manifest の 6 つの integrity が stage と一致)。待っている間は、待っている対象と経過時間を出す。0.2.0 の公開の途中で利用者が求めた。
- 止まったときは、毎回 3 つを出す。(1) エラーの内容: 失敗したコマンドと、その stderr や job の log の該当行。(2) 推定される原因: 既知の原因の候補と、それぞれを確かめる方法。(3) 対処の例: 実行できるコマンドか、見る画面。いまの `next:` と `see docs/releasing.md` は手順の場所を示すだけで、エラーの内容も原因の候補も出さない。たとえば F2 は「npm-stage の job が失敗した」としか出さず、`package not found` の行は利用者が run の log を開くまで見えなかった。原因の候補は、0.2.0 で実際に起きたもの (trust の期限切れ、npm の未ログイン、`npm view` の配列の出力、ブラウザの認証の未完了による `/-/v1/done` の 404) から始める。0.2.0 の公開の途中で利用者が求めた。
- trust の確認は、設定の期限切れを見分けられない。npm の trusted publishing の設定は、作ってから 48 時間以内に 1 度使われないと期限切れになり、OIDC の交換が `404 package not found` を返す。npm はそのあと設定済みの token に戻るので、画面には E401 / ENEEDAUTH だけが出る。期限切れは npmjs.com の画面にしか出ず、`npm trust list --json` の出力には印がない。0.2.0 の 2 回の失敗 (run 39196389682、39198354458) の原因はこれで、2026-10-15 に作った設定が期限切れになっていた。releasing.md の trust の手順に、作ったら 48 時間以内に最初のリリースをすることと、F2 で `package not found` が出たら npmjs.com の表示を見ることを書く。
- 入口の `git ls-remote` が失敗したとき、`git ls-remote failed` だけを出して git の stderr を捨てている。stderr の末尾を表示に足す。0.2.0 で 1 回だけ起き、再実行で通ったので、原因は分かっていない。
- releasing.md の `npm trust github` のコマンドに `-y` を付ける。付けないと 1 つごとに `Do you want to proceed? (y/N)` を聞かれる。
- releasing.md の毎回の手順に、approve は 6 回とも 2FA を求め、`npm trust list` のような「5 分間省略」の選択肢は出ないことを書く。いまは段 10 の表の 1 セルにしか書いていない。

<!-- validated -->
