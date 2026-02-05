# Display 層レンダリング構造改善 実装計画（Phase 1: フラッシュヘルパー抽出）

## 概要

`renderDisplayLayer` 関数内に散在する7+3箇所のフラッシュ操作をヘルパー関数に集約し、フラッシュ依存連鎖（`groupTokens` → `highlightTokens` → `renderedTokens`）を構造的に保証する。

関連 ADR: [ADR-005](../decisions/adr-005-restructure-display-layer-rendering.md)

## 前提知識

### ステートマシンの状態変数（renderer.ts:1265-1270）

```typescript
let currentTatetenGroup: TatetenMark | undefined; // 現在のたて点グループ
let currentHighlightGroup: HighlightMark | undefined; // 現在のhighlightグループ
let groupTokens: string[] = []; // たて点グループのアキュムレータ
let highlightTokens: string[] = []; // highlightグループのアキュムレータ
let pendingHighlightKutoten = ''; // highlight終端のkutoten（外に出す）
const renderedTokens: string[] = []; // 最終出力
```

### 現在のフラッシュサイト一覧

#### たて点フラッシュ（7箇所）

| #   | 行番号    | トリガー条件                                | フラッシュ先                                        | `currentTatetenGroup` リセット |
| --- | --------- | ------------------------------------------- | --------------------------------------------------- | ------------------------------ |
| T1  | 1489-1495 | highlight内: 新highlight開始時のtateten残存 | `highlightTokens`                                   | `= undefined`                  |
| T2  | 1527-1532 | highlight内: 新tatetenグループ開始          | `highlightTokens`                                   | しない（直後に更新）           |
| T3  | 1537-1543 | highlight内: tatetenなしトークン            | `highlightTokens`                                   | `= undefined`                  |
| T4  | 1555-1561 | highlightなしトークン移行時のtateten残存    | `highlightTokens`                                   | `= undefined`                  |
| T5  | 1576-1581 | highlight外: 新tatetenグループ開始          | `renderedTokens`                                    | しない（直後に更新）           |
| T6  | 1586-1592 | highlight外: tatetenなしトークン            | `renderedTokens`                                    | `= undefined`                  |
| T7  | 1599-1609 | ブロック終端                                | highlight内→`highlightTokens` / 外→`renderedTokens` | しない（終了）                 |

#### highlight フラッシュ（3箇所）

| #   | 行番号    | トリガー条件              | tateten先行フラッシュ    | `currentHighlightGroup` リセット |
| --- | --------- | ------------------------- | ------------------------ | -------------------------------- |
| H1  | 1487-1504 | 新highlightグループ開始   | あり（T1）               | しない（直後に更新）             |
| H2  | 1553-1571 | highlightなしトークン移行 | あり（T4）               | `= undefined`                    |
| H3  | 1611-1618 | ブロック終端              | **なし**（T7で別途処理） | しない（終了）                   |

### フラッシュパターンの共通コード

**たて点フラッシュ**（全箇所で同一のHTML生成ロジック）:

```typescript
`<span class="${prefix}-tateten-group">${groupTokens.join(`<span class="${prefix}-tateten-mark"></span>`)}</span>`;
```

**highlight フラッシュ**（全箇所で同一のHTML生成ロジック）:

```typescript
const style = currentHighlightGroup.style ?? 'solid';
const refHtml = getRefTextForHighlight(currentHighlightGroup);
const styleClass = ` ${prefix}-highlight--${style}`;
`<span class="${prefix}-highlight${styleClass}" data-style="${style}"><span class="${prefix}-highlight-content">${refHtml}${highlightTokens.join('')}</span></span>${pendingHighlightKutoten}`;
```

## 変更対象ファイル

| ファイル                                      | 変更内容                                        |
| --------------------------------------------- | ----------------------------------------------- |
| `packages/skam-html-renderer/src/renderer.ts` | フラッシュヘルパー抽出 + 全フラッシュサイト置換 |

テストファイルの変更は不要（動作変更なし）。

## 実装ステップ

### Step 1: フラッシュ状態を管理するオブジェクトの導入

現在の5つの `let` 変数を1つのオブジェクトにまとめ、フラッシュヘルパーがミュータブルに操作できるようにする。

