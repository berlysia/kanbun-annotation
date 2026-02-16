---
status: InProgress
plan: plan-emphasis-highlight-layout-order-canvas.md
substatus:
  html: Complete
  canvas: InProgress
---

# ADR-015: 傍点・傍線レイアウト配置順序の変更

## コンテキスト

縦書きモードにおいて、傍点（emphasis）と傍線（highlight）の配置順序を変更したい。

### 現在の配置順（内→外、物理的に右方向）

```
本文 → ルビ/送り仮名/添え仮名 → 傍点 → 傍線
```

### 目標の配置順

```
本文 → ルビ/送り仮名/添え仮名 → 傍線 → 傍点
```

### 動機

傍線は読み情報（ルビ等）を囲む装飾的な線であり、本文に近い位置にある方が自然。傍点は個々の文字に対する強調マークであり、最外側に配置されても視認性を保てる。

### 影響範囲

変更は 2 つのレンダラーに影響する:

- **Canvas レンダラー** (`layout-vertical.ts`): `GridColumns` の emphasis 位置計算
- **HTML レンダラー** (`styles.ts`): CSS による傍線の描画位置と傍点の視覚的配置

傍線ラベル（ref）の配置も連動して変更が必要。

## 決定

縦書きモードの配置順を「本文 → ルビ → 傍線 → 傍点」に変更する。横書きモードは変更しない。

### Canvas レンダラー

- emphasis 位置を highlight 線基準に変更する
- `emphasisBaseX`（ruby なし）: highlight 線と詰めて配置し、全体の列幅を圧縮する
- `emphasisWithRubyX`（ruby あり）: `highlightLineX + gap` に配置
- `emphasisBaseX` / `emphasisWithRubyX` の区別は維持する
- ref ラベルは highlight 線の上端の上に維持（現行位置）

### HTML レンダラー

- **Grid row 順は変更しない** — emphasis を Row 1（最外行）に維持
  - `writing-mode: vertical-rl` では Row 1 = 右端 = 最外側（block-start）
  - 現行構造を維持: row 1=emphasis / row 2=ruby / row 3=base+highlight / row 4=suffix
- `:has(.emphasis)` による padding 増加ルールを削除する
  - 現行: emphasis 共存時に `.highlight-content` の padding-right を 0.5em → 1em に増加し、傍線を emphasis の外側まで延伸
  - 変更後: 常に基本の padding-right: 0.5em を使用。highlight 線は Row 2 (ruby) の境界まで到達し、Row 1 (emphasis) の内側に位置する
  - これにより視覚的配置が「本文→ルビ→傍線→傍点」になる
- 基本の highlight padding 値（0.75em / 0.5em）は維持する
- vertical-align 補正値の変更は不要（grid 構造が不変のため）

## 失敗した試行（2025-02-11）

### アプローチ

1. Canvas: `highlightLineX` を `GridColumns` に追加し、emphasis 位置を `highlightLineX + gap` に固定（ruby 有無にかかわらず同一座標）
2. HTML: emphasis 共存時の `padding-right` 増加ルール（`:has(.emphasis)` セレクタ）を削除し、基本の `0.5em` に統一
3. 傍線ラベルを「highlight 線の上端の上」から「highlight 線の右側、開始位置」に移動

### 発覚した問題

#### 1. Ruby なし時の間隔が詰まらない

`emphasisBaseX = emphasisWithRubyX` と統一したため、ruby がないトークンでも emphasis が column 右端から離れた固定位置に配置される。旧コードでは `emphasisBaseX`（ruby なし）と `emphasisWithRubyX`（ruby あり）で異なる座標を使い分けていた。

HTML 側でも、`ruby-grid--emphasis` の 4 行グリッドで ruby 行（row 2）が空でも 0.5em を占有するため、emphasis (row 1) と highlight 線の間に不要な空白が生じる。

#### 2. 傍点と傍線が視覚的に重なる

CSS の `padding-right: 0.5em` では、highlight-content の box-shadow（傍線）が grid の row 2/row 1 境界ぎりぎりに到達し、emphasis ドットと接触する。旧コードの `:has(.emphasis)` ルールは padding-right: 1em で傍線を emphasis の外側まで延伸させていたが、これを削除したことで線とドットが重なった。

