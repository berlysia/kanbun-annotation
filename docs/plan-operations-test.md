# Operations テスト拡充計画

## 概要

`packages/skam/src/operations/index.ts` の全操作関数に対する網羅的テスト。
既存の `operations.test.ts` を拡張し、バリデーション統合・複数ブロック・Mark型カテゴリ網羅を実現する。

## 設計決定

| 項目               | 決定                                                   | 備考                                      |
| ------------------ | ------------------------------------------------------ | ----------------------------------------- |
| バリデーション統合 | 全テストケースで `assertValidDocument()` ヘルパー使用  | 初期状態+操作後の両方                     |
| ファイル戦略       | 既存 `operations.test.ts` を拡張・書き換え             | 全テストにバリデーション統合適用          |
| テストデータ       | `createTestDocument` + `createMultiBlockDocument` 並立 | シナリオ別ヘルパー                        |
| Mark型カバレッジ   | anchor/position各カテゴリの代表型                      | 全13型ではなくカテゴリ代表                |
| replaceMark        | Playground ユースケースを含む拡充テスト                | 傍点スタイル変更、傍線更新で使用          |
| updateMark型不整合 | テストせず、TODO記録                                   | position-based markへの対応は型修正で対処 |
| 操作連鎖           | CRUD連鎖 + Playgroundシナリオ                          | GUI操作をSKAM operationsのみで再現        |
| 大量データテスト   | 対象外                                                 | パフォーマンステストは別途                |
| トークン順序       | blocks.tokenIds 順を使用（仕様準拠）                   | tokens配列の順序は無意味（SKAM仕様 §4.3） |

## TODO（テスト外）

- [ ] `updateMark` の `MarkUpdates` 型が position-based mark（kutoten, ref）に対して不整合。`anchor` フィールドは kutoten/ref に存在しない。型レベルでの修正が必要。

## テストヘルパー

### `assertValidDocument(doc: unknown): asserts doc is SKAMDocument`

- `assertSKAMDocument` をラップ
- テストの初期状態と操作結果の両方で呼び出す
- 失敗時は Vitest のスタックトレースで呼び出し元が分かる

### `createTestDocument(marks?: Mark[]): SKAMDocument`

- 既存: 3 token (`t1`, `t2`, `t3`) / 1 block (`b1`)
- tokens: 子(`t1`), 曰(`t2`), 學(`t3`)

### `createMultiBlockDocument(marks?: Mark[]): SKAMDocument`

- 新規: 6 token / 2 block
- block `b1`: tokens `t1`(`子`), `t2`(`曰`), `t3`(`學`)
- block `b2`: tokens `t4`(`而`), `t5`(`時`), `t6`(`習`)

## Mark型カテゴリと代表型

### Anchor-based

| カテゴリ     | 代表型      | 特徴                                                       |
| ------------ | ----------- | ---------------------------------------------------------- |
| value有り    | `okurigana` | `value: string`                                            |
| value無し    | `okimoji`   | 追加プロパティなし                                         |
| forms有り    | `saidoku`   | `forms: SaidokuForm[]`                                     |
| position有り | `okototen`  | `position: GlyphGridCoord`（anchorとは別の意味のposition） |

### Position-based（anchor を持たない）

| カテゴリ       | 代表型    | 特徴                                             |
| -------------- | --------- | ------------------------------------------------ |
| value有り      | `kutoten` | `position: Position`, `value: string`            |
| 複合プロパティ | `ref`     | `position: Position`, `label`/`format`/`content` |

## テストケース一覧

### 1. generateMarkId

| #   | ケース                 | 初期状態                                 | 期待結果 |
| --- | ---------------------- | ---------------------------------------- | -------- |
| 1.1 | 空のマーク配列         | marks: []                                | `m1`     |
| 1.2 | 既存markIdから最大値+1 | marks: [m1, m3]                          | `m4`     |
| 1.3 | idなしマークは無視     | marks: [{no id}, m2]                     | `m3`     |
| 1.4 | 非m{number}形式は無視  | marks: [custom-id, m2]                   | `m3`     |
| 1.5 | 複数ブロック           | multi-block, marks: [m1 in b1, m2 in b2] | `m3`     |

