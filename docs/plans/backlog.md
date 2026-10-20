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
- **release の進み方の行の見え方の確認**: `pnpm run release` の `entry:` の行、`stage N/11:` / `ok:` / `waiting for` の行と、子の stderr (`inherit-keep-stderr` で流れるもの) の並びが、実際の端末で読めるかを確かめる。2026-10-19 の確認は入口で止まる経路だけで、これらの行は出なかった (未確認)。次のリリースで見る。出典: ADR-032「確かめた事実」と R9。規模: 小。
- **approve が実行のたびに 2FA を求めるかの確認**: `npm stage approve` が実行のたびに 2FA を求めるか (6 パッケージなら 6 回か) を確かめる。0.2.0 では、approve の認証の画面に「次の 5 分間は 2FA を省略する」の選択肢が出なかった (未確認)。確かめたら、releasing.md の段 10 の記述を直す。出典: releasing.md 段 10、PR #16。規模: 小。
- **判定 (K11 / K12 / K15) と待機の定数の見直し**: 0.2.0 の実測を使って、次の 2 つを見直す。K11 / K12 / K15 の判定と、`scripts/release-after-push.ts` の `WAIT` である。出典: plan-release-automation.md L73、ADR-031「Followup」の 1。規模: 小。
- **stage の来歴の表示**: stage の `actor` と `createdAt` を、y/N の表示に出すか検討する (R9)。形は 0.2.0 で確かめた。`actor` は `GitHub Actions`、`actorType` は `trusted automation` だった。出典: plan-release-automation.md L75、ADR-031「Followup」の 3、ADR-029「結果」。規模: 小。
- **attestation の bundle と tgz の digest の照合**: `dist.attestations.url` の bundle を取得し、in-toto の statement の subject の sha512 が log の tgz と一致するかを確かめる。いまは registry が申告する provenance の predicateType の形だけを確かめ、attestation が無いとき (provenance が消えた公開) は止めない。出典: feat/release-integrity-and-attestations の spec K8。規模: 中。
- **npm stage view の出力の確認**: 手作業の手順は、integrity の照合に `npm stage view <stage-id>` を使う。0.2.0 では使っておらず、出力の書式は未確認である。`npm stage list` の書式は確かめた。releasing.md の冒頭の注記も、確かめた範囲に合わせて直す。出典: ADR-029「未確認の事項」と「結果」。規模: 小。
- **E409 の実際の stderr の確認**: `automated review hasn't finished` の E409 は、shiori の手順書の記録しかなく、実物を見ていない (未確認)。出典: ADR-031「未確認の事項」。規模: 小。
- **tag push の run の headBranch の確認**: tag の push の run の `headBranch` に tag 名が入るかを見ていない (未確認)。いまは表示にとどめている。出典: ADR-031「未確認の事項」。規模: 小。
- **承認済み stage が stage list に残るかの確認**: approve した後の stage が `stage list` に残るかは、0.2.0 の記録にない (未確認)。出典: ADR-031「未確認の事項」。規模: 小。
- **approve 後の npm view の反映遅延の確認**: approve の後に `npm view` へ反映されるまでの長さは、0.2.0 の記録にない (未確認)。出典: ADR-031「未確認の事項」。規模: 小。
- **scope の registry 設定・artifact 名の衝突・log の保持期間の確認**: 次の 3 つは未確認である。`npm stage` が scope の registry 設定を参照するか。validate を re-run したときに artifact が同名で衝突するか。job の log の保持期間 (R7)。出典: ADR-031「未確認の事項」。規模: 小。

## Web Component

