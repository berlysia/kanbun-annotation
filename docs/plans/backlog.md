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
- **判定 (K11 / K12 / K15) と待機の定数の見直し**: 次のリリースの証拠の `waits.json` (待ちごとの回数、経過秒、段 11 の周ごとに残った観察) を読んで、`scripts/release-after-push.ts` の `WAIT` の定数と、K11 / K12 / K15 の判定を見直す。出典: ADR-031「Followup」の 1。規模: 小。
- **attestation の bundle の署名の検証**: 段 11 は SLSA provenance の subject の sha512 を log の integrity と照合するが、bundle の署名 (sigstore の証明書の連鎖と透明性ログ) と、署名した workflow の identity は検証しない。registry か通信の途中が同じ digest の偽の bundle を返すと区別できない。検証には `sigstore` などの依存と、identity の期待値 (workflow のパス、ref) の設計が要る。出典: 束 C の 3。規模: 中。
- **npm stage view の出力の確認**: 手作業の手順は、integrity の照合に `npm stage view <stage-id>` を使う。0.2.0 では使っておらず、出力の書式は未確認である。`npm stage list` の書式は確かめた。releasing.md の冒頭の注記も、確かめた範囲に合わせて直す。出典: ADR-029「未確認の事項」と「結果」。規模: 小。
- **E409 の実際の stderr の確認**: `automated review hasn't finished` の E409 は、shiori の手順書の記録しかなく、実物を見ていない (未確認)。出典: ADR-031「未確認の事項」。規模: 小。
- **tag push の run の headBranch の確認**: tag の push の run の `headBranch` に tag 名が入るかを見ていない (未確認)。いまは表示にとどめている。出典: ADR-031「未確認の事項」。規模: 小。
- **承認済み stage が stage list に残るかの確認**: approve した後の stage が `stage list` に残るかは、0.2.0 の記録にない (未確認)。出典: ADR-031「未確認の事項」。規模: 小。
- **approve 後の npm view の反映遅延の確認**: approve の後に `npm view` へ反映されるまでの長さは、0.2.0 の記録にない (未確認)。出典: ADR-031「未確認の事項」。規模: 小。
- **scope の registry 設定・artifact 名の衝突・log の保持期間の確認**: 次の 3 つは未確認である。`npm stage` が scope の registry 設定を参照するか。validate を re-run したときに artifact が同名で衝突するか。job の log の保持期間 (R7)。出典: ADR-031「未確認の事項」。規模: 小。

## Web Component

