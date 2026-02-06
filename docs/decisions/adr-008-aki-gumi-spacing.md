# ADR-008: アキ組み（字間スペーシング）の導入

## ステータス

Accepted（検証完了・実装方針修正済み）

## コンテキスト

### 現状

SKAM HTML Renderer は現在 **ベタ組み**（字間アキなし）のみを提供している。CSS Variable `--skam-letter-spacing: 0` が定義されているが、アキ組みとしての設計・APIは未整備。

### 背景：日本語組版におけるアキ組み

日本語組版（JIS X 4051）では、本文の字間にアキ（空間）を挿入する「アキ組み」が広く使われる。

| 名称     | アキ量 | 用途例                             |
| -------- | ------ | ---------------------------------- |
| ベタ組み | 0      | デフォルト。漢文訓読の一般的な組み |
| 四分アキ | 0.25em | 学習教材、教科書で広く使用         |
| 二分アキ | 0.5em  | 注記が多い場合の可読性向上         |

漢文の訓読テキストは訓点・送り仮名・返り点など多くの注記を伴うため、アキ組みによる可読性向上の効果が特に大きい。

### 技術的な現状

- token は `display: inline-block` で inline flow に配置
- suffix-row（送り仮名・返り点）は token 内部の `display: inline-grid`
- tateten-sep（竪点セパレータ）は token 間に配置される `display: inline-grid`
- `letter-spacing` は `.skam-document` に適用され、全 inline-level 要素間に効く
- highlight-content は `box-shadow: inset` で傍線を描画

### 解決すべき課題

1. アキ量を指定する API がない
2. `letter-spacing` を単純に使うと tateten-sep 周辺で二重アキが発生する可能性
3. 行末（縦書きでは列の下端）に余分なアキが入る `letter-spacing` の固有動作

## 検討した選択肢

### Option A: CSS `letter-spacing` Variable（最小変更）

既存の `--skam-letter-spacing` CSS Variable にプリセット値を提供する。

**仕組み**: `letter-spacing` は各 typographic character unit の advance measure に加算される形で動作する。atomic inline（`inline-block` / `inline-grid`）は単一ユニットとして扱われるため、token 間・token-tateten間にアキが入る。

**検証済み**: ブラウザ実証と CSS 仕様読み込みにより以下の前提が確認された（後述「検証結果」参照）。

- 利点: 既存 CSS Variable をそのまま活用でき、実装量が最小
- 利点: token 内部（base と suffix-row 間）にはアキが入らない — **ただし `letter-spacing` は継承されるため、suffix-row に `letter-spacing: 0` のリセットが必要**（検証済み）
- 欠点: 行末の最終要素の後にもアキが入る（CSS の `letter-spacing` の仕様上の動作）
- 欠点: tateten-sep の前後に token 間と同量のアキが入り、二重スペーシングに見える場合がある
- リスク: 低（CSS Variable の値を変えるだけ）

### Option B: Token `margin` アプローチ

各 `.skam-token` に `margin-block-end`（縦書き時は下方向）を設定し、`:last-child` で最終要素のマージンを除去する。

- 利点: 行末の余分なアキを `:last-child` で除去可能
- 利点: token にのみ適用するので tateten-sep との二重アキを回避しやすい
- 欠点: `.skam-block` の最後の子が token とは限らない（tateten-sep や suffix-kana の場合がある）ため、`:last-child` だけでは不十分
- 欠点: margin collapsing の挙動が書字方向で異なり、テスト負荷が高い
- リスク: 中（レイアウト回帰の可能性）

### Option C: Flex `gap` アプローチ

`.skam-block` を `display: flex` に変更し、`gap` でアキを制御する。

- 利点: `gap` は要素間のみに適用され、行末に余分なアキが入らない
- 利点: 均一で予測可能なスペーシング
- 欠点: inline flow → flex layout への変更で、行折り返し挙動が変わる
- 欠点: 縦書きでは `flex-direction: column` + `flex-wrap: wrap` が必要で、明示的な高さ指定が求められる場合がある
- 欠点: 既存のアライメント（vertical-align による suffix-row / tateten-sep の精密な補正）が flex alignment に置換され、Chrome/Firefox/Safari 個別補正の再実装が必要
- リスク: 高（レイアウトモデルの根本変更）

