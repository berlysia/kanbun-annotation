# Plan: Canvas レンダラー文字間スペーシング修正

## 関連 ADR

なし（レイアウト計算の修正、アーキテクチャ変更なし）

## 背景

Canvas レンダラーの文字間（トークン間の縦方向間隔）が HTML レンダラーと比較して常に約1文字分余分にあいている。

### HTML 実測データ (fontSize=32px, rubyRatio=0.5, R=16px)

Playground の Chromium 計測結果。padding/margin はすべて 0px。

| トークン | height | 内訳                       | suffix grid-template-rows |
| -------- | ------ | -------------------------- | ------------------------- |
| 學       | 64     | ruby-grid(32) + suffix(32) | 16 16 16 16 (4×R)         |
| 而       | 32     | base(32) のみ              | -                         |
| 時       | 48     | base(32) + suffix(16)      | 16 16 16 16 (4×R)         |
| 習       | 48     | base(32) + suffix(16)      | 16 16 16 16 (4×R)         |
| 之       | 64     | base(32) + suffix(32)      | 16 16 16 16 (4×R)         |

**重要**: トークン間ギャップ = **0px**（密着配置）。

### CSS 縦書きにおける line-height の影響

- `.skam-base` の `line-height: 64px` (= F×2) だが、`而`(bare token) の height は 32 (= F)
- CSS 縦書き (`writing-mode: vertical-rl`) では `line-height` は **block 方向（=水平/列間）** のスペーシングに影響
- **inline 方向（=垂直/文字間）** のサイズは `line-height` の影響を受けない
- つまり: 縦書きの文字間は純粋にインラインボックスの高さで決まり、隣接要素は密着

### suffix-row の grid 折りたたみ

- grid-template-rows は常に `16 16 16 16` (4×R=64) と宣言されるが、実際の height はコンテンツがある行のみ:
  - 學: height=32 → okuri 2文字分 (2×R)
  - 時: height=16 → okuri 1文字分 (1×R)
  - 之: height=32 → soegana + kaeri/kutoten (2×R)
- コンテンツがない行は高さ 0 に折りたたまれる

### ruby-grid の高さ

- grid-template-rows = `16 32 16` (R+F+R = 64) だが height = 32 (= F)
- inline-grid の `line-height: 1` (= 32px) により external size が制約
- ruby は base の上方にオーバーレイされ、token の送り量に影響しない

### トークン送り量の公式

実測から導出:

```
tokenAdvance = fontSize + suffixHeight
```

suffixHeight 検証:

- 學: 64 - 32 = 32 → okuri「ビテ」(2char × R=16) = 32 ✓
- 而: 32 - 32 = 0 → suffix なし ✓
- 時: 48 - 32 = 16 → okuri「ニ」(1char × R=16) = 16 ✓
- 習: 48 - 32 = 16 → okuri「フ」(1char × R=16) = 16 ✓
- 之: 64 - 32 = 32 → soegana「ヲ」(1×R) + kaeri/kutoten(1×R) = 32 ✓

### Canvas の現状

```
cellAdvance = fontSize * lineHeight = 24 * 2.0 = 48px  (固定)
tokenY = columnY + yOffset + fontSize/2  (12px トップギャップ)
yOffset += max(cellAdvance, contentHeight)
```

問題: fontSize=24 の bare token でも advance=48px → 24px の空白。HTML では 0px。

## 方針

### lineHeight の意味を再定義

現在の `lineHeight` は CSS の `line-height` を意図しているが、Canvas の縦書きでは CSS とは異なる軸に作用している。

**解決策**: `lineHeight` のデフォルトを `1.0` に変更し、CSS 縦書きの実挙動（密着配置）に合わせる。`lineHeight > 1.0` は明示的なトークン間スペーシング追加として機能させる。

これにより:

- `lineHeight=1.0` (デフォルト): HTML と同等の密着配置
- `lineHeight=1.5`: 各トークン間に 0.5em の余白追加
- `lineHeight=2.0`: 現状と同等（明示的に広いスペーシング）

