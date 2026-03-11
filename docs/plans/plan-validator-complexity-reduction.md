# Validator 複雑度削減

## 概要

`validateMark()` 関数（CC 45・279 行）を型別バリデーター関数に分解し、CC ~15 に削減する。

関連 ADR: [ADR-024](../decisions/adr-024-validator-complexity-reduction.md)

## 前提知識

- `validator.ts` の `validateMark()` は 13 種のマーク型を単一 switch-case で処理
- 既存の `validateSaidokuForm()` が型別バリデーターの先行パターン
- 共通パターン: value 必須（5 型）、フィールドなし（3 型）、オプション列挙（4 型）

## 実装計画

### Step 1: 共通ヘルパーの抽出

`validateRequiredStringField()` と `validateOptionalEnum()` を作成。既存コードから抽出する。

### Step 2: 型別バリデーター関数の作成

switch-case の各ケースを独立関数に抽出。共通パターンの型は共通関数に委任:

| 関数                      | 対象型                                       |
| ------------------------- | -------------------------------------------- |
| `validateValueMark()`     | okurigana, yomigana, soegana                 |
| `validateNoFieldMark()`   | okimoji, joji, tateten                       |
| `validateKaeriMark()`     | kaeri                                        |
| `validateKutotenMark()`   | kutoten                                      |
| `validateEmphasisMark()`  | emphasis                                     |
| `validateSaidokuMark()`   | saidoku（既存 `validateSaidokuForm` を活用） |
| `validateOkototenMark()`  | okototen                                     |
| `validateHighlightMark()` | highlight                                    |
| `validateRefMark()`       | ref                                          |

### Step 3: `validateMark()` の簡素化

共通チェック（オブジェクト型、type、anchor/position）+ switch dispatch のみに縮退。

### Step 4: テスト追加

- 既存テストをリグレッションゲートとして維持
- 抽出した型別バリデーターに個別ユニットテストを追加
- ref の 3-way 制約テストを重点的に追加

## リスクと軽減策

| リスク                         | 影響度 | 軽減策                                  |
| ------------------------------ | ------ | --------------------------------------- |
| 共通パターン抽象化が過剰になる | 低     | 共有部分が 3 行以上のパターンのみ共通化 |
| テスト更新漏れ                 | 中     | 既存テスト全件パスを確認                |

## 検証方法

- `pnpm --filter @kanbun-skam/skam test` 成功
- `pnpm typecheck` 成功
- `pnpm lint` で `validateMark` の complexity warning が消えることを確認

<!-- validated -->
