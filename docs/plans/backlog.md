# 今後の作業の一覧

docs/plans/ に置く、まだ片付いていない作業の一覧である。片付いた項目は、この文書から行を消す。

完了した plan は docs/plans/ から消してある。内容は、次の形で読める。名前は `plan-release-automation.md` のような plan のファイル名である。

```bash
git show f4700b92957075f4763eadc5ccbfd467d157c866:docs/plans/<名前>
```

履歴を引く操作なので、全履歴の clone が要る。浅い clone では先に `git fetch --unshallow` を実行する。

各項目には、内容、出典、規模を書く。出典は、消した plan なら `plan-release-automation.md L80` のように plan 名と行番号で書く。ADR は番号と節の名前、Issue は番号で書く。規模は、小 (1 つのファイルの修正か 1 回の確認)、中 (複数のファイル、または ADR 1 本)、大 (複数のパッケージにまたがる設計) の目安である。「未確認」は、現行のコードや実機で確かめていないことを示す。

## リリース運用

- **reject 後の再 stage の確認 (R1)**: reject した版を同じ版で stage し直せるかは、npm の docs に書かれておらず、0.2.0 でも試していない (未確認)。F2 は「再 stage できなければ F3」の分岐を持つ。再 stage できないと分かったら、ADR-029 と ADR-031 を Accepted に戻して F2 の手順を見直す。出典: ADR-029「未確認の事項」と「結果」、ADR-031「未確認の事項」。規模: 中。
- **approve の窓の上限の確認**: 0.2.0 では stage から公開まで約 10 分かかり、その間は失効しなかった。窓の上限は調べていない (未確認)。出典: ADR-029「結果」。規模: 小。
- **release の証拠の保存物を無害化する**: `.tmp/release/` の証拠の保存物 (`scripts/release.ts` の `createEvidenceStore`、`saveRaw`) は、gh / npm の生の出力をそのまま保存している。利用者が `cat` すると、エスケープ列がそのまま端末に出る。token が出力に含まれていれば、そのまま残る。保存の前に、メモリ上の値に無害化と secret のマスクをかけ、ファイルの権限を 0600 にする。出典: ADR-032「提供しない体験」。規模: 小。
- **release の進み方の行の見え方の確認**: `pnpm run release` の `entry:` の行、`stage N/11:` / `ok:` / `waiting for` の行と、子の stderr (`inherit-keep-stderr` で流れるもの) の並びが、実際の端末で読めるかを確かめる。2026-10-19 の確認は入口で止まる経路だけで、これらの行は出なかった (未確認)。次のリリースで見る。出典: ADR-032「確かめた事実」と R9。規模: 小。
- **approve が実行のたびに 2FA を求めるかの確認**: `npm stage approve` が実行のたびに 2FA を求めるか (6 パッケージなら 6 回か) を確かめる。0.2.0 では、approve の認証の画面に「次の 5 分間は 2FA を省略する」の選択肢が出なかった (未確認)。確かめたら、releasing.md の段 10 の記述を直す。出典: releasing.md 段 10、PR #16。規模: 小。
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

- **attribute-validation.test.ts の flaky なテスト**: 2026-10-15 に `pnpm test` で 1 回だけ落ちた。落ちたのは `renders vertically and reports writing-mode once` である。2026-10-19 に 120 回流したが、再現しなかった。内訳は、8 コアすべてに CPU 負荷をかけた `attribute-validation.test.ts` が 100 回、`turbo run test:run --force` が 20 回である。vitest 4.0.18、happy-dom 20.3.9。失敗率が 2.5% (3/120) 以上なら 95% の確からしさで検出できたので、それ未満の失敗率は否定できない。元の失敗との関係は未確認だが、下の happy-dom の MutationObserver の件が候補である。出典: plan-release-automation.md L77。規模: 小。
- **happy-dom の MutationObserver が GC で通知を落とす**: happy-dom 20.3.9 は MutationObserver のコールバックを `WeakRef` で持つ。該当するのは `MutationObserverListener.js` である。GC で回収されると、light DOM の変更の通知が捨てられる。`--expose-gc` で毎回 GC を走らせると、素の `<div>` でも 300 回中 299 回届かなかった。`textContent` で再描画を起こすテストは、GC のタイミング次第で落ちる。既存のテスト (attribute-validation.test.ts など) で `textContent` を使って再描画している箇所は、`xmlContent` の setter に替える。MutationObserver の経路そのものは、実ブラウザのテストで確かめる。happy-dom の新しい版で直っているかも確かめる。出典: fix/web-component-errors-and-labels の調査 (2026-10-19)。規模: 小。
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

