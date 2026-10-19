# release の止まったときの 3 つの表示と、進み方の表示

## 概要

`pnpm run release` が入口・前半・後半のどこで止まっても、エラーの内容、推定される原因、対処の例を毎回出し、各段の進み方を画面に出す。

関連 ADR: [ADR-032](../decisions/adr-032-release-stop-report.md)

## 前提知識

パスは `scripts/` の下。R は `release.ts`、AP は `release-after-push.ts`、RC は `lib/release-check.ts`、APC は `lib/release-after-push-check.ts`、T は `lib/release-types.ts`、SR は新しい `lib/release-stop-report.ts` である。

- 停止は 3 系統ある。入口 (`entry-stopped`)、前半 (`front-stopped`、段 1〜7)、後半 (`after-push-stopped`、段 8〜11) である。
- 3 系統とも、停止を `StopReport` (headline、error、causes、remedies、section、notes) に変換し、`formatStopReport` で整形し、`reportOutcome` から `createOutput` の 1 つの出口に流す。
- 原因の候補は `diagnose` (規則の表) が決める。後半の route の分類 (`classifyStop`) には触れない。
- 外部の文字列は、切る、エスケープ列を除く、制御文字を除く、secret をマスクする、行を選ぶ、切る、の順に処理して `error.lines` にだけ入れる。
- import の向きは R → AP/APC/RC/SR/T、AP → APC/RC/SR/T、SR → RC/T、APC → RC/T、RC → T である。APC は SR を import しない。
- 前半の子は `run` (`inherit-keep-stderr`) で実行し、stderr を無害化して流しながら末尾を保持する。`pnpm verify` は段ごとに流す。
- 進み方は、段の始め、通ったときの根拠、待機の 3 種類の行である。

## 実装計画

各 Step の後の SHA は、その Step の実装のコミットである。

### Step 1: 純粋関数と型 (plan-1)

- T1: 実装の前の確認を記録する。利用者の端末で 2 つ確かめ、どちらも合格した。コミットはない (結果は ADR-032 の「確かめた事実」)。
- T2: 制御文字の除去を RC に移す。`e17c8ab`
- T3: 型 (`StopSite`、`ErrorExcerpt`、`StopReport`、`FrontStop`) を足し、`judgeJobs` の `job-failed` に `jobId` を足す。`9538b0a`
- T5: secret のマスク。`2da4b89`
- T4: 行の切り出し。`8ff90b1`
- T6: 診断の規則と既定の候補。`6ac552f`、後続の修正 `bae46bc` (trust-expired の対処の文を英語に直した)
- T7: 整形と進み方の行。`025f6b6`
- T8: 構造テストと型検査の対象。`cf9287a`
- T9: `verify` の段の分割 (`planVerifySteps`)。`24926ea`

### Step 2: 停止の結線 (plan-2)

- T1: 前半の deps を `Promise` にする (表示は変えない)。`a32ac31`
- T2: 前半の停止を `FrontStop` で返し、`reportOutcome` で出す。`705487a`
- T3: 入口の停止に `error` を載せ、ls-remote の失敗を「tag が無い」と区別する。`b6e8230`
- T4: 後半の停止に `error` を載せ、失敗した job の log を取る。`3451091`
- T5: stderr の受け側を直す (末尾の保持、`close` の待ちの打ち切り)。`537b0a9`
- T6: 子の stdio を `inherit-keep-stderr` に切り替える。`2f8f32e`

### Step 3: 進み方の表示 (plan-3)

- T1: 待機の行。`9e6bf83`
- T2: 後半の段の始めと根拠。`f4fa2eb`
- T3: 入口と前半の段の始めと根拠。`702b345`
- T4: 手元の端末での見え方の確認。コミットはない。結果は ADR-032 の「確かめた事実」に書く。

### Step 4: 手順書と記録 (plan-4)

- T1: releasing.md を直す。「止まったとき」の表示の形、`/-/v1/done` の 404、F2 の trust の期限切れ、待機の行、approve の 2FA を「未確認」と書き換える。
- T2: ADR-032 とこの plan を書き、ADR-031 に注記を 1 行置く。
- T3: backlog.md を片付け、記録をコミットの本文に移す。

### plan に無かった判断

実装の報告から集めた。いずれも決定の内容は変えていない。

plan-1:

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
- trust-expired の対処の文は英語に直した。

plan-2:

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

plan-3:

- 段 8 の始めは、検証した tag を表示する。
- attempt は `attemptKey` から読む。
- 段 9 の始めは `--check-only` でも出し、そのときは `ok:` を出さない。段 9 の `m` は `plan.states.length`。
- 段 10 の始めは、段 10 が走るときだけ出す。y/N で `N` を答えたときは `ok:` を出さない。`p` は `names.length - approved`。
- `planStage` の label は、最初に待つパッケージの名前を使う。
- 段 7 の `pushed <tag>` は `ok: pushed <tag> at <12 桁の commit>` になった。
- `entry:` の行は、続行するときだけ出す (入口の停止では、停止の見出しを先に出すため)。
- 値が不明なときは `unknown` と出す。

## リスクと軽減策

| リスク                                                     | 影響度 | 軽減策                                                                                                 |
| ---------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| npm や gh のエラー文が変わり、規則が当たらなくなる         | 中     | 当たらなくても既定の候補と切り出した行は出る。規則のテストは実物の log の行を fixture にした           |
| 前半の子の stderr が TTY でなくなり、表示が崩れる          | 中     | 実装の前に利用者の端末で確かめた (合格)。崩れた子は、その子の `stdio` を 1 か所変えて `inherit` に戻す |
| 型の変更が偽の deps のテストに広く及ぶ                     | 低     | タスクを小さく分け、各タスクの終わりで `pnpm test:scripts` と `pnpm typecheck:scripts` を通した        |
| 後半の kind の知識が 2 つの表に分かれ、片方の更新を忘れる  | 低     | `Record<StopObservation['kind'], ...>` で型の網羅を強制し、網羅テストを置いた                          |
| 子の stderr の流れと進み方の行が、画面で交ざって読みにくい | 低     | 進み方の行は段の始めと終わりに出す。手元の端末で見て確かめる (Step 3 の T4)                            |

## 検証方法

- `pnpm test:scripts` と `pnpm typecheck:scripts` が通ること。停止の種類ごとの `error:` / `possible causes:` / `try:` の網羅テスト、実物の log を使った `diagnose` のテスト、マスクと切り出しの順序のテスト、import の向きの構造テストを含む。
- `pnpm adr:status` で、ADR-032 の phase が `implementation`、PLAN 列が `validated` になること。plan から ADR-032 へのリンクは目視で確かめる。
- releasing.md の見出しが、構造テスト (11a〜11d) で実在すること。`git grep -n '2FA' -- docs/releasing.md` を目視し、approve の 2FA の頻度を断定する記述が残っていないこと。
- `pnpm verify` が exit 0 であること。
- 手元の端末で `pnpm run release` を 1 回実行し、`entry:` の行、止まったときの 3 つの見出し、子の stderr と `stage N/11:` の行の並びを見ること (Step 3 の T4)。

<!-- validated -->
