---
status: Complete
---

# ADR-028: ライブラリ群の実用化 (データ欠落・入力安全性・利用者契約)

実装計画: `git show f4700b92957075f4763eadc5ccbfd467d157c866:docs/plans/plan-practical-readiness.md`

## コンテキスト

2026-10-15 の状況調査で、公開 6 パッケージ (`skam`、`skam-xml-parser`、`skam-xml-stringify`、`skam-html-renderer`、`skam-canvas-renderer`、`skam-web-component`) の「コードの構造と既存テストは堅いが、外部の入力と外部の利用者に対する契約が足りない」ことが分かった。調査の時点で、build / typecheck / lint は成功し、1,545 件のテストがすべて通っていた。

### P0 (採用を阻害するもの)

- **parser が本文を黙って落とす**: 全角空白 (`\s` による除去) と CDATA。SKAM-ML-draft §6.2 は U+3000 を意図的な空白と定めており、挙動が仕様と逆だった。
- **XML の往復で、検証を通る注記が黙って消える**: 重なる yomigana と okurigana、ブロック先頭の kutoten / ref、部分交差する範囲、複数 token の okimoji / joji / okototen / saidoku、content だけの ref、空ブロック。
- **HTML 注入**: `render()` は validator を呼ばない。JSON の `kaeri.value`、`emphasis.style`、`classPrefix` と、web-component の `class-prefix` がそのまま HTML / CSS に入った。

### P1 (実用化の前に解消したいもの)

- 読み層 (yomiage / kakikudashi) がない文書は、本文が支援技術から見えない。
- Canvas が公開している機能と実装が乖離している (`writingMode: 'horizontal'` は必ず例外、okototen を描かない、`autoSize` が何もしない)。
- `ParseOptions.validate` が使われていない。名前空間を検証しない。エラーに行・列がない。validator が空の text、重複 ID などを通す。
- ref の番号が `tokens[]` の配列順に依存する (SKAM は配列順を無意味と定めている)。
- README の例が 4 パッケージで動かない。ESM 専用であることと SSR の制約が書かれていない。`@xmldom/xmldom` 0.8.11 に既知の脆弱性 15 件。

### 利用者の規模

npm API で、6 パッケージとも月 7〜10 ダウンロード (2026-09-13〜10-12)。0.1.0 の公開は 2026-03-11。影響を受ける利用者はごく少ない。この観測が、厳格化を既定にする判断 (K1、K2) の根拠になっている。

## 検討した選択肢

### 差分最小案

指摘を 1 件ずつパッチで直す (kaeri の value に `escapeHtml` を足す、空白の正規表現を絞る、`console.warn` を戻り値の警告に変える、README を手で直す)。10 か所程度で済む。

**却下の理由**: 欠落とエスケープ漏れを検出する仕組みが残らず、同種のバグが再発しても気づけない。CI で検証しない README は、またずれる。

### 白紙案 1〜3 (採らなかった部分)

白紙設計は 4 点からなる。1 JSON Schema を唯一の正にして型と validator を生成する、2 XML を無損失の交換形式にする、3 自動エスケープのタグ付きテンプレートで HTML を生成する、4 README の例を独立ファイルとして型検査する。4 は採用した (K9 の doctest)。1〜3 は次の理由で採らなかった。

| 案                             | 却下の理由                                                                                                                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 JSON Schema から生成         | TS 以外の利用者がいる証拠がない。既存の validator には 516 件のテストがある。型と検証のずれは K3 で直す。生成方式への移行は followup                                                                             |
| 2 無損失 XML (stand-off)       | 利用者の決定 (2026-10-15) と、仕様上の位置づけ (SKAM-ML-draft §1: XML は編集用のソース) による。表現できないものは `unsupported` として列挙し、将来の拡張候補を見えるようにした。JSON を正規形にすれば欠落しない |
| 3 自動エスケープのテンプレート | 規模の問題。html-renderer の文字列補間は 605 か所 (うち 342 か所は CSS 生成の `styles.ts`)、出力の同一性を確かめるテストが 452 件ある。全面書き換えの代わりに K4 の 2 段で担保した                               |

案 3 の代替 (K4): (a) 全フィールドを型から網羅した注入文書による性質テスト、(b) 今回触る補間箇所のブランド型 (`SafeHtml` / `SafeCssValue`、内部型で非公開)。全補間への lint 制限は、oxlint に構文セレクタで補間を制限するルールがなく、ツールを足すことになるため行わなかった。(a) の網羅で (b) の穴を補う。