### 2. addMark

| #    | ケース                 | Mark型    | 初期状態    | 検証項目             |
| ---- | ---------------------- | --------- | ----------- | -------------------- |
| 2.1  | 基本追加               | okurigana | empty       | 新ID生成、マーク追加 |
| 2.2  | イミュータブル         | okurigana | empty       | 元docは変更なし      |
| 2.3  | 既存マーク保持         | okurigana | [kaeri]     | 既存+新規            |
| 2.4  | 入力のid上書き         | okurigana | empty       | 新IDで上書き         |
| 2.5  | value無しマーク追加    | okimoji   | empty       | okimojiが追加される  |
| 2.6  | forms有りマーク追加    | saidoku   | empty       | saidokuが追加される  |
| 2.7  | position-based追加     | kutoten   | empty       | kutotenが追加される  |
| 2.8  | ref追加                | ref       | empty       | refが追加される      |
| 2.9  | 複数ブロック: b1に追加 | okurigana | multi-block | b1のトークンを参照   |
| 2.10 | 複数ブロック: b2に追加 | okurigana | multi-block | b2のトークンを参照   |

### 3. updateMark

| #   | ケース                       | 初期状態               | 更新内容           | 検証項目                      |
| --- | ---------------------------- | ---------------------- | ------------------ | ----------------------------- |
| 3.1 | anchor更新                   | [okurigana m1]         | anchor変更         | anchor更新、他保持            |
| 3.2 | イミュータブル               | [okurigana m1]         | anchor変更         | 元doc変更なし                 |
| 3.3 | 存在しないmarkId             | [okurigana m1]         | m999               | 元docそのまま返却（同一参照） |
| 3.4 | placementHint更新            | [okurigana m1]         | placementHint      | 更新、他保持                  |
| 3.5 | ext更新                      | [okurigana m1]         | ext追加            | ext付与、他保持               |
| 3.6 | 複数ブロック: b1のマーク更新 | multi-block [m1 in b1] | anchor変更（b1内） | 正常更新                      |
| 3.7 | 複数ブロック: b2のマーク更新 | multi-block [m1 in b2] | anchor変更（b2内） | 正常更新                      |

### 4. replaceMark

| #   | ケース                | 初期状態       | 操作内容                            | 検証項目                      |
| --- | --------------------- | -------------- | ----------------------------------- | ----------------------------- |
| 4.1 | 基本置き換え          | [okurigana m1] | 同type, value変更                   | 元のID保持、値変更            |
| 4.2 | イミュータブル        | [okurigana m1] | 同type, value変更                   | 元doc変更なし                 |
| 4.3 | 存在しないmarkId      | [okurigana m1] | m999 で置き換え                     | 元docそのまま返却（同一参照） |
| 4.4 | emphasisスタイル変更  | [emphasis m1]  | style: 'filled dot' → 'open circle' | ID保持、style変更             |
| 4.5 | highlightスタイル変更 | [highlight m1] | style: 'solid' → 'wavy'             | ID保持、style変更             |
| 4.6 | 配列内位置維持        | [m1, m2, m3]   | m2を置き換え                        | m1,m3は不変、m2位置に新マーク |

### 5. removeMark

| #   | ケース                       | 初期状態                         | 検証項目                      |
| --- | ---------------------------- | -------------------------------- | ----------------------------- |
| 5.1 | 基本削除                     | [okurigana m1, kaeri m2]         | m1削除、m2残存                |
| 5.2 | イミュータブル               | [okurigana m1]                   | 元doc変更なし                 |
| 5.3 | 存在しないmarkId             | [okurigana m1]                   | 元docそのまま返却（同一参照） |
| 5.4 | position-based削除           | [kutoten m1]                     | kutoten削除                   |
| 5.5 | 複数ブロック: b2のマーク削除 | multi-block [m1 in b1, m2 in b2] | m2削除、m1残存                |

### 6. getMarksForToken