padding 値の微調整で解決できる可能性はあるが、grid 行境界と padding overflow の関係が繊細で、ruby の有無やフォントサイズの変化に対してロバストではない。

#### 3. 傍線ラベルの位置が離れすぎ

Canvas の ref ラベルを `x: highlightLineX + 2` に配置したが、線から視覚的に離れすぎていた。

### 根本原因

計画が **CSS grid の行境界と padding-right による box-shadow 位置の関係を正しくモデリングできていなかった**。

具体的には:

- `ruby-grid--emphasis` は 4 行グリッド（emphasis / ruby / base+highlight / suffix）
- highlight は row 3 のグリッドアイテムで、`padding-right` による overflow で box-shadow を外側行の領域に描画
- padding 値を変えるだけでは row 境界に正確にアラインできない（content edge と row 境界の関係がグリッド構成依存）
- ruby 有無で grid 行が空になるケースの考慮が不足

### 教訓

- CSS grid + padding overflow による位置制御は、計算だけでなく **playground での視覚確認が必須**
- emphasis/highlight の配置順変更は Canvas（座標計算）と HTML（CSS grid + padding）で異なるメカニズムに依存しており、**片方の変更を他方に機械的に移植できない**
- ruby 有無で grid 行が空になるケースは必ず個別検証が必要

## 失敗した試行 2（2026-02-12）

### アプローチ

「再設計に向けて」項目 2・4 に基づき、CSS grid の row 並び順を変更するアプローチを実施。

1. HTML: `ruby-grid--emphasis` の grid-template-rows を再構成
   - 変更前: row 1=emphasis / row 2=ruby / row 3=base+highlight / row 4=suffix
   - 変更後: row 1=ruby / row 2=base+highlight / row 3=suffix / row 4=emphasis
2. HTML: `.emphasis-row` の `grid-row` を 1 → 4 に変更
3. HTML: `:has(.emphasis)` padding 増加ルールを削除
4. Canvas: emphasis 位置を `highlightLineX` 基準に変更

### 発覚した問題

#### 傍点が左側（内側）に移動してしまった

`writing-mode: vertical-rl` における `grid-template-rows` の行方向を誤解していた。

**正しい挙動**: `vertical-rl` では grid の block direction が右→左。`grid-template-rows` の Row 1 = block-start = **右端（最外側）**、Row N = block-end = **左端（最内側）**。

emphasis を Row 1 → Row 4 に移動した結果、emphasis が右端（最外側）から左端（最内側）に移動し、目標と正反対の配置になった。

### 根本原因

`writing-mode: vertical-rl` における CSS Grid の `grid-template-rows` の物理方向を誤認。横書きの感覚で「Row 番号が大きい = 外側」と思い込んでいたが、vertical-rl では逆。

### 教訓

- **vertical-rl では Row 1 = 右端（block-start）= 最外側**。Row 番号の増加は物理的に左方向（内側）へ向かう
- emphasis が Row 1 に配置されている現行設計は、既に「最外側」の正しい位置にある
- 配置順の変更は grid row の入れ替えではなく、**highlight 線の到達位置を制御する padding の調整**で実現すべき

## 失敗した試行 3（2026-02-12）

### アプローチ

「失敗した試行 2」の教訓に基づき、grid row 順はそのまま（Row 1=emphasis が最外側）維持し、highlight 線の描画位置と emphasis の配置を CSS で制御するアプローチを実施。

1. HTML: `highlight-content:has(ruby-grid--emphasis)` に `display: inline-block; padding-right: 0` を適用
   - inline-block にすることで、ボックスがグリッド子要素の block 方向全幅に拡張される
   - box-shadow（傍線）がグリッド外縁（emphasis 行の外側）に描画される
2. HTML: `.emphasis-row` に `position: relative; inset-block-start: -1.5em` を適用
   - emphasis ドットをグリッド外縁よりさらに外側にシフト
   - emphasis-row の font-size は親の半分（32px base → 16px）なので `-1.5em = -24px`
3. HTML: `.highlight:has(ruby-grid--emphasis)` に `padding-right: 1em` で外側余白確保