- **attribute-validation.test.ts の flaky なテスト**: 2026-10-15 に `pnpm test` で 1 回だけ落ちた。落ちたのは `renders vertically and reports writing-mode once` である。2026-10-19 に 120 回流したが、再現しなかった。内訳は、8 コアすべてに CPU 負荷をかけた `attribute-validation.test.ts` が 100 回、`turbo run test:run --force` が 20 回である。vitest 4.0.18、happy-dom 20.3.9。失敗率が 2.5% (3/120) 以上なら 95% の確からしさで検出できたので、それ未満の失敗率は否定できない。候補だった happy-dom の MutationObserver の件 (GC で通知を落とす) は 20.14.6 で直っている (#24)。再発しなければ、この行を消す。出典: plan-release-automation.md L77。規模: 小。

## データモデルと仕様

- **明示的な改行の ADR**: ブロック内の強制改行を決める。ブロック先頭の kaeri が不正であることは、ADR-028 の後も変わらない。出典: plan-practical-readiness.md L90。規模: 中。
- **重複した kaeri の扱い**: 同じ位置に重複した kaeri の扱いを、仕様が決めていない。出典: plan-practical-readiness.md L91。規模: 中。
- **範囲の重なりと交差の XML 表現**: 範囲の重なりと部分的な交差は、JSON では表現できるが、XML では `unsupported` になる。出典: plan-practical-readiness.md L93、ADR-028「既知の制約と未実施の確認」。規模: 大。
- **JSON Schema の配布と未知の mark type の保持**: JSON Schema を配布し、未知の mark type を保持して読み込む。出典: plan-practical-readiness.md L93、ADR-028「既知の制約と未実施の確認」。規模: 中。
- **parse の既定 id を文書順にする (#15)**: `parse` の既定の id を、文書の順で決まる値にする。破壊的変更で、`xml:id` との衝突回避が要る。出典: plan-consumer-feedback.md L66、#15。規模: 中。
- **出題対象の印 (#14)**: マーク単位で「設問の答え」を表す仕様を決める。`ext` の約束事にするか、マークの属性にするかを選ぶ。出典: plan-consumer-feedback.md L63、#14。規模: 中。
- **竪点のグループからはみ出す読みの範囲 (#16)**: はみ出す読みの範囲は、先頭の字の読みとして出る。2 回目の読みが無い再読文字は、読み仮名として読まれる。扱いを決める。出典: plan-consumer-feedback.md L64、ADR-030「既知の制約」、#16。規模: 小。
- **readingLayerSource の既定の見直し**: 次の破壊的リリースで、profile を指定して `readingLayerSource` を省いたときの既定 (`'readings'`) を見直す。2 回目のフィードバックは `'display'` を既定にするよう求めた。既定のまま出題に使うと、答えがスクリーンリーダーの利用者にだけ渡るためである。同じフィードバックが求めた README の注意は、html-renderer の README の「出題に使うとき」の節に書いてある。出典: plan-consumer-feedback.md L62、ADR-030「リスク R1〜R8 の結果」の R6、利用者のフィードバック 2 回目 (2026-10-20) の 9。規模: 小。
- **'display' の読み上げ層の実機確認**: NVDA (Windows、日本語) と VoiceOver (macOS) で確かめる (未確認)。合格の条件は 2 つある。`習、送り仮名 フ、レ点。` の各語が言葉として発話されること。表示層のルビや返り点が、読み上げ層と重ねて読まれないこと。確かめたら、experimental を外すかを決める。あわせて、注記の無い字が `學。而。時。` のように 1 字ごとに区切られる読み上げが聞きにくくないかを聞き、続く字をつなげる形にするかを決める (利用者の提案、未検証)。出典: plan-consumer-feedback.md L61、ADR-030「リスク R1〜R8 の結果」の R1、利用者のフィードバック 2 回目 (2026-10-20) の 8。規模: 中。

## パーサー

- **playground の例の `skam:tokenize`**: playground の例の 2 つが `<skam:meta><skam:tokenize strategy="char"/></skam:meta>` と書く。仕様に無い要素で、parser は読まない。`tokenization="char"` に直すか消す。出典: feat/grapheme-tokenize の調査 (2026-10-21)。規模: 小。
- **playground の選択と書記素**: playground は選択を token の添字で保つ。IVS や結合文字を含む入力で、編集の前後に選択がずれるかを確かめる。出典: ADR-042 (2026-10-21)。規模: 小。

- **誤りの種類を構造で持つ**: parser の誤り (`SKAMXMLParseError`) に種類 (`kind`) を足し、利用者がメッセージの文言に頼らずに誤りを判別できるようにするかを決める。メッセージの文言は互換の対象外 (2026-10-21 に README に書いた)。parser の公開 API の追加になる。出典: fix/backlog-batch-a (2026-10-21)。規模: 中。
- **WebKit の parsererror の文の確認**: ブラウザ版は、Chromium と Firefox の報告の形から構文の誤りの位置を読む。WebKit (Safari) の形は、手元の WSL で WebKit が起動せず確かめていない (未確認)。Chromium と同じ形でなければ、Safari では構文の誤りに位置が付かない。出典: feat/browser-parser-positions の調査 (2026-10-20)。規模: 小。

- **1 つのブロックの字が多いと parse が落ちる**: 1 つのブロックに 20 万字以上の本文を書くと、parser が `RangeError` (スタックあふれ) で落ちる。10 万字では通った (2026-10-21 に測った)。`maxInputLength` (500 万) の範囲の入力で、ブロックの token の id を配列に入れる所 (`push(...ids)`) が原因とみられる。出典: feat/grapheme-tokenize の計測 (2026-10-21)。規模: 小。

## レンダラー

- **grid baseline 補正の構造的課題 (#2)**: Chromium の補正に構造的な課題がある。補正は `--skam-grid-baseline-fix` と `calibrateGridBaseline()` が担う。Issue は open。出典: #2。規模: 大。
- **範囲のルビと highlight が重なると、最後の字を 2 回描く**: html-renderer で、2 字以上の範囲の yomigana と highlight が重なると、ルビの範囲の最後の字が 2 回出る。A〜E の文書で、ルビを B〜C、highlight を B〜D に置くと、本文は `ArBCCDE` になる (ルビだけなら `ArBCDE`)。VRT の `emphasis-highlight.png` も「重要要語」と描いている。出典: 束 C の 1 の T1。規模: 中。
- **ルビや傍点つきの字が highlight の中で傍線とずれる**: `spacing: 'half'` の VRT (`highlight-spacing-*.png`) で、ルビつきの字と傍点つきの字が、横書きでは傍線より下に、縦書きでは傍線から離れて左に描かれる。spacing の無い `emphasis-highlight.png` でも字の位置がずれている。原因は調べていない。#2 (grid baseline の補正) と関係するかも未確認。出典: 束 C の 1 の T1。規模: 中。
- **html の字の描画を AIR のスロットに寄せる**: html-renderer は AIR を使いつつ、`renderToken` で saidoku、okototen、傍点、送り仮名などを索引 (`createMarkLookup`) から引き直している。AIR と html が注記を別々に解決するので、html が `tokens[]` の順序で範囲を判定していた不具合のような食い違いが起きうる。html が AIR の字ごとのスロットだけを読む形にする。出典: 束 C の 2 の plan の白紙案。規模: 大。
- **描画のメモリ使用量の追跡**: 描画の時間は CI のテスト (10 s の上限) で見ているが、メモリは見ていない。`createMarkLookup` の索引は範囲の注記が覆う字の数に比例し、5000 字の block 全体を覆う highlight 200 個の文書で、html の描画で増える RSS が 22 MB から 70 MB になった (索引のヒープは 10.4 MB)。普通の文書 (5000 字、10 字ごとに 4 字の highlight) では 20 MB と 22 MB で変わらない。メモリの使用量をどう測って追うかを決める。出典: 束 C の 2。規模: 中。

## テストと CI

- **baseline の JS の検査が chunk を見ない**: `pnpm baseline` の JS の検査は各パッケージの `dist/index.js` だけを写して検査する。skam の `dist/index.js` は chunk (`dist/src-*.js`) を再 export するだけなので、skam の本体のコードは検査されない。2026-10-21 に `Intl.Segmenter` (Baseline の同梱データでは low) を足したが、検出されなかった。canvas の IIFE には入っているが、検査の対象は ESM の `dist/index.js`。出典: feat/grapheme-tokenize (2026-10-21)。規模: 小。

- **書き下し文を作る機能と、KanbunKundoku との照合のテスト**: SKAM の文書から書き下し文 (返り点で読む順を組み、送り仮名と添え仮名をつないだ文) を作る機能が無い。作ったら、KanbunKundoku の `japanese_translation` と突き合わせ、当てはめの規則と renderer の訓読の正しさを確かめる。出典: feat/kundoku-samples の調査 (2026-10-21)。規模: 大。
- **古事記の bench で master と索引化の後を比べる**: `pnpm bench` の古事記の文書は、索引化 (`createMarkLookup`) の後の時間しか測っていない。master の html は 5000 字で 70 秒かかり、全巻 (42,387 字) では数時間かかる見込み (外挿、未確認) なので、上巻の先頭 2000 字で両方を比べる。出典: perf/kojiki-bench の plan の T4。規模: 小。
- **全巻を 1 文書にすると字あたりの時間が増える**: 古事記の bench で、合成の注記つきの全巻 (42,387 字) の AIR は 632〜699 ms で、同じ字と注記を 3 巻に分けた文書の和 (約 250 ms) の約 2.6 倍だった。html と canvas も同じ傾向。全巻だけを単独で流しても変わらなかったので、実行の順や warmup の影響ではないとみている。原因は調べていない (未確認)。出典: perf/kojiki-bench の計測 (2026-10-21)。規模: 中。
- **「侣」が下線の範囲の後ろにずれて見える**: 古事記の上巻の「臣安萬侣言」で、「侣」(U+4FA3、「侶」の簡体字形) が下線の範囲の後ろにずれて描かれた (Docker の Chromium と Noto Serif JP で確かめた)。token の順と html の字の並びは正しい。Noto Serif JP に字形が無く、別の字体で描かれている可能性がある (推測、未確認)。出典: feat/kojiki-pages の調査 (2026-10-21)。規模: 小。
- **CI の VRT も手元と同じ Docker イメージで動かすか**: 基準画像は手元の Docker (`pnpm test:visual:docker`) で撮り、CI は ubuntu-latest に `playwright install --with-deps chromium` を入れて比べる。撮る環境と比べる環境が違う。CI も同じイメージで動かすかを決める。VRT の揺れ (下の行) との関係は確かめていない。出典: fix/backlog-batch-a (2026-10-21)。規模: 小。
- **CI の VRT の tateten-kaeri-split が揺れる**: PR #37 の CI で、`visual-regression.spec.ts` の `tateten-kaeri-split` が 2 回続けて落ち (354 pixels、ratio 0.03。許容は `maxDiffPixelRatio: 0.01`)、3 回目の再実行で通った。PR #37 は描画を変えていない。同じ時間帯に master の VRT を 2 回流すと、どちらも通った。手元の Playwright 1.58.0 の Docker イメージでは、network ありで master と PR #37 のどちらも通った。network なし (Google Fonts を読めない) では、字が重なりルビが消えた画像になって落ちた。原因は確かめていない (フォントの読み込みの時間の揺れと推測)。2026-10-20 から、`visual-test` が落ちると expected / actual / diff の画像が artifact `vrt-test-results` に 7 日残る。次に落ちたら画像で原因を確かめ、フォントを同梱するかを決める。artifact が実際に上がるかも、そのときに確かめる。出典: PR #37 の CI (2026-10-20)。規模: 小。
- **html-renderer の仕様テストの意味論化**: 文字列一致のテストを減らし、意味を検査するテストに置き換える。基盤は ADR-022 と `css-slot-semantics.test.ts` にある。ただし docs/testing/no-test-gap-matrix.md の 4 件はすべて `dual` で、`migrated` は 0 件である。`comprehensive-rendering.test.ts` には、`toContain` などの文字列一致の行が 267 行ある。出典: plan-html-renderer-colocation-and-named-grid-areas.md L295、ADR-020「完了時点で残る作業（Phase3 以降）」。規模: 大。
- **ソースとテストの型の環境を分ける**: TypeScript 7 では `types` の既定が `[]` だが、ブラウザ向けのパッケージのソースにも node の型が入る (html-renderer と playground は vitest の型を経由した推移的な `@types/node`、skam、xml-parser、xml-stringify はテストのファイルの `/// <reference types="node" />`)。テスト用の tsconfig を分けて、ソースで node の API を使うと型の誤りになるようにする。出典: ADR-037 の段 4。規模: 中。
- **fallow の試用**: 未使用の検出の fallow (Rust、Oxc。TypeScript も Node も要らない) を knip と並べて走らせ、設定を詰める。`knip.config.ts` は自動で移せず、設定なしでは Web Component のライフサイクルの関数や canvas-renderer のテストを未使用と判定した。出典: ADR-037 の却下した案。規模: 中。
- **stylelint の代わり**: TS の中の CSS の構文と Baseline を、TypeScript の JS API なしで検査する方法を探す。今の stylelint の `postcss-styled-syntax` は TypeScript の JS API で TS を読み、ADR-037 の例外になっている。出典: ADR-037 の例外。規模: 中。

## 外部利用

外部利用のロードマップ (1.0 安定化、CJS 対応、CDN、CLI) は #6 で追う。
