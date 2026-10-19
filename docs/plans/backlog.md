# 今後の作業の一覧

docs/plans/ に置く、まだ片付いていない作業の一覧である。片付いた項目は、この文書から行を消す。

完了した plan は docs/plans/ から消してある。内容は、次の形で読める。名前は `plan-release-automation.md` のような plan のファイル名である。

```bash
git show f4700b92957075f4763eadc5ccbfd467d157c866:docs/plans/<名前>
```

履歴を引く操作なので、全履歴の clone が要る。浅い clone では先に `git fetch --unshallow` を実行する。

各項目には、内容、出典、規模を書く。出典は、消した plan なら `plan-release-automation.md L80` のように plan 名と行番号で書く。ADR は番号と節の名前、Issue は番号で書く。規模は、小 (1 つのファイルの修正か 1 回の確認)、中 (複数のファイル、または ADR 1 本)、大 (複数のパッケージにまたがる設計) の目安である。「未確認」は、現行のコードや実機で確かめていないことを示す。

## リリース運用

- **trust の 48 時間の期限を releasing.md に書く**: npm の trusted publishing の設定は、作ってから 48 時間以内に 1 度使われないと期限切れになる。期限切れは npmjs.com の画面にしか出ない。`npm trust list --json` の出力に印はなく、stage の失敗は `E401` か `ENEEDAUTH` としてしか見えない。releasing.md の trust の手順に、作ったら 48 時間以内に最初のリリースをすることを書く。あわせて、F2 で `package not found` が出たら npmjs.com の表示を見ることも書く。origin/master の releasing.md にこの記述はない (`git grep` で 48 時間と期限を探して 0 件だった)。出典: plan-release-automation.md L80、ADR-029「0.2.0 で見つかったこと」。規模: 小。
- **reject 後の再 stage の確認 (R1)**: reject した版を同じ版で stage し直せるかは、npm の docs に書かれておらず、0.2.0 でも試していない (未確認)。F2 は「再 stage できなければ F3」の分岐を持つ。再 stage できないと分かったら、ADR-029 と ADR-031 を Accepted に戻して F2 の手順を見直す。出典: ADR-029「未確認の事項」と「結果」、ADR-031「未確認の事項」。規模: 中。
- **approve の窓の上限の確認**: 0.2.0 では stage から公開まで約 10 分かかり、その間は失効しなかった。窓の上限は調べていない (未確認)。出典: ADR-029「結果」。規模: 小。
- **release の進み方を画面に出す**: `pnpm run release` は、止まったときの理由と y/N の質問のほかは、子のコマンドの出力が流れるだけである。いま何を確かめ、何を待っているかが分からない。各手順の始めに確かめる内容を出し、通ったときに根拠の値を 1 行で出す。待っている間は、待っている対象と経過時間を出す。0.2.0 の公開の途中で利用者が求めた。出典: plan-release-automation.md L78。規模: 中。
- **止まったときにエラー・原因・対処を出す**: 止まったときに、毎回 3 つを出す。1 つ目はエラーの内容で、失敗したコマンドと、stderr や job の log の該当行である。2 つ目は推定される原因で、既知の候補と確かめ方である。3 つ目は対処の例で、コマンドか見る画面である。原因の候補は、0.2.0 で実際に起きたものから始める。trust の期限切れ、npm の未ログイン、`npm view` の配列の出力、`/-/v1/done` の 404 である。出典: plan-release-automation.md L79。規模: 中。
- **判定 (K11 / K12 / K15) と待機の定数の見直し**: 0.2.0 の実測を使って、次の 2 つを見直す。K11 / K12 / K15 の判定と、`scripts/release-after-push.ts` の `WAIT` である。出典: plan-release-automation.md L73、ADR-031「Followup」の 1。規模: 小。
- **summary step で sha512 を再計算する**: release.yml の summary step で、tgz から sha512 を再計算して log に出す。log の integrity を、manifest の写しではなく、独立して計算した値とする。出典: plan-release-automation.md L74、ADR-031「Followup」の 2。規模: 小。
- **stage の来歴の表示**: stage の `actor` と `createdAt` を、y/N の表示に出すか検討する (R9)。形は 0.2.0 で確かめた。`actor` は `GitHub Actions`、`actorType` は `trusted automation` だった。出典: plan-release-automation.md L75、ADR-031「Followup」の 3、ADR-029「結果」。規模: 小。
- **dist.attestations の検証**: `dist.attestations` があれば検証する。0.2.0 では 6 つとも `dist.attestations.provenance` が付いた。出典: plan-release-automation.md L76、ADR-031「Followup」の 4。規模: 小。
- **npm stage view の出力の確認**: 手作業の手順は、integrity の照合に `npm stage view <stage-id>` を使う。0.2.0 では使っておらず、出力の書式は未確認である。`npm stage list` の書式は確かめた。releasing.md の冒頭の注記も、確かめた範囲に合わせて直す。出典: ADR-029「未確認の事項」と「結果」。規模: 小。
- **E409 の実際の stderr の確認**: `automated review hasn't finished` の E409 は、shiori の手順書の記録しかなく、実物を見ていない (未確認)。出典: ADR-031「未確認の事項」。規模: 小。
- **tag push の run の headBranch の確認**: tag の push の run の `headBranch` に tag 名が入るかを見ていない (未確認)。いまは表示にとどめている。出典: ADR-031「未確認の事項」。規模: 小。
- **承認済み stage が stage list に残るかの確認**: approve した後の stage が `stage list` に残るかは、0.2.0 の記録にない (未確認)。出典: ADR-031「未確認の事項」。規模: 小。
- **approve 後の npm view の反映遅延の確認**: approve の後に `npm view` へ反映されるまでの長さは、0.2.0 の記録にない (未確認)。出典: ADR-031「未確認の事項」。規模: 小。
- **scope の registry 設定・artifact 名の衝突・log の保持期間の確認**: 次の 3 つは未確認である。`npm stage` が scope の registry 設定を参照するか。validate を re-run したときに artifact が同名で衝突するか。job の log の保持期間 (R7)。出典: ADR-031「未確認の事項」。規模: 小。

