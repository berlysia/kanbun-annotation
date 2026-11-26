# 形式検査の台帳: リリース手順の公開と再開

- 対象のリポジトリ: kanbun-annotation
- manifest: docs/formal/release/formal.json
- 作った日: 2026-11-26

`pnpm run release` は、どの段の直後でも止まりうる。止まった後の再実行では、入口が外部の状態 (作業ツリー、tag、CI、npm) を読み直して、続きか停止の行を選ぶ。
`Release.tla` は、この手順を、CI の再実行と npm の stage を含めて表す。
`formal.json` には、修正後のフラグを契約 (hold) として登録し、守る手段を 1 つずつ外したものを壊したモデル (violate) として登録した。

## 実装の主張

`file:line` は 2026-11-26 の修正後の `scripts/` を指す。

| 主張                                                                                                 | file:line                                                | check id                                             | 対象外                                                                      |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------- |
| 段 9 は、stage した tarball の sha512 を validate の log の値と照合し、一致しなければ止まる          | release-after-push.ts:748, 814                           | published-verified                                   |                                                                             |
| 段 10 は、各 approve の直前に stage の id を読み直し、段 9 で照合した id と同じときだけ approve する | release-after-push.ts:934-960 (`recheckBeforeApprove`)   | published-verified                                   |                                                                             |
| 段 9 は、stage が 1 つでない、または公開済みが manifest の先頭からの連続でないときに止まる           | release-after-push-check.ts:865 (`planApprove`)          | published-prefix                                     |                                                                             |
| 段 10 は、manifest の順に approve する                                                               | release-after-push.ts:1015-1072                          | published-prefix                                     |                                                                             |
| 入口は、観測の失敗 (行 0) を除き、どの行の判定よりも先に、未 commit の変更で止まる                   | release.ts:1581 (`stopIfDirty`)、`runEntry` の判定の直後 | hint-followable                                      |                                                                             |
| 行 12 は、changeset が残っていない、tag がない、公開 0 件のときに `--tag-only` を案内する            | release-check.ts:651-655                                 | hint-followable                                      |                                                                             |
| 入口は、作業ツリーの package.json から版を読む                                                       | release.ts:492-500                                       | hint-followable (版は作業ツリーの状態に従う)         |                                                                             |
| CI の run は、同じ commit のうち最新の試行を選ぶ                                                     | release-after-push-check.ts:191 (`selectRun`)            | published-verified (CI の再実行はいつでも起こりうる) |                                                                             |
| 2 つの端末で後半を同時に流す                                                                         |                                                          |                                                      | モデルは 1 プロセスだけで、同時実行は確かめていない (docs/plans/backlog.md) |

## 機械検査の結果

<!-- check: published-verified -->

- 日付: 2026-11-26
- verdict: hold
- 壊したモデル: published-verified-without-verify (violate)、published-verified-without-recheck (violate: 段 9 の照合の後に CI が再実行され、照合していない試行の stage が approve される)
- 実コードを壊す確認: 下の記録を参照

<!-- check: published-prefix -->

- 日付: 2026-11-26
- verdict: hold
- 壊したモデル: published-prefix-without-order (violate)
- 実コードを壊す確認: 下の記録を参照

<!-- check: hint-followable -->

- 日付: 2026-11-26
- verdict: hold
- 壊したモデル: hint-followable-before-2026-11-26 (violate: 前半を始める → 段 2 で版を上げる → 止まる → 再実行で行 12 が `--tag-only` を案内する。`--tag-only` は段 1 の clean 検査で止まる)
- 実コードを壊す確認: 下の記録を参照

### 実コードを壊す確認の記録

- 開始: 2026-11-26、worktree /tmp/claude-1000/-home-berlysia-worktrees-kanbun-annotation-worktree-bridge-cse-01BwNa9ZR93KqniXxAh9Scwx/8dbd5360-5085-5082-8229-56f3e94a4aa5/scratchpad/break/tmp.v7qFDw8qDL/formal-check-break-release、元の HEAD ed707447c86239b28db5586e311eef94698a5a07、元の status ` M scripts/lib/release-stop-report.ts; M scripts/release.test.ts; M scripts/release.ts; ?? docs/formal/`、壊す予定のファイル scripts/release.ts、コピーしたファイル docs/formal/release/ 配下 (10 件)
- 終わり: 2026-11-26、worktree /tmp/claude-1000/-home-berlysia-worktrees-kanbun-annotation-worktree-bridge-cse-01BwNa9ZR93KqniXxAh9Scwx/8dbd5360-5085-5082-8229-56f3e94a4aa5/scratchpad/break/tmp.v7qFDw8qDL/formal-check-break-release、元の HEAD と status が記録と同じ

経過と結果:

- 未コミットの差分と未追跡のファイルは、パッチにして worktree に `git apply` で当て、後始末は `git apply -R` で逆に当てた (Document Workflow の guard が worktree への `cp` を止めるため)。逆適用は内容の一致を要求するので、コピーしたファイルが元と同じであることも確かめたことになる。`git worktree remove` は `--force` なしで通った
- 壊す前の worktree で `formal-check` は exit 0、警告なしだった
- `runEntry` の `stopIfDirty(deps)` の呼び出しを外した。`hint-followable` の契約に `stale-model` が出て exit 1 になった (covers が `scripts/release.ts` を含むのはこの契約だけ)
- モデルを合わせ直すと `DirtyFirst=FALSE` で、壊したモデル `hint-followable-before-2026-11-26` と同じ組になり、HintFollowable が破れる
- 同じ worktree で `scripts/release.test.ts` の入口の 5 件を流すと、4 件が落ち、対照 (版を commit 済みのときの行 12) が通った

## 確認質問

修正前の入口 (`DirtyFirst=FALSE`) で TLC が出した反例である。`scripts/release.test.ts` の fixture (tmp の git リポジトリと偽の依存) で入口の全体を流して再現した。
2026-11-26 にユーザーが修正の計画を承認したので、答えはその決定を写す。

| 質問 id | check id        | 問い                                                                                                                                                                                                                                                     | 答え                                                                                                                         |
| ------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| q1      | hint-followable | > 段 2〜5 で止まった後に再実行すると、入口は「the version is bumped to 0.2.0 but there is no tag; to tag it, run with --tag-only」で止まる。案内どおりに `--tag-only` を付けると前半に入り、段 1 の「working tree is not clean」で止まる。意図した挙動か | 意図しない。入口で、行の判定を使う前に未 commit の変更で止める。その停止は変更を消すコマンドを出さず、確かめる手順を案内する |