## 決定

**Option A: CSS `letter-spacing` Variable** を採用する。

### 理由

1. **最小変更原則**: 既存の CSS Variable インフラをそのまま活用できる
2. **漢文の特性**: 漢文テキストは一文字一 token が基本であり、`letter-spacing` の均一アキが自然に機能する
3. **行末アキの許容性**: 漢文は縦書きの短い行が基本であり、行末の余分なアキは視覚的に目立ちにくい（横書きモードでの許容性は別途検証が必要）
4. **tateten 二重アキの対処**: tateten-sep に負のマージンを設定することで補正可能

### 実装方針

#### 1. API: `RenderOptions` に `spacing` オプションを追加

```typescript
export interface RenderOptions {
  // ...existing options...
  /**
   * 字間スペーシング（アキ組み）
   *
   * - 'solid': ベタ組み（アキなし、デフォルト）
   * - 'quarter': 四分アキ（0.25em）
   * - 'half': 二分アキ（0.5em）
   * - number: 任意の em 値（0以上）
   */
  spacing?: 'solid' | 'quarter' | 'half' | number;
}
```

`number` 型には非負のバリデーションを適用する:

```typescript
const spacingEm =
  typeof spacing === 'number' ? Math.max(0, spacing) : SPACING_PRESETS[spacing ?? 'solid'];
```

#### 2. CSS Variable の単位統一

現在の `--skam-letter-spacing: 0`（無単位）を `--skam-letter-spacing: 0em`（単位付き）に変更する。`calc()` で他の単位付き値と組み合わせる際の整合性を確保するため。これは `0` と `0em` は CSS 上等価であり、後方互換性に影響しない。

`generateCSS()` / `render()` 時に、`spacing` オプションを `--skam-letter-spacing` 値にマッピング:

| spacing               | `--skam-letter-spacing` 値 |
| --------------------- | -------------------------- |
| `'solid'` (default)   | `0em`                      |
| `'quarter'`           | `0.25em`                   |
| `'half'`              | `0.5em`                    |
| `number` (e.g. `0.3`) | `${n}em`                   |

#### 3. CSS: tateten-sep の補正

tateten-sep 自体が token 間のセパレータとして機能するため、tateten-sep の前後に入る `letter-spacing` を負のマージンで相殺する。

`letter-spacing` は各 atomic inline の後にアキを挿入するため、tateten-sep の周辺には以下のようにアキが配置される:

```
[token_A] + (アキ) + [tateten-sep] + (アキ) + [token_B]
```

目指す見た目は tateten-sep が token 間のアキ 1 つ分の中央に収まる状態:

```
[token_A] + (アキ/2) + [tateten-sep] + (アキ/2) + [token_B]
```

これを実現するため、tateten-sep の前後に `-アキ/2` のマージンを設定し、2つのアキのうち 1 つ分を相殺する:

```css
:where(.skam-tateten-sep) {
  /* letter-spacing はインライン方向に作用するため、margin-inline で相殺する。
     vertical-rl: margin-inline → margin-top/bottom（token間の上下方向）
     horizontal-tb: margin-inline → margin-left/right（token間の左右方向） */
  margin-inline-start: calc(-0.5 * var(--skam-letter-spacing));
  margin-inline-end: calc(-0.5 * var(--skam-letter-spacing));

  /* letter-spacing の継承を遮断（内部レイアウトへの影響を防止） */
  letter-spacing: 0;
}
```

**修正（検証結果に基づく）**: 当初の設計では `margin-block-start/end` を使用していたが、`vertical-rl` では block 方向は水平（左右）にマッピングされるため、token 間方向（インライン方向 = 上下）のスペーシング相殺には `margin-inline-start/end` が正しい。

ベタ組み時は `calc(-0.5 * 0em) = 0em` となりマージンは無効化される。

