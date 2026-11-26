---- MODULE Release ----
\* `pnpm run release` (scripts/release.ts) と後半 (scripts/release-after-push.ts) の状態遷移。
\* 手順はどの段の直後でも止まりうる (プロセスが落ちる、利用者が止める)。止まった後は入口
\* (decideEntry / decideEntryWithStatus, scripts/lib/release-check.ts:565-667) が外部の状態を
\* 読み直して、続きか停止の行を選ぶ。CI (release.yml) は tag の push で走り、人が再実行できる。
\*
\* 抽象化:
\*   - パッケージは Pkgs の順 (manifest の順) に approve する
\*   - stage の id は「その tarball を作った CI の試行 (attempt)」で表す
\*   - stage の tarball が validate の log の sha512 と一致するかを good で表す (一致しない試行は bad)
\*   - 前半の段 1〜5 は「版を上げて commit する前」としてまとめ、段 6 (commit と tag)、段 7 (push) を分ける
\*
\* フラグ (formal.json の契約はすべて TRUE、壊したモデルは 1 つだけ FALSE):
\*   Verify     : 段 9 で tarball を validate の log の sha512 と照合する (release-after-push.ts:748, 814)
\*   Recheck    : 段 10 の各 approve の直前に stage の id を読み直す (recheckBeforeApprove, release-after-push.ts:934)
\*   InOrder    : 段 10 は manifest の順に approve する (planApprove, release-after-push-check.ts:865)
\*   DirtyFirst : 入口が、行の判定を使う前に作業ツリーの未 commit の変更で止まる (stopIfDirty, release.ts:1581)。
\*                2026-11-26 より前は FALSE で、dirty は前半の段 1 と後半の入口でだけ見ていた。
\*                その組 (Current-HintFollowable.cfg) の反例は ledger.md にある
EXTENDS Naturals, FiniteSets
CONSTANTS Pkgs, MaxAttempt, DirtyFirst, Verify, Recheck, InOrder

\* 手順の 1 回の実行の位置。"idle" は止まっている (または走っていない)
PCs == {"idle", "front", "bumped", "tagged", "s8", "s9", "s10", "s11"}

VARIABLES
  tree,        \* 作業ツリー: "base" (changeset が残る) / "dirty" (版を上げたが未 commit) / "committed"
  localTag, originTag,
  attempt,     \* CI の最新の試行。0 は CI がまだ走っていない
  good,        \* 試行 → その試行の stage が log の sha512 と一致するか
  staged,      \* パッケージ → npm に stage されている試行の集合
  published,   \* パッケージ → 公開した試行 (0 は未公開)
  pc, verified, \* 実行中の手順の位置と、段 9 で照合した試行 (メモリにあり、止まると消える)
  hint,        \* 最後に入口が案内した次の手 ("none" / "tag-only" / "revert" / "rerun")
  mode         \* 次の実行のフラグ ("normal" / "tag-only")

vars == <<tree, localTag, originTag, attempt, good, staged, published, pc, verified, hint, mode>>

Attempts == 1..MaxAttempt
Unpublished == {p \in Pkgs : published[p] = 0}
Complete == Unpublished = {}
PublishedCount == Cardinality(Pkgs \ Unpublished)

Init == /\ tree = "base"
        /\ localTag = FALSE /\ originTag = FALSE
        /\ attempt = 0
        /\ good \in [Attempts -> BOOLEAN]
        /\ staged = [p \in Pkgs |-> {}]
        /\ published = [p \in Pkgs |-> 0]
        /\ pc = "idle" /\ verified = 0
        /\ hint = "none" /\ mode = "normal"

\* --- 入口 (runEntry, release.ts:1575) ---
\* 返り値: "front" / "after-push" / "check-only" / <<"stop", 行, 次の手>>
\* 入口の判定。どの経路も同じ形のレコードで返す (種類、停止の行、停止で案内する次の手)。
\* 文字列と組を混ぜて返すと、Start の比較が型の違う値どうしの比較になり、意味が決まらない
Go(kind) == [kind |-> kind, row |-> 0, next |-> "none"]
Stop(row, next) == [kind |-> "stop", row |-> row, next |-> next]

