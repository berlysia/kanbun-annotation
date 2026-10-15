# 利用者フィードバックへの対応 (出題用途の非表示・読み上げ・エラー位置)

## 概要

0.1.0 の利用者から受けた 17 項目のフィードバックのうち、master で事実と確かめた不具合・不整合・文書の欠けを直した。あわせて、表示設定に応じた読み上げテキスト (experimental) を足した。plan-1 から plan-3 までの実装は完了している。このファイルは、実装した内容の記録と、残った作業 (Followup) を持つ。

関連 ADR: [ADR-030](../decisions/adr-030-consumer-feedback.md)

## 前提知識

- 決定と判断の理由は ADR-030 にある。移行表は [docs/migration-0.1-to-0.2.md](../migration-0.1-to-0.2.md) の M26〜M37。
- 読み上げは、表示層と同じ AIR (`buildAnnotationIR`) から作る。AIR は ADR-021 の共通中間表現で、この作業では形を変えていない (K6 で `trailingMarks` の中身だけが変わった)。

## 実装計画

3 本の plan を、plan-1 → plan-2 → plan-3 の順に、同じブランチ (`feat/consumer-feedback`) に積んだ。

### plan-1: テスト環境・表示設定・Web Component の属性

- T1 ワークツリーで vitest が通るようにする: `82ad1b2`
- T2 `buildRangeInfo` も置き字・助字を profile で絞る: `f750be8`
- T3 表示設定を skam/rendering に一本化し、厳密に検証する: `8538301`
- T4 Web Component の属性を検証し、隠す属性を fail closed にする: `b6090ac`
- T5 JSDoc と README: `f468b8f`
- T6 移行表 M27〜M34 と changeset: `3661dcd`

### plan-2: parser のエラー位置・メディアタイプ・xmldom・ADR の注記

- T1 parser の例外に要素の位置を付ける: `e3fc454`
- T2 検証エラーに元の要素の行と列を付ける: `2d9fa44`
- T3 SKAM-ML-draft §3.3 にメディアタイプを書く: `12b9615`
- T4 `@xmldom/xmldom` を `^0.8.15` にする: `f82cb70`
- T5 ADR-019 / 021 / 027 に `check:deps` の注記を足す: `f459365`
- T6 移行表 M35〜M36 と changeset: `ad425d1`

### plan-3: 表示設定に応じた読み上げテキスト

- T1 `describeAnnotationIR`: `1167b48`
- T2 `formatAccessibleText` と既定の言葉: `b75a239`
- T3 html-renderer の `readingLayerSource` と `accessibleLabels`: `242ad94`
- T4 Web Component の `reading-layer-source`: `4cdad26`
- T5 README と API リファレンス: `4be059c`
- T6 移行表 M37 と changeset: `d3fe32f`
- T7 記録 (ADR-030 とこのファイル)

## リスクと軽減策

| リスク                                           | 影響度                                     | 軽減策                                                               |
| ------------------------------------------------ | ------------------------------------------ | -------------------------------------------------------------------- |
| 読み上げの文字列が実機で意図どおりに発話されない | 中                                         | experimental にし、既定は `'readings'` のまま。実機の確認は Followup |
| 厳密化で 0.1.x の入力が描けなくなる              | 低 (月 7〜10 ダウンロード、0.2.0 は未公開) | 移行表に経路ごとの行を足した                                         |

## 検証方法

各 plan の完了時に、`pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm clean` / `pnpm format:check`、integration-tests (README の doctest と移行表の検査を含む)、`pnpm changeset status` を通した。plan-2 では `pnpm audit --prod` (脆弱性 0 件) も確かめた。

## Followup

次の作業は、この plan の範囲外とする。片付いたら、この節から消す。

- NVDA (Windows、日本語) と VoiceOver (macOS) で、`'display'` の読み上げ層を確かめる。合格の条件は、`習、送り仮名 フ、レ点。` の各語が言葉として発話されること、表示層のルビや返り点が読み上げ層と重ねて読まれないこと。確かめたら、experimental を外すかを決める。
- 次の破壊的リリースで、profile を指定して `readingLayerSource` を省いたときの既定 (`'readings'`) を見直す。
- 出題対象の印 (フィードバック #14): マーク単位で「設問の答え」を表す仕様。`ext` の約束事かマークの属性か。
- 竪点のグループからはみ出す読みの範囲 (#16) の扱い。
- DOM へ描く `mount()` 関数 (#11)。CSS の 1 回だけの注入とフォント読み込み後の補正をまとめる。
- `parse` の既定の id を、文書の順で決まる値にする (#15、破壊的変更)。`xml:id` との衝突回避が要る。
- Web Component から `accessibleLabels` を指定する手段 (プロパティ)。
- PR を作るとき、`feat/staged-release-flow` の ADR-029 と番号が衝突しないことを確かめる (この ADR は 030)。

<!-- validated -->
