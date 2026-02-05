# SKAM 型推論改善計画（アイデア記録）

## 目的

SKAM オペレーション API の型推論を強化し、「参照の取得 → 操作」のフローで型情報が自然に伝播するようにする。

## 現状の問題

1. **lookup → 操作の型断絶**: `getMarkById(doc, id)` が `Mark | undefined` を返し、操作関数への型伝播がない
2. **文字列 ID の型的無味**: `markId: string` がどの Mark 型か型レベルで不明
3. **クエリ結果の一律 `Mark[]`**: `type` フィルタを渡しても戻り値がナローイングされない
4. **anchor/position の二級市民問題**: `BaseMark` が anchor ベースのみの基底で、kutoten/ref は基底なし
5. **`BaseMark.id` が optional**: operations API では常に存在するが型が保証しない

## 確定した設計判断

### clarify で決定済み

| 項目                         | 決定                         | 理由                                                                     |
| ---------------------------- | ---------------------------- | ------------------------------------------------------------------------ |
| 共通基底型                   | **Option B (MarkBase 抽出)** | PersistedMark 等の派生型定義がシンプルになる                             |
| PersistedMark スコープ       | **既存 API の戻り値も変更**  | 一貫性重視。破壊的変更を許容                                             |
| SKAMDocument.marks の型      | **Mark[] のまま**            | 仕様上 id は optional。パーサーとの整合性維持                            |
| Mark 導出方法                | **MarkTypeMap から導出**     | `Mark = MarkTypeMap[keyof MarkTypeMap]` で単一ソース化                   |
| getMarksExactRange           | **既存を混合版に拡張**       | anchor+position 両方返す。anchor 専用・position 専用を新設               |
| getMarkById と型ナローイング | **オーバーロード追加**       | `getMarkById(doc, id, 'emphasis')` で PersistedMark<EmphasisMark> を返す |
| 汎用型ガード                 | **isMarkType を追加**        | `isMarkType(mark, 'emphasis')` で MarkTypeMap[T] にナローイング          |
| コミット戦略                 | **小さく分割**               | リネーム、MarkTypeMap、PersistedMark、各ヘルパー等を個別コミット         |
| スコープ                     | **アイデア記録**             | 実装は別セッションで改めて計画                                           |

## 計画

### Phase 1: 配置方式の対等化（リネーム）

`BaseMark` を廃止し、anchor/position それぞれに対等な基底型を導入する。

```typescript
// 共通基底（Option B）
interface MarkBase {
  type: MarkType;
  id?: string;
  placementHint?: string;
  ext?: Record<string, unknown>;
}

interface AnchoredMark extends MarkBase {
  anchor: Anchor;
}

interface PositionedMark extends MarkBase {
  position: Position;
}
```

- 11 種の anchor ベース Mark は `AnchoredMark` を extends
- kutoten, ref は `PositionedMark` を extends
- 既存の `BaseMark` は削除（型エイリアスでの後方互換は不要）

**影響範囲**:

- `packages/skam/src/index.ts`: 型定義の変更
- `packages/skam/src/operations/index.ts`: 型ガード戻り型の更新（`mark is AnchoredMark` 等）
- `packages/skam-xml-stringify/src/stringify.ts`: 独自定義の `isAnchorBasedMark` を削除し、@kanbun/skam の export を使用
- 各パッケージの import 修正

### Phase 2: MarkTypeMap + PersistedMark（型基盤整備）

```typescript
// 中央マッピング型
interface MarkTypeMap {
  kaeri: KaeriMark;
  okurigana: OkuriganaMark;
  yomigana: YomiganaMark;
  okimoji: OkimojiMark;
  joji: JojiMark;
  soegana: SoeganaMark;
  kutoten: KutotenMark;
  emphasis: EmphasisMark;
  saidoku: SaidokuMark;
  okototen: OkototenMark;
  tateten: TatetenMark;
  highlight: HighlightMark;
  ref: RefMark;
}

// 導出
type Mark = MarkTypeMap[keyof MarkTypeMap];
type MarkType = keyof MarkTypeMap;

// id 確定済み（operations API 用）
type PersistedMark = Mark & { id: string };
```

