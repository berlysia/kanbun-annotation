# マルチトークン範囲マーク レンダリング修正計画

## 概要

`@kanbun-skam/skam-html-renderer` の `comprehensive-rendering.test.ts` で失敗している12件のテストを修正する。2つの根本原因に対し3つの独立した修正を段階的に適用する。

関連 ADR: [ADR-002](../decisions/adr-002-fix-multi-token-range-rendering.md)

## 前提知識

### レンダラーのトークン処理フロー

```
renderDisplayLayer()
  └─ for (token of blockTokens)
       ├─ processedTokenIds.has(token.id) → skip
       ├─ 範囲仮名グループチェック (yomigana/okurigana/soegana)
       │    └─ 先頭トークン: テキスト結合, 他トークン: processedTokenIds に追加
       ├─ trailing marks 収集 (kaeri/kutoten/ref のみ)
       ├─ renderToken(token, marks, ctx, rangeCtx)
       │    ├─ getMarksForToken(tokenId, marks) → mark map
       │    ├─ renderTokenWithRuby(token, ctx, baseText?, rangeInfo?)
       │    └─ CSS classes, suffix-row 構築
       ├─ highlight グループ処理 (groupTokens 蓄積 → wrap)
       └─ tateten グループ処理 (groupTokens 蓄積 → join with separator)
```

### 関連する関数・型の位置（renderer.ts）

| 名前                  | 行番号    | 役割                                    |
| --------------------- | --------- | --------------------------------------- |
| `getMarksForToken`    | 400-446   | tokenId に対応するマークを Map で返す   |
| `getTatetenGroups`    | 451-470   | tateten 範囲の全トークンをマッピング    |
| `getRangeMarkGroups`  | 483-518   | yomigana/okurigana/soegana 範囲グループ |
| `getHighlightGroups`  | 685-704   | highlight 範囲の全トークンをマッピング  |
| `TokenRenderContext`  | 710-715   | renderToken の引数コンテキスト型        |
| `RangeTokenInfo`      | 720-723   | data-token-from/to 用の範囲情報         |
| `renderTokenWithRuby` | 732-764   | ルビ付き token HTML 生成                |
| `RangeMarkContext`    | 837-856   | 範囲マーク処理のコンテキスト型          |
| `renderToken`         | 863-1085  | 単一 token の HTML 生成                 |
| `renderDisplayLayer`  | 1155-     | ブロック内全トークンの処理ループ        |
| `processedTokenIds`   | 1257      | 範囲仮名でスキップするトークンの Set    |
| 範囲仮名グループ処理  | 1276-1356 | yomigana/okurigana/soegana のマージ     |
| trailing marks 収集   | 1376-1401 | スキップされたトークンのマーク収集      |
| tateten グループ出力  | 1493-1514 | groupTokens を separator で join        |

## 修正計画

### Fix A: `getMarksForToken` に中間トークン判定を追加

**対象テスト（4件）**:

- "3-token range emphasis"
- "3-token okimoji range: all tokens should have okimoji class"
- "3-token joji range: all tokens should have joji class"
- "3-token kaeri range: all tokens should have kaeriten"

**手順**:

#### A-1: `TokenRenderContext` に `tokens` フィールド追加 (line 710)

```typescript
// Before
interface TokenRenderContext {
  prefix: string;
  profile: RenderProfile;
  tokenMarks: Map<Mark['type'], Mark[]>;
  interactive: boolean;
}

// After
interface TokenRenderContext {
  prefix: string;
  profile: RenderProfile;
  tokenMarks: Map<Mark['type'], Mark[]>;
  interactive: boolean;
  tokens: Token[];
}
```

#### A-2: ctx 構築で `tokens` を追加 (line 1163)

```typescript
// Before
const ctx = { prefix, profile, interactive };

// After
const ctx = { prefix, profile, interactive, tokens };
```