### cellAdvance の計算式変更

```
// 現在
cellAdvance = fontSize * lineHeight  // 48px @ F=24, LH=2.0

// 修正後
cellAdvance = fontSize * lineHeight  // 24px @ F=24, LH=1.0
```

デフォルト値変更のみ。計算式は同一。

### トップギャップの除去

```
// 現在
tokenY = columnY + yOffset + fontSize/2

// 修正後
tokenY = columnY + yOffset
```

`fontSize/2` のトップギャップは HTML では存在しない。ruby は上方にはみ出す（CSS と同様）。

### computeTokenContentHeight の修正

```
// 現在
return fontSize / 2 + maxExtent;  // トップギャップ込み

// 修正後
return maxExtent;  // トップギャップなし
```

`maxExtent` は `tokenY` からの最大延伸量。トップギャップ分の `fontSize/2` を除去。

## 実装ステップ

### Step 1: lineHeight デフォルト値の変更

`layout.ts` の `resolveOptions` で:

```typescript
lineHeight: options?.lineHeight ?? 1.0,  // 2.0 → 1.0
```

### Step 2: トップギャップの除去

`layout-vertical.ts` の以下の箇所を修正:

**layoutBlockChild** (通常トークン):

```typescript
// Before
const tokenY = columnY + yOffset + fontSize / 2;

// After
const tokenY = columnY + yOffset;
```

**layoutTatetenChildren** (tateten グループ内トークン):

```typescript
// Before: tateten 内は既に fontSize/2 なしで配置されているが確認
const tokenY = columnY + yOffset + fontSize / 2;
// After
const tokenY = columnY + yOffset;
```

**highlight グループ内トークン**: 同様に修正。

### Step 3: computeTokenContentHeight の修正

```typescript
// Before
return fontSize / 2 + maxExtent;

// After
return maxExtent;
```

### Step 4: tateten separator のレイアウト修正

```typescript
// Before
const sepY = columnY + yOffset + separatorAdvance / 2;

// After: トップギャップなし
const sepY = columnY + yOffset;
```

### Step 5: suffix 要素の描画位置確認

suffix 要素（kaeri, kutoten, okuri 等）は `tokenY + fontSize` に配置される。
トップギャップ除去後も `tokenY + fontSize` = `yOffset + fontSize` で、base 文字の直下に配置される。
これは HTML の suffix-row が base の直下に密着するのと一致。

### Step 6: ruby 配置の確認

ruby は `tokenY` (= yOffset) に配置される。rubySpan > 1 の場合:

```typescript
const spanHeight = slots.rubySpan * cellAdvance;
// lineHeight=1.0 → cellAdvance=fontSize → spanHeight = rubySpan * fontSize
```

これは HTML の ruby が base 文字列全体にまたがるのと同等。
ただし suffix がある場合、実際のトークン間距離は fontSize + suffixHeight なので、spanHeight が不足する可能性がある。
→ `max(cellAdvance, contentHeight)` で送るため、rubySpan の spanHeight 計算も contentHeight ベースにすべき。

**修正**: rubySpan の spanHeight を、対象トークンの実際の advance 合計で計算する。
→ これは追加の計算が必要。ただし rubySpan は稀なケースなので、まず基本修正を行い、rubySpan は後続で対応。

### Step 7: テスト更新・ビルド・視覚確認

1. `pnpm typecheck` で型チェック
2. `pnpm test` → レイアウトテストのスナップショットが変わるはず → 更新
3. Playground で HTML/Canvas を切り替えて視覚比較
4. 複数サンプルで確認

## リスク

- **API 互換性**: lineHeight デフォルト変更。既存ユーザーが lineHeight=2.0 を前提としている場合に影響
  - → Playground の lineHeight UI デフォルトも 1.0 に変更が必要
- **rubySpan**: spanHeight 計算が cellAdvance=fontSize になることで、suffix 分が不足する可能性
  - → rubySpan のある全サンプルで視覚確認
- **Canvas テストのスナップショット**: すべて更新が必要

<!-- validated -->