| #    | ケース                                     | 初期状態                              | tokenId | 検証項目                |
| ---- | ------------------------------------------ | ------------------------------------- | ------- | ----------------------- |
| 6.1  | 単一トークンマッチ                         | [okurigana t1, kaeri t2, yomigana t3] | t2      | kaeriのみ               |
| 6.2  | 範囲跨ぎマッチ                             | [yomigana t1-t3, kaeri t2]            | t2      | 両方                    |
| 6.3  | 存在しないtokenId                          | [okurigana t1]                        | t999    | 空配列                  |
| 6.4  | マークなし                                 | []                                    | t1      | 空配列                  |
| 6.5  | 無効anchor除外                             | [okurigana t1, okurigana invalid]     | t1      | 有効なもののみ          |
| 6.6  | yomigana+ref混在                           | [yomigana t3, ref after:t3]           | t3      | 両方（anchor+position） |
| 6.7  | kutoten マッチ                             | [kutoten after:t2]                    | t2      | kutotenのみ             |
| 6.8  | kutoten after未定義                        | [kutoten after:undefined]             | t1      | 空配列                  |
| 6.9  | value無しマーク(okimoji)                   | [okimoji t1]                          | t1      | okimojiマッチ           |
| 6.10 | forms有りマーク(saidoku)                   | [saidoku t1]                          | t1      | saidokuマッチ           |
| 6.11 | 複数ブロック: b1のトークン                 | multi-block [m1 in b1, m2 in b2]      | t1      | b1のマークのみ          |
| 6.12 | 複数ブロック: b2のトークン                 | multi-block [m1 in b1, m2 in b2]      | t4      | b2のマークのみ          |
| 6.13 | 複数ブロック: 範囲マーク（同一ブロック内） | multi-block [yomigana t4-t6]          | t5      | マッチ                  |

### 7. getMarksForRange

| #    | ケース                         | 初期状態                                     | 範囲    | 検証項目          |
| ---- | ------------------------------ | -------------------------------------------- | ------- | ----------------- |
| 7.1  | 完全一致                       | [yomigana t1-t3]                             | t1-t3   | マッチ            |
| 7.2  | 範囲内に収まる                 | [yomigana t2]                                | t1-t3   | マッチ            |
| 7.3  | 部分重なり（左）               | [yomigana t1-t2]                             | t2-t3   | マッチ            |
| 7.4  | 部分重なり（右）               | [yomigana t2-t3]                             | t1-t2   | マッチ            |
| 7.5  | superset                       | [yomigana t1-t3]                             | t2-t2   | マッチ            |
| 7.6  | 範囲外                         | [yomigana t1]                                | t2-t3   | 空                |
| 7.7  | 隣接非重複                     | [yomigana t1, yomigana t3]                   | t2-t2   | 空                |
| 7.8  | 複数マーク                     | [yomigana t1, yomigana t2-t3, kaeri t2]      | t1-t3   | 全3件             |
| 7.9  | kutoten範囲内                  | [kutoten after:t2]                           | t1-t3   | マッチ            |
| 7.10 | kutoten範囲外                  | [kutoten after:t3]                           | t1-t2   | 空                |
| 7.11 | 存在しないtokenId              | [yomigana t1]                                | t999-t1 | 空                |
| 7.12 | 無効anchor除外                 | [okurigana t1, okurigana invalid]            | t1-t3   | 有効のみ          |
| 7.13 | 単一トークン=getMarksForToken  | [yomigana t1-t3, kaeri t2, kutoten after:t2] | t2-t2   | tokenResultと一致 |
| 7.14 | 複数ブロック: b1範囲           | multi-block [m1 in b1, m2 in b2]             | t1-t3   | b1のマークのみ    |
| 7.15 | 複数ブロック: b2範囲           | multi-block [m1 in b1, m2 in b2]             | t4-t6   | b2のマークのみ    |
| 7.16 | 複数ブロック: ブロック跨ぎ範囲 | multi-block [m1 in b1, m2 in b2]             | t1-t6   | 両方マッチ        |

### 8. Playground シナリオ（既存維持）

| #   | ケース                      | 検証項目              |
| --- | --------------------------- | --------------------- |
| 8.1 | refにyomigana追加→refは残る | 異種マーク共存        |
| 8.2 | yomigana変更時refは残る     | remove+add後のref保持 |

### 9. 操作連鎖

