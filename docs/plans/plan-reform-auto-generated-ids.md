# 自動生成ID改革 実装計画

## 概要

自動生成IDの生成規則に依存した判定を廃止し、人間可読ランダムID + State追跡方式に移行する。

関連 ADR: [ADR-003](../decisions/adr-003-reform-auto-generated-ids.md)

## 前提知識

### 現在のID生成フロー

```
XML Parse:
  parser-core.ts
  ├── generateTokenId(state) → t1, t2, t3...  (++state.tokenIndex)
  ├── generateMarkId(state)  → m1, m2, m3...  (state.marks.length + 1)
  └── block ID fallback      → b1, b2...      (++state.blockIndex)

Operations CRUD:
  operations/index.ts
  └── generateId(doc, prefix, delimiter) → m1, m2... (max+1 of existing pattern)
      └── generateMarkId(doc) → generateId(doc, 'm')
```

### 問題のあるコード（format依存判定）

`parser-core.ts:620-633` — highlight-ref 対応関係の解決:

```typescript
} else if (refsAddedInSpan.length === 1) {
  const singleRef = refsAddedInSpan[0]!;
  const hasExplicitId = singleRef.id && !singleRef.id.startsWith('m');  // ← ここ
  if (!hasExplicitId) {
    throw new SKAMXMLParseError(
      `<skam:span type="highlight" ref="${refAttr}"> references a ref that does not exist. ` +
        `Add xml:id="${refAttr}" to the <skam:ref> element inside the span.`
    );
  } else {
    mark.ref = refAttr;
  }
}
```

### 関連する構造体

```typescript
// parser-core.ts:181-193
interface ParserState {
  tokens: Token[];
  blocks: Block[];
  marks: Mark[];
  readings: Reading[];
  noteContents: Map<string, string>;
  tokenIndex: number; // ← 削除予定
  blockIndex: number; // ← 削除予定
  currentBlockId: string | null;
  positionTracker: PositionTracker | null;
  currentSearchOffset: number;
}

// parser-core.ts:1045-1050
export interface ParseOptions {
  validate?: boolean;
  trackPositions?: boolean;
  // ← idGenerator を追加予定
}
```

### 公開API

`@kanbun/skam` から以下がexportされている（`packages/skam/src/index.ts:470-471`）:

- `generateId(doc, prefix = 'm', delimiter = '')` — mark ID生成（汎用）
- `generateMarkId(doc)` — `generateId(doc, 'm')` のエイリアス

playground での使用（`packages/playground/src/main.ts:1108`）:

```typescript
const effectiveRefId = refInputValue || generateId(newDoc, 'ref', '-');
```

## 変更対象ファイル一覧

### 新規作成

| ファイル                            | 内容                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| `packages/skam/src/id-generator.ts` | `IdGenerator` interface、`createRandomIdGenerator`、`createSequentialIdGenerator` |

### 実装修正

| ファイル                                      | 変更内容                                                               | 行番号参考                              |
| --------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------- |
| `packages/skam/src/index.ts`                  | 新型・関数のexport追加                                                 | ~470行付近                              |
| `packages/skam/src/operations/index.ts`       | `generateId` をランダム方式に変更、`delimiter`削除、`escapeRegExp`削除 | 203-237行                               |
| `packages/skam-xml-parser/src/parser-core.ts` | ParserState変更、ID生成injectable化、`hasExplicitId`修正               | 181-208, 243-249, 623, 954, 1045-1085行 |
| `packages/playground/src/main.ts`             | `generateId` 呼び出しから `delimiter` 引数を削除                       | 1108行                                  |

### テスト修正

| ファイル                                                             | 変更内容                                           | 影響箇所数 |
| -------------------------------------------------------------------- | -------------------------------------------------- | ---------- |
| `packages/skam/src/__tests__/operations/generate-id.test.ts`         | 全面書き直し（ランダムID形式テスト）               | 全12テスト |
| `packages/skam/src/__tests__/operations/crud.test.ts`                | 自動生成ID部分を `.toMatch()` パターンマッチに変更 | ~15箇所    |
| `packages/skam/src/__tests__/operations/scenarios.test.ts`           | 自動生成ID部分を `.toMatch()` パターンマッチに変更 | ~3箇所     |
| `packages/skam/src/__tests__/operations/comprehensive-marks.test.ts` | `addMark`/`addMarkWithResult` 経由のID部分のみ     | ~3箇所     |
| `packages/skam-xml-parser/src/__tests__/parser.test.ts`              | sequential generator注入ヘルパー追加               | ~4箇所     |