**注意**: `letter-spacing`（advance measure への加算）と `margin`（box 外側の空間）の相殺の相互作用は CSS 仕様に明示的な記述がなく、ブラウザ実装依存である。

#### 4. StyleOptions にも `spacing` を反映

`StyleOptions` にも同じ `spacing` オプションを追加し、CSS 単独生成時にもアキ量を指定可能にする。

**優先順位**: `render()` 呼び出し時は `RenderOptions.spacing` を内部で `StyleOptions` に伝搬する。`generateCSS()` を直接呼び出す場合は `StyleOptions.spacing` を使用する。両者が矛盾する状況は発生しない（render() は内部で generateCSS() を呼ぶため）。

`renderHTML()` は CSS を生成しないため `spacing` オプションは持たない。将来 `data-spacing` 属性等の HTML 側出力が必要になった場合に追加を検討する。

### 検証計画（実装前に必須）

以下の前提をブラウザプロトタイプで実証する。検証結果に応じて実装方針を調整する。

#### 検証 1: letter-spacing の atomic inline 間動作

- `letter-spacing` が `inline-block` / `inline-grid` 要素間にアキを挿入するか
- Chrome / Firefox / Safari の縦書き（vertical-rl）・横書きの両方で確認

#### 検証 2: token 内部への非影響

- `letter-spacing` が token 内部（base と suffix-row 間）に影響しないか
- suffix-row 内の要素配置（送り仮名・返り点の位置）に影響しないか

#### 検証 3: 負マージン補正の動作

- tateten-sep の `margin-block-start/end` が縦書きで正しく物理方向に変換されるか
- 負マージンと letter-spacing の相殺が意図通りに機能するか
- 特に Chrome の縦書きモードでの margin 処理（既知のバグあり）

#### 検証 4: エッジケース

- **highlight 内の傍線**: `box-shadow: inset` による傍線が token 間のアキ部分にも描画されるか（inline-block の box 境界外のアキ部分は描画されない可能性）
- **ruby 内 tateten-group**: `<ruby>` 要素内の letter-spacing の挙動はブラウザ間で差異が大きい
- **suffix-kana**: token 外に独立配置される inline 要素。token と suffix-kana 間に意図しないアキが入らないか
- **inline モード**: `.skam-block` が `display: inline` に変更された場合の letter-spacing の挙動
- **行末アキの視覚的影響**: 四分アキ・二分アキでの行末余白の目立ち具合（縦書き・横書き両方）

### 検証結果

2026-02-06 に Chromium headless (v145) + Playwright + CSS 仕様読み込みで実証を完了。検証コードは `.tmp/adr-008-verification/` に保存。

#### 検証方法の補足

`letter-spacing` は要素の **advance measure** に加算される（box の外側にギャップを作るのではなく、box 自体のサイズが増加する）。そのため、`getBoundingClientRect` の gap（el2.left - el1.right）では検出できず、**pitch**（el2.start - el1.start）の変化量で計測する必要がある。

#### 検証 1: letter-spacing の atomic inline 間動作 — ✅ Pass

| テスト                        | 結果    | 計測値                       |
| ----------------------------- | ------- | ---------------------------- |
| V1a: 縦書き token 間 pitch    | ✅ Pass | delta = 12px（期待値 12px）  |
| V1b: 横書き token 間 pitch    | ✅ Pass | delta = 12px（期待値 12px）  |
| V1c: suffix-row 付き token 間 | ✅ Pass | delta = 24px（期待値 ≥ 6px） |

**仕様根拠**: CSS Text Module Level 4 Section 8.2 — "each consecutive run of atomic inlines (such as images and inline blocks) is treated as a single typographic character unit." `inline-block` / `inline-grid` は CSS Display Module Level 3 の定義により atomic inline に該当。仕様上**明確**に記述されている。

**V1c の 24px について**: suffix-row 付き token の delta が期待値の 2 倍になる理由は、token 内部の base テキストと suffix-row（inline-grid）がそれぞれ独立した typographic character unit として扱われ、letter-spacing が内部でも適用されるため。これは検証 2 の知見と整合する。