| #   | ケース                                               | 操作フロー                                   | 検証項目                             |
| --- | ---------------------------------------------------- | -------------------------------------------- | ------------------------------------ |
| 9.1 | add→update→remove                                    | add(okurigana) → update(anchor変更) → remove | 各ステップでvalid、最終状態はmarks空 |
| 9.2 | 複数add→全remove                                     | add×3 → remove×3                             | 各ステップでvalid、ID管理の正しさ    |
| 9.3 | add→getMarksForToken確認→remove→getMarksForToken確認 | add → get → remove → get                     | 検索結果が操作に追従                 |

### 10. getMarkById

| #    | ケース           | 初期状態                 | markId | 検証項目              |
| ---- | ---------------- | ------------------------ | ------ | --------------------- |
| 10.1 | 存在するID       | [okurigana m1, kaeri m2] | m1     | okuriganaマークを返す |
| 10.2 | 存在しないID     | [okurigana m1]           | m999   | undefined             |
| 10.3 | 空のマーク配列   | []                       | m1     | undefined             |
| 10.4 | position-based   | [kutoten m1]             | m1     | kutotenマークを返す   |
| 10.5 | idなしマーク混在 | [{no id}, m2]            | m2     | m2を返す              |

### 11. getBlockForToken

| #    | ケース            | 初期状態    | tokenId | 検証項目  |
| ---- | ----------------- | ----------- | ------- | --------- |
| 11.1 | 単一ブロック      | single      | t1      | b1を返す  |
| 11.2 | 存在しないtokenId | single      | t999    | undefined |
| 11.3 | 複数ブロック: b1  | multi-block | t2      | b1を返す  |
| 11.4 | 複数ブロック: b2  | multi-block | t5      | b2を返す  |

### 12. buildTokenIndexMap

| #    | ケース         | 初期状態    | 検証項目                                            |
| ---- | -------------- | ----------- | --------------------------------------------------- |
| 12.1 | 単一ブロック   | single      | t1→0, t2→1, t3→2                                    |
| 12.2 | 複数ブロック   | multi-block | t1→0, t2→1, t3→2, t4→3, t5→4, t6→5                  |
| 12.3 | 空ドキュメント | no tokens   | 空のMap                                             |
| 12.4 | blocks順を使用 | blocks逆順  | tokens配列順ではなくblocks.tokenIds連結順であること |

### 13. getTokenIndex

| #    | ケース             | 初期状態    | tokenId | 検証項目  |
| ---- | ------------------ | ----------- | ------- | --------- |
| 13.1 | 先頭トークン       | single      | t1      | 0         |
| 13.2 | 末尾トークン       | single      | t3      | 2         |
| 13.3 | 存在しないtokenId  | single      | t999    | undefined |
| 13.4 | 複数ブロック: b2   | multi-block | t4      | 3         |
| 13.5 | 複数ブロック: 末尾 | multi-block | t6      | 5         |

### 14. getTokenByIndex

| #    | ケース               | 初期状態    | index | 検証項目                 |
| ---- | -------------------- | ----------- | ----- | ------------------------ |
| 14.1 | 先頭                 | single      | 0     | t1トークン（text: '子'） |
| 14.2 | 末尾                 | single      | 2     | t3トークン（text: '學'） |
| 14.3 | 範囲外（正）         | single      | 99    | undefined                |
| 14.4 | 範囲外（負）         | single      | -1    | undefined                |
| 14.5 | 複数ブロック: b2先頭 | multi-block | 3     | t4トークン（text: '而'） |
| 14.6 | 複数ブロック: b2末尾 | multi-block | 5     | t6トークン（text: '習'） |

### 15. getMarksExactRange