- **grid baseline 補正の構造的課題 (#2)**: Chromium の補正に構造的な課題がある。補正は `--skam-grid-baseline-fix` と `calibrateGridBaseline()` が担う。Issue は open。出典: #2。規模: 大。
- **highlight の傍線がアキ部分をカバーしない**: `highlight-content` は inline-block で、letter-spacing のアキが box に含まれない。そのため `box-shadow: inset` の傍線がアキ部分に描かれず、途切れて見える。ADR-008 で既知の制約とし、別 ADR で対応するとした。出典: plan-aki-gumi-spacing.md L70、ADR-008「検証 4: エッジケース」。規模: 中。
- **分析結果キャッシュ (DocumentAnalysis) の再利用**: Canvas の縦書きレイアウトで、分析結果 (`DocumentAnalysis`) を再利用するかを決める。現行のコードで再利用されているかは未確認。出典: ADR-018「未決事項（残件）」。規模: 中。
- **highlight の group 走査の最適化**: highlight まわりの group の走査を最適化するかを決める。現行のコードで必要かは未確認。出典: ADR-018「未決事項（残件）」。規模: 中。
- **range ruby overflow 計算の重複排除**: tateten 内と block-level に、約 120 行の類似ロジックがある。`computeRangeRubyOverflow()` ヘルパーに抽出する余地がある。このヘルパーは現行のコードに見当たらず、重複が残るかは未確認。出典: ADR-018「未決事項（残件）」。規模: 小。

## テストと CI

- **VRT (pnpm test:visual) の実行**: Playwright のブラウザがある環境で `pnpm test:visual` を実行し、ベースラインの差分を確かめる。白文のフォールバックと ref の番号順が見た目を変えないことが、未確認のままである。出典: plan-practical-readiness.md L105、ADR-028「既知の制約と未実施の確認」。規模: 小。
- **移行表の機械可読化**: 移行表を機械可読形式 (YAML など) にして、各 README の移行の節を生成する。`migration-table.test.ts` は、README の旧挙動・新挙動・回避策の列が正本と一字一句同じかを検査しない。手編集によるずれを検出できない。出典: plan-practical-readiness.md L103、ADR-028「既知の制約と未実施の確認」。規模: 中。
- **html-renderer の仕様テストの意味論化**: 文字列一致のテストを減らし、意味を検査するテストに置き換える。基盤は ADR-022 と `css-slot-semantics.test.ts` にある。ただし docs/testing/no-test-gap-matrix.md の 4 件はすべて `dual` で、`migrated` は 0 件である。`comprehensive-rendering.test.ts` には、`toContain` などの文字列一致の行が 267 行ある。出典: plan-html-renderer-colocation-and-named-grid-areas.md L295、ADR-020「完了時点で残る作業（Phase3 以降）」。規模: 大。
- **adr:status の警告を verify か CI に入れる**: Complete の ADR に plan: が残ったときの警告は、`pnpm adr:status` を手で走らせたときしか見えない。verify か CI に入れるかを決める。出典: chore/adr-tooling-checks の spec K2。規模: 小。
- **ADR の不正な status の扱い**: `parseFrontmatter` は不正な status (`Complet` など) を黙って Proposed にする (adr-parser.test.ts が固定している)。deps と同じく throw にするかを決める。出典: chore/adr-tooling-checks のレビュー。規模: 小。
- **傍点のキーワードの判定を 1 か所にまとめる**: 傍点のキーワードの判定が 4 か所に分かれている。1 つ目は validator、2 つ目は html-renderer の safe.ts である。3 つ目は skam の emphasis.ts の対応表で、4 つ目は skam-screenshot の canvas-page-builder.ts の対応表である。canvas-page-builder.ts はページの中で `resolveEmphasisCharacter` を呼べないため、対応表を複製したまま残した。validator がキーワードと文字の対応表を export し、ほかがそれを使う形にまとめる。出典: 傍点のカスタム文字の修正 (fix/grid-emphasis-custom-char)。規模: 小。
- **TypeScript 7 系への移行**: このリポジトリを TypeScript 7 系 (native の `typescript` パッケージ) に移す。tsgo (`@typescript/native-preview`) との関係、typescript-eslint などの JS 実装を要る道具の扱いを決める。consumer の検査の `typescript5` (5.9.3) は、利用者の 5 系の代表として残す。出典: 利用者の方針 (2026-10-19)。規模: 中。

## 外部利用

外部利用のロードマップ (1.0 安定化、CJS 対応、CDN、CLI) は #6 で追う。