**配置方式の型レベル分離**:

```typescript
type AnchoredMarkType = {
  [K in keyof MarkTypeMap]: MarkTypeMap[K] extends AnchoredMark ? K : never;
}[keyof MarkTypeMap];
type PositionedMarkType = Exclude<MarkType, AnchoredMarkType>;
```

**PersistedMark の適用範囲**:

- operations API の戻り値: `getMarkById` → `PersistedMark | undefined`
- `SKAMDocument.marks` は `Mark[]` のまま（仕様上 id は optional）

### Phase 3: Narrow ヘルパー（型安全アクセス）

#### 3a. 汎用型ガード

```typescript
function isMarkType<T extends MarkType>(mark: Mark, type: T): mark is MarkTypeMap[T];
```

#### 3b. getMarkById オーバーロード

```typescript
// 既存（後方互換）
function getMarkById(doc: SKAMDocument, markId: string): PersistedMark | undefined;
// 型ナローイング付き
function getMarkById<T extends MarkType>(
  doc: SKAMDocument,
  markId: string,
  type: T
): (MarkTypeMap[T] & { id: string }) | undefined;
```

#### 3c. filterMarksByType

```typescript
function filterMarksByType<T extends MarkType>(marks: Mark[], type: T): MarkTypeMap[T][];
```

#### 3d. getMarksExactRange の分離

- **既存を混合版に拡張**: anchor + position 両方返す（position は範囲前後の mark を含む）
- **anchor 専用**: `getAnchoredMarksExactRange(doc, fromId, toId, type?)` — anchor ベースのみ
- **position 専用**: `getPositionedMarksInRange(doc, fromId, toId, type?)` — position ベースのみ
- 混合版は type 引数付きで MarkTypeMap[T][] を返すオーバーロードも提供

### Phase 4: MarkRef（型付き参照、任意）

操作チェーンが頻発する具体的ユースケースが出てから導入を判断。

```typescript
type MarkRef<M extends Mark = Mark> = {
  id: string;
  mark: M & { id: string };
};

function updateByRef<M extends Mark>(
  doc: SKAMDocument,
  ref: MarkRef<M>,
  updates: MarkUpdates<M>
): { doc: SKAMDocument; ref: MarkRef<M> };
```

- doc は MarkRef に持たない（staleness 回避）
- anchor/position 分離は操作関数のオーバーロードで対応

### 見送り

- **Branded ID**: friction が高い（JSON デシリアライズ境界でキャストが増える）
- **DocumentView**: 明確なユースケース待ち
- **Lens**: 過剰設計

## 設計課題の検討結果

### P0: MarkTypeMap の循環参照問題 ✅ 解決

**課題**: MarkBase が `type: MarkType` を持ち、`MarkType = keyof MarkTypeMap` で、MarkTypeMap が各 Mark を参照する循環が起きうる。

**結論**: 現行コードの構造がそのまま解決策になっている。循環は発生しない。

**根拠**: 現在の index.ts (L122-135) で `MarkType` は既にリテラル union として手書き定義されており、`keyof MarkTypeMap` から導出していない。この構造を維持したまま MarkTypeMap を全 concrete Mark 定義の後に追加し、`Mark = MarkTypeMap[keyof MarkTypeMap]` で導出すれば、依存方向は `MarkType(リテラル) → MarkBase → concrete Marks → MarkTypeMap → Mark(導出)` の一方向になる。

