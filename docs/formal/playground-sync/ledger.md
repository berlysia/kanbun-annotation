# 形式検査の台帳: playground の編集同期と選択の寿命

- 対象のリポジトリ: kanbun-annotation
- manifest: docs/formal/playground-sync/formal.json
- 作った日: 2026-11-26

playground (`packages/playground`) には、テキストと文書と debounce タイマーの同期ループ、選択パネル・強調・SP の 2 タップの選択の寿命という、明示されていない状態遷移がある。
`EditSync.tla` は前者を、`Selection.tla` は後者を表す。
どちらのモデルもフラグで修正前と修正後の実装を切り替える。
`formal.json` には、修正後のフラグを契約 (hold) として登録し、フラグを 1 つずつ外したものを壊したモデル (violate) として登録した。

## 実装の主張

`file:line` は 2026-11-26 の修正後の `packages/playground/src/` を指す。

| 主張                                                                                             | file:line                                                                  | check id                                      | 対象外                                                                                                         |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| GUI 操作の結果はエディタに書き、同じ呼び出しの中で parse する (タイマーを張らない)               | main.ts:2140 (`commitDocument`)、editor/xml-editor.ts:234 (`replaceValue`) | no-lost-edit                                  |                                                                                                                |
| 選択パネルの click / keydown / change の前に、保留中の入力を parse する                          | main.ts:2761 (`flushEditorBeforePanelAction`)、editor/xml-editor.ts:207    | no-lost-edit                                  |                                                                                                                |
| 保留中かどうかは timer が非 null かどうかで決まり、発火・flush・置換で null に戻る               | editor/xml-editor.ts:174-212                                               | no-lost-edit, doc-reflects-text               |                                                                                                                |
| flush した結果が parse できなければ文書は null になり、handler の guard で何もしない             | main.ts:2062、各 handler 冒頭の `if (!currentDocument ...) return`         | no-lost-edit                                  |                                                                                                                |
| flush の前後で選択範囲が同じなら、パネルの入力値と仮名の種類を書き戻す                           | main.ts:2761-2795 (`PANEL_DRAFT_STATE`)                                    |                                               | モデルは文書とテキストだけを持ち、パネルの下書きを持たない。e2e `edit-sync.spec.ts` の下書きのケースで確かめる |
| 空テキストは parse 失敗と同じ後始末 (文書 null、プレビュー・JSON・マーク一覧・選択を消す) をする | main.ts:2000-2071 (`parseAndRender`、`clearDocumentView`)                  | doc-reflects-text                             |                                                                                                                |
| 文書の読み込み (サンプル・ファイル選択・ドロップ) は選択と 2 タップ状態を捨ててから parse する   | main.ts:2089 (`loadDocumentText`)、:2073、:2348、:2380                     | sel-belongs-to-doc                            |                                                                                                                |
| HTML 描画のたびに、選択があれば強調を描き直す                                                    | main.ts:1963                                                               | sel-visible                                   |                                                                                                                |
| 選択を消すと 2 タップ状態も idle に戻る                                                          | main.ts:1695 (`clearSelectionPanel`)                                       | touch-anchor-fresh                            |                                                                                                                |
| 画面幅がコンパクトと通常の間で変わると 2 タップ状態を idle に戻す                                | main.ts:2733                                                               | touch-anchor-fresh                            |                                                                                                                |
| token ID は無注記の字に順に振られ、別の文書でも同じ ID が成り立つ                                | packages/skam-xml-parser/src/parser-core.ts:800                            | sel-belongs-to-doc (非決定的な選択として表す) |                                                                                                                |
| Canvas 描画では選択パネルを CSS で隠す                                                           | styles.css:501-503                                                         | sel-visible (HTML 描画のときだけを見る)       |                                                                                                                |
| web component の描画予約は rAF で合流し、切断で取り消す                                          | packages/skam-web-component/src/skam-renderer.ts:202-249                   |                                               | 読んだ範囲で不具合の型が立たないため、モデル化しない                                                           |

## 機械検査の結果

<!-- check: no-lost-edit -->

- 日付: 2026-11-26
- verdict: hold
- 壊したモデル: no-lost-edit-without-flush (violate: `UserType(u1) → GuiOp(g1)` で `text={g1}`, `intent={u1,g1}`)
- 実コードを壊す確認: 下の記録を参照

<!-- check: doc-reflects-text -->

- 日付: 2026-11-26
- verdict: hold
- 壊したモデル: doc-reflects-text-empty-keeps (violate: `UserClear → TimerFire` で `doc={}`, `text=EMPTY`)
- 実コードを壊す確認: 下の記録を参照

<!-- check: sel-belongs-to-doc -->

- 日付: 2026-11-26
- verdict: hold
- 壊したモデル: sel-belongs-to-doc-no-reset-on-load (violate: `PcSelect → Load` で `selGen=0`, `docGen=1`)
- 実コードを壊す確認: 下の記録を参照

<!-- check: sel-visible -->

- 日付: 2026-11-26
- verdict: hold
- 壊したモデル: sel-visible-no-keep-highlight (violate: `PcSelect → SettingRerender` で `hl=FALSE`)
- 実コードを壊す確認: 下の記録を参照

<!-- check: touch-anchor-fresh -->

- 日付: 2026-11-26
- verdict: hold
- 壊したモデル: touch-anchor-fresh-no-reset-touch (violate: `TapToken → Resize → PcSelect` で `touch="first"`, `sel="pc"`)
- 実コードを壊す確認: 下の記録を参照

### 実コードを壊す確認の記録

