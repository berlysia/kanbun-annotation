---
status: Complete
plan: plan-consumer-feedback.md
---

# ADR-030: 利用者フィードバックへの対応 (出題用途の非表示・読み上げ・エラー位置)

実装計画: [Plan](../plans/plan-consumer-feedback.md)

## コンテキスト

npm の 0.1.0 を教材ビューアに組み込んだ利用者から、17 項目のフィードバックを受けた (2026-10-15)。出題画面では、注記の一部を隠して漢文を表示する。

master (`8a32077`、0.2.0 は未公開) で 17 項目を確かめた結果は次のとおり。

| 判定                        | 項目                                                                                                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| master で解消済み (ADR-028) | #4 読み上げ層の `aria-label`、#6 `ParseOptions.validate`、#8 `classPrefix` の注入。#1 xmldom は 0.8.15 に上げ済みで、固定の指定だけが残っていた                                              |
| 設計判断の要らない小修正    | #3 `buildRangeInfo` が置き字・助字を表示設定で絞らない、#5 `rubyMethod` の既定値の JSDoc、#7 Web Component の属性の一部、#12 `extractXmlFromScriptElement` の非公開、#17 ADR の `check:deps` |
| 設計判断が要る              | #2 表示設定の部分指定、#9 表示設定に応じた読み上げ、#10 エラーの位置、#13 メディアタイプ、#14 出題対象の印、#15 id の既定、#16 竪点からはみ出す範囲                                          |

最も重いのは #2 と #9 で、どちらも出題で答えが漏れる経路だった。

- `{ kaeriten: true, okurigana: false }` は full に重なり、指定していない注記がすべて出る。`{ okurigana: 'false' }` や綴り違いのキーも、黙って表示側に倒れる。
- 読み上げ層は表示設定を見ず、読み下しの全文を出す。スクリーンリーダーの利用者にだけ答えが渡る。

報告に無かった事実も 2 つ見つかった。ADR-009 の例の名前空間が `urn:skam` (実装と仕様は `urn:skam:1`)。部分指定を full に重ねる処理は、canvas-renderer にもある。

## 利用者の決定 (2026-10-15)

- 範囲は「小修正 + #9」。#9 は experimental として実装する。
- #2 の重ね方と #15 の id の既定は変えない。#2 は追加の形で受け付け、#15 は文書で案内する。
- 設計判断のうち、今回決めるのは #13 と #10。#14 と #16 は Followup に回す。
- profile の値は常に厳密に検証する。未知のキーと真偽値でない値は、`render()` では TypeError、Web Component では描画しない。0.2.0 の M12 (不正なオプションは TypeError) の続きとして扱う。
- Web Component の `include-reading-layer` が不正な値のときは描画しない。
- ワークツリー (`.git/` の下) で vitest が落ちる件は、別のコミットで直す。
- profile の TypeError のメッセージに、未知のキー名と値 (64 文字で切り詰め) を含める。ADR-028 の「メッセージに渡された値を含めない」方針の例外とする (実装の後に判明し、利用者が今のままを選んだ)。

## 検討した選択肢

### 差分最小案

- #9: 読み上げ層に profile を渡し、表示層の `aria-hidden` を外してルビ等を読ませる。
- #2: README に「部分指定は full に重なる」と書くだけにする。
- #7: 属性の解析関数に `console.warn` を足す。

**却下の理由**:

- #9 の案では、返り点の記号 (U+3191〜U+319F) が記号名で読まれるか、無音になる。NVDA の記号辞書と CLDR ja に、この記号の項目が無い。さらに、表示の順と読む順がずれる。
- #2 の案では、プリセットから 1 項目だけ外す指定を、ほかの注記を出さずに書く手段が無いままになる。
- #7 の案では、既存の `skam-error` と並ぶ 2 つ目の通知経路ができる。

### 白紙案

ゼロから作るなら、次の 3 点を選ぶ。

1. 表示と読み上げを、1 つの中間表現 (AIR) から導く。
2. 表示設定は既定を明示した完全な値にし (`base` を必須)、境界で厳密に検証する。
3. id を決定的にし、DOM へ描く mount 関数を用意する。

1 は採用した。2 のうち厳密な検証は採用し、`base` の必須化は既存の部分指定が壊れるので見送った (部分指定が full に重なる経路は accepted gap)。3 は利用者の決定と、0.2.0 に既に入っている破壊的変更の量 (`.changeset/plan-3-renderers.md` の 6 項目) から見送り、README で案内した。

