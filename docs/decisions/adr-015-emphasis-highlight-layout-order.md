# ADR-015: 傍点・傍線レイアウト配置順序の変更

## ステータス

Proposed

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

未決定。以下の「失敗した試行」を踏まえて再設計が必要。

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

## 再設計に向けて

次の試行では以下を検討する:

1. **playground で現状の描画を実機確認** してから設計に入る
2. CSS grid の row 構成自体を変更する案（例: emphasis と highlight の row を入れ替える）
3. Canvas は `emphasisBaseX` / `emphasisWithRubyX` の区別を維持しつつ、highlight 線との相対位置を調整する案
4. HTML 側は padding 値の調整ではなく、grid row の並び順変更で配置を制御する案

## 参考

- `packages/skam-canvas-renderer/src/layout-vertical.ts` — Canvas レイアウト計算
- `packages/skam-html-renderer/src/styles.ts` — CSS スタイル生成
- `ruby-grid--emphasis` の grid-template-rows: `0.5em 0.5em auto 0.5em`（emphasis / ruby / base / suffix）