```typescript
// 先行定義（真実の源、現行コードと同じ手書きリテラル union）
type MarkType = 'kaeri' | 'okurigana' | ... | 'ref';

// MarkBase は MarkType を使う
interface MarkBase { type: MarkType; ... }

// concrete Marks（MarkBase を extends）
interface KaeriMark extends AnchoredMark { type: 'kaeri'; ... }
// ...

// MarkTypeMap は全 concrete Mark 定義の後に配置
interface MarkTypeMap { kaeri: KaeriMark; ... }

// Mark は MarkTypeMap から導出
type Mark = MarkTypeMap[keyof MarkTypeMap];

// 整合性検証（MarkType と keyof MarkTypeMap が一致することをコンパイルエラーで保証）
// 型だけの定義はエラーにならないため、const 変数で実効化する
type _AssertKeysMatch = keyof MarkTypeMap extends MarkType
  ? MarkType extends keyof MarkTypeMap ? true : never
  : never;
const _assertKeysMatch: _AssertKeysMatch = true; // 不一致時にコンパイルエラー
```

**注意**: MarkType（リテラル union）と MarkTypeMap の二箇所を同期更新する必要がある。新しい Mark 型を追加する際の手順をコード内コメントで明記すること。

### P0: PersistedMark のキャスト安全性 ✅ 解決

**課題**: `getMarkById` が `Mark | undefined` を返すところを `PersistedMark | undefined` に変える際、`as` キャストが必要になる。安全か？

**結論**: 安全。`as PersistedMark` を使い、コメントで根拠を記述する。

**根拠**: `getMarkById` の実装 (operations/index.ts:142-144) は `doc.marks.find(m => m.id === markId)` を使う。`m.id === markId` がマッチした時点で `id` は `string` であることが実行時に保証される。`PersistedMark = Mark & { id: string }` なので、find がマッチを返した時点で実行時の値は PersistedMark の構造を満たしている。TypeScript の control flow analysis は `find` コールバック内の narrowing を外に伝播しないため `as` が必要だが、実行時の安全性は find の条件式で担保されている。

**検討した代替案**: `as` を回避し、find の後に `found.id !== undefined` で narrowing する方法もある。プロジェクトは `exactOptionalPropertyTypes: true` なので、`id?: string` は `string` のみを許容（`undefined` の明示代入不可）。この場合 `found.id !== undefined` チェックで `{ id: string }` に narrowing される可能性がある。ただし TypeScript が `Mark & { id: string }` を `PersistedMark` と同一視するかは PersistedMark の定義方法に依存する。実装時にどちらのパターンがより自然か判断する。いずれにせよ、find の条件式変更時にキャスト安全性の前提が崩れるリスクがあるため、コメントで根拠を明記する方針は維持する。

### P0: getMarksExactRange 混合版の破壊的変更 ✅ 解決（安全、要テスト更新）

**課題**: 既存の呼び出し元が「anchor ベースのみ返る」前提で `mark.anchor` にアクセスしている場合、position ベースも返す混合版への拡張は破壊的変更になる。

**結論**: 全呼び出し元を調査した結果、`.anchor` への直接アクセスは 0 件。安全に拡張可能。ただしテスト 15.8 の更新が必要。

**根拠**: Grep で全呼び出し元を調査（計画作成時点のスナップショット。**実装時に再度 grep で確認すること**）:

- **playground/main.ts:512**: `getMarksExactRange(doc, fromId, toId, 'tateten')` — type フィルタ付き。結果は `tatetenMarks[0]` で存在チェックのみ、`.anchor` アクセスなし
- **playground/main.ts:517**: `getMarksExactRange(doc, fromId, toId, 'kaeri')` — 同上、`hasMarkValue(firstKaeri)` で value チェックのみ
- **playground/main.ts:1202**: `getMarksExactRange(newDoc, anchorFrom, anchorTo, 'kaeri')` — `kaeriToRemove?.id` で id チェックのみ
- **queries.test.ts**: 全 11 テストケースで `toHaveLength` や `result[0]?.type` のみ。`.anchor` 直接アクセスなし
- **scenarios.test.ts**: 全 4 箇所で `toHaveLength` のみ

さらに、全呼び出し元が type フィルタ（`'tateten'`, `'kaeri'`, `'yomigana'`）を渡しており、これらは全て anchor ベース型。type フィルタ付きの場合は混合版でも position ベースの mark が混入しない。