### 変更不要（ユーザー定義fixture IDのみ使用）

- `queries.test.ts`, `display.test.ts`, `type-guards.test.ts`, `token-index.test.ts`
- `roundtrip.test.ts`, `stringify.test.ts`
- `renderer.test.ts`, `comprehensive-rendering.test.ts`, `operation-rendering.test.ts`, `interactive.test.ts`
- `editor-operations.test.ts`, `mark-popup.test.ts`

## 実装ステップ

### Step 1: `packages/skam/src/id-generator.ts` 新規作成

```typescript
export interface IdGenerator {
  generate(prefix: string): string;
}

export function createRandomIdGenerator(): IdGenerator {
  return {
    generate(prefix: string): string {
      const hex = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
      return `${prefix}-${hex}`;
    },
  };
}

export function createSequentialIdGenerator(): IdGenerator {
  const counters = new Map<string, number>();
  return {
    generate(prefix: string): string {
      const next = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, next);
      return `${prefix}${next}`;
    },
  };
}
```

### Step 2: `packages/skam/src/index.ts` にexport追加

```typescript
export {
  type IdGenerator,
  createRandomIdGenerator,
  createSequentialIdGenerator,
} from './id-generator.js';
```

### Step 3: `packages/skam/src/operations/index.ts` 変更

`generateId` をランダム方式に変更、`delimiter` パラメータと `escapeRegExp` を削除:

```typescript
export function generateId(doc: SKAMDocument, prefix = 'm'): string {
  const existingIds = new Set(doc.marks.filter((m) => m.id != null).map((m) => m.id!));
  let id: string;
  do {
    const hex = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
    id = `${prefix}-${hex}`;
  } while (existingIds.has(id));
  return id;
}

export function generateMarkId(doc: SKAMDocument): string {
  return generateId(doc, 'm');
}
```

### Step 4: `packages/skam-xml-parser/src/parser-core.ts` 変更

**4a. import追加と ParseOptions 拡張:**

```typescript
import type { IdGenerator } from '@kanbun/skam';
import { createRandomIdGenerator } from '@kanbun/skam';

export interface ParseOptions {
  validate?: boolean;
  trackPositions?: boolean;
  idGenerator?: IdGenerator;
}
```

**4b. ParserState 変更:**

```typescript
interface ParserState {
  tokens: Token[];
  blocks: Block[];
  marks: Mark[];
  readings: Reading[];
  noteContents: Map<string, string>;
  autoGeneratedIds: Set<string>; // NEW
  currentBlockId: string | null;
  positionTracker: PositionTracker | null;
  currentSearchOffset: number;
  idGenerator: IdGenerator; // NEW
  // tokenIndex, blockIndex は削除
}
```

**4c. createParserState 変更 (line 195-208):**

```typescript
function createParserState(source?: string, idGenerator?: IdGenerator): ParserState {
  return {
    tokens: [],
    blocks: [],
    marks: [],
    readings: [],
    noteContents: new Map(),
    autoGeneratedIds: new Set(),
    currentBlockId: null,
    positionTracker: source ? new PositionTracker(source) : null,
    currentSearchOffset: 0,
    idGenerator: idGenerator ?? createRandomIdGenerator(),
  };
}
```

**4d. ID生成関数変更 (line 243-249):**

```typescript
function generateTokenId(state: ParserState): string {
  const id = state.idGenerator.generate('t');
  state.autoGeneratedIds.add(id);
  return id;
}

function generateMarkId(state: ParserState): string {
  const id = state.idGenerator.generate('m');
  state.autoGeneratedIds.add(id);
  return id;
}
```

**4e. Block ID生成変更 (line 954):**

```typescript
const blockId =
  xmlIdAttr ||
  (() => {
    const id = state.idGenerator.generate('b');
    state.autoGeneratedIds.add(id);
    return id;
  })();
```

**4f. hasExplicitId 修正 (line 623):**

```typescript
// Before:
const hasExplicitId = singleRef.id && !singleRef.id.startsWith('m');
// After:
const hasExplicitId = singleRef.id && !state.autoGeneratedIds.has(singleRef.id);
```

**4g. parseFromDocument 変更 (line 1061-1085):**

```typescript
const { validate: _validate = true, trackPositions = false, idGenerator } = options;
const state = createParserState(trackPositions ? source : undefined, idGenerator);
```

### Step 5: `packages/playground/src/main.ts` 修正

```typescript
// Before (line 1108):
const effectiveRefId = refInputValue || generateId(newDoc, 'ref', '-');
// After:
const effectiveRefId = refInputValue || generateId(newDoc, 'ref');
```