### 結果

grid ブロック（ruby あり）では Chromium・Firefox 共に:

- 傍線がルビの外側 +16px ✓
- 傍点が傍線の外側 +8px ✓
- 12 パターン全てで正常表示

### 発覚した問題

#### 1. bare ブロック（ruby なし）で傍点が傍線の内側に入る

bare ブロック（ruby/送り仮名なし）は grid 構造を持たず、`text-emphasis-style: sesame` で傍点を描画する。CSS の `text-emphasis` はテキストのインライン方向に沿ってドットを配置するため、`highlight-content` の `box-shadow`（傍線）よりも内側（本文寄り）に描画される。

つまり bare ブロックでは「本文 → 傍点 → 傍線」の順、grid ブロックでは「本文 → ルビ → 傍線 → 傍点」の順となり、読み/送り仮名の有無で傍点の内外が入れ替わる不整合が生じた。

#### 2. grid ブロックで傍線がルビから離れすぎる

`display: inline-block` にすると box-shadow はグリッド外縁（emphasis 行 0.5em を含む全体の右端）に描画される。emphasis 行の 0.5em 分だけ傍線がルビから余計に離れ、「ルビに寄せて配置」という目標に反する。

### 根本原因

**2 つの独立した傍点レンダリングパス** が、一貫した「傍点は常に傍線の外側」配置を不可能にしている:

1. **bare パス**: `text-emphasis-style: sesame` — CSS プロパティによるインライン描画。位置制御は `text-emphasis-position` のみで、box-shadow との相対位置は制御不能
2. **grid パス**: `ruby-grid--emphasis` + `.emphasis-row` — 専用グリッド行に明示的なドット文字を配置。`position: relative` で自由に位置調整可能

bare パスで `text-emphasis-style` を使う限り、傍線との相対位置を CSS で制御できない。

また、grid パスでは `display: inline-block` で box-shadow がグリッド全体の外縁に描画されるため、emphasis 行の存在が傍線位置をルビから押し出してしまう。highlight 線の描画を box-shadow（要素のボックス端に固定）に依存している限り、「ルビの直外に傍線を描画」は実現できない。

### 教訓

- `text-emphasis-style` は CSS プロパティなので box-shadow/background-image による傍線との相対位置制御が不可能。bare ブロックでも grid 構造が必要、あるいは emphasis ドットを明示的な要素として描画する必要がある
- `display: inline-block` の box-shadow はグリッド全体外縁に描画される。傍線を「ルビと emphasis の間」に描画するには、box-shadow ではなく別の描画手法（border、pseudo-element、専用グリッド行）が必要
- **2 つの問題は連動**: 傍線描画方法と傍点描画方法の両方を見直す必要がある

### 次のアプローチ候補

1. **render-tree 変更**: emphasis+highlight 共存時は bare ブロックでも常に grid 構造を使用し、emphasis-row にドット文字を配置する（text-emphasis-style を廃止）
2. **傍線描画を box-shadow から分離**: emphasis-row の `border-block-end` や pseudo-element で傍線を描画し、ルビ行の直外に配置する
3. **専用グリッド行の追加**: grid-template-rows に「傍線」専用行を追加（emphasis | **line** | ruby | base | suffix）

## 失敗した試行 4（2026-02-12）

### アプローチ

「失敗した試行 3」の「次のアプローチ候補」1 + 3 を組み合わせ。

1. **bare ブロックでも grid 構造を強制**: emphasis+highlight 共存時は `text-emphasis-style` を使わず、常に `ruby-grid` + `emphasis-row` で傍点ドットを明示的な要素として描画
2. **5 行グリッド `ruby-grid--emphasis-hl` を新設**: highlight-line 専用行を追加

```
ruby-grid--emphasis-hl (5行):
  Row 1: emphasis (0.5em)    ← block-start = 最外側（vertical-rl で右端）
  Row 2: highlight-line (4px)
  Row 3: ruby (0.5em)
  Row 4: base (auto)
  Row 5: suffix (0.5em)
```

3. **`:has()` セレクタで highlight-content の描画を無効化**: `ruby-grid--emphasis-hl` が内部にある場合、`highlight-content` の `box-shadow` / `background-image` を `none` に設定。傍線は highlight-line 要素の `background-image` で描画