#### A-3: `getMarksForToken` シグネチャ変更 + 範囲判定追加 (line 400, 435-441)

```typescript
// Before (line 400)
function getMarksForToken(tokenId: string, marks: Mark[]): Map<Mark['type'], Mark[]> {

// After
function getMarksForToken(tokenId: string, marks: Mark[], tokens: Token[]): Map<Mark['type'], Mark[]> {
```

```typescript
// Before (line 435-441)
} else {
  // 他のマークは従来通り
  if (mark.anchor.from === tokenId || mark.anchor.to === tokenId) {
    const existing = result.get(mark.type) ?? [];
    existing.push(mark);
    result.set(mark.type, existing);
  }
}

// After
} else {
  // 他のマーク: 範囲マークの場合は中間トークンも含めて判定
  let isInRange = false;
  if (mark.anchor.from === tokenId || mark.anchor.to === tokenId) {
    isInRange = true;
  } else if (mark.anchor.from !== mark.anchor.to) {
    const fromIdx = tokens.findIndex((t) => t.id === mark.anchor.from);
    const toIdx = tokens.findIndex((t) => t.id === mark.anchor.to);
    const tokenIdx = tokens.findIndex((t) => t.id === tokenId);
    if (fromIdx !== -1 && toIdx !== -1 && tokenIdx !== -1) {
      isInRange = tokenIdx >= fromIdx && tokenIdx <= toIdx;
    }
  }
  if (isInRange) {
    const existing = result.get(mark.type) ?? [];
    existing.push(mark);
    result.set(mark.type, existing);
  }
}
```

#### A-4: 呼び出し元を更新（2箇所）

- `renderToken` 内 (line 872): `getMarksForToken(token.id, marks, ctx.tokens)`
- trailing marks loop (line 1381): `getMarksForToken(tid, marks, tokens)`
  - `tokens` は `renderDisplayLayer` スコープ内の `doc.tokens` 由来の変数

### Fix B1: trailing marks で okimoji/joji/emphasis を収集

**対象テスト（4件）**:

- "range yomigana + okimoji on middle token: okimoji should be preserved"
- "range yomigana + joji on middle token: joji should be preserved"
- "range yomigana + emphasis on middle token: emphasis should be preserved"
- "range okurigana + okimoji on middle token: okimoji should be preserved"

**手順**:

#### B1-1: `RangeMarkContext` にフィールド追加 (line 837-856)

```typescript
interface RangeMarkContext {
  // ... 既存フィールド（変更なし）...

  /** 範囲グループ内の後続トークンに付いている置字マーク */
  trailingOkimojiMarks?: OkimojiMark[];
  /** 範囲グループ内の後続トークンに付いている助字マーク */
  trailingJojiMarks?: JojiMark[];
  /** 範囲グループ内の後続トークンに付いている傍点マーク */
  trailingEmphasisMarks?: EmphasisMark[];
}
```

#### B1-2: trailing marks loop で3種追加収集 (line 1376-1401)

既存の kaeri/kutoten/ref 収集パターンに倣い、okimoji/joji/emphasis を追加:

```typescript
if (allRangeTokenIds.size > 0) {
  const trailingKaeriMarks: KaeriMark[] = [];
  const trailingKutotenMarks: KutotenMark[] = [];
  const trailingRefMarks: RefMark[] = [];
  const trailingOkimojiMarks: OkimojiMark[] = []; // 追加
  const trailingJojiMarks: JojiMark[] = []; // 追加
  const trailingEmphasisMarks: EmphasisMark[] = []; // 追加
  for (const tid of allRangeTokenIds) {
    const trailingTokenMarks = getMarksForToken(tid, marks, tokens);
    // ... 既存の kaeri/kutoten/ref 収集 ...
    if (profile.okimoji) {
      // 追加
      const okimoji = trailingTokenMarks.get('okimoji') as OkimojiMark[] | undefined;
      if (okimoji) trailingOkimojiMarks.push(...okimoji);
    }
    if (profile.joji) {
      // 追加
      const joji = trailingTokenMarks.get('joji') as JojiMark[] | undefined;
      if (joji) trailingJojiMarks.push(...joji);
    }
    if (profile.emphasis) {
      // 追加
      const emphasis = trailingTokenMarks.get('emphasis') as EmphasisMark[] | undefined;
      if (emphasis) trailingEmphasisMarks.push(...emphasis);
    }
  }
  rangeCtx = {
    ...rangeCtx,
    trailingKaeriMarks,
    trailingKutotenMarks,
    trailingRefMarks,
    trailingOkimojiMarks, // 追加
    trailingJojiMarks, // 追加
    trailingEmphasisMarks, // 追加
  };
}
```