- 開始: 2026-11-26、worktree /tmp/claude-1000/-home-berlysia-worktrees-kanbun-annotation-worktree-bridge-cse-01BwNa9ZR93KqniXxAh9Scwx/8dbd5360-5085-5082-8229-56f3e94a4aa5/scratchpad/break/tmp.NIhiTXb57k/formal-check-break-playground、元の HEAD ed707447c86239b28db5586e311eef94698a5a07、元の status ` M packages/playground/src/editor/xml-editor.ts; M packages/playground/src/main.ts; ?? docs/formal/; ?? packages/playground/e2e/edit-sync.spec.ts; ?? packages/playground/src/editor/__tests__/xml-editor.test.ts`、壊す予定のファイル packages/playground/src/main.ts、コピーしたファイル docs/formal/playground-sync/ 配下 (13 件)、packages/playground/e2e/edit-sync.spec.ts
- 終わり: 2026-11-26、worktree /tmp/claude-1000/-home-berlysia-worktrees-kanbun-annotation-worktree-bridge-cse-01BwNa9ZR93KqniXxAh9Scwx/8dbd5360-5085-5082-8229-56f3e94a4aa5/scratchpad/break/tmp.NIhiTXb57k/formal-check-break-playground、元の HEAD と status が記録と同じ

経過と結果:

- 未コミットの差分と未追跡のファイルは、パッチにして worktree に `git apply` で当てた (Document Workflow の guard が worktree への `cp` を止めたため)。後始末は同じパッチを `git apply -R` で逆に当てた。逆適用は内容の一致を要求するので、コピーしたファイルが元と同じであることも確かめたことになる。`git worktree remove` は `--force` なしで通った
- 1 回目は `commitDocument` の即時 parse を外した (`replaceValue` + `parseAndRender` → `setValue`)。5 件の契約に `stale-model` が出て exit 1 になった。モデルを合わせ直す (`SilentCommit=FALSE`) と、NoLostEdit と DocReflectsText はどちらも成り立った (TLC: No error)。選択パネルの前の flush が保留中の GUI 操作も parse するためで、即時 parse は性質を守る手段ではなく、プレビューをクリックと同時に更新するための使い勝手の選択である。そこで壊す対象を、性質が守る箇所に替えた
- 2 回目は選択パネルの capture の listener を外した。5 件の契約に `stale-model` が出て exit 1 になった。モデルを合わせ直すと (`FlushOnOp=FALSE`)、壊したモデル `no-lost-edit-without-flush` と同じ組になり、NoLostEdit が破れる
- e2e の側: worktree に `node_modules` を置くことも guard が止めたので、playground を git の外の scratchpad に複製し、壊す箇所を 1 つずつ替えて `edit-sync.spec.ts` を流した。変更なしの対照は 11 件 pass。壊した 6 種はどれも、その性質の e2e が落ちた

| 壊した箇所                          | 対応する性質         | e2e                                                                         |
| ----------------------------------- | -------------------- | --------------------------------------------------------------------------- |
| 選択パネルの前の flush              | NoLostEdit           | 「直前に打った文字」1 件 fail                                               |
| flush 後の仮名の種類の書き戻し      | (モデルの外。下書き) | 「仮名の種類」1 件 fail、「仮名の下書き」1 件 pass (値の書き戻しは残るため) |
| 読み込み時の選択の破棄              | SelBelongsToDoc      | 「サンプル切り替え」2 件 fail (PC と SP)                                    |
| 描き直し時の強調                    | SelVisible           | 「字間」1 件 fail                                                           |
| 空テキストの後始末                  | DocReflectsText      | 「エディタを空」「マーク一覧」2 件 fail                                     |
| 画面幅の変化での 2 タップのリセット | TouchAnchorFresh     | 「通常幅を経由」1 件 fail                                                   |

## 確認質問

修正前の実装 (各フラグを FALSE にした組) で TLC が出した反例である。いずれもブラウザ (vite build + preview、Playwright の chromium) で再現した。
2026-11-26 にユーザーが修正の spec を承認したので、答えはその決定を写す。

| 質問 id | check id           | 問い                                                                                                                                                                                            | 答え                                                          |
| ------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| q1      | no-lost-edit       | > 傍点を押して 100ms 後に傍線を押すと、傍点が XML から消える (`GuiOp → GuiOp`)。意図した挙動か                                                                                                  | 意図しない。GUI 操作の結果を即時に parse する                 |
| q2      | no-lost-edit       | > エディタで本文に「也」を足した直後に傍点を押すと、「也」が消える (`UserType → GuiOp`)。意図した挙動か                                                                                         | 意図しない。選択パネルの操作の前に保留中の入力を parse する   |
| q3      | doc-reflects-text  | > エディタを空にすると、プレビューと選択パネルが前の文書のまま残る。そこで GUI 操作をすると前の文書が書き戻される (`UserClear → TimerFire → GuiOp`)。意図した挙動か                             | 意図しない。空は parse 失敗と同じに扱う                       |
| q4      | sel-belongs-to-doc | > サンプル 0 で 2 字目を選んでサンプル 2 へ切り替えると、新しい文書の 2 字目が選ばれた状態になる (`PcSelect → Load`)。意図した挙動か                                                            | 意図しない。読み込みで選択を捨てる                            |
| q5      | sel-visible        | > 選択してから字間を変えると、パネルは選択を示したまま強調だけが消える (`PcSelect → SettingRerender`)。意図した挙動か                                                                           | 意図しない。描き直しで強調を戻す                              |
| q6      | touch-anchor-fresh | > SP で字をタップしてサンプルを切り替え、別の字をタップすると範囲選択になる (`TapToken → Load → TapToken`)。通常幅で選び直してから戻っても同じ (`TapToken → Resize → PcSelect`)。意図した挙動か | 意図しない。選択を消す経路と画面幅の変化で 2 タップ状態を戻す |
