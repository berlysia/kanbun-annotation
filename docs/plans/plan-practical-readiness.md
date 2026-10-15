# ライブラリ群の実用化 (データ欠落・入力安全性・利用者契約)

## 概要

公開 6 パッケージを、外部の開発者が README どおりに導入できる状態にした。XML 変換でデータが黙って欠落せず、未信頼の入力から HTML / CSS 注入が起きず、0.1.0 → 0.2.0 の移行表が用意されている。plan-1 から plan-4 までの実装は完了している。このファイルは、実装した内容の記録と、残った作業 (Followup) を持つ。

関連 ADR: [ADR-028](../decisions/adr-028-practical-readiness.md)

## 前提知識

- 層構成は core → serialization → rendering → presentation の一方向で、ADR-021 の共通 Annotation IR は変えていない。変えたのは各層の境界での契約。
- 契約の内容と判断の理由は ADR-028 にある。移行表は [docs/migration-0.1-to-0.2.md](../migration-0.1-to-0.2.md)。
- 公開 (publish) は人間が release workflow を起動して行う。`package.json` の version は、それまで 0.1.1 のままにする (手で上げない)。

## 実装計画

4 本の plan を、plan-1 → plan-2 → plan-3 → plan-4 の順に、同じブランチ系列に積んだ。

### plan-1: XML 層と core validator

- T0 xmldom を 0.8.15 に上げ、診断を再計測する: `8aeb61b`
- T1 core のエラー種別 (`BLOCK_START_KAERI`) とヒント定数を追加する: `006bd89`
- T2 空白 (U+3000) と CDATA の扱いを直す: `b141bb5`
- T3 入力制限の事前走査 (`<!` 宣言・深さ・長さ) を入れる: `4136e42`
- T4 xmldom の warning をエラーに昇格し、行・列を付ける: `2fa0af4`
- T5 名前空間・内容モデル・未知要素の通知を入れる: `5f338df`
- T6 ブロック先頭の kaeri を拒否し、空ブロックを受け入れる: `bc7c853`
- T7 `validate` オプションを実装し、`SKAMValidationError` を再 export する: `98c8d00`
- T8 validator を厳しくする (空 text / 空 forms / ID 一意 / 型と範囲): `c6ab33f`
- T9 stringify の欠落契約 (`SKAMXMLStringifyError` / `lossy` / `onLoss` / 順序) を作る: `0c6544a`
- T10 残りの欠落 code を出し、実装の欠落 (ブロック先頭の kutoten / ref、入れ子 yomigana、meta など) を直す: `2f068b5`
- T11 往復の回帰テストと事前走査の fuzz を足す: `875737c`
- T12 playground で欠落を表示する: `34b93d0`
- T13 仕様の変更履歴を追記する: `d475d08`、prettier の整形: `bf40740`

### plan-2: 内容モデルの正本化と往復の完全性

- T1 SKAM-ML-draft §7.0 に内容モデル表 (正本) を書き、span の誤記と同種注記の重複規則を仕様に入れる: `f0f53fe`
- T2 parser を表に従わせ、`SKAM_ML_CONTENT_MODEL` を export し、固定テストで表を担保する: `ae348cf`
- T3 同じ種類の注記の重複を validator で拒否する: `8d5730b`
- T4 stringify を表に従わせる (複数 token の包む要素、入れ子順、`UNNESTABLE_OVERLAP`、`CONFLICTING_MARKS`): `f0c3a5e`
- T5 性質テスト (a)(b)(c) と表の一致の検査を足す: `6291891`、okototen の積み重ねを許す修正 (性質テストが発見): `d652acb`
- T6 changeset に追記する: `ae85589`

### plan-3: レンダラーと playground の安全性

- T1 注入の判定器と性質テスト (T2 の変更と同じコミット): `a0a2c3c`
- T2 文書由来の値をエスケープするか許可リストで検査する: `98d33f5` (core の export)、`a0a2c3c`
- T3 レンダリングのオプションを検証する (`validateRenderOptions`): `77f616e`
- T4 読み層のフォールバックと `displayLang`: `a33edaf`
- T5 ref の番号を原文順にそろえる: `e6ecb2e`
- T6 Canvas の okototen (AIR 経由)・`autoSize`・縦書き専用の型: `9689648`、`983059c`
- T7 web-component の SSR 対応・属性の検証・`display-lang`: `8e17150`、`753c603`
- T8 playground の `innerHTML` を監査する: `6cf67e4`
- T9 html-renderer の README: `f941f60`
- T10 VRT (未実行) と changeset: `d9ae91c`