#### 検証 2: token 内部への非影響 — ⚠️ 要対策（`letter-spacing: 0` リセットで解決可能）

| テスト                             | 結果        | 計測値                  |
| ---------------------------------- | ----------- | ----------------------- |
| V2a: base ↔ suffix-row 内部距離    | ⚠️ 影響あり | suffix-row height +12px |
| V2b: suffix-row グリッド子要素位置 | ⚠️ 影響あり | suffix-row height +12px |

`letter-spacing` は CSS の継承により inline-block 内部に伝播する。token 内部の suffix-row（inline-grid）は独立した formatting context だが、**継承された** `letter-spacing` が suffix-row 自体の advance measure に影響する。

**対策**: `.skam-suffix-row` と `.skam-tateten-sep` に `letter-spacing: 0` を設定して継承を遮断する。

```css
:where(.skam-suffix-row) {
  letter-spacing: 0;
}
:where(.skam-tateten-sep) {
  letter-spacing: 0;
}
```

**仕様根拠**: CSS Text 4 Section 8.2 — `letter-spacing` は inherited: yes。atomic inline 内部は独立した formatting context だが、継承された値は内部の typographic character unit 間に適用される。仕様の論理的帰結として明確だが、具体的な記述はないためブラウザ実証が必要だった。

#### 検証 3: 負マージン補正の動作 — ⚠️ 方向修正が必要

| テスト                               | 結果        | 計測値                                       |
| ------------------------------------ | ----------- | -------------------------------------------- |
| V3a: tateten-group 内レイアウト      | ⚠️ 記録     | sep margins = left/right に -6px             |
| V3b: margin-block 物理方向マッピング | ⚠️ 方向誤り | margin-block → margin-left/right（列間方向） |

**発見**: `vertical-rl` における logical property マッピング:

| logical property          | `vertical-rl` での物理方向 | 効果                                 |
| ------------------------- | -------------------------- | ------------------------------------ |
| `margin-block-start/end`  | `margin-right/left`        | 列間方向（水平） ← **ADR 当初案**    |
| `margin-inline-start/end` | `margin-top/bottom`        | token間方向（垂直） ← **正しい方向** |

`letter-spacing` は inline direction に沿って適用されるため、相殺にも inline direction のマージン（`margin-inline-start/end`）が必要。

**対策**: 実装方針セクション 3 を `margin-inline-start/end` に修正済み。

**仕様根拠**: CSS Writing Modes Level 4 Section 6.2/6.4 — `vertical-rl` では `block-start` = right, `block-end` = left。CSS Logical Properties Level 1 Section 4.2 — margin の logical-to-physical マッピングは要素の writing-mode に依存。仕様上**明確**。

#### 検証 4: エッジケース

| テスト                    | 結果            | 詳細                                                                     |
| ------------------------- | --------------- | ------------------------------------------------------------------------ |
| V4a: highlight box-shadow | ⚠️ カバーしない | highlight-content height = total token height（アキ部分を含まない）      |
| V4b: ruby + tateten-group | ✅ 正常         | 非ゼロ寸法（26x147px）                                                   |
| V4c: suffix-kana ギャップ | ⚠️ 記録         | pitch delta = 24px（token + suffix-kana に letter-spacing が適用される） |
| V4d: inline モード        | ✅ 正常         | letter-spacing = 12px、pitch delta = 12px                                |
| V4e: 行末アキ視覚         | ✅ 許容範囲     | スクリーンショットで確認。縦書きでは視覚的に目立ちにくい                 |

**V4a について**: `highlight-content` は `display: inline-block` で、内部の token 間 letter-spacing はbox 幅（縦書きでは高さ）に含まれない。つまり `box-shadow: inset` による傍線は letter-spacing のアキ部分をカバーしない。将来的に傍線が途切れて見える問題への対応が必要（別 ADR で検討）。

**V4c について**: suffix-kana は `display: inline` で token 外に独立配置されるため、letter-spacing がそのまま適用される。suffix-kana にも `letter-spacing: 0` を設定するか、token 内部に取り込む構造変更を検討する必要がある。