### reframe の経緯 (spec のレビューは Round 11 に到達)

plan-1 の実装後に、内容モデルの退行と漏れが見つかった (Round 8〜10)。レビューのたびに新しい事例が出て収束しなかった。review-reframer の診断は、内容モデルの正本が spec / plan / draft / 実装の 3〜4 か所に散らばり、spec が事例を列挙する形になっていた、というものだった。

利用者の決定 (Round 10) で次のように改めた。

- 内容モデルの正本を SKAM-ML-draft §7.0 の表 1 つにする。spec と plan は表を参照するだけにする。
- 完全性の判定を、性質テストによる受入基準 (K1') に移す。新しい失敗事例は、生成器が見つけた反例として扱い、最小例をテストに加えてから直す。

## 決定

### K1: 欠落の 2 分類と、既定でエラーにする契約

- `stringify` は既定で、欠落を全件 `SKAMXMLStringifyError.losses` に集めて投げる。`lossy: true` では欠落した要素を除いた XML を返し、`onLoss` で 1 件ずつ通知する。`console.warn` は廃止した。
- 欠落は 2 分類 (`category` は閉じた集合。追加は major 変更として扱う)。
  - `unrepresentable`: XML で表現しないことが確定しているもの。将来の拡張候補ではない。
  - `unsupported`: 現行の SKAM-ML v0.1 に記法がなく、将来の仕様拡張で表現しうるもの。
- 検出と変換は 1 本の経路で行う。要素を出力できなかったその場で `losses` に積む。検出だけを別関数で事前に走らせると、検出は落とさないが変換では落ちる、という食い違いが起きる。
- 入れ子形 (`yomigana` の中の `kun`) は、範囲 yomigana と単字 kun が実際に重なるときだけ出力する。旧 parser による誤読 (R6) の範囲を最小にするため。
- 往復の完全性は、性質 (a)(b)(c) と K2a の固定テストがすべて通ることで判定する (K1')。
  - (a) `lossy: true` の出力は strict な parse を必ず通る。
  - (b) parse 結果は、元の文書から欠落した mark を除いたものと意味が同値である。
  - (c) 内容モデルの表に沿って生成した SKAM-ML は、parse → stringify で losses が 0 件になる。(b) だけでは基準が stringify 自身の losses になり、過剰な欠落報告を見逃すため、独立した生成器で (c) を置いた。
- 欠落として扱わないもの: token / mark の ID の再生成 (ADR-003 の設計)。block と ref の `xml:id` は保持される。

### K2: parser の厳格化と、内容モデル・名前空間の方針

- 無視する空白は U+0009 / U+000A / U+0020 / U+000D だけにする (U+000D は SKAM-ML §6.2 に追記)。U+3000 は token になる。CDATA は本文として token 化する。
- **内容モデル**: 規範は SKAM-ML-draft §7.0 の表 1 つ (K2a)。`SKAM_ML_CONTENT_MODEL` 定数は、表のうち子に制約がある行を字句どおりに転記したもの (`@experimental`)。parser と stringify が同じ値をそれぞれ export し、一致を integration-tests で検査する。draft の表と定数の突き合わせテストも置いた。
  - 生成器の性質テストは表を前提に動くため、表自体の誤りは捕まえられない。表の行ごとに受理と拒否を 1 件以上置いた固定テストで補う。固定テストと表が食い違ったら表を疑い、spec と draft を直す。
- **stringify の判定規則** (K2b): 部分交差を除去してから、祖先と子孫のすべての組を表と照合する。違反があれば常に外側を出力せず `UNNESTABLE_OVERLAP` で報告する。外側を落としても残った要素どうしの関係は変わらないので、走査は 1 回で固定点に達する。
- **名前空間**: ルートが `urn:skam:1` 以外ならエラー。body 内の要素は `namespaceURI` で照合する。
  - SKAM の名前空間の未知の要素は、§10 に従って無視し、`onWarning` (`UNKNOWN_ELEMENT`) で通知する。
  - **他の名前空間の要素はエラーにする。** 理由: §10 が規定するのは `skam:*` だけで、他の名前空間には規定がない。0.1.x は他の名前空間の要素を黙って SKAM として解釈しており、これは誤りである (Codex が再現し、メインループでも確認した)。仕様に規定がないものは、安全側に倒してエラーにする。拡張用の名前空間を将来認めるときは、仕様の変更として扱う。
- 入力制限 (DoS 対策): DOCTYPE 等の `<!` 宣言を拒否 (内部エンティティは DTD の中でしか定義できないため、エンティティ展開も封じる)、`maxInputLength` 既定 5,000,000 (UTF-16 コード単位)、`maxDepth` 既定 64。判定はパースの前に、コメント・CDATA・PI・属性値を読み飛ばす線形走査で行う。値は暫定で、オプションで変えられる。
- xmldom の warning はエラーに昇格し、`line` / `column` を付ける (ブラウザ版は DOMParser が位置を返さないので undefined)。`validate` は既定 true で、失敗は `SKAMValidationError`。
- `@xmldom/xmldom` を 0.8.11 から 0.8.15 に上げた。0.9 系は破壊的変更があるので見送った。

### K3: validator は TS 型の表明と、仕様の不変条件を強制する

TS 型の表明 (mark の `id` は string、`ext` は plain object、`placementHint` は string、saidoku の `forms[].n` は number)、okototen の座標範囲、`emphasis.style` の書式 (`isValidEmphasisStyle`) に加えて、次を仕様 (SKAM-draft) に追記したうえで拒否する (利用者決定、2026-10-15)。

- 空の `text`、空の `saidoku.forms`。
- blocks / tokens / marks にまたがる ID の重複 (`DUPLICATE_ID`)。
- 同じ anchor への同種注記の重複 (yomigana / okurigana / soegana / okimoji / joji / saidoku。`MARK_CONFLICT`)。okototen / emphasis / highlight / tateten は重複を許す。
- ブロック先頭の kaeri (`BLOCK_START_KAERI`)。改行とブロックを取り違えた利用者のために、メッセージにヒント (`BLOCK_START_KAERI_HINT`) を含める。明示的な改行は後続の ADR で扱う。ADR-039 で扱った。

扱わないもの: 同じ位置への kaeri の重複 (仕様が決めていない)。

### K4: HTML レンダラーと playground は、文書もオプションも未信頼として扱う

- `render()` は validator を呼ばない。ただし、TS 型の形をした任意の入力 (不正な値を含む) に対して、HTML / CSS 注入を起こさないことを保証する。意味の正しさは利用者が `validateSKAMDocument` で確かめる (README に明記)。
- 文書由来の文字列はすべて `escapeHtml` を通すか、許可リストで照合する (外れた `emphasis.style` は既定の `filled dot`)。数値は `Number.isFinite` で検査する。
- オプションは `validateRenderOptions` で検証し、違反は `TypeError`。web-component は同じ関数を再利用し、不正な属性値は既定値に戻して `skam-error` を発火する。
- 回帰の検出: 全 13 種の mark の全フィールドを埋めた注入文書を `satisfies` で型と照合し、string のリーフすべてを再帰的に注入文字列へ置き換える。出力を DOM として解析し、想定外の要素・属性、許可リスト外の宣言名、`<style>` 内の注入文字列がないことを確かめる。
- playground の `innerHTML` 代入を src 全体で棚卸しした (16 か所。静的 10、エスケープ済み 3、Prism 出力 1、レンダラー出力 2)。文書由来で未エスケープの箇所は 0 件。

### K5〜K8 (1 行ずつ)

- **K5**: 読み層は yomiage → kakikudashi → 白文の順にフォールバックする。読み層から `aria-label` を外す。`displayLang` (web-component は `display-lang`) で表示層の `lang` を切り替える。
- **K6**: ref の番号は原文の順 (`blocks[].tokenIds` の連結順) で振る。HTML と Canvas の共通モジュールで、`tokens[]` の配列順に依存しない。
- **K7**: Canvas は縦書き専用であることを `writingMode` の型で表明し、okototen と `autoSize` / `maxExtent` を実装した。okimoji / joji は HTML 側もデフォルトの見た目を持たないので「分類のみ」と README で表記をそろえた。
- **K8**: web-component は `HTMLElement` がない環境でも import できる (`customElements.define` は呼ばない)。全パッケージで exports の条件は `types` を先頭にし、`./auto` に `types` を足した。

### K9: 利用者との契約を CI で検証し、fixed group で 0.2.0 を出す

- README のコードブロックのうち `<!-- doctest -->` の注記が付いたものを、型検査して実行する (integration-tests)。README 中の XML は strict な parser を通す。
- 6 パッケージを `pnpm pack` して空のプロジェクトに入れ、ESM import、bundler / nodenext の型解決、Node での parse → stringify → render を確かめる job を CI に追加した。
- knip を CI に入れ、既存の 2 件を解消した。
- **changeset の `fixed` で公開 6 パッケージの版をそろえた (private の 4 パッケージは含めない)。副作用として、今後はどのパッケージを patch しても 6 つすべての版が上がる。** 今回は plan-4 の changeset が 6 パッケージすべてを minor にするので、fixed がなくても 6 つがそろって 0.2.0 になる。fixed は今後の版をそろえるための設定である。0.x の `^0.1` は 0.2 を満たさないため、内部依存の範囲も一緒に上がる。
- 0.1.1 は npm に未公開なので、CHANGELOG は 0.1.0 → 0.2.0 としてまとめた。
- 公開 (publish) は人間が workflow を起動して行う。本 ADR の範囲外。

## 欠落の code の一覧

コードは `packages/skam-xml-stringify/src/losses.ts` の `StringifyLossCode`。追加されうるので、網羅 switch には default 節を要求する。

### unsupported (将来の記法の候補)

以下は**候補**であり、採用を決めたものではない。採否は仕様の拡張として別の ADR で判断する。利用者は「重なりはやりたくなる可能性」「部分交差は漢文の例にあればやれなければいけない」と述べている。

| code                 | 将来の記法の候補                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PARTIAL_OVERLAP`    | 範囲の開始と終了を別の空要素で書く (milestone 方式)、または stand-off な `<skam:marks>` 節に anchor 付きで置く                                   |
| `UNNESTABLE_OVERLAP` | §7.0 の表を緩めて yomigana と包む要素の入れ子を許す、または上と同じ milestone / stand-off 方式。範囲 kun の入れ子は kun の内容モデルの拡張が要る |
| `EXT`                | 拡張用の名前空間の要素、または `skam:ext` 要素。他の名前空間をエラーとする現行方針 (K2) の変更を伴う                                             |
| `PLACEMENT_HINT`     | mark 要素の `placement-hint` 属性                                                                                                                |

### unrepresentable (出る条件)

| code                     | 出る条件                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DERIVATIONS`            | `doc.derivations` が 1 件以上ある。SKAM-ML §4.2 が derivations を XML に書かないと定めている (空配列は欠落ではない)                                                 |
| `ASCII_WHITESPACE_TOKEN` | token の `text` が U+0009 / U+000A / U+0020 / U+000D だけからなる。parser が無視する文字なので、往復で消える。U+3000 は含まない                                     |
| `BLOCK_START_KAERI`      | kaeri の position に `after` がなく、ブロック先頭に置かれている。validate を通していない入力でだけ出る                                                              |
| `DANGLING_REFERENCE`     | mark の anchor / position が、存在しない token または block を参照している。anchor の token がどのブロックにも属さない場合も。validate を通していない入力でだけ出る |
| `CROSS_BLOCK_ANCHOR`     | mark の `anchor.from` と `anchor.to` が別のブロックにある。validate を通していない入力でだけ出る                                                                    |
| `CONFLICTING_MARKS`      | 同じ anchor に同種の注記 (yomigana / okurigana / soegana / okimoji / joji / saidoku) が 2 つ以上ある。2 件目以降を報告する。validate を通していない入力でだけ出る   |

`BLOCK_START_KAERI`、`CONFLICTING_MARKS` は、`skam` の validator のエラー種別 (`ValidationErrorKind` の `BLOCK_START_KAERI`、`MARK_CONFLICT`) とは別パッケージの別の型である。

## 受け入れ条件

- 往復の性質 (a)(b)(c) と K2a の固定テストが通る (`packages/integration-tests` の `roundtrip-strict.test.ts`)。
- 注入文書の性質テストが通る (`packages/skam-html-renderer/src/__tests__/injection-property.test.ts`)。
- README の ts / xml ブロックが、印のないものを 0 件とし、型検査・実行・strict parse を通る (`readme-doctest.test.ts`)。
- tarball の利用者テストが通る (`pnpm test:consumer`)。
- `pnpm audit --prod` が脆弱性 0 件。
- 移行表の全 ID が対象パッケージの README にある (`migration-table.test.ts`)。

## spec からの訂正と、plan の外で行った変更

### 訂正

- spec K7 が引用した canvas の `render-tree.ts:100-107` は旧い経路である。本番の経路は `buildAnnotationIR` → `air-adapter` で、okototen はこちらに載せた (`AIRTokenSlots.okototen`)。
- spec K9 は「移行表を CHANGELOG と各 README に」と書いている。実際には、CHANGELOG には全行の ID と 1 行の要約、正本 (`docs/migration-0.1-to-0.2.md`) への絶対 URL を載せた。表の全列は、各 README の「0.1 からの移行」と `docs/migration-0.1-to-0.2.md` に置いた。理由は、changeset の本文が 6 パッケージの CHANGELOG すべてに同じ内容で入るため。
- plan-1 は ID の再生成を「token / mark の ID」と書いていたが、block と ref の `xml:id` は XML でも保持される。README にはそう書いた。

### plan の外で行った変更

- `packages/skam-screenshot/src/cli.ts`: canvas の経路が `horizontal` を拒否する (`writingMode` の型を絞ると build が通らなくなるため。利用者が承認済み)。移行表 M17。
- Canvas の DOM 型 (`be30050`): `CanvasRenderingContext2DLike` の `fillStyle` / `strokeStyle` を getter `unknown`・setter `string` に分け、実際の `HTMLCanvasElement` / `CanvasRenderingContext2D` をキャストなしで受けられるようにした。doctest が発見した型の不整合で、利用者が承認済み。非破壊の変更として M25。
- consumer の型検査に `tsc` ではなく `tsgo` (`@typescript/native-preview`) を使った (T6)。
- stringify: readings の `ext` も `EXT` の欠落として報告する。空の `ext: {}` と `derivations: []` は欠落ではない。
- okototen の重複: plan-2 の性質テスト (c) が、重なった okototen を `CONFLICTING_MARKS` と誤報する stringify の誤りを見つけた (表の誤りではなかった)。SKAM-draft §6.1 のとおり、okototen の積み重ねは合法として直した。性質テストが想定どおりに働いた例である。
- 変更履歴の照合 (plan-4 T8): 2 つの draft の `### v0.1 改訂（2026-10）` は、spec K9 が挙げた節をすべて含んでいた。追加した項目はなく、SKAM-ML-draft の 2 項目に補足を足した (§7.10 での span の訂正への言及、§7.6 / §7.8 / §7.9 / §7.10 に「内容モデル」の節を新設したこと)。

### plan-3 の残件 (git で管理していない出どころ) と移行表の対応

| 残件の項目                                                      | 移行表の ID |
| --------------------------------------------------------------- | ----------- |
| `skam-error` の `detail` に加わった `recoverable` / `attribute` | M20         |
| `validateRenderOptions` / `validateCSSOptions` の `TypeError`   | M12         |
| Canvas の `writingMode` を `'vertical'` に絞った                | M17         |
| skam-screenshot の CLI が canvas で `horizontal` を拒否する     | M17         |
| `autoSize` の既定動作、`maxExtent` がデバイスピクセルである     | M18         |
| emphasis のカスタム文字の出力の変化                             | M14         |
| ref の番号の順序                                                | M16         |
| `./auto` の `types` と exports の並べ替え                       | M24         |
| 追加: Canvas が実際の DOM の canvas / context を受ける          | M25         |

## 影響

### ポジティブ

- 表現できるものは往復で保たれ、表現できないものは既定でエラーになる。欠落が黙って起きない。
- 文書由来の値とオプションからの HTML / CSS 注入が塞がる。readings のない文書でも本文が支援技術に届く。
- README の例と、配布物を使う利用者の環境が、CI で検証される。

### ネガティブ・利用者への影響

- 0.1.0 で valid だった文書が不正になりうる (K3)。stringify は既定で例外を投げる。Canvas のサイズと見た目が変わる。すべて [移行表](../migration-0.1-to-0.2.md) (M01〜M26) と、各パッケージ README の「0.1 からの移行」の節に、旧挙動・新挙動・回避策を載せた。
- fixed group にしたため、今後はどのパッケージを patch しても 6 つすべての版が上がる (K9)。

### 既知の制約と未実施の確認

- **VRT (`pnpm test:visual`) は実行していない。** この環境に Playwright のブラウザがない。白文のフォールバックと ref の番号順が見た目を変えないことは未確認で、R4 の VRT 部分は未解消。ブラウザのある環境で実行する (Followup)。
- **LICENSE ファイルが各パッケージにない** (リポジトリのルートにはある)。公開される tarball に含まれない。Followup。
- **tsc は使っていない。** consumer の型検査は `tsgo` で行った。`skipLibCheck: false` で bundler / nodenext の両方が通った。利用者が `typescript@5` の `tsc` で使ったときの結果は未確認 (残るリスク)。Followup。
- **移行表の検査の限界**: `migration-table.test.ts` は ID、対象パッケージ、絶対 URL を検査するが、README の旧挙動・新挙動・回避策の列が正本と一字一句同じかは検査しない。手編集によるずれは検出できない。Followup (機械可読形式にして README の節を生成する案)。
- **正本への絶対 URL は `master` を指すので、このブランチがマージされるまでは 404 になる。** 公開は「マージ → release → publish」の順で行うので、利用者が 404 を見ることはない。
- **`package.json` の version は、release workflow を実行するまで 0.1.1 のままである。手で上げてはいけない。** 0.2.0 への更新は changesets の version コマンドが行う。`check-version-bump.mjs` が scratch のコピーで 0.2.0 になることを確かめている。
- コミット `a33edaf` (plan-3 T4) は、単体では lint (complexity) を通らない。直後の `e6ecb2e` で直っている。PR を作るときに squash するかどうかを決める (Followup)。
- 意図して提供しなかったもの: 範囲の重なり・部分交差の XML 表現 (JSON なら表現できる)、IVS と結合文字を 1 token にまとめること (現状は code point 単位。注記を基底文字の token に付ければ回避できる)、JSON Schema の配布と未知の mark type を保持する読み込み。

以後は docs/plans/backlog.md で追う。

### リスク R1〜R7 の結果

| リスク                                             | 結果                                                                                                                                                                                                                                |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1 既存の 0.1.0 利用者に破壊的変更が及ぶ           | 0.2.0 (fixed group) と移行表 M01〜M26 で対処した。利用者は月 7〜10 ダウンロードと少ない                                                                                                                                             |
| R2 fixture が寛容な挙動に頼っている                | 厳格な parser と validator で全 fixture と playground サンプルを流した。落ちたものはなく、fixture を直す必要はなかった                                                                                                              |
| R3 xmldom の warning 昇格が正当な文書を拒否する    | fixture、サンプル、draft の完全な例で warning は 0 件だったので、許容リストは空。引用符なしの属性と閉じタグの不一致は昇格してエラーにした                                                                                           |
| R4 白文と ref 番号で VRT・snapshot に差分が出る    | テストの期待値を変えたのは意図した出力の変更 (`aria-label` の削除、emphasis のカスタム文字の CSS 文字列化) に限った。VRT は未実行なので、見た目が変わらない見込み (推測) は未検証のまま                                             |
| R5 ブラウザ版の parser には位置情報がない          | parser の README に明記した。受理の条件は `parser-core` で共有しているので Node 版と同じ                                                                                                                                            |
| R6 0.1.x の parser が 0.2.0 の出力を黙って誤読する | 0.1.x の parser のソースで、3 つの形 (yomigana の中の kun、包む要素の中の kun、包む要素の入れ子) がいずれも黙って捨てられることを確認した。CHANGELOG、SKAM-ML の変更履歴、README に記録した。旧 parser との回帰テストは置いていない |
| R7 レビューのラウンドが伸びた                      | spec は Round 11 に到達した。利用者による延長は 1 回 (Round 10 の reframe)。残る限界は、表自体の誤り (固定テストで補う。表の行の不足は検出できない) と、生成器の 3 つの軸の外にある漏れ                                             |

## 参考

- [SKAM-draft.md](../../SKAM-draft.md) の変更履歴 (v0.1 改訂)
- [SKAM-ML-draft.md](../../SKAM-ML-draft.md) の §7.0 と変更履歴 (v0.1 改訂)
- [移行表](../migration-0.1-to-0.2.md)
- [ADR-003](adr-003-reform-auto-generated-ids.md)
- [ADR-021](adr-021-phase3-shared-annotation-ir.md)
- [ADR-027](adr-027-complexity-metrics-ci-integration.md)