### plan-4: 配布・README・CI・記録

- T1 exports の条件を `types` 先頭にそろえ、`./auto` に `types` を足す: `a931e70`
- T2 knip を CI に入れ、権限を絞り、生成物を無視リストに入れる: `98507e8`
- T3 README の doctest: `0b01e4f`、plan 外で Canvas の DOM 型を直した: `be30050`
- T4 README に利用者との契約を書く: `2eabfa4`
- T5 fixed group・移行表・advisory: `2809081`、版の確認 (`check-version-bump`): `d413241`、移行表 M01 の訂正: `4d31118`
- T6 tarball を空のプロジェクトに入れる利用者テスト: `16ee277`
- T7 全体の確認 (コミットなし)。
- T8 ADR-028、この plan、仕様の変更履歴の照合 (このコミット)。

## リスクと軽減策

R1〜R7 の結果は ADR-028 の「リスク R1〜R7 の結果」にある。この plan の完了時点で残っているリスクは次のとおり。

| リスク                                                       | 影響度 | 軽減策                                                                                                                               |
| ------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| VRT を実行していないので、見た目の変化が未検証               | 中     | ブラウザのある環境で `pnpm test:visual` を実行する (Followup)                                                                        |
| `typescript@5` の `tsc` で利用者が使ったときの型解決が未検証 | 中     | consumer の型検査を `tsc` でも回す (Followup)                                                                                        |
| 各パッケージに LICENSE ファイルがない                        | 低     | 不要だった: `pnpm pack` は root の LICENSE を tarball に入れる (2026-10-15 に確認、ADR-029)。consumer 検査で root との一致を確かめる |
| 移行表の README 側の手編集によるずれを検出できない           | 低     | 機械可読形式にして README の節を生成する (Followup)                                                                                  |

## 検証方法

plan-4 T7 で、次をすべて通した (exit 0)。`pnpm build`、`pnpm typecheck`、`pnpm test:run`、`pnpm lint`、`pnpm format:check`、`pnpm clean`、`pnpm test:consumer`、`pnpm audit --prod` (脆弱性 0 件)。コミットごとの lint / format:check も確かめた (`a931e70` の format:check だけ、未追跡の生成物による失敗で、コミットの内容の問題ではない)。`pnpm test:visual` は未実行。

## Followup

次の作業は、この plan の範囲外とする。片付いたら、この節から消す。

### spec の範囲外とした作業

- 明示的な改行 (ブロック内の強制改行) の ADR。ブロック先頭の kaeri が不正であることは、この ADR の後も変わらない。
- 同じ位置に重複した kaeri の扱い (仕様が決めていない)。
- `xml:lang` を JSON に保持すること (データモデルの変更)。
- 範囲の重なりと交差を XML で表現すること (`unsupported` の拡張候補は ADR-028 の一覧)、IVS の tokenize、JSON Schema の配布と未知の mark type を保持する読み込み。

### plan-3 の残件

- 致命的な `skam-error` (`recoverable: false`) が、再描画のたびに発火する。ハンドラが light DOM を書き換えると、MutationObserver → 再描画 → 失敗 → 発火の連鎖が起きうる。回復可能なエラーと同じく、最後に通知したメッセージを覚えて重複を除く案がある。出典: plan-3 のレビュー (resilience-analyzer)。
- grid モードで emphasis のカスタム文字が固定の `•` になる (`packages/skam/src/rendering/emphasis.ts` の `resolveEmphasisCharacter`)。ruby モードでは CSS の `text-emphasis-style` でカスタム文字が出る。機能の欠落で、安全性の問題ではない。

### 配布・CI・記録

- `typescript@5` の `tsc` で、consumer の型検査 (bundler / nodenext) を行う。現状は `tsgo` のみ。
- 移行表を機械可読形式 (YAML など) にして、各 README の移行の節を生成する。生成すれば、README の列が正本とずれることを防げる。
- PR を作るとき、`a33edaf` (単体では lint の complexity を通らない) を直後の `e6ecb2e` と squash するか決める。
- VRT (`pnpm test:visual`) を、Playwright のブラウザがある環境で実行し、ベースラインの差分を確かめる。

<!-- validated -->
