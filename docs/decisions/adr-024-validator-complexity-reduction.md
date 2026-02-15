# ADR-024: Validator 複雑度削減

## ステータス

Accepted

## コンテキスト

`packages/skam/src/validator.ts` の `validateMark()` 関数は CC 45（推定）・279 行で、13 種のマーク型を単一 switch-case で処理している。マーク型追加や検証ロジック変更時に関数全体を読む必要があり、テストも関数単位でしか書けない。

### 現状の構造

```
validateMark(mark, index, errors)
  ├─ 共通: オブジェクト型チェック
  ├─ 共通: type フィールド検証
  ├─ 共通: anchor/position 配置方式分岐
  └─ switch(markType) — 13 ケース
      ├─ kaeri/okurigana/yomigana/soegana: value 必須（string）
      ├─ okimoji/joji: 追加フィールドなし
      ├─ kutoten: value + kind enum
      ├─ emphasis: style（任意）
      ├─ saidoku: forms[] 配列 → validateSaidokuForm()
      ├─ okototen: GlyphGridCoord + shape
      ├─ tateten: フィールドなし
      ├─ highlight: style enum + ref（任意）
      └─ ref: 3-way 制約（label/format/content）
```

### 共通パターンの分析

| パターン             | 対象マーク型                                                  | 検証内容                                                      |
| -------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| value 必須（string） | kaeri, okurigana, yomigana, soegana, kutoten                  | `isString(mark['value'])`                                     |
| フィールドなし       | okimoji, joji, tateten                                        | 追加検証不要                                                  |
| オプション列挙       | kutoten(kind), emphasis(style), highlight(style), ref(format) | `'key' in mark && mark['key'] !== undefined` 後に候補チェック |
| forms[] 配列         | saidoku                                                       | `validateSaidokuForm()` で個別検証                            |
| 複合制約             | ref                                                           | label/format 排他 + 少なくとも 1 つ必須                       |
| 特殊座標             | okototen                                                      | `validateGlyphGridCoord()` + shape 必須                       |

## 検討した選択肢

### Option A: 型別バリデーター関数に分離

- 利点: 各関数が小さく、テストが型単位で書ける。既存の `validateSaidokuForm()` と同じパターン
- 利点: `validateMark()` は型判定 + dispatch のみ（CC ≈ 15 → dispatch 部分のみ）
- 欠点: 関数数が増える（13 + 共通ヘルパー）

### Option B: バリデーターレジストリ (Map)

- 利点: Open/Closed Principle。新マーク型追加時にレジストリ登録のみ
- 欠点: 間接参照で可読性低下。P2 の declarative schema 化と方向性が重複

### Option C: 共通フィールド抽出 + 最小 switch

- 利点: 変更量が最小
- 欠点: CC 削減効果が限定的（目標 CC 8 に届かない可能性）

## 決定

**Option A（型別バリデーター関数に分離）** を採用する。

### 分解方針

#### 1. `validateMark()` のリファクタリング（P0）

`validateMark()` を以下の構造に変更:

```typescript
function validateMark(mark: unknown, index: number, errors: ValidationError[]): mark is Mark {
  const path = `marks[${index}]`;
  // 1. 共通チェック（オブジェクト型、type フィールド、anchor/position）
  // 2. 型判定 + dispatch
  switch (markType) {
    case 'kaeri':
      return validateKaeriMark(mark, path, errors);
    case 'okurigana':
      return validateOkuriganaMark(mark, path, errors);
    // ... 13 種
  }
}
```

#### 2. 型別バリデーター関数

| 関数名                    | 対象型                       | 予想行数     |
| ------------------------- | ---------------------------- | ------------ |
| `validateKaeriMark()`     | kaeri                        | ~5           |
| `validateValueMark()`     | okurigana, yomigana, soegana | ~5（共通化） |
| `validateNoFieldMark()`   | okimoji, joji, tateten       | ~3（共通化） |
| `validateKutotenMark()`   | kutoten                      | ~15          |
| `validateEmphasisMark()`  | emphasis                     | ~10          |
| `validateSaidokuMark()`   | saidoku                      | ~15          |
| `validateOkototenMark()`  | okototen                     | ~12          |
| `validateHighlightMark()` | highlight                    | ~20          |
| `validateRefMark()`       | ref                          | ~40          |

共通パターンが同一の型（value 必須、フィールドなし）は共通関数に委任可能。

#### 3. 共通ヘルパー

```typescript
// オプション列挙フィールドの検証
function validateOptionalEnum<T extends string>(
  mark: Record<string, unknown>,
  key: string,
  validValues: readonly T[],
  path: string,
  errors: ValidationError[]
): boolean;

// value 必須フィールドの検証（kaeri, okurigana, yomigana, soegana, kutoten）
function validateRequiredStringField(
  mark: Record<string, unknown>,
  key: string,
  path: string,
  errors: ValidationError[]
): boolean;
```

### P2 方向性: Declarative Schema 化（未確定）

P0 完了後の知見を元に、以下の方向を検討する:

- マーク型ごとの検証ルールを宣言的スキーマ（JSON/TypeScript オブジェクト）で定義
- スキーマからバリデーターを自動生成
- ただし okototen の GlyphGridCoord 検証や ref の 3-way 制約など、宣言的に表現しにくいケースの扱いが課題

## 予想される効果

| メトリクス          | 現状     | P0 後                         |
| ------------------- | -------- | ----------------------------- |
| `validateMark()` CC | 45       | ~15（dispatch のみ）          |
| 最大関数 CC         | 45       | ~15（validateRefMark が最大） |
| テスト粒度          | 関数単位 | 型単位                        |

## テスト戦略

- 既存の `validateMark` テストをリグレッションゲートとして維持
- 抽出した型別バリデーターにユニットテストを追加
- 特に ref の 3-way 制約テストを重点的に

## 受け入れ条件

- `validateMark()` が型判定 + dispatch のみに縮退している
- 各型別バリデーター関数が独立してテスト可能
- 既存テストが全件パスする
- `pnpm --filter @kanbun/skam test` 成功
- `pnpm typecheck` 成功

## 影響

### ポジティブ

- 型単位でのテスト・修正が可能になる
- 新マーク型追加時の影響範囲が局所化される
- コードレビュー時に関連する型のバリデーターのみ確認すれば良い

### ネガティブ

- 関数数が増える（validator.ts 内、またはファイル分割）
- 共通パターンの抽象化が過剰になるリスク

## 参考

- `packages/skam/src/validator.ts`
- `packages/skam/src/__tests__/validator.test.ts`
- `.tmp/structure-analysis.md`