## Web Component

- **致命的な skam-error の重複通知**: `recoverable: false` の `skam-error` が、再描画のたびに発火する。ハンドラが light DOM を書き換えると、MutationObserver、再描画、失敗、発火の連鎖が起きうる。回復可能なエラーと同じく、最後に通知したメッセージを覚えて重複を除く案がある。現行のコードで連鎖が起きるかは未確認。出典: plan-practical-readiness.md L97。規模: 小。
- **attribute-validation.test.ts の flaky なテスト**: 次のテストが、2026-10-15 に `pnpm test` で 1 回だけ落ちた。`skam-web-component` の `renders vertically and reports writing-mode once` (107 行目) である。直後の単独の実行は 6 回とも pass だった。負荷をかけて再現させ、実装のタイミングとテストの待ち方のどちらの問題かを切り分ける。原因は未確認。出典: plan-release-automation.md L77。規模: 小。
- **accessibleLabels を指定する手段**: Web Component から `accessibleLabels` を指定するプロパティがない。出典: plan-consumer-feedback.md L67。規模: 小。
- **mount() 関数 (#11)**: DOM へ描く `mount()` 関数を足し、CSS の 1 回だけの注入とフォント読み込み後の補正をまとめる。出典: plan-consumer-feedback.md L65、#11。規模: 中。

## データモデルと仕様

- **明示的な改行の ADR**: ブロック内の強制改行を決める。ブロック先頭の kaeri が不正であることは、ADR-028 の後も変わらない。出典: plan-practical-readiness.md L90。規模: 中。
- **重複した kaeri の扱い**: 同じ位置に重複した kaeri の扱いを、仕様が決めていない。出典: plan-practical-readiness.md L91。規模: 中。
- **xml:lang を JSON に保持する**: `xml:lang` を JSON に保持する。データモデルの変更になる。出典: plan-practical-readiness.md L92。規模: 中。
- **範囲の重なりと交差の XML 表現**: 範囲の重なりと部分的な交差は、JSON では表現できるが、XML では `unsupported` になる。出典: plan-practical-readiness.md L93、ADR-028「既知の制約と未実施の確認」。規模: 大。
- **IVS の tokenize**: IVS と結合文字を 1 token にまとめる。現状は code point 単位で、注記を基底文字の token に付ければ回避できる。出典: plan-practical-readiness.md L93、ADR-028「既知の制約と未実施の確認」。規模: 中。
- **JSON Schema の配布と未知の mark type の保持**: JSON Schema を配布し、未知の mark type を保持して読み込む。出典: plan-practical-readiness.md L93、ADR-028「既知の制約と未実施の確認」。規模: 中。
- **parse の既定 id を文書順にする (#15)**: `parse` の既定の id を、文書の順で決まる値にする。破壊的変更で、`xml:id` との衝突回避が要る。出典: plan-consumer-feedback.md L66、#15。規模: 中。
- **出題対象の印 (#14)**: マーク単位で「設問の答え」を表す仕様を決める。`ext` の約束事にするか、マークの属性にするかを選ぶ。出典: plan-consumer-feedback.md L63、#14。規模: 中。
- **竪点のグループからはみ出す読みの範囲 (#16)**: はみ出す読みの範囲は、先頭の字の読みとして出る。2 回目の読みが無い再読文字は、読み仮名として読まれる。扱いを決める。出典: plan-consumer-feedback.md L64、ADR-030「既知の制約」、#16。規模: 小。
- **readingLayerSource の既定の見直し**: 次の破壊的リリースで、profile を指定して `readingLayerSource` を省いたときの既定 (`'readings'`) を見直す。出典: plan-consumer-feedback.md L62、ADR-030「リスク R1〜R8 の結果」の R6。規模: 小。
- **'display' の読み上げ層の実機確認**: NVDA (Windows、日本語) と VoiceOver (macOS) で確かめる (未確認)。合格の条件は 2 つある。`習、送り仮名 フ、レ点。` の各語が言葉として発話されること。表示層のルビや返り点が、読み上げ層と重ねて読まれないこと。確かめたら、experimental を外すかを決める。出典: plan-consumer-feedback.md L61、ADR-030「リスク R1〜R8 の結果」の R1。規模: 中。
- **複合返り点のアンカーの不整合**: `value: '一レ'` 等の複合返り点には、不整合がある。フィクスチャ kaeri-compound.xml の一部で、一レが上のトークン、レが下のトークンにアンカーする。plan は ADR-004 に記録済みと書くが、ADR-004 に該当する記述が見当たらない (未確認)。出典: plan-kaeri-re-anchor-convention.md L208。規模: 小。

## レンダラー

- **Issue #4 を閉じる**: multi-token ruby-grid の range の字間のアキは、commit e6d55e2 で直っている。`spacing: 'full'` の春曉の「啼鳥」で、range 内の字のピッチを range 外の「處處」と比べた。font-size 32px で、どちらも 64px (2em) だった。`range-spacing.spec.ts` がこの測定を回帰テストにしている。Issue は open のままなので、利用者が確かめて閉じる。閉じたらこの項目を消す。出典: #4。規模: 小。
- **grid baseline 補正の構造的課題 (#2)**: Chromium の補正に構造的な課題がある。補正は `--skam-grid-baseline-fix` と `calibrateGridBaseline()` が担う。Issue は open。出典: #2。規模: 大。
- **highlight の傍線がアキ部分をカバーしない**: `highlight-content` は inline-block で、letter-spacing のアキが box に含まれない。そのため `box-shadow: inset` の傍線がアキ部分に描かれず、途切れて見える。ADR-008 で既知の制約とし、別 ADR で対応するとした。出典: plan-aki-gumi-spacing.md L70、ADR-008「検証 4: エッジケース」。規模: 中。
- **分析結果キャッシュ (DocumentAnalysis) の再利用**: Canvas の縦書きレイアウトで、分析結果 (`DocumentAnalysis`) を再利用するかを決める。現行のコードで再利用されているかは未確認。出典: ADR-018「未決事項（残件）」。規模: 中。
- **highlight の group 走査の最適化**: highlight まわりの group の走査を最適化するかを決める。現行のコードで必要かは未確認。出典: ADR-018「未決事項（残件）」。規模: 中。
- **range ruby overflow 計算の重複排除**: tateten 内と block-level に、約 120 行の類似ロジックがある。`computeRangeRubyOverflow()` ヘルパーに抽出する余地がある。このヘルパーは現行のコードに見当たらず、重複が残るかは未確認。出典: ADR-018「未決事項（残件）」。規模: 小。

## テストと CI

- **VRT (pnpm test:visual) の実行**: Playwright のブラウザがある環境で `pnpm test:visual` を実行し、ベースラインの差分を確かめる。白文のフォールバックと ref の番号順が見た目を変えないことが、未確認のままである。出典: plan-practical-readiness.md L105、ADR-028「既知の制約と未実施の確認」。規模: 小。
- **typescript@5 の tsc による consumer の型検査**: consumer の型検査 (bundler / nodenext) を `typescript@5` の `tsc` でも行う。現状は `tsgo` だけである。出典: plan-practical-readiness.md L102、ADR-028「既知の制約と未実施の確認」。規模: 小。
- **移行表の機械可読化**: 移行表を機械可読形式 (YAML など) にして、各 README の移行の節を生成する。`migration-table.test.ts` は、README の旧挙動・新挙動・回避策の列が正本と一字一句同じかを検査しない。手編集によるずれを検出できない。出典: plan-practical-readiness.md L103、ADR-028「既知の制約と未実施の確認」。規模: 中。
- **html-renderer の仕様テストの意味論化**: 文字列一致のテストを減らし、意味を検査するテストに置き換える。基盤は ADR-022 と `css-slot-semantics.test.ts` にある。ただし docs/testing/no-test-gap-matrix.md の 4 件はすべて `dual` で、`migrated` は 0 件である。`comprehensive-rendering.test.ts` には、`toContain` などの文字列一致の行が 267 行ある。出典: plan-html-renderer-colocation-and-named-grid-areas.md L295、ADR-020「完了時点で残る作業（Phase3 以降）」。規模: 大。
- **adr-parser と adr-status のテスト**: `getPhase` と PLAN 列にテストを足す。前者は `scripts/lib/adr-parser.ts`、後者は `scripts/adr-status.ts` にある。この整理は、Complete で `plan:` がなければ phase が `done`、PLAN 列が `-` となる挙動に依存している。その挙動のテストがない。出典: docs/plans/ を今後の作業だけにした整理。規模: 小。
- **Complete の ADR に残った plan の検出**: Complete の ADR に plan が残っていたら、`pnpm adr:status` が警告する。いまは PLAN 列に `exists` や `validated` を出すだけで、消し忘れに気づけない。先に、上の adr-parser と adr-status のテストを足す。出典: docs/plans/ を今後の作業だけにした整理。規模: 小。
- **scripts/adr-migrate-fm.ts の削除の検討**: 旧形式の本文リンクから frontmatter を作る一回限りの移行スクリプトで、knip の entry になっている。消すかどうかを決める。出典: docs/plans/ を今後の作業だけにした整理。規模: 小。
- **傍点のキーワードの判定を 1 か所にまとめる**: 傍点のキーワードの判定が 4 か所に分かれている。1 つ目は validator、2 つ目は html-renderer の safe.ts である。3 つ目は skam の emphasis.ts の対応表で、4 つ目は skam-screenshot の canvas-page-builder.ts の対応表である。canvas-page-builder.ts はページの中で `resolveEmphasisCharacter` を呼べないため、対応表を複製したまま残した。validator がキーワードと文字の対応表を export し、ほかがそれを使う形にまとめる。出典: 傍点のカスタム文字の修正 (fix/grid-emphasis-custom-char)。規模: 小。

## 外部利用

外部利用のロードマップ (1.0 安定化、CJS 対応、CDN、CLI) は #6 で追う。