### 核心: なぜこれが機能するか

失敗した試行 3 では highlight 線を `highlight-content` の `box-shadow` で描画していたため、emphasis 行の存在が box-shadow 位置を押し出す問題があった。

本アプローチでは highlight 線を **同一グリッド内の専用行** (`highlight-line`) に移動した。emphasis-row (Row 1) と highlight-line (Row 2) が同じグリッドコンテキストに属するため、`grid-row` 指定だけで相対位置が確定し、padding や box-shadow の間接的な位置制御に依存しない。

### 変更ファイル

#### HTML レンダラー

- **`render-tree-types.ts`**: `RangeMarkContext` に `inHighlightGroup?: boolean` を追加
- **`build-render-tree.ts`**: highlight グループ内の全 token に `inHighlightGroup: true` を設定
- **`renderer.ts`**:
  - `emphasisHandledByGrid` 条件を拡張: highlight 内の bare token でも grid 構造を強制
  - `renderTokenWithRuby` に `inHighlight` パラメータを追加
  - emphasis+highlight 共存時は `ruby-grid--emphasis-hl` クラスと `highlight-line` 要素を出力
- **`render-tree.ts`**: 前回試行の残骸（`highlight-content--emphasis` ロジック）を除去
- **`styles.ts`**:
  - `ruby-grid--emphasis-hl` (5行グリッド) の CSS を追加
  - `ruby-grid--emphasis-hl-no-ruby` (ruby なし variant) の CSS を追加
  - `:has(.ruby-grid--emphasis-hl)` で highlight-content の box-shadow/background-image を無効化
  - 5 種の highlight-line background-image スタイル (solid/dotted/dashed/wavy/double) を追加
  - vertical-align 補正: emphasis-hl は `+4px`、emphasis-hl-no-ruby は `-4px`

#### Canvas レンダラー

- **`layout-vertical.ts`**: highlight グループ内の token の emphasis X 座標を `highlightLineX + highlightGap` に移動

### vertical-align 補正値の導出

`ruby-grid--emphasis` (4行) の vertical-align:

```
ruby-ratio * 0.5em + grid-baseline-fix
```

`ruby-grid--emphasis-hl` (5行) は Row 2 に 4px の highlight-line 行が追加。base 行がその分だけ下がるため:

```
ruby-ratio * 0.5em + 4px + grid-baseline-fix
```

`ruby-grid--emphasis-hl-no-ruby` は ruby 行と highlight-line 行のみ base より上にあるが、ruby 行 (0.5em) は `ruby-grid--emphasis-no-ruby` と同じ扱い。highlight-line (4px) の分だけ逆方向にずれるため:

```
-4px + grid-baseline-fix
```

### 現状

配置順序の変更（emphasis が highlight の外側）は単一トークンのパターンで機能しているが、以下の深刻な問題が残っている。

### 未解決の問題

根本原因は共通: **highlight-line をトークン単位の ruby-grid 行に配置したため、トークン間で傍線が連続しない**。highlight の傍線は `highlight-content` 全体（複数トークンにまたがる）で連続した 1 本の線であるべきだが、各トークンの `ruby-grid--emphasis-hl` 内の `highlight-line` は独立した要素であり、トークン間に隙間が生じる。

#### 1. multi-token highlight + emphasis (#11) と emphasis > (highlight + highlight) (#12) が同じ見た目になる

サンプル #11（`highlight > emphasis` で multi-token ruby+okuri）と #12（`emphasis > (highlight + highlight)` で highlight が2つに分かれる）が視覚的に区別できない。#12 では 2 つの独立した highlight 範囲があるはずだが、傍線が途切れず 1 本に見えている可能性、あるいは逆に #11 でも傍線が途切れている可能性がある。実際の HTML 出力の確認が必要。

#### 2. tateten + highlight で傍線が表示されない・途切れる（#14）

サンプル #14（tateten + highlight + emphasis）で竪点の横に傍線が出ない、かつ竪点の前後で傍線が途切れる。本来は highlight 範囲全体で連続した 1 本の傍線が描画されるべき。竪点は `tateten-group` としてラップされるため、`ruby-grid--emphasis-hl` の highlight-line が竪点グループ内部に閉じ込められ、隣接トークンの highlight-line と連結しない。

