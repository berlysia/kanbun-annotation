<!-- validated -->

# レ点アンカートークン変更 実装計画

## 概要

レ点（`value: 'レ'`）のアンカーを上のトークン（原文順で先）から下のトークン（原文順で後）に変更する。

関連 ADR: [ADR-004](../decisions/adr-004-kaeri-re-anchor-convention.md)

## 前提知識

### レ点の意味

レ点は隣接2トークンの読み順を入れ替える。ペア (A=上, B=下) があるとき:

- 原文順: A → B
- レ点による読み順: B → A

伝統的慣例: レ点は B（下の文字、先に読む方）の横に配置する。

### 現行のデータフロー

```
XML: ...token_A token_B<skam:kaeri kind="re"/>...
                  ↓
Parser: processKaeri(element, state, precedingTokenId=token_B)
                  ↓
JSON: { anchor: { from: token_B, to: token_B }, value: 'レ' }
                  ↓
Stringify: token_B<skam:kaeri kind="re"/>
                  ↓
Renderer: token_B の suffix-row に kaeriten 描画
```

パーサーの `precedingTokenId` ロジックが正しく機能するため、**XML上の配置を変えればコード変更なしで慣例変更が完了する**。

### 主要ファイル位置

| コンポーネント | ファイル                                       | 関連行番号                                           |
| -------------- | ---------------------------------------------- | ---------------------------------------------------- |
| kaeri型定義    | `packages/skam/src/index.ts`                   | 171-176                                              |
| XMLパーサー    | `packages/skam-xml-parser/src/parser-core.ts`  | 330-346 (`processKaeri`)                             |
| stringify      | `packages/skam-xml-stringify/src/stringify.ts` | 258-262 (kaeriAfter), 573-578 (XML出力)              |
| レンダラー     | `packages/skam-html-renderer/src/renderer.ts`  | 400-446 (`getMarksForToken`), 932-960 (kaeriten描画) |

## 実装手順

### Step 1: 仕様書更新

#### `SKAM-ML-draft.md` Section 7.2 (L166-201)

```xml
<!-- 現行 -->
<skam:block>
  學而<skam:kaeri kind="re"/>時習之
</skam:block>

<!-- 変更後（標準読み pair (習,之) に合わせる） -->
<skam:block>
  學而時習之<skam:kaeri kind="re"/>
</skam:block>
```

正規化ルール (L201) に注記追加:

```
- `anchor = 直前token`
- **レ点の配置慣例**: レ点はペアの下のトークン（原文順で後）の直後に配置する
```

#### `SKAM-draft.md` Appendix A (L864-869)

確認のみ: 既に `anchor: { from: "t5", to: "t5" }` (t5=之=下のトークン) ✓

### Step 2: XMLフィクスチャ更新

#### `packages/skam-xml-parser/src/__tests__/fixtures/valid/kaeri-basic.xml`

```xml
<!-- 現行 -->
<skam:block>學而<skam:kaeri kind="re"/>時習之</skam:block>

<!-- 変更後: pair (習,之), レ点は之(下)の後 -->
<skam:block>學而時習之<skam:kaeri kind="re"/></skam:block>
```

#### `packages/skam-xml-parser/src/__tests__/fixtures/valid/kaeri-all-kinds.xml` L15

```xml
<!-- 現行 -->
習<skam:kaeri kind="re"/>之

<!-- 変更後: pair (習,之), レ点は之(下)の後 -->
習之<skam:kaeri kind="re"/>
```

#### `packages/skam-xml-parser/src/__tests__/fixtures/valid/kaeri-compound.xml` L7

```xml
<!-- 現行 -->
不<skam:kaeri kind="ichi-re"/>可不<skam:kaeri kind="re"/>學

<!-- 変更後: 一レは変更しない(スコープ外)、レのみ移動。pair (不,學), レ点は學(下)の後 -->
不<skam:kaeri kind="ichi-re"/>可不學<skam:kaeri kind="re"/>
```

#### `packages/skam-xml-parser/src/__tests__/fixtures/valid/readme-example.xml` L6

```xml
<!-- 現行: 時の直後にkaeriがある（ペアとは無関係な位置 = バグ） -->
時<skam:kaeri kind="re"/><skam:kun soe="を">之</skam:kun><skam:kun okuri="ふ">習</skam:kun>

<!-- 変更後: pair (習,之), レ点は之(下)の後 -->
時<skam:kun soe="を">之</skam:kun><skam:kaeri kind="re"/><skam:kun okuri="ふ">習</skam:kun>
```

#### `packages/skam-xml-parser/src/__tests__/fixtures/valid/multiple-blocks.xml` L8