## 決定

- **K1 読み上げテキストは AIR から 2 段で作る (experimental)**
  - `describeAnnotationIR(air)` は言語に依存しない構造 (単位と注記の判別共用体) を返す。
  - `formatAccessibleText(blocks, labels?)` は生のテキストを返す。単位の中は読点、単位の後に句点を置く。
  - ラベル関数が空文字・例外・string 以外を返した注記は出さない。
  - 置き場所は `@kanbun-skam/skam/rendering`、日本語の既定の言葉は `DEFAULT_ACCESSIBLE_LABELS` として別ファイルに置く。
- **K2 注記の順序と既定の言葉**
  - 単位の中は、読み → 再読 → 送り仮名 → 添え仮名 → 返り点 → 句読点 → 置き字 → 助字 → 傍点 → ヲコト点 → 注 の順とする。
  - 出すのは AIR の slots にある値だけ。AIR は profile で絞った「画面に見えるもの」なので、画面と読み上げが一致する。
  - 再読文字は `saidokuUnder` / `saidokuOkuri2` の有無で判定する。
  - 竪点の区切りは、本文の無い単位とする。
- **K3 html-renderer と Web Component への接続**
  - `readingLayerSource: 'readings' | 'display'` (既定は `'readings'` で非破壊) と `accessibleLabels` を足した。Web Component には `reading-layer-source` 属性を足した。
  - `'display'` は readings も白文も参照しない。空なら読み上げ層を出さない。
  - labels は入口で 1 回だけ検証・正規化し (null プロトタイプの凍結コピー)、描画はそのコピーだけを使う。
  - 読み上げ用の AIR は、表示層と共有せずにもう 1 回作る。表示層の戻り値と層の境界を変えないため。
- **K4 表示設定を skam/rendering に一本化し、常に厳密に検証する**
  - `RENDER_PROFILES`・`resolveRenderProfile`・`RenderProfileInput`・`RenderProfileName` を追加した。この 4 つは experimental ではなく、安定した API として 0.2.0 で出す。
  - 入力は `Partial<RenderProfile>` (full に重なる) か `{ base, overrides }` の排他。
  - own enumerable の string キーだけを 1 回ずつ読み、13 キーを明示的に写した凍結した新しい object を返す。spread で合成しない (`__proto__` 対策)。
  - html と canvas の `PROFILES` は、凍結した `RENDER_PROFILES` の別名として残す (deprecated にしない)。
- **K5 Web Component の属性**
  - `writing-mode` と `copyable` の不正は、既定値 (copyable は有効な語) で描いて通知する。
  - 注記を隠す属性 (`profile`、`reading-layer-source`、`include-reading-layer`) の不正は、描画しない (fail closed)。既定値に戻すと、隠すつもりの注記が見える側に倒れるため。
  - 属性を外したときは「隠す意図なし」として既定で描く。