```typescript
interface FlushState {
  currentTatetenGroup: TatetenMark | undefined;
  currentHighlightGroup: HighlightMark | undefined;
  groupTokens: string[];
  highlightTokens: string[];
  pendingHighlightKutoten: string;
}
```

**変更箇所** (1265-1270):

```typescript
// Before
let currentTatetenGroup: TatetenMark | undefined;
let currentHighlightGroup: HighlightMark | undefined;
let groupTokens: string[] = [];
let highlightTokens: string[] = [];
let pendingHighlightKutoten = '';

// After
const flushState: FlushState = {
  currentTatetenGroup: undefined,
  currentHighlightGroup: undefined,
  groupTokens: [],
  highlightTokens: [],
  pendingHighlightKutoten: '',
};
```

### Step 2: `flushTatetenGroup` ヘルパーの定義

`renderDisplayLayer` 関数内にクロージャとして定義。フラッシュ先は `toHighlightBuffer` パラメータで制御する。

```typescript
/**
 * たて点グループのアキュムレータ（groupTokens）をフラッシュする。
 * @param toHighlightBuffer - true なら highlightTokens へ、false なら renderedTokens へ出力
 * @param resetGroup - true の場合 currentTatetenGroup も undefined にリセット
 */
function flushTatetenGroup(toHighlightBuffer: boolean, resetGroup = true): void {
  if (!flushState.currentTatetenGroup || flushState.groupTokens.length === 0) return;
  const html = `<span class="${prefix}-tateten-group">${flushState.groupTokens.join(`<span class="${prefix}-tateten-mark"></span>`)}</span>`;
  if (toHighlightBuffer) {
    flushState.highlightTokens.push(html);
  } else {
    renderedTokens.push(html);
  }
  flushState.groupTokens = [];
  if (resetGroup) {
    flushState.currentTatetenGroup = undefined;
  }
}
```

### Step 3: `flushHighlightGroup` ヘルパーの定義

同じく `renderDisplayLayer` 内のクロージャ。内部で `flushTatetenGroup` を呼び、依存連鎖を構造的に保証する。

```typescript
/**
 * highlight グループのアキュムレータ（highlightTokens）をフラッシュする。
 * 残存するたて点グループを先にフラッシュしてから highlight を閉じる。
 * @param resetGroup - true の場合 currentHighlightGroup も undefined にリセット
 */
function flushHighlightGroup(resetGroup = true): void {
  if (
    !flushState.currentHighlightGroup ||
    (flushState.highlightTokens.length === 0 && flushState.groupTokens.length === 0)
  ) {
    return;
  }
  // 依存連鎖: たて点 → highlight の順でフラッシュ
  flushTatetenGroup(/* toHighlightBuffer */ true);

  const style = flushState.currentHighlightGroup.style ?? 'solid';
  const refHtml = getRefTextForHighlight(flushState.currentHighlightGroup);
  const styleClass = ` ${prefix}-highlight--${style}`;
  renderedTokens.push(
    `<span class="${prefix}-highlight${styleClass}" data-style="${style}"><span class="${prefix}-highlight-content">${refHtml}${flushState.highlightTokens.join('')}</span></span>${flushState.pendingHighlightKutoten}`
  );
  flushState.highlightTokens = [];
  flushState.pendingHighlightKutoten = '';
  if (resetGroup) {
    flushState.currentHighlightGroup = undefined;
  }
}
```

### Step 4: 全フラッシュサイトの置換

各フラッシュサイトを対応するヘルパー呼び出しに置換する。既存の変数参照は `flushState.` プレフィックスに変更。

#### H1 + T1（1487-1504）: 新highlight開始時のフラッシュ

```typescript
// Before
if (currentHighlightGroup && (highlightTokens.length > 0 || groupTokens.length > 0)) {
  if (currentTatetenGroup && groupTokens.length > 0) {
    highlightTokens.push(
      `<span class="${prefix}-tateten-group">${groupTokens.join(`<span class="${prefix}-tateten-mark"></span>`)}</span>`
    );
    groupTokens = [];
    currentTatetenGroup = undefined;
  }
  const style = currentHighlightGroup.style ?? 'solid';
  // ... highlight HTML 生成 ...
}

// After
flushHighlightGroup(/* resetGroup */ false);
```