| #     | ケース                | 初期状態                     | 範囲    | type    | 検証項目                     |
| ----- | --------------------- | ---------------------------- | ------- | ------- | ---------------------------- |
| 15.1  | 完全一致              | [tateten t1-t2]              | t1-t2   | -       | マッチ                       |
| 15.2  | 部分一致は除外        | [yomigana t1-t3]             | t1-t2   | -       | 空                           |
| 15.3  | superset は除外       | [yomigana t1-t3]             | t2-t2   | -       | 空                           |
| 15.4  | subset は除外         | [yomigana t2-t2]             | t1-t3   | -       | 空                           |
| 15.5  | type フィルタ: マッチ | [tateten t1-t2, kaeri t1-t2] | t1-t2   | tateten | tatetenのみ                  |
| 15.6  | type フィルタ: 不一致 | [tateten t1-t2]              | t1-t2   | kaeri   | 空                           |
| 15.7  | type フィルタなし     | [tateten t1-t2, kaeri t1-t2] | t1-t2   | -       | 両方                         |
| 15.8  | position-based は除外 | [kutoten after:t1]           | t1-t1   | -       | 空（position-basedは対象外） |
| 15.9  | 存在しないtokenId     | [tateten t1-t2]              | t999-t2 | -       | 空                           |
| 15.10 | 複数ブロック          | multi-block [tateten t4-t5]  | t4-t5   | -       | マッチ                       |
| 15.11 | 単一トークン完全一致  | [kaeri t2-t2]                | t2-t2   | kaeri   | マッチ                       |

### 16. getAnchorText

| #    | ケース                | 初期状態    | マーク                    | 検証項目 |
| ---- | --------------------- | ----------- | ------------------------- | -------- |
| 16.1 | 単一トークン          | single      | okurigana t2-t2           | '曰'     |
| 16.2 | 範囲                  | single      | yomigana t1-t3            | '子曰學' |
| 16.3 | position-based: after | single      | kutoten after:t2          | '曰'     |
| 16.4 | position-based: 先頭  | single      | kutoten after:undefined   | ''       |
| 16.5 | 無効anchor            | single      | okurigana invalid-invalid | ''       |
| 16.6 | 複数ブロック          | multi-block | yomigana t4-t6            | '而時習' |

### 17. getMarkSortIndex

| #    | ケース                   | マーク                  | 検証項目 |
| ---- | ------------------------ | ----------------------- | -------- |
| 17.1 | anchor先頭               | okurigana t1-t1         | 0        |
| 17.2 | anchor中間               | kaeri t2-t2             | 1        |
| 17.3 | anchor範囲（fromの位置） | yomigana t2-t3          | 1        |
| 17.4 | position-based           | kutoten after:t2        | 1        |
| 17.5 | position-based: 先頭     | kutoten after:undefined | -1       |
| 17.6 | 無効anchor               | okurigana invalid       | -1       |

### 18. sortMarksByPosition

| #    | ケース             | 初期状態                                       | 検証項目                   |
| ---- | ------------------ | ---------------------------------------------- | -------------------------- |
| 18.1 | 基本ソート         | [kaeri t3, okurigana t1, yomigana t2]          | t1, t2, t3 順              |
| 18.2 | position-based混在 | [kutoten after:t3, kaeri t1, kutoten after:t1] | t1(kaeri), t1(kutoten), t3 |
| 18.3 | イミュータブル     | [kaeri t3, okurigana t1]                       | 元のmarks配列は変更なし    |
| 18.4 | 空のマーク         | []                                             | 空配列                     |

### 19. generateId

| #    | ケース                   | 初期状態              | prefix | delimiter | 期待結果 |
| ---- | ------------------------ | --------------------- | ------ | --------- | -------- |
| 19.1 | デフォルト（m prefix）   | marks: []             | -      | -         | `m1`     |
| 19.2 | generateMarkIdと同一結果 | marks: [m1, m3]       | 'm'    | ''        | `m4`     |
| 19.3 | ref prefix + delimiter   | marks: []             | 'ref'  | '-'       | `ref-1`  |
| 19.4 | 既存refから最大値+1      | marks: [ref-1, ref-3] | 'ref'  | '-'       | `ref-4`  |
| 19.5 | 異なるprefix混在         | marks: [m1, ref-1]    | 'ref'  | '-'       | `ref-2`  |
| 19.6 | prefix不一致は無視       | marks: [m1, m2]       | 'ref'  | '-'       | `ref-1`  |

### 20. Playground シナリオ（拡充）

GUI操作をSKAM operationsのみで再現し、正しさを検証する。

#### 20.1 返り点操作