EntryRoute ==
  IF DirtyFirst /\ tree = "dirty" THEN Stop(15, "revert")
  ELSE IF originTag /\ ~Complete
    THEN IF mode = "normal" THEN Go("after-push") ELSE Stop(2, "none")              \* 行 1 / 行 2
  ELSE IF ~originTag /\ localTag THEN Stop(3, "revert")                             \* 行 3
  ELSE IF mode = "tag-only"
    THEN IF originTag THEN Stop(5, "none")                                          \* 行 5
         ELSE IF PublishedCount > 0 THEN Stop(6, "none") ELSE Go("front")           \* 行 6 / 6a
  \* normal: changeset status を読む (版を上げると changeset は消費される)
  ELSE IF tree = "base" THEN Go("front")                                            \* 行 11
  ELSE IF originTag /\ Complete THEN Go("check-only")                               \* 行 8
  ELSE IF ~originTag /\ PublishedCount = 0 THEN Stop(12, "tag-only")                \* 行 12
  ELSE Stop(14, "none")                                                             \* 行 14

Start == /\ pc = "idle"
         /\ LET r == EntryRoute IN
              IF r.kind = "front" THEN pc' = "front" /\ UNCHANGED hint
              ELSE IF r.kind = "after-push" THEN
                \* DirtyFirst=FALSE の入口は、after-push の経路でだけ未 commit の変更を見ていた
                IF tree = "dirty" THEN pc' = "idle" /\ hint' = "revert" ELSE pc' = "s8" /\ UNCHANGED hint
              ELSE IF r.kind = "check-only" THEN pc' = "s11" /\ UNCHANGED hint
              ELSE pc' = "idle" /\ hint' = r.next
         /\ mode' = "normal"
         /\ UNCHANGED <<tree, localTag, originTag, attempt, good, staged, published, verified>>

\* 案内に従って次の実行のフラグを決める / 戻しの手順を行う (releasing.md「段 2〜7 で止まったとき」)
FollowHint == /\ pc = "idle" /\ hint # "none"
              /\ CASE hint = "tag-only" -> mode' = "tag-only" /\ UNCHANGED <<tree, localTag>>
                   [] hint = "revert" -> tree' = "base" /\ localTag' = FALSE /\ UNCHANGED mode
                   [] OTHER -> UNCHANGED <<tree, localTag, mode>>
              /\ hint' = "none"
              /\ UNCHANGED <<originTag, attempt, good, staged, published, pc, verified>>

\* --- 前半 ---
\* 段 1: git が clean で HEAD = origin/master (release.ts:715-739)。clean でなければ止まる
Stage1to5 == /\ pc = "front"
             /\ IF tree = "dirty"
                  THEN pc' = "idle" /\ hint' = "revert" /\ UNCHANGED tree
                  ELSE IF tree = "base"
                    THEN pc' = "bumped" /\ tree' = "dirty" /\ UNCHANGED hint   \* 段 2: changeset version
                    ELSE pc' = "bumped" /\ UNCHANGED <<tree, hint>>           \* --tag-only: 版は commit 済み
             /\ UNCHANGED <<localTag, originTag, attempt, good, staged, published, verified, mode>>

\* 段 6: commit と tag
Stage6 == /\ pc = "bumped"
          /\ tree' = "committed" /\ localTag' = TRUE /\ pc' = "tagged"
          /\ UNCHANGED <<originTag, attempt, good, staged, published, verified, hint, mode>>

\* 段 7: push。tag の push で CI の試行 1 が走る (下の CiRun)
Stage7 == /\ pc = "tagged"
          /\ originTag' = TRUE /\ pc' = "s8"
          /\ UNCHANGED <<tree, localTag, attempt, good, staged, published, verified, hint, mode>>