`resetGroup = false` は直後に `currentHighlightGroup = highlightGroup` で更新されるため。

#### T2（1527-1532）: highlight内の新tatetenグループ開始

```typescript
// Before
if (currentTatetenGroup && groupTokens.length > 0) {
  highlightTokens.push(
    `<span class="${prefix}-tateten-group">${groupTokens.join(`<span class="${prefix}-tateten-mark"></span>`)}</span>`
  );
  groupTokens = [];
}

// After
flushTatetenGroup(/* toHighlightBuffer */ true, /* resetGroup */ false);
```

`resetGroup = false` は直後に `currentTatetenGroup = tokenGroup` で更新されるため。

#### T3（1537-1543）: highlight内のtatetenなしトークン

```typescript
// Before
if (currentTatetenGroup && groupTokens.length > 0) {
  highlightTokens.push(
    `<span class="${prefix}-tateten-group">${groupTokens.join(`<span class="${prefix}-tateten-mark"></span>`)}</span>`
  );
  groupTokens = [];
  currentTatetenGroup = undefined;
}

// After
flushTatetenGroup(/* toHighlightBuffer */ true);
```

#### H2 + T4（1553-1571）: highlightなしトークン移行時

```typescript
// Before
if (currentHighlightGroup && (highlightTokens.length > 0 || groupTokens.length > 0)) {
  if (currentTatetenGroup && groupTokens.length > 0) {
    // ... tateten flush ...
  }
  // ... highlight flush ...
  currentHighlightGroup = undefined;
}

// After
flushHighlightGroup();
```

#### T5（1576-1581）: highlight外の新tatetenグループ開始

```typescript
// Before
if (currentTatetenGroup && groupTokens.length > 0) {
  renderedTokens.push(
    `<span class="${prefix}-tateten-group">${groupTokens.join(`<span class="${prefix}-tateten-mark"></span>`)}</span>`
  );
  groupTokens = [];
}

// After
flushTatetenGroup(/* toHighlightBuffer */ false, /* resetGroup */ false);
```

#### T6（1586-1592）: highlight外のtatetenなしトークン

```typescript
// Before
if (currentTatetenGroup && groupTokens.length > 0) {
  renderedTokens.push(
    `<span class="${prefix}-tateten-group">${groupTokens.join(`<span class="${prefix}-tateten-mark"></span>`)}</span>`
  );
  groupTokens = [];
  currentTatetenGroup = undefined;
}

// After
flushTatetenGroup(/* toHighlightBuffer */ false);
```

#### T7 + H3（1599-1618）: ブロック終端

```typescript
// Before
if (currentTatetenGroup && groupTokens.length > 0) {
  if (currentHighlightGroup) {
    highlightTokens.push(/* ... */);
  } else {
    renderedTokens.push(/* ... */);
  }
}
if (currentHighlightGroup && highlightTokens.length > 0) {
  // ... highlight flush ...
}

// After — 元のコードの分岐構造を保持し、意図を明確にする
if (flushState.currentHighlightGroup) {
  // highlight 内: tateten → highlight の順でフラッシュ（flushHighlightGroup が内部で処理）
  flushHighlightGroup(/* resetGroup */ false);
} else {
  // highlight 外: tateten のみフラッシュ
  flushTatetenGroup(/* toHighlightBuffer */ false, /* resetGroup */ false);
}
```

**設計根拠**: `flushHighlightGroup` 内で `flushTatetenGroup(true)` が呼ばれるため、highlight 内の場合は `flushHighlightGroup` だけで T7+H3 の両方をカバーできる。highlight 外の場合は tateten のみフラッシュする。元のコードのように `flushTatetenGroup` + `flushHighlightGroup` を連続呼びする案もあるが、`flushTatetenGroup` のガード条件による暗黙の安全性に依存するため、明示的な分岐の方が意図が明確。

### Step 5: 変数参照の一括置換

ループ本体内の全ての `currentTatetenGroup`、`currentHighlightGroup`、`groupTokens`、`highlightTokens`、`pendingHighlightKutoten` 参照を `flushState.` プレフィックスに変更する。