#### B1-3: `renderToken` 内で trailing marks を合算 (line 881-882, 972-978, 1051)

emphasis (line 881-882):

```typescript
// Before
const emphasisMarks = (tokenMarks.get('emphasis') ?? []) as EmphasisMark[];
const hasEmphasis = profile.emphasis && emphasisMarks.length > 0;

// After
const emphasisMarks = (tokenMarks.get('emphasis') ?? []) as EmphasisMark[];
const allEmphasisMarks = [...emphasisMarks, ...(rangeCtx?.trailingEmphasisMarks ?? [])];
const hasEmphasis = profile.emphasis && allEmphasisMarks.length > 0;
```

okimoji (line 972-974):

```typescript
// Before
const okimojiMarks = (tokenMarks.get('okimoji') ?? []) as OkimojiMark[];
const isOkimoji = profile.okimoji && okimojiMarks.length > 0;

// After
const okimojiMarks = (tokenMarks.get('okimoji') ?? []) as OkimojiMark[];
const isOkimoji =
  profile.okimoji && (okimojiMarks.length > 0 || (rangeCtx?.trailingOkimojiMarks ?? []).length > 0);
```

joji (line 976-978):

```typescript
// Before
const jojiMarks = (tokenMarks.get('joji') ?? []) as JojiMark[];
const isJoji = profile.joji && jojiMarks.length > 0;

// After
const jojiMarks = (tokenMarks.get('joji') ?? []) as JojiMark[];
const isJoji =
  profile.joji && (jojiMarks.length > 0 || (rangeCtx?.trailingJojiMarks ?? []).length > 0);
```

emphasis style (line 1051):

```typescript
// Before
const emphasisStyle = emphasisMarks[0]?.style ?? 'filled dot';

// After
const emphasisStyle = allEmphasisMarks[0]?.style ?? 'filled dot';
```

### Fix B2: 範囲仮名 + tateten 重複時のセパレータ保持

**対象テスト（4件）**:

- "tateten + yomigana: tateten-mark separator preserved between tokens"
- "tateten + okurigana: tateten-mark separator preserved between tokens"
- "3-token tateten + yomigana: all tateten-mark separators preserved"
- "tateten + soegana: tateten-mark separator preserved between tokens"

**手順**:

#### B2-1: `RangeMarkContext` にフィールド追加

```typescript
interface RangeMarkContext {
  // ... 既存フィールド + B1 で追加したフィールド ...

  /** tateten 重複時の個別トークンテキスト配列 */
  tatetenTokenTexts?: string[];
}
```

#### B2-2: 範囲仮名グループ検出時に tateten 重複を検出 (line 1276-1356)

各範囲仮名グループ（yomigana/okurigana/soegana）の処理後、tateten 重複を検出:

```typescript
// yomiganaGroup 処理後（line 1296 付近）
if (yomiganaGroup && yomiganaGroup.tokenIds[0] === token.id) {
  // ... 既存のマージ処理 ...

  // tateten 重複検出: グループ内トークンに tateten がかかっているか
  if (!rangeCtx?.tatetenTokenTexts) {
    const hasTatetenOverlap = yomiganaGroup.tokenIds.some((tid: string) => tatetenGroups.has(tid));
    if (hasTatetenOverlap) {
      const tatetenTokenTexts = yomiganaGroup.tokenIds.map((tid: string) => {
        const t = tokens.find((tok) => tok.id === tid);
        return t?.text ?? '';
      });
      rangeCtx = { ...rangeCtx, tatetenTokenTexts };
    }
  }
}
```

同様に okuriganaGroup, soeganaGroup 処理後にも追加。

#### B2-3: `renderTokenWithRuby` にパラメータ追加 (line 732)

```typescript
// Before
function renderTokenWithRuby(
  token: Token,
  ctx: TokenRenderContext,
  baseText?: string,
  rangeInfo?: RangeTokenInfo
): string {

// After
function renderTokenWithRuby(
  token: Token,
  ctx: TokenRenderContext,
  baseText?: string,
  rangeInfo?: RangeTokenInfo,
  tatetenTokenTexts?: string[]
): string {
```

#### B2-4: ruby/非ruby 生成部で tateten セパレータ付きレンダリング (line 758-763)

```typescript
const displayText = baseText ?? token.text;
if (yomigana) {
  let rbContent: string;
  if (tatetenTokenTexts && tatetenTokenTexts.length > 1) {
    rbContent = tatetenTokenTexts
      .map((t) => escapeHtml(t))
      .join(`<span class="${prefix}-tateten-mark"></span>`);
  } else {
    rbContent = escapeHtml(displayText);
  }
  return `<ruby><rb class="${prefix}-base"${dataAttrs}>${rbContent}</rb><rt class="${prefix}-ruby">${yomigana}</rt></ruby>`;
} else {
  let spanContent: string;
  if (tatetenTokenTexts && tatetenTokenTexts.length > 1) {
    spanContent = tatetenTokenTexts
      .map((t) => escapeHtml(t))
      .join(`<span class="${prefix}-tateten-mark"></span>`);
  } else {
    spanContent = escapeHtml(displayText);
  }
  return `<span class="${prefix}-base"${dataAttrs}>${spanContent}</span>`;
}
```

#### B2-5: `renderToken` から `renderTokenWithRuby` への引数追加 (line 991)

```typescript
// Before
baseHtml = renderTokenWithRuby(token, fullCtx, rangeBaseText, rangeCtx?.rangeTokenInfo);

// After
baseHtml = renderTokenWithRuby(
  token,
  fullCtx,
  rangeBaseText,
  rangeCtx?.rangeTokenInfo,
  rangeCtx?.tatetenTokenTexts
);
```

## 実装順序

1. **Fix A** — `getMarksForToken` 修正（自己完結、他の Fix に依存しない）
2. **Fix B1** — trailing marks 拡張（Fix A のシグネチャ変更後に実装）
3. **Fix B2** — tateten + 範囲仮名（B1 と独立だが、RangeMarkContext を共有するため後に実装）
4. **検証** — 全テスト実行

## 検証

```bash
# 対象パッケージのテスト（12件の失敗が0件になること）
pnpm --filter @kanbun-skam/skam-html-renderer test
# 期待: 153 tests passed (12 fixed + 141 existing)

# 全パッケージテスト（リグレッションなし）
pnpm test
# 期待: 全パッケージ pass

# 型チェック
pnpm typecheck
# 期待: エラーなし
```

## 変更ファイル

- `packages/skam-html-renderer/src/renderer.ts` — 唯一の変更対象

## 注意事項

- `getMarksForToken` の呼び出し箇所は **2箇所のみ** （grep 確認済み: line 872, 1381）
- `tokens.findIndex` の `-1` 返却時は `isInRange = false` となるガード条件あり
- `<rb>` 内に `<span>` を配置する HTML 構造は仕様上有効（phrasing content）だが、ブラウザの ruby レイアウトへの影響は Playground での視覚的検証を推奨