| #     | ケース       | 操作フロー                                   | 検証項目                 |
| ----- | ------------ | -------------------------------------------- | ------------------------ |
| 20.1a | 返り点追加   | addMark(kaeri, t2, 'レ')                     | マーク追加、他マーク不変 |
| 20.1b | 返り点削除   | removeMark(kaeri)                            | マーク削除、他マーク不変 |
| 20.1c | 返り点値変更 | removeMark(old) → addMark(kaeri, t2, '一レ') | 旧削除、新追加           |

#### 20.2 たて点操作

| #     | ケース            | 操作フロー                                    | 検証項目                           |
| ----- | ----------------- | --------------------------------------------- | ---------------------------------- |
| 20.2a | たて点追加        | addMark(tateten, t1-t2)                       | マーク追加                         |
| 20.2b | たて点解除        | removeMark(tateten)                           | tateten削除、kaeri残存             |
| 20.2c | たて点+返り点共存 | addMark(tateten) → addMark(kaeri, same range) | 両方存在、getMarksExactRangeで確認 |

#### 20.3 傍点操作

| #     | ケース           | 操作フロー                                                     | 検証項目                                   |
| ----- | ---------------- | -------------------------------------------------------------- | ------------------------------------------ |
| 20.3a | 傍点追加         | addMark(emphasis, t1-t2, style:'filled dot')                   | マーク追加                                 |
| 20.3b | 傍点スタイル変更 | replaceMark(emphasisId, newEmphasis with 'open circle')        | ID保持、style変更                          |
| 20.3c | 傍点解除         | removeMark(emphasis)                                           | マーク削除                                 |
| 20.3d | 部分重複検出     | emphasis t1-t3, getMarksForRange(t2-t3) で検出、完全一致でない | getMarksExactRange空、getMarksForRange非空 |

#### 20.4 傍線操作

| #     | ケース              | 操作フロー                                         | 検証項目          |
| ----- | ------------------- | -------------------------------------------------- | ----------------- |
| 20.4a | 傍線追加            | addMark(highlight, t1-t2, style:'solid')           | マーク追加        |
| 20.4b | 傍線スタイル変更    | replaceMark(highlightId, newHighlight with 'wavy') | ID保持、style変更 |
| 20.4c | ref付き傍線追加     | addMark(ref) → addMark(highlight with ref)         | 両マーク存在      |
| 20.4d | ref付き傍線解除     | removeMark(highlight) → removeMark(ref)            | 両方削除          |
| 20.4e | 傍線解除（ref無し） | removeMark(highlight)                              | マーク削除        |

#### 20.5 仮名操作

| #     | ケース           | 操作フロー                                                      | 検証項目                    |
| ----- | ---------------- | --------------------------------------------------------------- | --------------------------- |
| 20.5a | 読み仮名追加     | addMark(yomigana, t1, 'し')                                     | マーク追加                  |
| 20.5b | 読み仮名更新     | removeMark(old) → addMark(yomigana, t1, 'こ')                   | 旧削除、新追加              |
| 20.5c | 送り仮名追加     | addMark(okurigana, t3, 'ブ')                                    | マーク追加                  |
| 20.5d | 添え仮名追加     | addMark(soegana, t2, 'ク')                                      | マーク追加                  |
| 20.5e | 異種仮名共存     | addMark(yomigana) → addMark(okurigana) on same token            | 両方共存                    |
| 20.5f | 部分重複拒否確認 | yomigana t1-t3, getMarksForRange(t1-t2) で type='yomigana' 検出 | exactRangeは空、rangeは非空 |

#### 20.6 replaceMarkによる更新パターン

| #     | ケース                        | 操作フロー                    | 検証項目                 |
| ----- | ----------------------------- | ----------------------------- | ------------------------ |
| 20.6a | emphasis remove+add → replace | replaceMark(id, newEmphasis)  | remove+add と同等結果    |
| 20.6b | highlight replace             | replaceMark(id, newHighlight) | ID保持、全プロパティ更新 |

## テスト実装の流れ

1. ヘルパー関数の定義
   - `assertValidDocument`
   - `createMultiBlockDocument`
2. 既存テストケースの書き換え（バリデーション統合追加）
3. 新規テストケースの追加（上記一覧のうち既存にないもの）
4. テスト実行・確認

<!-- validated -->