- **attribute-validation.test.ts の flaky なテスト**: 2026-10-15 に `pnpm test` で 1 回だけ落ちた。落ちたのは `renders vertically and reports writing-mode once` である。2026-10-19 に 120 回流したが、再現しなかった。内訳は、8 コアすべてに CPU 負荷をかけた `attribute-validation.test.ts` が 100 回、`turbo run test:run --force` が 20 回である。vitest 4.0.18、happy-dom 20.3.9。失敗率が 2.5% (3/120) 以上なら 95% の確からしさで検出できたので、それ未満の失敗率は否定できない。候補だった happy-dom の MutationObserver の件 (GC で通知を落とす) は 20.14.6 で直っている (#24)。再発しなければ、この行を消す。出典: plan-release-automation.md L77。規模: 小。
- **Web Component の描画を mount に寄せる**: `<skam-renderer>` は mount と別の経路で描く。補正はフォントの読み込みを待たない 1 回だけで、`variablePrefix` でなく `classPrefix` を補正に渡している (バグの可能性)。`innerHTML` に文字列を入れるので、Trusted Types が必須のページでは使えない。mount に寄せて揃えるかを決める。出典: ADR-034 KD7、KD11。規模: 小。

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
- **readingLayerSource の既定の見直し**: 次の破壊的リリースで、profile を指定して `readingLayerSource` を省いたときの既定 (`'readings'`) を見直す。2 回目のフィードバックは `'display'` を既定にするよう求めた。既定のまま出題に使うと、答えがスクリーンリーダーの利用者にだけ渡るためである。同じフィードバックが求めた README の注意は、html-renderer の README の「出題に使うとき」の節に書いてある。出典: plan-consumer-feedback.md L62、ADR-030「リスク R1〜R8 の結果」の R6、利用者のフィードバック 2 回目 (2026-10-20) の 9。規模: 小。
- **'display' の読み上げ層の実機確認**: NVDA (Windows、日本語) と VoiceOver (macOS) で確かめる (未確認)。合格の条件は 2 つある。`習、送り仮名 フ、レ点。` の各語が言葉として発話されること。表示層のルビや返り点が、読み上げ層と重ねて読まれないこと。確かめたら、experimental を外すかを決める。あわせて、注記の無い字が `學。而。時。` のように 1 字ごとに区切られる読み上げが聞きにくくないかを聞き、続く字をつなげる形にするかを決める (利用者の提案、未検証)。出典: plan-consumer-feedback.md L61、ADR-030「リスク R1〜R8 の結果」の R1、利用者のフィードバック 2 回目 (2026-10-20) の 8。規模: 中。

## パーサー

- **空の入力の誤りの文言**: Node 版は、`''` で `XML parse error: invalid doc source`、空白だけの入力で `Empty document` を投げる。ブラウザ版の文言は確かめていない (未確認)。揃えるかを決める。メッセージを変えると利用者のテストに響く。出典: fix/backlog-small-fixes (2026-10-20)。規模: 小。
- **ブラウザ版の構文の誤りのメッセージが長い**: ブラウザ版の構文の誤りのメッセージは、`parsererror` の文全体である。Chromium は `This page contains the following errors:` などの前置きを含み、Firefox は誤りのある元の行を写す (5,000,000 字の 1 行の入力なら、メッセージも同じ長さになる)。前置きを除くか長さで切るかを決める。メッセージを変えると利用者のテストに響く。出典: feat/browser-parser-positions の調査 (2026-10-20)。規模: 小。
- **WebKit の parsererror の文の確認**: ブラウザ版は、Chromium と Firefox の報告の形から構文の誤りの位置を読む。WebKit (Safari) の形は、手元の WSL で WebKit が起動せず確かめていない (未確認)。Chromium と同じ形でなければ、Safari では構文の誤りに位置が付かない。出典: feat/browser-parser-positions の調査 (2026-10-20)。規模: 小。

## レンダラー

- **インラインの style 属性を出さない描画**: 描画の HTML は、ヲコト点の位置 (`token-renderer.ts`) と傍点の形 (`token-renderer.ts`、`render-tree.ts`) をインラインの `style` 属性で出す。`style-src` に nonce だけを使う CSP では、これらが止められて表示が崩れる。CSS 変数やクラスに移すかを決める。出典: ADR-034 KD6。規模: 中。
- **grid baseline 補正の構造的課題 (#2)**: Chromium の補正に構造的な課題がある。補正は `--skam-grid-baseline-fix` と `calibrateGridBaseline()` が担う。Issue は open。出典: #2。規模: 大。
- **highlight の傍線がアキ部分をカバーしない**: `highlight-content` は inline-block で、letter-spacing のアキが box に含まれない。そのため `box-shadow: inset` の傍線がアキ部分に描かれず、途切れて見える。ADR-008 で既知の制約とし、別 ADR で対応するとした。出典: plan-aki-gumi-spacing.md L70、ADR-008「検証 4: エッジケース」。規模: 中。
- **分析結果キャッシュ (DocumentAnalysis) の再利用**: Canvas の縦書きレイアウトで、分析結果 (`DocumentAnalysis`) を再利用するかを決める。現行のコードで再利用されているかは未確認。出典: ADR-018「未決事項（残件）」。規模: 中。
- **highlight の group 走査の最適化**: highlight まわりの group の走査を最適化するかを決める。現行のコードで必要かは未確認。出典: ADR-018「未決事項（残件）」。規模: 中。

## テストと CI

- **手元 (WSL) で VRT が撮影できない**: 手元の headless chromium 145 (Playwright 1.58.0) は `requestAnimationFrame` が呼ばれず、`toHaveScreenshot` が要素の安定待ちで 5 秒のタイムアウトになる (素の `<div>` でも同じ。`--disable-gpu` などの起動の引数でも直らない)。ベースラインは Playwright 公式の Docker イメージで作った (`docker run ... mcr.microsoft.com/playwright:v1.58.0-noble ./node_modules/.bin/playwright test`)。手元の `pnpm test:visual` を動かすか、Docker での実行を script にするかを決める。出典: test/vrt-ref-order (2026-10-20)。規模: 小。
- **CI の VRT の tateten-kaeri-split が揺れる**: PR #37 の CI で、`visual-regression.spec.ts` の `tateten-kaeri-split` が 2 回続けて落ち (354 pixels、ratio 0.03。許容は `maxDiffPixelRatio: 0.01`)、3 回目の再実行で通った。PR #37 は描画を変えていない。同じ時間帯に master の VRT を 2 回流すと、どちらも通った。手元の Playwright 1.58.0 の Docker イメージでは、network ありで master と PR #37 のどちらも通った。network なし (Google Fonts を読めない) では、字が重なりルビが消えた画像になって落ちた。原因は確かめていない (フォントの読み込みの時間の揺れと推測)。2026-10-20 から、`visual-test` が落ちると expected / actual / diff の画像が artifact `vrt-test-results` に 7 日残る。次に落ちたら画像で原因を確かめ、フォントを同梱するかを決める。artifact が実際に上がるかも、そのときに確かめる。出典: PR #37 の CI (2026-10-20)。規模: 小。
- **移行表の機械可読化**: 移行表を機械可読形式 (YAML など) にして、各 README の移行の節を生成する。`migration-table.test.ts` は、README の旧挙動・新挙動・回避策の列が正本と一字一句同じかを検査しない。手編集によるずれを検出できない。出典: plan-practical-readiness.md L103、ADR-028「既知の制約と未実施の確認」。規模: 中。
- **html-renderer の仕様テストの意味論化**: 文字列一致のテストを減らし、意味を検査するテストに置き換える。基盤は ADR-022 と `css-slot-semantics.test.ts` にある。ただし docs/testing/no-test-gap-matrix.md の 4 件はすべて `dual` で、`migrated` は 0 件である。`comprehensive-rendering.test.ts` には、`toContain` などの文字列一致の行が 267 行ある。出典: plan-html-renderer-colocation-and-named-grid-areas.md L295、ADR-020「完了時点で残る作業（Phase3 以降）」。規模: 大。
- **TypeScript 7 系への移行**: このリポジトリを TypeScript 7 系 (native の `typescript` パッケージ) に移す。tsgo (`@typescript/native-preview`) との関係、typescript-eslint などの JS 実装を要る道具の扱いを決める。consumer の検査の `typescript5` (5.9.3) は、利用者の 5 系の代表として残す。出典: 利用者の方針 (2026-10-19)。規模: 中。

## 外部利用

外部利用のロードマップ (1.0 安定化、CJS 対応、CDN、CLI) は #6 で追う。
