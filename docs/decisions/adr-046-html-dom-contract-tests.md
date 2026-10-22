---
status: Complete
---

# ADR-046: html の出力を DOM で検査するテスト

## コンテキスト

ADR-020 は「テスト資産全体の意味論化」を残し、ADR-022 はテストを semantic (AIR のスロット、境界、集約) と visual (DOM、CSS、描画の視覚契約) に分け、移行期間の legacy-snapshot を段階的に消すと決めた。代表 4 ケース (ruby-range-core、tateten-kaeri-split、highlight-ref-label、saidoku-two-stage) は、legacy (html と css への `toContain`)、semantic、visual がそろった `dual` だった。

html-renderer のテストには、html の文字列への部分一致 (`toContain`) が多く残っていた (comprehensive-rendering.test.ts に 267 行、ほかの 4 ファイルに 468 行)。部分一致は「その文字が html のどこかにある」しか確かめず、読みがどの字に付いたかを確かめない。html を DOM にして検査する共通の helper は無かった。

## 利用者の決定 (2026-10-21)

1. 束 D は、この項目、範囲の重なりの XML 表現、#2 baseline の順に進める。
2. 今回は代表 4 ケースを `migrated` にし、comprehensive-rendering.test.ts を置き換える。ほかの 4 ファイル (renderer、operation-rendering、compound-marks、ruby-grid) は同じやり方で後に置き換える。

## 決定

### html の出力の構造の契約

html-renderer の出力の構造 (どの字の単位に、どの部品があり、その文字や属性が何か) は、ADR-022 の semantic (AIR) とも visual (画像) とも別の、html の出力の契約として、DOM で検査する。AIR のテストへは移さない。comprehensive の組み合わせ (profile × 注記、書字方向 × 注記、inline、interactive) は html の出力の契約で、AIR へ移すと html の側の退行を捕まえられなくなるため。

### helper

`packages/skam-html-renderer/src/__tests__/helpers/dom-contract.ts` が、出力を happy-dom の DOM にして引く。

- 字の単位は、`${prefix}-base` の文字で `${prefix}-token` を引く (`unit(root, base, nth)`)。範囲の読みの単位は範囲の字の全体で引く。`data-token-id` などの data 属性は `interactive: true` のときだけ出るので使わない。
- 字に付く部品は `parts(root, base, name)` で引く。単位から祖先へブロックの手前までたどり、この単位を含まない担い手 (字の単位、ruby-grid、`<ruby>`、竪点のグループ、傍線) の中を除き、最も近い段で見つかった部品を返す。字に付く ref は単位の直前に続く `<sup>` で、その単位の部品とみなす。部品の無い字が竪点のグループや傍線の部品 (グループの読み、傍線のラベル) を引くのは意図どおり (その字を含むまとまりの注記なので)。
- 部品の名前と class の対応は helper の 1 か所の表に置く。

### 置き換えの規則

- class の有無は、その部品がどの字の単位にあるかで確かめる。否定は、文書の全体に部品が無いこと (件数 0) で確かめる。
- 表示の文字、返り点は、付く字の部品の文字で確かめる。data 属性とインラインの style は、要素を引いてから値を見る。
- 件数は文書から数えた式で書く。
- escape と出力の先頭のタグは、出力の文字列そのものの契約なので文字列一致のまま残す。
- 置き換えで検査を弱めない。

### 代表 4 ケース

ADR-022 の手順どおり、legacy の anchor のそれぞれが semantic か visual で捕まることを確かめてから、`legacy-detector.test.ts` を消し、`LEGACY_CASE_IDS` を空にし、移行表の 4 行を `migrated` にした。`LEGACY_CASE_IDS` は、新しいケースが `legacy-only` から入るときの置き場として残す。

## 結果

- comprehensive-rendering.test.ts の `toContain` は 267 行から 6 行 (escape の検査) になった。it の数 (121) と名前は変えていない。
- レンダラーに一時の退行を 7 種入れて置き換えの前後を流した。読み、送り仮名、返り点を隣の字に出す、`data-saidoku-n` の値の入れ替え、ヲコト点の x と y の入れ替え、隠した読みの空の要素を出す、の 6 種は置き換えの前のテストが通り、置き換えの後は落ちた。範囲の傍点を 1 字減らす退行は前後とも落ちた。ヲコト点の入れ替えを捕まえるため、7x7 の it の入力を (6,6) から (6,3) に変えた。
- 代表 4 ケースの legacy の anchor 18 のうち、10 は AIR の検査、6 (ruby-grid と saidoku-grid の class、CSS の規則 4 つ) は画像の検査で捕まる。返り点の字 2 つ (`㆑`、`㆒`) はどちらでも値を確かめていなかったので、`cross-renderer-equivalence.test.ts` の検査を値の一致に強めてから legacy を消した。

## 受け入れた限界

- 部品の名前の表は、AIR の slot から部品への一方向だけを確かめる。表にある部品がどの slot にも対応しないまま増えても捕まえない (傍線の ref のラベルなどのまとまりの部品は、もともと slot の外)。
- helper は今の出力の担い手の class (ruby-grid、竪点のグループなど) を知っている。出力の構造を変えるときは helper の表を直す。
- ほかの 4 ファイルの文字列一致は残る (docs/plans/backlog.md で追う)。

## 却下した案

- **長い html の断片で文字列一致する**: 属性の順や空白の変化で落ちるうえ、どの字に付いたかを表せない。
- **AIR のテストへ移し、html の側は AIR から DOM への写像の表だけを検査する**: comprehensive の組み合わせは html の出力の契約で、写像の表に組み合わせを戻すと同じ量になり、AIR だけでは html の側の退行を捕まえられない。
- **`data-token-id` で字の単位を引く**: interactive のときだけ出るので、大半のテストで使えない。