**「混合版に拡張」の具体的な意味**: 現在の実装 (operations/index.ts:447-448) は `if (isPositionBasedMark(mark)) return false;` で position ベースを明示的に除外している。混合版への拡張とは、この除外ロジックを削除し、position ベースの mark も範囲判定に含める変更を指す。具体的には position の `after` トークンが指定範囲内にあれば結果に含める。

**テストへの影響**: テストケース 15.8「position-based は除外」(queries.test.ts:430-435) は混合版で期待値が変わる。kutoten の `after: 't1'` が範囲 `t1〜t1` に含まれるため、`toHaveLength(0)` → `toHaveLength(1)` に更新が必要。この変更は意図的であり、混合版の仕様変更に伴うもの。

### P1: OkototenMark の position プロパティ ✅ 解決（制約付き）

**課題**: OkototenMark は `position: GlyphGridCoord` を持つが、PositionedMark も `position: Position` を持つ。型レベルの衝突や `'position' in mark` ガードの誤判定が起きないか。

**結論**: 型レベルの衝突はない。ただし `'position' in mark` による判定は禁止する制約を設ける。

**根拠**: OkototenMark は AnchoredMark を extends するため、PositionedMark の型パスとは無関係。`GlyphGridCoord` と `Position` は完全に異なる型（`system: 'glyph-grid'` vs `blockId: string`）なので structural typing でも混同されない。ただし JavaScript ランタイムの `'position' in mark` は OkototenMark でも `true` を返す。したがって:

- `isPositionBasedMark` の実装は現行通り `mark.type === 'kutoten' || mark.type === 'ref'` の type リテラル判定を維持する（operations/index.ts:23-25 で既にそうなっている）
- **`'position' in mark` による anchor/position 判定は禁止**

**制約の実効化**: コードレビュー頼みでは漏れるリスクがある。`isPositionBasedMark` / `isAnchorBasedMark` 関数の JSDoc に「`'position' in mark` を直接使わないこと」の警告コメントを追加し、型ガード関数の使用を促す。将来新しい Mark 型が `position` プロパティを持つ場合にも同じ問題が発生するため、Mark 型設計のガイドラインとして記録する。

### P1: isMarkType の型ガード実装 ✅ 解決

**課題**: `isMarkType<T extends MarkType>(mark: Mark, type: T): mark is MarkTypeMap[T]` は TypeScript で正しく動作するか。

**結論**: discriminated union に対する user-defined type guard の標準パターンで動作する。

**根拠**: TypeScript の user-defined type guard は、戻り型に `mark is X` を宣言し、本体で `return mark.type === type` と書けば、呼び出し側で narrowing が効く。`T` はリテラル型に推論されるため、`isMarkType(mark, 'emphasis')` で `T = 'emphasis'` → `mark is MarkTypeMap['emphasis']` → `mark is EmphasisMark` として機能する。Mark は `type` プロパティで discriminated union を構成しているので、`mark.type === type` の実行時判定と型レベルの narrowing が一致する。これは TypeScript ハンドブックの [User-Defined Type Guards](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates) の標準パターン。

**エッジケース: 変数渡し**: `const t = 'emphasis'; isMarkType(mark, t)` の場合、`t` が `string` に widening されると `T = string` になり、`T extends MarkType` の制約に違反してコンパイルエラーになる。これは意図通りの挙動であり、リテラルか `as const` か `MarkType` 型の変数のみが受け入れられる。`const t: MarkType = 'emphasis'; isMarkType(mark, t)` の場合は `T = MarkType` に推論され、`mark is MarkTypeMap[MarkType]` = `mark is Mark` となりナローイングされない（元と同じ）。これも論理的に正しい挙動。

**filter との組み合わせ**: `marks.filter(m => isMarkType(m, 'emphasis'))` の戻り値型は TypeScript 5.5+ の filter type predicate 推論改善で `EmphasisMark[]` になる可能性があるが、プロジェクトの TS バージョンに依存する。確実な narrowing には `filterMarksByType` ヘルパーを使う。