\* --- CI (release.yml): validate → npm-stage。試行ごとに 6 パッケージを stage する ---
\* 前の試行の stage が残るか置き換わるかは npm の仕様で、ここでは両方を許す
CiRun == /\ originTag /\ attempt < MaxAttempt
         /\ attempt' = attempt + 1
         /\ \E keep \in BOOLEAN :
              staged' = [p \in Pkgs |-> IF published[p] # 0 THEN staged[p]
                                         ELSE (IF keep THEN staged[p] ELSE {}) \cup {attempt + 1}]
         /\ UNCHANGED <<tree, localTag, originTag, good, published, pc, verified, hint, mode>>

\* --- 後半 ---
\* 段 8: run を待つ。最新の試行を選ぶ (selectRun は databaseId 最大, release-after-push-check.ts:191)
Stage8 == /\ pc = "s8" /\ attempt > 0
          /\ pc' = "s9"
          /\ UNCHANGED <<tree, localTag, originTag, attempt, good, staged, published, verified, hint, mode>>

\* 段 9: 未公開のパッケージごとに、stage が 1 つだけで、その tarball が log と一致するか (planApprove)
Stage9 == /\ pc = "s9"
          /\ IF \A p \in Unpublished : staged[p] = {attempt} /\ (Verify => good[attempt])
               THEN pc' = "s10" /\ verified' = attempt /\ UNCHANGED hint
               ELSE pc' = "idle" /\ verified' = 0 /\ hint' = "rerun"
          /\ UNCHANGED <<tree, localTag, originTag, attempt, good, staged, published, mode>>

\* 段 10: manifest の順に、未公開の先頭を approve する。直前に stage の id を読み直し、
\* 照合した id と同じときだけ approve する (recheckBeforeApprove, release-after-push.ts:934)
Stage10 == /\ pc = "s10"
           /\ IF Complete THEN pc' = "s11" /\ UNCHANGED <<published, verified, hint>>
              ELSE \E p \in Unpublished :
                     /\ InOrder => \A q \in Pkgs : q < p => published[q] # 0
                     /\ IF staged[p] = {verified}
                          THEN published' = [published EXCEPT ![p] = verified] /\ UNCHANGED <<pc, verified, hint>>
                        ELSE IF ~Recheck /\ staged[p] # {}
                          \* 読み直さずに、いま stage にある最新の id を approve する
                          THEN \E a \in staged[p] : published' = [published EXCEPT ![p] = a] /\ UNCHANGED <<pc, verified, hint>>
                          ELSE pc' = "idle" /\ verified' = 0 /\ hint' = "rerun" /\ UNCHANGED published
           /\ UNCHANGED <<tree, localTag, originTag, attempt, good, staged, mode>>

Stage11 == /\ pc = "s11"
           /\ pc' = "idle"
           /\ UNCHANGED <<tree, localTag, originTag, attempt, good, staged, published, verified, hint, mode>>

\* どの段の直後でも止まりうる。メモリの照合結果は消える
Crash == /\ pc # "idle"
         /\ pc' = "idle" /\ verified' = 0
         /\ UNCHANGED <<tree, localTag, originTag, attempt, good, staged, published, hint, mode>>

\* 段 9 で bad の試行を見たら、人が CI を再実行する (releasing.md「re-run を使ってよいとき」)
\* rerun の案内は CiRun で受ける

Next == Start \/ FollowHint \/ Stage1to5 \/ Stage6 \/ Stage7 \/ CiRun
        \/ Stage8 \/ Stage9 \/ Stage10 \/ Stage11 \/ Crash

Spec == Init /\ [][Next]_vars

\* 性質 1: 公開した tarball は、どれも validate の log の sha512 と一致した試行のものである
PublishedVerified == \A p \in Pkgs : published[p] # 0 => good[published[p]]

\* 性質 2: 公開済みのパッケージは manifest の先頭から続く (途中が抜けない)
PublishedPrefix == \A p, q \in Pkgs : (q < p /\ published[p] # 0) => published[q] # 0

\* 性質 3: 入口が案内した次の手は、そのまま従えば同じ理由で止まらない。
\* --tag-only を案内するのは、作業ツリーが clean のときだけである (前半の段 1 で止まらないため)
HintFollowable == hint = "tag-only" => tree # "dirty"
====