対象範囲: 1263-1618行（ブロックのループ全体）

**主な参照箇所**:

- `currentHighlightGroup` の代入・比較（1483, 1505, 1510 等）
- `currentTatetenGroup` の代入・比較（1525, 1533, 1574, 1582 等）
- `groupTokens.push(...)` （1535, 1584）
- `highlightTokens.push(...)` （1544）
- `pendingHighlightKutoten` の代入（1521）

## 設計判断

### なぜ `FlushState` オブジェクトにまとめるか

- フラッシュヘルパーがクロージャとして状態を直接操作する必要があるため
- `let` 変数をクロージャから再代入できない問題（`groupTokens = []` 等）を回避
- 将来的に Phase 3（ツリー構造化）に移行する際、`FlushState` をツリービルダーに置き換えやすい

**`exactOptionalPropertyTypes` との互換性**: `FlushState` のプロパティは optional (`?`) ではなく required かつ `| undefined` 型なので、`flushState.currentTatetenGroup = undefined` の代入は TypeScript の `exactOptionalPropertyTypes: true` 設定下でも問題ない。`exactOptionalPropertyTypes` は optional プロパティへの `undefined` 明示代入のみを禁止する。

### `toHighlightBuffer` パラメータの命名

- 「フラッシュ先の選択」を示す動作指向の名前を採用（`insideHighlight` は状態を示唆するため不適切）
- `true` → `highlightTokens`（内部バッファ）へ、`false` → `renderedTokens`（最終出力）へ

### `resetGroup` パラメータの意図

- 「グループ終了時のフラッシュ」（グループを離脱する → `resetGroup = true` がデフォルト）
- 「新グループ開始時のフラッシュ」（直後に更新される → `resetGroup = false`）
- デフォルトを `true`（完全なフラッシュ操作）とし、`false` は「リセット不要」を明示的に指定する特殊ケースとする。呼び出し頻度ではなく操作の完全性を基準にデフォルトを決定

### H1+T1 ガード条件の等価性証明

元のコード (H1, line 1487):

```typescript
if (currentHighlightGroup && (highlightTokens.length > 0 || groupTokens.length > 0)) { ... }
```

`flushHighlightGroup` のガード条件:

```typescript
if (!currentHighlightGroup || (highlightTokens.length === 0 && groupTokens.length === 0)) return;
```

De Morgan の法則により:

```
NOT(A && (B || C))  =  NOT(A) || NOT(B || C)  =  NOT(A) || (NOT(B) && NOT(C))
```

よって、ヘルパーのガード条件（スキップ条件）は元のif条件の否定と完全に等価。

## 検証

```bash
# 全テスト（リグレッションなし確認）
pnpm test
# 期待: 全テスト pass

# 型チェック
pnpm typecheck
# 期待: エラーなし

# highlight + tateten 複合テスト（特に重要）
pnpm --filter @kanbun/skam-html-renderer test -- highlight-tateten-kun.test.ts
# 期待: 全テスト pass

# 包括レンダリングテスト
pnpm --filter @kanbun/skam-html-renderer test -- comprehensive-rendering.test.ts
# 期待: 全テスト pass

# リント
pnpm lint
```

## 注意事項

1. **動作変更なし**: このリファクタリングは純粋な構造改善であり、出力 HTML に一切の変更がないことが前提。既存テストが全 pass することで保証する

2. **`flushHighlightGroup` 内の `flushTatetenGroup` 呼び出し**: highlight グループフラッシュ時に tateten の先行フラッシュが構造的に保証される。ブロック終端（T7+H3）では明示的な分岐により highlight 有無を判定し、適切なヘルパーのみを呼ぶ

3. **`flushTatetenGroup` のガード条件**: `!flushState.currentTatetenGroup || flushState.groupTokens.length === 0` で早期リターンするため、空状態での不要なフラッシュは発生しない。`flushHighlightGroup` 内での呼び出しも、既にフラッシュ済みの場合は安全にスキップされる

4. **行数の変化**: フラッシュヘルパーの定義（~30行）を追加し、7+3箇所のフラッシュコード（各5-10行）を1-3行の呼び出しに置換するため、ネット約50-60行の削減が見込まれる