### P1: MarkUpdates と PersistedMark の互換性 ✅ 解決（要型テスト）

**課題**: `MarkUpdates<PersistedMark>` が distributive conditional で正しく分配されるか。

**結論**: 理論上は `MarkUpdates<Mark>` と同等になるため問題ない。ただし実装時に型テストで確認する。

**根拠**: `MarkUpdates<M>` の型パラメータに渡されるのは具体的な Mark 型（`MarkUpdates<EmphasisMark>` 等）か、デフォルトの `Mark`（= 全型の union）。主要なフローでは PersistedMark が MarkUpdates の型引数に直接渡されることはない:

- `getMarkById` → `PersistedMark | undefined` を受け取る
- `updateMark<EmphasisMark>(doc, mark.id, { style: ... })` — 型引数は具体型

ただし、ユーザーが `typeof mark` で型推論するパターンは自然に書きうる:

```typescript
const mark = getMarkById(doc, id); // PersistedMark | undefined
if (mark) {
  const updates: MarkUpdates<typeof mark> = { ... }; // MarkUpdates<PersistedMark>
}
```

理論上の評価: `PersistedMark = Mark & { id: string }` で、`Mark` がユニオンなので distributive で各メンバーに分配され、`Partial<Omit<KaeriMark & { id: string }, 'type' | 'id'>>` = `Partial<Omit<KaeriMark, 'type' | 'id'>>` と同等になる。結果は `MarkUpdates<Mark>` と同じになるはず。

**実装時の検証**: 検証コストが低いため、Phase 2 で PersistedMark を導入する際に以下の型テストを追加する:

```typescript
type _TestPersistedUpdates = MarkUpdates<PersistedMark>;
type _TestMarkUpdates = MarkUpdates<Mark>;
// 両者が同等であることを静的に検証
```

### P2: buildTokenIndexMap のパフォーマンス 📌 スコープ外

**課題**: 7+ 箇所で毎回 Map を再生成。Phase 3 でさらに増加する可能性。

**結論**: Phase 1-3 のスコープ外として据え置き。別課題として追跡する。

**根拠**: Phase 3 の新規ヘルパーのうち、型ベースのもの（isMarkType, filterMarksByType, getMarkById オーバーロード）は buildTokenIndexMap を使わない（type リテラル比較と find のみ）。ただし、Phase 3d の範囲クエリ系新関数は buildTokenIndexMap を使用する見込み:

- `getAnchoredMarksExactRange`: 既存の getMarksExactRange と同じロジック → buildTokenIndexMap を使う（+1）
- `getPositionedMarksInRange`: position の after が範囲内かの判定 → buildTokenIndexMap を使う（+1）

現在の 6 箇所から最大 8 箇所に増加する見込み。キャッシング戦略（WeakMap ベース等）は Phase 3 以降の独立した最適化課題とする。なお、イミュータブル操作で毎回新しい doc オブジェクトになるため、WeakMap のキーとして機能しない可能性がある。content hash や version 番号ベースのキャッシュも検討対象とする。

## 検証結果

### logic-validator（初回）

1. MarkRef に doc を持たせると連鎖操作時にドキュメント分岐が起きる → doc は持たない設計に修正
2. `BaseMark.id` optional vs 必須の矛盾 → `PersistedMark` で解決
3. MarkRef と Branded ID は排他的選択 → MarkRef を選択、Branded ID は見送り
4. MarkType の真実の源 → `Mark = MarkTypeMap[keyof MarkTypeMap]` で単一ソース化
5. anchor/position 型分離が MarkRef で欠落していた → Phase 1 のリネームで解決

### logic-validator（clarify 後）