- **K6** `buildRangeInfo` も置き字・助字を profile で絞る (#3。K1 の前提)。
- **K7 エラーの位置** (#10、Node 版のみ)
  - parser が投げる `SKAMXMLParseError` には、要素の位置を付ける。
  - `validate` の失敗では、`ValidationError` に任意の `line` / `column` を足す。parser は、作った token・mark・block の object から要素の位置への `WeakMap` を持ち、path の先頭で引く。id でなく同一性で引くので、重複 id や自動採番の影響を受けない。
- **K8 文書で直すもの**
  - mount の手順 (#11)、`createSequentialIdGenerator` の案内 (#15)、`rubyMethod` の既定値の誤記 (#5)。
  - ADR-019 / 021 / 027 の `check:deps` への注記 (#17)。
  - 出題に使うときの手引き (README)。
- **K9 メディアタイプ** `application/vnd.berlysia.skam+xml` を、SKAM-ML-draft §3.3 に規範として書いた (#13)。
  - 0.1.0 の tarball の `dist/` (`chunk-NXVDX5VV.js` と `index.d.ts`) に、この文字列があることを確かめた。
  - IANA には登録していない。版は名前空間 `urn:skam:1` で表す。
- **K10** `extractXmlFromScriptElement` を web-component の index から experimental で公開した (#12)。
- **K11** `@xmldom/xmldom` を `^0.8.15` にした (#1)。lockfile は 0.8.15 のまま。0.x の `^` は 0.8 系に留まるので、ADR-028 の「0.9 は見送る」と矛盾しない。
- **K12** vitest の `server.fs.deny` から `**/.git/**` を外した (html-renderer、web-component。playground は `VITEST` のときだけ)。Vite の既定が `.git/worktree/` の下のテストファイルを拒んでいたため。

## spec からの訂正と、plan の外で行った変更

- profile の TypeError のメッセージに値を含める点は、ADR-028 の方針の例外。`render-options.ts` の冒頭のコメントに、その旨を書いた。Web Component の `include-reading-layer` の不正値のメッセージも、切り詰めた値を含む。新しい `readingLayerSource` / `accessibleLabels` のエラーは、値を含めない。
- plain object の判定は、「プロトタイプの連鎖に own の `constructor` を持つ object が無い」とした。`Object.create({ base })` を full とする計画のテストと矛盾しないため。Date とクラスのインスタンスは拒否する。
- `rubyMethod` の誤記は、計画の 3 か所に加えて `styles.ts` と `CSSOptions` の JSDoc でも直した。
- `escapeHtml` は `'` を `&#x27;` にする (計画は `&#39;` と書いていた)。
- 未実施: html の `RenderProfileInput` を canvas の引数に渡す型テスト (canvas は html に依存しない)。両パッケージの `PROFILES` が `RENDER_PROFILES` と同一参照であることは確かめた。

## 影響

### ポジティブ

- `profile: { base: 'learningBasic', overrides: {...} }` と `readingLayerSource: 'display'` で、画面と読み上げ層の両方から、隠した注記が消える (`學。而、置き字。時。習、レ点。之。`)。
- 綴り違いや真偽値でない profile が、黙って表示側に倒れなくなった。
- 手で書いた SKAM-ML のエラーに、行と列が付く (Node 版)。

### ネガティブ・利用者への影響

- 移行表 M27〜M37 (`docs/migration-0.1-to-0.2.md`) のとおり。0.1.x で描けていた不正な profile は、0.2.0 で TypeError か非描画になる。`PROFILES` は凍結され、型は readonly になる。

### 既知の制約

- 保証するのは、画面と読み上げ層 (`'display'` のとき) だけ。HTML ソースや `<script>` 内の SKAM-ML からは元の注記を取れる。
- 既定の `'readings'` は、隠した注記を読み下しとして読み上げる (互換のため)。
- 部分指定はキーを書き忘れると full 側に倒れる。README で `base` の形を勧めている。
- Web Component の `profile` 属性を外すと、full で描かれる。
- 竪点のグループからはみ出す読みの範囲 (#16) は、先頭の字の読みとして出る。2 回目の読みが無い再読文字は、読み仮名として読まれる。
- ブラウザ版の parser は位置を返さない。

### リスク R1〜R8 の結果

| リスク                                      | 結果                                                 |
| ------------------------------------------- | ---------------------------------------------------- |
| R1 実機のスクリーンリーダーでの発話         | 未確認。experimental にし、Followup に記録した       |
| R2 竪点からはみ出す範囲                     | テストで固定し、README に書いた                      |
| R3 厳密化で 0.1.x の入力が描けなくなる      | 移行表に経路ごとの行を足した (M28〜M31、M33)         |
| R4 再読文字の判定                           | テストで固定し、README に書いた                      |
| R5 ソースからの取得                         | README の出題の手引きに、保証の範囲として書いた      |
| R6 既定の `'readings'`                      | 互換のため残した。既定の見直しを Followup に記録した |
| R7 属性を外すと full                        | README に書いた                                      |
| R8 すべての注記が出ないと読み上げ層が出ない | JSDoc に書き、テストで固定した                       |

## 根拠の計測

- 17 項目の検証は、3 つの subagent がコードを読み、一部は parser を build して実行した。メインループで #1 #2 #3 #4 #6 を再確認した。
- K12: 本体のチェックアウトでは html-renderer の 1,720 件が通り、ワークツリーでは `Cannot find module` で落ちた。`**/.git/**` を外すと、ワークツリーでも通った。Vite 6.3.4 と 7.3.1 の既定の `server.fs.deny` は同じだった。

## 参考

- 移行表: [docs/migration-0.1-to-0.2.md](../migration-0.1-to-0.2.md) の M26〜M37
- 関連する ADR: [ADR-028](adr-028-practical-readiness.md) (0.2.0 の厳格化)、[ADR-009](adr-009-web-component.md) (Web Component)、[ADR-021](adr-021-phase3-shared-annotation-ir.md) (AIR)