**変更不要**: 既にレ点が之(下)の直後 ✓

### Step 3: パーサーテスト更新

#### `packages/skam-xml-parser/src/__tests__/parser.test.ts` L39-54

```typescript
// kaeri-basic.xml パーステスト
// 現行: expect(kaeri.anchor.from).toBe('t2'); // 而
// 変更後: 之 は5番目のトークン → t5
expect(kaeri.anchor.from).toBe('t5');
expect(kaeri.anchor.to).toBe('t5');
```

### Step 4: stringifyテスト更新

#### `packages/skam-xml-stringify/src/__tests__/stringify.test.ts`

**L77-101**: レ点 stringify テスト

```typescript
// 3トークン (學, 而, 時) でペア (而, 時)
// 現行: anchor: { from: 't2' }, expect: '學而<skam:kaeri kind="re"/>時'
// 変更後: レ点は下のトークン (時=t3)
anchor: { from: 't3', to: 't3' },
// 期待: '學而時<skam:kaeri kind="re"/>'
```

**L505-520 付近**: saidoku + kaeri テスト（anchor を下のトークンに変更）
**L830-840 付近**: その他kaeriテスト（anchor を下のトークンに変更）

### Step 5: roundtripテスト更新

#### `packages/integration-tests/src/__tests__/roundtrip.test.ts`

以下の箇所でレ点のanchor と期待XMLを更新:

- L55-73: 基本kaeri roundtrip
- L84-113: 複合kaeri roundtrip
- L590-610: saidoku + kaeri roundtrip
- L724-740: 追加roundtripテスト
- L798-825: 追加roundtripテスト

**roundtrip の一貫性確認**: JSON(anchor=下のトークン) → stringify → XML(kaeri after 下のトークン) → parse → JSON(anchor=下のトークン)

### Step 6: Tier 2テスト（意味的に正しい漢文例の更新）

以下のテストファイルで、実際の漢文を模した例のレ点アンカーを個別確認:

- `packages/skam/src/__tests__/examples.test.ts` L23 → ✓ 既に正しい
- `packages/skam-html-renderer/src/__tests__/` の各テスト → single-token テストは変更不要
- `packages/playground/src/editor/__tests__/` → 個別確認

**判断基準**: single-token doc（`createSingleTokenDoc`）や純粋なCRUDテストは変更不要。具体的な漢文文例で、レ点が明確に上のトークンにアンカーされている場合のみ更新。

### Step 7: 変更不要なテスト（Tier 3）

以下は変更しない（理由: 純粋なAPI操作テスト、漢文意味論を検証していない）:

- `packages/skam/src/__tests__/operations/crud.test.ts`
- `packages/skam/src/__tests__/operations/comprehensive-marks.test.ts`（mark coexistence）
- `packages/skam/src/__tests__/operations/queries.test.ts`
- `packages/skam/src/__tests__/operations/type-guards.test.ts`
- `packages/skam/src/__tests__/validator.test.ts`

## 検証手順

```bash
# 1. 全テスト
pnpm test

# 2. 型チェック
pnpm typecheck

# 3. roundtrip の一貫性を重点確認
pnpm --filter integration-tests test

# 4. リント
pnpm lint

# 5. playground でレンダリング確認（任意）
pnpm playground:dev
```

## 注意事項

### 複合返り点との不整合

`value: '一レ'` 等の複合返り点は今回変更しない。一部フィクスチャ（kaeri-compound.xml）で一レが上のトークン、レが下のトークンにアンカーする不整合が生じる。将来課題として ADR-004 に記録済み。

### XMLの原文順 vs 訓読順

SKAM-ML仕様には2つのトークン配列方式がある:

- **原文順** (Section 7.2): `學而時習之` — トークンが原文の出現順
- **訓読順** (Section 11.1): `學而時之習` — トークンが読み順

今回の変更は原文順XMLを主対象とする。訓読順XMLでは `precedingTokenId` が自然に下のトークンになるケースが多い（`multiple-blocks.xml` 参照）。

### 影響のあるパッケージ

- `@kanbun-skam/skam-xml-parser` — フィクスチャ + テスト
- `@kanbun-skam/skam-xml-stringify` — テスト
- `integration-tests` — roundtripテスト
- `SKAM-ML-draft.md` — 仕様書
- （間接的に）`@kanbun-skam/skam-html-renderer`, `@kanbun-skam/playground` — Tier 2テスト

### 変更しないコンポーネント

- パーサーコード (`parser-core.ts`)
- stringifyコード (`stringify.ts`)
- レンダラーコード (`renderer.ts`)
- SKAM型定義 (`index.ts`)
- `SKAM-draft.md` JSON仕様（既に正しい）