1. **PersistedMark のキャスト安全性**: `getMarkById` 内の find は id マッチで保証 → アサーション安全
2. **MarkTypeMap 循環参照**: MarkType をリテラル union で先行定義する必要あり → 計画修正済み
3. **getMarksExactRange 破壊的変更**: 呼び出し元の anchor 前提アクセスを調査する必要あり
4. **OkototenMark position**: 型パスが異なるので衝突しない。ただし `'position' in mark` に注意
5. **isMarkType**: user-defined type guard として機能する。playground で確認推奨
6. **MarkUpdates + PersistedMark**: distributive 動作の実験が必要
7. **buildTokenIndexMap**: Phase 3 の新規ヘルパーは直接使わない。別課題として追跡

### Codex レビュー（初回）

1. Phase 2 + 3 だけで痛みの8割は解消される
2. `MarkTypeMap` と `Mark` の二重定義を避ける（単一ソース化）
3. `isAnchorBasedMark` 等のガード関数が ergonomics の鍵
4. Phase 4 以降は「明確な課題が出てから」で十分
5. MarkRef に doc を持たせるのは immutable モデルと相性が悪い

### logic-validator（設計課題検討後）

設計課題の検討結果 7 件を検証。4 件は論理的に正しいと確認、3 件に不完全な点を検出:

1. **P0-3 getMarksExactRange**: 「混合版に拡張」の表現が既存実装との関係で曖昧 → 具体的な変更内容とテスト 15.8 への影響を明記して修正
2. **P1-2 isMarkType**: 変数渡し時の `T` 推論エッジケースが未検討 → `T extends MarkType` 制約で安全であることを追記して修正
3. **P2 buildTokenIndexMap**: 「新規呼び出しが増えない」は誤り → +2 箇所（getAnchoredMarksExactRange, getPositionedMarksInRange）を反映して修正

### Codex レビュー（設計課題検討後）

1. **P0-1 `_AssertKeysMatch`**: 型だけではコンパイルエラーにならない → `const` 変数で実効化する方式に修正
2. **P0-2 PersistedMark キャスト**: `exactOptionalPropertyTypes: true` 環境での narrowing 代替案を検討すべき → 代替案を追記
3. **P0-3 getMarksExactRange**: 調査結果は時間的スナップショット → 実装時の再確認ステップを追記
4. **P1-1 OkototenMark**: `'position' in mark` 禁止をコードレビュー頼みにしない → JSDoc 警告コメントで実効化
5. **P1-3 MarkUpdates**: `typeof mark` パターンで流れ込む可能性がある。検証コスト低いので型テスト追加推奨 → 型テストを Phase 2 で追加する方針に修正
6. **Phase 1/2 境界**: BaseMark → AnchoredMark リネーム時に Mark 型定義も同時変更が必要。一時的不整合に注意
7. **isMarkType + filter**: TS 5.5+ の filter type predicate 推論改善に依存 → filterMarksByType ヘルパーの存在意義を追記

### リスク調査（バックグラウンド）

#### 高リスク

- **buildTokenIndexMap のパフォーマンス**: 7+ 箇所で毎回 Map を再生成。Phase 3 でさらに増加する可能性。キャッシング戦略の検討が必要。

#### 中リスク

- **PersistedMark と Mark[] の境界**: operations API は PersistedMark を返すが、SKAMDocument.marks は Mark[]。`doc.marks.find()` の戻り値は Mark であり、operations 関数を通さないとPersistedMark にならない。
- **skam-xml-stringify の重複定義**: `isAnchorBasedMark` を独自定義している。リネーム時に合わせて @kanbun/skam の export に統一すべき。
- **テストデータの更新**: `__tests__/operations/helpers.ts` 等で id なし mark を使用するケースがある。

#### 低リスク

- **TypeScript コンパイルパフォーマンス**: 13 メンバー union は TS 5.4+ で問題なし。
- **BaseMark 直接参照**: index.ts 定義のみ。下流パッケージでの直接参照なし。

## 作業順序

```
Phase 1 (リネーム) → Phase 2 (型基盤) → Phase 3 (ヘルパー) → Phase 4 (任意)
```

各 Phase は小さく分割してコミット。