### 次のステップの候補

上記の問題はすべて「highlight-line をトークン単位の grid 行に入れた」ことに起因する。解決には傍線の描画を `highlight-content` レベル（複数トークンをまたぐ単一要素）に戻す必要がある可能性が高い。

考えられる方向:

1. **highlight-content レベルの傍線描画を維持しつつ、emphasis を外側に出す**: highlight-content の box-shadow/background-image による傍線描画はトークン間の連続性を自然に保証する。問題は emphasis がその内側に閉じ込められること。emphasis-row を highlight-content の外側に配置する構造的な方法が必要
2. **ruby-grid--emphasis-hl の highlight-line を廃止し、別の手法で傍線位置を制御**: たとえば highlight-content 自体を emphasis 行の内側に position で配置する、または highlight-content の box-shadow offset を調整して emphasis 行分だけ内側にずらす

### 教訓

- トークン単位の grid 行に配置した要素は、トークン間で連続した描画ができない
- highlight-content レベルの box-shadow/background-image は multi-token 連続性を自然に保証する。これを活かすべき

## アプローチ 5: highlight-content レベル傍線描画の復活（2026-02-12）

### アプローチ

失敗した試行 4 の教訓に基づき、highlight-content の box-shadow/background-image による傍線描画を復活。アプローチ 4 で追加した highlight-line 関連コードを撤去。

1. **highlight-line 専用行を撤去**: `ruby-grid--emphasis-hl`、`ruby-grid--emphasis-hl-no-ruby`、highlight-line 要素、5種描画スタイルをすべて削除
2. **`ruby-grid--emphasis` に統一**: emphasis+highlight 共存時も通常の `ruby-grid--emphasis` を使用。bare+emphasis+highlight でも grid 構造を強制（アプローチ 4 から継続）
3. **`:has(.ruby-grid--emphasis)` で padding-right を増加**: emphasis 共存時に `highlight-content` の `padding-right` を 0.5em → 1em に増加。box-shadow が emphasis 行の手前に描画される

### 核心: なぜこれが機能するか

DOM 構造:

```
highlight (inline-block)
  └── highlight-content (display: inline)   ← padding-right + box-shadow で傍線描画
        ├── token > ruby-grid--emphasis (inline-grid)
        │         ├── emphasis-row (Row 1, 最外側 = 右端)
        │         ├── ruby (Row 2)
        │         ├── base (Row 3)
        │         └── suffix-row (Row 3, col 2)
        ├── wbr
        └── token > ruby-grid--emphasis (inline-grid)
```

`highlight-content` は `ruby-grid` の**親**であり Grid Item にはならない。`display: inline` が有効で、`padding-right` で box-shadow の描画位置を制御できる。

`padding-right: 1em` により box-shadow は emphasis-row (0.5em) の内側に位置し、「本文 → ルビ → 傍線 → 傍点」の配置順が実現される。

### 変更ファイル

#### HTML レンダラー

- **`styles.ts`**:
  - `ruby-grid--emphasis-hl` / `ruby-grid--emphasis-hl-no-ruby` グリッド定義を撤去
  - `ruby-grid--emphasis-no-ruby`（3行グリッド）を追加
  - `:has(.ruby-grid--emphasis-hl)` の box-shadow/background-image 無効化ルールを撤去
  - highlight-line 5 種描画スタイルを撤去
  - highlight-content の全スタイルを box-shadow → background-image に統一
  - `@supports selector(:has(a))` 内に `.highlight::after` による傍線描画（5種: solid/dotted/dashed/wavy/double）
  - `::after` セレクタに `:is(.ruby-grid--emphasis, .ruby-grid--emphasis-no-ruby)` で両バリアント対応
- **`renderer.ts`**:
  - `renderTokenWithRuby` の `inHighlight` パラメータを `blockHasRuby` に変更
  - bare+emphasis パスで `blockHasRuby` に応じて `ruby-grid--emphasis` / `ruby-grid--emphasis-no-ruby` を選択
  - `highlight-line` 要素の出力を削除
