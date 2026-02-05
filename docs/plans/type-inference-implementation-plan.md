# SKAM 型推論改善 実装計画 (Phase 1-3)

基づく設計ドキュメント: `docs/plans/type-inference-improvement-plan.md`
TypeScript: 5.9.3

## 概要

SKAM の型システムを改善し、Mark の配置方式を対等化、型マッピングによる単一ソース化、型安全なヘルパーを追加する。

## 対象ファイル

- `packages/skam/src/index.ts` — 型定義の変更・追加
- `packages/skam/src/operations/index.ts` — 操作API・型ガード・ヘルパー
- `packages/skam/src/__tests__/operations/queries.test.ts` — クエリテスト更新・追加
- `packages/skam/src/__tests__/operations/type-guards.test.ts` — 型ガードテスト追加
- `packages/skam-xml-stringify/src/stringify.ts` — 重複型ガードの統一
- `CLAUDE.md` — ドキュメント更新

## Phase 1: 配置方式の対等化（リネーム）

### Commit 1-1: MarkBase / AnchoredMark / PositionedMark 導入

**`packages/skam/src/index.ts`**:

1. `BaseMark` (L144-155) を `MarkBase` にリネームし、`anchor` を除去:
   ```typescript
   export interface MarkBase {
     type: MarkType;
     id?: string;
     placementHint?: string;
     ext?: Record<string, unknown>;
   }
   export interface AnchoredMark extends MarkBase {
     anchor: Anchor;
   }
   export interface PositionedMark extends MarkBase {
     position: Position;
   }
   ```
2. 11 種の anchor ベース Mark: `extends BaseMark` → `extends AnchoredMark`
3. `KutotenMark` (L204-218): `extends PositionedMark` に変更、独自宣言の `type`, `id?`, `position`, `placementHint?`, `ext?` を削除。`value`, `kind?` のみ残す
4. `RefMark` (L286-302): `extends PositionedMark` に変更、独自宣言の `type`, `id?`, `position`, `placementHint?`, `ext?` を削除。`label?`, `format?`, `content?` のみ残す
5. `BaseMark` を削除（後方互換エイリアス不要）
6. `MarkBase`, `AnchoredMark`, `PositionedMark` を export

**検証**: `pnpm typecheck && pnpm test`

### Commit 1-2: isAnchorBasedMark / isPositionBasedMark 更新

**`packages/skam/src/operations/index.ts`**:

1. `isAnchorBasedMark` 戻り型を `mark is AnchoredMark` に変更（L553-555）
2. `isPositionBasedMark` 戻り型を `mark is PositionedMark` に変更（L23-25）
3. 両関数に `'position' in mark` 禁止の JSDoc 警告追加
4. `AnchoredMark` を import に追加

**検証**: `pnpm typecheck && pnpm test`

### Commit 1-3: isPositionBasedMark の export + skam-xml-stringify 統一

**`packages/skam/src/operations/index.ts`**: `isPositionBasedMark` を export
**`packages/skam/src/index.ts`**: re-export に追加
**`packages/skam-xml-stringify/src/stringify.ts`**: ローカル `isAnchorBasedMark` (L183-186) を削除し、`@kanbun/skam` からの import に統一

**検証**: `pnpm typecheck && pnpm test`

### Commit 1-4: CLAUDE.md 更新

`BaseMark` → `MarkBase` / `AnchoredMark` / `PositionedMark` の新階層を反映

---

## Phase 2: MarkTypeMap + PersistedMark（型基盤整備）

### Commit 2-1: MarkTypeMap 追加、Mark を導出

**`packages/skam/src/index.ts`**:

1. 全 concrete Mark 定義の後に `MarkTypeMap` interface を追加（13 エントリ）
2. `Mark` を `MarkTypeMap[keyof MarkTypeMap]` から導出（手書き union を置換）
3. `MarkType` と `keyof MarkTypeMap` の整合性コンパイルタイムアサーション追加:
   ```typescript
   type _AssertKeysMatch = keyof MarkTypeMap extends MarkType
     ? MarkType extends keyof MarkTypeMap
       ? true
       : never
     : never;
   const _assertKeysMatch: _AssertKeysMatch = true;
   ```

**検証**: `pnpm typecheck && pnpm test`。仮に `MarkType` に `'fake'` を追加してコンパイルエラーになることを確認して戻す

### Commit 2-2: AnchoredMarkType / PositionedMarkType ユーティリティ型

**`packages/skam/src/index.ts`**:

```typescript
export type AnchoredMarkType = {
  [K in keyof MarkTypeMap]: MarkTypeMap[K] extends AnchoredMark ? K : never;
}[keyof MarkTypeMap];
export type PositionedMarkType = Exclude<MarkType, AnchoredMarkType>;
```

**検証**: `pnpm typecheck`

### Commit 2-3: PersistedMark 型追加

**`packages/skam/src/index.ts`**:

```typescript
export type PersistedMark = Mark & { id: string };
```

**検証**: `pnpm typecheck`

### Commit 2-4: getMarkById の戻り型を PersistedMark に変更

**`packages/skam/src/operations/index.ts`**:

- 戻り型を `Mark | undefined` → `PersistedMark | undefined`
- `as PersistedMark` キャストを使用（安全性根拠をコメントに記載）

**検証**: `pnpm typecheck && pnpm test`

### Commit 2-5: MarkUpdates + PersistedMark 互換性の型テスト

**`packages/skam/src/operations/index.ts`**:

```typescript
type _TestPersistedUpdates = MarkUpdates<PersistedMark>;
type _TestMarkUpdates = MarkUpdates<Mark>;
type _AssertUpdatesCompat = _TestPersistedUpdates extends _TestMarkUpdates
  ? _TestMarkUpdates extends _TestPersistedUpdates
    ? true
    : never
  : never;
const _assertUpdatesCompat: _AssertUpdatesCompat = true;
```

**検証**: `pnpm typecheck`

---

## Phase 3: Narrow ヘルパー（型安全アクセス）

### Commit 3-1: isMarkType 汎用型ガード

**`packages/skam/src/operations/index.ts`**:

```typescript
export function isMarkType<T extends MarkType>(mark: Mark, type: T): mark is MarkTypeMap[T] {
  return mark.type === type;
}
```

**テスト追加**: `type-guards.test.ts` にリテラル型ナローイング、不一致、position ベースのケース

**検証**: `pnpm typecheck && pnpm test`

### Commit 3-2: getMarkById オーバーロード（型ナローイング付き）

**`packages/skam/src/operations/index.ts`**:

```typescript
export function getMarkById(doc: SKAMDocument, markId: string): PersistedMark | undefined;
export function getMarkById<T extends MarkType>(
  doc: SKAMDocument,
  markId: string,
  type: T
): (MarkTypeMap[T] & { id: string }) | undefined;
```

type 引数がある場合、`found.type !== type` なら `undefined` を返す

**テスト追加**: `queries.test.ts` に type マッチ・不一致のケース

**検証**: `pnpm typecheck && pnpm test`

### Commit 3-3: filterMarksByType ヘルパー

**`packages/skam/src/operations/index.ts`**:

```typescript
export function filterMarksByType<T extends MarkType>(
  marks: readonly Mark[],
  type: T
): MarkTypeMap[T][] {
  return marks.filter((m): m is MarkTypeMap[T] => m.type === type);
}
```

**テスト追加**: `type-guards.test.ts` にフィルタリング、空配列、position ベースのケース

**検証**: `pnpm typecheck && pnpm test`

### Commit 3-4: getAnchoredMarksExactRange（anchor 専用）

**`packages/skam/src/operations/index.ts`**:
現行 `getMarksExactRange` と同じロジックを `AnchoredMark[]` 戻り型で提供。`type` パラメータは `AnchoredMarkType` のみ受け付ける。

**テスト追加**: `queries.test.ts`

**検証**: `pnpm typecheck && pnpm test`

### Commit 3-5: getPositionedMarksInRange（position 専用）

**`packages/skam/src/operations/index.ts`**:
position の `after` トークンが指定範囲内にあるマークを返す。`after` 未定義はマッチしない。`type` パラメータは `PositionedMarkType` のみ受け付ける。

**テスト追加**: `queries.test.ts` に範囲内/外、after 未定義、type フィルタのケース

**検証**: `pnpm typecheck && pnpm test`

### Commit 3-6: getMarksExactRange を混合版に拡張

**前提**: 実装前に全呼び出し元を再 grep し、`.anchor` 直接アクセスがないことを確認

**`packages/skam/src/operations/index.ts`**:

- position ベース除外ロジック (`if (isPositionBasedMark(mark)) return false;`) を削除
- position ベースは `after` トークンが範囲内にあればマッチ

**テスト更新**: `queries.test.ts` テスト 15.8 (L430-435) を `toHaveLength(0)` → `toHaveLength(1)` に変更

**検証**: `pnpm typecheck && pnpm test`

### Commit 3-7: getMarksExactRange オーバーロード（型ナローイング）

**`packages/skam/src/operations/index.ts`**:

```typescript
export function getMarksExactRange(doc: SKAMDocument, fromId: string, toId: string): Mark[];
export function getMarksExactRange<T extends MarkType>(
  doc: SKAMDocument,
  fromId: string,
  toId: string,
  type: T
): MarkTypeMap[T][];
```

**検証**: `pnpm typecheck && pnpm test`

---

## コミット依存関係

```
Phase 1: 1-1 → 1-2, 1-3, 1-4 (1-2〜1-4 は 1-1 に依存)
Phase 2: 2-1 → 2-2, 2-3 → 2-4 → 2-5
Phase 3: 3-1, 3-3 は 2-1 に依存
         3-2 は 2-4 + 3-1 に依存
         3-4 は 1-2 + 2-2 に依存
         3-5 は 1-1 + 2-2 に依存
         3-6 は 3-4 + 3-5 に依存
         3-7 は 3-6 + 2-1 に依存
```

## 各ステップの検証

各コミット後: `pnpm typecheck && pnpm test`
全 Phase 完了後: `pnpm build && pnpm test && pnpm typecheck && pnpm lint`

## 注意事項

1. **KutotenMark/RefMark の構造変更**: `extends PositionedMark` にする際、独立宣言の共通プロパティを確実に削除。`type` リテラルは narrowing として残す
2. **`exactOptionalPropertyTypes: true`**: PersistedMark の id narrowing に影響。`as` キャストの安全性根拠をコメント記載
3. **`verbatimModuleSyntax: true`**: runtime import と type import を分離
4. **Commit 3-6 実装前**: getMarksExactRange 呼び出し元の `.anchor` アクセスを再 grep 確認必須
5. **Phase 1/2 境界**: Mark 型の導出方法変更は Phase 2 で行う。Phase 1 では手書き union を維持