### Step 6: テスト更新

**generate-id.test.ts — 全面書き直し:**

- `generateMarkId(doc)` が `m-[0-9a-f]{8}` 形式を返すこと
- `generateId(doc, 'ref')` が `ref-[0-9a-f]{8}` 形式を返すこと
- 生成されるIDが毎回異なること（uniqueness）
- 既存markのIDと衝突しないこと（collision avoidance）

**crud.test.ts / scenarios.test.ts / comprehensive-marks.test.ts:**

- `addMark`/`addMarkWithResult` 経由のIDアサーションをパターンマッチに変更
- 例: `.toBe('m1')` → `.toMatch(/^m-[0-9a-f]{8}$/)`
- **注意**: fixture IDのアサーション（`createTestDocument` 由来の `m1`, `m2` 等）は変更不要

**判別方法**: `addMark(doc, markWithoutId)` や `addMarkWithResult(doc, ...)` を呼んだ後の戻り値でIDを検査している箇所 = 変更必要。`createTestDocument([{ id: 'm1', ... }])` で事前定義されたIDを検査している箇所 = 変更不要。

**parser.test.ts — sequential generator注入:**

```typescript
import { createSequentialIdGenerator } from '@kanbun/skam';

// テスト用ヘルパー
function parseSeq(xml: string, opts: Partial<ParseOptions> = {}) {
  return parse(xml, { ...opts, idGenerator: createSequentialIdGenerator() });
}
```

既存の `parse(xml)` 呼び出しを `parseSeq(xml)` に置換すれば、`t1`, `b1` 等のアサーションはそのまま維持可能。

## テスト自動生成IDアサーション一覧

### crud.test.ts（変更必要 — 自動生成IDのアサーション）

- Line 73: `expect(result.marks[1]?.id).toBe('m2')`
- Line 87: `expect(result.marks[0]?.id).toBe('m1')`
- Line 189: `expect(result.markId).toBe('m1')`
- Line 191: `expect(result.doc.marks[0]?.id).toBe('m1')`
- Line 235: `expect(result.markId).toBe('m2')`
- Line 353: `expect(result.marks[0]?.id).toBe('m1')`
- Line 403: `expect(result.marks[0]?.id).toBe('m1')`
- Line 425: `expect(result.marks[0]?.id).toBe('m1')`
- Line 444-447: `expect(result.marks[N]?.id).toBe('mN')`
- Line 469: `expect(result.marks[0]?.id).toBe('m2')`
- Line 515: `expect(result.marks[0]?.id).toBe('m1')`
- Line 593: `expect(result.marks[0]?.id).toBe('m2')`

### scenarios.test.ts（変更必要）

- Line 114: `expect(doc.marks.map((m) => m.id)).toEqual(['m1', 'm2', 'm3'])`
- Line 157: `expect(result.marks[0]?.id).toBe('m1')`
- Line 170: `expect(result.marks[0]?.id).toBe('m2')`

### comprehensive-marks.test.ts（変更必要 — addMark経由のもののみ）

- Line 1147: `expect(doc.marks[0]?.id).toBe('m1')`
- Line 1739: `expect(doc.marks[0]?.id).toBe('m1')`
- Line 1764: `expect(markId).toBe('m2')`

### parser.test.ts（sequential generator注入で対応）

- Line 29: `{ id: 't1', text: '學' }`
- Line 32: `{ id: 'b1', tokenIds: ['t1'] }`
- Line 51-52: `kaeri.anchor.from === 't2'` 等
- Line 890: block/token ID

## 検証

```bash
pnpm typecheck                # 型チェック
pnpm test                     # 全テスト
pnpm lint                     # リント
pnpm build                    # ビルド

# highlight-ref ロジック個別検証
pnpm --filter @kanbun/skam-xml-parser test -- parser.test.ts -t "highlight"
```

## 注意事項

1. **`autoGeneratedIds` のスコープ**: パーサー `ParserState` 内のみ。`processSpan` 内で `state` 経由でアクセス可能。パース完了後は不要。

2. **collision check**: operations の `generateId` は `doc.marks` のIDのみチェック。prefix による名前空間分離でtoken/block IDとの衝突チェックは不要。

3. **パーサーの `generateMarkId` と operations の `generateMarkId` は別関数**: 前者は `ParserState` を受け取るパーサー内部関数、後者は `SKAMDocument` を受け取る公開関数。名前は同じだがスコープが異なり混同リスクは低い。

4. **sequential generator の出力形式**: `t1, t2, m1, m2, b1, b2` — 区切り文字なし。既存テストの期待値と一致する。
