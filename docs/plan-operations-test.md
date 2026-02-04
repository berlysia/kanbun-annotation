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
| replaceMark        | 最低限の動作テストのみ                                 | ユースケース不明のため                    |
| updateMark型不整合 | テストせず、TODO記録                                   | position-based markへの対応は型修正で対処 |
| 操作連鎖           | CRUD連鎖のみ                                           | add→update→remove等の基本フロー           |
| 大量データテスト   | 対象外                                                 | パフォーマンステストは別途                |

## TODO（テスト外）

- [ ] `updateMark` の `MarkUpdates` 型が position-based mark（kutoten, ref）に対して不整合。`anchor` フィールドは kutoten/ref に存在しない。型レベルでの修正が必要。
- [ ] `replaceMark` のユースケース明確化。使用箇所がなければ削除を検討。

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

### 4. replaceMark（最低限）

| #   | ケース           | 初期状態       | 検証項目                      |
| --- | ---------------- | -------------- | ----------------------------- |
| 4.1 | 基本置き換え     | [okurigana m1] | 元のID保持、値変更            |
| 4.2 | イミュータブル   | [okurigana m1] | 元doc変更なし                 |
| 4.3 | 存在しないmarkId | [okurigana m1] | 元docそのまま返却（同一参照） |

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

## テスト実装の流れ

1. ヘルパー関数の定義
   - `assertValidDocument`
   - `createMultiBlockDocument`
2. 既存テストケースの書き換え（バリデーション統合追加）
3. 新規テストケースの追加（上記一覧のうち既存にないもの）
4. テスト実行・確認

<!-- validated -->