#### 行末アキの仕様上の扱い

CSS Text Module Level 4 Section 8.2:

> "Letter-spacing must not be applied at the beginning of a line. Whether letter-spacing is applied at the end of a line is **undefined in this level**."
> "UAs therefore really should not append letter spacing to the right or trailing edge of a line"

行頭のアキは仕様で禁止。行末のアキは**未定義**（ブラウザ実装依存）。推奨として行末にアキを付加しないことが示されているが normative ではない。

#### 総合判定

| カテゴリ                               | 判定        | 詳細                                      |
| -------------------------------------- | ----------- | ----------------------------------------- |
| V1: 根本前提（atomic inline 間のアキ） | ✅ Pass     | 仕様＋ブラウザ両方で確認                  |
| V2: token 内部非影響                   | ⚠️ 要対策   | `letter-spacing: 0` リセットで解決        |
| V3: tateten-sep 補正                   | ⚠️ 方向修正 | `margin-block` → `margin-inline` に変更   |
| V4: エッジケース                       | ⚠️ 記録     | highlight・suffix-kana に追加対応の可能性 |

**結論**: V1 が Pass であり Option A の根本前提は有効。V2・V3 の対策は `letter-spacing: 0` リセットとマージン方向修正で解決可能なため、**Option A を Accepted とし、実装方針を修正の上で進める**。

### 対象外（将来の拡張）

- 句読点前後のアキ調整（句読点の詰め組み）: 漢文では頻度が低く、現時点では scope 外
- `text-spacing-trim` CSS プロパティとの統合: ブラウザ対応状況を見て将来対応。ただし `text-spacing-trim` が atomic inline（inline-block）に適用されるかは未確認であり、行末アキの解消手段として期待しすぎないこと
- token 単位のアキ量オーバーライド: 需要が確認されてから検討

## 影響

### ポジティブ

- 教育用途での可読性が大幅に向上する（特に注記の多い漢文テキスト）
- 既存の CSS Variable インフラを活用するため、ユーザーは `--skam-letter-spacing` を直接上書きすることで任意のアキ量を設定できる（API を使わない直接カスタマイズも引き続き可能）
- API としてプリセット値を提供することで、一般的なアキ量の設定が容易になる

### ネガティブ

- 行末に余分なアキが入る（CSS 仕様では "undefined in this level"、ブラウザ実装依存）。縦書きでは視覚的に目立ちにくい（検証済み）
- tateten-sep の負マージン補正は、将来 tateten の HTML 構造を変更した際に再調整が必要
- **highlight 内の傍線（box-shadow）がアキ部分をカバーしない**（検証済み）。傍線が途切れて見える可能性があり、将来的に追加対応が必要
- **suffix-kana に letter-spacing が二重適用される**（検証済み）。構造変更または `letter-spacing: 0` リセットで対応が必要
- `.skam-suffix-row` と `.skam-tateten-sep` に `letter-spacing: 0` リセットが必要（letter-spacing の CSS 継承を遮断するため）

## 参考

- [JIS X 4051](https://www.jisc.go.jp/) - 日本語文書の組版方法
- [W3C JLREQ (Requirements for Japanese Text Layout)](https://www.w3.org/TR/jlreq/) - 3.1.5 字間のアキ
- [CSS Text Module Level 4 - letter-spacing](https://drafts.csswg.org/css-text-4/#letter-spacing-property)
- [CSS Text Module Level 4 - text-spacing-trim](https://drafts.csswg.org/css-text-4/#text-spacing-trim-property)
- [CSS Writing Modes Level 4 - Abstract Box Terminology](https://drafts.csswg.org/css-writing-modes-4/#abstract-box) — logical direction マッピング
- [CSS Logical Properties Level 1 - Flow-Relative Margins](https://drafts.csswg.org/css-logical-1/#margin-properties) — margin-block/inline の物理マッピング
- [CSS Display Module Level 3 - atomic inline](https://drafts.csswg.org/css-display-3/) — inline-block/inline-grid の定義
