---
status: Complete
---

# ADR-039: 明示的な改行の注記

## コンテキスト

ブロックの中で行を改める手段が無い。SKAM-ML は改行を空白として捨てる。ブロックを分けて行を改めると、次のブロックの先頭の返り点が `BLOCK_START_KAERI` の誤りになる。ADR-028 K3 は、明示的な改行を後続の ADR で扱うとした。

行の自動の折り返しは ADR-014 が決めている。html は改行できない単位 (不可分単位) の間に `<wbr>` を置き、単位の中を nowrap にする。canvas の縦書きはブロックごとに 1 列で、列の中では折り返さない。ADR-014 は、ブロックを行にする案 (Option C) を、ブロックの意味が段落から行に変わるとして却下している。

## 利用者の決定 (2026-10-21)

1. 注記の型は `linebreak`、SKAM-ML の要素は `<skam:br/>`。
2. ブロックの先頭、ブロックの末尾、竪点の中、同じ位置の重複は誤り。
3. html は `<br>`、canvas は同じブロックの中で次の列に移る、読み上げのテキストはブロックの区切りと同じ半角空白を 1 つ入れる。
4. 描画の profile に `linebreak` のキーを足し、すべての preset で表示にする。

## 決定

### 注記と要素

- `linebreak` は position の注記で、値を持たない。`position.after` の字の後ろで行を改める。
- SKAM-ML の `<skam:br/>` は内容を持たない空の要素で、kutoten と同じ親 (block、span、tateten) に置ける。直前の字の後ろの位置の `linebreak` になる。
- stringify は、字の後ろの注記を kaeri、kutoten、ref の順に書いた後に `<skam:br/>` を書く。竪点のグループの最後の字の後ろの `<skam:br/>` は `</skam:tateten>` の後ろに書く。parser は tateten の最後の子の `<skam:br/>` も、tateten の直後の `<skam:br/>` も、同じ注記として読む。`after` の無い `linebreak` は SKAM-ML で表せない内容として扱う (`BLOCK_START_LINEBREAK`)。

### 置けない場所

validator は次の `linebreak` を `INVALID_LINEBREAK` にする。

- `after` が無い (ブロックの先頭)。
- `after` がブロックの最後の字 (ブロックの末尾)。ブロックの区切りで足りる。
- `after` の字と次の字が、同じ不可分単位の中にある。
- 同じ位置に 2 つ目がある。

決定 2 の「竪点の中」を、ADR-014 の不可分単位の中に広げた。ADR-014 は、竪点のグループと、字に付く anchor の注記 (yomigana、okurigana、soegana、saidoku、okimoji、joji) を、中で改行しない単位と定めている。複数の字にかかるこれらの注記の範囲の中で改行すると、読みや送り仮名が 2 行に割れる。highlight、emphasis、okototen の範囲は単位を作らないので、中で改行してよい。

判定は `@kanbun-skam/skam` の `getLinebreakPlacementIssues` の 1 か所にあり、validator と描画が同じ結果を使う。描画は、誤りになる `linebreak` を無視する。竪点のグループの範囲だけは、`rendering` の `getTatetenGroups` と別にこの関数の中で求めている。validator から `rendering` を import すると循環するためで、2 つの結果が一致することをテストで確かめている。

### 描画

- AIR は新しいノードを足さず、最上位の単位のノード (字、竪点のグループ) に任意の印 `lineBreakAfter` を付ける。highlight の範囲の中では、highlight-group の子に付ける。AIR を読む外部の adapter は、印を知らなければ今と同じに描く。
- html は、印の付いた単位の直後に `<br>` を出し、次の単位の前の `<wbr>` を出さない。そのほかの `<wbr>` は `canBreakBefore` のまま。自動の折り返しの位置は変えず、改行の注記は強制の改行として足している。
- canvas は、ブロックの中の改行で区切った区間ごとに 1 列を使う。区間の間の空きは、ブロックの間の空きと同じにする。AIR を通らない `buildRenderTree` (本番の描画では使わない) には改行を通していない。
- 読み上げのテキストは、印の付いた単位の後に半角空白を 1 つ入れる。`'readings'` の層は文書の readings をそのまま読むので変わらない。
- profile の `linebreak` を偽にすると、改行を描かない。

### 型の追加と版

`MarkType`、`Mark`、`ValidationErrorKind`、`RenderProfile`、`AIRRenderProfile` に値やキーを足した。網羅の switch や、全キーを書いた profile の object を持つ利用者は、型の誤りになりうる。0.x の間は minor で注記の種類を足す (ADR-038 の format の位置づけ) ので、minor とする。0.2.x の validator と parser は、`linebreak` と `<skam:br/>` を誤りにする。

## 却下した案

- **ブロックを行にする**: ADR-014 の Option C と同じく、ブロックの意味が段落から行に変わる。
- **どこでも許し、描画で寄せる**: 書き手が意図しない所で改行されても気づけない。
- **読み上げで何も足さない**: 改行の前後の字が続けて読まれ、ブロックを分けたときと読み上げが変わる。
- **AIR に改行のノードを足す**: highlight-group の分け方 (子の最初の字で範囲を判定する) と子の型を崩し、AIR を読む所の網羅の switch がすべて変わる。