- **`render-tree-types.ts`**: `RangeMarkContext` に `highlightGroupHasRuby` と `blockHasRuby` を追加
- **`build-render-tree.ts`**: ブロックレベルとグループレベルのルビ検出を実装、両フラグをトークンに伝播

#### Canvas レンダラー

変更なし（アプローチ 4 の emphasis 位置変更を維持）。Canvas の配置順変更は別途対応が必要。

### 結果（初期実装）

Chromium で確認。全 14 パターンで正常動作:

- **配置順**: すべてのブロックで「本文 → ルビ → 傍線 → 傍点」
- **multi-token 連続性**: highlight-content レベルの background-image がトークン間の傍線を自然に連結
- **emphasis なし highlight**: `padding-right: 16px (0.5em)` で従来通り動作（`:has()` がマッチしない）
- **emphasis+highlight 共存**: `::after` で傍線が emphasis 行の手前に描画
- **ブロック 11 (multi-token)**: 傍線が連続した 1 本線。アプローチ 4 の致命的問題が解決
- **ブロック 12 (emphasis > highlight+highlight)**: 2 つの独立した highlight が分離して表示
- **ブロック 14 (tateten+highlight)**: 竪点を挟んで傍線が連続

### 既知の制約

- **`:has()` セレクタ**: Chrome 105+, Firefox 121+, Safari 15.4+ が必要。非対応ブラウザでは emphasis 共存時の ::after 傍線が描画されない
- **`:has()` + `::after` の組み合わせ**: highlight ラッパーの ::after で傍線を描画するため、`position: relative` が必要（既存の `.highlight` に設定済み）

### 追加改善: no-ruby バリアントとデュアルフラグ

アプローチ 5 の初期実装ではすべての bare+emphasis トークンに `ruby-grid--emphasis`（4行: emphasis/ruby/base/suffix）を適用していたが、ルビなしトークンで空 ruby 行 (0.5em) が余白を生む問題があった。

#### ruby-grid--emphasis-no-ruby (3行グリッド)

ルビなし bare+emphasis トークン用に、ruby 行を省略した 3行グリッドを追加:

```
ruby-grid--emphasis-no-ruby (3行):
  Row 1: emphasis (0.5em)
  Row 2: base (auto)
  Row 3: suffix (0.5em)
```

4行グリッド比で 0.5em（16px@32px base）のブロック方向幅を節約。

#### デュアルフラグによるグリッドクラス選択

multi-token highlight 内でルビあり/なしトークンが混在する場合、文字の縦位置を揃える必要がある。2つのスコープのフラグで制御:

- **`blockHasRuby`（ブロック全体スコープ）**: グリッドクラス選択に使用。同一ブロック内の複数 highlight 間でも文字の縦位置を揃える
- **`highlightGroupHasRuby`（グループスコープ）**: per-highlight-group のルビ検出。将来の ::after オフセット微調整用に保持

判定ロジック: ブロック内のいずれかのトークンが yomigana/okurigana/soegana を持つか、rangeCtx にルビ由来の baseText があれば `blockHasRuby = true`。

#### ::after 傍線の位置

`::after` の right offset = `ruby-ratio * 1em + 0.75em`。ruby 行の有無で同じ値（emphasis-row は常に grid の最右列）。no-ruby グリッドでは emphasis-row の直内側に描画される。

#### 結果

Chromium + Firefox で全 14 パターン確認:

- **Block 0,4,6,8（ルビなし）**: no-ruby グリッド (64px) でコンパクト
- **Block 10,13（multi-token highlight、ルビあり）**: emphasis グリッド (80px) で文字位置揃え
- **Block 11（別 highlight、ルビあり）**: emphasis グリッド (80px) で文字位置揃え（傍線は各 highlight で独立）
- **::after diff**: solid=0, wavy=2 (サブピクセル許容範囲)

## 参考

- `packages/skam-canvas-renderer/src/layout-vertical.ts` — Canvas レイアウト計算
- `packages/skam-html-renderer/src/styles.ts` — CSS スタイル生成
- `ruby-grid--emphasis` の grid-template-rows: `0.5em 0.5em auto 0.5em`（emphasis / ruby / base / suffix）
